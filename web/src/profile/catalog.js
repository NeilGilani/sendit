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
//     variants: [{ id, name, colors: { base, accent, trim }, rarity?, series?, starter? }],   first = default colorway
//              a variant with a `rarity` is a reward skin: owned only once earned (profile.inventory),
//              unless `starter` (see profile/items.js, profile/rewards.js)
//     stats: { speed, carve, pop, stability },                     0..10, see STATS
//     unlock: { type: 'default' } | { type: 'score' | 'distance' | 'runs', value } | { type: 'locked' }
//             | { type: 'case' }   (only through owned reward variants)
//     model: { kind: 'builtin' | 'equipment' | 'outfit', ref }   how the 3D model is produced (hint for renderers):
//            'equipment' = a model id from src/equipment (getEquipmentSpec(type, ref)) — the lobby
//            preview and the game rider both ride that model, with its physics (see gearModel()).
//            'outfit' = a garment id from src/character/outfits.js; variant ids are colourway ids.
//   }
// Nothing here renders anything; the lobby and the rider read this data.
import { GARMENTS } from '../character/outfits.js';
import { CLOTHING_ITEMS, GEAR_ITEMS, GOLD_ITEMS } from './items.js';

export const CATEGORIES = {
  outfit: { label: 'Clothing', order: 1 },
  gear: { label: 'Gear', order: 2 },
};

export const SLOTS = {
  helmet: { label: 'Helmet', category: 'outfit', order: 1 },
  goggles: { label: 'Goggles', category: 'outfit', order: 2 },
  face: { label: 'Face', category: 'outfit', order: 2.5 },
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
  return listItems({ slot }).find((i) => i.unlock.type === 'default' && i.variants.some((v) => v.starter))
    ?? listItems({ slot }).find((i) => i.unlock.type === 'default') ?? listItems({ slot })[0] ?? null;
}
/** The variant a fresh loadout wears: the item's starter variant, else its first. */
export const defaultVariantFor = (item) => item?.variants.find((v) => v.starter) ?? item?.variants[0] ?? null;

export const getVariant = (item, variantId) => item?.variants.find((v) => v.id === variantId) ?? item?.variants[0] ?? null;

/** Inventory key of one skin. */
export const ownKey = (itemId, variantId) => `${itemId}:${variantId}`;
/** True if the profile owns this skin (earned it, or it is a starter variant). */
export function ownsVariant(profile, item, variant) {
  if (!item || !variant) return false;
  if (variant.starter) return true;
  return !!profile?.inventory?.items?.[ownKey(item.id, variant.id)];
}
/** Reward skins (variants with a rarity) as [{ item, variant }]. */
export function rewardSkins() {
  const out = [];
  for (const item of items.values()) for (const variant of item.variants) if (variant.rarity && !variant.starter) out.push({ item, variant });
  return out;
}

/**
 * Unlock state for a profile: { unlocked, progress 0..1, label }.
 * With `variantId` it is the state of that skin: a reward variant is unlocked once owned. Without it,
 * an item is unlocked when any of its variants is. Explicit unlocks (profile.unlocks.items) always win;
 * otherwise the item's rule is checked against stats.
 */
export function unlockState(item, profile, variantId) {
  const u = item.unlock || { type: 'default' };
  if (profile?.unlocks?.items?.includes(item.id)) return { unlocked: true, progress: 1, label: 'Unlocked' };
  const rewards = item.variants?.some((v) => v.rarity || v.starter);
  if (rewards) {
    const vs = variantId ? [getVariant(item, variantId)] : item.variants;
    const own = vs.some((v) => ownsVariant(profile, item, v));
    return { unlocked: own, progress: own ? 1 : 0, label: own ? 'Owned' : 'Earn it from a case' };
  }
  if (u.type === 'default') return { unlocked: true, progress: 1, label: 'Unlocked' };
  const s = profile?.stats || {};
  const have = { score: s.bestScore || 0, distance: s.distance || 0, runs: s.runsCompleted || 0 }[u.type];
  if (have === undefined) return { unlocked: false, progress: 0, label: 'Locked' };
  const progress = Math.min(1, have / Math.max(1, u.value));
  const label = { score: `Best score ${u.value}`, distance: `Ride ${(u.value / 1000).toFixed(0)} km`, runs: `Finish ${u.value} runs` }[u.type];
  return { unlocked: progress >= 1, progress, label };
}

// ---------------------------------------------------------------- the entries
// Clothing and gear skins live in profile/items.js (rarity, case series, looks). A rider starts with
// the variants marked `starter` (the plain Rental kit, the stock skis and board) and earns the rest
// from cases (profile/rewards.js). Clothing: item.model.ref = the garment, variant id = the colourway
// (or a skin laid over the Rental colourway) — the rider reads them in character/profile.js.
const NW = 'Northwake';   // fictional house brand used on banners and the suit

for (const def of CLOTHING_ITEMS) {
  const g = GARMENTS[def.slot][def.garment];
  registerItem({
    id: def.id, name: def.name, slot: def.slot, brand: NW, description: def.description || g.blurb,
    variants: def.variants.map((v) => ({ ...v, colors: { ...v.colors } })),
    model: { kind: 'outfit', ref: def.garment },
    unlock: { type: def.unlock === 'default' ? 'default' : 'case' },
  });
}
const STOCK_STATS = Object.fromEntries(GEAR_ITEMS.map((g) => [`${g.slot}:${g.model}`, g.stats]));
for (const g of [...GEAR_ITEMS, ...GOLD_ITEMS]) {
  registerItem({
    id: g.id, name: g.name, slot: g.slot, brand: g.brand, description: g.description,
    variants: [{ ...g.variant, rarity: g.rarity, series: g.series, starter: !!g.starter }],
    stats: g.stats || STOCK_STATS[`${g.slot}:${g.base}`] || {},
    model: { kind: 'equipment', ref: g.model },
    unlock: { type: g.starter ? 'default' : 'case' },
    tags: g.starter ? ['starter'] : g.rarity === 'gold' ? ['legendary'] : [],
  });
}
registerItem({
  id: 'poles-northwake-alloy', name: 'Alloy Poles', slot: 'poles', brand: NW,
  variants: [{ id: 'pink', name: 'Pink', starter: true, colors: { base: '#ff3d80' } }],
  model: { kind: 'builtin', ref: 'rider.poles' },
});
registerItem({
  id: 'bindings-northwake-strap', name: 'Strap Bindings', slot: 'bindings', brand: NW,
  variants: [{ id: 'black', name: 'Black', starter: true, colors: { base: '#141a3c', accent: '#2ff5d6' } }],
  model: { kind: 'equipment', ref: 'bindings' },
});
