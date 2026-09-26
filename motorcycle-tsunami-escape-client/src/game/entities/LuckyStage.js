import * as THREE from 'three';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';
import epicArt from '../../assets/lucky/epic.png';
import rareArt from '../../assets/lucky/rare.png';
import commonArt from '../../assets/lucky/common.png';
import { createTitledSign } from './Sign.js';
import { createWingedBlock } from './WingedBlock.js';

/**
 * The Lucky Blocks stage: a studded platform, as wide as the road plus its two paved strips, with shallow steps and a
 * paved path up the middle, backed by the canyon wall. Three winged lucky
 * blocks hover above it, flapping and casting shadows on the platform (their art is cut from the reference screenshot), under a
 * "LUCKY BLOCKS" sign on the canyon wall. The stage faces +Z (toward riders coming up the
 * corridor); `solids` let riders drive up the steps.
 */

const STAGE_COLORS = {
  stage: { base: '#6f6d8a', light: '#8c89aa', dark: '#55536e' },
  edge: 0x9a96cc,
};

// `art` is the winged block cut out of the reference screenshot (`size` in art pixels).
// `split` is where the body starts and ends in the art: the columns left and right of it are the wings.
const BLOCKS = [
  { name: 'Epic Lucky Block', rarity: 'Epic', rarityColor: '#d21fff', price: '11k', art: epicArt, size: [492, 292], split: [135, 335] },
  { name: 'Rare Lucky Block', rarity: 'Rare', rarityColor: '#3db4ff', price: '3.2k', art: rareArt, size: [480, 292], split: [148, 328] },
  { name: 'Common Lucky Block', rarity: 'Common', rarityColor: '#3dffa0', price: '220', art: commonArt, size: [480, 292], split: [146, 343] },
];

const SPACING = 7.5; // between neighbouring blocks (the stage is 27 wide, as in the reference)
const BLOCK_WIDTH = 4.9; // world units, wing tip to wing tip
const HOVER = 3.8; // block centre above the platform top
const LABEL_LIFT = 2.18; // label centre above the block centre
const LABEL_WIDTH = 7.5; // world width of the name / rarity / price label

/**
 * Builds the stage with its back edge at world `zBack` and its steps at
 * `zFront`; it faces from back to front (so `zBack > zFront` makes it face
 * north, toward -Z). `width` is centred on `centerX`.
 */
export function createLuckyStage({ centerX, width, zBack, zFront, height = 1, steps = 3, stepDepth = 1.3 }) {
  const direction = Math.sign(zFront - zBack) || 1;
  const depth = Math.abs(zFront - zBack);
  const inner = new THREE.Group(); // built facing +Z with its back edge at z = 0
  const group = new THREE.Group();
  group.position.set(centerX, 0, zBack);
  group.rotation.y = direction > 0 ? 0 : Math.PI;
  group.add(inner);

  const stage = new THREE.MeshStandardMaterial({ map: makeStudTexture(STAGE_COLORS.stage, 51), roughness: 0.85, emissive: 0x5a5878, emissiveIntensity: 0.25 });
  const edge = new THREE.MeshStandardMaterial({ color: STAGE_COLORS.edge, roughness: 0.6, emissive: STAGE_COLORS.edge, emissiveIntensity: 0.2 });
  const path = new THREE.MeshStandardMaterial({ map: makePaverTexture(PALETTES.plaza, 52, 1, 8, 7), roughness: 0.85 });
  const solids = [];
  const pathWidth = 8;
  const riser = height / (steps + 1);

  const tier = (lzBack, lzFront, top) => {
    const tierDepth = lzFront - lzBack;
    const midZ = (lzBack + lzFront) / 2;
    const block = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(width, top, tierDepth), 6), stage);
    block.position.set(0, top / 2, midZ);
    block.castShadow = true;
    block.receiveShadow = true;
    inner.add(block);
    // Light lavender lip along the front-top edge and a paved strip up the middle.
    const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.22), edge);
    lip.position.set(0, top + 0.02, lzFront - 0.11);
    inner.add(lip);
    const strip = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(pathWidth, 0.06, tierDepth), 4.8), path);
    strip.position.set(0, top + 0.03, midZ);
    strip.receiveShadow = true;
    inner.add(strip);

    const worldZ = [zBack + direction * lzBack, zBack + direction * lzFront];
    solids.push({
      minX: centerX - width / 2,
      maxX: centerX + width / 2,
      minZ: Math.min(...worldZ),
      maxZ: Math.max(...worldZ),
      bottom: 0,
      top: top + 0.06,
    });
  };

  // Steps descend toward the front: the last one is the lowest.
  const platformFront = depth - steps * stepDepth;
  tier(0, platformFront, height);
  for (let i = 0; i < steps; i += 1) {
    const back = platformFront + i * stepDepth;
    tier(back, back + stepDepth, height - riser * (i + 1));
  }

  // Blocks hover above the platform, facing the riders, each with its shadow on the platform.
  const blockZ = platformFront - 3.2;
  const blocks = BLOCKS.map((def, i) => {
    const block = createWingedBlock(def, { width: BLOCK_WIDTH, labelWidth: LABEL_WIDTH, labelLift: LABEL_LIFT });
    const x = (i - (BLOCKS.length - 1) / 2) * SPACING;
    block.holder.position.set(x, height + HOVER, blockZ);
    block.shadow.position.set(x, height + 0.08, blockZ + 0.5);
    inner.add(block.holder, block.shadow);
    return { ...block, phase: i * 1.1 };
  });

  // Sized for the 7.5 block spacing (the sign's base numbers were tuned at 5.3).
  const sign = createTitledSign({ title: 'LUCKY BLOCKS', subtitle: 'Open Lucky Blocks for Brainrot Pets!', scale: SPACING / 5.3 });
  sign.position.set(0, height + HOVER, blockZ);
  inner.add(sign);

  const update = (time) => {
    for (const { animate, phase } of blocks) animate(time, phase);
  };

  return { group, solids, update };
}
