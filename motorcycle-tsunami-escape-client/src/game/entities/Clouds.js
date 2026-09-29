import * as THREE from 'three';
import { MAP_LAYOUT } from '../../shared/constants.js';

/**
 * Soft painted clouds floating around and below the map, so it reads as an island in the sky: wide cumulus
 * banks, tall towers, round puffs and swept, flame-like streaks, white on top with pale-blue shade underneath
 * (after the reference art). They are cheap sprites in a field that wraps around the camera, so there are always
 * clouds in view and they slide past with real parallax when the camera moves or zooms out. None sit over the
 * map itself.
 */

const COUNT = 90;
const FIELD = 800; // the field repeats every FIELD units in x and z, centred on the camera
const FADE = { from: FIELD * 0.3, to: FIELD * 0.47 }; // fade out toward the wrap edge so clouds never pop
const SHADE = '#b7d5f1';
const MID = '#dcecf9';
const WHITE = '#ffffff';

/** Stable pseudo-random numbers, so the sky looks the same every visit. */
function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Round billows ({ x, y, r } in canvas pixels) for each kind of cloud, sitting on a flat base. */
const SHAPES = {
  bank(rand, w, h) {
    const base = h * 0.8;
    const puffs = [];
    for (let i = 0; i < 9; i += 1) {
      const t = 0.12 + (0.76 * i) / 8;
      const bell = Math.sin(Math.PI * t);
      const r = h * (0.15 + 0.17 * bell) * (0.85 + rand() * 0.3);
      puffs.push({ x: w * t, y: base - r * 0.55, r });
    }
    for (let i = 0; i < 4; i += 1) {
      const t = 0.3 + 0.4 * rand();
      const r = h * (0.24 + 0.1 * rand());
      puffs.push({ x: w * t, y: base - h * 0.3 - r * 0.4, r });
    }
    return { puffs, base };
  },
  tower(rand, w, h) {
    const base = h * 0.9;
    const lean = (rand() - 0.5) * w * 0.12;
    const puffs = [];
    for (let i = 0; i < 8; i += 1) {
      const r = w * (0.26 - i * 0.017) * (0.9 + rand() * 0.2);
      puffs.push({ x: w / 2 + lean * i * 0.3 + Math.sin(i * 1.7) * w * 0.08, y: base - r * 0.5 - i * h * 0.095, r });
    }
    for (const side of [-1, 1]) puffs.push({ x: w / 2 + side * w * 0.28, y: base - h * 0.1, r: w * 0.17 });
    return { puffs, base };
  },
  puff(rand, w, h) {
    const base = h * 0.78;
    const puffs = [];
    for (let i = 0; i < 5; i += 1) {
      const t = 0.22 + (0.56 * i) / 4;
      const r = h * (0.16 + 0.12 * Math.sin(Math.PI * t)) * (0.85 + rand() * 0.3);
      puffs.push({ x: w * t, y: base - r * 0.55, r });
    }
    puffs.push({ x: w * (0.42 + rand() * 0.16), y: base - h * 0.36, r: h * 0.22 });
    return { puffs, base };
  },
  // A swept flame: a broad stroke that thins to a curling tip, with smaller strokes branching off its side,
  // like the big brush-stroke clouds.
  wisp(rand, w, h) {
    const base = h * 0.95;
    const puffs = [];
    const stroke = (p0, p1, p2, r0, steps) => {
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        const u = 1 - t;
        puffs.push({
          x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
          y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
          r: r0 * u ** 0.85 + w * 0.01,
        });
      }
    };
    stroke({ x: w * 0.3, y: h * 0.78 }, { x: w * (0.4 + rand() * 0.08), y: h * 0.3 }, { x: w * 0.9, y: h * 0.08 }, w * 0.13, 44);
    for (let k = 0; k < 2; k += 1) {
      const sx = w * (0.34 + k * 0.08);
      const sy = h * (0.55 - k * 0.14);
      stroke({ x: sx, y: sy }, { x: sx - w * 0.04, y: sy - h * 0.2 }, { x: sx + w * (0.14 + rand() * 0.1), y: Math.max(h * 0.08, sy - h * (0.3 + rand() * 0.06)) }, w * 0.07, 24);
    }
    return { puffs, base };
  },
};

const CANVAS_SIZE = { bank: [512, 256], tower: [256, 448], puff: [320, 224], wisp: [448, 448] };

/** Paints one cloud, billow by billow, in the reference's white-and-pale-blue cel style. */
function paintCloud(kind, rand) {
  const [w, h] = CANVAS_SIZE[kind];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  const { puffs, base } = SHAPES[kind](rand, w, h);
  // Painted as whole shapes (no seams between billows): a pale-blue body, then a lighter and a white layer nudged
  // toward the light (up and to the right), each kept inside the body.
  ctx.filter = 'blur(1.5px)';
  const layer = (color, lift, shrink, shiftX, list = puffs) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const { x, y, r } of list) {
      ctx.moveTo(x + r * shiftX + r * shrink, y - r * lift);
      ctx.arc(x + r * shiftX, y - r * lift, r * shrink, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  layer(SHADE, 0, 1, 0);
  ctx.globalCompositeOperation = 'source-atop';
  layer(MID, 0.1, 0.9, 0.06);
  layer(WHITE, 0.22, 0.74, 0.14);
  // A few big billows at the front overlap the ones behind, each with a blue fold along its edge.
  if (kind !== 'wisp') {
    const front = [...puffs].sort((a, b) => b.r - a.r).slice(0, 3).sort((a, b) => a.y - b.y);
    for (const puff of front) {
      layer(SHADE, -0.02, 1, -0.03, [puff]);
      layer(MID, 0.1, 0.9, 0.06, [puff]);
      layer(WHITE, 0.22, 0.74, 0.14, [puff]);
    }
  }
  ctx.filter = 'none';
  // The underside of the whole cloud sits in shade.
  const under = ctx.createLinearGradient(0, base - h * 0.4, 0, base);
  under.addColorStop(0, 'rgba(183,213,241,0)');
  under.addColorStop(1, 'rgba(165,203,238,0.55)');
  ctx.fillStyle = under;
  ctx.fillRect(0, 0, w, h);
  // Flat, softly fading base.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, base - h * 0.14, 0, base + h * 0.04);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { texture, aspect: h / w };
}

/** True when a cloud at (x, z) with this clearance would sit over (or in) the map. */
function overMap(x, z, clearance) {
  const { room, corridor } = MAP_LAYOUT;
  const inRoom = x > -room.west - clearance && x < room.east + clearance && z > room.north - clearance && z < room.south + clearance;
  const inCorridor = Math.abs(x) < corridor.halfWidth + clearance && z < room.north; // the corridor runs on north without end
  return inRoom || inCorridor;
}

const wrap = (value) => value - FIELD * Math.floor(value / FIELD + 0.5);

export function createClouds() {
  const rand = mulberry32(4711);
  const kinds = ['bank', 'bank', 'bank', 'tower', 'tower', 'puff', 'puff', 'wisp', 'wisp'];
  const looks = kinds.map((kind) => ({ kind, ...paintCloud(kind, rand) }));
  const group = new THREE.Group();

  const clouds = Array.from({ length: COUNT }, (_, i) => {
    const look = looks[i % looks.length];
    const high = rand() < 0.3; // a few float up level with the riders, out beyond the canyon
    const size = (look.kind === 'puff' ? 55 : look.kind === 'tower' ? 80 : 120) * (0.7 + rand() * 0.7) * (high ? 1.3 : 1);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: look.texture, transparent: true, depthWrite: false, fog: false }));
    sprite.scale.set(size, size * look.aspect, 1);
    group.add(sprite);
    return {
      sprite,
      x: rand() * FIELD,
      z: rand() * FIELD,
      y: high ? 5 + rand() * 45 : -70 + rand() * 55,
      clearance: (high ? 110 : 30) + size / 2,
    };
  });

  /** Keeps the field centred on the camera and fades clouds near its edge. */
  const update = (camera) => {
    const { x: cx, z: cz } = camera.position;
    for (const cloud of clouds) {
      const x = cx + wrap(cloud.x - cx);
      const z = cz + wrap(cloud.z - cz);
      const hidden = overMap(x, z, cloud.clearance);
      cloud.sprite.visible = !hidden;
      if (hidden) continue;
      cloud.sprite.position.set(x, cloud.y, z);
      const distance = Math.hypot(x - cx, z - cz);
      cloud.sprite.material.opacity = 1 - THREE.MathUtils.smoothstep(distance, FADE.from, FADE.to);
    }
  };

  return { group, update };
}
