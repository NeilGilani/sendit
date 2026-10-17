// Profile + loadout store: the single owner of the persisted player profile.
//
// Reads/writes through services/storage.js, migrates on load (profile/schema.js) and announces
// every change on the state.js event bus:
//   'profile'  { profile, reason }                       any change (stats, map, name, unlocks, loadout)
//   'loadout'  { equipment, slot, item, variant, reason } equipment type or an equipped item changed
// UI and gameplay never write localStorage directly; they call these methods.
import { emit } from '../state.js';
import { storage } from '../services/storage.js';
import { PROFILE_KEY, migrateProfile, sanitize, defaultProfile } from './schema.js';
import { SLOTS, EQUIPMENT_TYPES, getItem, getVariant, unlockState, gearModel } from './catalog.js';

class ProfileStore {
  constructor(store) {
    this.storage = store;
    this.data = null;
    // Keep several open tabs in sync.
    globalThis.addEventListener?.('storage', (e) => {
      if (e.key !== PROFILE_KEY || !this.data) return;
      this.load();
      emit('profile', { profile: this.data, reason: 'sync' });
      emit('loadout', { equipment: this.data.loadout.equipment, slot: null, reason: 'sync' });
    });
  }

  /** Load (and migrate) from storage. Safe to call again. */
  load() {
    const raw = this.storage.get(PROFILE_KEY);
    const legacy = { best: this.storage.getRaw('sendit.best'), settings: this.storage.get('sendit.settings', {}) };
    const { profile, migrated, from } = migrateProfile(raw, legacy);
    this.data = profile;
    if (migrated) {
      if (raw) console.info(`[profile] migrated v${from} → v${profile.version}`);
      this.save();
    }
    return this.data;
  }

  get profile() { return this.data ?? this.load(); }

  save() {
    this.profile.updatedAt = Date.now();
    this.storage.set(PROFILE_KEY, this.profile);
  }

  /** Apply `fn(profile)`, sanitize, persist and emit 'profile'. */
  update(fn, reason = 'update') {
    fn(this.profile);
    this.data = sanitize(this.profile);
    this.save();
    emit('profile', { profile: this.data, reason });
    return this.data;
  }

  // ------------------------------------------------------------ loadout
  get equipment() { return this.profile.loadout.equipment; }

  /** Switch what you ride: 'skis' | 'snowboard'. */
  setEquipment(type) {
    if (!EQUIPMENT_TYPES[type]) throw new Error(`unknown equipment type "${type}"`);
    if (type === this.equipment) return false;
    this.update((p) => { p.loadout.equipment = type; }, 'equipment');
    emit('loadout', { equipment: type, slot: null, reason: 'equipment' });
    return true;
  }

  /** { item, variant } currently in a slot (catalog objects), or null. */
  equipped(slot) {
    const e = this.profile.loadout.slots[slot];
    const item = e && getItem(e.item);
    return item ? { item, variant: getVariant(item, e.variant) } : null;
  }

  /** Equip an item (and optionally a colourway). Refuses locked items. */
  equip(itemId, variantId) {
    const item = getItem(itemId);
    if (!item) throw new Error(`unknown item "${itemId}"`);
    if (!unlockState(item, this.profile).unlocked) return false;
    const variant = getVariant(item, variantId).id;
    this.update((p) => { p.loadout.slots[item.slot] = { item: item.id, variant }; }, 'equip');
    emit('loadout', { equipment: this.equipment, slot: item.slot, item: item.id, variant, reason: 'equip' });
    return true;
  }

  /** Slots used by the current equipment type, e.g. [{ slot:'skis', item, variant }, { slot:'poles', … }]. */
  activeGear(type = this.equipment) {
    return EQUIPMENT_TYPES[type].slots.map((slot) => ({ slot, ...this.equipped(slot) }));
  }

  /** The equipment model id of the primary gear item for a type (see catalog gearModel), or undefined. */
  gearModel(type = this.equipment) {
    return gearModel(this.equipped(EQUIPMENT_TYPES[type].primary)?.item);
  }

  /** Clothing slots in display order. */
  outfit() {
    return Object.entries(SLOTS).filter(([, s]) => s.category === 'outfit').sort((a, b) => a[1].order - b[1].order)
      .map(([slot]) => ({ slot, ...this.equipped(slot) }));
  }

  // ------------------------------------------------------------ map, unlocks, name
  setMap(id, variant = null, trail = null) { this.update((p) => { p.map = { id, variant, trail }; }, 'map'); }

  unlock(itemId) {
    if (this.profile.unlocks.items.includes(itemId)) return;
    this.update((p) => { p.unlocks.items.push(itemId); }, 'unlock');
  }

  setDisplayName(name) { this.update((p) => { p.displayName = String(name); }, 'name'); }

  // ------------------------------------------------------------ stats
  /** Fold one finished ride into the lifetime stats. */
  recordRide({ score = 0, distance = 0, airTotal = 0, smoothTurns = 0, duration = 0, runsCompleted = 0 }) {
    this.update((p) => {
      const s = p.stats;
      s.rides += 1;
      s.runsCompleted += runsCompleted;
      s.distance += distance;
      s.airTime += airTotal;
      s.smoothTurns += smoothTurns;
      s.totalScore += score;
      s.bestScore = Math.max(s.bestScore, score);
      s.playTime += duration;
      s.lastRideAt = Date.now();
    }, 'stats');
  }

  /** Developer helper: wipe back to a fresh profile. */
  reset() {
    this.data = defaultProfile();
    this.save();
    emit('profile', { profile: this.data, reason: 'reset' });
    emit('loadout', { equipment: this.equipment, slot: null, reason: 'reset' });
  }
}

export const profileStore = new ProfileStore(storage);
