// Bloxity's Bux mark for canvas-drawn labels in the 3D world (the same coin as ui/BuxIcon.jsx): three blue ring
// segments on a white disc with a dark outline. In the mark's own 100 x 100 box each segment runs from the
// outer circle (radius 40) to the inner one (radius 18); these are its arcs' end angles, in degrees.
const OUTER = [-84.26, 24.26];
const INNER = [17.15, -77.16];
const DEG = Math.PI / 180;

/** Draws the Bux coin centred at (cx, cy), `radius` to the outside of its outline. */
export function drawBuxCoin(ctx, cx, cy, radius) {
  ctx.save();
  ctx.fillStyle = '#121214';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fill();
  const disc = radius * 0.8;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, cy, disc, 0, Math.PI * 2);
  ctx.fill();
  // The mark fills the disc as it does in BuxIcon's coin (scaled 0.8 about the centre of a radius-40 disc).
  const outer = disc * 0.8;
  const inner = outer * (18 / 40);
  ctx.fillStyle = '#0080FF';
  for (const turn of [0, 120, 240]) {
    ctx.beginPath();
    ctx.arc(cx, cy, outer, (OUTER[0] + turn) * DEG, (OUTER[1] + turn) * DEG);
    ctx.arc(cx, cy, inner, (INNER[0] + turn) * DEG, (INNER[1] + turn) * DEG, true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
