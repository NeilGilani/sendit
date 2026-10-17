// Trail checks for every built-in map (docs/maps.md), in Node, no browser: each map declares a mountain and
// static trails; every trail's start resolves on the loaded course (trailSpawn → dropZone → at), sits on
// the snow above the finish, faces downhill, and the declared length / vertical are close to what the
// course measures (start → finish). Lake Tahoe (real data, fetched) is checked for data only.
// Usage: node web/scripts/trails-check.mjs [--measure]   (--measure prints the measured numbers)
import assert from 'node:assert/strict';

globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const registry = await import('../src/maps/registry.js');
await import('../src/maps/builtin.js');
const MEASURE = process.argv.includes('--measure');

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.stack?.split('\n').slice(0, 3).join('\n      ')}`); }
}

const maps = registry.listMaps();
await test('every built-in map has a mountain and valid static trails', () => {
  assert.ok(maps.length >= 5);
  for (const m of maps) {
    assert.ok(m.mountain?.name && m.mountain.region, `${m.id}: mountain name + region`);
    assert.ok(m.declared.mountain, `${m.id}: declares its mountain`);
    assert.ok(m.trails.length >= 1 && m.declared.trails, `${m.id}: declares trails`);
    for (const t of m.trails) {
      assert.ok(registry.DIFFICULTIES[t.difficulty], `${m.id}/${t.id} difficulty`);
      assert.ok(t.name && t.description, `${m.id}/${t.id} name + description`);
    }
  }
  const mtns = registry.listMountains();
  assert.equal(new Set(mtns.map((x) => x.id)).size, mtns.length);
});

await test('Lake Tahoe: every resort run is a trail carrying its variant', () => {
  const m = registry.getMap('lake-tahoe');
  assert.equal(m.trails.length, 30);
  for (const t of m.trails) assert.equal(t.id, `${t.variant.resort}:${t.variant.run}`);
  assert.equal(new Set(m.trails.map((t) => t.group)).size, 10);
});

// Height and fall-line progress straight from the course (no terrain build needed).
const H = (course, x, z) => course.height(x, z);
const fmt = (n) => (n == null ? '—' : Math.round(n));
for (const map of maps) {
  if (map.id === 'lake-tahoe') continue;
  await test(`${map.id}: every trail starts on the course, above the finish, facing downhill`, async () => {
    const course = await map.load({ variant: null, trail: null, onProgress: () => {} });
    const sp = course.spawnPoint?.() ?? course.centre?.(12);
    assert.ok(sp && Number.isFinite(sp.x), 'default spawn');
    const fallback = { position: { x: sp.x, z: sp.z }, heading: sp.heading };
    const finish = course.finishAt;
    const fin = pointAlong(course.path, finish);
    const yFinish = fin ? H(course, fin.x, fin.z) : null;
    const rows = [];
    for (const [i, t] of map.trails.entries()) {
      const s = registry.trailSpawnFor(course, t.id, fallback, t);
      if (i > 0) assert.equal(s.fallback, false, `${t.id}: resolves its own start (not the default spawn)`);
      const y = H(course, s.x, s.z);
      assert.ok(Number.isFinite(y) && Number.isFinite(s.heading), `${t.id}: finite`);
      // Downhill: 10 m ahead along the heading is lower than 10 m behind.
      const fx = -Math.sin(s.heading), fz = -Math.cos(s.heading);
      const ahead = H(course, s.x + fx * 10, s.z + fz * 10), behind = H(course, s.x - fx * 10, s.z - fz * 10);
      assert.ok(ahead < behind + 0.5, `${t.id}: faces downhill (ahead ${ahead.toFixed(1)} vs behind ${behind.toFixed(1)})`);
      const prog = course.progress(s.x, s.z);
      assert.ok(prog < finish, `${t.id}: starts above the finish (${prog.toFixed(0)} < ${finish.toFixed(0)})`);
      const mLen = finish - Math.max(0, prog), mVert = yFinish == null ? null : y - yFinish;
      if (!MEASURE && t.length != null) assert.ok(Math.abs(t.length - mLen) <= Math.max(40, mLen * 0.1), `${t.id}: declared length ${t.length} vs measured ${mLen.toFixed(0)}`);
      if (!MEASURE && t.vertical != null && mVert != null) assert.ok(Math.abs(t.vertical - mVert) <= Math.max(25, mVert * 0.12), `${t.id}: declared vertical ${t.vertical} vs measured ${mVert.toFixed(0)}`);
      rows.push({ id: t.id, x: s.x.toFixed(0), z: s.z.toFixed(0), heading: s.heading.toFixed(2), progress: fmt(prog), length: fmt(mLen), declared: fmt(t.length), vertical: fmt(mVert), declaredV: fmt(t.vertical) });
    }
    // Distinct starts: no two non-default trails at the same spot.
    const keys = rows.map((r) => `${r.x},${r.z}`);
    assert.equal(new Set(keys.slice(1)).size, keys.length - 1, 'distinct starts');
    if (MEASURE) console.table(rows);
  });
}

/** Point `d` metres along a polyline of { x, y } (y = world z). */
function pointAlong(path, d) {
  if (!path?.length) return null;
  let acc = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i], b = path[i + 1], seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= d) { const k = seg ? (d - acc) / seg : 0; return { x: a.x + (b.x - a.x) * k, z: a.y + (b.y - a.y) * k }; }
    acc += seg;
  }
  const e = path[path.length - 1];
  return { x: e.x, z: e.y };
}

console.log(failed ? `\n${failed} failed, ${passed} passed` : `\nall ${passed} passed`);
process.exit(failed ? 1 : 0);
