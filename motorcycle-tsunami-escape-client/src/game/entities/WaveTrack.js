import * as THREE from 'three';
import { PALETTES, applyWorldUV, makePaverTexture, makeStudTexture } from '../util/textures.js';

/**
 * The wave place: a long run of raised black asphalt slabs over a grey
 * paved floor. The hollows between the slabs get longer the further you go
 * (`WAVE_TRACK.gapGrowth`), so riders have to hop across bigger and bigger
 * gaps; a hollow is shallow enough to drive back out of. Slabs carry a yellow
 * dashed centre line, hollows have a red pad on the left and a yellow pad on
 * the right, and pink-lavender curbs edge both sides. Yellow panels are set
 * into the east wall. The far end is open to the sky.
 * The entrance glows red and fades to black over the first stretch of the run;
 * `setWarning(true)` floods the whole track red, as when a wave is coming.
 */

const CURB = { base: '#d8c0e2', light: '#eddcf5', dark: '#a98fbc' };
const PANEL = { base: '#f2b632', light: '#ffd056', dark: '#c98f1c' };
const PAD_RED = 0xff3038;
const PAD_YELLOW = 0xffe62e;
const CURB_WIDTH = 2;
const RED_FADE_LENGTH = 50; // red at the entrance, gone this far along the track

/**
 * Blends a material toward glowing red by distance from the track entrance, keeping its
 * studs visible: full red at `uRedFrom`, back to the normal colour `uRedLength` further north.
 */
function withEntranceRed(material, uniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying float vTrackZ;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vTrackZ = (modelMatrix * vec4(transformed, 1.0)).z;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vTrackZ;
uniform float uRedFrom;
uniform float uRedLength;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float redT = clamp((uRedFrom - vTrackZ) / uRedLength, 0.0, 1.0);
        float redAmount = pow(1.0 - redT, 1.4);
        float shade = dot(diffuseColor.rgb, vec3(0.333));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.02, 0.05) * (0.5 + 1.0 * shade), redAmount);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.34, 0.0, 0.02) * redAmount;`
      );
  };
  material.customProgramCacheKey = () => 'wave-entrance-red';
  return material;
}

export function createWaveTrack({ x0, x1, zStart, slabs, slabLength, firstGap, gapGrowth, slabHeight }) {
  const group = new THREE.Group();
  const width = x1 - x0;
  const centerX = (x0 + x1) / 2;
  const solids = [];

  const redUniforms = { uRedFrom: { value: zStart + 2 }, uRedLength: { value: RED_FADE_LENGTH } };
  const asphalt = withEntranceRed(new THREE.MeshStandardMaterial({ map: makeStudTexture(PALETTES.asphalt, 61), roughness: 0.9 }), redUniforms);
  const curb = withEntranceRed(new THREE.MeshStandardMaterial({ map: makeStudTexture(CURB, 62), roughness: 0.85, emissive: 0x9a86ad, emissiveIntensity: 0.2 }), redUniforms);
  const hollowFloor = withEntranceRed(new THREE.MeshStandardMaterial({ map: makePaverTexture(PALETTES.paver, 63), roughness: 0.85, emissive: 0x9a93b8, emissiveIntensity: 0.25 }), redUniforms);
  const dashMaterial = new THREE.MeshStandardMaterial({ color: 0xf7c928, emissive: 0x4a3a00 });

  const box = (w, h, d, material, x, y, z, tile = 6) => {
    const mesh = new THREE.Mesh(applyWorldUV(new THREE.BoxGeometry(w, h, d), tile), material);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  let z = zStart; // south edge of the next piece
  for (let i = 0; i < slabs; i += 1) {
    const zBack = z - slabLength;
    const midZ = (z + zBack) / 2;

    // Raised slab with dark risers, curbs along its sides and a dashed centre line.
    box(width, slabHeight, slabLength, asphalt, centerX, slabHeight / 2, midZ);
    solids.push({ minX: x0, maxX: x1, minZ: zBack, maxZ: z, bottom: 0, top: slabHeight });
    for (const side of [-1, 1]) {
      box(CURB_WIDTH, 0.06, slabLength, curb, centerX + side * (width / 2 - CURB_WIDTH / 2), slabHeight + 0.03, midZ);
    }
    for (let dz = z - 1.5; dz > zBack + 1; dz -= 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.25, 2), dashMaterial);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(centerX, slabHeight + 0.075, dz);
      group.add(dash);
    }
    z = zBack;

    // The hollow after this slab: grey paved floor, curbs, and the two pads.
    if (i < slabs - 1) {
      const gap = firstGap + gapGrowth * i;
      const gapMid = z - gap / 2;
      box(width, 0.05, gap, hollowFloor, centerX, 0.025, gapMid, 4.8);
      for (const side of [-1, 1]) {
        box(CURB_WIDTH, 0.07, gap, curb, centerX + side * (width / 2 - CURB_WIDTH / 2), 0.035, gapMid);
      }
      for (const [side, color] of [[-1, PAD_RED], [1, PAD_YELLOW]]) {
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(2.8, 0.16, Math.min(1.5, gap - 0.6)),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4 })
        );
        pad.position.set(centerX + side * (width / 2 - CURB_WIDTH - 2), 0.12, gapMid);
        group.add(pad);
      }
      z -= gap;
    }
  }
  const zEnd = z;

  // Yellow panels set into the east wall, spread along the run.
  const length = zStart - zEnd;
  const panelMaterial = new THREE.MeshStandardMaterial({ map: makeStudTexture(PANEL, 64), roughness: 0.8, emissive: 0xf2b632, emissiveIntensity: 0.25 });
  for (const [fraction, depth, height] of [[0.25, 9, 7], [0.5, 11, 8], [0.8, 12, 8]]) {
    box(0.3, height, depth, panelMaterial, x1 - 0.15, slabHeight + 0.5 + height / 2, zStart - fraction * length);
  }

  // A warning stretches the red across the whole run instead of just the entrance.
  const setWarning = (active) => {
    redUniforms.uRedLength.value = active ? length * 2 : RED_FADE_LENGTH;
  };

  return { group, solids, setWarning, zEnd };
}
