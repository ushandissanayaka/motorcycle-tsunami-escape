import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { createHelmet } from './BlockyHuman.js';

/**
 * A player's Bloxity avatar as a rider: Bloxity's base body (player.glb) with the player's skin texture, swapped
 * body parts, hat / hair / mask, back item and accessories (neck, chest, waist, hands, shoes) and their body
 * proportions, sat on the bike with hands on the bars.
 *
 * Built so it never costs a frame anything: the skinned body is posed once and then baked into plain static
 * meshes (no skinning each frame, and no new kind of shader: every part uses the same textured material the
 * blocky rider used). Assets are loaded once and shared by every rider wearing them; a rider is rebaked only
 * when their avatar, proportions or bike change. The baked body comes apart into whole body parts
 * (`userData.breakPart`) for the wipeout, like the blocky rider (see Shatter.js).
 *
 * The model faces +Z in its own units (6.4 tall, hips at y 2.4); the rider group turns it to the game's -Z and
 * scales it down to the bike.
 */
const CDN = 'https://static.bloxity.io/avatars';
const SCALE = 0.28; // model units -> bike units: hips to shoulders 2.4 -> 0.67, sized for the bigger bikes
const HIP_Y = 2.4; // Spine1, the rider's origin
const UPRIGHT = 0.12; // radians of forward lean, at least...
const MAX_LEAN = 0.9; // ...and at most, to reach the bars
// Riding legs: the model's thigh and shin (1.2 each) are lengthened by these, so seated on a bike the knees
// come forward over the tank and the feet reach down to the footrests, as the blocky rider's did.
const THIGH = 1.6;
const SHIN = 1.9;
// The game's helmet (BlockyHuman's, made for its 0.42 x 0.4 x 0.4 head) sized to the model's 1.6 head, worn
// by a rider with no hat or hair on.
const HELMET_SCALE = 3.9;
// Where a bike without its own fit seats the rider (the starter scooter): hips and handlebar grips as [y, z].
const DEFAULT_FIT = { hips: [1.16, 0.2], bars: [1.62, -0.42] };

const PART_MESHES = { head: 'default_head', torso: 'default_torso', arm_L: 'default_arm_L', arm_R: 'default_arm_R', leg_L: 'default_leg_L', leg_R: 'default_leg_R' };
const PART_FILES = { head: ['head', ''], torso: ['torso', ''], arm_L: ['arms', '_L'], arm_R: ['arms', '_R'], leg_L: ['legs', '_L'], leg_R: ['legs', '_R'] };
const PART_IDS = { head: 'headId', torso: 'torsoId', arm_L: 'armLId', arm_R: 'armRId', leg_L: 'legLId', leg_R: 'legRId' };
// Accessories hung from a bone with an origin in model space (see placeAccessory).
const ACCESSORIES = {
  neck: { bone: 'Spine2', origin: [0, 4.8, 0] },
  chest: { bone: 'Spine2', origin: [0, 3.6, 0] },
  waist: { bone: 'Spine1', origin: [0, 2.4, 0] },
};
// Each proportion's allowed range (the Bloxity SDK's), so a rider sent by another player can't be misshapen.
const PROPORTION_RANGES = {
  height: [0.5, 1.6], shoulderWidth: [0.5, 1.5], armLength: [0.05, 3], legOffsetX: [-0.7, 5],
  torsoScaleX: [0.3, 2], neckHeight: [0.94, 1.2], headScale: [0.3, 2.6],
};
const clampProportions = (proportions = {}) => Object.fromEntries(Object.entries(PROPORTION_RANGES).map(([key, [min, max]]) => {
  const value = Number(proportions?.[key]);
  return [key, Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : 1];
}));
// The pieces the rider comes apart into, and the body part each baked mesh belongs to ('show': lands facing the camera).
const BREAK = { head: 'show', torso: true, arm_L: true, arm_R: true, leg_L: true, leg_R: true };

/** A real equipped item id ('-1', empty, 'undefined' and anything URL-unsafe count as none). */
const equipped = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id) && id !== '-1' && id !== 'undefined' && id !== 'null';

// ---- Shared, load-once assets ----------------------------------------------------------------------------

const assets = new Map();
const once = (key, load) => {
  if (!assets.has(key)) assets.set(key, load().catch((error) => { assets.delete(key); throw error; }));
  return assets.get(key);
};
const gltfLoader = new GLTFLoader();
const objLoader = new OBJLoader();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const loadGLB = (url) => once(url, () => gltfLoader.loadAsync(url).then((gltf) => gltf.scene));
const loadOBJ = (url) => once(url, () => objLoader.loadAsync(url));
/** Pixel-art textures: sharp texels, display colours. GLB UVs want flipY off, OBJ UVs the default. */
const loadTexture = (url, flipY) => once(`${url}|${flipY}`, () => textureLoader.loadAsync(url).then((texture) => {
  texture.flipY = flipY;
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}));
// The blocky rider's textured material, lit a little from within so bright colours stay bright in shade:
// the same shader the game already has, so an avatar appearing never builds a new one.
const materials = new WeakMap();
const materialFor = (texture) => {
  if (!materials.has(texture)) {
    materials.set(texture, new THREE.MeshStandardMaterial({ map: texture, roughness: 0.7, emissive: 0xffffff, emissiveMap: texture, emissiveIntensity: 0.3 }));
  }
  return materials.get(texture);
};

/** Only the two Bloxity hosts may supply a skin texture URL (it can come from another player). */
const trustedSkinUrl = (url) => typeof url === 'string' && /^https:\/\/(api|static)\.bloxity\.io\/[\w./-]+\.png$/.test(url);

/** Hat, hair or mask: an OBJ worn on the head. */
async function loadHeadItem(id) {
  const [object, texture] = await Promise.all([loadOBJ(`${CDN}/items/hats/${id}.obj`), loadTexture(`${CDN}/textures/hats/${id}.png`, true)]);
  return { object, material: materialFor(texture) };
}
async function loadItem(slot, id) {
  const [object, texture] = await Promise.all([loadOBJ(`${CDN}/items/${slot}/${id}.obj`), loadTexture(`${CDN}/textures/${slot}/${id}.png`, true)]);
  return { object, material: materialFor(texture) };
}

/**
 * Everything one avatar is made of, loaded (shared assets come from the cache): `spec` is
 * { equipped, proportions, skinUrl } as the Bloxity SDK gives them. Missing or failing items are left off.
 */
export async function loadAvatar(spec) {
  const eq = spec?.equipped ?? {};
  const skinUrl = trustedSkinUrl(spec?.skinUrl) ? spec.skinUrl : `${CDN}/skins/${equipped(eq.skinId) ? eq.skinId : '0'}.png`;
  const base = await loadGLB(`${CDN}/player.glb`);
  const skinTexture = await loadTexture(skinUrl, false).catch(() => loadTexture(`${CDN}/skins/0.png`, false));

  const model = cloneSkinned(base);
  const parts = {};
  model.traverse((object) => {
    for (const [slot, name] of Object.entries(PART_MESHES)) {
      if (object.isSkinnedMesh && object.name.toLowerCase() === name.toLowerCase()) parts[slot] = object;
    }
  });
  const settle = (promise) => promise.then((value) => value, () => null);
  const [partGeometries, headItems, back, accessories] = await Promise.all([
    Promise.all(Object.keys(PART_MESHES).map((slot) => {
      const id = eq[PART_IDS[slot]];
      if (!equipped(id) || !parts[slot]) return null;
      const [dir, suffix] = PART_FILES[slot];
      return settle(loadGLB(`${CDN}/parts/${dir}/${id}${suffix}.glb`).then((scene) => ({ slot, scene })));
    })),
    Promise.all([eq.hatId, eq.hairId, eq.maskId].filter(equipped).map((id) => settle(loadHeadItem(id)))),
    equipped(eq.backId) ? settle(loadItem('back', eq.backId)) : null,
    Promise.all(['neck', 'chest', 'waist', 'hand', 'shoes'].map((slot) => {
      const id = eq[`${slot}Id`];
      return equipped(id) ? settle(loadItem(slot, id).then((item) => ({ slot, ...item }))) : null;
    })),
  ]);

  // Swapped body parts keep the base skeleton: their skin indices are remapped by bone name.
  const skeleton = parts.torso?.skeleton;
  const boneIndex = new Map(skeleton?.bones.map((bone, i) => [bone.name, i]));
  for (const part of partGeometries.filter(Boolean)) {
    let skinned = null;
    part.scene.traverse((object) => { if (object.isSkinnedMesh && !skinned) skinned = object; });
    if (!skinned) continue;
    const geometry = skinned.geometry.clone();
    const skinIndex = geometry.getAttribute('skinIndex');
    if (skinIndex) {
      const remap = skinned.skeleton.bones.map((bone) => boneIndex.get(bone.name));
      for (let i = 0; i < skinIndex.array.length; i += 1) {
        const mapped = remap[skinIndex.array[i]];
        if (mapped !== undefined) skinIndex.array[i] = mapped;
      }
    }
    parts[part.slot].geometry = geometry;
  }

  const bones = {};
  model.traverse((object) => { if (object.isBone) bones[object.name] = object; });
  lengthenLegs(model, parts, bones);
  // Rest pose of every bone, to start each bake from.
  const rest = new Map(Object.values(bones).map((bone) => [bone, { p: bone.position.clone(), q: bone.quaternion.clone(), s: bone.scale.clone() }]));
  // Where the neck joint is bound (model units up), which the neck height proportion works from.
  const neckIndex = skeleton?.bones.findIndex((bone) => bone.name === 'Neck_Offset') ?? -1;
  const neckBindY = neckIndex >= 0 ? new THREE.Matrix4().copy(skeleton.boneInverses[neckIndex]).invert().elements[13] : 0;
  const helmet = equipped(eq.hatId) || equipped(eq.hairId) ? null : createHelmet(0);
  helmet?.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  return {
    model, parts, bones, rest, neckBindY, helmet, material: materialFor(skinTexture),
    headItems: headItems.filter(Boolean), back, accessories: accessories.filter(Boolean),
  };
}

/**
 * Lengthens the legs by THIGH and SHIN in the bind pose itself: the leg meshes are stretched about the knee
 * and the knee and foot bones moved to match (and rebound). Scaling the bones instead would shear the shins
 * once the knees bend.
 */
function lengthenLegs(model, parts, bones) {
  const hip = HIP_Y;
  const knee = hip - 1.2; // model units up, in the bind pose
  const stretch = (y) => (y >= knee ? hip - (hip - y) * THIGH : hip - 1.2 * THIGH - (knee - y) * SHIN);
  for (const slot of ['leg_L', 'leg_R']) {
    const mesh = parts[slot];
    if (!mesh) continue;
    mesh.geometry = mesh.geometry.clone(); // the base model's geometry is shared by every avatar
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) position.setY(i, stretch(position.getY(i)));
    position.needsUpdate = true;
    mesh.geometry.computeBoundingSphere();
  }
  for (const side of ['L', 'R']) {
    if (bones[`Leg${side}2`]) bones[`Leg${side}2`].position.multiplyScalar(THIGH);
    if (bones[`Leg${side}2_leaf`]) bones[`Leg${side}2_leaf`].position.multiplyScalar(SHIN);
  }
  model.updateMatrixWorld(true);
  // Rebind the moved bones in every part's skeleton (they share the bones, each has its own inverses).
  const moved = new Set(['LegL2', 'LegL2_leaf', 'LegR2', 'LegR2_leaf']);
  for (const mesh of Object.values(parts)) {
    // A clone's skeleton shares its inverses with the cached base model: this avatar gets its own.
    mesh.skeleton.boneInverses = mesh.skeleton.boneInverses.map((inverse) => inverse.clone());
    mesh.skeleton.bones.forEach((bone, i) => {
      if (moved.has(bone.name)) mesh.skeleton.boneInverses[i].copy(bone.matrixWorld).invert();
    });
  }
}

// ---- Posing and baking ---------------------------------------------------------------------------------

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const worldPosition = (object) => object.getWorldPosition(new THREE.Vector3());

/** Turns `bone` (about its own joint) so the direction from it to `tip` points along `to` (model space). */
function aim(bone, tip, to) {
  bone.updateWorldMatrix(true, true);
  const from = _v1.copy(worldPosition(tip)).sub(worldPosition(bone)).normalize();
  const turn = _q1.setFromUnitVectors(from, _v2.copy(to).normalize());
  const world = bone.getWorldQuaternion(_q2);
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
  bone.updateWorldMatrix(false, true);
}

/**
 * Poses the model on a bike: proportions on the bones (as the Bloxity avatar viewer does), thighs forward and
 * shins down, the torso leaned just enough (UPRIGHT to MAX_LEAN) for straight arms to reach the grips, and the
 * head kept upright. `fit` gives the hips and grips in bike units ([y, z], front toward -Z).
 */
function pose(avatar, proportions, fit) {
  const { model, bones, rest } = avatar;
  for (const [bone, r] of rest) {
    bone.position.copy(r.p);
    bone.quaternion.copy(r.q);
    bone.scale.copy(r.s);
  }
  const p = { height: 1, armLength: 1, headScale: 1, neckHeight: 1, ...proportions };
  for (const [name, bone] of Object.entries(bones)) {
    if (name.startsWith('Arm') && !name.includes('Offset')) bone.scale.y *= p.armLength;
  }
  const neckOffset = bones.Neck_Offset;
  const neck = bones.Neck1;
  if (neckOffset) neckOffset.position.y += (p.height - p.headScale) * rest.get(neckOffset).p.y + avatar.neckBindY * (p.neckHeight - 1) * 0.8;
  if (neck) neck.scale.set(p.headScale, p.headScale / p.height, p.headScale);
  model.updateMatrixWorld(true);

  // The grips, in model units (the model faces +Z, the bike -Z; the model's hips are its origin at HIP_Y).
  const [hipY, hipZ] = fit.hips;
  const [barY, barZ] = fit.bars;
  const grip = new THREE.Vector3(0, (barY - hipY) / SCALE + HIP_Y, -(barZ - hipZ) / SCALE);
  const spine = bones.Spine1;
  const spineAt = worldPosition(spine);
  const shoulderOf = (side) => bones[side === 1 ? 'ArmL1' : 'ArmR1'];
  const reach = worldPosition(bones.ArmL1).distanceTo(worldPosition(bones.ArmL2_leaf));
  // The least lean that brings the grips within reach of straight arms.
  const up = new THREE.Vector3(0, 1, 0);
  let lean = UPRIGHT;
  const shoulderRest = worldPosition(bones.ArmL1).sub(spineAt);
  const leaned = (angle) => shoulderRest.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), angle).add(spineAt);
  while (lean < MAX_LEAN && leaned(lean).distanceTo(grip.clone().setX(shoulderRest.x)) > reach) lean += 0.02;
  aim(spine, bones.Spine2, up.clone().applyAxisAngle(new THREE.Vector3(1, 0, 0), lean));
  if (neck && bones.Neck1_leaf) aim(neck, bones.Neck1_leaf, up);

  for (const side of [1, -1]) {
    const letter = side === 1 ? 'L' : 'R';
    const thigh = bones[`Leg${letter}1`];
    const shin = bones[`Leg${letter}2`];
    aim(thigh, shin, new THREE.Vector3(side * 0.12, -0.12, 1));
    aim(shin, bones[`Leg${letter}2_leaf`], new THREE.Vector3(0, -1, 0.12));
    const upper = shoulderOf(side);
    const lower = bones[`Arm${letter}2`];
    const target = grip.clone().setX(worldPosition(upper).x * 0.9);
    const toGrip = target.sub(worldPosition(upper));
    aim(upper, lower, toGrip);
    aim(lower, bones[`Arm${letter}2_leaf`], toGrip);
  }
  model.updateMatrixWorld(true);
}

/**
 * The skin matrices of `mesh`'s skeleton in the current pose, with the Bloxity viewer's width proportions
 * (shoulder width, leg spacing, torso width) worked into them as it does.
 */
function skinMatrices(mesh, p) {
  const skeleton = mesh.skeleton;
  skeleton.update();
  const matrices = skeleton.boneMatrices;
  const bindX = (name) => {
    const i = skeleton.bones.findIndex((bone) => bone.name === name);
    return i < 0 ? 0 : new THREE.Matrix4().copy(skeleton.boneInverses[i]).invert().elements[12];
  };
  const spine1X = bindX('Spine1');
  const above = new Set(['Spine2', 'ArmL_Offset', 'ArmL1', 'ArmL2', 'ArmR_Offset', 'ArmR1', 'ArmR2', 'Neck_Offset', 'Neck1']);
  const CS = 0.8;
  const { shoulderWidth: sw = 1, legOffsetX: lox = 1, torsoScaleX: tsx = 1 } = p;
  skeleton.bones.forEach((bone, i) => {
    const name = bone.name;
    const off = i * 16;
    if ((name === 'Spine1' || name === 'Spine2') && tsx !== 1) for (let k = 0; k < 4; k += 1) matrices[off + k] *= tsx;
    if (above.has(name) && tsx !== 1) matrices[off + 12] += (bindX(name) - spine1X) * (tsx - 1) * CS;
    if (sw !== 1 && name.startsWith('Arm')) matrices[off + 12] += bindX(name.startsWith('ArmL') ? 'ArmL_Offset' : 'ArmR_Offset') * (sw - 1) * CS;
    if (lox !== 1 && name.startsWith('Leg')) matrices[off + 12] += bindX(name.startsWith('LegL') ? 'LegL_Offset' : 'LegR_Offset') * (lox - 1) * CS;
  });
  return matrices;
}

/** A static copy of a skinned mesh's geometry in its current pose (model space). */
function bake(mesh, p) {
  const matrices = skinMatrices(mesh, p);
  const source = mesh.geometry;
  const position = source.getAttribute('position');
  const skinIndex = source.getAttribute('skinIndex');
  const skinWeight = source.getAttribute('skinWeight');
  const out = new Float32Array(position.count * 3);
  const vertex = new THREE.Vector3();
  const sum = new THREE.Vector3();
  const part = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  for (let i = 0; i < position.count; i += 1) {
    vertex.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
    sum.set(0, 0, 0);
    for (let k = 0; k < 4; k += 1) {
      const weight = skinWeight.getComponent(i, k);
      if (!weight) continue;
      matrix.fromArray(matrices, skinIndex.getComponent(i, k) * 16);
      sum.addScaledVector(part.copy(vertex).applyMatrix4(matrix), weight);
    }
    sum.applyMatrix4(mesh.bindMatrixInverse);
    out[i * 3] = sum.x;
    out[i * 3 + 1] = sum.y;
    out[i * 3 + 2] = sum.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(out, 3));
  if (source.getAttribute('uv')) geometry.setAttribute('uv', source.getAttribute('uv'));
  if (source.index) geometry.setIndex(source.index);
  geometry.computeVertexNormals();
  return geometry;
}

/** Copies of `item`'s meshes placed at `matrix` (model space) in `group`. */
function place(group, item, matrix) {
  item.object.updateMatrixWorld(true);
  item.object.traverse((object) => {
    if (!object.isMesh) return;
    const copy = new THREE.Mesh(object.geometry, item.material);
    copy.matrixAutoUpdate = false;
    copy.matrix.multiplyMatrices(matrix, object.matrixWorld);
    copy.castShadow = true;
    group.add(copy);
  });
}

/**
 * The baked rider: a group sitting at the bike's hip point (`fit.hips`, the starter scooter's when the bike has
 * no fit), facing -Z, holding one group per body part (tagged for the wipeout) with the items worn on it. Its
 * geometries are its own, freed by `dispose`; materials and item geometry are shared.
 */
export function buildAvatarRider(avatar, { proportions = {}, fit } = {}) {
  const p = clampProportions(proportions);
  pose(avatar, p, fit ?? DEFAULT_FIT);
  const { model, parts, bones, material } = avatar;
  // Where each bone rested, in model space (the model sits at the origin): accessories are placed from it.
  const restWorld = (bone) => {
    const chain = [];
    for (let b = bone; b && b !== model; b = b.parent) chain.unshift(b);
    const m = new THREE.Matrix4();
    for (const b of chain) {
      const r = avatar.rest.get(b);
      m.multiply(r ? new THREE.Matrix4().compose(r.p, r.q, r.s) : b.matrix);
    }
    return m;
  };

  const root = new THREE.Group();
  const [hipY, hipZ] = (fit ?? DEFAULT_FIT).hips;
  root.position.set(0, hipY, hipZ);
  const turn = new THREE.Group();
  turn.rotation.y = Math.PI; // the model faces +Z, the game -Z
  turn.scale.set(SCALE, SCALE * p.height, SCALE);
  root.add(turn);
  const body = new THREE.Group();
  body.position.y = -HIP_Y;
  turn.add(body);
  const groups = {};
  const baked = []; // this rider's own geometry (item geometry is shared), freed by dispose
  for (const [slot, breakPart] of Object.entries(BREAK)) {
    const group = new THREE.Group();
    group.userData.breakPart = breakPart;
    body.add(group);
    groups[slot] = group;
    if (!parts[slot]) continue;
    const mesh = new THREE.Mesh(bake(parts[slot], p), material);
    baked.push(mesh.geometry);
    mesh.castShadow = true;
    group.add(mesh);
  }

  // Hat, hair and mask: on the head bone, 0.8 up.
  if (bones.Neck1) {
    const onHead = bones.Neck1.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.8, 0));
    for (const item of avatar.headItems) place(groups.head, item, onHead);
  }
  if (avatar.helmet && bones.Neck1) {
    // Centred on the head (0.8 up the head bone), turned to the model's +Z front.
    const helmet = avatar.helmet.clone();
    helmet.matrixAutoUpdate = false;
    helmet.matrix.copy(bones.Neck1.matrixWorld)
      .multiply(new THREE.Matrix4().makeTranslation(0, 0.8, 0))
      .multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      .multiply(new THREE.Matrix4().makeScale(HELMET_SCALE, HELMET_SCALE, HELMET_SCALE));
    groups.head.add(helmet);
  }
  if (avatar.back && bones.Spine2) place(groups.torso, avatar.back, bones.Spine2.matrixWorld);
  // Neck / chest / waist: the bone's move from its rest, applied to the item at its origin in model space.
  for (const item of avatar.accessories) {
    const spec = ACCESSORIES[item.slot];
    if (spec && bones[spec.bone]) {
      const matrix = bones[spec.bone].matrixWorld.clone()
        .multiply(restWorld(bones[spec.bone]).invert())
        .multiply(new THREE.Matrix4().makeScale(p.torsoScaleX, 1, 1))
        .multiply(new THREE.Matrix4().makeTranslation(...spec.origin));
      place(groups.torso, item, matrix);
      continue;
    }
    // Hands and shoes: a pair, the right one mirrored across x, following the leaf bones' position and
    // rotation only, moved out with the shoulder / leg spacing.
    const pair = item.slot === 'hand'
      ? [['ArmL2_leaf', 1, 'arm_L'], ['ArmR2_leaf', -1, 'arm_R']]
      : [['LegL2_leaf', 1, 'leg_L'], ['LegR2_leaf', -1, 'leg_R']];
    for (const [boneName, side, slot] of pair) {
      const bone = bones[boneName];
      if (!bone) continue;
      const position = new THREE.Vector3();
      const rotation = new THREE.Quaternion();
      bone.matrixWorld.decompose(position, rotation, new THREE.Vector3());
      position.x += item.slot === 'hand'
        ? side * 0.8 * (2 * (p.shoulderWidth - 1) + 2 * (p.torsoScaleX - 1))
        : side * 0.8 * 0.6 * (p.legOffsetX - 1);
      const matrix = new THREE.Matrix4().compose(position, rotation, new THREE.Vector3(1, 1, 1))
        .multiply(restWorld(bone).invert())
        .multiply(new THREE.Matrix4().makeScale(side, 1, 1));
      place(groups[slot], item, matrix);
    }
  }

  return { root, dispose: () => baked.forEach((geometry) => geometry.dispose()) };
}

// ---- Build queue ---------------------------------------------------------------------------------------

// Baking is quick (a few ms) but a crowd joining at once would pile it all into one frame: builds queue up and
// run one at a time in the browser's spare time between frames.
const queue = [];
let running = false;
const whenIdle = (work) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(work, { timeout: 250 }) : setTimeout(work, 16));
const runNext = () => {
  const job = queue.shift();
  if (!job) {
    running = false;
    return;
  }
  try {
    job();
  } finally {
    whenIdle(runNext);
  }
};
/** Runs `job` soon, in spare time, after any builds already waiting. */
export function queueBuild(job) {
  queue.push(job);
  if (!running) {
    running = true;
    whenIdle(runNext);
  }
}
