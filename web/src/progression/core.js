// Progression core (pure, headless): XP and levels, daily challenges, achievements, personal bests.
// Persistence goes through an injected storage { get(key), set(key, value) } under PROGRESSION_KEY;
// the clock is injectable too (tests). The public API lives in progression/index.js.
//
// XP curve: XP from level L to L+1 = round(XP_CURVE.base · L^XP_CURVE.exp), level cap XP_CURVE.max.
// XP sources (XP_SOURCES): style points, distance, finished rides, challenges, achievements.

export const PROGRESSION_KEY = 'sendit.progression';
export const PROGRESSION_VERSION = 1;

export const XP_CURVE = { base: 260, exp: 1.45, max: 99 };
export const XP_SOURCES = {
  perPoint: 0.1,          // XP per style point scored
  perKm: 60,              // XP per km ridden
  ride: 40,               // a ride of at least rideMinM metres
  rideMinM: 300,
  allDailies: 300,        // bonus for finishing all three dailies of a day
  newTrick: 40,           // first time a trick (or rail combo) lands clean
};

export const RANKS = [
  { from: 1, name: 'Rookie', color: '#7fd8ff' },
  { from: 5, name: 'Shredder', color: '#2ff5d6' },
  { from: 10, name: 'Ripper', color: '#7a5cff' },
  { from: 20, name: 'Pro', color: '#ff5fb0' },
  { from: 35, name: 'Legend', color: '#ffe14d' },
  { from: 60, name: 'Mountain God', color: '#ff9a3d' },
];

export const xpToNext = (level) => Math.round(XP_CURVE.base * Math.pow(Math.max(1, level), XP_CURVE.exp));

/** { level, into, need } for a lifetime XP total. */
export function levelFor(xp) {
  let level = 1, left = Math.max(0, Math.floor(xp || 0));
  while (level < XP_CURVE.max && left >= xpToNext(level)) { left -= xpToNext(level); level++; }
  return { level, into: left, need: level >= XP_CURVE.max ? 0 : xpToNext(level) };
}

/** Lifetime XP needed to reach `level`. */
export function xpForLevel(level) { let t = 0; for (let l = 1; l < level; l++) t += xpToNext(l); return t; }

export function rankFor(level) { let r = RANKS[0]; for (const k of RANKS) if (level >= k.from) r = k; return r; }

// ---------------------------------------------------------------- dailies
// A template makes a challenge from a seeded random number. `stat` is the counter it reads (see
// Progression.record*), `scope` 'ride' resets every ride (one-ride goals), 'day' accumulates all day.
const MAPS = { 'valcrest-gully': 'Valcrest', blackspruce: 'Blackspruce', ravenspire: 'Ravenspire', 'voltage-park': 'Voltage Park' };
export const CHALLENGE_POOL = [
  { cat: 'spin', make: (r) => { const g = pick(r, [540, 720, 900]); return { stat: `spin${g}`, goal: 1, title: `Land a ${g}`, desc: `Any spin of ${g}° or more, landed clean`, xp: g >= 900 ? 450 : g >= 720 ? 320 : 220 }; } },
  { cat: 'flip', make: (r) => { const g = pick(r, [1, 3, 5]); return { stat: 'flips', goal: g, title: g === 1 ? 'Land a flip' : `Land ${g} flips`, desc: 'Backflips, frontflips, corks, rodeos…', xp: 180 + g * 50 }; } },
  { cat: 'near', make: (r) => {
    const g = pick(r, [20, 35, 50]);
    const map = r() < 0.5 ? 'blackspruce' : null;
    return { stat: map ? `near@${map}` : 'near', goal: g, title: `${g} close shaves${map ? ` in ${MAPS[map]}` : ''}`, desc: 'Skim trees and rocks at speed', xp: 160 + g * 4 + (map ? 60 : 0) };
  } },
  { cat: 'distance', make: (r) => { const g = pick(r, [3, 5, 8]); return { stat: 'meters', goal: g * 1000, title: `Ride ${g} km`, desc: 'Any map, any mode', xp: 120 + g * 30, unit: 'km' }; } },
  { cat: 'air', make: (r) => { const g = pick(r, [30, 45, 60]); return { stat: 'air', goal: g, title: `${g} s of air`, desc: 'Total hang time today', xp: 150 + g * 3, unit: 's' }; } },
  { cat: 'combo', make: (r) => { const g = pick(r, [2.5, 3, 4]); return { stat: `combo${g}`, goal: 1, title: `Bank a ×${g} combo`, desc: 'Chain different tricks, rails and close shaves, then ride it out', xp: Math.round(160 + g * 70) }; } },
  { cat: 'stomp', make: (r) => { const g = pick(r, [3, 5, 8]); return { stat: 'stomps', goal: g, title: `Stomp ${g} landings`, desc: 'PERFECT or STOMPED grades', xp: 140 + g * 25 }; } },
  { cat: 'speed', make: (r) => { const g = pick(r, [55, 70, 85]); return { stat: `kmh${g}`, goal: 1, title: `Hit ${g} km/h`, desc: g > 55 ? 'Tuck down the big steeps (Ravenspire, Blackspruce)' : 'Tuck and hold a straight line', xp: 120 + (g - 55) * 6 }; } },
  { cat: 'score', make: (r) => { const g = pick(r, [3000, 6000, 10000]); return { stat: 'rideScore', goal: g, title: `Score ${fmt(g)} in one ride`, desc: 'Style points, one ride', xp: 160 + g / 40, scope: 'ride' }; } },
  { cat: 'tricks', make: (r) => { const g = pick(r, [10, 20, 30]); return { stat: 'tricks', goal: g, title: `Land ${g} tricks`, desc: 'Spins, flips, grabs and rails', xp: 120 + g * 6 }; } },
  { cat: 'grind', make: (r) => { const g = pick(r, [40, 80, 150]); return { stat: 'grindM', goal: g, title: `Grind ${g} m of rails`, desc: 'Voltage Park has the rails', xp: 160 + g, unit: 'm' }; } },
  { cat: 'medal', make: (r) => { const g = pick(r, ['bronze', 'silver', 'gold']); return { stat: `medal-${g}`, goal: 1, title: `Earn a ${g} medal`, desc: 'Any Challenge run', xp: { bronze: 180, silver: 280, gold: 420 }[g] }; } },
];

/** The three dailies for a day key (YYYY-MM-DD), from different categories, stable for the day. */
export function dailiesFor(day, rerolls = {}) {
  const out = [], used = new Set();
  for (let slot = 0; slot < 3; slot++) {
    const r = rng(`${day}#${slot}#${rerolls[slot] || 0}`);
    let t;
    for (let tries = 0; tries < 40; tries++) {
      t = CHALLENGE_POOL[Math.floor(r() * CHALLENGE_POOL.length)];
      if (!used.has(t.cat)) break;
    }
    used.add(t.cat);
    const c = t.make(r);
    out.push({ id: `${day}:${slot}:${rerolls[slot] || 0}`, slot, cat: t.cat, scope: 'day', ...c, xp: Math.round(c.xp) });
  }
  return out;
}

// One weekly challenge per local week (Monday to Sunday): a bigger goal, accumulated over the week.
export const WEEKLY_POOL = [
  { stat: 'scoreSum', goal: 40000, title: 'Score 40,000 this week', desc: 'Style points across all rides', xp: 1500 },
  { stat: 'tricks', goal: 60, title: 'Land 60 tricks this week', desc: 'Spins, flips, grabs and rails', xp: 1500 },
  { stat: 'meters', goal: 25000, title: 'Ride 25 km this week', desc: 'Any map, any mode', xp: 1500, unit: 'km' },
  { stat: 'near', goal: 200, title: '200 close shaves this week', desc: 'Skim the trees', xp: 1500 },
  { stat: 'combo3n', goal: 10, title: 'Bank ten ×3 combos this week', desc: 'Chain it, ride it out', xp: 1600 },
  { stat: 'stomps', goal: 30, title: 'Stomp 30 landings this week', desc: 'PERFECT or STOMPED', xp: 1500 },
];

/** Monday of the local week as YYYY-MM-DD. */
export function weekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(d);
}

export function weeklyFor(week) {
  const r = rng(`week#${week}`);
  const t = WEEKLY_POOL[Math.floor(r() * WEEKLY_POOL.length)];
  return { id: `w:${week}`, scope: 'week', ...t };
}

// ---------------------------------------------------------------- achievements
// test(stats, ctx) on lifetime stats (`life`) and this ride's (`ride`); xp on unlock.
export const ACHIEVEMENTS = [
  { id: 'first-ride', title: 'First Tracks', desc: 'Finish your first ride', xp: 100, icon: '❄', test: (s) => s.life.rides >= 1 },
  { id: 'first-trick', title: 'Air Time', desc: 'Land your first trick', xp: 100, icon: '✈', test: (s) => s.life.tricks >= 1 },
  { id: 'spin-360', title: 'Full Circle', desc: 'Land a 360', xp: 120, icon: '↻', test: (s) => s.life.maxSpin >= 360 },
  { id: 'spin-540', title: 'Five-Forty', desc: 'Land a 540', xp: 180, icon: '↻', test: (s) => s.life.maxSpin >= 540 },
  { id: 'spin-720', title: 'Seven-Twenty', desc: 'Land a 720', xp: 260, icon: '↻', test: (s) => s.life.maxSpin >= 720 },
  { id: 'spin-1080', title: 'Ten-Eighty', desc: 'Land a 1080', xp: 500, icon: '☄', test: (s) => s.life.maxSpin >= 1080 },
  { id: 'first-flip', title: 'Head Over Heels', desc: 'Land a flip', xp: 200, icon: '⟲', test: (s) => s.life.flips >= 1 },
  { id: 'stomp-1', title: 'Stomped It', desc: 'Get a STOMPED landing', xp: 120, icon: '★', test: (s) => s.life.stomps >= 1 },
  { id: 'stomp-50', title: 'Butter Knees', desc: '50 stomped or perfect landings', xp: 400, icon: '★', test: (s) => s.life.stomps >= 50 },
  { id: 'near-100', title: 'Tree Whisperer', desc: '100 close shaves', xp: 300, icon: '🌲', test: (s) => s.life.near >= 100 },
  { id: 'combo-3', title: 'Chain Gang', desc: 'Bank a ×3 combo', xp: 200, icon: '×', test: (s) => s.life.bestMult >= 3 },
  { id: 'combo-5', title: 'Combo Machine', desc: 'Bank a ×5 combo', xp: 450, icon: '×', test: (s) => s.life.bestMult >= 5 },
  { id: 'score-10k', title: 'Five Figures', desc: 'Score 10,000 in one ride', xp: 350, icon: '◆', test: (s) => s.ride.score >= 10000 },
  { id: 'speed-100', title: 'Ton Up', desc: 'Hit 100 km/h', xp: 300, icon: '⚡', test: (s) => s.life.topKmh >= 100 },
  { id: 'km-10', title: 'Mileage', desc: 'Ride 10 km in total', xp: 200, icon: '⛷', test: (s) => s.life.meters >= 10000 },
  { id: 'km-100', title: 'Mountain Miles', desc: 'Ride 100 km in total', xp: 800, icon: '⛰', test: (s) => s.life.meters >= 100000 },
  { id: 'air-60', title: 'Frequent Flyer', desc: '60 s of air in one ride', xp: 300, icon: '☁', test: (s) => s.ride.air >= 60 },
  { id: 'grind-100', title: 'Rail Rat', desc: 'Grind 100 m of rails in total', xp: 300, icon: '═', test: (s) => s.life.grindM >= 100 },
  { id: 'all-maps', title: 'Explorer', desc: 'Ride Valcrest, Blackspruce, Ravenspire and Voltage Park', xp: 400, icon: '⌖', test: (s) => Object.keys(MAPS).every((m) => s.life.maps?.[m]) },
  { id: 'dailies-3', title: 'Daily Grind', desc: 'Finish all three dailies in a day', xp: 250, icon: '✓', test: (s) => s.life.dailySweeps >= 1 },
  { id: 'gold', title: 'Golden', desc: 'Earn a gold medal', xp: 350, icon: '🥇', test: (s) => s.life.golds >= 1 },
  { id: 'book-10', title: 'Bag of Tricks', desc: 'Land 10 different tricks', xp: 250, icon: '📖', test: (s) => Object.keys(s.life.trickBook || {}).length >= 10 },
  { id: 'book-30', title: 'Trick Encyclopedia', desc: 'Land 30 different tricks', xp: 600, icon: '📚', test: (s) => Object.keys(s.life.trickBook || {}).length >= 30 },
  { id: 'level-10', title: 'Double Digits', desc: 'Reach level 10', xp: 0, icon: '⬆', test: (s, p) => p.level >= 10 },
];

// PB stats per map (bigger is better). Shown as callouts once per ride when beaten.
export const PB_STATS = {
  score: { label: 'Best score', fmt: (v) => fmt(v) },
  air: { label: 'Longest air', fmt: (v) => `${v.toFixed(1)} s` },
  spin: { label: 'Biggest spin', fmt: (v) => `${v}°` },
  kmh: { label: 'Top speed', fmt: (v) => `${Math.round(v)} km/h` },
  combo: { label: 'Best combo', fmt: (v) => `+${fmt(v)}` },
};

export function defaultState() {
  return {
    version: PROGRESSION_VERSION, xp: 0,
    life: { rides: 0, tricks: 0, flips: 0, stomps: 0, near: 0, meters: 0, air: 0, grindM: 0, maxSpin: 0, bestMult: 0, topKmh: 0, golds: 0, dailySweeps: 0, maps: {}, trickBook: {} },
    daily: null,           // { day, rerolls: {slot: n}, rerollsLeft, progress: {stat: n}, done: {id: true}, swept }
    weekly: null,          // { week, progress: {stat: n}, done }
    achievements: {},      // id → unlock time (ms)
    pb: {},                // mapId → { stat: value }
  };
}

export function sanitizeState(raw) {
  const d = defaultState();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d;
  const num = (v, f = 0) => (Number.isFinite(v) && v >= 0 ? v : f);
  const s = { ...d, xp: num(raw.xp) };
  s.life = { ...d.life };
  for (const k of Object.keys(d.life)) if (k !== 'maps' && k !== 'trickBook') s.life[k] = num(raw.life?.[k]);
  s.life.maps = raw.life?.maps && typeof raw.life.maps === 'object' ? { ...raw.life.maps } : {};
  s.life.trickBook = raw.life?.trickBook && typeof raw.life.trickBook === 'object' && !Array.isArray(raw.life.trickBook) ? { ...raw.life.trickBook } : {};
  s.achievements = raw.achievements && typeof raw.achievements === 'object' ? { ...raw.achievements } : {};
  s.pb = raw.pb && typeof raw.pb === 'object' ? JSON.parse(JSON.stringify(raw.pb)) : {};
  s.daily = raw.daily && typeof raw.daily.day === 'string' ? {
    day: raw.daily.day, rerolls: { ...(raw.daily.rerolls || {}) }, rerollsLeft: num(raw.daily.rerollsLeft, 1),
    progress: { ...(raw.daily.progress || {}) }, done: { ...(raw.daily.done || {}) }, swept: !!raw.daily.swept,
  } : null;
  s.weekly = raw.weekly && typeof raw.weekly.week === 'string' ? { week: raw.weekly.week, progress: { ...(raw.weekly.progress || {}) }, done: !!raw.weekly.done } : null;
  return s;
}

export function dayKey(date = new Date()) {
  const y = date.getFullYear(), m = String(date.getMonth() + 1).padStart(2, '0'), dd = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/**
 * The progression state machine. Events go to `emit(name, detail)`:
 *   xp {gained, reason, xp, level, into, need}, levelUp {level, prev, rank, rankUp},
 *   achievement {id, title, desc, xp, icon}, challengeProgress {challenge, value}, challengeDone {challenge},
 *   dailySweep {xp}, personalBest {mapId, stat, label, value, prev, text}
 */
export class Progression {
  constructor({ storage, emit = () => {}, now = () => new Date() } = {}) {
    this.storage = storage; this.emit = emit; this.now = now;
    this.state = sanitizeState(storage?.get(PROGRESSION_KEY));
    this.ride = null;
    this.ensureDay();
  }

  save() { this.storage?.set(PROGRESSION_KEY, this.state); }

  // ---------------------------------------------------------------- levels
  get level() { return levelFor(this.state.xp).level; }
  progress() { const l = levelFor(this.state.xp); return { ...l, xp: this.state.xp, rank: rankFor(l.level) }; }

  addXP(amount, reason = '') {
    const gained = Math.max(0, Math.round(amount));
    if (!gained) return 0;
    const before = levelFor(this.state.xp).level;
    this.state.xp += gained;
    if (this.ride) this.ride.xp += gained;
    const p = levelFor(this.state.xp);
    this.emit('xp', { gained, reason, xp: this.state.xp, ...p });
    for (let l = before + 1; l <= p.level; l++) {
      const rank = rankFor(l), rankUp = rankFor(l - 1).name !== rank.name;
      this.emit('levelUp', { level: l, prev: l - 1, rank, rankUp });
    }
    if (p.level > before) this.checkAchievements();
    this.save();
    return gained;
  }

  // ---------------------------------------------------------------- dailies
  ensureDay() {
    const day = dayKey(this.now());
    if (this.state.daily?.day !== day) this.state.daily = { day, rerolls: {}, rerollsLeft: 1, progress: {}, done: {}, swept: false };
    return this.state.daily;
  }

  ensureWeek() {
    const week = weekKey(this.now());
    if (this.state.weekly?.week !== week) this.state.weekly = { week, progress: {}, done: false };
    return this.state.weekly;
  }

  /** This week's challenge: { id, title, desc, goal, value, done, xp, unit? }. */
  weekly() {
    const w = this.ensureWeek();
    const c = weeklyFor(w.week);
    return { ...c, value: Math.min(c.goal, w.progress[c.stat] || 0), done: w.done };
  }

  challenges() {
    const d = this.ensureDay();
    return dailiesFor(d.day, d.rerolls).map((c) => {
      const v = c.scope === 'ride' ? Math.max(d.progress[`best:${c.stat}`] || 0, this.ride?.[c.stat] || 0) : d.progress[c.stat] || 0;
      return { ...c, value: Math.min(c.goal, v), done: !!d.done[c.id] };
    });
  }

  /** Swap one unfinished daily for another (one free reroll per day). */
  reroll(slot) {
    const d = this.ensureDay();
    const c = this.challenges().find((x) => x.slot === slot);
    if (!c || c.done || d.rerollsLeft <= 0) return null;
    d.rerollsLeft--;
    d.rerolls[slot] = (d.rerolls[slot] || 0) + 1;
    this.save();
    return this.challenges().find((x) => x.slot === slot);
  }

  bump(stat, by = 1, { max = false } = {}) {
    const d = this.ensureDay();
    if (max) d.progress[stat] = Math.max(d.progress[stat] || 0, by);
    else d.progress[stat] = (d.progress[stat] || 0) + by;
    if (!max) { const w = this.ensureWeek(); w.progress[stat] = (w.progress[stat] || 0) + by; }
    this.checkChallenges();
  }

  checkChallenges() {
    const d = this.ensureDay();
    for (const c of this.challenges()) {
      if (c.done || d.done[c.id]) continue;
      if (c.value >= c.goal) {
        d.done[c.id] = true;
        this.ride?.dailies.push(c.title);
        this.emit('challengeDone', { challenge: { ...c, done: true } });
        this.addXP(c.xp, `Daily: ${c.title}`);
      }
    }
    const wk = this.weekly();
    if (!wk.done && wk.value >= wk.goal) {
      this.state.weekly.done = true;
      this.ride?.dailies.push(wk.title);
      this.emit('weeklyDone', { challenge: { ...wk, done: true } });
      this.addXP(wk.xp, `Weekly: ${wk.title}`);
    }
    if (!d.swept && this.challenges().every((c) => c.done)) {
      d.swept = true;
      this.state.life.dailySweeps++;
      this.emit('dailySweep', { xp: XP_SOURCES.allDailies });
      this.addXP(XP_SOURCES.allDailies, 'All dailies');
      this.checkAchievements();
    }
  }

  // ---------------------------------------------------------------- achievements
  checkAchievements() {
    const ctx = { life: this.state.life, ride: this.ride || { score: 0, air: 0 } };
    const p = levelFor(this.state.xp);
    for (const a of ACHIEVEMENTS) {
      if (this.state.achievements[a.id] || !a.test(ctx, p)) continue;
      this.state.achievements[a.id] = this.now().getTime();
      this.ride?.achievements.push(a.title);
      this.emit('achievement', { id: a.id, title: a.title, desc: a.desc, xp: a.xp, icon: a.icon });
      if (a.xp) this.addXP(a.xp, `Achievement: ${a.title}`);
    }
  }

  achievements() { return ACHIEVEMENTS.map(({ test, ...a }) => ({ ...a, unlocked: this.state.achievements[a.id] || 0 })); }

  // ---------------------------------------------------------------- ride recording
  startRide(mapId) {
    this.ride = {
      mapId: mapId || 'unknown', score: 0, rideScore: 0, air: 0, meters: 0, pbSeen: {}, pbStart: { ...(this.state.pb[mapId] || {}) },
      xp: 0, xpStart: this.state.xp, dailies: [], achievements: [], pbs: [],
    };
    if (mapId) { this.state.life.maps[mapId] = (this.state.life.maps[mapId] || 0) + 1; }
  }

  /** Style points scored (any `score` event). */
  recordScore(points) {
    if (!this.ride || points <= 0) return;
    this.ride.score += points;
    this.ride.rideScore = this.ride.score;
    const w = this.ensureWeek(); w.progress.scoreSum = (w.progress.scoreSum || 0) + points;
    this.pbCheck('score', this.ride.score);
    this.addXP(points * XP_SOURCES.perPoint);
    this.checkChallenges();
    this.checkAchievements();
  }

  /** Distance ridden since the last call (m). */
  recordDistance(m) {
    if (!this.ride || !(m > 0)) return;
    this.ride.meters += m;
    this.state.life.meters += m;
    this._kmAcc = (this._kmAcc || 0) + m;
    if (this._kmAcc >= 50) { this.addXP(this._kmAcc / 1000 * XP_SOURCES.perKm); this._kmAcc = 0; }
    this.bump('meters', m);
  }

  /** A landing ({clean, trick, air, grade, spin (deg), flips}). */
  recordLanding(e) {
    if (!this.ride || !e.clean) return;
    const L = this.state.life;
    if (e.air > 0) { this.ride.air += e.air; L.air += e.air; this.bump('air', e.air); this.pbCheck('air', round1(e.air)); }
    if (e.trick) {
      L.tricks++; this.bump('tricks'); this.recordTrickName(e.trick);
      if ((e.points || 0) > (this.ride.best?.pts || 0)) this.ride.best = { name: trickKey(e.trick), pts: e.points };
    }
    if (e.flips > 0) { L.flips += e.flips; this.bump('flips', e.flips); }
    if (e.spin > 0) {
      L.maxSpin = Math.max(L.maxSpin, e.spin);
      this.pbCheck('spin', e.spin);
      for (const g of [540, 720, 900]) if (e.spin >= g) this.bump(`spin${g}`, 1, { max: true });
    }
    if (e.grade === 'stomped' || e.grade === 'perfect') { L.stomps++; this.bump('stomps'); }
    this.checkAchievements();
  }

  /** Trick book: the first clean landing of a trick name pays XP_SOURCES.newTrick and emits newTrick. */
  recordTrickName(name) {
    const key = trickKey(name);
    if (!key) return false;
    const book = this.state.life.trickBook;
    const first = !book[key];
    book[key] = (book[key] || 0) + 1;
    if (first) {
      this.emit('newTrick', { name: key, count: Object.keys(book).length, xp: XP_SOURCES.newTrick });
      this.addXP(XP_SOURCES.newTrick, `New trick: ${key}`);
      this.checkAchievements();
    }
    return first;
  }

  trickBook() { return Object.entries(this.state.life.trickBook).map(([name, n]) => ({ name, n })); }

  recordNearMiss() {
    if (!this.ride) return;
    this.state.life.near++;
    this.bump('near');
    this.bump(`near@${this.ride.mapId}`);
    this.checkAchievements();
  }

  recordCombo(mult, bonus) {
    if (!this.ride) return;
    this.state.life.bestMult = Math.max(this.state.life.bestMult, mult);
    for (const g of [2.5, 3, 4]) if (mult >= g) this.bump(`combo${g}`, 1, { max: true });
    if (mult >= 3) this.bump('combo3n');
    this.pbCheck('combo', bonus);
    this.checkAchievements();
  }

  recordGrind(m) {
    if (!this.ride || !(m > 0)) return;
    this.state.life.grindM += m;
    this.bump('grindM', m);
    this.checkAchievements();
  }

  recordSpeed(kmh) {
    if (!this.ride) return;
    const L = this.state.life;
    if (kmh > L.topKmh) L.topKmh = kmh;
    for (const g of [55, 70, 85]) if (kmh >= g) this.bump(`kmh${g}`, 1, { max: true });
    this.pbCheck('kmh', Math.floor(kmh));
    if (kmh >= 100) this.checkAchievements();
  }

  recordMedal(medal) {
    if (!medal) return;
    const order = ['bronze', 'silver', 'gold'];
    for (const m of order.slice(0, order.indexOf(medal) + 1)) this.bump(`medal-${m}`, 1, { max: true });
    if (medal === 'gold') this.state.life.golds++;
    this.checkAchievements();
  }

  /** End of a ride: the ride bonus, one-ride challenge bests, saves. Returns a summary. */
  endRide() {
    const r = this.ride;
    if (!r) return null;
    const d = this.ensureDay();
    d.progress['best:rideScore'] = Math.max(d.progress['best:rideScore'] || 0, r.rideScore);
    let bonus = 0;
    if (r.meters >= XP_SOURCES.rideMinM) {
      this.state.life.rides++;
      bonus = this.addXP(XP_SOURCES.ride, 'Ride');
    }
    this.checkAchievements();
    this.ride = null;
    this.save();
    const { pbSeen, pbStart, ...out } = r;
    return { ...out, bonus, from: levelFor(r.xpStart), to: levelFor(this.state.xp) };
  }

  /** PB per map: callout the first time this ride beats the stored best (if there was one). */
  pbCheck(stat, value) {
    const r = this.ride;
    if (!r || !(value > 0)) return;
    const pb = this.state.pb[r.mapId] ||= {};
    const prev = r.pbStart[stat] || 0;
    if (value > (pb[stat] || 0)) pb[stat] = value;
    if (prev > 0 && value > prev && !r.pbSeen[stat]) {
      r.pbSeen[stat] = true;
      const S = PB_STATS[stat];
      r.pbs.push(S.label);
      this.emit('personalBest', { mapId: r.mapId, stat, label: S.label, value, prev, text: `${S.label} · ${S.fmt(value)}`, was: S.fmt(prev) });
    }
  }

  pbs(mapId) { return { ...(this.state.pb[mapId] || {}) }; }
}

// ---------------------------------------------------------------- helpers
/** "Perfect Left 540 Mute" → "Left 540 Mute"; rail labels lose the length / extras ("Boardslide to 50-50"). */
export function trickKey(label) {
  return String(label || '').replace(/^(Perfect|Sketchy|Locked-in)\s+/i, '').replace(/\s*·.*$/, '').replace(/\s+/g, ' ').trim();
}
function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const round1 = (v) => Math.round(v * 10) / 10;
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
