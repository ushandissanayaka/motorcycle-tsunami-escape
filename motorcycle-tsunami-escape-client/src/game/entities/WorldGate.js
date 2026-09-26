import * as THREE from 'three';
import { mulberry32 } from '../util/textures.js';
import { signSprite } from './Sign.js';

/**
 * The gate to another world, shaped and coloured after the reference screenshots: a ring of purple stone blocks
 * around a glowing yellow portal, a green vine over the top, two chunky block trees either side, spiky grass,
 * blue-purple rocks and a patch of bare earth, under a green "WORLD 2 / Level 75 Required" sign.
 * The front is the local +z side; the origin is on the ground in the middle of the portal.
 */

const PORTAL = { halfWidth: 2.7, springY: 2.7, topY: 6.2 }; // opening: straight sides up to springY, then a half ellipse
const RING = 1.45; // thickness of the stone ring
const DEPTH = 1.5;

/** Square studs, as on the reference's blocks: a grid of small raised squares with a light top edge. */
const studTexture = ({ base, light, dark }, seed, studs = 3) => {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const cell = size / studs;
  const pad = cell * 0.24;
  for (let row = 0; row < studs; row += 1) {
    for (let col = 0; col < studs; col += 1) {
      const x = col * cell + pad;
      const y = row * cell + pad;
      const w = cell - pad * 2;
      ctx.fillStyle = dark;
      ctx.fillRect(x - 2, y - 1, w + 4, w + 4);
      ctx.fillStyle = base;
      ctx.fillRect(x, y, w, w);
      ctx.fillStyle = light;
      ctx.fillRect(x, y, w, Math.max(3, w * 0.16));
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
};

/** Points of the half-ellipse over the opening, from the left leg to the right leg. */
const arcPoint = (t, grow = 0) => {
  const angle = Math.PI - t * Math.PI;
  const rx = PORTAL.halfWidth + grow;
  const ry = PORTAL.topY - PORTAL.springY + grow;
  return new THREE.Vector2(Math.cos(angle) * rx, PORTAL.springY + Math.sin(angle) * ry);
};

export function createWorldGate({ title = 'WORLD 2', subtitle = 'Level 75 Required' } = {}) {
  const group = new THREE.Group();
  const rand = mulberry32(11);

  const stone = new THREE.MeshStandardMaterial({ map: studTexture({ base: '#9d8fd6', light: '#b3a7e8', dark: '#7b6cb8' }, 71), roughness: 0.75 });
  const stoneDark = new THREE.MeshStandardMaterial({ map: studTexture({ base: '#8577c4', light: '#9c8fdc', dark: '#6a5ca6' }, 72), roughness: 0.8 });
  const rock = new THREE.MeshStandardMaterial({ map: studTexture({ base: '#6f66c0', light: '#8a82d8', dark: '#544c9a' }, 73, 2), roughness: 0.8 });
  const leaf = [
    new THREE.MeshStandardMaterial({ map: studTexture({ base: '#4fe04a', light: '#76f56c', dark: '#2fb52e' }, 74), roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: studTexture({ base: '#3ccf3a', light: '#62ee5c', dark: '#25a626' }, 75), roughness: 0.7 }),
    new THREE.MeshStandardMaterial({ map: studTexture({ base: '#63ea55', light: '#8bff7c', dark: '#3fc23a' }, 76), roughness: 0.7 }),
  ];
  const trunk = new THREE.MeshStandardMaterial({ color: 0xa9799f, roughness: 0.85 });
  const dirt = new THREE.MeshStandardMaterial({ map: studTexture({ base: '#cf9d88', light: '#dcae9a', dark: '#b3806d' }, 77, 6), roughness: 0.95 });
  const blade = new THREE.MeshStandardMaterial({ color: 0x2f9d3a, roughness: 0.7, flatShading: true });
  const vine = new THREE.MeshStandardMaterial({ color: 0x2c9a3c, roughness: 0.6 });

  const cast = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const cube = (size, material, x, y, z, turn = [0, 0, 0]) => {
    const mesh = cast(new THREE.Mesh(new THREE.BoxGeometry(...size), material));
    mesh.position.set(x, y, z);
    mesh.rotation.set(...turn);
    return mesh;
  };

  // ---- earth under the gate
  for (const [w, d, x, z, turn] of [[9.5, 4.6, 0, 0.9, 0.05], [5, 3.4, -1.6, 2.4, -0.25], [4.2, 3, 2.9, 2.2, 0.3]]) {
    const patch = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), dirt);
    patch.position.set(x, 0.07, z);
    patch.rotation.y = turn;
    patch.receiveShadow = true;
    group.add(patch);
  }

  // ---- stone ring: blocks along the arch, and stacked blocks up each leg
  const legHeight = PORTAL.springY;
  for (const side of [-1, 1]) {
    const x = side * (PORTAL.halfWidth + RING / 2);
    for (let i = 0; i < 3; i += 1) {
      const height = legHeight / 3 + 0.15;
      cube([RING + 0.1 - (i === 1 ? 0.25 : 0), height, DEPTH + (i === 1 ? -0.2 : 0)], i === 1 ? stoneDark : stone, x + side * (i === 1 ? -0.05 : 0.05), height / 2 + i * (legHeight / 3), 0, [0, side * 0.03 * (i - 1), 0]);
    }
  }
  const blocks = 11;
  for (let i = 0; i < blocks; i += 1) {
    const t0 = i / blocks;
    const t1 = (i + 1) / blocks;
    const a = arcPoint(t0, RING / 2);
    const b = arcPoint(t1, RING / 2);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const length = a.distanceTo(b) + 0.35;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    // Blocks near the top stand a little taller than the ones by the legs, like the reference.
    const thickness = RING + 0.25 + Math.sin(((i + 0.5) / blocks) * Math.PI) * 0.35 + (rand() - 0.5) * 0.2;
    const block = cube([length, thickness, DEPTH - (i % 2 ? 0.15 : 0)], i % 3 === 1 ? stoneDark : stone, mid.x, mid.y, (rand() - 0.5) * 0.15, [0, 0, angle]);
    // Push each block outward so the ring's inner edge follows the opening.
    const outward = new THREE.Vector2(mid.x, mid.y - PORTAL.springY).normalize();
    block.position.x += outward.x * 0.25;
    block.position.y += outward.y * 0.25;
  }

  // Small yellow rays sticking out from the inside of the ring, over the portal.
  const ray = new THREE.MeshBasicMaterial({ color: 0xffea00, toneMapped: false });
  for (const t of [0.12, 0.27, 0.42, 0.58, 0.73, 0.88]) {
    const p = arcPoint(t, -0.05);
    const inward = new THREE.Vector2(p.x, p.y - PORTAL.springY).normalize().multiplyScalar(-1);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.7, 4), ray);
    spike.position.set(p.x + inward.x * 0.25, p.y + inward.y * 0.25, 0.1);
    spike.rotation.z = Math.atan2(inward.y, inward.x) - Math.PI / 2;
    group.add(spike);
  }

  // Green vine draped over the top of the ring and down the right leg.
  const vinePoints = [];
  for (let i = 0; i <= 14; i += 1) {
    const p = arcPoint(0.22 + (i / 14) * 0.56, RING + 0.2);
    vinePoints.push(new THREE.Vector3(p.x, p.y, DEPTH / 2 + 0.05 + Math.sin(i * 1.1) * 0.06));
  }
  cast(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(vinePoints), 40, 0.09, 6), vine));

  // ---- the portal itself: a flat yellow shape filling the opening
  const opening = new THREE.Shape();
  opening.moveTo(-PORTAL.halfWidth, 0);
  opening.lineTo(-PORTAL.halfWidth, PORTAL.springY);
  for (let i = 1; i <= 24; i += 1) {
    const p = arcPoint(i / 24);
    opening.lineTo(p.x, p.y);
  }
  opening.lineTo(PORTAL.halfWidth, 0);
  opening.closePath();
  const portalMaterial = new THREE.MeshBasicMaterial({ color: 0xfff000, side: THREE.DoubleSide, toneMapped: false });
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(opening), portalMaterial);
  portal.position.z = 0.05;
  group.add(portal);
  const glow = new THREE.PointLight(0xfff04a, 14, 16, 1.6);
  glow.position.set(0, 3.2, 2.2);
  group.add(glow);

  // ---- trees: purple-brown trunks with a canopy of tilted green studded cubes
  const tree = (x, z, scale, mirror, seed) => {
    const r = mulberry32(seed);
    const t = new THREE.Group();
    t.position.set(x, 0, z);
    t.scale.setScalar(scale);
    group.add(t);
    const add = (mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      t.add(mesh);
      return mesh;
    };
    // Trunk and two branches leaning outward.
    const trunkMesh = add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 4.2, 0.85), trunk));
    trunkMesh.position.set(0, 2.1, 0);
    trunkMesh.rotation.z = mirror * 0.08;
    for (const [bx, lean, height] of [[mirror * -0.7, mirror * 0.62, 2.6], [mirror * 0.9, mirror * -0.5, 2.2]]) {
      const branch = add(new THREE.Mesh(new THREE.BoxGeometry(0.55, height, 0.55), trunk));
      branch.position.set(bx, 3.2, 0.1);
      branch.rotation.z = lean;
    }
    const root = add(new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.5), trunk));
    root.position.set(0, 0.25, 0);
    // Canopy: tilted cubes spread around and above the top of the trunk.
    const count = 15;
    for (let i = 0; i < count; i += 1) {
      const size = 1.5 + r() * 1.1;
      const spread = 2.2;
      const cx = (r() - 0.5) * 2 * spread + mirror * 0.3;
      const cy = 4.1 + r() * 2.3;
      const cz = (r() - 0.5) * 2.2;
      const leafCube = add(new THREE.Mesh(new THREE.BoxGeometry(size, size * (0.6 + r() * 0.3), size), leaf[i % leaf.length]));
      leafCube.position.set(cx, cy, cz);
      leafCube.rotation.set((r() - 0.5) * 0.7, r() * Math.PI, (r() - 0.5) * 0.7);
    }
    return t;
  };
  tree(-5.8, 0.6, 1.25, -1, 5);
  tree(5.5, 0.4, 1.2, 1, 9);

  // ---- spiky grass and rocks at the foot of each tree
  const spikes = (x, z, count) => {
    for (let i = 0; i < count; i += 1) {
      const height = 1.2 + rand() * 1.6;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.28 + rand() * 0.15, height, 4), blade);
      cone.position.set(x + (rand() - 0.5) * 1.6, height / 2, z + (rand() - 0.5) * 1.2);
      cone.rotation.set((rand() - 0.5) * 0.25, rand() * 3, (rand() - 0.5) * 0.35);
      cone.castShadow = true;
      group.add(cone);
    }
  };
  spikes(-3.7, 1.6, 6);
  spikes(3.6, 1.3, 6);
  const pile = (x, z, n) => {
    for (let i = 0; i < n; i += 1) {
      const w = 0.8 + rand() * 0.9;
      cube([w, 0.55 + rand() * 0.45, 0.8 + rand() * 0.5], rock, x + (rand() - 0.5) * 2, 0.3 + (i % 2) * 0.45, z + (rand() - 0.5) * 1.1, [0, (rand() - 0.5) * 0.9, 0]);
    }
  };
  pile(-4.4, 2.5, 5);
  pile(4.4, 2.2, 4);

  // ---- sign: green gradient letters with a dark outline
  const green = ['#d6ff3c', '#35d61b'];
  const titleSprite = signSprite(title, { fontSize: 2.0, color: green, strokeColor: '#08260d', strokeEm: 0.2, width: 13, height: 3.2 });
  titleSprite.position.set(0, 10.9, 0.5);
  const subtitleSprite = signSprite(subtitle, { fontSize: 1.0, color: green, strokeColor: '#08260d', strokeEm: 0.22, width: 13, height: 1.8 });
  subtitleSprite.position.set(0, 8.7, 0.5);
  group.add(titleSprite, subtitleSprite);

  const update = (time) => {
    portalMaterial.color.setHSL(0.155, 1, 0.5 + Math.sin(time * 2.2) * 0.02);
    glow.intensity = 14 + Math.sin(time * 2.2) * 2;
  };

  return {
    group,
    update,
    /** Footprints of the two trees (world offsets are added by the caller); the portal itself stays open. */
    halfSize: { treeX: 5.4, treeHalf: 0.9, height: 6 },
  };
}
