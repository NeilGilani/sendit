// Headless course bot: rides the real hand-built gully (course.js height function, sampled on the
// game's 1.25 m grid like terrain.js) from the start gate to the finish with the real Player physics.
// The bot steers toward the centre line ahead with linked S-turns (a fixed rhythm), pops at the
// natural drops, and logs every landing, stumble and crash plus speed statistics.
// Usage: node web/scripts/physics-course.mjs [ski|snowboard|both] [style]
//   style: carve (default, linked turns), straight (line down the middle, tuck), park (pop + spin off drops)
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { Course } = await import('../src/course.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;

const course = new Course();
const P = course.P, N = P.tileRes, SP = P.tileSize / (N - 1), HALF = P.tileSize / 2;
const cache = new Map();
const gridH = (i, j) => { const k = j * N + i; let v = cache.get(k); if (v === undefined) { v = course.height(-HALF + i * SP, -HALF + j * SP); cache.set(k, v); } return v; };
const terrain = {
  half: HALF, spacing: SP,
  getHeight(x, z) {
    const fx = (x + HALF) / SP, fz = (z + HALF) / SP, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    return (gridH(i, j) * (1 - tx) + gridH(i + 1, j) * tx) * (1 - tz) + (gridH(i, j + 1) * (1 - tx) + gridH(i + 1, j + 1) * tx) * tz;
  },
  getNormal(x, z, r = 0, out = new THREE.Vector3()) {
    const e = Math.max(r, SP);
    return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
  },
  getSurface: (x, z, out = new THREE.Vector4()) => out.set(0, 1, 0, 0),
  getSpawn() { const s = course.centre(12); return { position: new THREE.Vector3(s.x, s.y, s.z), heading: s.heading }; },
};

const events = [];
on('landed', (e) => events.push({ kind: 'land', ...e }));
on('crashed', (k) => events.push({ kind: 'crash', k }));
on('stumble', (r) => events.push({ kind: 'stumble', r }));
const DT = 1 / 60;

function ride(type, style) {
  events.length = 0;
  const p = new Player(terrain, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();      // headless: respawn immediately
  p.startRiding();
  let t = 0, vSum = 0, n = 0, vMax = 0, crashes = 0, maxImpact = 0, airMax = 0;
  const drops = P.drops.map(([dt]) => dt);
  const finishT = P.finishT;
  while (t < 600) {
    p.script = (c, pl) => {
      p.dyn._noInputT = style === 'straight' ? 999 : -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      const tt = course.tAt(pl.position.z);
      const look = course.centre(tt + Math.max(8, pl.speed * 1.2));
      const weave = style === 'carve' ? Math.sin(t * Math.PI / 1.6) * 9 : 0;   // a turn every 1.6 s
      const r = new THREE.Vector2(Math.cos(look.heading), -Math.sin(look.heading));   // right of the fall line
      const tx = look.x + r.x * weave, tz = look.z + r.y * weave;
      const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
      const want = Math.atan2(-(tx - pl.position.x), -(tz - pl.position.z));
      let d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
      if (pl.state === State.GROUNDED) c.steer = Math.max(-1, Math.min(1, -d * 2.5));
      if (style === 'straight') c.tuck = Math.abs(d) < 0.15 ? 1 : 0;
      // Pop just before the natural drops (style park also spins).
      const nextDrop = drops.find((x) => x > tt - 2);
      if (style === 'park' && nextDrop !== undefined && pl.state === State.GROUNDED && nextDrop - tt < 9 && nextDrop - tt > 0) c.jump = nextDrop - tt > 1.2;
      if (style === 'park' && pl.state === State.AIR && Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.14 < Math.PI * 2) c.steer = -1;
    };
    const was = p.state;
    p.step(DT);
    t += DT;
    if (p.state === State.CRASH && was !== State.CRASH) crashes++;
    if (p.state === State.AIR) airMax = Math.max(airMax, p.airTime);
    if (p.state === State.GROUNDED) { vSum += p.speed; n++; vMax = Math.max(vMax, p.speed); }
    if (course.tAt(p.position.z) > finishT) break;
  }
  const lands = events.filter((e) => e.kind === 'land');
  for (const l of lands) maxImpact = Math.max(maxImpact, l.impact);
  const st = events.filter((e) => e.kind === 'stumble').map((e) => e.r);
  const big = lands.filter((l) => l.air > 0.5).map((l) => `${l.air.toFixed(1)}s/${l.impact.toFixed(1)}${l.result === 'clean' ? '' : ':' + l.result}`);
  console.log(`  ${type.padEnd(9)} ${style.padEnd(8)} ${t.toFixed(0)} s to the finish, avg ${(vSum / Math.max(1, n)).toFixed(1)} m/s, max ${vMax.toFixed(1)} m/s, crashes ${crashes}, stumbles ${st.length} [${st.join(',')}], max air ${airMax.toFixed(1)} s, max impact ${maxImpact.toFixed(1)} m/s`);
  const hops = lands.filter((l) => l.air <= 0.5);
  console.log(`            big landings (air/impact): ${big.join('  ')}`);
  console.log(`            small hops (≤0.5 s): ${hops.length}, longest ${Math.max(0, ...hops.map((l) => l.air)).toFixed(2)} s`);
}

const which = process.argv[2] || 'both', style = process.argv[3] || 'carve';
for (const type of ['ski', 'snowboard']) if (which === 'both' || which === type) ride(type, style);
