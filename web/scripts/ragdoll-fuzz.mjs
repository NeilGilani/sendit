// Crash ragdoll fuzz test (docs/body.md § Crash ragdoll → Tests). Headless: the real Quaternius skeleton from the
// glTF node tree, the real ragdoll controller / solver / rig mapping, synthetic slopes (bumps, trees, rocks, rails).
//
//   node web/scripts/ragdoll-fuzz.mjs [--check] [--n 600] [--seed 1] [--verbose]
//
// Each run: a random rider pose (skis or snowboard), cause (over-rotated / sideways / too-hard landing, a bump,
// a tree, a rock, a rail bail or slam, a cliff drop), slope 0–45°, speed 2–22 m/s, spin, and frame dt (1/30,
// 1/60, 1/144). Checks every frame:
//   no NaN · joint stretch < 2 cm · no sample > 3 cm under the snow · energy never above the crash's (+ a hair) ·
//   joint limits within 8° · the drawn rig stays on the bodies (elbow / knee / head / pelvis < 3 cm) ·
//   asleep within 3 s on slopes ≤ 20° (crashes up to 18 m/s) · CPU per frame step.
// Plus: frame-rate independence (the same crash at dt 1/30, 1/60, 1/144 is identical at matching times) and
// requirement 1: a scripted non-crash run (jumps, landings, carving) is bit-identical with and without the
// ragdoll installed, and its per-frame tracker never writes to the pose.
import { THREE, fakeRider, randomPose, slope } from './ragdoll-lib.mjs';
const { RagdollController, installRagdoll } = await import('../src/character/ragdoll/index.js');
const { RAGDOLL } = await import('../src/config.js');
const { emit, game, Mode } = await import('../src/state.js');
const { Player } = await import('../src/player.js');
const await_solver = await import('../src/character/ragdoll/solver.js');

const args = process.argv.slice(2);
const CHECK = args.includes('--check'), VERBOSE = args.includes('--verbose');
const arg = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const N = arg('--n', 600), SEED = arg('--seed', 1);
const LIM = { stretch: 0.02, below: 0.03, energy: 1.0, limitDeg: 8, attach: 0.03, sleep: 3.0, sleepShare: 0.93, sleepAll: 4.0, sleepAllShare: 0.98, sleepSlope: 20, sleepSpeed: 15, msFrame: 1.0 };

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const CAUSES = ['pitch', 'yaw', 'impact', 'compression', 'tree', 'rock', 'rail-balance', 'rail-slam', 'cliff'];
const DTS = [1 / 30, 1 / 60, 1 / 144];

export function scenario(i) {
  const rnd = rng(SEED * 100003 + i * 7919);
  const cause = CAUSES[Math.floor(rnd() * CAUSES.length)];
  const steep = cause === 'cliff' || rnd() < 0.35;
  return {
    i, rnd, cause,
    type: rnd() < 0.5 ? 'ski' : 'snowboard',
    deg: steep ? 20 + rnd() * 25 : rnd() * 20,
    amp: rnd() < 0.5 ? rnd() * 0.35 : 0, wave: 6 + rnd() * 8,
    speed: 2 + rnd() * 20,
    dt: DTS[Math.floor(rnd() * DTS.length)],
    poseSeed: Math.floor(rnd() * 1e9),
    ...(process.env.SC ? JSON.parse(process.env.SC) : {}),
  };
}

/**
 * Tier batch: crashes aimed at each severity band (near misses, medium, big), skis and board alike. The tier the
 * controller computes decides the bucket; the aims only make sure every band is well populated.
 */
const AIMS = ['near-pitch', 'near-yaw', 'near-bump', 'mid-pitch', 'mid-yaw', 'mid-rail', 'big-pitch', 'big-cliff', 'big-tree'];
export function tierScenario(i) {
  const rnd = rng(SEED * 7717 + i * 104729 + 99);
  const aim = AIMS[i % AIMS.length];
  const sgn = rnd() < 0.5 ? -1 : 1, type = rnd() < 0.5 ? 'ski' : 'snowboard';
  const D2R = Math.PI / 180, base = { i: 50000 + i, rnd, type, amp: rnd() < 0.4 ? rnd() * 0.25 : 0, wave: 6 + rnd() * 8,
    dt: DTS[Math.floor(rnd() * DTS.length)], poseSeed: Math.floor(rnd() * 1e9), aim };
  const yawLim = type === 'ski' ? 38 : 82;
  switch (aim) {
    case 'near-pitch': { const dev = 43 + rnd() * 10; return { ...base, cause: 'pitch', deg: 8 + rnd() * 16, speed: 6 + rnd() * 9, fx: { ang: sgn * dev * D2R, w: sgn * (1 + rnd() * 2.5), vy: -2 - rnd() * 2.5, flipDev: dev } }; }
    case 'near-yaw': { const dev = yawLim + 1 + rnd() * 8; return { ...base, cause: 'yaw', deg: 8 + rnd() * 16, speed: 6 + rnd() * 9, fx: { yaw: sgn * Math.min(88, dev) * D2R, w: sgn * rnd() * 2, vy: -1.5 - rnd() * 2.5, dev } }; }
    case 'near-bump': return { ...base, cause: 'compression', deg: 5 + rnd() * 18, speed: 5 + rnd() * 8, fx: { vy: -0.5 - rnd() } };
    case 'mid-pitch': { const dev = 65 + rnd() * 30, a = Math.min(dev, 80) * D2R; return { ...base, cause: 'pitch', deg: 10 + rnd() * 20, speed: 9 + rnd() * 8, fx: { ang: sgn * a, w: sgn * (3 + rnd() * 3), vy: -4 - rnd() * 4, flipDev: dev, lift: 0.9 * (1 - Math.cos(a)) * 0.6 + 0.02 } }; }
    case 'mid-yaw': { const dev = yawLim + 20 + rnd() * 30; return { ...base, cause: 'yaw', deg: 10 + rnd() * 20, speed: 11 + rnd() * 8, fx: { yaw: sgn * Math.min(dev, 100) * D2R, w: sgn * (1 + rnd() * 3), vy: -3 - rnd() * 4, dev } }; }
    case 'mid-rail': return { ...base, cause: 'rail-balance', deg: rnd() * 15, speed: 4 + rnd() * 6 };
    case 'big-pitch': { const dev = 110 + rnd() * 60, a = Math.min(dev, 120) * D2R; return { ...base, cause: 'pitch', deg: 15 + rnd() * 20, speed: 12 + rnd() * 8, fx: { ang: sgn * a, w: sgn * (6 + rnd() * 4), vy: -7 - rnd() * 6, flipDev: dev, lift: 0.9 * (1 - Math.cos(a)) + 0.05 } }; }
    case 'big-cliff': return { ...base, cause: 'cliff', deg: 28 + rnd() * 14, speed: 14 + rnd() * 8 };
    default: return { ...base, cause: 'tree', deg: 10 + rnd() * 15, speed: 13 + rnd() * 7 };
  }
}

/** Set up a rider about to crash: placed, posed, two tracked frames, the player in State.CRASH. */
export function setup(sc, overrides = {}) {
  const s = { ...sc, ...overrides };
  const rnd = rng(s.poseSeed);
  const r = fakeRider(s.type, rnd() < 0.5 ? 'regular' : 'goofy');
  randomPose(r, rnd);
  const downhill = new THREE.Vector3(0, 0, -1);
  const yaw = (rnd() - 0.5) * 1.1;
  const vdir = downhill.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const trees = [], rails = [];
  const x0 = 0, z0 = 0;
  const v = vdir.clone().multiplyScalar(s.speed);
  let lift = 0.02, w = new THREE.Vector3(), reason = s.cause, kind = 'landing';
  const lat = new THREE.Vector3(-vdir.z, 0, vdir.x);
  let extraQ = new THREE.Quaternion();
  if (s.cause === 'pitch') { w.copy(lat).multiplyScalar((rnd() < 0.5 ? -1 : 1) * (2 + rnd() * 6)); extraQ.setFromAxisAngle(lat, (rnd() - 0.5) * 2.2); v.y = -2 - rnd() * 7; }
  if (s.cause === 'yaw') { extraQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (rnd() < 0.5 ? -1 : 1) * (0.7 + rnd() * 1.2)); v.y = -2 - rnd() * 6; w.y = (rnd() - 0.5) * 6; }
  if (s.cause === 'impact') { v.y = -9 - rnd() * 6; }
  if (s.cause === 'compression') { kind = 'compression'; v.y = -rnd(); }
  if (s.cause === 'cliff') { reason = 'impact'; v.y = -6 - rnd() * 8; lift = 0.5 + rnd() * 2; extraQ.setFromAxisAngle(lat, (rnd() - 0.5) * 1.2); w.copy(lat).multiplyScalar((rnd() - 0.5) * 4); }
  if (s.cause === 'tree' || s.cause === 'rock') {
    kind = s.cause;
    const d = 0.55 + rnd() * 0.9, side = (rnd() - 0.5) * 0.6;
    trees.push({ x: x0 + vdir.x * d + lat.x * side, z: z0 + vdir.z * d + lat.z * side, r: s.cause === 'tree' ? 0.15 + rnd() * 0.3 : 0.4 + rnd() * 0.6, kind: s.cause });
  }
  // Tier batch (tierScenario): an exact pitch / yaw error, leftover spin and fall speed instead of the random ones.
  if (s.fx) {
    const f = s.fx;
    if (f.ang !== undefined) { extraQ.setFromAxisAngle(lat, f.ang); w.copy(lat).multiplyScalar(f.w ?? 0); }
    if (f.yaw !== undefined) { extraQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw); w.set(0, f.w ?? 0, 0); }
    if (f.vy !== undefined) v.y = f.vy;
    if (f.lift !== undefined) lift = f.lift;
  }
  if (s.cause.startsWith('rail')) {
    kind = 'rail'; reason = s.cause === 'rail-balance' ? 'balance' : 'rail';
    const half = rnd() < 0.6 ? 0.05 : 0.3;
    const k = Math.tan(s.deg * Math.PI / 180) * 0;
    void k;
    rails.push({ pts: [[x0 - vdir.x * 4, 0, z0 - vdir.z * 4], [x0 + vdir.x * 4, 0, z0 + vdir.z * 4]], half });
    if (s.cause === 'rail-slam') v.y = -10 - rnd() * 3;
  }
  // A few unrelated trees around (solid either way).
  for (let k = 0; k < 3; k++) if (rnd() < 0.4) trees.push({ x: (rnd() - 0.5) * 16, z: -3 - rnd() * 20, r: 0.2 + rnd() * 0.3, kind: 'tree' });
  const env = slope({ deg: s.deg, amp: s.amp, wave: s.wave, trees, rails });
  const T = env.terrain;
  // Rails sit on the slope: lift their points onto it (+0.6 m).
  for (const rl of rails) for (const p of rl.pts) p[1] = T.getHeight(p[0], p[2]) + 0.6;
  const onRail = rails.length ? 0.6 : 0;
  const n = T.getNormal(x0, z0, 0.5);
  const baseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n)
    .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw));
  const place = (dtBack) => {
    const q = extraQ.clone().multiply(baseQ);
    if (dtBack) q.premultiply(new THREE.Quaternion().setFromAxisAngle(w.clone().normalize(), w.lengthSq() ? -w.length() * dtBack : 0));
    r.root.quaternion.copy(q);
    r.root.position.set(x0, T.getHeight(x0, z0) + lift + onRail, z0).addScaledVector(v, -dtBack);
    r.root.updateMatrixWorld(true);
  };
  const pl = {
    state: 1, simulated: true, simTime: 10, renderAlpha: 1, stepDt: 1 / 60,
    velocity: v.clone(), position: new THREE.Vector3(x0, T.getHeight(x0, z0), z0), terrain: T, scatter: env.scatter,
    heading: Math.atan2(-vdir.x, -vdir.z), lastCrash: (() => {
      // What player.land would have recorded (the ragdoll grades the crash from it): the pitch / yaw error, the impact.
      const ang = 2 * Math.acos(Math.min(1, Math.abs(extraQ.w))) * 180 / Math.PI;
      const c = { reason, impact: reason === 'impact' ? Math.max(18.5, -v.y) : Math.max(0, -v.y) };   // (an 'impact' crash is > PHYSICS.crashImpact by definition)
      if (reason === 'pitch') c.flipDev = s.fx?.flipDev ?? 43 + ang;
      if (reason === 'yaw') c.dev = s.fx?.dev ?? ang;
      return c;
    })(), groundNormal: new THREE.Vector3(0, 1, 0), renderPos: new THREE.Vector3(),
  };
  const ctl = new RagdollController({ player: pl, rider: r, scatter: env.scatter, course: T.course, C: process.env.C ? { ...RAGDOLL, ...JSON.parse(process.env.C) } : RAGDOLL });
  place(1 / 60); ctl.track(); pl.simTime += 1 / 60; place(0); ctl.track();
  pl.state = 3; emit('crashed', kind);
  pl.renderPos.copy(pl.position);
  return { s, r, pl, ctl, T, speed: v.length() };
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
function runCrash(sc, seconds = 4) {
  const { s, r, pl, ctl, T, speed } = setup(sc);
  const out = { i: s.i, type: s.type, cause: s.cause, deg: s.deg, speed, dt: s.dt, fail: [], stretch: 0, below: 0, dE: -Infinity, limit: 0, attach: 0, sleep: null, ms: 0, msSum: 0, steps: 0 };
  const steps = Math.round(seconds / s.dt);
  let E0 = null;
  for (let k = 0; k < steps; k++) {
    const t0 = performance.now();
    if (!ctl.stepCrash(pl, s.dt)) { out.fail.push('did not run'); break; }
    const ms = performance.now() - t0;
    if (k > 2) { out.ms = Math.max(out.ms, ms); out.msSum += ms; out.steps++; }
    const W = ctl.H.world;
    if (E0 === null) E0 = ctl.E0;
    if (W.failed) { out.fail.push('solver failed (NaN)'); break; }
    { const st = W.stretch(); if (st > out.stretch) { out.stretch = st; out.stretchAt = `${W.stretchName} @${((k + 1) * s.dt).toFixed(2)}s`; } }
    { const lv = W.limitViolation(); if (lv > out.limit) { out.limit = lv; out.limitAt = `${W.limitName} @${((k + 1) * s.dt).toFixed(2)}s`; } }
    const E = W.energy(0);
    if (!Number.isFinite(E)) { out.fail.push('NaN energy'); break; }
    out.dE = Math.max(out.dE, E - E0);
    if (process.env.DBG && k % Math.max(1, Math.round(0.1 / s.dt)) === 0) { const c = W.com(0, new THREE.Vector3()), v = W.comVel(0, new THREE.Vector3()); console.log('  t', ((k + 1) * s.dt).toFixed(2), 'w', W.bodies.filter((b) => b.group === 0).map((b) => b.w.length().toFixed(1) + (b.touch ? '*' : '')).join(' '), 'com', c.x.toFixed(2), (c.y - T.getHeight(c.x, c.z)).toFixed(2), c.z.toFixed(2), 'v', v.length().toFixed(2), 'dE', (E - E0).toFixed(1), 'obs', ctl.env.obstacles.map((o) => `${o.x.toFixed(2)},${o.z.toFixed(2)} r${o.r.toFixed(2)} y${(o.y1 - o.y0).toFixed(2)}`).join(' ')); }
    for (const b of W.bodies) for (const sp of b.samples) {
      b.point(sp.p, _v);
      const bl = T.getHeight(_v.x, _v.z) - (_v.y - sp.r);
      if (bl > out.below) { out.below = bl; out.belowAt = `${b.name} @${((k + 1) * s.dt).toFixed(2)}s`; }
    }
    const t = (k + 1) * s.dt;
    if (out.sleep === null && W.asleep(0)) out.sleep = t;
    if (out.slow === undefined && t > 0.3 && W.comVel(0, _w).length() < 0.3) out.slow = t;
    if ((k % 5 === 0 || k === steps - 1) && t > Math.max(RAGDOLL.blendTime, RAGDOLL.shiftTime) + 0.02) {
      ctl.pose(r);
      // The drawn rig on the bodies: elbows, knees, head, pelvis.
      for (const [bone, j] of [['lowerarm_l', 'elbowL'], ['lowerarm_r', 'elbowR'], ['calf_l', 'kneeL'], ['calf_r', 'kneeR'], ['neck_01', 'neck']]) {
        const J = ctl.H.joints[j];
        J.b0.point(J.r0, _w);
        r.bones[bone].getWorldPosition(_v);
        if (!Number.isFinite(_v.x)) { out.fail.push('NaN bone'); break; }
        if (process.env.DBG && _v.distanceTo(_w) > 0.03) console.log('  attach', t.toFixed(3), bone, (_v.distanceTo(_w) * 100).toFixed(1), 'cm', 'stretch', (W.stretch() * 100).toFixed(1));
        out.attach = Math.max(out.attach, _v.distanceTo(_w));
      }
    }
    // The respawn fade (player.crashStep asks doneAt): what the player sees slide is the travel until the fade
    // has covered the screen (0.45 s, player.fadeThen).
    if (out.fadeAt === undefined && ctl.doneAt(t)) out.fadeAt = t;
    if (out.shown === undefined && out.fadeAt !== undefined && t >= out.fadeAt + 0.45) out.shown = ctl.m.dist;
    if (out.sleep !== null && t > out.sleep + 0.3 && t > 1.5 && out.shown !== undefined) break;
  }
  out.E0 = E0;
  if (ctl.m) {
    const m = ctl.m;
    out.peak = m.peak; out.mean = m.mean; out.swings = m.swings; out.shown ??= m.dist; out.fadeAt ??= seconds;
    out.tier = m.tier; out.sev = m.sev; out.tumble = m.tumble * 180 / Math.PI; out.roll = m.roll * 180 / Math.PI; out.wMax = m.wMax;
    out.armPeak = m.armPeak; out.armMean = m.armSum / Math.max(1e-6, m.T); out.legPeak = m.legPeak; out.legMean = m.legSum / Math.max(1e-6, m.T);
    out.flips = Math.floor((out.tumble + 45) / 360);   // a full head-over-heels / cartwheel (with a little slack)
  }
  if (process.env.DBG && ctl.H) {
    const W = ctl.H.world, { closestSegSeg } = await_solver;
    for (const [A, sa, B, sb] of W.pairs) { const a = A.point(sa.a, new THREE.Vector3()), b = A.point(sa.kind === 'c' ? sa.b : sa.a, new THREE.Vector3()), c = B.point(sb.a, new THREE.Vector3()), d = B.point(sb.kind === 'c' ? sb.b : sb.a, new THREE.Vector3()); const p0 = new THREE.Vector3(), p1 = new THREE.Vector3(); closestSegSeg(a, b, c, d, p0, p1); const pen = sa.r + sb.r - p0.distanceTo(p1); if (pen > -0.005) console.log('  PAIR', A.name, B.name, pen.toFixed(4)); }
    for (const j of W.joints) {
      const b0 = j.b0, b1 = j.b1;
      if (j.type === 'hinge') { const a0 = j.hP.clone().applyQuaternion(b0.q), r0 = j.refP.clone().applyQuaternion(b0.q), r1 = j.refC.clone().applyQuaternion(b1.q); const phi = Math.atan2(new THREE.Vector3().crossVectors(r0, r1).dot(a0), r0.dot(r1)); console.log('  J', j.name, 'phi', (phi * 57.3).toFixed(1), 'range', (j.min * 57.3).toFixed(0), (j.max * 57.3).toFixed(0)); }
      else { const a0 = j.aP.clone().applyQuaternion(b0.q), a1 = j.aC.clone().applyQuaternion(b1.q); console.log('  J', j.name, 'swing', (Math.acos(Math.min(1, a0.dot(a1))) * 57.3).toFixed(1), 'cone', (j.cone * 57.3).toFixed(0), 'k', j.k.toFixed(1)); }
    }
  }
  if (ctl.H) { let mv = 0, mw = 0; for (const b of ctl.H.world.bodies) if (b.group === 0) { if (b.v.length() > mv) { mv = b.v.length(); out.mvb = b.name; } if (b.w.length() > mw) { mw = b.w.length(); out.mwb = b.name; } } out.mv = mv; out.mw = mw; out.comv = ctl.H.world.comVel(0, new THREE.Vector3()).length(); }
  ctl.uninstall();
  if (out.stretch > LIM.stretch) out.fail.push(`stretch ${(out.stretch * 100).toFixed(1)} cm (${out.stretchAt})`);
  if (out.below > LIM.below) out.fail.push(`under the snow ${(out.below * 100).toFixed(1)} cm (${out.belowAt})`);
  if (out.dE > LIM.energy) out.fail.push(`energy +${out.dE.toFixed(1)} J`);
  if (out.limit * 180 / Math.PI > LIM.limitDeg) out.fail.push(`joint limit +${(out.limit * 180 / Math.PI).toFixed(1)}° (${out.limitAt})`);
  if (out.attach > LIM.attach) out.fail.push(`rig off the bodies ${(out.attach * 100).toFixed(1)} cm`);
  out.gentle = s.deg <= LIM.sleepSlope && speed <= LIM.sleepSpeed && !s.cause.startsWith('rail');   // (a body draped over a rail slides off it slowly)
  // (gentle crashes asleep by 3 s: checked as a share over all runs, see LIM.sleepShare)
  out.late = out.gentle && !(out.sleep !== null && out.sleep <= LIM.sleep);
  out.avgMs = out.steps ? out.msSum / out.steps : 0;
  out.perFrame = out.avgMs * (1 / 60) / s.dt;   // CPU per 60 Hz frame
  return out;
}

/** The same crash at three frame rates: identical at matching times. */
function frameRateCheck(sc) {
  const res = DTS.map((dt) => {
    const { pl, ctl } = setup(sc, { dt });
    const marks = [];
    let t = 0;
    for (let k = 0; k < Math.round(2 / dt); k++) {
      ctl.stepCrash(pl, dt); t += dt;
      const W = ctl.H.world;
      if (W.ticks % 360 === 0) marks.push([W.ticks, W.com(0, new THREE.Vector3())]);
    }
    ctl.uninstall();
    return new Map(marks.map(([tk, c]) => [tk, c]));
  });
  let worst = 0;
  for (const [tk, c] of res[0]) for (const m of res.slice(1)) if (m.has(tk)) worst = Math.max(worst, m.get(tk).distanceTo(c));
  return worst;
}

/** Requirement 1: no crash → the ragdoll changes nothing (physics state bit-identical; tracking writes no pose). */
function identityCheck() {
  game.mode = Mode.RIDING;
  const terr = () => {
    const k = Math.tan(18 * Math.PI / 180);
    const kick = () => 0;
    const T = {
      half: 1e7, spacing: 1,
      getHeight: (x, z) => z * k + kick(x, z) + 0.06 * Math.sin(x * 0.7) * Math.sin(z * 0.5),
      getNormal: (x, z, rr = 0, out = new THREE.Vector3()) => { const e = Math.max(rr, 0.5); return out.set(T.getHeight(x - e, z) - T.getHeight(x + e, z), 2 * e, T.getHeight(x, z - e) - T.getHeight(x, z + e)).normalize(); },
      getSurface: (x, z, out = new THREE.Vector4()) => out.set(1, 0, 0, 0),
      getSpawn: () => ({ position: new THREE.Vector3(0, 0, 0), heading: 0 }),
    };
    return T;
  };
  const input = { strength: () => 0, justPressed: () => false };
  const script = (c, p) => {
    const t = p.simTime || 0;
    const ph = t % 2.5;
    c.jump = ph > 1.9 && ph < 2.2; c.steer = ph > 1.4 || p.state === 2 ? 0 : Math.sin(t * 1.1) * 0.35; c.tuck = t > 6 && t < 8 ? 1 : 0;
  };
  const make = (withRagdoll) => {
    const p = new Player(terr(), null, null, input);
    p.setEquipment('ski');
    p.place(new THREE.Vector3(0, 0, 0), 0);
    p.script = script;
    let ctl = null, r = null;
    if (withRagdoll) { r = fakeRider('ski'); randomPose(r, rng(5)); ctl = installRagdoll({ player: p, rider: r, scatter: null, course: null }); }
    return { p, ctl, r };
  };
  const A = make(false), B = make(true);
  const snap = (p) => [p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z, p.orient.x, p.orient.y, p.orient.z, p.orient.w, p.state, p.heading, p.airTime, p.flip, p.spinRate];
  let diff = 0, crashes = 0, airs = 0, lands = 0, poseWrites = 0, wasAir = false;
  for (let k = 0; k < 60 * 12; k++) {
    A.p.step(1 / 60); B.p.step(1 / 60);
    A.p.interpolate(0.5); B.p.interpolate(0.5);
    // The rider's per-frame tracking (read-only): the pose must be untouched.
    const before = Object.values(B.r.bones).map((b) => [...b.position.toArray(), ...b.quaternion.toArray()]).flat();
    B.ctl.track();
    const after = Object.values(B.r.bones).map((b) => [...b.position.toArray(), ...b.quaternion.toArray()]).flat();
    if (before.some((v, i) => v !== after[i])) poseWrites++;
    const a = snap(A.p), b = snap(B.p);
    for (let i = 0; i < a.length; i++) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    if (A.p.state === 3) crashes++;
    if (A.p.state === 2 && !wasAir) airs++;
    if (A.p.state !== 2 && wasAir) lands++;
    wasAir = A.p.state === 2;
    if (crashes) { if (process.env.DBG) console.log('identity crash at', k / 60, JSON.stringify(A.p.lastCrash), A.p.speed); break; }
  }
  B.ctl.uninstall();
  return { diff, crashes, airs, lands, poseWrites };
}

// ---------------------------------------------------------------- run
if (!process.env.NOFUZZ) {
const results = [];
const t0 = performance.now();
for (let i = (process.env.ONLY ? Number(process.env.ONLY) : 0); i < (process.env.ONLY ? Number(process.env.ONLY) + 1 : process.env.TIERSONLY ? 0 : N); i++) {
  const r = runCrash(scenario(i));
  results.push(r);
  if (VERBOSE || ((r.fail.length || (r.late && process.env.LATE)) && !CHECK)) console.log(`#${i} ${r.type} ${r.cause} ${r.deg.toFixed(0)}° ${r.speed.toFixed(1)} m/s dt 1/${Math.round(1 / r.dt)}: ${r.fail.join(', ') || 'ok'} (stretch ${(r.stretch * 100).toFixed(2)} cm, below ${(r.below * 100).toFixed(2)} cm, dE ${r.dE.toFixed(1)} J, limit ${(r.limit * 57.3).toFixed(1)}°, rig ${(r.attach * 100).toFixed(1)} cm, sleep ${r.sleep?.toFixed(2) ?? '-'} s; end v ${r.mv?.toFixed(2)} ${r.mvb} w ${r.mw?.toFixed(2)} ${r.mwb} com ${r.comv?.toFixed(2)})`);
}
const fails = results.filter((r) => r.fail.length);
const med = (a) => q(a, 0.5), p90 = (a) => q(a, 0.9);
if (process.env.DUMP) (await import('node:fs')).writeFileSync(process.env.DUMP, JSON.stringify(results.map(({ i, type, cause, deg, speed, sleep, fadeAt, shown, peak, mean, swings, tier, sev, flips, tumble, roll, wMax, gentle }) => ({ i, type, cause, deg, speed, sleep, fadeAt, shown, peak, mean, swings, tier, sev, flips, tumble, roll, wMax, gentle }))));
if (process.env.SLOW) for (const r of results.filter((x) => x.gentle)) console.log('slow', r.i, r.cause, r.deg.toFixed(0), r.speed.toFixed(1), 'com<0.3 at', r.slow?.toFixed(2), 'asleep', r.sleep?.toFixed(2));
const q = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };
const sleepers = results.filter((r) => r.sleep !== null);
const gentle = results.filter((r) => r.gentle);
const perFrame = results.map((r) => r.perFrame);
if (results.length) {
console.log(`\nragdoll fuzz: ${N} crashes in ${((performance.now() - t0) / 1000).toFixed(1)} s, ${fails.length} failing`);
console.log(`  stretch   max ${(Math.max(...results.map((r) => r.stretch)) * 100).toFixed(2)} cm  (p95 ${(q(results.map((r) => r.stretch), 0.95) * 100).toFixed(2)})   limit < ${LIM.stretch * 100}`);
console.log(`  under     max ${(Math.max(...results.map((r) => r.below)) * 100).toFixed(2)} cm   limit < ${LIM.below * 100}`);
console.log(`  energy    max +${Math.max(...results.map((r) => r.dE)).toFixed(2)} J over the crash's   limit < ${LIM.energy}`);
console.log(`  joints    max ${(Math.max(...results.map((r) => r.limit)) * 57.3).toFixed(1)}° past a limit (p95 ${(q(results.map((r) => r.limit), 0.95) * 57.3).toFixed(1)}°)   limit < ${LIM.limitDeg}`);
console.log(`  rig       max ${(Math.max(...results.map((r) => r.attach)) * 100).toFixed(2)} cm off the bodies   limit < ${LIM.attach * 100}`);
console.log(`  sleep     ${gentle.filter((r) => r.sleep !== null && r.sleep <= LIM.sleep).length}/${gentle.length} gentle (≤ ${LIM.sleepSlope}°, ≤ ${LIM.sleepSpeed} m/s) asleep by ${LIM.sleep} s (rails aside); median ${q(sleepers.map((r) => r.sleep), 0.5)?.toFixed(2)} s, p95 ${q(sleepers.map((r) => r.sleep), 0.95)?.toFixed(2)} s; all slopes ${sleepers.length}/${N} asleep within 4 s`);
console.log(`  CPU       ${q(perFrame, 0.5).toFixed(3)} ms per 60 Hz frame median, p95 ${q(perFrame, 0.95).toFixed(3)}, max step ${Math.max(...results.map((r) => r.ms)).toFixed(2)} ms (Node)`);
// Flappiness (limbs relative to the trunk) and the distance shown sliding before the respawn fade, by slope band.
console.log(`  flapping  peak limb spin vs trunk median ${med(results.map((r) => r.peak)).toFixed(1)} rad/s, p90 ${p90(results.map((r) => r.peak)).toFixed(1)}; mean ${med(results.map((r) => r.mean)).toFixed(2)} rad/s (p90 ${p90(results.map((r) => r.mean)).toFixed(2)}); big swings per crash median ${med(results.map((r) => r.swings))}, p90 ${p90(results.map((r) => r.swings))}, max ${Math.max(...results.map((r) => r.swings))}`);
for (const [lo, hi] of [[0, 10], [10, 20], [20, 30], [30, 46]]) {
  const rs = results.filter((r) => r.deg >= lo && r.deg < hi && !r.cause.startsWith('rail'));
  if (!rs.length) continue;
  const d = rs.map((r) => r.shown), f = rs.map((r) => r.fadeAt);
  console.log(`  slide ${String(lo).padStart(2)}–${hi > 45 ? 45 : hi}° ${String(rs.length).padStart(3)} runs: shown before the fade median ${med(d).toFixed(1)} m, p90 ${p90(d).toFixed(1)} m, max ${Math.max(...d).toFixed(1)} m; fade starts median ${med(f).toFixed(2)} s, p90 ${p90(f).toFixed(2)} s`);
}
const cats = {};
for (const r of fails) for (const f of r.fail) { const k = f.replace(/[-+]?[0-9.]+.*$/, '').trim(); cats[k] = (cats[k] || 0) + 1; }
console.log('  failures by check:', JSON.stringify(cats));
for (const c of CAUSES) {
  const rs = results.filter((r) => r.cause === c);
  console.log(`    ${c.padEnd(13)} ${String(rs.length).padStart(3)} runs  ${rs.filter((r) => r.fail.length).length} failing`);
}
}
// ---- tier batch: rotation, spin, limb spread and looseness per severity tier (docs/body.md § Severity)
const NT = arg('--tiers', 270);
const tiers = [];
for (let i = process.env.TONLY ? Number(process.env.TONLY) : 0; i < (process.env.TONLY ? Number(process.env.TONLY) + 1 : NT); i++) { const r = runCrash(tierScenario(i)); r.aim = AIMS[i % AIMS.length]; tiers.push(r); if (r.fail.length) fails.push(r); if (VERBOSE) console.log(`T${i} ${r.aim} ${r.type} → ${r.tier} s ${r.sev?.toFixed(2)}: tumble ${r.tumble?.toFixed(0)}° roll ${r.roll?.toFixed(0)}° wMax ${r.wMax?.toFixed(1)} arm ${r.armPeak?.toFixed(2)} leg ${r.legPeak?.toFixed(2)} loose ${r.mean?.toFixed(2)} ${r.fail.join(', ')}`); }
const TL = { small: { flips: 0, tumbleP90: 150, wMaxP90: 6, armPeakP90: 0.75, looseMed: 1.6 }, medium: { flipShare: 0.1, tumbleP90: 330, wMaxP90: 9, armPeakP90: 0.85, looseMed: 2.2 }, big: { flipsMax: 3, wMaxP90: 14, armPeakP90: 0.95, looseMed: 3.0 } };
const tierBad = [];
console.log(`  tiers (${NT} aimed crashes; flips = full head-over-heels / cartwheels of the trunk axis):`);
for (const name of ['small', 'medium', 'big']) {
  const rs = [...results, ...tiers].filter((r) => r.tier === name);
  if (!rs.length) { console.log(`    ${name}: none`); tierBad.push(`no ${name} crashes`); continue; }
  const f = (k) => rs.map((r) => r[k]);
  const flips = f('flips'), with1 = flips.filter((x) => x >= 1).length;
  console.log(`    ${name.padEnd(6)} ${String(rs.length).padStart(3)} runs: flips 0/1/2+ ${flips.filter((x) => x === 0).length}/${flips.filter((x) => x === 1).length}/${flips.filter((x) => x >= 2).length}, tumble median ${med(f('tumble')).toFixed(0)}° p90 ${p90(f('tumble')).toFixed(0)}°, roll median ${med(f('roll')).toFixed(0)}° p90 ${p90(f('roll')).toFixed(0)}°; body spin (0.1 s) peak median ${med(f('wMax')).toFixed(1)} p90 ${p90(f('wMax')).toFixed(1)} rad/s; hand from trunk peak median ${med(f('armPeak')).toFixed(2)} p90 ${p90(f('armPeak')).toFixed(2)} m (mean ${med(f('armMean')).toFixed(2)}); ankles apart peak p90 ${p90(f('legPeak')).toFixed(2)} m; looseness median ${med(f('mean')).toFixed(2)} p90 ${p90(f('mean')).toFixed(2)} rad/s; asleep median ${med(rs.map((r) => r.sleep ?? 4)).toFixed(2)} s`);
  const L = TL[name];
  if (L.flips !== undefined && with1 > L.flips) tierBad.push(`${name}: ${with1} flips`);
  if (L.flipShare !== undefined && with1 / rs.length > L.flipShare) tierBad.push(`${name}: ${(with1 / rs.length * 100).toFixed(0)} % flip`);
  if (L.flipsMax !== undefined && Math.max(...flips) > L.flipsMax) tierBad.push(`${name}: ${Math.max(...flips)} flips`);
  if (L.tumbleP90 !== undefined && p90(f('tumble')) > L.tumbleP90) tierBad.push(`${name}: tumble p90 ${p90(f('tumble')).toFixed(0)}°`);
  if (p90(f('wMax')) > L.wMaxP90) tierBad.push(`${name}: body spin p90 ${p90(f('wMax')).toFixed(1)}`);
  if (p90(f('armPeak')) > L.armPeakP90) tierBad.push(`${name}: hand spread p90 ${p90(f('armPeak')).toFixed(2)}`);
  if (med(f('mean')) > L.looseMed) tierBad.push(`${name}: looseness ${med(f('mean')).toFixed(2)}`);
}
for (const a of AIMS) { const rs = tiers.filter((r) => r.aim === a); const c = { small: 0, medium: 0, big: 0 }; rs.forEach((r) => c[r.tier]++); process.stdout.write(`      ${a}: ${c.small}/${c.medium}/${c.big}`); }
console.log('   (aim → small/medium/big)');
if (process.env.TDUMP) (await import('node:fs')).writeFileSync(process.env.TDUMP, JSON.stringify(tiers.map(({ i, aim, type, cause, tier, sev, tumble, roll, flips, wMax, armPeak, armMean, legPeak, mean, peak, sleep }) => ({ i, aim, type, cause, tier, sev, tumble, roll, flips, wMax, armPeak, armMean, legPeak, mean, peak, sleep }))));
const fr = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => frameRateCheck(scenario(10000 + i)));
const frWorst = Math.max(...fr);
console.log(`  dt 1/30 · 1/60 · 1/144: largest difference at matching times ${frWorst.toExponential(2)} m`);
const id = identityCheck();
console.log(`  no-crash run with / without the ragdoll: max state difference ${id.diff} (${id.airs} airs, ${id.lands} landings, ${id.crashes} crash frames), tracker pose writes ${id.poseWrites}`);
if (CHECK) {
  const bad = [];
  const by3 = gentle.filter((r) => r.sleep !== null && r.sleep <= LIM.sleep).length / Math.max(1, gentle.length);
  const by4 = gentle.filter((r) => r.sleep !== null && r.sleep <= LIM.sleepAll).length / Math.max(1, gentle.length);
  if (by3 < LIM.sleepShare || by4 < LIM.sleepAllShare) bad.push(`gentle crashes asleep: ${(by3 * 100).toFixed(1)} % by ${LIM.sleep} s (need ${LIM.sleepShare * 100} %), ${(by4 * 100).toFixed(1)} % by ${LIM.sleepAll} s (need ${LIM.sleepAllShare * 100} %)`);
  if (fails.length) { bad.push(`${fails.length} failing crashes`); for (const r of fails.slice(0, 12)) console.log(`  FAIL #${r.i} ${r.type} ${r.cause} ${r.deg.toFixed(0)}° ${r.speed.toFixed(1)} m/s dt 1/${Math.round(1 / r.dt)}: ${r.fail.join(', ')}`); }
  if (frWorst > 1e-6) bad.push(`frame-rate dependent (${frWorst})`);
  if (tierBad.length && !process.env.NOTIERS) bad.push(`tiers: ${tierBad.join(', ')}`);
  if (id.diff > 0 || id.poseWrites || id.crashes || id.airs < 2) bad.push(`identity: diff ${id.diff}, writes ${id.poseWrites}, crashes ${id.crashes}, airs ${id.airs}`);
  if (q(perFrame, 0.95) > LIM.msFrame) bad.push(`CPU p95 ${q(perFrame, 0.95).toFixed(2)} ms per frame`);
  console.log(bad.length ? `\nFAIL: ${bad.join('; ')}` : '\nOK');
  process.exit(bad.length ? 1 : 0);
}
}
