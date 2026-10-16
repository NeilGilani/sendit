// Valcrest (map 1) kicker sweep on the real height field with the real features.js kickers: every
// kicker approached at several speeds, lateral offsets and angles, rolled or popped (early / at the
// lip), on skis and a board. Flags take-offs whose launch is steeper / higher than the kicker's own
// lip can explain (the "launched sky-high at the start of the jump" bug), and prints a summary.
// Usage: node web/scripts/jumps-valcrest.mjs [--check] [--list] [--verbose]
//   --check  exit 1 if any take-off is anomalous (regression check for the launch bug)
import { gridTerrain, airRecorder, fmtAir } from './jumps-lib.mjs';
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { Course } = await import('../src/course.js');
const { game, Mode } = await import('../src/state.js');
game.mode = Mode.RIDING;
const args = process.argv.slice(2);
const CHECK = args.includes('--check'), LIST = args.includes('--list'), VERBOSE = args.includes('--verbose');

const T = await gridTerrain(new Course());
const K = T.featuresObj.kickers;
const DT = 1 / 60, DEG = Math.PI / 180;
// Lip angle of a features.js kicker: y = H·(a/L)^1.7 → slope 1.7·H/L at the lip (relative to the base slope).
const lipDeg = (k) => Math.atan(1.7 * k.H / k.L) / DEG;

function ride(type, k, { speed, lateral, yaw, pop }) {
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.fadeThen = (fn) => fn();
  const run = Math.max(14, speed * 1.4);
  const start = k.o.clone().addScaledVector(k.f, -run).addScaledVector(k.r, lateral);
  const head = Math.atan2(-k.f.x, -k.f.y) + yaw * DEG;
  p.place(new THREE.Vector3(start.x, 0, start.y), head);
  const n = p.groundNormal, fwd = new THREE.Vector3(-Math.sin(head), 0, -Math.cos(head));
  fwd.addScaledVector(n, -fwd.dot(n)).normalize();
  p.velocity.copy(fwd).multiplyScalar(speed);
  const rec = airRecorder();
  let first = null, popped = false, maxVy = -99;
  for (let i = 0; i < 9 / DT; i++) {
    p.script = (c, pl) => {
      pl.dyn._noInputT = -999;
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      if (pop && pl.state === State.GROUNDED && !popped) {
        // along-kicker coordinate of the rider: release at a given share of the ramp (1 = right at the lip)
        const dx = pl.position.x - k.o.x, dz = pl.position.z - k.o.y;
        const a = dx * k.f.x + dz * k.f.y, aNext = a + (pl.velocity.x * k.f.x + pl.velocity.z * k.f.y) * DT * 1.5;
        const rel = pop === 'lip' ? aNext >= k.L : a >= k.L * pop;
        c.jump = !rel;
        if (rel) popped = true;
      }
    };
    p.step(DT);
    rec.step(p);
    if (p.state === State.AIR) maxVy = Math.max(maxVy, p.velocity.y);
    if (rec.airs.length && !first) {
      first = rec.airs[0];
      const dx = first.x0 - k.o.x, dz = first.z0 - k.o.y;
      first.a = dx * k.f.x + dz * k.f.y;   // where along the kicker the rider left the snow
      first.b = dx * k.r.x + dz * k.r.y;
    }
    if (first && p.state === State.GROUNDED && i * DT > 1) break;
    if (p.state === State.CRASH && p.crashT > 0.5) break;
  }
  return first ? { ...first, maxVy } : null;
}

const cases = [];
for (const type of ['ski', 'snowboard']) for (const [ki, k] of K.entries()) {
  const sr = Math.max(1.0, k.H * 1.1);
  for (const speed of [6, 10, 14, 18]) for (const lateral of [0, k.W / 2 - 0.5, k.W / 2 + sr * 0.5, -(k.W / 2 + sr * 0.8)]) for (const yaw of [0, 20]) for (const pop of [false, 'lip', 0.3]) {
    const r = ride(type, k, { speed, lateral, yaw, pop });
    if (!r) continue;
    // What the kicker can give: the rider's speed along the steepest lip line plus a full pop.
    // The take-off angle relative to the base slope: launch vs base gradient along f.
    const g0 = T.baseHeight(k.o.x, k.o.y), g1 = T.baseHeight(k.o.x + k.f.x * k.L, k.o.y + k.f.y * k.L);
    const baseDeg = Math.atan2(g1 - g0, k.L) / DEG;
    // Vertical take-off speed the lip can give: speed · sin(base slope + lip angle), plus a full pop
    // (≤ 4.6 m/s with flow boosts) and a little slack. Leaving the snow well before the lip with real
    // vertical speed (more than a pop) is the step bug whatever the speed.
    const popV = pop ? 4.6 : 0;
    const limit = r.v0 * Math.sin(Math.max(0, baseDeg + lipDeg(k)) * DEG) + popV + 0.8;
    const bad = r.vy0 > limit || (r.a < k.L * 0.6 && r.vy0 > 1.5 + popV);
    cases.push({ type, ki, k, speed, lateral, yaw, pop, r, limit, bad });
    if (LIST || (VERBOSE && bad)) console.log(`${bad ? 'BAD ' : '    '}${type.padEnd(9)} #${ki} ${k.name} sp ${speed} lat ${lateral.toFixed(1)} yaw ${yaw} pop ${pop}  left at a ${r.a.toFixed(1)}/${k.L} b ${r.b.toFixed(1)}  vy0 ${r.vy0.toFixed(1)}  ang ${r.ang.toFixed(0)}° (vy ≤ ${limit.toFixed(1)})  ${fmtAir(r)}`);
  }
}
const bad = cases.filter((c) => c.bad);
console.log(`\nValcrest kickers: ${K.length}, take-offs ${cases.length}, anomalous ${bad.length}`);
for (const c of bad.slice(0, 25)) console.log(`  ${c.type} #${c.ki} ${c.k.name} (L ${c.k.L} H ${c.k.H}) sp ${c.speed} lat ${c.lateral.toFixed(1)} yaw ${c.yaw} pop ${c.pop}: left at a ${c.r.a.toFixed(1)} b ${c.r.b.toFixed(1)}, vy0 ${c.r.vy0.toFixed(1)} m/s, ang ${c.r.ang.toFixed(0)}°, vy limit ${c.limit.toFixed(1)}, apex ${c.r.apex.toFixed(1)} m, air ${c.r.air.toFixed(2)} s`);
// Summary per kicker size: popped at the lip, straight, 14 m/s.
console.log('\nKicker airs (centre line, 14 m/s run-in, popped at the lip):');
for (const c of cases.filter((c) => c.speed === 14 && c.lateral === 0 && c.yaw === 0 && c.pop === 'lip' && c.type === 'ski').slice(0, 8)) console.log(`  #${c.ki} ${c.k.name} L ${c.k.L} H ${c.k.H}: ${fmtAir(c.r)}`);
if (CHECK && bad.length) { console.log('FAIL: anomalous kicker launches'); process.exit(1); }
if (CHECK) console.log('PASS: every kicker launch is explained by the lip angle and the pop');
