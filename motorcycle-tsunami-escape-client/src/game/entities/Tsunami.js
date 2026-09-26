import * as THREE from 'three';

/**
 * The tsunami. A sea fills the open end of the corridor, and every cycle a wave
 * rises out of the distance and rolls south down the wave place toward the
 * start, growing taller as it approaches. Its crest curls toward the riders.
 * When it reaches the mouth of the corridor it breaks and dissolves in spray,
 * pauses, then starts again from far away.
 *
 * The water is drawn with shaders: animated caustic ripples, sunlit crest,
 * foam along the crest and base, and a cloud of spray around it.
 */

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
varying vec3 vWorld;
varying float vV;
varying float vBack;
varying float vThick;
${CAUSTIC}
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  float y = vV * uHeight;
  // Water streams down the face while the ripple pattern drifts.
  vec2 q = vec2(vWorld.x * 0.07, y * 0.07 + uTime * 0.06);
  float c = caustic(q, uTime * 0.5) + 0.6 * caustic(q * 1.8 + 3.1, uTime * 0.42);

  vec3 deep = vec3(0.04, 0.28, 0.82);
  vec3 mid = vec3(0.1, 0.5, 0.95);
  vec3 sunlit = vec3(0.5, 0.84, 1.0);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.55, vV));
  col = mix(col, sunlit, smoothstep(0.5, 1.0, vV) * 0.75);
  col += vec3(0.7, 0.93, 1.0) * c * 0.42;

  // Foam clings to the crest and churns at the base.
  float fn = noise(vec2(vWorld.x * 0.7, y * 0.45 - uTime * 1.4));
  float crest = smoothstep(0.84, 0.97, vV + (fn - 0.5) * 0.14);
  float base = 1.0 - smoothstep(0.0, 0.1 + 0.05 * fn, vV);
  col = mix(col, vec3(0.97, 0.99, 1.0), clamp(crest + base * 0.85, 0.0, 1.0));

  col *= mix(0.78, 1.12, abs(n.z));
  // Thick water is deep and dark inside; the thin crest lets the sun glow through it.
  float depthTint = smoothstep(0.0, 14.0, vThick);
  col = mix(col, col * vec3(0.32, 0.55, 0.85), depthTint * (0.25 + 0.6 * vBack));
  col += vec3(0.25, 0.6, 0.55) * (1.0 - depthTint) * smoothstep(0.55, 1.0, vV) * 0.35;
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
  vAlpha = (1.0 - life) * 0.42 * smoothstep(0.0, 6.0, uHeight);
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

export function createTsunami({ width = 46, seaFromZ, zFar, zNear, speed = 20, waitSeconds = 6, startHeight = 6, endHeight = 30 }) {
  const group = new THREE.Group();

  // Sea beyond the open end of the corridor.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 1700),
    new THREE.ShaderMaterial({ vertexShader: SEA_VERTEX, fragmentShader: SEA_FRAGMENT, uniforms: { uTime: { value: 0 } } })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, -0.4, seaFromZ + 4 - 850);
  group.add(sea);

  const waveUniforms = { uTime: { value: 0 }, uHeight: { value: startHeight }, uWidth: { value: width }, uCurl: { value: 1 }, uCap: { value: 0 } };
  const waveGeometry = new THREE.PlaneGeometry(width, 1, 120, 120); // uv.y: front skin base->crest, then back skin crest->base
  const wave = new THREE.Mesh(
    waveGeometry,
    new THREE.ShaderMaterial({ vertexShader: WAVE_VERTEX, fragmentShader: WAVE_FRAGMENT, uniforms: waveUniforms, side: THREE.DoubleSide })
  );
  wave.frustumCulled = false;

  // Closed ends so the wave reads as a solid body of water from any angle.
  const capGeometry = new THREE.PlaneGeometry(1, 1, 8, 60);
  capGeometry.translate(0.5, 0.5, 0); // uv.x = across the thickness, uv.y = height fraction
  const caps = [-1, 1].map((side) => {
    const capUniforms = { ...waveUniforms, uCap: { value: side } };
    const cap = new THREE.Mesh(
      capGeometry,
      new THREE.ShaderMaterial({ vertexShader: WAVE_VERTEX, fragmentShader: WAVE_FRAGMENT, uniforms: capUniforms, side: THREE.DoubleSide })
    );
    cap.frustumCulled = false;
    return cap;
  });

  const sprayCount = 420;
  const seeds = new Float32Array(sprayCount * 3);
  for (let i = 0; i < seeds.length; i += 1) seeds[i] = Math.random();
  const sprayGeometry = new THREE.BufferGeometry();
  sprayGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(sprayCount * 3), 3));
  sprayGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
  const spray = new THREE.Points(
    sprayGeometry,
    new THREE.ShaderMaterial({
      vertexShader: SPRAY_VERTEX,
      fragmentShader: SPRAY_FRAGMENT,
      uniforms: waveUniforms,
      transparent: true,
      depthWrite: false,
    })
  );
  spray.frustumCulled = false;

  const waveGroup = new THREE.Group();
  waveGroup.add(wave, ...caps, spray);
  group.add(waveGroup);

  const state = { phase: 'wait', timer: 2, z: zFar, height: startHeight, enabled: true, breakProgress: 0 };
  let last = null;

  const update = (time) => {
    const dt = last === null ? 0 : Math.min(time - last, 0.1);
    last = time;
    sea.material.uniforms.uTime.value = time;
    waveUniforms.uTime.value = time;

    if (!state.enabled) {
      waveGroup.visible = false;
      return;
    }

    if (state.phase === 'wait') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'run';
        state.z = zFar;
      }
    } else if (state.phase === 'run') {
      state.z += speed * dt;
      const t = THREE.MathUtils.clamp((state.z - zFar) / (zNear - zFar), 0, 1);
      state.height = startHeight + (endHeight - startHeight) * t ** 1.4; // it swells as it closes in
      waveUniforms.uCurl.value = 1;
      if (t >= 1) {
        state.phase = 'break';
        state.breakProgress = 0;
      }
    } else {
      state.breakProgress += dt / 1.8;
      state.z += speed * 0.35 * dt;
      const u = Math.min(state.breakProgress, 1);
      state.height = endHeight * (1 - u) ** 1.6; // it crashes down and dissolves
      waveUniforms.uCurl.value = 1 + 2.5 * u;
      if (u >= 1) {
        state.phase = 'wait';
        state.timer = waitSeconds;
      }
    }

    waveGroup.visible = state.phase !== 'wait';
    waveGroup.position.z = state.z;
    waveUniforms.uHeight.value = Math.max(state.height, 0.01);
  };

  /** Waves can be switched off (the "Disable Waves" button); the sea stays. */
  const setEnabled = (enabled) => {
    state.enabled = enabled;
    if (!enabled) {
      state.phase = 'wait';
      state.timer = 2;
      waveGroup.visible = false;
    }
  };

  return { group, update, setEnabled, state };
}
