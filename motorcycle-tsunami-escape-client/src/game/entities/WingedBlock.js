import * as THREE from 'three';
import { SIGN_FONT } from './Sign.js';

/**
 * A winged lucky block, built from art cut out of the reference screenshots: the picture is split into
 * left wing, body and right wing so the wings flap about the shoulders while the body bobs, with a name /
 * rarity / price label above it and a flat shadow (`shadow`) for the ground below.
 *
 * `def`: name, rarity, price, art (image url), size [w, h] and split [bodyLeft, bodyRight] in art pixels, and
 * optionally rarityColor or rarityFill [top, bottom], tag ("OP!"), coin (green coin instead of the trophy)
 * and glow (colour of a soft halo behind the wings).
 */

const FONT = SIGN_FONT;
const WING_OVERLAP = 20; // art pixels a wing reaches in under the body, so the flap leaves no gap
const FLAP = 0.24; // wing swing, radians
const SHADOW_OPACITY = 0.42;
const INK = '#0d1626';

const paint = (ctx, fill, y, size) => {
  if (!Array.isArray(fill)) return fill;
  const gradient = ctx.createLinearGradient(0, y - size * 0.5, 0, y + size * 0.5);
  gradient.addColorStop(0, fill[0]);
  gradient.addColorStop(1, fill[1]);
  return gradient;
};

const outlined = (ctx, text, x, y, size, fill, lineWidth, maxWidth, stroke = INK) => {
  ctx.font = `800 ${size}px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillStyle = paint(ctx, fill, y, size);
  ctx.fillText(text, x, y, maxWidth);
};

/** Small gold trophy with a red-orange base, drawn left of the price. */
function drawTrophy(ctx, cx, cy, s) {
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.14;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffb81f';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.42, cy - s * 0.5);
  ctx.lineTo(cx + s * 0.42, cy - s * 0.5);
  ctx.quadraticCurveTo(cx + s * 0.42, cy + s * 0.2, cx, cy + s * 0.25);
  ctx.quadraticCurveTo(cx - s * 0.42, cy + s * 0.2, cx - s * 0.42, cy - s * 0.5);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(cx + side * s * 0.44, cy - s * 0.25, s * 0.16, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : -Math.PI / 2, side < 0);
    ctx.stroke();
  }
  ctx.fillStyle = '#ffb81f';
  ctx.fillRect(cx - s * 0.07, cy + s * 0.25, s * 0.14, s * 0.18);
  ctx.fillStyle = '#e5482b';
  ctx.strokeRect(cx - s * 0.3, cy + s * 0.43, s * 0.6, s * 0.14);
  ctx.fillRect(cx - s * 0.3, cy + s * 0.43, s * 0.6, s * 0.14);
}

/** Green hexagon coin, used for the Divine block's price. */
function drawCoin(ctx, cx, cy, s) {
  const hexagon = (radius) => {
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = Math.PI / 6 + (i * Math.PI) / 3;
      ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    }
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineWidth = s * 0.16;
  ctx.strokeStyle = '#0c3a0c';
  hexagon(s * 0.5);
  ctx.stroke();
  const gradient = ctx.createLinearGradient(0, cy - s * 0.5, 0, cy + s * 0.5);
  gradient.addColorStop(0, '#b6ff4a');
  gradient.addColorStop(1, '#2fd21a');
  ctx.fillStyle = gradient;
  hexagon(s * 0.5);
  ctx.fill();
  ctx.lineWidth = s * 0.12;
  ctx.strokeStyle = '#1f8f12';
  hexagon(s * 0.22);
  ctx.stroke();
}

/** Name, rarity and price above a block (and the tag over the name, when there is one). */
function labelSprite(def, width) {
  const { name, rarity, rarityColor, rarityFill, price, coin, tag } = def;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 600;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (tag) outlined(ctx, tag, 512, 92, 92, ['#fff27a', '#ffb400'], 18, 300, '#2a1a00');
    outlined(ctx, name, 512, 192, 92, '#f6f0ff', 18, 880);
    outlined(ctx, rarity, 512, 312, 64, rarityFill ?? rarityColor, 14, 400);
    ctx.font = `800 84px ${FONT}`;
    const priceWidth = ctx.measureText(price).width;
    const iconWidth = 78;
    const startX = 512 - (iconWidth + priceWidth) / 2;
    if (coin) drawCoin(ctx, startX + iconWidth / 2 - 6, 412, 70);
    else drawTrophy(ctx, startX + iconWidth / 2 - 6, 410, 74);
    outlined(ctx, price, startX + iconWidth + priceWidth / 2, 412, 84, coin ? ['#d8ff5e', '#33d31a'] : '#ffe9a6', 16, undefined, coin ? '#0c3a0c' : INK);
    texture.needsUpdate = true;
  };
  draw();
  // Redraw once the web font is available so the text is not stuck in the fallback face.
  document.fonts?.load(`800 92px ${FONT}`).then(draw).catch(() => {});

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(width, (width * 600) / 1024, 1);
  return sprite;
}

let haloTexture = null;
const halo = () => {
  if (haloTexture) return haloTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  gradient.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  haloTexture = new THREE.CanvasTexture(canvas);
  return haloTexture;
};

/**
 * One side of a block: the art split into left wing, body and right wing sprites. `face` is { art, size, split, cubeY? }
 * (`cubeY` is the cube's top and bottom row in the art, so different arts can be lined up on the cube).
 */
function buildFace(face, unit, { volume = false, reverse = false, bodyDepth = 0 } = {}) {
  const [artWidth, artHeight] = face.size;
  const [bodyLeft, bodyRight] = face.split;

  // Each part is a column range of the art. Textures are filled in once the image has loaded.
  const textures = [];
  const partTexture = (from, to, part) => {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    // No mipmaps: shrinking the art would average the thin feather tips away.
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.repeat.set((to - from) / artWidth, 1);
    texture.offset.set(from / artWidth, 0);
    textures.push([texture, part]);
    return texture;
  };
  const parts = {
    left: { from: 0, to: bodyLeft + WING_OVERLAP, pivot: 1 },
    body: { from: bodyLeft, to: bodyRight, pivot: 0.5 },
    right: { from: bodyRight - WING_OVERLAP, to: artWidth, pivot: 0 },
  };
  for (const [key, part] of Object.entries(parts)) {
    part.texture = partTexture(part.from, part.to, key);
    part.width = (part.to - part.from) * unit;
    // World x of the sprite's pivot, relative to the block centre.
    part.x = (part.from + (part.to - part.from) * part.pivot - artWidth / 2) * unit;
  }
  new THREE.ImageLoader().load(face.art, (image) => {
    // The wings reach a little way in under the cube; paint that stretch with the wing's own colour (the column
    // just outside the cube) so no cube edge peeks out when a wing swings.
    const wings = document.createElement('canvas');
    wings.width = image.width;
    wings.height = image.height;
    const wingCtx = wings.getContext('2d');
    wingCtx.drawImage(image, 0, 0);
    for (let x = bodyLeft; x < bodyLeft + WING_OVERLAP; x += 1) wingCtx.drawImage(image, bodyLeft - 1, 0, 1, image.height, x, 0, 1, image.height);
    for (let x = bodyRight - WING_OVERLAP; x < bodyRight; x += 1) wingCtx.drawImage(image, bodyRight, 0, 1, image.height, x, 0, 1, image.height);
    for (const [texture, part] of textures) {
      texture.image = part === 'body' ? image : wings;
      texture.needsUpdate = true;
    }
  });

  const height = artHeight * unit;
  const group = new THREE.Group();
  // Lift or lower the art so the cube's centre sits at the group's origin.
  if (face.cubeY) group.position.y = ((face.cubeY[0] + face.cubeY[1]) / 2 - artHeight / 2) * unit;

  const boxDepth = (bodyRight - bodyLeft) * unit * 0.58;
  const frontZ = reverse ? -bodyDepth - 0.025 : 0.025;
  if (volume) {
    const boxHeight = (face.cubeY ? face.cubeY[1] - face.cubeY[0] : bodyRight - bodyLeft) * unit;
    const baseColor = face.rarityColor ?? 0xffb52c;
    const body = new THREE.Mesh(
      new THREE.BoxGeometry((bodyRight - bodyLeft) * unit, boxHeight, boxDepth),
      new THREE.MeshStandardMaterial({ color: baseColor, roughness: 0.56, metalness: 0.12, emissive: baseColor, emissiveIntensity: 0.1 }),
    );
    body.position.set(parts.body.x, 0, -boxDepth / 2);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
  }

  const pivots = {};
  for (const [key, part] of Object.entries(parts)) {
    // These are world-facing planes, not camera-facing sprites. Sprites stay flat toward
    // the camera, which makes the wings slide across the body when orbiting the camera.
    const pivot = new THREE.Group();
    pivot.position.x = part.x;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(part.width, height),
      new THREE.MeshBasicMaterial({ map: part.texture, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    );
    mesh.position.x = part.pivot === 0 ? part.width / 2 : part.pivot === 1 ? -part.width / 2 : 0;
    mesh.position.z = frontZ;
    mesh.renderOrder = key === 'body' ? 2 : 1;
    pivot.add(mesh);
    group.add(pivot);
    pivots[key] = pivot;
  }
  // Each wing plane rotates in the block's own plane around its shoulder.
  const swing = (key, side, angle) => {
    const part = parts[key];
    const pivot = pivots[key];
    const turn = side * angle;
    pivot.position.set(part.shoulder, 0, frontZ);
    pivot.rotation.z = turn;
  };
  parts.left.shoulder = (bodyLeft - artWidth / 2) * unit + WING_OVERLAP * unit; // where the wing meets the body
  parts.right.shoulder = (bodyRight - artWidth / 2) * unit - WING_OVERLAP * unit;
  pivots.body.position.x = parts.body.x;
  swing('left', -1, 0);
  swing('right', 1, 0);

  return { group, parts, height, flap: (angle) => { swing('left', -1, angle); swing('right', 1, angle); } };
}

const worldPosition = new THREE.Vector3();
const facing = new THREE.Vector3();

/**
 * `width` is the block's wing tip to wing tip in world units; `labelWidth` the label's; `labelLift` how high its centre
 * sits above the block's. When `def.back` ({ art, size, split, cubeY }) is given the block is two-sided: `def` is the
 * face toward its local +z, and `back` shows when the camera is behind it (with the cube the same size on both).
 */
export function createWingedBlock(def, { width, labelWidth, labelLift }) {
  const unit = width / def.size[0]; // world units per art pixel
  const bodyDepth = (def.split[1] - def.split[0]) * unit * 0.58;
  const front = buildFace(def, unit, { volume: true });
  const back = def.back ? buildFace(
    def.back,
    (unit * (def.split[1] - def.split[0])) / (def.back.split[1] - def.back.split[0]),
    { reverse: true, bodyDepth },
  ) : null;

  const holder = new THREE.Group();
  const rig = new THREE.Group(); // bobs up and down; the wings and body ride on it
  holder.add(rig);
  rig.add(front.group);
  if (back) {
    back.group.visible = false;
    back.group.scale.x = -1; // seen from behind, the block's left and right are swapped: mirror where the pieces sit
    rig.add(back.group);
  }

  let haloSprite = null;
  if (def.glow) {
    haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: halo(), color: def.glow, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    haloSprite.scale.set(width * 1.2, front.height * 2.6, 1);
    haloSprite.renderOrder = 0;
    rig.add(haloSprite);
  }

  const label = labelSprite(def, labelWidth);
  label.position.y = labelLift;
  holder.add(label);

  // Flat silhouette for the ground (from the front art): wings pivot at the shoulders so they can fold with the flap.
  const shadow = new THREE.Group();
  const shadowMaterials = [];
  const shadowParts = {};
  for (const [key, part] of Object.entries(front.parts)) {
    const material = new THREE.MeshBasicMaterial({ map: part.texture, color: 0x000000, transparent: true, opacity: SHADOW_OPACITY, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    shadowMaterials.push(material);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(part.width, front.height), material);
    mesh.rotation.x = -Math.PI / 2; // lies flat; the top of the art points toward the back wall
    mesh.position.x = key === 'left' ? -part.width / 2 : key === 'right' ? part.width / 2 : 0;
    const pivot = new THREE.Group();
    pivot.position.x = part.x;
    pivot.add(mesh);
    shadow.add(pivot);
    shadowParts[key] = pivot;
  }

  /** `camera` (optional) decides which side of a two-sided block is shown. */
  const animate = (time, phase, camera) => {
    const bob = Math.sin(time * 1.6 + phase);
    rig.position.y = bob * 0.18;
    // Wings beat up and down together: a positive angle lifts both wing tips.
    const angle = Math.sin(time * 7 + phase) * FLAP;
    front.flap(angle);
    back?.flap(angle);
    shadowParts.left.scale.x = Math.cos(angle * 2.2);
    shadowParts.right.scale.x = Math.cos(angle * 2.2);
    for (const material of shadowMaterials) material.opacity = SHADOW_OPACITY - bob * 0.04; // lower block, darker shadow
    if (haloSprite) haloSprite.material.opacity = 0.62 + Math.sin(time * 3 + phase) * 0.12;
    if (back && camera) {
      holder.getWorldPosition(worldPosition);
      holder.getWorldDirection(facing); // where the block's front points
      const seenFromFront = facing.dot(camera.position.clone().sub(worldPosition)) >= 0;
      front.group.visible = seenFromFront;
      back.group.visible = !seenFromFront;
    }
  };

  return { holder, shadow, animate };
}
