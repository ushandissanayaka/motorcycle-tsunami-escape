import * as THREE from 'three';
import { applyWorldUV } from '../util/textures.js';
import avatarAtlasUrl from '../../assets/leaderboard/avatars.png';
import { SAMPLE_SPEED, SAMPLE_WINS } from './leaderboardData.js';

/**
 * The two Global Leaderboards (Speed, pink, and Wins, blue): a standing board with a studded purple
 * back plate, an octagon header with three lights, and a ten-row list that scrolls with the mouse
 * wheel or by dragging. Layout follows the reference screenshots, at one world unit = 48 screenshot pixels.
 */

const FONT = '"Fredoka", "Lilita One", "Arial Black", Arial, sans-serif';
const INK = '#1b1330';

const THEMES = {
  speed: {
    title: 'Speed', titleFill: ['#d857ff', '#8a2cf0'], top: '#ff7db8', bottom: '#ee4b98', lattice: '#ffb0d3', frame: '#ff5fa6', icon: 'shoe',
  },
  wins: {
    title: 'WINS', titleFill: ['#fff26a', '#ffc21a'], top: '#5db0ff', bottom: '#2f86e8', lattice: '#9fd0ff', frame: '#3f95f0', icon: 'trophy',
  },
};

// Board layout (local units, +z is the front, y up from the ground).
const HEADER_OUTLINE = [[-2.4, 1.25], [2.4, 1.25], [4.0, 0.35], [4.0, -0.6], [3.2, -1.25], [-3.2, -1.25], [-4.0, -0.6], [-4.0, 0.35]];
const HEADER = { y: 8.15, width: 8, height: 2.5 };
const PANEL = { y: 4.0, frameWidth: 5.5, frameHeight: 6.1, listWidth: 4.85, listHeight: 5.65 };
const SCALE = 0.85; // the reference boards are a little smaller than the layout below
const BOARD_HALF_WIDTH = 4.9 * SCALE; // wing tip
const BOARD_HALF_DEPTH = 1.3 * SCALE; // plinth
const BOARD_HEIGHT = 10.4 * SCALE;

// Right half of the studded back plate, top to bottom; the wing edge is a saw-tooth. The left half mirrors it.
const PLATE_RIGHT = [[3.5, 9.0], [3.5, 5.7], [4.9, 4.95], [4.1, 4.55], [4.75, 3.85], [3.95, 3.45], [4.5, 2.85], [3.7, 2.45], [4.1, 1.85], [3.3, 1.55], [3.5, 1.05], [2.3, 0.9]];

// The list is drawn on a canvas: about ten rows are visible, the rest scroll.
const LIST_W = 1024;
const LIST_H = Math.round(LIST_W * (PANEL.listHeight / PANEL.listWidth));
const ROW_H = 112;
const LIST_PAD = 8;
const WHEEL_GAIN = 1.4; // list pixels per wheel pixel
const PICK_DISTANCE = 32; // the wheel only scrolls a list this close, so zooming the camera out still works

// ---------------------------------------------------------------- textures

function tileTexture(base, light, dark) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = dark;
  ctx.fillRect(0, 0, size, size);
  const cell = size / 4;
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = col * cell + 3;
      const y = row * cell + 3;
      ctx.fillStyle = base;
      ctx.fillRect(x, y, cell - 6, cell - 6);
      ctx.fillStyle = light;
      ctx.fillRect(x, y, cell - 6, 4);
      ctx.fillRect(x, y, 4, cell - 6);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const outlinedText = (ctx, text, x, y, font, fill, lineWidth, maxWidth, align = 'center') => {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = INK;
  ctx.strokeText(text, x, y, maxWidth);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y, maxWidth);
};

const polygonPath = (ctx, points) => {
  ctx.beginPath();
  points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
};

/** Header face: pink/blue octagon with a diamond lattice, the title and "Global Leaderboard". */
function headerTexture(theme) {
  const scale = 128; // canvas px per unit
  const canvas = document.createElement('canvas');
  canvas.width = HEADER.width * scale;
  canvas.height = HEADER.height * scale;
  const ctx = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  const toCanvas = (factor) => HEADER_OUTLINE.map(([x, y]) => [canvas.width / 2 + x * factor * scale, canvas.height / 2 - y * factor * scale]);
  const draw = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    polygonPath(ctx, toCanvas(1));
    ctx.fillStyle = '#4b3380';
    ctx.fill();
    polygonPath(ctx, toCanvas(0.965));
    ctx.fillStyle = '#7e62c4';
    ctx.fill();
    // Face with a lattice of diamonds.
    polygonPath(ctx, toCanvas(0.925));
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, theme.top);
    gradient.addColorStop(1, theme.bottom);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = theme.lattice;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 4;
    const step = 64;
    for (let d = -canvas.height; d < canvas.width + canvas.height; d += step) {
      ctx.beginPath();
      ctx.moveTo(d, 0);
      ctx.lineTo(d + canvas.height, canvas.height);
      ctx.moveTo(d + canvas.height, 0);
      ctx.lineTo(d, canvas.height);
      ctx.stroke();
    }
    ctx.restore();

    const fill = ctx.createLinearGradient(0, 40, 0, 190);
    fill.addColorStop(0, theme.titleFill[0]);
    fill.addColorStop(1, theme.titleFill[1]);
    outlinedText(ctx, theme.title, canvas.width / 2, 116, `700 150px ${FONT}`, fill, 26, 700);
    outlinedText(ctx, 'Global Leaderboard', canvas.width / 2, 252, `700 84px ${FONT}`, '#ffffff', 18, 880);
    texture.needsUpdate = true;
  };
  draw();
  document.fonts?.load(`700 84px ${FONT}`).then(draw).catch(() => {});
  return texture;
}

// ---------------------------------------------------------------- list rows

const ROW_COLORS = {
  1: ['#fff98a', '#ffec4f'],
  2: ['#ffbf8a', '#ff9a5a'],
  3: ['#ffffff', '#ebebeb'],
};
const DEFAULT_ROW = ['#86ccff', '#4aa4f5'];

const roundedRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

function drawShoe(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 60, s / 60);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#9fe0ff';
  ctx.beginPath();
  ctx.moveTo(-28, 8);
  ctx.bezierCurveTo(-28, -8, -20, -14, -10, -14);
  ctx.lineTo(-2, -24);
  ctx.bezierCurveTo(2, -16, 10, -14, 14, -10);
  ctx.bezierCurveTo(24, -8, 30, 0, 30, 10);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  roundedRect(ctx, -30, 8, 62, 13, 6);
  ctx.stroke();
  ctx.fill();
  ctx.fillStyle = '#ffd23a';
  ctx.fillRect(-14, -2, 20, 5);
  ctx.restore();
}

function drawTrophy(ctx, cx, cy, s) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s / 60, s / 60);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 6;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#ffc21a';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * 24, -8, 11, side > 0 ? -Math.PI / 2 : Math.PI / 2, side > 0 ? Math.PI / 2 : -Math.PI / 2, side < 0);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(-20, -24);
  ctx.lineTo(20, -24);
  ctx.quadraticCurveTo(20, 8, 0, 10);
  ctx.quadraticCurveTo(-20, 8, -20, -24);
  ctx.closePath();
  ctx.stroke();
  ctx.fill();
  ctx.fillRect(-5, 10, 10, 10);
  ctx.strokeRect(-5, 10, 10, 10);
  ctx.fillStyle = '#f08a10';
  roundedRect(ctx, -16, 20, 32, 10, 3);
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** Generated avatar for rows that have no picture. */
function drawGeneratedAvatar(ctx, cx, cy, r, name) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = `hsl(${hash} 70% 78%)`;
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = `hsl(${(hash + 40) % 360} 55% 45%)`;
  ctx.beginPath();
  ctx.ellipse(cx, cy + r * 0.95, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f6cf9f';
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.12, r * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `hsl(${(hash + 200) % 360} 40% 25%)`;
  ctx.beginPath();
  ctx.arc(cx, cy - r * 0.3, r * 0.44, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- one board

function createBoard(kind, materials) {
  const theme = THEMES[kind];
  const group = new THREE.Group();
  const solidMesh = (geometry, material, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const extrude = (points, depth) => {
    const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    geometry.translate(0, 0, -depth);
    return applyWorldUV(geometry, 2.4);
  };

  // Base: two lavender slabs and a short neck.
  solidMesh(new THREE.BoxGeometry(7.4, 0.4, 2.6), materials.base, 0, 0.2, 0.1);
  solidMesh(new THREE.BoxGeometry(6.6, 0.28, 2.0), materials.baseTop, 0, 0.54, 0.1);
  solidMesh(new THREE.BoxGeometry(1.6, 0.9, 0.8), materials.base, 0, 1.0, -0.1);

  // Studded plate with saw-tooth wings, front face at z = 0.
  const left = PLATE_RIGHT.map(([x, y]) => [-x, y]).reverse();
  solidMesh(extrude([...PLATE_RIGHT, ...left], 0.7), materials.plate, 0, 0, 0);

  // Panel frame and the list on it.
  const frameMaterial = new THREE.MeshStandardMaterial({ color: theme.frame, roughness: 0.55 });
  solidMesh(new THREE.BoxGeometry(PANEL.frameWidth, PANEL.frameHeight, 0.4), frameMaterial, 0, PANEL.y, 0.2);
  const inner = new THREE.MeshStandardMaterial({ color: 0x241a48, roughness: 0.8 });
  solidMesh(new THREE.BoxGeometry(PANEL.listWidth + 0.2, PANEL.listHeight + 0.2, 0.1), inner, 0, PANEL.y, 0.41);

  const listCanvas = document.createElement('canvas');
  listCanvas.width = LIST_W;
  listCanvas.height = LIST_H;
  const listTexture = new THREE.CanvasTexture(listCanvas);
  listTexture.colorSpace = THREE.SRGBColorSpace;
  listTexture.anisotropy = 8;
  const list = new THREE.Mesh(
    new THREE.PlaneGeometry(PANEL.listWidth, PANEL.listHeight),
    new THREE.MeshBasicMaterial({ map: listTexture, toneMapped: false }),
  );
  list.position.set(0, PANEL.y, 0.47);
  group.add(list);

  // Octagon header: a solid body for its shadow and thickness, and the drawn face on the front.
  const headerBody = new THREE.Mesh(extrude(HEADER_OUTLINE, 0.6), new THREE.MeshStandardMaterial({ color: 0x4b3380, roughness: 0.7 }));
  headerBody.position.set(0, HEADER.y, 0.75);
  headerBody.castShadow = true;
  group.add(headerBody);
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(HEADER.width, HEADER.height),
    new THREE.MeshBasicMaterial({ map: headerTexture(theme), transparent: true, toneMapped: false }),
  );
  face.position.set(0, HEADER.y, 0.76);
  group.add(face);

  // Lights on top: green in the middle, orange-red either side.
  const light = (color, emissive, w, h, x, y, roll) => {
    const material = new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: 2.2, roughness: 0.4 });
    const mesh = solidMesh(new THREE.BoxGeometry(w, h, 0.6), material, x, y, 0.4);
    mesh.rotation.z = roll;
  };
  const top = HEADER.y + HEADER.height / 2;
  light(0x62ff3a, 0x2bff1a, 1.9, 0.55, 0, top + 0.3, 0);
  light(0xff8a2a, 0xff5a10, 1.4, 0.45, -3.0, top - 0.05, 0.42);
  light(0xff8a2a, 0xff5a10, 1.4, 0.45, 3.0, top - 0.05, -0.42);

  // ---- the scrolling list
  const state = { kind, entries: [], scroll: 0, target: 0, dirty: true };
  const ctx = listCanvas.getContext('2d');
  const maxScroll = () => Math.max(0, state.entries.length * ROW_H + LIST_PAD * 2 - LIST_H);

  const drawRow = (entry, index, y) => {
    const rank = index + 1;
    const [c1, c2] = ROW_COLORS[rank] ?? DEFAULT_ROW;
    const gradient = ctx.createLinearGradient(0, y, 0, y + ROW_H);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(1, c2);
    roundedRect(ctx, 14, y + 6, LIST_W - 28, ROW_H - 12, 16);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();

    const cy = y + ROW_H / 2;
    outlinedText(ctx, String(rank), 66, cy + 2, `700 ${rank > 9 ? 52 : 62}px ${FONT}`, '#ffffff', 10, 80);

    // Avatar: a picture from the atlas, or a generated one, inside a dark ring.
    const r = 42;
    if (entry.avatar !== undefined && materials.atlas.complete && materials.atlas.naturalWidth) {
      const size = 64;
      const sx = (entry.avatar % 5) * size;
      const sy = Math.floor(entry.avatar / 5) * size;
      ctx.save();
      ctx.beginPath();
      ctx.arc(176, cy, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(materials.atlas, sx, sy, size, size, 176 - r, cy - r, r * 2, r * 2);
      ctx.restore();
    } else {
      drawGeneratedAvatar(ctx, 176, cy, r, entry.name);
    }
    ctx.beginPath();
    ctx.arc(176, cy, r, 0, Math.PI * 2);
    ctx.lineWidth = 6;
    ctx.strokeStyle = INK;
    ctx.stroke();

    outlinedText(ctx, entry.name, 455, cy + 2, `700 ${entry.name.length > 13 ? 38 : 46}px ${FONT}`, '#ffffff', 9, 340);
    outlinedText(ctx, entry.value, 800, cy + 2, `700 42px ${FONT}`, '#ffffff', 8, 170, 'right');
    (theme.icon === 'shoe' ? drawShoe : drawTrophy)(ctx, 930, cy, 58);
  };

  const draw = () => {
    ctx.fillStyle = '#241a48';
    ctx.fillRect(0, 0, LIST_W, LIST_H);
    for (let i = 0; i < state.entries.length; i += 1) {
      const y = LIST_PAD + i * ROW_H - state.scroll;
      if (y > LIST_H || y + ROW_H < 0) continue;
      drawRow(state.entries[i], i, y);
    }
    // Slim scroll bar so it is clear the list moves.
    const max = maxScroll();
    if (max > 0) {
      const track = LIST_H - 24;
      const thumb = Math.max(60, track * (LIST_H / (LIST_H + max)));
      const thumbY = 12 + (track - thumb) * (state.scroll / max);
      roundedRect(ctx, LIST_W - 15, 12, 9, track, 5);
      ctx.fillStyle = 'rgba(15, 8, 40, 0.5)';
      ctx.fill();
      roundedRect(ctx, LIST_W - 15, thumbY, 9, thumb, 5);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.fill();
    }
    listTexture.needsUpdate = true;
    state.dirty = false;
  };

  return {
    group,
    list,
    state,
    setEntries(entries) {
      state.entries = entries;
      state.target = Math.min(state.target, maxScroll());
      state.scroll = Math.min(state.scroll, maxScroll());
      state.dirty = true;
    },
    scrollBy(pixels) {
      state.target = THREE.MathUtils.clamp(state.target + pixels, 0, maxScroll());
    },
    /** Eases the scroll toward its target and redraws when anything changed. */
    update() {
      const diff = state.target - state.scroll;
      if (Math.abs(diff) > 0.4) {
        state.scroll += diff * 0.25;
        state.dirty = true;
      } else if (diff !== 0) {
        state.scroll = state.target;
        state.dirty = true;
      }
      if (state.dirty) draw();
    },
    redraw() {
      state.dirty = true;
    },
  };
}

// ---------------------------------------------------------------- both boards

/**
 * Builds the Speed and Wins boards. Each stands at `position` facing `yaw` (the local +z side is the
 * front). Returns the group to add to the scene, the footprint `solids` riders bump into, a per-frame
 * `update`, `setEntries(kind, rows)` for real data later, and `attach(camera, canvas)`, which wires up
 * wheel / drag scrolling and returns a function that removes it again.
 */
export function createLeaderboards(placements) {
  const plate = new THREE.MeshStandardMaterial({ map: tileTexture('#8272c2', '#9d8fda', '#5d4f9c'), roughness: 0.85 });
  const materials = {
    plate,
    base: new THREE.MeshStandardMaterial({ color: 0x9a8ad8, roughness: 0.7 }),
    baseTop: new THREE.MeshStandardMaterial({ color: 0x7e6ec4, roughness: 0.7 }),
    atlas: new Image(),
  };

  const group = new THREE.Group();
  const boards = {};
  const solids = [];
  for (const { kind, x, z, yaw } of placements) {
    const board = createBoard(kind, materials);
    board.group.position.set(x, 0, z);
    board.group.rotation.y = yaw;
    board.group.scale.setScalar(SCALE);
    group.add(board.group);
    boards[kind] = board;

    // Axis-aligned footprint of the (possibly turned) board.
    const cos = Math.abs(Math.cos(yaw));
    const sin = Math.abs(Math.sin(yaw));
    const halfX = cos * BOARD_HALF_WIDTH + sin * BOARD_HALF_DEPTH;
    const halfZ = sin * BOARD_HALF_WIDTH + cos * BOARD_HALF_DEPTH;
    solids.push({ minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, bottom: 0, top: BOARD_HEIGHT });
  }
  boards.speed?.setEntries(SAMPLE_SPEED);
  boards.wins?.setEntries(SAMPLE_WINS);

  // Avatars are drawn from one atlas image; redraw the lists once it has loaded.
  materials.atlas.onload = () => Object.values(boards).forEach((board) => board.redraw());
  materials.atlas.src = avatarAtlasUrl;

  const update = () => Object.values(boards).forEach((board) => board.update());

  const attach = (camera, canvas) => {
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const lists = Object.values(boards).map((board) => board.list);
    const byMesh = new Map(Object.values(boards).map((board) => [board.list, board]));

    /** The list under the pointer, with the point hit, or null (also null over HUD buttons). */
    const pick = (event) => {
      if (event.target !== canvas) return null;
      const rect = canvas.getBoundingClientRect();
      ndc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObjects(lists, false)[0];
      return hit && hit.distance < PICK_DISTANCE ? { board: byMesh.get(hit.object), uv: hit.uv } : null;
    };

    let hovering = false;
    let drag = null;
    const setCursor = (on) => {
      if (on === hovering) return;
      hovering = on;
      if (document.body.style.cursor !== 'grabbing') document.body.style.cursor = on ? 'ns-resize' : '';
    };

    const onWheel = (event) => {
      if (event.target instanceof Element && event.target.closest('.menu-popup')) return;
      const hit = pick(event);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation(); // keep the camera from zooming while a list is being scrolled
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1;
      hit.board.scrollBy(event.deltaY * unit * WHEEL_GAIN);
    };
    const onPointerDown = (event) => {
      if (event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest('.menu-popup')) return;
      const hit = pick(event);
      if (hit) drag = { id: event.pointerId, board: hit.board, v: hit.uv.y };
    };
    const onPointerMove = (event) => {
      if (drag && event.pointerId === drag.id) {
        // Follow the finger: the list moves with the pointer, so dragging down scrolls up.
        const hit = pick(event);
        if (hit && hit.board === drag.board) {
          drag.board.state.scroll = THREE.MathUtils.clamp(drag.board.state.scroll + (hit.uv.y - drag.v) * LIST_H, 0, Math.max(0, drag.board.state.entries.length * ROW_H + LIST_PAD * 2 - LIST_H));
          drag.board.state.target = drag.board.state.scroll;
          drag.board.state.dirty = true;
          drag.v = hit.uv.y;
        }
        return;
      }
      setCursor(Boolean(pick(event)));
    };
    const endDrag = (event) => {
      if (drag && event.pointerId === drag.id) drag = null;
    };

    // Capture phase so these run before the camera's own wheel / pointer handlers.
    window.addEventListener('wheel', onWheel, { passive: false, capture: true });
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('pointermove', onPointerMove, true);
    window.addEventListener('pointerup', endDrag, true);
    window.addEventListener('pointercancel', endDrag, true);
    return () => {
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', endDrag, true);
      window.removeEventListener('pointercancel', endDrag, true);
      if (hovering) document.body.style.cursor = '';
    };
  };

  return {
    group,
    solids,
    update,
    attach,
    setEntries: (kind, rows) => boards[kind]?.setEntries(rows),
  };
}
