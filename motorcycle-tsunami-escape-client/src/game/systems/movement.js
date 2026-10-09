import * as THREE from 'three';
import { STEP_HEIGHT } from './collision.js';
import { clampToMap } from '../../shared/constants.js';

const MOVE_SPEED = 12; // units/sec, tune per your world scale
const JUMP_SPEED = 6; // units/sec upward
const GRAVITY = 16; // units/sec^2
// Climbing a ledge (or dropping down a small one) moves the rider there in a single physics step. The
// visible bike instead keeps where it was and eases after it (POP_RECOVER per second), so jumping into a
// trench wall and catching its lip reads as a quick hop, not a teleport. Collision is unaffected.
const POP_MIN = 0.03; // smaller changes are ordinary slopes, followed exactly
const POP_RECOVER = 16;
// On a ramp a fast rider climbs more than POP_MIN in one sub-step, and each sub-step used to become a small
// ledge "pop" whose size varied with the frame length: the bike bobbed up and down along every ramp instead
// of gliding up it. So the surface's own slope just behind the rider (sampled SLOPE_SAMPLE back along the
// way it drove) says how much rise is ramp, followed exactly; only the rest is a ledge. A ledge crossed
// right at the sample point counts as at most MAX_SLOPE.
const SLOPE_SAMPLE = 0.05;
const MAX_SLOPE = 0.8;

// Camera-relative controls. W / A / S / D point forward / left / back / right as seen from the camera
// (combinations give the diagonals). A quick tap only turns: A / D by TAP_TURN, and W / S by up to
// TAP_FACE toward their direction (S from facing forward spins the bike round on the spot). Holding a key
// past HOLD_MS turns the bike the rest of the way to that direction and drives it there for as long as
// the key is held; a key whose direction the bike already faces (within FACING) drives straight away.
// Each turn is a quick sweep rather than a snap: the bike swings into it at up to TURN_ACCEL, cruises at
// no more than MAX_TURN_RATE and brakes just in time to land exactly on the new heading, with no
// overshoot and no slow creep at the end. Like a real bike, it turns faster the faster it drives: both
// limits scale with the bike's drive speed (moveSpeed, which grows with collected Speed, level and Custom
// Speed) relative to TURN_REFERENCE_SPEED, within TURN_SCALE_MIN..MAX. The top turn rate is kept low
// enough that the bike never swings more than ~10 deg between two frames at 60 fps: any faster and the eye
// sees separate positions instead of a turn, which reads as the game running at a low frame rate. It leans into the turn as a real bike does, by
// tan(lean) = speed * turn rate / LEAN_GRAVITY, so a faster bike leans further in the same turn.
const DEG = Math.PI / 180;
const TAP_TURN = 20 * DEG;
const TAP_FACE = 120 * DEG;
const FACING = 25 * DEG;
const HOLD_MS = 120; // a press shorter than this is a tap
const TURN_ACCEL = 70; // radians/sec^2, at TURN_REFERENCE_SPEED
const MAX_TURN_RATE = 7; // radians/sec, at TURN_REFERENCE_SPEED
const TURN_REFERENCE_SPEED = 12; // drive speed (units/sec) the two limits above are for
const TURN_SCALE_MIN = 0.8;
const TURN_SCALE_MAX = 1.5;
const TURN_FINISH = 0.5 * DEG; // the last sliver of a turn is taken in one step
const LEAN_GRAVITY = 800; // sets how far a given speed * turn rate leans the bike
const MAX_LEAN = 32 * DEG;
const STANDING_LEAN = 0.5; // a spin on the spot leans less than a turn at speed
const LEAN_IN = 30; // how fast the bike tips into a lean, per second (times the turn scale)
const LEAN_OUT = 7; // how fast it straightens up again, per second: more gently, so a quick flick still shows
const KEY_DIRECTION = { w: 0, a: Math.PI / 2, s: Math.PI, d: -Math.PI / 2 }; // heading offset from the camera's
const KEY_CODES = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd' };
const STICK_DEAD_ZONE = 0.25; // how far (of its full reach) the touch joystick must be pushed to drive

/** Angle from `from` to `to`, wrapped to (-PI, PI]. */
const angleTo = (from, to) => {
  const diff = (to - from) % (Math.PI * 2);
  if (diff > Math.PI) return diff - Math.PI * 2;
  if (diff <= -Math.PI) return diff + Math.PI * 2;
  return diff;
};

export function createInputState() {
  // w / a / s / d / space: held now. `heldSince`: when each direction key went down. `taps`: direction
  // keys pressed since the last movement update, for their one-off tap turns. `stick`: the on-screen touch
  // joystick (ui/TouchControls.jsx), { x, y } from -1 to 1 with y up the screen, or null while it is let go; it
  // is not reset by clear(), since a thumb still on the stick keeps steering, as a held key does.
  const keys = { w: false, a: false, s: false, d: false, space: false, heldSince: {}, taps: [], stick: null };
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
  // The touch joystick points the same camera-relative way (up = forward, right = right) and drives at once,
  // like a held key, once pushed past its dead zone.
  const stick = keys.stick;
  if (stick && Math.hypot(stick.x, stick.y) > STICK_DEAD_ZONE) {
    x -= stick.x;
    z += stick.y;
    heldLong = true;
  }
  let driving = false;
  if (Math.hypot(x, z) > 1e-6) {
    const diff = angleTo(heading(), cameraYaw + Math.atan2(x, z));
    if (heldLong || Math.abs(diff) <= FACING) {
      data.turnRemaining += diff; // head for it, driving there while turning
      driving = true;
    }
  }

  // "Arrive" steering: the fastest turn rate from which the bike can still brake to a stop exactly at the
  // new heading, reached no faster than TURN_ACCEL allows.
  data.turnVelocity ??= 0;
  const speed = data.moveSpeed || MOVE_SPEED;
  const scale = THREE.MathUtils.clamp(speed / TURN_REFERENCE_SPEED, TURN_SCALE_MIN, TURN_SCALE_MAX);
  const accel = TURN_ACCEL * scale;
  const remaining = Math.abs(data.turnRemaining);
  const wanted = Math.sign(data.turnRemaining) * Math.min(MAX_TURN_RATE * scale, Math.sqrt(2 * accel * remaining));
  const change = accel * deltaSeconds;
  data.turnVelocity += THREE.MathUtils.clamp(wanted - data.turnVelocity, -change, change);
  let turn = data.turnVelocity * deltaSeconds;
  if (Math.sign(turn) === Math.sign(data.turnRemaining) && Math.abs(turn) >= Math.abs(data.turnRemaining)) turn = data.turnRemaining;
  target.rotation.y += turn;
  data.turnRemaining -= turn;
  if (Math.abs(data.turnRemaining) < TURN_FINISH) {
    target.rotation.y += data.turnRemaining;
    data.turnRemaining = 0;
    data.turnVelocity = 0;
  }

  // Lean into the turn (positive rotation.y turns left, and a positive roll tips the bike to its left).
  const leanSpeed = speed * (driving ? 1 : STANDING_LEAN);
  const leanGoal = THREE.MathUtils.clamp(Math.atan((leanSpeed * data.turnVelocity) / LEAN_GRAVITY), -MAX_LEAN, MAX_LEAN);
  data.lean ??= 0;
  const leaningIn = Math.abs(leanGoal) > Math.abs(data.lean) && Math.sign(leanGoal) !== -Math.sign(data.lean);
  const leanRate = leaningIn ? LEAN_IN * scale : LEAN_OUT;
  data.lean += (leanGoal - data.lean) * Math.min(1, leanRate * deltaSeconds);
  data.setLean?.(data.lean);
  return driving;
}

// The bike tips to the slope it rides on (nose up climbing a ramp, down going down one): the ground is sampled
// PITCH_REACH ahead of and behind the bike's middle along its heading, about where its wheels touch. It is
// only a slope if the ground under the middle lies between them (PITCH_SMOOTHNESS); a ledge or a pit's edge
// isn't one, and the bike stays level there. The tip eases in at PITCH_RATE per second, up to MAX_PITCH.
const PITCH_REACH = 1.0; // world units
const PITCH_SMOOTHNESS = 0.08; // world units
const MAX_PITCH = 35 * DEG;
const PITCH_RATE = 12;

/** The pitch (radians, nose up positive) of the slope under a bike at `position` heading `heading`, or 0 off a slope. */
function slopePitch(collision, position, heading) {
  if (!collision) return 0;
  const { x, y, z } = position;
  const dx = -Math.sin(heading) * PITCH_REACH;
  const dz = -Math.cos(heading) * PITCH_REACH;
  const front = collision.supportAt(x + dx, z + dz, y);
  const back = collision.supportAt(x - dx, z - dz, y);
  const middle = collision.supportAt(x, z, y);
  if (Math.abs(middle - (front + back) / 2) > PITCH_SMOOTHNESS) return 0;
  return THREE.MathUtils.clamp(Math.atan2(front - back, PITCH_REACH * 2), -MAX_PITCH, MAX_PITCH);
}

/**
 * Tips `target`'s bike to the slope it is on (level in the air), easing toward it; `grounded` defaults to the
 * rider's own state (other players' riders pass whether they are on the ground).
 */
export function updateRidePitch(target, collision, deltaSeconds, grounded = target.userData.grounded) {
  const data = target.userData;
  const goal = grounded ? slopePitch(collision, target.position, target.rotation.y) : 0;
  data.pitch = (data.pitch ?? 0) + (goal - (data.pitch ?? 0)) * (1 - Math.exp(-PITCH_RATE * deltaSeconds));
  data.setPitch?.(data.pitch);
}

const MAX_SUBSTEP = 0.4; // world units; keeps fast riders from tunnelling through walls
const UP = new THREE.Vector3(0, 1, 0);
const forward = new THREE.Vector3(); // reused every frame rather than making new vectors to throw away

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
function stepVertical(target, dt, collision, dirX = 0, dirZ = 0, driven = 0) {
  const data = target.userData;
  const { x, z } = target.position;
  const support = collision ? collision.supportAt(x, z, target.position.y) : 0;
  let popMin = POP_MIN;
  if (collision && driven > 0) {
    const behind = collision.supportAt(x - dirX * SLOPE_SAMPLE, z - dirZ * SLOPE_SAMPLE, target.position.y);
    popMin += Math.min(Math.abs(support - behind) / SLOPE_SAMPLE, MAX_SLOPE) * driven;
  }

  if (data.grounded) {
    if (target.position.y > support + STEP_HEIGHT) {
      // Drove off a real edge (not just down a ramp): start falling.
      data.grounded = false;
      data.jumpVelocity = 0;
    } else {
      const snap = support - target.position.y;
      if (Math.abs(snap) > popMin) data.popOffset = (data.popOffset ?? 0) - snap;
      target.position.y = support;
      return;
    }
  }

  // A ledge that is within a step is climbed even in mid-air.
  const climb = support - target.position.y;
  if (climb > popMin) data.popOffset = (data.popOffset ?? 0) - climb;
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
  forward.set(0, 0, -1).applyAxisAngle(UP, target.rotation.y);
  const speed = target.userData.moveSpeed || MOVE_SPEED;
  const drive = throttle * speed;
  const distance = Math.abs(drive) * deltaSeconds;
  const steps = Math.max(1, Math.ceil(distance / MAX_SUBSTEP));
  const stepX = forward.x * Math.sign(drive) * distance / steps;
  const stepZ = forward.z * Math.sign(drive) * distance / steps;
  for (let i = 0; i < steps; i += 1) {
    const fromX = target.position.x;
    const fromZ = target.position.z;
    if (drive !== 0) moveWithCollision(target, stepX, stepZ, collision);
    const movedX = target.position.x - fromX;
    const movedZ = target.position.z - fromZ;
    const driven = Math.hypot(movedX, movedZ);
    if (driven > 1e-6) stepVertical(target, deltaSeconds / steps, collision, movedX / driven, movedZ / driven, driven);
    else stepVertical(target, deltaSeconds / steps, collision);
  }

  // The visible bike eases after any ledge the physics just stepped it onto (see POP_RECOVER).
  if (target.userData.popOffset) {
    target.userData.popOffset *= Math.exp(-POP_RECOVER * deltaSeconds);
    if (Math.abs(target.userData.popOffset) < 1e-3) target.userData.popOffset = 0;
  }
  target.userData.setVisualOffset?.(target.userData.popOffset ?? 0);
  updateRidePitch(target, collision, deltaSeconds);

  // Keep the rider inside the canyon wall.
  const inside = clampToMap(target.position.x, target.position.z);
  target.position.x = inside.x;
  target.position.z = inside.z;
}
