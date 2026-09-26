/** Highest ledge a rider drives up onto without jumping. */
export const STEP_HEIGHT = 0.8;
/** Clearance a rider needs under a ceiling. */
export const RIDER_HEIGHT = 2.4;

/**
 * Axis-aligned solids in world space: { minX, maxX, minZ, maxZ, bottom, top }.
 * `top` is a number or (x, z) => height, which lets a ramp be one solid.
 * A rider is blocked by any solid whose top is above a step, unless there is
 * enough room under it (a floor slab at ceiling height is not an obstacle).
 */
export function createCollision(solids = []) {
  const inside = (s, x, z) => x >= s.minX && x <= s.maxX && z >= s.minZ && z <= s.maxZ;
  const topAt = (s, x, z) => (typeof s.top === 'function' ? s.top(x, z) : s.top);

  return {
    solids,

    blocked(x, z, y) {
      return solids.some((s) => inside(s, x, z) && s.bottom < y + RIDER_HEIGHT && topAt(s, x, z) > y + STEP_HEIGHT);
    },

    /** Height of the surface a rider at (x, y, z) stands on. */
    supportAt(x, z, y) {
      let support = 0;
      for (const s of solids) {
        if (!inside(s, x, z)) continue;
        const top = topAt(s, x, z);
        if (top <= y + STEP_HEIGHT && top > support) support = top;
      }
      return support;
    },
  };
}
