// Jump bench: the real Player on the real maps. For every air it prints take-off speed and angle, air
// time (physics and wall-clock, i.e. with the slow-mo), height above the snow, apex above the take-off,
// horizontal distance and the landing; then it REPLAYS each big take-off from 0.75 s before the lip with
// a trick rider's best input — pop at the lip, flip (or spin) loaded on the snow and thrown hard, held
// to touchdown — and reports the most flips / degrees of spin that air allows (landed or not).
//   Valcrest     the three signature kickers (S / M / L), entered at 10 / 13 / 16 m/s 25 m out, popped at the lip
//   Blackspruce  its explicit kickers, entered at 12 / 15 m/s
//   Ravenspire   The Stacks, Station Cliff, the Hammer and the Ravine: 'send' (tucked, pop every lip)
//                and 'roll' (no pop), each with the flow layer idle and in the SEND IT state
// Usage: node web/scripts/jumps-bench.mjs [valcrest|blackspruce|ravenspire|all] [ski|snowboard|both] [--quiet]
import { gridTerrain, airRecorder, fmtAir } from './jumps-lib.mjs';
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { PHYSICS } = await import('../src/config.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;
const args = process.argv.slice(2), pos = args.filter((a) => !a.startsWith('--'));
const WHICH = pos[0] || 'all', TYPES = (pos[1] || 'both') === 'both' ? ['ski', 'snowboard'] : [pos[1]];
const QUIET = args.includes('--quiet');
const DT = 1 / 60, TAU = Math.PI * 2;
const input = { strength: () => 0, justPressed: () => false };

/** Ring buffer of ground snapshots so a take-off can be replayed with other inputs. */
function snapshot(p) {
  return { pos: p.position.clone(), vel: p.velocity.clone(), heading: p.heading, travel: p.dyn.travel, edge: p.dyn.edge, normal: p.groundNormal.clone() };
}
function restore(p, s) {
  p.place(s.pos, s.heading);
  p.position.copy(s.pos); p.velocity.copy(s.vel); p.speed = s.vel.length();
  p.groundNormal.copy(s.normal); p.dyn.travel = s.travel; p.travelSign = s.travel; p.dyn.edge = s.edge;
  p.snapRender();
}

/**
 * Replay a take-off: from snapshot `s`, `frames` steps before the rider left the snow, load the pop
 * (Space) and release on the frame before the original take-off, with `trick` = 'flip' (S held from the
 * load through the air: a preloaded backflip thrown and tucked to the end) or 'spin' (steer held from
 * the load: wind-up, then spin to the end). `flow` = SEND IT on. Returns { flips, spin, air }.
 */
function replay(T, type, s, frames, trick, flow) {
  const p = new Player(T, null, null, input);
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  restore(p, s);
  let i = 0, maxFlip = 0;
  for (; i < frames + 60 * 12; i++) {
    p.script = (c, pl) => {
      pl.dyn._noInputT = -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      if (pl.state === State.GROUNDED) c.jump = i < frames - 1;
      // Keys held through the take-off are locked until pressed again: let go for two frames in the air.
      const relock = pl.state === State.AIR && pl.airTime < 0.05;
      if (trick === 'flip' && !relock) c.brake = 1;
      if (trick === 'spin' && !relock) c.steer = -1;
    };
    if (flow && p.flow) { p.flow.stateT = 1e9; p.flow.boost = 1; p.flowBoost = 1; }
    p.step(DT);
    maxFlip = Math.max(maxFlip, Math.abs(p.flip));
    if (i > frames && p.state !== State.AIR) break;
  }
  return { flips: maxFlip / TAU, spin: Math.abs(p._spinTotal) * 180 / Math.PI, air: p.lastLanding?.air ?? p.lastCrash?.air ?? p.airTime };
}

/** Ride with `script(c, pl)` for at most `seconds`; records airs (and their replay snapshots). */
function rideRecord(p, script, seconds, stop = () => false) {
  const rec = airRecorder(), ring = [];
  for (let i = 0; i < seconds / DT; i++) {
    p.script = script;
    p.step(DT);
    if (p.state === State.GROUNDED) { ring.push(snapshot(p)); if (ring.length > 45) ring.shift(); }
    const before = rec.cur;
    rec.step(p);
    if (!before && rec.cur) { rec.cur.snap = ring[0]; rec.cur.frames = ring.length; }
    if (stop(p)) break;
  }
  return rec.airs;
}

const rows = [];
function report(map, label, type, a, T, flow) {
  const mx = a.snap && a.air > 0.5 ? { f: replay(T, type, a.snap, a.frames, 'flip', flow), s: replay(T, type, a.snap, a.frames, 'spin', flow) } : null;
  rows.push({ map, label, type, flow, a, mx });
  if (!QUIET) console.log(`  ${label.padEnd(26)} ${type.padEnd(9)} ${fmtAir(a)}${mx ? `  | max ${mx.f.flips.toFixed(2)} flips (${mx.f.air.toFixed(2)} s), ${mx.s.spin.toFixed(0)}° spin` : ''}`);
}

// ------------------------------------------------------------------ Valcrest / Blackspruce kickers
async function kickers(map) {
  let course;
  if (map === 'valcrest') { const { Course } = await import('../src/course.js'); course = new Course(); }
  else { const { BlackspruceCourse } = await import('../src/maps/blackspruce/course.js'); course = new BlackspruceCourse(); }
  const T = await gridTerrain(course);
  const K = T.featuresObj.kickers;
  const list = map === 'valcrest' ? K.filter((k) => k.signature) : K;
  console.log(`\n=== ${map}: ${list.length} kickers ===`);
  for (const type of TYPES) for (const [ki, k] of list.entries()) for (const run of map === 'valcrest' ? [10, 13, 16] : [12, 15]) {
    const p = new Player(T, null, null, input);
    p.setEquipment(type);
    p.fadeThen = (fn) => fn();
    // `run` = entry speed (m/s) 25 m before the ramp, along its axis (a rider coming down the run).
    const st = k.o.clone().addScaledVector(k.f, -25), head = Math.atan2(-k.f.x, -k.f.y);
    p.place(new THREE.Vector3(st.x, 0, st.y), head);
    const fw = new THREE.Vector3(-Math.sin(head), 0, -Math.cos(head));
    fw.addScaledVector(p.groundNormal, -fw.dot(p.groundNormal)).normalize();
    p.velocity.copy(fw).multiplyScalar(run);
    let popped = false;
    const airs = rideRecord(p, (c, pl) => {
      pl.dyn._noInputT = -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      if (pl.state === State.GROUNDED && !popped) {
        const dx = pl.position.x - k.o.x, dz = pl.position.z - k.o.y;
        const a = dx * k.f.x + dz * k.f.y, aNext = a + (pl.velocity.x * k.f.x + pl.velocity.z * k.f.y) * DT * 1.5;
        // Steer onto the kicker's centre line, aiming a few metres down it.
        const b = dx * k.r.x + dz * k.r.y, aim = Math.max(a + 6, 2);
        const tx = k.o.x + k.f.x * aim, tz = k.o.y + k.f.y * aim;
        const want = Math.atan2(-(tx - pl.position.x), -(tz - pl.position.z)), d = Math.atan2(Math.sin(want - pl.heading), Math.cos(want - pl.heading));
        c.steer = Math.max(-1, Math.min(1, -d * 2.5));
        c.jump = a > -12 && aNext < k.L;
        if (a > -12 && aNext >= k.L) popped = true;
      }
    }, 12, (pl) => popped && pl.state === State.GROUNDED && pl.airTime === 0 && pl._landGrace < 0.2);
    const a = airs.find((x) => x.air > 0.3);
    if (a) report(map, `#${ki} ${k.name} (L ${k.L} H ${k.H}) in ${run} m/s`, type, a, T, false);
    else if (!QUIET) console.log(`  #${ki} ${k.name} in ${run} m/s ${type}: no air (${airs.map((x) => x.air.toFixed(2)).join(" ")}) state ${p.state} at a=${((p.position.x - k.o.x) * k.f.x + (p.position.z - k.o.y) * k.f.y).toFixed(1)} speed ${p.speed.toFixed(1)}`);
  }
}

// ------------------------------------------------------------------ Ravenspire lines
async function ravenspire() {
  const M = await import('./map3-ride.mjs');
  const { START_X } = await import('../src/maps/ravenspire/layout.js');
  console.log('\n=== ravenspire ===');
  const lines = { stacks: [0, 1500], station: [1300, 1700], hammer: [780, 1100], ravine: [1150, 1450] };
  for (const [key, [u0, u1]] of Object.entries(lines)) for (const style of ['send', 'roll']) for (const flow of [false, true]) for (const type of TYPES) {
    const ring = [], rec = airRecorder();
    let T = null;
    M.ride(type, key, 'send', {
      popDrop: style === 'roll' ? 1e9 : 6, endU: u1,
      script: (c, pl) => {
        T ??= pl.terrain;
        if (flow && pl.flow) { pl.flow.stateT = 1e9; pl.flow.boost = 1; }
        // record (one frame late: the script runs before the step)
        if (pl.state === State.GROUNDED) { ring.push(snapshot(pl)); if (ring.length > 45) ring.shift(); }
        const before = rec.cur;
        rec.step(pl);
        if (!before && rec.cur) { rec.cur.snap = ring[0]; rec.cur.frames = ring.length + 1; rec.cur.u = pl.position.x - START_X; }
      },
    });
    for (const a of rec.airs.filter((x) => x.air > 1.0 && x.u > u0)) report('ravenspire', `${key} ${style}${flow ? ' +flow' : ''} @u${Math.round(a.u)}`, type, a, T, flow);
  }
}

if (WHICH === 'all' || WHICH === 'valcrest') await kickers('valcrest');
if (WHICH === 'all' || WHICH === 'blackspruce') await kickers('blackspruce');
if (WHICH === 'all' || WHICH === 'ravenspire') await ravenspire();

// Summary: per map / style, the biggest numbers.
console.log('\n=== summary (max over the airs) ===');
const groups = new Map();
for (const r of rows) {
  const g = `${r.map} ${r.map === 'ravenspire' ? r.label.split(' @')[0] : ''} ${r.type}`.replace(/\s+/g, ' ');
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
}
for (const [g, rs] of groups) {
  const m = (f) => Math.max(...rs.map(f));
  console.log(`  ${g.padEnd(38)} airs ${String(rs.length).padStart(2)}  v0 ≤ ${m((r) => r.a.v0).toFixed(1)} m/s  air ≤ ${m((r) => r.a.air).toFixed(2)} s (${m((r) => r.a.real).toFixed(2)} real)  h ≤ ${m((r) => r.a.h).toFixed(1)} m  apex ≤ ${m((r) => r.a.apex).toFixed(1)} m  dist ≤ ${m((r) => r.a.dist).toFixed(0)} m  max flips ${m((r) => r.mx?.f.flips ?? 0).toFixed(2)}  max spin ${m((r) => r.mx?.s.spin ?? 0).toFixed(0)}°  crashes ${rs.filter((r) => /CRASH/.test(r.a.result)).length}`);
}
void PHYSICS;
