// Map registry. Every playable place is a map entry; the boot flow loads the selected map through
// here (main.js → loadSelectedMap), so adding a map never touches the game loop. Maps belong to a
// MOUNTAIN (what the lobby's mountain browser shows as a card) and offer TRAILS (named starts the
// player picks straight from the lobby). Full contract: docs/maps.md.
//
// registerMap({
//   id: 'valcrest-gully',                 unique
//   name: 'Valcrest Gully',
//   description: 'Hand-built powder gully…',
//   thumbnail: 'data:image/svg+xml,…' | '/maps/x.jpg',
//   order: 1,                             sort key in the Maps tab
//   tags: ['handmade'], experimental?: true,
//   mountain: { id, name, region, blurb, accent },   which mountain card this map sits under
//                                         (default: a mountain of its own named after the map)
//   trails: [{ id, name, difficulty, description, length?, vertical?, featured?, group?, variant?, dropZone?, at? }],
//                                         STATIC data (the lobby lists trails without loading the map).
//                                         difficulty: 'green' | 'blue' | 'black' | 'double-black' | 'park'.
//                                         The first trail is the map's default start. dropZone: the name of
//                                         one of course.dropZones to start at (when trailSpawn has no answer);
//                                         at: { x, z, heading } static world start (last resort before the spawn).
//   variants?: async () => [{ id, name, meta, value }],   optional sub-choices (e.g. runs)
//   describe?: (variantValue) => 'one line for the lobby',
//   load: async ({ variant, trail, onProgress }) => course,   a Course-compatible object (course.js API)
//   lobby?: ({ course, terrain, spawn }) => ({ x, z, heading }),   where the lobby plinth stands and
//                                         which way its camera looks (default: the start, downhill)
// })
//
// The loaded course may implement:
//   course.trailSpawn(trailId) → { x, z, heading } | null    the trail's top (null/absent → default spawn)
//   course.trailFinish(trailId) → { x, z, radius } | { progress } | null   optional custom finish
import { DEFAULT_MAP_ID } from '../profile/schema.js';

const maps = new Map();

/** Trail difficulty ratings, easiest first. `rank` sorts; `label` is the long name. */
export const DIFFICULTIES = Object.freeze({
  green: Object.freeze({ id: 'green', rank: 0, short: 'Green', label: 'Easiest', color: '#3fbf6a' }),
  blue: Object.freeze({ id: 'blue', rank: 1, short: 'Blue', label: 'More difficult', color: '#3b82f6' }),
  black: Object.freeze({ id: 'black', rank: 2, short: 'Black', label: 'Most difficult', color: '#11151c' }),
  'double-black': Object.freeze({ id: 'double-black', rank: 3, short: 'Double black', label: 'Experts only', color: '#11151c' }),
  park: Object.freeze({ id: 'park', rank: 4, short: 'Park', label: 'Terrain park', color: '#f28a1b' }),
});
export const DIFFICULTY_IDS = Object.keys(DIFFICULTIES);
const DEFAULT_ACCENT = '#5fa8ff';

function normMountain(def) {
  const m = def.mountain || {};
  return Object.freeze({
    id: String(m.id || def.id),
    name: String(m.name || def.name),
    region: String(m.region || ''),
    blurb: String(m.blurb || def.description || ''),
    accent: String(m.accent || DEFAULT_ACCENT),
  });
}

function normTrails(def) {
  const raw = Array.isArray(def.trails) && def.trails.length ? def.trails
    : [{ id: 'main', name: def.name, difficulty: 'blue', description: def.description || '', featured: true }];
  const seen = new Set();
  const out = [];
  for (const t of raw) {
    if (!t?.id || seen.has(String(t.id))) { console.warn(`[maps] "${def.id}": trail without a unique id skipped`, t); continue; }
    seen.add(String(t.id));
    let difficulty = t.difficulty;
    if (!DIFFICULTIES[difficulty]) { console.warn(`[maps] "${def.id}" trail "${t.id}": unknown difficulty "${difficulty}", using blue`); difficulty = 'blue'; }
    out.push(Object.freeze({
      ...t,
      id: String(t.id), name: String(t.name || t.id), difficulty, description: String(t.description || ''),
      length: Number.isFinite(t.length) ? t.length : null, vertical: Number.isFinite(t.vertical) ? t.vertical : null,
      featured: !!t.featured, group: t.group ? String(t.group) : null, variant: t.variant ?? null,
      mapId: def.id,
    }));
  }
  return Object.freeze(out);
}

export function registerMap(def) {
  if (!def?.id || !def.name || typeof def.load !== 'function') throw new Error('registerMap: id, name and load() are required');
  const entry = { description: '', thumbnail: null, order: 100, tags: [], experimental: false, variants: null, describe: null, ...def };
  entry.declared = { mountain: !!def.mountain, trails: Array.isArray(def.trails) && def.trails.length > 0 };
  entry.mountain = normMountain(def);
  entry.trails = normTrails(def);
  maps.set(entry.id, entry);
  return entry;
}

/**
 * Adapter for a map whose registerMap call lives elsewhere: gives it `mountain` / `trails` (and any
 * `extra` fields) only where its own registration did not declare them, so the owner's data wins.
 */
export function adaptMap(id, { mountain, trails, ...extra } = {}) {
  const m = maps.get(id);
  if (!m) return null;
  return registerMap({
    ...m,
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => m[k] == null)),
    mountain: m.declared.mountain ? m.mountain : mountain,
    trails: m.declared.trails ? m.trails : trails,
  });
}

export const getMap = (id) => maps.get(id) ?? null;
export const listMaps = () => [...maps.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
export { DEFAULT_MAP_ID };

/** A map's trail by id, or null. */
export function getTrail(mapOrId, trailId) {
  const map = typeof mapOrId === 'string' ? getMap(mapOrId) : mapOrId;
  if (!map || trailId == null) return null;
  return map.trails.find((t) => t.id === String(trailId)) ?? null;
}

/** The map's default trail (its first). */
export const defaultTrail = (mapOrId) => {
  const map = typeof mapOrId === 'string' ? getMap(mapOrId) : mapOrId;
  return map?.trails[0] ?? null;
};

/** The trail whose `variant` matches (Lake Tahoe: { resort, run }), or null. */
export function trailForVariant(map, variant) {
  if (!map || variant == null) return null;
  const key = JSON.stringify(variant);
  return map.trails.find((t) => t.variant != null && JSON.stringify(t.variant) === key) ?? null;
}

/**
 * Mountains for the lobby's browser, in map order: [{ id, name, region, blurb, accent, maps: [map],
 * trails: [trail (with mapId)], spread: { green: n, blue: n, … }, order }].
 */
export function listMountains() {
  const out = new Map();
  for (const map of listMaps()) {
    const m = map.mountain;
    if (!out.has(m.id)) out.set(m.id, { ...m, maps: [], trails: [], spread: Object.fromEntries(DIFFICULTY_IDS.map((d) => [d, 0])), order: map.order, experimental: true, thumbnail: map.thumbnail });
    const e = out.get(m.id);
    e.maps.push(map);
    e.experimental = e.experimental && !!map.experimental;
    for (const t of map.trails) { e.trails.push(t); e.spread[t.difficulty] += 1; }
  }
  return [...out.values()];
}

/**
 * The map's picture rendered by the game itself (scripts/mountainshots.mjs → assets/maps/<id>.webp,
 * docs/maps.md). Callers keep `thumbnail` underneath as the fallback when the file is missing.
 */
export const mapShot = (mapId) => `/maps/${mapId}.webp`;

export const getMountain = (id) => listMountains().find((m) => m.id === id) ?? null;

/**
 * Which map (and trail) to load: URL (?map=<id>&trail=<trailId>, legacy ?resort=<id>&run=<n>) →
 * saved profile choice → default. A trail with a `variant` brings its variant along.
 * Returns { id, variant, trail, source } (trail = trail id, always one of the map's trails).
 */
export function resolveMapSelection(params, profile) {
  let sel;
  if (params.has('resort')) sel = { id: 'lake-tahoe', variant: { resort: params.get('resort'), run: Number(params.get('run') || 0) }, trail: params.get('trail'), source: 'url' };
  else if (params.has('map') && getMap(params.get('map'))) sel = { id: params.get('map'), variant: null, trail: params.get('trail'), source: 'url' };
  else if (profile?.map?.id && getMap(profile.map.id)) {
    sel = { id: profile.map.id, variant: profile.map.variant ?? null, trail: params.get('trail') ?? profile.map.trail ?? null, source: 'profile' };
  } else sel = { id: DEFAULT_MAP_ID, variant: null, trail: params.get('trail'), source: 'default' };
  return withTrail(sel);
}

/** Fill in / reconcile `trail` and `variant` for a selection { id, variant?, trail? }. */
export function withTrail(sel) {
  const map = getMap(sel.id);
  if (!map) return { ...sel, trail: null };
  // A valid explicit trail wins (and brings its variant); else the trail matching the variant; else the default.
  const explicit = getTrail(map, sel.trail), byVariant = trailForVariant(map, sel.variant);
  if (!explicit && !byVariant && sel.variant != null) return { ...sel, trail: null };   // a variant no trail names (old data)
  const trail = explicit ?? byVariant ?? defaultTrail(map);
  const variant = trail?.variant ?? sel.variant ?? null;
  return { ...sel, variant, trail: trail?.id ?? null };
}

/** True when riding `trailId` on the loaded selection needs the page to reload (other map / other variant). */
export function needsReload(current, mapId, trailId) {
  if (!current || current.map.id !== mapId) return true;
  const t = getTrail(mapId, trailId);
  if (t?.variant == null) return false;
  return JSON.stringify(t.variant) !== JSON.stringify(current.variant ?? null);
}

/** The URL query for a map + trail: `?map=<id>&trail=<trailId>` (other debug params dropped). */
export function selectionQuery(mapId, trailId, base = '') {
  const q = new URLSearchParams(base);
  for (const k of ['map', 'trail', 'resort', 'run', 'kicker', 'at', 'ride', 'challenge']) q.delete(k);
  q.set('map', mapId);
  if (trailId) q.set('trail', trailId);
  return q;
}

/**
 * Where a trail starts on a loaded course: { x, z, heading, fallback }. Asks course.trailSpawn(trailId),
 * then (if the trail names one) the course's drop zone `trail.dropZone` (exact name, else the first
 * name starting with it, case-insensitive), then `trail.at`; anything missing or invalid falls back to `fallback`
 * (the terrain's default spawn, { position, heading }).
 */
export function trailSpawnFor(course, trailId, fallback, trail = null) {
  const base = { x: fallback.position.x, z: fallback.position.z, heading: fallback.heading ?? 0, fallback: true };
  if (!trailId) return base;
  const ok = (s) => s && Number.isFinite(s.x) && Number.isFinite(s.z);
  const out = (s) => ({ x: s.x, z: s.z, heading: Number.isFinite(s.heading) ? s.heading : base.heading, fallback: false });
  if (typeof course?.trailSpawn === 'function') {
    try {
      const s = course.trailSpawn(trailId);
      if (ok(s)) return out(s);
    } catch (e) { console.warn(`[maps] trailSpawn("${trailId}") failed; using the default spawn`, e); }
  }
  const dz = trail?.dropZone && findDropZone(course, trail.dropZone);
  if (ok(dz)) return out(dz);
  return ok(trail?.at) ? out(trail.at) : base;
}

/** A course drop zone by name: exact (case-insensitive), else the first whose name starts with it. */
export function findDropZone(course, name) {
  const zones = Array.isArray(course?.dropZones) ? course.dropZones : [];
  const n = String(name).toLowerCase();
  return zones.find((z) => String(z.name).toLowerCase() === n) ?? zones.find((z) => String(z.name).toLowerCase().startsWith(n)) ?? null;
}

/** A trail's custom finish from course.trailFinish(trailId), or null (use the course's own finish). */
export function trailFinishFor(course, trailId) {
  if (!trailId || typeof course?.trailFinish !== 'function') return null;
  try {
    const f = course.trailFinish(trailId);
    if (f && Number.isFinite(f.x) && Number.isFinite(f.z)) return { x: f.x, z: f.z, radius: Number.isFinite(f.radius) ? f.radius : 30 };
    if (f && Number.isFinite(f.progress)) return { progress: f.progress };
  } catch (e) { console.warn(`[maps] trailFinish("${trailId}") failed`, e); }
  return null;
}

/**
 * Leaderboard board id for a trail: `<map>/<trail>`. Every ride also lands on the map's own board
 * (`<map>`, the Leaderboards tab), so this one holds only that trail's rides.
 */
export function trailBoardId(mapId, trailId) {
  const t = getTrail(mapId, trailId) ?? defaultTrail(mapId);
  return t ? `${mapId}/${t.id}` : mapId;
}

/**
 * Load a selection, falling back to the default map if it fails.
 * Resolves { map, variant, trail, course, fellBack }.
 */
export async function loadMap(selection, { onProgress } = {}) {
  const map = getMap(selection.id) ?? getMap(DEFAULT_MAP_ID);
  try {
    const course = await map.load({ variant: selection.variant, trail: selection.trail ?? null, onProgress });
    if (!course) throw new Error('map returned no course');
    return { map, variant: selection.variant, trail: getTrail(map, selection.trail)?.id ?? defaultTrail(map)?.id ?? null, course, fellBack: false };
  } catch (e) {
    if (map.id === DEFAULT_MAP_ID) throw e;
    console.warn(`[maps] "${map.id}" failed to load, falling back to ${DEFAULT_MAP_ID}`, e);
    const def = getMap(DEFAULT_MAP_ID);
    return { map: def, variant: null, trail: defaultTrail(def)?.id ?? null, course: await def.load({ onProgress }), fellBack: true };
  }
}

/**
 * Where the lobby stands on a loaded map: { x, z, heading } with heading = the camera's view yaw
 * (0 = looking −Z). Default: a little way down the run (past the start banner), looking down it,
 * so the run, the trees and the valley are the backdrop. A map can override it with
 * `lobby({ course, terrain, spawn })`.
 */
export const LOBBY_ALONG = 40;     // m down the course path from its start

export function lobbySpot(map, course, terrain) {
  const spawn = terrain.getSpawn();
  let fallback = { x: spawn.position.x, z: spawn.position.z, heading: spawn.heading ?? 0 };
  const onPath = course?.path?.length > 2 ? alongPath(course.path, LOBBY_ALONG) : null;
  if (onPath) fallback = { ...onPath, heading: openView(terrain, onPath) };
  if (typeof map?.lobby !== 'function') return fallback;
  try {
    const s = map.lobby({ course, terrain, spawn });
    if (s && Number.isFinite(s.x) && Number.isFinite(s.z)) return { heading: fallback.heading, ...s };
  } catch (e) { console.warn(`[maps] "${map.id}" lobby() failed; using the default spot`, e); }
  return fallback;
}

/**
 * The view direction near `heading` (±0.6 rad) that looks out the most: where the terrain ahead
 * drops furthest below the spot (down the valley rather than into a wall), gently preferring the
 * fall line.
 */
function openView(terrain, { x, z, heading }) {
  const h0 = terrain.getHeight(x, z);
  let best = heading, bestScore = -Infinity;
  for (let k = -6; k <= 6; k++) {
    const h = heading + k * 0.1;
    const dx = -Math.sin(h), dz = -Math.cos(h);
    let drop = 0;
    for (const d of [40, 90, 160, 260, 400]) drop += h0 - terrain.getHeight(x + dx * d, z + dz * d);
    const score = drop / 5 - Math.abs(k) * 4;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return best;
}

/** Point `d` metres along a polyline of {x, y} (y = world z), facing along it (averaged over ~25 m). */
function alongPath(path, d) {
  const walk = (dist) => {
    let acc = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i], b = path[i + 1];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= dist || i === path.length - 2) {
        const t = seg > 0 ? Math.min(1, Math.max(0, (dist - acc) / seg)) : 0;
        return { x: a.x + (b.x - a.x) * t, z: a.y + (b.y - a.y) * t };
      }
      acc += seg;
    }
    return { x: path[0].x, z: path[0].y };
  };
  const p = walk(d), q = walk(d + 25);
  const dx = q.x - p.x, dz = q.z - p.z;
  if (!Number.isFinite(p.x) || Math.hypot(dx, dz) < 1e-3) return null;
  return { x: p.x, z: p.z, heading: Math.atan2(-dx, -dz) };
}

/** One-line description of a map selection for the lobby. */
export function describeSelection(map, variant, course) {
  if (map.describe) return map.describe(variant, course);
  return map.description;
}
