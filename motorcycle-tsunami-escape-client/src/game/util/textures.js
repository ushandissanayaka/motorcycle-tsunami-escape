import * as THREE from 'three';

/** Colour palettes sampled from the reference screenshots. */
export const PALETTES = {
  grass: { base: '#8ad650', light: '#a8ea68', dark: '#66b63c' },
  asphalt: { base: '#565664', light: '#676778', dark: '#44444f' },
  buildingBlue: { base: '#3159cf', light: '#5a83f0', dark: '#2340a3' },
  interiorBlue: { base: '#4650a8', light: '#6470c8', dark: '#343d86' },
  paver: { a: '#bdb6d8', b: '#aea6cc', seam: '#8f87ae' },
  plaza: { a: '#aaa7ba', b: '#a4a1b5', seam: '#6f6b88' },
  roof: { a: '#dcd8ec', b: '#cdc8e2', seam: '#aaa4c4' },
};

export function mulberry32(seed) {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function finish(canvas) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Tileable grid of round studs, each with a light top-left and dark rim. */
export function makeStudTexture({ base, light, dark }, seed = 1, studs = 16) {
  const rand = mulberry32(seed);
  const size = 256;
  const cell = size / studs;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  const baseColor = new THREE.Color(base);
  for (let row = 0; row < studs; row += 1) {
    for (let col = 0; col < studs; col += 1) {
      const tint = baseColor.clone().multiplyScalar(0.93 + rand() * 0.14);
      const x = col * cell;
      const y = row * cell;

      ctx.fillStyle = dark;
      ctx.fillRect(x, y, cell, cell);

      const gradient = ctx.createRadialGradient(x + cell * 0.4, y + cell * 0.38, cell * 0.05, x + cell / 2, y + cell / 2, cell * 0.42);
      gradient.addColorStop(0, light);
      gradient.addColorStop(0.55, `#${tint.getHexString()}`);
      gradient.addColorStop(1, dark);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x + cell / 2, y + cell / 2, cell * 0.42, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return finish(canvas);
}

/**
 * Paving slabs with seams and small studs. `slabs` is slabs per side of the
 * tile, `studs` is studs per side of each slab.
 */
export function makePaverTexture({ a, b, seam }, seed = 1, slabs = 4, studs = 2, seamWidth = 3) {
  const rand = mulberry32(seed);
  const size = 256;
  const cell = size / slabs;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pitch = cell / studs;

  for (let row = 0; row < slabs; row += 1) {
    for (let col = 0; col < slabs; col += 1) {
      const color = new THREE.Color((row + col) % 2 ? b : a).multiplyScalar(0.97 + rand() * 0.06);
      ctx.fillStyle = `#${color.getHexString()}`;
      ctx.fillRect(col * cell, row * cell, cell, cell);

      for (let sx = 0; sx < studs; sx += 1) {
        for (let sy = 0; sy < studs; sy += 1) {
          const cx = col * cell + pitch * (sx + 0.5);
          const cy = row * cell + pitch * (sy + 0.5);
          ctx.fillStyle = 'rgba(0,0,0,0.10)';
          ctx.beginPath();
          ctx.arc(cx + pitch * 0.06, cy + pitch * 0.08, pitch * 0.32, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.16)';
          ctx.beginPath();
          ctx.arc(cx, cy, pitch * 0.32, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
  ctx.strokeStyle = seam;
  ctx.lineWidth = seamWidth;
  for (let i = 0; i <= slabs; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, size);
    ctx.moveTo(0, i * cell); ctx.lineTo(size, i * cell);
    ctx.stroke();
  }
  return finish(canvas);
}

/** Rewrites a geometry's UVs to world units / `tile` so texel size is constant on any box. */
export function applyWorldUV(geometry, tile) {
  const pos = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < pos.count; i += 1) {
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
    else if (ax >= az) uv.setXY(i, pos.getZ(i) / tile, pos.getY(i) / tile);
    else uv.setXY(i, pos.getX(i) / tile, pos.getY(i) / tile);
  }
  return geometry;
}
