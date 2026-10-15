// Map registry. Every playable place is a map entry; the boot flow loads the selected map through
// here (main.js → loadSelectedMap), so adding a map never touches the game loop.
//
// registerMap({
//   id: 'valcrest-gully',                 unique
//   name: 'Valcrest Gully',
//   description: 'Hand-built powder gully…',
//   thumbnail: 'data:image/svg+xml,…' | '/maps/x.jpg',
//   order: 1,                             sort key in the Maps tab
//   tags: ['handmade'], experimental?: true,
//   variants?: async () => [{ id, name, meta, value }],   optional sub-choices (e.g. runs)
//   describe?: (variantValue) => 'one line for the lobby',
//   load: async ({ variant, onProgress }) => course,     a Course-compatible object (course.js API)
//   lobby?: ({ course, terrain, spawn }) => ({ x, z, heading }),   where the lobby plinth stands and
//                                         which way its camera looks (default: the start, downhill)
// })
import { DEFAULT_MAP_ID } from '../profile/schema.js';

const maps = new Map();

export function registerMap(def) {
  if (!def?.id || !def.name || typeof def.load !== 'function') throw new Error('registerMap: id, name and load() are required');
  const entry = { description: '', thumbnail: null, order: 100, tags: [], experimental: false, variants: null, describe: null, ...def };
  maps.set(entry.id, entry);
  return entry;
}

export const getMap = (id) => maps.get(id) ?? null;
export const listMaps = () => [...maps.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
export { DEFAULT_MAP_ID };

/**
 * Which map to load: URL (?map=<id>, legacy ?resort=<id>&run=<n>) → saved profile choice → default.
 * Returns { id, variant, source }.
 */
export function resolveMapSelection(params, profile) {
  if (params.has('resort')) return { id: 'lake-tahoe', variant: { resort: params.get('resort'), run: Number(params.get('run') || 0) }, source: 'url' };
  if (params.has('map') && getMap(params.get('map'))) return { id: params.get('map'), variant: null, source: 'url' };
  if (profile?.map?.id && getMap(profile.map.id)) return { id: profile.map.id, variant: profile.map.variant ?? null, source: 'profile' };
  return { id: DEFAULT_MAP_ID, variant: null, source: 'default' };
}

/**
 * Load a selection, falling back to the default map if it fails.
 * Resolves { map, variant, course, fellBack }.
 */
export async function loadMap(selection, { onProgress } = {}) {
  const map = getMap(selection.id) ?? getMap(DEFAULT_MAP_ID);
  try {
    const course = await map.load({ variant: selection.variant, onProgress });
    if (!course) throw new Error('map returned no course');
    return { map, variant: selection.variant, course, fellBack: false };
  } catch (e) {
    if (map.id === DEFAULT_MAP_ID) throw e;
    console.warn(`[maps] "${map.id}" failed to load, falling back to ${DEFAULT_MAP_ID}`, e);
    const def = getMap(DEFAULT_MAP_ID);
    return { map: def, variant: null, course: await def.load({ onProgress }), fellBack: true };
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
