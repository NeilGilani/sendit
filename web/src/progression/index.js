// Player progression: XP and levels, three daily challenges, achievements, personal bests
// (docs/game-feel.md § Progression). Stored under localStorage 'sendit.progression' (core.js).
//
// Public API (for the lobby, reward cases, anything else):
//   progression.getLevel()            → number
//   progression.getXP()               → lifetime XP
//   progression.getProgress()         → { level, into, need, xp, rank: { name, color } }
//   progression.getChallenges()       → today's three dailies [{ id, slot, title, desc, goal, value, done, xp, unit? }]
//   progression.rerollChallenge(slot) → the new challenge, or null (one free reroll per day)
//   progression.rerollsLeft()         → number
//   progression.dailyBonusLeft()      → bonus XP still to double today (the first XP_SOURCES.dailyBonus ridden XP count ×2)
//   progression.getWeekly()           → this week's challenge { id, title, desc, goal, value, done, xp, unit? }
//   progression.getAchievements()     → [{ id, title, desc, xp, icon, unlocked (ms or 0) }]
//   progression.getPersonalBests(mapId) → { score, air, spin, kmh, combo }
//   progression.getTrickBook()        → [{ name, n }] every trick / rail combo landed clean, with counts
//   progression.addXP(amount, reason) → XP actually added
//   progression.onLevelUp(fn)         → unsubscribe; fn({ level, prev, rank, rankUp })
//   progression.onAchievement(fn)     → unsubscribe; fn({ id, title, desc, xp, icon })
//   progression.onChallengeDone(fn)   → unsubscribe; fn({ challenge })
//   progression.onXP(fn)              → unsubscribe; fn({ gained, reason, xp, level, into, need })
// Bus events (state.js): progressXp, juiceLevelUp, achievement, challengeDone, dailySweep, personalBest.
import { on, emit, game, Mode } from '../state.js';
import { Progression, levelFor } from './core.js';

export * from './core.js';

const localStore = {
  get(k) { try { const s = globalThis.localStorage?.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* private mode / quota */ } },
};

const BUS = { cleanRun: 'cleanRun', weeklyDone: 'weeklyDone', newTrick: 'newTrick', xp: 'progressXp', levelUp: 'juiceLevelUp', achievement: 'achievement', challengeDone: 'challengeDone', dailySweep: 'dailySweep', challengeProgress: 'challengeProgress', personalBest: 'personalBest' };
const listeners = new Map();   // core event → Set(fn)
function fire(name, detail) {
  for (const fn of listeners.get(name) || []) { try { fn(detail); } catch (e) { console.error('[progression] listener', e); } }
  emit(BUS[name] || name, detail);
}
const subscribe = (name, fn) => { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return () => listeners.get(name).delete(fn); };

let core = null;
const C = () => (core ||= new Progression({ storage: localStore, emit: fire }));

export const progression = {
  get core() { return C(); },
  getLevel: () => C().level,
  getXP: () => C().state.xp,
  getProgress: () => C().progress(),
  getChallenges: () => C().challenges(),
  rerollChallenge: (slot) => C().reroll(slot),
  rerollsLeft: () => C().ensureDay().rerollsLeft,
  dailyBonusLeft: () => C().ensureDay().bonusLeft,
  getWeekly: () => C().weekly(),
  getAchievements: () => C().achievements(),
  getPersonalBests: (mapId) => C().pbs(mapId),
  getTrickBook: () => C().trickBook(),
  addXP: (n, reason) => C().addXP(n, reason),
  onLevelUp: (fn) => subscribe('levelUp', fn),
  onAchievement: (fn) => subscribe('achievement', fn),
  onChallengeDone: (fn) => subscribe('challengeDone', fn),
  onXP: (fn) => subscribe('xp', fn),
  levelFor,
};

/**
 * Feed the progression from ride events on the bus. `player` (speed for the top-speed stat),
 * `getMapId()` for per-map challenges and PBs. Returns an update(dt) to call per frame.
 */
export function trackProgression({ player, getMapId }) {
  const P = C();
  if (typeof window !== 'undefined') window.__progression = progression;   // debug / screenshot handle
  let lastDist = 0, speedT = 0, open = false;
  const start = () => { if (open) P.endRide(); P.startRide(getMapId()); open = true; lastDist = game.distance || 0; };
  const end = () => { if (!open) return null; open = false; return P.endRide(); };
  on('rideStarted', start);
  // First rides: one line on how XP works (the trick tips and drop-zone hints come earlier).
  let hintT = 0;
  on('rideEnded', () => clearTimeout(hintT));
  on('rideStarted', () => {
    clearTimeout(hintT);
    if (P.state.life.rides >= 2) return;
    hintT = setTimeout(() => { if (open && game.mode === Mode.RIDING) emit('hint', "Tricks, combos, close shaves and dailies all earn XP · level up in the lobby's Progress tab"); }, 15000);
  });
  on('rideEnded', () => { const s = end(); if (s) emit('progressRideSummary', s); });
  on('score', ({ points }) => { if (open) P.recordScore(points); });
  on('landed', (e) => {
    if (!open || e.result === 'crash') return;
    const spin = Number((String(e.trick || '').match(/(\d{3,4})(?!\s*m)/) || [])[1] || 0);
    const flips = /double|triple/i.test(e.trick || '') ? (/triple/i.test(e.trick) ? 3 : 2) : /flip|cork|misty|rodeo|wildcat|tamedog/i.test(e.trick || '') ? 1 : 0;
    const grade = !e.clean ? 'sketchy' : e.grade === 'stomped' || e.perfect ? 'stomped' : 'clean';
    P.recordLanding({ clean: e.clean, trick: e.trick, air: e.air > 0.35 ? e.air : 0, grade, spin, flips, points: e.points || 0 });
  });
  on('grindScore', ({ label }) => { if (open) { P.state.life.tricks++; P.bump('tricks'); if (!/^Sketchy/.test(label || '')) P.recordTrickName(label); } });
  on('grindEnd', ({ dist, reason }) => { if (open && reason !== 'bail') P.recordGrind(dist || 0); });
  on('nearMiss', () => { if (open) P.recordNearMiss(); });
  on('juiceWipeout', ({ tumble, speed }) => { if (!open) return; const xp = P.recordWipeout(tumble, speed); if (xp) emit('progressWipeout', { tumble, xp }); });
  on('juiceComboBanked', ({ mult, bonus }) => { if (open) P.recordCombo(mult, bonus); });
  on('runFinished', ({ medal }) => { P.recordMedal(medal); P.finishRun(); });
  on('runComplete', () => P.finishRun());   // Zen: the finish line
  on('resetTop', () => P.startRun());
  on('activity', () => P.startRun());       // a Challenge (re)start
  on('crashed', () => P.crashInRun());
  globalThis.addEventListener?.('pagehide', () => { if (open) end(); P.save(); });
  globalThis.document?.addEventListener?.('visibilitychange', () => { if (document.visibilityState === 'hidden') P.save(); });   // flush batched in-ride writes
  return function update(dt) {
    if (!open || game.mode !== Mode.RIDING) return;
    const d = game.distance || 0;
    if (d < lastDist) lastDist = d;   // the score reset on a new ride
    if (d - lastDist > 5) { P.recordDistance(d - lastDist); lastDist = d; }
    speedT -= dt;
    if (speedT <= 0) { speedT = 0.25; P.recordSpeed((player.speed || 0) * 3.6); }
  };
}
