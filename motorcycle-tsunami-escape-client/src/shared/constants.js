// Each level needs 50 more speed progress than the previous level.
const LEVEL_BASE = 1000;

/** Speed progress needed per level: 1000, 1050, 1100, 1150, ... */
export function levelTarget(level) {
  return LEVEL_BASE + (level - 1) * 50;
}

/**
 * How many levels `levelProgress + earnedSpeed` clears from `riderLevel`, and what's left over in the
 * new level's own (bigger) bar. Levels needed for a jump of `n` grow with n², so a single very large
 * grant (a speed pack, a long AFK stretch, a big debug/testing bonus) could ask the equivalent of a
 * one-level-at-a-time loop for millions of iterations — this solves the same arithmetic-series sum in
 * closed form instead, so the cost stays flat no matter how big the jump is. `levelTarget` is a plain
 * arithmetic sequence (LEVEL_BASE + 50 per level up), so the levels-gained count is the positive root of
 * a quadratic; a small integer correction afterwards guards against floating-point rounding at the edge.
 */
export function applyLevelProgress(levelProgress, earnedSpeed, riderLevel) {
  const total = levelProgress + earnedSpeed;
  const b = levelTarget(riderLevel) - 25; // from expanding the sum below: sum_{k=0}^{n-1} levelTarget(riderLevel+k) = b*n + 25n²
  const sumOf = (n) => n * b + 25 * n * n; // sum_{k=0}^{n-1} levelTarget(riderLevel + k)
  let levelsGained = Math.max(0, Math.floor((-b + Math.sqrt(b * b + 100 * total)) / 50));
  while (levelsGained > 0 && sumOf(levelsGained) > total) levelsGained -= 1;
  while (sumOf(levelsGained + 1) <= total) levelsGained += 1;
  return { levelsGained, levelProgress: total - sumOf(levelsGained) };
}

/**
 * The wave place: black slabs level with the road, separated by deep grey pits.
 * Every pit is `gapGrowth` longer than the one before it, so the jumps get harder,
 * and every slab is `slabGrowth` longer than the one before it, so the pits get
 * further apart. `pitDepth` is more than a bike can drive up out of, but a jump clears it.
 */
// Pits drop below the tsunami's ground-level base, leaving room for the rider
// and bike to shelter underneath it while it crosses the track.
// 2.8 units puts the pit floor below the 2.4-unit rider head height, with
// extra clearance so a rider tucked into a gap stays under the tsunami.
// The first pit (6) is wide enough for a starter bike to drop into: a rider falls past the far lip in ~0.32 s,
// i.e. after 3-4 units at starter speed. Pits then widen by 2 and slabs lengthen by 4 per step
// (8th pit ~20, 8th slab ~48).
export const WAVE_TRACK = { slabs: 8, slabLength: 20, slabGrowth: 4, firstGap: 6, gapGrowth: 2, pitDepth: 2.8 };

/** Length of the whole wave place, first slab to last. */
export function waveTrackLength({ slabs, slabLength, slabGrowth, firstGap, gapGrowth }) {
  const sum = (count, f) => Array.from({ length: count }, (_, i) => f(i)).reduce((a, b) => a + b, 0);
  return sum(slabs, (i) => slabLength + slabGrowth * i) + sum(slabs - 1, (i) => firstGap + gapGrowth * i);
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
 * The three steel boards share one tier; their 5x is a placeholder value.
 */
// Sizes rank white 100x > purple 25x > blue 9x > gold 3x > steel; `height` scales the deck, rails and monitor stand.
export const BOOST_PADS = [
  { id: 'pad_9x', label: '9x Speed', multiplier: 9, style: 'blue', width: 3.4, length: 6.4, height: 1.1 },
  { id: 'pad_3x_a', label: '3x Speed', multiplier: 3, style: 'yellow', width: 3.1, length: 4.7, height: 0.95 },
  { id: 'pad_5x_a', label: '5x Speed', multiplier: 5, style: 'steel', width: 2.3, length: 3.7, height: 0.8 },
  { id: 'pad_5x_b', label: '5x Speed', multiplier: 5, style: 'steel', width: 2.3, length: 3.7, height: 0.8 },
  { id: 'pad_5x_c', label: '5x Speed', multiplier: 5, style: 'steel', width: 2.3, length: 3.7, height: 0.8 },
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
  { id: 'bike_trail', name: 'Trail Rider', tier: 'lower', slot: 1, stepBonus: 2, winsRequired: 3, speed: 9.5, color: 0x2a6fe0 },
  { id: 'bike_azure', name: 'Azure Cycle', tier: 'lower', slot: 2, stepBonus: 5, winsRequired: 15, speed: 10, color: 0x2a5fff },
  { id: 'bike_cruiser_red', name: 'Red Cruiser', tier: 'lower', slot: 3, stepBonus: 25, winsRequired: 100, speed: 11, color: 0xd8323c },
  { id: 'bike_cruiser_violet', name: 'Violet Cruiser', tier: 'lower', slot: 4, stepBonus: 50, winsRequired: 500, speed: 12, color: 0x8b4fd0 },
  { id: 'bike_cyan_bolt', name: 'Cyan Bolt', tier: 'lower', slot: 5, stepBonus: 100, winsRequired: 2500, speed: 13, color: 0x1fbde0 },
  // Upper level: four win bikes, then the three Blood Moon finish bikes
  { id: 'bike_violet_racer', name: 'Violet Racer', tier: 'upper', slot: 0, stepBonus: 250, winsRequired: 10000, speed: 15, color: 0x8a4bd6 },
  { id: 'bike_gold_sprint', name: 'Gold Sprint', tier: 'upper', slot: 1, stepBonus: 500, winsRequired: 35000, speed: 17, color: 0xffc21a },
  { id: 'bike_blue_blitz', name: 'Blue Blitz', tier: 'upper', slot: 2, stepBonus: 1000, winsRequired: 100000, speed: 18, color: 0x2f9bff },
  { id: 'bike_pink_phantom', name: 'Pink Phantom', tier: 'upper', slot: 3, stepBonus: 2000, winsRequired: 250000, speed: 19, color: 0xe63a8f },
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
