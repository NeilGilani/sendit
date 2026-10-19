// Gear advisor (pure, headless): turns the real ski / snowboard specs into five readable ratings, finds what
// each owned piece is best at, and picks the one to ride for the player's maps and playstyle.
// docs/equipment.md → "Gear stats in the Locker" explains every number. Nothing here changes physics: the
// ratings are read from the same deriveHandling() multipliers the physics uses (equipment/registry.js).
//
//   GEAR_STATS                         the five ratings (id, label, short, badge, what it means)
//   rawStats(type, spec)               physics-derived raw scores (≈1 for the type's reference model)
//   gearStats(type, specOrId)          { speed, carve, control, park, powder } on a 1–10 scale (one decimal)
//   gearDetails(type, specOrId)        the underlying numbers for the compare view (pop %, spin %, radius…)
//   bestAt(items)                      { key: [badgeId] } among owned items of ONE type (ties / one-model → none)
//   playstyle(life, stats)             { weights, confidence, traits } from progression + profile stats
//   mapNeeds(mapIdOrMap)               stat weights for one map (terrain mix + its powder depth)
//   recommend(items, opts)             { key, reason, scores, why } the overall pick (or null with < 2 models)
//   recommendForMap(items, map)        the pick for one mountain only
// An item is { key, name, type: 'ski'|'snowboard', spec } (spec = equipment spec object or variant id).
import { getEquipmentSpec, deriveHandling, listVariants, normalizeType, DEFAULT_VARIANT } from '../equipment/registry.js';
import { RAVENSPIRE_PHYSICS } from '../maps/ravenspire/tuning.js';
import { DRAGONBACK_PHYSICS } from '../maps/dragonback/tuning.js';
import { KITSUNE_PHYSICS } from '../maps/kitsune/tuning.js';
import { FJORDLINE_PHYSICS } from '../maps/fjordline/tuning.js';
import { VOLTAGE_PHYSICS } from '../maps/voltage/tuning.js';

export const GEAR_STATS = [
  { id: 'speed', label: 'Speed', short: 'SPD', badge: 'fastest', tip: 'Keeps speed: stiff, long, damp (less scrub when it skids)' },
  { id: 'carve', label: 'Carve', short: 'CRV', badge: 'carver', tip: 'Edge grip and how tight it carves' },
  { id: 'control', label: 'Control', short: 'CTL', badge: 'control', tip: 'Turns on demand and forgives: pivots, scrubs speed, stays calm' },
  { id: 'park', label: 'Park', short: 'PRK', badge: 'park', tip: 'Spins, butters, pop and switch landings' },
  { id: 'powder', label: 'Powder', short: 'PWD', badge: 'powder', tip: 'Float: planes early and glides in deep snow' },
];
export const STAT_IDS = GEAR_STATS.map((s) => s.id);
export const BADGES = {
  fastest: { label: 'Fastest', stat: 'speed' },
  carver: { label: 'Best carver', stat: 'carve' },
  control: { label: 'Most controllable', stat: 'control' },
  park: { label: 'Best for park', stat: 'park' },
  powder: { label: 'Best in powder', stat: 'powder' },
};

/** Lead a piece needs over every other model (on the 1–10 scale) to earn a "best at" badge. */
export const BADGE_MARGIN = 0.5;

const specOf = (type, s) => (s && typeof s === 'object' && s.type === normalizeType(type) ? s : getEquipmentSpec(type, s));

/**
 * Raw scores from the physics multipliers (deriveHandling): every one is ~1 for the type's reference model.
 *   speed   = 0.7·stability + 0.3·grip      skid scrub is divided by stability (physics/edge.js), grip keeps it carving
 *   carve   = 0.75·grip + 0.25·tightness    tightness = reference sidecut radius / this radius (κ = 1/R)
 *   control = 0.4·pivot + 0.3·stability + 0.3·grip   pivot multiplies the turn rate you can ask for (edge.js),
 *                                            stability calms it, grip keeps it from washing out
 *   park    = (0.45·spin + 0.35·pivot + 0.2·pop) × 1.15 if twin   spin rate, butters, pop height, lands switch
 *   powder  = √float                         powder glide μ ÷ √float (edge.js), sink and bog ÷ float
 */
export function rawStats(type, spec) {
  const t = normalizeType(type);
  const s = specOf(t, spec);
  const h = deriveHandling(t, s);
  const ref = getEquipmentSpec(t, DEFAULT_VARIANT[t]);
  const tight = ref.sidecutRadius / h.sidecutRadius;
  return {
    speed: 0.7 * h.stability + 0.3 * h.grip,
    carve: 0.75 * h.grip + 0.25 * tight,
    control: 0.4 * h.pivot + 0.3 * h.stability + 0.3 * h.grip,
    park: (0.45 * h.spin + 0.35 * h.pivot + 0.2 * h.pop) * (h.twin ? 1.15 : 1),
    powder: Math.sqrt(h.float),
  };
}

// The scale: per type, over every registered model (legendary topsheets share a stock model's shape, so
// they add nothing). Lowest model → ~3.6, highest → 10: a fixed ruler, so bars never jump when you pull
// a new piece and skis can be compared with skis you do not own yet (Forza's 3–10 ratings, same idea).
const HEADROOM = 0.4;
const scaleCache = new Map();
export function statScale(type) {
  const t = normalizeType(type);
  const ids = listVariants(t).map((v) => v.id);
  const sig = ids.join(',');
  const hit = scaleCache.get(t);
  if (hit && hit.sig === sig) return hit.scale;
  const rows = ids.map((id) => rawStats(t, id));
  const scale = {};
  for (const k of STAT_IDS) {
    const vals = rows.map((r) => r[k]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = Math.max(1e-6, max - min);
    scale[k] = { lo: min - HEADROOM * span, hi: max };
  }
  scaleCache.set(t, { sig, scale });
  return scale;
}

const round1 = (v) => Math.round(v * 10) / 10;

/** The five ratings on a 1–10 scale (one decimal). */
export function gearStats(type, spec) {
  const t = normalizeType(type);
  const raw = rawStats(t, spec);
  const sc = statScale(t);
  const out = {};
  for (const k of STAT_IDS) out[k] = round1(Math.min(10, Math.max(1, 1 + 9 * (raw[k] - sc[k].lo) / Math.max(1e-6, sc[k].hi - sc[k].lo))));
  return out;
}

/** The numbers behind the ratings, for the compare view. Percentages are vs the type's reference model. */
export function gearDetails(type, spec) {
  const t = normalizeType(type);
  const s = specOf(t, spec);
  const h = deriveHandling(t, s);
  const pct = (v) => Math.round(v * 100);
  return {
    pop: pct(h.pop), spin: pct(h.spin), butter: pct(h.pivot), grip: pct(h.grip), stability: pct(h.stability), float: pct(h.float),
    twin: !!h.twin, radius: Math.round(h.sidecutRadius * 10) / 10, length: Math.round(s.length * 100),
    waist: Math.round(s.waist * 1000), profile: s.profile?.type || '', flex: Math.round(s.flex * 10),
  };
}

/** Same handling numbers = same model (a legendary topsheet rides exactly like its stock ski). */
export const modelSig = (stats) => STAT_IDS.map((k) => stats[k].toFixed(1)).join('|');

/** Items with their ratings (cached on the object passed in). */
function rated(items) {
  return items.map((it) => {
    const stats = it.stats || gearStats(it.type, it.spec);
    return { ...it, stats, raw: it.raw || rawStats(it.type, it.spec), sig: modelSig(stats) };
  });
}

/**
 * "Best at" badges among owned items of one type. A badge goes to the leader of a stat only when
 * - at least two different models are owned, and
 * - the leader beats every other model by BADGE_MARGIN or more (a near tie gives no badge).
 * Copies of the same model (stock + legendary skin) share the badge. Returns { key: [badgeId…] }.
 */
export function bestAt(items) {
  const list = rated(items);
  const out = Object.fromEntries(list.map((i) => [i.key, []]));
  const models = new Set(list.map((i) => i.sig));
  if (models.size < 2) return out;
  for (const st of GEAR_STATS) {
    const k = st.id;
    const top = Math.max(...list.map((i) => i.stats[k]));
    const leaders = list.filter((i) => i.stats[k] === top);
    const sig = leaders[0].sig;
    if (leaders.some((i) => i.sig !== sig)) continue;                       // two different models tie
    const next = Math.max(...list.filter((i) => i.sig !== sig).map((i) => i.stats[k]));
    if (top - next < BADGE_MARGIN - 1e-9) continue;                          // not a clear lead
    for (const i of leaders) out[i.key].push(st.badge);
  }
  return out;
}

// ------------------------------------------------------------------------------ terrain
// What each kind of terrain asks of the gear (weights sum to 1). Powder is handled separately: every map
// gets a powder weight from its own physics (powderDepth in maps/<id>/tuning.js), the rest from this mix.
export const TERRAIN_NEEDS = {
  groomer: { speed: 0.35, carve: 0.45, control: 0.15, park: 0.05 },
  steep: { speed: 0.35, control: 0.35, carve: 0.2, park: 0.1 },
  trees: { control: 0.6, carve: 0.25, speed: 0.15 },
  park: { park: 0.7, control: 0.15, speed: 0.1, carve: 0.05 },
};
export const TERRAIN_LABEL = { groomer: 'fast groomers', steep: 'steep faces', trees: 'tight trees', park: 'park features', powder: 'deep powder' };

const DEFAULT_POWDER = 0.35;   // config.js PHYSICS.powderDepth
// Terrain mix per built-in map (from docs/map2–7.md and each map's description); powder depth from its tuning.
export const MAP_TERRAIN = {
  'valcrest-gully': { mix: { groomer: 0.3, steep: 0.2, park: 0.5 }, powder: DEFAULT_POWDER },        // gully with kickers, drops, pillows
  blackspruce: { mix: { trees: 0.65, steep: 0.35 }, powder: DEFAULT_POWDER },                         // steep dense spruce slalom
  ravenspire: { mix: { steep: 0.75, park: 0.25 }, powder: RAVENSPIRE_PHYSICS.common?.powderDepth ?? DEFAULT_POWDER },   // cliffs, spines, pillows
  'voltage-park': { mix: { park: 0.85, groomer: 0.15 }, powder: VOLTAGE_PHYSICS.common?.powderDepth ?? DEFAULT_POWDER },
  dragonback: { mix: { steep: 0.7, groomer: 0.15, park: 0.15 }, powder: DRAGONBACK_PHYSICS.common?.powderDepth ?? DEFAULT_POWDER },   // ridges, gaps
  'kitsune-peak': { mix: { trees: 0.35, steep: 0.35, park: 0.3 }, powder: KITSUNE_PHYSICS.common?.powderDepth ?? DEFAULT_POWDER },    // pillows, birches, roofs
  fjordline: { mix: { steep: 0.45, groomer: 0.35, park: 0.2 }, powder: FJORDLINE_PHYSICS.common?.powderDepth ?? DEFAULT_POWDER },    // couloir, spines, rollers
  'lake-tahoe': { mix: { groomer: 0.8, trees: 0.2 }, powder: 0.1 },
};
const TAG_MIX = { park: 'park', slopestyle: 'park', rails: 'park', trees: 'trees', steep: 'steep', freeride: 'steep', 'big-mountain': 'steep', ridges: 'steep', 'real-world': 'groomer' };

/** Terrain profile of a map: { mix: { groomer, steep, trees, park }, powder }. Unknown maps use their tags. */
export function mapTerrain(map) {
  const id = typeof map === 'string' ? map : map?.id;
  if (MAP_TERRAIN[id]) return MAP_TERRAIN[id];
  const mix = {};
  for (const tag of (typeof map === 'object' && map?.tags) || []) if (TAG_MIX[tag]) mix[TAG_MIX[tag]] = (mix[TAG_MIX[tag]] || 0) + 1;
  if (!Object.keys(mix).length) mix.groomer = 1;
  const n = Object.values(mix).reduce((a, b) => a + b, 0);
  for (const k of Object.keys(mix)) mix[k] /= n;
  const powder = (map?.tags || []).includes('powder') ? 0.7 : DEFAULT_POWDER;
  return { mix, powder };
}

const zero = () => Object.fromEntries(STAT_IDS.map((k) => [k, 0]));
function normalize(w) {
  const n = STAT_IDS.reduce((a, k) => a + Math.max(0, w[k] || 0), 0) || 1;
  const out = {};
  for (const k of STAT_IDS) out[k] = Math.max(0, w[k] || 0) / n;
  return out;
}

/** Stat weights for a map: its terrain mix, with powder weighted by how deep its snow is. */
export function mapNeeds(map) {
  const { mix, powder } = mapTerrain(map);
  const pw = Math.min(0.45, powder * 0.55);
  const w = zero();
  for (const [ter, share] of Object.entries(mix)) for (const [k, v] of Object.entries(TERRAIN_NEEDS[ter] || {})) w[k] += share * v * (1 - pw);
  w.powder += pw;
  return normalize(w);
}

/** The dominant terrain of a map, for one-line explanations. */
export function mainTerrain(map) {
  const { mix, powder } = mapTerrain(map);
  const ranked = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  if (powder >= 0.55) return ['powder', ranked[0]?.[0]];
  return [ranked[0]?.[0] || 'groomer', ranked[1]?.[0]];
}

// ------------------------------------------------------------------------------ playstyle
const clamp01 = (v) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
const SPIN_RE = /\b(180|360|540|720|900|1080|1260|1440)\b|\bcab\b/i;
const FLIP_RE = /flip|cork|misty|rodeo|wildcat|tamedog/i;
const GRIND_RE = /grind|slide|board ?slide|lip ?slide|50-50|rail|box/i;

/**
 * Playstyle from the progression's lifetime stats (`life`, progression/core.js) and the profile's stats.
 * Returns { weights (stat → share), confidence 0..1, traits: { km, tricksPerKm, spins, flips, grinds,
 * topKmh, wipeoutsPerKm, turnsPerKm, favourite: [mapId, share] } }. Little data → confidence ≈ 0.
 */
export function playstyle(life = {}, stats = {}) {
  const L = life || {}, S = stats || {};
  const km = Math.max((L.meters || 0), (S.distance || 0)) / 1000;
  const perKm = (n) => (km > 0.2 ? (n || 0) / km : 0);
  const book = L.trickBook && typeof L.trickBook === 'object' ? L.trickBook : {};
  let spins = 0, flips = 0, grinds = 0;
  for (const [name, n] of Object.entries(book)) {
    const c = Number(n) || 0;
    if (FLIP_RE.test(name)) flips += c;
    else if (SPIN_RE.test(name)) spins += c;
    if (GRIND_RE.test(name)) grinds += c;
  }
  const tricksPerKm = perKm(L.tricks);
  const wipeoutsPerKm = perKm(L.wipeouts);
  const turnsPerKm = perKm(S.smoothTurns);
  const topKmh = L.topKmh || 0;
  const maps = L.maps && typeof L.maps === 'object' ? L.maps : {};
  const rides = Object.values(maps).reduce((a, b) => a + (Number(b) || 0), 0);
  const fav = Object.entries(maps).sort((a, b) => b[1] - a[1])[0];
  const traits = {
    km, tricksPerKm, spins, flips, grinds: grinds + (L.grindM || 0) / 20, topKmh, wipeoutsPerKm, turnsPerKm,
    favourite: fav && rides ? [fav[0], fav[1] / rides] : null, rides,
  };
  // Signals 0..1: how much each side of the game this rider leans on.
  const sig = {
    park: clamp01((tricksPerKm - 1.5) / 8) + clamp01(traits.grinds / 40) * 0.3,
    speed: clamp01((topKmh - 55) / 50) * 0.8,
    control: clamp01((wipeoutsPerKm - 0.4) / 2),
    carve: clamp01((turnsPerKm - 4) / 25) * 0.7,
    powder: 0,
  };
  const total = STAT_IDS.reduce((a, k) => a + sig[k], 0);
  const weights = total > 0 ? normalize(sig) : normalize({ speed: 1, carve: 1, control: 1, park: 1, powder: 1 });
  // Confidence: enough riding (km) and a clear lean. 15 km of riding ≈ full trust, capped so the
  // mountains always count for at least 40 %.
  const confidence = total > 0 ? Math.min(0.6, clamp01(km / 15) * 0.6 * Math.min(1, total / 0.6)) : 0;
  return { weights, confidence, traits, signals: sig };
}

/** The maps that count: every non-experimental registered map, weighted by how often you ride them. */
export function mountainMix(maps = [], life = {}, confidence = 0) {
  const list = maps.filter((m) => !m.experimental);
  if (!list.length) return { weights: normalize({ speed: 1, carve: 1, control: 1, park: 1, powder: 1 }), n: 0 };
  const rides = life?.maps || {};
  const total = list.reduce((a, m) => a + (Number(rides[m.id]) || 0), 0);
  const w = zero();
  for (const m of list) {
    const share = (1 - confidence) / list.length + (total ? confidence * (Number(rides[m.id]) || 0) / total : confidence / list.length);
    const need = mapNeeds(m);
    for (const k of STAT_IDS) w[k] += share * need[k];
  }
  return { weights: normalize(w), n: list.length };
}

// Picking scores the RAW physics numbers (≈1 = reference), not the stretched 1–10 ruler, through a concave
// utility u(r) = 1 − 1/r: a weakness costs more than the same-sized strength earns, so a balanced piece can
// beat a specialist unless the terrain or the rider really asks for that speciality.
const util = (r) => 1 - 1 / Math.max(0.2, r);
export const scoreOf = (raw, w) => STAT_IDS.reduce((a, k) => a + w[k] * util(raw[k]), 0);

/** Best item for weights `w`, or null when fewer than two different models are owned. */
function pick(list, w) {
  if (new Set(list.map((i) => i.sig)).size < 2) return null;
  const scored = list.map((i) => ({ i, s: scoreOf(i.raw, w) }))
    .sort((a, b) => (b.s - a.s) || (!!b.i.equipped - !!a.i.equipped) || a.i.key.localeCompare(b.i.key));
  return { best: scored[0].i, scores: Object.fromEntries(scored.map((x) => [x.i.key, Math.round(x.s * 1000) / 1000])), scored };
}

const PHRASE = {
  speed: (n) => `${n} holds its speed best`,
  carve: (n) => `${n} carves best`,
  control: (n) => `${n} is the most controllable`,
  park: (n) => `${n} pops and spins best`,
  powder: (n) => `${n} floats best`,
};
// Why the mountains as a whole ask for a stat (all-mountain reasons).
const MOUNTAIN_CAUSE = {
  powder: 'Most mountains here are deep snow',
  park: 'Kickers, drops and rails on most mountains',
  control: 'Steep faces and tight trees everywhere',
  speed: 'Long, fast faces on most mountains',
  carve: 'Lots of groomed, fast pistes',
};
/** Short display name: "Northwake Ridge 172" → "Ridge 172", "★ Twin 168" stays. */
export const shortName = (name) => String(name || '').replace(/^(Northwake Legends|Northwake|Valcrest|Driftline|Jibworks)\s+/, '');

/**
 * The overall pick for one type. `opts` = { maps (registry entries), life (progression lifetime stats),
 * stats (profile stats), mapName(id) → mountain name }. Returns null with fewer than two models owned, else
 * { key, item, reason, source: 'allmountain'|'playstyle'|'favourite', stat, scores, weights, confidence }.
 */
export function recommend(items, { maps = [], life = {}, stats = {}, mapName = (id) => id } = {}) {
  const list = rated(items);
  const play = playstyle(life, stats);
  const c = play.confidence;
  const mtn = mountainMix(maps, life, c);
  const w = {};
  for (const k of STAT_IDS) w[k] = (1 - c) * mtn.weights[k] + c * play.weights[k];
  const res = pick(list, w);
  if (!res) return null;
  const best = res.best;
  // Why: the stat where the pick gains most over the average of the others, and who asked for it.
  const others = list.filter((i) => i.sig !== best.sig);
  let stat = 'speed', gain = -Infinity;
  for (const k of STAT_IDS) {
    const mean = others.reduce((a, i) => a + i.stats[k], 0) / Math.max(1, others.length);
    const g = w[k] * (best.stats[k] - mean);
    if (g > gain) { gain = g; stat = k; }
  }
  const name = shortName(best.name);
  let source = 'allmountain', reason;
  const T = play.traits;
  if (c >= 0.15 && c * play.weights[stat] > (1 - c) * mtn.weights[stat] * 0.6) {
    source = 'playstyle';
    const lead = {
      park: T.grinds > T.spins && T.grinds > T.flips ? 'You grind a lot of rails' : T.flips > T.spins ? 'You throw lots of flips' : 'You land lots of spins',
      speed: `You ride fast (top ${Math.round(T.topKmh)} km/h)`,
      control: 'You wipe out a lot',
      carve: 'You link lots of clean turns',
      powder: 'You ride deep snow',
    }[stat];
    reason = `${lead} → ${PHRASE[stat](name)}`;
  } else if (c >= 0.15 && T.favourite && T.favourite[1] >= 0.4) {
    source = 'favourite';
    const fm = maps.find((m) => m.id === T.favourite[0]);
    const [ter] = mainTerrain(fm || T.favourite[0]);
    reason = `You ride ${mapName(T.favourite[0])} most → ${name} suits its ${TERRAIN_LABEL[ter]}`;
  } else {
    // A specialist that wins on the mountains alone says which terrain made it; a balanced winner is the all-rounder.
    const spread = STAT_IDS.map((k) => best.raw[k]);
    const balanced = Math.max(...spread) - Math.min(...spread) < 0.12;
    reason = balanced || gain < 0.08
      ? `Best all-rounder across ${mtn.n > 1 ? `all ${mtn.n} mountains` : 'the mountain'} → ${name}`
      : `${MOUNTAIN_CAUSE[stat]} → ${PHRASE[stat](name)}`;
  }
  return { key: best.key, item: best, reason, source, stat, scores: res.scores, weights: w, confidence: c };
}

/** The pick for one map only (its terrain and snow). Null with fewer than two models owned. */
export function recommendForMap(items, map) {
  const list = rated(items);
  const res = pick(list, mapNeeds(map));
  if (!res) return null;
  const [a, b] = mainTerrain(map);
  return { key: res.best.key, item: res.best, scores: res.scores, terrain: [a, b].filter(Boolean).map((t) => TERRAIN_LABEL[t]) };
}

/** Rating differences b − a per stat (rounded to 0.1). */
export function statDelta(a, b) {
  const out = {};
  for (const k of STAT_IDS) out[k] = round1((b?.[k] ?? 0) - (a?.[k] ?? 0));
  return out;
}
