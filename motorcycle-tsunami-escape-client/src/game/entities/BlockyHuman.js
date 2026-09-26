import * as THREE from 'three';

// Pale skin, orange hair, black jacket and pants, white gloves and striped sneakers.
const DEFAULT_OUTFIT = {
  skin: 0xf0e9e1,
  hair: 0xe8872b,
  hairLight: 0xf59d3e,
  hoodie: 0x15171c, // jacket
  jacketPanel: 0x24272f,
  pants: 0x0d0e13,
  pantsLine: 0x1c3a55,
  hand: 0xf7f7fb,
  shoes: 0xf4f4f4,
  soles: 0x8a8f9c,
};

let faceTexture;

/** Small dot eyes and a thin smile on the skin colour, shared by every avatar. */
function getFaceTexture(skin) {
  if (faceTexture) return faceTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = `#${new THREE.Color(skin).getHexString()}`;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = '#111';
  for (const x of [44, 84]) {
    ctx.beginPath();
    ctx.ellipse(x, 52, 5.5, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(42, 82);
  ctx.quadraticCurveTo(64, 102, 86, 82);
  ctx.stroke();

  faceTexture = new THREE.CanvasTexture(canvas);
  faceTexture.colorSpace = THREE.SRGBColorSpace;
  return faceTexture;
}

/** Black cloth with a fine dark-blue grid, for the pants. */
function plaidTexture(base, line) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(base).getHexString()}`;
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = `#${new THREE.Color(line).getHexString()}`;
  ctx.lineWidth = 3;
  for (let i = 0; i <= 64; i += 16) {
    ctx.beginPath();
    ctx.moveTo(i, 0); ctx.lineTo(i, 64);
    ctx.moveTo(0, i); ctx.lineTo(64, i);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** White sneaker with black horizontal stripes. */
function stripedShoeTexture(shoes) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `#${new THREE.Color(shoes).getHexString()}`;
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#15161b';
  for (let y = 6; y < 64; y += 12) ctx.fillRect(0, y, 64, 5);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// `lift` adds a little self-illumination so light colours stay bright in shade.
const mat = (color, roughness = 0.6, lift = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, emissive: color, emissiveIntensity: lift });

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Roblox-style blocky human, facing -Z (the game's forward). Origin is the
 * hips; the body is standing-height above and seated-pose legs hang below.
 * Use `outfit` to recolor: { skin, hair, hairLight, hoodie, jacketPanel,
 * pants, pantsLine, hand, shoes, soles }.
 */
export function createBlockyHuman(outfit = {}) {
  const o = { ...DEFAULT_OUTFIT, ...outfit };
  const human = new THREE.Group();

  const skin = mat(o.skin, 0.45, 0.45);
  const jacket = mat(o.hoodie, 0.75);
  const pants = new THREE.MeshStandardMaterial({ map: plaidTexture(o.pants, o.pantsLine), roughness: 0.85 });
  const hair = mat(o.hair, 0.8, 0.25);
  const hairLight = mat(o.hairLight, 0.8, 0.25);
  const glove = mat(o.hand, 0.5, 0.5);
  const shoeMap = stripedShoeTexture(o.shoes);
  const shoe = new THREE.MeshStandardMaterial({ map: shoeMap, roughness: 0.5, emissive: 0xffffff, emissiveMap: shoeMap, emissiveIntensity: 0.4 });

  // Legs in a seated pose: thigh forward, shin down, striped sneaker at the end.
  for (const side of [-1, 1]) {
    const x = side * 0.3; // outside the bike shell
    human.add(box(0.28, 0.28, 0.5, pants, x, -0.14, -0.22));
    human.add(box(0.28, 0.3, 0.28, pants, x, -0.43, -0.33));
    human.add(box(0.3, 0.14, 0.42, shoe, x, -0.65, -0.4));
    human.add(box(0.31, 0.04, 0.43, mat(o.soles, 0.9), x, -0.72, -0.4));
  }

  // Upper body leans slightly toward the handlebars.
  const upper = new THREE.Group();
  upper.rotation.x = -0.12;
  human.add(upper);

  upper.add(box(0.6, 0.6, 0.32, jacket, 0, 0.3, 0));
  upper.add(box(0.5, 0.42, 0.1, mat(o.jacketPanel, 0.8), 0, 0.32, 0.2)); // back panel
  upper.add(box(0.62, 0.05, 0.34, mat(o.jacketPanel, 0.8), 0, 0.02, 0)); // jacket hem

  // Head + hair.
  const faceMaterial = new THREE.MeshStandardMaterial({ map: getFaceTexture(o.skin), roughness: 0.45, emissive: 0xffffff, emissiveMap: getFaceTexture(o.skin), emissiveIntensity: 0.45 });
  const headMaterials = [skin, skin, skin, skin, skin, faceMaterial]; // +x -x +y -y +z -z
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.4, 0.4), headMaterials);
  head.position.y = 0.82;
  upper.add(head);

  upper.add(box(0.46, 0.12, 0.44, hair, 0, 1.06, 0.01)); // scalp cap
  upper.add(box(0.46, 0.3, 0.12, hair, 0, 0.98, 0.2)); // back of hair
  for (const side of [-1, 1]) upper.add(box(0.05, 0.22, 0.34, hair, side * 0.225, 0.98, 0.03)); // sideburns
  const tufts = [
    // x, y, z, rotX, rotZ, w, h, light?
    [-0.14, 1.16, -0.16, -0.5, 0.35, 0.16, 0.2, false],
    [0.02, 1.2, -0.12, -0.6, 0.0, 0.16, 0.24, true],
    [0.16, 1.15, -0.14, -0.45, -0.4, 0.16, 0.2, false],
    [-0.2, 1.14, 0.02, 0.0, 0.6, 0.14, 0.2, true],
    [0.2, 1.14, 0.04, 0.0, -0.6, 0.14, 0.2, false],
    [0.0, 1.16, 0.12, 0.5, 0.0, 0.18, 0.2, true],
  ];
  for (const [x, y, z, rx, rz, w, h, light] of tufts) {
    const tuft = box(w, h, 0.14, light ? hairLight : hair, x, y, z);
    tuft.rotation.set(rx, 0, rz);
    upper.add(tuft);
  }

  // Arms reach forward to the handlebars: jacket sleeve, then a white glove.
  const arms = [];
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.43, 0.5, 0);
    shoulder.rotation.x = 1.1;
    shoulder.add(box(0.26, 0.4, 0.28, jacket, 0, -0.2, 0));
    shoulder.add(box(0.3, 0.26, 0.32, glove, 0, -0.53, 0));
    upper.add(shoulder);
    arms.push(shoulder);
  }

  human.traverse((child) => {
    if (child.isMesh) child.castShadow = true;
  });
  human.userData.arms = arms;
  return human;
}
