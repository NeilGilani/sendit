// Dragonback (map 5) line bot: rides the signature lines down the real face (the map's own height function on
// the game's grid) with the real Player physics and the map's physics overrides, and reports speed, airs
// (take-off / landing feature, gap distance, drop, impact, grade), ridge hops, line goals and the judged score.
// Usage: node web/scripts/map5-ride.mjs [ski|snowboard|both] [line|all] [style]
//   style: send (default: tuck, pop every lip), control (speed checks above 21 m/s), carve (linked turns),
//          trick (spins off every real air)
//   env TRACE=1 prints a 1 s trace; OBSTACLES=<dump.json> rides the browser's real trees / rocks;
//   QUIET=1 prints only the one-line summaries.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { DragonbackCourse } = await import('../src/maps/dragonback/course.js');
const { START_X, RIDE_LINES, FINISH_U } = await import('../src/maps/dragonback/layout.js');
const { game, Mode, on, emit } = await import('../src/state.js');
game.mode = Mode.RIDING;

export const course = new DragonbackCourse();
const t0 = Date.now();
const grid = await course.generate();
const { res: N, spacing: SP, size_m: SIZE } = grid.meta;
const HALF = SIZE / 2, H = grid.heights, S = grid.splat;
if (!process.env.QUIET) console.log(`grid ${N}² generated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

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

/** The game's terrain contract on the generated grid (bilinear heights, splat surface). */
export function makeTerrain() {
  const base = (x, z) => {
    const fx = Math.min(Math.max((x + HALF) / SP, 0), N - 1.001), fz = Math.min(Math.max((z + HALF) / SP, 0), N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, r = j * N + i;
    return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + N] * (1 - tx) + H[r + N + 1] * tx) * tz;
  };
  return {
    half: HALF, spacing: SP, course,
    features: { heightAt: () => null, blockAt: () => null },
    baseHeight: base,
    getHeight(x, z) { return base(x, z); },
    getNormal(x, z, r = 0, out = new THREE.Vector3()) {
      const e = Math.max(r, SP);
      return out.set(base(x - e, z) - base(x + e, z), 2 * e, base(x, z - e) - base(x, z + e)).normalize();
    },
    getSurface(x, z, out = new THREE.Vector4()) {
      const i = Math.min(N - 1, Math.max(0, Math.round((x + HALF) / SP))), j = Math.min(N - 1, Math.max(0, Math.round((z + HALF) / SP)));
      const g = S[(j * N + i) * 3] / 255, r = S[(j * N + i) * 3 + 1] / 255;
      return out.set(g, Math.max(0, 1 - Math.max(g, r)), r, 0);
    },
    isInside: (x, z, m = 0) => Math.abs(x) < HALF - m && Math.abs(z) < HALF - m,
    getSpawn() { const s = course.spawnPoint(); return { position: new THREE.Vector3(s.x, base(s.x, s.z), s.z), heading: s.heading }; },
  };
}

export const LINES = RIDE_LINES;

/** v(u) along a line (layout waypoints; '@ridge' waypoints follow that ridge's crest). */
export function lineSampler(L) {
  const pts = course.linePoints(L);
  return (u) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) {
      if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / Math.max(1e-6, pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
    }
    return pts[pts.length - 1][1];
  };
}

/**
 * Ride one line. opts: line ({ name, pts } ad hoc), start [u, v] (place there), endU, popDrop (m of fall-away
 * that triggers a pop), target (control speed), script(c, pl, t) (extra inputs), spins.
 */
export function ride(type, key, style = 'send', opts = {}) {
  const L = opts.line || LINES[key];
  const vAt = lineSampler(L);
  const T = makeTerrain();
  const airs = [], hops = [], goals = [];
  let crashes = 0, stumbles = 0;
  const p = new Player(T, SCATTER, null, { strength: () => 0, justPressed: () => false });
  const offs = [
    on('landingGrade', (e) => { airs.push({ ...e, u: Math.round(p.position.x - START_X), v: Math.round(p.position.z), tu: Math.round(p.takeoffPos.x - START_X), tv: Math.round(p.takeoffPos.z), land: course.featureAt(p.position.x, p.position.z) }); }),
    on('ridgeHop', (e) => hops.push(e)),
    on('lineGoal', (e) => goals.push(e.name)),
    on('crashed', () => { crashes++; airs.push({ crash: true, u: Math.round(p.position.x - START_X), v: Math.round(p.position.z), why: JSON.stringify(p.lastCrash ?? null) }); }),
    on('stumble', () => { stumbles++; }),
  ];
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  if (opts.start) {
    // opts.start = [u, v, heading?]; opts.speed: launch at that speed along the heading (on the snow plane).
    p.place({ x: START_X + opts.start[0], z: opts.start[1] }, opts.start[2] ?? -Math.PI / 2);
    if (opts.speed) {
      const h = p.heading, n = p.groundNormal, d = new THREE.Vector3(-Math.sin(h), 0, -Math.cos(h));
      d.addScaledVector(n, -d.dot(n)).normalize();
      p.velocity.copy(d).multiplyScalar(opts.speed);
      p.speed = opts.speed;
    }
  }
  game.score = 0;
  let t = 0, vSum = 0, n = 0, vMax = 0, air = 0, airMax = 0;
  const flakes = (course.challenge?.flakes || []).map((f) => ({ x: f.x, z: f.z, y: T.getHeight(f.x, f.z) + f.y })), got = new Set();
  const DT = 1 / 60, trace = [];
  const endU = opts.endU ?? FINISH_U + 20;
  while (t < 260) {
    p.script = (c, pl) => {
      p.dyn._noInputT = style === 'send' ? 999 : -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      const u = pl.position.x - START_X;
      const weave = style === 'carve' ? Math.sin(t * Math.PI / 1.5) * 10 : 0;
      const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
      let want;
      if (opts.look) {
        // Pure pursuit (the map 3 bot): aim at the line a little ahead.
        const look = Math.max(8, pl.speed * opts.look);
        want = Math.atan2(-(look), -(vAt(u + look) + weave - pl.position.z));
      } else {
        // A skilled rider: hold the line's heading a beat ahead (anticipation) and close the cross-track error
        // (Stanley steering): want = path heading(u + 0.35 s) + atan(k · error / speed).
        const ahead = Math.max(4, pl.speed * 0.35), du = 3;
        const slope = (vAt(u + ahead + du) - vAt(u + ahead - du)) / (2 * du);
        const err = vAt(u) + weave - pl.position.z;
        want = Math.atan2(-1, -(slope + Math.tan(Math.max(-1, Math.min(1, Math.atan(2.5 * err / Math.max(6, pl.speed)))))));
      }
      const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
      if (pl.state === State.GROUNDED) c.steer = Math.max(-1, Math.min(1, -d * 2.2));
      if (style === 'send' || style === 'trick') c.tuck = Math.abs(d) < 0.2 ? 1 : 0;
      if (style === 'control' && pl.state === State.GROUNDED && pl.speed > (opts.target ?? 21)) c.brake = 0.7;
      if (pl.state === State.GROUNDED && style !== 'carve' && !c.brake) {
        const fx = -Math.sin(travel), fz = -Math.cos(travel);
        const h0 = T.getHeight(pl.position.x, pl.position.z);
        const slope = (h0 - T.getHeight(pl.position.x + fx * 3, pl.position.z + fz * 3)) / 3;
        let drop = 0;
        for (const dd of [6, 9, 12]) drop = Math.max(drop, (h0 - T.getHeight(pl.position.x + fx * dd, pl.position.z + fz * dd)) - slope * dd);
        const lipNear = (h0 - T.getHeight(pl.position.x + fx * 2.5, pl.position.z + fz * 2.5)) - slope * 2.5;
        if (drop > (opts.popDrop ?? 5)) c.jump = !(lipNear > 1.2);
      }
      if (style === 'trick' && pl.state === State.AIR && (Math.abs(pl._spinTotal) > 0.6 || pl.dyn.timeToLand() > 1.3)) {
        const tl = pl.dyn.timeToLand();
        if (Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.15 + Math.abs(pl.dyn.spinH || 0) * pl.dyn.C.spinOpen * Math.max(0, tl - 0.15) < Math.PI * (opts.spins || 2)) c.steer = -1;
      }
      if (opts.script) opts.script(c, pl, t);
    };
    p.step(DT);
    t += DT;
    const u = p.position.x - START_X;
    for (let k = 0; k < flakes.length; k++) {
      const f = flakes[k], dx = p.position.x - f.x, dz = p.position.z - f.z, dy = p.position.y + 0.9 - f.y;
      if (dx * dx + dz * dz < 2.6 && Math.abs(dy) < 1.9 && p.state !== State.CRASH) got.add(k);
    }
    if (p.state === State.AIR) { air += DT; airMax = Math.max(airMax, p.airTime); }
    if (p.state === State.GROUNDED) { vSum += p.speed; n++; vMax = Math.max(vMax, p.speed); }
    if (process.env.TRACE && Math.abs(t % 1) < DT) trace.push(`${t.toFixed(0)}s u=${u.toFixed(0)} v=${p.position.z.toFixed(0)} y=${p.position.y.toFixed(0)} spd=${p.speed.toFixed(1)} st=${p.state} on=${course.featureAt(p.position.x, p.position.z)}`);
    if (u > endU || crashes > 6) break;
  }
  emit('runComplete');
  const judged = p.flow?.lastRun;
  for (const o of offs) o();
  p.flow?.dispose();
  return {
    line: key, name: L.name, type, style, time: +t.toFixed(1), finished: p.position.x - START_X > endU,
    avg: +(vSum / Math.max(1, n)).toFixed(1), max: +vMax.toFixed(1), crashes, stumbles,
    airTotal: +air.toFixed(1), airMax: +airMax.toFixed(2), flakes: [...got].sort((a, b) => a - b), airs, hops, goals, trace, score: game.score, judged,
  };
}

export function report(r) {
  const mph = (x) => (x * 2.237).toFixed(0);
  console.log(`\n${r.name} · ${r.type} · ${r.style}: ${r.finished ? 'finished' : 'DNF'} in ${r.time}s  avg ${r.avg} m/s (${mph(r.avg)} mph)  max ${r.max} (${mph(r.max)})  crashes ${r.crashes}  stumbles ${r.stumbles}  air ${r.airTotal}s (max ${r.airMax}s)  flakes [${r.flakes}]`);
  if (!process.env.QUIET) {
    for (const a of r.airs) {
      if (a.crash) { console.log(`   CRASH @u${a.u} v${a.v} ${a.why}`); continue; }
      const dist = Math.hypot(a.u - a.tu, a.v - a.tv);
      console.log(`   air u${a.tu},v${a.tv} → u${a.u},v${a.v} (${dist.toFixed(0)} m): ${a.air.toFixed(2)}s drop ${a.drop.toFixed(1)} imp ${a.impact.toFixed(1)} ${a.grade}  ${a.feature ?? '-'} → ${a.land ?? '-'}`);
    }
  }
  if (r.hops.length) console.log(`   hops: ${r.hops.map((h) => `${h.from}→${h.to} ${h.lateral.toFixed(0)}m${h.crest ? ' crest' : ''}`).join(' · ')}`);
  if (r.judged) console.log(`   goals: ${r.goals.join(', ') || '-'}   linked: ${(r.judged.featureList || []).join(', ')}\n   judged ${r.judged.total}/100 (line ${r.judged.line.toFixed(0)} · fluidity ${r.judged.fluidity.toFixed(0)} · control ${r.judged.control.toFixed(0)} · air & style ${r.judged.style.toFixed(0)})  biggest drop ${r.judged.biggestDrop.toFixed(0)} m, longest air ${r.judged.longestAir.toFixed(1)} s  score ${r.score}`);
  if (r.trace.length) console.log(r.trace.join('\n'));
}

if (process.argv[1] && process.argv[1].endsWith('map5-ride.mjs')) {
  const [typeArg = 'both', lineArg = 'all', style = 'send'] = process.argv.slice(2);
  const types = typeArg === 'both' ? ['ski', 'snowboard'] : [typeArg];
  const keys = lineArg === 'all' ? Object.keys(LINES) : lineArg.split(',');
  for (const k of keys) for (const ty of types) report(ride(ty, k, style, { spins: Number(process.env.SPINS || 2) }));
}
