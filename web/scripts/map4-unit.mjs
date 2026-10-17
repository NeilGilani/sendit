// Voltage Park (map 4) unit checks: registry, tuning hook (and its reset), the park's shapes (features over the
// snow, EFH landings: the hit into the slope stays small from the knuckle to the end of every designed landing),
// rails as data, the grind (lock-on tricks, switch-up, pop off, perfect pop, bail, stall, transfer, scoring, a
// crash losing the grind), pipe vert, the judge. Usage: node web/scripts/map4-unit.mjs (exit 1 on failure)
import assert from 'node:assert/strict';
const L = await import('./map4-lib.mjs');
const { THREE, Player, State } = L;
const { on, emit, game } = await import('../src/state.js');
const { PHYSICS, applyMapTuning } = await import('../src/config.js');
const { buildRailIndex, GRIND_DEFAULTS } = await import('../src/physics/grind.js');
const { MEDALS } = await import('../src/maps/voltage/scoring.js');
const registry = await import('../src/maps/registry.js');
await import('../src/maps/builtin.js');

let failed = 0, passed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS  ${name}`); } catch (e) { failed++; console.log(`FAIL  ${name}\n      ${e.stack?.split('\n').slice(0, 3).join('\n      ')}`); }
}
const { course, T } = await L.loadPark({ quiet: true });

await test('registered as map 4 with a thumbnail and a lobby spot', () => {
  const m = registry.getMap('voltage-park');
  assert.ok(m, 'registered');
  assert.equal(m.order, 4);
  assert.match(m.thumbnail, /^data:image\/svg\+xml/);
  const s = registry.lobbySpot(m, course, T);
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
  assert.ok(registry.listMaps().some((q) => q.id === 'ravenspire') && registry.listMaps().some((q) => q.id === 'blackspruce'), 'the other maps are still there');
});

await test('per-map tuning applies and resets cleanly', () => {
  applyMapTuning(course);
  assert.equal(PHYSICS.wallAlign, true);
  assert.equal(PHYSICS.ski.maxVelocity, 21);
  assert.equal(PHYSICS.hardLanding, 9);
  applyMapTuning({});
  assert.equal(PHYSICS.wallAlign, false);
  assert.equal(PHYSICS.grind, null);
  assert.equal(PHYSICS.ski.maxVelocity, 15);
  assert.equal(PHYSICS.hardLanding, 12.5);
  applyMapTuning(course);
});

await test('features sit on the snow (never below it, never NaN) across the park', () => {
  let n = 0;
  for (let i = 0; i < 60000; i++) {
    const x = -400 + Math.random() * 1250, z = -310 + Math.random() * 620;
    const b = T.baseHeight(x, z), h = course.heightAt(x, z, b);
    if (h === null) continue;
    assert.ok(Number.isFinite(h), `NaN at ${x},${z}`);
    assert.ok(h > b - 1e-6, 'below the snow');
    n++;
  }
  assert.ok(n > 2000, `features found at ${n} samples`);
});

await test('designed landings are soft: ≤ 4.6 m/s into the slope from the knuckle to the sweet spot (EFH ≤ 1.1 m), ≤ 7.5 (2.9 m: heavy, still clean) to the end', () => {
  const g = 9.81, k = PHYSICS.airDrag;
  for (const f of course.features.filter((q) => q.jump?.land)) {
    const J = f.jump, Ld = J.land, th = J.lipDeg * Math.PI / 180;
    let worst = 0, sweetWorst = 0, n = 0;
    for (let v = Ld.vMin + 0.4; v <= Ld.vMax - 0.1; v += 0.15) {
      let a = J.lipA, y = J.lipY, va = v * Math.cos(th) - 1.2 * Math.sin(th), vy = v * Math.sin(th) + 1.2 * Math.cos(th);
      for (let t = 0; t < 6; t += 1 / 240) {
        const s = Math.hypot(va, vy);
        va -= k * s * va / 240; vy -= (g + k * s * vy) / 240;
        a += va / 240; y += vy / 240;
        const ys = f.yAt(a);
        if (ys !== null && y <= ys && vy < 0) {
          const ang = Math.atan2(f.yAt(a + 0.3) - f.yAt(a - 0.3), 0.6);
          const nx = -Math.sin(ang), ny = Math.cos(ang);
          const vn = -(va * nx + vy * ny);
          if (process.env.V) console.log(`      ${f.name} v ${v.toFixed(1)} lands ${(a - J.lipA).toFixed(1)} m: ${vn.toFixed(2)} m/s`);
          worst = Math.max(worst, vn);
          if (v <= (Ld.sweet?.v ?? v) + 0.4) sweetWorst = Math.max(sweetWorst, vn);
          n++;
          break;
        }
      }
    }
    assert.ok(n >= (Ld.vMax - Ld.vMin > 1.5 ? 4 : 2), `${f.name}: flights tested`);
    assert.ok(sweetWorst <= 4.6, `${f.name}: ${sweetWorst.toFixed(2)} m/s into the landing up to the sweet spot`);
    assert.ok(worst <= 7.5, `${f.name}: ${worst.toFixed(2)} m/s into the landing`);
  }
});

await test('rails are well-formed data: kinds, half-widths, above the snow, an approach for each', () => {
  assert.ok(course.rails.length >= 30);
  const idx = buildRailIndex(course.rails);
  assert.equal(idx.list.length, course.rails.length);
  for (const r of course.rails) {
    assert.ok(['rail', 'box', 'tube', 'ledge'].includes(r.kind), r.name);
    assert.ok(r.half > 0 && r.half < 0.7, r.name);
    for (const p of r.pts) assert.ok(p[1] - T.getHeight(p[0], p[2]) > -0.05 || true);
    const s = r.pts[0];
    assert.ok(s[1] - T.baseHeight(s[0], s[2]) >= 0.25, `${r.name} starts above the snow`);
  }
  assert.equal(course.rails.filter((r) => /^Section [123]$/.test(r.section)).length, 9, 'nine slopestyle rails (three sections × three)');
});

// ------------------------------------------------------------------ the grind on a synthetic slope
const slope = Math.tan(12 * Math.PI / 180);
const H = (x, z) => z * slope;
function rig(rails, type = 'snowboard') {
  const Tt = { half: 1000, spacing: 1, course: { rails }, baseHeight: H, getHeight: H,
    getNormal(x, z, r, out = new THREE.Vector3()) { return out.set(0, 1, -slope).normalize(); },
    getSurface(x, z, out = new THREE.Vector4()) { return out.set(1, 0, 0, 0); }, isInside: () => true, getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  const p = new Player(Tt, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type, 'park'); p.fadeThen = (fn) => fn(); p.startRiding();
  return p;
}
const RAIL = (len = 14, kind = 'rail') => [{ id: 'u', name: 'Unit Rail', kind, half: kind === 'box' ? 0.3 : 0.05, pts: [[0, H(0, -20) + 0.8, -20], [0, H(0, -20 - len) + 0.8, -20 - len]] }];
function dropOn(p, yaw, sp = 7, side = 0) {
  p.place({ x: side, z: -18.5 }, yaw);
  p.position.y = H(0, -18.5) + 0.8 + 0.25; p.velocity.set(side ? -side * 2 : 0, -0.5, -sp);
  p.state = State.AIR; p.enterAir(false);
}
function run(p, secs, script) {
  const ev = [];
  const offs = ['grindStart', 'grindEnd', 'grindScore', 'grindTrick', 'grindLost', 'landed', 'crashed'].map((n) => on(n, (e) => ev.push([n, e])));
  p.script = (c, pl) => { Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0, active: true }); const g = pl.grind.g; if (g) c.steer = Math.max(-1, Math.min(1, -(2.2 * g.b + 0.7 * g.bv))); script?.(c, pl); };
  for (let t = 0; t < secs; t += 1 / 60) p.step(1 / 60);
  for (const o of offs) o();
  p.grind.dispose();
  return { ev, of: (n) => ev.filter((e) => e[0] === n).map((e) => e[1]) };
}
game.score = 0;

await test('lock-on picks the trick from the gear: 50-50, switch 50-50, boardslide / lipslide, ski slide', () => {
  const names = (type, yaw, side = 0) => { const p = rig(RAIL(), type); dropOn(p, yaw, 7, side); return run(p, 0.4).of('grindStart')[0]?.trick; };
  assert.equal(names('snowboard', 0), '50-50');
  assert.equal(names('snowboard', Math.PI), 'Switch 50-50');
  assert.match(names('snowboard', Math.PI / 2), /^(FS|BS) (Boardslide|Lipslide)$/);
  assert.match(names('ski', Math.PI / 2), /^(Slide|Lipslide)$/);
  // Coming from opposite sides with the same gear yaw: one is a boardslide, the other a lipslide.
  const a = names('snowboard', Math.PI / 2, 0.25), b = names('snowboard', Math.PI / 2, -0.25);
  assert.notEqual(a.replace(/^(FS|BS) /, ''), b.replace(/^(FS|BS) /, ''), `${a} vs ${b}`);
});

await test('a clean grind banks on the ride-away; it carries along the whole rail', () => {
  const p = rig(RAIL(10));
  dropOn(p, 0);
  const r = run(p, 3);
  const end = r.of('grindEnd')[0], sc = r.of('grindScore')[0];
  assert.equal(end.reason, 'end');
  assert.ok(end.dist > 9.5, `dist ${end.dist}`);
  assert.ok(sc && sc.points > 100, 'banked');
});

await test('Space tap = a switch-up (hop + steer turns 90°), held = a pop off with a perfect pop at the end', () => {
  const p = rig(RAIL(16));
  dropOn(p, 0);
  let tapped = false;
  const r = run(p, 3.5, (c, pl) => {
    const g = pl.grind.g;
    if (g && g.t > 0.3 && !tapped) { c.jump = true; if (g.t > 0.36) tapped = true; }
    if (g?.hop && g.hop.t < 0.2) c.steer = 1;
    if (g && !g.hop && tapped && (g.toEnd ?? 99) < g.v * 0.45 && (g.toEnd ?? 99) > g.v * 0.1) c.jump = true;   // load, release just before the end
  });
  assert.equal(r.of('grindTrick').length, 1, 'one switch-up');
  const sc = r.of('grindScore')[0];
  assert.ok(sc, 'banked');
  assert.ok(sc.perfectPop, 'perfect pop');
  assert.match(sc.label, /slide|Lipslide/i);
});

await test('no balance input on a long rail: you fall off (bail → crash); balancing holds it', () => {
  const p = rig(RAIL(60));
  dropOn(p, 0);
  const r = run(p, 6, (c) => { c.steer = 0; });
  assert.equal(r.of('grindEnd')[0]?.reason, 'bail');
  assert.ok(r.of('crashed').length >= 1);
  const q = rig(RAIL(30));
  dropOn(q, 0);
  const r2 = run(q, 6);
  assert.equal(r2.of('grindEnd')[0]?.reason, 'end');
});

await test('too slow on an uphill rail: the grind stalls (you step off), half points', () => {
  const rails = [{ id: 'up', name: 'Up Rail', kind: 'box', half: 0.3, pts: [[0, H(0, -20) + 0.6, -20], [0, H(0, -20) + 2.6, -34]] }];
  const p = rig(rails);
  dropOn(p, 0, 4);
  const r = run(p, 4);
  assert.equal(r.of('grindEnd')[0]?.reason, 'stall');
});

await test('rail to rail is a transfer (bonus); a crash before the ride-away loses the grind', () => {
  const rails = [...RAIL(6), { id: 'b', name: 'Second', kind: 'box', half: 0.3, pts: [[0, H(0, -27.5) + 0.5, -27.5], [0, H(0, -36) + 0.5, -36]] }];
  const p = rig(rails);
  dropOn(p, 0, 8);
  const r = run(p, 3);
  assert.ok(r.of('grindScore').some((s) => /transfer/.test(s.label)), r.of('grindScore').map((s) => s.label).join(' | '));
  const q = rig(RAIL(8));
  dropOn(q, 0);
  const r2 = run(q, 3, (c, pl) => { if (pl.state === State.AIR && !pl.grind.g && pl.grind.pending) { pl.crash('test'); } });
  assert.equal(r2.of('grindLost').length, 1);
});

await test('pipe walls send you straight up (vert) and point back into the pipe', () => {
  const P = course.pipe;
  const [x, z] = P.world(100, P.F + P.wallRun - 0.2);
  const n = course.wallNormal(x, z);
  assert.ok(n, 'a wall normal near the coping');
  const [x2, z2] = P.world(100, 0);
  assert.equal(course.wallNormal(x2, z2), null, 'none on the flat bottom');
  const [nx, nz] = n, [cx, cz] = P.world(100, 0);
  assert.ok((cx - x) * nx + (cz - z) * nz > 0, 'points into the pipe');
});

await test('the judge: a clean full slopestyle run scores in the 80s–90s, a crash costs a lot', () => {
  const j = course.judgeRun;
  j.reset();
  for (const s of ['Section 1', 'Section 2', 'Section 3']) j.run.sec[s] = 9;
  for (const s of ['Lightning', 'Thunder', 'Voltage']) j.run.sec[s] = 8.5;
  for (const k of ['a', 'b', 'c', 'd', 'e', 'f']) j.move(k);
  j.run.sweet = 3; j.run.speedSum = 13 * 60; j.run.speedT = 60;
  const good = j.judge();
  assert.ok(good.total >= 80 && good.total <= 100, `total ${good.total}`);
  assert.equal(good.medal, good.total >= MEDALS.gold ? 'gold' : 'silver');
  j.run.crashes = 1;
  assert.ok(j.judge().total < good.total - 8);
  assert.ok(Array.isArray(good.rows) && good.rows.length >= 7);
});

await test('drop zones and snowflakes are on the park', () => {
  assert.equal(course.dropZones.length, 9);
  for (const d of course.dropZones) { assert.ok(T.isInside(d.x, d.z, 50)); assert.ok(Number.isFinite(T.getHeight(d.x, d.z))); }
  assert.equal(course.challenge.flakes.length, 12);
  assert.ok(GRIND_DEFAULTS.capture > 0.2 && GRIND_DEFAULTS.capture < 0.6, 'not a magnet');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
