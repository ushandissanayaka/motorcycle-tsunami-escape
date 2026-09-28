import * as THREE from 'three';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';

/**
 * The wave place: a long run of black asphalt slabs, level with the road,
 * separated by pits with a grey paved floor. The pits get longer the
 * further you go (`WAVE_TRACK.gapGrowth`), so riders have to clear bigger and
 * bigger gaps; a pit is a real drop (`WAVE_TRACK.pitDepth`) but a safe one: a bike
 * that misses lands unharmed on the floor and gets out by jumping at the wall. Slabs carry a yellow dashed
 * centre line, pits have a red trophy mat along the west wall and a yellow one along the east wall
 * (down on their floor, running lengthwise), and pink-lavender curbs edge both sides. Yellow
 * panels are set into the east wall. The far end is open to the sky.
 * Only the entrance edge glows red; `setWarning(true)` floods the whole track red, as when a wave is coming.
 */

const CURB = { base: '#d8c0e2', light: '#eddcf5', dark: '#a98fbc' };
const PANEL = { base: '#f2b632', light: '#ffd056', dark: '#c98f1c' };
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
const BASE_PAD_WIDTH = 6.25; // trophy / label size reference
const BASE_PAD_DEPTH = 2.2;
const DASH_WIDTH = 0.5;
const DASH_LENGTH = 4;
const DASH_SPACING = 8;
const TROPHY_SCALE = 1.3; // trophy size at the base mat size (it was 0.88)
const SURFACE = 0.1; // height of the road surface, which the slab tops are flush with
const TROPHY_GOLD = new THREE.MeshStandardMaterial({ color: 0xffd62e, metalness: 0.72, roughness: 0.24, emissive: 0x8a5a00, emissiveIntensity: 0.28 });
const TROPHY_DARK = new THREE.MeshStandardMaterial({ color: 0x9a5b08, metalness: 0.55, roughness: 0.3 });
const TROPHY_BOWL = new THREE.LatheGeometry([
  new THREE.Vector2(0, 0), new THREE.Vector2(0.2, 0), new THREE.Vector2(0.23, 0.08),
  new THREE.Vector2(0.14, 0.18), new THREE.Vector2(0.31, 0.34), new THREE.Vector2(0.35, 0.52),
  new THREE.Vector2(0.28, 0.62), new THREE.Vector2(0.1, 0.64), new THREE.Vector2(0, 0.64),
], 20);

function createTrophy(scale) {
  const trophy = new THREE.Group();
  const bowl = new THREE.Mesh(TROPHY_BOWL, TROPHY_GOLD);
  bowl.position.y = 0.55;
  trophy.add(bowl);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.26, 12), TROPHY_GOLD);
  stem.position.y = 0.43;
  trophy.add(stem);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 0.1, 16), TROPHY_DARK);
  base.position.y = 0.1;
  trophy.add(base);
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 16), TROPHY_GOLD);
    handle.position.set(side * 0.28, 1.0, 0);
    trophy.add(handle);
  }
  trophy.scale.setScalar(scale);
  return trophy;
}

function createRewardLabel(wins, scale = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '900 78px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#251323';
  ctx.strokeText(`+${wins} ${wins === 1 ? 'Win' : 'Wins'}`, 256, 66, 470);
  ctx.fillStyle = '#fff12b';
  ctx.fillText(`+${wins} ${wins === 1 ? 'Win' : 'Wins'}`, 256, 66, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.75 * scale * 1.3, 0.69 * scale * 1.3, 1);
  sprite.position.y = 0.53 + 2.01 * scale; // just above the top of the trophy, which is scaled the same way
  return sprite;
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
  // Slab tops sit flush with the main road (whose surface is at SURFACE, riders stand at 0).
  const slabTop = SURFACE;
  const floorTop = SURFACE - pitDepth;
  const columnHeight = pitDepth + SURFACE; // from the pit floor up to the slab surface
  const columnY = (SURFACE - pitDepth) / 2;
  const wallFoot = floorTop - 1.2; // side walls reach down into the sea beside the track

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
    z = zBack;

    // The pit after each slab: the next segment can be generated before the rider reaches it.
    {
      const gap = firstGap + gapGrowth * i;
      const gapMid = z - gap / 2;
      pits.push({ minX: x0, maxX: x1, minZ: z - gap, maxZ: z, floor: -pitDepth });
      box(width, 0.1, gap, hollowFloor, centerX, floorTop - 0.05, gapMid, 4.8);
      sideWalls(z, z - gap, wallFoot, wallTops);
      for (const side of [-1, 1]) {
        // Side wall of the pit (the ground plane is cut away over the track, so nothing else closes it in).
        box(1, columnHeight - 0.02, gap, asphalt, centerX + side * (width / 2 + 0.5), columnY - 0.01, gapMid);
        box(CURB_WIDTH, 0.07, gap, curb, centerX + side * (width / 2 - CURB_WIDTH / 2), floorTop + 0.035, gapMid);
      }
      // Mats run lengthwise against the side walls and lengthen with the pit.
      const padDepth = gap * PAD_LENGTH_FRACTION;
      const padWidth = PAD_WIDTH;
      const rewardScale = Math.min(padWidth / BASE_PAD_WIDTH, padDepth / BASE_PAD_DEPTH); // trophy and label grow with the mat
      for (const [xSide, materialColor, wins, sideName] of [
        [-1, PAD_RED, (i + 1) * 2, 'red'],
        [1, PAD_YELLOW, (i + 1) * 2 + 1, 'yellow'],
      ]) {
        const padX = centerX + xSide * (width / 2 - PAD_WALL_INSET - padWidth / 2);
        const padZ = gapMid;
        const pickup = new THREE.Group();
        pickup.position.set(padX, floorTop + 0.08, padZ);
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(padWidth, 0.16, padDepth),
          new THREE.MeshStandardMaterial({ color: materialColor, emissive: materialColor, emissiveIntensity: 0.9, roughness: 0.4 })
        );
        pickup.add(pad);
        surfaces.push({
          minX: padX - padWidth / 2,
          maxX: padX + padWidth / 2,
          minZ: padZ - padDepth / 2,
          maxZ: padZ + padDepth / 2,
          top: floorTop + 0.16,
        });

        // Display the trophy count that matches this pad's win value.
      const trophies = [];
      const rewardArt = new THREE.Group();
      const trophy = createTrophy(TROPHY_SCALE * rewardScale);
      trophy.position.set(0, 0.38, 0);
      rewardArt.add(trophy);
      trophies.push(trophy);
        rewardArt.add(createRewardLabel(wins, rewardScale));
        pickup.add(rewardArt);
        group.add(pickup);
        rewards.push({
        id: `wave-reward-v4-${i + 1}-${sideName}`,
          wins,
          x: padX,
          z: padZ,
          floor: floorTop + 0.16,
          halfX: padWidth / 2,
          halfZ: padDepth / 2,
          group: pickup,
          rewardArt,
          trophies,
          claimed: false,
        });
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

  // Yellow panels set into the east wall, spread along the run.
  const length = zStart - z;
  const panelMaterial = new THREE.MeshStandardMaterial({ map: makeStudTexture(PANEL, 64), roughness: 0.8, emissive: 0xf2b632, emissiveIntensity: 0.25 });
  for (const [fraction, depth, height] of [[0.25, 9, 7], [0.5, 11, 8], [0.8, 12, 8]]) {
    box(0.3, height, depth, panelMaterial, x1 - 0.15, slabTop + 0.5 + height / 2, zStart - fraction * length);
  }

  // A warning stretches the red across the whole run instead of just the entrance.
  const setWarning = (active) => {
    redUniforms.uRedLength.value = active ? (zStart - z) * 2 : RED_FADE_LENGTH;
  };

  const rewardAt = (position) => rewards.find((reward) => (
    !reward.claimed
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

  const setCollectedRewards = (ids = []) => {
    const collected = new Set(ids);
    for (const reward of rewards) {
      reward.claimed = collected.has(reward.id);
      reward.rewardArt.visible = !reward.claimed;
    }
  };

  const update = (time) => {
    for (const reward of rewards) {
      if (reward.claimed) continue;
      reward.trophies.forEach((trophy, index) => {
        trophy.rotation.y = time * 1.5 + index * 0.4;
        trophy.position.y = 0.38 + Math.sin(time * 2.5 + index) * 0.055;
      });
    }
  };

  return {
    group, solids, pits, surfaces, rewards, rewardAt, collectReward, setCollectedRewards,
    setWarning, update, ensureAhead,
    get zEnd() { return z; },
  };
}
