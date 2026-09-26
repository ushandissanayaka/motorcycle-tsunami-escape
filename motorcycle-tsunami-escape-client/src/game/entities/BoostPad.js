/** Rectangular overlap check against each training board's deck footprint
 * (`userData.halfSize`). `onEnter(multiplier)` wiring is up to the caller —
 * hook it to economy XP gain on the client's local state, or send a 'boost'
 * message to the server room if you want it authoritative. Swap for a physics
 * engine (cannon-es, rapier) once you have more than a handful of triggers. */
export function checkBoostPadOverlap(pads, playerPosition) {
  for (const pad of pads) {
    const { halfSize } = pad.userData;
    const dx = Math.abs(pad.position.x - playerPosition.x);
    const dz = Math.abs(pad.position.z - playerPosition.z);
    if (dx < halfSize.x && dz < halfSize.z) {
      return pad.userData;
    }
  }
  return null;
}
