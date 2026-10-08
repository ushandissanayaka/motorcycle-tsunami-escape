import * as THREE from 'three';

/**
 * Confetti burst of small squares that fly far out from the rider and fall away, played when a
 * wave-track trophy is returned, just before the rider is sent back to the start.
 */
const DURATION = 1; // seconds; the rider teleports as it finishes
const PIECES = 90;
const PIECE_SIZE = 0.2;
const SPEED_MIN = 7;
const SPEED_MAX = 16;
const GRAVITY = 9;
const CONFETTI = [0x3ddc4a, 0xffd23a, 0xff5a5a, 0x4aa8ff, 0xc85aff, 0xff9a2e, 0x2fe0d0, 0xffffff];

const geometry = new THREE.BoxGeometry(PIECE_SIZE, PIECE_SIZE, PIECE_SIZE);
// A slight, neutral glow (not tinted to one colour) so each instance's own colour still reads clearly.
const material = new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.12 });

export function createReturnBursts(scene) {
  const active = [];
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const place = new THREE.Vector3();
  const scale = new THREE.Vector3();

  /** Bursts from `position` (the rider's feet); `time` is the running clock in seconds. */
  const spawn = (position, time) => {
    const mesh = new THREE.InstancedMesh(geometry, material, PIECES);
    mesh.frustumCulled = false; // pieces fly well outside the mesh's origin
    const pieces = [];
    const color = new THREE.Color();
    for (let i = 0; i < PIECES; i += 1) {
      // Random direction on the upper part of a sphere, so the burst sprays out and up.
      const yaw = Math.random() * Math.PI * 2;
      const up = 0.15 + Math.random() * 0.85;
      const flat = Math.sqrt(1 - up * up);
      const speed = SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN);
      pieces.push({
        velocity: new THREE.Vector3(Math.cos(yaw) * flat, up, Math.sin(yaw) * flat).multiplyScalar(speed),
        spin: new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6),
      });
      mesh.setColorAt(i, color.setHex(CONFETTI[Math.floor(Math.random() * CONFETTI.length)]));
    }
    mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    active.push({ mesh, pieces, origin: new THREE.Vector3(position.x, position.y + 1.3, position.z), start: time });
    update(time);
  };

  /** Moves, spins and shrinks every burst's pieces, dropping bursts past their lifetime. */
  const update = (time) => {
    for (let b = active.length - 1; b >= 0; b -= 1) {
      const burst = active[b];
      const t = time - burst.start;
      if (t >= DURATION) {
        scene.remove(burst.mesh);
        burst.mesh.dispose();
        active.splice(b, 1);
        continue;
      }
      const size = 1 - (t / DURATION) ** 2; // full size for most of the flight, shrinking away at the end
      scale.setScalar(Math.max(size, 0.001));
      burst.pieces.forEach((piece, i) => {
        place.copy(burst.origin).addScaledVector(piece.velocity, t);
        place.y -= 0.5 * GRAVITY * t * t;
        rotation.setFromEuler(euler.set(piece.spin.x * t, piece.spin.y * t, piece.spin.z * t));
        burst.mesh.setMatrixAt(i, matrix.compose(place, rotation, scale));
      });
      burst.mesh.instanceMatrix.needsUpdate = true;
    }
  };

  return { spawn, update, duration: DURATION };
}
