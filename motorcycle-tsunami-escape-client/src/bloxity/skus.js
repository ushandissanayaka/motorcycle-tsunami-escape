// The Bux skus this game sells. Mirrors BUX_SKUS in the server's src/shared/gameData.js (its webhook grants
// each one), and every sku must also be in the Bloxity dev-portal catalog, which sets the prices: the client
// only ever passes a sku, never a price.
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

/** The premium training board sku for a multiplier (3, 9, 25 or 100), or null. */
export const treadmillSku = (multiplier) => BUX_SKUS[`TREADMILL_${multiplier}X`] ?? null;

/** Wins granted by a wins pack sku, or 0. */
export const winsPackAmount = (sku) => ({ [BUX_SKUS.WINS_50]: 50, [BUX_SKUS.WINS_500]: 500, [BUX_SKUS.WINS_5000]: 5000 }[sku] ?? 0);
