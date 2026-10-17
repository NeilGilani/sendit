// Unit checks for Fjordline (map 7), headless and fast (no grid generation):
//   • the registry entry: mountain + trails contract (ids, difficulties, lengths / vertical measured along the lines)
//   • course.trailSpawn / trailFinish for every trail (on the snow, facing downhill, finishes at the water's edge)
//   • course.atmosphere shape (the graphics hook) and physics / camera tuning hooks
//   • the terrain: summit col → sea vertical, couloir choke width, the fjord is under the sea everywhere past the
//     coast, the beach is dry, the headland's point is above the sea, cliff steps exist where the layout says
//   • roofs and decks: every roof is rideable and above the walls' ground, the quay / pier decks sit over the
//     water, walls block a rider running into them from the side
//   • runCompleted: a finished run emits { mapId, trailId, distance, time, score } exactly once
//   • the water: riding into the fjord splashes and puts the rider back on dry land
// Usage: node web/scripts/map7-unit.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { getMap } = await import('../src/maps/registry.js');
await import('../src/maps/builtin.js');
const { FjordlineCourse } = await import('../src/maps/fjordline/course.js');
const L = await import('../src/maps/fjordline/layout.js');
const { Player, State } = await import('../src/player.js');
const { emit, on, game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;

let fails = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const { START_X, SEA, BEACH } = L;
const c = new FjordlineCourse();
const H = (u, v) => c.height(START_X + u, v);
const DIFFS = ['green', 'blue', 'black', 'double-black', 'park'];

// ------------------------------------------------------------------ registry: mountain + trails
const map = getMap('fjordline');
ok('registered', !!map && map.name === 'Fjordline' && typeof map.load === 'function');
ok('mountain card', map?.mountain?.id === 'fjordline' && !!map.mountain.name && !!map.mountain.region && !!map.mountain.blurb && /^#[0-9a-f]{6}$/i.test(map.mountain.accent));
ok('six trails, unique ids, valid difficulties', map?.trails?.length === 6 && new Set(map.trails.map((t) => t.id)).size === 6 && map.trails.every((t) => DIFFS.includes(t.difficulty) && t.name && t.description));
ok('every difficulty but one is covered (green, blue, black, double-black, park)', DIFFS.every((d) => map.trails.some((t) => t.difficulty === d)));
ok('every trail has a canonical line', map.trails.every((t) => Object.values(L.RIDE_LINES).some((r) => r.trail === t.id)));
// Lengths / vertical along the lines vs the static numbers (the lobby shows them without loading the map).
for (const t of map.trails) {
  const line = Object.values(L.RIDE_LINES).find((r) => r.trail === t.id);
  const pts = c.linePoints(line);
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    len += Math.hypot(b[0] - a[0], b[1] - a[1], H(b[0], b[1]) - H(a[0], a[1]));
  }
  const vert = H(pts[0][0], pts[0][1]) - (SEA + BEACH);
  ok(`trail ${t.id}: length ${Math.round(len)} m / vertical ${Math.round(vert)} m match the registry (±8 %)`, Math.abs(len - t.length) < 0.08 * len && Math.abs(vert - t.vertical) < 0.08 * vert + 10, `registry ${t.length} / ${t.vertical}`);
}

// ------------------------------------------------------------------ spawns, finishes
for (const t of L.TRAILS) {
  const s = c.trailSpawn(t.id), f = c.trailFinish(t.id);
  const sh = c.height(s.x, s.z);
  const ahead = c.height(s.x - Math.sin(s.heading) * 30, s.z - Math.cos(s.heading) * 30);
  ok(`trailSpawn(${t.id}) on the snow, inside the tile, facing downhill`, Number.isFinite(s.x + s.z + s.heading) && Math.abs(s.x) < 1450 && Math.abs(s.z) < 1450 && sh > SEA + 20 && ahead < sh - 3, `${Math.round(sh - SEA)} m above the sea, ${Math.round(sh - ahead)} m drop over 30 m`);
  const fh = c.height(f.x, f.z);
  ok(`trailFinish(${t.id}) at the water's edge`, f.radius > 20 && fh > SEA - 1 && fh < SEA + 60 && c.progress(f.x, f.z) > L.FINISH_U - f.radius - 20, `${Math.round(fh - SEA)} m above the sea, progress ${Math.round(c.progress(f.x, f.z))}`);
}
ok('unknown trail → null', c.trailSpawn('nope') === null && c.trailFinish('nope') === null);
ok('default spawn is the first trail (Skaret)', c.spawnPoint().x === c.trailSpawn('skaret').x);

// ------------------------------------------------------------------ hooks
const A = c.atmosphere;
ok('atmosphere hook shape', ['sunElevation', 'sunBearing', 'fogDensity', 'exposure', 'ambientScale'].every((k) => Number.isFinite(A[k])) && ['skyZenith', 'skyHorizon', 'fogColor'].every((k) => /^#[0-9a-f]{6}$/i.test(A[k])));
ok('golden hour: a low sun', A.sunElevation > 4 && A.sunElevation < 16);
ok('physics / camera hooks, flow on', c.physics?.ski?.maxVelocity > 20 && c.physics.common.flow?.enabled && c.camera?.maxFovBonus > 0);
ok('drop zones 1–9 (all named, on the snow)', c.dropZones.length === 9 && c.dropZones.every((d) => d.name && H(d.x - START_X, d.z) > SEA + 20));
ok('line goals name real features', c.lineGoals.length >= 6);
ok('12 snowflakes, all over dry snow', c.challenge.flakes.length === 12 && c.challenge.flakes.every((f) => Math.max(c.height(f.x, f.z), c.heightAt(f.x, f.z) ?? -1e9) > SEA + 0.5));
ok('challenge gates along the hero line', c.challenge.gates.length > 15 && c.challenge.gates.every((g, i, a) => i === 0 || g.at > a[i - 1].at));

// ------------------------------------------------------------------ terrain
ok(`summit col ${Math.round(c.top - SEA)} m above the fjord (Lyngen: 1,200–1,600)`, c.top - SEA > 1200 && c.top - SEA < 1600);
{
  const u = 312, vc = L.COULOIR.centre(u);
  let w = 0;
  for (let dv = -30; dv <= 30; dv += 0.5) if (H(u, vc + dv) - H(u, vc) < 3) w += 0.5;
  ok(`Skaret's choke is narrow (${w} m of floor) with ≥ 25 m walls`, w > 5 && w < 14 && H(u, vc + 30) - H(u, vc) > 25 && H(u, vc - 30) - H(u, vc) > 25);
  let steep = 0;
  for (let k = 120; k < 560; k += 20) steep += (H(k - 2, L.COULOIR.centre(k - 2)) - H(k + 2, L.COULOIR.centre(k + 2))) / 4;
  steep = Math.atan(steep / 22) * 180 / Math.PI;
  ok(`Skaret averages 38–48° (${steep.toFixed(0)}°)`, steep > 38 && steep < 48);
}
let wet = 0, dry = 0;
for (let v = -400; v <= 300; v += 25) { if (H(L.coastU(v) + 30, v) > SEA - 1) wet++; if (H(L.coastU(v) - 30, v) < SEA + BEACH - 0.4) dry++; }
ok('30 m past the bay coast is under water; 30 m before it is dry beach', wet === 0 && dry === 0, `${wet} / ${dry}`);
ok('the fjord is deep out front, and the far shore rises out of it', H(3200, 0) < SEA - 20 && c.macro(START_X + 9000, 0) > SEA + 300);
ok('the headland point is above the sea, the sea cliff below it is not', H(L.LIGHTHOUSE.u, L.HEADLAND.crest(L.LIGHTHOUSE.u)) > SEA + 15 && H(L.HEADLAND.tip + 60, L.HEADLAND.crest(L.HEADLAND.tip)) < SEA);
for (const s of L.HEADLAND.steps) {
  const v = L.HEADLAND.crest(s.uc);
  let drop = 0;
  for (let u = s.uc - 10; u < s.uc + 10; u += 0.5) drop = Math.max(drop, H(u, v) - H(u + 3, v));
  ok(`${s.name}: a cliff step on the crest (${drop.toFixed(1)} m in 3 m)`, drop > s.h * 0.45);
}
for (const B of L.BANDS.slice(0, 3)) {
  const v = B.peak ? B.peak[0] : (B.v0 + B.v1) / 2 + 20;
  let drop = 0;
  for (let u = B.uc - 12; u < B.uc + 12; u += 0.5) drop = Math.max(drop, H(u, v) - H(u + 3, v));
  ok(`${B.name}: a cliff band (${drop.toFixed(1)} m in 3 m)`, drop > B.h * 0.5);
}
ok('every height is finite (tile grid sample)', (() => { for (let x = -1530; x < 1530; x += 37) for (let z = -1530; z < 1530; z += 41) if (!Number.isFinite(c.height(x, z))) return false; return true; })());

// ------------------------------------------------------------------ roofs, decks, walls
for (const s of c.structures) {
  const y = s.surface(s.x, s.z), g = c.natural(s.x, s.z);
  ok(`roof ${s.id} (${s.name}) rideable above its ground`, y !== null && y > Math.max(g, s.stilts ? SEA + s.stilts : -1e9) + 2, `${(y - g).toFixed(1)} m`);
}
for (const d of c.decks) {
  const x = (d.x0 + d.x1) / 2, z = (d.z0 + d.z1) / 2;
  ok(`deck ${d.name} rideable just above the sea`, d.surface(x, z) > SEA + 1 && d.surface(x, z) < SEA + 3 && c.featureAt(x, z) !== null);
}
{
  const s = c.structures.find((k) => k.id === 'hus4');
  const g = c.natural(s.x - s.ax * (s.hl + 3), s.z - s.az * (s.hl + 3)) + 1;
  const b = c.blockAt(s.x - s.ax * (s.hl - 0.3), g, s.z - s.az * (s.hl - 0.3), s.x - s.ax * (s.hl + 1), g, s.z - s.az * (s.hl + 1));
  ok('a wall blocks a rider from the side', !!b && b.kind === 'wall');
  ok('a roof landing from above is not blocked', c.blockAt(s.x, s.top - 0.2, s.z, s.x, s.top + 3, s.z) === null);
}
ok('the jump-line roofs are named for the line goal', ['Kjøpmannshuset', 'Bakeriet', 'Postkontoret', 'Naustgapet'].every((nm) => c.structures.some((s) => s.name === nm && c.featureAt(s.x, s.z) === nm)));

// ------------------------------------------------------------------ the rider: water, runCompleted
// A tiny analytic terrain around the course's own height function (no grid needed for these).
const T = {
  half: 1536, spacing: 1.5, course: c,
  features: { heightAt: (x, z) => c.heightAt(x, z), blockAt: (...a) => c.blockAt(...a) },
  baseHeight: (x, z) => c.height(x, z),
  getHeight(x, z) { const b = c.height(x, z), f = c.heightAt(x, z); return f !== null && f > b ? f : b; },
  getNormal(x, z, r = 0, out = new THREE.Vector3()) { const e = Math.max(r, 1.5); return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize(); },
  getSurface: (x, z, out = new THREE.Vector4()) => out.set(0.3, 0.7, 0, 0),
  isInside: (x, z, m = 0) => Math.abs(x) < 1536 - m && Math.abs(z) < 1536 - m,
  getSpawn() { const s = c.spawnPoint(); return { position: new THREE.Vector3(s.x, c.height(s.x, s.z), s.z), heading: s.heading }; },
};
{
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment('ski'); p.fadeThen = (fn) => fn(); p.startRiding();
  const got = [];
  const off = on('runCompleted', (e) => got.push(e));
  emit('rideStarted');
  // Off the end of the pier at speed → splash → back on dry land.
  const P = L.HARBOUR.pier;
  p.place(new THREE.Vector3(START_X + P.u1 - 12, 0, (P.v0 + P.v1) / 2), -Math.PI / 2);
  p.velocity.set(12, 0, 0); p.speed = 12;
  let splashed = false;
  const offS = on('fjordSplash', () => { splashed = true; });
  for (let i = 0; i < 300 && !splashed; i++) { p.script = (k) => { k.tuck = 1; }; p.step(1 / 60); }
  for (let i = 0; i < 5; i++) p.step(1 / 60);
  ok('riding off the pier splashes into the fjord', splashed);
  ok('…and puts the rider back on dry land', c.height(p.position.x, p.position.z) > SEA + BEACH - 0.1 && p.state !== State.CRASH, `${(c.height(p.position.x, p.position.z) - SEA).toFixed(1)} m above the sea`);
  emit('runComplete');
  emit('runComplete');
  ok('runCompleted once per run, with the contract fields', got.length === 1 && got[0].mapId === 'fjordline' && typeof got[0].trailId === 'string' && ['distance', 'time', 'score'].every((k) => Number.isFinite(got[0][k])), JSON.stringify(got[0]));
  emit('rideStarted');
  emit('runFinished', { time: 99, raw: 97.5, score: 1234 });
  ok('a challenge finish reports its time and score', got.length === 2 && got[1].time === 97.5 && got[1].score === 1234);
  off(); offS(); p.flow?.dispose(); p.fjord.dispose();
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
