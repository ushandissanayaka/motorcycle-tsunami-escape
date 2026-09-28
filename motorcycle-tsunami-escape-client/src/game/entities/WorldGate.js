import * as THREE from 'three';
import { mulberry32 } from '../util/textures.js';
import { signSprite } from './Sign.js';

/**
 * The gate to another world, shaped and coloured after the reference screenshots: a ring of cracked purple stone
 * blocks around a glowing yellow portal, a green vine over the top, small leaf tufts growing straight out of the
 * stone around the doorway, two chunky block trees either side with small bushes at their feet, spiky grass,
 * blue-purple rocks and a patch of bare earth, under a green "WORLD 2 / Level 75 Required" sign.
 * The front is the local +z side; the origin is on the ground in the middle of the portal.
 */

const PORTAL = { halfWidth: 2.7, springY: 2.7, topY: 6.2 }; // opening: straight sides up to springY, then a half ellipse
const RING = 1.45; // thickness of the stone ring
const DEPTH = 1.5;

const PORTAL_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const PORTAL_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  float angle = atan(p.y, p.x);
  float rays = pow(max(0.0, sin(angle * 22.0 + uTime * 1.2 + sin(p.y * 14.0))), 12.0);
  float current = sin(length(p) * 48.0 - uTime * 2.4 + sin(angle * 5.0 + uTime) * 0.8) * 0.5 + 0.5;
  float shimmer = sin(vUv.x * 25.0 + vUv.y * 18.0 - uTime * 3.2) * 0.5 + 0.5;
  vec3 gold = vec3(1.0, 0.72, 0.015);
  vec3 bright = vec3(1.0, 0.96, 0.24);
  vec3 magic = vec3(1.0, 0.91, 0.12);
  vec3 color = mix(gold, bright, current * 0.42 + shimmer * 0.18);
  color += magic * rays * 0.28;
  gl_FragColor = vec4(color, 1.0);
}
`;

const DUST_VERTEX = /* glsl */ `
uniform float uTime;
attribute vec3 aOrigin;
attribute vec3 aDirection;
attribute vec3 aColor;
attribute float aPhase;
attribute float aSize;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float life = fract(uTime * 0.34 + aPhase);
  float travel = life * (0.8 + aSize * 4.0);
  vec3 p = aOrigin + aDirection * travel;
  p.z += life * 0.9;
  p.x += sin(uTime * 3.0 + aPhase * 15.0) * 0.10 * life;
  p.y += sin(uTime * 2.4 + aPhase * 11.0) * 0.12 * life + life * life * 0.25;
  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = aSize * 300.0 / max(1.0, -viewPosition.z);
  vColor = aColor;
  vAlpha = smoothstep(0.0, 0.12, life) * (1.0 - smoothstep(0.72, 1.0, life));
}
`;

const DUST_FRAGMENT = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  float d = length(p) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.24, d);
  float glow = 1.0 - smoothstep(0.0, 0.95, d);
  float crossRay = pow(max(0.0, 1.0 - abs(p.x) * 10.0), 5.0) + pow(max(0.0, 1.0 - abs(p.y) * 10.0), 5.0);
  float alpha = clamp(core * 0.9 + glow * 0.35 + crossRay * 0.5, 0.0, 1.0) * vAlpha;
  gl_FragColor = vec4(mix(vColor, vec3(1.0), core * 0.72), alpha);
}
`;

function addStoneCracks(block, width, height, depth, seed) {
  const rand = mulberry32(seed);
  const crackMaterial = new THREE.MeshBasicMaterial({ color: 0x362a52, toneMapped: false });
  const crackCount = 1 + Math.floor(rand() * 2);
  for (let crack = 0; crack < crackCount; crack += 1) {
    const x = (rand() - 0.5) * width * 0.52;
    const y = (rand() - 0.5) * height * 0.45;
    const reach = 0.25 + rand() * Math.min(width, height) * 0.42;
    const drift = (rand() - 0.5) * width * 0.3;
    const points = [
      new THREE.Vector3(x, y, depth / 2 + 0.022),
      new THREE.Vector3(x + drift * 0.35, y - reach * 0.25, depth / 2 + 0.022),
      new THREE.Vector3(x - drift * 0.2, y - reach * 0.55, depth / 2 + 0.022),
      new THREE.Vector3(x + drift, y - reach, depth / 2 + 0.022),
    ];
    const crackMesh = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 9, 0.018 + rand() * 0.012, 4, false),
      crackMaterial,
    );
    crackMesh.castShadow = false;
    block.add(crackMesh);

    // A short fork makes the fracture look like a split through old rock.
    const branchPoints = [
      points[2].clone(),
      new THREE.Vector3(points[2].x + (rand() - 0.5) * width * 0.28, points[2].y + reach * 0.15, depth / 2 + 0.022),
      new THREE.Vector3(points[2].x + (rand() - 0.5) * width * 0.4, points[2].y + reach * 0.34, depth / 2 + 0.022),
    ];
    const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(branchPoints), 6, 0.014, 4, false), crackMaterial);
    branch.castShadow = false;
    block.add(branch);
  }
}

function makePortalDust() {
  const count = 180;
  const geometry = new THREE.BufferGeometry();
  const origins = new Float32Array(count * 3);
  const directions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);
  const rand = mulberry32(8721);
  const ellipseHeight = PORTAL.topY - PORTAL.springY;
  for (let i = 0; i < count; i += 1) {
    const x = (rand() * 2 - 1) * PORTAL.halfWidth * 0.94;
    const archY = PORTAL.springY + Math.sqrt(Math.max(0, 1 - (x / PORTAL.halfWidth) ** 2)) * ellipseHeight;
    const y = 0.35 + rand() * Math.max(0.2, archY - 0.35);
    origins.set([x, y, 0.18], i * 3);
    const nx = x / (PORTAL.halfWidth * PORTAL.halfWidth);
    const ny = (y - PORTAL.springY) / (ellipseHeight * ellipseHeight);
    const length = Math.hypot(nx, ny) || 1;
    directions.set([nx / length, ny / length, (rand() - 0.4) * 0.7], i * 3);
    const color = rand() > 0.32 ? [1, 0.84 + rand() * 0.14, 0.25 + rand() * 0.3] : [0.55, 0.9 + rand() * 0.1, 1];
    colors.set(color, i * 3);
    phases[i] = rand();
    sizes[i] = 0.2 + rand() * 0.32;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aOrigin', new THREE.BufferAttribute(origins, 3));
  geometry.setAttribute('aDirection', new THREE.BufferAttribute(directions, 3));
  geometry.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = new THREE.ShaderMaterial({
    vertexShader: DUST_VERTEX,
    fragmentShader: DUST_FRAGMENT,
    uniforms: { uTime: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const dust = new THREE.Points(geometry, material);
  dust.frustumCulled = false;
  return dust;
}

/** Jagged dark crack lines scratched across a finished stone texture, like a chipped/broken block. */
const addCracks = (ctx, size, seed, count = 3) => {
  const rand = mulberry32(seed);
  ctx.save();
  ctx.strokeStyle = 'rgba(25,18,45,0.55)';
  ctx.lineWidth = Math.max(1.5, size * 0.014);
  ctx.lineCap = 'round';
  for (let c = 0; c < count; c += 1) {
    let x = rand() * size;
    let y = rand() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const segments = 3 + Math.floor(rand() * 3);
    for (let s = 0; s < segments; s += 1) {
      x += (rand() - 0.5) * size * 0.4;
      y += (rand() - 0.5) * size * 0.4;
      ctx.lineTo(x, y);
      // a short offshoot crack branching off the main one
      if (rand() > 0.5) {
        const bx = x + (rand() - 0.5) * size * 0.18;
        const by = y + (rand() - 0.5) * size * 0.18;
        ctx.moveTo(x, y);
        ctx.lineTo(bx, by);
        ctx.moveTo(x, y);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
};

/** Square studs, as on the reference's blocks: a grid of small raised squares with a light top edge, optionally cracked. */
const studTexture = ({ base, light, dark }, seed, studs = 3, cracked = false) => {
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
  if (cracked) addCracks(ctx, size, seed + 1000);
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
  // Cracked/chipped variants of the same stone, used on some ring and leg blocks for a broken stone-door look.
  const stoneCracked = new THREE.MeshStandardMaterial({ map: studTexture({ base: '#9d8fd6', light: '#b3a7e8', dark: '#7b6cb8' }, 78, 3, true), roughness: 0.78 });
  const stoneDarkCracked = new THREE.MeshStandardMaterial({ map: studTexture({ base: '#8577c4', light: '#9c8fdc', dark: '#6a5ca6' }, 79, 3, true), roughness: 0.82 });
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
      // The bottom block of each leg is chipped/cracked, like a stone door worn at the base.
      const width = RING + 0.1 - (i === 1 ? 0.25 : 0);
      const depth = DEPTH + (i === 1 ? -0.2 : 0);
      const mat = i === 0 ? (side === 1 ? stoneCracked : stoneDarkCracked) : i === 1 ? stoneDark : i === 2 ? stoneCracked : stone;
      const legBlock = cube([width, height, depth], mat, x + side * (i === 1 ? -0.05 : 0.05), height / 2 + i * (legHeight / 3), 0, [0, side * 0.03 * (i - 1), 0]);
      if (i !== 1) addStoneCracks(legBlock, width, height, depth, 30 + side * 5 + i);
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
    // A handful of the arch blocks are cracked/chipped, so the doorway itself reads as old broken stone.
    const cracked = i % 2 === 0 || i === 5;
    const blockMat = cracked ? (i % 2 ? stoneDarkCracked : stoneCracked) : i % 3 === 1 ? stoneDark : stone;
    const block = cube([length, thickness, DEPTH - (i % 2 ? 0.15 : 0)], blockMat, mid.x, mid.y, (rand() - 0.5) * 0.15, [0, 0, angle]);
    if (cracked) addStoneCracks(block, length, thickness, DEPTH - (i % 2 ? 0.15 : 0), 100 + i);
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

  // ---- small leaf tufts growing straight out of the stone, framing the doorway itself
  for (const t of [0.06, 0.16, 0.5, 0.84, 0.94]) {
    const p = arcPoint(t, RING + 0.12);
    const size = 0.35 + rand() * 0.25;
    cube(
      [size, size * (0.7 + rand() * 0.3), size],
      leaf[Math.floor(rand() * leaf.length)],
      p.x,
      p.y,
      DEPTH / 2 + 0.15 + (rand() - 0.5) * 0.1,
      [(rand() - 0.5) * 0.6, rand() * Math.PI, (rand() - 0.5) * 0.6],
    );
  }
  // A couple more tufts low down at the foot of each leg, where the stone meets the ground.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 2; i += 1) {
      const size = 0.4 + rand() * 0.3;
      cube(
        [size, size * (0.7 + rand() * 0.3), size],
        leaf[i % leaf.length],
        side * (PORTAL.halfWidth + RING + 0.25) + (rand() - 0.5) * 0.3,
        0.25 + i * 0.5 + rand() * 0.15,
        DEPTH / 2 + 0.2,
        [(rand() - 0.5) * 0.5, rand() * Math.PI, (rand() - 0.5) * 0.5],
      );
    }
  }

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
  const portalMaterial = new THREE.ShaderMaterial({
    vertexShader: PORTAL_VERTEX,
    fragmentShader: PORTAL_FRAGMENT,
    uniforms: { uTime: { value: 0 } },
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const portal = new THREE.Mesh(new THREE.ShapeGeometry(opening), portalMaterial);
  portal.position.z = 0.05;
  group.add(portal);
  const portalDust = makePortalDust();
  group.add(portalDust);
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

  // ---- small round bushes: no trunk, just a low cluster of leaf cubes, sat right by the doorway and the trees
  const bush = (x, z, scale, seed) => {
    const r = mulberry32(seed);
    const b = new THREE.Group();
    b.position.set(x, 0, z);
    b.scale.setScalar(scale);
    group.add(b);
    const count = 6;
    for (let i = 0; i < count; i += 1) {
      const size = 0.7 + r() * 0.5;
      const cx = (r() - 0.5) * 1.3;
      const cy = 0.3 + r() * 0.5;
      const cz = (r() - 0.5) * 1.1;
      const leafCube = new THREE.Mesh(new THREE.BoxGeometry(size, size * (0.7 + r() * 0.3), size), leaf[i % leaf.length]);
      leafCube.position.set(cx, cy, cz);
      leafCube.rotation.set((r() - 0.5) * 0.5, r() * Math.PI, (r() - 0.5) * 0.5);
      leafCube.castShadow = true;
      leafCube.receiveShadow = true;
      b.add(leafCube);
    }
    return b;
  };
  bush(-2.7, 1.9, 1, 21);
  bush(2.6, 1.7, 0.95, 22);
  bush(-4.7, 1.1, 0.85, 23);
  bush(4.6, 0.9, 0.8, 24);

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

  // ---- sign: solid yellow-green letters with a dark outline, held well clear of the arch and the tree canopies
  const yellowGreen = '#c8e81e';
  const titleSprite = signSprite(title, { fontSize: 2.0, color: yellowGreen, strokeColor: '#08260d', strokeEm: 0.2, width: 13, height: 3.6 });
  titleSprite.position.set(0, 12, 0.5);
  const subtitleSprite = signSprite(subtitle, { fontSize: 1.0, color: yellowGreen, strokeColor: '#08260d', strokeEm: 0.22, width: 13, height: 2.2 });
  subtitleSprite.position.set(0, 9.6, 0.5);
  group.add(titleSprite, subtitleSprite);

  const update = (time) => {
    portalMaterial.uniforms.uTime.value = time;
    portalDust.material.uniforms.uTime.value = time;
    glow.intensity = 14 + Math.sin(time * 2.2) * 2;
  };

  return {
    group,
    update,
    /** Footprints of the two trees (world offsets are added by the caller); the portal itself stays open. */
    halfSize: { treeX: 5.4, treeHalf: 0.9, height: 6 },
  };
}
