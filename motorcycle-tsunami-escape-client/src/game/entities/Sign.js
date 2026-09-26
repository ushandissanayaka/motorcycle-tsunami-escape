import * as THREE from 'three';

export const SIGN_FONT = '"Montserrat", "Arial Black", Arial, sans-serif';

/**
 * One line of big outlined text as a camera-facing sprite (a sign on the wall or floating over a place).
 * `width` x `height` is its size in world units, `fontSize` is in world units too. `color` may be a
 * [top, bottom] pair for a vertical gradient.
 */
export function signSprite(text, { fontSize, color, strokeColor, strokeEm, width, height }) {
  const pxPerUnit = 80;
  const canvas = document.createElement('canvas');
  canvas.width = Math.min(4096, Math.round(width * pxPerUnit));
  canvas.height = Math.round(height * pxPerUnit);
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const px = fontSize * pxPerUnit;

  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `800 ${px}px ${SIGN_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const x = canvas.width / 2;
    const y = canvas.height / 2;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = px * strokeEm;
    ctx.strokeText(text, x, y + px * 0.06); // soft drop shadow under the outline
    ctx.strokeText(text, x, y);
    if (Array.isArray(color)) {
      const gradient = ctx.createLinearGradient(0, y - px * 0.5, 0, y + px * 0.5);
      gradient.addColorStop(0, color[0]);
      gradient.addColorStop(1, color[1]);
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = color;
    }
    ctx.fillText(text, x, y);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`800 ${px}px ${SIGN_FONT}`).then(draw).catch(() => {});

  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(width, height, 1);
  return sprite;
}

/** White title over a yellow subtitle. `scale` sizes the whole sign; the base numbers suit "LUCKY BLOCKS". */
export function createTitledSign({ title, subtitle, titleSize = 2.05, titleWidth = 21.2, subtitleSize = 1.07, subtitleWidth = 26.4, scale = 1 }) {
  const sign = new THREE.Group();
  const top = signSprite(title, { fontSize: titleSize * scale, color: '#ffffff', strokeColor: '#1b1140', strokeEm: 0.17, width: titleWidth * scale, height: 3.45 * scale });
  top.position.y = 7.9 * scale;
  const bottom = signSprite(subtitle, { fontSize: subtitleSize * scale, color: '#ffc41a', strokeColor: '#23163a', strokeEm: 0.22, width: subtitleWidth * scale, height: 2 * scale });
  bottom.position.y = 5.45 * scale;
  sign.add(top, bottom);
  return sign;
}
