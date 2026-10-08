import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Static batching, as game engines do it: meshes under `root` that never move relative to it and look
 * the same (equal material settings, equal shadow flags) are merged into one mesh each, baked in root's
 * local space, so a model built from hundreds of small parts costs a handful of draw calls instead of
 * hundreds, in the main pass and again in the shadow pass. The picture is unchanged.
 *
 * Anything that might change at runtime is left exactly as it is:
 * - subtrees listed in `exclude` (e.g. parts the owner moves or recolours),
 * - meshes that carry their own `userData` (owners keep runtime state there),
 * - transparent, shader and custom-compiled materials (animated opacity / uniforms, special shading),
 * - hidden meshes, multi-material meshes, sprites, points and lines.
 * Call it once the subtree is fully built. Returns how many meshes were merged away.
 */
export function batchStatic(root, { exclude = [] } = {}) {
  root.updateMatrixWorld(true);
  const excluded = new Set();
  for (const object of exclude) object?.traverse((child) => excluded.add(child));
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();

  const buckets = new Map();
  root.traverse((mesh) => {
    if (!isBatchable(mesh, excluded)) return;
    const geometry = mesh.geometry;
    const key = [
      materialKey(mesh.material),
      mesh.castShadow, mesh.receiveShadow, mesh.renderOrder,
      Object.keys(geometry.attributes).sort().join(','),
    ].join('|');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(mesh);
  });

  let merged = 0;
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((mesh) => {
      // Non-indexed so every part merges with every other; morph data is never used by these models.
      const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone());
      geometry.morphAttributes = {};
      geometry.clearGroups();
      const matrix = new THREE.Matrix4().multiplyMatrices(rootInverse, mesh.matrixWorld);
      geometry.applyMatrix4(matrix);
      // A mirrored transform turns triangles inside out once it is baked in; swap their winding back.
      if (matrix.determinant() < 0) flipWinding(geometry);
      return geometry;
    });
    const combined = mergeGeometries(geometries);
    geometries.forEach((geometry) => geometry.dispose());
    if (!combined) continue;
    const first = meshes[0];
    const batch = new THREE.Mesh(combined, first.material);
    batch.castShadow = first.castShadow;
    batch.receiveShadow = first.receiveShadow;
    batch.renderOrder = first.renderOrder;
    batch.frustumCulled = meshes.every((mesh) => mesh.frustumCulled);
    root.add(batch);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      if (!isShared(mesh.geometry, root)) mesh.geometry.dispose();
    }
    merged += meshes.length - 1;
  }
  return merged;
}

function isBatchable(mesh, excluded) {
  if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh || excluded.has(mesh)) return false;
  if (!mesh.visible || Array.isArray(mesh.material) || Object.keys(mesh.userData).length) return false;
  if (mesh.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender) return false;
  if (mesh.customDepthMaterial || mesh.customDistanceMaterial) return false;
  // Everything up to the root must be visible and plain too, or the part would appear where it shouldn't.
  for (let parent = mesh.parent; parent; parent = parent.parent) {
    if (!parent.visible) return false;
    if (parent.isMesh && Object.keys(parent.userData).length) return false;
  }
  const material = mesh.material;
  if (material.transparent || material.isShaderMaterial || material.isRawShaderMaterial) return false;
  if (!mesh.geometry.attributes.position || mesh.geometry.morphAttributes.position) return false;
  return true;
}

// Materials whose visible settings are equal can share one draw call.
const MATERIAL_FIELDS = [
  'type', 'side', 'vertexColors', 'flatShading', 'wireframe', 'fog', 'toneMapped', 'depthTest', 'depthWrite',
  'alphaTest', 'blending', 'roughness', 'metalness', 'emissiveIntensity', 'envMapIntensity', 'lightMapIntensity',
  'aoMapIntensity', 'bumpScale', 'shininess', 'reflectivity', 'polygonOffset', 'polygonOffsetFactor',
  'polygonOffsetUnits', 'colorWrite', 'dithering',
];
const MAP_FIELDS = ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'bumpMap', 'alphaMap', 'lightMap', 'envMap', 'specularMap'];
const COLOR_FIELDS = ['color', 'emissive', 'specular'];

function materialKey(material) {
  // A custom compile hook or program key means special shading: only merge with that very material.
  if (material.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile
    || material.customProgramCacheKey !== THREE.Material.prototype.customProgramCacheKey) {
    return `instance:${material.uuid}`;
  }
  const parts = MATERIAL_FIELDS.map((field) => material[field]);
  for (const field of COLOR_FIELDS) parts.push(material[field]?.getHexString?.());
  for (const field of MAP_FIELDS) parts.push(material[field]?.uuid);
  parts.push(material.normalScale?.x, material.normalScale?.y);
  return parts.join(',');
}

function flipWinding(geometry) {
  const attributes = Object.values(geometry.attributes);
  for (let i = 0; i < geometry.attributes.position.count; i += 3) {
    for (const attribute of attributes) {
      const size = attribute.itemSize;
      for (let c = 0; c < size; c += 1) {
        const a = attribute.array[(i + 1) * size + c];
        attribute.array[(i + 1) * size + c] = attribute.array[(i + 2) * size + c];
        attribute.array[(i + 2) * size + c] = a;
      }
    }
  }
  for (const attribute of attributes) attribute.needsUpdate = true;
}

// A geometry another (unmerged) mesh under root still uses must not be freed.
function isShared(geometry, root) {
  let shared = false;
  root.traverse((object) => { if (object.geometry === geometry) shared = true; });
  return shared;
}
