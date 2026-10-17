// Kitsune Peak (map 6) trail bot: rides every trail from its own start (course.trailSpawn) down its line
// (course.linePoints) on the map's own height grid, roofs and walls included, with the real Player physics,
// the map's physics overrides and the designed forest's hitboxes (birch trunks, firs, snow monsters, torii
// posts, lanterns, the pagoda, the onsen rocks: course.obstacles). Reports speed, air, drops, landings,
// crashes (where and why), the torii-tunnel bonus, roof time and the runCompleted event per trail.
// Usage: node web/scripts/map6-ride.mjs [ski|snowboard|both] [trail,…|all] [send|control|carve|trick] [--check]
//   env OBSTACLES=<json> adds the browser's generic trees/rocks ([x, z, r, kind]); TRACE=1 prints a 1 s trace.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { KitsuneCourse } = await import('../src/maps/kitsune/course.js');
const { START_X, FINISH_U } = await import('../src/maps/kitsune/layout.js');
const { game, Mode, on, emit } = await import('../src/state.js');
game.mode = Mode.RIDING;

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CHECK = process.argv.includes('--check');
const [typeArg = 'both', trailArg = 'all', style = 'send'] = args;
export const course = new KitsuneCourse();
const t0 = Date.now();
const grid = await course.generate();
const { res: N, spacing: SP, size_m: SIZE } = grid.meta;
const HALF = SIZE / 2, H = grid.heights, S = grid.splat;
if (!process.env.QUIET) console.log(`grid ${N}² generated in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

// Obstacles: the course's own (designed forest, torii, lanterns…) + optionally the browser's generic scatter.
const HASHM = 16, hash = new Map();
const addObs = (o) => { const k = `${Math.floor(o[0] / HASHM)},${Math.floor(o[1] / HASHM)}`; if (!hash.has(k)) hash.set(k, []); hash.get(k).push(o); };
for (const o of course.obstacles) addObs(o);
if (process.env.OBSTACLES) { const fs = await import('node:fs'); for (const o of JSON.parse(fs.readFileSync(process.env.OBSTACLES, 'utf8'))) addObs(o); }
const around = function* (pos) {
  const cx = Math.floor(pos.x / HASHM), cz = Math.floor(pos.z / HASHM);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) yield* (hash.get(`${cx + dx},${cz + dz}`) || []);
};
export const SCATTER = {
  findObstacle(pos, radius) { for (const o of around(pos)) if (Math.hypot(pos.x - o[0], pos.z - o[1]) < o[2] + radius) return o; return null; },
  nearest(pos, maxR) { let best = null; for (const o of around(pos)) { const d = Math.hypot(pos.x - o[0], pos.z - o[1]) - o[2]; if (d < maxR && (!best || d < best.dist)) best = { dist: d, o }; } return best; },
};

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

function sampler(pts) {
  return (u) => {
    if (u <= pts[0][0]) return pts[0][1];
    for (let i = 0; i < pts.length - 1; i++) if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / Math.max(1e-6, pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
    return pts[pts.length - 1][1];
  };
}

/** Per-trail bot settings: speed target for 'control' and when to pop. */
export const TRAIL_BOT = {
  okama: { target: 23 }, kazan: { target: 21 }, makura: { target: 19, popDrop: 4 }, shirakaba: { target: 18, look: 0.7 },
  kitsunebi: { target: 20, popDrop: 2.5, look: 0.6 }, senbon: { target: 17, popDrop: 3 },
};

export function ride(type, trail, style, opts = {}) {
  const vAt = sampler(opts.pts || course.linePoints(trail));
  const T = makeTerrain();
  const cfg = { ...TRAIL_BOT[trail], ...opts };
  const events = [], completed = [], bonuses = [], features = new Set();
  const offs = [
    on('landed', (e) => events.push({ kind: 'land', ...e })),
    on('stumble', (r) => events.push({ kind: 'stumble', r: `${r}@${Math.round(p.position.x - START_X)},${Math.round(p.position.z)}` })),
    on('runCompleted', (e) => completed.push(e)),
    on('toriiTunnel', (e) => bonuses.push(`torii ${e.kmh.toFixed(0)} km/h +${e.points}`)),
    on('score', (e) => { if (/Whoop/.test(e.label)) bonuses.push(e.label); }),
    on('landingGrade', (e) => { if (e.feature) features.add(e.feature); if (e.roof) features.add(e.roof); }),
  ];
  course.selectTrail(trail);
  const p = new Player(T, SCATTER, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  emit('rideStarted');
  game.score = 0;
  let t = 0, vSum = 0, n = 0, vMax = 0, crashes = 0, air = 0, airMax = 0, takeY = 0, takeU = 0, roofT = 0, wasAir = false;
  const airSegs = [], trace = [];
  const DT = 1 / 60;
  p.script = (c, pl) => {
    pl.dyn._noInputT = style === 'send' ? 999 : -999;
    Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
    const u = pl.position.x - START_X;
    const look = Math.max(10, pl.speed * (cfg.look ?? 1.1));
    const weave = style === 'carve' ? Math.sin(t * Math.PI / 1.5) * 8 : 0;
    const tx = START_X + u + look, tz = vAt(u + look) + weave;
    const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
    const want = Math.atan2(-(tx - pl.position.x), -(tz - pl.position.z));
    const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    if (pl.state === State.GROUNDED) c.steer = Math.max(-1, Math.min(1, -d * 2.2));
    if (style === 'send') c.tuck = Math.abs(d) < 0.2 ? 1 : 0;
    if (style === 'control' && pl.state === State.GROUNDED && pl.speed > (cfg.target ?? 21)) c.brake = 0.7;
    if (pl.state === State.GROUNDED && style !== 'carve' && !c.brake) {
      const fx = -Math.sin(travel), fz = -Math.cos(travel);
      const h0 = T.getHeight(pl.position.x, pl.position.z);
      const slope = (h0 - T.getHeight(pl.position.x + fx * 3, pl.position.z + fz * 3)) / 3;
      let drop = 0;
      for (const dd of [6, 9, 12]) drop = Math.max(drop, (h0 - T.getHeight(pl.position.x + fx * dd, pl.position.z + fz * dd)) - slope * dd);
      const lipNear = (h0 - T.getHeight(pl.position.x + fx * 2.5, pl.position.z + fz * 2.5)) - slope * 2.5;
      if (drop > (cfg.popDrop ?? 6)) c.jump = !(lipNear > 1.2);
    }
    if (style === 'trick' && pl.state === State.AIR && pl.dyn.timeToLand() > 1.0) {
      const tl = pl.dyn.timeToLand();
      if (Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.15 + Math.abs(pl.dyn.spinH || 0) * pl.dyn.C.spinOpen * Math.max(0, tl - 0.15) < Math.PI * 2) c.steer = -1;
    }
  };
  while (t < 300) {
    const was = p.state;
    const prevVel = p.velocity.clone();
    p.step(DT);
    t += DT;
    const u = p.position.x - START_X;
    if (p.state === State.CRASH && was !== State.CRASH) {
      crashes++;
      airSegs.push({ u: Math.round(u), v: Math.round(p.position.z), air: was === State.AIR ? +p.airTime.toFixed(2) : 0, drop: was === State.AIR ? +(takeY - p.position.y).toFixed(1) : 0, speed: +prevVel.length().toFixed(1), result: was === State.AIR ? 'CRASH' : 'GROUND CRASH', why: JSON.stringify(p.lastCrash) });
      p.lastCrash = null;
    }
    if (p.state === State.AIR && !wasAir) { takeY = p.position.y; takeU = u; }
    if (p.state === State.GROUNDED && wasAir) airSegs.push({ u: Math.round(takeU), v: Math.round(p.position.z), air: +(p.lastLanding?.air ?? 0).toFixed(2), drop: +(takeY - p.position.y).toFixed(1), speed: +prevVel.length().toFixed(1), impact: +(p.lastLanding?.impact ?? 0).toFixed(1), result: p.lastLanding?.result });
    wasAir = p.state === State.AIR;
    if (p.state === State.AIR) { air += DT; airMax = Math.max(airMax, p.airTime); }
    if (p.state === State.GROUNDED) {
      vSum += p.speed; n++; vMax = Math.max(vMax, p.speed);
      if (course.heightAt(p.position.x, p.position.z) !== null) roofT += DT;
    }
    if (process.env.TRACE && Math.abs(t % 1) < DT) trace.push(`${t.toFixed(0)}s u=${u.toFixed(0)} v=${p.position.z.toFixed(0)} y=${p.position.y.toFixed(0)} spd=${p.speed.toFixed(1)} st=${p.state}`);
    if (u >= FINISH_U) { emit('runComplete'); break; }
    if (crashes > 6) break;
  }
  const judged = p.flow?.lastRun;
  for (const o of offs) o();
  p.flow?.dispose();
  return {
    trail, type, style, time: +t.toFixed(1), finished: p.position.x - START_X >= FINISH_U,
    avg: +(vSum / Math.max(1, n)).toFixed(1), max: +vMax.toFixed(1), crashes,
    stumbles: events.filter((e) => e.kind === 'stumble').map((e) => e.r), airTotal: +air.toFixed(1), airMax: +airMax.toFixed(2),
    roofSeconds: +roofT.toFixed(1), airs: airSegs.filter((a) => a.air > 0.6 || /CRASH/.test(a.result)), trace, score: game.score,
    completed, bonuses, features: [...features], judged,
  };
}

if (process.argv[1] && process.argv[1].endsWith('map6-ride.mjs')) {
  const types = typeArg === 'both' ? ['ski', 'snowboard'] : [typeArg];
  const keys = trailArg === 'all' ? course.trails.map((t) => t.id) : trailArg.split(',');
  let bad = 0;
  for (const k of keys) for (const ty of types) {
    const r = ride(ty, k, style);
    const ev = r.completed[0];
    const okEvent = ev && ev.mapId === 'kitsune-peak' && ev.trailId === k && ev.distance > 300 && ev.time > 10;
    console.log(`\n${k} · ${ty} · ${style}: ${r.finished ? 'finished' : 'DNF'} in ${r.time}s  avg ${r.avg} m/s (${(r.avg * 3.6).toFixed(0)} km/h)  max ${r.max} (${(r.max * 3.6).toFixed(0)} km/h)  crashes ${r.crashes}  stumbles ${r.stumbles.length}  air ${r.airTotal}s (max ${r.airMax}s)  roof ${r.roofSeconds}s  score ${r.score}`);
    console.log(`   runCompleted: ${ev ? JSON.stringify(ev) : 'none'}${okEvent ? '' : '  ← WRONG'}`);
    if (r.bonuses.length) console.log(`   bonuses: ${r.bonuses.join(' · ')}`);
    if (r.features.length) console.log(`   features: ${r.features.join(', ')}`);
    if (r.judged) console.log(`   goals: ${(r.judged.goalList || []).join(', ') || '-'}   judged ${r.judged.total}/100`);
    if (r.stumbles.length) console.log(`   stumbles: ${r.stumbles.join(' ')}`);
    for (const a of r.airs) console.log(`   air @u${a.u},v${a.v}: ${a.air}s drop ${a.drop} m at ${a.speed} m/s impact ${a.impact ?? '-'} → ${a.result} ${a.why || ''}`);
    if (r.trace.length) console.log(r.trace.join('\n'));
    const maxCrash = style === 'send' ? 1 : 0;
    if (!r.finished || r.crashes > maxCrash || !okEvent) bad++;
  }
  if (CHECK) { console.log(bad ? `\nFAIL: ${bad} ride(s) off target` : '\nall trails passed'); process.exit(bad ? 1 : 0); }
}
