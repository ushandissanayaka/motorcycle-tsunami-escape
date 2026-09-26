import * as THREE from 'three';
import divineBackArt from '../../assets/lucky/divine.png';
import divineFrontArt from '../../assets/lucky/divine_front.png';
import { createWingedBlock } from './WingedBlock.js';
import { createGroupChest } from './GroupChest.js';

/**
 * The patch of grass between the Lucky Blocks stage and the bike store: the pink-winged Divine Lucky Block
 * hovering next to the Group Chest, as in the reference screenshots. Both face north, toward the riders.
 */

// Seen from the front (the road side) the cube has an angry face with two "?" eyes; from behind it shows one big red
// "?". Both are cut from the reference. `split` is the cube's column range in the art, `cubeY` its rows.
const DIVINE = {
  name: 'Divine Lucky Block',
  rarity: 'Divine',
  rarityFill: ['#ffe75a', '#ff5fa0'],
  price: '169',
  coin: true,
  tag: 'OP!',
  glow: 0xff3d7a,
  art: divineFrontArt,
  size: [696, 200],
  split: [286, 470],
  cubeY: [6, 178],
  back: { art: divineBackArt, size: [648, 386], split: [192, 440], cubeY: [148, 384] },
};

// Same cube size as the stage's Epic / Rare / Common blocks (their wings span 4.9 for a 2.0 cube).
const DIVINE_WIDTH = 7.4;
const DIVINE_LABEL_WIDTH = 7.5;
const DIVINE_LABEL_LIFT = 2.6;
const DIVINE_HOVER = 3.2; // block centre above the ground

/** `divine` and `chest` are ground positions { x, z }; the chest is turned by `chest.yaw` (its front is +z). */
export function createGroupChestArea({ divine, chest }) {
  const group = new THREE.Group();

  const block = createWingedBlock(DIVINE, { width: DIVINE_WIDTH, labelWidth: DIVINE_LABEL_WIDTH, labelLift: DIVINE_LABEL_LIFT });
  // Riders see it from the north, looking south, where world +x is on their left: turn the block around so its left
  // wing is on their left (the stage does the same by rotating its whole group).
  block.holder.position.set(divine.x, DIVINE_HOVER, divine.z);
  block.holder.rotation.y = Math.PI;
  block.shadow.position.set(divine.x, 0.05, divine.z - 0.4);
  block.shadow.rotation.y = Math.PI;
  group.add(block.holder, block.shadow);

  const groupChest = createGroupChest();
  groupChest.group.position.set(chest.x, 0, chest.z);
  groupChest.group.rotation.y = chest.yaw;
  group.add(groupChest.group);

  // Axis-aligned footprint of the (turned) chest.
  const cos = Math.abs(Math.cos(chest.yaw));
  const sin = Math.abs(Math.sin(chest.yaw));
  const halfX = cos * groupChest.halfSize.x + sin * groupChest.halfSize.z;
  const halfZ = sin * groupChest.halfSize.x + cos * groupChest.halfSize.z;
  const solids = [{ minX: chest.x - halfX, maxX: chest.x + halfX, minZ: chest.z - halfZ, maxZ: chest.z + halfZ, bottom: 0, top: groupChest.halfSize.height }];

  return {
    group,
    solids,
    update: (time, camera) => {
      block.animate(time, 0.7, camera);
      groupChest.update(time);
    },
  };
}
