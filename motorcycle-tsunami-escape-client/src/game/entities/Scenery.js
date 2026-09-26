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

/** "Follow Event!" billboard: orange posts with pale blue caps around a bright picture panel. */
export function createEventBillboard() {
  const group = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xee7a2c, roughness: 0.6 });
  const cap = new THREE.MeshStandardMaterial({ color: 0x8fa6d0, roughness: 0.6 });
  const add = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
  };

  for (const s of [-1, 1]) {
    add(0.7, 5.2, 0.7, orange, s * 4.6, 2.6, 0);
    add(1.2, 1.1, 1.2, cap, s * 4.6, 0.55, 0); // pale blue base block
    add(1.1, 0.9, 1.1, cap, s * 4.6, 5.5, 0); // pale blue top block
  }
  add(9.6, 0.6, 0.6, orange, 0, 5.4, 0);
  add(9.6, 0.6, 0.6, orange, 0, 1.6, 0);

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 512, 256);
  sky.addColorStop(0, '#2f9bff');
  sky.addColorStop(1, '#8be0ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  // Red bike and rider silhouette.
  ctx.fillStyle = '#d8232f';
  ctx.beginPath();
  ctx.ellipse(370, 150, 70, 26, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#14141b';
  for (const x of [310, 430]) {
    ctx.beginPath();
    ctx.arc(x, 190, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#ffd54a';
  ctx.fillRect(345, 80, 36, 50);
  ctx.font = 'italic 900 64px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'left';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 12;
  ctx.strokeStyle = '#0e1a3a';
  ctx.save();
  ctx.translate(24, 200);
  ctx.rotate(-0.22);
  ctx.strokeText('Follow Event!', 0, 0, 300);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Follow Event!', 0, 0, 300);
  ctx.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 3.6), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }));
  panel.position.set(0, 3.5, 0.05);
  group.add(panel);
  add(8.6, 4, 0.2, orange, 0, 3.5, -0.08); // frame behind the picture
  return group;
}

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
