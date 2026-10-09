// Each level needs LEVEL_STEP more speed progress than the previous level.
const LEVEL_BASE = 2500;
const LEVEL_STEP = 150;

/** Speed progress needed per level: 2500, 2650, 2800, 2950, ... */
export function levelTarget(level) {
  return LEVEL_BASE + (level - 1) * LEVEL_STEP;
}

/** Total speed collected from level 1 up to the start of `level`. */
export function speedToReachLevel(level) {
  const n = Math.max(0, level - 1);
  return n * LEVEL_BASE + (LEVEL_STEP * n * (n - 1)) / 2;
}

// The "N Speed" readout shows collected speed scaled down so it reads about 1,000 on reaching level 10 (the raw
// total is ~28,000 by then, since every level asks more than the last). Only the number shown changes:
// levelling, rewards and the server all keep the raw total.
const SPEED_DISPLAY_SCALE = 1000 / speedToReachLevel(10);
export const displaySpeed = (speed) => Math.floor(Math.max(0, speed) * SPEED_DISPLAY_SCALE);

// The Custom Speed box's ceiling: 116 for levels 1-10, then 10 more for every 10 levels (126 for 11-20, ...).
const CUSTOM_SPEED_BASE_MAX = 116;
export const customSpeedMax = (level) => CUSTOM_SPEED_BASE_MAX + 10 * Math.floor((Math.max(1, level) - 1) / 10);

// Custom Speed numbers map to the speed the bike really rides at (units per second): one for one up to
// CUSTOM_SPEED_KNEE, then CUSTOM_SPEED_SLOPE per point, so the big numbers (116, 160, ...) feel fast without
// launching the bike across the map (116 rides at ~58, 160 at ~76).
const CUSTOM_SPEED_KNEE = 20;
const CUSTOM_SPEED_SLOPE = 0.4;
export const rideSpeedFor = (value) => (value <= CUSTOM_SPEED_KNEE ? value : CUSTOM_SPEED_KNEE + (value - CUSTOM_SPEED_KNEE) * CUSTOM_SPEED_SLOPE);
/** The Custom Speed number for a ride speed (the inverse of rideSpeedFor), as the box shows a player's own speed. */
export const customSpeedFor = (rideSpeed) => (rideSpeed <= CUSTOM_SPEED_KNEE ? rideSpeed : CUSTOM_SPEED_KNEE + (rideSpeed - CUSTOM_SPEED_KNEE) / CUSTOM_SPEED_SLOPE);

/**
 * How many levels `levelProgress + earnedSpeed` clears from `riderLevel`, and what's left over in the
 * new level's own (bigger) bar. Levels needed for a jump of `n` grow with n², so a single very large
 * grant (a speed pack, a long AFK stretch, a big debug/testing bonus) could ask the equivalent of a
 * one-level-at-a-time loop for millions of iterations — this solves the same arithmetic-series sum in
 * closed form instead, so the cost stays flat no matter how big the jump is. `levelTarget` is a plain
 * arithmetic sequence (LEVEL_BASE + LEVEL_STEP per level up), so the levels-gained count is the positive root of
 * a quadratic; a small integer correction afterwards guards against floating-point rounding at the edge.
 */
export function applyLevelProgress(levelProgress, earnedSpeed, riderLevel) {
  const total = levelProgress + earnedSpeed;
  const half = LEVEL_STEP / 2;
  const b = levelTarget(riderLevel) - half; // from expanding the sum below: sum_{k=0}^{n-1} levelTarget(riderLevel+k) = b*n + (STEP/2)n²
  const sumOf = (n) => n * b + half * n * n; // sum_{k=0}^{n-1} levelTarget(riderLevel + k)
  let levelsGained = Math.max(0, Math.floor((-b + Math.sqrt(b * b + 4 * half * total)) / (2 * half)));
  while (levelsGained > 0 && sumOf(levelsGained) > total) levelsGained -= 1;
  while (sumOf(levelsGained + 1) <= total) levelsGained += 1;
  return { levelsGained, levelProgress: total - sumOf(levelsGained) };
}

/**
 * The wave place: black slabs level with the road, separated by deep grey pits.
 * Every pit is `gapGrowth` longer than the one before it, so the jumps get harder.
 * The first `easySlabs` slabs are short and grow only a little (`slabGrowth` each), so the start is easy. After
 * that each slab also grows by `hardGrowth` per step past them plus `hardCurve` per step squared, so the pits,
 * the only shelter from a wave, get further and further apart: out there a wave arriving mid-slab leaves too
 * little time to reach the next pit, and the rider has to turn back to the last one.
 * `pitDepth` is more than a bike can drive up out of, but a jump clears it.
 */
// Pits drop below the tsunami's ground-level base, leaving room for the rider
// and bike to shelter underneath it while it crosses the track.
// 2.8 units puts the pit floor below the 2.4-unit rider head height, with
// extra clearance so a rider tucked into a gap stays under the tsunami.
// The first pit (6) is wide enough for a starter bike to drop into: a rider falls past the far lip in ~0.32 s,
// i.e. after 3-4 units at starter speed. Pits then widen by 2 per step. Slabs run 20, 22, ... 48 over the first
// 15, then 57, 66, 77, 90, 103, 118, 133, ... 209 (26th).
export const WAVE_TRACK = { slabs: 8, slabLength: 20, slabGrowth: 2, easySlabs: 15, hardGrowth: 6, hardCurve: 0.6, firstGap: 6, gapGrowth: 2, pitDepth: 2.8 };

/** Length of slab i (0 is the first), and of pit i (the one just after slab i). */
export const waveSlabLength = (i, { slabLength, slabGrowth, easySlabs, hardGrowth, hardCurve } = WAVE_TRACK) => {
  const past = Math.max(0, i - easySlabs + 1); // steps past the easy stretch
  return slabLength + slabGrowth * i + hardGrowth * past + hardCurve * past * past;
};
export const waveGapLength = (i, { firstGap, gapGrowth } = WAVE_TRACK) => firstGap + gapGrowth * i;

/** Length of the wave place's first `slabs` slabs and the pits between them. */
export function waveTrackLength(track) {
  const sum = (count, f) => Array.from({ length: count }, (_, i) => f(i)).reduce((a, b) => a + b, 0);
  return sum(track.slabs, (i) => waveSlabLength(i, track)) + sum(track.slabs - 1, (i) => waveGapLength(i, track));
}

const ROOM_NORTH = -38;

/**
 * T-shaped map: a wide room (bike store on the west side, training place on
 * the east side) with a long corridor leading north; the wave place fills the
 * corridor and its far end is open to the sky. The room follows the
 * hand-drawn sketch (520x355); the corridor is as long as the wave place needs.
 */
export const MAP_LAYOUT = {
  // west / east: how far the room reaches either side of x = 0 (the bike store side is wider than the training side).
  room: { west: 48, east: 38, north: ROOM_NORTH, south: 31, southMargin: 3 }, // southMargin: riders may drive up to the Lucky Blocks stage
  corridor: { halfWidth: 25, north: ROOM_NORTH - waveTrackLength(WAVE_TRACK), sideMargin: 2 }, // widened wave course for broader slabs and pits
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Nearest point inside the walkable area (room ∪ corridor), keeping `margin` from the walls. */
export function clampToMap(x, z, margin = 7) {
  const { room, corridor } = MAP_LAYOUT;
  const inRoom = { x: clamp(x, -room.west + margin, room.east - margin), z: clamp(z, room.north + margin, room.south - room.southMargin) };
  const inCorridor = {
    x: clamp(x, -corridor.halfWidth + corridor.sideMargin, corridor.halfWidth - corridor.sideMargin),
    // The wave corridor continues as the rider advances; only its entrance is fixed.
    z: Math.min(z, room.north + margin),
  };
  const distance = (p) => (p.x - x) ** 2 + (p.z - z) ** 2;
  return distance(inRoom) <= distance(inCorridor) ? inRoom : inCorridor;
}

/**
 * Training boards in row order, south to north along the east wall.
 * `style` picks the board's colour scheme (see entities/TrainingBoard.js).
 * The three steel boards share one tier; their 5x is a placeholder value, so they float no banner (`banner: false`).
 */
// Sizes rank white 100x > purple 25x > blue 9x > gold 3x > steel; `height` scales the deck, rails and monitor stand.
export const BOOST_PADS = [
  { id: 'pad_9x', label: '9x Speed', multiplier: 9, style: 'blue', width: 3.4, length: 6.4, height: 1.1 },
  { id: 'pad_3x_a', label: '3x Speed', multiplier: 3, style: 'yellow', width: 3.1, length: 4.7, height: 0.95 },
  { id: 'pad_5x_a', label: '5x Speed', multiplier: 5, style: 'steel', width: 2.3, length: 3.7, height: 0.8, banner: false },
  { id: 'pad_5x_b', label: '5x Speed', multiplier: 5, style: 'steel', width: 2.3, length: 3.7, height: 0.8, banner: false },
  { id: 'pad_5x_c', label: '5x Speed', multiplier: 5, style: 'steel', width: 2.3, length: 3.7, height: 0.8, banner: false },
  { id: 'pad_3x_b', label: '3x Speed', multiplier: 3, style: 'yellow', width: 3.0, length: 4.5, height: 0.95 },
  { id: 'pad_25x', label: '25x Speed', multiplier: 25, style: 'purple', width: 6.1, length: 8.6, height: 1.35 },
  { id: 'pad_100x', label: '100x Speed', multiplier: 100, style: 'mono', width: 7.6, length: 9.6, height: 1.6 },
];

/**
 * The 13 bikes of the bike store. `tier` and `slot` place a bike in the
 * store (upper / lower level, left to right). A bike unlocks with `winsRequired`
 * or `finishesRequired`; `speed` is its ride speed and `color` its main tint
 * (`rideColor` overrides the tint of the rider's bike).
 */
export const BIKES = [
  // Lower level
  { id: 'bike_scooter', name: 'Starter Scooter', tier: 'lower', slot: 0, stepBonus: 1, winsRequired: 0, speed: 9, color: 0x3ed46b, rideColor: 0x1f6fe0 },
  { id: 'bike_trail', name: 'Trail Rider', tier: 'lower', slot: 1, stepBonus: 2, winsRequired: 5, speed: 9.5, color: 0x2a6fe0 },
  { id: 'bike_azure', name: 'Azure Cycle', tier: 'lower', slot: 2, stepBonus: 5, winsRequired: 40, speed: 10, color: 0x2a5fff },
  { id: 'bike_cruiser_red', name: 'Red Cruiser', tier: 'lower', slot: 3, stepBonus: 25, winsRequired: 250, speed: 11, color: 0xd8323c },
  { id: 'bike_cruiser_violet', name: 'Violet Cruiser', tier: 'lower', slot: 4, stepBonus: 50, winsRequired: 1500, speed: 12, color: 0x8b4fd0 },
  { id: 'bike_cyan_bolt', name: 'Cyan Bolt', tier: 'lower', slot: 5, stepBonus: 100, winsRequired: 7500, speed: 13, color: 0x1fbde0 },
  // Upper level: four win bikes, then the three Blood Moon finish bikes
  { id: 'bike_violet_racer', name: 'Violet Racer', tier: 'upper', slot: 0, stepBonus: 250, winsRequired: 30000, speed: 15, color: 0x8a4bd6 },
  { id: 'bike_gold_sprint', name: 'Gold Sprint', tier: 'upper', slot: 1, stepBonus: 500, winsRequired: 100000, speed: 17, color: 0xffc21a },
  { id: 'bike_blue_blitz', name: 'Blue Blitz', tier: 'upper', slot: 2, stepBonus: 1000, winsRequired: 300000, speed: 18, color: 0x2f9bff },
  { id: 'bike_pink_phantom', name: 'Pink Phantom', tier: 'upper', slot: 3, stepBonus: 2000, winsRequired: 750000, speed: 19, color: 0xe63a8f },
  { id: 'bike_bloodmoon_1', name: 'Blood Moon I', tier: 'upper', slot: 4, stepBonus: 150, finishesRequired: 1, speed: 14, color: 0xc0202e },
  { id: 'bike_bloodmoon_2', name: 'Blood Moon II', tier: 'upper', slot: 5, stepBonus: 450, finishesRequired: 15, speed: 16, color: 0xff4b6e },
  { id: 'bike_bloodmoon_3', name: 'Blood Moon III', tier: 'upper', slot: 6, stepBonus: 3000, finishesRequired: 150, speed: 20, color: 0xff2d3d },
];

/** Body colour of the light cycle a rider drives while this bike is equipped. */
export const rideColor = (bike) => bike?.rideColor ?? bike?.color;

export function isBikeUnlocked(bike, { wins = 0, finishes = 0 } = {}) {
  if (bike.finishesRequired !== undefined) return finishes >= bike.finishesRequired;
  return wins >= (bike.winsRequired ?? 0);
}

/** "+250/Step" */
export const stepText = (bike) => `+${bike.stepBonus.toLocaleString('en-US')}/Step`;

/** "10,000 Wins Required" / "1 Finish Required" */
export function requirementText(bike) {
  if (bike.finishesRequired !== undefined) {
    return `${bike.finishesRequired.toLocaleString('en-US')} ${bike.finishesRequired === 1 ? 'Finish' : 'Finishes'} Required`;
  }
  return `${bike.winsRequired.toLocaleString('en-US')} Wins Required`;
}

export const WORLD_GATES = [{ id: 'world_2', name: 'World 2', levelRequired: 75 }];

/** A big count kept short for labels and messages: 950, 1.2K, 18.7M, 3B, ... (one decimal, dropped when .0). */
export function formatShort(value) {
  const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
  let scaled = value;
  let unit = 0;
  while (unit < units.length - 1 && Math.round(Math.abs(scaled) * 10) / 10 >= 1000) {
    scaled /= 1000;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(/\.0$/, '');
  return `${text}${units[unit]}`;
}
