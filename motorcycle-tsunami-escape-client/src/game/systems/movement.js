import * as THREE from 'three';
import { STEP_HEIGHT } from './collision.js';
import { clampToMap } from '../../shared/constants.js';

const MOVE_SPEED = 12; // units/sec, tune per your world scale
const JUMP_SPEED = 6; // units/sec upward
const GRAVITY = 16; // units/sec^2

// Camera-relative controls. W / A / S / D point forward / left / back / right as seen from the camera
// (combinations give the diagonals). A quick tap only turns: A / D by TAP_TURN, and W / S by up to
// TAP_FACE toward their direction (S from facing forward spins the bike round on the spot). Holding a key
// past HOLD_MS turns the bike the rest of the way to that direction and drives it there for as long as
// the key is held; a key whose direction the bike already faces (within FACING) drives straight away.
// Turns run at TURN_SPEED: a tap is done within a frame, a full about-turn in under a tenth of a second.
const DEG = Math.PI / 180;
const TAP_TURN = 20 * DEG;
const TAP_FACE = 120 * DEG;
const FACING = 25 * DEG;
const HOLD_MS = 150; // a press shorter than this is a tap
const TURN_SPEED = 40; // radians/sec
const KEY_DIRECTION = { w: 0, a: Math.PI / 2, s: Math.PI, d: -Math.PI / 2 }; // heading offset from the camera's
const KEY_CODES = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };

/** Angle from `from` to `to`, wrapped to (-PI, PI]. */
const angleTo = (from, to) => {
  const diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) return diff - Math.PI * 2;
  if (diff <= -Math.PI) return diff + Math.PI * 2;
  return diff;
};

export function createInputState() {
  // w / a / s / d / space: held now. `heldSince`: when each direction key went down. `taps`: direction
  // keys pressed since the last movement update, for their one-off tap turns.
  const keys = { w: false, a: false, s: false, d: false, space: false, heldSince: {}, taps: [] };
  keys.clear = () => {
    keys.w = keys.a = keys.s = keys.d = keys.space = false;
    keys.heldSince = {};
    keys.taps.length = 0;
  };

  const onKey = (down) => (e) => {
    if (e.code === 'Space' && !(e.target instanceof HTMLInputElement && e.target.type === 'text')) e.preventDefault();
    if (e.code === 'Space') {
      keys.space = down;
      return;
    }
    const key = KEY_CODES[e.code];
    if (!key) return;
    keys[key] = down;
    if (!down) {
      delete keys.heldSince[key];
    } else if (!e.repeat) {
      keys.heldSince[key] = performance.now();
      keys.taps.push(key);
    }
  };

  const onDown = onKey(true);
  const onUp = onKey(false);
  window.addEventListener('keydown', onDown);
  window.addEventListener('keyup', onUp);
  // Keys released while the window is in the background never send keyup: don't leave the bike driving.
  window.addEventListener('blur', keys.clear);

  keys.dispose = () => {
    window.removeEventListener('keydown', onDown);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('blur', keys.clear);
  };
  return keys;
}

/**
 * Turns the bike for this frame's input and says whether it drives. `cameraYaw` is the heading the camera
 * looks along (the bike's rotation.y convention: 0 faces -Z).
 */
function steer(target, keys, deltaSeconds, cameraYaw) {
  const data = target.userData;
  data.turnRemaining ??= 0;
  // Where the bike ends up once the turn already under way is done.
  const heading = () => target.rotation.y + data.turnRemaining;

  for (const key of keys.taps) {
    if (key === 'a') data.turnRemaining += TAP_TURN;
    else if (key === 'd') data.turnRemaining -= TAP_TURN;
    else {
      const diff = angleTo(heading(), cameraYaw + KEY_DIRECTION[key]);
      if (Math.abs(diff) > FACING) data.turnRemaining += Math.sign(diff) * Math.min(Math.abs(diff), TAP_FACE);
    }
  }
  keys.taps.length = 0;

  // The direction the held keys point, relative to the camera.
  let x = 0;
  let z = 0;
  let heldLong = false;
  const now = performance.now();
  for (const key of Object.keys(KEY_DIRECTION)) {
    if (!keys[key]) continue;
    x += Math.sin(KEY_DIRECTION[key]);
    z += Math.cos(KEY_DIRECTION[key]);
    if (now - (keys.heldSince[key] ?? now) >= HOLD_MS) heldLong = true;
  }
  let driving = false;
  if (Math.hypot(x, z) > 1e-6) {
    const diff = angleTo(heading(), cameraYaw + Math.atan2(x, z));
    if (heldLong || Math.abs(diff) <= FACING) {
      data.turnRemaining += diff; // head for it, driving there while turning
      driving = true;
    }
  }

  const step = TURN_SPEED * deltaSeconds;
  const turn = Math.abs(data.turnRemaining) <= step ? data.turnRemaining : Math.sign(data.turnRemaining) * step;
  target.rotation.y += turn;
  data.turnRemaining -= turn;
  return driving;
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

/** Free-roam hub movement with camera-relative W / A / S / D (see steer above) and Space to jump.
 * Right-drag on the camera (or a one-finger drag) swings the view round the rider; held keys then
 * follow the new view. Pass a `collision` (systems/collision.js) to ride up ramps, be stopped by walls and
 * drop into pits (and hop back out of them). Falling is integrated in every sub-step of the drive, so a
 * rider fast enough to cross a pit before gravity pulls them down clears it. */
export function updateMovement(target, keys, deltaSeconds, collision = null, camera = null) {
  const view = camera?.userData;
  if (view?.steer) {
    view.yaw += view.steer;
    view.yawTarget += view.steer;
    view.steer = 0;
  }
  // Without a camera, "forward" is simply wherever the bike faces.
  const cameraYaw = view ? view.yawTarget : target.rotation.y;
  const throttle = steer(target, keys, deltaSeconds, cameraYaw) ? 1 : 0;

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

  // Drive along the bike's heading, which the chase camera follows.
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), target.rotation.y);
  const speed = target.userData.moveSpeed || MOVE_SPEED;
  const drive = throttle * speed;
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
