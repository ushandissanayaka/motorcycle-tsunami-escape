import * as THREE from 'three';

/**
 * The player's name floating over their rider for a few seconds, shown when they log in: white letters with a
 * heavy dark outline, fading in and out. It times itself as it is drawn (onBeforeRender), so it adds nothing to
 * the game loop, and it is hidden again once its time is up.
 */
const SHOW = 3; // seconds on screen
const FADE_IN = 0.2;
const FADE_OUT = 0.4;
const HEIGHT = 3.7; // world units above the rider's feet: just over the helmet
const WIDTH = 4.4; // world units
const CANVAS = { width: 512, height: 112 };
const FONT = '"Fredoka", "Lilita One", "Arial Black", Arial, sans-serif';

export function createNameTag() {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS.width;
  canvas.height = CANVAS.height;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false, // readable over the bike and anything in front of it
    opacity: 0,
  }));
  sprite.scale.set(WIDTH, (WIDTH * CANVAS.height) / CANVAS.width, 1);
  sprite.position.y = HEIGHT;
  sprite.renderOrder = 11;
  sprite.visible = false;

  let shownAt = 0;
  sprite.onBeforeRender = () => {
    const age = (performance.now() - shownAt) / 1000;
    if (age >= SHOW) {
      sprite.material.opacity = 0;
      sprite.visible = false;
      return;
    }
    sprite.material.opacity = Math.min(1, age / FADE_IN, (SHOW - age) / FADE_OUT);
  };

  /** Shows `name` over the rider for SHOW seconds. */
  const show = (name) => {
    ctx.clearRect(0, 0, CANVAS.width, CANVAS.height);
    ctx.font = `700 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const x = CANVAS.width / 2;
    const y = CANVAS.height / 2 + 2;
    const maxWidth = CANVAS.width - 40;
    ctx.lineWidth = 14;
    ctx.strokeStyle = '#10131c';
    ctx.strokeText(name, x, y, maxWidth);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x, y, maxWidth);
    texture.needsUpdate = true;
    shownAt = performance.now();
    sprite.visible = true;
  };

  return { sprite, show };
}
