import * as THREE from 'three';

/**
 * A light breeze past the rider that tells how fast it is going: a few short, thin, faint streaks that slip
 * past the bike, barely there when riding slowly and a little stronger and quicker the faster it rides (and
 * gently on a training board). Kept deliberately subtle: a hint of speed, not a wind tunnel.
 *
 * Built to cost next to nothing: one mesh (one draw call) whose streaks are all moved in its vertex shader, so
 * each frame only two uniforms change. It is drawn all the time, even when the streaks are invisible, so its
 * shader is compiled while the game loads rather than the first time the rider speeds up. Add it to the
 * rider's group: the streaks run along the rider's heading.
 */
const STREAKS = 14;
const AHEAD = 3; // streaks appear this far ahead of the rider...
const BEHIND = 3.5; // ...and fade out this far behind it
const RADIUS = [0.7, 1.6]; // distance from the rider's middle, around the heading
const HEIGHT = 1.2; // the rider's middle
const LENGTH = [0.5, 1.2];
const WIDTH = [0.012, 0.025];
// Streak speed relative to the wind speed, one each, in steps of a quarter so that wrapping uFlow at a
// multiple of 4 never makes a streak jump.
const FLOW = [1, 2];
// Strength (0..1) rises with riding speed from SPEED_FROM to SPEED_FULL (units per second), steeply at first
// so even an ordinary ride shows a little breeze.
const SPEED_FROM = 2;
const SPEED_FULL = 55;
const MAX_STRENGTH = 0.4;
const WIND_PER_SPEED = 0.8;
const TRAINING_WIND = 16;
const TRAINING_STRENGTH = 0.25;
const EASE = 4; // per second
// Wind never blows faster than this (units per second): any faster and a streak jumps further between two
// frames than its own length, and the eye sees flicker instead of a streak slipping past.
const MAX_WIND = 22;

const VERTEX = /* glsl */ `
uniform float uFlow; // how far the wind has blown, in spans (AHEAD + BEHIND)
attribute vec2 aCorner; // x: across the streak (-1..1), y: along it (0 = head, 1 = tail)
attribute vec4 aStreak; // x, y around the heading; z: phase; w: speed
attribute vec2 aSize; // length, width
varying float vFade;
varying float vAcross;
void main() {
  float span = ${(AHEAD + BEHIND).toFixed(1)};
  float travel = fract(aStreak.z + uFlow * aStreak.w) * span; // 0 at the front, span at the back
  float z = -${AHEAD.toFixed(1)} + travel + aCorner.y * aSize.x;
  vec3 local = vec3(aStreak.x + aCorner.x * aSize.y, aStreak.y, z);
  // Fade in ahead, out behind, and toward the tail of each streak.
  float along = travel / span;
  vFade = smoothstep(0.0, 0.25, along) * (1.0 - smoothstep(0.65, 1.0, along)) * (1.0 - aCorner.y * 0.9);
  vAcross = aCorner.x;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
uniform float uStrength;
varying float vFade;
varying float vAcross;
void main() {
  float alpha = uStrength * vFade * (1.0 - vAcross * vAcross);
  gl_FragColor = vec4(vec3(1.0), alpha);
}
`;

const random = ([min, max]) => min + Math.random() * (max - min);

export function createWindStreaks() {
  const corners = [];
  const streaks = [];
  const sizes = [];
  const index = [];
  for (let i = 0; i < STREAKS; i += 1) {
    // To the sides of the rider, clear of the view straight over them from behind.
    const angle = Math.random() < 0.5 ? random([-2.6, -0.5]) : random([0.5, 2.6]);
    const radius = random(RADIUS);
    const flow = Math.round(random(FLOW) * 4) / 4;
    const streak = [Math.sin(angle) * radius, Math.max(0.15, HEIGHT + Math.cos(angle) * radius * 0.7), Math.random(), flow];
    const size = [random(LENGTH), random(WIDTH)];
    for (const [x, y] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) {
      corners.push(x, y);
      streaks.push(...streak);
      sizes.push(...size);
    }
    const base = i * 4;
    index.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const geometry = new THREE.BufferGeometry();
  // `position` is unused by the shader (it builds each vertex from the attributes below) but three.js wants one.
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(STREAKS * 4 * 3), 3));
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corners, 2));
  geometry.setAttribute('aStreak', new THREE.Float32BufferAttribute(streaks, 4));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 2));
  geometry.setIndex(index);

  const uniforms = { uFlow: { value: 0 }, uStrength: { value: 0 } };
  const mesh = new THREE.Mesh(geometry, new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  }));
  mesh.frustumCulled = false; // the shader places the streaks; the empty `position` says nothing about where
  mesh.renderOrder = 5;

  let strength = 0;
  /**
   * Per-frame. `speed` is how fast the rider is going (units per second), `trainingMultiplier` the training
   * board's multiplier while on one (0 otherwise).
   */
  const update = (deltaSeconds, speed, trainingMultiplier = 0) => {
    let wind;
    let target;
    if (trainingMultiplier > 0) {
      wind = TRAINING_WIND;
      target = TRAINING_STRENGTH;
    } else {
      wind = speed * WIND_PER_SPEED;
      target = MAX_STRENGTH * THREE.MathUtils.clamp((speed - SPEED_FROM) / (SPEED_FULL - SPEED_FROM), 0, 1) ** 0.6;
    }
    wind = Math.min(wind, MAX_WIND);
    strength += (target - strength) * (1 - Math.exp(-EASE * deltaSeconds));
    uniforms.uStrength.value = strength;
    // Wrapped (at a multiple of 4, see FLOW) so the shader's float stays precise over a long session.
    uniforms.uFlow.value = (uniforms.uFlow.value + (wind / (AHEAD + BEHIND)) * deltaSeconds) % 1000;
  };

  return { mesh, update };
}
