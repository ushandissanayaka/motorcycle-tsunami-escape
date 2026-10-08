import * as THREE from 'three';

/**
 * Floating "+N" speed popups, shown whenever riding or training earns speed: white numbers with a heavy dark
 * outline and a blue sneaker, as in the reference. Each one bursts out of the rider and flies a good way off
 * to one side (alternating left and right as seen from the camera, at random heights and distances), pops to
 * full size, drifts up a little and fades, so a steady stream of them scatters all around the rider.
 *
 * They are sprites sized in world units, so they sit correctly next to the rider at any camera zoom. A fixed
 * pool of sprites is reused, and each amount's picture is drawn once and remembered, so a stream of popups
 * creates nothing new frame to frame.
 */
// Every popup shows this same amount, whatever was actually earned since the last one: the popups are the
// look of speed coming in, while the real amount goes straight onto the rider's speed (see App.jsx).
export const SPEED_POPUP_VALUE = 7;
const DURATION = 1.15; // seconds
const FLY = 0.28; // seconds to fly out to its spot
const POP = 0.12; // seconds to settle from its overshoot to full size
const FADE = 0.35; // last seconds, fading out
const DRIFT = 0.35; // world units it floats up after arriving
const START_HEIGHT = 1.6; // bursts from about the rider's hands
const SIDE = [1.4, 3.6]; // world units out to the side
const LIFT = [0.5, 2.6]; // world units up
const TOWARD = [0, 0.8]; // world units toward the camera
const WIDTH = 2.3;
const CANVAS = { width: 512, height: 236 };
const HEIGHT = (WIDTH * CANVAS.height) / CANVAS.width;
const POOL = 16;
const TEXTURE_CACHE = 48;

const random = ([min, max]) => min + Math.random() * (max - min);
const easeOut = (t) => 1 - (1 - t) ** 3;

/** A chunky cartoon sneaker, toe to the right, in a 200 x 140 box at (x, y) scaled by `s`. */
function drawShoe(ctx, x, y, s) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const upper = new Path2D('M18 98 C14 70 16 46 30 34 C44 26 58 30 66 44 C72 52 80 54 86 46 L96 20 C104 12 122 12 128 22 L132 46 C150 56 176 64 188 80 C196 90 194 100 186 102 Z');
  const sole = new Path2D('M10 96 L190 96 C198 96 200 108 194 116 C190 124 182 126 172 126 L24 126 C14 126 8 118 8 108 C8 100 8 96 10 96 Z');
  // One heavy outline round the whole shoe, drawn first so the fills sit on top of it.
  ctx.strokeStyle = '#0c1c33';
  ctx.lineWidth = 16;
  ctx.stroke(upper);
  ctx.stroke(sole);
  const blue = ctx.createLinearGradient(0, 14, 0, 100);
  blue.addColorStop(0, '#9ff0ff');
  blue.addColorStop(0.45, '#45c3ff');
  blue.addColorStop(1, '#1a7fe6');
  ctx.fillStyle = blue;
  ctx.fill(upper);
  // Toe cap and heel tab, a little lighter.
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
  ctx.fill(new Path2D('M150 62 C170 70 186 80 188 92 L150 92 C146 82 146 70 150 62 Z'));
  ctx.fill(new Path2D('M22 50 C26 40 34 36 40 38 L38 70 L22 72 Z'));
  // Sole: white with a pale blue stripe.
  ctx.fillStyle = '#ffffff';
  ctx.fill(sole);
  ctx.fillStyle = '#bfe9ff';
  ctx.fillRect(12, 112, 178, 6);
  // Laces across the tongue.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  for (const [ax, ay, bx, by] of [[98, 34, 120, 30], [96, 48, 124, 44], [94, 62, 128, 58]]) {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.restore();
}

const textures = new Map(); // amount -> texture, oldest first
function getTexture(amount) {
  let texture = textures.get(amount);
  if (texture) return texture;

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS.width;
  canvas.height = CANVAS.height;
  const ctx = canvas.getContext('2d');
  const text = `+${amount.toLocaleString()}`;
  ctx.font = '900 112px "Fredoka", "Lilita One", "Arial Black", Arial, sans-serif';
  const shoeWidth = 200 * 1.05;
  const textWidth = Math.min(ctx.measureText(text).width, CANVAS.width - shoeWidth - 40);
  const left = (CANVAS.width - textWidth - shoeWidth - 6) / 2;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 22;
  ctx.strokeStyle = '#0d0f16';
  ctx.strokeText(text, left, 126, textWidth);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, left, 126, textWidth);
  drawShoe(ctx, left + textWidth + 6, 44, 1.05);

  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textures.set(amount, texture);
  if (textures.size > TEXTURE_CACHE) {
    // Far more amounts than popups alive at once, so the oldest is long off screen.
    const [oldest, old] = textures.entries().next().value;
    textures.delete(oldest);
    old.dispose();
  }
  return texture;
}

export function createSpeedPopups(scene) {
  const pool = Array.from({ length: POOL }, () => {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getTexture(SPEED_POPUP_VALUE), // drawn while loading; always having a picture also means no shader change later
      transparent: true,
      depthWrite: false,
      depthTest: false, // stays readable over the bike and road, like the wave track's reward labels
    }));
    sprite.renderOrder = 10;
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, start: -Infinity, from: new THREE.Vector3(), to: new THREE.Vector3() };
  });
  let nextSide = 1; // alternates -1 / 1 so successive popups fly left, right, left, ...

  /**
   * Bursts a "+amount" popup out of the rider. `position` is the rider's feet, `viewYaw` the camera's orbit
   * angle (its right-hand side is where "right" is), `time` the running clock in seconds.
   */
  const spawn = (position, amount, time, viewYaw = 0) => {
    if (amount <= 0) return;
    // A free sprite, or else the one closest to finishing.
    const entry = pool.reduce((best, item) => (item.start < best.start ? item : best));
    const side = nextSide;
    nextSide = -nextSide;
    const rightX = Math.cos(viewYaw);
    const rightZ = -Math.sin(viewYaw);
    const out = random(SIDE) * side;
    const toward = random(TOWARD);
    entry.from.set(position.x, position.y + START_HEIGHT, position.z);
    entry.to.set(
      position.x + rightX * out + Math.sin(viewYaw) * toward,
      position.y + START_HEIGHT + random(LIFT),
      position.z + rightZ * out + Math.cos(viewYaw) * toward,
    );
    entry.start = time;
    entry.sprite.material.map = getTexture(amount);
    entry.sprite.visible = true;
    place(entry, 0);
  };

  const place = (entry, age) => {
    const { sprite, from, to } = entry;
    const fly = easeOut(Math.min(age / FLY, 1));
    sprite.position.lerpVectors(from, to, fly);
    sprite.position.y += DRIFT * Math.max(0, age - FLY) / (DURATION - FLY);
    let size;
    if (age < FLY) size = 0.35 + 0.77 * fly; // grows as it flies out, overshooting to 1.12...
    else size = 1 + 0.12 * (1 - Math.min((age - FLY) / POP, 1)); // ...and settles to full size
    sprite.scale.set(WIDTH * size, HEIGHT * size, 1);
    sprite.material.opacity = Math.min(1, (DURATION - age) / FADE);
  };

  /** Moves every popup along; `time` matches `spawn`'s clock. */
  const update = (time) => {
    for (const entry of pool) {
      if (!entry.sprite.visible) continue;
      const age = time - entry.start;
      if (age >= DURATION) {
        entry.sprite.visible = false;
        entry.start = -Infinity;
        continue;
      }
      place(entry, age);
    }
  };

  const dispose = () => {
    for (const { sprite } of pool) {
      scene.remove(sprite);
      sprite.material.dispose();
    }
  };

  return { spawn, update, dispose };
}
