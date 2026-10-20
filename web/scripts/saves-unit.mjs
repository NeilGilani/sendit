// Save robustness (docs/launch.md § Saves): every stored value a player might have — any profile version
// from this week, retired skins, unknown item ids, corrupt / truncated / hostile JSON — loads without
// throwing, comes out valid, and an unreadable save is kept as `<key>.backup` before a fresh one replaces it.
// Run from unittest.mjs (`run(test, assert)`) or alone: node web/scripts/saves-unit.mjs
import assertMod from 'node:assert/strict';

export async function run(test, assert) {
  const schema = await import('../src/profile/schema.js');
  const catalog = await import('../src/profile/catalog.js');
  const { RETIRED_SKINS, SERIES } = await import('../src/profile/items.js');
  const { sanitizeState } = await import('../src/progression/core.js');
  const { sanitizeSettings } = await import('../src/state.js');
  const { storage } = await import('../src/services/storage.js');

  // Deterministic random JSON (mulberry32).
  let seed = 12345;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const KEYS = ['version', 'loadout', 'slots', 'equipment', 'item', 'variant', 'inventory', 'items', 'rewards', 'cases', 'series', 'history', 'key', 'best', 'stats',
    'rides', 'map', 'id', 'trail', 'unlocks', 'displayName', 'n', 'at', 'seen', 'xp', 'distance', 'maps', 'completed', 'life', 'daily', 'list', 'day', 'progress',
    'weekly', 'week', 'pb', 'achievements', 'quality', 'master', '__proto__', 'constructor', 'toString', 'skis', 'jacket', 'snowboard'];
  const ATOMS = [null, true, false, 0, -1, 1e308, NaN, 'x', '', 'constructor', '__proto__', 'toString', 'skis', 'snowboard', 'first-chair', 'blackspruce',
    ...Object.keys(RETIRED_SKINS), ...Object.keys(SERIES), 'jacket-tuff-shell', 'reflective', 'no-such-item:nope', 2, 3, 99];
  const gen = (d = 0) => {
    const r = rnd();
    if (d > 4 || r < 0.35) return pick(ATOMS);
    if (r < 0.55) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(d + 1));
    const o = {};
    for (let i = Math.floor(rnd() * 6); i-- > 0;) o[pick(KEYS)] = gen(d + 1);
    return o;
  };
  // A full, plausible v2 profile to mutate (deep paths get garbage, not just the top level).
  const full = () => {
    const p = schema.migrateProfile(null).profile;
    p.inventory.items = { 'jacket-tuff-shell:reflective': { at: 1, n: 2, seen: true }, 'jacket-retro-suit:miami-92': { at: 2, n: 1 }, 'bogus:item': { n: 1 } };
    p.loadout.slots.jacket = { item: 'jacket-tuff-shell', variant: 'reflective' };
    p.loadout.slots.skis = { item: 'skis-that-never-existed', variant: 'x' };
    p.rewards.history = [{ key: 'jacket-retro-suit:hyperwave', at: 3 }];
    p.rewards.cases = [{ id: 'c1', series: 'first-chair', at: 1 }, { series: 'constructor' }, { series: '__proto__' }];
    return p;
  };
  const mutate = (o, d = 0) => {
    if (!o || typeof o !== 'object') return gen(2);
    const out = Array.isArray(o) ? [...o] : { ...o };
    for (const k of Object.keys(out)) if (rnd() < 0.25) out[k] = rnd() < 0.5 ? gen(2) : mutate(out[k], d + 1);
    if (rnd() < 0.2) out[pick(KEYS)] = gen(2);
    return out;
  };

  const validProfile = (p) => {
    assert.equal(p.version, schema.PROFILE_VERSION);
    assert.ok(catalog.EQUIPMENT_TYPES[p.loadout.equipment], `equipment ${p.loadout.equipment}`);
    for (const [slot, e] of Object.entries(p.loadout.slots)) {
      const item = catalog.getItem(e.item);
      assert.ok(item && item.slot === slot && item.variants.some((v) => v.id === e.variant), `slot ${slot}: ${JSON.stringify(e)}`);
      assert.ok(!RETIRED_SKINS[catalog.ownKey(e.item, e.variant)], `retired skin worn: ${e.item}:${e.variant}`);
    }
    for (const k of Object.keys(p.inventory.items)) {
      const [id, vid] = k.split(':');
      assert.ok(catalog.getItem(id)?.variants.some((v) => v.id === vid), `inventory key ${k}`);
      assert.ok(!RETIRED_SKINS[k], `retired skin owned: ${k}`);
    }
    for (const c of p.rewards.cases) assert.ok(Object.hasOwn(SERIES, c.series), `case series ${c.series}`);
    assert.equal(typeof p.displayName, 'string');
    assert.ok(typeof p.map?.id === 'string');
    for (const [k, v] of Object.entries(p.stats)) if (k !== 'lastRideAt') assert.ok(Number.isFinite(v), `stats.${k} = ${v}`);
    JSON.stringify(p);   // serialisable
  };

  await test('saves: every profile version this week loads valid (v0 legacy, v1, v2, retired skins, unknown ids)', () => {
    const v1 = { version: 1, displayName: 'Old', loadout: { equipment: 'snowboard', slots: { jacket: { item: 'jacket-tuff-shell', variant: 'reflective' } } }, stats: { rides: 12, distance: 40000 }, unlocks: { items: ['nope'] }, map: { id: 'ravenspire', trail: 'gone-trail' } };
    const warn = console.warn; console.warn = () => {};
    for (const raw of [null, { version: 0 }, v1, full(), { ...full(), version: 99 }, { ...full(), version: '2' }]) {
      const { profile } = schema.migrateProfile(JSON.parse(JSON.stringify(raw)), { best: '123', settings: { resort: 'homewood' } });
      validProfile(profile);
      // Idempotent: loading the saved result again changes nothing.
      assert.deepEqual(schema.migrateProfile(JSON.parse(JSON.stringify(profile))).profile.loadout, profile.loadout);
    }
    console.warn = warn;
  });

  await test('saves: 4000 random / mutated profiles never throw and always come out valid', () => {
    let n = 0;
    const warn = console.warn; console.warn = () => {};   // "newer version" notices
    try {
    for (let i = 0; i < 4000; i++) {
      const raw = i % 2 ? gen() : mutate(full());
      let out;
      try { out = schema.migrateProfile(raw, { best: gen(), settings: gen() }).profile; } catch (e) { throw new Error(`${e.message} ${e.stack.split("\n").slice(1,4).join(" ")} threw on ${JSON.stringify(raw).slice(0, 300)}`); }
      try { validProfile(out); } catch (e) { throw new Error(`${e.message} ${e.stack.split("\n").slice(1,4).join(" ")} for ${JSON.stringify(raw).slice(0, 300)}`); }
      n++;
    }
    } finally { console.warn = warn; }
    assert.equal(n, 4000);
  });

  await test('saves: progression state and settings survive garbage', () => {
    for (let i = 0; i < 3000; i++) {
      const raw = gen();
      const s = sanitizeState(raw);
      assert.ok(Number.isFinite(s.xp) && s.life && typeof s.life === 'object', `progression from ${JSON.stringify(raw)}`);
      JSON.stringify(s);
      const st = sanitizeSettings(raw && typeof raw === 'object' ? { ...raw, quality: gen() } : raw);
      assert.ok([0, 1, 2].includes(st.quality), `quality ${st.quality}`);
      for (const k of ['master', 'music', 'sfx', 'mouseSens', 'camSens']) assert.ok(Number.isFinite(st[k]), `${k} = ${st[k]}`);
    }
    assert.equal(sanitizeSettings({ quality: '2', master: '0.5', snowfall: 'yes' }).quality, 2);
    assert.equal(sanitizeSettings({ quality: 7 }).quality, 2);
    assert.equal(sanitizeSettings({ quality: 'high' }).quality, 1);
  });

  await test('saves: a corrupt profile is backed up, then replaced by a fresh one', async () => {
    const { profileStore } = await import('../src/profile/store.js');
    const before = storage.getRaw(schema.PROFILE_KEY), beforeBk = storage.getRaw(`${schema.PROFILE_KEY}.backup`);
    const warn = console.warn; console.warn = () => {};
    try {
      for (const bad of ['{"version":2,"loadout":{"equ', '[1,2,3]', '42', '"just a string"', 'null', 'undefined']) {
        storage.setRaw(schema.PROFILE_KEY, bad);
        storage.remove(`${schema.PROFILE_KEY}.backup`);
        const p = profileStore.load();
        validProfile(p);
        if (bad !== 'null') assert.equal(storage.getRaw(`${schema.PROFILE_KEY}.backup`), bad, `backup of ${bad}`);
        assert.ok(storage.get(schema.PROFILE_KEY)?.version === schema.PROFILE_VERSION, 'fresh profile saved');
      }
    } finally {
      console.warn = warn;
      if (before == null) storage.remove(schema.PROFILE_KEY); else storage.setRaw(schema.PROFILE_KEY, before);
      if (beforeBk == null) storage.remove(`${schema.PROFILE_KEY}.backup`); else storage.setRaw(`${schema.PROFILE_KEY}.backup`, beforeBk);
      profileStore.load();
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const mem = new Map();
  globalThis.localStorage ??= { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  let failed = 0;
  await run(async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); } }, assertMod);
  process.exit(failed ? 1 : 0);
}
