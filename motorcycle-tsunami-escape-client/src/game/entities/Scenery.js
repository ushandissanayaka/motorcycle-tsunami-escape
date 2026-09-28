import * as THREE from 'three';
import { createStoreBike } from './StoreBikes.js';

/** Decorative set pieces around the starting place. */

/** Small hexagonal gem icon (like the in-game currency icon), centred at (cx, cy). */
function drawHexGem(ctx, cx, cy, size, fill, edge) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    const px = cx + Math.cos(a) * (size / 2);
    const py = cy + Math.sin(a) * (size / 2);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.strokeStyle = edge;
  ctx.lineWidth = 4;
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx, cy - size / 2 + 4);
  ctx.lineTo(cx, cy + size / 2 - 4);
  ctx.stroke();
  ctx.restore();
}

/**
 * Stacked lines of big outlined text. A line with `icon` (e.g. a price) draws a small hex gem
 * immediately before the text instead of centering the text alone.
 */
function textSprite(lines, width, height, scaleX, scaleY) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const setFill = (fill, y, font) => {
    if (!Array.isArray(fill)) {
      ctx.fillStyle = fill;
      return;
    }
    const fontSize = Number.parseFloat(font.match(/\d+(?:\.\d+)?px/)?.[0]) || 40;
    const gradient = ctx.createLinearGradient(0, y - fontSize * 0.55, 0, y + fontSize * 0.55);
    gradient.addColorStop(0, fill[0]);
    gradient.addColorStop(1, fill[1]);
    ctx.fillStyle = gradient;
  };
  for (const { text, y, font, fill, stroke = '#0e1220', lineWidth = 10, icon } of lines) {
    ctx.font = font;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    if (icon) {
      const textWidth = ctx.measureText(text).width;
      const iconSize = icon.size ?? 34;
      const gap = 10;
      const startX = width / 2 - (iconSize + gap + textWidth) / 2;
      drawHexGem(ctx, startX + iconSize / 2, y, iconSize, icon.color ?? '#5be23a', icon.edge ?? '#1f7a12');
      ctx.textAlign = 'left';
      ctx.strokeText(text, startX + iconSize + gap, y, width - 20);
      setFill(fill, y, font);
      ctx.fillText(text, startX + iconSize + gap, y, width - 20);
    } else {
      ctx.textAlign = 'center';
      ctx.strokeText(text, width / 2, y, width - 20);
      setFill(fill, y, font);
      ctx.fillText(text, width / 2, y, width - 20);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(scaleX, scaleY, 1);
  return sprite;
}

const glowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
};

// Sparkle stars: seeded per particle so each drifts up at its own angle, radius and twinkle rate,
// looping forever (`fract(uTime * uSpeed + aSeed.y)` is each particle's own 0..1 life). The fragment
// draws a bright core plus a soft cross-shaped flare, like a shimmering star.
const SPARKLE_VERTEX = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform float uSpeed;
varying float vAlpha;
void main() {
  float life = fract(uTime * uSpeed + aSeed.y);
  float angle = aSeed.x * 6.2831853 + uTime * 0.15;
  float wobble = sin(uTime * 2.2 + aSeed.y * 40.0) * 0.2;
  float radius = uRadius * (0.3 + 0.7 * aSeed.z) + wobble;
  float x = cos(angle) * radius;
  float z = sin(angle) * radius;
  float y = life * uHeight;
  vec4 mv = viewMatrix * modelMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float twinkle = 0.55 + 0.45 * sin(uTime * (7.0 + aSeed.z * 12.0) + aSeed.y * 60.0);
  vAlpha = sin(life * 3.14159265) * twinkle;
  float size = 6.0 + aSeed.z * 9.0;
  gl_PointSize = clamp(size * 70.0 / -mv.z, 2.0, 70.0);
}
`;
const SPARKLE_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv) * 2.0;
  float core = 1.0 - smoothstep(0.0, 0.3, d);
  float glow = 1.0 - smoothstep(0.0, 1.0, d);
  float flare = pow(max(0.0, 1.0 - abs(uv.x) * 9.0), 4.0) + pow(max(0.0, 1.0 - abs(uv.y) * 9.0), 4.0);
  float shape = clamp(core * 1.6 + glow * 0.45 + flare * 0.7, 0.0, 1.0);
  vec3 col = pow(vec3(0.72, 0.95, 1.0), vec3(2.2));
  gl_FragColor = vec4(col, shape * vAlpha);
}
`;

// A soft, irregular cloud puff (several overlapping blurred blobs, not a plain disc) used as the
// mist particles' shape, so the ground haze reads as billowing smoke rather than dots.
function createSmokeTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.globalCompositeOperation = 'lighter';
  const blobCount = 6;
  for (let i = 0; i < blobCount; i += 1) {
    const angle = (i / blobCount) * Math.PI * 2 + Math.random() * 0.8;
    const dist = size * 0.16 * Math.random();
    const cx = size / 2 + Math.cos(angle) * dist;
    const cy = size / 2 + Math.sin(angle) * dist;
    const r = size * (0.24 + Math.random() * 0.2);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(canvas);
}

// Ground mist: textured cloud puffs that billow outward from the bike's feet, slowly tumbling and
// growing as they spread, then fading out, like the glowing haze pooling under it in the reference art.
const MIST_VERTEX = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uRadius;
uniform float uSpeed;
varying float vAlpha;
varying float vRot;
void main() {
  float life = fract(uTime * uSpeed + aSeed.y);
  float angle = aSeed.x * 6.2831853;
  float spread = 1.0 - pow(1.0 - life, 2.0); // billows out fast, then slows as it dissipates
  float radius = uRadius * spread;
  float drift = sin(uTime * 0.6 + aSeed.z * 20.0) * 0.25;
  float x = cos(angle) * radius + drift;
  float z = sin(angle) * radius + drift;
  float y = 0.05 + aSeed.z * 0.3 + life * 0.5;
  vec4 mv = viewMatrix * modelMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  vAlpha = sin(life * 3.14159265) * 0.6;
  float spinDir = aSeed.y > 0.5 ? 1.0 : -1.0;
  vRot = aSeed.x * 6.2831853 + uTime * spinDir * (0.12 + aSeed.z * 0.22);
  float size = mix(3.5, 10.0, spread) + aSeed.z * 3.0;
  gl_PointSize = clamp(size * 110.0 / -mv.z, 14.0, 280.0);
}
`;
const MIST_FRAGMENT = /* glsl */ `
uniform sampler2D map;
varying float vAlpha;
varying float vRot;
void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float s = sin(vRot);
  float c = cos(vRot);
  vec2 ruv = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c) + 0.5;
  float a = texture2D(map, ruv).a * vAlpha;
  vec3 col = pow(vec3(0.6, 0.88, 1.0), vec3(2.2));
  gl_FragColor = vec4(col, a);
}
`;

/** A seeded points buffer: `position` is required by three but left at the origin, since the shaders
 * compute each particle's world position themselves from `aSeed`. */
function seededPoints(count, vertexShader, fragmentShader, uniforms) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return { points, material };
}

/** Glowing ring with a floating limited-edition bike, its sparkle/mist aura and its name plate. */
export function createBikeDisplay({ bikeId, name, price }) {
  const group = new THREE.Group();
  const glowColor = 0x9befff;

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(9, 9),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: glowColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(3.0, 3.6, 48),
    new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(glow, ring);

  const { points: sparkles, material: sparkleMaterial } = seededPoints(48, SPARKLE_VERTEX, SPARKLE_FRAGMENT, {
    uTime: { value: 0 }, uRadius: { value: 3.0 }, uHeight: { value: 5.2 }, uSpeed: { value: 0.26 },
  });
  const { points: mist, material: mistMaterial } = seededPoints(70, MIST_VERTEX, MIST_FRAGMENT, {
    uTime: { value: 0 }, uRadius: { value: 3.8 }, uSpeed: { value: 0.22 }, map: { value: createSmokeTexture() },
  });
  group.add(sparkles, mist);

  const holder = new THREE.Group();
  holder.scale.setScalar(2.3);
  holder.add(createStoreBike(bikeId));
  group.add(holder);

  const label = textSprite(
    [
      { text: 'LIMITED!', y: 36, font: '900 52px "Arial Black", Arial, sans-serif', fill: ['#ffe32a', '#ff7418'] },
      { text: name, y: 96, font: '800 46px Arial, sans-serif', fill: ['#c8f8ff', '#36caff'] },
      { text: price, y: 152, font: '800 40px Arial, sans-serif', fill: '#8dff5a', icon: {} },
    ],
    512, 190, 5.6, 2.08
  );
  label.position.y = 6.1;
  group.add(label);

  const update = (time) => {
    holder.position.y = 1.55 + Math.sin(time * 1.6) * 0.25;
    holder.rotation.y = time * 0.6;
    ring.scale.setScalar(1 + Math.sin(time * 2) * 0.04);
    glow.material.opacity = 0.7 + Math.sin(time * 2.4) * 0.15;
    sparkleMaterial.uniforms.uTime.value = time;
    mistMaterial.uniforms.uTime.value = time;
  };
  return { group, update };
}
