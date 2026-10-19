// Gear advisor checks (no browser), run from unittest.mjs: ratings from the real specs (scale, order,
// legendary = stock), "best at" badges (margin, ties, one model), map needs, playstyle, recommendations
// with mock profiles, and that nothing touches the physics specs. Standalone: node web/scripts/gear-advisor-unit.mjs
export async function run(test, assert) {
  const A = await import('../src/lobby/gearAdvisor.js');
  const { getEquipmentSpec, deriveHandling } = await import('../src/equipment/registry.js');
  const ski = (id, extra = {}) => ({ key: `ski:${id}`, name: `Ski ${id}`, type: 'ski', spec: id, ...extra });
  const board = (id, extra = {}) => ({ key: `sb:${id}`, name: `Board ${id}`, type: 'snowboard', spec: id, ...extra });
  const SKIS = ['allmountain', 'slalom', 'gs', 'powder', 'park'];
  const BOARDS = ['allmountain', 'freeride', 'carver', 'powder', 'park'];
  const MAPS = ['valcrest-gully', 'blackspruce', 'ravenspire', 'voltage-park', 'dragonback', 'kitsune-peak', 'fjordline'].map((id) => ({ id, mountain: { name: id } }));

  await test('gear ratings: 1–10, every stat spans the scale, stock models in the right order', () => {
    for (const [type, ids] of [['ski', SKIS], ['snowboard', BOARDS]]) {
      const rows = ids.map((id) => A.gearStats(type, id));
      for (const k of A.STAT_IDS) {
        const vals = rows.map((r) => r[k]);
        for (const v of vals) assert.ok(v >= 1 && v <= 10 && Math.round(v * 10) === v * 10, `${type} ${k} ${v}`);
        assert.equal(Math.max(...vals), 10, `${type} ${k}: the best model sits at 10`);
        assert.ok(Math.min(...vals) > 3 && Math.min(...vals) < 4, `${type} ${k}: the weakest keeps headroom (${Math.min(...vals)})`);
      }
    }
    const s = Object.fromEntries(SKIS.map((id) => [id, A.gearStats('ski', id)]));
    assert.equal(s.gs.speed, 10, 'GS race ski is the fastest (stiff, long, damp)');
    assert.equal(s.slalom.carve, 10, 'SL race ski carves best (grip + 12.5 m radius)');
    assert.equal(s.powder.powder, 10, 'powder ski floats best');
    assert.equal(s.park.park, 10, 'twin park ski is the park ski');
    assert.ok(s.powder.control > s.gs.control, 'rockered powder ski pivots easier than the GS');
    const b = Object.fromEntries(BOARDS.map((id) => [id, A.gearStats('snowboard', id)]));
    assert.equal(b.park.park, 10);
    assert.equal(b.powder.powder, 10);
    assert.ok(b.carver.carve >= b.allmountain.carve && b.freeride.speed > b.allmountain.speed);
  });

  await test('gear ratings follow the physics multipliers (deriveHandling) and leave the specs untouched', () => {
    const before = JSON.stringify(getEquipmentSpec('ski', 'gs'));
    const h = deriveHandling('ski', getEquipmentSpec('ski', 'gs'));
    const raw = A.rawStats('ski', 'gs');
    assert.ok(Math.abs(raw.speed - (0.7 * h.stability + 0.3 * h.grip)) < 1e-9);
    assert.ok(Math.abs(raw.powder - Math.sqrt(h.float)) < 1e-9);
    const ref = A.rawStats('ski', 'allmountain');
    for (const k of A.STAT_IDS) assert.ok(Math.abs(ref[k] - 1) < 1e-9, `reference model raw ${k} = 1`);
    A.gearDetails('ski', 'gs'); A.bestAt(SKIS.map((id) => ski(id)));
    assert.equal(JSON.stringify(getEquipmentSpec('ski', 'gs')), before, 'spec unchanged');
    const d = A.gearDetails('snowboard', 'park');
    assert.equal(d.twin, true); assert.equal(d.radius, 7.4); assert.equal(d.length, 152);
  });

  await test('legendary topsheets rate exactly like their stock model', () => {
    for (const [type, leg, base] of [['ski', 'holo', 'park'], ['ski', 'inferno', 'gs'], ['snowboard', 'chrome', 'carver'], ['snowboard', 'aurora', 'powder']]) {
      assert.deepEqual(A.gearStats(type, leg), A.gearStats(type, base), `${type} ${leg} = ${base}`);
    }
  });

  await test('best-at badges: clear leaders only, one per stat, all five on a full ski rack', () => {
    const b = A.bestAt(SKIS.map((id) => ski(id)));
    assert.deepEqual(b['ski:gs'], ['fastest']);
    assert.deepEqual(b['ski:slalom'], ['carver']);
    assert.deepEqual(b['ski:powder'], ['control', 'powder']);
    assert.deepEqual(b['ski:park'], ['park']);
    assert.deepEqual(b['ski:allmountain'], [], 'the balanced ski leads nothing');
    const all = Object.values(b).flat();
    assert.equal(new Set(all).size, all.length, 'no badge twice');
  });

  await test('best-at badges: one model owned → none; a stock + legendary copy share the badge', () => {
    assert.deepEqual(A.bestAt([ski('allmountain')]), { 'ski:allmountain': [] });
    assert.deepEqual(A.bestAt([ski('gs'), ski('inferno', { key: 'ski:inferno' })]), { 'ski:gs': [], 'ski:inferno': [] }, 'same model twice is still one model');
    const b = A.bestAt([ski('gs'), ski('inferno', { key: 'ski:inferno' }), ski('park')]);
    assert.deepEqual(b['ski:gs'], b['ski:inferno']);
    assert.ok(b['ski:gs'].includes('fastest'));
    assert.ok(b['ski:park'].includes('park'));
  });

  await test('best-at badges: ties and near ties give no badge', () => {
    const mk = (key, speed, carve) => ({ key, name: key, type: 'ski', spec: 'allmountain', stats: { speed, carve, control: 5, park: 5, powder: 5 }, raw: A.rawStats('ski', 'allmountain') });
    const tie = A.bestAt([mk('a', 8, 6), mk('b', 8, 7)]);
    assert.ok(!tie.a.includes('fastest') && !tie.b.includes('fastest'), 'exact tie on speed');
    const near = A.bestAt([mk('a', 8.3, 6), mk('b', 8, 9)]);
    assert.ok(!near.a.includes('fastest'), `0.3 lead is under the ${A.BADGE_MARGIN} margin`);
    assert.ok(near.b.includes('carver'), 'a 3-point lead earns the badge');
    assert.deepEqual(A.bestAt([mk('a', 5, 5), mk('b', 5, 5)]), { a: [], b: [] }, 'identical numbers = one model');
  });

  await test('map needs: park map asks for park, Kitsune for powder, Blackspruce for control', () => {
    const top = (m) => Object.entries(A.mapNeeds(m)).sort((x, y) => y[1] - x[1])[0][0];
    assert.equal(top('voltage-park'), 'park');
    assert.equal(top('kitsune-peak'), 'powder');
    assert.equal(top('blackspruce'), 'control');
    for (const m of MAPS) { const w = A.mapNeeds(m); assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9, m.id); }
    assert.ok(A.mapNeeds('kitsune-peak').powder > A.mapNeeds('voltage-park').powder * 5, 'powder weight follows powderDepth');
    const unknown = A.mapNeeds({ id: 'new-park', tags: ['park', 'rails'] });
    assert.equal(Object.entries(unknown).sort((x, y) => y[1] - x[1])[0][0], 'park', 'unknown maps fall back to their tags');
  });

  await test('playstyle: no data → zero confidence; trick / speed / crash riders lean the right way', () => {
    const none = A.playstyle({}, {});
    assert.equal(none.confidence, 0);
    const trick = A.playstyle({ meters: 20000, tricks: 260, trickBook: { 'BS 360': 60, 'FS 540 Indy': 30, 'Cork 720': 4 } }, {});
    assert.ok(trick.confidence > 0.4 && trick.weights.park > 0.6, JSON.stringify(trick.weights));
    assert.ok(trick.traits.spins > trick.traits.flips);
    const speed = A.playstyle({ meters: 30000, tricks: 10, topKmh: 104 }, {});
    assert.ok(speed.weights.speed > 0.6, JSON.stringify(speed.weights));
    const crashy = A.playstyle({ meters: 12000, tricks: 12, wipeouts: 40, topKmh: 60 }, {});
    assert.ok(crashy.weights.control > 0.6, JSON.stringify(crashy.weights));
    const short = A.playstyle({ meters: 1500, tricks: 30 }, {});
    assert.ok(short.confidence < 0.1, 'a short session barely counts');
  });

  await test('recommend: little data → all-mountain pick; < 2 models → null', () => {
    assert.equal(A.recommend([ski('allmountain')], { maps: MAPS }), null);
    assert.equal(A.recommend([ski('gs'), ski('inferno', { key: 'ski:inferno' })], { maps: MAPS }), null);
    const r = A.recommend(SKIS.map((id) => ski(id)), { maps: MAPS });
    assert.equal(r.source, 'allmountain');
    assert.equal(r.confidence, 0);
    assert.ok(r.reason.includes('→') && r.reason.length < 90, r.reason);
    assert.equal(r.key, 'ski:powder', 'deep-snow mountains: the floaty, forgiving ski wins on all-mountain');
    const classic = A.recommend([ski('allmountain'), ski('gs'), ski('slalom')], { maps: MAPS });
    assert.equal(classic.key, 'ski:allmountain', 'between race skis and the all-mountain, the all-rounder wins');
    assert.match(classic.reason, /^Best all-rounder across all 7 mountains/);
  });

  await test('recommend: playstyle moves the pick (spins → park ski, speed → GS, crashes → forgiving)', () => {
    const items = SKIS.map((id) => ski(id));
    const spins = A.recommend(items, { maps: MAPS, life: { meters: 25000, tricks: 300, trickBook: { 'Left 360': 90, 'Right 540': 40 } } });
    assert.equal(spins.key, 'ski:park');
    assert.equal(spins.source, 'playstyle');
    assert.match(spins.reason, /^You land lots of spins → Ski park pops and spins best$/);
    const fast = A.recommend([ski('allmountain'), ski('gs'), ski('park')], { maps: MAPS, life: { meters: 40000, tricks: 20, topKmh: 110 } });
    assert.equal(fast.key, 'ski:gs');
    assert.match(fast.reason, /^You ride fast \(top 110 km\/h\)/);
    const crashy = A.recommend([ski('gs'), ski('slalom'), ski('allmountain')], { maps: MAPS, life: { meters: 15000, tricks: 10, wipeouts: 50 } });
    assert.equal(crashy.key, 'ski:allmountain', 'crash-prone rider gets the most forgiving of the three');
    const boards = A.recommend(BOARDS.map((id) => board(id)), { maps: MAPS, life: { meters: 25000, tricks: 300, trickBook: { 'BS 360': 90 } } });
    assert.equal(boards.key, 'sb:park');
  });

  await test('recommend: a favourite mountain counts; per-mountain picks follow the terrain', () => {
    const items = [ski('allmountain'), ski('gs'), ski('powder'), ski('park')];
    const kit = A.recommend(items, { maps: MAPS, life: { meters: 20000, tricks: 20, maps: { 'kitsune-peak': 30, fjordline: 2 } }, mapName: () => 'Kitsune Peak' });
    assert.equal(kit.key, 'ski:powder');
    assert.equal(A.recommendForMap(items, { id: 'voltage-park' }).key, 'ski:park');
    assert.equal(A.recommendForMap(items, { id: 'kitsune-peak' }).key, 'ski:powder');
    assert.ok(A.recommendForMap(items, { id: 'kitsune-peak' }).terrain.includes('deep powder'));
    assert.equal(A.recommendForMap([ski('allmountain')], { id: 'kitsune-peak' }), null);
    // Ties: equal scores fall back to what you ride, then the key (stable).
    const tie = A.recommendForMap([ski('gs', { equipped: true }), ski('inferno', { key: 'ski:inferno' }), ski('park')], { id: 'dragonback' });
    assert.ok(['ski:gs', 'ski:park'].includes(tie.key));
  });

  await test('statDelta and shortName', () => {
    assert.deepEqual(A.statDelta({ speed: 5, carve: 6, control: 7, park: 8, powder: 9 }, { speed: 6.2, carve: 6, control: 6.1, park: 8, powder: 10 }),
      { speed: 1.2, carve: 0, control: -0.9, park: 0, powder: 1 });
    assert.equal(A.shortName('Valcrest GS Race 188'), 'GS Race 188');
    assert.equal(A.shortName('★ Twin 168'), '★ Twin 168');
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert/strict')).default;
  let failed = 0;
  await run(async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); } }, assert);
  process.exit(failed ? 1 : 0);
}
