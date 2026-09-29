import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import scooterUrl from '../../assets/green-delivery-scooter.glb?url';
import { createBike } from './Bike.js';
import { createStoreBike } from './StoreBikes.js';
import { createBlockyHuman } from './BlockyHuman.js';

// Rider and bike are drawn this much larger than the collision shape; gameplay sizes stay the same.
const VISUAL_SCALE = 1.2;
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
  group.add(visual);

  let bikeId = 'bike_scooter';
  let bike = createBikeModel(bikeId);
  visual.add(bike);

  const rider = createBlockyHuman();
  visual.add(rider);
  seatRider(rider, bike);

  group.userData.setBikeModel = (nextBikeId) => {
    if (!nextBikeId || nextBikeId === bikeId) return;
    visual.remove(bike);
    bikeId = nextBikeId;
    bike = createBikeModel(bikeId);
    visual.add(bike);
    seatRider(rider, bike);
  };
  group.userData.setBikeColor = (color) => bike.userData.setColor?.(color);
  // Leans bike and rider into a turn (roll about the wheels' contact line); the heading stays on the group.
  group.userData.setLean = (angle) => { visual.rotation.z = angle; };
  group.userData.spinWheels = (distance, deltaSeconds, trainingMultiplier) =>
    bike.userData.spinWheels?.(distance, deltaSeconds, trainingMultiplier);

  return group;
}
