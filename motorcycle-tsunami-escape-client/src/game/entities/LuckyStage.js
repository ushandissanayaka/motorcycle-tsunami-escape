import * as THREE from 'three';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';

/**
 * The Lucky Blocks stage: a wide studded platform with shallow steps and a
 * paved path up the middle, backed by the canyon wall. Four winged lucky
 * blocks hover above it. The stage faces +Z (toward riders coming up the
 * corridor); `solids` let riders drive up the steps.
 */

const STAGE_COLORS = {
  stage: { base: '#6f6d8a', light: '#8c89aa', dark: '#55536e' },
  edge: 0x9a96cc,
};

const BLOCKS = [
  { name: 'Epic Lucky Block', rarity: 'Epic', rarityColor: '#c74bff', price: '11k', color: 0x8b3fe0, dark: '#5a22a8', light: '#b57cff', wing: '#a46bff', wingTip: '#d2adff' },
  { name: 'Rare Lucky Block', rarity: 'Rare', rarityColor: '#4db8ff', price: '3.2k', color: 0x62c7ff, dark: '#2f86c4', light: '#a6e4ff', wing: '#7fd6ff', wingTip: '#c9f0ff' },
  { name: 'Common Lucky Block', rarity: 'Common', rarityColor: '#4dff9b', price: '220', color: 0x2fd66a, dark: '#178f45', light: '#7dffaa', wing: '#43e07d', wingTip: '#9dffc0' },
  { name: 'Divine Lucky Block', rarity: 'Divine', rarityColor: '#ff5f8f', price: '169', color: 0xff4f8a, dark: '#b52458', light: '#ff9fbe', wing: '#ff6b9c', wingTip: '#ffc0d6', coin: true, tag: 'OP!' },
];

const BLOCK_SIZE = 2.2;

const outlined = (ctx, text, x, y, font, fill, stroke = '#0e1220', lineWidth = 12) => {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y, 480);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, 480);
};

/** Block face: two "?" eyes and a zigzag mouth on a bevelled panel. */
function faceTexture({ color, dark, light }) {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const base = `#${new THREE.Color(color).getHexString()}`;
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = base;
  ctx.fillRect(12, 12, size - 24, size - 24);
  ctx.fillStyle = light;
  ctx.globalAlpha = 0.35;
  ctx.fillRect(12, 12, size - 24, 22);
  ctx.globalAlpha = 1;

  for (const x of [52, 148]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, 62, 56, 64, 8);
    ctx.fill();
    ctx.fillStyle = dark;
    ctx.font = '900 54px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('?', x + 28, 96);
  }
  // Zigzag mouth.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 12;
  ctx.lineJoin = 'miter';
  ctx.beginPath();
  ctx.moveTo(52, 176);
  for (let i = 0; i <= 6; i += 1) ctx.lineTo(52 + i * 25.3, i % 2 ? 176 : 208);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Right wing with its root at the left edge; the left wing mirrors it. */
function wingTexture({ wing, wingTip, dark }) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  const feathers = 7;
  for (let layer = 0; layer < 2; layer += 1) {
    for (let i = 0; i < feathers; i += 1) {
      const t = i / (feathers - 1);
      const angle = -0.75 + t * 1.25; // fans from up-and-out to down-and-out
      const length = (layer ? 175 : 235) - Math.abs(t - 0.35) * 60;
      const width = layer ? 30 : 36;
      ctx.save();
      ctx.translate(16, 70);
      ctx.rotate(angle);
      const gradient = ctx.createLinearGradient(0, 0, length, 0);
      gradient.addColorStop(0, layer ? dark : wing);
      gradient.addColorStop(1, layer ? wing : wingTip);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(0, -width * 0.4);
      ctx.quadraticCurveTo(length * 0.6, -width, length, 0);
      ctx.quadraticCurveTo(length * 0.6, width, 0, width * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drawTrophy(ctx, cx, cy, s) {
  ctx.fillStyle = '#ffb81f';
  ctx.strokeStyle = '#0e1220';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.5, cy - s * 0.5);
  ctx.quadraticCurveTo(cx + s * 0.5, cy + s * 0.25, cx, cy + s * 0.3);
  ctx.quadraticCurveTo(cx - s * 0.5, cy + s * 0.25, cx - s * 0.5, cy - s * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.fillRect(cx - s * 0.08, cy + s * 0.3, s * 0.16, s * 0.2);
  ctx.strokeRect(cx - s * 0.08, cy + s * 0.3, s * 0.16, s * 0.2);
  ctx.fillRect(cx - s * 0.3, cy + s * 0.5, s * 0.6, s * 0.14);
  ctx.strokeRect(cx - s * 0.3, cy + s * 0.5, s * 0.6, s * 0.14);
}

function drawCoin(ctx, cx, cy, s) {
  ctx.fillStyle = '#8dff5a';
  ctx.strokeStyle = '#0e1220';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.1, s * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#2f8f1a';
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.1, s * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

/** Name, rarity and price plate above a block. */
function labelSprite({ name, rarity, rarityColor, price, coin, tag }) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  if (tag) outlined(ctx, tag, 256, 30, '900 44px "Arial Black", Arial, sans-serif', '#ff5f8f', '#0e1220', 10);
  outlined(ctx, name, 256, 88, '900 54px "Arial Black", Arial, sans-serif', '#ffffff');
  outlined(ctx, rarity, 256, 156, '900 40px "Arial Black", Arial, sans-serif', rarityColor, '#0e1220', 10);
  if (coin) drawCoin(ctx, 200, 226, 56);
  else drawTrophy(ctx, 196, 222, 50);
  ctx.font = '900 56px "Arial Black", Arial, sans-serif';
  const width = ctx.measureText(price).width;
  outlined(ctx, price, 236 + 30 + width / 2, 228, '900 56px "Arial Black", Arial, sans-serif', coin ? '#b6ff7a' : '#ffe9a0', '#0e1220', 10);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(6, 3.5, 1);
  return sprite;
}

function createBlock(def) {
  const holder = new THREE.Group();
  const cube = new THREE.Group();
  holder.add(cube);

  const plain = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.25, roughness: 0.5 });
  const face = new THREE.MeshStandardMaterial({ map: faceTexture(def), emissive: 0xffffff, emissiveMap: faceTexture(def), emissiveIntensity: 0.3, roughness: 0.5 });
  // Box face order: +x, -x, +y, -y, +z (front), -z.
  const body = new THREE.Mesh(new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE), [plain, plain, plain, plain, face, plain]);
  body.castShadow = true;
  cube.add(body);

  const wingMaterial = new THREE.MeshBasicMaterial({ map: wingTexture(def), transparent: true, alphaTest: 0.2, side: THREE.DoubleSide });
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * BLOCK_SIZE * 0.5, 0, -0.1);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), wingMaterial);
    plane.position.x = side * 1.5;
    plane.scale.x = side; // mirror the left wing
    pivot.add(plane);
    cube.add(pivot);
    return { pivot, side };
  });

  const label = labelSprite(def);
  label.position.y = BLOCK_SIZE * 0.5 + 2.3;
  holder.add(label);
  return { holder, cube, wings };
}

/**
 * Builds the stage with its back edge at world `zBack` and its steps at
 * `zFront`; it faces from back to front (so `zBack > zFront` makes it face
 * north, toward -Z). `width` is centred on `centerX`.
 */
export function createLuckyStage({ centerX, width, zBack, zFront, height = 1, steps = 3, stepDepth = 1.3 }) {
  const direction = Math.sign(zFront - zBack) || 1;
  const depth = Math.abs(zFront - zBack);
  const inner = new THREE.Group(); // built facing +Z with its back edge at z = 0
  const group = new THREE.Group();
  group.position.set(centerX, 0, zBack);
  group.rotation.y = direction > 0 ? 0 : Math.PI;
  group.add(inner);

  const stage = new THREE.MeshStandardMaterial({ map: makeStudTexture(STAGE_COLORS.stage, 51), roughness: 0.85, emissive: 0x5a5878, emissiveIntensity: 0.25 });
  const edge = new THREE.MeshStandardMaterial({ color: STAGE_COLORS.edge, roughness: 0.6, emissive: STAGE_COLORS.edge, emissiveIntensity: 0.2 });
  const path = new THREE.MeshStandardMaterial({ map: makePaverTexture(PALETTES.plaza, 52, 1, 8, 7), roughness: 0.85 });
  const solids = [];
  const pathWidth = 6;
  const riser = height / (steps + 1);

  const tier = (lzBack, lzFront, top) => {
    const tierDepth = lzFront - lzBack;
    const midZ = (lzBack + lzFront) / 2;
    const block = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(width, top, tierDepth), 6), stage);
    block.position.set(0, top / 2, midZ);
    block.castShadow = true;
    block.receiveShadow = true;
    inner.add(block);
    // Light lavender lip along the front-top edge and a paved strip up the middle.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.22), edge);
    lip.position.set(0, top + 0.02, lzFront - 0.11);
    inner.add(lip);
    const strip = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(pathWidth, 0.06, tierDepth), 4.8), path);
    strip.position.set(0, top + 0.03, midZ);
    strip.receiveShadow = true;
    inner.add(strip);

    const worldZ = [zBack + direction * lzBack, zBack + direction * lzFront];
    solids.push({
      minX: centerX - width / 2,
      maxX: centerX + width / 2,
      minZ: Math.min(...worldZ),
      maxZ: Math.max(...worldZ),
      bottom: 0,
      top: top + 0.06,
    });
  };

  // Steps descend toward the front: the last one is the lowest.
  const platformFront = depth - steps * stepDepth;
  tier(0, platformFront, height);
  for (let i = 0; i < steps; i += 1) {
    const back = platformFront + i * stepDepth;
    tier(back, back + stepDepth, height - riser * (i + 1));
  }

  // Blocks hover above the platform, facing the riders.
  const spacing = 8;
  const blockZ = platformFront - 3.5;
  const blocks = BLOCKS.map((def, i) => {
    const block = createBlock(def);
    block.holder.position.set((i - (BLOCKS.length - 1) / 2) * spacing, height + 4.6, blockZ);
    inner.add(block.holder);
    return { ...block, phase: i * 1.1 };
  });

  const update = (time) => {
    for (const { cube, wings, phase } of blocks) {
      cube.position.y = Math.sin(time * 1.6 + phase) * 0.3;
      cube.rotation.y = Math.sin(time * 0.9 + phase) * 0.14;
      const flap = Math.sin(time * 4 + phase) * 0.22;
      for (const { pivot, side } of wings) pivot.rotation.set(0, side * 0.5, side * flap);
    }
  };

  return { group, solids, update };
}
