// Fast Node checks for the lobby's data layer (no browser): profile schema + migrations, profile
// store, catalog, local leaderboard, map registry. Usage: node scripts/unittest.mjs  (exit 1 on failure)
import assert from 'node:assert/strict';

// Minimal localStorage so storage.js takes its persistent path.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const { on } = await import('../src/state.js');
const schema = await import('../src/profile/schema.js');
const catalog = await import('../src/profile/catalog.js');
const { LocalLeaderboard } = await import('../src/services/leaderboard.js');
const { storage } = await import('../src/services/storage.js');
const registry = await import('../src/maps/registry.js');

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}

// ---------------------------------------------------------------- schema
await test('default profile is valid v1 with a full loadout', () => {
  const p = schema.defaultProfile();
  assert.equal(p.version, schema.PROFILE_VERSION);
  assert.equal(p.loadout.equipment, 'skis');
  for (const slot of Object.keys(catalog.SLOTS)) assert.ok(p.loadout.slots[slot]?.item, `slot ${slot}`);
  assert.equal(p.loadout.slots.skis.item, 'skis-northwake-carver');
  assert.equal(p.loadout.slots.board.item, 'board-northwake-twin');
});

await test('v0 (nothing stored) migrates legacy best score and mountain', () => {
  const { profile, from, migrated } = schema.migrateProfile(null, { best: '777', settings: { resort: 'homewood', run: 2 } });
  assert.equal(from, 0);
  assert.ok(migrated);
  assert.equal(profile.stats.bestScore, 777);
  assert.deepEqual(profile.map, { id: 'lake-tahoe', variant: { resort: 'homewood', run: 2 } });
});

await test('garbage input becomes a default profile', () => {
  for (const raw of ['nope', 42, [], { version: 'x' }]) {
    const { profile } = schema.migrateProfile(raw);
    assert.equal(profile.version, schema.PROFILE_VERSION);
    assert.equal(profile.loadout.equipment, 'skis');
  }
});

await test('sanitize repairs bad equipment, unknown items, wrong slots and variants', () => {
  const p = schema.defaultProfile();
  p.loadout.equipment = 'monoski';
  p.loadout.slots.skis = { item: 'does-not-exist', variant: 'x' };
  p.loadout.slots.helmet = { item: 'board-northwake-twin', variant: 'sunset' };   // wrong slot
  p.loadout.slots.board = { item: 'board-northwake-twin', variant: 'neon-green' }; // unknown variant
  p.displayName = '   ';
  const s = schema.sanitize(p);
  assert.equal(s.loadout.equipment, 'skis');
  assert.equal(s.loadout.slots.skis.item, 'skis-northwake-carver');
  assert.equal(s.loadout.slots.helmet.item, 'helmet-dome-pink');
  assert.equal(s.loadout.slots.board.variant, 'sunset');
  assert.equal(s.displayName, 'Rider');
});

await test('a profile from a newer build keeps its fields', () => {
  const p = { ...schema.defaultProfile(), version: 99, displayName: 'Future' };
  p.loadout.equipment = 'snowboard';
  const { profile } = schema.migrateProfile(p);
  assert.equal(profile.displayName, 'Future');
  assert.equal(profile.loadout.equipment, 'snowboard');
});

// ---------------------------------------------------------------- store
const { profileStore } = await import('../src/profile/store.js');
await test('store: setEquipment persists and emits loadout', () => {
  profileStore.reset();
  const seen = [];
  const off = on('loadout', (e) => seen.push(e.equipment));
  assert.equal(profileStore.setEquipment('snowboard'), true);
  assert.equal(profileStore.setEquipment('snowboard'), false, 'no-op when unchanged');
  off();
  assert.deepEqual(seen, ['snowboard']);
  assert.equal(JSON.parse(mem.get(schema.PROFILE_KEY)).loadout.equipment, 'snowboard');
  profileStore.load();
  assert.equal(profileStore.equipment, 'snowboard', 'survives a reload');
  assert.throws(() => profileStore.setEquipment('sled'));
});

await test('store: activeGear follows the equipment type', () => {
  assert.deepEqual(profileStore.activeGear('snowboard').map((g) => g.slot), ['board', 'bindings']);
  assert.deepEqual(profileStore.activeGear('skis').map((g) => g.item.id), ['skis-northwake-carver', 'poles-northwake-alloy']);
});

await test('store: equip refuses locked items, accepts after unlock', () => {
  catalog.registerItem({ id: 'test-helmet-gold', name: 'Gold Dome', slot: 'helmet', unlock: { type: 'score', value: 10000 } });
  assert.equal(profileStore.equip('test-helmet-gold'), false);
  profileStore.recordRide({ score: 12000, distance: 3000, airTotal: 5, smoothTurns: 4, duration: 60, runsCompleted: 1 });
  assert.equal(catalog.unlockState(catalog.getItem('test-helmet-gold'), profileStore.profile).unlocked, true);
  assert.equal(profileStore.equip('test-helmet-gold'), true);
  assert.equal(profileStore.equipped('helmet').item.id, 'test-helmet-gold');
  const s = profileStore.profile.stats;
  assert.equal(s.rides, 1); assert.equal(s.bestScore, 12000); assert.equal(s.runsCompleted, 1);
});

// ---------------------------------------------------------------- catalog
await test('catalog: slots, filters and unlock progress', () => {
  assert.throws(() => catalog.registerItem({ id: 'x', name: 'X', slot: 'cape' }));
  assert.ok(catalog.listItems({ equipment: 'snowboard' }).every((i) => ['board', 'bindings'].includes(i.slot)));
  assert.ok(catalog.listItems({ category: 'outfit' }).length >= 5);
  const st = catalog.unlockState({ unlock: { type: 'distance', value: 10000 } }, { stats: { distance: 2500 }, unlocks: { items: [] } });
  assert.equal(st.unlocked, false);
  assert.equal(st.progress, 0.25);
});

// ---------------------------------------------------------------- leaderboard
await test('local leaderboard ranks, keeps the best, reports new bests', async () => {
  storage.remove('sendit.leaderboard');
  const lb = new LocalLeaderboard();
  assert.equal((await lb.submit({ mapId: 'm', score: 0 })).rank, null, 'zero scores are ignored');
  assert.equal((await lb.submit({ mapId: 'm', score: 100 })).isNewBest, true);
  const r = await lb.submit({ mapId: 'm', score: 50 });
  assert.equal(r.rank, 2); assert.equal(r.isNewBest, false);
  assert.equal((await lb.submit({ mapId: 'm', score: 300 })).rank, 1);
  const top = await lb.getTop('m', { limit: 2 });
  assert.deepEqual(top.map((e) => e.score), [300, 100]);
  assert.equal((await lb.getPersonalBest('m')).score, 300);
  for (let i = 0; i < 30; i++) await lb.submit({ mapId: 'm', score: 1 + i });
  assert.equal((await lb.getTop('m', { limit: 99 })).length, 20, 'keeps 20 per map');
});

// ---------------------------------------------------------------- maps
await test('map registry: selection precedence and fallback', async () => {
  registry.registerMap({ id: 'valcrest-gully', name: 'Default', load: async () => ({ kind: 'default' }) });
  registry.registerMap({ id: 'broken', name: 'Broken', load: async () => { throw new Error('boom'); } });
  registry.registerMap({ id: 'lake-tahoe', name: 'Tahoe', load: async ({ variant }) => ({ kind: 'tahoe', variant }) });
  const P = (q) => new URLSearchParams(q);
  assert.deepEqual(registry.resolveMapSelection(P(''), null), { id: 'valcrest-gully', variant: null, source: 'default' });
  assert.equal(registry.resolveMapSelection(P(''), { map: { id: 'broken' } }).source, 'profile');
  assert.equal(registry.resolveMapSelection(P(''), { map: { id: 'gone' } }).id, 'valcrest-gully');
  assert.deepEqual(registry.resolveMapSelection(P('resort=kirkwood&run=1'), null).variant, { resort: 'kirkwood', run: 1 });
  assert.equal(registry.resolveMapSelection(P('map=broken'), { map: { id: 'lake-tahoe' } }).id, 'broken');
  const warn = console.warn; console.warn = () => {};
  const res = await registry.loadMap({ id: 'broken' });
  console.warn = warn;
  assert.equal(res.fellBack, true); assert.equal(res.course.kind, 'default');
  assert.equal((await registry.loadMap({ id: 'lake-tahoe', variant: { resort: 'a', run: 0 } })).course.kind, 'tahoe');
  assert.throws(() => registry.registerMap({ id: 'x', name: 'X' }));
});

await test('map registry: lobby spot down the run, looking where the view opens up', () => {
  // A run straight down −Z from z = 0; the valley below falls away to the east (+x) as well.
  const terrain = {
    getHeight: (x, z) => z * 0.3 - x * 0.3,
    getSpawn: () => ({ position: { x: 0, z: 5 }, heading: 0 }),
  };
  const path = Array.from({ length: 40 }, (_, i) => ({ x: 0, y: -i * 8 }));
  const s = registry.lobbySpot({ id: 'm' }, { path }, terrain);
  assert.ok(Math.abs(s.x) < 1e-6 && Math.abs(s.z + registry.LOBBY_ALONG) < 1e-6, 'LOBBY_ALONG metres down the path');
  assert.ok(s.heading < 0 && s.heading >= -0.61, `turns toward the open valley (${s.heading})`);
  // No path: the spawn. A map's own lobby() wins; a broken one falls back.
  assert.deepEqual(registry.lobbySpot({ id: 'm' }, {}, terrain), { x: 0, z: 5, heading: 0 });
  assert.deepEqual(registry.lobbySpot({ id: 'm', lobby: () => ({ x: 7, z: 8, heading: 1 }) }, { path }, terrain), { x: 7, z: 8, heading: 1 });
  const warn = console.warn; console.warn = () => {};
  const bad = registry.lobbySpot({ id: 'm', lobby: () => { throw new Error('x'); } }, {}, terrain);
  console.warn = warn;
  assert.deepEqual(bad, { x: 0, z: 5, heading: 0 });
});

await test('catalog: gear items point at real equipment models', () => {
  profileStore.reset();
  assert.equal(catalog.gearModel(catalog.getItem('skis-northwake-carver')), 'allmountain');
  assert.equal(catalog.gearModel(catalog.getItem('poles-northwake-alloy')), undefined, 'builtin parts have no model id');
  assert.equal(profileStore.gearModel('snowboard'), 'allmountain');
  catalog.registerItem({ id: 'test-board-park', name: 'Butter 152', slot: 'board', model: { kind: 'equipment', ref: 'park' } });
  profileStore.equip('test-board-park');
  assert.equal(profileStore.gearModel('snowboard'), 'park');
  assert.equal(profileStore.gearModel('skis'), 'allmountain');
});

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);
