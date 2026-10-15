// Headless fuzz test on the real course: random steering, brakes, tuck, pops, preloads, flips, grabs
// and mid-ride gear / stance swaps. Fails on NaN / infinite state, a rider stuck in one state for too
// long, or one that falls through the terrain. Usage: node web/scripts/physics-fuzz.mjs [seconds per run] [runs]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { Course } = await import('../src/course.js');
const { listVariants } = await import('../src/equipment/registry.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

const course = new Course();
const P = course.P, N = P.tileRes, SP = P.tileSize / (N - 1), HALF = P.tileSize / 2;
const cache = new Map();
const gridH = (i, j) => { const k = j * N + i; let v = cache.get(k); if (v === undefined) { v = course.height(-HALF + i * SP, -HALF + j * SP); cache.set(k, v); } return v; };
const terrain = {
  half: HALF, spacing: SP,
  getHeight(x, z) { const fx = (x + HALF) / SP, fz = (z + HALF) / SP, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; return (gridH(i, j) * (1 - tx) + gridH(i + 1, j) * tx) * (1 - tz) + (gridH(i, j + 1) * (1 - tx) + gridH(i + 1, j + 1) * tx) * tz; },
  getNormal(x, z, r = 0, out = new THREE.Vector3()) { const e = Math.max(r, SP); return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize(); },
  getSurface: (x, z, out = new THREE.Vector4()) => out.set(0.3, 0.7, 0, 0),
  getSpawn() { const s = course.centre(12); return { position: new THREE.Vector3(s.x, s.y, s.z), heading: s.heading }; },
};
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const secs = Number(process.argv[2] || 120), runs = Number(process.argv[3] || 4);
const bad = (v) => !Number.isFinite(v);
let failures = 0, totals = { air: 0, flips: 0, crashes: 0, landings: 0 };
const reasons = {};

for (let r = 0; r < runs; r++) {
  const p = new Player(terrain, null, null, { strength: () => 0, justPressed: () => false });
  p.fadeThen = (fn) => fn();
  p.setEquipment(r % 2 ? 'snowboard' : 'ski');
  p.startRiding();
  let held = { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, hold = 0, sameState = 0, last = p.state;
  for (let i = 0; i < secs * 60; i++) {
    if ((hold -= 1 / 60) <= 0) {
      hold = 0.1 + rnd() * 0.9;
      held = { steer: rnd() < 0.3 ? 0 : rnd() * 2 - 1, brake: rnd() < 0.15 ? 1 : 0, up: rnd() < 0.2 ? 1 : 0, jump: rnd() < 0.25, tuck: rnd() < 0.15 ? 1 : 0 };
      if (rnd() < 0.03) { const t = rnd() < 0.5 ? 'ski' : 'snowboard'; const vs = listVariants(t); p.setEquipment(t, vs[Math.floor(rnd() * vs.length)].id); }
      if (rnd() < 0.02) p.setStance(rnd() < 0.5 ? 'goofy' : 'regular');
    }
    p.script = (c) => { Object.assign(c, held); };
    p.step(1 / 60);
    // Keep the bot inside the gully: nudge back toward the centre line when far off it.
    const c = course.centre(course.tAt(p.position.z));
    if (Math.abs(p.position.x - c.x) > 60) { p.position.x = c.x; p.position.y = terrain.getHeight(p.position.x, p.position.z); }
    if (course.tAt(p.position.z) > P.finishT) p.startRiding();
    const vals = [p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z, p.heading, p.flip, p.flipRate, p.spinRate, p.edgeAngle, p.speed, p.orient.x, p.orient.w];
    if (vals.some(bad)) { console.log(`run ${r} step ${i}: non-finite state`, vals); failures++; break; }
    if (p.state === State.GROUNDED || p.state === State.AIR) {
      const gh = terrain.getHeight(p.position.x, p.position.z);
      if (p.position.y < gh - 0.5) { console.log(`run ${r} step ${i}: below the terrain by ${(gh - p.position.y).toFixed(2)} m`); failures++; break; }
    }
    sameState = p.state === last ? sameState + 1 : 0; last = p.state;
    if (p.state === State.AIR && sameState > 60 * 12) { console.log(`run ${r}: stuck in the air`); failures++; break; }
    if (p.state === State.AIR) totals.air += 1 / 60;
    if (p.state === State.CRASH && sameState === 0 && i > 0) {
      totals.crashes++;
      const why = p.lastCrash && p.lastCrash.air > 0 ? p.lastCrash.reason + (p.lastCrash.air < 0.6 ? ' (short air)' : '') : 'other';
      reasons[why] = (reasons[why] || 0) + 1;
      p.lastCrash = null;
    }
  }
  totals.landings += p.landingEvent;
}
console.log('crash causes', JSON.stringify(reasons));
console.log(`${runs} runs × ${secs} s: ${failures ? failures + ' FAILURES' : 'no failures'}; ${totals.landings} landings, ${totals.crashes} crashes, ${totals.air.toFixed(0)} s airborne`);
process.exit(failures ? 1 : 0);
