import * as THREE from 'three';

/**
 * Bright daytime sky dome: deep blue overhead fading to a hazy white horizon,
 * with slow-drifting clouds. It follows the camera so it is always at infinity.
 * Colours are written as display values and converted to linear on output, since
 * the game renders through a post-processing chain that re-encodes them.
 */

const VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * viewMatrix * vec4(position + cameraPosition, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uTime;
varying vec3 vDir;
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
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + 11.7;
    a *= 0.5;
  }
  return v;
}
void main() {
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 horizon = vec3(0.93, 0.975, 1.0);
  vec3 mid = vec3(0.56, 0.82, 1.0);
  vec3 top = vec3(0.26, 0.6, 0.98);
  vec3 col = mix(horizon, mid, smoothstep(0.0, 0.3, h));
  col = mix(col, top, smoothstep(0.25, 0.95, h));

  // Clouds: fbm noise projected onto a plane overhead, brighter on their tops.
  vec2 cuv = vDir.xz / (abs(vDir.y) + 0.2) * 0.8 + vec2(uTime * 0.004, 0.0);
  float n = fbm(cuv * 1.4);
  float cloud = smoothstep(0.5, 0.82, n) * smoothstep(0.03, 0.28, h);
  vec3 cloudColor = mix(vec3(0.82, 0.9, 1.0), vec3(1.0), smoothstep(0.5, 0.9, n));
  col = mix(col, cloudColor, cloud * 0.92);

  gl_FragColor = vec4(pow(col, vec3(2.2)), 1.0);
}
`;

export function createSky() {
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  sky.userData.update = (time) => {
    material.uniforms.uTime.value = time;
  };
  return sky;
}
