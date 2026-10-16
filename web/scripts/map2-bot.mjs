// Headless bot for map 2 (Blackspruce Plunge): rides the real Player physics down the real height
// field (the course's height function on the game's 1.25 m grid, plus the features.js kickers)
// through the real collision circles of the designed forest (trees, rocks, stumps), start to finish.
// The bot picks a route (which lanes it prefers), looks ~1 s ahead along its lane, and steers for
// the lateral offset with the most clearance to the obstacles ahead — a skilled, not perfect, rider.
// Usage: node web/scripts/map2-bot.mjs [ski|snowboard|both] [main|fast|safe|all] [--ovr] [--brake=<m/s>] [--splits]
//   --sight   can riders see each pivot 30 / 40 / 50 m ahead? (crowns and crests block)
//   --curve   print each lane's tightest radius and exit
//   --line    follow the planned best line (planLine) instead of searching locally
//   --fair    print each route's bottlenecks: where even the best line has < 0.3 m clearance
//   --check   speed control: brake for lane curves tighter than the grip allows, and when the best line ahead is tight
//   --tuck    tuck whenever the line ahead is straight
//   --splits  print the time between challenge gates (section splits)
//   --ovr   apply the map's declared physics overrides (course.physics) on top of config.js
//   --brake hold speed under this (the bot brakes / skids above it)
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { PHYSICS } = await import('../src/config.js');
const { BlackspruceCourse } = await import('../src/maps/blackspruce/course.js');
const { forestObstacles } = await import('../src/maps/blackspruce/forest.js');
const { GATES } = await import('../src/maps/blackspruce/layout.js');
const GATE_T = GATES.map((g) => g[0]);
const { Features } = await import('../src/features.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;

const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const pos = args.filter((a) => !a.startsWith('--'));
const which = pos[0] || 'both', routeArg = pos[1] || 'main';
const XTRACK = Number(flag('xtrack', 0.25)), GAIN = Number(flag('gain', 6)), LINE = !!flag('line', false), FAIR = !!flag('fair', false), TRACE = Number(flag('trace', 0)) || 0, CHECK = !!flag('check', false), TUCK = !!flag('tuck', false), SPLITS = !!flag('splits', false), OVR = !!flag('ovr', false), BRAKE = Number(flag('brake', 0)) || 0;

const course = new BlackspruceCourse();
const CLEARINGS = course.clearings;
const inClearing = (t, d) => CLEARINGS.some(([ct, cd, a, b]) => ((t - ct) / a) ** 2 + ((d - cd) / b) ** 2 < 1);
const P = course.P, N = P.tileRes, SP = P.tileSize / (N - 1), HALF = P.tileSize / 2;
const cache = new Map();
const gridH = (i, j) => { const k = j * N + i; let v = cache.get(k); if (v === undefined) { v = course.height(-HALF + i * SP, -HALF + j * SP); cache.set(k, v); } return v; };
const terrain = {
  half: HALF, spacing: SP, res: N, size: P.tileSize, features: null,
  baseHeight(x, z) {
    const fx = (x + HALF) / SP, fz = (z + HALF) / SP, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j;
    return (gridH(i, j) * (1 - tx) + gridH(i + 1, j) * tx) * (1 - tz) + (gridH(i, j + 1) * (1 - tx) + gridH(i + 1, j + 1) * tx) * tz;
  },
  getHeight(x, z) { const b = this.baseHeight(x, z); const f = this.features?.heightAt(x, z, b); return f != null && f > b ? f : b; },
  getNormal(x, z, r = 0, out = new THREE.Vector3()) {
    const e = Math.max(r, SP);
    return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize();
  },
  getSurface: (x, z, out = new THREE.Vector4()) => out.set(0, 1, 0, 0),
  isInside(x, z, m = 0) { return Math.abs(x) < HALF - m && Math.abs(z) < HALF - m; },
  getSpawn() { const s = course.centre(12); return { position: new THREE.Vector3(s.x, s.y, s.z), heading: s.heading }; },
};
const features = new Features(terrain);
features.plan(course);

// Obstacles: same hash / queries as scatter.js.
const HASH = 16, hash = new Map();
for (const o of forestObstacles(course)) {
  const k = `${Math.floor(o[0] / HASH)},${Math.floor(o[1] / HASH)}`;
  if (!hash.has(k)) hash.set(k, []);
  hash.get(k).push(o);
}
const each = (x, z, fn) => {
  const cx = Math.floor(x / HASH), cz = Math.floor(z / HASH);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) { const a = hash.get(`${cx + dx},${cz + dz}`); if (a) for (const o of a) fn(o); }
};
const scatter = {
  findObstacle(p, r) { let hit = null; each(p.x, p.z, (o) => { if (!hit && Math.hypot(p.x - o[0], p.z - o[1]) < o[2] + r) hit = o; }); return hit; },
  nearest(p, maxR) { let best = null; each(p.x, p.z, (o) => { const d = Math.hypot(p.x - o[0], p.z - o[1]) - o[2]; if (d < maxR && (!best || d < best.dist)) best = { dist: d, o }; }); return best; },
};

const events = [];
on('landed', (e) => events.push({ kind: 'land', ...e }));
on('crashed', (k) => events.push({ kind: 'crash', k }));
on('stumble', (r) => events.push({ kind: 'stumble', r }));
on('nearMiss', (e) => events.push({ ...e, kind: 'near' }));
on('score', (e) => events.push({ ...e, kind: 'score' }));
const DT = 1 / 60;

/** Which lane the route wants at t: fast → slots, safe → safe lanes, main → the main line. */
function laneFor(route, t) {
  const pick = (kind) => course.lanes.find((L) => L.kind === kind && t >= L.t0 + 4 && t <= L.t1 - 4);
  return (route === 'fast' && pick('slot')) || (route === 'safe' && pick('safe')) || course.mainLane;
}

/**
 * The best line through a route (independent of the bot's skill): dynamic programming over
 * t (1 m) × d (0.25 m) inside the route's lanes, maximising the smallest clearance between the
 * rider (0.35 m) and any hitbox, with the line's drift limited to SLOPE m per m (≈ 37°, a hard traverse).
 * Returns { d: Float32Array per t, clear: Float32Array per t (clearance at the chosen d) }.
 */
const SLOPE = 0.75, DB = 0.25, D0 = -70, ND = Math.round(140 / DB) + 1;
function planLine(route) {
  const T = P.finishT + 1, w = { x: 0, z: 0 };
  const val = new Float32Array(ND), nxt = new Float32Array(ND), from = new Int16Array(T * ND), clr = new Float32Array(T * ND);
  const reach = Math.max(1, Math.round(SLOPE / DB));
  for (let t = 0; t < T; t++) {
    const L = laneFor(route, t), l = course.laneAt(L, t) || course.laneAt(course.mainLane, t), m = course.laneAt(course.mainLane, t);
    for (let k = 0; k < ND; k++) {
      const d = D0 + k * DB;
      let c = -9;   // outside the corridor
      // Corridor: the route's lane, plus the main line and the clearings (where lanes split and merge).
      const ends = L === course.mainLane || t < L.t0 + 15 || t > L.t1 - 15;
      if (Math.abs(d - l.d) <= l.hw + 0.5 || (ends && Math.abs(d - m.d) <= m.hw + 0.5) || inClearing(t, d)) {
        course.world(t, d, w);
        c = 3;
        each(w.x, w.z, (o) => { c = Math.min(c, Math.hypot(w.x - o[0], w.z - o[1]) - o[2] - 0.35); });
      }
      clr[t * ND + k] = c;
      // Cost: heavy for overlapping a hitbox, quadratic under 1.2 m of room, a little for leaving the route's lane.
      const cost = (c < 0 ? 100 - 50 * c : c < 1.2 ? 4 * (1.2 - c) ** 2 : 0) + (Math.abs(d - l.d) > l.hw + 0.5 ? 0.3 : 0) + Math.abs(d - l.d) * 1e-3;
      if (t === 0) { nxt[k] = cost; continue; }
      let bv = Infinity, bj = k;
      for (let j = Math.max(0, k - reach); j <= Math.min(ND - 1, k + reach); j++) {
        const v = val[j] + (j === k ? 0 : 0.02);   // prefer holding the line
        if (v < bv) { bv = v; bj = j; }
      }
      nxt[k] = bv + cost;
      from[t * ND + k] = bj;
    }
    val.set(nxt);
  }
  let k = 0;
  for (let j = 1; j < ND; j++) if (val[j] < val[k]) k = j;
  const d = new Float32Array(T), clear = new Float32Array(T);
  for (let t = T - 1; t >= 0; t--) { d[t] = D0 + k * DB; clear[t] = clr[t * ND + k]; if (t > 0) k = from[t * ND + k]; }
  return { d, clear };
}

/** Tightest radius of a lane's centre line between t0 and t1 (6 m chords). */
function laneRadius(L, t0, t1) {
  const a = {}, b = {}, q = {};
  let R = Infinity;
  for (let t = t0; t < t1; t += 3) {
    const la = course.laneAt(L, t - 6), lb = course.laneAt(L, t), lq = course.laneAt(L, t + 6);
    if (!la || !lb || !lq) continue;
    course.world(t - 6, la.d, a); course.world(t, lb.d, b); course.world(t + 6, lq.d, q);
    const ax = b.x - a.x, az = b.z - a.z, bx = q.x - b.x, bz = q.z - b.z;
    R = Math.min(R, 6 / Math.max(1e-6, Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz))));
  }
  return R;
}

/** Steer toward a world point; tuck when the line ahead is straight (what a player does in a slot). */
function steerTo(c, pl, target, clearAhead) {
  const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
  const want = Math.atan2(-(target.x - pl.position.x), -(target.z - pl.position.z));
  const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
  if (pl.state === State.GROUNDED) c.steer = Math.max(-1, Math.min(1, -d * GAIN));
  if (TUCK && Math.abs(d) < 0.06 && Math.abs(c.steer) < 0.2 && clearAhead > 0.4) c.tuck = 1;
}

function ride(type, route) {
  const line = LINE ? lines[route] : null;
  events.length = 0;
  const saved = JSON.parse(JSON.stringify({ ski: PHYSICS.ski, snowboard: PHYSICS.snowboard }));
  if (OVR) for (const k of ['ski', 'snowboard']) Object.assign(PHYSICS[k], course.physics?.[k] || {});
  const p = new Player(terrain, scatter, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  let t = 0, vSum = 0, n = 0, vMax = 0, crashes = 0, airMax = 0, minClear = Infinity, lane = course.mainLane, laneId = 'main';
  const crashAt = [];
  const splits = [];   // time at each challenge gate (t)
  let nextSplit = 0;
  let off = 0;
  const trace = [];
  const finishT = P.finishT;
  const tmp = { x: 0, z: 0 };
  while (t < 400) {
    const tt = course.tAt(p.position.z);
    p.script = (c, pl) => {
      p.dyn._noInputT = -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      lane = laneFor(route, tt + 12);
      laneId = lane.id;
      const look = Math.max(9, pl.speed * 1.05);
      const ta = tt + look;
      const l = course.laneAt(lane, ta) || course.laneAt(course.mainLane, ta);
      if (line) {
        // Follow the planned line (smoothed over ±4 m), no local search.
        let dd = 0;
        for (let k = -4; k <= 4; k++) dd += line.d[Math.min(line.d.length - 1, Math.max(0, Math.round(ta) + k))];
        course.world(ta, dd / 9, tmp);
        steerTo(c, pl, tmp, 1);
        return;
      }
      // Candidate lateral offsets inside the lane: score = clearance along the straight line there.
      let best = -Infinity, bestO = 0, bestClear = Infinity;
      const lim = Math.max(0, l.hw - 0.6);
      for (let o = -lim; o <= lim + 1e-6; o += 0.5) {
        course.world(ta, l.d + o, tmp);
        const tx = tmp.x, tz = tmp.z;
        let clear = Infinity;
        for (let k = 1; k <= 8; k++) {
          const f = k / 8, x = pl.position.x + (tx - pl.position.x) * f, z = pl.position.z + (tz - pl.position.z) * f;
          each(x, z, (ob) => { clear = Math.min(clear, Math.hypot(x - ob[0], z - ob[1]) - ob[2]); });
        }
        const score = Math.min(clear, 2.5) - Math.abs(o - off) * 0.12 - Math.abs(o) * 0.04;   // commit to a side (hysteresis)
        if (score > best) { best = score; bestO = o; bestClear = clear; }
      }
      off = bestO;
      course.world(ta, l.d + off, tmp);
      steerTo(c, pl, tmp, bestClear);
      // Cross-track correction: lean back toward the chosen line when the slope pushes the rider off it.
      const ln = course.laneAt(lane, tt) || course.laneAt(course.mainLane, tt);
      const e = course.dAt(pl.position.x, tt) - (ln.d + off);
      if (pl.state === State.GROUNDED && XTRACK) c.steer = Math.max(-1, Math.min(1, c.steer - Math.max(-0.6, Math.min(0.6, e * XTRACK))));
      if (BRAKE && pl.speed > BRAKE) c.brake = Math.min(1, (pl.speed - BRAKE) / 3);
      // Speed control (what a skilled player does): brake for lane curves ahead tighter than the grip allows.
      if (CHECK && pl.state === State.GROUNDED) {
        const R = laneRadius(lane, tt + 4, tt + Math.max(20, pl.speed * 2.2));
        const vmax = Math.sqrt(0.75 * (pl.equipment.type === 'snowboard' ? 1.45 : 1.8) * 9.81 * R);
        if (pl.speed > vmax + 0.5) { c.brake = Math.min(1, (pl.speed - vmax) / 4); c.tuck = 0; }
      }
      // Check speed when even the best line ahead is tight.
      if (CHECK && bestClear < 0.55 && pl.speed > 14 && !c.brake) { c.brake = Math.min(1, (0.55 - bestClear) * 2.5); c.tuck = 0; }
    };
    const was = p.state;
    if (TRACE) { trace.push(`${t.toFixed(2)} t=${tt.toFixed(1)} d=${course.dAt(p.position.x, tt).toFixed(2)} lane=${laneId} v=${p.speed.toFixed(1)} st=${p.state} steer=${(p._ctrl?.steer ?? 0).toFixed(2)} off=${off.toFixed(1)} near=${(scatter.nearest(p.position, 6)?.dist ?? 9).toFixed(2)}`); if (trace.length > 150) trace.shift(); }
    p.step(DT);
    t += DT;
    if (p.state === State.CRASH && was !== State.CRASH) { crashes++; if (TRACE && Math.abs(tt - TRACE) < 15) { console.log(trace.filter((_, i) => i % 6 === 0).join(String.fromCharCode(10))); } { const k = events.filter((e) => e.kind === 'crash').slice(-1)[0]?.k; crashAt.push(`${Math.round(tt)}${k === 'landing' ? 'L:' + p.lastCrash?.reason + ':' + (p.lastCrash?.impact ?? 0).toFixed(0) : k?.[0] || ''}`); } }
    if (p.state === State.AIR) airMax = Math.max(airMax, p.airTime);
    if (p.state === State.GROUNDED) { vSum += p.speed; n++; vMax = Math.max(vMax, p.speed); }
    const near = scatter.nearest(p.position, 5);
    if (near) minClear = Math.min(minClear, near.dist);
    while (nextSplit < GATE_T.length && tt >= GATE_T[nextSplit]) { splits.push(t); nextSplit++; }
    if (tt > finishT) break;
    void tmp;
  }
  const finished = course.tAt(p.position.z) > finishT;
  const nears = events.filter((e) => e.kind === 'near').length;
  const scoreSum = events.filter((e) => e.kind === 'score').reduce((s, e) => s + e.points, 0);
  const lands = events.filter((e) => e.kind === 'land' && e.air > 0.45);
  const avg = course.finishAt / t;
  console.log(`  ${type.padEnd(9)} ${route.padEnd(5)} ${finished ? 'FINISH' : 'DNF   '} ${t.toFixed(1)} s, run avg ${avg.toFixed(1)} m/s (ground ${(vSum / Math.max(1, n)).toFixed(1)}), max ${vMax.toFixed(1)} m/s, crashes ${crashes} [${crashAt.join(' ')}], stumbles ${events.filter((e) => e.kind === 'stumble').length}, near misses ${nears}, min clearance ${minClear.toFixed(2)} m, max air ${airMax.toFixed(1)} s, big airs ${lands.length}, score ${scoreSum}`);
  if (SPLITS) console.log(`            splits: ${splits.map((x, i) => (x - (splits[i - 1] ?? 0)).toFixed(1)).join(' | ')} | ${(t - (splits[splits.length - 1] ?? 0)).toFixed(1)}`);
  for (const k of ['ski', 'snowboard']) Object.assign(PHYSICS[k], saved[k]);
  return { t, crashes, finished };
}

const types = which === 'both' ? ['ski', 'snowboard'] : [which];
const routes = routeArg === 'all' ? ['main', 'fast', 'safe'] : [routeArg];
console.log(`Blackspruce bot: ${course.forest.trees.length} trees, finishAt ${course.finishAt.toFixed(0)} m${OVR ? ', physics overrides ON' : ''}${BRAKE ? `, brake above ${BRAKE} m/s` : ''}`);
/** Tightest radius along each lane's centre line (6 m chords) — the curvature rule in docs/map2-research.md. */
function curvature() {
  const a = {}, b = {}, q = {};
  for (const L of course.lanes) {
    let worst = [Infinity, 0], drift = [0, 0];
    for (let t = L.t0 + 7; t < L.t1 - 7; t++) {
      course.world(t - 6, course.laneAt(L, t - 6).d, a); course.world(t, course.laneAt(L, t).d, b); course.world(t + 6, course.laneAt(L, t + 6).d, q);
      const ax = b.x - a.x, az = b.z - a.z, bx = q.x - b.x, bz = q.z - b.z;
      const R = 6 / Math.max(1e-6, Math.abs(Math.atan2(ax * bz - az * bx, ax * bx + az * bz)));
      if (R < worst[0]) worst = [R, t];
      const dr = Math.abs(course.laneAt(L, t + 1).d - course.laneAt(L, t - 1).d) / 2;
      if (dr > drift[0] && !CLEARINGS.some(([ct, cd, ca, cb]) => ((t - ct) / ca) ** 2 + ((course.laneAt(L, t).d - cd) / cb) ** 2 < 1)) drift = [dr, t];
    }
    console.log(`  ${L.id.padEnd(16)} ${L.kind.padEnd(5)} min radius ${worst[0].toFixed(0).padStart(3)} m at t=${worst[1]}${CLEARINGS.some(([ct, cd, ca, cb]) => ((worst[1] - ct) / ca) ** 2 < 1) ? ' (in a clearing)' : ''}, steepest drift outside clearings ${drift[0].toFixed(2)} m/m at t=${drift[1]}`);
  }
}
if (flag('curve', false)) { curvature(); process.exit(0); }

/**
 * Sightlines: can a rider on the lane see each pivot 30 / 40 / 50 m before it? A line from the eye
 * (1.7 m up, on the lane centre) to the pivot's trunk (1 m up) is blocked by another tree's crown
 * (radius ≈ 2.4 × crown width scale near the ground) or by the snow itself (a crest).
 */
function sightlines() {
  const TH = 8, th = new Map();
  for (const tr of course.forest.trees) {
    const k = `${Math.floor(tr[0] / TH)},${Math.floor(tr[1] / TH)}`;
    if (!th.has(k)) th.set(k, []);
    th.get(k).push(tr);
  }
  const eye = {}, bad = [];
  let total = 0, seen = 0;
  for (const [px, pz, , kind, pt, laneId] of course.forest.pivots) {
    const L = course.lanes.find((l) => l.id === laneId);
    const res = [];
    for (const back of [30, 40, 50]) {
      const l = course.laneAt(L, pt - back) || course.laneAt(course.mainLane, pt - back);
      course.world(pt - back, l.d, eye);
      const ey = terrain.getHeight(eye.x, eye.z) + 1.7, ty = terrain.getHeight(px, pz) + 1.0;
      let blocked = null;
      for (let k = 1; k < 40 && !blocked; k++) {
        const f = k / 40, x = eye.x + (px - eye.x) * f, z = eye.z + (pz - eye.z) * f, y = ey + (ty - ey) * f;
        if (terrain.getHeight(x, z) > y + 0.1) { blocked = 'crest'; break; }
        const a = th.get(`${Math.floor(x / TH)},${Math.floor(z / TH)}`);
        if (a) for (const tr of a) {
          if (Math.abs(tr[0] - px) < 0.01 && Math.abs(tr[1] - pz) < 0.01) continue;   // the pivot itself
          if (Math.hypot(x - tr[0], z - tr[1]) < 2.4 * tr[3] && f < 0.97) {
            // Another pivot in the way is the lane's rhythm (you pass it first), not a hidden hazard.
            const piv = course.forest.pivots.some((q) => q[0] === tr[0] && q[1] === tr[1]);
            if (piv && f < 0.12) continue;   // the eye point sits on the previous pivot: a rider is beside it
            blocked = piv ? 'pivot' : 'crown';
            if (process.env.WHO) console.log('    blocker for', laneId, Math.round(pt), 'from', back, 'm:', tr[8] ? 'MARKER' : piv ? 'PIVOT' : 'tree', 'f', f.toFixed(2), 'sx', tr[3].toFixed(2));
            break;
          }
        }
      }
      res.push(blocked ? { crest: 'k', crown: 'c', pivot: 'p' }[blocked] : '+');
      total++; if (!blocked || blocked === 'pivot') seen++;
    }
    if (/[ck]/.test(res[0] + res[1])) bad.push(`${laneId}@${Math.round(pt)}(${kind}):${res.join('')}`);
  }
  console.log(`  sightlines: ${seen}/${total} clear (30/40/50 m before each of ${course.forest.pivots.length} pivots; + clear, p behind the previous pivot (rhythm), c crown, k crest)`);
  if (bad.length) console.log('  not visible from 30 or 40 m: ' + bad.join('  '));
}
if (flag('sight', false)) { sightlines(); process.exit(0); }
const lines = {};
if (LINE || FAIR) for (const r of routes) {
  lines[r] = planLine(r);
  if (FAIR) {
    const c = lines[r].clear, bad = [];
    for (let t = 0; t < c.length; t++) if (c[t] < 0.3) bad.push(`${t}:${c[t].toFixed(2)}`);
    let mn = Infinity; for (const v of c) mn = Math.min(mn, v);
    console.log(`  best ${r.padEnd(5)} line: min clearance ${mn.toFixed(2)} m${bad.length ? ' — tight at ' + bad.slice(0, 30).join(' ') : ''}`);
  }
}
if (!FAIR || LINE) for (const type of types) for (const r of routes) ride(type, r);
