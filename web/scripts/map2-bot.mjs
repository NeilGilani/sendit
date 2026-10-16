// Headless bot for map 2 (Blackspruce Plunge): rides the real Player physics down the real height
// field (the course's height function on the game's 1.25 m grid, plus the features.js kickers)
// through the real collision circles of the designed forest (trees, rocks, stumps), start to finish.
// The bot picks a route (which lanes it prefers), looks ~1 s ahead along its lane, and steers for
// the lateral offset with the most clearance to the obstacles ahead — a skilled, not perfect, rider.
// Usage: node web/scripts/map2-bot.mjs [ski|snowboard|both] [main|fast|safe|all] [--ovr] [--brake=<m/s>] [--seed=n]
//   --ovr   apply the map's declared physics overrides (course.physics) on top of config.js
//   --brake hold speed under this (the bot brakes / skids above it)
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { PHYSICS } = await import('../src/config.js');
const { BlackspruceCourse } = await import('../src/maps/blackspruce/course.js');
const { forestObstacles } = await import('../src/maps/blackspruce/forest.js');
const { Features } = await import('../src/features.js');
const { game, Mode, on } = await import('../src/state.js');
game.mode = Mode.RIDING;

const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}`)); return a ? (a.includes('=') ? a.split('=')[1] : true) : d; };
const pos = args.filter((a) => !a.startsWith('--'));
const which = pos[0] || 'both', routeArg = pos[1] || 'main';
const OVR = !!flag('ovr', false), BRAKE = Number(flag('brake', 0)) || 0;

const course = new BlackspruceCourse();
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

function ride(type, route) {
  events.length = 0;
  const saved = JSON.parse(JSON.stringify({ ski: PHYSICS.ski, snowboard: PHYSICS.snowboard }));
  if (OVR) for (const k of ['ski', 'snowboard']) Object.assign(PHYSICS[k], course.physics?.[k] || {});
  const p = new Player(terrain, scatter, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  p.startRiding();
  let t = 0, vSum = 0, n = 0, vMax = 0, crashes = 0, airMax = 0, minClear = Infinity, lane = course.mainLane, laneId = 'main';
  const crashAt = [];
  const segT = {};
  let off = 0;
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
      // Candidate lateral offsets inside the lane: score = clearance along the straight line there.
      let best = -Infinity, bestO = 0;
      const lim = Math.max(0, l.hw - 0.6);
      for (let o = -lim; o <= lim + 1e-6; o += 0.5) {
        course.world(ta, l.d + o, tmp);
        const tx = tmp.x, tz = tmp.z;
        let clear = Infinity;
        for (let k = 1; k <= 8; k++) {
          const f = k / 8, x = pl.position.x + (tx - pl.position.x) * f, z = pl.position.z + (tz - pl.position.z) * f;
          each(x, z, (ob) => { clear = Math.min(clear, Math.hypot(x - ob[0], z - ob[1]) - ob[2]); });
        }
        const score = Math.min(clear, 3) - Math.abs(o - off) * 0.08 - Math.abs(o) * 0.05;
        if (score > best) { best = score; bestO = o; }
      }
      off = bestO;
      course.world(ta, l.d + off, tmp);
      const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
      const want = Math.atan2(-(tmp.x - pl.position.x), -(tmp.z - pl.position.z));
      const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
      if (pl.state === State.GROUNDED) c.steer = Math.max(-1, Math.min(1, -d * 3));
      if (BRAKE && pl.speed > BRAKE) c.brake = Math.min(1, (pl.speed - BRAKE) / 3);
    };
    const was = p.state;
    p.step(DT);
    t += DT;
    if (p.state === State.CRASH && was !== State.CRASH) { crashes++; { const k = events.filter((e) => e.kind === 'crash').slice(-1)[0]?.k; crashAt.push(`${Math.round(tt)}${k === 'landing' ? 'L:' + p.lastCrash?.reason + ':' + (p.lastCrash?.impact ?? 0).toFixed(0) : k?.[0] || ''}`); } }
    if (p.state === State.AIR) airMax = Math.max(airMax, p.airTime);
    if (p.state === State.GROUNDED) { vSum += p.speed; n++; vMax = Math.max(vMax, p.speed); }
    const near = scatter.nearest(p.position, 5);
    if (near) minClear = Math.min(minClear, near.dist);
    const sec = course.lanes && laneId;
    segT[sec] = (segT[sec] || 0) + DT;
    if (tt > finishT) break;
    void tmp;
  }
  const finished = course.tAt(p.position.z) > finishT;
  const nears = events.filter((e) => e.kind === 'near').length;
  const scoreSum = events.filter((e) => e.kind === 'score').reduce((s, e) => s + e.points, 0);
  const lands = events.filter((e) => e.kind === 'land' && e.air > 0.45);
  const avg = course.finishAt / t;
  console.log(`  ${type.padEnd(9)} ${route.padEnd(5)} ${finished ? 'FINISH' : 'DNF   '} ${t.toFixed(1)} s, run avg ${avg.toFixed(1)} m/s (ground ${(vSum / Math.max(1, n)).toFixed(1)}), max ${vMax.toFixed(1)} m/s, crashes ${crashes} [${crashAt.join(' ')}], stumbles ${events.filter((e) => e.kind === 'stumble').length}, near misses ${nears}, min clearance ${minClear.toFixed(2)} m, max air ${airMax.toFixed(1)} s, big airs ${lands.length}, score ${scoreSum}`);
  for (const k of ['ski', 'snowboard']) Object.assign(PHYSICS[k], saved[k]);
  return { t, crashes, finished };
}

const types = which === 'both' ? ['ski', 'snowboard'] : [which];
const routes = routeArg === 'all' ? ['main', 'fast', 'safe'] : [routeArg];
console.log(`Blackspruce bot: ${course.forest.trees.length} trees, finishAt ${course.finishAt.toFixed(0)} m${OVR ? ', physics overrides ON' : ''}${BRAKE ? `, brake above ${BRAKE} m/s` : ''}`);
for (const type of types) for (const r of routes) ride(type, r);
