import * as THREE from 'three';
import { createStoreBike } from './StoreBikes.js';

/** Decorative set pieces around the starting place. */

function textSprite(lines, width, height, scaleX, scaleY) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  for (const { text, y, font, fill, stroke = '#0e1220', lineWidth = 10 } of lines) {
    ctx.font = font;
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, width / 2, y, width - 20);
    ctx.fillStyle = fill;
    ctx.fillText(text, width / 2, y, width - 20);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(scaleX, scaleY, 1);
  return sprite;
}

const glowTexture = () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.25)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(canvas);
};

/** Glowing ring with a floating limited-edition bike and its name plate. */
export function createBikeDisplay({ bikeId, name, price }) {
  const group = new THREE.Group();
  const glowColor = 0x9befff;

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 8),
    new THREE.MeshBasicMaterial({ map: glowTexture(), color: glowColor, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.08;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 3.1, 48),
    new THREE.MeshBasicMaterial({ color: glowColor, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.1;
  group.add(glow, ring);

  const holder = new THREE.Group();
  holder.scale.setScalar(1.5);
  holder.add(createStoreBike(bikeId));
  group.add(holder);

  const label = textSprite(
    [
      { text: 'LIMITED!', y: 36, font: '900 52px "Arial Black", Arial, sans-serif', fill: '#ff8a2a' },
      { text: name, y: 96, font: '800 46px Arial, sans-serif', fill: '#43d8ff' },
      { text: price, y: 152, font: '800 40px Arial, sans-serif', fill: '#8dff5a' },
    ],
    512, 190, 5.6, 2.08
  );
  label.position.y = 4.9;
  group.add(label);

  const update = (time) => {
    holder.position.y = 1.2 + Math.sin(time * 1.6) * 0.25;
    holder.rotation.y = time * 0.6;
    ring.scale.setScalar(1 + Math.sin(time * 2) * 0.04);
    glow.material.opacity = 0.7 + Math.sin(time * 2.4) * 0.15;
  };
  return { group, update };
}
