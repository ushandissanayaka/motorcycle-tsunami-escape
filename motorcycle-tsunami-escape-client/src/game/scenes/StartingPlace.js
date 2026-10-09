import * as THREE from 'three';
import { createPlayer } from '../entities/Player.js';
import { createShatter } from '../entities/Shatter.js';
import { createWindStreaks } from '../entities/WindStreaks.js';
import { createTrainingBoard } from '../entities/TrainingBoard.js';
import { createBikeStore } from '../entities/BikeStore.js';
import { createCanyonWall } from '../entities/CanyonWall.js';
import { createBikeDisplay } from '../entities/Scenery.js';
import { createLeaderboards } from '../entities/Leaderboard.js';
import { createTitledSign } from '../entities/Sign.js';
import { createGroupChestArea } from '../entities/GroupChestArea.js';
import { createLuckyStage } from '../entities/LuckyStage.js';
import { createWaveTrack } from '../entities/WaveTrack.js';
import { createSpeedPopups } from '../entities/SpeedPopup.js';
import { createReturnBursts } from '../entities/ReturnBurst.js';
import { createTsunami } from '../entities/Tsunami.js';
import { createSky } from '../entities/Sky.js';
import { createClouds } from '../entities/Clouds.js';
import { createCollision } from '../systems/collision.js';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';
import { BOOST_PADS, MAP_LAYOUT, WAVE_TRACK, WORLD_GATES } from '../../shared/constants.js';
import { createWorldGate } from '../entities/WorldGate.js';
import { createNextEventBoard } from '../entities/NextEventBoard.js';
import { createWorld2BikeDisplay } from '../entities/World2BikeDisplay.js';

const { room: ROOM, corridor: CORRIDOR } = MAP_LAYOUT;
const STAGE_FRONT_Z = 20.5;
const ASTRALWING_POSITION = { x: -11.8, z: -22.1 };

// --- layout (world units; the room spans x -50..38, z -38..31) -------------
// Measured from the reference's top-down view: the road is wide, with a grey paved strip either side of it
// that runs up to the stage, and the training pad sits close to the road on a short stem.
const ROAD_HALF_WIDTH = 6.4;
const ROAD_START_Z = STAGE_FRONT_Z;
const PLAZA_WIDTH = 7.2;
const PLAZA_WEST = { x0: -ROAD_HALF_WIDTH - PLAZA_WIDTH, x1: -ROAD_HALF_WIDTH, z0: -17.6, z1: STAGE_FRONT_Z - 0.5 };
const PLAZA_EAST = { x0: ROAD_HALF_WIDTH, x1: ROAD_HALF_WIDTH + PLAZA_WIDTH, z0: -17.6, z1: STAGE_FRONT_Z - 0.5 };
// The Lucky Blocks stage sits against the south wall of the room, opposite the corridor, facing north;
// the main road starts at its steps. It is as wide as the road plus both strips.
const STAGE = { centerX: 0, width: PLAZA_EAST.x1 - PLAZA_WEST.x0, zBack: ROOM.south + 1, zFront: STAGE_FRONT_Z };
// The main road ends where the wave track begins, at the mouth of the corridor.
const ROAD_END_Z = ROOM.north;
// The Speed and Wins leaderboards stand in the south-east corner (where the event billboard was), angled
// as in the reference: Speed faces west-north-west, Wins faces north, up against the south wall.
const LEADERBOARDS = [
  { kind: 'speed', x: 25, z: 22.4, yaw: -2.06 },
  { kind: 'wins', x: 19, z: 29.8, yaw: -2.79 },
];
// The Divine Lucky Block and the Group Chest sit on the grass west of the stage, facing north.
const GROUP_CHEST_AREA = { divine: { x: -19.2, z: 24.6 }, chest: { x: -27.8, z: 25.4, yaw: Math.PI + 0.55 } };
// The store stands a little way back from the grey strip beside the black road; a short path joins its ramp to the strip.
// World 2's gate stands on the grass north of the bike store, angled so its front faces toward the black road.
const WORLD_GATE_POSITION = { x: -24, z: -29, yaw: 0.85 }; // yaw turns its front from south toward the road (east)
// The "Next Event!" billboard stands on the ground just west of the mono (black-and-white) 100x board,
// near the Aetherune Bike display, with the canyon wall as a backdrop, as in the reference screenshots.
// Pulled back a little further behind its own facing (toward the wall) than a first pass at this spot.
const NEXT_EVENT_POSITION = { x: 26, y: 0, z: -26, yaw: -0.8 };
const STORE_SETBACK = 5;
const STORE_POSITION = new THREE.Vector3(PLAZA_WEST.x0 - 17 - STORE_SETBACK, 0, 0); // 4 units south of where it was, toward the Group Chest
const STORE_RAMP_FOOT_X = STORE_POSITION.x + 17;

// Training place: eight boards of different sizes in a row on a dark asphalt pad (the big 100x and 25x boards
// at the north end), reached by a short stem road off the strip beside the main road. The stem meets the
// pad off-centre, at the small steel boards, as in the reference.
const BOARD_GAP = 0.7;
const BOARD_ROW_SOUTH_Z = 14.4; // south edge of the first board
const BOARD_X = 27.6; // deck centre
let rowCursor = BOARD_ROW_SOUTH_Z;
const BOARD_SPOTS = BOOST_PADS.map((pad) => {
  const spot = { pad, z: rowCursor - pad.width / 2 };
  rowCursor -= pad.width + BOARD_GAP;
  return spot;
});
const BOARD_ROW_NORTH_Z = rowCursor + BOARD_GAP; // north edge of the last board
const TRAINING_PAD = { x0: 21.6, x1: 32.6, z0: BOARD_ROW_NORTH_Z - 1.2, z1: BOARD_ROW_SOUTH_Z + 2.3 };
const BRANCH_ROAD_WIDTH = 6;
const BRANCH_ROAD_Z = 1.9;
const TRAINING_CENTER_Z = (TRAINING_PAD.z0 + TRAINING_PAD.z1) / 2;

const TILE = 6; // world units per stud / asphalt texture repeat
const PLAZA_TILE = 4.8; // one paving slab

/**
 * Builds the full Starting Place hub on a T-shaped map: a wide room with the
 * two-level bike store on the west side and the training place on the east
 * side, and a narrow corridor to the north, all ringed by a canyon
 * wall. Returns everything the render loop needs to update each frame.
 */
export function buildStartingPlace(scene, renderer) {
  const lights = addLighting(scene);
  scene.add(createSky(renderer, SUN_OFFSET));
  const clouds = createClouds();
  scene.add(clouds.group);
  const materials = makeMaterials();
  addGround(scene, materials);
  addRoads(scene, materials);

  const player = createPlayer();
  scene.add(player);
  const speedPopups = createSpeedPopups(scene);
  const returnBursts = createReturnBursts(scene);
  const shatter = createShatter(scene);
  const wind = createWindStreaks();
  player.add(wind.mesh); // slips past along the rider's heading, and hides with the rider
  // Break the rider apart once while loading and put it straight back together (nothing is drawn in between),
  // so the first wave to hit plays on code that is already warmed up instead of stalling that frame.
  shatter.burst(player, 0, new THREE.Vector3(0, 3, 7), 0);
  shatter.clear();

  // Training boards line up on the pad, south to north, with their monitors on the east side
  // and the ramps facing the stem road.
  const boostPads = BOARD_SPOTS.map(({ pad, z }) =>
    createTrainingBoard({
      multiplier: pad.multiplier,
      label: pad.label,
      banner: pad.banner ?? true,
      style: pad.style,
      length: pad.length,
      width: pad.width,
      height: pad.height,
      position: new THREE.Vector3(BOARD_X, 0, z),
    })
  );
  boostPads.forEach((p) => scene.add(p));

  const store = createBikeStore({ position: STORE_POSITION });
  scene.add(store.group);

  const stage = createLuckyStage(STAGE);
  scene.add(stage.group);
  const leaderboards = createLeaderboards(LEADERBOARDS);
  const chestArea = createGroupChestArea(GROUP_CHEST_AREA);
  scene.add(chestArea.group);
  const gate = createWorldGate({ title: WORLD_GATES[0].name.toUpperCase(), subtitle: `Level ${WORLD_GATES[0].levelRequired} Required` });
  gate.group.position.set(WORLD_GATE_POSITION.x, 0, WORLD_GATE_POSITION.z);
  gate.group.rotation.y = WORLD_GATE_POSITION.yaw;
  scene.add(gate.group);
  const world2Bike = createWorld2BikeDisplay();
  // Keep the Astralwing directly opposite the Aetherune across the black centre road.
  world2Bike.group.position.set(ASTRALWING_POSITION.x, 0, ASTRALWING_POSITION.z);
  scene.add(world2Bike.group);
  // The wave place fills the corridor to the north.
  const waveTrack = createWaveTrack({ x0: -CORRIDOR.halfWidth, x1: CORRIDOR.halfWidth, zStart: ROOM.north, ...WAVE_TRACK });
  scene.add(waveTrack.group);
  const trainingSurfaces = boostPads.flatMap((board) => board.userData.surfaces);
  const collision = createCollision(
    [...store.solids, ...stage.solids, ...leaderboards.solids, ...chestArea.solids, ...waveTrack.solids],
    waveTrack.pits,
    [...trainingSurfaces, ...waveTrack.surfaces]
  );
  let insidePremiumBoard = null;

  // The tsunami rolls in from far beyond the open end of the corridor.
  const tsunami = createTsunami({
    width: CORRIDOR.halfWidth * 2 + 10,
    zFar: CORRIDOR.north - 300,
    // Waves vanish as their foot reaches this line, a few units out past the starting line. Raise it (toward
    // ROOM.north) to let them roll further before they vanish.
    zNear: ROOM.north - 5,
  });
  scene.add(tsunami.group);

  scene.add(leaderboards.group);

  // "BIKE STORE" sign floating above the store's roof (the store's upper floor and roof were both
  // raised by 2 units for more headroom around its bikes, so the sign is raised to match, keeping the
  // same clearance above the roof it always had).
  const storeSign = createTitledSign({ title: 'BIKE STORE', subtitle: 'Unlock faster bikes with wins!', titleSize: 2.3, titleWidth: 19, subtitleSize: 1.2, subtitleWidth: 29, scale: 1.7 });
  storeSign.position.set(STORE_POSITION.x + 2, 10.6, STORE_POSITION.z);
  scene.add(storeSign);

  // "TRAINING" sign floating over the pad, as in the reference.
  const trainingSign = createTitledSign({ title: 'TRAINING', subtitle: 'Increase your speed automatically!', titleSize: 2.3, titleWidth: 17, subtitleSize: 1.2, subtitleWidth: 29, subtitleColor: ['#ffb20a', '#ffe12b'], scale: 1 });
  trainingSign.position.set(BOARD_X, 2, TRAINING_CENTER_Z);
  scene.add(trainingSign);

  const display = createBikeDisplay({ bikeId: 'bike_aetherune', name: 'Aetherune Bike', price: '699' });
  display.group.position.set(11.8, 0, -22.1); // on the east strip, north end, as in the reference
  scene.add(display.group);
  let insideAstralwingRing = false;
  let insideAetheruneDisplay = false;

  const nextEvent = createNextEventBoard();
  nextEvent.group.position.set(NEXT_EVENT_POSITION.x, NEXT_EVENT_POSITION.y, NEXT_EVENT_POSITION.z);
  nextEvent.group.rotation.y = NEXT_EVENT_POSITION.yaw;
  scene.add(nextEvent.group);

  /** Per-frame animation; `onStorePad(bike)` fires when the rider drives onto a store pad. */
  const update = (time, onStorePad, camera, onAstralwingRing, onPremiumBoard, onAetheruneDisplay) => {
    // Keeps track built around the rider, in front and behind (see WaveTrack.js). collision.solids and
    // collision.surfaces are their own arrays (built once from several sources), so the track's changes are
    // mirrored into them here by reference.
    const trackChanges = waveTrack.update(player.position.z);
    const removeFrom = (list, item) => {
      const index = list.indexOf(item);
      if (index !== -1) list.splice(index, 1);
    };
    for (const solid of trackChanges.removedSolids) removeFrom(collision.solids, solid);
    for (const surface of trackChanges.removedSurfaces) removeFrom(collision.surfaces, surface);
    collision.solids.push(...trackChanges.addedSolids);
    collision.surfaces.push(...trackChanges.addedSurfaces);
    boostPads.forEach((board) => board.userData.update(time));
    store.update(time, player, onStorePad);
    display.update(time);
    const ringX = (player.position.x - ASTRALWING_POSITION.x) / 4.5;
    const ringZ = (player.position.z - ASTRALWING_POSITION.z) / 4.5;
    const insideRing = ringX * ringX + ringZ * ringZ < 1;
    if (insideRing && !insideAstralwingRing) onAstralwingRing?.();
    insideAstralwingRing = insideRing;
    const aetheruneX = player.position.x - display.group.position.x;
    const aetheruneZ = player.position.z - display.group.position.z;
    const nearAetherune = aetheruneX * aetheruneX + aetheruneZ * aetheruneZ < 25;
    if (nearAetherune && !insideAetheruneDisplay) onAetheruneDisplay?.();
    insideAetheruneDisplay = nearAetherune;
    const premiumBoard = boostPads.find((pad) => [3, 9, 25, 100].includes(pad.userData.multiplier)
      && Math.abs(player.position.x - pad.position.x) < pad.userData.halfSize.x + 2
      && Math.abs(player.position.z - pad.position.z) < pad.userData.halfSize.z + 2);
    if (premiumBoard && premiumBoard !== insidePremiumBoard) onPremiumBoard?.(premiumBoard);
    insidePremiumBoard = premiumBoard ?? null;
    stage.update(time);
    leaderboards.update();
    chestArea.update(time, camera);
    gate.update(time);
    world2Bike.update(time);
    tsunami.update(time, player.position.z, waveTrack.slabsPassed(player.position.z)); // more waves further out
    if (camera) clouds.update(camera);
    lights.followRider(player.position);
    speedPopups.update(time);
    returnBursts.update(time);
    shatter.update(time);
  };

  /**
   * Builds every material's shaders now, while the loading screen is up, instead of the first time each thing
   * comes into view or into the sun's shadow mid-ride (building one stalls that frame, up to a few hundred ms).
   * `renderTarget` is what the scene is really drawn into (the composer's buffer: its colour output differs from
   * the canvas's, and so do the shaders), and `render` draws one ordinary frame.
   */
  const warmShaders = (renderer, camera, renderTarget, render) => {
    const previous = renderer.getRenderTarget();
    renderer.setRenderTarget(renderTarget);
    renderer.compile(scene, camera); // everything in the scene, in view or not
    renderer.setRenderTarget(previous);
    // compile() skips the shadow pass, so draw one frame that shadows the whole map. three.js draws every
    // shadow with one shared material whose shader is only re-chosen when the next caster switches between
    // instanced and plain, so which variant (textured or not, which side) gets built depends on the order
    // things happen to be drawn in: riding about later can still hit one never built. Casters that alternate
    // instanced / plain through every combination make sure all of them are built now.
    const variants = new THREE.Group();
    const box = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    white.needsUpdate = true;
    const materials = [];
    for (const side of [THREE.FrontSide, THREE.BackSide, THREE.DoubleSide]) {
      for (const map of [null, white]) {
        const material = new THREE.MeshStandardMaterial({ map, side });
        materials.push(material);
        for (const caster of [new THREE.InstancedMesh(box, material, 1), new THREE.Mesh(box, material)]) {
          caster.castShadow = true;
          caster.frustumCulled = false;
          variants.add(caster);
        }
      }
    }
    variants.position.copy(player.position);
    scene.add(variants);
    lights.withWholeMapShadows(render);
    scene.remove(variants);
    box.dispose();
    white.dispose();
    for (const material of materials) material.dispose();
  };

  return { player, boostPads, store, collision, update, warmShaders, leaderboards, waveTrack, speedPopups, returnBursts, shatter, wind, setStoreStates: store.setStates, setWaveWarning: waveTrack.setWarning, setWavesEnabled: tsunami.setEnabled, tsunami };
}

// The sun stands low over the far south-west corner, behind the Group Chest, so everything throws its shadow
// north-east across the room and the south and west walls lie in shade while the north and east walls catch the light.
const SUN_OFFSET = new THREE.Vector3(-46, 40, 42);

/**
 * Bright, warm daylight with coloured accent lights: a sunny key light whose shadows follow the
 * rider, a sky/ground bounce that keeps shaded sides light instead of dark, and cyan, gold and
 * magenta glows around the bike store, training place and Lucky Blocks stage.
 */
function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xf2ead2, 1.9)); // pale sky above, warm sand bounce below
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));

  const sun = new THREE.DirectionalLight(0xfff0d0, 2.1);
  sun.position.copy(SUN_OFFSET);
  sun.castShadow = true;
  // The sun follows the rider every frame (see followRider below), so this shadow map is redrawn from
  // scratch every frame, not once: its resolution is a direct, ongoing cost, not just a one-time load
  // cost. 2048 still looks sharp with PCFSoftShadowMap's blur softening the edges anyway.
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -62, right: 62, top: 62, bottom: -62, near: 5, far: 260 });
  sun.shadow.bias = -0.0004;
  // The sun's view axes (it looks along -SUN_OFFSET with world up), and one shadow texel in world units.
  const viewZ = SUN_OFFSET.clone().normalize();
  const viewX = new THREE.Vector3(0, 1, 0).cross(viewZ).normalize();
  const SHADOW_AXES = { x: viewX, y: viewZ.clone().cross(viewX) };
  const SHADOW_TEXEL = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const snapped = new THREE.Vector3();
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const glow = (color, intensity, x, y, z, distance = 36) => {
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.position.set(x, y, z);
    scene.add(light);
  };
  glow(0x45d2ff, 12, STORE_POSITION.x + 2, 9, STORE_POSITION.z); // store: cool cyan (raised 2 with the taller store)
  glow(0xff5cf0, 30, -2, 6, 24, 30); // Lucky Blocks stage: magenta...
  glow(0x62c7ff, 30, 6, 6, 26, 30); // ...and sky blue
  glow(0xffc93a, 35, BOARD_X, 6, TRAINING_CENTER_Z); // training place: warm gold

  return {
    /**
     * Runs `render` with the sun's shadow window stretched over the whole map (and the sun pulled far back to
     * match), so every shadow-casting material gets its shadow shader built, then puts the window back.
     */
    withWholeMapShadows(render) {
      const view = sun.shadow.camera;
      const saved = { left: view.left, right: view.right, top: view.top, bottom: view.bottom, far: view.far };
      const savedPosition = sun.position.clone();
      Object.assign(view, { left: -700, right: 700, top: 700, bottom: -700, far: 4000 });
      view.updateProjectionMatrix();
      sun.position.copy(sun.target.position).addScaledVector(SUN_OFFSET, 20);
      render();
      Object.assign(view, saved);
      view.updateProjectionMatrix();
      sun.position.copy(savedPosition);
    },
    /** Keeps the sun's shadow window centred on the rider. */
    followRider(position) {
      // Move the shadow window only in whole shadow-map texels (measured across the sun's view), so the
      // shadows on the ground keep their exact pixels instead of crawling and shimmering as the rider moves.
      const across = position.dot(SHADOW_AXES.x);
      const up = position.dot(SHADOW_AXES.y);
      snapped.copy(position)
        .addScaledVector(SHADOW_AXES.x, Math.round(across / SHADOW_TEXEL) * SHADOW_TEXEL - across)
        .addScaledVector(SHADOW_AXES.y, Math.round(up / SHADOW_TEXEL) * SHADOW_TEXEL - up);
      sun.target.position.copy(snapped);
      sun.position.copy(snapped).add(SUN_OFFSET);
      sun.target.updateMatrixWorld();
    },
  };
}

/** A flat slab whose texture keeps a constant world scale, given by its bounds. */
function slab(bounds, material, y, height = 0.1, tile = TILE) {
  const width = bounds.x1 - bounds.x0;
  const depth = bounds.z1 - bounds.z0;
  const mesh = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(width, height, depth), tile), material);
  mesh.position.set(bounds.x0 + width / 2, y, bounds.z0 + depth / 2);
  mesh.receiveShadow = true;
  return mesh;
}

function makeMaterials() {
  return {
    grass: new THREE.MeshStandardMaterial({ map: makeStudTexture(PALETTES.grass, 5), roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ map: makeStudTexture(PALETTES.asphalt, 9), roughness: 0.9 }),
    // Big lavender slabs with dark seams and small studs, like the plazas in the reference.
    plaza: new THREE.MeshStandardMaterial({ map: makePaverTexture(PALETTES.plaza, 8, 1, 8, 7), roughness: 0.85 }),
    floor: new THREE.MeshStandardMaterial({ map: makePaverTexture(PALETTES.paver, 8), roughness: 0.85 }),
  };
}

function addGround(scene, { grass, plaza, floor }) {

  // Land only inside the canyon ring: the map floats in the sky, with clouds all around and below it.
  // The ground runs a little under the wall (walls start up to 4 units out) so no sky slips in between.
  // The corridor is cut out: the wave place builds its own floor there, and its pits drop below ground level.
  const UNDER_WALL = 5;
  const groundPiece = (x0, x1, z0, z1) => {
    // Built in world coordinates (the plane is rotated flat, so its local y is world -z) so the stud texture lines up across pieces.
    const geometry = new THREE.PlaneGeometry(x1 - x0, z1 - z0).translate((x0 + x1) / 2, -(z0 + z1) / 2, 0);
    const mesh = new THREE.Mesh(applyWorldUV(geometry, TILE), grass);
    mesh.rotation.x = -Math.PI / 2;
    mesh.receiveShadow = true;
    scene.add(mesh);
  };
  const roomWest = -(ROOM.west + UNDER_WALL);
  const roomEast = ROOM.east + UNDER_WALL;
  groundPiece(roomWest, roomEast, ROOM.north, ROOM.south + UNDER_WALL); // the room
  groundPiece(roomWest, -CORRIDOR.halfWidth, ROOM.north - UNDER_WALL, ROOM.north); // under the north wall, left of the corridor
  groundPiece(CORRIDOR.halfWidth, roomEast, ROOM.north - UNDER_WALL, ROOM.north); // ...and right of it

  // Plazas beside the road.
  scene.add(slab(PLAZA_WEST, plaza, 0.06, 0.12, PLAZA_TILE));
  scene.add(slab(PLAZA_EAST, plaza, 0.06, 0.12, PLAZA_TILE));

  // Floor under the bike store, and the path from its ramp to the road plaza. The store was widened
  // (outer width 36 -> 44), so its floor patch is widened to match, keeping the same inset from the
  // store's outer walls it always had.
  scene.add(slab({ x0: STORE_RAMP_FOOT_X, x1: PLAZA_WEST.x0, z0: STORE_POSITION.z - 3.5, z1: STORE_POSITION.z + 3.5 }, plaza, 0.06, 0.12, PLAZA_TILE));
  scene.add(slab({ x0: STORE_POSITION.x - 7.5, x1: STORE_POSITION.x + 7, z0: STORE_POSITION.z - 20.5, z1: STORE_POSITION.z + 20.5 }, floor, 0.06, 0.12));

  // Studded canyon wall following the T-shaped outline.
  scene.add(createCanyonWall());
}

function addRoads(scene, { asphalt }) {
  const dashMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c928, emissive: 0x4a3a00 });
  const dash = (x, z, alongX) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? 2 : 0.25, alongX ? 0.25 : 2), dashMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.11, z);
    scene.add(mesh);
  };

  // Main road, from the stage north to the mouth of the corridor.
  scene.add(slab({ x0: -ROAD_HALF_WIDTH, x1: ROAD_HALF_WIDTH, z0: ROAD_END_Z, z1: ROAD_START_Z }, asphalt, 0.05));
  for (let z = ROAD_START_Z - 1; z > ROAD_END_Z; z -= 4) dash(0, z, false);

  // Stem road from the strip beside the main road to the training pad, then the pad itself.
  scene.add(slab({ x0: PLAZA_EAST.x1, x1: TRAINING_PAD.x0, z0: BRANCH_ROAD_Z - BRANCH_ROAD_WIDTH / 2, z1: BRANCH_ROAD_Z + BRANCH_ROAD_WIDTH / 2 }, asphalt, 0.05));
  for (let x = PLAZA_EAST.x1 + 1.5; x < TRAINING_PAD.x0 - 1; x += 2.6) dash(x, BRANCH_ROAD_Z, true);
  scene.add(slab(TRAINING_PAD, asphalt, 0.06, 0.12));
}
