import * as THREE from 'three';

/**
 * Wheel spin for the ridden bike. Every wheel is a group marked with `userData.wheelRadius` whose local X
 * axis is the axle (StoreBikes' wheels, Bike.js's, and the empty wheel pivots `addWheelPivots` puts into
 * the one-piece GLB bikes).
 *
 * A wheel is never turned faster than MAX_TURN_RATE: past about a third of a turn between frames the eye no
 * longer sees it turn, and it seems to stand still or roll backwards (the wagon-wheel effect), which is why
 * the wheels on a training board looked stopped. Instead, the faster it truly spins, the more a translucent
 * motion-blur disc over the rim shows, as a spinning wheel does to the eye. On the one-piece GLB bikes the
 * disc is all that turns, since their wheels cannot move on their own.
 */
const MAX_TURN_RATE = 22; // radians per second the wheel itself turns at most
const BLUR_FROM = 6; // radians per second of true spin where the blur starts to show...
const BLUR_FULL = 34; // ...and where it is fully there
const BLUR_OPACITY = 0.85;
const TRAINING_RATE = [18, 2, 120]; // spin in place on a training board: base + per multiplier, at most

let blurTexture = null;
/** A wheel's spokes and rim smeared by spin: a pale haze with bright streaks swept round it. */
function getBlurTexture() {
  if (blurTexture) return blurTexture;
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  // A pale, see-through disc (spokes and rim smeared into a haze), densest toward the rim...
  const shade = ctx.createRadialGradient(c, c, c * 0.15, c, c, c);
  shade.addColorStop(0, 'rgba(170, 180, 200, 0.2)');
  shade.addColorStop(0.7, 'rgba(190, 200, 220, 0.45)');
  shade.addColorStop(0.92, 'rgba(120, 128, 145, 0.6)');
  shade.addColorStop(1, 'rgba(120, 128, 145, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size, size);
  // ...with bright arcs swept round it, the streaks a spinning wheel leaves.
  ctx.lineCap = 'round';
  for (let i = 0; i < 34; i += 1) {
    const radius = c * (0.3 + 0.62 * Math.random());
    const start = Math.random() * Math.PI * 2;
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.45 + 0.5 * Math.random()})`;
    ctx.lineWidth = 1.5 + Math.random() * 3;
    ctx.beginPath();
    ctx.arc(c, c, radius, start, start + 0.5 + Math.random() * 1.2);
    ctx.stroke();
  }
  blurTexture = new THREE.CanvasTexture(canvas);
  blurTexture.colorSpace = THREE.SRGBColorSpace;
  return blurTexture;
}

const discGeometry = new THREE.CircleGeometry(1, 28).rotateY(Math.PI / 2); // faces along X, the axle
const blurs = new WeakMap(); // wheel -> its blur discs' material (kept out of userData, which clone() copies as JSON)

/** Puts a blur disc on each side of `wheel` (a group with `userData.wheelRadius`), once. */
function addBlur(wheel) {
  if (blurs.has(wheel)) return;
  const radius = wheel.userData.wheelRadius * 0.92;
  const halfWidth = wheel.userData.halfWidth ?? 0.09;
  const material = new THREE.MeshBasicMaterial({ map: getBlurTexture(), transparent: true, opacity: 0, depthWrite: false });
  for (const side of [-1, 1]) {
    const disc = new THREE.Mesh(discGeometry, material);
    disc.scale.setScalar(radius);
    disc.position.x = side * (halfWidth + 0.01);
    wheel.add(disc);
  }
  blurs.set(wheel, material);
}

/**
 * Empty wheel pivots for a one-piece GLB bike, placed in the model's own coordinates: each wheel is
 * { x, y, r, halfWidth } with the axle along the model's Z. The pivot's local X is turned onto that axle.
 */
export function addWheelPivots(model, wheels) {
  for (const { x, y, r, halfWidth } of wheels) {
    const mount = new THREE.Group();
    mount.position.set(x, y, 0);
    mount.rotation.y = Math.PI / 2; // local X -> the model's Z axle
    const wheel = new THREE.Group();
    wheel.userData.wheelRadius = r;
    wheel.userData.halfWidth = halfWidth;
    mount.add(wheel);
    model.add(mount);
  }
}

/**
 * The ridden bike's wheel spinner: `(distance, deltaSeconds, trainingMultiplier)` rolls the wheels over
 * `distance` on the road, or spins them in place on a training board. `bike` may swap its model later (a GLB
 * replacing its stand-in once loaded): the wheels are looked up again whenever that happens.
 */
export function createWheelSpinner(bike) {
  let wheels = [];
  let lastChild = null;
  const findWheels = () => {
    wheels = [];
    bike.traverse((object) => { if (object.userData.wheelRadius) wheels.push(object); });
    for (const wheel of wheels) addBlur(wheel);
    lastChild = bike.children[bike.children.length - 1] ?? null;
  };
  findWheels();

  return (distance, deltaSeconds, trainingMultiplier = 0) => {
    if ((bike.children[bike.children.length - 1] ?? null) !== lastChild) findWheels();
    if (deltaSeconds <= 0) return;
    for (const wheel of wheels) {
      const [base, perMultiplier, most] = TRAINING_RATE;
      const rate = trainingMultiplier > 0
        ? Math.min(base + trainingMultiplier * perMultiplier, most)
        : distance / wheel.userData.wheelRadius / deltaSeconds;
      // Rolling forward (toward -Z) turns the top of the wheel forward: a negative turn about the X axle.
      wheel.rotation.x -= Math.min(rate, MAX_TURN_RATE) * deltaSeconds;
      blurs.get(wheel).opacity = BLUR_OPACITY * THREE.MathUtils.smoothstep(rate, BLUR_FROM, BLUR_FULL);
    }
  };
}
