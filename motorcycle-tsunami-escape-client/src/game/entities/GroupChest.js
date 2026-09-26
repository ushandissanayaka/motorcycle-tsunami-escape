import * as THREE from 'three';
import { applyWorldUV } from '../util/textures.js';
import { signSprite } from './Sign.js';

/**
 * The "Group Chest - Free Rewards!" chest, shaped after the reference screenshot: a big gold studded box whose
 * top steps up in three stages toward the middle, with a thick gold frame around dark-red curtain openings on the
 * long faces and the ends. Yellow light streams up from its base. The front (long face) is the local +z side.
 */

const WIDTH = 9.0; // long face
const DEPTH = 4.4; // the ends
const BASE = 0.35; // gold plinth under the openings
const FRAME = 0.62; // thickness of the gold frame
const RIM = 0.22; // how far the frame's inner lip stands proud of the face
// Top outline of a long face: [distance from the middle as a fraction of half the width, height], middle outward.
const STEPS = [
  [0.34, 4.35],
  [0.56, 4.0],
  [0.78, 3.65],
  [1.0, 3.3],
];

/** Gold studs: each stud is a square with a light strip on top and dark lines on the sides. */
function studTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f2a406';
  ctx.fillRect(0, 0, size, size);
  const cell = size / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = col * cell;
      const y = row * cell;
      ctx.fillStyle = '#d98a04';
      ctx.fillRect(x + 6, y + 8, cell - 10, cell - 12);
      ctx.fillStyle = '#ffb90e';
      ctx.fillRect(x + 8, y + 10, cell - 14, cell - 16);
      ctx.fillStyle = '#ffdc2a';
      ctx.fillRect(x + 8, y + 10, cell - 14, 4);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Dark red curtain with orange-yellow streaks of light rising from the bottom. */
function curtainTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, '#8c0f18');
  gradient.addColorStop(0.65, '#9b1218');
  gradient.addColorStop(1, '#b9261a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 46; i += 1) {
    const x = (i * 59) % 256;
    const top = 60 + ((i * 37) % 90);
    const streak = ctx.createLinearGradient(0, top, 0, 256);
    streak.addColorStop(0, 'rgba(255,170,40,0)');
    streak.addColorStop(1, `rgba(255,190,60,${0.4 + ((i * 13) % 6) * 0.1})`);
    ctx.fillStyle = streak;
    ctx.fillRect(x, top, 2 + (i % 3) * 2, 256 - top);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Soft yellow pool of light. */
function poolTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,255,120,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,106,0.85)');
  gradient.addColorStop(1, 'rgba(255,255,106,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Streaks of light: thin vertical lines with soft-ended pulses along them. The texture tiles vertically, so scrolling it
 * upward makes the pulses stream up.
 */
function streaksTexture(seed) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  let state = seed;
  const random = () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
  for (let i = 0; i < 54; i += 1) {
    const x = Math.floor(random() * 250);
    const width = 2 + Math.floor(random() * 4);
    const length = 70 + random() * 110;
    const top = random() * 256;
    for (const shift of [0, -256, 256]) {
      const gradient = ctx.createLinearGradient(0, top + shift, 0, top + shift + length);
      gradient.addColorStop(0, 'rgba(255,245,140,0)');
      gradient.addColorStop(0.35, 'rgba(255,248,150,0.95)');
      gradient.addColorStop(1, 'rgba(255,235,90,0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x, top + shift, width, length);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

/** Fades the streaks out toward the top and the sides (the green channel is the alpha). */
function fadeTexture() {
  const width = 64;
  const height = 128;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const up = 1 - y / (height - 1); // 1 at the bottom of the plane, 0 at the top
    const vertical = Math.pow(up, 0.8);
    for (let x = 0; x < width; x += 1) {
      const across = 1 - Math.abs((x / (width - 1)) * 2 - 1);
      const value = Math.round(255 * vertical * Math.min(1, across * 3.2));
      const i = (y * width + x) * 4;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  return new THREE.CanvasTexture(canvas);
}

/**
 * Outline of a long face (x along the width, y up), shrunk inward by `inset`: the outer edges move in, the
 * risers of the steps move toward the middle, and the tops come down.
 */
function faceOutline(inset, bottom) {
  const half = WIDTH / 2;
  // Right half, counter-clockwise: up the outside edge, then inward along the tops of the steps.
  const points = [];
  points.push([half - inset, bottom]);
  points.push([half - inset, STEPS[STEPS.length - 1][1] - inset]);
  for (let i = STEPS.length - 1; i >= 1; i -= 1) {
    const riser = half * STEPS[i - 1][0] - inset; // riser between step i-1 (higher) and step i (lower), moved inward
    points.push([riser, STEPS[i][1] - inset]);
    points.push([riser, STEPS[i - 1][1] - inset]);
  }
  points.push([0, STEPS[0][1] - inset]);
  const mirrored = points.slice(0, -1).reverse().map(([x, y]) => [-x, y]);
  return [...points.slice(0, -1), [0, STEPS[0][1] - inset], ...mirrored];
}

const shapeOf = (points) => new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));

export function createGroupChest() {
  const group = new THREE.Group();
  const gold = new THREE.MeshStandardMaterial({ map: studTexture(), roughness: 0.55, emissive: 0xffa800, emissiveIntensity: 0.3 });
  const curtain = new THREE.MeshStandardMaterial({ map: curtainTexture(), emissive: 0xffffff, emissiveMap: curtainTexture(), emissiveIntensity: 0.85, roughness: 0.9 });
  const cast = (mesh) => {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // The gold body: the stepped outline extruded through the depth.
  const outline = faceOutline(0, 0);
  const bodyGeometry = new THREE.ExtrudeGeometry(shapeOf(outline), { depth: DEPTH, bevelEnabled: false });
  bodyGeometry.translate(0, 0, -DEPTH / 2);
  cast(new THREE.Mesh(applyWorldUV(bodyGeometry, 1.7), gold));

  // Curtain openings with a raised gold lip. Long faces follow the stepped outline; the ends are plain rectangles.
  const openingOutline = faceOutline(FRAME, BASE);
  const lipOutline = faceOutline(FRAME - RIM, BASE - RIM);
  const lipShape = shapeOf(lipOutline);
  lipShape.holes.push(new THREE.Path(openingOutline.map(([x, y]) => new THREE.Vector2(x, y))));
  const lipGeometry = new THREE.ExtrudeGeometry(lipShape, { depth: RIM, bevelEnabled: false });
  const openingGeometry = new THREE.ShapeGeometry(shapeOf(openingOutline));
  for (const side of [-1, 1]) {
    const face = new THREE.Group();
    face.add(new THREE.Mesh(applyWorldUV(lipGeometry.clone(), 1.7), gold));
    const opening = new THREE.Mesh(openingGeometry, curtain);
    opening.position.z = 0.03;
    face.add(opening);
    face.position.z = side * (DEPTH / 2);
    if (side < 0) face.rotation.y = Math.PI;
    group.add(face);
  }

  const edgeHeight = STEPS[STEPS.length - 1][1];
  const endWidth = DEPTH - FRAME * 2;
  const endHeight = edgeHeight - FRAME - BASE;
  for (const side of [-1, 1]) {
    const end = new THREE.Group();
    const lip = new THREE.Shape([new THREE.Vector2(-endWidth / 2 - RIM, -RIM), new THREE.Vector2(endWidth / 2 + RIM, -RIM), new THREE.Vector2(endWidth / 2 + RIM, endHeight + RIM), new THREE.Vector2(-endWidth / 2 - RIM, endHeight + RIM)]);
    lip.holes.push(new THREE.Path([new THREE.Vector2(-endWidth / 2, 0), new THREE.Vector2(endWidth / 2, 0), new THREE.Vector2(endWidth / 2, endHeight), new THREE.Vector2(-endWidth / 2, endHeight)]));
    end.add(new THREE.Mesh(applyWorldUV(new THREE.ExtrudeGeometry(lip, { depth: RIM, bevelEnabled: false }), 1.7), gold));
    const opening = new THREE.Mesh(new THREE.PlaneGeometry(endWidth, endHeight), curtain);
    opening.position.set(0, endHeight / 2, 0.03);
    end.add(opening);
    end.position.set(side * (WIDTH / 2), BASE, 0);
    end.rotation.y = side * Math.PI / 2;
    group.add(end);
  }

  // Light: a wide yellow pool on the ground, and tall streaks of light that rise from the base on every side.
  const pool = new THREE.Mesh(
    new THREE.PlaneGeometry(WIDTH * 1.9, DEPTH * 2.4),
    new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  );
  pool.rotation.x = -Math.PI / 2;
  pool.position.y = 0.06;
  group.add(pool);

  // Two sets of streaks that scroll upward at different speeds, so the light seems to pour up around the chest.
  const fade = fadeTexture();
  const streakSets = [streaksTexture(7), streaksTexture(19)].map((map, i) => ({
    map,
    speed: 0.32 + i * 0.17,
    material: new THREE.MeshBasicMaterial({ map, alphaMap: fade, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
  }));
  const ray = (width, x, z, turn, height, set) => {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), streakSets[set].material);
    plane.position.set(x, height / 2, z);
    plane.rotation.y = turn;
    group.add(plane);
  };
  for (const side of [-1, 1]) {
    ray(DEPTH * 1.6, side * (WIDTH / 2 + 0.3), 0, Math.PI / 2, 6.2, 0); // beside each end
    ray(DEPTH * 1.6, side * (WIDTH / 2 + 0.9), 0, Math.PI / 2, 5.4, 1);
    ray(WIDTH * 1.1, 0, side * (DEPTH / 2 + 0.3), 0, 5.0, 1); // in front of each long face
    ray(WIDTH * 1.1, 0, side * (DEPTH / 2 + 0.9), 0, 4.2, 0);
  }

  const light = new THREE.PointLight(0xffd23a, 9, 14, 1.6);
  light.position.set(0, 2.2, DEPTH / 2 + 2.5);
  group.add(light);

  // Title and subtitle floating above it (camera-facing, so they never turn away with the chest).
  const title = signSprite('Group Chest', { fontSize: 1.55, color: ['#ffe23a', '#ffb000'], strokeColor: '#5a2d00', strokeEm: 0.2, width: 11.6, height: 3 });
  title.position.set(0, STEPS[0][1] + 3.0, 0);
  const subtitle = signSprite('Free Rewards!', { fontSize: 0.98, color: '#ffffff', strokeColor: '#141a26', strokeEm: 0.2, width: 8.4, height: 1.8 });
  subtitle.position.set(0, STEPS[0][1] + 1.55, 0);
  group.add(title, subtitle);

  const update = (time) => {
    pool.material.opacity = 0.9 + Math.sin(time * 2.4) * 0.06;
    for (const set of streakSets) {
      set.map.offset.y = -time * set.speed; // decreasing offset moves the streaks up
      set.material.opacity = 0.78 + Math.sin(time * 3.1 + set.speed * 9) * 0.1;
    }
    light.intensity = 9 + Math.sin(time * 2.4) * 1.5;
  };

  return {
    group,
    update,
    /** Footprint riders bump into (the light is not solid). */
    halfSize: { x: WIDTH / 2, z: DEPTH / 2, height: STEPS[0][1] },
  };
}
