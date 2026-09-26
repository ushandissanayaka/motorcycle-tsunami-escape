/**
 * Sample rows for the two Global Leaderboards.
 *
 * When the game becomes multiplayer, the riders on the platform are what these boards should list:
 * feed them in with `world.leaderboards.setEntries('speed' | 'wins', rows)`, best rider first.
 * A row is `{ name, value, avatar? }`: `value` is the text shown on the right (already formatted, for
 * example "1.74Qa"), and `avatar` is an index into src/assets/leaderboard/avatars.png (0-19).
 * Rows without an avatar get a generated one.
 */
export const SAMPLE_SPEED = [
  { name: 'MonetteQc', value: '1.74Qa', avatar: 0 },
  { name: 'Bosser858', value: '1.38Qa', avatar: 1 },
  { name: 'Monstertruckpupu', value: '552.18T', avatar: 2 },
  { name: 'LeviOG15', value: '442.5T', avatar: 3 },
  { name: 'Vuxest', value: '334.27T', avatar: 4 },
  { name: 'Tomwheel_17', value: '326.19T', avatar: 5 },
  { name: 'Keion_henderson', value: '291.6T', avatar: 6 },
  { name: 'arcan3eee', value: '272.45T', avatar: 7 },
  { name: 'CringeKing3596', value: '248.52T', avatar: 8 },
  { name: 'Papa64743', value: '212.2T', avatar: 9 },
  { name: 'Nova_Rider', value: '198.4T' },
  { name: 'TurboKid77', value: '187.06T' },
  { name: 'SkyDash', value: '171.9T' },
  { name: 'PixelPanda', value: '160.33T' },
  { name: 'BlazeFury_9', value: '148.7T' },
  { name: 'NightOwl_X', value: '139.12T' },
  { name: 'MightyMoe', value: '127.5T' },
  { name: 'RocketRosa', value: '118.84T' },
  { name: 'CrimsonFox', value: '104.6T' },
  { name: 'DriftKing99', value: '96.21T' },
  { name: 'LuckyLuca', value: '88.05T' },
  { name: 'ThunderPaw', value: '79.4T' },
  { name: 'CosmicCat', value: '71.66T' },
  { name: 'BoltBaron', value: '64.2T' },
  { name: 'StarSprint', value: '57.93T' },
];

export const SAMPLE_WINS = [
  { name: 'bob654jone321', value: '8.79B', avatar: 10 },
  { name: 'yuichiiyo', value: '3.63B', avatar: 11 },
  { name: 'RivalsPro28199', value: '2.71B', avatar: 12 },
  { name: 'BABAYO_6769', value: '2.42B', avatar: 13 },
  { name: 'Potato_ball3', value: '1.4B', avatar: 14 },
  { name: 'ivanx733', value: '1.18B', avatar: 15 },
  { name: 'gustavo873532', value: '743.23M', avatar: 16 },
  { name: 'Aletumuerte24', value: '657.28M', avatar: 17 },
  { name: 'efgfgfg09', value: '582.65M', avatar: 18 },
  { name: 'poko6954', value: '554.1M', avatar: 19 },
  { name: 'JetJoey', value: '498.7M' },
  { name: 'IceBreaker7', value: '461.2M' },
  { name: 'MangoMax', value: '420.55M' },
  { name: 'QuickSilver', value: '388.9M' },
  { name: 'Zoomer2010', value: '351.04M' },
  { name: 'SkyDash', value: '322.6M' },
  { name: 'PixelPanda', value: '297.31M' },
  { name: 'RocketRosa', value: '268.8M' },
  { name: 'CrimsonFox', value: '241.15M' },
  { name: 'LuckyLuca', value: '219.7M' },
  { name: 'ThunderPaw', value: '196.42M' },
  { name: 'CosmicCat', value: '174.9M' },
  { name: 'BoltBaron', value: '152.33M' },
  { name: 'StarSprint', value: '131.8M' },
  { name: 'NightOwl_X', value: '109.6M' },
];
