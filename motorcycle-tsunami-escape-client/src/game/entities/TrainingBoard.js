import * as THREE from 'three';

/** Deck footprint: rides in along X from the road side, monitor at the +X end. */
export const BOARD = { length: 10, width: 3.6 };

const DECK_TOP = 0.24;
const RAIL_TOP = 0.6;

// One palette per board colour. `truss` is the lattice line colour on the frame.
const STYLES = {
  blue: {
    frame: 0x1f9bff, truss: 0x0a6fd6, deckLight: 0x59c6ff, deckDark: 0x2a95f0, post: 0x1f9bff, bezel: 0x2b2a5a,
    screen: { bg: 0x2f6dff, stud: 0x5b95ff, cols: 3, rows: 2 },
    glow: 0x3ad2ff, labelColor: '#3fd0ff', labelBand: '#12a5e6',
  },
  yellow: {
    frame: 0xffa81c, truss: 0xd97c00, deckLight: 0xffd033, deckDark: 0xf59a10, post: 0xff9d16, bezel: 0xf08a0e,
    screen: { bg: 0xffa92b, stud: 0xffcb63, cols: 4, rows: 2 },
    glow: 0xffc93a, labelColor: '#ffd23a', labelBand: '#e08a00',
  },
  steel: {
    frame: 0x8a83a8, truss: 0x5f5980, deckLight: 0x9e98b8, deckDark: 0x1b3d5c, post: 0x7d76a0, bezel: 0x1c1c33,
    screen: { bg: 0x2f63ff, stud: 0x5b8cff, cols: 3, rows: 2 },
    glow: 0x8a9bff, labelColor: '#d5dcff', labelBand: '#5560a0',
  },
  purple: {
    frame: 0x9a3fe0, truss: 0x6a1fb0, deckLight: 0xb15af0, deckDark: 0x7c2fc4, post: 0x8f37d6, bezel: 0x7226b8,
    screen: { bg: 0xa24ce8, stud: 0xc785fa, cols: 5, rows: 4 },
    glow: 0xc26bff, labelColor: '#ff5cf0', labelBand: '#b021c8',
  },
  mono: {
    frame: 0x141418, truss: 0xf4f4f4, deckLight: 0xf2f2f2, deckDark: 0x17171b, post: 0x18181c, bezel: 0xfafafa,
    screen: { bg: 0x101014, stud: 0x2c2c34, cols: 4, rows: 3 },
    glow: 0xffffff, labelColor: '#ffffff', labelBand: '#666a78',
  },
};

const hex = (value) => `#${new THREE.Color(value).getHexString()}`;

function canvasTexture(size, width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width ?? size;
  canvas.height = height ?? size;
  draw(canvas.getContext('2d'), canvas.width, canvas.height);
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
    const texture = canvasTexture(128, 128, 128, (ctx, w, h) => {
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
    canvasTexture(0, 512, 288, (ctx, w, h) => {
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

/** Floating "9x Speed" banner: soft coloured band with outlined bold text. */
function labelTexture(text, color, band) {
  return canvasTexture(0, 512, 128, (ctx, w, h) => {
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, `${band}00`);
    gradient.addColorStop(0.2, `${band}dd`);
    gradient.addColorStop(0.8, `${band}dd`);
    gradient.addColorStop(1, `${band}00`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h * 0.18, w, h * 0.64);

    ctx.font = '900 76px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#10141f';
    ctx.strokeText(text, w / 2, h / 2 + 4, w - 40);
    ctx.fillStyle = color;
    ctx.fillText(text, w / 2, h / 2 + 4, w - 40);
  });
}

const softDot = () =>
  cached('softDot', () =>
    canvasTexture(64, 64, 64, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    })
  );

const streakGradient = () =>
  cached('streak', () =>
    canvasTexture(0, 128, 16, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.7, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    })
  );

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
 * Treadmill-style training board (Roblox "speed pad"): lattice frame with
 * side rails, striped deck, a monitor on a stand at the +X end, and a glowing
 * speed effect. Position is the deck centre; the board is not rotated.
 */
export function createTrainingBoard({ multiplier, label, style = 'blue', position }) {
  const s = STYLES[style] ?? STYLES.blue;
  const { length: L, width: W } = BOARD;
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
  place(box(L, 0.2, W, trussMaterial, 1.2), 0, 0.1, 0);
  for (const side of [-1, 1]) {
    place(box(L, RAIL_TOP - 0.2, 0.3, trussMaterial, 1.2), 0, (RAIL_TOP + 0.2) / 2, side * (W / 2 - 0.15));
  }
  const ramp = place(box(1.4, 0.08, W, trussMaterial, 1.2), -L / 2 - 0.62, 0.09, 0);
  ramp.rotation.z = 0.16;

  // Striped deck: alternating light and dark slats along the ride direction.
  const slats = 7;
  const slatWidth = (W - 0.6) / slats;
  const lightMaterial = solid(s.deckLight, 0.45);
  const darkMaterial = solid(s.deckDark, 0.45);
  for (let i = 0; i < slats; i += 1) {
    const z = -(W - 0.6) / 2 + slatWidth * (i + 0.5);
    place(box(L - 0.4, DECK_TOP - 0.2, slatWidth * 0.94, i % 2 ? darkMaterial : lightMaterial), 0, (DECK_TOP + 0.2) / 2, z);
  }

  // Raised studs along the top of both rails.
  const studCount = Math.floor((L - 0.6) / 0.7);
  const studs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.13, 0.13, 0.08, 10), solid(new THREE.Color(s.frame).lerp(new THREE.Color(0xffffff), 0.35)), studCount * 2);
  const matrix = new THREE.Matrix4();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < studCount; i += 1) {
      matrix.setPosition(-L / 2 + 0.55 + i * 0.7, RAIL_TOP + 0.04, side * (W / 2 - 0.15));
      studs.setMatrixAt(index, matrix);
      index += 1;
    }
  }
  group.add(studs);

  // Monitor stand at the +X end: posts, cross-bar, bezel and studded screen, plus hand rails.
  const standX = L / 2 - 0.25;
  for (const side of [-1, 1]) {
    place(box(0.2, 1.9, 0.2, postMaterial), standX, 1.15, side * 1.15);
    place(box(2.2, 0.16, 0.16, postMaterial), standX - 1.2, 0.95, side * 1.15); // hand rail
    place(box(0.14, 0.75, 0.14, postMaterial), standX - 2.3, 0.575, side * 1.15); // rail leg
  }
  place(box(0.2, 0.16, 2.5, postMaterial), standX, 0.7, 0);
  place(box(0.14, 1.6, 2.75, solid(s.bezel, 0.4)), standX, 2.35, 0);
  const screen = place(
    new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.35), new THREE.MeshBasicMaterial({ map: screenTexture(s.screen) })),
    standX - 0.075,
    2.35,
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
    const streak = place(new THREE.Mesh(new THREE.PlaneGeometry(2.2 + (i % 3) * 0.6, 0.09), streakMaterial), 0, 0.4 + (i / 7) * 0.9, (((i * 37) % 11) / 11 - 0.5) * (W - 0.8));
    streak.userData.phase = (i * 0.618) % 1;
    return streak;
  });

  // Sparkles drifting up off the deck.
  const sparkleCount = 20;
  const sparklePositions = new Float32Array(sparkleCount * 3);
  const sparklePhases = Array.from({ length: sparkleCount }, (_, i) => ({
    x: (((i * 53) % 17) / 17 - 0.5) * (L - 1),
    z: (((i * 29) % 13) / 13 - 0.5) * (W - 0.4),
    phase: ((i * 0.381) % 1),
  }));
  const sparkleGeometry = new THREE.BufferGeometry();
  sparkleGeometry.setAttribute('position', new THREE.BufferAttribute(sparklePositions, 3));
  const sparkles = new THREE.Points(
    sparkleGeometry,
    new THREE.PointsMaterial({ map: softDot(), color: s.glow, size: 0.35, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  sparkles.frustumCulled = false;
  group.add(sparkles);

  // Floating banner above the monitor.
  const banner = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(label, s.labelColor, s.labelBand), transparent: true, depthWrite: false }));
  banner.scale.set(4.2, 1.05, 1);
  banner.position.set(standX - 0.6, 4.3, 0);
  group.add(banner);

  const update = (time) => {
    glow.material.opacity = 0.42 + 0.14 * Math.sin(time * 3 + position.z);
    for (const streak of streaks) {
      const progress = (time * 0.9 + streak.userData.phase) % 1;
      streak.position.x = L / 2 - 1 - progress * (L - 1);
    }
    const positions = sparkleGeometry.attributes.position;
    sparklePhases.forEach((p, i) => {
      positions.setXYZ(i, p.x, 0.3 + ((time * 0.45 + p.phase) % 1) * 1.7, p.z);
    });
    positions.needsUpdate = true;
  };

  group.userData = { type: 'boostPad', multiplier, label, halfSize: { x: L / 2, z: W / 2 }, update };
  return group;
}
