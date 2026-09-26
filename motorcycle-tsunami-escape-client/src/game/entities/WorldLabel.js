import * as THREE from 'three';

export function createWorldLabel(text, { color = '#ffffff', background = '#172638', width = 512, height = 112 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  context.fillStyle = background;
  context.beginPath();
  context.roundRect(8, 8, width - 16, height - 16, 22);
  context.fill();
  context.strokeStyle = '#ffffff55';
  context.lineWidth = 5;
  context.stroke();
  context.fillStyle = color;
  context.font = '800 46px Arial';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(text, width / 2, height / 2, width - 38);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(5.2, 1.15, 1);
  return sprite;
}
