import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture, mulberry32 } from '../util/textures.js';
import { batchStatic } from '../util/staticBatch.js';
import { formatShort, waveGapLength, waveSlabLength } from '../../shared/constants.js';

/**
 * The wave place: a long run of black asphalt slabs, level with the road,
 * separated by pits with a grey paved floor. The pits get longer the
 * further you go (`WAVE_TRACK.gapGrowth`), so riders have to clear bigger and
 * bigger gaps, and the slabs lengthen faster still (see waveSlabLength), so the pits, a rider's only shelter
 * from a wave, get further and further apart; a pit is a real drop (`WAVE_TRACK.pitDepth`) but a safe one: a bike
 * that misses lands unharmed on the floor and gets out by jumping at the wall. Slabs carry a yellow dashed
 * centre line, pits have a red trophy mat along the west wall and a yellow one along the east wall
 * (down on their floor, running lengthwise, against lavender pit walls), and pink-lavender curbs edge
 * both sides. Yellow "VIP" boards stand on random side walls. The far end is open to the sky.
 * Only the entrance edge glows red; `setWarning(true)` floods the whole track red, as when a wave is coming.
 */

const removeFrom = (array, item) => {
  const index = array.indexOf(item);
  if (index !== -1) array.splice(index, 1);
};

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
// A yellow mat worth more than this shows just its trophy, not its count: the count is told in a message
// when the rider collects it (see App.jsx).
export const HIDDEN_COUNT_OVER = 100;
// Yellow wins per pit: a small start (EARLY_WINS), then one more every second pit, so riding far out pays a little
// more each time instead of piling up wins fast enough to buy every bike at once. Red is double.
const EARLY_WINS = [1, 2, 3, 4];
const yellowWins = (pit) => (pit < EARLY_WINS.length
  ? EARLY_WINS[pit]
  : EARLY_WINS.at(-1) + Math.floor((pit - EARLY_WINS.length) / 2) + 1);
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

/** "+N Wins" (kept short: 18.7M) over a flat gold trophy on a soft yellow glow band, or the trophy alone. */
function createRewardLabel(wins, showCount = true) {
  const texture = canvasTexture(512, 256, (ctx) => {
    if (!showCount) {
      drawTrophy(ctx, 256, 22, 212);
      return;
    }
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
    drawOutlinedText(ctx, `+${formatShort(wins)} ${wins === 1 ? 'Win' : 'Wins'}`, 256, 136, 96, text, 480);
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

export function createWaveTrack({ x0, x1, zStart, pitDepth, ...track }) {
  const group = new THREE.Group();
  const width = x1 - x0;
  const centerX = (x0 + x1) / 2;
  const solids = [];
  const pits = [];
  const surfaces = [];
  const rewards = [];
  let riderLevel = 1;
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

  // Materials declared above are shared by every segment forever; a segment's own generated
  // geometry (and, for its reward pad, its own material and label texture) is what `update`
  // below has to free again, so it must never dispose one of these.
  const sharedMaterials = new Set([asphalt, curb, hollowFloor, canyonRock, canyonGrass, dashMaterial, vipMaterial, vipBack, padBase]);

  // Each slab+pit is built into its own group (added to `activeGroup`, retargeted per segment below)
  // so the whole thing can be detached and disposed in one go once the rider has left it far behind.
  let activeGroup = group;
  const box = (w, h, d, material, x, y, z, tile = 6) => {
    const mesh = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(w, h, d), tile), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    activeGroup.add(mesh);
    return mesh;
  };

  // Low canyon walls continue with every new slab and pit, in short overlapping chunks for a stepped,
  // varied-height green top. A slab-and-pit pair can need well over a hundred of these once the track
  // has grown deep into a long run, so rather than one draw call per chunk (as `box()` would give it),
  // each chunk's geometry is baked to its final world position and collected in `rockGeoms`/`capGeoms`;
  // the caller merges everything gathered for the segment into two meshes once it's done adding to them.
  const sideWalls = (startZ, endZ, floorY, wallTops, rockGeoms, capGeoms) => {
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
        rockGeoms.push(applyWorldUV(new THREE.BoxGeometry(SIDE_WALL_WIDTH, wallHeight, chunkDepth + overlap), 4.5)
          .translate(wallX, floorY + wallHeight / 2, midZ));
        capGeoms.push(applyWorldUV(new THREE.BoxGeometry(SIDE_WALL_CAP_WIDTH, 0.8, chunkDepth + overlap), 4.5)
          .translate(wallX, wallTop + 0.4, midZ));
        cursor = nextZ;
        chunkIndex += 1;
      }
    }
  };

  /** One mesh per material from geometries already baked to their world position (see `sideWalls`). */
  const mergeInto = (target, geometries, material) => {
    if (!geometries.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    target.add(mesh);
  };

  // The track is a fixed, endless sequence of segments (a slab and the pit after it): segment i's position
  // and look depend only on i, so any segment can be built, freed and built again later identically.
  // Only the ones near the rider exist at a time (see `update`), whichever way the rider is going,
  // including straight back to the start after a tsunami catches them or they collect a reward.
  /** South (entrance-side) edge of segment i; segment i runs from here north to segmentStart(i + 1). */
  const starts = [zStart]; // worked out once each, as far along as the rider has been
  const segmentStart = (i) => {
    while (starts.length <= i) {
      const k = starts.length - 1;
      starts.push(starts[k] - waveSlabLength(k, track) - waveGapLength(k, track));
    }
    return starts[i];
  };
  /** How many slabs a rider at `z` has fully passed: 0 before the track, i on slab i, i + 1 in the pit after it. */
  const slabsPassed = (z) => {
    if (z > zStart) return 0;
    let i = 0;
    while (segmentStart(i + 1) > z) i += 1;
    return z < segmentStart(i) - waveSlabLength(i, track) ? i + 1 : i;
  };
  const built = new Map(); // segment index -> { meshGroup, solid, pit, surfaces, rewards }
  const claimedRewards = new Set(); // reward ids collected and not yet restored, kept across rebuilds

  const buildSegment = (i) => {
    let z = segmentStart(i);
    const vipRandom = mulberry32(8123 + i * 7919);
    // This segment's own group, so its meshes can be detached and disposed as one unit later.
    const segmentGroup = new THREE.Group();
    group.add(segmentGroup);
    activeGroup = segmentGroup;
    const segmentSurfaces = [];
    const segmentRewards = [];
    // Every side-wall chunk for this segment (slab and pit both) lands in these two, merged into two
    // meshes once the segment is complete, instead of a draw call per chunk.
    const rockGeoms = [];
    const capGeoms = [];

    const wallTops = [-1, 1].map((side, sideIndex) => (
      SIDE_WALL_MIN_TOP + (0.5 + 0.5 * Math.sin(i * 1.7 + sideIndex * 2.3)) * SIDE_WALL_TOP_RANGE
    ));
    const length = waveSlabLength(i, track); // slabs get longer and longer, so the pits get further apart
    const zBack = z - length;
    const midZ = (z + zBack) / 2;

    // A slab is a solid block from the pit floor up to road level: its dark studded ends are the
    // pit walls, curbs run along its sides and a dashed line down its centre.
    box(width, columnHeight, length, asphalt, centerX, columnY, midZ);
    sideWalls(z, zBack, wallFoot, wallTops, rockGeoms, capGeoms);
    // The rideable bike model is wider/longer than its point collision position. Expand only the
    // falling-side blocker so the bike cannot visibly nose into the black slab's vertical face.
    const solid = { minX: x0, maxX: x1, minZ: zBack, maxZ: z, bottom: floorTop, top: 0, collisionMargin: 1.35 };
    solids.push(solid);
    for (const side of [-1, 1]) {
      box(CURB_WIDTH, 0.06, length, curb, centerX + side * (width / 2 - CURB_WIDTH / 2), slabTop + 0.03, midZ);
    }
    for (let dz = z - DASH_LENGTH / 2 - 1; dz > zBack + DASH_LENGTH / 2; dz -= DASH_SPACING) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(DASH_WIDTH, DASH_LENGTH), dashMaterial);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(centerX, slabTop + 0.075, dz);
      segmentGroup.add(dash);
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
      segmentGroup.add(board);
      box(0.25, VIP_PANEL.height, VIP_PANEL.width, vipBack, faceX - side * 0.125, boardY, boardZ);
    }
    z = zBack;

    // The pit after each slab: the next segment can be generated before the rider reaches it.
    {
      const gap = waveGapLength(i, track);
      const gapMid = z - gap / 2;
      const pit = { minX: x0, maxX: x1, minZ: z - gap, maxZ: z, floor: -pitDepth };
      pits.push(pit);
      box(width, 0.1, gap, hollowFloor, centerX, floorTop - 0.05, gapMid, 4.8);
      sideWalls(z, z - gap, wallFoot, wallTops, rockGeoms, capGeoms);
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
        const surface = {
          minX: padX - padWidth / 2,
          maxX: padX + padWidth / 2,
          minZ: padZ - padDepth / 2,
          maxZ: padZ + padDepth / 2,
          top: floorTop + 0.22,
        };
        surfaces.push(surface);
        segmentSurfaces.push(surface);

        const rewardArt = new THREE.Group();
        rewardArt.position.x = -xSide * REWARD_LABEL_SIZE.inset;
        rewardArt.add(createRewardLabel(wins, sideName !== 'yellow' || wins <= HIDDEN_COUNT_OVER));
        const returnLabel = createReturnLabel();
        rewardArt.add(returnLabel);
        pickup.add(rewardArt);
        segmentGroup.add(pickup);
        const id = `wave-reward-v5-${i + 1}-${sideName}`;
        const claimed = claimedRewards.has(id);
        rewardArt.visible = !claimed;
        const reward = {
          id,
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
          claimed,
        };
        returnLabel.visible = riderLevel >= reward.requiredLevel;
        rewards.push(reward);
        segmentRewards.push(reward);
      }
      z -= gap;
      mergeInto(segmentGroup, rockGeoms, canyonRock);
      mergeInto(segmentGroup, capGeoms, canyonGrass);
      // The slab, curbs, dashes, pit floor and pit walls never move: one draw call per material. The
      // reward pickups stay separate, since collecting one hides its label.
      batchStatic(segmentGroup, { exclude: segmentRewards.map((reward) => reward.group) });
      built.set(i, { meshGroup: segmentGroup, solid, pit, surfaces: segmentSurfaces, rewards: segmentRewards });
    }
    activeGroup = group;
  };

  const disposeSegment = (i) => {
    const segment = built.get(i);
    built.delete(i);
    group.remove(segment.meshGroup);
    segment.meshGroup.traverse((object) => {
      if (object.isMesh) {
        object.geometry.dispose();
        if (!sharedMaterials.has(object.material)) object.material.dispose();
      } else if (object.isSprite) {
        // Sprite geometry is a single instance three.js shares across every sprite in the app: never dispose it.
        const map = object.material.map;
        if (map && map !== returnTexture && map !== vipTexture) map.dispose();
        object.material.dispose();
      }
    });
    removeFrom(solids, segment.solid);
    removeFrom(pits, segment.pit);
    for (const surface of segment.surfaces) removeFrom(surfaces, surface);
    for (const reward of segment.rewards) removeFrom(rewards, reward);
    return segment;
  };

  // How much track exists around the rider: LOOK_AHEAD in front (enough for the pulled-back camera),
  // KEEP_BEHIND behind. Everything outside is freed, so a long run never piles up geometry or collision
  // data, and everything inside is (re)built, so there is never a hole in the track anywhere the rider can
  // be or see.
  const LOOK_AHEAD = 400;
  const KEEP_BEHIND = 200;
  let frontierZ = zStart; // north end of the built track

  /** Brings the built segments in line with the rider's position. Returns what changed, since the caller
   * mixes the solids and surfaces into its own collision lists. */
  const update = (playerZ) => {
    // Segment i is wanted while it overlaps [playerZ - LOOK_AHEAD, playerZ + KEEP_BEHIND].
    let first = 0;
    while (segmentStart(first + 1) > playerZ + KEEP_BEHIND) first += 1;
    let last = first;
    while (segmentStart(last + 1) > playerZ - LOOK_AHEAD) last += 1;

    const changes = { addedSolids: [], removedSolids: [], addedSurfaces: [], removedSurfaces: [] };
    for (const i of [...built.keys()]) {
      if (i >= first && i <= last) continue;
      const segment = disposeSegment(i);
      changes.removedSolids.push(segment.solid);
      changes.removedSurfaces.push(...segment.surfaces);
    }
    for (let i = first; i <= last; i += 1) {
      if (built.has(i)) continue;
      buildSegment(i);
      const segment = built.get(i);
      changes.addedSolids.push(segment.solid);
      changes.addedSurfaces.push(...segment.surfaces);
    }
    frontierZ = segmentStart(last + 1);
    return changes;
  };
  update(0);

  // A warning stretches the red across the whole run instead of just the entrance.
  const setWarning = (active) => {
    redUniforms.uRedLength.value = active ? (zStart - frontierZ) * 2 : RED_FADE_LENGTH;
  };

  const standsOn = (reward, position) => (
    Math.abs(position.x - reward.x) <= reward.halfX
    && Math.abs(position.z - reward.z) <= reward.halfZ
    && position.y >= reward.floor - 0.3
    && position.y <= reward.floor + 0.9
  );

  const rewardAt = (position) => rewards.find((reward) => (
    !reward.claimed && riderLevel >= reward.requiredLevel && standsOn(reward, position)
  )) ?? null;

  /** The reward under the rider that their level cannot collect yet (a red mat below RED_REWARD_LEVEL), or null. */
  const lockedRewardAt = (position) => rewards.find((reward) => (
    !reward.claimed && riderLevel < reward.requiredLevel && standsOn(reward, position)
  )) ?? null;

  const collectReward = (id) => {
    const reward = rewards.find((item) => item.id === id && !item.claimed);
    if (!reward) return false;
    reward.claimed = true;
    reward.rewardArt.visible = false;
    claimedRewards.add(id);
    return true;
  };

  /** Brings a collected trophy back so it can be collected again; called once the rider's back home. */
  const restoreReward = (id) => {
    claimedRewards.delete(id);
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
    group, solids, pits, surfaces, rewards, rewardAt, lockedRewardAt, collectReward, restoreReward, setRiderLevel,
    setWarning, update, slabsPassed,
    get zEnd() { return frontierZ; },
  };
}
