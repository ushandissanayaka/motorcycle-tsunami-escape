import * as THREE from 'three';
import { applyWorldUV, makeStudTexture } from '../util/textures.js';
import { signSprite } from './Sign.js';
import followEventUrl from '../../assets/follow-event.png';

/**
 * The "Next Event! Happening now!" billboard from the reference screenshot: two studded orange pillars
 * standing on big blue blocks and topped with blue caps, holding a studded orange frame around the
 * "Follow Event!" artwork, with the title floating above. The artwork shows on both faces.
 * Faces the local +z side; the origin is on the ground, centred between the pillars.
 */

const PILLAR = { base: '#e8742c', light: '#ff9a4e', dark: '#b8531c' };
const FRAME = { base: '#ff8a1c', light: '#ffae52', dark: '#d7650c' };
const BLOCK = { base: '#5f82d6', light: '#86a4ee', dark: '#4163b4' };
const STUD_TILE = 2; // world units per stud texture repeat (8 studs), so studs keep one size on every block

const PILLAR_X = 2.9;
const BLOCK_SIZE = 1.75;
const BLOCK_HEIGHT = 1.4;
const PILLAR_WIDTH = 1.3;
const PILLAR_TOP = 5.1;
const CAP_HEIGHT = 0.8;
const CAP_SIZE = 1.6;
const SCREEN = { width: 4.4, height: 2.4, y: 3.4 }; // matches the artwork's ~1.83:1 aspect
const FRAME_BORDER = 0.3;
const FRAME_DEPTH = 0.36;

function loadScreenTexture() {
  const texture = new THREE.TextureLoader().load(followEventUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function createNextEventBoard() {
  const group = new THREE.Group();
  group.scale.setScalar(1.25);

  const studded = (palette, seed) => new THREE.MeshStandardMaterial({ map: makeStudTexture(palette, seed, 8), roughness: 0.75 });
  const pillarMat = studded(PILLAR, 41);
  const frameMat = studded(FRAME, 43);
  const blockMat = studded(BLOCK, 42);

  const box = (w, h, d, material, x, y, z) => {
    const mesh = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(w, h, d), STUD_TILE), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  for (const side of [-1, 1]) {
    const x = side * PILLAR_X;
    box(BLOCK_SIZE, BLOCK_HEIGHT, BLOCK_SIZE, blockMat, x, BLOCK_HEIGHT / 2, 0);
    const pillarHeight = PILLAR_TOP - BLOCK_HEIGHT;
    box(PILLAR_WIDTH, pillarHeight, PILLAR_WIDTH, pillarMat, x, BLOCK_HEIGHT + pillarHeight / 2, 0);
    box(CAP_SIZE, CAP_HEIGHT, CAP_SIZE, blockMat, x, PILLAR_TOP + CAP_HEIGHT / 2, 0);
  }

  // Studded orange frame between the pillars, its ends tucked into them.
  const frameWidth = SCREEN.width + FRAME_BORDER * 2;
  const frameHeight = SCREEN.height + FRAME_BORDER * 2;
  box(frameWidth, frameHeight, FRAME_DEPTH, frameMat, 0, SCREEN.y, 0);

  // The artwork on both faces: the back plane is turned 180° so it reads the right way round, not mirrored.
  const screenMat = new THREE.MeshBasicMaterial({ map: loadScreenTexture(), toneMapped: false });
  const screenGeometry = new THREE.PlaneGeometry(SCREEN.width, SCREEN.height);
  const front = new THREE.Mesh(screenGeometry, screenMat);
  front.position.set(0, SCREEN.y, FRAME_DEPTH / 2 + 0.01);
  const back = new THREE.Mesh(screenGeometry, screenMat);
  back.position.set(0, SCREEN.y, -FRAME_DEPTH / 2 - 0.01);
  back.rotation.y = Math.PI;
  group.add(front, back);

  // Floating title above the caps.
  const title = signSprite('Next Event!', { fontSize: 0.95, color: '#5ff0ff', strokeColor: '#0a2436', strokeEm: 0.22, width: 9, height: 1.8 });
  title.position.set(0, PILLAR_TOP + CAP_HEIGHT + 1.45, 0.3);
  const subtitle = signSprite('Happening now!', { fontSize: 0.6, color: '#ffffff', strokeColor: '#141414', strokeEm: 0.24, width: 9, height: 1.2 });
  subtitle.position.set(0, PILLAR_TOP + CAP_HEIGHT + 0.45, 0.3);
  group.add(title, subtitle);

  return { group };
}
