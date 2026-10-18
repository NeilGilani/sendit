// Thrill checks (no browser), run from unittest.mjs: spot book (discovery, gaps, catalog, garbage input),
// landing judging, retry-from-take-off trail, exposure / heartbeat, the replay frame ring, and versus codes.
// Standalone: node web/scripts/thrill-unit.mjs
export async function run(test, assert) {
  const T = await import('../src/thrill/core.js');
  const memStore = () => { const m = new Map(); return { m, get: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => m.set(k, JSON.stringify(v)) }; };

  await test('thrill spots: first send is new, repeats count, found / total follow the catalog', () => {
    const st = memStore();
    const b = new T.SpotBook(st);
    b.setCatalog('rav', ['The Throne', 'Band A', 'Wind Lip']);
    let r = b.record('rav', 'The Throne');
    assert.deepEqual([r.isNew, r.n, r.found, r.total], [true, 1, 1, 3]);
    r = b.record('rav', 'The Throne');
    assert.deepEqual([r.isNew, r.n, r.found], [false, 2, 1]);
    r = b.record('rav', 'Secret Ledge');   // not in the catalog: still counts, total grows
    assert.deepEqual([r.isNew, r.found, r.total], [true, 2, 4]);
    const s = b.summary('rav');
    assert.equal(s.spots[0].n > 0, true, 'found first');
    assert.equal(s.spots.at(-1).n, 0, 'unfound last');
    const b2 = new T.SpotBook(st);   // persisted
    assert.equal(b2.summary('rav').found, 2);
    assert.equal(b2.summary('other').total, 0);
  });

  await test('thrill spots: gaps are named A → B and count up; catalog only rewrites on change', () => {
    const b = new T.SpotBook(memStore());
    assert.deepEqual(b.recordGap('m', 'A', 'B'), { isNew: true, n: 1, name: 'A → B' });
    assert.equal(b.recordGap('m', 'A', 'B').isNew, false);
    assert.equal(b.summary('m').gaps[0].n, 2);
    assert.equal(b.setCatalog('m', ['x', 'y']), true);
    assert.equal(b.setCatalog('m', ['y', 'x', 'x']), false, 'same set');
    assert.equal(b.hasCatalog('m'), true);
    assert.equal(b.hasCatalog('m', 2), false, 'new catalog version');
  });

  await test('thrill spots: garbage storage is repaired', () => {
    for (const junk of [null, 5, 'x', { maps: 3 }, { maps: { a: null, b: { spots: { q: { n: -1 }, ok: { n: 2 } }, gaps: { g: 'x' }, catalog: { names: [1, 'a'] } } } }]) {
      const st = memStore(); st.set('sendit.spots', junk);
      const b = new T.SpotBook(st);
      assert.ok(b.state.maps && typeof b.state.maps === 'object');
      b.record('z', 'Spot');
    }
    const st = memStore(); st.set('sendit.spots', { maps: { b: { spots: { q: { n: -1 }, ok: { n: 2 } }, catalog: { names: [1, 'a'] } } } });
    const s = new T.SpotBook(st).summary('b');
    assert.deepEqual(s.spots.map((x) => x.name).sort(), ['a', 'ok']);
  });

  await test('thrill judgeLanding: needs a clean send off a named take-off; gaps need a different landing spot', () => {
    assert.deepEqual(T.judgeLanding({ clean: false, air: 2, from: 'A' }), { spot: null, gap: null });
    assert.deepEqual(T.judgeLanding({ clean: true, air: 0.3, drop: 1, from: 'A' }), { spot: null, gap: null });
    assert.deepEqual(T.judgeLanding({ clean: true, air: 0.3, drop: 5, from: 'A' }), { spot: 'A', gap: null });
    assert.deepEqual(T.judgeLanding({ clean: true, air: 1.2, from: 'A', to: 'A' }), { spot: 'A', gap: null });
    assert.deepEqual(T.judgeLanding({ clean: true, air: 1.2, from: 'A', to: 'B' }), { spot: 'A', gap: ['A', 'B'] });
    assert.deepEqual(T.judgeLanding({ clean: true, air: 0.7, from: 'A', to: 'B' }), { spot: 'A', gap: null }, 'short hop is no gap');
    assert.deepEqual(T.judgeLanding({ clean: true, air: 2 }), { spot: null, gap: null });
  });

  await test('thrill retry: picks the approach `lead` s before the last take-off', () => {
    const r = new T.RetryTrail(10);
    assert.equal(r.pick(), null);
    for (let i = 0; i <= 80; i++) r.push(i / 8, { x: i, y: 0, z: 0, h: 0, vx: 1, vy: 0, vz: 0 });
    assert.equal(r.pick(), null, 'no take-off yet');
    r.markTakeoff(9);
    assert.equal(r.pick(2.5).t, 6.5);
    assert.equal(r.pick(2.6).t, 6.375);
    r.markTakeoff(0.5);   // a take-off right after the oldest sample kept
    r.push(11, { x: 0, y: 0, z: 0, h: 0, vx: 0, vy: 0, vz: 0 });   // drops samples older than 1 s
    assert.equal(r.s[0].t >= 1, true);
    assert.equal(r.pick(), null, 'take-off older than anything kept');
    r.markTakeoff(10.6);
    assert.equal(r.pick(2.6).t, 8);
    assert.equal(r.pick(10).t, r.s[0].t, 'falls back to the oldest sample');
  });

  await test('thrill exposure: an even steep slope reads calm, a cliff ahead and big air read exposed', () => {
    const slope = (x) => -x * 0.7;                    // 35° even slope falling toward +x
    const cliff = (x) => (x < 8 ? -x * 0.3 : -2.4 - 25 - (x - 8) * 0.3);   // 25 m band at 8 m
    assert.ok(T.dropAhead((x) => slope(x), 0, 0, 0, 1, 0) < 0.01);
    const d = T.dropAhead((x) => cliff(x), 0, 0, 0, 1, 0);
    assert.ok(d > 20 && d < 30, String(d));
    assert.equal(T.exposureLevel({ drop: 0, above: 0, speedRatio: 0.5 }), 0);
    assert.equal(T.exposureLevel({ drop: 30 }), 1);
    assert.ok(Math.abs(T.exposureLevel({ above: 15 }) - 0.5) < 1e-9);
    assert.ok(T.exposureLevel({ speedRatio: 1.2 }) <= T.THRILL.exposure.speedShare + 1e-9, 'speed alone stays subtle');
    assert.equal(T.heartbeatBpm(0.1), 0);
    assert.equal(T.heartbeatBpm(1), T.THRILL.exposure.bpm[1]);
    assert.ok(T.heartbeatBpm(0.5) > T.heartbeatBpm(0.3));
  });

  await test('thrill replay ring: wraps, keeps order, finds frames by time', () => {
    const r = new T.FrameRing(4, 2);
    assert.equal(r.at(1), null);
    for (let i = 0; i < 6; i++) { const o = r.push(i * 0.5); r.data[o] = i; }
    assert.equal(r.count, 4);
    assert.deepEqual([0, 1, 2, 3].map((j) => r.data[r.offset(j)]), [2, 3, 4, 5]);
    assert.equal(r.t0, 1); assert.equal(r.t1, 2.5);
    const f = r.at(1.75);
    assert.deepEqual([f.a, f.b], [1, 2]);
    assert.ok(Math.abs(f.k - 0.5) < 1e-9);
    assert.deepEqual(r.at(0), { a: 0, b: 0, k: 0 });
    assert.deepEqual(r.at(9), { a: 3, b: 3, k: 0 });
  });

  await test('thrill achievements: spots, gaps and versus wins unlock Scout, Mind the Gap, Gap Master, Bragging Rights', async () => {
    const { Progression } = await import('../src/progression/core.js');
    const st = memStore(), got = [];
    const p = new Progression({ storage: st, emit: (n, d) => { if (n === 'achievement') got.push(d.id); } });
    for (let i = 0; i < 9; i++) p.recordThrill('spot');
    assert.ok(!got.includes('spots-10'));
    p.recordThrill('spot'); p.recordThrill('gap'); p.recordThrill('versusWin'); p.recordThrill('nonsense');
    assert.deepEqual(['spots-10', 'gap-1', 'versus-win'].filter((x) => got.includes(x)).length, 3);
    for (let i = 0; i < 9; i++) p.recordThrill('gap');
    assert.ok(got.includes('gap-10'));
    assert.equal(new Progression({ storage: st, emit: () => {} }).state.life.spots, 10, 'persisted');
  });

  await test('thrill clipRange: around a recent moment, else the last seconds, never across a teleport', () => {
    const C = T.THRILL.replay, ring = { t0: 10, t1: 18 };
    assert.deepEqual(T.clipRange(ring, [], { t: 15, before: 4, after: 1.5 }, 18), { a: 11, b: 16.5 });
    assert.deepEqual(T.clipRange(ring, [], { t: 15, before: 4, after: 1.5 }, 15 + C.window + 1), { a: 12, b: 18 }, 'stale moment → last 6 s');
    assert.deepEqual(T.clipRange(ring, [13], { t: 15, before: 4, after: 1.5 }, 18), { a: 13, b: 16.5 }, 'starts after an earlier cut');
    assert.deepEqual(T.clipRange(ring, [16], { t: 14, before: 2.5, after: 3.2 }, 18), { a: 11.5, b: 16 }, 'a wipeout stops at its respawn');
    assert.equal(T.clipRange(ring, [17.5], null, 18), null, 'half a second since a teleport');
    assert.deepEqual(T.clipRange({ t0: 0, t1: 3 }, [], null, 3), { a: 0, b: 3 });
  });

  await test('thrill versus: codes round-trip with a compact ghost; junk decodes to null', () => {
    const ghost = [];
    for (let i = 0; i <= 900; i++) { const t = i / 10; ghost.push(+t.toFixed(2), +(100 + t * 11.3).toFixed(2), +(2000 - t * 6.1).toFixed(2), +(-40 + Math.sin(t) * 9).toFixed(2), +((t * 0.3) % 6).toFixed(3)); }
    const code = T.encodeVersus({ map: 'ravenspire', trail: 'the-throne', name: 'Mikë 🏂', time: 93.456, score: 12345, medal: 'gold', ghost });
    assert.ok(code.length < 4000, `code length ${code.length}`);
    assert.match(code, /^[A-Za-z0-9_\-.]+$/, 'URL safe');
    const d = T.decodeVersus(code);
    assert.equal(d.map, 'ravenspire'); assert.equal(d.trail, 'the-throne'); assert.equal(d.name, 'Mikë 🏂');
    assert.equal(d.time, 93.456); assert.equal(d.score, 12345); assert.equal(d.medal, 'gold');
    assert.ok(d.ghost.length / 5 > 250 && d.ghost.length / 5 < 320, String(d.ghost.length / 5));
    for (let i = 0; i < d.ghost.length; i += 5) {   // every kept frame within quantisation of the source
      const j = Math.round(d.ghost[i] * 10) * 5;
      for (let k = 1; k < 4; k++) assert.ok(Math.abs(d.ghost[i + k] - ghost[j + k]) <= 0.051, `axis ${k} at ${d.ghost[i]}`);
    }
    const noGhost = T.decodeVersus(T.encodeVersus({ map: 'm', time: 10 }));
    assert.equal(noGhost.ghost, null); assert.equal(noGhost.name, 'Rider');
    for (const junk of ['', 'abc', '!!!', null, 42, 'eyJ2IjoyfQ', `${code.split('.')[0]}.%%`]) assert.equal(T.decodeVersus(junk), null, String(junk));
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const assert = (await import('node:assert/strict')).default;
  let failed = 0;
  await run(async (name, fn) => { try { await fn(); console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.message}`); } }, assert);
  process.exit(failed ? 1 : 0);
}
