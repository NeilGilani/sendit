// Headless combo-trick bench (no WebGL): spin + flip at the same time (corks, rodeos, misties, double corks).
//   1. Trajectory: the centre of mass must fly the same ballistic path with and without rotation — air
//      time, apex and landing point compared against a straight air with the same take-off (flat ground and
//      a 32° landing slope), plus the drawn centre of mass (where rider.js puts the body's pivot).
//   2. Rotation path: the world angular velocity of the drawn body (renderOrient) over the off-axis part —
//      its mean axis tilt from vertical and how much it wobbles (a clean cork turns about ONE tilted axis),
//      the deepest inversion of the body's up axis, and frame-to-frame jumps (pops).
//   3. Landings: yaw / pitch deviation and the result for each trick.
// Usage: node web/scripts/physics-combo.mjs [ski|snowboard|both] [--check] [--verbose]
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { game, Mode } = await import('../src/state.js');
const { ANIM } = await import('../src/config.js');
game.mode = Mode.RIDING;

const DT = 1 / 60, TAU = Math.PI * 2, DEG = 180 / Math.PI;
const args = process.argv.slice(2);
const CHECK = args.includes('--check'), VERBOSE = args.includes('--verbose');
const which = args.find((a) => !a.startsWith('--')) || 'both';
const fails = [];
const expect = (ok, msg) => { if (!ok) fails.push(msg); };

// Terrain: flat, or a table top that rolls into a 32° landing 6 m past the take-off.
const SLOPE = Math.tan(32 / DEG);
function terrain(kind) {
  const h = kind === 'slope' ? (x, z) => (z < -6 ? (z + 6) * SLOPE : 0) : () => 0;
  const T = { half: 1e7, getHeight: h, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r, o = new THREE.Vector3()) => (kind === 'slope' && z < -6 ? o.set(0, 1, -SLOPE).normalize() : o.set(0, 1, 0));
  return T;
}
function launch(type, ground, vy, vz, set = {}) {
  const p = new Player(terrain(ground), null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type);
  p.place(new THREE.Vector3(), 0);
  p.velocity.set(0, vy, -vz);
  p.position.y = 0.4;
  p.lastPopQ = set.q ?? 1;
  p.dyn.flipLoad = set.preload || 0;
  p.dyn.frontLoad = set.front || 0;
  p.dyn.windup = set.windup || 0;
  if (set.front) p._ctrl.up = 1;
  p.enterAir(set.popped ?? true);
  return p;
}
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
/** Where rider.js puts the body's pivot (centre of mass) this frame. */
function drawnCom(p, out) {
  if (p.renderCom) return p.renderCom(out);
  // (before the off-axis model: renderOrient = base · Rx(renderFlip), the pivot at base · (0, flipPivot, 0))
  const base = _q.copy(p.renderOrient).multiply(_q2.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -(p.renderFlip || 0)));
  return out.set(0, ANIM.flipPivot, 0).applyQuaternion(base).add(p.renderPos);
}

/** Flies one trick; returns trajectory, orientation and landing stats. */
function fly(p, fn) {
  const r = { air: 0, apex: -Infinity, apexCom: -Infinity, land: null, comErr: 0, maxTilt: 0, axes: [], ups: [], pop: 0, samples: 0 };
  const prevQ = new THREE.Quaternion().copy(p.orient), com = new THREE.Vector3();
  let prevRate = null;
  const t0 = p.position.clone(), v0 = p.velocity.clone();
  for (let i = 0; i < 8 / DT; i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, fn(p)); };
    p.step(DT);
    if (p.state !== State.AIR && i > 2) {
      r.land = { x: p.position.x, z: p.position.z, res: p.state === State.CRASH ? 'CRASH' : p.lastLanding?.result, L: p.lastLanding, C: p.lastCrash };
      break;
    }
    r.air = p.airTime;
    p.interpolate(1);
    r.apex = Math.max(r.apex, p.position.y);
    drawnCom(p, com);
    r.apexCom = Math.max(r.apexCom, com.y);
    // The drawn centre of mass vs the ideal point-mass path (no drag: an upper bound on drag + any offset).
    r.comY = com.y; r.comErr = Math.max(r.comErr, Math.abs(com.y - p.position.y - ANIM.flipPivot) * 0);
    const q = p.renderOrient;
    const up = _v.copy(_Y).applyQuaternion(q);
    const tilt = Math.acos(Math.max(-1, Math.min(1, up.y))) * DEG;
    r.maxTilt = Math.max(r.maxTilt, tilt);
    // Off-axis passes: each time the body tips past horizontal and comes back.
    if (tilt > 90 && !r._inv) { r._inv = true; r.inversions = (r.inversions || 0) + 1; } else if (tilt < 60) r._inv = false;
    // A spin parked while the body is deep in a flip (the spot checking it back mid-cork).
    if (p.dyn.flipBusy?.() && Math.abs(p._spinTotal) > 1 && Math.abs(p.spinRate) < 0.6) r.parked = (r.parked || 0) + DT;
    // World angular velocity of the drawn body: dq = q · prev⁻¹.
    const dq = _q.copy(q).multiply(_q2.copy(prevQ).invert());
    if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
    const ang = 2 * Math.acos(Math.min(1, dq.w)), s = Math.sqrt(Math.max(1e-12, 1 - dq.w * dq.w));
    const rate = ang / DT;
    if (prevRate !== null) r.pop = Math.max(r.pop, Math.abs(rate - prevRate));
    prevRate = rate;
    if (Math.abs(p.flipRate) > 1 && Math.abs(p.spinRate) > 1 && ang > 1e-4) r.axes.push({ x: dq.x / s, y: dq.y / s, z: dq.z / s, w: ang });
    // The body's up axis while flipping (a clean off-axis flip draws a circle: a cone round one axis).
    if (Math.abs(p.flipRate) > 1) r.ups.push(up.clone());
    if (p.offAxis && Math.abs(p.flipRate) > 1) { r.mode = Math.max(r.mode || 0, p.offAxis.m); r.alpha = p.offAxis.m > 0.5 ? Math.min(r.alpha ?? 90, p.offAxis.alpha * DEG) : r.alpha ?? 90; }
    prevQ.copy(q);
  }
  // Mean axis (weighted by angle) and its wobble (weighted RMS angle from the mean).
  const m = new THREE.Vector3();
  for (const a of r.axes) m.add(_v.set(a.x, a.y, a.z).multiplyScalar(a.w));
  if (m.lengthSq() > 0) {
    m.normalize();
    let sw = 0, se = 0;
    for (const a of r.axes) { const d = Math.acos(Math.max(-1, Math.min(1, _v.set(a.x, a.y, a.z).dot(m)))); sw += a.w; se += a.w * d * d; }
    r.wobble = Math.sqrt(se / sw) * DEG;
    r.axisTilt = Math.acos(Math.abs(m.y)) * DEG;
  }
  // Cone fit of the up axis path: a plane through the points (normal = the cone's axis); residual = RMS
  // distance off the plane in degrees of arc (0 = a perfect circle).
  if (r.ups.length > 8) {
    const c = new THREE.Vector3();
    for (const u of r.ups) c.add(u);
    c.multiplyScalar(1 / r.ups.length);
    const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const u of r.ups) { const d = [u.x - c.x, u.y - c.y, u.z - c.z]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[i][j] += d[i] * d[j] / r.ups.length; }
    const { vals, vecs } = eig3(M);
    let k = 0; for (let i = 1; i < 3; i++) if (vals[i] < vals[k]) k = i;
    r.coneRes = Math.asin(Math.min(1, Math.sqrt(Math.max(0, vals[k])))) * DEG;
    r.coneTilt = Math.acos(Math.abs(vecs[1][k])) * DEG;
  }
  r.dist = r.land ? Math.hypot(r.land.x - t0.x, r.land.z - t0.z) : NaN;
  void v0;
  return r;
}

/** Jacobi eigen-decomposition of a symmetric 3×3 (columns of vecs are the eigenvectors). */
function eig3(A) {
  const a = A.map((r) => r.slice()), v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 30; sweep++) {
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(a[p][q]) < 1e-14) continue;
      const th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { vals: [a[0][0], a[1][1], a[2][2]], vecs: v };
}

const flipTo = (dir, turns) => (p) => {
  const ahead = Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH || 0) * Math.max(0, p.dyn.timeToLand() - 0.2);
  return p.airTime < 0.12 || Math.abs(p.flip) + ahead < turns * TAU ? (dir > 0 ? { brake: 1 } : { up: 1 }) : {};
};
const spinTo = (deg, dir = 1) => (p) => (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH || 0) * p.dyn.C.spinOpen * Math.max(0, p.dyn.timeToLand() - 0.15) < deg / DEG ? { steer: -dir } : {});
const both = (...f) => (p) => Object.assign({}, ...f.map((g) => g(p)));
const grabMid = (f) => (p) => ({ ...f(p), ...(p.airTime > 0.35 && p.dyn.timeToLand() > 0.5 ? { tuck: 1 } : {}) });
const none = () => ({});

// [label, vy, vz, set, inputs, expected result ('land' = clean or stumble)]
const CASES = [
  ['straight air', 11, 11, {}, none],
  ['720 (spin only)', 11, 11, { windup: -1 }, spinTo(720)],
  ['backflip (flip only)', 11, 11, { preload: 0.7 }, flipTo(1, 1)],
  ['backflip 360 / rodeo 360', 11, 11, { preload: 0.7, windup: -0.6 }, both(flipTo(1, 1), spinTo(360))],
  ['cork 720', 11, 11, { preload: 1, windup: -1 }, both(flipTo(1, 1), spinTo(720))],
  ['cork 720 + grab', 11, 11, { preload: 1, windup: -1 }, grabMid(both(flipTo(1, 1), spinTo(720))), null, grabMid(none)],
  ['rodeo 540', 11, 11, { preload: 1, windup: -0.8 }, both(flipTo(1, 1), spinTo(540)), 'snowboard'],
  ['misty 720', 11, 11, { front: 1, windup: -1 }, both(flipTo(-1, 1), spinTo(720))],
  ['double cork 1080', 13, 11, { preload: 1, windup: -1 }, both(flipTo(1, 2), spinTo(1080))],
  ['right cork 720', 11, 11, { preload: 1, windup: 1 }, both(flipTo(1, 1), spinTo(720, -1))],
  // Stick let go after 540° of a double cork's spin (the flip still under way): the spin carries on.
  ['double cork, spin let go at 540', 13, 11, { preload: 1, windup: -1 }, both(flipTo(1, 2), (p) => (Math.abs(p._spinTotal) * DEG < 540 ? { steer: -1 } : {}))],
];
// Shape expectations (flat ground): deepest tilt of the body's up axis (deg), off-axis passes, cone fit residual
// (deg, a clean path round one axis), landing result. Research (docs/jumps-research.md §8): cork axes 45–60°
// from vertical (body ≈ horizontal to 120°), rodeos / misties 65–80° (130–160°), a flip 180°.
const SHAPE = {
  'backflip (flip only)': { tilt: [175, 181], inv: 1, land: 'clean' },
  'backflip 360 / rodeo 360': { tilt: [125, 165], inv: 1, res: 4, land: 'clean' },
  'cork 720': { tilt: [95, 130], inv: 1, res: 5, land: 'clean' },
  'right cork 720': { tilt: [95, 130], inv: 1, res: 5, land: 'clean' },
  'misty 720': { tilt: [105, 140], inv: 1, res: 5, land: 'clean' },
  'rodeo 540': { tilt: [115, 150], inv: 1, res: 4, land: 'clean' },
  'cork 720 + grab': { tilt: [95, 135], inv: 1, res: 5 },
  'double cork 1080': { tilt: [110, 150], inv: 2, res: 8, land: 'land' },
  'double cork, spin let go at 540': { inv: 2, parked: 0.05, land: 'land' },
};

function bench(type) {
  const out = {};
  for (const ground of ['flat', 'slope']) {
    console.log(`\n=== ${type} · ${ground} landing ===`);
    console.log('  trick                       air s   Δair    apex m  Δapex   COM apex  dist m  Δdist   tilt°  cone°  res°  α° inv  pop rad/s²  landing');
    const base = {};
    for (const [label, vy, vz, set, fn, only, refFn] of CASES) {
      if (only && only !== type) continue;
      const p = launch(type, ground, vy, vz, set);
      const r = fly(p, fn);
      // The reference: a straight air off the same take-off (with the same grab, which is a body shape).
      const key = `${vy}${refFn ? ':grab' : ''}`;
      if (label === 'straight air' || !base[key]) {
        // straight reference for this take-off speed
        if (!base[key]) base[key] = label === 'straight air' ? r : fly(launch(type, ground, vy, vz, {}), refFn || none);
      }
      const b = base[key];
      const dAir = (r.air - b.air) / b.air * 100, dApex = r.apex - b.apex, dDist = (r.dist - b.dist) / b.dist * 100;
      const L = r.land?.L, C = r.land?.C;
      const land = r.land?.res === 'CRASH' ? `CRASH (${C?.reason}, yaw ${(C?.dev ?? 0).toFixed(0)}° pitch ${(C?.flipDev ?? 0).toFixed(0)}°)` : L ? `${L.result} yaw ${L.dev.toFixed(0)}° pitch ${(L.flipDev ?? 0).toFixed(0)}° "${L.trick}"` : '?';
      console.log(`  ${label.padEnd(26)} ${r.air.toFixed(3)}  ${dAir >= 0 ? '+' : ''}${dAir.toFixed(2)}%  ${r.apex.toFixed(2).padStart(5)}  ${dApex >= 0 ? '+' : ''}${dApex.toFixed(3)}  ${r.apexCom.toFixed(2).padStart(6)}   ${r.dist.toFixed(2).padStart(5)}  ${dDist >= 0 ? '+' : ''}${dDist.toFixed(2)}%  ${r.maxTilt.toFixed(0).padStart(4)}  ${(r.coneTilt ?? NaN).toFixed(0).padStart(4)}  ${(r.coneRes ?? NaN).toFixed(1).padStart(4)}  ${(r.alpha ?? NaN).toFixed(0).padStart(3)} ${String(r.inversions || 0).padStart(2)}  ${(r.pop / DT).toFixed(0).padStart(8)}   ${land}`);
      out[`${ground}:${label}`] = { ...r, dAir, dApex, dDist };
      const X = SHAPE[label];
      if (X && ground === 'flat') {
        const tag = `${type} ${label}`;
        if (X.tilt) expect(r.maxTilt >= X.tilt[0] && r.maxTilt <= X.tilt[1], `${tag}: deepest tilt ${r.maxTilt.toFixed(0)}° outside ${X.tilt.join('–')}°`);
        if (X.inv) expect((r.inversions || 0) === X.inv, `${tag}: ${r.inversions || 0} off-axis passes, expected ${X.inv}`);
        if (X.res) expect((r.coneRes ?? 99) <= X.res, `${tag}: up-axis path ${r.coneRes?.toFixed(1)}° off a clean cone`);
        if (X.parked != null) expect((r.parked || 0) <= X.parked, `${tag}: spin parked ${(r.parked || 0).toFixed(2)} s mid-flip`);
        const res = r.land?.res;
        if (X.land === 'clean') expect(res === 'clean', `${tag}: landed ${res}`);
        if (X.land === 'land') expect(res === 'clean' || res === 'stumble', `${tag}: landed ${res}`);
      }
      if (ground === 'flat' || ground === 'slope') {
        expect(Math.abs(dAir) <= 1, `${type} ${ground} ${label}: air time ${dAir.toFixed(2)}% off the straight air`);
        expect(Math.abs(dDist) <= 1, `${type} ${ground} ${label}: landing point ${dDist.toFixed(2)}% off`);
        expect(Math.abs(dApex) <= Math.max(0.02, 0.01 * b.apex), `${type} ${ground} ${label}: apex ${dApex.toFixed(3)} m off`);
      }
    }
  }
  return out;
}

const res = {};
if (which !== 'snowboard') res.ski = bench('ski');
if (which !== 'ski') res.snowboard = bench('snowboard');
if (VERBOSE) console.log(JSON.stringify(res, (k, v) => (k === 'axes' ? undefined : v), 1).slice(0, 4000));
if (CHECK) {
  if (fails.length) { console.log(`\nFAIL (${fails.length}):\n  ${fails.join('\n  ')}`); process.exit(1); }
  console.log('\nOK: combo checks pass');
}
