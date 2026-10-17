// Case opening timeline and reel easing (pure: the opener and scripts/cases-timing.mjs share it).
// Seconds from the click. CS2's client (popup_capability_decodable) waits ~2 s for the case to open,
// then scrolls the reel for 6.0 s on cubic-bezier(0.075, 0.82, 0.165, 1) and reveals at the end
// (docs/rewards-research.md). We hold 0.6 s on the winner before the reveal.
export const TIMING = { caseIn: 0.0, lid: 1.0, reelIn: 1.6, spin: 2.0, spinDur: 6.0, hold: 0.6, tickGap: 0.055 };
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
