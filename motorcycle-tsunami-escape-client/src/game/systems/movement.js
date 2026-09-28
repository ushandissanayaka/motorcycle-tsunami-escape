import * as THREE from 'three';
import { STEP_HEIGHT } from './collision.js';
import { clampToMap } from '../../shared/constants.js';

const TURN_SPEED = 2.4; // radians/sec
const MOVE_SPEED = 12; // units/sec, tune per your world scale
const JUMP_SPEED = 6; // units/sec upward
const GRAVITY = 16; // units/sec^2

export function createInputState() {
  const keys = { w: false, a: false, s: false, d: false, space: false };

  const onKey = (down) => (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) e.preventDefault();
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

/** One slice of vertical motion: stand on / step up to the surface below, drive off an edge into a fall, or fly and land. */
function stepVertical(target, dt, collision) {
  const data = target.userData;
  const { x, z } = target.position;
  const support = collision ? collision.supportAt(x, z, target.position.y) : 0;

  if (data.grounded) {
    if (target.position.y > support + STEP_HEIGHT) {
      // Drove off a real edge (not just down a ramp): start falling.
      data.grounded = false;
      data.jumpVelocity = 0;
    } else {
      target.position.y = support;
      return;
    }
  }

  // A ledge that is within a step is climbed even in mid-air.
  target.position.y = Math.max(target.position.y, support);
  target.position.y += data.jumpVelocity * dt;
  data.jumpVelocity -= GRAVITY * dt;
  const landing = collision ? collision.supportAt(x, z, target.position.y) : 0;
  if (data.jumpVelocity <= 0 && target.position.y <= landing) {
    target.position.y = landing;
    data.jumpVelocity = 0;
    data.grounded = true;
  }
}

/** Free-roam hub movement: W/S drive forward/back, A/D turn, Space jumps. Pass a
 * `collision` (systems/collision.js) to ride up ramps, be stopped by walls and
 * drop into pits (and hop back out of them). Falling is integrated in every sub-step of the drive, so a
 * rider fast enough to cross a pit before gravity pulls them down clears it.
 * Swap for lane-strafe controls once you build the endless-runner
 * road scene. */
export function updateMovement(target, keys, deltaSeconds, collision = null, camera = null) {
  if (keys.a) target.rotation.y += TURN_SPEED * deltaSeconds;
  if (keys.d) target.rotation.y -= TURN_SPEED * deltaSeconds;

  target.userData.jumpVelocity ??= 0;
  target.userData.grounded ??= true;
  if (keys.space && target.userData.grounded) {
    let jump = target.userData.jumpSpeed || JUMP_SPEED;
    // A rider at the bottom of a pit gets a strong hop that always clears its wall, so falling in is never a trap,
    // even at level 1 (a normal jump only rises about a unit).
    const pit = collision?.pitAt(target.position.x, target.position.z);
    if (pit && target.position.y < pit.floor + 1) {
      jump = Math.max(jump, Math.sqrt(2 * GRAVITY * (-pit.floor + STEP_HEIGHT + 0.6)));
    }
    target.userData.jumpVelocity = jump;
    target.userData.grounded = false;
  }

  // Drive along the bike's heading. Camera orbit is independent of bike steering.
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), target.rotation.y);
  const speed = target.userData.moveSpeed || MOVE_SPEED;
  const drive = (keys.w ? speed : 0) - (keys.s ? speed * 0.6 : 0);
  const distance = Math.abs(drive) * deltaSeconds;
  const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
  const stepX = forward.x * Math.sign(drive) * distance / steps;
  const stepZ = forward.z * Math.sign(drive) * distance / steps;
  for (let i = 0; i < steps; i += 1) {
    if (drive !== 0) moveWithCollision(target, stepX, stepZ, collision);
    stepVertical(target, deltaSeconds / steps, collision);
  }

  // Keep the rider inside the canyon wall.
  const inside = clampToMap(target.position.x, target.position.z);
  target.position.x = inside.x;
  target.position.z = inside.z;
}
