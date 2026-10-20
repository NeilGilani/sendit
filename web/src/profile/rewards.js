// Rewards and progression: earning cases, rolling them, the reel, duplicates, collection.
//
// Pure logic over the profile object (no DOM, no storage): profileStore (store.js) wraps these
// functions, persists and emits events; the tracker (tracker.js) feeds ride events in; node tests
// (scripts/unittest.mjs) drive them with a seeded RNG. Numbers and reasoning: docs/rewards.md.
//
// Progress is case XP. Every CASE_XP earns one unopened case:
//   distance ridden  XP_PER_KM per km (skis and snowboard alike)
//   finishing a run  XP_FINISH (+ a medal bonus in Challenge)
//   milestones       first run on each map, first finish of each trail, distance milestones
//   duplicates       a skin you already own turns into XP (its rarity's dupeXp, a gold dupe = a case)
import { RARITIES, RARITY, rarityOf } from './rarity.js';
import { rewardSkins, getItem, getVariant, ownKey } from './catalog.js';
import { SERIES, SERIES_ORDER } from './items.js';

export const CASE_XP = 1000;
export const EARN = {
  perKm: 40,
  finish: 65,
  medal: { bronze: 20, silver: 40, gold: 60 },
  firstMap: 250,
  firstTrail: 120,
  firstToday: 100,          // the first finished run of each calendar day
  minRun: 500,              // metres a run must cover for its finish bonuses (no farming from a drop zone near the finish)
};
/** Distance milestones (metres) and their XP. Past the table: one whole case every 100 km. */
export const DISTANCE_MILESTONES = [
  { m: 1000, xp: 50, label: 'First kilometre' },
  { m: 5000, xp: 100, label: '5 km ridden' },
  { m: 10000, xp: 150, label: '10 km ridden' },
  { m: 25000, xp: 250, label: '25 km ridden' },
  { m: 50000, xp: 400, label: '50 km ridden' },
  { m: 100000, xp: CASE_XP, label: '100 km ridden' },
];
export const MILESTONE_EVERY = 100000;
/**
 * Bad-luck protection (disclosed in the Cases tab, like Apex's legendary pity): if PITY − 1 cases in a
 * row open without a Covert (red) or gold item, the next one is Covert. It never forces gold, so gold
 * stays at its 0.3 %; red goes from 1.3 % to about 2.1 % overall.
 */
export const PITY = 60;
/** Cases for owning every skin of a case series (the gold items are not needed). */
export const COLLECTION_BONUS = 2;
const HISTORY = 40;

export function defaultRewards() {
  return {
    xp: 0, xpTotal: 0,          // progress toward the next case, lifetime XP
    cases: [],                  // unopened: [{ id, series, at, source }]
    earned: 0, opened: 0, seq: 0,
    distance: 0,                // metres credited (all equipment)
    distanceBy: { skis: 0, snowboard: 0 },
    milestone: 0,               // metres of the last distance milestone paid
    maps: [], trails: [],       // first-run bonuses paid
    lastDay: null,              // 'YYYY-MM-DD' of the last first-run-of-the-day bonus
    history: [],                // last openings: [{ at, key, rarity, dupe }]
    best: null,                 // rarest pull: { key, rarity, at }
    dupeXp: 0,
    sinceRed: 0,                // openings since the last red or gold (bad-luck protection, PITY)
    completed: [],              // case series whose every skin you own (each pays COLLECTION_BONUS once)
  };
}

export function sanitizeRewards(r) {
  const d = defaultRewards();
  if (!r || typeof r !== 'object') return d;
  const num = (v, f = 0) => ((typeof v === 'number' || typeof v === 'string') && Number.isFinite(Number(v)) ? Number(v) : f);
  const out = { ...d };
  for (const k of ['xp', 'xpTotal', 'earned', 'opened', 'seq', 'distance', 'milestone', 'dupeXp', 'sinceRed']) out[k] = Math.max(0, num(r[k]));
  out.xp = Math.min(out.xp, CASE_XP - 1e-6);
  out.distanceBy = { skis: Math.max(0, num(r.distanceBy?.skis)), snowboard: Math.max(0, num(r.distanceBy?.snowboard)) };
  // Keep the newest 500 cases; give id-less ones a fresh id so two cases never share one.
  out.distance = Math.min(out.distance, 1e9);
  out.cases = (Array.isArray(r.cases) ? r.cases : []).filter((c) => c && typeof c.series === 'string' && Object.hasOwn(SERIES, c.series)).slice(-500)
    .map((c, i) => ({ id: c.id ? String(c.id) : `c${out.seq + i + 1}-fix`, series: c.series, at: num(c.at), source: String(c.source || '') }));
  // Milestones already passed count as paid (a garbled save must not back-pay hundreds of cases).
  while (nextMilestone(out).m <= out.distance) out.milestone = nextMilestone(out).m;
  out.maps = (Array.isArray(r.maps) ? r.maps : []).filter((x) => typeof x === 'string');
  out.trails = (Array.isArray(r.trails) ? r.trails : []).filter((x) => typeof x === 'string');
  out.completed = (Array.isArray(r.completed) ? r.completed : []).filter((x) => typeof x === 'string' && Object.hasOwn(SERIES, x));
  out.history = (Array.isArray(r.history) ? r.history : []).filter((h) => h && typeof h.key === 'string').slice(-HISTORY);
  out.best = r.best && typeof r.best.key === 'string' ? r.best : null;
  out.lastDay = typeof r.lastDay === 'string' ? r.lastDay : null;
  return out;
}

// ------------------------------------------------------------------ RNG
/** Small seeded PRNG (mulberry32) for tests and reproducible reels. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (arr, rng) => arr[Math.floor(rng() * arr.length) % arr.length];

// ------------------------------------------------------------------ pools and odds
/** Case contents by rarity: { common: [{ item, variant, key }], …, gold: […] }. */
export function casePool(series) {
  const pool = Object.fromEntries(RARITIES.map((r) => [r.id, []]));
  for (const { item, variant } of rewardSkins()) {
    if (variant.series !== series && variant.series !== '*') continue;
    pool[variant.rarity]?.push({ item, variant, key: ownKey(item.id, variant.id) });
  }
  return pool;
}

/** Tier odds for a case (percent), skipping empty tiers (their weight moves one tier down). */
export function caseOdds(series) {
  const pool = casePool(series);
  const odds = {};
  let carry = 0;
  for (let i = RARITIES.length - 1; i >= 0; i--) {
    const r = RARITIES[i];
    const w = r.weight + carry;
    if (pool[r.id].length) { odds[r.id] = w; carry = 0; } else { odds[r.id] = 0; carry = w; }
  }
  if (carry) odds.common += carry;
  return odds;
}

function rollTier(odds, rng) {
  const total = Object.values(odds).reduce((a, b) => a + b, 0);
  let x = rng() * total;
  for (const r of RARITIES) { x -= odds[r.id]; if (x < 0 && odds[r.id] > 0) return r.id; }
  return RARITIES.find((r) => odds[r.id] > 0).id;
}

/** Roll one case: { key, item, variant, rarity }. `pity` = a Covert (red) item for sure. */
export function rollCase(series, rng = Math.random, pity = false) {
  const pool = casePool(series);
  const odds = caseOdds(series);
  if (pity) for (const r of RARITIES) if (r.id !== 'legendary') odds[r.id] = 0;
  const tier = rollTier(odds, rng);
  const e = pick(pool[tier], rng);
  return { ...e, rarity: tier };
}

// ------------------------------------------------------------------ the reel
// The strip of cards that scrolls past the marker (lobby/cases/opener.js animates it). Filler cards use
// display weights (rarer tiers show more often than they drop, so every reel shows the whole ladder
// scrolling by). Gold shows as one anonymous ★ card, never as a specific item.
export const REEL = {
  cards: 60, winAt: 50,
  display: { common: 38, uncommon: 30, rare: 18, epic: 8, legendary: 4, gold: 2 },
  nearMiss: 0.55,           // chance the winner sits right next to a rarer card
};

/**
 * Build the reel for a result. Returns { cards: [{ key|null, rarity }], winAt, stop, nearMiss }.
 * `stop` is where the marker lands inside the winning card (0 = its left edge, 1 = its right edge).
 * Near miss: a rarer card next to the winner, and the marker stops a few % from the edge facing it —
 * either just past it (the rare card slid by) or just short of it (the rare card never arrived).
 */
export function buildReel(result, series, rng = Math.random, opt = REEL) {
  const pool = casePool(series);
  const odds = { ...opt.display };
  for (const r of RARITIES) if (!pool[r.id].length) odds[r.id] = 0;
  const filler = () => {
    const tier = rollTier(odds, rng);
    return tier === 'gold' ? { key: null, rarity: 'gold' } : { key: pick(pool[tier], rng).key, rarity: tier };
  };
  const cards = Array.from({ length: opt.cards }, filler);
  const isGold = result.rarity === 'gold';
  cards[opt.winAt] = { key: isGold ? null : result.key, rarity: result.rarity, win: true, revealKey: result.key };
  let stop = 0.1 + rng() * 0.8;
  let nearMiss = null;
  const rank = rarityOf(result.rarity).rank;
  if (rank < RARITY.legendary.rank && rng() < opt.nearMiss) {
    // The teaser: red or gold most of the time, else one tier above the winner.
    const r = rng();
    const tier = r < 0.4 && pool.gold.length ? 'gold' : r < 0.8 ? 'legendary' : RARITIES[Math.min(rank + 1, 4)].id;
    const side = rng() < 0.6 ? -1 : 1;   // −1: the rare card just slid past the marker, +1: it stopped short
    cards[opt.winAt + side] = tier === 'gold' ? { key: null, rarity: 'gold' } : { key: pick(pool[tier], rng).key, rarity: tier };
    stop = side < 0 ? 0.02 + rng() * 0.07 : 0.91 + rng() * 0.07;
    nearMiss = { side, rarity: tier };
  }
  // The slow part of the reel (the last ~14 cards before the winner) always shows red and gold once.
  const placed = new Set([opt.winAt - 1, opt.winAt, opt.winAt + 1]);
  for (const tier of ['legendary', 'gold', 'epic']) {
    if (!pool[tier].length || cards.slice(opt.winAt - 14, opt.winAt + 4).some((c) => c.rarity === tier)) continue;
    let i, n = 0;
    do i = opt.winAt - 3 - Math.floor(rng() * 11); while ((placed.has(i) || rarityOf(cards[i].rarity).rank >= RARITY.epic.rank) && ++n < 40);
    placed.add(i);
    cards[i] = tier === 'gold' ? { key: null, rarity: 'gold' } : { key: pick(pool[tier], rng).key, rarity: tier };
  }
  return { cards, winAt: opt.winAt, stop, nearMiss };
}

// ------------------------------------------------------------------ earning
function nextSeries(r) { return SERIES_ORDER[r.earned % SERIES_ORDER.length]; }

/** Add XP; every CASE_XP becomes an unopened case. Returns the cases earned. */
export function addXp(p, xp, source = 'ride', now = Date.now()) {
  const r = p.rewards;
  const got = [];
  if (!(xp > 0)) return got;
  r.xp += xp; r.xpTotal += xp;
  while (r.xp >= CASE_XP) { r.xp -= CASE_XP; got.push(grantCase(p, source, now)); }
  return got;
}

/** Put one unopened case in the profile (series rotates so you see both). */
export function grantCase(p, source = 'ride', now = Date.now(), series = null) {
  const r = p.rewards;
  const c = { id: `c${++r.seq}-${now.toString(36)}`, series: typeof series === 'string' && Object.hasOwn(SERIES, series) ? series : nextSeries(r), at: now, source };
  r.earned += 1;
  r.cases.push(c);
  return c;
}

/**
 * Credit one finished run (or the distance of an unfinished ride). Returns
 * { gains: [{ xp, label }], xp, cases, progress }.
 * run = { mapId, trailId, distance (m, ridden since the last credit), finished, medal, equipment }
 */
export function creditRun(p, run, now = Date.now()) {
  const r = p.rewards;
  const gains = [];
  const dist = Math.max(0, Number(run.distance) || 0);
  if (dist > 0) {
    r.distance += dist;
    const eq = run.equipment === 'snowboard' ? 'snowboard' : 'skis';
    r.distanceBy[eq] += dist;
    gains.push({ xp: (dist / 1000) * EARN.perKm, label: `${(dist / 1000).toFixed(1)} km ridden` });
  }
  // Finish bonuses need a real run: at least EARN.minRun metres since the last credit.
  if (run.finished && dist >= EARN.minRun) {
    gains.push({ xp: EARN.finish, label: 'Run complete' });
    const dd = new Date(now);   // the rider's own calendar day
    const day = `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, '0')}-${String(dd.getDate()).padStart(2, '0')}`;
    if (r.lastDay !== day) { r.lastDay = day; gains.push({ xp: EARN.firstToday, label: 'First run today', milestone: true }); }
    if (run.medal && EARN.medal[run.medal]) gains.push({ xp: EARN.medal[run.medal], label: `${run.medal[0].toUpperCase()}${run.medal.slice(1)} medal` });
    if (run.mapId && !r.maps.includes(run.mapId)) { r.maps.push(run.mapId); gains.push({ xp: EARN.firstMap, label: `First run on ${run.mapName || run.mapId}`, milestone: true }); }
    if (run.trailId && run.trailId !== run.mapId && !r.trails.includes(run.trailId)) { r.trails.push(run.trailId); gains.push({ xp: EARN.firstTrail, label: 'New trail finished', milestone: true }); }
  }
  // Distance milestones (each pays once).
  for (;;) {
    const next = nextMilestone(r);
    if (r.distance < next.m) break;
    r.milestone = next.m;
    gains.push({ xp: next.xp, label: next.label, milestone: true });
  }
  const xp = gains.reduce((a, g) => a + g.xp, 0);
  const cases = addXp(p, xp, run.finished ? 'run' : 'distance', now);
  return { gains, xp, cases, progress: r.xp / CASE_XP };
}

/** The next distance milestone: { m, xp, label }. */
export function nextMilestone(r) {
  const t = DISTANCE_MILESTONES.find((x) => x.m > r.milestone);
  if (t) return t;
  const m = (Math.floor(r.milestone / MILESTONE_EVERY) + 1) * MILESTONE_EVERY;
  return { m, xp: CASE_XP, label: `${m / 1000} km ridden` };
}

// ------------------------------------------------------------------ opening
/**
 * Open an unopened case: rolls it, adds the skin (or converts a duplicate into XP) and returns
 * { case, key, item, variant, rarity, dupe, dupeXp, cases (earned from the dupe), reel }.
 */
export function openCase(p, caseId, rng = Math.random, now = Date.now()) {
  const r = p.rewards;
  const i = caseId ? r.cases.findIndex((c) => c.id === caseId) : 0;
  if (i < 0 || !r.cases[i]) return null;
  const [c] = r.cases.splice(i, 1);
  const pity = r.sinceRed >= PITY - 1;
  const res = rollCase(c.series, rng, pity);
  r.sinceRed = rarityOf(res.rarity).rank >= RARITY.legendary.rank ? 0 : r.sinceRed + 1;
  const reel = buildReel(res, c.series, rng);
  const inv = p.inventory.items;
  const dupe = !!inv[res.key];
  let dupeXp = 0, cases = [];
  if (dupe) {
    inv[res.key].n += 1;
    dupeXp = rarityOf(res.rarity).dupeXp;
    r.dupeXp += dupeXp;
    cases = addXp(p, dupeXp, 'duplicate', now);
  } else inv[res.key] = { at: now, n: 1, seen: false };
  // A finished collection: every skin of the series owned (gold excluded) pays COLLECTION_BONUS cases once.
  let completed = null;
  const s = res.variant.series;
  if (!dupe && SERIES[s] && !r.completed.includes(s)) {
    const pool = casePool(s);
    const all = RARITIES.filter((x) => x.id !== 'gold').every((x) => pool[x.id].every((e) => inv[e.key]));
    if (all) {
      r.completed.push(s);
      completed = s;
      for (let k = 0; k < COLLECTION_BONUS; k++) cases.push(grantCase(p, 'collection', now));
    }
  }
  r.opened += 1;
  r.history.push({ at: now, key: res.key, rarity: res.rarity, dupe, series: c.series });
  if (r.history.length > HISTORY) r.history.splice(0, r.history.length - HISTORY);
  if (!r.best || rarityOf(res.rarity).rank > rarityOf(r.best.rarity).rank) r.best = { key: res.key, rarity: res.rarity, at: now };
  return { case: c, key: res.key, item: res.item, variant: res.variant, rarity: res.rarity, dupe, dupeXp, cases, reel, pity, completed };
}

// ------------------------------------------------------------------ collection
/** { owned, total, pct, byRarity: { id: { owned, total } }, bySeries } over reward skins. */
export function collection(p) {
  const out = { owned: 0, total: 0, byRarity: {}, bySeries: {} };
  for (const r of RARITIES) out.byRarity[r.id] = { owned: 0, total: 0 };
  for (const s of SERIES_ORDER) out.bySeries[s] = { owned: 0, total: 0 };
  for (const { item, variant } of rewardSkins()) {
    const own = !!p.inventory?.items?.[ownKey(item.id, variant.id)];
    out.total++; out.owned += own;
    out.byRarity[variant.rarity].total++; out.byRarity[variant.rarity].owned += own;
    const ser = variant.series === '*' ? null : out.bySeries[variant.series];
    if (ser) { ser.total++; ser.owned += own; }
  }
  out.pct = out.total ? out.owned / out.total : 0;
  return out;
}

/** Look up a skin by inventory key: { item, variant } or null. */
export function skin(key) {
  const [id, vid] = String(key).split(':');
  const item = getItem(id);
  const variant = item && item.variants.find((v) => v.id === vid);
  return variant ? { item, variant: getVariant(item, vid) } : null;
}

// ------------------------------------------------------------------ migration (schema v1 → v2)
/**
 * A rider from before the case system keeps the skins they were wearing, gets one welcome case and
 * up to three more for the riding they already did (lifetime km and finished runs at today's rates).
 */
export function grandfather(p, old, now = Date.now()) {
  for (const e of Object.values(old.loadout?.slots || {})) {
    const item = getItem(e?.item);
    const v = item?.variants.find((x) => x.id === e.variant);
    if (v?.rarity && !v.starter) p.inventory.items[ownKey(item.id, v.id)] = { at: now, n: 1, seen: true };
  }
  // Before v2 the gaiter came with the jacket's colourway: keep it as a face skin.
  const jacket = old.loadout?.slots?.jacket;
  const face = jacket && getItem('face-gaiter')?.variants.find((x) => x.id === jacket.variant);
  if (face && !face.starter && !old.loadout?.slots?.face) {
    p.inventory.items[ownKey('face-gaiter', face.id)] = { at: now, n: 1, seen: true };
    p.loadout = { ...p.loadout, slots: { ...p.loadout?.slots, face: { item: 'face-gaiter', variant: face.id } } };
  }
  const s = old.stats || {};
  const r = p.rewards;
  r.distance = Math.max(0, Number(s.distance) || 0);
  while (nextMilestone(r).m <= r.distance) r.milestone = nextMilestone(r).m;   // no back pay for milestones
  const retro = Math.min(3, Math.floor(((r.distance / 1000) * EARN.perKm + (Number(s.runsCompleted) || 0) * EARN.finish) / CASE_XP));
  grantCase(p, 'welcome', now, 'first-chair');
  for (let i = 0; i < retro; i++) grantCase(p, 'veteran', now);
}
