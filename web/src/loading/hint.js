// Loading hint: a few facts the NEXT page load's loading screen should know before any game code runs.
// Written by main.js (the lobby) right before it reloads into another mountain, read by loading/index.js
// at the very start of that load (and passed to the worker). Plain JSON in localStorage, no imports.
//   { transition: true, at, mapId, mountain, region, trail, difficulty, accent,
//     gear: 'skis' | 'snowboard', gearModel, outfit: { slot: { garment, colorway, colors } } }
// `transition` marks "the player picked a mountain in the lobby": that load shows the player's own rider
// riding the picked mountain's light. A hint older than two minutes is treated as a plain boot.
export const LOAD_HINT_KEY = 'sendit.loadhint';
const MAX_AGE_MS = 120000;

export function writeLoadHint(hint) {
  try { localStorage.setItem(LOAD_HINT_KEY, JSON.stringify({ ...hint, at: Date.now() })); } catch { /* storage off */ }
}

/** The stored hint, with `transition` cleared when stale. Never throws. */
export function readLoadHint() {
  try {
    const h = JSON.parse(localStorage.getItem(LOAD_HINT_KEY) || 'null');
    if (!h || typeof h !== 'object') return null;
    if (!(Date.now() - (h.at || 0) < MAX_AGE_MS)) h.transition = false;
    return h;
  } catch { return null; }
}

/** The transition is consumed by the load that shows it (a later manual refresh is a plain boot). */
export function consumeTransition() {
  try {
    const h = JSON.parse(localStorage.getItem(LOAD_HINT_KEY) || 'null');
    if (h?.transition) { h.transition = false; localStorage.setItem(LOAD_HINT_KEY, JSON.stringify(h)); }
  } catch { /* ignore */ }
}
