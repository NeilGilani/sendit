// Scenario table for camshots.mjs (chase camera). Each `setup` is page code run with
// { s (window.__sendit), pl (player), snap(tag) } in scope: it places the rider, installs a pl.script
// (headless controls, 60 Hz) and calls snap() at the frames worth looking at; window.__done = true ends it.
// `query` picks the map (default Valcrest), `equip` limits it to one gear type.

// A take-off: run in along (fx, fz) from `back` metres before (ox, oz), the lip `L` metres past it. The run-in
// speed is held at `v` (so every take-off is the same), pop at the lip (pop: false = roll off, a cliff), throw
// the trick. flip: +n back flips / −n front flips; spin: half-turns (+ = right).
// Snapshots: before the lip, take-off, 0.3 s, apex, 1.0 / 0.6 / 0.3 / 0.12 s before the predicted touchdown,
// touchdown, 0.3 and 0.8 s after.
const jump = (where, { v = 13, flip = 0, spin = 0, grab = false, pop = true, back = 25, hold = true } = {}) => `
  ${where}
  pl.place({ x: ox - fx * ${back}, z: oz - fz * ${back} }, Math.atan2(-fx, -fz));
  pl.velocity.copy(pl.forward()).multiplyScalar(${v});
  const FLIP = ${flip}, SPIN = ${spin}, GRAB = ${grab}, POP = ${pop}, TAU = Math.PI * 2;
  let land = -1, wasAir = false, tg = 0, pre = false, apex = false, crashT = -1, lastAir = 0;
  let tls = [1.0, 0.6, 0.3, 0.12], ats = [0.3];
  window.__phase = 'in';
  pl.script = (c, p) => {
    if (window.__done) return;
    tg += 1 / 60;
    if (p.state === 3) {
      if (crashT < 0) { crashT = tg; snap('crash'); window.__phase = 'crash'; }
      else if (tg - crashT > 1.0 && tg - crashT < 1.02) snap('crash1');
      else if (tg - crashT > 1.8) window.__done = true;
    } else if (p.state === 1 && !wasAir) {
      const dx = p.position.x - ox, dz = p.position.z - oz, a = dx * fx + dz * fz;
      const aNext = a + (p.velocity.x * fx + p.velocity.z * fz) * (1 / 60) * 1.5;
      if (${hold} && a < L - 1.5) { const sp = Math.hypot(p.velocity.x, p.velocity.z); if (sp > 1) { p.velocity.x *= ${v} / sp; p.velocity.z *= ${v} / sp; } }
      if (POP) c.jump = a > -10 && aNext < L;
      if (!pre && a > L - 5) { pre = true; snap('pre'); }
      if (FLIP > 0 && POP) c.brake = a > -6 && aNext < L ? 1 : 0;
      if (FLIP < 0 && POP) c.up = a > -6 && aNext < L ? 1 : 0;
      if (SPIN && POP) c.steer = a > L - 3 && aNext < L ? Math.sign(SPIN) : 0;
    } else if (p.state === 2) {
      if (!wasAir) { snap('lip'); window.__phase = 'air'; }
      wasAir = true; lastAir = p.airTime;
      const tl = p.dyn.timeToLand();
      const fl = Math.abs(FLIP) * TAU, sp = Math.abs(SPIN) * Math.PI;
      const go = POP || p.airTime > 0.1;
      if (FLIP && go && (p.airTime < 0.12 + (POP ? 0 : 0.2) || Math.abs(p.flip) + Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH) * Math.max(0, tl - 0.2) < fl)) { if (FLIP > 0) c.brake = 1; else c.up = 1; }
      if (SPIN && go && (p.airTime < 0.12 + (POP ? 0 : 0.2) || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH) * 0.6 * Math.max(0, tl - 0.15) < sp)) c.steer = Math.sign(SPIN);
      if (GRAB && p.airTime > 0.15) c.tuck = 1;
      if (ats.length && p.airTime >= ats[0]) { ats.shift(); snap('a' + p.airTime.toFixed(1)); }
      if (!apex && p.velocity.y <= 0 && p.airTime > 0.2) { apex = true; if (tl > 0.75) snap('apex'); }
      if (p.airTime > 0.25) while (tls.length && tl <= tls[0]) { const x = tls.shift(); if (tl > x - 0.08) { snap('tl' + x); break; } }
    } else if (wasAir && lastAir < 0.35 && land < 0) {
      wasAir = false; apex = false; tls = [1.0, 0.6, 0.3, 0.12]; ats = [0.3];   // a hop on the way in (a roll-over): not the jump yet
    } else if (wasAir) {
      if (land < 0) { land = tg; snap('touch'); window.__phase = 'land'; }
      else if (tg - land > 0.3 && tg - land < 0.32) snap('l30');
      else if (tg - land > 0.8) { snap('l80'); window.__done = true; }
    }
    if (tg > 14) window.__done = true;
  };`;

// Valcrest kicker 2 (the L, 12 m long, 3.6 m tall).
const VAL = `const k = s.features.kickers[2], ox = k.o.x, oz = k.o.y, fx = k.f.x, fz = k.f.y, L = k.L;`;
// Voltage Park: the 'Voltage' big-air kicker on the slope lane (sweet spot 20.5 m/s, ~2.5 s of air).
const VOLT = `const f = s.course.features.find((f) => f.name === 'Voltage'), la = f.jump.lipA;
  const [x0, z0] = f.world(la - 12), [x1, z1] = f.world(la), ll = Math.hypot(x1 - x0, z1 - z0);
  const ox = x0, oz = z0, fx = (x1 - x0) / ll, fz = (z1 - z0) / ll, L = ll;`;
// Ravenspire: the First Stack (u 990, v 40), an 11–19 m cliff, rolled off at speed.
const RAVEN = `const ox = -1260 + 960, oz = 40, fx = 1, fz = 0, L = 30;`;

// Timer-driven ground run: `ctl(c, p, t)` sets the controls, `at` = [[t, tag], …] snapshot times (s).
const timed = (ctl, at, place, speed = 0) => `
  const at = ${JSON.stringify(at)};
  ${place}
  pl.velocity.copy(pl.forward()).multiplyScalar(${speed}); pl.speed = ${speed};
  let t = 0;
  window.__phase = 'ground';
  pl.script = (c, p) => {
    t += 1 / 60;
    ${ctl}
    if (at.length && t >= at[0][0]) snap(at.shift()[1]);
    if (!at.length) window.__done = true;
  };`;
// A groomed stretch: 70 m before Valcrest kicker 1, aimed down its run-in.
const RUN = `const k1 = s.features.kickers[1]; pl.place({ x: k1.o.x - k1.f.x * 70, z: k1.o.y - k1.f.y * 70 }, Math.atan2(-k1.f.x, -k1.f.y));`;

const V = 'map=valcrest-gully&kicker=2', P = 'map=voltage-park', R = 'map=ravenspire';
export const SCENARIOS = {
  backflip: { query: V, setup: jump(VAL, { flip: 1 }) },
  frontflip: { query: V, setup: jump(VAL, { flip: -1 }) },
  spin360: { query: V, setup: jump(VAL, { spin: 2 }) },
  spin720: { query: V, setup: jump(VAL, { v: 15, spin: 4 }) },
  cork720: { query: V, setup: jump(VAL, { v: 15, flip: 1, spin: 4 }) },
  rodeo540: { query: V, setup: jump(VAL, { v: 14, flip: 1, spin: 3 }) },
  misty: { query: V, setup: jump(VAL, { v: 14, flip: -1, spin: 3 }) },
  flatspin: { query: V, setup: jump(VAL, { v: 14, flip: 1, spin: 2 }) },   // no flat-spin input: a 360 with a backflip (cork / rodeo 360)
  bigair720: { query: P, setup: jump(VOLT, { v: 20.5, spin: 4, back: 30 }) },
  dc1080: { query: P, setup: jump(VOLT, { v: 20.5, flip: 2, spin: 6, back: 30 }) },
  cliff: { query: R, setup: jump(RAVEN, { v: 18, pop: false, back: 30 }) },
  cliff360: { query: R, setup: jump(RAVEN, { v: 18, spin: 2, pop: false, back: 30 }) },
  carve: { query: V, setup: timed('c.steer = t < 1.4 ? 1 : -1;', [[0.3, 'in'], [0.7, 'r1'], [1.1, 'r2'], [1.5, 'sw'], [1.9, 'l1'], [2.4, 'l2']], RUN, 17) },
  slalom: { query: V, setup: timed('c.steer = Math.sin(t * 3.0) > 0 ? 1 : -1;', [[0.6, 'a'], [1.1, 'b'], [1.6, 'c'], [2.1, 'd'], [2.6, 'e'], [3.1, 'f']], RUN, 15) },
  // A chair ride (needs a map with lifts: Valcrest has none, so there it ends at once; not run overnight).
  lift: { query: 'map=lake-tahoe', setup: `const L = pl.lifts?.nearestBase(pl.position); if (L) pl.board(L); else window.__done = true;
    let t = 0; const at = [[1.5, 'seat'], [3, 'ride'], [5, 'ride2']]; window.__phase = 'lift';
    pl.script = (c, p) => { t += 1 / 60; if (at.length && t >= at[0][0]) snap(at.shift()[1]); if (!at.length) window.__done = true; };` },
  crash: { query: V, setup: timed('if (t > 0.5 && p.state === 1) p.crash("test");', [[0.45, 'pre'], [0.7, 'crash'], [1.4, 'tumble'], [2.4, 'settled']], RUN, 12) },
};
