import * as THREE from 'three';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture, mulberry32 } from '../util/textures.js';

/**
 * The wave place: a long run of black asphalt slabs, level with the road,
 * separated by pits with a grey paved floor. The pits get longer the
 * further you go (`WAVE_TRACK.gapGrowth`), so riders have to clear bigger and
 * bigger gaps; a pit is a real drop (`WAVE_TRACK.pitDepth`) but a safe one: a bike
 * that misses lands unharmed on the floor and gets out by jumping at the wall. Slabs carry a yellow dashed
 * centre line, pits have a red trophy mat along the west wall and a yellow one along the east wall
 * (down on their floor, running lengthwise, against lavender pit walls), and pink-lavender curbs edge
 * both sides. Yellow "VIP" boards stand on random side walls. The far end is open to the sky.
 * Only the entrance edge glows red; `setWarning(true)` floods the whole track red, as when a wave is coming.
 */

const CURB = { base: '#d8c0e2', light: '#eddcf5', dark: '#a98fbc' };
const PAD_RED = 0xff3038;
const PAD_YELLOW = 0xffe62e;
const CURB_WIDTH = 2;
const SIDE_WALL_MIN_TOP = 5.5;
const SIDE_WALL_TOP_RANGE = 8; // wall tops step between MIN_TOP and MIN_TOP + this
const SIDE_WALL_WIDTH = 9;
const SIDE_WALL_CAP_WIDTH = 10.8;
const RED_FADE_LENGTH = 6; // red glow at the entrance edge, gone this far along the track
// Mats hug the side walls and run along the track, as in the zoomed-out reference: ~4.6 wide
// (just under a tenth of the track) and ~70% as long as their pit.
const PAD_WIDTH = 4.6;
const PAD_LENGTH_FRACTION = 0.7;
const PAD_WALL_INSET = 0.6; // gap between a mat and its side wall
const PIT_WALL_THICKNESS = 0.3; // lavender lining over the canyon rock, down in the pits
const DASH_WIDTH = 0.5;
const DASH_LENGTH = 4;
const DASH_SPACING = 8;
const SURFACE = 0.1; // height of the road surface, which the slab tops are flush with
// Red mats pay double but only open at this level; yellow mats can be returned from level 1.
export const RED_REWARD_LEVEL = 100;
// Yellow wins per pit: 1, 3, 8, 20 (as in the reference), then on at the same x2.5 pace. Red is double.
const yellowWins = (pit) => {
  let wins = 1;
  for (let i = 0; i < pit; i += 1) wins = Math.ceil(wins * 2.5);
  return wins;
};
const REWARD_LABEL_SIZE = { width: 5.2, height: 2.6, y: 1.9, inset: 0.7 }; // world units, over the mat (inset: toward the track centre, clear of the wall)
const RETURN_LABEL_SIZE = { width: 4.8, height: 1.2, y: 3.4 };
const VIP_PANEL = { width: 7, height: 5, chance: 0.45 }; // a VIP board on this share of slabs, on a random side
const LABEL_FONT = '"Lilita One", "Fredoka", "Arial Black", Arial, sans-serif';

/** A canvas texture drawn by `draw`, redrawn once the web fonts finish loading. */
function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  document.fonts?.ready.then(() => {
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
    texture.needsUpdate = true;
  });
  return texture;
}

/** Flat gold cup with a navy outline, as on the reference's reward boards. */
function drawTrophy(ctx, cx, top, h) {
  const u = h / 100;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#1f2a6b';
  ctx.lineWidth = 7 * u;
  const gold = ctx.createLinearGradient(0, top, 0, top + h);
  gold.addColorStop(0, '#ffe45c');
  gold.addColorStop(1, '#f5a000');
  ctx.fillStyle = gold;
  const shape = (path) => { ctx.beginPath(); path(); ctx.fill(); ctx.stroke(); };
  for (const side of [-1, 1]) {
    // Handles: loops out from the sides of the bowl.
    ctx.beginPath();
    ctx.ellipse(cx + side * 34 * u, top + 32 * u, 14 * u, 16 * u, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  shape(() => { // bowl
    ctx.moveTo(cx - 36 * u, top + 12 * u);
    ctx.lineTo(cx + 36 * u, top + 12 * u);
    ctx.quadraticCurveTo(cx + 34 * u, top + 58 * u, cx + 8 * u, top + 66 * u);
    ctx.lineTo(cx - 8 * u, top + 66 * u);
    ctx.quadraticCurveTo(cx - 34 * u, top + 58 * u, cx - 36 * u, top + 12 * u);
  });
  shape(() => ctx.rect(cx - 7 * u, top + 64 * u, 14 * u, 16 * u)); // stem
  shape(() => ctx.rect(cx - 26 * u, top + 80 * u, 52 * u, 16 * u)); // base
  ctx.fillStyle = '#e8661a'; // the cup's open mouth
  shape(() => ctx.ellipse(cx, top + 12 * u, 36 * u, 9 * u, 0, 0, Math.PI * 2));
  ctx.restore();
}

/** Outlined label text: `fill` over a dark stroke. */
function drawOutlinedText(ctx, text, x, y, size, fill, maxWidth) {
  ctx.font = `${size}px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.17;
  ctx.strokeStyle = '#1c1408';
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxWidth);
}

/** "+N Wins" over a flat gold trophy on a soft yellow glow band. */
function createRewardLabel(wins) {
  const texture = canvasTexture(512, 256, (ctx) => {
    ctx.save();
    ctx.filter = 'blur(10px)';
    const band = ctx.createLinearGradient(0, 0, 512, 0);
    band.addColorStop(0, 'rgba(255, 214, 40, 0)');
    band.addColorStop(0.2, 'rgba(255, 214, 40, 0.55)');
    band.addColorStop(0.8, 'rgba(255, 214, 40, 0.55)');
    band.addColorStop(1, 'rgba(255, 214, 40, 0)');
    ctx.fillStyle = band;
    ctx.fillRect(20, 78, 472, 116);
    ctx.restore();
    drawTrophy(ctx, 256, 22, 212);
    const text = ctx.createLinearGradient(0, 96, 0, 176);
    text.addColorStop(0, '#fff46a');
    text.addColorStop(1, '#ffbf1c');
    drawOutlinedText(ctx, `+${wins} ${wins === 1 ? 'Win' : 'Wins'}`, 256, 136, 96, text, 480);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(REWARD_LABEL_SIZE.width, REWARD_LABEL_SIZE.height, 1);
  sprite.position.y = REWARD_LABEL_SIZE.y;
  return sprite;
}

let returnTexture = null;
/** White "Return" tag shown over the rewards the rider can collect. */
function createReturnLabel() {
  returnTexture ??= canvasTexture(512, 128, (ctx) => drawOutlinedText(ctx, 'Return', 256, 66, 92, '#ffffff', 480));
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: returnTexture, transparent: true, depthWrite: false }));
  sprite.scale.set(RETURN_LABEL_SIZE.width, RETURN_LABEL_SIZE.height, 1);
  sprite.position.y = RETURN_LABEL_SIZE.y;
  return sprite;
}

let vipTexture = null;
/** Yellow board with an orange italic "VIP", as on the reference's canyon walls. */
function vipBoardTexture() {
  vipTexture ??= canvasTexture(512, 366, (ctx) => {
    ctx.fillStyle = '#e3ca3c';
    ctx.fillRect(0, 0, 512, 366);
    ctx.font = 'italic 900 190px "Montserrat", "Arial Black", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(150, 70, 0, 0.45)';
    ctx.shadowOffsetX = 4;
    ctx.shadowOffsetY = 6;
    ctx.shadowBlur = 4;
    const orange = ctx.createLinearGradient(0, 100, 0, 270);
    orange.addColorStop(0, '#ffd23a');
    orange.addColorStop(1, '#ff7f0a');
    ctx.fillStyle = orange;
    ctx.fillText('VIP', 256, 190);
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c55a05';
    ctx.strokeText('VIP', 256, 190);
  });
  return vipTexture;
}

/**
 * Blends a material toward glowing red by distance from the track entrance, keeping its
 * studs visible: full red at `uRedFrom`, back to the normal colour `uRedLength` further north.
 */
function withEntranceRed(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying float vTrackZ;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTrackZ = (modelMatrix * vec4(transformed, 1.0)).z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vTrackZ;
uniform float uRedFrom;
uniform float uRedLength;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float redT = clamp((uRedFrom - vTrackZ) / uRedLength, 0.0, 1.0);
        float redAmount = pow(1.0 - redT, 1.4);
        float shade = dot(diffuseColor.rgb, vec3(0.333));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.02, 0.05) * (0.5 + 1.0 * shade), redAmount);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.34, 0.0, 0.02) * redAmount;`
      );
  };
  material.customProgramCacheKey = () => 'wave-entrance-red';
  return material;
}

export function createWaveTrack({ x0, x1, zStart, slabs, slabLength, slabGrowth, firstGap, gapGrowth, pitDepth }) {
  const group = new THREE.Group();
  const width = x1 - x0;
  const centerX = (x0 + x1) / 2;
  const solids = [];
  const pits = [];
  const surfaces = [];
  const rewards = [];
  let riderLevel = 1;
  const vipRandom = mulberry32(8123);
  const vipMaterial = new THREE.MeshStandardMaterial({ map: vipBoardTexture(), roughness: 0.7, emissive: 0xffffff, emissiveMap: vipBoardTexture(), emissiveIntensity: 0.25 });
  const vipBack = new THREE.MeshStandardMaterial({ color: 0xc9b02e, roughness: 0.8 });
  const padBase = new THREE.MeshStandardMaterial({ color: 0x3a3a46, roughness: 0.8 });
  // Slab tops sit flush with the main road (whose surface is at SURFACE, riders stand at 0).
  const slabTop = SURFACE;
  const floorTop = SURFACE - pitDepth;
  const columnHeight = pitDepth + SURFACE; // from the pit floor up to the slab surface
  const columnY = (SURFACE - pitDepth) / 2;
  const wallFoot = floorTop - 1.2; // side walls reach down below the track

  const redUniforms = { uRedFrom: { value: zStart + 2 }, uRedLength: { value: RED_FADE_LENGTH } };
  const asphalt = withEntranceRed(new THREE.MeshStandardMaterial({ map: makeStudTexture(PALETTES.asphalt, 61), roughness: 0.9 }), redUniforms);
  const curb = withEntranceRed(new THREE.MeshStandardMaterial({ map: makeStudTexture(CURB, 62), roughness: 0.85, emissive: 0x9a86ad, emissiveIntensity: 0.2 }), redUniforms);
  const hollowFloor = withEntranceRed(new THREE.MeshStandardMaterial({ map: makePaverTexture(PALETTES.paver, 63), roughness: 0.85, emissive: 0x9a93b8, emissiveIntensity: 0.25 }), redUniforms);
  const canyonRock = new THREE.MeshStandardMaterial({ map: makeStudTexture({ base: '#dc7c6e', light: '#f5a294', dark: '#b45a52' }, 71), roughness: 0.95 });
  const canyonGrass = new THREE.MeshStandardMaterial({ map: makeStudTexture({ base: '#6ccb4b', light: '#93e46f', dark: '#3f9c32' }, 72), roughness: 0.9 });
  const dashMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c928, emissive: 0x4a3a00 });

  const box = (w, h, d, material, x, y, z, tile = 6) => {
    const mesh = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(w, h, d), tile), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Low canyon walls continue with every new slab and pit, keeping the end of the run open to the sky.
  const sideWalls = (startZ, endZ, floorY, wallTops) => {
    for (const [index, side] of [-1, 1].entries()) {
      const wallX = centerX + side * (width / 2 + SIDE_WALL_WIDTH / 2 - 0.15);
      let cursor = startZ;
      let chunkIndex = 0;
      while (cursor > endZ) {
        // Short, overlapping chunks make a continuous wall with stepped, varied-height green tops.
        const chunkDepth = Math.min(9 + ((chunkIndex * 7 + index * 5) % 7), cursor - endZ);
        const nextZ = cursor - chunkDepth;
        const midZ = (cursor + nextZ) / 2;
        const step = Math.sin(chunkIndex * 1.9 + index * 2.4) * 2.4;
        const wallTop = THREE.MathUtils.clamp(wallTops[index] + step, SIDE_WALL_MIN_TOP, SIDE_WALL_MIN_TOP + SIDE_WALL_TOP_RANGE);
        const wallHeight = wallTop - floorY;
        const overlap = chunkIndex === 0 ? 0.25 : 0.5;
        box(SIDE_WALL_WIDTH, wallHeight, chunkDepth + overlap, canyonRock, wallX, floorY + wallHeight / 2, midZ, 4.5);
        box(SIDE_WALL_CAP_WIDTH, 0.8, chunkDepth + overlap, canyonGrass, wallX, wallTop + 0.4, midZ, 4.5);
        cursor = nextZ;
        chunkIndex += 1;
      }
    }
  };

  let z = zStart; // south edge of the next piece
  let generatedSlabs = 0;
  const generateNextSegment = () => {
    const i = generatedSlabs;
    const wallTops = [-1, 1].map((side, sideIndex) => (
      SIDE_WALL_MIN_TOP + (0.5 + 0.5 * Math.sin(i * 1.7 + sideIndex * 2.3)) * SIDE_WALL_TOP_RANGE
    ));
    const length = slabLength + slabGrowth * i; // slabs get longer, so the pits get further apart
    const zBack = z - length;
    const midZ = (z + zBack) / 2;

    // A slab is a solid block from the pit floor up to road level: its dark studded ends are the
    // pit walls, curbs run along its sides and a dashed line down its centre.
    box(width, columnHeight, length, asphalt, centerX, columnY, midZ);
    sideWalls(z, zBack, wallFoot, wallTops);
    solids.push({ minX: x0, maxX: x1, minZ: zBack, maxZ: z, bottom: floorTop, top: 0 });
    for (const side of [-1, 1]) {
      box(CURB_WIDTH, 0.06, length, curb, centerX + side * (width / 2 - CURB_WIDTH / 2), slabTop + 0.03, midZ);
    }
    for (let dz = z - DASH_LENGTH / 2 - 1; dz > zBack + DASH_LENGTH / 2; dz -= DASH_SPACING) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(DASH_WIDTH, DASH_LENGTH), dashMaterial);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(centerX, slabTop + 0.075, dz);
      group.add(dash);
    }
    if (vipRandom() < VIP_PANEL.chance) {
      // A VIP board flat on the canyon wall beside this slab, facing the track.
      const side = vipRandom() < 0.5 ? -1 : 1;
      const faceX = centerX + side * (width / 2 - 0.15);
      const boardZ = midZ + (vipRandom() - 0.5) * Math.max(0, length - VIP_PANEL.width - 2);
      const boardY = slabTop + 0.4 + VIP_PANEL.height / 2;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(VIP_PANEL.width, VIP_PANEL.height), vipMaterial);
      board.rotation.y = -side * Math.PI / 2;
      board.position.set(faceX - side * 0.26, boardY, boardZ);
      group.add(board);
      box(0.25, VIP_PANEL.height, VIP_PANEL.width, vipBack, faceX - side * 0.125, boardY, boardZ);
    }
    z = zBack;

    // The pit after each slab: the next segment can be generated before the rider reaches it.
    {
      const gap = firstGap + gapGrowth * i;
      const gapMid = z - gap / 2;
      pits.push({ minX: x0, maxX: x1, minZ: z - gap, maxZ: z, floor: -pitDepth });
      box(width, 0.1, gap, hollowFloor, centerX, floorTop - 0.05, gapMid, 4.8);
      sideWalls(z, z - gap, wallFoot, wallTops);
      for (const side of [-1, 1]) {
        // Lavender pit wall, just in front of the canyon rock (which starts 0.15 inside the track edge).
        box(PIT_WALL_THICKNESS, columnHeight - 0.02, gap, curb, centerX + side * (width / 2 - 0.15 - PIT_WALL_THICKNESS / 2), columnY - 0.01, gapMid, 4.5);
        box(CURB_WIDTH, 0.07, gap, curb, centerX + side * (width / 2 - CURB_WIDTH / 2), floorTop + 0.035, gapMid);
      }
      // Mats run lengthwise against the side walls and lengthen with the pit.
      const padDepth = gap * PAD_LENGTH_FRACTION;
      const padWidth = PAD_WIDTH;
      const yellow = yellowWins(i);
      for (const [xSide, materialColor, wins, sideName] of [
        [-1, PAD_RED, yellow * 2, 'red'],
        [1, PAD_YELLOW, yellow, 'yellow'],
      ]) {
        const padX = centerX + xSide * (width / 2 - PAD_WALL_INSET - padWidth / 2);
        const padZ = gapMid;
        const pickup = new THREE.Group();
        pickup.position.set(padX, floorTop + 0.08, padZ);
        // Glowing mat on a slightly larger dark base plate.
        const base = new THREE.Mesh(new THREE.BoxGeometry(padWidth + 0.4, 0.08, padDepth + 0.4), padBase);
        base.position.y = -0.04;
        pickup.add(base);
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(padWidth, 0.16, padDepth),
          new THREE.MeshStandardMaterial({ color: materialColor, emissive: materialColor, emissiveIntensity: 0.9, roughness: 0.4 })
        );
        pad.position.y = 0.06;
        pickup.add(pad);
        surfaces.push({
          minX: padX - padWidth / 2,
          maxX: padX + padWidth / 2,
          minZ: padZ - padDepth / 2,
          maxZ: padZ + padDepth / 2,
          top: floorTop + 0.22,
        });

        const rewardArt = new THREE.Group();
        rewardArt.position.x = -xSide * REWARD_LABEL_SIZE.inset;
        rewardArt.add(createRewardLabel(wins));
        const returnLabel = createReturnLabel();
        rewardArt.add(returnLabel);
        pickup.add(rewardArt);
        group.add(pickup);
        const reward = {
          id: `wave-reward-v5-${i + 1}-${sideName}`,
          wins,
          x: padX,
          z: padZ,
          floor: floorTop + 0.22,
          halfX: padWidth / 2,
          halfZ: padDepth / 2,
          group: pickup,
          rewardArt,
          returnLabel,
          requiredLevel: sideName === 'red' ? RED_REWARD_LEVEL : 1,
          claimed: false,
        };
        returnLabel.visible = riderLevel >= reward.requiredLevel;
        rewards.push(reward);
      }
      z -= gap;
    }
    generatedSlabs += 1;
  };

  // Build the visible starting run, then append sections as the rider approaches its end.
  for (let i = 0; i < slabs; i += 1) generateNextSegment();
  // Keep enough track ahead for the pulled-back camera, while still generating it during play.
  const ensureAhead = (playerZ, lookAhead = 220) => {
    while (z > playerZ - lookAhead) generateNextSegment();
  };

  // A warning stretches the red across the whole run instead of just the entrance.
  const setWarning = (active) => {
    redUniforms.uRedLength.value = active ? (zStart - z) * 2 : RED_FADE_LENGTH;
  };

  const rewardAt = (position) => rewards.find((reward) => (
    !reward.claimed
    && riderLevel >= reward.requiredLevel
    && Math.abs(position.x - reward.x) <= reward.halfX
    && Math.abs(position.z - reward.z) <= reward.halfZ
    && position.y >= reward.floor - 0.3
    && position.y <= reward.floor + 0.9
  )) ?? null;

  const collectReward = (id) => {
    const reward = rewards.find((item) => item.id === id && !item.claimed);
    if (!reward) return false;
    reward.claimed = true;
    reward.rewardArt.visible = false;
    return true;
  };

  /** Brings a collected trophy back so it can be collected again; called once the rider's back home. */
  const restoreReward = (id) => {
    const reward = rewards.find((item) => item.id === id);
    if (!reward) return;
    reward.claimed = false;
    reward.rewardArt.visible = true;
  };

  /** Shows "Return" on the rewards this level can collect (red ones open at RED_REWARD_LEVEL). */
  const setRiderLevel = (level) => {
    riderLevel = level;
    for (const reward of rewards) reward.returnLabel.visible = riderLevel >= reward.requiredLevel;
  };

  return {
    group, solids, pits, surfaces, rewards, rewardAt, collectReward, restoreReward, setRiderLevel,
    setWarning, ensureAhead,
    get zEnd() { return z; },
  };
}
