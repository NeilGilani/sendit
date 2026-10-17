// Voltage Park (map 4) line bot: rides named lines through the park with the real Player physics on the map's
// grid (the features hook, the rails, the map's physics overrides), balancing on every rail, popping the
// gap-on ramps, controlling speed for each jump's sweet spot, throwing tricks; reports every rail locked /
// banked, every landing zone, crashes and the judged score.
// Usage: node web/scripts/map4-bot.mjs [ski|snowboard|both] [line|all] [style: clean|trick|human] [--check]
//   clean = straight airs, 50-50s / slides, perfect balance;  trick = spins / flips, switch-ups, spin outs;
//   human = a rider with a 0.2 s reaction and digital keys on the rails (falls off now and then)
// --check exits 1 if a line's rails aren't all ridden, or it crashes on the clean style.
const L = await import('./map4-lib.mjs');
const { on } = await import('../src/state.js');
const { predictLipSpeed } = await import('../src/maps/voltage/park.js');
const { START_X, JIBS, JUMPS, LANE_JIBS, LANE_JUMPS, GRID_JIBS, HIPS, STEPS, QUARTERPIPES, PIPE, BIG_AIR, FINISH_U } = await import('../src/maps/voltage/layout.js');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const CHECK = process.argv.includes('--check');
const [typeArg = 'both', lineArg = 'all', style = 'clean'] = args;
const { course, T } = await L.loadPark({ quiet: true });

// ------------------------------------------------------------------ lines: features in order
const jib = (name) => ({ kind: 'jib', name });
const jump = (name, trick) => ({ kind: 'jump', name, trick });
const slope = (a, b, c) => [jib(a), jib(b), jib(c), jump('Lightning', 'spin360'), jump('Thunder', 'spin540'), jump('Voltage', 'flip'), jump('Megawatt', 'spin720'), jump('The Gap', 'spin360')];
// A spine transfer: ride up its face from side `from` (−1 = the −v side) at u, air the crest, land on the far face.
const spine = (name, u, from) => ({ kind: 'spine', name, u, from });
export const LINES = {
  slopeA: { zone: 0, feats: slope('Circuit Flat-Down', 'Surge DFD', 'Overload C-Rail') },
  slopeB: { zone: 0, feats: slope('Circuit Box', 'Surge Rainbow', 'Overload Handrail') },
  slopeC: { zone: 0, feats: slope('Circuit Down Rail', 'Surge Tube', 'Overload Gap Box') },
  spark: { start: [40, 70], feats: [jump('Spark 1'), jib('Spark Box'), jump('Spark 2'), jib('Spark Tube'), jib('Spark Down Box'), jump('Spark Double 1'), jump('Spark Double 2', 'spin360'), jib('Spark Butter Box'), jump('Spark 3'), jump('Spark 4'), jump('Spark Side Hit'), { kind: 'qp', name: 'Spark QP' }] },
  // Spark → the Spine → Current → the transfer hip → High Voltage: three lanes in one run.
  transfer: { start: [100, 78], feats: [jib('Spark Ledge'), jib('Spark Down Box'), jump('Spark Double 1'), spine('The Spine', 632, -1), jump('Current Transfer'), jump('The Canal'), { kind: 'stepup', name: 'Step-Up' }, { kind: 'qp', name: 'Voltage QP' }] },
  current: { start: [50, 125], feats: [jump('Current 1'), jib('Current Flat-Down'), jib('Current Kink'), jib('Current Tube'), jump('Stack 1', 'spin360'), jump('Stack 2'), jump('Stack 3', 'spin360'), jump('Step-Down'), jump('Current Side Hit'), jump('Current 3')] },
  currentBox: { start: [110, 128], feats: [jib('Current Box'), jib('Current Tube'), jump('Stack 1'), jump('Stack 2'), jump('Stack 3'), jump('Step-Down'), jump('Current 3')] },
  high: { start: [60, 186], feats: [jib('High DFD'), jib('High Rainbow'), jib('High Down Rail'), jib('High Kink'), jump('High Voltage 1', 'spin360'), jump('High Voltage 2', 'flip'), jump('High Side Hit'), jump('The Canal'), { kind: 'stepup', name: 'Step-Up' }, { kind: 'qp', name: 'Voltage QP' }] },
  stair: { zone: 8, feats: [jump('Stair Drop 1'), { kind: 'stepup', name: 'Stair Up' }, jump('Stair Drop 2'), jump('Stairway Hip')] },
  stairSpine: { zone: 8, feats: [jump('Stair Drop 1'), { kind: 'stepup', name: 'Stair Up' }, jump('Stair Drop 2'), spine('Stairway Spine', 862, 1), { kind: 'stepup', name: 'Step-Up' }] },
  // The Grid: every other row (the rows are 30–33 m apart: a rail, then room to line up the next one); together
  // the five lines ride all sixteen jibs.
  gridL: { start: [44, 236], out: 285, feats: ['Grid Box A', 'Grid A-Frame', 'Grid Rainbow Box', 'Grid Finale DFD'].map(jib) },
  gridL2: { start: [70, 241], out: 285, feats: ['Grid Flat Box', 'Grid Kink', 'Grid Battleship'].map(jib) },
  gridM: { start: [44, 246], out: 285, feats: ['Grid Rail A', 'Grid Long Rail', 'Grid Down Box'].map(jib) },
  gridM2: { start: [70, 252], out: 285, feats: ['Grid Down Rail', 'Grid S-Rail', 'Grid Cannon'].map(jib) },
  gridR: { start: [44, 257], out: 285, feats: ['Grid Tube A', 'Grid Wide Tube', 'Grid Ledge'].map(jib) },
  hips: { start: [470, -232], feats: [jump('Hip Left'), jump('Hip Right'), jump('Hip Three'), jump('Hip Four')] },
  mega: { zone: 3, feats: [jump('Megawatt', 'flip'), jump('The Gap')] },
  bigair: { zone: 4, feats: [jump('The Tower', 'spin720')] },
  pipe: { zone: 5, feats: [{ kind: 'pipe', name: 'The Conduit' }] },
};

// Approach points (u, v) for a feature: where to aim, in order.
function waypoints(f) {
  if (f.kind === 'jib') {
    const r = course.rails.find((q) => q.name === f.name);
    if (!r) throw new Error(`no rail ${f.name}`);
    const p0 = r.pts[0], p1 = r.pts[1], pe = r.pts[r.pts.length - 1];
    const dx = p1[0] - p0[0], dz = p1[2] - p0[2], l = Math.hypot(dx, dz);
    const fx = dx / l, fz = dz / l;
    return [[p0[0] - fx * 28, p0[2] - fz * 28, 'line'], [p0[0] - fx * 14, p0[2] - fz * 14, 'line'], [p0[0] - fx * 8, p0[2] - fz * 8, 'line'], [p0[0] - fx * 3, p0[2] - fz * 3, 'entry', r], ...r.pts.slice(1).map((p) => [p[0], p[2], 'rail', r]), [pe[0] + fx * 6, pe[2] + fz * 6, 'exit']];
  }
  if (f.kind === 'pipe') return [];
  if (f.kind === 'spine') {
    const S = course.features.find((q) => q.name === f.name && q.kind === 'spine');
    const a = START_X + f.u - S.x, s0 = f.from;
    const w = (da, b, tag = 'line') => { const [x, z] = S.world(a + da, b); return [x, z, tag]; };
    return [w(-40, s0 * 12), w(-16, s0 * 6), w(0, s0 * 2.5, 'spine'), w(14, -s0 * 5), w(32, -s0 * 10)];
  }
  const F = course.features.find((q) => q.name === f.name && (q.jump || q.kind === 'qp'));
  if (!F) throw new Error(`no feature ${f.name}`);
  if (f.kind === 'qp') { const [x, z] = F.world(F.marks.foot.a - 12); const [x2, z2] = F.world(F.marks.coping.a); return [[x, z, 'line'], [x2, z2, 'qp', F]]; }
  const lipA = F.jump.lipA, end = F.marks.landingEnd?.a ?? lipA + 30;
  const pts = [];
  for (const a of [lipA - 38, lipA - 20, lipA - 6]) { const [x, z] = F.world(a); pts.push([x, z, 'inrun', F]); }
  const [lx, lz] = F.world(lipA); pts.push([lx, lz, 'lip', F]);
  const [ex, ez] = F.world(end + 4); pts.push([ex, ez, 'land']);
  return pts;
}

function ride(type, key, sty) {
  const line = LINES[key];
  const p = L.makePlayer(T, type, 'park');
  if (line.zone !== undefined) { const z = course.dropZones[line.zone]; p.place({ x: z.x, z: z.z }, z.heading); }
  else p.place({ x: START_X + line.start[0], z: line.start[1] }, -Math.PI / 2);
  if (line.zone === 0) p.velocity.set(0, 0, 0);
  const way = [];
  for (const f of line.feats) for (const w of waypoints(f)) {
    // (rows close together: an approach point uphill of where the last feature left you is skipped)
    const prev = way[way.length - 1];
    if (prev && (w[2] === 'line' || w[2] === 'inrun') && w[0] < prev[0] + 3) continue;
    // (nor one that would need a traverse steeper than ~24° across the hill: the next point lines you up anyway)
    if (prev && prev.f !== f && (w[2] === 'line' || w[2] === 'inrun') && Math.abs(w[1] - prev[1]) > 0.45 * (w[0] - prev[0])) continue;
    way.push({ ...w, f });
  }
  const last = way[way.length - 1] || [p.position.x + 40, p.position.z];
  // Ride out past the finish — around the quarterpipes at the bottom of the lanes, not into them (a QP across
  // the lane is a dead end: you'd ride up it and back for ever).
  let vOut = last[1];
  for (const w of course.walls) {
    const [, qz] = w.f.world(w.f.marks.coping.a);
    if (Math.abs(vOut - qz) < w.hw + 5) vOut = qz + (vOut >= qz ? 1 : -1) * (w.hw + 7);
  }
  if (line.out !== undefined) { way.push([last[0] + 30, line.out, 'line']); vOut = line.out; }   // (a clear corridor down to the finish)
  const qpLine = line.feats.some((f) => f.kind === 'qp');
  if (Math.abs(vOut - last[1]) > 1 && !qpLine) way.push([Math.max(last[0] + 30, START_X + 1050), vOut, 'line']);
  if (qpLine) { const lw = way[way.length - 1]; way.push([lw[0] - 6, vOut, 'line']); }
  way.push([Math.max(last[0] + 40, START_X + FINISH_U + 20), vOut, 'finish']);
  // Dense path through the waypoints (pure pursuit): [x, z, waypoint index].
  const path = [];
  let px0 = p.position.x, pz0 = p.position.z;
  way.forEach((w, i) => { const n = Math.max(1, Math.ceil(Math.hypot(w[0] - px0, w[1] - pz0) / 0.5)); for (let k = 1; k <= n; k++) path.push([px0 + (w[0] - px0) * k / n, pz0 + (w[1] - pz0) * k / n, i]); px0 = w[0]; pz0 = w[1]; });
  let pi = 0, dbgT = [0, 0, 0];
  let wi = 0, t = 0, crashes = 0, stumbles = 0;
  const ev = { locks: new Set(), banks: [], lost: 0, bails: 0, clips: 0, zones: [], tricks: [], airs: 0, pipe: [], speeds: {}, airT: {}, spines: new Set() };
  const offs = [
    on('grindStart', (e) => ev.locks.add(e.name)), on('grindScore', (e) => ev.banks.push(`${e.label} +${e.points}`)), on('grindLost', () => ev.lost++),
    on('grindEnd', (e) => { if (e.reason === 'bail') ev.bails++; }), on('grindClip', () => ev.clips++),
    on('parkLanding', (e) => ev.zones.push(`${e.jump}:${e.zone}`)), on('crashed', (k) => { crashes++; ev.tricks.push(`CRASH(${k}${p.lastCrash ? ':' + p.lastCrash.reason : ''})@u${Math.round(p.position.x - START_X)},${Math.round(p.position.z)}`); }),
    on('stumble', () => stumbles++), on('pipeAir', (e) => ev.pipe.push(e.height.toFixed(1))),
    on('landed', (e) => { if (e.air > 0.6) ev.airs++; if (e.trick) ev.tricks.push(e.trick); const nm = p.takeoffPos && course.featureAt(p.takeoffPos.x, p.takeoffPos.z); if (nm && e.air > 0.6) ev.airT[nm] = +e.air.toFixed(2); }),
    on('takeoff', () => { const nm = course.featureAt(p.position.x, p.position.z); if (nm) ev.speeds[nm] = +p.speed.toFixed(1); }),
    on('landed', (e) => { const nm = p.takeoffPos && course.featureAt(p.takeoffPos.x, p.takeoffPos.z); if (nm && e.air > 0.3 && course.named.some((n) => n.name === nm && n.kind === 'spine')) { const [, b0] = course.named.find((n) => n.name === nm).f.local(p.takeoffPos.x, p.takeoffPos.z), [, b1] = course.named.find((n) => n.name === nm).f.local(p.position.x, p.position.z); if (process.env.SPN) console.log('   spine', nm, 'b0', b0.toFixed(2), 'b1', b1.toFixed(2), 'air', e.air.toFixed(2), e.result, 'v', p.speed.toFixed(1)); const from = line.feats.find((q) => q.kind === 'spine' && q.name === nm)?.from; if (from && Math.abs(b0) < 1.5 && b1 * from < -1.5 && e.clean) ev.spines.add(nm); } }),
  ];
  const hist = [];
  let key0 = 0, pipeSide = 1, pipeT = 0, airTrick = null, lastState = 1, stillT = 0, landT = -9;
  p.script = (c, pl) => {
    Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
    c._type = type; c._t = t;
    const g = pl.grind.g;
    // --- on a rail: balance, pop at the end (trick: a switch-up mid rail, spin out)
    if (g) {
      hist.push([g.b, g.bv]);
      if (sty === 'human') {
        const d = hist[Math.max(0, hist.length - 13)];
        const pred = d[0] + d[1] * 0.2;
        if (Math.abs(pred) > 0.22) key0 = -Math.sign(pred); else if (Math.abs(pred) < 0.1) key0 = 0;
        c.steer = key0;
      } else c.steer = Math.max(-1, Math.min(1, -(2.2 * g.b + 0.7 * g.bv)));
      const toEnd = g.toEnd ?? 99;
      if (sty === 'trick' && g.t > 0.35 && g.t < 0.45 && g.switchUps === 0 && toEnd > g.v * 0.8) c.jump = true;   // tap → hop
      if (sty === 'trick' && g.hop && g.hop.t < 0.15) c.steer = 1;                                              // turn 90° in the hop
      // (the next rail close below — the Grid's rows: ride off the end instead, there's no room for an air)
      const nr = way.slice(wi + 1).find((q) => q[2] === 'entry' && q[3] !== g.rail);
      const close = nr && Math.hypot(nr[0] - pl.position.x, nr[1] - pl.position.z) < 34;
      if (!close && toEnd < g.v * 0.5 && toEnd > g.v * 0.1 && !g.hop) {
        c.jump = true;                                                     // load the pop off the end …
        if (sty === 'trick') c.steer = g.slide ? 0 : 1;                    // … with a wind-up (a 360 out)
      }
      return;
    }
    hist.length = 0;
    // --- the pipe: carve wall to wall
    if (key === 'pipe') {
      pipeT += 1 / 60;
      const pp = course.pipe, [a, b] = pp.local(pl.position.x, pl.position.z);
      if (pl.state === 1) {
        if (Math.abs(b) < 1.2 || (pipeSide * b > 0 && pl.velocity.y < 0)) pipeSide = b > 0 ? -1 : b < 0 ? 1 : pipeSide;
        const [tx, tz] = pp.world(a + 4.5, pipeSide * (pp.F + pp.wallRun));
        steerTo(c, pl, tx, tz, 2.5);
        c.tuck = 1;
      }
      if (a > pp.length - pp.exit - 45) { const [tx, tz] = pp.world(a + 30, 0); steerTo(c, pl, tx, tz, 2); c.tuck = 0; c.brake = pl.speed > 18 ? 0.3 : 0; }   // ride out down the middle
      return;
    }
    // --- follow the waypoints
    let bd = 1e9;
    for (let k = pi; k < Math.min(path.length, pi + 80); k++) { const d = Math.hypot(path[k][0] - pl.position.x, path[k][1] - pl.position.z); if (d < bd) { bd = d; pi = k; } }
    wi = path[pi]?.[2] ?? way.length - 1;
    const tgt = path[Math.min(path.length - 1, pi + Math.round(Math.max(5, pl.speed * 0.7) / 0.5))] || way[way.length - 1];
    if (pl.state === 1) {
      // Stanley controller: the path's heading plus a correction for the cross-track error.
      const a = path[Math.max(0, pi - 2)], b = path[Math.min(path.length - 1, pi + 4)];
      const tx = b[0] - a[0], tz = b[1] - a[1], tl = Math.hypot(tx, tz) || 1;
      const e = ((pl.position.x - a[0]) * tz - (pl.position.z - a[1]) * tx) / tl;   // + = left of the path
      const pathYaw = Math.atan2(-tx, -tz);
      const want = pathYaw - Math.atan2(2.2 * e, pl.speed + 1.5);
      const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
      const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
      c.steer = Math.max(-1, Math.min(1, -d * 3.2));
      // Just landed: absorb it before carving (full lock at 70 km/h on touchdown swings the gear 90°).
      if (t - landT < 0.5) c.steer = Math.max(-0.35, Math.min(0.35, c.steer));
    }
    dbgT = [tgt[0], tgt[1], c.steer];
    // Speed: jumps → aim for the sweet spot; rails → 7–10 m/s; else tuck.
    const nextJump = way.slice(wi).find((q) => q[2] === 'lip');
    const nextRail = way.slice(wi).find((q) => q[2] === 'entry');
    const dRail = nextRail ? Math.hypot(nextRail[0] - pl.position.x, nextRail[1] - pl.position.z) : 1e9;
    const dJump = nextJump ? Math.hypot(nextJump[0] - pl.position.x, nextJump[1] - pl.position.z) : 1e9;
    const nextSpine = way.slice(wi).find((q) => q[2] === 'spine');
    const dSpine = nextSpine ? Math.hypot(nextSpine[0] - pl.position.x, nextSpine[1] - pl.position.z) : 1e9;
    if (pl.state === 1) {
      const nextQp = way.slice(wi).find((q) => q[2] === 'qp');
      const dQp = nextQp ? Math.hypot(nextQp[0] - pl.position.x, nextQp[1] - pl.position.z) : 1e9;
      if (dSpine < dJump && dSpine < dRail && dSpine < 60) c.tuck = pl.speed < 14 ? 1 : 0;   // carry speed across a spine
      else if (dQp < 90 && dQp < dJump && dQp < dRail) {   // a quarterpipe: ~12–14 m/s by its height (faster and you fly out of it)
        const want = nextQp[3].name === 'Spark QP' ? 12 : 12;
        if (pl.speed > want + 2 && dQp > 12) check(c, pl.speed - want); else if (pl.speed < want - 1) c.tuck = 1; else c.brake = UP;
      }
      else if (dJump < dRail && nextJump && dJump < 160) {
        const F = nextJump[3], Ld = F.jump.land || { vMin: 10, vMax: 14 }, want = Ld.sweet?.v ?? (Ld.vMin + Ld.vMax) / 2;
        // Tucked if that still arrives at or under the sweet spot speed; else stand up; scrub if even that is too fast.
        const tk = pl.tuck; pl.tuck = 1; const vT = predictLipSpeed(pl, F); pl.tuck = 0; const vU = predictLipSpeed(pl, F); pl.tuck = tk;
        // (standing up means feathering the edges: hands off, the game tucks you after 2.5 s — physics/edge.js auto-tuck)
        if (vT <= want + 0.3) c.tuck = 1;
        else if (vU <= want + 0.6) c.brake = UP;
        else if (dJump > 16 && pl.speed > Math.max(8, want - 2)) check(c, vU - want);   // (never brake to a standstill)
        else c.brake = UP;
      } else if (dRail < 75) {
        const r = nextRail[3], hard = r.lane === 'grid' ? 9 : r.shape === 'rainbow' ? 12 : 11;   // (about what you carry standing up on the 13° benches; the Grid's rows: slower)
        // Speed check well before the rail, never on the last 14 m of the approach (it would turn the gear).
        // (a board checks speed by skidding sideways: it needs longer to line up again afterwards)
        if (pl.speed > hard + 0.6 && dRail > (type === 'ski' ? 14 : 24)) check(c, pl.speed - hard);
        else if (pl.speed < hard - 1.5) c.tuck = 1;
        else if (dRail > 20) c.brake = UP;   // (feathering the edges turns the gear: not on the last 20 m)
      } else if (pl.speed > 23) check(c, pl.speed - 21);
      else c.tuck = pl.speed < 17 ? 1 : 0;
      // Pop at lips (kickers, gap-on ramps).
      // Pop at kicker lips (not at the gap-on ramps of rails: roll those, you come down onto the rail).
      const a = pl.lipAhead(0.3);
      const railAhead = course.rails.some((r) => { const q = r.pts[0], dx = q[0] - pl.position.x, dz = q[2] - pl.position.z; return Math.hypot(dx, dz) < 9 && dx * pl.velocity.x + dz * pl.velocity.z > 0; });
      if (a !== null && a > 0.04 && !railAhead) c.jump = true;
      // Spine: pop on the crest, crossing it.
      for (const n of course.named) {
        if (n.kind !== 'spine') continue;
        const [sa, sb] = n.f.local(pl.position.x, pl.position.z);
        if (sa > 0 && sa < n.f.length && Math.abs(sb) < 1.3 && sb * pl.velocity.z < 0) c.jump = true;
      }
      // Trick set-up on the in-run (the wind-up / flip preload while loading).
      const fj = nextJump?.f;
      // The jump whose lip is right here (the waypoint may already point past it).
      let here = null, dHere = 1e9;
      for (const q of way) if (q[2] === 'lip') { const d = Math.hypot(q[0] - pl.position.x, q[1] - pl.position.z); if (d < dHere) { dHere = d; here = q.f; } }
      const trick = sty === 'clean' || dHere > 14 ? null : here?.trick;
      if (c.jump && trick) {
        if (/^spin/.test(trick)) c.steer = -1;            // wind up (the spin goes the other way of the load: a frontside spin here)
        if (trick === 'flip') c.brake = 1;                // preload a backflip off the tail
      }
      if (trick) airTrick = trick;
      if (c.jump && !trick) c.steer = 0;   // a straight air: no wind-up at the lip (steering while loading the pop spins you)
    }
    // Stopped across the slope (an over-done speed check on a board): let go of the stick so the gear settles
    // back down the fall line, then push off.
    stillT = pl.state === 1 && pl.speed < 1.5 ? stillT + 1 / 60 : 0;
    if (stillT > 0.8) { c.steer = 0; c.brake = 0; c.up = 1; if (stillT > 3) stillT = 0; }
    if (pl.state === 2 && airTrick) {
      // Spins: keep the stick in until what's turned + what the open-arms spin still turns reaches the target,
      // then let go and spot. Flips: S through the throw window, then let go (the rider spots the landing).
      const tl = pl.dyn.timeToLand();
      const target = { spin360: 2, spin540: 3, spin720: 4 }[airTrick];
      if (target && Math.abs(pl._spinTotal) + Math.abs(pl.spinRate) * 0.15 + Math.abs(pl.dyn.spinH || 0) * pl.dyn.C.spinOpen * Math.max(0, tl - 0.15) < Math.PI * target) c.steer = -1;
      if (airTrick === 'flip' && pl.airTime < 0.45) c.brake = 1;
      if (pl.airTime > 0.25 && tl > 0.6 && !target) c.tuck = 1;   // grab (not while spinning: the stick spins)
    }
    if (pl.state === 1 && lastState === 2) { airTrick = null; landT = t; }   // landed: the trick is done
    lastState = pl.state;
  };
  const DT = 1 / 60;
  const dbgR = process.env.DBG ? course.rails.find((q) => q.name === process.env.DBG) : null;
  while (t < 200) {
    p.step(DT); t += DT;
    if (process.env.TR && Math.round(t * 60) % 60 === 0) console.log(`   tr t ${t.toFixed(0)} u${(p.position.x - START_X).toFixed(0)} v${p.position.z.toFixed(1)} st ${p.state} sp ${p.speed.toFixed(1)} hd ${p.heading.toFixed(2)} steer ${p._ctrl.steer.toFixed(2)} brake ${p._ctrl.brake} wi ${wi}`);
    if (dbgR) {
      const a0 = dbgR.pts[0], a1 = dbgR.pts[dbgR.pts.length - 1];
      const dx = a1[0] - a0[0], dz = a1[2] - a0[2], L2 = dx * dx + dz * dz;
      const k = ((p.position.x - a0[0]) * dx + (p.position.z - a0[2]) * dz) / L2;
      if (k > -0.3 && k < 1.1) {
        let y = a0[1]; for (let i = 0; i < dbgR.pts.length - 1; i++) { const q = dbgR.pts[i], r2 = dbgR.pts[i + 1]; const kk = ((p.position.x - q[0]) * (r2[0] - q[0]) + (p.position.z - q[2]) * (r2[2] - q[2])) / ((r2[0] - q[0]) ** 2 + (r2[2] - q[2]) ** 2); if (kk >= 0 && kk <= 1) y = q[1] + (r2[1] - q[1]) * kk; }
        const lat = ((p.position.x - a0[0]) * dz - (p.position.z - a0[2]) * dx) / Math.sqrt(L2);
        console.log(`   dbg tgt ${(dbgT[0] - a0[0]).toFixed(1)},${(dbgT[1] - a0[2]).toFixed(2)} steer ${dbgT[2]?.toFixed(2)} hd ${(p.heading).toFixed(2)} k ${k.toFixed(2)} lat ${lat.toFixed(2)} dy ${(p.position.y - y).toFixed(2)} st ${p.state} v ${p.speed.toFixed(1)} vy ${p.velocity.y.toFixed(1)}`);
      }
    }
    if (key === 'pipe' && (pipeT > 40 || p.position.x - START_X > PIPE.u1 + 30)) break;
    if (p.position.x - START_X > FINISH_U + 15) break;
  }
  if (t >= 200 && key !== 'pipe') ev.tricks.push(`TIMEOUT state ${p.state} v ${p.speed.toFixed(2)} at u${Math.round(p.position.x - START_X)},${Math.round(p.position.z)} heading ${p.heading.toFixed(2)} brake ${p._ctrl.brake} tuck ${p._ctrl.tuck}`);
  for (const o of offs) o();
  p.grind.dispose();
  const rails = line.feats.filter((f) => f.kind === 'jib').map((f) => f.name);
  const missed = rails.filter((n) => !ev.locks.has(n));
  for (const n of line.feats.filter((f) => f.kind === 'jump' || f.kind === 'stepup').map((f) => f.name)) if (!ev.zones.some((z) => z.startsWith(n + ':'))) missed.push(n);
  for (const n of line.feats.filter((f) => f.kind === 'spine').map((f) => f.name)) if (!ev.spines.has(n)) missed.push(n);
  const j = course.judgeRun.judge();
  if (process.env.V) console.log('     judge:', j.sections.map((q) => `${q.name} ${q.score.toFixed(1)}`).join(', '), `variety ${j.variety.toFixed(1)} amplitude ${j.amplitude.toFixed(1)} flow ${j.flow.toFixed(1)} crashes ${j.crashes} avg ${j.avg.toFixed(1)}`);
  return { type, key, sty, t: +t.toFixed(1), crashes, stumbles, missed, ev, judged: j.total, u: Math.round(p.position.x - START_X) };
}

/**
 * A speed check like a rider's: a plough (skis) or short skid (board) for a little too fast, hard hockey-stop /
 * slide pulses for much too fast (each pulse a quarter second, so the gear comes back in line between them).
 */
const UP = 0.12;   // riding upright: a touch on the edges (no auto-tuck)
function check(c, over) {
  const pulse = Math.floor((c._t || 0) * 4) % 2 === 0;   // simulated time: deterministic
  const type = c._type;
  if (type === 'ski') { c.brake = over > 2 ? (pulse ? 0.8 : 0) : 0.28; return; }
  // A board checks speed with a short skid: 0.15 s in every 0.6 s, so it never ends up stopped across the hill.
  c.brake = Math.floor((c._t || 0) / 0.15) % 4 === 0 ? 0.7 : 0;
}

function steerTo(c, pl, x, z, k) {
  const travel = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
  const want = Math.atan2(-(x - pl.position.x), -(z - pl.position.z));
  const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
  c.steer = Math.max(-1, Math.min(1, -d * k));
}

const types = typeArg === 'both' ? ['ski', 'snowboard'] : [typeArg];
const keys = lineArg === 'all' ? Object.keys(LINES) : lineArg.split(',');
let fail = 0;
for (const key of keys) for (const type of types) {
  course.judgeRun.reset();
  const r = ride(type, key, style);
  const bad = r.missed.length || (style === 'clean' && r.crashes) || (r.key !== 'pipe' && r.u < FINISH_U);   // and it must reach the finish
  if (bad) fail++;
  console.log(`${bad ? 'FAIL' : 'ok  '} ${key.padEnd(10)} ${type.padEnd(9)} ${style} t ${r.t}s end u${r.u} crashes ${r.crashes} stumbles ${r.stumbles} rails ${r.ev.locks.size} banked ${r.ev.banks.length} lost ${r.ev.lost} bails ${r.ev.bails} clips ${r.ev.clips}${r.missed.length ? ' MISSED ' + r.missed.join(', ') : ''} judged ${r.judged}`);
  if (process.env.V) {
    console.log('     banks:', r.ev.banks.join(' | '));
    console.log('     zones:', r.ev.zones.join(' '), 'lip speeds:', JSON.stringify(r.ev.speeds));
    console.log('     airs (s):', JSON.stringify(r.ev.airT));
    console.log('     tricks:', r.ev.tricks.join(' | '), r.ev.pipe.length ? `pipe airs ${r.ev.pipe.join(' ')} m` : '');
  }
}
if (CHECK && fail) { console.log(`${fail} line(s) failed`); process.exit(1); }
