import * as THREE from 'three';

/**
 * Floating "+N" speed popups above the rider, shown whenever driving earns
 * speed. Built the same way as the wave track's "+N Wins" reward label (a
 * THREE.Sprite whose scale is in world units): its size stays correct next to
 * the road and tiles at any camera zoom, unlike a screen-space HTML overlay,
 * which would need its own per-zoom positioning logic and is easy to get
 * wrong at the extremes.
 *
 * Each popup starts at one of the rider's hands - left, then right, then left
 * again - and hops outward from there, instead of centring above the head.
 */
const DURATION = 1; // seconds, matches the reference: gone about a second after it appears
const HAND_OFFSET = 0.5; // world units out from centre to each handlebar grip (see Player.js)
const HOP = 0.4; // world units the popup hops further out over its life
const WIDTH = 1.8; // world-unit width: a little under a road-lane's width, so it reads as an on-rider effect, not a sign
const HEIGHT = WIDTH * 0.4;
const HOVER_HEIGHT = 1.9; // handlebar-grip height of the scaled-up rider, not head height

const textureCache = new Map();

function getTexture(amount) {
  let texture = textureCache.get(amount);
  if (texture) return texture;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 208;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  ctx.font = '900 104px Arial';
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#0b3d66';
  ctx.strokeText(`+${amount}`, 190, 104);
  ctx.fillStyle = '#69e0ff';
  ctx.fillText(`+${amount}`, 190, 104);

  // A running-shoe emoji stands in for a hand-drawn icon; Chromium renders it in colour.
  ctx.font = '128px "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.fillText('\u{1F45F}', 400, 108);

  texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(amount, texture);
  return texture;
}

export function createSpeedPopups(scene) {
  const active = [];
  let nextSide = 1; // alternates -1 / 1 so successive popups step left, right, left, ...

  /** Spawns a "+amount" popup at the rider's left or right hand (alternating each call), `position` being the rider's feet and `yaw` their facing angle in radians. `time` is the running clock in seconds. */
  const spawn = (position, amount, time, yaw = 0) => {
    if (amount <= 0) return;
    const side = nextSide;
    nextSide = -nextSide;
    // The rider's right-hand vector, so "left hand"/"right hand" follow the direction they're actually facing.
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const handX = position.x + rightX * HAND_OFFSET * side;
    const handZ = position.z + rightZ * HAND_OFFSET * side;

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: getTexture(amount),
      transparent: true,
      depthWrite: false,
      depthTest: false, // stays readable over the bike and road, like the wave track's reward labels
    }));
    sprite.scale.set(WIDTH, HEIGHT, 1);
    sprite.position.set(handX, position.y + HOVER_HEIGHT, handZ);
    sprite.renderOrder = 10;
    scene.add(sprite);
    active.push({ sprite, baseX: handX, baseY: sprite.position.y, baseZ: handZ, rightX, rightZ, side, start: time });
  };

  /** Advances every popup's outward hop/fade and drops the ones past their lifetime; `time` matches `spawn`'s clock. */
  const update = (time) => {
    for (let i = active.length - 1; i >= 0; i -= 1) {
      const entry = active[i];
      const t = (time - entry.start) / DURATION;
      if (t >= 1) {
        scene.remove(entry.sprite);
        entry.sprite.material.dispose();
        active.splice(i, 1);
        continue;
      }
      const hop = entry.side * HOP * t;
      entry.sprite.position.x = entry.baseX + entry.rightX * hop;
      entry.sprite.position.z = entry.baseZ + entry.rightZ * hop;
      entry.sprite.position.y = entry.baseY + 0.3 * Math.sin(t * Math.PI); // a little up-and-settle arc, like a hop
      entry.sprite.material.opacity = 1 - t;
    }
  };

  const dispose = () => {
    for (const entry of active) {
      scene.remove(entry.sprite);
      entry.sprite.material.dispose();
    }
    active.length = 0;
  };

  return { spawn, update, dispose };
}
