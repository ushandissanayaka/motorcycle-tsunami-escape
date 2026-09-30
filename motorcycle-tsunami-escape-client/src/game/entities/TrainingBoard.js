import * as THREE from 'three';
import { batchStatic } from '../util/staticBatch.js';

/** Deck footprint: rides in along X from the road side, monitor at the +X end. */
export const BOARD = { length: 8.2, width: 3.4, height: 1 };

const LABEL_FONT = '"Fredoka", "Lilita One", "Arial Black", Arial, sans-serif';

/**
 * One palette per board colour. `truss` is the lattice line colour on the frame; `label` colours the floating
 * banner (gradient text top/bottom, outline, band, bolt icon); `fx` sets the animated aura: `wisp` swirling
 * wind ribbons (`wispBlend` 'normal' for the white smoke of the 100x board), `bolts` flickering lightning,
 * `sparkle` star colour.
 */
const STYLES = {
  blue: {
    frame: 0x1f9bff, truss: 0x0a6fd6, deckLight: 0x59c6ff, deckDark: 0x2a95f0, post: 0x1f9bff, bezel: 0x2d6fe0,
    screen: { bg: 0x2f6dff, stud: 0x5b95ff, cols: 3, rows: 2 },
    glow: 0x3ad2ff,
    label: { top: '#9ef0ff', bottom: '#1fb2ff', outline: '#0b2552', band: '#38c8ff', bolt: '#4fd8ff' },
    fx: { wisp: 0x4fd4ff, wisps: 4, bolts: 0xbff6ff, sparkle: 0x9fefff },
  },
  yellow: {
    frame: 0xffa81c, truss: 0xd97c00, deckLight: 0xffd033, deckDark: 0xf59a10, post: 0xff9d16, bezel: 0xf08a0e,
    screen: { bg: 0xffa92b, stud: 0xffcb63, cols: 4, rows: 2 },
    glow: 0xffc93a,
    label: { top: '#fff08a', bottom: '#ffb300', outline: '#4a2600', band: '#f5a300', bolt: '#ffd21f' },
    fx: { wisp: 0xffc82a, wisps: 4, bolts: null, sparkle: 0xfff2a8 },
  },
  steel: {
    frame: 0x8a83a8, truss: 0x5f5980, deckLight: 0x9e98b8, deckDark: 0x1b3d5c, post: 0x7d76a0, bezel: 0x3a3752,
    screen: { bg: 0x2f63ff, stud: 0x5b8cff, cols: 3, rows: 2 },
    glow: 0x8a9bff,
    label: { top: '#f0f2ff', bottom: '#aeb8ec', outline: '#1b1e3a', band: '#6c75b8', bolt: '#b9c3ff' },
    fx: { wisp: 0x9aa6ff, wisps: 0, bolts: null, sparkle: 0xc9d0ff },
  },
  purple: {
    frame: 0x9a3fe0, truss: 0x6a1fb0, deckLight: 0xb15af0, deckDark: 0x7c2fc4, post: 0x8f37d6, bezel: 0x7226b8,
    screen: { bg: 0xa24ce8, stud: 0xc785fa, cols: 5, rows: 4 },
    glow: 0xc26bff,
    label: { top: '#ff8cf8', bottom: '#e81fe4', outline: '#43074f', band: '#d61ed8', bolt: '#a67bff' },
    fx: { wisp: 0xd43cff, wisps: 5, bolts: null, sparkle: 0xffd84a },
  },
  mono: {
    frame: 0xf2f2f6, truss: 0xa9a9b8, deckLight: 0xf4f4f6, deckDark: 0x16161a, post: 0x17171b, bezel: 0xf6f2ff,
    screen: { bg: 0x0e0e12, stud: 0x262630, cols: 4, rows: 3 },
    glow: 0xffffff,
    label: { top: '#ffffff', bottom: '#c9ccd6', outline: '#24262f', band: '#9095a4', bolt: '#eef0f7' },
    fx: { wisp: 0xf4f4fa, wisps: 6, wispBlend: 'normal', bolts: 0xffffff, sparkle: 0xffffff },
  },
};

const hex = (value) => `#${new THREE.Color(value).getHexString()}`;

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

/** Diamond-lattice (X-brace) pattern used on the frame and rails. */
function trussTexture(frame, truss) {
  return cached(`truss:${frame}:${truss}`, () => {
    const texture = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = hex(frame);
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = hex(truss);
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.lineTo(w, h);
      ctx.moveTo(w, 0); ctx.lineTo(0, h);
      ctx.stroke();
      ctx.lineWidth = 10;
      ctx.strokeRect(0, 0, w, h);
    });
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = 8;
    return texture;
  });
}

/** Monitor face: flat colour with a grid of raised square studs. */
function screenTexture({ bg, stud, cols, rows }) {
  return cached(`screen:${bg}:${stud}:${cols}x${rows}`, () =>
    canvasTexture(512, 288, (ctx, w, h) => {
      ctx.fillStyle = hex(bg);
      ctx.fillRect(0, 0, w, h);
      const cellW = w / cols;
      const cellH = h / rows;
      const pad = Math.min(cellW, cellH) * 0.16;
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const x = c * cellW + pad;
          const y = r * cellH + pad;
          ctx.fillStyle = 'rgba(0,0,0,0.28)';
          ctx.beginPath();
          ctx.roundRect(x + 4, y + 5, cellW - pad * 2, cellH - pad * 2, 12);
          ctx.fill();
          ctx.fillStyle = hex(stud);
          ctx.beginPath();
          ctx.roundRect(x, y, cellW - pad * 2, cellH - pad * 2, 12);
          ctx.fill();
        }
      }
    })
  );
}

/** A lightning-bolt icon, drawn inside the box (x, y, w, h). */
function boltPath(ctx, x, y, w, h) {
  const pts = [[0.62, 0], [0.08, 0.56], [0.44, 0.56], [0.28, 1], [0.92, 0.4], [0.56, 0.4], [0.8, 0]];
  ctx.beginPath();
  pts.forEach(([px, py], i) => (i ? ctx.lineTo(x + px * w, y + py * h) : ctx.moveTo(x + px * w, y + py * h)));
  ctx.closePath();
}

/**
 * Floating "9x Speed" banner as in the reference: a soft coloured band that fades at both ends, a lightning
 * bolt rising behind the text, and chunky rounded text with a top-to-bottom gradient and a thick dark outline.
 */
function drawLabel(ctx, w, h, text, { top, bottom, outline, band, bolt }) {
  ctx.clearRect(0, 0, w, h);
  const bandTop = h * 0.44;
  const bandHeight = h * 0.46;
  const gradient = ctx.createLinearGradient(0, 0, w, 0);
  gradient.addColorStop(0, `${band}00`);
  gradient.addColorStop(0.16, `${band}c8`);
  gradient.addColorStop(0.84, `${band}c8`);
  gradient.addColorStop(1, `${band}00`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, bandTop, w, bandHeight);

  ctx.lineJoin = 'round';
  boltPath(ctx, w / 2 - h * 0.2, h * 0.04, h * 0.4, h * 0.62);
  ctx.lineWidth = 12;
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.fillStyle = bolt;
  ctx.fill();

  let size = 118;
  ctx.font = `700 ${size}px ${LABEL_FONT}`;
  const fit = (w - 60) / ctx.measureText(text).width;
  if (fit < 1) size *= fit;
  ctx.font = `700 ${size}px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const textY = bandTop + bandHeight / 2 + 4;
  ctx.lineWidth = size * 0.2;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, w / 2, textY);
  const fill = ctx.createLinearGradient(0, textY - size / 2, 0, textY + size / 2);
  fill.addColorStop(0.1, top);
  fill.addColorStop(0.9, bottom);
  ctx.fillStyle = fill;
  ctx.fillText(text, w / 2, textY);
}

function labelTexture(text, colors) {
  let canvasRef;
  const texture = canvasTexture(768, 300, (ctx, w, h) => {
    canvasRef = ctx.canvas;
    drawLabel(ctx, w, h, text, colors);
  });
  // Redraw once the rounded display font has loaded (the first draw may fall back to Arial Black).
  document.fonts?.load(`700 64px ${LABEL_FONT}`).then(() => {
    drawLabel(canvasRef.getContext('2d'), canvasRef.width, canvasRef.height, text, colors);
    texture.needsUpdate = true;
  }).catch(() => {});
  return texture;
}

const softDot = () =>
  cached('softDot', () =>
    canvasTexture(64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    })
  );

/** Four-point twinkle star with a soft halo, for the sparkles. */
const starTexture = () =>
  cached('star', () =>
    canvasTexture(64, 64, (ctx, w, h) => {
      const c = w / 2;
      const halo = ctx.createRadialGradient(c, c, 0, c, c, c);
      halo.addColorStop(0, 'rgba(255,255,255,0.9)');
      halo.addColorStop(0.25, 'rgba(255,255,255,0.35)');
      halo.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 ? 5 : 30;
        ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    })
  );

const streakGradient = () =>
  cached('streak', () =>
    canvasTexture(128, 16, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    })
  );

// Swirling wind ribbon: a flat strip bent along an ellipse around the board. It orbits, its body ripples
// like a wave, it tapers at both ends and bright streaks run along it, so the board looks wrapped in a whirlwind.
const WISP_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uRx;
uniform float uRz;
uniform float uArc;
uniform float uSpeed;
uniform float uPhase;
uniform float uHeight;
uniform float uLift;
uniform float uWidth;
varying vec2 vUv;
void main() {
  float u = position.x + 0.5;
  float v = position.y + 0.5;
  float a = uPhase + uTime * uSpeed + u * uArc;
  float wave = sin(u * 9.0 - uTime * 4.0 + uPhase * 3.0);
  float r = 1.0 + 0.07 * wave;
  float thickness = uWidth * (0.25 + 0.75 * sin(3.14159265 * u));
  float y = uHeight + uLift * u + 0.16 * wave + (v - 0.5) * thickness;
  vUv = vec2(u, v);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(cos(a) * uRx * r, y, sin(a) * uRz * r, 1.0);
}
`;
const WISP_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uTime;
varying vec2 vUv;
void main() {
  float along = smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.6, 1.0, vUv.x));
  float across = pow(1.0 - abs(vUv.y - 0.5) * 2.0, 1.4);
  float streak = 0.6 + 0.4 * sin(vUv.x * 38.0 - uTime * 9.0 + vUv.y * 5.0);
  gl_FragColor = vec4(uColor, along * across * streak * uOpacity);
}
`;
const WISP_GEOMETRY = new THREE.PlaneGeometry(1, 1, 48, 1);

/** UVs scaled to world units so the lattice keeps its size on any box. */
function box(width, height, depth, material, tile = 0) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  if (tile) {
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
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  return mesh;
}

const solid = (color, roughness = 0.5) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.1, emissive: color, emissiveIntensity: 0.22 });

/**
 * Treadmill-style training board (Roblox "speed pad"): lattice frame with side rails, striped deck, a monitor
 * on a stand at the +X end, a floating "Nx Speed" banner (unless `banner` is false), and an animated aura (glow, speed streaks, swirling
 * wind ribbons, lightning and twinkling stars). `length` x `width` is the deck footprint and `height` scales
 * everything vertical. Position is the deck centre; the board is not rotated.
 */
export function createTrainingBoard({ multiplier, label, banner: showBanner = true, style = 'blue', position, length = BOARD.length, width = BOARD.width, height = BOARD.height }) {
  const s = STYLES[style] ?? STYLES.blue;
  const L = length;
  const W = width;
  const hs = height;
  // The monitor stand and banner grow with the deck: the wide boards get wide monitors, the narrow ones small.
  const sw = THREE.MathUtils.clamp(W / 3.4, 0.68, 2.2);
  const deckTop = 0.16 + 0.12 * hs;
  const railTop = deckTop + 0.3 * hs;
  const group = new THREE.Group();
  group.position.copy(position);

  const place = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const trussMaterial = new THREE.MeshStandardMaterial({ map: trussTexture(s.frame, s.truss), roughness: 0.5, metalness: 0.1, emissive: s.frame, emissiveIntensity: 0.2 });
  const postMaterial = solid(s.post);

  // Frame slab, side rails and the entry ramp.
  const slabTop = deckTop - 0.04;
  place(box(L, slabTop, W, trussMaterial, 1.2), 0, slabTop / 2, 0);
  for (const side of [-1, 1]) {
    place(box(L, railTop - slabTop, 0.3, trussMaterial, 1.2), 0, (railTop + slabTop) / 2, side * (W / 2 - 0.15));
  }
  const RAMP = 1.4;
  const ramp = place(box(RAMP, 0.08, W, trussMaterial, 1.2), -L / 2 - RAMP / 2 + 0.08, deckTop / 2, 0);
  ramp.rotation.z = Math.atan2(deckTop, RAMP);

  // Striped deck: alternating light and dark slats along the ride direction.
  const slats = 7;
  const slatWidth = (W - 0.6) / slats;
  const lightMaterial = solid(s.deckLight, 0.45);
  const darkMaterial = solid(s.deckDark, 0.45);
  for (let i = 0; i < slats; i += 1) {
    const z = -(W - 0.6) / 2 + slatWidth * (i + 0.5);
    place(box(L - 0.4, 0.06, slatWidth * 0.94, i % 2 ? darkMaterial : lightMaterial), 0, deckTop - 0.03, z);
  }

  // Raised studs along the top of both rails.
  const studCount = Math.floor((L - 0.6) / 0.7);
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), solid(new THREE.Color(s.frame).lerp(new THREE.Color(0xffffff), 0.35)), studCount * 2);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < studCount; i += 1) {
      matrix.setPosition(-L / 2 + 0.55 + i * 0.7, railTop + 0.04, side * (W / 2 - 0.15));
      studs.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  group.add(studs);

  // Monitor stand at the +X end: posts, cross-bar, bezel and studded screen, plus hand rails.
  const standX = L / 2 - 0.25;
  const postHeight = 1.9 * hs;
  const monitorY = deckTop + postHeight + 0.2 * hs;
  const monitorHeight = 1.6 * hs;
  for (const side of [-1, 1]) {
    place(box(0.2, postHeight, 0.2, postMaterial), standX, deckTop + postHeight / 2, side * 1.15 * sw);
    place(box(2.2, 0.16, 0.16, postMaterial), standX - 1.2, deckTop + 0.75 * hs, side * 1.15 * sw); // hand rail
    place(box(0.14, 0.75 * hs, 0.14, postMaterial), standX - 2.3, deckTop + 0.375 * hs, side * 1.15 * sw); // rail leg
  }
  place(box(0.2, 0.16, 2.5 * sw, postMaterial), standX, deckTop + 0.5 * hs, 0);
  place(box(0.14, monitorHeight, 2.75 * sw, solid(s.bezel, 0.4)), standX, monitorY, 0);
  const screen = place(
    new THREE.Mesh(new THREE.PlaneGeometry(2.4 * sw, monitorHeight * 0.84), new THREE.MeshBasicMaterial({ map: screenTexture(s.screen) })),
    standX - 0.075,
    monitorY,
    0
  );
  screen.rotation.y = -Math.PI / 2; // faces the riders (-X)

  // Glow under the deck.
  const glow = place(
    new THREE.Mesh(
      new THREE.PlaneGeometry(L + 2.4, W + 2),
      new THREE.MeshBasicMaterial({ map: softDot(), color: s.glow, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false })
    ),
    0,
    0.03,
    0
  );
  glow.rotation.x = -Math.PI / 2;

  // Speed streaks that sweep back along the deck.
  const streakMaterial = new THREE.MeshBasicMaterial({
    map: streakGradient(), color: s.glow, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const streaks = Array.from({ length: 7 }, (_, i) => {
    const streak = place(new THREE.Mesh(new THREE.PlaneGeometry(2.2 + (i % 3) * 0.6, 0.09), streakMaterial), 0, deckTop + 0.2 + (i / 7) * 0.9 * hs, (((i * 37) % 11) / 11 - 0.5) * (W - 0.8));
    streak.userData.phase = (i * 0.618) % 1;
    return streak;
  });

  // Swirling wind ribbons wrapped around the board, each on its own orbit, height, length and speed.
  const wisps = Array.from({ length: s.fx.wisps }, (_, i) => {
    const uniforms = {
      uTime: { value: 0 },
      uRx: { value: L / 2 + 0.5 + (i % 2) * 0.35 },
      uRz: { value: W / 2 + 0.45 + ((i + 1) % 2) * 0.3 },
      uArc: { value: 1.7 + (i % 3) * 0.45 },
      uSpeed: { value: 1.3 + (i % 3) * 0.35 },
      uPhase: { value: (i / Math.max(s.fx.wisps, 1)) * Math.PI * 2 },
      uHeight: { value: deckTop + (0.25 + ((i * 0.37) % 1) * 1.1) * hs },
      uLift: { value: 0.35 * hs },
      uWidth: { value: (0.35 + (i % 2) * 0.2) * hs },
      uColor: { value: new THREE.Color(s.fx.wisp) },
      uOpacity: { value: s.fx.wispBlend === 'normal' ? 0.7 : 0.85 },
    };
    const mesh = new THREE.Mesh(WISP_GEOMETRY, new THREE.ShaderMaterial({
      vertexShader: WISP_VERTEX,
      fragmentShader: WISP_FRAGMENT,
      uniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: s.fx.wispBlend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
    }));
    mesh.frustumCulled = false;
    group.add(mesh);
    return uniforms;
  });

  // Stable lightning arcs crackling up from the edges of the deck.
  const BOLT_COUNT = 3;
  const BOLT_SEGMENTS = 7;
  let bolts = null;
  if (s.fx.bolts) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(BOLT_COUNT * BOLT_SEGMENTS * 2 * 3), 3));
    const material = new THREE.LineBasicMaterial({ color: s.fx.bolts, transparent: true, opacity: 0.82, blending: THREE.AdditiveBlending, depthWrite: false });
    const lines = new THREE.LineSegments(geometry, material);
    lines.frustumCulled = false;
    group.add(lines);
    bolts = { geometry, material };
  }
  const regenerateBolts = () => {
    const positions = bolts.geometry.attributes.position;
    let k = 0;
    for (let b = 0; b < BOLT_COUNT; b += 1) {
      // Start on a random point of the deck's edge and zig-zag up and outward.
      const edge = Math.random();
      let x = edge < 0.5 ? (Math.random() - 0.5) * L : (Math.random() < 0.5 ? -1 : 1) * L / 2;
      let z = edge < 0.5 ? (Math.random() < 0.5 ? -1 : 1) * W / 2 : (Math.random() - 0.5) * W;
      let y = deckTop + Math.random() * 0.3;
      const out = new THREE.Vector2(x, z).normalize();
      for (let i = 0; i < BOLT_SEGMENTS; i += 1) {
        const nx = x + out.x * 0.15 + (Math.random() - 0.5) * 0.45;
        const nz = z + out.y * 0.15 + (Math.random() - 0.5) * 0.45;
        const ny = y + (0.12 + Math.random() * 0.22) * hs;
        positions.setXYZ(k++, x, y, z);
        positions.setXYZ(k++, nx, ny, nz);
        x = nx; y = ny; z = nz;
      }
    }
    positions.needsUpdate = true;
  };
  if (bolts) regenerateBolts();

  // Twinkling stars drifting up off the deck.
  const sparkleCount = Math.round(18 + 6 * sw);
  const sparklePositions = new Float32Array(sparkleCount * 3);
  const sparklePhases = Array.from({ length: sparkleCount }, (_, i) => ({
    x: (((i * 53) % 17) / 17 - 0.5) * (L + 0.6),
    z: (((i * 29) % 13) / 13 - 0.5) * (W + 0.6),
    phase: ((i * 0.381) % 1),
  }));
  const sparkleGeometry = new THREE.BufferGeometry();
  sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  const sparkleMaterial = new THREE.PointsMaterial({ map: starTexture(), color: s.fx.sparkle, size: 0.45 * Math.min(hs, 1.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkles = new THREE.Points(sparkleGeometry, sparkleMaterial);
  sparkles.frustumCulled = false;
  group.add(sparkles);

  // Floating banner above the monitor.
  if (showBanner) {
    const ls = THREE.MathUtils.clamp(sw, 0.8, 1.7);
    const banner = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(label, s.label), transparent: true, depthWrite: false }));
    banner.scale.set(4.4 * ls, 4.4 * ls * (300 / 768), 1);
    banner.position.set(standX - 0.6, monitorY + monitorHeight / 2 + 1.0 * ls, 0);
    group.add(banner);
  }

  const update = (time) => {
    glow.material.opacity = 0.42 + 0.14 * Math.sin(time * 3 + position.z);
    for (const streak of streaks) {
      const progress = (time * 0.9 + streak.userData.phase) % 1;
      streak.position.x = L / 2 - 1 - progress * (L - 1);
    }
    for (const uniforms of wisps) uniforms.uTime.value = time;
    const positions = sparkleGeometry.attributes.position;
    sparklePhases.forEach((p, i) => {
      positions.setXYZ(i, p.x, deckTop + 0.1 + ((time * 0.45 + p.phase) % 1) * 2 * hs, p.z);
    });
    positions.needsUpdate = true;
    sparkleMaterial.opacity = 0.75 + 0.25 * Math.sin(time * 9 + position.z);
  };

  group.userData = {
    type: 'boostPad',
    multiplier,
    label,
    halfSize: { x: L / 2, z: W / 2 },
    // Add rideable deck and ramp tops to the movement support map.
    surfaces: [
      { minX: position.x - L / 2, maxX: position.x + L / 2, minZ: position.z - W / 2, maxZ: position.z + W / 2, top: deckTop },
      {
        minX: position.x - L / 2 - RAMP,
        maxX: position.x - L / 2 + 0.08,
        minZ: position.z - W / 2,
        maxZ: position.z + W / 2,
        top: (x) => THREE.MathUtils.clamp((x - (position.x - L / 2 - RAMP)) / RAMP, 0, 1) * deckTop,
      },
    ],
    update,
  };
  // The deck, ramp, rails and monitor never move: one draw call per look. The animated glow, streaks,
  // bolts and sparkles stay separate.
  batchStatic(group, { exclude: [glow, ...streaks, sparkles] });
  return group;
}
