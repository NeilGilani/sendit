// Case opening timeline and reel easing (pure: the opener and scripts/cases-timing.mjs share it).
// Seconds from the click. CS2's client (popup_capability_decodable) waits ~2 s for the case to open,
// then scrolls the reel for 6.0 s on cubic-bezier(0.075, 0.82, 0.165, 1) and reveals at the end
// (docs/rewards-research.md). We hold 0.6 s on the winner before the reveal.
// The 3D crate (crate3d.js) fills CS2's wait with the physical moment: it lands (land), the two
// latches snap (latchL, latchR), the lid strains and bursts open (lid), then the reel slides in.
export const TIMING = { caseIn: 0.0, land: 0.42, latchL: 0.66, latchR: 0.9, lid: 1.38, reelIn: 1.95, spin: 2.25, spinDur: 6.0, hold: 0.6, tickGap: 0.055 };
/** Quick open (the toggle in the opener, and "Open all"): the same beats, about a third as long. */
export const TIMING_QUICK = { caseIn: 0.0, land: 0.22, latchL: 0.3, latchR: 0.38, lid: 0.52, reelIn: 0.72, spin: 0.85, spinDur: 2.4, hold: 0.3, tickGap: 0.05 };
/** CS2 reel easing (popup_capability_decodable.css): cubic-bezier(0.075, 0.82, 0.165, 1). */
export const REEL_EASE = [0.075, 0.82, 0.165, 1];

/** Evaluate a CSS cubic-bezier(x1, y1, x2, y2) at time t (0..1). */
export function cubicBezier([x1, y1, x2, y2], t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const bx = (s) => 3 * x1 * s * (1 - s) ** 2 + 3 * x2 * s * s * (1 - s) + s ** 3;
  const by = (s) => 3 * y1 * s * (1 - s) ** 2 + 3 * y2 * s * s * (1 - s) + s ** 3;
  let lo = 0, hi = 1, s = t;
  for (let i = 0; i < 30; i++) { s = (lo + hi) / 2; if (bx(s) < t) lo = s; else hi = s; }
  return by(s);
}
