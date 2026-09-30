import * as THREE from 'three';
import { clampToMap } from '../../shared/constants.js';

const OFFSET = new THREE.Vector3(0, 3.2, 7); // behind + above the rider, at zoom 1
const LOOK_OFFSET = new THREE.Vector3(0, 1.4, 0);
// Smoothing rates, per second, applied by elapsed time rather than per frame, so the camera sits the same
// distance behind the rider whatever the frame rate (a fixed per-frame lerp makes that distance wobble with
// every uneven frame, which reads as the screen shaking).
const FOLLOW_RATE = 14; // the camera and the point it looks at, sideways and forward
const FOLLOW_RATE_VERTICAL = 6; // softer up and down, so ledges, steps and landings don't jolt the view
const CAMERA_CATCH_RATE = 30; // eases out the jump when the map edge pushes the camera in
const SNAP_DISTANCE = 40; // a teleport (respawn, return home): cut straight there instead of sweeping

const ZOOM_MIN = 0.4; // close behind the rider
const ZOOM_MAX = 6; // high above, showing the whole map area
const VIEW_RATE = 21; // zoom / orbit / tilt easing, per second (about the old 0.3 per frame at 60 fps)

const ORBIT_SPEED = 0.0035; // radians per pixel dragged
const KEY_ORBIT_STEP = 0.2; // radians per Q / E press
const PITCH_MIN = 0.06; // never dip below the ground
const PITCH_MAX = 1.45; // almost straight down

export function createChaseCamera(aspect) {
  // A wider default matches the open, pulled-back arcade view in the reference image.
  const camera = new THREE.PerspectiveCamera(70, aspect, 0.1, 2000);
  // zoom / world-space yaw / pitch ease toward their targets. Camera yaw is independent of rider heading,
  // so turning the bike does not swing the camera around it; W / A / S / D steer relative to it (see
  // systems/movement.js). `steer` collects right-drag turning.
  camera.userData = { zoom: 1, zoomTarget: 1, yaw: 0, yawTarget: 0, pitch: 0, pitchTarget: 0, steer: 0 };
  return camera;
}

const clampZoom = (value) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

/**
 * Camera controls, all removed by the returned function:
 * - zoom: mouse wheel, touchpad two-finger scroll / pinch, touchscreen pinch, + / - keys
 * - rotate: hold the right mouse button (or touchpad right click) and drag, or one-finger drag on a
 *   touchscreen. Sideways orbits the view around the rider (held W / A / S / D follow the new view, so the
 *   bike goes where you look); up / down tilts the view.
 * - look around the rider: Q / E; R resets the view
 */
export function attachCameraControls(camera) {
  const data = camera.userData;
  const zoomBy = (factor) => {
    data.zoomTarget = clampZoom(data.zoomTarget * factor);
  };
  const dragBy = (turn, pitch) => {
    data.steer += turn;
    data.pitchTarget = THREE.MathUtils.clamp(data.pitchTarget + pitch, -1.5, 1.5);
    data.pitch = data.pitchTarget;
  };
  // Scrolling or dragging inside HUD panels must not move the world camera.
  const overPanel = (event) => event.target instanceof Element && event.target.closest('.garage-popover, .chat-panel, .menu-popup');

  const onWheel = (event) => {
    if (overPanel(event)) return;
    event.preventDefault(); // also stops the browser page-zoom when pinching a touchpad (ctrl + wheel)
    const lineHeight = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
    // Touchpad pinch arrives as ctrl + wheel with small deltas, so it needs a larger gain.
    const gain = event.ctrlKey ? 0.012 : 0.0016;
    zoomBy(Math.exp(event.deltaY * lineHeight * gain));
  };

  const onKey = (event) => {
    if (event.key === '+' || event.key === '=') zoomBy(0.85);
    else if (event.key === '-' || event.key === '_') zoomBy(1 / 0.85);
    else if (event.code === 'KeyQ') data.yawTarget += KEY_ORBIT_STEP;
    else if (event.code === 'KeyE') data.yawTarget -= KEY_ORBIT_STEP;
    else if (event.code === 'KeyR') {
      data.yawTarget = 0;
      data.pitchTarget = 0;
      data.zoomTarget = 1;
    }
  };

  // Drag to rotate: right mouse button, or a single finger on the canvas.
  let drag = null;
  const touchPointers = new Set();
  const onPointerDown = (event) => {
    if (overPanel(event)) return;
    if (event.pointerType === 'touch') {
      touchPointers.add(event.pointerId);
      if (touchPointers.size > 1) drag = null; // two fingers = pinch zoom
      else if (event.target instanceof HTMLCanvasElement) drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    } else if (event.button === 2) {
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }
    if (drag) document.body.style.cursor = 'grabbing';
  };
  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    // Dragging right turns the rider (and the view behind them) to the right.
    dragBy(-(event.clientX - drag.x) * ORBIT_SPEED, (event.clientY - drag.y) * ORBIT_SPEED);
    drag.x = event.clientX;
    drag.y = event.clientY;
  };
  const endDrag = (event) => {
    touchPointers.delete(event.pointerId);
    if (drag && event.pointerId === drag.id) {
      drag = null;
      document.body.style.cursor = '';
    }
  };
  // The right-click menu would otherwise pop up when the drag ends.
  const onContextMenu = (event) => {
    if (!overPanel(event)) event.preventDefault();
  };

  let pinchDistance = 0;
  const distance = (touches) => Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
  const onTouchStart = (event) => {
    if (event.touches.length === 2 && !overPanel(event)) pinchDistance = distance(event.touches);
  };
  const onTouchMove = (event) => {
    if (event.touches.length !== 2 || !pinchDistance || overPanel(event)) return;
    event.preventDefault();
    const next = distance(event.touches);
    zoomBy(pinchDistance / next); // fingers apart = zoom in
    pinchDistance = next;
  };
  const onTouchEnd = (event) => {
    if (event.touches.length < 2) pinchDistance = 0;
  };

  const listeners = [
    ['wheel', onWheel, { passive: false }],
    ['keydown', onKey],
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', endDrag],
    ['pointercancel', endDrag],
    ['contextmenu', onContextMenu],
    ['touchstart', onTouchStart, { passive: true }],
    ['touchmove', onTouchMove, { passive: false }],
    ['touchend', onTouchEnd],
    ['touchcancel', onTouchEnd],
  ];
  for (const [type, handler, options] of listeners) window.addEventListener(type, handler, options);
  return () => {
    for (const [type, handler] of listeners) window.removeEventListener(type, handler);
    document.body.style.cursor = '';
  };
}

/** Call every frame after the target has moved; `deltaSeconds` is the frame's length. */
export function updateChaseCamera(camera, target, deltaSeconds = 1 / 60) {
  const data = camera.userData;
  const ease = (rate) => 1 - Math.exp(-rate * deltaSeconds);
  data.zoom += (data.zoomTarget - data.zoom) * ease(VIEW_RATE);
  data.yaw += (data.yawTarget - data.yaw) * ease(VIEW_RATE);
  data.pitch += (data.pitchTarget - data.pitch) * ease(VIEW_RATE);

  // The point the camera follows and looks at: the rider (or a shop focus point). Sideways and forward it is
  // locked to the goal: chasing a moving rider with an eased lag makes that lag depend on each frame's
  // length (it is about speed * (1 / rate - frame / 2)), so every uneven frame shifted the bike on screen,
  // more the faster it rode, which read as the bike shaking. Only a switch of goal (to or from a shop focus
  // point) is eased, as an offset that decays toward the new goal and never depends on the goal's speed.
  const goal = data.focusPoint ?? target.position;
  data.focusOffset ??= new THREE.Vector3();
  if (!data.focus || data.focus.distanceTo(goal) > SNAP_DISTANCE) {
    data.focus = goal.clone();
    data.focusOffset.set(0, 0, 0);
    data.focusGoal = goal;
  } else if (data.focusGoal !== goal) {
    data.focusOffset.set(data.focus.x - goal.x, 0, data.focus.z - goal.z);
    data.focusGoal = goal;
  }
  data.focusOffset.multiplyScalar(1 - ease(FOLLOW_RATE));
  data.focus.x = goal.x + data.focusOffset.x;
  data.focus.z = goal.z + data.focusOffset.z;
  data.focus.y += (goal.y - data.focus.y) * ease(FOLLOW_RATE_VERTICAL);

  // Zooming out also raises the camera faster than it pulls back, tilting the view toward top-down.
  const height = OFFSET.y * data.zoom ** 1.25;
  const reach = OFFSET.z * data.zoom;
  const radius = Math.hypot(height, reach);
  const pitch = THREE.MathUtils.clamp(Math.atan2(height, reach) + data.pitch, PITCH_MIN, PITCH_MAX);

  // Keep the camera's world-space heading stable while the rider turns beneath it. The camera is held rigidly
  // at its offset from the smoothed focus, so the two never drift against each other.
  const yaw = data.yaw;
  const flat = radius * Math.cos(pitch);
  data.desired ??= new THREE.Vector3();
  const desired = data.desired.set(flat * Math.sin(yaw), radius * Math.sin(pitch), flat * Math.cos(yaw)).add(data.focus);
  // Keep the camera out of the canyon wall when the rider is near an edge. Only that push is eased; the
  // camera itself stays rigidly on its offset from the focus (easing the whole position would add a second
  // frame-length-dependent lag behind a moving rider, see above).
  const inside = clampToMap(desired.x, desired.z, 1.5);
  data.edgePush ??= new THREE.Vector3();
  const pushX = inside.x - desired.x;
  const pushZ = inside.z - desired.z;
  if (camera.position.distanceTo(desired) > SNAP_DISTANCE * 2) data.edgePush.set(pushX, 0, pushZ);
  else {
    const catchUp = ease(CAMERA_CATCH_RATE);
    data.edgePush.x += (pushX - data.edgePush.x) * catchUp;
    data.edgePush.z += (pushZ - data.edgePush.z) * catchUp;
  }
  camera.position.set(desired.x + data.edgePush.x, desired.y, desired.z + data.edgePush.z);
  data.lookAt ??= new THREE.Vector3();
  camera.lookAt(data.lookAt.copy(data.focus).add(LOOK_OFFSET));
}
