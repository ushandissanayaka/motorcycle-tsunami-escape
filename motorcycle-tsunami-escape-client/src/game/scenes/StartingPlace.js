import * as THREE from 'three';
import { createPlayer } from '../entities/Player.js';
import { BOARD, createTrainingBoard } from '../entities/TrainingBoard.js';
import { createBikeStore } from '../entities/BikeStore.js';
import { createCanyonWall } from '../entities/CanyonWall.js';
import { createBikeDisplay, createEventBillboard } from '../entities/Scenery.js';
import { createLuckyStage } from '../entities/LuckyStage.js';
import { createWaveTrack } from '../entities/WaveTrack.js';
import { createTsunami } from '../entities/Tsunami.js';
import { createSky } from '../entities/Sky.js';
import { createCollision } from '../systems/collision.js';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';
import { BOOST_PADS, MAP_LAYOUT, WAVE_TRACK } from '../../shared/constants.js';

const { room: ROOM, corridor: CORRIDOR } = MAP_LAYOUT;
const STAGE_FRONT_Z = 20.5;

// --- layout (world units; the room spans x +-50, z -38..30) -----------------
const ROAD_HALF_WIDTH = 4;
const ROAD_START_Z = STAGE_FRONT_Z;
// The Lucky Blocks stage sits against the south wall of the room, opposite the
// corridor, facing north; the main road starts at its steps.
const STAGE = { centerX: 0, width: 40, zBack: ROOM.south + 4, zFront: STAGE_FRONT_Z };
const LUCKY_ZONE = { minZ: 16, halfWidth: 22 }; // riders here see the Lucky Blocks title
// The main road ends where the wave track begins, at the mouth of the corridor.
const ROAD_END_Z = ROOM.north;
const STORE_POSITION = new THREE.Vector3(-40, 0, -4);
const STORE_RAMP_FOOT_X = STORE_POSITION.x + 17;

// Paved strips beside the road, wider on the bike-store side.
const PLAZA_WEST = { x0: -10, x1: -ROAD_HALF_WIDTH, z0: -18, z1: 20 };
const PLAZA_EAST = { x0: ROAD_HALF_WIDTH, x1: 8.2, z0: -22, z1: 14 };

// Training place: boards in a row on a dark asphalt pad, reached by a short branch road.
const BOARD_ROW_START_Z = 20;
const BOARD_GAP = 1;
const BOARD_PITCH = BOARD.width + BOARD_GAP;
const BOARD_ROW_END_Z = BOARD_ROW_START_Z - (BOOST_PADS.length - 1) * BOARD_PITCH;
const BOARD_ROW_CENTER_Z = (BOARD_ROW_START_Z + BOARD_ROW_END_Z) / 2;
const TRAINING_PAD = { x0: 31, x1: ROOM.halfWidth - 3, z0: BOARD_ROW_END_Z - BOARD.width / 2 - 2.2, z1: BOARD_ROW_START_Z + BOARD.width / 2 + 2.2 };
const BRANCH_ROAD_WIDTH = 4;

const TILE = 6; // world units per stud / asphalt texture repeat
const PLAZA_TILE = 4.8; // one paving slab

/**
 * Builds the full Starting Place hub on a T-shaped map: a wide room with the
 * two-level bike store on the west side and the training place on the east
 * side, and a narrow corridor to the north, all ringed by a canyon
 * wall. Returns everything the render loop needs to update each frame.
 */
export function buildStartingPlace(scene) {
  const lights = addLighting(scene);
  const sky = createSky();
  scene.add(sky);
  const materials = makeMaterials();
  addGround(scene, materials);
  addRoads(scene, materials);

  const player = createPlayer();
  scene.add(player);

  // Training boards line up along the east wall, south to north, with their
  // monitors against the wall and the ramps facing the branch road.
  const boardX = ROOM.halfWidth - 5.5 - BOARD.length / 2;
  const boostPads = BOOST_PADS.map((pad, i) =>
    createTrainingBoard({
      multiplier: pad.multiplier,
      label: pad.label,
      style: pad.style,
      position: new THREE.Vector3(boardX, 0, BOARD_ROW_START_Z - i * BOARD_PITCH),
    })
  );
  boostPads.forEach((p) => scene.add(p));

  const store = createBikeStore({ position: STORE_POSITION });
  scene.add(store.group);

  const stage = createLuckyStage(STAGE);
  scene.add(stage.group);
  // The wave place fills the corridor to the north.
  const waveTrack = createWaveTrack({ x0: -CORRIDOR.halfWidth, x1: CORRIDOR.halfWidth, zStart: ROOM.north, ...WAVE_TRACK });
  scene.add(waveTrack.group);
  const trainingSurfaces = boostPads.flatMap((board) => board.userData.surfaces);
  const collision = createCollision(
    [...store.solids, ...stage.solids, ...waveTrack.solids],
    waveTrack.pits,
    [...trainingSurfaces, ...waveTrack.surfaces]
  );
  let knownWaveSolids = waveTrack.solids.length;

  // Sea beyond the open end of the corridor; the tsunami rolls in from far out on it.
  // Keep the distant sea below the pit floors so the gray trench remains dry and visible.
  const tsunami = createTsunami({
    width: CORRIDOR.halfWidth * 2 + 10,
    zFar: CORRIDOR.north - 300,
    zNear: ROOM.north + 2,
    seaLevel: -WAVE_TRACK.pitDepth - 0.8,
  });
  scene.add(tsunami.group);

  const billboard = createEventBillboard();
  billboard.position.set(26, 0, 26);
  billboard.rotation.y = -Math.PI / 2;
  scene.add(billboard);

  const display = createBikeDisplay({ bikeId: 'bike_aetherune', name: 'Aetherune Bike', price: '699' });
  display.group.position.set(-18, 0, 15);
  scene.add(display.group);

  /** Per-frame animation; `onStorePad(bike)` fires when the rider drives onto a store pad. */
  const update = (time, onStorePad) => {
    waveTrack.ensureAhead(player.position.z);
    if (waveTrack.solids.length > knownWaveSolids) {
      collision.solids.push(...waveTrack.solids.slice(knownWaveSolids));
      knownWaveSolids = waveTrack.solids.length;
    }
    boostPads.forEach((board) => board.userData.update(time));
    store.update(time, player, onStorePad);
    display.update(time);
    stage.update(time);
    waveTrack.update(time);
    tsunami.update(time, player.position.z);
    sky.userData.update(time);
    lights.followRider(player.position);
  };

  /** Which titled area the rider is in, if any. */
  const zoneAt = (position) => (position.z > LUCKY_ZONE.minZ && Math.abs(position.x) < LUCKY_ZONE.halfWidth ? 'lucky' : null);

  return { player, boostPads, store, collision, update, zoneAt, waveTrack, setStoreStates: store.setStates, setWaveWarning: waveTrack.setWarning, setWavesEnabled: tsunami.setEnabled, tsunami };
}

const SUN_OFFSET = new THREE.Vector3(-30, 55, 30);

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
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 5, far: 170 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);

  const glow = (color, intensity, x, y, z, distance = 36) => {
    const light = new THREE.PointLight(color, intensity, distance, 1.6);
    light.position.set(x, y, z);
    scene.add(light);
  };
  glow(0x45d2ff, 12, STORE_POSITION.x + 2, 7, STORE_POSITION.z); // store: cool cyan
  glow(0xff5cf0, 30, -2, 6, 24, 30); // Lucky Blocks stage: magenta...
  glow(0x62c7ff, 30, 6, 6, 26, 30); // ...and sky blue
  glow(0xffc93a, 35, ROOM.halfWidth - 10, 6, 3); // training place: warm gold

  return {
    /** Keeps the sun's shadow window centred on the rider. */
    followRider(position) {
      sun.target.position.copy(position);
      sun.position.copy(position).add(SUN_OFFSET);
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

  // Land only inside the canyon ring: the sea (see Tsunami.js) surrounds it, so the water shows outside the walls.
  // The ground runs a little under the wall (walls start up to 4 units out) so no water slips in between.
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
  const roomX = ROOM.halfWidth + UNDER_WALL;
  groundPiece(-roomX, roomX, ROOM.north, ROOM.south + UNDER_WALL); // the room
  groundPiece(-roomX, -CORRIDOR.halfWidth, ROOM.north - UNDER_WALL, ROOM.north); // under the north wall, left of the corridor
  groundPiece(CORRIDOR.halfWidth, roomX, ROOM.north - UNDER_WALL, ROOM.north); // ...and right of it

  // Plazas beside the road.
  scene.add(slab(PLAZA_WEST, plaza, 0.06, 0.12, PLAZA_TILE));
  scene.add(slab(PLAZA_EAST, plaza, 0.06, 0.12, PLAZA_TILE));

  // Floor under the bike store, and the path from its ramp to the road plaza.
  scene.add(slab({ x0: STORE_POSITION.x - 7.5, x1: STORE_POSITION.x + 7, z0: STORE_POSITION.z - 16.5, z1: STORE_POSITION.z + 16.5 }, floor, 0.06, 0.12));
  scene.add(slab({ x0: STORE_RAMP_FOOT_X, x1: PLAZA_WEST.x0, z0: STORE_POSITION.z - 3.5, z1: STORE_POSITION.z + 3.5 }, plaza, 0.06, 0.12, PLAZA_TILE));

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

  // Branch road east to the training pad, then the pad itself.
  scene.add(slab({ x0: PLAZA_EAST.x1, x1: TRAINING_PAD.x0, z0: BOARD_ROW_CENTER_Z - BRANCH_ROAD_WIDTH / 2, z1: BOARD_ROW_CENTER_Z + BRANCH_ROAD_WIDTH / 2 }, asphalt, 0.05));
  for (let x = PLAZA_EAST.x1 + 2.5; x < TRAINING_PAD.x0 - 1; x += 4) dash(x, BOARD_ROW_CENTER_Z, true);
  scene.add(slab(TRAINING_PAD, asphalt, 0.06, 0.12));
}
