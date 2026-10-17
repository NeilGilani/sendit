// The case opening, frame by frame at 60 fps (no browser): reel position in cards, speed, which card
// is under the marker and when the ticks fire, from the same timeline and easing the opener uses.
// Usage: node scripts/cases-timing.mjs [cards travelled=48.5] [every=6]   (prints a table + a summary)
import { TIMING, REEL_EASE, cubicBezier } from '../src/lobby/cases/timing.js';

const D = Number(process.argv[2] || 48.5);       // cards from the start position to the stop point
const every = Number(process.argv[3] || 6);      // print every n-th frame
const fps = 60;
let lastCell = 0, lastTick = -1, ticks = [];
const rows = [];
for (let f = 0; f <= (TIMING.spin + TIMING.spinDur + TIMING.hold) * fps; f++) {
  const t = f / fps;
  const k = Math.min(1, Math.max(0, (t - TIMING.spin) / TIMING.spinDur));
  const x = D * cubicBezier(REEL_EASE, k);
  const k2 = Math.min(1, Math.max(0, (t + 1 / fps - TIMING.spin) / TIMING.spinDur));
  const v = (D * cubicBezier(REEL_EASE, k2) - x) * fps;
  const cell = Math.floor(x + 0.5);
  if (cell !== lastCell) { if (t - lastTick >= TIMING.tickGap) { ticks.push(t); lastTick = t; } lastCell = cell; }
  const phase = t < TIMING.lid ? 'case drops in, rattles' : t < TIMING.reelIn ? 'lid flips, light' : t < TIMING.spin ? 'case lifts, reel in' : k < 1 ? 'reel' : 'hold on winner';
  rows.push({ f, t, x, v, cell, phase });
}
console.log('frame   t(s)   cards   cards/s  under marker  phase');
for (const r of rows) if (r.f % every === 0 || r.f === rows.length - 1) console.log(`${String(r.f).padStart(5)}  ${r.t.toFixed(2).padStart(5)}  ${r.x.toFixed(2).padStart(6)}  ${r.v.toFixed(1).padStart(7)}  ${String(r.cell).padStart(6)}        ${r.phase}`);
const at = (s) => D * cubicBezier(REEL_EASE, s / TIMING.spinDur);
console.log(`\nspin ${TIMING.spinDur} s over ${D} cards: ${(at(1) / D * 100).toFixed(0)} % after 1 s, ${(at(2) / D * 100).toFixed(0)} % after 2 s, ${(at(4) / D * 100).toFixed(1)} % after 4 s, last card change at ${rows.filter((r, i) => i && r.cell !== rows[i - 1].cell).at(-1).t.toFixed(2)} s`);
const gaps = ticks.slice(1).map((t, i) => t - ticks[i]);
console.log(`ticks: ${ticks.length}; first gap ${(gaps[0] * 1000).toFixed(0)} ms, last gaps ${gaps.slice(-4).map((g) => (g * 1000).toFixed(0)).join(', ')} ms; last tick at ${ticks.at(-1).toFixed(2)} s`);
