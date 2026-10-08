import * as THREE from 'three';

const DEFAULT_COLOR = 0x1f6fe0;
const NAVY = 0x0e1a3e;
const FRONT = { r: 0.46, z: -1.0 };
const REAR = { r: 0.5, z: 0.98 };

/** Neon accent derived from the body colour; blues shift to teal like the reference. */
function glowFor(color) {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(color).getHSL(hsl);
  const hue = hsl.h > 0.45 && hsl.h < 0.72 ? 0.5 : hsl.h;
  return new THREE.Color().setHSL(hue, 0.9, 0.5);
}

function mesh(geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

const sideCylinder = (radius, length, segments = 32) => {
  const geometry = new THREE.CylinderGeometry(radius, radius, length, segments);
  geometry.rotateZ(Math.PI / 2); // axle along X
  return geometry;
};

/** Open front wheel: coloured rim, three dark spokes and a glowing hub. */
function createFrontWheel(bodyMaterial, glowMaterial, navyMaterial) {
  const wheel = new THREE.Group();
  const { r } = FRONT;
  const rim = new THREE.TorusGeometry(r - 0.07, 0.07, 10, 40);
  rim.rotateY(Math.PI / 2);
  wheel.add(mesh(rim, bodyMaterial));
  wheel.add(mesh(sideCylinder(r - 0.08, 0.03), new THREE.MeshStandardMaterial({ color: NAVY, transparent: true, opacity: 0.8 })));
  for (let i = 0; i < 3; i += 1) {
    const arm = new THREE.Group();
    arm.rotation.x = (i / 3) * Math.PI * 2;
    arm.add(mesh(new THREE.BoxGeometry(0.06, 0.06, r - 0.12), navyMaterial, 0, 0, -(r - 0.12) / 2));
    wheel.add(arm);
  }
  wheel.add(mesh(sideCylinder(0.13, 0.14, 20), glowMaterial));
  return wheel;
}

/** Solid dark disc wheel with a glowing cyan face on each side. */
function createRearWheel(bodyMaterial, glowMaterial, navyMaterial) {
  const wheel = new THREE.Group();
  const { r } = REAR;
  wheel.add(mesh(sideCylinder(r, 0.34, 40), navyMaterial));
  for (const side of [-1, 1]) {
    wheel.add(mesh(sideCylinder(r * 0.5, 0.03, 32), glowMaterial, side * 0.175, 0, 0));
    const ring = new THREE.TorusGeometry(r * 0.72, 0.035, 8, 40);
    ring.rotateY(Math.PI / 2);
    wheel.add(mesh(ring, bodyMaterial, side * 0.18, 0, 0));
  }
  return wheel;
}

/** Cylinder between two points, e.g. a fork leg. */
function strut(from, to, radius, material) {
  const a = new THREE.Vector3(...from);
  const dir = new THREE.Vector3(...to).sub(a);
  const m = mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 8), material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

/** Side profile of the body (z along the bike, y up), extruded across the bike with rounded edges. */
function createBodyGeometry() {
  const squash = 0.85; // keeps the seat low
  const shape = new THREE.Shape();
  const P = (z, y) => new THREE.Vector2(-z, y * squash); // shape x = -z so the nose points to -Z
  const move = (z, y) => shape.moveTo(...P(z, y).toArray());
  const curve = (cz, cy, z, y) => shape.quadraticCurveTo(...P(cz, cy).toArray(), ...P(z, y).toArray());
  move(0.5, 0.3);
  curve(0.9, 0.3, 0.92, 0.8); // rear
  curve(0.92, 1.35, 0.6, 1.35); // high hump over the rear wheel
  curve(0.3, 1.35, 0.1, 1.05); // sweeps down into the seat
  curve(-0.15, 0.95, -0.45, 1.0);
  curve(-0.7, 1.05, -0.78, 0.8); // nose
  curve(-0.86, 0.55, -0.62, 0.36);
  curve(-0.3, 0.2, 0.1, 0.22); // underside
  curve(0.35, 0.24, 0.5, 0.3);

  const width = 0.36;
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: width, curveSegments: 24, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 4 });
  geometry.rotateY(Math.PI / 2); // extrusion axis -> X, shape x -> Z
  geometry.translate(-width / 2, 0, 0);
  return geometry;
}

/**
 * Light cycle: blue shell with a dark navy canopy, an open three-spoke front
 * wheel and a solid rear disc wheel, both with glowing teal hubs. Faces -Z,
 * wheels touch y = 0. `userData.setColor` recolors the shell and derives the
 * neon glow from it.
 */
export function createBike(color = DEFAULT_COLOR) {
  const bike = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({ color, metalness: 0.2, roughness: 0.35, emissive: color, emissiveIntensity: 0.4 });
  const navyMaterial = new THREE.MeshStandardMaterial({ color: NAVY, metalness: 0.5, roughness: 0.4 });
  const glowMaterial = new THREE.MeshStandardMaterial({ color: glowFor(color), emissive: glowFor(color), emissiveIntensity: 0.9 });

  const front = createFrontWheel(bodyMaterial, glowMaterial, navyMaterial);
  front.position.set(0, FRONT.r, FRONT.z);
  const rear = createRearWheel(bodyMaterial, glowMaterial, navyMaterial);
  rear.position.set(0, REAR.r, REAR.z);
  bike.add(front, rear);
  // A ridden bike rolls these (see wheelSpin.js).
  Object.assign(front.userData, { wheelRadius: FRONT.r, halfWidth: 0.08 });
  Object.assign(rear.userData, { wheelRadius: REAR.r, halfWidth: 0.19 });

  // One rounded blue body between the wheels: a bulbous crescent that swells into a hump over
  // the rear and dips into a seat, with a dark strip along the top.
  bike.add(mesh(createBodyGeometry(), bodyMaterial));
  for (const [y, z, sz] of [[1.19, 0.62, 0.3], [0.93, 0.02, 0.34]]) {
    const strip = mesh(new THREE.SphereGeometry(1, 20, 12), navyMaterial, 0, y, z);
    strip.scale.set(0.27, 0.05, sz);
    bike.add(strip);
  }
  bike.add(mesh(new THREE.SphereGeometry(0.12, 16, 12), glowMaterial, 0, 0.7, -0.78)); // headlight orb
  for (const side of [-1, 1]) {
    bike.add(mesh(new THREE.BoxGeometry(0.02, 0.035, 0.7), glowMaterial, side * 0.29, 0.45, 0.05));
    bike.add(strut([side * 0.15, 0.95, -0.62], [side * 0.1, FRONT.r, FRONT.z], 0.03, navyMaterial));
  }

  // Stem and handlebar for the rider's hands.
  bike.add(strut([0, 0.8, -0.55], [0, 1.24, -0.38], 0.03, navyMaterial));
  bike.add(mesh(new THREE.BoxGeometry(0.74, 0.06, 0.06), navyMaterial, 0, 1.26, -0.36));

  bike.userData.setColor = (next) => {
    const hex = next || DEFAULT_COLOR;
    const glow = glowFor(hex);
    bodyMaterial.color.set(hex);
    bodyMaterial.emissive.set(hex);
    glowMaterial.color.copy(glow);
    glowMaterial.emissive.copy(glow);
  };

  return bike;
}
