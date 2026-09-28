import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import scooterUrl from '../../assets/green-delivery-scooter.glb?url';
import { createBike } from './Bike.js';
import { createAetheruneBike } from './AetheruneBike.js';

/**
 * Models for the bikes in the bike store, matched to the reference screenshots. Every bike faces -Z with its
 * wheels resting on y = 0 and is roughly 2.6 units long. Archetypes: the green delivery scooter (textured GLB),
 * a white dirt bike, Tron-style light cycles (blue, pink, Blood Moon black-red), a classic red roadster with
 * mudguards, sharp-nosed sport bikes with glowing rims, a neon chopper and the glowing winged Blood Moon III.
 */

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.25, ...o });
const glowMat = (color, intensity = 1.8) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4 });
const METAL = 0xc7cad6;
const BLACK = 0x14141b;

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const box = (w, h, d, material, x, y, z) => mesh(new THREE.BoxGeometry(w, h, d), material, x, y, z);
const ellipsoid = (rx, ry, rz, material, x, y, z) => {
  const m = mesh(new THREE.SphereGeometry(1, 20, 14), material, x, y, z);
  m.scale.set(rx, ry, rz);
  return m;
};

/** Cylinder between two points, e.g. a fork leg or exhaust pipe. */
function strut(a, b, radius, material) {
  const from = new THREE.Vector3(...a);
  const to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 10), material, 0, 0, 0);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/**
 * A side profile (points as [z, y], nose toward -Z) extruded across the bike with rounded edges: used for the
 * fairings, tanks and shells so the bikes get crisp, recognisable silhouettes rather than blobs.
 */
function profile(points, width, material, { bevel = 0.06, x = 0 } = {}) {
  const shape = new THREE.Shape();
  points.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  geometry.rotateY(Math.PI / 2); // extrusion axis -> X, shape x (= -z) -> Z
  geometry.translate(-(width - bevel * 2) / 2 + x, 0, 0);
  geometry.computeVertexNormals();
  return mesh(geometry, material);
}

/** Wheel with its axle along X, centred at the origin. `disc` gives a solid Tron-style disc. */
function wheel({ r, width = 0.16, tire = BLACK, rim = METAL, glow = null, spokes = 0, knobby = false, disc = null }) {
  const g = new THREE.Group();
  const tireGeometry = new THREE.TorusGeometry(r - width / 2, width / 2, 10, 32);
  tireGeometry.rotateY(Math.PI / 2);
  g.add(mesh(tireGeometry, mat(tire, { roughness: 0.85, metalness: 0.05 })));

  if (disc) {
    const face = new THREE.CylinderGeometry(r - width * 0.6, r - width * 0.6, width * 1.3, 32);
    face.rotateZ(Math.PI / 2);
    g.add(mesh(face, mat(disc, { roughness: 0.35, metalness: 0.5 })));
  }
  if (glow) {
    const neon = new THREE.TorusGeometry(r * 0.72, 0.04, 8, 36);
    neon.rotateY(Math.PI / 2);
    for (const side of disc ? [-1, 1] : [0]) g.add(mesh(neon, glowMat(glow, 2.4), side * width * 0.66, 0, 0));
    if (!disc) {
      const inner = new THREE.CylinderGeometry(r * 0.7, r * 0.7, 0.04, 28);
      inner.rotateZ(Math.PI / 2);
      g.add(mesh(inner, new THREE.MeshStandardMaterial({ color: 0x0a0a12, transparent: true, opacity: 0.6 })));
    }
  } else if (!disc) {
    const rimRing = new THREE.TorusGeometry(r * 0.66, 0.035, 8, 28);
    rimRing.rotateY(Math.PI / 2);
    g.add(mesh(rimRing, mat(rim, { metalness: 0.7, roughness: 0.25 })));
  }
  const hub = new THREE.CylinderGeometry(r * 0.17, r * 0.17, width * 1.5, 12);
  hub.rotateZ(Math.PI / 2);
  g.add(mesh(hub, glow ? glowMat(glow, 1.6) : mat(METAL, { metalness: 0.75 })));

  const spokeCount = spokes || (disc ? 0 : 5);
  for (let i = 0; i < spokeCount; i += 1) {
    const spoke = box(0.03, 0.03, r * 1.3, mat(rim, { metalness: 0.6 }), 0, 0, 0);
    spoke.rotation.x = (i / spokeCount) * Math.PI;
    g.add(spoke);
  }
  if (knobby) {
    const knobMaterial = mat(tire, { roughness: 0.9 });
    for (let i = 0; i < 24; i += 1) {
      const a = (i / 24) * Math.PI * 2;
      const knob = box(width * 0.95, 0.05, 0.07, knobMaterial, 0, Math.sin(a) * (r + 0.01), Math.cos(a) * (r + 0.01));
      knob.rotation.x = -a;
      g.add(knob);
    }
  }
  return g;
}

function place(group, child, x, y, z) {
  child.position.set(x, y, z);
  group.add(child);
  return child;
}

/** A curved mudguard over a wheel: an open strip of cylinder hugging the tyre from `from` to `to` (radians: 0 = rear, PI/2 = up, PI = front). */
function fender(r, width, material, from, to) {
  const geometry = new THREE.CylinderGeometry(r, r, width, 24, 1, true, from, to - from);
  geometry.rotateZ(Math.PI / 2);
  const m = mesh(geometry, material);
  m.material.side = THREE.DoubleSide;
  return m;
}

// ---- archetypes ----------------------------------------------------------------------------------------------

/**
 * Sharp-nosed sport bike: a low pointed fairing sweeping up to a tinted screen, tank, stepped seat and upswept
 * tail, a contrasting stripe down each side, exposed forks and swingarm, and (optionally) glowing rims.
 */
function sport({ main, dark, accent, rim = 0x2b2b35, glowRims = null, emissive = 0, wings = null }) {
  const bike = new THREE.Group();
  const body = mat(main, { roughness: 0.28, metalness: 0.35, emissive: main, emissiveIntensity: emissive || 0.12 });
  const darkMat = mat(dark, { roughness: 0.45 });
  const accentMat = mat(accent, { roughness: 0.3, emissive: accent, emissiveIntensity: glowRims ? 0.9 : 0.2 });
  const metal = mat(METAL, { metalness: 0.75, roughness: 0.25 });

  place(bike, wheel({ r: 0.42, width: 0.16, rim, glow: glowRims }), 0, 0.42, -0.9);
  place(bike, wheel({ r: 0.44, width: 0.22, rim, glow: glowRims }), 0, 0.44, 0.88);

  // Frame, engine and exhaust under the bodywork.
  bike.add(box(0.34, 0.36, 0.62, darkMat, 0, 0.56, 0.02));
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.11, 1.12, -0.7], [s * 0.1, 0.42, -0.9], 0.035, metal)); // fork
    bike.add(strut([s * 0.13, 0.55, 0.2], [s * 0.12, 0.44, 0.88], 0.04, darkMat)); // swingarm
  }
  bike.add(strut([0.19, 0.42, 0.25], [0.2, 0.72, 1.12], 0.06, metal));

  // Main fairing: nose, screen line, tank, seat dip and upswept tail.
  bike.add(profile([
    [-1.25, 0.82], [-1.02, 1.08], [-0.72, 1.26], [-0.34, 1.2], [-0.08, 1.17], [0.26, 1.0], [0.62, 1.1],
    [1.05, 1.24], [1.2, 1.2], [0.9, 0.95], [0.4, 0.78], [0.05, 0.5], [-0.55, 0.46], [-0.95, 0.6],
  ], 0.46, body));
  // Seat and tail cowl in the dark colour, a stripe of the accent colour along each flank.
  bike.add(profile([[0.02, 1.2], [0.3, 1.04], [0.62, 1.13], [0.66, 1.2], [0.3, 1.13], [0.05, 1.26]], 0.34, darkMat, { bevel: 0.04 }));
  for (const s of [-1, 1]) {
    bike.add(profile([[-1.12, 0.8], [-0.6, 0.98], [0.2, 0.9], [0.95, 1.08], [0.95, 1.02], [0.2, 0.83], [-0.6, 0.9], [-1.12, 0.74]], 0.02, accentMat, { bevel: 0.005, x: s * 0.235 }));
  }
  const screen = profile([[-0.78, 1.24], [-0.55, 1.45], [-0.4, 1.4], [-0.52, 1.22]], 0.3, mat(0x9fd8ff, { transparent: true, opacity: 0.5, roughness: 0.1 }), { bevel: 0.03 });
  bike.add(screen);
  bike.add(ellipsoid(0.12, 0.07, 0.05, glowMat(0xffffff, 2), 0, 0.92, -1.22)); // headlight
  bike.add(ellipsoid(0.1, 0.05, 0.04, glowMat(0xff2a2a, 1.6), 0, 1.2, 1.21)); // tail light
  bike.add(box(0.7, 0.04, 0.04, darkMat, 0, 1.3, -0.5)); // clip-on bars

  if (wings) {
    // Blood Moon III: swept armour blades off the flanks and spikes along the tail.
    const wingMat = mat(wings, { roughness: 0.25, metalness: 0.7 });
    for (const s of [-1, 1]) {
      const blade = profile([[-0.3, 1.05], [0.35, 1.34], [1.0, 1.42], [0.55, 1.18], [0.25, 1.0]], 0.05, wingMat, { bevel: 0.015, x: s * 0.3 });
      bike.add(blade);
      bike.add(profile([[-1.05, 0.75], [-1.45, 0.95], [-1.0, 0.95]], 0.05, wingMat, { bevel: 0.01, x: s * 0.2 }));
    }
    for (let i = 0; i < 3; i += 1) {
      const spike = mesh(new THREE.ConeGeometry(0.05, 0.3, 6), wingMat, 0, 1.28 + i * 0.02, 0.62 + i * 0.2);
      spike.rotation.x = -0.9;
      bike.add(spike);
    }
  }
  return bike;
}

/** Tron-style light cycle: a front shell and a rear shell in the main colour over solid disc wheels with glowing rings, a dark cockpit between. */
function tron({ shell, mid, glow, emissive = 0.25 }) {
  const bike = new THREE.Group();
  const shellMat = mat(shell, { roughness: 0.25, metalness: 0.4, emissive: shell, emissiveIntensity: emissive });
  const midMat = mat(mid, { roughness: 0.35, metalness: 0.5 });
  const glowMaterial = glowMat(glow, 2.2);

  place(bike, wheel({ r: 0.5, width: 0.3, tire: 0x0c0c10, disc: mid, glow }), 0, 0.5, -0.88);
  place(bike, wheel({ r: 0.52, width: 0.34, tire: 0x0c0c10, disc: mid, glow }), 0, 0.52, 0.88);

  bike.add(profile([[-1.42, 0.5], [-1.34, 0.86], [-1.08, 1.08], [-0.62, 1.1], [-0.3, 0.92], [-0.28, 0.58], [-0.52, 0.44], [-1.2, 0.38]], 0.44, shellMat));
  bike.add(profile([[-0.36, 0.95], [-0.2, 1.02], [0.15, 0.9], [0.4, 0.98], [0.4, 0.46], [-0.36, 0.46]], 0.36, midMat));
  bike.add(profile([[0.34, 0.5], [0.34, 1.02], [0.75, 1.16], [1.2, 1.06], [1.44, 0.76], [1.4, 0.44], [0.9, 0.36]], 0.48, shellMat));
  for (const s of [-1, 1]) {
    bike.add(box(0.02, 0.04, 2.3, glowMaterial, s * 0.25, 0.64, 0));
  }
  bike.add(ellipsoid(0.1, 0.06, 0.04, glowMat(0xffffff, 2), 0, 0.82, -1.4));
  bike.add(box(0.62, 0.04, 0.04, midMat, 0, 1.12, -0.36));
  return bike;
}

/** Classic roadster: teardrop tank, curved mudguards over spoked wheels, round headlight, chrome engine and pipes. */
function classic({ main, seat = 0x1a1414, chrome = 0xd4d7e0 }) {
  const bike = new THREE.Group();
  const paint = mat(main, { roughness: 0.25, metalness: 0.35, emissive: main, emissiveIntensity: 0.1 });
  const chromeMat = mat(chrome, { roughness: 0.2, metalness: 0.9 });
  const dark = mat(0x2a2a30, { roughness: 0.5 });

  place(bike, wheel({ r: 0.44, width: 0.15, tire: 0x1c1c22, rim: chrome, spokes: 8 }), 0, 0.44, -0.95);
  place(bike, wheel({ r: 0.45, width: 0.18, tire: 0x1c1c22, rim: chrome, spokes: 8 }), 0, 0.45, 0.95);
  place(bike, fender(0.53, 0.22, paint, 0.8, 3.0), 0, 0.44, -0.95);
  place(bike, fender(0.54, 0.25, paint, -0.25, 2.1), 0, 0.45, 0.95);

  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.12, 1.25, -0.62], [s * 0.1, 0.44, -0.95], 0.04, chromeMat));
    bike.add(strut([s * 0.13, 0.5, 0.15], [s * 0.12, 0.45, 0.95], 0.04, dark));
    bike.add(strut([s * 0.21, 0.36, -0.2], [s * 0.23, 0.5, 1.2], 0.055, chromeMat)); // twin pipes
  }
  bike.add(box(0.34, 0.36, 0.5, chromeMat, 0, 0.55, -0.1)); // engine
  for (const z of [-0.25, 0.05]) {
    const cylinder = mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.3, 12), dark, 0, 0.82, z);
    cylinder.rotation.x = z < 0 ? -0.4 : 0.4;
    bike.add(cylinder);
  }
  bike.add(ellipsoid(0.26, 0.19, 0.44, paint, 0, 1.08, -0.3)); // teardrop tank
  bike.add(profile([[0.05, 1.02], [0.25, 1.1], [0.62, 1.06], [0.7, 0.95], [0.1, 0.92]], 0.34, mat(seat, { roughness: 0.7 })));
  bike.add(box(0.3, 0.3, 0.25, paint, 0, 0.8, 0.45)); // side cover
  // Round headlight and bars.
  const lamp = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.14, 20), chromeMat, 0, 1.12, -0.82);
  lamp.rotation.x = Math.PI / 2;
  bike.add(lamp);
  bike.add(ellipsoid(0.12, 0.12, 0.03, glowMat(0xfff4d0, 1.8), 0, 1.12, -0.9));
  bike.add(box(0.84, 0.045, 0.045, chromeMat, 0, 1.38, -0.55));
  for (const s of [-1, 1]) bike.add(strut([s * 0.1, 1.26, -0.6], [s * 0.3, 1.38, -0.55], 0.025, chromeMat));
  return bike;
}

/** Dirt bike: high front mudguard and number plate, white shrouds, long flat seat, spoked knobby wheels. */
function dirt({ plastic, frame, accent }) {
  const bike = new THREE.Group();
  const white = mat(plastic, { roughness: 0.35 });
  const darkMat = mat(frame, { roughness: 0.5 });
  const accentMat = mat(accent, { roughness: 0.35 });
  const metal = mat(METAL, { metalness: 0.75, roughness: 0.3 });

  place(bike, wheel({ r: 0.52, width: 0.14, rim: METAL, knobby: true, spokes: 8 }), 0, 0.52, -0.92);
  place(bike, wheel({ r: 0.48, width: 0.2, rim: METAL, knobby: true, spokes: 8 }), 0, 0.48, 0.88);
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.1, 1.35, -0.58], [s * 0.09, 0.52, -0.92], 0.04, metal));
    bike.add(strut([s * 0.11, 0.55, 0.15], [s * 0.1, 0.48, 0.88], 0.04, darkMat));
  }
  const frontFender = profile([[-1.35, 1.02], [-1.0, 1.12], [-0.7, 1.1], [-0.9, 1.04]], 0.2, white, { bevel: 0.03 });
  bike.add(frontFender);
  bike.add(profile([[-0.72, 1.12], [-0.62, 1.48], [-0.48, 1.44], [-0.58, 1.1]], 0.3, white, { bevel: 0.03 })); // number plate
  bike.add(profile([[-0.6, 1.2], [-0.35, 1.3], [0.05, 1.22], [0.2, 0.95], [-0.35, 0.8], [-0.62, 0.95]], 0.44, white)); // shrouds / tank
  bike.add(profile([[-0.52, 1.1], [-0.3, 1.18], [0.02, 1.12], [0.05, 1.02], [-0.5, 1.0]], 0.46, accentMat, { bevel: 0.02 })); // blue graphic
  bike.add(profile([[-0.1, 1.28], [0.9, 1.2], [1.3, 1.26], [1.25, 1.14], [0.9, 1.1], [-0.1, 1.18]], 0.3, darkMat, { bevel: 0.04 })); // long seat
  bike.add(profile([[0.55, 1.12], [1.35, 1.2], [1.3, 1.0], [0.6, 0.9]], 0.34, white, { bevel: 0.03 })); // rear fender
  bike.add(box(0.3, 0.38, 0.46, metal, 0, 0.62, 0.0)); // engine
  bike.add(strut([0.18, 0.5, 0.0], [0.2, 1.0, 1.05], 0.055, metal)); // exhaust
  bike.add(box(0.86, 0.05, 0.05, darkMat, 0, 1.52, -0.5));
  return bike;
}

/** Chopper: raked forks, low seat, fat rear tyre, neon rims and neon frame rails. */
function chopper({ body: bodyColor, neon }) {
  const bike = new THREE.Group();
  const body = mat(bodyColor, { roughness: 0.3, metalness: 0.5 });
  const neonMat = glowMat(neon, 2.2);
  const metal = mat(0x3a3a44, { metalness: 0.7 });
  place(bike, wheel({ r: 0.44, width: 0.12, tire: 0x0b0b10, glow: neon }), 0, 0.44, -1.1);
  place(bike, wheel({ r: 0.48, width: 0.32, tire: 0x0b0b10, glow: neon }), 0, 0.48, 0.95);
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.1, 1.3, -0.45], [s * 0.08, 0.44, -1.1], 0.035, metal));
    bike.add(box(0.025, 0.035, 1.3, neonMat, s * 0.24, 0.7, 0.05));
    bike.add(strut([s * 0.14, 0.95, 0.35], [s * 0.13, 0.48, 0.95], 0.04, metal));
  }
  bike.add(profile([[-0.55, 1.06], [-0.25, 1.18], [0.1, 1.06], [0.05, 0.9], [-0.5, 0.92]], 0.4, body)); // tank
  bike.add(box(0.38, 0.4, 0.55, mat(0x1c1c26, { metalness: 0.6 }), 0, 0.58, 0));
  bike.add(profile([[0.08, 0.95], [0.5, 0.88], [0.72, 1.0], [0.76, 0.86], [0.1, 0.82]], 0.34, mat(0x0d0d12)));
  bike.add(profile([[0.6, 0.98], [1.3, 1.02], [1.45, 0.72], [1.1, 0.9], [0.62, 0.86]], 0.38, body)); // rear fender
  bike.add(box(0.78, 0.05, 0.05, metal, 0, 1.46, -0.42));
  bike.add(ellipsoid(0.1, 0.1, 0.08, glowMat(0xffffff, 1.6), 0, 1.12, -0.65));
  bike.add(box(0.5, 0.025, 0.025, neonMat, 0, 1.2, -0.3));
  return bike;
}

function scooterFallback({ main, seat }) {
  const bike = new THREE.Group();
  place(bike, wheel({ r: 0.27, width: 0.13 }), 0, 0.27, -0.62);
  place(bike, wheel({ r: 0.27, width: 0.15 }), 0, 0.27, 0.62);
  const body = mat(main, { roughness: 0.3 });
  bike.add(box(0.42, 0.08, 0.9, body, 0, 0.3, 0.05));
  bike.add(ellipsoid(0.3, 0.32, 0.5, body, 0, 0.58, 0.55));
  bike.add(box(0.3, 0.1, 0.55, mat(seat), 0, 0.93, 0.5));
  const shield = box(0.42, 0.75, 0.08, body, 0, 0.7, -0.5);
  shield.rotation.x = 0.25;
  bike.add(shield);
  return bike;
}

// The starter scooter is the green delivery scooter's textured GLB, fitted to the store's axes and 2.5 units long.
let scooterModel;
function loadScooter() {
  scooterModel ??= new GLTFLoader().loadAsync(scooterUrl).then(({ scene }) => {
    const root = new THREE.Group();
    scene.rotation.y = -Math.PI / 2; // its front points along -X
    root.add(scene);
    root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(root);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const fit = 2.5 / size.z;
    root.scale.setScalar(fit);
    root.position.set(-center.x * fit, -bounds.min.y * fit, -center.z * fit);
    root.traverse((object) => { if (object.isMesh) object.castShadow = true; });
    return root;
  });
  return scooterModel;
}
function greenScooter() {
  const bike = new THREE.Group();
  const fallback = scooterFallback({ main: 0x3ed46b, seat: 0xe8e8ef });
  bike.add(fallback);
  loadScooter().then((model) => {
    bike.remove(fallback);
    bike.add(model.clone(true));
  }).catch(() => {});
  return bike;
}

const SPECS = {
  bike_scooter: () => greenScooter(),
  bike_trail: () => dirt({ plastic: 0xf4f6fb, frame: 0x161b2e, accent: 0x2f6fe8 }),
  bike_azure: () => createBike(0x2a6bff),
  bike_cruiser_red: () => classic({ main: 0xd82f3a }),
  bike_cruiser_violet: () => sport({ main: 0x8c8c9c, dark: 0x2a2833, accent: 0xb45cff, rim: 0x2a2833, glowRims: 0xb45cff }),
  bike_cyan_bolt: () => sport({ main: 0x35d8e8, dark: 0x2a2f68, accent: 0x7a5cff, glowRims: 0x3ff0ff }),
  bike_violet_racer: () => sport({ main: 0x8f45e6, dark: 0x351866, accent: 0xd8b4ff, glowRims: 0xb070ff }),
  bike_gold_sprint: () => sport({ main: 0xffc81e, dark: 0x25252e, accent: 0xff4a1a }),
  bike_blue_blitz: () => sport({ main: 0x2f88ff, dark: 0x16306e, accent: 0xc4f4ff, glowRims: 0x5fd4ff }),
  bike_pink_phantom: () => tron({ shell: 0xff3d8f, mid: 0x3a3440, glow: 0xff5aa8 }),
  bike_bloodmoon_1: () => tron({ shell: 0x2b0e16, mid: 0x120a0e, glow: 0xff2d44, emissive: 0.1 }),
  bike_bloodmoon_2: () => chopper({ body: 0x2a1418, neon: 0xff5a5a }),
  // Limited-edition display bike uses the supplied textured GLB model.
  bike_aetherune: () => createAetheruneBike(),
  bike_bloodmoon_3: () => sport({ main: 0xff4a50, dark: 0x5a1a22, accent: 0xffc0c8, glowRims: 0xff6a6a, emissive: 0.75, wings: 0xd9d9e2 }),
};

export function createStoreBike(id) {
  const build = SPECS[id];
  if (!build) throw new Error(`No store model for bike "${id}"`);
  return build();
}
