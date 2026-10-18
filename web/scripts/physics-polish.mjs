// Regression bench for the riding-feel polish pass (docs/jumps-research.md §9). Headless, no WebGL.
//   1. Grabbed late spin: a spin started after the throw window while grabbing turns as fast as without the grab
//      (it held the 0.6 grab pose: 1.42 / 1.32 s to 180° vs 1.22 / 1.18 s).
//   2. Drift the other way (2b: a throw reversed late in its window, left at 1.3 rad/s the old way): a carve's pre-wind spinning one way, a grab held (no spot), then the stick the other
//      way after the throw window: turns round (it opened up and kept drifting the wrong way: never 180° on a board).
//   3. Spot finishes its checks: a full spin set let go of early lands on an alignment (board, released at 45° on a
//      2.4 s air: crashed sideways at 266°); a release sweep with a bounded number of crashes.
//   4. Gamepad in the air: a full diagonal stick throws the flip as hard as the keys (1.18–1.30 s to 180° vs 0.92 s);
//      half a push spins (nothing below ~45 % tilt before).
//   5. Landing reasons: crashes / stumbles carry why (over / under-rotated, sideways, hard).
//   6. Unchanged: keyboard spins and flips thrown at the lip.
// Usage: node web/scripts/physics-polish.mjs [--check]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
globalThis.matchMedia = undefined;
const pad = { mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [pad] }, configurable: true });
globalThis.document = globalThis.document || { body: { classList: { toggle: () => {} } } };
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { Input } = await import('../src/input.js');
const { game, Mode } = await import('../src/state.js');
const { run } = await import('./physics-sweep.mjs');
game.mode = Mode.RIDING;

const CHECK = process.argv.includes('--check');
const DEG = 180 / Math.PI, TAU = Math.PI * 2;
const fails = [];
const expect = (ok, msg) => { if (!ok) fails.push(msg); };
const f = (x) => (x === null || x === undefined ? 'never' : `${x.toFixed(2)} s`);
const TYPES = ['ski', 'snowboard'];
const base = { variant: undefined, map: 'default', vy: 12, vz: 11, dt: 1 / 60, axis: 'spin' };

console.log('1. late spin pressed 0.5 s in (vy 12, popped at the lip): time to 180°, without / with a grab');
for (const type of TYPES) {
  const a = run({ ...base, type, set: 'lip', held: 'none', tp: 0.5, grab: false });
  const b = run({ ...base, type, set: 'lip', held: 'none', tp: 0.5, grab: true });
  console.log(`   ${type.padEnd(9)} ${f(a.t180)} · grabbing ${f(b.t180)}   (before: grabbing ${type === 'ski' ? '1.42' : '1.32'} s)`);
  expect(b.t180 !== null && b.t180 <= a.t180 + 0.05, `1 ${type}: grabbed late spin ${f(b.t180)} vs ${f(a.t180)} without`);
}

console.log('2. pre-wind the other way, grab held, stick against it at 0.5 / 0.9 s (vy 12): time to 180°');
for (const type of TYPES) for (const set of ['lip', 'roll']) {
  const cells = [];
  for (const tp of [0.5, 0.9]) {
    const r = run({ ...base, type, set, held: 'prewind-', tp, grab: true });
    cells.push(`@${tp}: ${f(r.t180)}`);
    expect(r.t180 !== null && r.t180 <= 1.45, `2 ${type} ${set} @${tp}: ${f(r.t180)}`);
  }
  console.log(`   ${type.padEnd(9)} ${set.padEnd(4)} ${cells.join('   ')}   (before: ${type === 'ski' ? '1.52 s' : 'never'})`);
}

console.log('2b. popped carving the other way, stick reversed 0.25 s in (late in the throw window, vy 15): spin the asked way');
for (const type of TYPES) {
  const r = run({ ...base, type, vy: 15, set: 'lip', held: 'carve-', tp: 0.25, grab: false });
  console.log(`   ${type.padEnd(9)} 180° the asked way in ${f(r.t180)}   (before: never — it kept spinning the old way at ~45°/s for 2.4 s)`);
  expect(r.t180 !== null, `2b ${type}: a reversed throw never turned round`);
}

// ------------------------------------------------------------------ 3. spot
const flat = () => { const T = { half: 1e7, getHeight: () => 0, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) }; T.getNormal = (x, z, r, o = new THREE.Vector3()) => o.set(0, 1, 0); T.course = {}; return T; };
function release(type, variant, vy, wu, q, R) {
  const p = new Player(flat(), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type, variant); p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, vy, -11); p.position.y = 0.4; p.lastPopQ = q; p.dyn.windup = -wu; p.enterAir(true);
  let held = true, left = null;
  for (let i = 0; i < 600; i++) {
    p.script = (c) => { p.dyn._noInputT = -999; if (held && Math.abs(p._spinTotal) * DEG >= R) { held = false; left = p.dyn.timeToLand(); } c.steer = held ? -1 : 0; };
    p.step(1 / 60);
    if (p.state !== State.AIR && i > 2) break;
  }
  const crash = p.state === State.CRASH;
  return { left, result: crash ? 'crash' : p.lastLanding?.result, spin: Math.abs(p._spinTotal) * DEG, why: crash ? p.lastCrash.why : p.lastLanding?.why };
}
{
  const r = release('snowboard', 'allmountain', 12, 1, 1, 45);
  console.log(`3. board, full set let go at 45° on a 2.4 s air: ${r.result} at ${r.spin.toFixed(0)}°   (before: crash at 266°)`);
  expect(r.result === 'clean', `3 board released at 45°: ${r.result} at ${r.spin.toFixed(0)}°`);
  const tally = {};
  let n = 0;
  for (const type of TYPES) for (const variant of ['allmountain', 'park']) for (const vy of [6, 9, 12]) for (const wu of [0, 0.7, 1]) for (let R = 30; R <= 540; R += 30) {
    const s = release(type, variant, vy, wu, 1, R);
    if (s.left === null || s.left < 0.6) continue;
    n++; tally[s.result] = (tally[s.result] || 0) + 1;
  }
  console.log(`   release sweep (${n} airs let go with ≥ 0.6 s left): ${JSON.stringify(tally)}   (before: crash 6, slide 2, stumble 1)`);
  expect((tally.crash || 0) <= 3 && (tally.slide || 0) === 0, `3 release sweep: ${JSON.stringify(tally)}`);
}

// ------------------------------------------------------------------ 4. gamepad
const input = new Input(null);
function padFly(type, stick, tp = 0.05) {
  const p = new Player(flat(), null, null, input);
  p.setEquipment(type); p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, 12, -11); p.position.y = 0.4; p.lastPopQ = 1;
  pad.axes = [0, 0, 0, 0]; input.poll(); p.enterAir(true);
  let t0 = null, s180 = null, f180 = null;
  for (let i = 0; i < 600; i++) {
    pad.axes = p.airTime >= tp ? [stick[0], stick[1], 0, 0] : [0, 0, 0, 0];
    input.poll();
    p.script = (c) => { p.dyn._noInputT = -999; void c; };
    const air = p.airTime;
    p.step(1 / 60);
    if (p.state !== State.AIR && i > 2) break;
    if (air >= tp && t0 === null) t0 = air;
    if (t0 !== null && s180 === null && Math.abs(p._spinTotal) >= Math.PI) s180 = p.airTime - t0;
    if (t0 !== null && f180 === null && Math.abs(p.flip) >= Math.PI) f180 = p.airTime - t0;
  }
  return { s180, f180 };
}
pad.axes = [0, 0, 0, 0];
console.log('4. gamepad stick from the lip (vy 12): time to 180° of spin / flip');
for (const type of TYPES) {
  const key = run({ ...base, type, set: 'lip', held: 'none', tp: 0.05, grab: false, axis: 'back' });
  const diag = padFly(type, [-0.707, 0.707]), up = padFly(type, [0, -1]), half = padFly(type, [-0.5, 0]), forty = padFly(type, [-0.4, 0]);
  console.log(`   ${type.padEnd(9)} keys S: flip ${f(key.t180)} · stick down-left 45°: spin ${f(diag.s180)} flip ${f(diag.f180)} (before flip 1.18 s) · stick up: flip ${f(up.f180)} (before 0.97 s) · 50 % / 40 % left: spin ${f(half.s180)} / ${f(forty.s180)}`);
  expect(diag.f180 !== null && diag.f180 <= key.t180 * 1.05, `4 ${type}: diagonal stick flip ${f(diag.f180)} vs keys ${f(key.t180)}`);
  expect(up.f180 !== null && up.f180 <= key.t180 * 1.05, `4 ${type}: stick-up flip ${f(up.f180)} vs keys ${f(key.t180)}`);
  expect(forty.s180 !== null, `4 ${type}: a 40 % stick push doesn't spin`);
}

// ------------------------------------------------------------------ 5. landing reasons
{
  const over = release('ski', 'allmountain', 6, 0, 1, 105);   // a non-twin ski let go past 90° on a short air
  const okay = release('ski', 'allmountain', 9, 1, 1, 300);
  console.log(`5. landing reasons: "${over.why}" (${over.result}) · clean landing: ${okay.why ?? 'none'} (${okay.result})`);
  expect(!!over.why && /ROTATED|SIDEWAYS|HARD|TIPPED/.test(over.why), `5: no reason on a ${over.result}`);
  expect(okay.result !== 'clean' || okay.why === null, '5: a clean landing has a reason');
}

// ------------------------------------------------------------------ 6. unchanged
console.log('6. keyboard at the lip (vy 12): spin thrown / flip thrown, time to 180°');
const REF = { ski: [0.90, 0.92], snowboard: [0.83, 0.92] };
for (const type of TYPES) {
  const s = run({ ...base, type, set: 'lip', held: 'none', tp: 0.05, grab: false, axis: 'spin' });
  const fl = run({ ...base, type, set: 'lip', held: 'none', tp: 0.05, grab: false, axis: 'back' });
  console.log(`   ${type.padEnd(9)} spin ${f(s.t180)} · flip ${f(fl.t180)}   (before ${REF[type][0]} / ${REF[type][1]} s)`);
  expect(Math.abs(s.t180 - REF[type][0]) < 0.025 && Math.abs(fl.t180 - REF[type][1]) < 0.025, `6 ${type}: lip times changed (${f(s.t180)} / ${f(fl.t180)})`);
}

if (CHECK) {
  if (fails.length) { console.log(`\nFAIL (${fails.length}):\n  ${fails.join('\n  ')}`); process.exit(1); }
  console.log('\nOK');
}
process.exit(0);
