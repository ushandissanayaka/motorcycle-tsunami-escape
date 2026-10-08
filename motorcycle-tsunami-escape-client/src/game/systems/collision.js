/** Highest ledge a rider drives up onto without jumping. */
export const STEP_HEIGHT = 0.8;
/** Clearance a rider needs under a ceiling. */
export const RIDER_HEIGHT = 2.4;

/**
 * Axis-aligned solids in world space: { minX, maxX, minZ, maxZ, bottom, top }.
 * `top` is a number or (x, z) => height, which lets a ramp be one solid.
 * A rider is blocked by any solid whose top is above a step, unless there is
 * enough room under it (a floor slab at ceiling height is not an obstacle).
 *
 * `pits` are areas where the ground itself lies lower: { minX, maxX, minZ, maxZ, floor }.
 * Outside every pit the ground is at 0; inside one a rider with nothing under
 * them drops to `floor`. A pit's walls are ordinary solids reaching down to it.
 */
export function createCollision(solids = [], pits = [], surfaces = []) {
  const inside = (s, x, z, margin = 0) => (
    x >= s.minX - margin && x <= s.maxX + margin
    && z >= s.minZ - margin && z <= s.maxZ + margin
  );
  const topAt = (s, x, z) => (typeof s.top === 'function' ? s.top(x, z) : s.top);
  const groundAt = (x, z) => pits.find((p) => inside(p, x, z))?.floor ?? 0;

  return {
    solids,
    pits,
    surfaces,

    blocked(x, z, y) {
      return solids.some((s) => (
        inside(s, x, z, s.collisionMargin || 0)
        && s.bottom < y + RIDER_HEIGHT
        && topAt(s, x, z) > y + STEP_HEIGHT
      ));
    },

    /** Height of the surface a rider at (x, y, z) stands on. */
    supportAt(x, z, y) {
      let support = groundAt(x, z);
      for (const s of solids) {
        if (!inside(s, x, z)) continue;
        const top = topAt(s, x, z);
        if (top <= y + STEP_HEIGHT && top > support) support = top;
      }
      for (const surface of surfaces) {
        if (!inside(surface, x, z)) continue;
        const top = topAt(surface, x, z);
        if (top <= y + STEP_HEIGHT && top > support) support = top;
      }
      return support;
    },

    /** Pit under a world position, or null when the rider is exposed on a slab. */
    pitAt(x, z) {
      return pits.find((pit) => inside(pit, x, z)) ?? null;
    },
  };
}
