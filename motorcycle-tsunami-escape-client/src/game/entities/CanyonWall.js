import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAP_LAYOUT } from '../../shared/constants.js';
import { makeStudTexture, mulberry32 } from '../util/textures.js';

// Salmon studded rock under bright studded grass caps that overhang the rock
// and drip down in jagged clumps (Roblox terrain look).
const ROCK = { base: '#dc7c6e', light: '#f5a294', dark: '#b45a52' };
const GRASS = { base: '#6ccb4b', light: '#93e46f', dark: '#3f9c32' };
const ROCK_TINTS = [0xffffff, 0xf6dcd4, 0xffe6de, 0xeecbc3, 0xfff0ea];
const GRASS_TINTS = [0xffffff, 0xeaffd8, 0xd8f7c2];

const TILE_SIZE = 6; // world units per texture tile
const CAP_THICKNESS = 1.7;
const CAP_OVERHANG = 0.6;

/** Box (optionally tapered toward the top) placed in world space with world-scaled UVs and a vertex tint. */
function makeSolid({ width, height, depth, taper = 1, position, yaw = 0, tint }) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i += 1) {
    if (pos.getY(i) > 0) pos.setXYZ(i, pos.getX(i) * taper, pos.getY(i), pos.getZ(i) * taper);
  }
  geometry.computeVertexNormals();
  geometry.applyMatrix4(
    new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1))
  );

  const normal = geometry.attributes.normal;
  const uv = geometry.attributes.uv;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color(tint);
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ax = Math.abs(normal.getX(i));
    const ay = Math.abs(normal.getY(i));
    const az = Math.abs(normal.getZ(i));
    if (ay >= ax && ay >= az) uv.setXY(i, x / TILE_SIZE, z / TILE_SIZE);
    else if (ax >= az) uv.setXY(i, z / TILE_SIZE, y / TILE_SIZE);
    else uv.setXY(i, x / TILE_SIZE, y / TILE_SIZE);
    colors.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * One mesa: a tapered rock block, a grass slab that overhangs it, and
 * clumps of grass hanging from the slab edge so the lip looks ragged.
 */
function addMesa({ center, width, depth, height, yaw, rand, rock, grass }) {
  const taper = 0.9 + rand() * 0.1;
  const bottom = -3;
  const totalHeight = height - bottom;

  rock.push(
    makeSolid({
      width,
      height: totalHeight,
      depth,
      taper,
      position: new THREE.Vector3(center.x, bottom + totalHeight / 2, center.z),
      yaw,
      tint: ROCK_TINTS[Math.floor(rand() * ROCK_TINTS.length)],
    })
  );

  const capWidth = width * taper + CAP_OVERHANG * 2;
  const capDepth = depth * taper + CAP_OVERHANG * 2;
  const capTint = GRASS_TINTS[Math.floor(rand() * GRASS_TINTS.length)];
  const capY = height - CAP_THICKNESS / 2 + 0.1;
  grass.push(
    makeSolid({
      width: capWidth,
      height: CAP_THICKNESS,
      depth: capDepth,
      taper: 0.97,
      position: new THREE.Vector3(center.x, capY, center.z),
      yaw,
      tint: capTint,
    })
  );

  // Hanging clumps along all four edges of the cap (built in mesa-local axes, then rotated by yaw).
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const clump = (localX, localZ, w, d, h) => {
    const wx = center.x + localX * cos + localZ * sin;
    const wz = center.z - localX * sin + localZ * cos;
    grass.push(
      makeSolid({
        width: w,
        height: h,
        depth: d,
        taper: 0.85,
        position: new THREE.Vector3(wx, height - CAP_THICKNESS - h / 2 + 0.35, wz),
        yaw,
        tint: capTint,
      })
    );
  };
  const halfW = capWidth / 2 - 0.4;
  const halfD = capDepth / 2 - 0.4;
  for (let x = -halfW + 0.6; x < halfW; x += 1.5) {
    if (rand() < 0.75) {
      clump(x, halfD, 1.3, 1.1, 0.8 + rand() * 1.6);
    }
    if (rand() < 0.75) {
      clump(x, -halfD, 1.3, 1.1, 0.8 + rand() * 1.6);
    }
  }
  for (let z = -halfD + 0.6; z < halfD; z += 1.5) {
    if (rand() < 0.75) {
      clump(halfW, z, 1.1, 1.3, 0.8 + rand() * 1.6);
    }
    if (rand() < 0.75) {
      clump(-halfW, z, 1.1, 1.3, 0.8 + rand() * 1.6);
    }
  }
}

/**
 * Wall edges of the T-shaped map, in the layout's own coordinates. Every
 * edge runs from `a` to `b` with its solid side `outward`. `extendA` /
 * `extendB` push the wall past a convex corner so the corner gets filled;
 * concave corners (where the corridor meets the room) must not extend or the
 * wall would poke into the open floor.
 */
function outlineEdges({ room, corridor }) {
  const { halfWidth: rw, north: rn, south: rs } = room;
  const { halfWidth: cw, north: cn } = corridor;
  const v = (x, z) => new THREE.Vector2(x, z);
  const edge = (a, b, outward, extendA, extendB) => ({ a, b, outward, extendA, extendB });
  return [
    edge(v(-rw, rs), v(rw, rs), v(0, 1), true, true), // room south
    edge(v(-rw, rs), v(-rw, rn), v(-1, 0), true, true), // room west (bike store side)
    edge(v(rw, rs), v(rw, rn), v(1, 0), true, true), // room east (training side)
    edge(v(-rw, rn), v(-cw, rn), v(0, -1), true, false), // room north, left of the corridor
    edge(v(cw, rn), v(rw, rn), v(0, -1), false, true), // room north, right of the corridor
    // The corridor's north end is left open: no wall there, so the wave place looks out to the sky.
    edge(v(-cw, rn), v(-cw, cn), v(-1, 0), false, false), // corridor west
    edge(v(cw, rn), v(cw, cn), v(1, 0), false, false), // corridor east
  ];
}

/**
 * Staggered studded mesas following the outline of the map. `layout` is the
 * T-shaped MAP_LAYOUT from shared/constants.js.
 */
export function createCanyonWall({ layout = MAP_LAYOUT, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const rock = [];
  const grass = [];

  // Two layers: a shorter front row hugging the edge and a taller row behind it for depth.
  const layers = [
    { offset: 0, offsetJitter: 4, minHeight: 14, maxHeight: 26, extension: 30 },
    { offset: 8, offsetJitter: 6, minHeight: 26, maxHeight: 40, extension: 50 },
  ];

  for (const layer of layers) {
    for (const edge of outlineEdges(layout)) {
      const length = edge.a.distanceTo(edge.b);
      const along = edge.b.clone().sub(edge.a).normalize();
      const yaw = Math.abs(along.x) > 0.5 ? 0 : Math.PI / 2;
      const from = edge.extendA ? -layer.extension : 0;
      const to = length + (edge.extendB ? layer.extension : 0);

      let cursor = from;
      while (cursor < to) {
        // The last block is clamped to end exactly at the edge's end (never shorter than 8).
        let width = Math.min(14 + rand() * 12, to - cursor);
        let last = width >= to - cursor;
        if (width < 8) {
          cursor = Math.max(from, to - 8);
          width = 8;
          last = true;
        }
        const depth = 10 + rand() * 8;
        const height = layer.minHeight + rand() * (layer.maxHeight - layer.minHeight);
        const inner = layer.offset + rand() * layer.offsetJitter;

        const point = edge.a.clone().addScaledVector(along, cursor + width / 2).addScaledVector(edge.outward, inner + depth / 2);
        addMesa({
          center: new THREE.Vector3(point.x, 0, point.y),
          width,
          depth,
          height,
          yaw: yaw + (rand() - 0.5) * 0.08,
          rand,
          rock,
          grass,
        });
        if (last) break;
        cursor += width * (0.62 + rand() * 0.1);
      }
    }
  }

  const group = new THREE.Group();
  // The emissive copy of the texture keeps shaded faces bright and flat like the reference.
  const studMaterial = (palette, seed, roughness) => {
    const map = makeStudTexture(palette, seed);
    return new THREE.MeshStandardMaterial({
      map,
      vertexColors: true,
      roughness,
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: 0.4,
    });
  };
  const rockMesh = new THREE.Mesh(mergeGeometries(rock), studMaterial(ROCK, 11, 0.95));
  const grassMesh = new THREE.Mesh(mergeGeometries(grass), studMaterial(GRASS, 23, 0.9));
  group.add(rockMesh, grassMesh);
  return group;
}
