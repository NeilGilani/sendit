// Scenario table for fpshots.mjs. Each `setup` is page code run with { s (window.__sendit), pl (player),
// snap(tag) } in scope: it places the rider, installs a pl.script (headless controls, 60 Hz) and calls
// snap() at the frames worth looking at; set window.__done = true when finished.
// `query` picks the map (default Valcrest with ?kicker=2), `equip` limits it to one gear type.

// Timer-driven ground run: `ctl(c, p, t)` sets the controls, `at` = [[t, tag], ?] snapshot times (s).
const timed = (ctl, at, place = 'spawn', speed = 0) => `
  const at = ${JSON.stringify(at)};
  ${place === 'spawn' ? 'const sp = s.terrain.getSpawn(); pl.place(sp.position, sp.heading);' : place}
  pl.velocity.copy(pl.forward()).multiplyScalar(${speed}); pl.speed = ${speed};
  let t = 0;
  pl.script = (c, p) => {
    t += 1 / 60;
    ${ctl}
    if (at.length && t >= at[0][0]) snap(at.shift()[1]);
    if (!at.length) window.__done = true;
  };`;

// Valcrest kicker 2 (the L): run in at `v` m/s, pop at the lip and throw a trick.
// flip: +n back flips / ?n front flips; spin: ?half-turns (+ = right); grab: hold the grab mid-air.
// Snapshots: every `every` s of air time, plus touchdown and 0.25 / 0.6 s after.
const kick = ({ v = 13, flip = 0, spin = 0, grab = false, every = 0.12, aim = 0, back = 25 } = {}) => `
  const k = s.features.kickers[2], TAU = Math.PI * 2;
  pl.place({ x: k.o.x - k.f.x * ${back}, z: k.o.y - k.f.y * ${back} }, Math.atan2(-k.f.x, -k.f.y) + ${aim});
  pl.velocity.copy(pl.forward()).multiplyScalar(${v});
  const FLIP = ${flip}, SPIN = ${spin}, GRAB = ${grab};
  let nextAir = 0, land = -1, wasAir = false, tg = 0;
  pl.script = (c, p) => {
    tg += 1 / 60;
    if (p.state === 1 && !wasAir) {
      const dx = p.position.x - k.o.x, dz = p.position.z - k.o.y, a = dx * k.f.x + dz * k.f.y;
      const aNext = a + (p.velocity.x * k.f.x + p.velocity.z * k.f.y) * (1 / 60) * 1.5;
      c.jump = a > -10 && aNext < k.L;
      if (a > -10 && aNext < k.L && c.jump && Math.abs(a + 10) < 0.25) snap('crouch');
      if (FLIP > 0) c.brake = a > -6 && aNext < k.L ? 1 : 0;
      if (FLIP < 0) c.up = a > -6 && aNext < k.L ? 1 : 0;
      if (SPIN) c.steer = a > k.L - 3 && aNext < k.L ? Math.sign(SPIN) : 0;
    } else if (p.state === 2) {
      wasAir = true;
      const tl = p.dyn.timeToLand();
      const fl = Math.abs(FLIP) * TAU, sp = Math.abs(SPIN) * Math.PI;
      if (FLIP && (p.airTime < 0.12 || Math.abs(p.flip) + Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH) * Math.max(0, tl - 0.2) < fl)) { if (FLIP > 0) c.brake = 1; else c.up = 1; }
      if (SPIN && (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH) * 0.6 * Math.max(0, tl - 0.15) < sp)) c.steer = Math.sign(SPIN);
      if (GRAB && p.airTime > 0.15) c.tuck = 1;
      if (p.airTime >= nextAir) { nextAir += ${every}; snap('air' + p.airTime.toFixed(2)); }
    } else if (wasAir) {
      if (land < 0) { land = tg; snap('touch'); }
      else if (tg - land > 0.25 && tg - land < 0.27) snap('land25');
      else if (tg - land > 0.6) { snap('land60'); window.__done = true; }
    }
    if (tg > 12) window.__done = true;
  };`;

// A groomed stretch: 70 m before Valcrest kicker 1, aimed down its run-in.
const RUN = `const k1 = s.features.kickers[1]; pl.place({ x: k1.o.x - k1.f.x * 70, z: k1.o.y - k1.f.y * 70 }, Math.atan2(-k1.f.x, -k1.f.y));`;

export const SCENARIOS = {
  stand: { setup: timed('', [[0.6, 'start'], [2.5, 'idle']]) },
  lookdown: { setup: timed('window.__cam.fpLook = t > 0.5 && t < 1.7 ? { pitch: -40 } : null;', [[1.6, 'down']], undefined, 0) },
  lookside: { setup: timed('window.__cam.fpLook = t > 0.5 && t < 1.7 ? { yaw: 1.2 } : null;', [[1.6, 'left']], undefined, 0) },
  push: { setup: timed('c.up = 1;', [[0.5, 'p1'], [0.85, 'p2'], [1.2, 'p3'], [1.6, 'p4']]) },
  glide: { setup: timed('', [[0.5, 'slow'], [3.5, 'fast']], RUN, 12) },
  carveR: { setup: timed('c.steer = 1;', [[0.5, 'in'], [1.2, 'deep']], RUN, 16) },
  carveL: { setup: timed('c.steer = -1;', [[0.5, 'in'], [1.2, 'deep']], RUN, 16) },
  slalom: { setup: timed('c.steer = Math.sin(t * 3.2) > 0 ? 1 : -1;', [[0.9, 'a'], [1.4, 'b'], [1.9, 'c'], [2.4, 'd']], RUN, 14) },
  carveSlow: { setup: timed('c.steer = 1;', [[1.0, 'slow']], RUN, 6) },
  stop: { setup: timed('c.brake = t > 0.3 ? 1 : 0;', [[0.5, 'in'], [0.9, 'mid'], [1.6, 'end']], RUN, 16) },
  plow: { equip: 'ski', setup: timed('c.brake = 1;', [[0.6, 'plow']], RUN, 5) },
  tuck: { setup: timed('c.tuck = 1;', [[0.8, 'tuck'], [3, 'fast']], RUN, 18) },
  pop: { setup: timed('c.jump = t < 0.6;', [[0.4, 'crouch'], [0.75, 'pop'], [1.0, 'up']], RUN, 10) },
  ollieNose: { setup: timed('c.up = t < 0.1 ? 1 : 0; c.jump = t < 0.6; if (t < 0.6 && t > 0.1) c.up = 1;', [[0.45, 'press'], [0.8, 'pop']], RUN, 10) },
  straight: { setup: kick({ every: 0.25 }) },
  grab: { setup: kick({ grab: true, every: 0.2 }) },
  spin360: { setup: kick({ spin: 2, every: 0.1 }) },
  spin720: { setup: kick({ v: 15, spin: 4, every: 0.1 }) },
  backflip: { setup: kick({ flip: 1, every: 0.08 }) },
  frontflip: { setup: kick({ flip: -1, every: 0.08 }) },
  doubleback: { setup: kick({ v: 16, flip: 2, every: 0.1 }) },
  cork720: { setup: kick({ v: 15, flip: 1, spin: 4, every: 0.08 }) },
  misty: { setup: kick({ v: 14, flip: -1, spin: 3, every: 0.08 }) },
  crash: { setup: timed('if (t > 0.5 && p.state === 1) p.crash("test");', [[0.45, 'pre'], [0.7, 'crash'], [1.4, 'tumble']], RUN, 12) },
};
