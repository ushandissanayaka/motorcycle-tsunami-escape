import * as THREE from 'three';
import { BIKES, requirementText } from '../../shared/constants.js';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';
import { createStoreBike } from './StoreBikes.js';
import { batchStatic } from '../util/staticBatch.js';

/**
 * Two-level bike store. Built in a local frame facing +Z (front) with the
 * origin at ground level in the middle of the building; `createBikeStore`
 * places it in the world (local +Z -> world +X, local +X -> world -Z).
 *
 *   upper level (floor y = 6):  4 win bikes | ramp landing | 3 Blood Moon bikes
 *   lower level (floor y = 0):  3 bikes      | ramp        | 3 bikes
 *
 * Every bike floats and bobs above a glowing pad: red = locked, yellow =
 * unlocked, green = equipped. Driving onto a pad calls `onPad(bike)`.
 */

// The store's local -X side faces world +Z, toward the Group Chest / Lucky Blocks plaza (see the class
// comment above for the local-to-world mapping); enlarging the store and spreading its pads out further
// on that side (below) is what gives it more presence facing that plaza, without pushing the far (Blood
// Moon) side out as far.
const W = 44; // outer width (was 36; widened for more room between bikes)
const WALL = 1.5;
const BACK_Z = -7.5;
const FRONT_Z = 7;
const SLAB_TOP = 8; // upper floor height (was 6; raised, with WALL_HEIGHT, for more lower-tier headroom)
const SLAB_THICKNESS = 0.8;
const WALL_HEIGHT = 16.5; // was 14.5
const RAMP_WIDTH = 7;
const RAMP_TOP_Z = 3; // where the ramp reaches the upper floor
const RAMP_START_Z = 17; // where the ramp meets the ground

const PAD_Z = 2.5;
// Wheel bottoms above the floor: the bikes float just over their labels, well clear of the ceiling of the
// lower alcove as they bob.
const BIKE_HEIGHT = { lower: 3.0, upper: 3.0 };
// Lower-tier bikes sit close behind their pad, toward the front/road side, well clear of the raised
// upper floor above them; upper-tier bikes keep their original, further-back position.
const BIKE_Z = { lower: 0.2, upper: -1.2 };
const LABEL_Z = { lower: PAD_Z, upper: PAD_Z - 1.4 };

// "BLOOD MOON BIKES" sits on the upper back glass, over its three bikes and under the top window band.
const HEADER = { x: 10.4, y: SLAB_TOP + 6.9, z: BACK_Z + 1.3 }; // in front of the glass panel's frame posts
const LABEL_FONT = '"Fredoka", "Lilita One", "Arial Black", Arial, sans-serif';

// Sampled from the reference: red (255,61,79), yellow (255,255,54), green (19,255,61).
const PAD_COLORS = { locked: 0xff3d4f, unlocked: 0xffff36, equipped: 0x13ff3d };

// Pad x positions (local) per tier and slot, plus pad size and bike scale. Gaps between pads are wider
// than the reference so the bikes (nearly as big as their pads, floating well above them) have breathing
// room; the negative-x (win-bikes / Group Chest side) run is spread further out than the positive-x
// (Blood Moon) run.
const SLOTS = {
  // As in the reference, each bike (about 2.65 units long unscaled) is roughly as long as its pad, so neighbours never touch.
  lower: [-16.5, -11.5, -6.5, 6.2, 10.6, 15.0].map((x) => ({ x, size: 3.4, scale: 1.55, label: 0.95 })),
  upper: [
    ...[-17.8, -13.4, -8.8, -4.6].map((x) => ({ x, size: 3.4, scale: 1.45, label: 0.88 })),
    ...[6.4, 10.8, 15.2].map((x) => ({ x, size: 3.6, scale: 1.45, label: 0.92 })),
  ],
};
const FLOOR_Y = { lower: 0, upper: SLAB_TOP };

/** A sprite drawn on a canvas, redrawn once the rounded display font has loaded (the first draw may use a fallback). */
const canvasSprite = (width, height, draw, scaleX, scaleY) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const redraw = () => {
    ctx.clearRect(0, 0, width, height);
    draw(ctx, width, height);
    texture.needsUpdate = true;
  };
  redraw();
  document.fonts?.load(`700 64px ${LABEL_FONT}`).then(redraw).catch(() => {});
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(scaleX, scaleY, 1);
  return sprite;
};

/** Rounded bold text with a thick dark outline; `fill` may be a [top, bottom] gradient. */
function outlinedText(ctx, text, x, y, size, fill, outline, maxWidth) {
  ctx.font = `700 ${size}px ${LABEL_FONT}`;
  const fit = Math.min(1, maxWidth / ctx.measureText(text).width);
  ctx.font = `700 ${size * fit}px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * fit * 0.22;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  if (Array.isArray(fill)) {
    const gradient = ctx.createLinearGradient(0, y - size * fit * 0.45, 0, y + size * fit * 0.45);
    gradient.addColorStop(0, fill[0]);
    gradient.addColorStop(1, fill[1]);
    ctx.fillStyle = gradient;
  } else {
    ctx.fillStyle = fill;
  }
  ctx.fillText(text, x, y);
}

/** "+1000/Step" (no thousands separator, as on the store's plates) over "100,000 Wins Required". */
function createBikeLabel(bike) {
  const step = `+${bike.stepBonus}/Step`;
  return canvasSprite(560, 240, (ctx, w) => {
    outlinedText(ctx, step, w / 2, 86, 112, '#ffffff', '#141a33', w - 40);
    outlinedText(ctx, requirementText(bike), w / 2, 184, 54, '#ffe03a', '#141a33', w - 40);
  }, 4.6, 1.97);
}

/** "BLOOD MOON BIKES": pink fading to red, with a dark maroon outline. */
function createHeader(text) {
  return canvasSprite(1280, 200, (ctx, w, h) => {
    outlinedText(ctx, text, w / 2, h / 2 + 4, 132, ['#ff8a9c', '#ff2d55'], '#3a0716', w - 60);
  }, 10.4, 1.62);
}

const glowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
};

function createPad({ size, floorY, x }) {
  const group = new THREE.Group();
  group.position.set(x, floorY, PAD_Z);

  const rim = new THREE.Mesh(new THREE.BoxGeometry(size + 0.35, 0.14, size + 0.35), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
  rim.position.y = 0.07;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(size, 0.22, size), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0, emissiveIntensity: 0.75 }));
  plate.position.y = 0.2;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.6, size * 2.6),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  // Soft bloom standing over the pad, as in the reference.
  const bloom = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
  bloom.scale.set(size * 2.1, size * 1.2, 1);
  bloom.position.y = 0.9;
  group.add(rim, plate, glow, bloom);

  group.userData.setState = (state) => {
    const color = new THREE.Color(PAD_COLORS[state]);
    plate.material.color.copy(color);
    plate.material.emissive.copy(color);
    rim.material.color.copy(color).multiplyScalar(0.55);
    rim.material.emissive.copy(color).multiplyScalar(0.25);
    glow.material.color.copy(color);
    bloom.material.color.copy(color);
  };
  return group;
}

export function createBikeStore({ position, bikes = BIKES }) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = Math.PI / 2; // front (+Z local) faces +X

  // ---- materials ----------------------------------------------------------
  const studded = (palette, seed) => new THREE.MeshStandardMaterial({ map: makeStudTexture(palette, seed), roughness: 0.75 });
  const paved = (palette, seed) => new THREE.MeshStandardMaterial({ map: makePaverTexture(palette, seed), roughness: 0.9, emissive: 0x9a93b8, emissiveIntensity: 0 });
  const blue = studded(PALETTES.buildingBlue, 31);
  const interior = studded(PALETTES.interiorBlue, 32);
  interior.emissive = new THREE.Color(0x3a44a0);
  interior.emissiveIntensity = 0.35;
  const floor = paved(PALETTES.paver, 33);
  const roof = paved(PALETTES.roof, 34);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2350, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6f97e8, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const neon = new THREE.MeshStandardMaterial({ color: 0x73e4ff, emissive: 0x45d2ff, emissiveIntensity: 1.5 });
  // Slate-lavender glass of the upper back wall and the windows (sampled: 104,100,161), light window frames.
  const slate = new THREE.MeshStandardMaterial({ color: 0x6864a1, emissive: 0x413d7a, emissiveIntensity: 0.55, roughness: 0.35 });
  const frameMaterial = new THREE.MeshStandardMaterial({ color: 0xc4c2df, roughness: 0.6, emissive: 0x6c6a90, emissiveIntensity: 0.3 });
  const navy = new THREE.MeshStandardMaterial({ color: 0x2b3f8f, emissive: 0x1a2a6a, emissiveIntensity: 0.5, roughness: 0.3 });

  const add = (geometry, material, x, y, z, tile = 6) => {
    const mesh = new THREE.Mesh(applyWorldUV(geometry, tile), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const box = (w, h, d, material, x, y, z, tile) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z, tile);

  // ---- shell --------------------------------------------------------------
  const depth = FRONT_Z - (BACK_Z - 0.5);
  const midZ = (FRONT_Z + BACK_Z - 0.5) / 2;
  box(W, WALL_HEIGHT, 1, interior, 0, WALL_HEIGHT / 2, BACK_Z); // back wall
  for (const s of [-1, 1]) {
    box(WALL, WALL_HEIGHT, depth, blue, s * (W / 2 - WALL / 2), WALL_HEIGHT / 2, midZ); // side walls
    // Square window with a light frame near the back of each side wall, upper level.
    box(0.3, 5.6, 5.6, frameMaterial, s * (W / 2 - WALL - 0.1), SLAB_TOP + 4.6, -3.4);
    box(0.2, 4.2, 4.2, slate, s * (W / 2 - WALL - 0.22), SLAB_TOP + 4.6, -3.4);
  }

  // Upper floor: two slabs either side of the ramp opening.
  const slabWidth = W / 2 - WALL - RAMP_WIDTH / 2;
  for (const s of [-1, 1]) {
    box(slabWidth, SLAB_THICKNESS, FRONT_Z - BACK_Z, floor, s * (RAMP_WIDTH / 2 + slabWidth / 2), SLAB_TOP - SLAB_THICKNESS / 2, (FRONT_Z + BACK_Z) / 2, 4);
    // Cyan light band across the front face of the upper floor, above each lower alcove.
    box(slabWidth, 0.5, 0.22, neon, s * (RAMP_WIDTH / 2 + slabWidth / 2), SLAB_TOP - SLAB_THICKNESS / 2, FRONT_Z + 0.06);
  }

  // Upper back wall: a big slate glass panel in a dark frame, with a band of navy panes under the roof.
  const panelWidth = W - 2 * WALL - 13;
  box(panelWidth, 8, 0.3, slate, 0, SLAB_TOP + 4.7, BACK_Z + 0.65);
  for (const y of [SLAB_TOP + 0.6, SLAB_TOP + 8.8]) box(panelWidth + 0.6, 0.45, 0.45, dark, 0, y, BACK_Z + 0.7);
  for (const s of [-1, 1]) box(0.45, 8.6, 0.45, dark, s * (panelWidth / 2 + 0.15), SLAB_TOP + 4.7, BACK_Z + 0.7);
  const backPanes = 8;
  const backPaneWidth = (W - 2 * WALL - 1) / backPanes;
  for (let i = 0; i < backPanes; i += 1) {
    const x = -(W - 2 * WALL - 1) / 2 + backPaneWidth * (i + 0.5);
    box(backPaneWidth - 0.4, 2.6, 0.2, navy, x, WALL_HEIGHT - 1.9, BACK_Z + 0.6);
    box(0.4, 2.9, 0.45, dark, x + backPaneWidth / 2, WALL_HEIGHT - 1.9, BACK_Z + 0.65);
  }

  // Front window band and two-tier roof.
  const bandY = WALL_HEIGHT - 1.1; // top window band, directly under the roof
  box(W - 2 * WALL, 0.5, 0.5, dark, 0, bandY - 1.05, FRONT_Z + 0.2);
  const panes = 9;
  const paneWidth = (W - 2 * WALL) / panes;
  for (let i = 0; i < panes; i += 1) {
    const x = -(W - 2 * WALL) / 2 + paneWidth * (i + 0.5);
    box(paneWidth - 0.3, 1.9, 0.08, glass, x, bandY, FRONT_Z + 0.2);
    box(0.3, 2.1, 0.4, dark, x + paneWidth / 2, bandY, FRONT_Z + 0.2);
  }
  box(W + 2.4, 0.7, depth + 1.4, roof, 0, WALL_HEIGHT - 0.15, midZ + 0.5, 4);
  box(W + 1, 0.7, depth, roof, 0, WALL_HEIGHT + 0.55, midZ, 4);

  // Core + ramp: one solid prism between the two lower alcoves.
  const profile = new THREE.Shape();
  profile.moveTo(-BACK_Z, 0);
  profile.lineTo(-BACK_Z, SLAB_TOP);
  profile.lineTo(-RAMP_TOP_Z, SLAB_TOP);
  profile.lineTo(-RAMP_START_Z, 0);
  const prism = new THREE.ExtrudeGeometry(profile, { depth: RAMP_WIDTH, bevelEnabled: false });
  prism.rotateY(Math.PI / 2);
  prism.translate(-RAMP_WIDTH / 2, 0, 0);
  prism.computeVertexNormals();
  applyWorldUV(prism, 4);
  const rampMesh = new THREE.Mesh(prism, [blue, floor]);
  group.add(rampMesh);

  // ---- pads, bikes, labels --------------------------------------------------
  const entries = bikes
    .filter((bike) => SLOTS[bike.tier]?.[bike.slot])
    .map((bike) => {
      const slot = SLOTS[bike.tier][bike.slot];
      const floorY = FLOOR_Y[bike.tier];

      const pad = createPad({ size: slot.size, floorY, x: slot.x });
      group.add(pad);

      const model = createStoreBike(bike.id);
      const holder = new THREE.Group();
      holder.position.set(slot.x, floorY + BIKE_HEIGHT[bike.tier], BIKE_Z[bike.tier]);
      holder.scale.setScalar(slot.scale);
      model.rotation.y = Math.PI / 2 + 0.3; // side-on, facing left, slightly toward the viewer
      holder.add(model);
      group.add(holder);

      const label = createBikeLabel(bike);
      label.position.set(slot.x, floorY + 1.6, LABEL_Z[bike.tier]);
      label.scale.multiplyScalar(slot.label);
      group.add(label);

      return { bike, pad, holder, slot, floorY, phase: bike.slot * 0.9 + (bike.tier === 'upper' ? 1.3 : 0), state: null };
    });

  const header = createHeader('BLOOD MOON BIKES');
  header.position.set(HEADER.x, HEADER.y, HEADER.z);
  group.add(header);

  // Each display bike is hundreds of small parts that only ever move together (its holder bobs), and the
  // building around them never moves: batch both so the store costs a few dozen draw calls, not ~550.
  // The pads are left alone, since setStates recolours them.
  for (const entry of entries) batchStatic(entry.holder);
  batchStatic(group, { exclude: [...entries.map((entry) => entry.pad), ...entries.map((entry) => entry.holder)] });

  // ---- world-space colliders ----------------------------------------------
  const bx = position.x;
  const bz = position.z;
  const toWorldRect = (x0, x1, z0, z1) => ({
    minX: bx + Math.min(z0, z1),
    maxX: bx + Math.max(z0, z1),
    minZ: bz - Math.max(x0, x1),
    maxZ: bz - Math.min(x0, x1),
  });
  const rampTop = (wx) => {
    const lz = wx - bx;
    if (lz <= RAMP_TOP_Z) return SLAB_TOP;
    if (lz >= RAMP_START_Z) return 0;
    return (SLAB_TOP * (RAMP_START_Z - lz)) / (RAMP_START_Z - RAMP_TOP_Z);
  };
  const solids = [
    { ...toWorldRect(-W / 2, -W / 2 + WALL, BACK_Z - 0.5, FRONT_Z), bottom: 0, top: WALL_HEIGHT },
    { ...toWorldRect(W / 2 - WALL, W / 2, BACK_Z - 0.5, FRONT_Z), bottom: 0, top: WALL_HEIGHT },
    { ...toWorldRect(-W / 2, W / 2, BACK_Z - 0.5, BACK_Z + 0.5), bottom: 0, top: WALL_HEIGHT },
    { ...toWorldRect(-RAMP_WIDTH / 2, RAMP_WIDTH / 2, BACK_Z - 0.5, RAMP_START_Z), bottom: 0, top: (wx) => rampTop(wx) },
    { ...toWorldRect(-W / 2 + WALL, -RAMP_WIDTH / 2, BACK_Z, FRONT_Z), bottom: SLAB_TOP - SLAB_THICKNESS, top: SLAB_TOP },
    { ...toWorldRect(RAMP_WIDTH / 2, W / 2 - WALL, BACK_Z, FRONT_Z), bottom: SLAB_TOP - SLAB_THICKNESS, top: SLAB_TOP },
  ];

  // ---- runtime ---------------------------------------------------------------
  const padCenter = (entry) => ({ x: bx + PAD_Z, z: bz - entry.slot.x });
  let activePad = null;

  /** `stateOf(bike)` returns 'locked' | 'unlocked' | 'equipped'. */
  const setStates = (stateOf) => {
    for (const entry of entries) {
      const state = stateOf(entry.bike);
      if (state !== entry.state) {
        entry.state = state;
        entry.pad.userData.setState(state);
      }
    }
  };

  // Taking a bike: the display model lifts off its stand and shrinks away (TAKE.leave), the stand stays
  // empty for a moment (TAKE.empty), then a fresh one pops back in (TAKE.restock), so every rider can take
  // one; the store never runs out.
  const TAKE = { leave: 0.3, empty: 0.9, restock: 0.45 };
  let lastTime = 0;
  /** Plays the take-and-restock animation on the stand of `bikeId`. */
  const takeBike = (bikeId) => {
    const entry = entries.find((item) => item.bike.id === bikeId);
    if (entry) entry.takenAt = lastTime;
  };
  // 0..1 with a small overshoot at the end, for the restocked bike's pop.
  const easeOutBack = (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2;

  const update = (time, player, onPad) => {
    lastTime = time;
    for (const entry of entries) {
      const bob = Math.sin(time * 1.6 + entry.phase);
      let lift = 0;
      let size = 1;
      if (entry.takenAt !== undefined) {
        const t = time - entry.takenAt;
        if (t < TAKE.leave) {
          const k = t / TAKE.leave;
          lift = k * k * 1.2;
          size = 1 - k * k;
        } else if (t < TAKE.leave + TAKE.empty) {
          size = 0;
        } else if (t < TAKE.leave + TAKE.empty + TAKE.restock) {
          size = Math.max(0, easeOutBack((t - TAKE.leave - TAKE.empty) / TAKE.restock));
        } else {
          delete entry.takenAt;
        }
      }
      entry.holder.visible = size > 0.001;
      entry.holder.scale.setScalar(entry.slot.scale * Math.max(size, 0.001));
      entry.holder.position.y = entry.floorY + BIKE_HEIGHT[entry.bike.tier] + bob * 0.22 + lift;
      entry.holder.rotation.z = Math.sin(time * 1.1 + entry.phase) * 0.04;
    }
    if (!player) return;
    let standingOn = null;
    for (const entry of entries) {
      const c = padCenter(entry);
      const half = entry.slot.size / 2;
      if (Math.abs(player.position.x - c.x) < half && Math.abs(player.position.z - c.z) < half && Math.abs(player.position.y - entry.floorY) < 1.5) {
        standingOn = entry;
        break;
      }
    }
    if (standingOn?.bike.id !== activePad) {
      activePad = standingOn?.bike.id ?? null;
      if (standingOn) onPad?.(standingOn.bike);
    }
  };

  return { group, solids, setStates, update, takeBike };
}
