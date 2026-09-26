import * as THREE from 'three';
import { createBike } from './Bike.js';
import { createBlockyHuman } from './BlockyHuman.js';

/**
 * Blocky-human rider on the light-cycle bike. Swap either mesh for a loaded
 * .glb once art is ready — everything else (movement, camera target, net
 * sync) reads target.position / target.quaternion and doesn't care what the
 * mesh looks like.
 */
export function createPlayer() {
  const group = new THREE.Group();

  const bike = createBike();
  group.add(bike);

  const rider = createBlockyHuman();
  rider.position.set(0, 1.08, 0.2);
  group.add(rider);

  group.userData.setBikeColor = (color) => bike.userData.setColor(color);

  return group;
}
