// Unit checks for map 5 (Dragonback), headless and fast:
//   • the ridge primitive: crest is the high point across, flanks are concave, steps / prows roll over (the
//     take-off points down), gap far walls are short, kickers kick
//   • hop spurs: leave the parent crest tangentially, as high as it, aimed past the target crest
//   • names: every line goal's features exist (course.featureAt returns each one somewhere on the map)
//   • drop zones and golden snowflakes sit on the snow inside the tile; the start is on the Shoulder
//   • gullies: gullyAt is 0 on crests and ~1 in the gully between two big ridges
//   • ridge-hop scoring: a clean landing on a different ridge scores "Ridge hop · A → B", chains score a run
//   • sluff drag slows a rider in a gully floor and not on a crest
//   • Valcrest / other maps: their physics stays the default after Dragonback's tuning is reset
// Usage: node web/scripts/map5-unit.mjs
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const { DragonbackCourse } = await import('../src/maps/dragonback/course.js');
const { Ridge, cliff } = await import('../src/maps/dragonback/ridges.js');
const { START_X, TILE, LINE_GOALS, HOPS } = await import('../src/maps/dragonback/layout.js');
const { PHYSICS, applyMapTuning } = await import('../src/config.js');
const { emit, on, game } = await import('../src/state.js');

let fails = 0, n = 0;
const ok = (name, cond, info = '') => { n++; if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };
const DEG = 180 / Math.PI;
const c = new DragonbackCourse();
const at = (u, v) => c.height(START_X + u, v);

// ------------------------------------------------------------------ the ridge primitive
{
  const r = new Ridge({ id: 't', name: 'Test', top: 3, p: 1.8, rise: 40, end: 'prow', wander: 0, knots: [[0, 0, 30, 40], [400, 0, 30, 40]], steps: [[200, 6]], gaps: [[300, 15, 6, 5]] });
  const prof = [-30, -20, -10, -3, 0, 3, 10, 20, 30].map((v) => r.at(100, v));
  ok('crest is the highest point across', prof.indexOf(Math.max(...prof)) === 4, prof.map((x) => x.toFixed(1)).join(' '));
  // Concave flank: the slope eases toward the foot (steeper near the crest).
  const s1 = (r.at(100, 6) - r.at(100, 10)) / 4, s2 = (r.at(100, 26) - r.at(100, 30)) / 4;
  ok('flanks are concave (steep under the crest, easing into the gully)', s1 > 1.5 * s2, `${(Math.atan(s1) * DEG).toFixed(0)}° → ${(Math.atan(s2) * DEG).toFixed(0)}°`);
  ok('a step drops its height at the lip', r.heightAt(198) - r.heightAt(204) > 5, `${r.heightAt(198).toFixed(1)} → ${r.heightAt(204).toFixed(1)}`);
  // Lip roll-over: over the last metres the crest rises < 10° relative to the face (the bench flattens the
  // approach, the roll-over keeps the lip from kicking), so the take-off points down the landing.
  const rise = (r.heightAt(199) - r.heightAt(194)) / 5;
  ok('a step\'s lip does not kick (< 10° above the face at the lip)', rise < Math.tan(10 / DEG), `${(Math.atan(rise) * DEG).toFixed(1)}°`);
  ok('a gap notches the crest, the far side is lower than the take-off', r.heightAt(306) < r.heightAt(298) - 12 && r.heightAt(345) < r.heightAt(296) - 3, `${r.heightAt(296).toFixed(1)} / ${r.heightAt(306).toFixed(1)} / ${r.heightAt(345).toFixed(1)}`);
  ok('the gap\'s far wall is short (≤ 1.4·N + floor)', r.heightAt(300 + 2.7 + 6 + 21.5) > r.heightAt(345) - 1, `${r.heightAt(330).toFixed(1)}`);
  ok('the prow ends the ridge in a cliff', r.heightAt(399) > 20 && r.heightAt(406) === 0, `${r.heightAt(399).toFixed(1)} → ${r.heightAt(406).toFixed(1)}`);
  ok('the ridge grows out of the slope at its top', r.heightAt(0) < 1 && r.heightAt(60) > 25);
  ok('cliff(): bench raise above the lip, nothing past the face', cliff(-10, 0, 10, 40) > 5 && cliff(5, 0, 10, 40) === 0);
}

// ------------------------------------------------------------------ hop spurs
for (const h of c.hops) {
  const sp = h.spur, from = h.fromRidge, to = h.toRidge;
  const dv0 = Math.abs(sp.crestAt(sp.u0) - from.crestAt(sp.u0));
  const head0 = (sp.crestAt(sp.u0 + 4) - sp.crestAt(sp.u0)) / 4, headP = (from.crestAt(sp.u0 + 4) - from.crestAt(sp.u0)) / 4;
  const dH = Math.abs(sp.heightAt(sp.u0 + 2) - from.heightAt(sp.u0 + 2));
  const aimV = sp.crestAt(sp.u1) + (sp.crestAt(sp.u1) - sp.crestAt(sp.u1 - 10)) / 10 * (h.land - sp.u1);
  const past = (aimV - to.crestAt(h.land)) * Math.sign(to.crestAt(h.land) - from.crestAt(sp.u0));
  ok(`${h.name}: spur leaves ${from.name}'s crest tangentially, as high as it, aimed at ${to.name}`,
    dv0 < 0.5 && Math.abs(Math.atan(head0) - Math.atan(headP)) < 0.12 && dH < 0.15 * from.heightAt(sp.u0 + 2) && past > -12 && past < 45,
    `root offset ${dv0.toFixed(1)} m, heading Δ ${((Math.atan(head0) - Math.atan(headP)) * DEG).toFixed(1)}°, aim ${past.toFixed(0)} m past the crest`);
  ok(`${h.name}: the kicker is above the target's crest (a flight comes down onto it)`, sp.heightAt(sp.u1 - 1) + sp.kick > to.heightAt(h.land) - 2,
    `kicker ${(sp.heightAt(sp.u1 - 1) + sp.kick).toFixed(0)} m, target ${to.heightAt(h.land).toFixed(0)} m`);
}
ok('every hop in the layout is built', c.hops.length === HOPS.length);

// ------------------------------------------------------------------ names behind the line goals
{
  const names = new Set();
  for (let u = 0; u < 2300; u += 3) for (let v = -500; v <= 500; v += 3) { const f = c.featureAt(START_X + u, v); if (f) names.add(f); }
  for (const [goal, , ...feats] of LINE_GOALS) {
    const missing = feats.filter((f) => !names.has(f));
    ok(`line goal "${goal}": every feature exists on the map`, missing.length === 0, missing.join(', '));
  }
}

// ------------------------------------------------------------------ drop zones, flakes, start
{
  const inTile = (x, z) => Math.abs(x) < TILE.size / 2 - 50 && Math.abs(z) < TILE.size / 2 - 50;
  ok('nine drop zones (keys 1–9), all in the tile, none on a steep rock face', c.dropZones.length === 9 && c.dropZones.every((d) => inTile(d.x, d.z) && slope(d.x, d.z) < 43),
    c.dropZones.map((d) => `${d.name} ${slope(d.x, d.z).toFixed(0)}°`).join(', '));
  const fl = c.challenge.flakes;
  ok('12 golden snowflakes, in the tile, 1–35 m above the snow (gap flakes float over the notch)', fl.length === 12 && fl.every((f) => inTile(f.x, f.z) && f.y >= 1 && f.y <= 35), fl.map((f) => f.y.toFixed(1)).join(' '));
  const s = c.spawnPoint();
  ok('the start is on the Shoulder (gentle, not on a ridge)', slope(s.x, s.z) < 20 && c.ridgesAt(s.x - START_X, s.z) < 0.5, `${slope(s.x, s.z).toFixed(0)}°`);
  ok('challenge gates are placed along the hero path', c.challenge.gates.length >= 10 && c.challenge.gates.every((g, i, a) => i === 0 || g.at > a[i - 1].at));
}
function slope(x, z) { const e = 2, a = c.height(x + e, z) - c.height(x - e, z), b = c.height(x, z + e) - c.height(x, z - e); return Math.atan(Math.hypot(a, b) / (2 * e)) * DEG; }

// ------------------------------------------------------------------ gullies
{
  const spine = c.ridgeById.spine, blade = c.ridgeById.blade;
  const u = 400, mid = (spine.crestAt(u) + blade.crestAt(u)) / 2;
  ok('gullyAt: 0 on a crest, ~1 in the gully between two big ridges', c.gullyAt(START_X + u, spine.crestAt(u)) === 0 && c.gullyAt(START_X + u, mid) > 0.7, `${c.gullyAt(START_X + u, mid).toFixed(2)}`);
  ok('gully floors fall at the face angle or steeper (never a flat trap)', at(u - 20, mid) - at(u + 20, mid) > 40 * Math.tan(36 / DEG), `${(Math.atan((at(u - 20, mid) - at(u + 20, mid)) / 40) * DEG).toFixed(0)}°`);
}

// ------------------------------------------------------------------ ridge-hop scoring + sluff (a real Player on a tiny stand-in terrain)
{
  const THREE = await import('three');
  const { Player } = await import('../src/player.js');
  const T = {
    course: c, half: 1500, spacing: 1.5, features: { heightAt: () => null, blockAt: () => null },
    getHeight: (x, z) => c.height(x, z), baseHeight: (x, z) => c.height(x, z),
    getNormal(x, z, r = 0, out = new THREE.Vector3()) { const e = Math.max(r, 1.5); return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize(); },
    getSurface: (x, z, out = new THREE.Vector4()) => out.set(0, 1, 0, 0),
    isInside: () => true,
    getSpawn() { const s = c.spawnPoint(); return { position: new THREE.Vector3(s.x, c.height(s.x, s.z), s.z), heading: s.heading }; },
  };
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  ok('Dragonback physics applied (sluff drag, flow layer)', PHYSICS.sluffDrag > 0 && !!p.flow);
  const scores = [];
  const off = on('score', (e) => scores.push(e.label));
  const twinL = c.ridgeById.twinL, twinR = c.ridgeById.twinR;
  p.takeoffPos = new THREE.Vector3(START_X + 300, 0, twinL.crestAt(300));
  p.position.set(START_X + 360, 0, twinR.crestAt(360));
  emit('landingGrade', { grade: 'clean', air: 2.4, drop: 20 });
  ok('a clean landing on another ridge scores a ridge hop', scores.some((l) => l.startsWith('Ridge hop · Left Twin → Right Twin')), scores.join(' | '));
  p.takeoffPos.set(START_X + 560, 0, twinR.crestAt(560));
  p.position.set(START_X + 610, 0, twinL.crestAt(610));
  p.flow.run.time += 2;
  emit('landingGrade', { grade: 'stomped', air: 2.2, drop: 18 });
  ok('two hops in a row chain into a ridge run', scores.some((l) => l === 'Ridge run ×2'), scores.join(' | '));
  const before = scores.length;
  p.takeoffPos.set(START_X + 300, 0, twinL.crestAt(300)); p.position.set(START_X + 330, 0, twinL.crestAt(330));
  emit('landingGrade', { grade: 'clean', air: 1.2, drop: 6 });
  ok('landing back on the same ridge is not a hop', scores.length === before);
  p.takeoffPos.set(START_X + 300, 0, twinL.crestAt(300)); p.position.set(START_X + 360, 0, twinR.crestAt(360));
  emit('landingGrade', { grade: 'sketchy', air: 2.4, drop: 20 });
  ok('a sketchy landing does not score a hop', scores.length === before);
  off();
  // Sluff: same speed, one step in a gully floor vs on a crest.
  const spine = c.ridgeById.spine, blade = c.ridgeById.blade, u = 400, mid = (spine.crestAt(u) + blade.crestAt(u)) / 2;
  const stepAt = (v) => {
    p.place({ x: START_X + u, z: v }, -Math.PI / 2);
    p.velocity.set(25, -20, 0); p.speed = p.velocity.length();
    const s0 = p.speed; p.state = 1;
    p.script = (ctl) => Object.assign(ctl, { steer: 0, tuck: 1, brake: 0, jump: false });
    p.step(1 / 60);
    return p.speed - s0;
  };
  const drag = PHYSICS.sluffDrag;
  const dSluff = stepAt(mid);
  PHYSICS.sluffDrag = 0;
  const dNone = stepAt(mid);
  PHYSICS.sluffDrag = drag;
  const dCrest = stepAt(spine.crestAt(u)), dCrest0 = (PHYSICS.sluffDrag = 0, stepAt(spine.crestAt(u)));
  PHYSICS.sluffDrag = drag;
  ok('sluff drag slows a rider in a gully floor, not on a crest', dSluff < dNone - 0.005 && Math.abs(dCrest - dCrest0) < 0.01,
    `gully Δv ${dSluff.toFixed(3)} (no sluff ${dNone.toFixed(3)}), crest ${dCrest.toFixed(3)} = ${dCrest0.toFixed(3)} m/s per step`);
  p.flow.dispose();
  void game;
}

// ------------------------------------------------------------------ tuning resets for other maps
{
  applyMapTuning({});
  ok('another map gets the default physics (no sluff drag, no flow)', !PHYSICS.sluffDrag && PHYSICS.flow === null);
}

console.log(`\n${n - fails}/${n} passed`);
process.exit(fails ? 1 : 0);
