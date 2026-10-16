// Headless trick bench: flips, corks and their landings for both equipment types (no WebGL).
// Each case launches the real Player off flat ground with a given take-off velocity and a given SET —
// popped or rolled, the pop's timing (1 = released right at the lip), a flip preload (S while loading)
// and a spin wind-up (steer while loading) — then drives the stick like a player (hold until the
// rotation is nearly there, then let go and let the rider spot the landing) and prints the landing.
// Rotation follows angular momentum (physics/edge.js, docs/jumps-research.md): what the take-off sets
// plus a short throw, then tuck / open. Expected: thrown singles land, a double needs a preloaded pop at
// the lip and ~2.3 s of air, a triple a perfect set and ~3 s, a quad doesn't come round.
// Then a table: the most flips a perfect set + full tuck reaches for a given air time.
// Usage: node web/scripts/physics-tricks.mjs [ski|snowboard|both]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;
const scores = [];
on('score', (s) => scores.push(`${s.label} +${s.points ?? s.value ?? ''}`));

const DT = 1 / 60, TAU = Math.PI * 2;
const flat = () => {
  const T = { half: 1e7, getHeight: () => 0, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r, o = new THREE.Vector3()) => o.set(0, 1, 0);
  return T;
};
/** set = { popped (default true), q (pop timing 0..1, default 1), preload (0..1), windup (−1..1) } */
function launch(type, vy, set = {}, held = {}) {
  const p = new Player(flat(), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, vy, -11);
  p.position.y = 0.4;
  Object.assign(p._ctrl, held);
  p.lastPopQ = set.q ?? 1;
  p.dyn.flipLoad = set.preload || 0;
  p.dyn.windup = set.windup || 0;
  p.enterAir(set.popped ?? true);
  return p;
}
function run(p, fn, seconds = 6) {
  let maxFlip = 0;
  for (let i = 0; i < seconds / DT; i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, fn(p)); };
    p.step(DT);
    maxFlip = Math.max(maxFlip, Math.abs(p.flipRate));
    if (p.state !== State.AIR && i > 2) break;
  }
  return maxFlip;
}
/**
 * A skilled player: hold the flip key (throw, then tuck) until the open-body rotation left would carry
 * the flip round to `turns` by touchdown, then let go and spot the landing. `late` = hold it until the
 * flip is nearly there instead (the classic over-rotation).
 */
const flipTo = (dir, turns, extra = {}, late = false) => (p) => {
  // (opening out of a tuck takes ~0.2 s at the tucked rate)
  const ahead = late ? Math.abs(p.flipRate) * 0.25 : Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH || 0) * Math.max(0, p.dyn.timeToLand() - 0.2);
  const hold = p.airTime < 0.12 || Math.abs(p.flip) + ahead < turns * TAU;
  return { ...(hold ? (dir > 0 ? { brake: 1 } : { up: 1 }) : {}), ...(typeof extra === 'function' ? extra(p) : extra) };
};
/** Same for spins: steer until the open-arms rotation left covers the rest. */
const spinTo = (deg) => (p) => (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH || 0) * p.dyn.C.spinOpen * Math.max(0, p.dyn.timeToLand() - 0.15) < deg * Math.PI / 180 ? { steer: -1 } : {});
const both = (...f) => (p) => Object.assign({}, ...f.map((g) => g(p)));
const PRE = { preload: 1 }, WIND = { windup: -1 }, FULL = { preload: 1, windup: -1 };

function bench(type) {
  console.log(`\n=== ${type} tricks ===`);
  const cases = [
    ['backflip, thrown in the air (vy 8)', 8, {}, flipTo(1, 1)],
    ['frontflip, thrown in the air (vy 8)', 8, {}, flipTo(-1, 1)],
    ['backflip, rolled off (no pop, vy 8)', 8, { popped: false }, flipTo(1, 1)],
    ['backflip, preloaded, let go at 90° (vy 8)', 8, PRE, flipTo(1, 0.25)],
    ['backflip, full set, tucked until 300° (vy 9)', 9, PRE, flipTo(1, 1, {}, true)],
    ['backflip + 360, wound up (vy 9)', 9, FULL, both(flipTo(1, 1), spinTo(360))],
    ['cork 720, preload + wind-up (vy 11)', 11, FULL, both(flipTo(1, 1), spinTo(720))],
    ['double backflip, preloaded at the lip (vy 12)', 12, PRE, flipTo(1, 2)],
    ['double backflip, popped early (q 0.55, vy 12)', 12, { preload: 1, q: 0.55 }, flipTo(1, 2)],
    ['double backflip, thrown only (vy 12)', 12, {}, flipTo(1, 2)],
    ['double cork 1080, perfect set (vy 13)', 13, FULL, both(flipTo(1, 2), spinTo(1080))],
    ['triple backflip, perfect set (vy 13)', 13, PRE, flipTo(1, 3)],
    ['triple backflip, perfect set (vy 16)', 16, PRE, flipTo(1, 3)],
    ['quad backflip, perfect set (vy 20)', 20, PRE, flipTo(1, 4)],
    ['W held through take-off (vy 7)', 7, {}, () => ({ up: 1 }), { up: 1 }],
    ['S held through take-off (vy 7)', 7, {}, () => ({ brake: 1 }), { brake: 1 }],
    ['frontflip + grab, let go before landing (vy 9)', 9, {}, flipTo(-1, 1, (p) => (p.airTime > 0.5 && p.dyn.timeToLand() > 0.35 ? { tuck: 1 } : {}))],
    ['frontflip + grab held (the rider lets go by itself, vy 9)', 9, {}, flipTo(-1, 1, (p) => (p.airTime > 0.5 ? { tuck: 1 } : {}))],
    ['360, wound up (vy 7)', 7, WIND, spinTo(360)],
    ['720, wound up (vy 9)', 9, WIND, spinTo(720)],
    ['1080, wound up (vy 11)', 11, WIND, spinTo(1080)],
    ['720, thrown in the air only (vy 9)', 9, {}, spinTo(720)],
    ['backflip, too little air (vy 4)', 4, {}, () => ({ brake: 1 })],
  ];
  for (const [label, vy, set, fn, held] of cases) {
    scores.length = 0;
    const p = launch(type, vy, set, held);
    const maxRate = run(p, fn);
    const L = p.lastLanding;
    const res = p.state === State.CRASH ? `CRASH (${p.lastCrash?.reason}, ${(Math.abs(p.lastCrash?.flips ?? 0))} flips)` : L ? `${L.result}${L.switch ? ' (switch)' : ''} yaw ${L.dev.toFixed(0)}° pitch ${(L.flipDev ?? 0).toFixed(0)}°` : '?';
    console.log(`  ${label.padEnd(48)} flip-rate ≤ ${maxRate.toFixed(1)} rad/s  air ${(L?.air ?? p.lastCrash?.air ?? p.airTime).toFixed(2)} s  → ${res.padEnd(34)} "${L?.trick ?? ''}" ${scores.join(', ')}`);
  }
  // The ceiling: a perfect set (preload, popped right at the lip) and the key held to touchdown.
  const row = [];
  for (const vy of [5, 7, 9, 11, 13, 15, 17, 19]) {
    const p = launch(type, vy, PRE);
    let mx = 0, air = 0;
    for (let i = 0; i < 8 / DT; i++) {
      p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 1, up: 0, jump: false, tuck: 0 }); };
      p.step(DT);
      mx = Math.max(mx, Math.abs(p.flip));
      if (p.state === State.AIR) air = p.airTime; else if (i > 2) break;
    }
    row.push(`${air.toFixed(1)} s → ${(mx / TAU).toFixed(2)}`);
  }
  console.log(`  most flips for the air time (perfect set, tucked to touchdown): ${row.join(' · ')}`);
}
const which = process.argv[2] || 'both';
if (which !== 'snowboard') bench('ski');
if (which !== 'ski') bench('snowboard');
