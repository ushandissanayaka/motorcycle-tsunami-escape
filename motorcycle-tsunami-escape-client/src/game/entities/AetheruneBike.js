import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import modelUrl from '../../assets/aetherune-midnight-starfall.glb?url';

const TARGET_LENGTH = 2.6;
let modelPromise;

function loadBikeModel() {
  if (!modelPromise) {
    modelPromise = new GLTFLoader().loadAsync(modelUrl).then(({ scene }) => {
      // The source model's length runs along +X. Turn it to the game's -Z forward axis.
      const oriented = new THREE.Group();
      scene.rotation.y = Math.PI / 2;
      oriented.add(scene);
      oriented.updateMatrixWorld(true);

      const bounds = new THREE.Box3().setFromObject(oriented);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const scale = TARGET_LENGTH / size.z;
      oriented.position.set(-center.x, -bounds.min.y, -center.z);
      oriented.scale.setScalar(scale);

      oriented.traverse((object) => {
        if (!object.isMesh) return;
        object.castShadow = true;
        object.receiveShadow = true;
      });
      return oriented;
    }).catch((error) => {
      modelPromise = null;
      console.error('Could not load the Aetherune bike model.', error);
      throw error;
    });
  }
  return modelPromise;
}

/** Load and fit the supplied textured GLB to the store's standard bike axes and size. */
export function createAetheruneBike() {
  const bike = new THREE.Group();
  loadBikeModel().then((model) => bike.add(model.clone(true)));
  return bike;
}
