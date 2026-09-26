import * as THREE from 'three';
import { createBike } from './Bike.js';

/**
 * Procedural models for the 13 bikes in the bike store. Every bike faces -Z
 * with its wheels resting on y = 0 and is roughly 2.6 units long. Archetypes:
 * sport, winged sport, scooter, dirt bike, cruiser, chopper and light cycle.
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
  const m = mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 8), material, 0, 0, 0);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Wheel with its axle along X, centred at the origin. */
function wheel({ r, width = 0.16, tire = BLACK, rim = METAL, glow = null, spokes = 0, knobby = false }) {
  const g = new THREE.Group();
  const ring = new THREE.TorusGeometry(r - width / 2, width / 2, 10, 28);
  ring.rotateY(Math.PI / 2);
  g.add(mesh(ring, mat(tire, { roughness: 0.85, metalness: 0.05 })));

  if (glow) {
    const neon = new THREE.TorusGeometry(r * 0.74, 0.035, 8, 32);
    neon.rotateY(Math.PI / 2);
    g.add(mesh(neon, glowMat(glow, 2.2)));
    const disc = new THREE.CylinderGeometry(r * 0.74, r * 0.74, 0.04, 24);
    disc.rotateZ(Math.PI / 2);
    g.add(mesh(disc, new THREE.MeshStandardMaterial({ color: 0x0a0a12, transparent: true, opacity: 0.55 })));
  } else {
    const disc = new THREE.CylinderGeometry(r * 0.7, r * 0.7, width * 0.5, 20);
    disc.rotateZ(Math.PI / 2);
    g.add(mesh(disc, mat(rim, { metalness: 0.5 })));
  }
  const hub = new THREE.CylinderGeometry(r * 0.16, r * 0.16, width * 1.4, 10);
  hub.rotateZ(Math.PI / 2);
  g.add(mesh(hub, mat(METAL, { metalness: 0.7 })));

  for (let i = 0; i < spokes; i += 1) {
    const spoke = box(0.018, 0.018, r * 1.4, mat(rim, { metalness: 0.6 }), 0, 0, 0);
    spoke.rotation.x = (i / spokes) * Math.PI;
    g.add(spoke);
  }
  if (knobby) {
    const knobMaterial = mat(tire, { roughness: 0.9 });
    for (let i = 0; i < 22; i += 1) {
      const a = (i / 22) * Math.PI * 2;
      const knob = box(width * 0.9, 0.05, 0.07, knobMaterial, 0, Math.sin(a) * (r + 0.01), Math.cos(a) * (r + 0.01));
      knob.rotation.x = -a;
      g.add(knob);
    }
  }
  return g;
}

function place(group, child, x, y, z) {
  child.position.set(x, y, z);
  group.add(child);
}

/** Front + rear wheels for a bike with the given wheelbase. */
function addWheels(bike, wb, front, rear) {
  place(bike, wheel(front), 0, front.r, -wb / 2);
  place(bike, wheel(rear), 0, rear.r, wb / 2);
}

function sport({ main, dark, accent, tail = dark, rim = 0x2b2b35, glowRims = null, wings = null }) {
  const bike = new THREE.Group();
  const wb = 1.6;
  addWheels(bike, wb, { r: 0.4, rim, glow: glowRims }, { r: 0.42, width: 0.2, rim, glow: glowRims });

  const body = mat(main, { roughness: 0.3, metalness: 0.35 });
  const darkMat = mat(dark, { roughness: 0.5 });
  const metal = mat(METAL, { metalness: 0.7, roughness: 0.3 });
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.11, 1.0, -0.62], [s * 0.09, 0.4, -wb / 2], 0.03, metal));
    bike.add(strut([s * 0.12, 0.55, 0.15], [s * 0.1, 0.42, wb / 2], 0.035, darkMat));
    bike.add(box(0.02, 0.14, 0.7, mat(accent, { emissive: glowRims ? accent : 0x000000, emissiveIntensity: 0.9 }), s * 0.29, 0.75, -0.45));
  }
  bike.add(box(0.4, 0.42, 0.6, darkMat, 0, 0.55, 0));
  bike.add(ellipsoid(0.3, 0.26, 0.7, body, 0, 0.7, -0.45));
  bike.add(ellipsoid(0.24, 0.26, 0.4, body, 0, 0.95, -0.85));
  bike.add(ellipsoid(0.11, 0.1, 0.06, glowMat(0xffffff, 1.6), 0, 0.97, -1.22));
  bike.add(ellipsoid(0.27, 0.22, 0.5, body, 0, 1.05, -0.15));
  bike.add(box(0.3, 0.1, 0.55, darkMat, 0, 0.99, 0.4));
  const tailMesh = ellipsoid(0.2, 0.16, 0.44, mat(tail, { roughness: 0.35 }), 0, 1.02, 0.8);
  tailMesh.rotation.x = -0.14;
  bike.add(tailMesh);
  const screen = box(0.36, 0.3, 0.02, mat(0x9fd8ff, { transparent: true, opacity: 0.55 }), 0, 1.28, -0.7);
  screen.rotation.x = 0.6;
  bike.add(screen);
  bike.add(box(0.62, 0.04, 0.04, darkMat, 0, 1.2, -0.5));
  bike.add(strut([0.19, 0.42, 0.3], [0.2, 0.62, 0.95], 0.065, metal));

  if (wings) {
    const wingMat = mat(wings, { roughness: 0.3, emissive: wings, emissiveIntensity: 0.25 });
    for (const s of [-1, 1]) {
      const wing = box(0.9, 0.05, 0.28, wingMat, s * 0.52, 0.95, -0.72);
      wing.rotation.set(0, s * 0.35, s * 0.35);
      bike.add(wing);
      const spike = mesh(new THREE.ConeGeometry(0.07, 0.55, 6), wingMat, s * 0.95, 1.05, -0.95);
      spike.rotation.set(0, 0, -s * 1.2);
      bike.add(spike);
    }
  }
  return bike;
}

function scooter({ main, seat, accent }) {
  const bike = new THREE.Group();
  addWheels(bike, 1.25, { r: 0.27, width: 0.13, rim: METAL }, { r: 0.27, width: 0.15, rim: METAL });
  const body = mat(main, { roughness: 0.3 });
  const dark = mat(BLACK);
  const metal = mat(METAL, { metalness: 0.7 });
  bike.add(box(0.42, 0.08, 0.9, body, 0, 0.3, 0.05));
  bike.add(ellipsoid(0.3, 0.32, 0.5, body, 0, 0.58, 0.55));
  bike.add(box(0.3, 0.1, 0.55, mat(seat), 0, 0.93, 0.5));
  const shield = box(0.42, 0.75, 0.08, body, 0, 0.7, -0.5);
  shield.rotation.x = 0.25;
  bike.add(shield);
  bike.add(strut([0, 0.4, -0.55], [0, 1.15, -0.45], 0.04, metal));
  bike.add(box(0.62, 0.05, 0.05, dark, 0, 1.18, -0.45));
  bike.add(ellipsoid(0.1, 0.1, 0.07, glowMat(0xffffff, 1.4), 0, 1.06, -0.62));
  bike.add(ellipsoid(0.16, 0.09, 0.32, mat(accent), 0, 0.52, -0.62));
  bike.add(strut([0, 0.5, -0.6], [0, 0.27, -0.62], 0.035, metal));
  return bike;
}

function dirt({ main, plastic, dark }) {
  const bike = new THREE.Group();
  const wb = 1.75;
  addWheels(bike, wb, { r: 0.5, width: 0.16, rim: METAL, knobby: true, spokes: 6 }, { r: 0.46, width: 0.2, rim: METAL, knobby: true, spokes: 6 });
  const body = mat(main, { roughness: 0.4 });
  const white = mat(plastic, { roughness: 0.4 });
  const darkMat = mat(dark);
  const metal = mat(METAL, { metalness: 0.7, roughness: 0.3 });
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.1, 1.25, -0.55], [s * 0.09, 0.5, -0.87], 0.035, metal));
    bike.add(strut([s * 0.1, 0.5, 0.2], [s * 0.09, 0.46, wb / 2], 0.035, darkMat));
  }
  const fender = box(0.2, 0.05, 0.55, white, 0, 0.82, -0.85);
  fender.rotation.x = -0.25;
  bike.add(fender);
  const plate = box(0.26, 0.3, 0.03, white, 0, 1.15, -0.7);
  plate.rotation.x = 0.3;
  bike.add(plate);
  bike.add(box(0.85, 0.05, 0.05, darkMat, 0, 1.32, -0.5));
  for (const s of [-1, 1]) bike.add(strut([s * 0.1, 1.15, -0.55], [s * 0.36, 1.32, -0.5], 0.03, darkMat));
  bike.add(box(0.26, 0.26, 0.5, body, 0, 1.05, -0.15));
  bike.add(box(0.32, 0.3, 0.7, white, 0, 0.85, 0.25));
  const seatMesh = box(0.22, 0.1, 0.85, darkMat, 0, 1.05, 0.42);
  seatMesh.rotation.x = -0.1;
  bike.add(seatMesh);
  const rear = box(0.2, 0.04, 0.55, white, 0, 1.05, 1.0);
  rear.rotation.x = -0.35;
  bike.add(rear);
  bike.add(box(0.32, 0.4, 0.5, mat(METAL, { metalness: 0.6 }), 0, 0.55, 0.05));
  bike.add(strut([0.18, 0.45, -0.05], [0.2, 0.95, 1.0], 0.06, metal));
  return bike;
}

function cruiser({ main, metal: metalColor, seat, rim, glowTrim = null }) {
  const bike = new THREE.Group();
  const wb = 1.9;
  addWheels(bike, wb, { r: 0.43, width: 0.14, rim, spokes: 8 }, { r: 0.43, width: 0.18, rim, spokes: 8 });
  const body = mat(main, { roughness: 0.25, metalness: 0.4 });
  const chrome = mat(metalColor, { metalness: 0.85, roughness: 0.2 });
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.11, 1.1, -0.55], [s * 0.09, 0.43, -wb / 2], 0.035, chrome));
    bike.add(strut([s * 0.25, 0.35, -0.2], [s * 0.27, 0.35, 1.0], 0.06, chrome));
    bike.add(strut([s * 0.15, 1.05, -0.5], [s * 0.38, 1.28, -0.5], 0.03, chrome));
  }
  bike.add(ellipsoid(0.28, 0.24, 0.5, body, 0, 1.02, -0.25));
  if (glowTrim) bike.add(box(0.02, 0.04, 0.8, glowMat(glowTrim, 2), 0.29, 0.98, -0.25));
  bike.add(box(0.36, 0.1, 0.65, mat(seat), 0, 0.86, 0.4));
  bike.add(ellipsoid(0.26, 0.09, 0.6, body, 0, 0.98, 0.95));
  bike.add(box(0.44, 0.4, 0.55, chrome, 0, 0.5, -0.05));
  bike.add(box(0.8, 0.05, 0.05, chrome, 0, 1.28, -0.5));
  bike.add(ellipsoid(0.14, 0.14, 0.12, chrome, 0, 1.05, -0.85));
  bike.add(ellipsoid(0.09, 0.09, 0.05, glowMat(0xffffff, 1.4), 0, 1.05, -0.95));
  return bike;
}

function chopper({ body: bodyColor, neon }) {
  const bike = new THREE.Group();
  const wb = 2.1;
  addWheels(bike, wb, { r: 0.42, width: 0.1, tire: 0x0b0b10, glow: neon }, { r: 0.46, width: 0.32, tire: 0x0b0b10, glow: neon });
  const body = mat(bodyColor, { roughness: 0.3, metalness: 0.5 });
  const neonMat = glowMat(neon, 2.2);
  for (const s of [-1, 1]) {
    bike.add(strut([s * 0.1, 1.15, -0.45], [s * 0.08, 0.42, -1.05], 0.03, mat(0x2a2a34, { metalness: 0.7 })));
    bike.add(box(0.02, 0.03, 1.1, neonMat, s * 0.25, 0.72, 0.05));
  }
  bike.add(ellipsoid(0.24, 0.2, 0.4, body, 0, 0.98, -0.3));
  bike.add(box(0.36, 0.4, 0.55, mat(0x1c1c26, { metalness: 0.6 }), 0, 0.55, 0));
  bike.add(box(0.3, 0.08, 0.55, mat(0x0d0d12), 0, 0.82, 0.35));
  bike.add(ellipsoid(0.3, 0.07, 0.6, body, 0, 0.93, 0.9));
  bike.add(box(0.7, 0.05, 0.05, mat(0x2a2a34, { metalness: 0.7 }), 0, 1.32, -0.45));
  bike.add(ellipsoid(0.1, 0.1, 0.08, glowMat(0xffffff, 1.4), 0, 1.02, -0.68));
  bike.add(box(0.5, 0.02, 0.02, neonMat, 0, 1.2, -0.3));
  return bike;
}

const SPECS = {
  bike_scooter: () => scooter({ main: 0x3ed46b, seat: 0xe8e8ef, accent: 0x2fae56 }),
  bike_trail: () => dirt({ main: 0x2a6fe0, plastic: 0xf2f4ff, dark: 0x1b1b24 }),
  bike_azure: () => createBike(0x2a5fff),
  bike_cruiser_red: () => cruiser({ main: 0xd8323c, metal: 0xc9ccd6, seat: 0x3a2a24, rim: 0xbfc3ce }),
  bike_cruiser_violet: () => cruiser({ main: 0x8b4fd0, metal: 0xc0c4d4, seat: 0x2a2438, rim: 0xc9a6ff, glowTrim: 0xff6fd8 }),
  bike_cyan_bolt: () => sport({ main: 0x1fbde0, dark: 0x14202c, accent: 0xffffff, glowRims: 0x40e8ff }),
  bike_violet_racer: () => sport({ main: 0x8a4bd6, dark: 0x231a36, accent: 0xc9a0ff, tail: 0x8a4bd6, rim: 0x3a2a55 }),
  bike_gold_sprint: () => sport({ main: 0xffc21a, dark: 0x191a20, accent: 0xff5a1f, rim: 0x2a2a30 }),
  bike_blue_blitz: () => sport({ main: 0x2f9bff, dark: 0x15263a, accent: 0x9ff0ff, tail: 0x2f9bff, rim: 0x1c3d70 }),
  bike_pink_phantom: () => createBike(0xe63a8f),
  bike_bloodmoon_1: () => chopper({ body: 0x15131a, neon: 0xff2a3a }),
  bike_bloodmoon_2: () => sport({ main: 0x2a1520, dark: 0x1a1015, accent: 0xff4b6e, glowRims: 0xff4b6e }),
  // Limited-edition display bike (not sold in the store).
  bike_aetherune: () => sport({ main: 0x1c2a6b, dark: 0x0b0f2e, accent: 0x39d5ff, tail: 0x1c2a6b, glowRims: 0x39d5ff }),
  bike_bloodmoon_3: () => sport({ main: 0xff2d3d, dark: 0x1a1015, accent: 0xffd0d8, glowRims: 0xff5a6a, wings: 0xffe0e6 }),
};

export function createStoreBike(id) {
  const build = SPECS[id];
  if (!build) throw new Error(`No store model for bike "${id}"`);
  return build();
}
