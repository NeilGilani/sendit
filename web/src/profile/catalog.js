// Item catalog: data-driven definitions of every cosmetic and piece of gear.
//
// Items live in one registry (registerItem). Each item fills one SLOT; slots belong to a CATEGORY,
// and gear slots belong to an EQUIPMENT type (skis or snowboard). The player's loadout (see
// profile/store.js) stores one item id + variant id per slot.
//
// Item shape (all fields except id/name/slot are optional):
//   {
//     id: 'skis-northwake-carver',          unique, kebab-case
//     name: 'Northwake Carver 168',
//     slot: 'skis',                          one of SLOTS
//     brand, description, tags: [],
//     variants: [{ id, name, colors: { base, accent, trim } }],   first = default colorway
//     stats: { speed, carve, pop, stability },                     0..10, see STATS
//     unlock: { type: 'default' } | { type: 'score' | 'distance' | 'runs', value } | { type: 'locked' }
//     model: { kind: 'builtin' | 'equipment' | 'outfit', ref }   how the 3D model is produced (hint for renderers):
//            'equipment' = a model id from src/equipment (getEquipmentSpec(type, ref)) — the lobby
//            preview and the game rider both ride that model, with its physics (see gearModel()).
//            'outfit' = a garment id from src/character/outfits.js; variant ids are colourway ids.
//   }
// Nothing here renders anything; the lobby and the rider read this data.
import { GARMENTS, COLORWAYS } from '../character/outfits.js';

export const CATEGORIES = {
  outfit: { label: 'Clothing', order: 1 },
  gear: { label: 'Gear', order: 2 },
};

export const SLOTS = {
  helmet: { label: 'Helmet', category: 'outfit', order: 1 },
  goggles: { label: 'Goggles', category: 'outfit', order: 2 },
  jacket: { label: 'Jacket', category: 'outfit', order: 3 },
  gloves: { label: 'Gloves', category: 'outfit', order: 4 },
  pants: { label: 'Pants', category: 'outfit', order: 5 },
  skis: { label: 'Skis', category: 'gear', equipment: 'skis', order: 10 },
  poles: { label: 'Poles', category: 'gear', equipment: 'skis', order: 11 },
  board: { label: 'Board', category: 'gear', equipment: 'snowboard', order: 12 },
  bindings: { label: 'Bindings', category: 'gear', equipment: 'snowboard', order: 13 },
};

/** What you ride. `primary` is the slot shown first in the Equipment tab. */
export const EQUIPMENT_TYPES = {
  skis: { id: 'skis', label: 'Skis', primary: 'skis', slots: ['skis', 'poles'], blurb: 'Two planks and poles. Classic carving.' },
  snowboard: { id: 'snowboard', label: 'Snowboard', primary: 'board', slots: ['board', 'bindings'], blurb: 'One board, sideways stance, surfy turns.' },
};
export const DEFAULT_EQUIPMENT = 'skis';

export const STATS = {
  speed: { label: 'Speed' },
  carve: { label: 'Carve' },
  pop: { label: 'Pop' },
  stability: { label: 'Stability' },
};

const items = new Map();

/** Add (or replace) an item. Returns the normalized item. */
export function registerItem(def) {
  if (!def?.id || !def.name) throw new Error('catalog: item needs id and name');
  const slot = SLOTS[def.slot];
  if (!slot) throw new Error(`catalog: unknown slot "${def.slot}" for ${def.id}`);
  const item = Object.freeze({
    brand: '', description: '', tags: [], stats: {}, unlock: { type: 'default' },
    model: { kind: 'builtin' },
    ...def,
    category: slot.category,
    equipment: slot.equipment ?? null,
    variants: (def.variants?.length ? def.variants : [{ id: 'default', name: 'Default', colors: {} }]).map((v) => Object.freeze({ ...v })),
  });
  items.set(item.id, item);
  return item;
}

export const getItem = (id) => items.get(id) ?? null;

/** Items filtered by any of { slot, category, equipment, tag }, sorted by slot order then name. */
export function listItems(filter = {}) {
  return [...items.values()]
    .filter((i) => (!filter.slot || i.slot === filter.slot)
      && (!filter.category || i.category === filter.category)
      && (!filter.equipment || i.equipment === filter.equipment)
      && (!filter.tag || i.tags.includes(filter.tag)))
    .sort((a, b) => (SLOTS[a.slot].order - SLOTS[b.slot].order) || a.name.localeCompare(b.name));
}

/**
 * The equipment model to ride for an item: its `model.ref` when it is an src/equipment model
 * (kind 'equipment'), else undefined (the rider's default model for the type).
 */
export const gearModel = (item) => (item?.model?.kind === 'equipment' && item.model.ref) || undefined;

/** The first default-unlocked item for a slot (used to build fresh loadouts). */
export function defaultItemFor(slot) {
  return listItems({ slot }).find((i) => i.unlock.type === 'default') ?? listItems({ slot })[0] ?? null;
}

export const getVariant = (item, variantId) => item?.variants.find((v) => v.id === variantId) ?? item?.variants[0] ?? null;

/**
 * Unlock state for a profile: { unlocked, progress 0..1, label }.
 * Explicit unlocks (profile.unlocks.items) always win; otherwise the rule is checked against stats.
 */
export function unlockState(item, profile) {
  const u = item.unlock || { type: 'default' };
  if (u.type === 'default' || profile?.unlocks?.items?.includes(item.id)) return { unlocked: true, progress: 1, label: 'Unlocked' };
  const s = profile?.stats || {};
  const have = { score: s.bestScore || 0, distance: s.distance || 0, runs: s.runsCompleted || 0 }[u.type];
  if (have === undefined) return { unlocked: false, progress: 0, label: 'Locked' };
  const progress = Math.min(1, have / Math.max(1, u.value));
  const label = { score: `Best score ${u.value}`, distance: `Ride ${(u.value / 1000).toFixed(0)} km`, runs: `Finish ${u.value} runs` }[u.type];
  return { unlocked: progress >= 1, progress, label };
}

// ---------------------------------------------------------------- the first entries
// The rider's clothing (src/character) and starter gear.
const NW = 'Northwake';   // fictional house brand used on banners and the suit

// Clothing: one catalog item per garment in character/outfits.js, one variant per colourway. The
// rider reads item.model.ref (the garment) and the variant id (the colourway) — see character/profile.js.
const CLOTHING = [
  { slot: 'helmet', id: 'helmet-tuff', garment: 'tuff-helmet' },
  { slot: 'goggles', id: 'goggles-tuff', garment: 'tuff-goggle' },
  { slot: 'jacket', id: 'jacket-tuff-shell', garment: 'tuff-shell' },
  { slot: 'jacket', id: 'jacket-tuff-shell-hood', garment: 'storm-shell' },
  { slot: 'gloves', id: 'gloves-tuff-mitt', garment: 'tuff-mitt' },
  { slot: 'pants', id: 'pants-tuff-bib', garment: 'tuff-bib' },
];
for (const { slot, id, garment } of CLOTHING) {
  const g = GARMENTS[slot][garment];
  registerItem({
    id, name: g.name, slot, brand: NW, description: g.blurb,
    variants: Object.entries(COLORWAYS).map(([cw, c]) => ({ id: cw, name: c.name, colors: c[slot] })),
    model: { kind: 'outfit', ref: garment },
  });
}
// Starter gear = the default models of src/equipment/specs.js (names and looks match what you ride).
registerItem({
  id: 'skis-northwake-carver', name: 'Northwake Ridge 172', slot: 'skis', brand: NW,
  description: 'Do-everything all-mountain ski with cyan neon edges. Quick edge to edge.',
  variants: [{ id: 'classic', name: 'Classic', colors: { base: '#141238', accent: '#ff4f8c', trim: '#1affd9' } }],
  stats: { speed: 7, carve: 7, pop: 6, stability: 7 },
  model: { kind: 'equipment', ref: 'allmountain' },
  tags: ['starter'],
});
registerItem({
  id: 'poles-northwake-alloy', name: 'Alloy Poles', slot: 'poles', brand: NW,
  variants: [{ id: 'pink', name: 'Pink', colors: { base: '#ff3d80' } }],
  model: { kind: 'builtin', ref: 'rider.poles' },
});
registerItem({
  id: 'board-northwake-twin', name: 'Northwake Atlas 156', slot: 'board', brand: NW,
  description: 'Directional-twin camber board for the whole mountain. Lively pop, holds an edge.',
  variants: [{ id: 'sunset', name: 'Sunset', colors: { base: '#2a2470', accent: '#ff4f8c', trim: '#1affd9' } }],
  stats: { speed: 6, carve: 7, pop: 7, stability: 6 },
  model: { kind: 'equipment', ref: 'allmountain' },
  tags: ['starter'],
});
registerItem({
  id: 'bindings-northwake-strap', name: 'Strap Bindings', slot: 'bindings', brand: NW,
  variants: [{ id: 'black', name: 'Black', colors: { base: '#141a3c', accent: '#2ff5d6' } }],
  model: { kind: 'equipment', ref: 'bindings' },
});
