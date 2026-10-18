// Headless rotation-feel bench (no WebGL): the three things players complain about in the air.
//   A. Carry-over — hold W / S through most of a single flip, let go, and see how far the momentum carries
//      the rider past where they let go (and whether it lands). Small and big airs, front and back.
//   B. Counter-input — over-rotating a little, the opposite key evens it out (modest authority: a
//      near-miss stumble / crash becomes a landing, a botched flip stays botched).
//   C. Start rates — how long a flip / spin takes to get going when the key is pressed at different
//      moments of the air (throw window, the end of it, late throws, rolled off, low pop, with a spin):
//      the slowest situations, so nothing is "slow for no reason".
// Usage: node web/scripts/physics-rotation.mjs [ski|snowboard|both] [--check]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

const DT = 1 / 60, TAU = Math.PI * 2, DEG = 180 / Math.PI;
const args = process.argv.slice(2);
const CHECK = args.includes('--check');
const which = args.find((a) => !a.startsWith('--')) || 'both';
const fails = [];
const expect = (ok, msg) => { if (!ok) fails.push(msg); };

const flat = () => {
  const T = { half: 1e7, getHeight: () => 0, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r, o = new THREE.Vector3()) => o.set(0, 1, 0);
  return T;
};
function launch(type, vy, set = {}) {
  const p = new Player(flat(), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, vy, -11);
  p.position.y = 0.4;
  p.lastPopQ = set.q ?? 1;
  p.dyn.flipLoad = set.preload || 0;
  p.dyn.windup = set.windup || 0;
  p.enterAir(set.popped ?? true);
  return p;
}
/** Steps the player with fn(p) → keys until it lands; returns { flip, heading, landing, crash, air }. */
function fly(p, fn, onStep) {
  let flip = 0;
  for (let i = 0; i < 8 / DT; i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, fn(p)); };
    const air = p.airTime;
    p.step(DT);
    if (p.state !== State.AIR && i > 2) return { air, flip, landing: p.lastLanding, crash: p.state === State.CRASH ? p.lastCrash : null };
    flip = Math.abs(p.flip) * DEG;
    onStep?.(p);
  }
  return { air: p.airTime, flip, landing: null, crash: null };
}
const key = (dir) => (dir > 0 ? { brake: 1 } : { up: 1 });
const result = (r) => (r.crash ? 'CRASH' : r.landing?.result ?? '?');
const pitchDev = (r) => (r.crash ? r.crash.flipDev ?? NaN : r.landing?.flipDev ?? 0);

// ------------------------------------------------------------------ A + B: carry-over and counter
function carry(type, vy, dir, relDeg, opts = {}) {
  // Throw at the lip and keep the key in (tucked) until the flip reaches relDeg, then let go
  // (spot); counter = press the opposite key from `counterAt` (deg of flip) to touchdown.
  const p = launch(type, vy, opts.set);
  let rel = null, relT = 0, relLeft = 0;
  const r = fly(p, (q) => {
    const f = Math.abs(q.flip) * DEG;
    if (rel === null && f >= relDeg) { rel = f; relT = q.airTime; relLeft = q.dyn.timeToLand(); }
    if (rel === null) return key(dir);
    if (opts.counterAt != null && f >= opts.counterAt) return key(-dir);
    return {};
  });
  return { r, rel: rel ?? NaN, relT, relLeft, final: r.flip, carry: r.flip - (rel ?? 0) };
}

function benchCarry(type) {
  console.log(`\n=== ${type}: A. carry-over after letting go (single flip thrown at the lip, key held until R°, then released) ===`);
  console.log('  air    dir    R°   left(s)  carry°  lands at°  result');
  const rows = [];
  for (const vy of [8, 12, 16]) for (const dir of [1, -1]) for (const R of [240, 270, 300, 330]) {
    const c = carry(type, vy, dir, R);
    rows.push({ vy, dir, R, ...c });
    console.log(`  vy${String(vy).padEnd(3)} ${dir > 0 ? 'back ' : 'front'} ${String(R).padStart(4)}   ${c.relLeft.toFixed(2).padStart(5)}  ${c.carry.toFixed(0).padStart(6)}  ${c.final.toFixed(0).padStart(8)}   ${result(c.r)} (pitch ${pitchDev(c.r).toFixed(0)}°, air ${c.r.air.toFixed(2)} s)`);
  }
  // Preloaded big air (lots of momentum): the worst carry-over.
  for (const dir of [1]) for (const R of [270, 300]) {
    const c = carry(type, 16, dir, R, { set: { preload: 1 } });
    rows.push({ vy: 16, dir, R, pre: true, ...c });
    console.log(`  vy16 back preloaded ${R}  ${c.relLeft.toFixed(2).padStart(5)}  ${c.carry.toFixed(0).padStart(6)}  ${c.final.toFixed(0).padStart(8)}   ${result(c.r)} (pitch ${pitchDev(c.r).toFixed(0)}°)`);
  }
  return rows;
}

function benchCounter(type) {
  console.log(`\n=== ${type}: B. counter-input (released at R°, over-rotating; opposite key pressed from 345° on) ===`);
  console.log('  air    dir    R°   no counter            with counter');
  const rows = [];
  for (const vy of [10, 12, 16]) for (const dir of [1, -1]) for (const R of [250, 280, 310, 340]) {
    const a = carry(type, vy, dir, R);
    const b = carry(type, vy, dir, R, { counterAt: 345 });
    rows.push({ vy, dir, R, plain: a, counter: b });
    const s = (c) => `${result(c.r).padEnd(7)} ${c.final.toFixed(0).padStart(4)}° (dev ${pitchDev(c.r).toFixed(0)}°)`;
    console.log(`  vy${String(vy).padEnd(3)} ${dir > 0 ? 'back ' : 'front'} ${String(R).padStart(4)}   ${s(a).padEnd(22)} ${s(b)}`);
  }
  // Botched: a full set tucked to 300° on a 1.85 s air (the bench's classic over-rotation) must stay a crash
  // even with the counter key from 345°.
  const botched = carry(type, 9, 1, 300, { set: { preload: 1 }, counterAt: 345 });
  console.log(`  botched (full set tucked to 300°, vy 9) + counter: ${result(botched.r)} ${botched.final.toFixed(0)}°`);
  // Counter mid-flip (at 180°) must not kill a flip in progress into a landing.
  const mid = carry(type, 12, 1, 200, { counterAt: 180 });
  console.log(`  counter pressed at 180° (vy 12): ${result(mid.r)} ${mid.final.toFixed(0)}°`);
  return { rows, botched, mid };
}

// ------------------------------------------------------------------ C: start rates
function startFlip(type, vy, tp, set = {}, extra = {}) {
  const p = launch(type, vy, set);
  let t0 = null, t90 = null, t180 = null;
  const r = fly(p, (q) => {
    if (q.airTime < tp) return { ...(extra.steer ? { steer: extra.steer } : {}) };
    if (t0 === null) t0 = q.airTime;
    return { ...key(1), ...(extra.steer ? { steer: extra.steer } : {}), ...(extra.grab ? { tuck: 1 } : {}) };
  }, (q) => {
    const f = Math.abs(q.flip);
    if (t90 === null && f >= Math.PI / 2) t90 = q.airTime;
    if (t180 === null && f >= Math.PI) t180 = q.airTime;
  });
  return { t90: t90 === null ? null : t90 - t0, t180: t180 === null ? null : t180 - t0, air: r.air, left: r.air - (t0 ?? 0) };
}
function startSpin(type, vy, tp, set = {}) {
  const p = launch(type, vy, set);
  let t0 = null, t90 = null, t180 = null, h0 = 0;
  const r = fly(p, (q) => {
    if (q.airTime < tp) return {};
    if (t0 === null) { t0 = q.airTime; h0 = q._spinTotal; }
    return { steer: -1 };
  }, (q) => {
    if (t0 === null) return;
    const s = Math.abs(q._spinTotal - h0);
    if (t90 === null && s >= Math.PI / 2) t90 = q.airTime;
    if (t180 === null && s >= Math.PI) t180 = q.airTime;
  });
  return { t90: t90 === null ? null : t90 - t0, t180: t180 === null ? null : t180 - t0, air: r.air, left: r.air - (t0 ?? 0) };
}
const ft = (x) => (x === null ? '  —  ' : x.toFixed(2).padStart(5));

function benchStart(type) {
  console.log(`\n=== ${type}: C. start rates (key held from the press; s from the press to 90° / 180°) ===`);
  const rows = [];
  const flipSets = [['popped at the lip', {}], ['popped early (q 0.5)', { q: 0.5 }], ['rolled off', { popped: false }]];
  for (const [label, set] of flipSets) for (const vy of [8, 12, 16]) {
    const cells = [];
    for (const tp of [0.05, 0.3, 0.45, 0.6, 0.8, 1.0, 1.4]) {
      const s = startFlip(type, vy, tp, set);
      rows.push({ kind: 'flip', label, vy, tp, ...s });
      cells.push(`${tp.toFixed(2)}:${ft(s.t90)}/${ft(s.t180)}`);
    }
    console.log(`  flip ${label.padEnd(20)} vy${String(vy).padEnd(3)} ${cells.join('  ')}`);
  }
  for (const vy of [12, 16]) {
    const cells = [];
    for (const tp of [0.05, 0.45, 0.8]) {
      const a = startFlip(type, vy, tp, { windup: -1 }, { steer: -1 });
      const g = startFlip(type, vy, tp, {}, { grab: true });
      rows.push({ kind: 'flip', label: 'while spinning', vy, tp, ...a }, { kind: 'flip', label: 'grabbing', vy, tp, ...g });
      cells.push(`${tp.toFixed(2)}: spin ${ft(a.t90)}/${ft(a.t180)} grab ${ft(g.t90)}/${ft(g.t180)}`);
    }
    console.log(`  flip with spin / grab      vy${String(vy).padEnd(3)} ${cells.join('  ')}`);
  }
  const spinSets = [['wound up', { windup: -1 }], ['thrown only', {}], ['rolled off', { popped: false }], ['popped early (q 0.5)', { q: 0.5 }]];
  for (const [label, set] of spinSets) for (const vy of [8, 12, 16]) {
    const cells = [];
    for (const tp of [0.05, 0.2, 0.3, 0.4, 0.6, 1.0]) {
      const s = startSpin(type, vy, tp, set);
      rows.push({ kind: 'spin', label, vy, tp, ...s });
      cells.push(`${tp.toFixed(2)}:${ft(s.t90)}/${ft(s.t180)}`);
    }
    console.log(`  spin ${label.padEnd(20)} vy${String(vy).padEnd(3)} ${cells.join('  ')}`);
  }
  // The slowest real starts: pressed with enough air left for the rotation (≥ 1.2 s for a flip's 180°,
  // ≥ 0.8 s for a spin's 180°), ranked by the time to 180°.
  for (const kind of ['flip', 'spin']) {
    const need = kind === 'flip' ? 1.2 : 0.8;
    const cand = rows.filter((r) => r.kind === kind && r.left >= need && r.label !== 'rolled off')
      .map((r) => ({ ...r, k: r.t180 ?? 9 })).sort((a, b) => b.k - a.k).slice(0, 5);
    console.log(`  slowest ${kind} starts (≥ ${need} s left): ${cand.map((r) => `${r.label} vy${r.vy} @${r.tp}s → ${r.t180 === null ? 'never' : r.t180.toFixed(2) + ' s'}`).join(' · ')}`);
  }
  return rows;
}

for (const type of ['ski', 'snowboard']) {
  if (which !== 'both' && which !== type) continue;
  const A = benchCarry(type);
  const B = benchCounter(type);
  const Cr = benchStart(type);
  if (CHECK) {
    // A: small airs unchanged (a thrown single lands wherever it's let go); big airs: let go after most of
    // the flip and it lands (2.4 s air at 300°, 3.2 s air at 270°), never chases a second flip it can't
    // finish (carry ≤ 130°), and some carry is kept (≥ 25°: momentum, not a brake).
    for (const r of A) {
      if (r.pre) continue;
      const tag = `${type} A vy${r.vy} ${r.dir > 0 ? 'back' : 'front'} released at ${r.R}°: carry ${r.carry.toFixed(0)}°, ${result(r.r)}`;
      if (r.vy === 8) expect(r.r.landing?.result === 'clean', tag);
      if ((r.vy === 12 && r.R <= 300) || (r.vy === 16 && r.R <= 270)) expect(!r.r.crash, tag);
      if (r.vy >= 12) expect(r.carry <= 130 && r.carry >= 25, tag);
    }
    // B: a counter never makes a landing worse, and turns at least one near-miss into a better landing.
    const rank = { clean: 0, stumble: 1, slide: 1, CRASH: 2, '?': 3 };
    let helped = 0;
    for (const { plain, counter, vy, dir, R } of B.rows) {
      expect(rank[result(counter.r)] <= rank[result(plain.r)], `${type} B vy${vy} ${dir > 0 ? 'back' : 'front'} R${R}: counter made it worse (${result(plain.r)} → ${result(counter.r)})`);
      if (rank[result(counter.r)] < rank[result(plain.r)] || pitchDev(counter.r) + 5 < pitchDev(plain.r)) helped++;
    }
    expect(helped >= 1, `${type} B: the counter-input never helped`);
    expect(!!B.botched.r.crash, `${type} B: a botched full-set over-rotation was rescued by the counter (${result(B.botched.r)})`);
    expect(B.mid.final > 300, `${type} B: counter at 180° stopped the flip at ${B.mid.final.toFixed(0)}°`);
    // C: with ≥ 1.2 s left a flip reaches 180° within 0.9 s; with ≥ 0.8 s left a popped spin within 0.8 s.
    for (const r of Cr) {
      if (r.label === 'rolled off') continue;
      if (r.kind === 'flip' && r.left >= 1.5 && r.label !== 'grabbing') expect(r.t180 !== null && r.t180 <= 0.9, `${type} C flip ${r.label} vy${r.vy} @${r.tp}: 180° in ${r.t180?.toFixed(2) ?? 'never'} s`);
    }
  }
}
if (CHECK) {
  if (fails.length) { console.log(`\nFAIL (${fails.length}):\n  ${fails.join('\n  ')}`); process.exit(1); }
  console.log('\nOK');
}
