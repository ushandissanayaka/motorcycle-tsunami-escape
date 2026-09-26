import * as THREE from 'three';
import { BIKES, requirementText, stepText } from '../../shared/constants.js';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';
import { createStoreBike } from './StoreBikes.js';

/**
 * Two-level bike store. Built in a local frame facing +Z (front) with the
 * origin at ground level in the middle of the building; `createBikeStore`
 * places it in the world (local +Z -> world +X, local +X -> world -Z).
 *
 *   upper level (floor y = 6):  4 win bikes | ramp landing | 3 Blood Moon bikes
 *   lower level (floor y = 0):  3 bikes      | ramp        | 3 bikes
 *
 * Every bike floats and bobs above a glowing pad: red = locked, yellow =
 * unlocked, green = equipped. Driving onto a pad calls `onPad(bike)`.
 */

const W = 36; // outer width
const WALL = 1.5;
const BACK_Z = -7.5;
const FRONT_Z = 7;
const SLAB_TOP = 6;
const SLAB_THICKNESS = 0.8;
const WALL_HEIGHT = 14.5;
const RAMP_WIDTH = 7;
const RAMP_TOP_Z = 3; // where the ramp reaches the upper floor
const RAMP_START_Z = 17; // where the ramp meets the ground

const PAD_Z = 2.5;
const BIKE_HEIGHT = 2.55; // wheel bottoms above the floor
const BIKE_Z = -1.2;

const HEADER_Y = SLAB_TOP + 5;

const PAD_COLORS = { locked: 0xff3038, unlocked: 0xffe62e, equipped: 0x35e454 };

// Pad x positions (local) per tier and slot, plus pad size and bike scale.
const SLOTS = {
  lower: [-14.2, -10.3, -6.4, 6.4, 10.3, 14.2].map((x) => ({ x, size: 3, scale: 1.45, label: 0.88 })),
  upper: [
    ...[-14.9, -11.8, -8.7, -5.6].map((x) => ({ x, size: 2.7, scale: 1.1, label: 0.69 })),
    ...[6.7, 10.7, 14.7].map((x) => ({ x, size: 3.2, scale: 1.5, label: 0.88 })),
  ],
};
const FLOOR_Y = { lower: 0, upper: SLAB_TOP };

const canvasSprite = (width, height, draw, scaleX, scaleY) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(scaleX, scaleY, 1);
  return sprite;
};

function outlinedText(ctx, text, x, y, font, fill, outline = '#0e1220', lineWidth = 12, maxWidth = 480) {
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxWidth);
}

/** "+250/Step" over "10,000 Wins Required". */
function createBikeLabel(bike) {
  return canvasSprite(512, 200, (ctx, w) => {
    outlinedText(ctx, stepText(bike), w / 2, 70, '900 92px "Arial Black", Arial, sans-serif', '#ffffff', '#0e1220', 12, 470);
    outlinedText(ctx, requirementText(bike), w / 2, 150, '800 46px Arial, sans-serif', '#ffe23d', '#0e1220', 9, 470);
  }, 4.4, 1.72);
}

function createHeader(text, color) {
  return canvasSprite(1024, 180, (ctx, w, h) => {
    outlinedText(ctx, text, w / 2, h / 2, '900 120px "Arial Black", Arial, sans-serif', color, '#1a0a12', 16, w - 60);
  }, 8, 1.4);
}

const glowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
};

function createPad({ size, floorY, x }) {
  const group = new THREE.Group();
  group.position.set(x, floorY, PAD_Z);

  const rim = new THREE.Mesh(new THREE.BoxGeometry(size + 0.35, 0.14, size + 0.35), new THREE.MeshStandardMaterial({ roughness: 0.5 }));
  rim.position.y = 0.07;
  const plate = new THREE.Mesh(new THREE.BoxGeometry(size, 0.22, size), new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0, emissiveIntensity: 0.35 }));
  plate.position.y = 0.2;
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(size * 2.3, size * 2.3),
    new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  group.add(rim, plate, glow);

  group.userData.setState = (state) => {
    const color = new THREE.Color(PAD_COLORS[state]);
    plate.material.color.copy(color);
    plate.material.emissive.copy(color);
    rim.material.color.copy(color).multiplyScalar(0.55);
    rim.material.emissive.copy(color).multiplyScalar(0.25);
    glow.material.color.copy(color);
  };
  return group;
}

export function createBikeStore({ position, bikes = BIKES }) {
  const group = new THREE.Group();
  group.position.copy(position);
  group.rotation.y = Math.PI / 2; // front (+Z local) faces +X

  // ---- materials ----------------------------------------------------------
  const studded = (palette, seed) => new THREE.MeshStandardMaterial({ map: makeStudTexture(palette, seed), roughness: 0.75 });
  const paved = (palette, seed) => new THREE.MeshStandardMaterial({ map: makePaverTexture(palette, seed), roughness: 0.9, emissive: 0x9a93b8, emissiveIntensity: 0 });
  const blue = studded(PALETTES.buildingBlue, 31);
  const interior = studded(PALETTES.interiorBlue, 32);
  interior.emissive = new THREE.Color(0x3a44a0);
  interior.emissiveIntensity = 0.35;
  const floor = paved(PALETTES.paver, 33);
  const roof = paved(PALETTES.roof, 34);
  const dark = new THREE.MeshStandardMaterial({ color: 0x1d2350, roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x6f97e8, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false });
  const neon = new THREE.MeshStandardMaterial({ color: 0x45d2ff, emissive: 0x45d2ff, emissiveIntensity: 2 });

  const add = (geometry, material, x, y, z, tile = 6) => {
    const mesh = new THREE.Mesh(applyWorldUV(geometry, tile), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  const box = (w, h, d, material, x, y, z, tile) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z, tile);

  // ---- shell --------------------------------------------------------------
  const depth = FRONT_Z - (BACK_Z - 0.5);
  const midZ = (FRONT_Z + BACK_Z - 0.5) / 2;
  box(W, WALL_HEIGHT, 1, interior, 0, WALL_HEIGHT / 2, BACK_Z); // back wall
  for (const s of [-1, 1]) {
    box(WALL, WALL_HEIGHT, depth, blue, s * (W / 2 - WALL / 2), WALL_HEIGHT / 2, midZ); // side walls
    // Big dark glass panes on the inner side of the upper level.
    box(0.1, 4.6, 10, glass, s * (W / 2 - WALL - 0.05), SLAB_TOP + 3.4, -1.5);
  }

  // Upper floor: two slabs either side of the ramp opening.
  const slabWidth = W / 2 - WALL - RAMP_WIDTH / 2;
  for (const s of [-1, 1]) {
    box(slabWidth, SLAB_THICKNESS, FRONT_Z - BACK_Z, floor, s * (RAMP_WIDTH / 2 + slabWidth / 2), SLAB_TOP - SLAB_THICKNESS / 2, (FRONT_Z + BACK_Z) / 2, 4);
    // Cyan light strip under the front edge, above each lower alcove.
    box(slabWidth, 0.18, 0.18, neon, s * (RAMP_WIDTH / 2 + slabWidth / 2), SLAB_TOP - SLAB_THICKNESS - 0.15, FRONT_Z - 0.05);
  }

  // Front window band and two-tier roof.
  const bandY = 13;
  box(W - 2 * WALL, 0.5, 0.5, dark, 0, bandY - 1.05, FRONT_Z + 0.2);
  const panes = 9;
  const paneWidth = (W - 2 * WALL) / panes;
  for (let i = 0; i < panes; i += 1) {
    const x = -(W - 2 * WALL) / 2 + paneWidth * (i + 0.5);
    box(paneWidth - 0.3, 1.9, 0.08, glass, x, bandY, FRONT_Z + 0.2);
    box(0.3, 2.1, 0.4, dark, x + paneWidth / 2, bandY, FRONT_Z + 0.2);
  }
  box(W + 2.4, 0.7, depth + 1.4, roof, 0, WALL_HEIGHT - 0.15, midZ + 0.5, 4);
  box(W + 1, 0.7, depth, roof, 0, WALL_HEIGHT + 0.55, midZ, 4);

  // Core + ramp: one solid prism between the two lower alcoves.
  const profile = new THREE.Shape();
  profile.moveTo(-BACK_Z, 0);
  profile.lineTo(-BACK_Z, SLAB_TOP);
  profile.lineTo(-RAMP_TOP_Z, SLAB_TOP);
  profile.lineTo(-RAMP_START_Z, 0);
  const prism = new THREE.ExtrudeGeometry(profile, { depth: RAMP_WIDTH, bevelEnabled: false });
  prism.rotateY(Math.PI / 2);
  prism.translate(-RAMP_WIDTH / 2, 0, 0);
  prism.computeVertexNormals();
  applyWorldUV(prism, 4);
  const rampMesh = new THREE.Mesh(prism, [blue, floor]);
  group.add(rampMesh);

  // ---- pads, bikes, labels --------------------------------------------------
  const entries = bikes
    .filter((bike) => SLOTS[bike.tier]?.[bike.slot])
    .map((bike) => {
      const slot = SLOTS[bike.tier][bike.slot];
      const floorY = FLOOR_Y[bike.tier];

      const pad = createPad({ size: slot.size, floorY, x: slot.x });
      group.add(pad);

      const model = createStoreBike(bike.id);
      const holder = new THREE.Group();
      holder.position.set(slot.x, floorY + BIKE_HEIGHT, BIKE_Z);
      holder.scale.setScalar(slot.scale);
      model.rotation.y = Math.PI / 2 + 0.3; // side-on, facing left, slightly toward the viewer
      holder.add(model);
      group.add(holder);

      const label = createBikeLabel(bike);
      label.position.set(slot.x, floorY + 1.6, PAD_Z - 1.4);
      label.scale.multiplyScalar(slot.label);
      group.add(label);

      return { bike, pad, holder, slot, floorY, phase: bike.slot * 0.9 + (bike.tier === 'upper' ? 1.3 : 0), state: null };
    });

  const header = createHeader('BLOOD MOON BIKES', '#ff3b6b');
  header.position.set(10.7, HEADER_Y, -1);
  group.add(header);

  // ---- world-space colliders ----------------------------------------------
  const bx = position.x;
  const bz = position.z;
  const toWorldRect = (x0, x1, z0, z1) => ({
    minX: bx + Math.min(z0, z1),
    maxX: bx + Math.max(z0, z1),
    minZ: bz - Math.max(x0, x1),
    maxZ: bz - Math.min(x0, x1),
  });
  const rampTop = (wx) => {
    const lz = wx - bx;
    if (lz <= RAMP_TOP_Z) return SLAB_TOP;
    if (lz >= RAMP_START_Z) return 0;
    return (SLAB_TOP * (RAMP_START_Z - lz)) / (RAMP_START_Z - RAMP_TOP_Z);
  };
  const solids = [
    { ...toWorldRect(-W / 2, -W / 2 + WALL, BACK_Z - 0.5, FRONT_Z), bottom: 0, top: WALL_HEIGHT },
    { ...toWorldRect(W / 2 - WALL, W / 2, BACK_Z - 0.5, FRONT_Z), bottom: 0, top: WALL_HEIGHT },
    { ...toWorldRect(-W / 2, W / 2, BACK_Z - 0.5, BACK_Z + 0.5), bottom: 0, top: WALL_HEIGHT },
    { ...toWorldRect(-RAMP_WIDTH / 2, RAMP_WIDTH / 2, BACK_Z - 0.5, RAMP_START_Z), bottom: 0, top: (wx) => rampTop(wx) },
    { ...toWorldRect(-W / 2 + WALL, -RAMP_WIDTH / 2, BACK_Z, FRONT_Z), bottom: SLAB_TOP - SLAB_THICKNESS, top: SLAB_TOP },
    { ...toWorldRect(RAMP_WIDTH / 2, W / 2 - WALL, BACK_Z, FRONT_Z), bottom: SLAB_TOP - SLAB_THICKNESS, top: SLAB_TOP },
  ];

  // ---- runtime ---------------------------------------------------------------
  const padCenter = (entry) => ({ x: bx + PAD_Z, z: bz - entry.slot.x });
  let activePad = null;

  /** `stateOf(bike)` returns 'locked' | 'unlocked' | 'equipped'. */
  const setStates = (stateOf) => {
    for (const entry of entries) {
      const state = stateOf(entry.bike);
      if (state !== entry.state) {
        entry.state = state;
        entry.pad.userData.setState(state);
      }
    }
  };

  const update = (time, player, onPad) => {
    for (const entry of entries) {
      const bob = Math.sin(time * 1.6 + entry.phase);
      entry.holder.position.y = entry.floorY + BIKE_HEIGHT + bob * 0.22;
      entry.holder.rotation.z = Math.sin(time * 1.1 + entry.phase) * 0.04;
    }
    if (!player) return;
    let standingOn = null;
    for (const entry of entries) {
      const c = padCenter(entry);
      const half = entry.slot.size / 2;
      if (Math.abs(player.position.x - c.x) < half && Math.abs(player.position.z - c.z) < half && Math.abs(player.position.y - entry.floorY) < 1.5) {
        standingOn = entry;
        break;
      }
    }
    if (standingOn?.bike.id !== activePad) {
      activePad = standingOn?.bike.id ?? null;
      if (standingOn) onPad?.(standingOn.bike);
    }
  };

  return { group, solids, setStates, update };
}
