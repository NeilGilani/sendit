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

/** One-line description of a map selection for the lobby. */
export function describeSelection(map, variant, course) {
  if (map.describe) return map.describe(variant, course);
  return map.description;
}
