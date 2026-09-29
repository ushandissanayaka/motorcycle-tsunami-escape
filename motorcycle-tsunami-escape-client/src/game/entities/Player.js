import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import scooterUrl from '../../assets/green-delivery-scooter.glb?url';
import { createBike } from './Bike.js';
import { createBlockyHuman } from './BlockyHuman.js';

// Rider and bike are drawn this much larger than the collision shape; gameplay sizes stay the same.
const VISUAL_SCALE = 1.2;
const RIDER_SEAT = new THREE.Vector3(0, 1.16, 0.2); // hips on the seat, sneakers on the floorboard
// Shoulder pitch that puts the hands on the handlebar grips. The scooter's grips sit at shoulder
// height, so its arms reach straight forward; the procedural bike's bars are lower.
const ARM_ANGLE = { scooter: 1.58, bike: 1.1 };

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

function createBikeModel(bikeId) {
  return bikeId === 'bike_scooter' ? createStarterScooter() : createBike();
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
  rider.position.copy(RIDER_SEAT);
  visual.add(rider);
  const poseArms = () => {
    const angle = bikeId === 'bike_scooter' ? ARM_ANGLE.scooter : ARM_ANGLE.bike;
    for (const arm of rider.userData.arms) arm.rotation.x = angle;
  };
  poseArms();

  group.userData.setBikeModel = (nextBikeId) => {
    if (!nextBikeId || nextBikeId === bikeId) return;
    visual.remove(bike);
    bikeId = nextBikeId;
    bike = createBikeModel(bikeId);
    visual.add(bike);
    poseArms();
  };
  group.userData.setBikeColor = (color) => bike.userData.setColor?.(color);
  // Leans bike and rider into a turn (roll about the wheels' contact line); the heading stays on the group.
  group.userData.setLean = (angle) => { visual.rotation.z = angle; };
  group.userData.spinWheels = (distance, deltaSeconds, trainingMultiplier) =>
    bike.userData.spinWheels?.(distance, deltaSeconds, trainingMultiplier);

  return group;
}
