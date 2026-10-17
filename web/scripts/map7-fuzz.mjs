// Fjordline terrain fuzz: random starts anywhere on the mountain (skis and board alternating; on the face, the
// headland, the shoulder, the village roofs, the quay and the pier), random stick / pop / tuck / brake / grab every
// 0.25–0.8 s, on the map's own grid with the real Player. Fails on a NaN, a rider below the snow (or a roof / deck)
// by more than 1 m while not in the water, a rider stuck still on the slope for 6 s, or a splash that does not
// end back on dry land.
// Usage: node web/scripts/map7-fuzz.mjs [runs = 40] [seconds per run = 40]
const { makeTerrain, course } = await import('./map7-ride.mjs');
const { Player, State } = await import('../src/player.js');
const { START_X, SEA, BEACH, BUILDINGS, HARBOUR, coastU } = await import('../src/maps/fjordline/layout.js');
const { mulberry32 } = await import('../src/maps/fjordline/noise.js');
const { on } = await import('../src/state.js');
const T = makeTerrain();
let splashEv = 0;
on('fjordSplash', () => { splashEv++; });
const RUNS = Number(process.argv[2] || 40), SECS = Number(process.argv[3] || 40);
let bad = 0, crashes = 0, stuck = 0, frames = 0, under = 0, splashes = 0, wetRespawn = 0;
for (let k = 0; k < RUNS; k++) {
  const rnd = mulberry32(k * 7919 + 13);
  const ty = k % 2 ? 'snowboard' : 'ski';
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(ty); p.fadeThen = (fn) => fn(); p.fade = () => {}; p.startRiding();
  // Start: a quarter in the village / harbour (roofs, decks), the rest anywhere on the mountain.
  let u0, v0;
  if (k % 4 === 3) {
    const b = BUILDINGS[Math.floor(rnd() * BUILDINGS.length)];
    u0 = b.u - 30 - rnd() * 40; v0 = b.v + (rnd() - 0.5) * 16;
    if (rnd() < 0.3) { u0 = HARBOUR.pier.u0 + rnd() * 70; v0 = (HARBOUR.pier.v0 + HARBOUR.pier.v1) / 2; }
  } else { u0 = 40 + rnd() * 2400; v0 = (rnd() - 0.5) * 2200; }
  if (course.height(START_X + u0, v0) < SEA + BEACH && course.heightAt(START_X + u0, v0) === null) u0 -= 200;
  p.place({ x: START_X + u0, z: v0 }, -Math.PI / 2 + (rnd() - 0.5) * 1.6);
  // Every fifth run: launched at the water from the beach (the splash / back-on-the-shore path).
  if (k % 5 === 4) { const v = -500 + rnd() * 900; p.place({ x: START_X + coastU(v) - 25, z: v }, -Math.PI / 2); p.velocity.set(16, 0, 0); p.speed = 16; }
  let c0 = { steer: 0, jump: false, tuck: 0, brake: 0, up: 0, grab: false }, next = 0, t = 0, still = 0, wasSplash = splashEv;
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
    const sp = splashEv !== wasSplash; wasSplash = splashEv;
    if (sp) splashes++;
    if (sp && !p._fjordSplash && T.getHeight(P.x, P.z) < SEA + BEACH - 0.3) { wetRespawn++; console.log('respawned wet', k, ty, 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0)); }
    const g = T.getHeight(P.x, P.z);
    if (!p._fjordSplash && P.y < g - 1.0 && p.state !== State.CRASH) { under++; if (under < 6) console.log('under', k, ty, t.toFixed(2), (g - P.y).toFixed(2), 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0), 'state', p.state); }
    if (p.state === State.CRASH && was !== State.CRASH) crashes++;
    if (p.state === State.GROUNDED && p.speed < 0.3 && c0.brake === 0 && g > SEA + 5) still += 1 / 60; else still = 0;
    if (still > 6) { stuck++; console.log('stuck', k, ty, 'u', (P.x - START_X).toFixed(0), 'v', P.z.toFixed(0)); break; }
    if (!T.isInside(P.x, P.z, 45)) break;
  }
  p.flow?.dispose?.(); p.fjord?.dispose?.();
}
console.log(`runs ${RUNS} × ${SECS}s, frames ${frames}: NaN ${bad}, below the snow ${under} frames, stuck ${stuck}, crashes ${crashes}, splashes ${splashes}, wet respawns ${wetRespawn}`);
const fail = bad || under || stuck || wetRespawn;
console.log(fail ? 'FAIL' : 'PASS');
process.exit(fail ? 1 : 0);
