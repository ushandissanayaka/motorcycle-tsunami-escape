import * as THREE from 'three';

/**
 * The tsunamis. Waves rise out of the distance beyond the open end of the corridor and roll south
 * down the wave place toward the start, growing taller as they approach. Their crests curl toward the riders.
 * When the foot of a wave reaches the starting line it vanishes at once, at its full height.
 *
 * There are four kinds of wave (WAVE_TYPES): very slow, slow, medium and fast. Each has its own water colour,
 * visible from far away, and a floating name tag (name + face) that only fades in as it gets close.
 * Waves arrive at random: sometimes one at a time, sometimes two or three in quick succession, and a faster
 * wave sent behind a slower one can catch up and pass it.
 *
 * The water is drawn with shaders: dense slanted wavelets with bright glints over the type's colours from crest
 * to foamy base, and a cloud of spray around it. Slower kinds are lower. A wave is a closed body (thick at the
 * foot, thin at the crest, closed underneath), casts the sun's shadow and darkens the road in front of it.
 */

/**
 * The wave kinds. Colours are display colours taken from the reference art: `crest`, `body` and `base` colour the
 * water from top to bottom; `text` and `outline` colour the name tag. `speed` is units per second,
 * `weight` how often a kind is picked, `height` its size relative to the fastest kind.
 */
export const WAVE_TYPES = {
  verySlow: { name: 'VERY SLOW', emoji: '\u{1F603}', speed: 9, weight: 16, height: 0.72, crest: '#45c4b6', body: '#57e4c4', base: '#8af7d2', text: '#57ffae', outline: '#3d6086' },
  slow: { name: 'SLOW', emoji: '\u{1F642}', speed: 15, weight: 28, height: 0.8, crest: '#3f92ec', body: '#41a0f4', base: '#7fccff', text: '#a7f4ff', outline: '#3d6086' },
  medium: { name: 'MEDIUM', emoji: '\u{1F624}', speed: 24, weight: 28, height: 0.9, crest: '#3d75f1', body: '#4381f9', base: '#699aff', text: '#91d0ff', outline: '#3b5c83' },
  fast: { name: 'FAST', emoji: '\u{1F621}', speed: 38, weight: 30, height: 1, crest: '#f75d89', body: '#ff6693', base: '#ff7292', text: '#ff678c', outline: '#3d6086' },
};
const TAG_STROKE = '#f7fdff'; // white inner outline of every name tag

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const RIPPLES = /* glsl */ `
// Stylised water surface like the reference: dense wavelets slanted across the surface, each crest catching a
// thin white glint along its top edge with a darker trough under it. Needs NOISE.
float wavelet(vec2 p) {
  return 1.0 - abs(2.0 * noise(p) - 1.0); // ridged: sharp crests, soft troughs
}
float rippleHeight(vec2 p) {
  p += (vec2(noise(p * 0.55), noise(p * 0.55 + 17.0)) - 0.5) * 2.2; // bend the rows so they interlock
  return wavelet(p * vec2(1.4, 2.6)) * 0.65 + wavelet(p * vec2(2.6, 4.2) + 3.7) * 0.35;
}
// x: 0..1 height of the surface (trough..crest), y: 0..1 glint.
vec2 ripples(vec2 uv, float time) {
  const mat2 slant = mat2(0.94, 0.34, -0.34, 0.94);
  vec2 p = slant * uv + vec2(time * 0.12, time * 0.5);
  float h = rippleHeight(p);
  float slope = (rippleHeight(p + vec2(0.0, 0.03)) - h) / 0.03;
  return vec2(h, smoothstep(1.2, 2.6, -slope) * smoothstep(0.4, 0.75, h));
}
// Lays the ripple pattern over a display colour, whatever the water's colour is.
vec3 applyRipples(vec3 col, vec2 uv, float time) {
  vec2 r = ripples(uv, time);
  col *= mix(0.82, 1.06, r.x);
  return mix(col, vec3(1.0), r.y * 0.75);
}
`;

// How far the crest leans over toward the riders at height fraction v.
const CURL = /* glsl */ `
float curl(float v, float h, float k) {
  return h * k * (0.06 * v * v + 0.55 * pow(v, 6.0));
}
`;

const WAVE_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform float uCurl;
uniform float uCap; // 0 = the wave body, -1 / +1 = the closed left / right end, 2 = the underside
uniform float uWidth;
varying vec3 vWorld;
varying float vV;
varying float vBack;
varying float vThick;
${CURL}
// Thick at the foot, thinning to a sharp crest where the front and back skins meet (keep in sync with hitsPlayer).
float thickness(float v, float h) {
  return (h * 0.62 * (1.0 - v) + 0.3 + h * 0.02) * (1.0 - v);
}
void main() {
  float v;
  float back = 0.0;
  float t = 0.0; // 0 = front skin, 1 = back skin (only used by the end caps)
  float x;
  if (uCap == 0.0) {
    // uv.y runs front skin base -> crest (0..0.5), then back skin crest -> base (0.5..1).
    back = step(0.5, uv.y);
    v = back > 0.5 ? 2.0 - 2.0 * uv.y : 2.0 * uv.y;
    x = position.x;
  } else if (uCap == 2.0) {
    // The underside: a flat floor from the front skin's foot to the back skin's foot.
    v = 0.0;
    t = uv.y;
    x = position.x;
  } else {
    v = uv.y;
    t = uv.x;
    x = uCap * uWidth * 0.5;
  }
  float th = thickness(v, uHeight);
  float ripple = sin(x * 0.35 + uTime * 1.6) * 0.5 + sin(x * 0.9 - uTime * 2.3 + v * 6.0) * 0.25;
  float front = curl(v, uHeight, uCurl) + ripple * (0.3 + 0.03 * uHeight) * v;
  float z = uCap == 0.0 ? front - back * th : front - t * th;
  float y = v * uHeight + sin(x * 1.7 + uTime * 3.0) * 0.012 * uHeight * pow(v, 8.0);
  vec4 world = modelMatrix * vec4(x, y, z, 1.0);
  vWorld = world.xyz;
  vV = v;
  vBack = uCap == 0.0 ? back : 0.5;
  vThick = th;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const WAVE_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uHeight;
uniform vec3 uCrest;
uniform vec3 uBody;
uniform vec3 uBase;
uniform float uCap;
varying vec3 vWorld;
varying float vV;
varying float vBack;
varying float vThick;
${NOISE}
${RIPPLES}
void main() {
  float y = vV * uHeight;
  // The type's own colours (display values): light and foamy at the base, saturated body, deeper crest.
  vec3 col = mix(uBase, uBody, smoothstep(0.0, 0.32, vV));
  col = mix(col, uCrest, smoothstep(0.55, 1.0, vV));

  // Wavelets stream down the face (and across the ends and underside), whatever the colour.
  vec2 face = uCap == 0.0 ? vec2(vWorld.x, y) : uCap == 2.0 ? vWorld.xz : vec2(vWorld.z, y);
  col = applyRipples(col, face * 0.8, uTime);

  // The far side and the thick inside of the wave sit a little darker, so the face toward the riders keeps its exact colour.
  col *= 1.0 - 0.2 * vBack - 0.1 * smoothstep(0.0, 14.0, vThick) * vBack;
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0); // display -> linear; the post chain re-encodes
}
`;

// Shadow-map depth for the wave, drawn with the same displaced shape as the water.
const WAVE_DEPTH_FRAGMENT = /* glsl */ `
#include <packing>
void main() {
  gl_FragColor = packDepthToRGBA(gl_FragCoord.z);
}
`;

// Soft shade on the road in front of the wave, under the crest leaning over it. uv.y: 1 at the wave's foot.
const FRONT_SHADOW_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRONT_SHADOW_FRAGMENT = /* glsl */ `
uniform float uStrength;
varying vec2 vUv;
void main() {
  float a = uStrength * pow(vUv.y, 1.6) * smoothstep(0.0, 0.08, vUv.x) * (1.0 - smoothstep(0.92, 1.0, vUv.x));
  gl_FragColor = vec4(0.01, 0.03, 0.1, a);
}
`;

const SPRAY_VERTEX = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uHeight;
uniform float uWidth;
uniform float uCurl;
varying float vAlpha;
${CURL}
void main() {
  float life = fract(uTime * 0.35 + aSeed.y);
  float x = (aSeed.x - 0.5) * uWidth;
  float v = life * (0.04 + 0.5 * aSeed.z);
  float y = v * uHeight;
  float z = curl(v, uHeight, uCurl) + 1.0 + life * 6.0 * aSeed.z;
  vec4 mv = viewMatrix * modelMatrix * vec4(x, y, z, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = (0.6 + 2.2 * aSeed.z) * (0.4 + uHeight * 0.06) * (0.6 + life);
  gl_PointSize = clamp(size * 620.0 / -mv.z, 1.0, 160.0);
  vAlpha = (1.0 - life) * 0.16 * smoothstep(0.0, 6.0, uHeight);
}
`;

const SPRAY_FRAGMENT = /* glsl */ `
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vAlpha;
  gl_FragColor = vec4(pow(vec3(0.95, 0.99, 1.0), vec3(2.2)), a);
}
`;

const TAG_SIZE = { width: 512, height: 400 };
const TAG_WORLD_WIDTH = 26; // world units wide; height follows the canvas aspect
const TAG_FADE = { none: 190, full: 110 }; // distance from the rider: invisible beyond `none`, fully shown within `full`
const TAG_STACK_RANGE = 40; // waves closer together than this (along the corridor) stack their tags
const TAG_LIFT = 10; // how far a tag floats above its wave's crest
const FRONT_SHADOW_Y = 0.12; // just above the road surface
const TAG_STACK_STEP = (TAG_WORLD_WIDTH * TAG_SIZE.height) / TAG_SIZE.width + 1; // one tag's height plus a little space
const TAG_FONT = "'Lilita One', 'Luckiest Guy', 'Arial Black', Impact, sans-serif";

/** Draws a wave's name tag: the name (outline, white stroke, fill) with a round face under it. */
function drawTag(canvas, type) {
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  let size = 150;
  ctx.font = `${size}px ${TAG_FONT}`;
  const fit = (width - 70) / Math.max(ctx.measureText(type.name).width, 1);
  if (fit < 1) size *= fit;
  ctx.font = `${size}px ${TAG_FONT}`;
  const textY = height * 0.27;
  for (const [color, lineWidth] of [[type.outline, size * 0.3], [TAG_STROKE, size * 0.17]]) {
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = color;
    ctx.strokeText(type.name, width / 2, textY);
  }
  ctx.fillStyle = type.text;
  ctx.fillText(type.name, width / 2, textY);

  // The face sits on a white disc, like a sticker.
  const faceY = height * 0.72;
  const radius = height * 0.19;
  ctx.fillStyle = TAG_STROKE;
  ctx.beginPath();
  ctx.arc(width / 2, faceY, radius + 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${radius * 1.55}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
  ctx.fillStyle = '#000';
  ctx.fillText(type.emoji, width / 2, faceY + radius * 0.06);
}

/** One name-tag texture per wave kind; redrawn once the display font has loaded. */
function createTagTextures() {
  const textures = {};
  for (const [id, type] of Object.entries(WAVE_TYPES)) {
    const canvas = document.createElement('canvas');
    canvas.width = TAG_SIZE.width;
    canvas.height = TAG_SIZE.height;
    drawTag(canvas, type);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    textures[id] = { texture, canvas, type };
  }
  document.fonts?.load(`64px ${TAG_FONT}`).then(() => {
    for (const { texture, canvas, type } of Object.values(textures)) {
      drawTag(canvas, type);
      texture.needsUpdate = true;
    }
  }).catch(() => {});
  return textures;
}

/** Sets a colour uniform to the hex value as-is: the wave shader works in display colours and encodes to linear itself,
 * whereas THREE.Color would already have converted the hex to linear. */
const setDisplayColor = (color, hex) => color.set(hex).convertLinearToSRGB();

const randomBetween = (min, max) => min + Math.random() * (max - min);

/** Picks a kind at random, by weight. */
function pickType() {
  let roll = Math.random() * Object.values(WAVE_TYPES).reduce((sum, type) => sum + type.weight, 0);
  for (const [id, type] of Object.entries(WAVE_TYPES)) {
    roll -= type.weight;
    if (roll <= 0) return id;
  }
  return 'slow';
}

/**
 * How many waves arrive together, and when each is sent (seconds after the first).
 * A wave sent right behind a slower one just follows it. A faster one can be sent so that it catches the one ahead
 * partway down the corridor and overtakes it: `delay` is worked out from the two speeds so the catch-up happens
 * `OVERTAKE_AT` units from where they started, which is where a rider on the track can see them pass one another.
 */
function planBurst() {
  const roll = Math.random();
  const count = roll < 0.6 ? 1 : roll < 0.87 ? 2 : 3;
  const spawns = [];
  let delay = 0;
  let previous = null;
  for (let i = 0; i < count; i += 1) {
    const id = pickType();
    if (previous) {
      const slow = previous.speed;
      const fast = WAVE_TYPES[id].speed;
      if (fast > slow && Math.random() < OVERTAKE_CHANCE) {
        // The follower, sent `gap` seconds later, catches up after travelling `distance`: distance = slow * fast * gap / (fast - slow).
        const distance = randomBetween(...OVERTAKE_AT);
        delay += Math.min(distance * (fast - slow) / (slow * fast), MAX_OVERTAKE_DELAY);
      } else {
        delay += randomBetween(1.4, 3.2); // in quick succession
      }
    }
    previous = WAVE_TYPES[id];
    spawns.push({ id, delay });
  }
  return { spawns, span: delay };
}

const OVERTAKE_CHANCE = 0.75; // how often a faster wave sent behind a slower one is timed to overtake it
const OVERTAKE_AT = [110, 400]; // distance from the start of their run at which an overtake is timed to happen
const MAX_OVERTAKE_DELAY = 30; // seconds
const MAX_WAVES = 5; // waves in the water at once
const SPAWN_AHEAD = 320; // a wave appears this far ahead of a rider who has gone past zFar
const FULL_HEIGHT_DISTANCE = 480; // a wave has swollen to full size after rolling this far

export function createTsunami({ width = 46, zFar, zNear, waitRange = [7, 16], startHeight = 4, endHeight = 20 }) {
  const group = new THREE.Group();

  const waveGeometry = new THREE.PlaneGeometry(width, 1, 120, 120); // uv.y: front skin base->crest, then back skin crest->base
  const capGeometry = new THREE.PlaneGeometry(1, 1, 8, 60);
  capGeometry.translate(0.5, 0.5, 0); // uv.x = across the thickness, uv.y = height fraction
  const bottomGeometry = new THREE.PlaneGeometry(width, 1, 60, 1); // uv.y = front foot -> back foot
  const frontShadowGeometry = new THREE.PlaneGeometry(width, 1);
  frontShadowGeometry.rotateX(-Math.PI / 2); // flat, uv.y = 1 at the -z edge
  frontShadowGeometry.translate(0, 0, 0.5); // from the wave's foot (z = 0) forward to z = 1
  const sprayCount = 420;
  const seeds = new Float32Array(sprayCount * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sprayCount * 3), 3));
  sprayGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const tags = createTagTextures();

  /** A wave that can be reused for any kind: its own uniforms (colours, height), meshes and name tag. */
  const makeWave = () => {
    const uniforms = {
      uTime: { value: 0 }, uHeight: { value: startHeight }, uWidth: { value: width }, uCurl: { value: 1 }, uCap: { value: 0 },
      uCrest: { value: new THREE.Color() }, uBody: { value: new THREE.Color() }, uBase: { value: new THREE.Color() },
    };
    // Each part casts the sun's shadow with its displaced shape, not the flat geometry's.
    const part = (geometry, values) => {
      const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({ vertexShader: WAVE_VERTEX, fragmentShader: WAVE_FRAGMENT, uniforms: values, side: THREE.DoubleSide }));
      mesh.customDepthMaterial = new THREE.ShaderMaterial({ vertexShader: WAVE_VERTEX, fragmentShader: WAVE_DEPTH_FRAGMENT, uniforms: values, side: THREE.DoubleSide });
      mesh.castShadow = true;
      return mesh;
    };
    const body = part(waveGeometry, uniforms);
    // Closed ends and underside so the wave reads as a solid body of water from any angle, even from down in a pit.
    const caps = [-1, 1].map((side) => part(capGeometry, { ...uniforms, uCap: { value: side } }));
    const bottom = part(bottomGeometry, { ...uniforms, uCap: { value: 2 } });
    const frontShadow = new THREE.Mesh(frontShadowGeometry, new THREE.ShaderMaterial({
      vertexShader: FRONT_SHADOW_VERTEX, fragmentShader: FRONT_SHADOW_FRAGMENT, uniforms: { uStrength: { value: 0 } }, transparent: true, depthWrite: false,
    }));
    frontShadow.position.y = FRONT_SHADOW_Y;
    const spray = new THREE.Points(
      sprayGeometry,
      new THREE.ShaderMaterial({ vertexShader: SPRAY_VERTEX, fragmentShader: SPRAY_FRAGMENT, uniforms, transparent: true, depthWrite: false })
    );
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    tag.scale.set(TAG_WORLD_WIDTH, (TAG_WORLD_WIDTH * TAG_SIZE.height) / TAG_SIZE.width, 1);
    tag.renderOrder = 10;
    const root = new THREE.Group();
    for (const mesh of [body, ...caps, bottom, spray]) mesh.frustumCulled = false;
    root.add(body, ...caps, bottom, frontShadow, spray, tag);
    root.visible = false;
    group.add(root);
    return { root, uniforms, tag, frontShadow, active: false };
  };
  const pool = Array.from({ length: MAX_WAVES }, makeWave);

  const state = { enabled: true, cycle: 0, waves: [] }; // cycle: waves spawned so far
  const scheduler = { timer: 2, queue: [], lastTime: null }; // timer: seconds until the next burst; queue: spawns left in this burst

  const spawnWave = (id, riderZ) => {
    const slot = pool.find((wave) => !wave.active);
    if (!slot) return;
    const type = WAVE_TYPES[id];
    const spawnZ = Math.min(zFar, riderZ - SPAWN_AHEAD);
    slot.active = true;
    Object.assign(slot, { id, type, speed: type.speed, z: spawnZ, prevZ: spawnZ, height: startHeight, sizeScale: type.height * randomBetween(0.96, 1.04), spawnOrder: state.cycle, caught: false, travelled: 0 });
    setDisplayColor(slot.uniforms.uCrest.value, type.crest);
    setDisplayColor(slot.uniforms.uBody.value, type.body);
    setDisplayColor(slot.uniforms.uBase.value, type.base);
    slot.tag.material.map = tags[id].texture;
    slot.tag.material.needsUpdate = true;
    slot.tag.material.opacity = 0;
    slot.root.visible = true;
    slot.root.position.z = spawnZ;
    state.waves.push(slot);
    state.cycle += 1;
  };

  const retire = (wave) => {
    wave.active = false;
    wave.root.visible = false;
    state.waves = state.waves.filter((item) => item !== wave);
  };

  /** Per-frame: `riderZ` places new waves ahead of the rider and fades the name tags with distance. */
  const update = (time, riderZ = 0) => {
    const dt = scheduler.lastTime === null ? 0 : THREE.MathUtils.clamp(time - scheduler.lastTime, 0, 0.1);
    scheduler.lastTime = time;

    if (!state.enabled) return;

    // Random arrivals: a burst of one to three waves, then a random quiet spell.
    scheduler.queue.forEach((spawn) => { spawn.delay -= dt; });
    while (scheduler.queue.length && scheduler.queue[0].delay <= 0) spawnWave(scheduler.queue.shift().id, riderZ);
    scheduler.timer -= dt;
    if (scheduler.timer <= 0 && !scheduler.queue.length) {
      if (state.waves.length + 3 > MAX_WAVES) {
        scheduler.timer = 2; // too many in the water for another burst; look again shortly
      } else {
        const burst = planBurst();
        scheduler.queue.push(...burst.spawns);
        scheduler.timer = burst.span + randomBetween(...waitRange);
      }
    }

    for (const wave of [...state.waves]) {
      wave.uniforms.uTime.value = time;
      wave.prevZ = wave.z;
      wave.z += wave.speed * dt;
      wave.travelled += wave.speed * dt;
      const t = THREE.MathUtils.clamp(wave.travelled / FULL_HEIGHT_DISTANCE, 0, 1);
      wave.height = (startHeight + (endHeight - startHeight) * t ** 1.4) * wave.sizeScale; // it swells as it closes in
      wave.uniforms.uCurl.value = 1;
      // The moment the wave's foot reaches zNear it simply vanishes at its full height: it does not sink or
      // crash first.
      if (wave.z >= zNear) {
        retire(wave);
        continue;
      }
      wave.root.position.z = wave.z;
      wave.uniforms.uHeight.value = Math.max(wave.height, 0.01);
      // The shade reaches about as far as the crest leans over.
      wave.frontShadow.scale.z = wave.height * 0.9 + 3;
      wave.frontShadow.material.uniforms.uStrength.value = 0.5 * THREE.MathUtils.smoothstep(wave.height, 1, 8);

      // The colour shows from anywhere; the name tag only fades in as the rider gets close.
      const near = 1 - THREE.MathUtils.smoothstep(Math.abs(wave.z - riderZ), TAG_FADE.full, TAG_FADE.none);
      wave.tag.material.opacity = near;
      // Tags of waves that are close together (about to pass one another) are stacked so they stay readable.
      const stacked = state.waves.filter((other) => other !== wave && Math.abs(other.z - wave.z) < TAG_STACK_RANGE && other.spawnOrder < wave.spawnOrder).length;
      wave.tag.position.set(0, Math.max(wave.height, startHeight) + TAG_LIFT + stacked * TAG_STACK_STEP, 0);
    }
  };

  /** Waves can be switched off (the "Disable Waves" button). */
  const setEnabled = (enabled) => {
    state.enabled = enabled;
    if (!enabled) {
      for (const wave of [...state.waves]) retire(wave);
      scheduler.queue.length = 0;
      scheduler.timer = 2;
    }
  };

  /**
   * The wave that has just hit the rider, or null. A rider is hit wherever they touch the water: the front
   * rolling into them, riding into its back from behind, or hopping up out of a pit while it rolls overhead.
   * Only a rider whose head stays below ground level down in a pit is sheltered (the wave's body starts at
   * y = 0), and only for as long as they stay down there. Both the wave's and the rider's whole movement this
   * frame are tested, so neither a fast wave nor a fast rider can skip through the other. Each wave hits a
   * rider at most once. `riderPrevZ` is where the rider was on the frame before.
   */
  const hitsPlayer = (player, collision, riderHeight, riderPrevZ = player.position.z) => {
    if (!state.enabled) return null;
    const { x, y, z } = player.position;
    if (Math.abs(x) > width / 2) return null;
    if (collision?.pitAt(x, z) && y + riderHeight < 0) return null;
    const riderMin = Math.min(riderPrevZ, z);
    const riderMax = Math.max(riderPrevZ, z);
    for (const wave of state.waves) {
      if (wave.caught || y > wave.height) continue; // a rider above the crest is clear of it
      const thickness = wave.height * 0.64 + 0.3; // the foot's thickness in the wave shader
      const front = Math.max(wave.prevZ, wave.z) + 0.5;
      const back = Math.min(wave.prevZ, wave.z) - thickness;
      if (riderMax < back || riderMin > front) continue;
      wave.caught = true;
      return wave;
    }
    return null;
  };

  /** Sends a wave of the given kind (a key of WAVE_TYPES) right away, e.g. for testing. */
  const spawn = (id, riderZ = 0) => spawnWave(id, riderZ);

  return { group, update, setEnabled, hitsPlayer, spawn, state };
}
