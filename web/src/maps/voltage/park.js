// Voltage Park — per-rider park logic (headless; course.onPlayer → attachPark):
//   • Pipe / quarterpipe vert: the top of a real wall is vertical, so a take-off from a wall steeper than
//     55° turns the speed across the wall into height (you go straight up and come down on the same wall).
//     The height field tops out at 80–82°, which on its own would throw you onto the deck.
//   • Timing feedback: pop timing at a lip ('parkPop'), where you landed on a jump ('parkLanding': cased /
//     knuckle / short / SWEET SPOT / deep / overshot — the sweet spot scores), stalls and clean rides away.
//   • Line goals for rails: a banked grind steps the goals by rail name and section.
//   • Run tracking for the slopestyle judge (scoring.js): every scored move with where it happened.
import { emit, on, addScore } from '../../state.js';
import { PHYSICS } from '../../config.js';
import { pathYaw } from '../../physics/edge.js';
import { angleDiff } from '../../physics/math.js';
import * as THREE from 'three';
const _n = new THREE.Vector3();

/**
 * Predicted speed at a jump's lip (no pop) from where the rider is: v² along the straight line to the lip with
 * gravity, snow friction and air drag (the rider's current tuck), then the climb of the kicker. Used by the
 * in-run gauge (hud.js) and the bots.
 */
export function predictLipSpeed(pl, F) {
  const J = F.jump, [la] = [J.lipA];
  const [a] = F.local(pl.position.x, pl.position.z);
  const d = Math.max(0, la - a);
  const C = pl.dyn?.C || PHYSICS.ski;
  const k = (C.dragUpright ?? 0.0135) + ((C.dragTuck ?? 0.0055) - (C.dragUpright ?? 0.0135)) * (pl.tuck || 0);
  const mu = PHYSICS.frictionGroomed, g = PHYSICS.gravity;
  // March the in-run in 1 m steps along the axis (the snow under the axis), then the kicker's rise.
  let v2 = pl.speed * pl.speed, y = pl.position.y;
  const n = Math.ceil(d), step = d / Math.max(1, n);
  for (let i = 1; i <= n; i++) {
    const ai = a + i * step, yi = F.yAt(ai) ?? y;
    const dy = yi - y, ds = Math.hypot(step, dy), cos = step / Math.max(ds, 1e-6);
    v2 += -2 * g * dy - 2 * mu * g * cos * ds - 2 * k * v2 * ds;
    v2 = Math.max(0, v2);
    y = yi;
  }
  return Math.sqrt(v2);
}

export function attachPark(course, pl) {
  course.player = pl;
  const mine = () => course.player === pl;
  const offs = [];
  // ---- pipe vert
  offs.push(on('takeoff', () => {
    if (!mine()) return;
    pl.pipeAir = null;
    const n = course.wallNormal(pl.takeoffPos?.x ?? pl.position.x, pl.takeoffPos?.z ?? pl.position.z) || course.wallNormal(pl.prevPos.x, pl.prevPos.z);
    if (!n) return;
    const v = pl.velocity;
    const into = v.x * n[0] + v.z * n[1];             // + = moving back into the pipe
    if (into >= 0 || v.y < 1) return;
    v.x -= into * n[0]; v.z -= into * n[1];
    // A transition can only send you so high: past ~12 m/s up (7 m out) the legs give and the rest is lost.
    v.y = Math.min(12, Math.sqrt(v.y * v.y + into * into));
    // Hang just inside the coping and drift back in a little (0.6 m/s), so the way down is the steep transition,
    // not the deck — and the air has a direction for the rider to spot the landing by (back down the wall).
    const back = Math.min(0.8, Math.max(0.2, 1.1 / Math.max(0.5, 2 * v.y / 9.81)));   // ≈ 1.1 m back in over the whole air
    v.y = Math.sqrt(Math.max(0, v.y * v.y - back * back));
    v.x += n[0] * back; v.z += n[1] * back;
    pl.position.x += n[0] * 0.25; pl.position.z += n[1] * 0.25;
    // The wall's 3D normal near the coping (for the landing path: back down the same wall).
    const wn = { x: n[0] * Math.sin(82 * Math.PI / 180), y: Math.cos(82 * Math.PI / 180), z: n[1] * Math.sin(82 * Math.PI / 180) };
    pl.pipeAir = { n, wn, t: 0 };
    if (pl.dyn) pl.dyn.airPred = pl.dyn.timeToLand();
    emit('pipeAir', { height: v.y * v.y / 19.62 });
  }));
  // ---- pop timing
  offs.push(on('jumped', () => {
    if (!mine() || pl.state === 5) return;
    const ahead = pl.lipAhead ? pl.lipAhead(0.75) : null;
    const lipNear = (pl.lastLip || 0) > 0.2 || ahead !== null;
    if (!lipNear) return;
    const q = pl.lastPopQ ?? 0;
    emit('parkPop', { q, label: q >= 0.95 ? 'PERFECT POP' : q >= 0.8 ? 'GOOD POP' : 'EARLY POP' });
  }));
  // ---- landing zone on the jump you took off from
  offs.push(on('landed', (e) => {
    if (!mine() || !pl.takeoffPos || e.air < 0.5) return;
    const L = course.landingAt(pl.position.x, pl.position.z);
    const from = course.featureAt(pl.takeoffPos.x, pl.takeoffPos.z);
    if (!L || !L.f.jump?.land || (from && from !== L.f.name)) return;
    const J = L.f.jump, k = J.knuckle?.a ?? J.lipA + J.table, sweet = J.land.sweet?.a ?? k + 6, end = L.f.marks.landingEnd?.a ?? sweet + 15;
    const a = L.a;
    let zone;
    if (a < k - 1.2) zone = 'cased';
    else if (a < k + 1.5) zone = 'knuckle';
    else if (a < sweet - 7) zone = 'short';
    else if (a <= sweet + 7) zone = 'sweet';
    else if (a <= end + 2) zone = 'deep';
    else zone = 'overshot';
    const dist = a - J.lipA;
    emit('parkLanding', { zone, jump: L.f.name, dist, clean: e.clean, impact: e.impact });
    if (zone === 'sweet' && e.clean) addScore(`Sweet spot · ${Math.round(dist)} m`, Math.round(60 * (pl.flow ? pl.flow.scoreMul() : 1)));
  }));
  // ---- rails feed the line goals
  offs.push(on('grindScore', (g) => {
    if (!mine() || !pl.flow) return;
    const r = course.rails.find((q) => q.name === g.rail);
    pl.flow.goalStep([g.rail, r?.section]);
  }));
  pl.parkOffs = offs;
  // Run tracking for the judge (average speed on the snow and the rails), and pumping the pipe.
  const step0 = pl.step.bind(pl);
  pl.step = (dt) => {
    if (mine()) wallAlign(course, pl);
    step0(dt);
    if (mine() && pl.state !== 0) { course.judgeRun?.tick(dt, pl); pump(course, pl, dt); pipeSpot(pl, dt); }
  };
}

/**
 * Pumping the superpipe / quarterpipes (research §8 rule 24: model pumping as energy on each transition): riding
 * up a transition you extend your legs against it and gain speed — PUMP.auto m/s² by itself, × PUMP.timed if
 * you crouched (W) across the flat and let go as the wall starts. Without it no one gets out of a 6.7 m pipe.
 */
export const PUMP = { auto: 5.5, timed: 1.6, minDeg: 6, maxDeg: 72, pipeCap: 21 };
function pump(course, pl, dt) {
  const P = course.pipe;
  const st = pl._pump || (pl._pump = { crouchT: 0, armed: false });
  if (pl.state !== 1) { st.armed = false; return; }
  const up = (pl._ctrl?.up || 0) > 0.3 || (pl._ctrl?.tuck || 0) > 0.3;
  let wall = null;
  if (P) {
    const [a, b] = P.local(pl.position.x, pl.position.z), t = Math.abs(b) - P.F;
    if (a > 0 && a < P.length && P.scale(a) > 0.5) {
      if (t <= 0) { st.crouchT = up ? st.crouchT + dt : 0; if (st.crouchT > 0.2) st.armed = true; }
      else if (t < P.tR) wall = { ang: Math.asin(Math.min(1, t / P.R)) / (Math.PI / 180), nx: Math.sign(b) * P.rx, nz: Math.sign(b) * P.rz };
    }
  }
  // In the pipe the snow is cut soft and the walls eat speed: above PUMP.pipeCap the same soft-cap drag the rest of
  // the park only starts at its (much higher) top speed. Faster than that and the airs go long and low, not up.
  if (P && pl.state === 1) {
    const [a, b] = P.local(pl.position.x, pl.position.z), sp = pl.velocity.length();
    if (a > 0 && a < P.length && Math.abs(b) < P.F + P.wallRun && sp > PUMP.pipeCap) pl.velocity.multiplyScalar(Math.max(0.5, 1 - PHYSICS.softCapDrag * (sp - PUMP.pipeCap) ** 2 * dt / sp));
  }
  if (!wall) return;
  // Going up the wall (velocity has a component toward it) on the curved part.
  const v = pl.velocity, sp = v.length();
  const toward = (v.x * wall.nx + v.z * wall.nz) / Math.max(sp, 1e-3);
  if (toward < 0.2 || wall.ang < PUMP.minDeg || wall.ang > PUMP.maxDeg || sp < 3) return;
  const timed = st.armed && !up;
  const a = PUMP.auto * (timed ? PUMP.timed : 1);
  v.multiplyScalar((sp + a * dt) / sp);
  if (timed && !st.told) { st.told = true; emit('parkPump', {}); }
  if (wall.ang > PUMP.maxDeg - 6) st.armed = false;
}

/**
 * On a steep transition (pipe walls, quarterpipes) keep the gear pointing along its path. The gear's heading is
 * a yaw; on a 70–80° wall the projection of a yaw onto the snow is nearly horizontal, so the edges would steer
 * the climb sideways along the wall (and nobody would get out of the pipe). Riders ride straight up and down the
 * wall: the heading becomes the yaw whose projection onto the wall is the velocity (h = d − (d.y / n.y) n).
 */
function wallAlign(course, pl) {
  if (pl.state !== 1) return;
  const n = pl.groundNormal;
  if (n.y > 0.94 || n.y < 0.05) return;                     // < 20°: the normal carve model is right
  const x = pl.position.x, z = pl.position.z;
  let on = false;
  if (course.pipe) { const [a, b] = course.pipe.local(x, z); on = a > 0 && a < course.pipe.length && Math.abs(b) > course.pipe.F - 0.2 && Math.abs(b) < course.pipe.F + course.pipe.wallRun + 0.3; }
  if (!on) for (const w of course.walls) { const [a, b] = w.f.local(x, z); if (Math.abs(b) < w.hw + 0.5 && a > w.f.marks.foot.a - 0.5 && a < w.a1) { on = true; break; } }
  if (!on) return;
  const v = pl.velocity, sp = v.length();
  if (sp < 1) return;
  const d = { x: v.x / sp, y: v.y / sp, z: v.z / sp }, k = d.y / n.y;
  const hx = d.x - k * n.x, hz = d.z - k * n.z;
  if (hx * hx + hz * hz < 1e-6) return;
  const yaw = Math.atan2(-hx, -hz) + (pl.travelSign < 0 ? Math.PI : 0);
  pl.heading = yaw;
}

/**
 * Spotting a pipe landing: the way down is back down the wall (and on along the pipe), which the generic air
 * spotting (it looks at the horizontal path, here mostly along the pipe) doesn't see. Without a spin going the
 * gear eases onto the nearer of riding the landing forward or fakie (a straight air lands fakie); spun, it
 * settles onto the nearer one in the last 0.35 s, like the usual landing assist.
 */
function pipeSpot(pl, dt) {
  const A = pl.pipeAir;
  if (!A) return;
  if (pl.state !== 2) { pl.pipeAir = null; return; }
  A.t += dt;
  const v = pl.velocity, tl = pl.dyn?.timeToLand?.() ?? 1;
  // Predicted path at touchdown: the same along / back drift, falling as fast as it rose.
  const vl = { x: v.x, y: v.y - 9.81 * tl, z: v.z };
  const lx = pl.position.x + v.x * tl, lz = pl.position.z + v.z * tl;
  const nT = pl.terrain.getNormal(lx, lz, 0.4, _n);
  const wn = nT.y < 0.94 ? nT : A.wn;
  // The landing path = the flight with its into-the-snow part removed.
  const vn = vl.x * wn.x + vl.y * wn.y + vl.z * wn.z;
  const L = pathYaw({ x: vl.x - vn * wn.x, y: vl.y - vn * wn.y, z: vl.z - vn * wn.z }, wn);
  const d0 = angleDiff(pl.heading, L), d1 = angleDiff(pl.heading, L + Math.PI);
  const d = Math.abs(d0) < Math.abs(d1) ? d0 : d1;
  const spinning = Math.abs(pl.spinRate || 0) > 1.5 && tl > 0.35;
  const steering = Math.abs(pl._ctrl?.steer || 0) > 0.2;
  if (spinning || (steering && tl > 0.35)) return;
  const rate = tl < 0.35 ? 9 : 4;
  pl.heading += Math.sign(d) * Math.min(Math.abs(d), rate * dt);
  pl.spinRate *= Math.exp(-6 * dt);
  if (pl.dyn) pl.dyn.spinH = (pl.dyn.spinH || 0) * Math.exp(-6 * dt);
}
