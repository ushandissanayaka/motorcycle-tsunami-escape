import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import scooterUrl from '../../assets/green-delivery-scooter.glb?url';
import { createBike } from './Bike.js';
import { createStoreBike } from './StoreBikes.js';
import { createBlockyHuman } from './BlockyHuman.js';
import { addWheelPivots, createWheelSpinner } from './wheelSpin.js';
import { createNameTag } from './NameTag.js';

// Rider and bike are drawn this much larger than the collision shape; gameplay sizes stay the same.
const VISUAL_SCALE = 1.2;
// Road meshes sit 0.1 units above the physics ground; lift the visual so the tires rest on top.
const VISUAL_GROUND_OFFSET = 0.1;
const RIDER_SEAT = new THREE.Vector3(0, 1.16, 0.2); // hips on the starter scooter's seat, sneakers on the floorboard
// Shoulder pitch that puts the hands on the scooter's grips, which sit at shoulder height.
const SCOOTER_ARM_ANGLE = 1.58;
// The rider's shoulders are 0.5 up the torso (BlockyHuman), and an arm reaches ARM_REACH from the shoulder
// to the middle of the hand. The torso leans forward (from UPRIGHT up to MAX_LEAN) just enough for the hands
// to reach a bike's bars: upright on a cruiser, a racing crouch on a sport bike.
const SHOULDER_UP = 0.5;
const ARM_REACH = 0.58;
const UPRIGHT = 0.12;
const MAX_LEAN = 0.95;
// On a training board the bike trembles a little as its wheels spin against the belt: RUMBLE_LIFT units of
// bounce and RUMBLE_ROLL / RUMBLE_PITCH radians of rock, eased in and out at RUMBLE_EASE per second. The
// frequencies (radians per second) stay well under half the frame rate, so the tremble reads as a tremble.
const RUMBLE_LIFT = 0.022;
const RUMBLE_ROLL = 0.012;
const RUMBLE_PITCH = 0.008;
const RUMBLE_EASE = 8;
// The scooter GLB is one piece; its wheels, measured in its own coordinates (length along X, axle along Z).
const SCOOTER_WHEELS = [{ x: -0.653, y: -0.46, r: 0.27, halfWidth: 0.11 }, { x: 0.517, y: -0.46, r: 0.27, halfWidth: 0.11 }];

let scooterModelPromise;

/** A white disc on the scooter's headlight, bright enough (> 1) for the bloom pass to make it glow. */
function createHeadlight() {
  const lamp = new THREE.Mesh(
    new THREE.CircleGeometry(0.085, 24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(4), toneMapped: false }),
  );
  // In the GLB's own space: the lamp's front face, which points along -X.
  lamp.position.set(-0.437, 0.6, 0);
  lamp.rotation.y = -Math.PI / 2;
  return lamp;
}

function loadScooterModel() {
  if (!scooterModelPromise) {
    scooterModelPromise = new GLTFLoader().loadAsync(scooterUrl).then(({ scene }) => {
      const scooter = new THREE.Group();
      scene.add(createHeadlight());
      addWheelPivots(scene, SCOOTER_WHEELS);
      // The supplied GLB's front points along -X; turn it to the game's -Z forward direction
      // so the handlebar sits in front of the rider's hands.
      scene.rotation.set(0, -Math.PI / 2, 0);
      scooter.add(scene);
      scooter.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(scooter);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const fitScale = 2.2 / size.z;
      scooter.scale.setScalar(fitScale);
      // Object3D position is applied after its local scale, so scale the centering offset too.
      // This keeps the tires on y = 0 instead of slightly below the floor.
      scooter.position.set(-center.x * fitScale, -bounds.min.y * fitScale, -center.z * fitScale);
      scooter.traverse((object) => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      return scooter;
    }).catch((error) => {
      scooterModelPromise = null;
      console.error('Could not load the starter scooter model.', error);
      throw error;
    });
  }
  return scooterModelPromise;
}

function createStarterScooter() {
  const bike = new THREE.Group();
  const fallback = createBike();
  bike.add(fallback);
  loadScooterModel().then((model) => {
    bike.remove(fallback);
    bike.add(model.clone(true));
  });
  return bike;
}

/** The equipped bike: the very model shown in the bike store (see StoreBikes.js), so a rider rides what they took. */
function createBikeModel(bikeId) {
  if (bikeId === 'bike_scooter') return createStarterScooter();
  try {
    return createStoreBike(bikeId);
  } catch {
    const bike = createBike(); // a bike with no store model yet
    bike.userData.rideFit = { hips: [1.16, 0.2], bars: [1.26, -0.36] };
    return bike;
  }
}

/** Sits the rider on the bike: hips just above its seat, the torso leaned in just enough, and the arms
 * pitched so the hands meet its handlebars. */
function seatRider(rider, bike) {
  const torso = rider.userData.arms[0].parent;
  const fit = bike.userData.rideFit;
  if (!fit) {
    rider.position.copy(RIDER_SEAT);
    torso.rotation.x = -UPRIGHT;
    for (const arm of rider.userData.arms) arm.rotation.x = SCOOTER_ARM_ANGLE;
    return;
  }
  const [hipY, hipZ] = fit.hips;
  const [barY, barZ] = fit.bars;
  rider.position.set(0, hipY, hipZ);
  const shoulderAt = (lean) => [hipY + SHOULDER_UP * Math.cos(lean), hipZ - SHOULDER_UP * Math.sin(lean)];
  const reachFrom = (lean) => {
    const [y, z] = shoulderAt(lean);
    return Math.hypot(barY - y, barZ - z);
  };
  // The least lean that brings the bars within reach (or the closest the rider can get).
  let lean = UPRIGHT;
  while (lean < MAX_LEAN && reachFrom(lean) > ARM_REACH) lean += 0.01;
  torso.rotation.x = -lean;
  // The pitch that points an arm (hanging straight down, -Y) at the bars, measured from the leaning torso.
  const [shoulderY, shoulderZ] = shoulderAt(lean);
  const pitch = Math.atan2(-(barZ - shoulderZ), -(barY - shoulderY));
  for (const arm of rider.userData.arms) arm.rotation.x = pitch + lean;
}

/** Blocky rider on the currently equipped bike. The starter scooter is loaded from its textured GLB. */
export function createPlayer() {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  visual.scale.setScalar(VISUAL_SCALE);
  visual.position.y = VISUAL_GROUND_OFFSET;
  group.add(visual);

  // Bike and rider together, trembled by `rumble` without disturbing the lean and ledge offset on `visual`.
  const body = new THREE.Group();
  visual.add(body);

  let bikeId = 'bike_scooter';
  let bike = createBikeModel(bikeId);
  body.add(bike);
  let spinner = null; // made on first use, so other riders' bikes (never spun) get no blur discs

  const rider = createBlockyHuman();
  body.add(rider);
  seatRider(rider, bike);

  group.userData.setBikeModel = (nextBikeId) => {
    if (!nextBikeId || nextBikeId === bikeId) return;
    body.remove(bike);
    bikeId = nextBikeId;
    bike = createBikeModel(bikeId);
    spinner = null;
    body.add(bike);
    seatRider(rider, bike);
  };
  group.userData.setBikeColor = (color) => bike.userData.setColor?.(color);
  // The player's name over the rider for a few seconds (shown when they log in).
  const nameTag = createNameTag();
  group.add(nameTag.sprite);
  group.userData.showName = (name) => nameTag.show(name);
  // Bloxity avatar proportions on the rider (see BlockyHuman's setProportions).
  group.userData.setProportions = (proportions) => rider.userData.setProportions(proportions);
  // Leans bike and rider into a turn (roll about the wheels' contact line); the heading stays on the group.
  group.userData.setLean = (angle) => { visual.rotation.z = angle; };
  // Holds the visible bike a little below / above the physics position while it eases onto a ledge.
  group.userData.setVisualOffset = (y) => { visual.position.y = VISUAL_GROUND_OFFSET + y; };
  group.userData.spinWheels = (distance, deltaSeconds, trainingMultiplier) => {
    spinner ??= createWheelSpinner(bike);
    spinner(distance, deltaSeconds, trainingMultiplier);
  };
  // `strength` 0..1 (1 on a training board); `time` is the running clock in seconds.
  let rumble = 0;
  group.userData.rumble = (strength, deltaSeconds, time) => {
    rumble += (strength - rumble) * (1 - Math.exp(-RUMBLE_EASE * deltaSeconds));
    if (rumble < 1e-3) {
      body.position.y = 0;
      body.rotation.set(0, 0, 0);
      return;
    }
    body.position.y = rumble * RUMBLE_LIFT * (0.6 * Math.sin(time * 61) + 0.4 * Math.sin(time * 97 + 1));
    body.rotation.z = rumble * RUMBLE_ROLL * Math.sin(time * 73 + 2);
    body.rotation.x = rumble * RUMBLE_PITCH * Math.sin(time * 53 + 4);
  };

  return group;
}
