// Unit checks for map 3's engine pieces (headless, fast):
//   • applyMapTuning: overrides merge in place (same nested objects), reset restores every default,
//     map-only keys disappear, arrays replace, a map without physics gets the defaults
//   • Structure: roof surface / wall test / drift (building geometry contract)
//   • Flow: chain multiplier, variety rule, banking, crash loss, flow state
// Usage: node web/scripts/map3-unit.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const { PHYSICS, CAMERA, applyMapTuning } = await import('../src/config.js');
const { Structure } = await import('../src/maps/ravenspire/structures.js');
const { Flow, moveKey } = await import('../src/physics/flow.js');
const { emit, game } = await import('../src/state.js');

let fails = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

// ------------------------------------------------------------------ applyMapTuning
{
  const ski = PHYSICS.ski, board = PHYSICS.snowboard;
  const d = { maxVel: ski.maxVelocity, engage: ski.engage.slice(), crash: PHYSICS.crashImpact, fov: CAMERA.maxFovBonus };
  applyMapTuning({ physics: { common: { crashImpact: 99, newKnob: 7, flow: { enabled: true } }, ski: { maxVelocity: 30, engage: [1, 2] }, snowboard: { popMax: 9 } }, camera: { maxFovBonus: 20 } });
  ok('overrides apply', PHYSICS.crashImpact === 99 && ski.maxVelocity === 30 && board.popMax === 9 && CAMERA.maxFovBonus === 20);
  ok('nested objects stay the same instances', PHYSICS.ski === ski && PHYSICS.snowboard === board);
  ok('arrays replace', ski.engage[0] === 1 && ski.engage.length === 2);
  ok('map-only keys allowed', PHYSICS.newKnob === 7 && PHYSICS.flow?.enabled === true);
  applyMapTuning({});
  ok('reset restores defaults', PHYSICS.crashImpact === d.crash && ski.maxVelocity === d.maxVel && CAMERA.maxFovBonus === d.fov && ski.engage.join() === d.engage.join());
  ok('reset removes map-only keys and restores null defaults', !('newKnob' in PHYSICS) && PHYSICS.flow === null);
  applyMapTuning({ physics: { ski: { latG: 3 } } });
  applyMapTuning({ physics: { snowboard: { latGToe: 3 } } });
  ok('a second map starts clean', ski.latG !== 3 && board.latGToe === 3);
  applyMapTuning(null);
  ok('no course → defaults', board.latGToe !== 3);
}

// ------------------------------------------------------------------ Structure
{
  const ground = (x) => 100 - 0.6 * x;   // a 31° slope falling toward +x
  const mono = new Structure({ id: 't', L: 20, W: 10, roof: 'mono', pitch: 30, eave: 5, drift: 1 }, 0, 0, [1, 0], (x) => ground(x));
  const s0 = mono.surface(0, 0);
  ok('mono roof surface above the ground', s0 !== null && s0 > ground(0) + 2, `${s0?.toFixed(2)} vs ${ground(0)}`);
  ok('surface null outside the roof', mono.surface(30, 0) === null && mono.surface(0, 20) === null);
  ok('roof falls downhill', mono.surface(-8, 0) > mono.surface(8, 0));
  const eave = mono.roofY(mono.hl, 0) - mono.gDn;
  ok('downhill eave height ≥ requested', eave >= 5 - 1e-6, `${eave.toFixed(2)} m`);
  // Walls: from the side at ground level → blocked; from above → not.
  const y = ground(0) + 1;
  const b = mono.block(0, y, mono.rw - 0.2, 0, y, mono.rw + 3);
  ok('side approach below the roof is a wall', !!b && b.kind === 'wall' && b.nz > 0.9, JSON.stringify(b));
  const top = mono.surface(0, 0);
  ok('landing from above is not a wall', mono.block(0, top - 0.2, 0, 0, top + 2, 0) === null);
  ok('riding on the roof is not a wall', mono.block(1, mono.surface(1, 0) + 0.02, 0, 0, top + 0.02, 0) === null);
  // Drift: a ramp outside the uphill wall, meeting the roof edge.
  const up = -mono.hl - 3;
  const dr = mono.driftAt(up, 0, ground(up));
  ok('drift ramps up to the high edge', dr > 0 && ground(up) + dr <= mono.surface(-mono.rl + 0.01, 0) + 2, `${dr.toFixed(2)} m`);
  ok('no drift far away', mono.driftAt(-60, 0, ground(-60)) === 0 && mono.driftAt(20, 0, ground(20)) === 0);
  const gable = new Structure({ id: 'g', L: 14, W: 10, roof: 'gable', pitch: 33, eave: 4.5, drift: 0.85, chimney: [0.2, 0.6] }, 0, 0, [1, 0], (x) => ground(x));
  ok('gable ridge is the highest line', gable.surface(0, 0) > gable.surface(-5, 0) && gable.surface(0, 0) > gable.surface(5, 0));
  const c = gable.chim, [cx, cz] = gable.world(c.a, c.b);
  ok('chimney blocks a rider on the roof', !!gable.block(cx, gable.roofY(c.a, c.b) + 0.5, cz, cx, gable.roofY(c.a, c.b) + 0.5, cz - 3));
}

// ------------------------------------------------------------------ Flow
{
  PHYSICS.flow = { enabled: true };
  const pl = { state: 1, speed: 10, flowBoost: 0, input: null };
  const f = new Flow(pl);
  f.reset(true);
  const add = (label, points) => { game.score += points; emit('score', { label, points }); };
  add('FS 360', 200); add('12 m drop', 150); add('Perfect FS 360', 250);
  const s = f.chainState();
  ok('chain counts moves, repeats half', near(s.n, 2.5) && s.pts === 600, JSON.stringify(s));
  ok('multiplier ×0.25 per move', near(s.mult, 1.375));
  ok('distance markers are not moves', (add('500 m', 25), f.chainState().n) === 2.5);
  let banked = null;
  const off = (await import('../src/state.js')).on('flowBanked', (e) => { banked = e; });
  for (let i = 0; i < 60 * 4; i++) f.update(1 / 60);
  ok('chain banks after the window on the snow', banked && banked.bonus === Math.round(600 * 0.375), JSON.stringify(banked));
  add('FS 540', 300);
  emit('crashed', 'landing');
  ok('crash loses the chain', f.chainState() === null);
  f.meter = 0.95; f.onLanded({ clean: true, trick: 'FS 720', air: 2, points: 600, drop: 20, perfect: true });
  ok('a big landed trick fills the meter into SEND IT', f.inState && f.scoreMul() === 2);
  for (let i = 0; i < 60; i++) f.update(1 / 60);
  ok('flow boost eases in', pl.flowBoost > 0.9 - 0.95 && pl.flowBoost > 0.5, pl.flowBoost.toFixed(2));
  ok('moveKey groups variants', moveKey('Perfect Left 720 Mute') === moveKey('Left 720 Mute') && moveKey('23 m drop') === moveKey('12 m drop'));
  off(); f.dispose();
  PHYSICS.flow = null;
}

// ------------------------------------------------------------------ snowflakes placed by hand
{
  const { RavenspireCourse } = await import('../src/maps/ravenspire/course.js');
  const c = new RavenspireCourse();
  const spots = c.flakeSpots();
  ok('12 flake spots, all finite', spots.length === 12 && spots.every((f) => [f.x, f.y, f.z].every(Number.isFinite)), spots.length);
  const above = spots.map((f) => f.y - Math.max(c.height(f.x, f.z), c.heightAt(f.x, f.z) ?? -1e9));
  ok('flakes float above the snow (0.3–45 m: lip flakes hang over the drop)', above.every((h) => h > 0.3 && h < 45), above.map((h) => h.toFixed(1)).join(' '));
}

console.log(fails ? `\n${fails} of ${n} FAILED` : `\nall ${n} passed`);
process.exit(fails ? 1 : 0);
