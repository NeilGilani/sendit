// Global game state, settings (localStorage) and a tiny event bus.
export const Mode = { MENU: 0, RIDING: 1, PAUSED: 2, LIFT: 3 };

const bus = new EventTarget();
export const emit = (name, detail) => bus.dispatchEvent(new CustomEvent(name, { detail }));
export const on = (name, fn) => bus.addEventListener(name, (e) => fn(e.detail));

export const game = {
  mode: Mode.MENU,
  score: 0,
  distance: 0,
  airTotal: 0,
  smoothTurns: 0,
  best: Number(localStorage.getItem('sendit.best') || 0),
};

export function setMode(m) {
  if (game.mode === m) return;
  game.mode = m;
  emit('mode', m);
}

export function addScore(label, points) {
  game.score += points;
  if (game.score > game.best) { game.best = game.score; localStorage.setItem('sendit.best', String(game.best)); }
  emit('score', { label, points });
}

export function resetScore() {
  game.score = 0; game.distance = 0; game.airTotal = 0; game.smoothTurns = 0;
}

const DEFAULTS = { quality: 1, master: 0.8, music: 0.6, sfx: 0.8, mouseSens: 1.0, camSens: 1.0, snowfall: false };
export const settings = { ...DEFAULTS, ...safeParse(localStorage.getItem('sendit.settings')) };

export function setSetting(k, v) {
  settings[k] = v;
  try { localStorage.setItem('sendit.settings', JSON.stringify(settings)); } catch { /* private mode */ }
  emit('settings', { key: k, value: v });
}

function safeParse(s) { try { return JSON.parse(s) || {}; } catch { return {}; } }
