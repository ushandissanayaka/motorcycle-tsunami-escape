/** Rectangular overlap check against each training board's deck footprint
 * (`userData.halfSize`). Returns the board data, including its speed multiplier. */
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
