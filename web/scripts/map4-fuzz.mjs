// Voltage Park fuzz: random starts (half aimed at a random rail at a random speed and angle, the rest at the drop
// zones and random spots), random stick / pop / tap / tuck / brake / W / S every 0.15–0.7 s, skis and board
// alternating, on the map's grid with the real Player and the grind. Fails on a NaN, a rider below the snow by
// more than 1 m (not crashing), a grind that never ends (> 12 s), a grinding rider off the rail line, or a rider
// stuck still on the slope for 8 s.
// Usage: node scripts/map4-fuzz.mjs [runs = 60] [seconds per run = 30]
const L = await import('./map4-lib.mjs');
const { State } = L;
const { on } = await import('../src/state.js');
const { mulberry32 } = await import('../src/maps/voltage/noise.js');
const { START_X } = await import('../src/maps/voltage/layout.js');
const { railAt } = await import('../src/physics/grind.js');
const { course, T } = await L.loadPark({ quiet: true });
const RUNS = Number(process.argv[2] || 60), SECS = Number(process.argv[3] || 30);
let bad = 0, under = 0, stuck = 0, longGrind = 0, offRail = 0, frames = 0, crashes = 0, locks = 0, banks = 0, bails = 0;
on('grindStart', () => locks++); on('grindScore', () => banks++); on('grindEnd', (e) => { if (e.reason === 'bail') bails++; });
for (let k = 0; k < RUNS; k++) {
  const rnd = mulberry32(k * 7919 + 101);
  const ty = k % 2 ? 'snowboard' : 'ski';
  const p = L.makePlayer(T, ty, rnd() < 0.5 ? 'park' : undefined);
  if (k % 2 === 0) {
    const r = course.rails[Math.floor(rnd() * course.rails.length)];
    const a = r.pts[0], b = r.pts[1], dx = b[0] - a[0], dz = b[2] - a[2], l = Math.hypot(dx, dz);
    const back = 6 + rnd() * 18, side = (rnd() - 0.5) * 2.5, yaw = Math.atan2(-dx, -dz) + (rnd() - 0.5) * 0.7 + (rnd() < 0.25 ? Math.PI / 2 : 0);
    p.place({ x: a[0] - dx / l * back - dz / l * side, z: a[2] - dz / l * back + dx / l * side }, yaw);
    const sp = 3 + rnd() * 9;
    p.velocity.set(dx / l * sp, 0, dz / l * sp);
  } else if (k % 4 === 1) {
    const z = course.dropZones[Math.floor(rnd() * course.dropZones.length)];
    p.place({ x: z.x, z: z.z }, z.heading);
  } else {
    p.place({ x: START_X + rnd() * 760, z: (rnd() - 0.5) * 540 }, -Math.PI / 2 + (rnd() - 0.5) * 1.6);
  }
  let c0 = {}, next = 0, still = 0, grindT = 0;
  p.script = (c) => Object.assign(c, c0);
  for (let t = 0; t < SECS; t += 1 / 60) {
    if (t > next) {
      next = t + 0.15 + rnd() * 0.55;
      const tap = rnd() < 0.15;
      c0 = { steer: rnd() < 0.7 ? rnd() * 2 - 1 : Math.sign(rnd() - 0.5), jump: tap || rnd() < 0.12, tuck: rnd() < 0.3 ? 1 : 0, brake: rnd() < 0.12 ? rnd() : 0, up: rnd() < 0.15 ? 1 : 0 };
      if (tap) next = t + 0.08;
    }
    const was = p.state;
    p.step(1 / 60); frames++;
    const P = p.position;
    if (![P.x, P.y, P.z, p.velocity.x, p.velocity.y, p.velocity.z, p.speed, p.heading].every(Number.isFinite)) { bad++; console.log('NaN', k, ty, t.toFixed(2), 'state', p.state); break; }
    const g = T.getHeight(P.x, P.z);
    if (P.y < g - 1.0 && p.state !== State.CRASH) { under++; if (under < 6) console.log('under', k, ty, t.toFixed(2), (g - P.y).toFixed(2), 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0), 'state', p.state); }
    if (p.state === State.CRASH && was !== State.CRASH) crashes++;
    if (p.state === State.GRIND) {
      grindT += 1 / 60;
      const G = p.grind.g;
      if (!G) { offRail++; console.log('grind state without a grind', k); break; }
      const q = railAt(G.rail, G.s);
      if (!G.hop && q.p.distanceTo(P) > 0.05) { offRail++; if (offRail < 5) console.log('off the rail line', k, q.p.distanceTo(P).toFixed(2)); }
      if (grindT > 12) { longGrind++; console.log('endless grind', k, G.rail.name); break; }
    } else grindT = 0;
    if (p.state === State.GROUNDED && p.speed < 0.3 && !c0.brake) still += 1 / 60; else still = 0;
    if (still > 8 && (P.x - START_X) < 760) { stuck++; console.log('stuck', k, ty, 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0)); break; }
    if (!T.isInside(P.x, P.z, 30)) break;
  }
  p.grind?.dispose(); p.flow?.dispose?.();
}
console.log(`runs ${RUNS} × ${SECS}s, frames ${frames}: NaN ${bad}, below the snow ${under}, stuck ${stuck}, endless grinds ${longGrind}, off the rail ${offRail}; crashes ${crashes}, rail locks ${locks}, banked ${banks}, bails ${bails}`);
console.log(bad || under || stuck || longGrind || offRail ? 'FAIL' : 'PASS');
if (bad || under || stuck || longGrind || offRail) process.exit(1);
