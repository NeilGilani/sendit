// Player profile schema (versioned) and migrations.
//
// Stored as JSON under PROFILE_KEY. Every stored profile carries `version`; loading runs
// migrateProfile(), which upgrades step by step through MIGRATIONS and then sanitizes the result
// against the current catalog, so a profile from any older build (or a hand-edited one) loads.
//
// To change the schema: bump PROFILE_VERSION, add MIGRATIONS[oldVersion] that returns the upgraded
// object, update defaultProfile(), and extend sanitize() for the new fields.
import { SLOTS, EQUIPMENT_TYPES, DEFAULT_EQUIPMENT, getItem, defaultItemFor, defaultVariantFor, ownsVariant } from './catalog.js';
import { defaultRewards, sanitizeRewards, grandfather } from './rewards.js';
import { SETTINGS_KEY } from '../state.js';

export const PROFILE_KEY = 'sendit.profile';
export const PROFILE_VERSION = 2;
export const DEFAULT_MAP_ID = 'valcrest-gully';

/** A fresh profile with the default loadout (first default item for every slot). */
export function defaultProfile(now = Date.now()) {
  return {
    version: PROFILE_VERSION,
    identityId: null,               // set from the identity service (services/identity.js)
    displayName: 'Rider',
    createdAt: now,
    updatedAt: now,
    loadout: { equipment: DEFAULT_EQUIPMENT, slots: defaultSlots() },
    map: { id: DEFAULT_MAP_ID, variant: null, trail: null },   // trail: maps/registry.js trail id (docs/maps.md)
    links: { settings: SETTINGS_KEY },   // settings stay in state.js; the profile only links to them
    stats: {
      rides: 0, runsCompleted: 0, distance: 0, airTime: 0, smoothTurns: 0,
      bestScore: 0, totalScore: 0, playTime: 0, lastRideAt: null,
    },
    unlocks: { items: [] },
    // v2: earned skins and the case system (profile/rewards.js). items: { 'itemId:variantId': { at, n, seen } }
    inventory: { items: {} },
    rewards: defaultRewards(),
  };
}

function defaultSlots() {
  const slots = {};
  for (const slot of Object.keys(SLOTS)) {
    const item = defaultItemFor(slot);
    if (item) slots[slot] = { item: item.id, variant: defaultVariantFor(item).id };
  }
  return slots;
}

/**
 * Upgrades, keyed by the version they upgrade FROM. Version 0 means "no profile yet": it builds the
 * first profile from pre-lobby localStorage keys (best score, chosen mountain).
 */
export const MIGRATIONS = {
  0: (_old, legacy = {}) => {
    const p = defaultProfile();
    p.stats.bestScore = Number(legacy.best) || 0;
    if (legacy.settings?.resort) p.map = { id: 'lake-tahoe', variant: { resort: legacy.settings.resort, run: Number(legacy.settings.run) || 0 } };
    p.fresh = true;   // a brand-new rider: v1 → v2 grants nothing
    return p;
  },
  // v1 → v2: the case system. Everyone now starts with the plain Rental kit and earns the rest. A rider
  // from before keeps what they were wearing (those skins go into the inventory) and gets a welcome
  // case plus up to three cases for the riding they already did (rewards.js grandfather()).
  1: (old) => {
    const p = { ...old, inventory: { items: {} }, rewards: defaultRewards() };
    if (old.fresh) { delete p.fresh; return p; }
    grandfather(p, old);
    return p;
  },
};

/**
 * Bring any stored value up to PROFILE_VERSION. `legacy` = { best, settings } from old keys.
 * Returns { profile, from, migrated }.
 */
export function migrateProfile(raw, legacy = {}) {
  let p = raw && typeof raw === 'object' ? raw : null;
  let v = p ? Number(p.version) || 0 : 0;
  const from = v;
  if (v > PROFILE_VERSION) {
    // Written by a newer build: keep what we understand rather than wiping it.
    console.warn(`[profile] version ${v} is newer than ${PROFILE_VERSION}; loading compatible fields only`);
    v = PROFILE_VERSION;
  }
  while (v < PROFILE_VERSION) {
    const step = MIGRATIONS[v];
    if (!step) { p = defaultProfile(); break; }
    p = step(p, legacy);
    v = p.version = v + 1;
  }
  return { profile: sanitize(p), from, migrated: from !== PROFILE_VERSION };
}

/** Fill gaps and drop invalid values so the rest of the game can trust the profile. */
export function sanitize(p) {
  const d = defaultProfile();
  const out = { ...d, ...p, version: PROFILE_VERSION };
  out.stats = { ...d.stats, ...(p.stats || {}) };
  out.links = { ...d.links, ...(p.links || {}) };
  out.inventory = { items: {} };
  for (const [k, v] of Object.entries(p.inventory?.items || {})) {
    const [id, vid] = k.split(':');
    const item = getItem(id);
    if (item && item.variants.some((x) => x.id === vid)) out.inventory.items[k] = { at: Number(v?.at) || 0, n: Math.max(1, Number(v?.n) || 1), seen: !!v?.seen };
  }
  out.rewards = sanitizeRewards(p.rewards);
  delete out.fresh;
  out.unlocks = { items: Array.isArray(p.unlocks?.items) ? p.unlocks.items.filter((x) => typeof x === 'string') : [] };
  out.map = p.map && typeof p.map.id === 'string' ? { id: p.map.id, variant: p.map.variant ?? null, trail: typeof p.map.trail === 'string' ? p.map.trail : null } : d.map;
  const lo = p.loadout || {};
  const slots = {};
  for (const slot of Object.keys(SLOTS)) {
    const want = lo.slots?.[slot];
    const item = want && getItem(want.item);
    // Reward skins must be owned; anything else falls back to the slot's starter.
    const variant = item && (item.variants.find((v) => v.id === want.variant) ?? defaultVariantFor(item));
    const usable = item && item.slot === slot && (!variant.rarity && !variant.starter ? true : ownsVariant(out, item, variant));
    if (usable) slots[slot] = { item: item.id, variant: variant.id };
    else if (d.loadout.slots[slot]) slots[slot] = d.loadout.slots[slot];
  }
  out.loadout = { equipment: EQUIPMENT_TYPES[lo.equipment] ? lo.equipment : DEFAULT_EQUIPMENT, slots };
  if (typeof out.displayName !== 'string' || !out.displayName.trim()) out.displayName = d.displayName;
  out.displayName = out.displayName.slice(0, 24);
  return out;
}
