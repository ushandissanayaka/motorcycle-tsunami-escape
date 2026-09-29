import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelUrl from '../../assets/neon-dragon-rider.glb?url';
import { signSprite } from './Sign.js';

const loader = new GLTFLoader();
const targetLength = 3.8;
const BIKE_SCALE = 2.2;
let loadedModel;

function loadModel() {
  if (!loadedModel) {
    loadedModel = loader.loadAsync(modelUrl).then(({ scene }) => {
      const root = new THREE.Group();
      // This GLB's bike length runs along X; store bikes face forward along -Z.
      scene.rotation.y = Math.PI / 2;
      root.add(scene);
      root.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      root.position.set(-center.x, -bounds.min.y, -center.z);
      root.scale.setScalar(targetLength / size.z);
      root.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      return root;
    }).catch((error) => {
      loadedModel = null;
      console.error('Could not load the World 2 bike model.', error);
      throw error;
    });
  }
  return loadedModel;
}

// A circular fire ring surrounds the slightly smaller display bike.
const RING = { rx: 4.5, rz: 4.5 };

const NOISE = /* glsl */ `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 2; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
`;

// Fire: hundreds of flame particles born on the ring. Each rises, is pushed around by turbulence, narrows
// and shrinks, and cools from white-yellow through gold and orange to deep red before it dies, the usual way
// game engines build realistic fire. Everything is computed on the GPU from per-particle seeds; the CPU only
// advances `uTime`. Point sizes are in world units (`uViewport` is half the drawing-buffer height), so
// the flames keep their size at any screen resolution.
const FIRE_VERTEX = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uRx;
uniform float uRz;
uniform float uHeight;
uniform float uViewport;
varying float vLife;
varying float vSeed;
varying float vHeatBias;
void main() {
  float speed = 0.8 + aSeed.z * 0.7;
  float life = fract(uTime * speed + aSeed.y);
  float angle = aSeed.x * 6.2831853;
  vec2 dir = vec2(cos(angle), sin(angle));
  float jitter = (fract(aSeed.x * 97.31 + aSeed.z * 13.7) - 0.5) * 0.8;
  vec2 ring = dir * vec2(uRx, uRz) + dir * jitter;
  float turbulence = sin(uTime * 7.0 + aSeed.y * 40.0 + life * 6.0) * 0.2 + sin(uTime * 11.0 + aSeed.x * 60.0) * 0.09;
  // Tall tongues of fire that wander around the ring, so it is not one even wall of flame.
  float tongue = 0.65 + 1.0 * (0.5 + 0.5 * sin(angle * 9.0 + uTime * 1.7)) * (0.5 + 0.5 * sin(angle * 4.0 - uTime * 1.1 + 1.0));
  float rise = pow(life, 0.85) * uHeight * (0.6 + 0.5 * aSeed.z) * tongue;
  vec3 p = vec3(
    ring.x + turbulence * life * 1.8 - dir.x * life * 0.4,
    rise,
    ring.y + turbulence * life * 1.1 - dir.y * life * 0.4
  );
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(1.7, 0.45, life) * (0.75 + 0.55 * aSeed.z);
  gl_PointSize = min(size * projectionMatrix[1][1] * uViewport / -mv.z, 96.0);
  vLife = life;
  vSeed = aSeed.z * 10.0 + aSeed.x * 7.0;
  vHeatBias = aSeed.z * 0.25;
}
`;
const FIRE_FRAGMENT = /* glsl */ `
uniform float uTime;
varying float vLife;
varying float vSeed;
varying float vHeatBias;
${NOISE}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  p.y = -p.y; // +y up
  // Teardrop: wide at the base, narrowing to a tip, its edge torn by scrolling noise so it licks upward.
  float taper = 1.0 - 0.55 * (p.y * 0.5 + 0.5);
  float n = fbm(vec2(p.x * 1.6 + vSeed, p.y * 1.4 - uTime * 2.6 + vSeed));
  float d = length(vec2(p.x / max(taper, 0.2), p.y * 0.9)) + (n - 0.5) * 0.65;
  float shape = 1.0 - smoothstep(0.2, 0.95, d);
  if (shape <= 0.002) discard;
  // Hottest in the middle of each flame and while it is young; cooler toward its edge and as it rises.
  // Only the young core of a flame is yellow-white; most of it burns gold and orange, and its edges and
  // upper part go deep red, giving the red / orange / gold / yellow mix.
  float heat = clamp(vLife * 1.45 + (1.0 - shape) * 0.5 + vHeatBias, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.93, 0.6), vec3(1.0, 0.72, 0.12), smoothstep(0.0, 0.2, heat));
  col = mix(col, vec3(1.0, 0.38, 0.03), smoothstep(0.2, 0.45, heat));
  col = mix(col, vec3(0.85, 0.08, 0.02), smoothstep(0.45, 0.8, heat));
  float fade = smoothstep(0.0, 0.08, vLife) * (1.0 - smoothstep(0.5, 1.0, vLife));
  // Additive red over the bright sky turns pink, so the coolest red tips thin out before they get there.
  fade *= 1.0 - 0.75 * smoothstep(0.55, 0.95, heat);
  gl_FragColor = vec4(pow(col, vec3(2.2)), shape * fade * 0.42);
}
`;

// Embers: sparks thrown up out of the fire ring. They rise much higher than the flames, speeding up in the
// hot air, drift outward and sway, flicker, and cool from white-yellow through orange to red before going out.
const EMBER_VERTEX = /* glsl */ `
attribute vec3 aSeed;
uniform float uTime;
uniform float uRx;
uniform float uRz;
uniform float uHeight;
uniform float uViewport;
varying float vAlpha;
varying float vHeat;
void main() {
  float speed = 0.28 + aSeed.z * 0.3;
  float life = fract(uTime * speed + aSeed.y);
  float angle = aSeed.x * 6.2831853;
  vec2 dir = vec2(cos(angle), sin(angle));
  vec2 ring = dir * vec2(uRx, uRz) * (0.85 + 0.3 * fract(aSeed.x * 51.3));
  float sway = sin(uTime * (1.6 + aSeed.z * 2.4) + aSeed.y * 30.0) * (0.15 + 0.7 * life);
  vec3 p = vec3(
    ring.x + dir.x * life * 1.2 + sway,
    life * life * uHeight * (0.6 + 0.6 * aSeed.z),
    ring.y + dir.y * life * 1.2 + sway * 0.7
  );
  vec4 mv = viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float flicker = 0.65 + 0.35 * sin(uTime * 16.0 + aSeed.y * 50.0);
  vAlpha = smoothstep(0.0, 0.05, life) * (1.0 - smoothstep(0.7, 1.0, life)) * flicker;
  vHeat = life;
  float size = mix(0.26, 0.09, life) * (0.7 + 0.6 * aSeed.z);
  gl_PointSize = clamp(size * projectionMatrix[1][1] * uViewport / -mv.z, 1.5, 24.0);
}
`;
const EMBER_FRAGMENT = /* glsl */ `
varying float vAlpha;
varying float vHeat;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float shape = clamp((1.0 - smoothstep(0.0, 0.45, d)) * 1.7 + (1.0 - smoothstep(0.0, 1.0, d)) * 0.4, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.95, 0.65), vec3(1.0, 0.56, 0.12), smoothstep(0.0, 0.4, vHeat));
  col = mix(col, vec3(0.9, 0.16, 0.04), smoothstep(0.4, 1.0, vHeat));
  gl_FragColor = vec4(pow(col, vec3(2.2)), shape * vAlpha);
}
`;

/** Seeded GPU particles in `group`: returns the uniforms so the caller can advance `uTime`. */
function particles(group, count, vertexShader, fragmentShader, extraUniforms) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const seeds = new Float32Array(count * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const uniforms = { uTime: { value: 0 }, uViewport: { value: 400 }, uRx: { value: RING.rx }, uRz: { value: RING.rz }, ...extraUniforms };
  const points = new THREE.Points(geometry, new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  points.frustumCulled = false;
  const bufferSize = new THREE.Vector2();
  points.onBeforeRender = (renderer) => {
    uniforms.uViewport.value = renderer.getDrawingBufferSize(bufferSize).y / 2;
  };
  group.add(points);
  return uniforms;
}

function radialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
}

/** A ring of fire around the whole bike: scorched ground, a glowing burning band, flames, embers and firelight. */
function addFireRing(group) {
  const flat = (mesh, y) => {
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = y;
    group.add(mesh);
    return mesh;
  };

  // Scorched ground inside the ring.
  const scorch = flat(new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ color: 0x1a0c07, roughness: 0.95 })), 0.02);
  scorch.scale.set(RING.rx + 0.45, RING.rz + 0.45, 1);

  // The burning band the flames grow out of, and the wide glow the fire throws on the ground around it.
  const band = flat(new THREE.Mesh(
    new THREE.RingGeometry(0.9, 1.08, 96),
    new THREE.MeshBasicMaterial({ color: 0xff6a12, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  ), 0.04);
  band.scale.set(RING.rx, RING.rz, 1);
  const glow = flat(new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0xff5a10, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })
  ), 0.05);
  glow.scale.set(RING.rx + 2, RING.rz + 2, 1);

  const fire = particles(group, 420, FIRE_VERTEX, FIRE_FRAGMENT, { uHeight: { value: 4.2 } });
  const embers = particles(group, 96, EMBER_VERTEX, EMBER_FRAGMENT, { uHeight: { value: 10 } });

  // Flickering firelight so the bike is lit orange from below.
  const light = new THREE.PointLight(0xff7a24, 24, 14, 1.6);
  light.position.y = 1.2;
  group.add(light);

  return (time) => {
    fire.uTime.value = time;
    embers.uTime.value = time;
    const flicker = Math.sin(time * 13) * 0.5 + Math.sin(time * 21 + 1.3) * 0.3 + Math.sin(time * 7.7) * 0.2;
    light.intensity = 24 + flicker * 5;
    band.material.opacity = 0.5 + flicker * 0.1;
    glow.material.opacity = 0.32 + flicker * 0.06;
  };
}

export function createWorld2BikeDisplay() {
  const group = new THREE.Group();
  const updateFire = addFireRing(group);
  const bikeHolder = new THREE.Group();
  bikeHolder.scale.setScalar(BIKE_SCALE);
  bikeHolder.rotation.y = -Math.PI / 2;
  group.add(bikeHolder);
  loadModel().then((model) => bikeHolder.add(model.clone(true)));

  const headline = ['#ffe429', '#ff8a16'];
  const signLines = [
    { text: 'Astralwing Bike', y: 12.2, size: 1.05, width: 12.6, color: headline },
    { text: 'OP BIKE', y: 10.45, size: 1.28, width: 8.6, color: headline },
    { text: '2174 / 2500 Remaining!', y: 9.05, size: 0.72, width: 11.4, color: headline },
    { text: '◉ 999', y: 7.85, size: 1.0, width: 4.8, color: '#52ff20' },
  ];
  for (const line of signLines) {
    const sprite = signSprite(line.text, {
      fontSize: line.size,
      color: line.color,
      strokeColor: '#101018',
      strokeEm: 0.22,
      width: line.width,
      height: line.size * 1.5,
    });
    sprite.material.depthTest = false;
    sprite.renderOrder = 20;
    sprite.position.y = line.y;
    group.add(sprite);
  }

  const update = (time) => {
    bikeHolder.position.y = 2.8 + Math.sin(time * 1.6) * 0.22;
    bikeHolder.rotation.y = -Math.PI / 2 + Math.sin(time * 0.42) * 0.12;
    updateFire(time);
  };
  return { group, update };
}
