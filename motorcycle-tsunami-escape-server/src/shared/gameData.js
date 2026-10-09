// SINGLE SOURCE OF TRUTH for every price, multiplier, and requirement.
// The client's src/shared/constants.js mirrors this file's shape exactly.
// If you split into a real monorepo with shared tooling later, import this
// directly from the client instead of duplicating it.

// Training boards in row order (south to north). The three steel boards share
// one tier; their 5x is a placeholder value.
export const BOOST_PADS = [
  { id: 'pad_9x', label: '9x Speed', multiplier: 9, order: 1 },
  { id: 'pad_3x_a', label: '3x Speed', multiplier: 3, order: 2 },
  { id: 'pad_5x_a', label: '5x Speed', multiplier: 5, order: 3 },
  { id: 'pad_5x_b', label: '5x Speed', multiplier: 5, order: 4 },
  { id: 'pad_5x_c', label: '5x Speed', multiplier: 5, order: 5 },
  { id: 'pad_3x_b', label: '3x Speed', multiplier: 3, order: 6 },
  { id: 'pad_25x', label: '25x Speed', multiplier: 25, order: 7 },
  { id: 'pad_100x', label: '100x Speed', multiplier: 100, order: 8 },
];

// Bike store bikes; mirrors the client's BIKES (ids, step bonuses, requirements).
export const BIKES = [
  { id: 'bike_scooter', name: 'Starter Scooter', stepBonus: 1, winsRequired: 0, sku: null },
  { id: 'bike_trail', name: 'Trail Rider', stepBonus: 2, winsRequired: 5, sku: null },
  { id: 'bike_azure', name: 'Azure Cycle', stepBonus: 5, winsRequired: 40, sku: null },
  { id: 'bike_cruiser_red', name: 'Red Cruiser', stepBonus: 25, winsRequired: 250, sku: null },
  { id: 'bike_cruiser_violet', name: 'Violet Cruiser', stepBonus: 50, winsRequired: 1500, sku: null },
  { id: 'bike_cyan_bolt', name: 'Cyan Bolt', stepBonus: 100, winsRequired: 7500, sku: null },
  { id: 'bike_violet_racer', name: 'Violet Racer', stepBonus: 250, winsRequired: 30000, sku: null },
  { id: 'bike_gold_sprint', name: 'Gold Sprint', stepBonus: 500, winsRequired: 100000, sku: null },
  { id: 'bike_blue_blitz', name: 'Blue Blitz', stepBonus: 1000, winsRequired: 300000, sku: null },
  { id: 'bike_pink_phantom', name: 'Pink Phantom', stepBonus: 2000, winsRequired: 750000, sku: null },
  { id: 'bike_bloodmoon_1', name: 'Blood Moon I', stepBonus: 150, finishesRequired: 1, sku: null },
  { id: 'bike_bloodmoon_2', name: 'Blood Moon II', stepBonus: 450, finishesRequired: 15, sku: null },
  { id: 'bike_bloodmoon_3', name: 'Blood Moon III', stepBonus: 3000, finishesRequired: 150, sku: null },
  {
    id: 'bike_astralwing',
    name: 'Astralwing Bike',
    stepBonus: 500,
    limitedStock: 2500,
    priceBux: 999,
    sku: 'bike_astralwing',
  },
  {
    id: 'bike_aetherune',
    name: 'Aetherune Bike',
    stepBonus: 300,
    limited: true,
    priceBux: 699,
    sku: 'bike_aetherune',
  },
];

// Bux skus — prices are set in the Bloxity dev-portal IAP catalog, NOT here.
// This list is just which skus your client is allowed to request.
// The client's src/bloxity/skus.js mirrors this list; every sku must also exist in the dev-portal catalog.
export const BUX_SKUS = {
  DISABLE_WAVES: 'disable_waves',
  BOOST_2X_SPEED: 'boost_2x_speed',
  BOOST_2X_WINS: 'boost_2x_wins',
  VIP_PASS: 'vip_pass',
  BIKE_ASTRALWING: 'bike_astralwing',
  BIKE_AETHERUNE: 'bike_aetherune',
  TELEPORT_BACK: 'teleport_back',
  TREADMILL_3X: 'treadmill_3x',
  TREADMILL_9X: 'treadmill_9x',
  TREADMILL_25X: 'treadmill_25x',
  TREADMILL_100X: 'treadmill_100x',
  WINS_50: 'wins_50',
  WINS_500: 'wins_500',
  WINS_5000: 'wins_5000',
};

// Soft-currency (the ◉ icon) prices — these ARE yours to define since it's
// your own in-game currency, not real money.
export const SOFT_CURRENCY_PRICES = {
  boost_2x_wins: 129,
  boost_2x_speed_gems: 3,
};

export const WORLD_GATES = [
  { id: 'world_2', name: 'World 2', levelRequired: 75 },
];

// Level -> speed-gain curve. Tune freely; keep client + server in lockstep.
export function speedForLevel(level) {
  return Math.round(10 * level * (level + 1));
}

export function xpToNextLevel(level) {
  return Math.round(60 + level * 8.5);
}
