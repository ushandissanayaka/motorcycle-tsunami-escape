import * as THREE from 'three';

/**
 * The LEGION Platform character, riding: tan skin, messy brown curly hair, blue-lens sunglasses, a lime-green
 * tee with white sleeve trim, khaki pants and white-and-red sneakers, all with the blocky pixel shading of the
 * reference art, plus an all-black open-face gaming helmet (glossy black shell, flipped-up tinted visor,
 * headset earcups with a chrome ring, mic boom, chrome trim and a LEGION badge) for the bike.
 */

const COLORS = {
  skin: ['#e8a675', '#f0b688', '#d99464'],
  hair: ['#6e3b20', '#8a4f2b', '#4d2714'],
  shirt: ['#a9e04c', '#c5f16c', '#8bc733'],
  trim: ['#f4f4f0'],
  pants: ['#b8936f', '#c9a684', '#a07d5c'],
  shell: 0x0c0d10,
  trimDark: 0x050506,
  accent: 0xc4c8d2,
};

/** Seeded random, so every rider gets the same pixel pattern. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pixelCanvas(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}

const cache = new Map();
const cached = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

/** Blocky pixel shading: mostly the base colour with scattered lighter and darker squares. */
function noiseTexture(key, [base, light, dark = base], seed, size = 8) {
  return cached(`noise:${key}`, () => pixelCanvas(size, (ctx) => {
    const rand = rng(seed);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const r = rand();
        ctx.fillStyle = r < 0.22 ? light : r > 0.84 ? dark : base;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }));
}

/** Skin with the small open mouth from the reference (the sunglasses are real 3D pieces). */
function faceTexture() {
  return cached('face', () => pixelCanvas(16, (ctx) => {
    const rand = rng(7);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const r = rand();
        ctx.fillStyle = r < 0.15 ? COLORS.skin[1] : r > 0.9 ? COLORS.skin[2] : COLORS.skin[0];
        ctx.fillRect(x, y, 1, 1);
      }
    }
    ctx.fillStyle = '#1a1210';
    ctx.fillRect(6, 11, 4, 3);
    ctx.fillStyle = '#3a1f18';
    ctx.fillRect(7, 12, 2, 1);
  }));
}

/** White sneaker with a red band and a white sole line, as in the reference. */
function shoeTexture() {
  return cached('shoe', () => pixelCanvas(8, (ctx) => {
    const rows = ['#e9eaee', '#f5f5f7', '#dcdde3', '#f5f5f7', '#c8342c', '#e04a3c', '#f5f5f7', '#8f2420'];
    rows.forEach((color, y) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, y, 8, 1);
    });
  }));
}

/** Blue sunglass lens: deep blue at the bottom fading to sky blue, with a white glint. */
function lensTexture() {
  return cached('lens', () => pixelCanvas(8, (ctx) => {
    const rows = ['#9fd4ff', '#7ab8ff', '#5a9cf2', '#3f7fe0', '#3470d0', '#2a5fbf', '#2455ae', '#1d479a'];
    rows.forEach((color, y) => {
      ctx.fillStyle = color;
      ctx.fillRect(0, y, 8, 1);
    });
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(1, 1, 2, 1);
  }));
}

/** Glossy black visor with a cool steel-grey sheen, like tinted motorcycle-helmet glass. */
function visorTexture() {
  return cached('visor', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 128, 32);
    g.addColorStop(0, '#3a3f4a');
    g.addColorStop(0.5, '#101216');
    g.addColorStop(1, '#050506');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(10, 5, 60, 4);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

/** Pale "LEGION" badge on the back of the helmet, like the light plate/emblem in the reference. */
function emblemTexture() {
  return cached('emblem', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.font = '900 44px "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,255,255,0.4)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = '#e6e8ee';
    ctx.fillText('LEGION', 128, 34);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  });
}

// `lift` adds a little self-illumination so the bright colours stay bright in shade.
const textured = (map, lift = 0.35, roughness = 0.7) =>
  new THREE.MeshStandardMaterial({ map, roughness, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: lift });
const solid = (color, { roughness = 0.5, metalness = 0, emissive = 0x000000, emissiveIntensity = 0 } = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness, emissive, emissiveIntensity });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/** Open-face gaming helmet, all black, sized for the 0.42 x 0.4 x 0.4 head centred at (0, headY, 0). */
function createHelmet(headY) {
  const helmet = new THREE.Group();
  const shell = solid(COLORS.shell, { roughness: 0.22, metalness: 0.5 });
  const shellEdge = solid(COLORS.trimDark, { roughness: 0.35, metalness: 0.35 });
  const chrome = solid(COLORS.accent, { roughness: 0.3, metalness: 0.75 });
  const top = headY + 0.2;

  // Shell: crown, rounded cap, back and sides, leaving the face open.
  helmet.add(box(0.54, 0.2, 0.52, shell, 0, top + 0.06, 0.02));
  helmet.add(box(0.46, 0.06, 0.44, shell, 0, top + 0.19, 0.03));
  helmet.add(box(0.54, 0.38, 0.1, shell, 0, headY + 0.03, 0.23));
  for (const side of [-1, 1]) {
    helmet.add(box(0.06, 0.34, 0.46, shell, side * 0.27, headY + 0.05, 0.01));
    // Chin strap under the jaw.
    helmet.add(box(0.03, 0.2, 0.04, shellEdge, side * 0.215, headY - 0.2, -0.04));
  }
  helmet.add(box(0.46, 0.03, 0.04, shellEdge, 0, headY - 0.29, -0.04));
  // Brow band above the face opening, with a thin chrome trim along its edge.
  helmet.add(box(0.56, 0.08, 0.07, shell, 0, top - 0.02, -0.23));
  helmet.add(box(0.5, 0.014, 0.012, chrome, 0, top - 0.06, -0.268));

  // Flipped-up black visor on hinges at the sides.
  const visor = new THREE.Mesh(
    new THREE.BoxGeometry(0.52, 0.14, 0.025),
    new THREE.MeshStandardMaterial({ map: visorTexture(), roughness: 0.12, metalness: 0.8 })
  );
  visor.position.set(0, top + 0.1, -0.27);
  visor.rotation.x = -0.55;
  helmet.add(visor);

  // Thin chrome trim: down the centre ridge, over the back, and along both sides.
  helmet.add(box(0.05, 0.01, 0.46, chrome, 0, top + 0.225, 0.03));
  helmet.add(box(0.05, 0.14, 0.01, chrome, 0, headY - 0.07, 0.285)); // below the emblem
  for (const side of [-1, 1]) {
    helmet.add(box(0.01, 0.016, 0.4, chrome, side * 0.301, top + 0.02, 0.02));
    // Low aero spoiler ridges along the back of the crown.
    const fin = box(0.025, 0.035, 0.2, shell, side * 0.12, top + 0.23, 0.14);
    fin.rotation.x = 0.2;
    helmet.add(fin);
  }

  // Gaming-headset earcups with a chrome ring.
  const cupGeometry = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 24);
  cupGeometry.rotateZ(Math.PI / 2);
  const ringGeometry = new THREE.TorusGeometry(0.085, 0.014, 8, 28);
  ringGeometry.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    const cup = new THREE.Mesh(cupGeometry, shellEdge);
    cup.position.set(side * 0.325, headY - 0.02, 0.03);
    helmet.add(cup);
    const ring = new THREE.Mesh(ringGeometry, chrome);
    ring.position.set(side * 0.362, headY - 0.02, 0.03);
    helmet.add(ring);
  }

  // Mic boom from the left earcup round to the corner of the mouth.
  const boom = box(0.02, 0.02, 0.26, shellEdge, -0.3, headY - 0.1, -0.12);
  boom.rotation.y = -0.45;
  helmet.add(boom);
  helmet.add(box(0.045, 0.045, 0.05, chrome, -0.2, headY - 0.1, -0.24));

  // LEGION badge on the back.
  const emblem = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.1),
    new THREE.MeshBasicMaterial({ map: emblemTexture(), transparent: true, depthWrite: false })
  );
  emblem.position.set(0, top - 0.05, 0.2851);
  helmet.add(emblem);

  return helmet;
}

/**
 * Blocky rider facing -Z (the game's forward). Origin is the hips; the body is standing-height above and
 * seated-pose legs hang below.
 */
export function createBlockyHuman() {
  const human = new THREE.Group();

  const skin = textured(noiseTexture('skin', COLORS.skin, 3), 0.35, 0.5);
  const shirt = textured(noiseTexture('shirt', COLORS.shirt, 11), 0.3, 0.75);
  const pants = textured(noiseTexture('pants', COLORS.pants, 19), 0.25, 0.85);
  const hair = textured(noiseTexture('hair', COLORS.hair, 23, 6), 0.15, 0.85);
  const trim = solid(COLORS.trim[0], { roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.35 });
  const shoe = textured(shoeTexture(), 0.3, 0.5);
  const sole = solid(0xf2f2f4, { roughness: 0.8, emissive: 0xffffff, emissiveIntensity: 0.2 });

  // Legs in a seated pose: thigh forward, shin down, sneaker at the end.
  // `breakPart` marks the pieces a wave breaks the rider into (see Shatter.js): each leg, arm, the head and
  // the helmet come off whole; 'show' ones land facing the camera, so the player sees their face and helmet.
  for (const side of [-1, 1]) {
    const x = side * 0.3; // outside the bike shell
    const leg = new THREE.Group();
    leg.userData.breakPart = true;
    leg.add(box(0.28, 0.28, 0.5, pants, x, -0.14, -0.22));
    leg.add(box(0.28, 0.3, 0.28, pants, x, -0.43, -0.33));
    leg.add(box(0.3, 0.14, 0.42, shoe, x, -0.65, -0.4));
    leg.add(box(0.31, 0.04, 0.43, sole, x, -0.72, -0.4));
    human.add(leg);
  }

  // Upper body leans slightly toward the handlebars.
  const upper = new THREE.Group();
  upper.rotation.x = -0.12;
  human.add(upper);
  upper.add(box(0.6, 0.6, 0.32, shirt, 0, 0.3, 0));

  // Head, with the face on its front (-Z) side; sunglasses and hair go with it.
  const headY = 0.82;
  const headGroup = new THREE.Group();
  headGroup.userData.breakPart = 'show';
  upper.add(headGroup);
  const face = textured(faceTexture(), 0.35, 0.5);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.4), [skin, skin, skin, skin, skin, face]); // +x -x +y -y +z -z
  head.position.y = headY;
  headGroup.add(head);

  // Sunglasses: black frame across the eyes with two blue lenses and arms back to the helmet.
  const frame = solid(0x0d0d10, { roughness: 0.3, metalness: 0.3 });
  const lens = new THREE.MeshStandardMaterial({ map: lensTexture(), roughness: 0.1, metalness: 0.4, emissive: 0xffffff, emissiveMap: lensTexture(), emissiveIntensity: 0.55 });
  headGroup.add(box(0.44, 0.1, 0.03, frame, 0, headY + 0.045, -0.215));
  for (const side of [-1, 1]) {
    headGroup.add(box(0.17, 0.065, 0.012, lens, side * 0.1, headY + 0.042, -0.234));
    headGroup.add(box(0.02, 0.03, 0.2, frame, side * 0.215, headY + 0.07, -0.12));
  }

  // Curly brown hair where the helmet doesn't cover it: curls spilling out at the temples, and at the sides and nape.
  const curls = [
    // x, y, z, w, h, d
    [-0.2, headY + 0.12, -0.21, 0.07, 0.09, 0.05],
    [-0.21, headY + 0.05, -0.2, 0.05, 0.07, 0.05],
    [0.2, headY + 0.12, -0.21, 0.07, 0.09, 0.05],
    [0.21, headY + 0.05, -0.2, 0.05, 0.07, 0.05],
    [-0.235, headY - 0.12, 0.06, 0.04, 0.1, 0.14],
    [0.235, headY - 0.12, 0.06, 0.04, 0.1, 0.14],
    [0, headY - 0.2, 0.225, 0.42, 0.07, 0.06],
  ];
  for (const [x, y, z, w, h, d] of curls) headGroup.add(box(w, h, d, hair, x, y, z));

  const helmet = createHelmet(headY);
  helmet.userData.breakPart = 'show';
  upper.add(helmet);

  // Arms reach forward to the handlebars: green sleeve, white trim, then a bare forearm and hand.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.userData.breakPart = true;
    shoulder.position.set(side * 0.43, 0.5, 0);
    shoulder.rotation.x = 1.1;
    shoulder.add(box(0.28, 0.32, 0.3, shirt, 0, -0.16, 0));
    shoulder.add(box(0.285, 0.05, 0.305, trim, 0, -0.33, 0));
    shoulder.add(box(0.24, 0.3, 0.26, skin, 0, -0.5, 0));
    upper.add(shoulder);
    arms.push(shoulder);
  }

  human.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  human.userData.arms = arms;
  return human;
}
