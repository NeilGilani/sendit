// Kitsune Peak fuzz: random starts anywhere on the mountain (skis and board alternating, a third of them in the
// shrine village among the roofs, torii and lanterns), random stick / pop / tuck / brake / grab every
// 0.25–0.8 s, on the map's own grid with the real Player and the designed forest's hitboxes. Fails on a NaN,
// a rider below the snow (or a roof) by more than 1 m, a speed over 45 m/s, or a rider stuck still for 6 s.
// Usage: node web/scripts/map6-fuzz.mjs [runs = 40] [seconds per run = 40]
process.env.QUIET = '1';
const { makeTerrain, SCATTER } = await import('./map6-ride.mjs');
const { Player, State } = await import('../src/player.js');
const { START_X } = await import('../src/maps/kitsune/layout.js');
const { mulberry32 } = await import('../src/maps/kitsune/noise.js');
const T = makeTerrain();
const RUNS = Number(process.argv[2] || 40), SECS = Number(process.argv[3] || 40);
let bad = 0, crashes = 0, stuck = 0, frames = 0, under = 0, fast = 0, vmax = 0;
for (let k = 0; k < RUNS; k++) {
  const rnd = mulberry32(k * 7919 + 61);
  const ty = k % 2 ? 'snowboard' : 'ski';
  const p = new Player(T, SCATTER, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(ty); p.fadeThen = (fn) => fn(); p.startRiding();
  const village = k % 3 === 0;
  const u0 = village ? 1440 + rnd() * 600 : 30 + rnd() * 2300, v0 = village ? -150 + rnd() * 450 : (rnd() - 0.5) * 1100;
  p.place({ x: START_X + u0, z: v0 }, -Math.PI / 2 + (rnd() - 0.5) * 1.6);
  let c0 = { steer: 0, jump: false, tuck: 0, brake: 0, up: 0, grab: false }, next = 0, t = 0, still = 0;
  p.script = (c) => Object.assign(c, c0);
  for (; t < SECS; t += 1 / 60) {
    if (t > next) {
      next = t + 0.25 + rnd() * 0.55;
      c0 = { steer: rnd() * 2 - 1, jump: rnd() < 0.15, tuck: rnd() < 0.4 ? 1 : 0, brake: rnd() < 0.12 ? rnd() : 0, up: rnd() < 0.2 ? (rnd() < 0.5 ? 1 : -1) : 0, grab: rnd() < 0.2 };
    }
    const was = p.state;
    p.step(1 / 60); frames++;
    const P = p.position;
    if (![P.x, P.y, P.z, p.velocity.x, p.velocity.y, p.velocity.z, p.speed].every(Number.isFinite)) { bad++; console.log('NaN', k, ty, t.toFixed(2)); break; }
    const g = T.getHeight(P.x, P.z);
    if (P.y < g - 1.0 && p.state !== State.CRASH) { under++; if (under < 6) console.log('under', k, ty, t.toFixed(2), (g - P.y).toFixed(2), 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0), 'state', p.state); }
    const sp = p.velocity.length();
    vmax = Math.max(vmax, sp);
    if (sp > 45) { fast++; if (fast < 4) console.log('too fast', k, ty, sp.toFixed(1), 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0)); }
    if (p.state === State.CRASH && was !== State.CRASH) crashes++;
    if (p.state === State.GROUNDED && p.speed < 0.3 && c0.brake === 0) still += 1 / 60; else still = 0;
    if (still > 6) { stuck++; console.log('stuck', k, ty, 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0)); break; }
    if (!T.isInside(P.x, P.z, 30)) break;
  }
  p.flow?.dispose?.();
}
console.log(`runs ${RUNS} × ${SECS}s, frames ${frames}: NaN ${bad}, below the snow ${under} frames, stuck ${stuck}, over 45 m/s ${fast}, max ${vmax.toFixed(1)} m/s, crashes ${crashes}`);
const fail = bad || under || stuck || fast;
console.log(fail ? 'FAIL' : 'PASS');
process.exit(fail ? 1 : 0);
