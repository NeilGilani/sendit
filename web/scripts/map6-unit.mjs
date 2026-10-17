// Kitsune Peak (map 6) unit checks (headless, no grid generation; ~10 s):
//   • registration: the mountain / trails contract, trail stats match the course, thumbnail, lobby spot
//   • trails: trailSpawn / trailFinish valid, spawns on open snow, lines clear of every hitbox, selectTrail
//   • the atmosphere contract (dusk), physics / camera tuning present
//   • terrain: finite everywhere, deterministic, the crater, the Kazan crest above the face, the gully below it
//   • roofs: rideable surface over the drift, walls block a rider coming from the side but not from above
//   • named features: every line-goal feature exists somewhere on the mountain; flakes and drop zones are clear
//   • tree wells only around firs and never on a trail line
// Usage: node web/scripts/map6-unit.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const { getMap } = await import('../src/maps/registry.js');
await import('../src/maps/kitsune/index.js');
const { TRAIL_STATS } = await import('../src/maps/kitsune/index.js');
const { KitsuneCourse } = await import('../src/maps/kitsune/course.js');
const L = await import('../src/maps/kitsune/layout.js');
const { START_X, FINISH_U, TILE, LINE_GOALS, CRATER, KAZAN, GULLY } = L;

let fails = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const finite = (...a) => a.every(Number.isFinite);

// ------------------------------------------------------------------ registration
const map = getMap('kitsune-peak');
ok('registered', !!map && typeof map.load === 'function' && map.order === 6);
const M = map?.mountain || {};
ok('mountain contract', ['id', 'name', 'region', 'blurb', 'accent'].every((k) => typeof M[k] === 'string' && M[k].length) && /^#[0-9a-f]{6}$/i.test(M.accent), JSON.stringify(M));
const DIFF = ['green', 'blue', 'black', 'double-black', 'park'];
ok('trails contract', Array.isArray(map.trails) && map.trails.length >= 5 && map.trails.every((t) => t.id && t.name && DIFF.includes(t.difficulty) && t.description && t.length > 0 && t.vertical > 0));
ok('trail ids unique', new Set(map.trails.map((t) => t.id)).size === map.trails.length);
ok('thumbnail', typeof map.thumbnail === 'string' && map.thumbnail.startsWith('data:image/svg+xml'));

const t0 = Date.now();
const c = new KitsuneCourse();
console.log(`      course built in ${Date.now() - t0} ms: ${c.forest.birches.length} birches, ${c.forest.firs.length} firs, ${c.forest.juhyo.length} snow monsters, ${c.obstacles.length} hitboxes`);
ok('constructor under 6 s', Date.now() - t0 < 6000);
for (const t of c.trails) {
  const s = TRAIL_STATS[t.id];
  ok(`trail stats ${t.id}`, s && Math.abs(s.length - t.length) / t.length < 0.08 && Math.abs(s.vertical - t.vertical) / t.vertical < 0.08, `registered ${s?.length} m / ${s?.vertical} m, course ${t.length} m / ${t.vertical} m`);
}

// ------------------------------------------------------------------ trails
const nearestObstacle = (x, z) => { let d = Infinity, o0 = null; for (const o of c.obstacles) { const dd = Math.hypot(x - o[0], z - o[1]) - o[2]; if (dd < d) { d = dd; o0 = o; } } return [d, o0]; };
const obsHash = new Map();
for (const o of c.obstacles) { const k = `${Math.floor(o[0] / 16)},${Math.floor(o[1] / 16)}`; if (!obsHash.has(k)) obsHash.set(k, []); obsHash.get(k).push(o); }
const clearance = (x, z) => {
  let d = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of obsHash.get(`${Math.floor(x / 16) + i},${Math.floor(z / 16) + j}`) || []) d = Math.min(d, Math.hypot(x - o[0], z - o[1]) - o[2]);
  return d;
};
for (const t of c.trails) {
  const s = c.trailSpawn(t.id), f = c.trailFinish(t.id);
  const inTile = (x, z) => Math.abs(x) < TILE.size / 2 - 60 && Math.abs(z) < TILE.size / 2 - 60;
  ok(`spawn ${t.id}`, finite(s.x, s.z, s.heading) && inTile(s.x, s.z) && c.heightAt(s.x, s.z) === null && nearestObstacle(s.x, s.z)[0] > 3, `(${(s.x - START_X).toFixed(0)}, ${s.z.toFixed(0)}) heading ${s.heading.toFixed(2)}`);
  // Facing roughly downhill: the snow 15 m ahead is lower.
  const ahead = c.height(s.x - Math.sin(s.heading) * 15, s.z - Math.cos(s.heading) * 15);
  ok(`spawn ${t.id} faces downhill`, ahead < c.height(s.x, s.z) - 2);
  ok(`finish ${t.id}`, f.progress === FINISH_U && c.progress(START_X + FINISH_U) === FINISH_U && inTile(START_X + FINISH_U, t.finishV));
  // The line is clear of every hitbox (torii posts sit ≥ 2.5 m from the tunnel line).
  let worst = Infinity, at = null;
  const pts = c.linePoints(t.id);
  for (let i = 0; i < pts.length - 1; i++) {
    const [a0, b0] = pts[i], [a1, b1] = pts[i + 1], k = Math.ceil(Math.hypot(a1 - a0, b1 - b0) / 1.5);
    for (let j = 0; j <= k; j++) {
      const u = a0 + (a1 - a0) * j / k, v = b0 + (b1 - b0) * j / k;
      if (u < t.start[0]) continue;
      const d = clearance(START_X + u, v);
      if (d < worst) { worst = d; at = [u, v]; }
    }
  }
  ok(`line ${t.id} clear of hitboxes`, worst > 1.9, `closest ${worst.toFixed(2)} m at u ${at?.[0].toFixed(0)} v ${at?.[1].toFixed(0)}`);
}
ok('selectTrail', c.selectTrail('makura') && c.activeTrail === 'makura' && !c.selectTrail('nope') && c.activeTrail === 'makura');
ok('spawnPoint follows the selected trail', Math.abs(c.spawnPoint().x - c.trailSpawn('makura').x) < 1e-9);
c.selectTrail('okama');
ok('trailNear', c.trailNear(900, -440) === 'makura' && c.trailNear(800, c.kazanCrest(800)) === 'kazan' && c.trailNear(1000, c.gullyCentre(1000)) === 'kitsunebi');

// ------------------------------------------------------------------ atmosphere + tuning
const A = c.atmosphere;
ok('atmosphere contract', A && ['sunElevation', 'sunBearing', 'fogDensity', 'exposure', 'ambientScale'].every((k) => Number.isFinite(A[k])) && ['skyZenith', 'skyHorizon', 'fogColor'].every((k) => /^#[0-9a-f]{6}$/i.test(A[k])) && A.sunElevation < 10, JSON.stringify(A));
ok('physics / camera tuning', c.physics?.common?.flow?.enabled && c.physics.ski.maxVelocity > 20 && c.physics.snowboard.powderFloat > 1 && c.camera?.maxFovBonus > 0);

// ------------------------------------------------------------------ terrain
let allFinite = true;
for (let x = -TILE.size / 2; x <= TILE.size / 2; x += 37) for (let z = -TILE.size / 2; z <= TILE.size / 2; z += 37) if (!Number.isFinite(c.height(x, z))) allFinite = false;
ok('height finite over the tile', allFinite);
const c2 = new KitsuneCourse();
ok('deterministic', c2.forest.birches.length === c.forest.birches.length && [[0, 0], [400, 200], [1800, 40], [900, -440]].every(([u, v]) => c2.height(START_X + u, v) === c.height(START_X + u, v)));
const crater = c.height(START_X + CRATER.u, CRATER.v), rim = c.height(START_X, 0);
ok('crater below the rim', crater < rim - 60, `floor ${crater.toFixed(0)}, saddle ${rim.toFixed(0)}`);
ok('the summit is the high point', [[-450, 10], [-250, -230], [-250, 250]].every(([u, v]) => c.height(START_X + u, v) > rim), 'rim rises round the back');
for (const u of [300, 700, 1100]) {
  const cr = c.kazanCrest(u), top = c.height(START_X + u, cr), off = c.height(START_X + u, cr - 60);
  ok(`Kazan crest stands out at u ${u}`, top - off > 10, `${(top - off).toFixed(1)} m`);
}
for (const u of [700, 1000, 1300]) {
  const g = c.gullyCentre(u), floor = c.height(START_X + u, g), bank = c.height(START_X + u, g + GULLY.floor(u) + GULLY.wall + 4);
  ok(`gully floor below its bank at u ${u}`, bank - floor > 8, `${(bank - floor).toFixed(1)} m`);
}

// ------------------------------------------------------------------ roofs and walls
for (const s of c.structures) {
  const [x, z] = s.world(s.hl * 0.3, 0);
  const roof = c.heightAt(x, z), ground = c.natural(x, z);
  ok(`roof ${s.id} rideable`, roof !== null && roof > ground + 1.5, `roof ${roof?.toFixed(1)} over ground ${ground.toFixed(1)}`);
  // A rider at head height coming at the downhill wall from outside is blocked; one dropping onto the roof is not.
  const [ox, oz] = s.world(s.hl + 3, 0), [ix, iz] = s.world(s.hl - 1, 0);
  const gy = c.natural(ix, iz) + 1;
  const hit = c.blockAt(ix, gy, iz, ox, gy, oz);
  ok(`walls of ${s.id} solid`, !!hit && hit.kind === 'wall');
  const ry = c.heightAt(ix, iz);
  ok(`landing on ${s.id} not blocked`, !c.blockAt(ix, ry + 0.1, iz, ix, ry + 2, iz));
}
const kiku = c.structures.find((s) => s.id === 'kiku');
const eave = kiku.roofY(kiku.rl - 0.1, 0) - kiku.roofY(kiku.rl - 2.0, 0);
ok('sori eave turns up (a kicker)', eave > 0, `last 1.9 m rises ${eave.toFixed(2)} m`);

// ------------------------------------------------------------------ named features, flakes, drop zones
const names = new Set();
for (let u = 0; u <= FINISH_U; u += 3) for (let v = -800; v <= 700; v += 3) { const nm = c.featureAt(START_X + u, v); if (nm) names.add(nm); }
for (const [goal, , ...feats] of LINE_GOALS) ok(`line goal "${goal}" features exist`, feats.every((f) => names.has(f)), feats.filter((f) => !names.has(f)).join(', ') || feats.join(', '));
const flakes = c.challenge.flakes;
ok('flakes placed', flakes.length >= 10 && flakes.every((f) => finite(f.x, f.z, f.y) && clearance(f.x, f.z) > 1.5));
ok('drop zones on open snow', c.dropZones.every((d) => clearance(d.x, d.z) > 3 && c.heightAt(d.x, d.z) === null));
ok('medal speeds', c.challenge.medalSpeeds.gold > c.challenge.medalSpeeds.silver && c.challenge.medalSpeeds.silver > c.challenge.medalSpeeds.bronze);

// ------------------------------------------------------------------ wells
const wellOnLine = c.wells.filter((w) => c.lineDist(w.u, w.v) < w.r + 1);
ok('tree wells off the trail lines', wellOnLine.length === 0, `${wellOnLine.length} of ${c.wells.length}`);
const dish = c.wells[0] ? c.wellsAt(c.wells[0].u, c.wells[0].v) : 0;
ok('tree wells are dishes', dish > 0.5 && dish < 1.5, `${dish.toFixed(2)} m`);
void KAZAN;

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
