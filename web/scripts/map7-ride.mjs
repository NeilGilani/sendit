// Fjordline (map 7) trail bot: rides every trail from its top (course.trailSpawn) down its canonical line
// (layout.js RIDE_LINES) to the sea with the real Player physics and the map's physics overrides, on the map's own
// grid (roofs, the quay and the pier included), and reports speed, air, drops, landings, crashes, line goals,
// the judged score, whether the rider reached the trail's finish, and the runCompleted event.
// Usage: node web/scripts/map7-ride.mjs [ski|snowboard|both] [trail|all] [style] [--check]
//   style: send (default: tucked, pop the lips), carve (linked turns), trick (spins off real airs), control (speed checks)
//   --check: exit 1 unless every ride finishes with ≤ 1 crash. env TRACE=1 prints a 1 s trace.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { FjordlineCourse } = await import('../src/maps/fjordline/course.js');
const { START_X, SEA, FINISH_U, RIDE_LINES, TRAILS } = await import('../src/maps/fjordline/layout.js');
const { game, Mode, on, emit } = await import('../src/state.js');
game.mode = Mode.RIDING;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CHECK = process.argv.includes('--check');
const [typeArg = 'both', trailArg = 'all', style = 'send'] = args;
export const course = new FjordlineCourse();
const t0 = Date.now();
const grid = await course.generate();
const { res: N, spacing: SP, size_m: SIZE } = grid.meta;
const HALF = SIZE / 2, H = grid.heights, S = grid.splat;
if (import.meta.url.endsWith(process.argv[1]?.split(/[\\/]/).pop() ?? '')) console.log(`grid ${N}² generated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

export function makeTerrain() {
  const base = (x, z) => {
    const fx = Math.min(Math.max((x + HALF) / SP, 0), N - 1.001), fz = Math.min(Math.max((z + HALF) / SP, 0), N - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, r = j * N + i;
    return (H[r] * (1 - tx) + H[r + 1] * tx) * (1 - tz) + (H[r + N] * (1 - tx) + H[r + N + 1] * tx) * tz;
  };
  return {
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
}

/** v(u) along a canonical line. */
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

export function ride(type, key, style = 'send', opts = {}) {
  const L = opts.line || RIDE_LINES[key];
  const vAt = lineSampler(L);
  const T = makeTerrain();
  const events = [], airSegs = [], completed = [], goals = [];
  const offs = [
    on('landed', (e) => events.push({ kind: 'land', ...e })), on('crashed', (k) => events.push({ kind: 'crash', k })),
    on('stumble', (r) => events.push({ kind: 'stumble', r: `${r}@u${Math.round(p.position.x - START_X)}` })),
    on('runCompleted', (e) => completed.push(e)), on('lineGoal', (e) => goals.push(e?.name ?? e)), on('fjordSplash', () => events.push({ kind: 'splash' })),
  ];
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  emit('rideStarted');
  const sp = opts.start ? { x: START_X + opts.start[0], z: opts.start[1], heading: -Math.PI / 2 } : course.trailSpawn(L.trail);
  p.place(new THREE.Vector3(sp.x, 0, sp.z), sp.heading);
  emit('dropZone', { trail: L.trail });
  game.score = 0; game.distance = 0;
  let t = 0, vSum = 0, n = 0, vMax = 0, crashes = 0, air = 0, airMax = 0, takeY = 0, wasAir = false, takeU = 0, roofT = 0, finished = false, splash = false;
  const fin = course.trailFinish(L.trail);
  let reachedFinishCircle = false;
  const DT = 1 / 60, trace = [];
  while (t < 300) {
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
      if (style === 'control' && pl.state === State.GROUNDED && pl.speed > (opts.target ?? 21)) c.brake = 0.7;
      if (pl.state === State.GROUNDED && style !== 'carve' && !c.brake) {
        const fx = -Math.sin(travel), fz = -Math.cos(travel);
        const h0 = T.getHeight(pl.position.x, pl.position.z);
        const slope = (h0 - T.getHeight(pl.position.x + fx * 3, pl.position.z + fz * 3)) / 3;
        let drop = 0;
        for (const dd of [6, 9, 12]) drop = Math.max(drop, (h0 - T.getHeight(pl.position.x + fx * dd, pl.position.z + fz * dd)) - slope * dd);
        const lipNear = (h0 - T.getHeight(pl.position.x + fx * 2.5, pl.position.z + fz * 2.5)) - slope * 2.5;
        if (drop > (opts.popDrop ?? 6)) c.jump = !(lipNear > 1.2);
      }
      if (style === 'trick' && pl.state === State.AIR && (Math.abs(pl._spinTotal) > 0.6 || pl.dyn.timeToLand() > 1.3)) {
        const tl = pl.dyn.timeToLand();
        if (Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.15 + Math.abs(pl.dyn.spinH || 0) * pl.dyn.C.spinOpen * Math.max(0, tl - 0.15) < Math.PI * (opts.spins || 2)) c.steer = -1;
      }
      if (opts.script) opts.script(c, pl, t);
    };
    const was = p.state;
    const prevVel = p.velocity.clone();
    p.step(DT);
    t += DT;
    const u = p.position.x - START_X;
    if (p._fjordSplash) { splash = true; break; }
    if (p.state === State.CRASH && was !== State.CRASH) {
      crashes++;
      if (was === State.GROUNDED) airSegs.push({ u: Math.round(u), air: 0, drop: 0, impact: 0, v: +prevVel.length().toFixed(1), result: 'GROUND CRASH', why: JSON.stringify(p.lastCrash ?? { obstacle: true }) + ` v=${p.position.z.toFixed(0)}` });
      p.lastCrash = null;
    }
    if (p.state === State.AIR && !wasAir) { takeY = p.position.y; takeU = u; }
    if (p.state !== State.AIR && wasAir) airSegs.push({ why: p.state === State.CRASH ? JSON.stringify(p.lastCrash) : '', u: Math.round(takeU), air: +p.lastLanding?.air?.toFixed(2) || 0, drop: +(takeY - p.position.y).toFixed(1), impact: +(p.lastLanding?.impact ?? 0).toFixed(1), result: p.state === State.CRASH ? 'CRASH' : p.lastLanding?.result, v: +prevVel.length().toFixed(1) });
    wasAir = p.state === State.AIR;
    if (p.state === State.AIR) { air += DT; airMax = Math.max(airMax, p.airTime); }
    if (p.state === State.GROUNDED) {
      vSum += p.speed; n++; vMax = Math.max(vMax, p.speed);
      if (course.heightAt(p.position.x, p.position.z) !== null) roofT += DT;
    }
    if (fin && Math.hypot(p.position.x - fin.at.x, p.position.z - fin.at.z) < 150) reachedFinishCircle = true;
    if (process.env.TRACE && Math.abs(t % 1) < DT) trace.push(`${t.toFixed(0)}s u=${u.toFixed(0)} v=${p.position.z.toFixed(0)} y=${(p.position.y - SEA).toFixed(0)} spd=${p.speed.toFixed(1)} st=${p.state}`);
    if (course.progress(p.position.x, p.position.z) >= FINISH_U) { finished = true; break; }
    if (crashes > 6) break;
  }
  if (finished) emit('runComplete');
  const judged = p.flow?.lastRun;
  for (const o of offs) o();
  p.flow?.dispose(); p.fjord?.dispose();
  return {
    trail: L.trail, line: key, type, style, time: +t.toFixed(1), finished, splash, reachedFinishCircle,
    avg: +(vSum / Math.max(1, n)).toFixed(1), max: +vMax.toFixed(1), crashes,
    stumbles: events.filter((e) => e.kind === 'stumble').length, stumbleWhy: events.filter((e) => e.kind === 'stumble').map((e) => e.r).join(','),
    airTotal: +air.toFixed(1), airMax: +airMax.toFixed(2), roofSeconds: +roofT.toFixed(1), airs: airSegs.filter((a) => a.air > 0.5 || /CRASH/.test(a.result)),
    trace, score: game.score, judged, completed, goals,
  };
}

if (process.argv[1] && process.argv[1].endsWith('map7-ride.mjs')) {
  const types = typeArg === 'both' ? ['ski', 'snowboard'] : [typeArg];
  const keys = trailArg === 'all' ? Object.keys(RIDE_LINES) : trailArg.split(',');
  let bad = 0;
  const rows = [];
  for (const k of keys) for (const ty of types) {
    const r = ride(ty, k, style, { spins: Number(process.env.SPINS || 2) });
    const diff = TRAILS.find((x) => x.id === r.trail)?.difficulty;
    console.log(`\n${RIDE_LINES[k].name} [${diff}] · ${ty} · ${style}: ${r.finished ? 'finished' : r.splash ? 'SPLASH' : 'DNF'} in ${r.time}s  avg ${r.avg} m/s (${(r.avg * 2.237).toFixed(0)} mph)  max ${r.max} (${(r.max * 2.237).toFixed(0)} mph)  crashes ${r.crashes}  stumbles ${r.stumbles}  air ${r.airTotal}s (max ${r.airMax}s)  roof ${r.roofSeconds}s  at its finish ${r.reachedFinishCircle ? 'yes' : 'no'}`);
    if (r.stumbleWhy) console.log(`   stumbles: ${r.stumbleWhy}`);
    for (const a of r.airs) console.log(`   air @u${a.u}: ${a.air}s  drop ${a.drop} m  in ${a.v} m/s  impact ${a.impact} m/s  → ${a.result} ${a.why || ''}`);
    if (r.judged) console.log(`   lines: ${(r.judged.goalList || []).join(', ') || '-'}   linked: ${(r.judged.featureList || []).join(', ')}\n   judged ${r.judged.total}/100  biggest drop ${r.judged.biggestDrop.toFixed(0)} m, longest air ${r.judged.longestAir.toFixed(1)} s`);
    for (const c of r.completed) console.log(`   runCompleted ${JSON.stringify(c)}`);
    if (process.env.TRACE) console.log(r.trace.join('\n'));
    rows.push(r);
    if (!r.finished || r.crashes > 1 || r.completed.length !== 1 || r.completed[0].trailId !== r.trail) bad++;
  }
  console.log(`\n${rows.length} rides, ${rows.filter((r) => r.finished).length} finished, ${rows.reduce((a, r) => a + r.crashes, 0)} crashes, ${rows.reduce((a, r) => a + r.stumbles, 0)} stumbles`);
  if (CHECK) { console.log(bad ? `FAIL (${bad})` : 'PASS'); process.exit(bad ? 1 : 0); }
}
