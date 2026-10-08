import * as THREE from 'three';

/**
 * The rider breaking apart when a wave hits. The rider comes apart into whole body parts (each marked with
 * `userData.breakPart` in BlockyHuman.js: head, helmet, arms, legs) plus the torso and the bike's own parts,
 * together with a shower of chunky blocks in their colours. Everything is thrown forward, away from the camera,
 * to land a few units beyond the rider: that ground shows in the middle of the screen, above the Teleport Back
 * button (the ground right at the rider's feet is hidden behind it). The head and the helmet land side by side
 * in the middle of the wreck, upright and turned to face the camera. The pieces bounce, lie still for a few
 * seconds and shrink away just before the rider respawns.
 *
 * Built so the hit never stutters: the block mesh (and its shader) exists from the start, drawn with no
 * instances until it plays; the flying parts reuse the rider's own geometry and materials, so nothing new is
 * compiled or uploaded on impact; the slow measuring (each material's colour, each part's bounds) is done
 * ahead of time by `prepare`, in the browser's idle time; and the whole thing is a few dozen objects moved by
 * plain arithmetic.
 */
// Seconds: the pieces fly and bounce for about SETTLE, then lie still on the ground for REST (time to see the
// wreck and press Teleport Back), then shrink away over SHRINK. The rider respawns as it finishes.
const SETTLE = 1.2;
const REST = 3.6;
const SHRINK = 0.35;
const DURATION = SETTLE + REST + SHRINK;
const BLOCKS = 44;
const BLOCK_SIZE = [0.24, 0.48]; // chunky pieces rather than fine crumbs
const MAX_PARTS = 40; // the head, helmet and the largest other parts; smaller ones are left to the blocks
const GRAVITY = 24;
const BOUNCE = 0.35; // share of the falling speed kept on each bounce
const GRIP = 0.55; // share of the sliding speed and spin kept on each bounce
// Where the pieces land, measured from the rider as seen from the camera: this far beyond the rider, and this
// far to either side.
const LAND_AHEAD = [2.5, 6];
const LAND_SIDE = 3;
const LIFT = [4, 8]; // upward speed each piece is thrown with
const SPIN = 12; // radians per second, at most, about each axis
// The head and helmet land side by side this far beyond the rider, SHOW_SIDE either side of the middle.
const SHOW_AHEAD = 3.2;
const SHOW_SIDE = 1.3;
const SHOW_LIFT = 6.5;
const SHOW_SPIN = 4;
const SHOW_TURN = 9; // how fast they turn to face the camera once down, per second
const BODY_HEIGHT = 1.1; // pieces burst from about the rider's middle
const FALLBACK_COLORS = [0xf2f2f2, 0x222222, 0xff8a2a, 0x6b5cff];

const blockGeometry = new THREE.BoxGeometry(1, 1, 1);
const blockMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6 });

const random = ([min, max]) => min + Math.random() * (max - min);

// A material's colour as seen from a distance: its colour times its texture's average colour. Measured once
// per material (drawing the texture into a single pixel) and remembered.
const averageColors = new WeakMap();
let sampler = null;
function averageColor(material) {
  if (averageColors.has(material)) return averageColors.get(material);
  const color = material.color ? material.color.clone() : new THREE.Color(0xffffff);
  const image = material.map?.image;
  if (image && image.width) {
    try {
      if (!sampler) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1; // once: resizing a canvas resets its whole context
        sampler = canvas.getContext('2d', { willReadFrequently: true });
      }
      sampler.clearRect(0, 0, 1, 1);
      sampler.drawImage(image, 0, 0, 1, 1);
      const [r, g, b] = sampler.getImageData(0, 0, 1, 1).data;
      color.multiply(new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace));
    } catch {
      // An image that cannot be read back keeps the material's plain colour.
    }
  }
  averageColors.set(material, color);
  return color;
}

// Runs `work` when the browser has time to spare between frames (setTimeout where requestIdleCallback is missing).
const whenIdle = (work) => (typeof requestIdleCallback === 'function'
  ? requestIdleCallback(work, { timeout: 500 })
  : setTimeout(() => work({ timeRemaining: () => 8 }), 50));

/** The pieces `rider` breaks into: marked body parts whole, and every other visible mesh on its own. */
function breakParts(rider) {
  const found = [];
  const collect = (object) => {
    if (!object.visible) return;
    if (object.userData.breakPart) {
      found.push({ object, show: object.userData.breakPart === 'show' });
      return;
    }
    if (object.isMesh && !object.isSkinnedMesh && !object.isInstancedMesh) found.push({ object, show: false });
    for (const child of object.children) collect(child);
  };
  collect(rider);
  return found;
}

export function createShatter(scene) {
  const blocks = new THREE.InstancedMesh(blockGeometry, blockMaterial, BLOCKS);
  blocks.count = 0;
  blocks.frustumCulled = false; // pieces fly well outside the mesh's origin
  blocks.castShadow = true;
  for (let i = 0; i < BLOCKS; i += 1) blocks.setColorAt(i, new THREE.Color(0xffffff)); // instanceColor exists from the start
  scene.add(blocks);
  const parts = new THREE.Group();
  scene.add(parts);

  // Every piece: { position, velocity, rotation, spin, radius, scale, object?, block?, settle? }. Blocks are
  // drawn from these through `blocks`; a body part carries its own object. `settle` is the turn a 'show' part
  // eases to once it is down.
  let pieces = [];
  let floor = 0;
  let startTime = 0;
  let lastTime = null;
  let playing = false;

  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const box = new THREE.Box3();

  const randomSpin = (most) => new THREE.Vector3((Math.random() * 2 - 1) * most, (Math.random() * 2 - 1) * most, (Math.random() * 2 - 1) * most);
  // The velocity that throws a piece from `from` (its middle) upward at `lift` to come down on `land`, resting
  // `radius` above the floor.
  const throwTo = (from, land, lift, radius) => {
    const drop = Math.max(from.y - (floor + radius), 0);
    const airTime = (lift + Math.sqrt(lift * lift + 2 * GRAVITY * drop)) / GRAVITY;
    return new THREE.Vector3((land.x - from.x) / airTime, lift, (land.z - from.z) / airTime);
  };

  const clear = () => {
    parts.clear(); // the parts only borrow the rider's geometry and materials, so there is nothing to dispose
    pieces = [];
    blocks.count = 0;
    playing = false;
  };

  /**
   * Breaks `rider` apart where it stands. `floorY` is the ground under it, `viewer` the camera's position (the
   * pieces are thrown away from it, into its view), `time` the running clock in seconds. The rider itself is left as it is:
   * hide it after calling this.
   */
  const burst = (rider, floorY, viewer, time) => {
    clear();
    floor = floorY;
    startTime = time;
    lastTime = null;
    playing = true;
    rider.updateMatrixWorld(true);
    const center = new THREE.Vector3(rider.position.x, rider.position.y + BODY_HEIGHT, rider.position.z);
    const toward = new THREE.Vector3(viewer.x - center.x, 0, viewer.z - center.z);
    if (toward.lengthSq() < 1e-4) toward.set(0, 0, 1);
    toward.normalize();
    const faceViewer = new THREE.Quaternion().setFromEuler(euler.set(0, Math.atan2(-toward.x, -toward.z), 0));
    // A spot on the ground `ahead` beyond the rider (as seen from the camera) and `side` to its right.
    const across = new THREE.Vector3(-toward.z, 0, toward.x);
    const spot = (ahead, side) => new THREE.Vector3(rider.position.x, 0, rider.position.z).addScaledVector(toward, -ahead).addScaledVector(across, side);
    const randomSpot = () => spot(random(LAND_AHEAD), (Math.random() * 2 - 1) * LAND_SIDE);
    // The rider's heading and lean (Player.js leans its visual by userData.lean). A 'show' part is settled by
    // undoing these and turning the rider's front (-z) to the camera instead, so it sits as it did on the bike.
    const riderTurn = rider.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(euler.set(0, 0, rider.userData.lean ?? 0)));
    const settle = faceViewer.clone().multiply(riderTurn.invert());

    const found = breakParts(rider).map((part) => {
      box.setFromObject(part.object);
      return { ...part, center: box.getCenter(new THREE.Vector3()), extent: box.getSize(new THREE.Vector3()) };
    });
    found.sort((a, b) => (b.show - a.show) || (b.extent.length() - a.extent.length()));

    const place = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const partScale = new THREE.Vector3();
    let showSide = Math.random() < 0.5 ? -1 : 1;
    for (const { object, show, center: middle, extent } of found.slice(0, MAX_PARTS)) {
      object.matrixWorld.decompose(place, quaternion, partScale);
      // A copy sharing the part's geometry and materials, held so it turns about its own middle.
      const copy = object.isMesh ? new THREE.Mesh(object.geometry, object.material) : object.clone(true);
      copy.position.copy(place).sub(middle);
      copy.quaternion.copy(quaternion);
      copy.scale.copy(partScale);
      copy.castShadow = object.castShadow;
      copy.traverse((child) => { child.frustumCulled = false; });
      const pivot = new THREE.Group();
      pivot.position.copy(middle);
      pivot.add(copy);
      parts.add(pivot);

      const piece = { object: pivot, position: pivot.position, rotation: pivot.quaternion, scale: new THREE.Vector3(1, 1, 1) };
      if (show) {
        // Thrown to land at its own spot in the middle of the wreck, then righted to face the camera.
        piece.radius = extent.y / 2;
        piece.velocity = throwTo(middle, spot(SHOW_AHEAD, showSide * SHOW_SIDE), SHOW_LIFT, piece.radius);
        showSide = -showSide;
        piece.spin = randomSpin(SHOW_SPIN);
        piece.settle = settle;
      } else {
        piece.radius = Math.min(Math.max(extent.x, extent.y, extent.z) * 0.4, 0.45);
        piece.velocity = throwTo(middle, randomSpot(), random(LIFT), piece.radius);
        piece.spin = randomSpin(SPIN);
      }
      pieces.push(piece);
    }

    // A shower of chunky blocks, coloured like the parts they break off from.
    const colors = [];
    rider.traverseVisible((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material && !material.transparent) colors.push(averageColor(material));
      }
    });
    if (!colors.length) colors.push(...FALLBACK_COLORS.map((hex) => new THREE.Color(hex)));
    for (let i = 0; i < BLOCKS; i += 1) {
      const size = random(BLOCK_SIZE);
      const position = center.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.9, (Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.4));
      pieces.push({
        position,
        rotation: new THREE.Quaternion().setFromEuler(euler.set(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        velocity: throwTo(position, randomSpot(), random(LIFT), size * 0.5),
        spin: randomSpin(SPIN),
        radius: size * 0.5,
        scale: new THREE.Vector3(size, size, size),
        block: i,
      });
      blocks.setColorAt(i, color.copy(colors[Math.floor(Math.random() * colors.length)]));
    }
    blocks.instanceColor.needsUpdate = true;
    blocks.count = BLOCKS;
    update(time); // place every block before the next frame draws them
  };

  /** Per-frame; `time` is the running clock in seconds. */
  const update = (time) => {
    if (!playing) return;
    const dt = lastTime === null ? 0 : THREE.MathUtils.clamp(time - lastTime, 0, 0.05);
    lastTime = time;
    const age = time - startTime;
    if (age >= DURATION) {
      clear();
      return;
    }
    const shrink = THREE.MathUtils.clamp((DURATION - age) / SHRINK, 0.001, 1);

    for (const piece of pieces) {
      const { position, velocity, spin } = piece;
      velocity.y -= GRAVITY * dt;
      position.addScaledVector(velocity, dt);
      if (position.y - piece.radius < floor) {
        position.y = floor + piece.radius;
        piece.down = true;
        if (velocity.y < 0) {
          velocity.y = velocity.y < -1.5 ? -velocity.y * BOUNCE : 0;
          velocity.x *= GRIP;
          velocity.z *= GRIP;
          spin.multiplyScalar(GRIP);
        }
      }
      if (piece.settle && piece.down) {
        piece.rotation.slerp(piece.settle, 1 - Math.exp(-SHOW_TURN * dt));
      } else {
        piece.rotation.premultiply(turn.setFromEuler(euler.set(spin.x * dt, spin.y * dt, spin.z * dt)));
      }
      if (piece.object) {
        piece.object.scale.copy(piece.scale).multiplyScalar(shrink);
      } else {
        blocks.setMatrixAt(piece.block, matrix.compose(position, piece.rotation, scale.copy(piece.scale).multiplyScalar(shrink)));
      }
    }
    blocks.instanceMatrix.needsUpdate = true;
  };

  // Measuring waiting to be done in idle time, a little at a time, so no single frame pays for it.
  const chores = [];
  let choring = false;
  const doChores = (deadline) => {
    // A busy game may leave no idle time at all: when the wait times out, do at least one chore anyway.
    if (deadline.didTimeout && chores.length) chores.shift()();
    while (chores.length && deadline.timeRemaining() > 2) chores.shift()();
    if (chores.length) whenIdle(doChores);
    else choring = false;
  };
  /**
   * Measures, in idle time, everything a burst of `rider` needs (its materials' colours and its parts'
   * bounds), so the hit itself does no slow work. Call it whenever the rider's bike model changes (and again
   * once a model loading in the background has arrived); what is already measured is skipped.
   */
  const prepare = (rider) => {
    rider.traverse((object) => {
      if (!object.isMesh) return;
      const { geometry } = object;
      if (!geometry.boundingBox || !geometry.boundingSphere) {
        chores.push(() => {
          geometry.boundingBox ?? geometry.computeBoundingBox();
          geometry.boundingSphere ?? geometry.computeBoundingSphere();
        });
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material && !material.transparent && !averageColors.has(material)) chores.push(() => averageColor(material));
      }
    });
    if (chores.length && !choring) {
      choring = true;
      whenIdle(doChores);
    }
  };

  return { burst, update, clear, prepare, duration: DURATION };
}
