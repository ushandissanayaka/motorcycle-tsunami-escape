import * as THREE from 'three';

/**
 * The tsunamis. A sea fills the open end of the corridor, and waves rise out of the distance and roll south
 * down the wave place toward the start, growing taller as they approach. Their crests curl toward the riders.
 * When a wave reaches the mouth of the corridor it breaks and dissolves in spray.
 *
 * There are four kinds of wave (WAVE_TYPES): very slow, slow, medium and fast. Each has its own water colour,
 * visible from far away, and a floating name tag (name + face) that only fades in as it gets close.
 * Waves arrive at random: sometimes one at a time, sometimes two or three in quick succession, and a faster
 * wave sent behind a slower one can catch up and pass it.
 *
 * The water is drawn with shaders: animated caustic ripples, the type's colours from crest to foamy base,
 * and a cloud of spray around it.
 */

/**
 * The wave kinds. Colours are display colours taken from the reference art: `crest`, `body` and `base` colour the
 * water from top to bottom; `text` and `outline` colour the name tag. `speed` is units per second,
 * `weight` how often a kind is picked.
 */
export const WAVE_TYPES = {
  verySlow: { name: 'VERY SLOW', emoji: '\u{1F603}', speed: 9, weight: 16, crest: '#45c4b6', body: '#57e4c4', base: '#8af7d2', text: '#57ffae', outline: '#3d6086' },
  slow: { name: 'SLOW', emoji: '\u{1F642}', speed: 15, weight: 28, crest: '#3f92ec', body: '#41a0f4', base: '#7fccff', text: '#a7f4ff', outline: '#3d6086' },
  medium: { name: 'MEDIUM', emoji: '\u{1F624}', speed: 24, weight: 28, crest: '#3d75f1', body: '#4381f9', base: '#699aff', text: '#91d0ff', outline: '#3b5c83' },
  fast: { name: 'FAST', emoji: '\u{1F621}', speed: 38, weight: 30, crest: '#f75d89', body: '#ff6693', base: '#ff7292', text: '#ff678c', outline: '#3d6086' },
};
const TAG_STROKE = '#f7fdff'; // white inner outline of every name tag

const CAUSTIC = /* glsl */ `
#define TAU 6.28318530718
// Tileable water caustic (after Dave_Hoskins): bright, drifting cell lines like light through water.
float caustic(vec2 uv, float time) {
  vec2 p = mod(uv * TAU, TAU) - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float t = time * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return pow(abs(c), 8.0);
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
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
uniform float uCap; // 0 = the wave body, -1 / +1 = the closed left / right end
uniform float uWidth;
varying vec3 vWorld;
varying float vV;
varying float vBack;
varying float vThick;
${CURL}
// Thick at the base, thinning steadily to a slim crest.
float thickness(float v, float h) {
  return h * 0.42 * pow(1.0 - v, 1.7) + 0.35 + h * 0.03;
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
varying vec3 vWorld;
varying float vV;
varying float vBack;
varying float vThick;
${CAUSTIC}
void main() {
  float y = vV * uHeight;
  // Water streams down the face while the ripple pattern drifts.
  vec2 q = vec2(vWorld.x * 0.07, y * 0.07 + uTime * 0.06);
  float c = min(caustic(q, uTime * 0.5) + 0.6 * caustic(q * 1.8 + 3.1, uTime * 0.42), 1.0);

  // The type's own colours (display values): light and foamy at the base, saturated body, deeper crest.
  vec3 col = mix(uBase, uBody, smoothstep(0.0, 0.32, vV));
  col = mix(col, uCrest, smoothstep(0.55, 1.0, vV));
  col += (vec3(1.0) - col) * c * 0.1;

  // The far side and the thick inside of the wave sit a little darker, so the face toward the riders keeps its exact colour.
  col *= 1.0 - 0.2 * vBack - 0.1 * smoothstep(0.0, 14.0, vThick) * vBack;
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0); // display -> linear; the post chain re-encodes
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

const SEA_VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SEA_FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec3 vWorld;
${CAUSTIC}
void main() {
  float dist = distance(vWorld.xz, cameraPosition.xz);
  vec3 nearColor = vec3(0.08, 0.42, 0.9);
  vec3 farColor = vec3(0.6, 0.84, 1.0); // meets the hazy horizon of the sky
  vec3 col = mix(nearColor, farColor, smoothstep(40.0, 600.0, dist));
  float ripples = caustic(vWorld.xz * 0.04, uTime * 0.35);
  col += vec3(0.6, 0.86, 1.0) * ripples * 0.3 * (1.0 - smoothstep(20.0, 350.0, dist));
  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
}
`;

const TAG_SIZE = { width: 512, height: 400 };
const TAG_WORLD_WIDTH = 26; // world units wide; height follows the canvas aspect
const TAG_FADE = { none: 190, full: 110 }; // distance from the rider: invisible beyond `none`, fully shown within `full`
const TAG_STACK_RANGE = 40; // waves closer together than this (along the corridor) stack their tags
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
const SPAWN_AHEAD = 320; // a wave appears this far ahead of a rider who has gone past the sea's start
const FULL_HEIGHT_DISTANCE = 480; // a wave has swollen to full size after rolling this far

export function createTsunami({ width = 46, zFar, zNear, seaLevel = -0.4, waitRange = [7, 16], startHeight = 6, endHeight = 30 }) {
  const group = new THREE.Group();

  // The sea surrounds the whole map: land and canyon walls stand above it, and it is only visible outside the walls
  // and past the open end of the corridor (the ground is above it everywhere else).
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(8000, 14000),
    new THREE.ShaderMaterial({ vertexShader: SEA_VERTEX, fragmentShader: SEA_FRAGMENT, uniforms: { uTime: { value: 0 } } })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, seaLevel, -3000);
  group.add(sea);

  const waveGeometry = new THREE.PlaneGeometry(width, 1, 120, 120); // uv.y: front skin base->crest, then back skin crest->base
  const capGeometry = new THREE.PlaneGeometry(1, 1, 8, 60);
  capGeometry.translate(0.5, 0.5, 0); // uv.x = across the thickness, uv.y = height fraction
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
    const material = (values) => new THREE.ShaderMaterial({ vertexShader: WAVE_VERTEX, fragmentShader: WAVE_FRAGMENT, uniforms: values, side: THREE.DoubleSide });
    const body = new THREE.Mesh(waveGeometry, material(uniforms));
    // Closed ends so the wave reads as a solid body of water from any angle.
    const caps = [-1, 1].map((side) => new THREE.Mesh(capGeometry, material({ ...uniforms, uCap: { value: side } })));
    const spray = new THREE.Points(
      sprayGeometry,
      new THREE.ShaderMaterial({ vertexShader: SPRAY_VERTEX, fragmentShader: SPRAY_FRAGMENT, uniforms, transparent: true, depthWrite: false })
    );
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false, opacity: 0 }));
    tag.scale.set(TAG_WORLD_WIDTH, (TAG_WORLD_WIDTH * TAG_SIZE.height) / TAG_SIZE.width, 1);
    tag.renderOrder = 10;
    const root = new THREE.Group();
    for (const mesh of [body, ...caps, spray]) mesh.frustumCulled = false;
    root.add(body, ...caps, spray, tag);
    root.visible = false;
    group.add(root);
    return { root, uniforms, tag, active: false };
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
    Object.assign(slot, { id, type, speed: type.speed, z: spawnZ, prevZ: spawnZ, height: startHeight, sizeScale: randomBetween(0.9, 1.1), spawnOrder: state.cycle, phase: 'run', breakProgress: 0, caught: false, travelled: 0 });
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
    sea.material.uniforms.uTime.value = time;

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
      if (wave.phase === 'run') {
        wave.z += wave.speed * dt;
        wave.travelled += wave.speed * dt;
        const t = THREE.MathUtils.clamp(wave.travelled / FULL_HEIGHT_DISTANCE, 0, 1);
        wave.height = (startHeight + (endHeight - startHeight) * t ** 1.4) * wave.sizeScale; // it swells as it closes in
        wave.uniforms.uCurl.value = 1;
        if (wave.z >= zNear) {
          wave.phase = 'break';
          wave.breakProgress = 0;
        }
      } else {
        wave.breakProgress += dt / 1.8;
        wave.z += wave.speed * 0.35 * dt;
        const u = Math.min(wave.breakProgress, 1);
        wave.height = endHeight * wave.sizeScale * (1 - u) ** 1.6; // it crashes down and dissolves
        wave.uniforms.uCurl.value = 1 + 2.5 * u;
        if (u >= 1) {
          retire(wave);
          continue;
        }
      }
      wave.root.position.z = wave.z;
      wave.uniforms.uHeight.value = Math.max(wave.height, 0.01);

      // The colour shows from anywhere; the name tag only fades in as the rider gets close.
      const near = 1 - THREE.MathUtils.smoothstep(Math.abs(wave.z - riderZ), TAG_FADE.full, TAG_FADE.none);
      wave.tag.material.opacity = wave.phase === 'run' ? near : near * (1 - Math.min(wave.breakProgress * 2, 1));
      // Tags of waves that are close together (about to pass one another) are stacked so they stay readable.
      const stacked = state.waves.filter((other) => other !== wave && Math.abs(other.z - wave.z) < TAG_STACK_RANGE && other.spawnOrder < wave.spawnOrder).length;
      wave.tag.position.set(0, Math.max(wave.height, startHeight) + 11 + stacked * TAG_STACK_STEP, 0);
    }
  };

  /** Waves can be switched off (the "Disable Waves" button); the sea stays. */
  const setEnabled = (enabled) => {
    state.enabled = enabled;
    if (!enabled) {
      for (const wave of [...state.waves]) retire(wave);
      scheduler.queue.length = 0;
      scheduler.timer = 2;
    }
  };

  /** True when a wave sweeps over the rider (each wave catches a rider at most once). The wave's
   * visible body starts at world y=0; a rider whose head stays below that
   * height inside a pit is sheltered underneath the crest. */
  const hitsPlayer = (player, collision, riderHeight) => {
    if (!state.enabled) return false;
    const { x, y, z } = player.position;
    if (Math.abs(x) > width / 2) return false;
    const sheltered = collision?.pitAt(x, z) && y + riderHeight < 0;
    for (const wave of state.waves) {
      if (wave.caught) continue;
      const thickness = wave.height * 0.45 + 0.35;
      // Use the whole distance the wave moved this frame, so a fast wave cannot skip over a rider.
      const reachedFront = Math.max(wave.prevZ, wave.z) >= z - 0.5;
      const beforeBack = Math.min(wave.prevZ, wave.z) <= z + thickness;
      if (!reachedFront || !beforeBack) continue;
      wave.caught = true;
      if (!sheltered) return true;
    }
    return false;
  };

  /** Sends a wave of the given kind (a key of WAVE_TYPES) right away, e.g. for testing. */
  const spawn = (id, riderZ = 0) => spawnWave(id, riderZ);

  return { group, update, setEnabled, hitsPlayer, spawn, state };
}
