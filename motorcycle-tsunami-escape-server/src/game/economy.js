import { speedForLevel, xpToNextLevel } from '../shared/gameData.js';

// Applies XP gain (e.g. from standing on a boost pad each tick) and
// returns the updated stat block plus whether a level-up happened,
// so the caller can push a "Level Up!" event to the client.
export function applyXP(profile, xpGain) {
  let { level, levelXP } = profile;
  levelXP += xpGain;

  let leveledUp = false;
  let needed = xpToNextLevel(level);

  while (levelXP >= needed) {
    levelXP -= needed;
    level += 1;
    leveledUp = true;
    needed = xpToNextLevel(level);
  }

  const speed = speedForLevel(level);

  return {
    ...profile,
    level,
    levelXP,
    speed,
    leveledUp,
    xpToNext: needed,
  };
}

export function recordWin(profile, count = 1) {
  return { ...profile, wins: profile.wins + count };
}
