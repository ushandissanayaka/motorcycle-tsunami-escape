import * as THREE from 'three';

/**
 * Anime-style daytime skybox: deep royal blue overhead shading to vivid cyan at the horizon, a ring of
 * towering cel-shaded cumulus on the horizon (white tops, flat pale-blue undersides, plumes that lean as
 * they rise), big sweeping clouds with translucent fringes and thin white swooshes overhead, a small bright
 * sun and a pale moon. Below the horizon lies a sea of clouds with open sky showing through the gaps, since the
 * map floats in the sky.
 *
 * The painting is far too costly to run per pixel every frame, so it is baked once into a cube map and the
 * dome that follows the camera just looks it up. Colours are written as display values (8-bit keeps the
 * gradients smooth that way) and converted to linear on output, since the game renders through a
 * post-processing chain that re-encodes them.
 */

const CUBE_SIZE = 1536;

/** `vec3 skyColor(vec3 dir)`: the whole painted sky for a unit world direction. */
export const SKY_CHUNK = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uMoonDir;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 0.0)), hash3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0.0, 0.0, 1.0)), hash3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(hash3(i + vec3(0.0, 1.0, 1.0)), hash3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}
float fbm3(vec3 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise3(p);
    p = p * 2.02 + vec3(3.1, 1.7, 5.3);
    a *= 0.5;
  }
  return v;
}
vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
// Cellular noise: x = distance to the nearest feature point, yzw = vector from that point to p.
// Each cell reads as one round puff of cloud.
vec4 worley3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec4 best = vec4(8.0, 0.0, 0.0, 0.0);
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 r = f - g - hash33(i + g);
        float dd = dot(r, r);
        if (dd < best.x) best = vec4(dd, r);
      }
    }
  }
  best.x = sqrt(best.x);
  return best;
}
// Crisp cel edge, antialiased over about a texel.
float aastep(float x) {
  float w = fwidth(x) * 0.75 + 1e-4;
  return smoothstep(-w, w, x);
}

const vec3 CLOUD_WHITE = vec3(1.0);
const vec3 CLOUD_SHADE = vec3(0.72, 0.88, 0.99);
const vec3 CLOUD_DEEP = vec3(0.66, 0.85, 0.99);

vec3 skyGradient(vec3 d, vec2 sunH) {
  float h = max(d.y, 0.0);
  vec3 col = mix(vec3(0.34, 0.86, 1.0), vec3(0.1, 0.76, 1.0), smoothstep(0.0, 0.16, h));
  col = mix(col, vec3(0.03, 0.5, 1.0), smoothstep(0.1, 0.42, h));
  col = mix(col, vec3(0.03, 0.2, 0.96), smoothstep(0.38, 0.9, h));
  // The side of the sky around the sun stays a brighter cyan for longer.
  vec2 hd = normalize(d.xz + vec2(1e-5));
  float sunSide = max(dot(hd, sunH), 0.0);
  col = mix(col, vec3(0.12, 0.8, 1.0), sunSide * sunSide * 0.45 * (1.0 - smoothstep(0.35, 0.85, h)));
  // Soft painterly bands of lighter cyan.
  float s = fbm3(vec3(d.x * 1.3 + d.y * 0.9, d.z * 3.2, d.y * 1.4));
  col = mix(col, vec3(0.3, 0.84, 1.0), smoothstep(0.5, 0.78, s) * 0.3 * (1.0 - smoothstep(0.75, 1.0, h)));
  return col;
}

// Signed height of the horizon cloud bank above direction d: > 0 inside the cloud. The puff is the big
// round billow d falls in.
float bankField(vec3 d, out vec4 puff) {
  vec2 hd = normalize(d.xz + vec2(1e-5));
  // Towers lean over as they rise, like the curling plumes in anime skies.
  float lean = d.y * 0.75;
  float c = cos(lean);
  float s = sin(lean);
  vec2 w = vec2(hd.x * c - hd.y * s, hd.x * s + hd.y * c);
  float towers = smoothstep(0.44, 0.7, fbm3(vec3(w * 1.9, 0.5)));
  float top = 0.06 + 0.09 * fbm3(vec3(hd * 4.5, 3.0)) + towers * (0.3 + 0.28 * fbm3(vec3(hd * 3.0, 8.0)));
  puff = worley3(d * 7.0);
  vec4 small = worley3(d * 17.0 + 3.0);
  return top + (0.5 - puff.x) * (0.07 + 0.06 * towers) + (0.45 - small.x) * 0.026 - d.y;
}

// Height of the round billow d falls in (a ball of radius 0.6 cells).
float puffDome(vec3 p) {
  float r = worley3(p).x;
  return sqrt(max(0.36 - r * r, 0.0));
}
// Toon lighting of round billows of size 1 / scale: shaded where a billow's surface turns steeply away
// from the light, which leaves a curved blue crescent under each one and the rest white.
float puffLit(vec3 d, vec3 light, float scale, float offset) {
  float eps = 0.01;
  float climb = puffDome(normalize(d + light * eps) * scale + offset) - puffDome(d * scale + offset);
  return aastep(0.45 * scale * eps - climb);
}

vec3 skyColor(vec3 d) {
  vec2 sunH = normalize(uSunDir.xz + vec2(1e-5));
  vec3 col = skyGradient(d, sunH);

  // Sun: a small white-hot disc with a soft halo (bright enough to bloom).
  float sd = max(dot(d, uSunDir), 0.0);
  col += vec3(0.75, 0.95, 1.0) * (pow(sd, 900.0) * 0.8 + pow(sd, 80.0) * 0.16);
  col = mix(col, vec3(1.9), smoothstep(0.99989, 0.99993, sd));

  // Moon: pale and see-through, with soft darker maria.
  vec3 mt = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
  vec3 mb = cross(mt, uMoonDir);
  vec2 muv = vec2(dot(d, mt), dot(d, mb)) / 0.06;
  float mr = length(muv);
  float moon = (1.0 - smoothstep(0.96, 1.0, mr)) * step(0.0, dot(d, uMoonDir));
  float maria = smoothstep(0.52, 0.62, fbm3(vec3(muv * 1.6, 11.0)));
  vec3 moonCol = mix(vec3(0.9, 0.98, 1.0), vec3(0.62, 0.86, 1.0), maria * 0.8);
  moonCol = mix(moonCol, vec3(1.0), smoothstep(0.7, 1.0, mr) * 0.5 * max(dot(muv / max(mr, 1e-3), vec2(-0.7, 0.7)), 0.0));
  col = mix(col, moonCol, moon * 0.78);

  // Overhead: big sweeping clouds, domain-warped and stretched so they swirl like brush strokes, with
  // round billows along their edges.
  float h = d.y;
  vec3 light = normalize(vec3(sunH.x * 0.6, 1.0, sunH.y * 0.6));
  vec2 uv = d.xz / (max(h, 0.0) + 0.2) * 0.6;
  uv += (vec2(fbm3(vec3(uv * 0.45, 1.3)), fbm3(vec3(uv * 0.45, 7.1))) - 0.5) * 1.3;
  vec2 q = vec2(uv.x * 0.6 - uv.y * 0.3, uv.y * 1.15 + uv.x * 0.25);
  vec4 domePuff = worley3(d * 9.0 + 5.0);
  float n = fbm3(vec3(q * 0.9, 4.0)) + (0.5 - domePuff.x) * 0.06;
  float cover = 0.56 + 0.08 * smoothstep(0.5, 0.95, h);
  float domeFade = smoothstep(0.06, 0.22, h);
  float dome = aastep(n - cover) * domeFade;
  // The edge facing the sun and the top of each billow are lit white; the rest falls into flat blue shade.
  float nSun = fbm3(vec3((q + sunH * 0.1) * 0.9, 4.0)) + (0.5 - domePuff.x) * 0.06;
  float domeLit = max(max(aastep(n - nSun - 0.004), puffLit(d, light, 9.0, 5.0)), aastep(n - cover - 0.16));
  vec3 domeCol = mix(CLOUD_SHADE, CLOUD_WHITE, domeLit);
  // Thin fringes are translucent, thick cores solid.
  float domeAlpha = dome * mix(0.7, 1.0, aastep(n - cover - 0.03));
  col = mix(col, domeCol, domeAlpha);

  // A few thin white swooshes trailing across the sky.
  vec2 sq = vec2(q.x * 0.3 + q.y * 0.2, q.y * 2.2);
  float ridge = 1.0 - abs(2.0 * fbm3(vec3(sq * 1.1, 9.0)) - 1.0);
  float wisp = smoothstep(0.955, 0.99, ridge) * smoothstep(0.45, 0.6, fbm3(vec3(q * 0.5, 2.0))) * domeFade * (1.0 - dome) * 0.6;
  col = mix(col, CLOUD_WHITE, wisp);

  // Horizon bank: towering cumulus built from round billows, white on top and pale blue underneath.
  vec4 puff;
  float field = bankField(d, puff);
  float bank = aastep(field);
  vec4 unused;
  // Still inside the cloud a little way toward the light means this part is shaded...
  float occluded = bankField(normalize(d + light * 0.022), unused);
  // ...except where a billow bulges out and catches the light on its own cap.
  float bankLit = max(1.0 - aastep(occluded), puffLit(d, light, 7.0, 0.0));
  vec3 shade = mix(CLOUD_SHADE, CLOUD_DEEP, aastep(occluded - 0.14));
  vec3 bankCol = mix(shade, CLOUD_WHITE, bankLit);
  // The base of the bank melts into a bright haze where it sits on the sea of clouds.
  bankCol = mix(bankCol, vec3(0.9, 0.97, 1.0), 1.0 - smoothstep(0.0, 0.05, h));
  col = mix(col, bankCol, bank);

  // Below the horizon: a sea of clouds seen from above, lit white on top with blue shade in the folds between
  // billows, and deep open sky showing through the gaps.
  float down = max(-h, 0.0);
  vec2 fuv = d.xz / (down + 0.03) * 0.35;
  fuv += (vec2(fbm3(vec3(fuv * 0.4, 21.0)), fbm3(vec3(fuv * 0.4, 27.0))) - 0.5) * 1.2;
  vec4 floorPuff = worley3(vec3(fuv * 1.6, 3.3));
  float fn = fbm3(vec3(fuv * 0.7, 13.0)) + (0.5 - floorPuff.x) * 0.16;
  float fcover = 0.35 + 0.1 * smoothstep(0.2, 0.9, down); // more gaps looking straight down
  vec3 below = mix(vec3(0.2, 0.74, 1.0), vec3(0.05, 0.45, 1.0), smoothstep(0.1, 0.9, down));
  vec3 floorCol = mix(CLOUD_DEEP, CLOUD_SHADE, aastep(fn - fcover - 0.035));
  floorCol = mix(floorCol, CLOUD_WHITE, aastep(fn - fcover - 0.07) * aastep(0.42 - floorPuff.x));
  below = mix(below, floorCol, aastep(fn - fcover));
  // Toward the horizon the floor melts into the same bright haze the towering bank stands on.
  below = mix(vec3(0.9, 0.97, 1.0), below, smoothstep(0.015, 0.09, down));
  col = mix(col, below, 1.0 - smoothstep(-0.012, 0.0, h));
  return col;
}
`;

const BAKE_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const BAKE_FRAGMENT = /* glsl */ `
varying vec3 vDir;
${SKY_CHUNK}
void main() {
  gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
}
`;

const DOME_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
}
`;

const DOME_FRAGMENT = /* glsl */ `
uniform samplerCube uSky;
varying vec3 vDir;
void main() {
  gl_FragColor = vec4(pow(textureCube(uSky, normalize(vDir)).rgb, vec3(2.2)), 1.0);
}
`;

export function skyUniforms(sunDirection) {
  return {
    uSunDir: { value: sunDirection.clone().normalize() },
    // Across the sky from the sun, fairly high up.
    uMoonDir: { value: new THREE.Vector3(-sunDirection.x, 0, -sunDirection.z).normalize().multiplyScalar(0.8).setY(0.62).normalize() },
  };
}

/** Paints the sky once into a cube map. */
function bakeSky(renderer, sunDirection) {
  const size = Math.min(CUBE_SIZE, renderer.capabilities.maxCubemapSize);
  const target = new THREE.WebGLCubeRenderTarget(size, { generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const material = new THREE.ShaderMaterial({
    uniforms: skyUniforms(sunDirection),
    vertexShader: BAKE_VERTEX,
    fragmentShader: BAKE_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const geometry = new THREE.SphereGeometry(100, 64, 32);
  const bakeScene = new THREE.Scene();
  bakeScene.add(new THREE.Mesh(geometry, material));
  new THREE.CubeCamera(1, 1000, target).update(renderer, bakeScene);
  geometry.dispose();
  material.dispose();
  return target;
}

export function createSky(renderer, sunDirection) {
  const target = bakeSky(renderer, sunDirection);
  const material = new THREE.ShaderMaterial({
    uniforms: { uSky: { value: target.texture } },
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  return sky;
}
