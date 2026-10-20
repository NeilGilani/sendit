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

// Progression + juice (game-feel): scripts/progression-unit.mjs (own storage key, runs first).
await (await import('./progression-unit.mjs')).run(test, assert);
// Thrill (instant restart / retry, spots & gaps, adrenaline, replay, versus codes): scripts/thrill-unit.mjs.
await (await import('./thrill-unit.mjs')).run(test, assert);
// Saved highlight clips (codec, storage cap, loading-screen rotation): scripts/clips-unit.mjs.
await (await import('./clips-unit.mjs')).run(test, assert);
// Gear advisor (Locker stats, best-at badges, the ★ pick): scripts/gear-advisor-unit.mjs.
await (await import('./gear-advisor-unit.mjs')).run(test, assert);
// Save robustness (old versions, retired skins, corrupt / hostile JSON, backups): scripts/saves-unit.mjs.
await (await import('./saves-unit.mjs')).run(test, assert);

// ---------------------------------------------------------------- schema
await test('default profile is valid with a full loadout', () => {
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
  assert.deepEqual(profile.map, { id: 'lake-tahoe', variant: { resort: 'homewood', run: 2 }, trail: null });
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
  assert.equal(s.loadout.slots.helmet.item, 'helmet-tuff');
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
  assert.deepEqual(registry.resolveMapSelection(P(''), null), { id: 'valcrest-gully', variant: null, trail: 'main', source: 'default' });
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

await test('map registry: mountains and trails are normalised static data', () => {
  const warn = console.warn; console.warn = () => {};
  const m = registry.registerMap({
    id: 't-peak', name: 'T Peak', description: 'Test', order: 50, load: async () => ({}),
    mountain: { id: 't-range', name: 'T Range', region: 'Testland', accent: '#f00' },
    trails: [
      { id: 'top', name: 'Top', difficulty: 'black', length: 1200, vertical: 400, featured: true },
      { id: 'kids', name: 'Kids', difficulty: 'green' },
      { id: 'kids', name: 'Dup', difficulty: 'green' },          // duplicate id: skipped
      { id: 'odd', name: 'Odd', difficulty: 'purple' },          // unknown difficulty → blue
      { name: 'no id' },
    ],
  });
  registry.registerMap({ id: 't-park', name: 'T Park', order: 51, load: async () => ({}), mountain: { id: 't-range' }, trails: [{ id: 'jib', name: 'Jib', difficulty: 'park' }] });
  console.warn = warn;
  assert.deepEqual(m.trails.map((t) => t.id), ['top', 'kids', 'odd']);
  assert.equal(registry.getTrail('t-peak', 'odd').difficulty, 'blue');
  assert.equal(registry.getTrail('t-peak', 'top').mapId, 't-peak');
  assert.equal(registry.defaultTrail('t-peak').id, 'top');
  assert.equal(m.mountain.blurb, 'Test', 'blurb defaults to the description');
  const plain = registry.getMap('valcrest-gully');
  assert.equal(plain.mountain.id, 'valcrest-gully', 'no mountain: its own');
  assert.deepEqual(plain.trails.map((t) => [t.id, t.difficulty]), [['main', 'blue']], 'no trails: one main trail');
  const range = registry.getMountain('t-range');
  assert.deepEqual(range.maps.map((x) => x.id), ['t-peak', 't-park'], 'maps sharing a mountain id share a card');
  assert.equal(range.trails.length, 4);
  assert.deepEqual(range.spread, { green: 1, blue: 1, black: 1, 'double-black': 0, park: 1 });
  assert.equal(range.name, 'T Range');
  for (const d of registry.DIFFICULTY_IDS) assert.ok(registry.DIFFICULTIES[d].label);
});

await test('map registry: trail selection from URL, profile and variants', () => {
  const P = (q) => new URLSearchParams(q);
  registry.registerMap({
    id: 'lake-tahoe', name: 'Tahoe', load: async ({ variant }) => ({ kind: 'tahoe', variant }),
    trails: [
      { id: 'kirkwood:0', name: 'K0', difficulty: 'black', group: 'Kirkwood', variant: { resort: 'kirkwood', run: 0 } },
      { id: 'kirkwood:1', name: 'K1', difficulty: 'double-black', group: 'Kirkwood', variant: { resort: 'kirkwood', run: 1 } },
      { id: 'homewood:0', name: 'H0', difficulty: 'blue', group: 'Homewood', variant: { resort: 'homewood', run: 0 } },
    ],
  });
  const s1 = registry.resolveMapSelection(P('map=t-peak&trail=kids'), null);
  assert.deepEqual([s1.id, s1.trail, s1.source], ['t-peak', 'kids', 'url']);
  assert.equal(registry.resolveMapSelection(P('map=t-peak&trail=nope'), null).trail, 'top', 'unknown trail → default');
  assert.equal(registry.resolveMapSelection(P(''), { map: { id: 't-peak', trail: 'odd' } }).trail, 'odd', 'profile trail');
  assert.equal(registry.resolveMapSelection(P(''), { map: { id: 't-peak', trail: 'gone' } }).trail, 'top');
  // Legacy ?resort=&run= picks the matching trail; a trail brings its variant.
  assert.equal(registry.resolveMapSelection(P('resort=kirkwood&run=1'), null).trail, 'kirkwood:1');
  assert.deepEqual(registry.resolveMapSelection(P('map=lake-tahoe&trail=homewood:0'), null).variant, { resort: 'homewood', run: 0 });
  assert.deepEqual(registry.resolveMapSelection(P(''), { map: { id: 'lake-tahoe', variant: { resort: 'kirkwood', run: 0 }, trail: 'homewood:0' } }).variant, { resort: 'homewood', run: 0 }, 'trail wins over a stale variant');
  assert.equal(registry.resolveMapSelection(P(''), { map: { id: 'lake-tahoe', variant: { resort: 'x', run: 3 } } }).trail, null, 'a variant no trail names is kept');
  // Reloads: other map, or a trail on another variant.
  const cur = { map: registry.getMap('lake-tahoe'), variant: { resort: 'kirkwood', run: 0 } };
  assert.equal(registry.needsReload(cur, 'lake-tahoe', 'kirkwood:0'), false);
  assert.equal(registry.needsReload(cur, 'lake-tahoe', 'kirkwood:1'), true);
  assert.equal(registry.needsReload(cur, 't-peak', 'top'), true);
  assert.equal(registry.needsReload({ map: registry.getMap('t-peak'), variant: null }, 't-peak', 'kids'), false);
  assert.equal(registry.selectionQuery('t-peak', 'kids', 'ride&at=1,2&quality=2').toString(), 'quality=2&map=t-peak&trail=kids');
  assert.equal(registry.trailBoardId('t-peak', 'top'), 't-peak/top');
  assert.equal(registry.trailBoardId('t-peak', null), 't-peak/top', 'no trail: the default trail');
  assert.equal(registry.trailBoardId('t-peak', 'kids'), 't-peak/kids');
});

await test('map registry: trailSpawn / trailFinish with fallbacks', () => {
  const fb = { position: { x: 1, z: 2 }, heading: 0.5 };
  const course = {
    trailSpawn: (id) => ({ a: { x: 10, z: 20, heading: 1 }, nohead: { x: 3, z: 4 }, bad: { x: NaN, z: 0 } })[id] ?? null,
    trailFinish: (id) => ({ a: { x: 5, z: 6 }, p: { progress: 900 } })[id] ?? null,
  };
  assert.deepEqual(registry.trailSpawnFor(course, 'a', fb), { x: 10, z: 20, heading: 1, fallback: false });
  assert.deepEqual(registry.trailSpawnFor(course, 'nohead', fb), { x: 3, z: 4, heading: 0.5, fallback: false });
  assert.equal(registry.trailSpawnFor(course, 'bad', fb).fallback, true);
  assert.equal(registry.trailSpawnFor(course, 'none', fb).fallback, true);
  assert.equal(registry.trailSpawnFor({}, 'a', fb).fallback, true, 'no trailSpawn method');
  const warn = console.warn; console.warn = () => {};
  assert.equal(registry.trailSpawnFor({ trailSpawn: () => { throw new Error('x'); } }, 'a', fb).fallback, true);
  console.warn = warn;
  assert.deepEqual(registry.trailFinishFor(course, 'a'), { x: 5, z: 6, radius: 30 });
  assert.deepEqual(registry.trailFinishFor(course, 'p'), { progress: 900 });
  assert.equal(registry.trailFinishFor(course, 'none'), null);
});

await test('profile: setMap saves map, variant and trail', () => {
  profileStore.setMap('t-peak', null, 'kids');
  assert.deepEqual(profileStore.profile.map, { id: 't-peak', variant: null, trail: 'kids' });
  assert.equal(schema.sanitize({ ...profileStore.profile, map: { id: 'a', trail: 7 } }).map.trail, null);
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

// ---------------------------------------------------------------- rewards: cases, odds, progression
const rewards = await import('../src/profile/rewards.js');
const { RARITIES } = await import('../src/profile/rarity.js');
const { SERIES_ORDER } = await import('../src/profile/items.js');
const OUTFIT = ['helmet', 'goggles', 'face', 'jacket', 'gloves', 'pants'];

await test('rewards: a new rider owns only the plain starter kit and stock gear', () => {
  profileStore.reset();
  const p = profileStore.profile;
  assert.equal(p.version, 2);
  for (const slot of OUTFIT) {
    const e = profileStore.equipped(slot);
    assert.ok(e.variant.starter, `${slot} wears a starter (${e.item.id}:${e.variant.id})`);
    assert.ok(profileStore.ownedIn(slot).every((o) => o.variant.starter), `${slot}: only starters owned`);
  }
  assert.equal(profileStore.equipped('jacket').variant.id, 'basic');
  const real = (slot) => profileStore.ownedIn(slot).map((o) => o.item.id).filter((id) => !id.startsWith('test-'));   // earlier tests add test items
  assert.deepEqual(real('skis'), ['skis-northwake-carver']);
  assert.deepEqual(real('board'), ['board-northwake-twin']);
  assert.equal(profileStore.collection().owned, 0);
  assert.ok(profileStore.collection().total >= 70, `${profileStore.collection().total} reward skins`);
  assert.equal(p.rewards.cases.length, 0, 'no free case for a brand-new rider');
});

await test('rewards: equip refuses a skin you do not own, accepts it once earned', () => {
  profileStore.reset();
  assert.equal(profileStore.equip('jacket-tuff-shell', 'woodland'), false);
  assert.equal(profileStore.equip('helmet-tuff', 'chrome'), false);
  assert.equal(profileStore.equip('skis-gold-leaf'), false);
  profileStore.update((p) => { p.inventory.items['jacket-tuff-shell:woodland'] = { at: 1, n: 1, seen: false }; });
  assert.equal(profileStore.equip('jacket-tuff-shell', 'woodland'), true);
  assert.equal(profileStore.equipped('jacket').variant.id, 'woodland');
  assert.deepEqual(profileStore.newSkins(), ['jacket-tuff-shell:woodland']);
  profileStore.markSeen();
  assert.deepEqual(profileStore.newSkins(), []);
  // Losing the skin (hand-edited save) falls back to the starter.
  profileStore.update((p) => { delete p.inventory.items['jacket-tuff-shell:woodland']; });
  assert.equal(profileStore.equipped('jacket').variant.id, 'basic');
});

await test('migration v1 → v2: keeps the worn colourway, adds a welcome case and veteran cases', () => {
  const v1 = {
    version: 1, displayName: 'Old Timer', createdAt: 1, updatedAt: 2,
    loadout: { equipment: 'snowboard', slots: {
      jacket: { item: 'jacket-tuff-shell', variant: 'arcade' }, pants: { item: 'pants-tuff-bib', variant: 'arcade' },
      helmet: { item: 'helmet-tuff', variant: 'summit' }, goggles: { item: 'goggles-tuff', variant: 'tuff' },
      gloves: { item: 'gloves-tuff-mitt', variant: 'nightshift' }, board: { item: 'board-northwake-twin', variant: 'sunset' } } },
    map: { id: 'blackspruce', variant: null }, stats: { rides: 40, runsCompleted: 30, distance: 90000, bestScore: 5000 }, unlocks: { items: [] },
  };
  const { profile, from } = schema.migrateProfile(v1);
  assert.equal(from, 1); assert.equal(profile.version, 2);
  assert.equal(profile.loadout.slots.jacket.variant, 'arcade', 'still wearing Arcade');
  assert.equal(profile.loadout.slots.helmet.variant, 'summit');
  assert.equal(profile.loadout.slots.face.variant, 'arcade', 'the gaiter of the old Arcade colourway becomes a face skin');
  assert.ok(profile.inventory.items['face-gaiter:arcade']);
  for (const k of ['jacket-tuff-shell:arcade', 'pants-tuff-bib:arcade', 'helmet-tuff:summit', 'goggles-tuff:tuff', 'gloves-tuff-mitt:nightshift']) assert.ok(profile.inventory.items[k], k);
  assert.equal(profile.rewards.cases.length, 4, '1 welcome + 3 veteran cases (capped)');
  assert.equal(profile.rewards.cases[0].source, 'welcome');
  assert.equal(profile.rewards.distance, 90000);
  assert.equal(profile.rewards.milestone, 50000, 'old km count toward milestones without back pay');
  assert.equal(profile.stats.distance, 90000);
  // A light v1 rider gets just the welcome case; a stored v2 profile round-trips unchanged.
  const light = schema.migrateProfile({ ...v1, stats: { distance: 2000, runsCompleted: 1 } }).profile;
  assert.equal(light.rewards.cases.length, 1);
  const again = schema.migrateProfile(JSON.parse(JSON.stringify(profile)));
  assert.equal(again.migrated, false);
  assert.deepEqual(again.profile.inventory, profile.inventory);
  assert.equal(again.profile.rewards.cases.length, 4);
  // v0 → v2 (a first visit) gets no free cases.
  assert.equal(schema.migrateProfile(null).profile.rewards.cases.length, 0);
});

await test('retired skins (shiny / zig-zag clothing): owned → the same-grade matte replacement, equipped → worn, no crash', async () => {
  const { RETIRED_SKINS } = await import('../src/profile/items.js');
  const keys = Object.keys(RETIRED_SKINS);
  assert.ok(keys.length >= 12);
  for (const [from, to] of Object.entries(RETIRED_SKINS)) {
    const [fi, fv] = from.split(':'), [ti, tv] = to.split(':');
    assert.ok(!catalog.getItem(fi)?.variants.some((v) => v.id === fv), `${from} is gone from the catalogue`);
    const t = catalog.getItem(ti)?.variants.find((v) => v.id === tv);
    assert.ok(t, `${to} exists`);
    assert.ok(!t.colors.finish || t.colors.finish === 'matte', `${to} is matte`);
  }
  // No clothing skin keeps a shiny finish or a zig-zag print (helmets are hard shells: their gloss stays).
  for (const item of catalog.listItems()) {
    if (!['jacket', 'pants', 'gloves', 'face'].includes(item.slot)) continue;
    for (const v of item.variants) {
      assert.ok(!['metallic', 'reflective', 'iridescent', 'gloss', 'chrome', 'pearl'].includes(v.colors?.finish), `${item.id}:${v.id} finish ${v.colors?.finish}`);
      assert.notEqual(v.colors?.pat, 'zigzag', `${item.id}:${v.id} zig-zag`);
    }
  }
  const v2 = schema.defaultProfile();
  v2.inventory.items = {
    'jacket-retro-suit:hyperwave': { at: 5, n: 1, seen: true }, 'jacket-tuff-shell:gold-lame': { at: 6, n: 2, seen: true },
    'jacket-sherpa-flannel:buffalo': { at: 9, n: 1, seen: true }, 'gloves-tuff-mitt:gold-lame': { at: 7, n: 1, seen: true },
    'jacket-tuff-shell:woodland': { at: 8, n: 1, seen: true },
  };
  v2.loadout.slots.jacket = { item: 'jacket-retro-suit', variant: 'hyperwave' };
  v2.loadout.slots.gloves = { item: 'gloves-tuff-mitt', variant: 'gold-lame' };
  v2.rewards.history = [{ at: 1, key: 'jacket-tuff-shell:gold-lame', rarity: 'legendary' }];
  v2.rewards.best = { key: 'jacket-retro-suit:hyperwave', rarity: 'legendary', at: 1 };
  const { profile } = schema.migrateProfile(JSON.parse(JSON.stringify(v2)));
  const inv = profile.inventory.items;
  assert.ok(!inv['jacket-retro-suit:hyperwave'] && !inv['jacket-tuff-shell:gold-lame'] && !inv['gloves-tuff-mitt:gold-lame']);
  assert.equal(inv['jacket-mocha-puffer:mocha'].n, 1);
  assert.equal(inv['jacket-sherpa-flannel:buffalo'].n, 3, 'owned both: counts add up');
  assert.equal(inv['gloves-tuff-mitt:sherpa'].n, 1);
  assert.equal(inv['jacket-mocha-puffer:mocha'].seen, false, 'the replacement shows as new');
  assert.ok(inv['jacket-tuff-shell:woodland'], 'other skins untouched');
  assert.deepEqual(profile.loadout.slots.jacket, { item: 'jacket-mocha-puffer', variant: 'mocha' }, 'equipped retired skin → its replacement');
  assert.deepEqual(profile.loadout.slots.gloves, { item: 'gloves-tuff-mitt', variant: 'sherpa' });
  assert.equal(profile.rewards.history[0].key, 'jacket-sherpa-flannel:buffalo');
  assert.equal(profile.rewards.best.key, 'jacket-mocha-puffer:mocha');
  // Stable: a second load changes nothing.
  assert.deepEqual(schema.migrateProfile(JSON.parse(JSON.stringify(profile))).profile.inventory, profile.inventory);
  // A retired skin equipped but somehow not owned falls back to the starter, never crashes.
  const v3 = schema.defaultProfile();
  v3.loadout.slots.jacket = { item: 'jacket-tuff-shell', variant: 'reflective' };
  assert.equal(schema.migrateProfile(v3).profile.loadout.slots.jacket.variant, 'basic');
});

await test('items: every reward skin is well formed (unique ids, known grade / case / print / finish, real models)', async () => {
  const { PATTERNS, FINISHES, DECALS, GARMENTS } = await import('../src/character/outfits.js');
  const { SERIES } = await import('../src/profile/items.js');
  const { getEquipmentSpec } = await import('../src/equipment/registry.js');
  const grades = new Set(RARITIES.map((r) => r.id));
  for (const item of catalog.listItems()) {
    if (item.id.startsWith('test-')) continue;
    const ids = item.variants.map((v) => v.id);
    assert.equal(new Set(ids).size, ids.length, `${item.id}: duplicate variant ids`);
    if (item.model.kind === 'outfit') assert.ok(GARMENTS[item.slot]?.[item.model.ref], `${item.id}: garment ${item.model.ref}`);
    if (item.model.kind === 'equipment' && item.slot !== 'bindings') {
      const type = item.slot === 'board' ? 'snowboard' : 'ski';
      assert.equal(getEquipmentSpec(type, item.model.ref).id, item.model.ref, `${item.id}: spec ${item.model.ref}`);
    }
    for (const v of item.variants) {
      const tag = `${item.id}:${v.id}`;
      assert.ok(v.name, `${tag}: name`);
      if (v.starter) continue;
      if (!v.rarity) continue;
      assert.ok(grades.has(v.rarity), `${tag}: grade ${v.rarity}`);
      assert.ok(v.series === '*' || SERIES[v.series], `${tag}: case ${v.series}`);
      const c = v.colors || {};
      if (c.pat) assert.ok(c.pat in PATTERNS, `${tag}: print ${c.pat}`);
      if (c.finish) assert.ok(c.finish in FINISHES, `${tag}: finish ${c.finish}`);
      if (c.decal) assert.ok(c.decal in DECALS, `${tag}: decal ${c.decal}`);
      for (const [k, val] of Object.entries(c)) if (typeof val === 'string' && val.startsWith('#')) assert.match(val, /^#[0-9a-f]{6}$/i, `${tag}: colour ${k}`);
    }
  }
  // Exactly one starter per slot, and it is what a fresh loadout wears.
  for (const slot of OUTFIT.concat(['skis', 'board'])) {
    const starters = catalog.listItems({ slot }).flatMap((i) => i.variants.filter((v) => v.starter));
    assert.equal(starters.length, 1, `${slot}: ${starters.length} starters`);
  }
});

await test('odds: every case has items in every tier and every skin can drop', () => {
  const all = new Set(catalog.rewardSkins().map(({ item, variant }) => `${item.id}:${variant.id}`));
  const reach = new Set();
  for (const s of SERIES_ORDER) {
    const pool = rewards.casePool(s);
    for (const r of RARITIES) assert.ok(pool[r.id].length > 0, `${s} has ${r.id} items`);
    for (const r of RARITIES) for (const e of pool[r.id]) reach.add(e.key);
    const odds = rewards.caseOdds(s);
    assert.ok(Math.abs(Object.values(odds).reduce((a, b) => a + b, 0) - 100) < 1e-9, 'odds sum to 100 %');
  }
  for (const k of all) assert.ok(reach.has(k), `${k} is in a case`);
});

await test('odds: 200 000 simulated openings match the table; gold stays rare', () => {
  for (const s of SERIES_ORDER) {
    const rng = rewards.seeded(s.length * 7919);
    const N = 200000;
    const n = Object.fromEntries(RARITIES.map((r) => [r.id, 0]));
    const items = new Map();
    for (let i = 0; i < N; i++) { const r = rewards.rollCase(s, rng); n[r.rarity]++; items.set(r.key, (items.get(r.key) || 0) + 1); }
    for (const r of RARITIES) {
      const pct = (n[r.id] / N) * 100;
      const sd = Math.sqrt(r.weight * (100 - r.weight) / N);    // binomial s.d. in %
      assert.ok(Math.abs(pct - r.weight) < 5 * sd + 0.02, `${s} ${r.id}: ${pct.toFixed(3)} % vs ${r.weight} %`);
    }
    assert.ok(n.gold / N < 0.004 && n.gold / N > 0.002, `gold ${(n.gold / N * 100).toFixed(3)} %`);
    assert.ok(n.gold < n.legendary / 3, 'gold is several times rarer than red');
    // Inside a tier every skin is equally likely (within 25 %).
    const pool = rewards.casePool(s);
    for (const r of ['common', 'uncommon', 'rare']) {
      const c = pool[r].map((e) => items.get(e.key) || 0);
      assert.ok(Math.min(...c) > Math.max(...c) * 0.75, `${s} ${r} spread ${Math.min(...c)}…${Math.max(...c)}`);
    }
  }
});

await test('reel: winner at winAt, whole ladder visible, gold hidden, near misses sit at the edge', () => {
  const rng = rewards.seeded(42);
  let near = 0, sideHits = 0;
  const N = 2000;
  for (let i = 0; i < N; i++) {
    const res = rewards.rollCase('first-chair', rng);
    const reel = rewards.buildReel(res, 'first-chair', rng);
    assert.equal(reel.cards.length, rewards.REEL.cards);
    const w = reel.cards[reel.winAt];
    assert.ok(w.win && w.rarity === res.rarity && w.revealKey === res.key);
    assert.ok(reel.stop >= 0 && reel.stop <= 1);
    for (const c of reel.cards) if (c.rarity === 'gold' && !c.win) assert.equal(c.key, null, 'gold filler is anonymous');
    const late = reel.cards.slice(reel.winAt - 14, reel.winAt + 4).map((c) => c.rarity);
    assert.ok(late.includes('legendary') && late.includes('gold'), 'red and gold scroll by near the end');
    if (reel.nearMiss) {
      near++;
      const nb = reel.cards[reel.winAt + reel.nearMiss.side];
      assert.ok(RARITIES.findIndex((r) => r.id === nb.rarity) > RARITIES.findIndex((r) => r.id === res.rarity), 'teaser is rarer');
      if (reel.nearMiss.side < 0 ? reel.stop < 0.1 : reel.stop > 0.9) sideHits++;
    }
  }
  assert.ok(near / N > 0.4 && near / N < 0.65, `near-miss rate ${(near / N * 100).toFixed(0)} %`);
  assert.equal(sideHits, near, 'the marker stops at the edge next to the teaser');
});

await test('progression: first case in 10–15 min, then one every 15–25 min of riding', () => {
  // A typical rider: 0.7 km per minute, a finished run every 3 minutes, the first run on two maps.
  // Like the tracker: distance builds up and is credited with each finished run (one session, one day).
  const sim = (kmPerMin, runEvery, mins, maps = ['valcrest-gully', 'blackspruce']) => {
    const p = schema.defaultProfile();
    const at = [];
    let dist = 0;
    for (let t = 1; t <= mins; t++) {
      dist += kmPerMin * 1000;
      if (t % runEvery) continue;
      const mapId = t < mins / 2 ? maps[0] : maps[1];
      const r = rewards.creditRun(p, { mapId, trailId: mapId, distance: dist, finished: true, equipment: 'skis' }, Date.UTC(2026, 9, 17, 9, t));
      dist = 0;
      for (let k = 0; k < r.cases.length; k++) at.push(t);
    }
    return at;
  };
  const avg = sim(0.7, 3, 180);
  assert.ok(avg[0] >= 9 && avg[0] <= 15, `first case at ${avg[0]} min`);
  const gaps = avg.slice(1).map((t, i) => t - avg[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  assert.ok(mean >= 15 && mean <= 25, `mean gap ${mean.toFixed(1)} min (${gaps.join(', ')})`);
  const slow = sim(0.45, 4, 180), fast = sim(1.0, 2, 180);
  assert.ok(slow[0] <= 20 && fast[0] >= 6, `slow first ${slow[0]} min, fast first ${fast[0]} min`);
  assert.ok(180 / slow.length <= 32 && 180 / fast.length >= 11, `slow every ${(180 / slow.length).toFixed(0)}, fast every ${(180 / fast.length).toFixed(0)} min`);
});

await test('progression: milestones and first-run bonuses pay once; dupes become progress', () => {
  const p = schema.defaultProfile();
  const a = rewards.creditRun(p, { mapId: 'm1', trailId: 'm1.0', distance: 1200, finished: true });
  assert.ok(a.gains.some((g) => g.label === 'First kilometre') && a.gains.some((g) => g.label.startsWith('First run')));
  assert.ok(a.gains.some((g) => g.label === 'New trail finished'));
  assert.ok(a.gains.some((g) => g.label === 'First run today'));
  const b = rewards.creditRun(p, { mapId: 'm1', trailId: 'm1.0', distance: 1200, finished: true });
  assert.ok(!b.gains.some((g) => g.milestone), 'no second bonus');
  // A "run" from a drop zone next to the finish earns its distance but no finish bonus.
  const c = rewards.creditRun(p, { mapId: 'm2', trailId: 'm2.0', distance: 120, finished: true });
  assert.ok(!c.gains.some((g) => g.label === 'Run complete' || g.label.startsWith('First run')), 'no bonus for a 120 m run');
  assert.ok(Math.abs(c.xp - 0.12 * rewards.EARN.perKm) < 1e-9);
  // The next day pays the daily bonus again.
  const d = rewards.creditRun(p, { mapId: 'm1', distance: 900, finished: true }, Date.now() + 86400000);
  assert.ok(d.gains.some((g) => g.label === 'First run today'));
  // Open 300 cases with a seeded RNG: duplicates convert to XP (and so to more cases).
  const rng = rewards.seeded(7);
  for (let i = 0; i < 300; i++) rewards.grantCase(p, 'test');
  let dupes = 0, fromDupes = 0, xp = 0;
  while (p.rewards.cases.length) {
    const r = rewards.openCase(p, null, rng);
    if (r.dupe) { dupes++; xp += r.dupeXp; fromDupes += r.cases.length; }
  }
  assert.ok(dupes > 100, `${dupes} duplicates`);
  assert.equal(p.rewards.dupeXp, xp);
  assert.ok(fromDupes >= Math.floor(xp / rewards.CASE_XP) - 1 && fromDupes > 10, `${fromDupes} cases from dupes`);
  assert.ok(Object.values(p.inventory.items).some((e) => e.n > 1));
  const col = rewards.collection(p);
  assert.ok(col.pct > 0.5 && col.pct <= 1, `collection ${(col.pct * 100).toFixed(0)} %`);
  assert.equal(p.rewards.opened, 300 + fromDupes);
});

await test('collection bonus: owning every skin of a case pays two cases once', () => {
  const p = schema.defaultProfile();
  const pool = rewards.casePool('night-park');
  const keys = RARITIES.filter((r) => r.id !== 'gold').flatMap((r) => pool[r.id].map((e) => e.key));
  const last = keys.pop();
  for (const k of keys) p.inventory.items[k] = { at: 1, n: 1, seen: true };
  // Force the last missing skin out of a case: a seeded RNG that rolls it.
  let res = null;
  for (let seed = 1; seed < 50000 && !res?.completed; seed++) {
    const q = JSON.parse(JSON.stringify(p));
    rewards.grantCase(q, 'test', Date.now(), 'night-park');
    const r = rewards.openCase(q, null, rewards.seeded(seed));
    if (r.key === last) { res = r; Object.assign(p, q); }
  }
  assert.ok(res && res.completed === 'night-park', 'completes the Night Park collection');
  assert.equal(res.cases.filter((c) => c.source === 'collection').length, rewards.COLLECTION_BONUS);
  assert.deepEqual(p.rewards.completed, ['night-park']);
});

await test('bad-luck protection: red or gold at least every PITY cases', () => {
  const p = schema.defaultProfile();
  const rng = rewards.seeded(99);
  let since = 0, worst = 0, pities = 0;
  for (let i = 0; i < 3000; i++) {
    rewards.grantCase(p, 'test');
    const r = rewards.openCase(p, null, rng);
    pities += r.pity ? 1 : 0;
    since = ['legendary', 'gold'].includes(r.rarity) ? 0 : since + 1;
    worst = Math.max(worst, since);
  }
  assert.ok(worst < rewards.PITY, `longest dry streak ${worst} < ${rewards.PITY}`);
  assert.ok(pities > 0 && pities < 50, `${pities} pity pulls in 3000`);
});

await test('tracker: finished runs emit runCompleted and earn case XP; leaving credits the rest', async () => {
  const st = await import('../src/state.js');
  const { installRideTracker } = await import('../src/profile/tracker.js');
  profileStore.reset();
  installRideTracker({ getMapId: () => 'blackspruce', getTrailBoard: () => 'blackspruce/main' });
  const runs = [];
  const off = on('runCompleted', (e) => runs.push(e));
  st.resetScore();
  st.emit('rideStarted', { mapId: 'blackspruce', equipment: 'skis' });
  st.game.distance = 1800; st.game.score = 900;
  st.emit('runComplete');                                   // Zen finish line
  st.game.distance = 3000;
  st.emit('runFinished', { medal: 'gold', score: 1500 });   // Challenge finish
  st.game.distance = 3400;
  st.emit('rideEnded', st.scoreSnapshot());
  await new Promise((r) => setTimeout(r, 20));
  off();
  assert.equal(runs.length, 2);
  assert.deepEqual([runs[0].mapId, runs[0].trailId, Math.round(runs[0].distance), runs[0].mode], ['blackspruce', 'blackspruce/main', 1800, 'zen']);
  assert.deepEqual([Math.round(runs[1].distance), runs[1].mode, runs[1].medal, runs[1].score], [1200, 'challenge', 'gold', 1500]);
  assert.ok(typeof runs[0].time === 'number' && runs[0].time >= 0);
  const r = profileStore.rewards;
  assert.equal(Math.round(r.distance), 3400, 'all 3.4 km credited once');
  // 1.8 km run (finish, first map, first trail, first today, first km) + 1.2 km run (finish, gold) + 0.4 km at the end.
  const want = 3.4 * rewards.EARN.perKm + 2 * rewards.EARN.finish + rewards.EARN.medal.gold + rewards.EARN.firstMap + rewards.EARN.firstTrail + rewards.EARN.firstToday + 50;
  assert.ok(Math.abs(r.xpTotal - want) < 1e-6, `xp ${r.xpTotal} vs ${want}`);
  assert.equal(profileStore.profile.stats.runsCompleted, 2);
  // A rank-up in the game-feel progression (bus event juiceLevelUp) is a milestone case; a plain level-up is not.
  const before = profileStore.unopened.length;
  st.emit('juiceLevelUp', { level: 4, rankUp: false });
  st.emit('juiceLevelUp', { level: 5, rankUp: true });
  assert.equal(profileStore.unopened.length, before + 1);
  assert.equal(profileStore.unopened.at(-1).source, 'rank');
});

await test('hardening: garbled saves do not back-pay milestones, lose cases or share case ids', () => {
  const r = rewards.sanitizeRewards({ distance: 5e6, milestone: 0, cases: [{ series: 'first-chair' }, { series: 'first-chair' }, { id: 'x', series: 'nope' }] });
  assert.equal(r.milestone, 5e6, 'passed milestones count as paid');
  assert.equal(r.cases.length, 2);
  assert.notEqual(r.cases[0].id, r.cases[1].id);
  const p = schema.defaultProfile();
  p.rewards = r;
  const c = rewards.creditRun(p, { mapId: 'm', distance: 100, finished: false });
  assert.ok(c.cases.length === 0 && c.xp < 10, 'no flood of milestone cases');
  const many = rewards.sanitizeRewards({ cases: Array.from({ length: 700 }, (_, i) => ({ id: `k${i}`, series: 'night-park' })) });
  assert.equal(many.cases.length, 500);
  assert.equal(many.cases.at(-1).id, 'k699', 'the newest cases are kept');
});

await test('store: a deferred openCase saves at once but announces only at the reveal', () => {
  profileStore.reset();
  profileStore.grantCase('test');
  const seen = [];
  const offs = [on('rewards', (e) => seen.push(e.reason)), on('profile', (e) => seen.push(`p:${e.reason}`))];
  const res = profileStore.openCase(null, rewards.seeded(9), { defer: true });
  assert.deepEqual(seen, [], 'nothing announced while the reel spins');
  assert.equal(JSON.parse(mem.get(schema.PROFILE_KEY)).rewards.opened, 1, 'but already saved');
  res.announce(); res.announce();
  offs.forEach((f) => f());
  assert.deepEqual(seen, ['p:case', 'open'], 'announced once');
});

await test('store: openCase persists the pull and emits rewards / caseEarned', () => {
  profileStore.reset();
  const seen = [];
  const offs = [on('caseEarned', (e) => seen.push(['earned', e.cases.length])), on('rewards', (e) => seen.push(['rewards', e.reason]))];
  profileStore.grantCase('test');
  const res = profileStore.openCase(null, rewards.seeded(3));
  offs.forEach((f) => f());
  assert.ok(res && res.key && res.reel.cards.length === 60);
  assert.ok(profileStore.owns(res.item.id, res.variant.id));
  assert.equal(JSON.parse(mem.get(schema.PROFILE_KEY)).rewards.opened, 1, 'saved');
  assert.deepEqual(seen.slice(0, 3), [['rewards', 'grant'], ['earned', 1], ['rewards', 'open']]);
  assert.equal(profileStore.openCase(), null, 'no case left');
  assert.equal(profileStore.equip(res.item.id, res.variant.id), true, 'the pull can be worn');
});

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);
