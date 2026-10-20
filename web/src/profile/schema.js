// Player profile schema (versioned) and migrations.
//
// Stored as JSON under PROFILE_KEY. Every stored profile carries `version`; loading runs
// migrateProfile(), which upgrades step by step through MIGRATIONS and then sanitizes the result
// against the current catalog, so a profile from any older build (or a hand-edited one) loads.
//
// To change the schema: bump PROFILE_VERSION, add MIGRATIONS[oldVersion] that returns the upgraded
// object, update defaultProfile(), and extend sanitize() for the new fields.
import { SLOTS, EQUIPMENT_TYPES, DEFAULT_EQUIPMENT, getItem, defaultItemFor, defaultVariantFor, unlockState, ownKey } from './catalog.js';
import { defaultRewards, sanitizeRewards, grandfather } from './rewards.js';
import { RETIRED_SKINS } from './items.js';

/** 'item:variant' of a retired skin → its replacement (profile/items.js RETIRED_SKINS); others unchanged. */
const retiredKey = (k) => (Object.hasOwn(RETIRED_SKINS, k) ? RETIRED_SKINS[k] : k);
import { SETTINGS_KEY } from '../state.js';

/** A stored value as a number without calling into hostile objects (a garbled save can hold anything). NaN if not a number / string. */
const num = (v) => (typeof v === 'number' || typeof v === 'string' ? Number(v) : NaN);

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
    p.stats.bestScore = num(legacy?.best) || 0;
    if (typeof legacy?.settings?.resort === 'string') p.map = { id: 'lake-tahoe', variant: { resort: legacy.settings.resort, run: num(legacy.settings.run) || 0 } };
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
  let p = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
  let v = p ? num(p.version) || 0 : 0;
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
  out.stats = { ...d.stats, ...(p.stats && typeof p.stats === 'object' ? p.stats : {}) };
  // Numbers stay numbers (a garbled save must not turn ride counts into strings / NaN).
  for (const [k, v] of Object.entries(d.stats)) if (typeof v === 'number' && !(typeof out.stats[k] === 'number' && Number.isFinite(out.stats[k]))) out.stats[k] = v;
  if (out.stats.lastRideAt !== null && !Number.isFinite(out.stats.lastRideAt)) out.stats.lastRideAt = null;
  for (const [k, v] of Object.entries(out.stats)) if (!Object.hasOwn(d.stats, k) && !Number.isFinite(v)) delete out.stats[k];   // extra counters: numbers only
  out.links = { ...d.links, ...(p.links || {}) };
  out.inventory = { items: {} };
  for (const [k0, v] of Object.entries(p.inventory?.items || {})) {
    // A retired skin becomes its replacement (RETIRED_SKINS); owning both adds the counts.
    const k = retiredKey(k0);
    const [id, vid] = k.split(':');
    const item = getItem(id);
    if (!item || !item.variants.some((x) => x.id === vid)) continue;
    const prev = out.inventory.items[k], n = Math.max(1, num(v?.n) || 1);
    out.inventory.items[k] = prev ? { at: Math.min(prev.at, num(v?.at) || 0), n: prev.n + n, seen: prev.seen && !!v?.seen } : { at: num(v?.at) || 0, n, seen: k === k0 ? !!v?.seen : false };
  }
  out.rewards = sanitizeRewards(p.rewards);
  for (const h of out.rewards.history) h.key = retiredKey(h.key);
  if (out.rewards.best) out.rewards.best = { ...out.rewards.best, key: retiredKey(out.rewards.best.key) };
  delete out.fresh;
  out.unlocks = { items: Array.isArray(p.unlocks?.items) ? p.unlocks.items.filter((x) => typeof x === 'string') : [] };
  out.map = p.map && typeof p.map.id === 'string' ? { id: p.map.id, variant: p.map.variant && typeof p.map.variant === 'object' && typeof p.map.variant.resort === 'string' ? { resort: p.map.variant.resort, run: num(p.map.variant.run) || 0 } : null, trail: typeof p.map.trail === 'string' ? p.map.trail : null } : d.map;
  const lo = p.loadout && typeof p.loadout === 'object' ? p.loadout : {};
  const slots = {};
  for (const slot of Object.keys(SLOTS)) {
    let want = lo.slots?.[slot];
    if (!want || typeof want !== 'object' || typeof want.item !== 'string' || (want.variant != null && typeof want.variant !== 'string')) want = null;   // garbled entry: starter
    // Wearing a retired skin: wear its replacement (it is in the inventory now, see above).
    if (want && Object.hasOwn(RETIRED_SKINS, ownKey(want.item, want.variant))) {
      const [item, variant] = RETIRED_SKINS[ownKey(want.item, want.variant)].split(':');
      want = { item, variant };
    }
    const item = want && getItem(want.item);
    // Reward skins must be owned; anything else falls back to the slot's starter.
    const variant = item && (item.variants.find((v) => v.id === want.variant) ?? defaultVariantFor(item));
    // Same rule as profileStore.equip(): owned skins, explicit unlocks, or items whose stat rule is met.
    const usable = item && item.slot === slot && (!variant.rarity && !variant.starter ? true : unlockState(item, out, variant.id).unlocked);
    if (usable) slots[slot] = { item: item.id, variant: variant.id };
    else if (d.loadout.slots[slot]) slots[slot] = d.loadout.slots[slot];
  }
  out.loadout = { equipment: typeof lo.equipment === 'string' && Object.hasOwn(EQUIPMENT_TYPES, lo.equipment) ? lo.equipment : DEFAULT_EQUIPMENT, slots };
  if (typeof out.displayName !== 'string' || !out.displayName.trim()) out.displayName = d.displayName;
  out.displayName = out.displayName.slice(0, 24);
  return out;
}
