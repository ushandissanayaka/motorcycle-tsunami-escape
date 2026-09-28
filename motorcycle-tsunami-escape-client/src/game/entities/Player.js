import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import scooterUrl from '../../assets/green-delivery-scooter.glb?url';
import { createBike } from './Bike.js';
import { createBlockyHuman } from './BlockyHuman.js';

let scooterModelPromise;

function loadScooterModel() {
  if (!scooterModelPromise) {
    scooterModelPromise = new GLTFLoader().loadAsync(scooterUrl).then(({ scene }) => {
      const scooter = new THREE.Group();
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
  let bikeId = 'bike_scooter';
  let bike = createBikeModel(bikeId);
  group.add(bike);

  const rider = createBlockyHuman();
  rider.position.set(0, 1.08, 0.2);
  group.add(rider);

  group.userData.setBikeModel = (nextBikeId) => {
    if (!nextBikeId || nextBikeId === bikeId) return;
    group.remove(bike);
    bikeId = nextBikeId;
    bike = createBikeModel(bikeId);
    group.add(bike);
  };
  group.userData.setBikeColor = (color) => bike.userData.setColor?.(color);
  group.userData.spinWheels = (distance, deltaSeconds, trainingMultiplier) =>
    bike.userData.spinWheels?.(distance, deltaSeconds, trainingMultiplier);

  return group;
}
