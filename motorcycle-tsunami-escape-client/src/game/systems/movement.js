import * as THREE from 'three';
import { STEP_HEIGHT } from './collision.js';
import { clampToMap } from '../../shared/constants.js';

const TURN_SPEED = 2.4; // radians/sec
const MOVE_SPEED = 9; // units/sec, tune per your world scale

export function createInputState() {
  const keys = { w: false, a: false, s: false, d: false, space: false };

  const onKey = (down) => (e) => {
    switch (e.code) {
      case 'KeyW': keys.w = down; break;
      case 'KeyA': keys.a = down; break;
      case 'KeyS': keys.s = down; break;
      case 'KeyD': keys.d = down; break;
      case 'Space': keys.space = down; break;
      default: break;
    }
  };

  const onDown = onKey(true);
  const onUp = onKey(false);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);

  keys.dispose = () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
  };
  return keys;
}

const MAX_SUBSTEP = 0.4; // world units; keeps fast riders from tunnelling through walls

/** Move by (dx, dz), sliding along solids instead of stopping dead. */
function moveWithCollision(target, dx, dz, collision) {
  const { x, z } = target.position;
  const y = target.position.y;
  if (!collision || !collision.blocked(x + dx, z + dz, y)) {
    target.position.x = x + dx;
    target.position.z = z + dz;
  } else if (!collision.blocked(x + dx, z, y)) {
    target.position.x = x + dx;
  } else if (!collision.blocked(x, z + dz, y)) {
    target.position.z = z + dz;
  }
}

/** Free-roam hub movement: W/S drive forward/back, A/D turn. Pass a
 * `collision` (systems/collision.js) to ride up ramps and be stopped by
 * walls. Swap for lane-strafe controls once you build the endless-runner
 * road scene. */
export function updateMovement(target, keys, deltaSeconds, collision = null) {
  if (keys.a) target.rotation.y += TURN_SPEED * deltaSeconds;
  if (keys.d) target.rotation.y -= TURN_SPEED * deltaSeconds;

  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(target.quaternion);
  const speed = target.userData.moveSpeed || MOVE_SPEED;
  const drive = (keys.w ? speed : 0) - (keys.s ? speed * 0.6 : 0);
  if (drive !== 0) {
    const distance = Math.abs(drive) * deltaSeconds;
    const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
    const stepX = (forward.x * Math.sign(drive) * distance) / steps;
    const stepZ = (forward.z * Math.sign(drive) * distance) / steps;
    for (let i = 0; i < steps; i += 1) {
      moveWithCollision(target, stepX, stepZ, collision);
      target.position.y = Math.max(target.position.y, collision?.supportAt(target.position.x, target.position.z, target.position.y) ?? 0);
    }
  }

  // Keep the rider inside the canyon wall.
  const inside = clampToMap(target.position.x, target.position.z);
  target.position.x = inside.x;
  target.position.z = inside.z;

  target.userData.jumpVelocity ??= 0;
  target.userData.grounded ??= true;
  const { x, z } = target.position;
  const support = collision ? collision.supportAt(x, z, target.position.y) : 0;

  if (target.userData.grounded) {
    if (target.position.y > support + STEP_HEIGHT) {
      // Drove off a real edge (not just down a ramp): start falling.
      target.userData.grounded = false;
      target.userData.jumpVelocity = 0;
    } else {
      target.position.y = support;
    }
  }
  if (keys.space && target.userData.grounded) {
    target.userData.jumpVelocity = 6;
    target.userData.grounded = false;
  }
  if (!target.userData.grounded) {
    target.position.y += target.userData.jumpVelocity * deltaSeconds;
    target.userData.jumpVelocity -= 16 * deltaSeconds;
    const landing = collision ? collision.supportAt(x, z, target.position.y) : 0;
    if (target.userData.jumpVelocity <= 0 && target.position.y <= landing) {
      target.position.y = landing;
      target.userData.jumpVelocity = 0;
      target.userData.grounded = true;
    }
  }
}
