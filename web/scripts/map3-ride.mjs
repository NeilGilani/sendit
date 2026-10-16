// Ravenspire (map 3) line bot: rides named lines down the real face (the map's own height function on
// the game's grid, roofs and walls included) with the real Player physics and the map's physics
// overrides, and reports speed, air, drops, landing impacts, stumbles and crashes per line.
// Usage: node web/scripts/map3-ride.mjs [ski|snowboard|both] [line|all] [style]
//   style: send (default: straight-ish line, tuck, pop the lips), carve (linked turns), trick (spins / flips off drops)
//   env DEFAULTS=1 rides with the default (Valcrest) physics for comparison; TRACE=1 prints a 1 s trace.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { RavenspireCourse } = await import('../src/maps/ravenspire/course.js');
const { START_X, RIDE_LINES } = await import('../src/maps/ravenspire/layout.js');
const { game, Mode, on, emit } = await import('../src/state.js');
const { PHYSICS } = await import('../src/config.js');
game.mode = Mode.RIDING;

const [typeArg = 'both', lineArg = 'all', style = 'send'] = process.argv.slice(2);
const course = new RavenspireCourse();
if (process.env.DEFAULTS) { course.physics = null; course.camera = null; }
const t0 = Date.now();
const grid = await course.generate();
const { res: N, spacing: SP, size_m: SIZE } = grid.meta;
const HALF = SIZE / 2, H = grid.heights, S = grid.splat;
console.log(`grid ${N}² generated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// OBSTACLES=<file.json>: the browser's tree / rock / tower list ([x, z, r, kind], dumped from scatter.hash)
// so the bots ride the real forest (without it, only the course's own obstacles exist: none in the sim).
let SCATTER = null;
if (process.env.OBSTACLES) {
  const fs = await import('node:fs');
  const HASHM = 16, hash = new Map();
  for (const o of JSON.parse(fs.readFileSync(process.env.OBSTACLES, 'utf8'))) {
    const k = `${Math.floor(o[0] / HASHM)},${Math.floor(o[1] / HASHM)}`;
    if (!hash.has(k)) hash.set(k, []);
    hash.get(k).push(o);
  }
  const around = function* (pos) {
    const cx = Math.floor(pos.x / HASHM), cz = Math.floor(pos.z / HASHM);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) yield* (hash.get(`${cx + dx},${cz + dz}`) || []);
  };
  SCATTER = {
    findObstacle(pos, radius) { for (const o of around(pos)) if (Math.hypot(pos.x - o[0], pos.z - o[1]) < o[2] + radius) return o; return null; },
    nearest(pos, maxR) { let best = null; for (const o of around(pos)) { const d = Math.hypot(pos.x - o[0], pos.z - o[1]) - o[2]; if (d < maxR && (!best || d < best.dist)) best = { dist: d, o }; } return best; },
  };
}

export function makeTerrain() {
  const base = (x, z) => {
    const fx = Math.min(Math.max((x + HALF) / SP, 0), N - 1.001), fz = Math.min(Math.max((z + HALF) / SP, 0), N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, r = j * N + i;
    return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + N] * (1 - tx) + H[r + N + 1] * tx) * tz;
  };
  const T = {
    half: HALF, spacing: SP, course,
    features: { heightAt: (x, z) => course.heightAt(x, z), blockAt: (...a) => course.blockAt(...a) },
    baseHeight: base,
    getHeight(x, z) { const b = base(x, z), f = course.heightAt(x, z); return f !== null && f > b ? f : b; },
    getNormal(x, z, r = 0, out = new THREE.Vector3()) {
      const e = Math.max(r, SP);
      return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
    },
    getSurface(x, z, out = new THREE.Vector4()) {
      const i = Math.min(N - 1, Math.max(0, Math.round((x + HALF) / SP))), j = Math.min(N - 1, Math.max(0, Math.round((z + HALF) / SP)));
      const g = S[(j * N + i) * 3] / 255, r = S[(j * N + i) * 3 + 1] / 255;
      return out.set(g, Math.max(0, 1 - Math.max(g, r)), r, 0);
    },
    isInside: (x, z, m = 0) => Math.abs(x) < HALF - m && Math.abs(z) < HALF - m,
    getSpawn() { const s = course.spawnPoint(); return { position: new THREE.Vector3(s.x, base(s.x, s.z), s.z), heading: s.heading }; },
  };
  return T;
}

// Lines: waypoints in (u, v); the bot aims at the line a little ahead of itself.
export const LINES = RIDE_LINES;   // the canonical lines (layout.js): the course keeps them clear of trees and rocks

function lineSampler(L) {
  // Expand 'ravine' into the ravine's centre line.
  const pts = [];
  for (const p of L.pts) {
    if (p === 'ravine') { for (let u = 420; u <= 2180; u += 20) pts.push([u, course.rvAt(course.rv.c, u)]); }
    else pts.push(p);
  }
  return (u) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
    }
    return pts[pts.length - 1][1];
  };
}

export function ride(type, key, style, opts = {}) {
  const L = opts.line || LINES[key];   // opts.line: an ad-hoc { name, pts } (e.g. aimed at a snowflake)
  const vAt = lineSampler(L);
  const T = makeTerrain();
  const events = [];
  const flowEv = [];
  const stumbleAt = [];
  const offs = [on('stumble', (r) => stumbleAt.push(`${r}@u${Math.round(0)}`)), on('flowBanked', (e) => flowEv.push(e)), on('flowState', (e) => flowEv.push({ state: e.on })), on('landed', (e) => events.push({ kind: 'land', ...e })), on('crashed', (k) => events.push({ kind: 'crash', k })), on('stumble', (r) => events.push({ kind: 'stumble', r: `${r}@${Math.round(p.position.x - START_X)},${Math.round(p.position.z)}` }))];
  const p = new Player(T, SCATTER, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  if (opts.start) p.place({ x: START_X + opts.start[0], z: opts.start[1] }, -Math.PI / 2);   // [u, v]
  game.score = 0;
  let t = 0, vSum = 0, n = 0, vMax = 0, crashes = 0, air = 0, airMax = 0, takeY = 0, drops = [], airSegs = [];
  let wasAir = false, takeU = 0, roofT = 0, wall = 0, vMaxAt = "", wasAirPrev = false;
  const flakes = course.flakeSpots ? course.flakeSpots() : [], got = new Set();   // golden snowflakes picked up
  const near = flakes.map(() => ({ d: 1e9, dy: 0 }));
  const DT = 1 / 60;
  const trace = [];
  while (t < 260) {
    p.script = (c, pl) => {
      p.dyn._noInputT = style === 'send' ? 999 : -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      const u = pl.position.x - START_X;
      const look = Math.max(10, pl.speed * 1.1);
      const weave = style === 'carve' ? Math.sin(t * Math.PI / 1.5) * 10 : 0;
      const tx = START_X + u + look, tz = vAt(u + look) + weave;
      const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
      const want = Math.atan2(-(tx - pl.position.x), -(tz - pl.position.z));
      const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
      if (pl.state === State.GROUNDED) c.steer = Math.max(-1, Math.min(1, -d * 2.2));
      if (style === 'send') c.tuck = Math.abs(d) < 0.2 ? 1 : 0;
      // 'control': a real rider's speed check (scrub with a brief skid above the target speed).
      if (style === 'control' && pl.state === State.GROUNDED && pl.speed > (opts.target ?? 21)) c.brake = 0.7;
      // Lip ahead (terrain falls away much faster than the slope): load the pop, release at the lip.
      if (pl.state === State.GROUNDED && style !== 'carve' && !c.brake) {
        const fx = -Math.sin(travel), fz = -Math.cos(travel);
        const h0 = T.getHeight(pl.position.x, pl.position.z);
        const slope = (h0 - T.getHeight(pl.position.x + fx * 3, pl.position.z + fz * 3)) / 3;
        let drop = 0;
        for (const dd of [6, 9, 12]) drop = Math.max(drop, (h0 - T.getHeight(pl.position.x + fx * dd, pl.position.z + fz * dd)) - slope * dd);
        const lipNear = (h0 - T.getHeight(pl.position.x + fx * 2.5, pl.position.z + fz * 2.5)) - slope * 2.5;
        if (drop > (opts.popDrop ?? 6)) c.jump = !(lipNear > 1.2);
        if (style === 'trick' && drop > (opts.popDrop ?? 6)) c.brake = opts.flip ? 1 : 0;
      }
      if (style === 'trick' && pl.state === State.AIR && pl.airTime > 0.15 && (Math.abs(pl._spinTotal) > 0.6 || pl.dyn.timeToLand() > 1.3)) {
        if (Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.3 < Math.PI * (opts.spins || 2)) c.steer = -1;
      }
      if (opts.script) opts.script(c, pl, t);
    };
    const was = p.state;
    wasAirPrev = was === State.AIR;
    const prevVel = p.velocity.clone();
    p.step(DT);
    t += DT;
    const u = p.position.x - START_X;
    if (p.state === State.CRASH && was !== State.CRASH) {
      crashes++;
      if (was === State.GROUNDED) airSegs.push({ u: Math.round(u), air: 0, drop: 0, impact: 0, v: +prevVel.length().toFixed(1), result: 'GROUND CRASH', why: JSON.stringify(p.lastCrash && p.lastCrash.air === 0 ? p.lastCrash : { obstacle: true }) + ` z=${p.position.z.toFixed(0)}` });
      p.lastCrash = null;
    }
    if (p.state === State.AIR && !wasAir) { takeY = p.position.y; takeU = u; }
    if (p.state !== State.AIR && wasAir) {
      airSegs.push({ why: p.state === State.CRASH ? JSON.stringify(p.lastCrash) : '', u: Math.round(takeU), air: +p.lastLanding?.air?.toFixed(2) || 0, drop: +(takeY - p.position.y).toFixed(1), impact: +(p.lastLanding?.impact ?? 0).toFixed(1), result: p.state === State.CRASH ? 'CRASH' : p.lastLanding?.result, v: +prevVel.length().toFixed(1) });
    }
    wasAir = p.state === State.AIR;
    for (let k = 0; k < flakes.length; k++) {
      const f = flakes[k], dx = p.position.x - f.x, dz = p.position.z - f.z, dy = p.position.y + 0.9 - f.y;
      if (dx * dx + dz * dz < 2.6 && Math.abs(dy) < 1.9 && p.state !== State.CRASH) got.add(k);
      if (dx * dx + dz * dz < near[k].d ** 2) near[k] = { d: Math.hypot(dx, dz), dy };
    }
    if (p.state === State.AIR) { air += DT; airMax = Math.max(airMax, p.airTime); }
    if (p.state === State.GROUNDED) {
      vSum += p.speed; n++; if (p.speed > vMax) { vMax = p.speed; vMaxAt = `u${Math.round(u)} air-before ${wasAirPrev ? "yes" : "no"}`; }
      if (course.heightAt(p.position.x, p.position.z) !== null) roofT += DT;
    }
    if (process.env.TRACE && Math.abs(t % 1) < DT) trace.push(`${t.toFixed(0)}s u=${u.toFixed(0)} v=${p.position.z.toFixed(0)} y=${p.position.y.toFixed(0)} spd=${p.speed.toFixed(1)} st=${p.state}`);
    if (u > (opts.endU ?? 2560) || crashes > 6) break;
  }
  emit('runComplete');
  const judged = p.flow?.lastRun;
  for (const o of offs) o();
  p.flow?.dispose();
  const big = airSegs.filter((a) => a.air > 0.5 || /CRASH/.test(a.result));
  return {
    line: key, type, style, time: +t.toFixed(1), finished: p.position.x - START_X > 2560,
    avg: +(vSum / Math.max(1, n)).toFixed(1), max: +vMax.toFixed(1), vMaxAt, crashes,
    stumbles: events.filter((e) => e.kind === 'stumble').length, stumbleWhy: events.filter((e) => e.kind === 'stumble').map((e) => e.r).join(','), airTotal: +air.toFixed(1), airMax: +airMax.toFixed(2),
    roofSeconds: +roofT.toFixed(1), flakes: [...got].sort((a, b) => a - b), flakeNear: near, airs: big, trace, wall, score: game.score, flow: flowEv, judged,
  };
}

if (process.argv[1] && process.argv[1].endsWith('map3-ride.mjs')) {
  const types = typeArg === 'both' ? ['ski', 'snowboard'] : [typeArg];
  const keys = lineArg === 'all' ? Object.keys(LINES) : lineArg.split(',');
  console.log(`physics: ${process.env.DEFAULTS ? 'DEFAULTS (Valcrest)' : 'Ravenspire overrides'}  ski max ${PHYSICS.ski.maxVelocity}`);
  for (const k of keys) for (const ty of types) {
    const r = ride(ty, k, style, { flip: !!process.env.FLIP, spins: Number(process.env.SPINS || 2) });
    console.log(`\n${LINES[k].name} · ${ty} · ${style}: ${r.finished ? 'finished' : 'DNF'} in ${r.time}s  avg ${r.avg} m/s (${(r.avg * 2.237).toFixed(0)} mph)  max ${r.max} (${(r.max * 2.237).toFixed(0)} mph)  crashes ${r.crashes}  stumbles ${r.stumbles}  air ${r.airTotal}s (max ${r.airMax}s)  roof ${r.roofSeconds}s  flakes [${r.flakes}]`);
    if (r.stumbleWhy) console.log(`   stumbles: ${r.stumbleWhy}`);
    if (process.env.VMAX) console.log(`   max speed at ${r.vMaxAt}`);
    for (const a of r.airs) console.log(`   air @u${a.u}: ${a.air}s  drop ${a.drop} m  in ${a.v} m/s  impact ${a.impact} m/s  → ${a.result} ${a.why || ''}`);
    if (r.judged) console.log(`   lines: ${(r.judged.goalList || []).join(", ") || "-"}   linked: ${(r.judged.featureList || []).join(", ")}
   judged ${r.judged.total}/100  (line ${r.judged.line.toFixed(0)} · fluidity ${r.judged.fluidity.toFixed(0)} · control ${r.judged.control.toFixed(0)} · air & style ${r.judged.style.toFixed(0)})  biggest drop ${r.judged.biggestDrop.toFixed(0)} m, longest air ${r.judged.longestAir.toFixed(1)} s`);
    console.log(`   score ${r.score}  flow: ${r.flow.map((f) => (f.state !== undefined ? (f.state ? 'SEND-IT' : 'end') : `+${f.bonus}×${f.mult}`)).join(' ')}`);
    if (r.trace.length) console.log(r.trace.join('\n'));
  }
}
