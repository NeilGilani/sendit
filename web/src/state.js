// Global game state, settings (localStorage) and a tiny event bus.
//
// Modes: the lobby is the first screen after loading. `Mode.LOBBY` is an alias of the historical
// `Mode.MENU` (same value), so older code that checks `Mode.MENU` keeps working unchanged.
export const Mode = { MENU: 0, LOBBY: 0, RIDING: 1, PAUSED: 2, LIFT: 3 };

// ---------------------------------------------------------------- event bus
// emit(name, detail) · on(name, fn) → unsubscribe() · once(name, fn) · off(name, fn)
// Events used across systems (see docs/lobby.md for payloads):
//   mode, settings, score, hint, rideStarted, rideEnded, runComplete,
//   profile, loadout, inputDevice, service
const bus = new EventTarget();
const wrapped = new WeakMap();   // fn → DOM listener, so off() works with the original callback
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export function on(name, fn) {
  const l = (e) => fn(e.detail);
  wrapped.set(fn, l);
  bus.addEventListener(name, l);
  return () => bus.removeEventListener(name, l);
}
export function off(name, fn) { const l = wrapped.get(fn); if (l) bus.removeEventListener(name, l); }
export function once(name, fn) {
  const l = (e) => fn(e.detail);
  bus.addEventListener(name, l, { once: true });
  return () => bus.removeEventListener(name, l);
}

export const game = {
  mode: Mode.MENU,
  score: 0,
  distance: 0,
  airTotal: 0,
  smoothTurns: 0,
  best: Number(safeGet('sendit.best') || 0),
};

export function setMode(m) {
  if (game.mode === m) return;
  game.mode = m;
  emit('mode', m);
}

export function addScore(label, points) {
  game.score += points;
  if (game.score > game.best) { game.best = game.score; safeSet('sendit.best', String(game.best)); }
  emit('score', { label, points });
}

export function resetScore() {
  game.score = 0; game.distance = 0; game.airTotal = 0; game.smoothTurns = 0;
}

/** The current ride's numbers (sent with `rideEnded`). */
export function scoreSnapshot() {
  return { score: game.score, distance: game.distance, airTotal: game.airTotal, smoothTurns: game.smoothTurns };
}

// ---------------------------------------------------------------- settings
// Stored under SETTINGS_KEY; the player profile links to this key (profile.links.settings).
export const SETTINGS_KEY = 'sendit.settings';
const DEFAULTS = { quality: 1, master: 0.8, music: 0.6, sfx: 0.8, mouseSens: 1.0, camSens: 1.0, snowfall: false };
export const settings = { ...DEFAULTS, ...safeParse(safeGet(SETTINGS_KEY)) };

export function setSetting(k, v) {
  settings[k] = v;
  safeSet(SETTINGS_KEY, JSON.stringify(settings));
  emit('settings', { key: k, value: v });
}

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
function safeGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode / quota */ } }
