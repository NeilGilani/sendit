// A small XPBD rigid-body solver for the crash ragdoll (Müller et al. 2020, "Detailed Rigid Body Simulation
// with Extended Position Based Dynamics"): many fixed sub-steps, one constraint pass each, velocities derived
// from the positions, then a velocity pass for friction, restitution and damping. No external library.
//
//   Body   — mass, diagonal inertia in its own frame (capsule axis = local Y), position x (centre of mass),
//            orientation q, velocities v / w, collision shapes (capsules / spheres) and terrain sample spheres.
//   Joint  — ball (cone swing + twist limits) or hinge (axis + angle limits), plus an optional drive toward a
//            target relative orientation (muscle tone) and relative-spin damping.
//   World  — sub-steps everything; the environment (env) answers height(x, z), obstacles and rails.
//
// Units: metres, kilograms, seconds, radians. Everything is allocation-free per step (module temporaries).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _e = new THREE.Vector3(), _f = new THREE.Vector3(), _g = new THREE.Vector3(), _n = new THREE.Vector3();
const _r0 = new THREE.Vector3(), _r1 = new THREE.Vector3(), _p0 = new THREE.Vector3(), _p1 = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

/** q += ½·s·[d, 0]·q, renormalised (a small rotation d, world frame). */
export function rotateBy(q, d, s = 1) {
  const dx = d.x * s * 0.5, dy = d.y * s * 0.5, dz = d.z * s * 0.5;
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  q.x = qx + dx * qw + dy * qz - dz * qy;
  q.y = qy + dy * qw + dz * qx - dx * qz;
  q.z = qz + dz * qw + dx * qy - dy * qx;
  q.w = qw - dx * qx - dy * qy - dz * qz;
  const l = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
  q.x /= l; q.y /= l; q.z /= l; q.w /= l;
}

/** Rotation vector (axis · angle) of a unit quaternion, shortest way round. */
export function rotVec(q, out) {
  let x = q.x, y = q.y, z = q.z, w = q.w;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.sqrt(x * x + y * y + z * z);
  if (s < 1e-9) return out.set(2 * x, 2 * y, 2 * z);
  const ang = 2 * Math.atan2(s, w);
  return out.set(x / s * ang, y / s * ang, z / s * ang);
}

export class Body {
  /**
   * @param {object} o { name, mass, inertia: Vector3 (diag, body frame), x, q, group, mu, muS, plough, ploughSpin, e }
   */
  constructor(o) {
    this.name = o.name;
    this.m = o.mass;
    this.invM = o.mass > 0 ? 1 / o.mass : 0;
    this.I = o.inertia.clone();
    this.invI = new THREE.Vector3(1 / o.inertia.x, 1 / o.inertia.y, 1 / o.inertia.z);
    this.x = o.x.clone(); this.q = o.q.clone().normalize();
    this.v = new THREE.Vector3(); this.w = new THREE.Vector3();
    this.xp = new THREE.Vector3(); this.qp = new THREE.Quaternion();   // at the start of the sub-step
    this.xs = this.x.clone(); this.qs = this.q.clone();                  // at seed (rigid attachments)
    this.xr = this.x.clone(); this.qr = this.q.clone();                  // at the start of the last frame step (render interpolation)
    this.shapes = [];     // { kind: 'c' | 's', a, b (local), r } — capsules (a→b) and spheres (a)
    this.samples = [];    // { p (local), r } — spheres tested against terrain / obstacles / rails
    this.group = o.group || 0;
    this.mu = o.mu ?? 0.5; this.muS = o.muS ?? 0.7; this.plough = o.plough ?? 0; this.ploughSpin = o.ploughSpin ?? 0; this.e = o.e ?? 0.1;
    this.touch = 0;       // contacts this sub-step
    this.touchN = new THREE.Vector3();
  }

  /** World offset of a local point (rotated, not translated). */
  offset(local, out) { return out.copy(local).applyQuaternion(this.q); }
  /** World position of a local point. */
  point(local, out) { return out.copy(local).applyQuaternion(this.q).add(this.x); }

  /** World inverse inertia R·I⁻¹·Rᵀ for this sub-step (orientation at its start: it turns by milliradians). */
  updateInertia() {
    const { x, y, z, w } = this.q, M = this.Iw || (this.Iw = new Float64Array(9)), d = this.invI;
    const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    const r00 = 1 - 2 * (yy + zz), r01 = 2 * (xy - wz), r02 = 2 * (xz + wy);
    const r10 = 2 * (xy + wz), r11 = 1 - 2 * (xx + zz), r12 = 2 * (yz - wx);
    const r20 = 2 * (xz - wy), r21 = 2 * (yz + wx), r22 = 1 - 2 * (xx + yy);
    M[0] = r00 * r00 * d.x + r01 * r01 * d.y + r02 * r02 * d.z;
    M[1] = r00 * r10 * d.x + r01 * r11 * d.y + r02 * r12 * d.z;
    M[2] = r00 * r20 * d.x + r01 * r21 * d.y + r02 * r22 * d.z;
    M[4] = r10 * r10 * d.x + r11 * r11 * d.y + r12 * r12 * d.z;
    M[5] = r10 * r20 * d.x + r11 * r21 * d.y + r12 * r22 * d.z;
    M[8] = r20 * r20 * d.x + r21 * r21 * d.y + r22 * r22 * d.z;
    M[3] = M[1]; M[6] = M[2]; M[7] = M[5];
  }

  /** out = I⁻¹ · v (world frame). */
  invIw(v, out) {
    const M = this.Iw;
    if (!M) { this.updateInertia(); return this.invIw(v, out); }
    const vx = v.x, vy = v.y, vz = v.z;
    return out.set(M[0] * vx + M[1] * vy + M[2] * vz, M[3] * vx + M[4] * vy + M[5] * vz, M[6] * vx + M[7] * vy + M[8] * vz);
  }

  /** Generalised inverse mass for a correction along unit n at world offset r. */
  wPos(r, n) {
    _e.crossVectors(r, n);
    this.invIw(_e, _f);
    return this.invM + _e.dot(_f);
  }
  /** … for a rotation about unit n. */
  wRot(n) { this.invIw(n, _f); return n.dot(_f); }

  /** Positional impulse s·n at world offset r. */
  pushPos(r, n, s) {
    this.x.addScaledVector(n, s * this.invM);
    _e.crossVectors(r, n).multiplyScalar(s);
    this.invIw(_e, _f);
    rotateBy(this.q, _f, 1);
  }
  /** Angular impulse s·n (positional pass). */
  pushRot(n, s) {
    _e.copy(n).multiplyScalar(s);
    this.invIw(_e, _f);
    rotateBy(this.q, _f, 1);
  }
  /** Velocity impulse p at world offset r. */
  impulse(r, p) {
    this.v.addScaledVector(p, this.invM);
    _e.crossVectors(r, p);
    this.invIw(_e, _f);
    this.w.add(_f);
  }
  /** Velocity of a world offset r. */
  velAt(r, out) { return out.crossVectors(this.w, r).add(this.v); }

  energy(g) {
    _q2.set(-this.q.x, -this.q.y, -this.q.z, this.q.w);
    _b.copy(this.w).applyQuaternion(_q2);
    const rot = 0.5 * (this.I.x * _b.x * _b.x + this.I.y * _b.y * _b.y + this.I.z * _b.z * _b.z);
    return 0.5 * this.m * this.v.lengthSq() + rot + this.m * g * this.x.y;
  }
}

/** Capsule inertia (axis = local Y): solid cylinder of length L + r, radius r. */
export function capsuleInertia(m, r, L) {
  const Lc = L + r;
  const ax = 0.5 * m * r * r, perp = m * (3 * r * r + Lc * Lc) / 12;
  const lo = m * 0.006;    // floor (radius of gyration ≥ 8 cm): tiny inertias make stiff joints ring
  return new THREE.Vector3(Math.max(perp, lo), Math.max(ax, lo), Math.max(perp, lo));
}

/**
 * Joint between parent b0 and child b1.
 * o = { type: 'ball' | 'hinge', r0, r1 (anchors, local), name,
 *       ball:  aP, aC (cone axes), cone (rad), tP, tC (twist refs ⟂ the axes), twist (rad, ±)
 *       hinge: hP, hC (axes), refP, refC (⟂ refs, aligned at angle 0), min, max (rad)
 *       drive: { qT (child orientation in the parent frame), k (N·m/rad, 0 = off) }, damp (1/s) }
 */
export class Joint {
  constructor(b0, b1, o) {
    Object.assign(this, o);
    this.b0 = b0; this.b1 = b1;
    this.k = o.drive?.k || 0;
    this.qT = o.drive?.qT ? o.drive.qT.clone() : null;
    this.damp = o.damp || 0;
  }
}

export class World {
  constructor(env, C) {
    this.env = env;          // { height(x, z), normal(x, z, out), obstacles: [{x, z, r, y0, y1}], rails: [{a, b, r}] }
    this.C = C;
    this.h = C.substep;
    this.g = C.gravity;
    this.bodies = [];
    this.joints = [];
    this.pairs = [];         // self-collision [bodyA, shapeA, bodyB, shapeB]
    this.contacts = [];      // pool; this sub-step's are [0, nc): { b, r (world offset), n, lam, vn, mu, e }
    this.nc = 0;
    this.pc = []; this.np = 0;   // self-contacts this sub-step
    this.rec = true;             // record contacts (the second snow pass doesn't)
    this.groups = new Map(); // group → { asleep, still }
    this.t = 0;
    this.ticks = 0;
    this.acc = 0;
    this.failed = false;
    this.impact = 0;         // largest approach speed into the snow / an obstacle since last read (group 0)
    this.impactAt = new THREE.Vector3();
    this.handTouch = false;  // a hand touched something (bracing ends)
    this.snow = new Map();   // key → { b, gear, p (sum), n, imp }: snow contacts since the last snowContacts() read
    this.stats = { substeps: 0 };
  }

  add(b) { this.bodies.push(b); if (!this.groups.has(b.group)) this.groups.set(b.group, { asleep: false, still: 0 }); b.G = this.groups.get(b.group); return b; }
  joint(j) { this.joints.push(j); return j; }
  asleep(group) { return this.groups.get(group)?.asleep ?? true; }

  /** Advance dt seconds in fixed sub-steps (any dt: 1/30, 1/60, 1/144 give the same trajectory). */
  /** pre(world) runs before every sub-step (muscle tone, obstacle refresh): same sequence for any dt. */
  step(dt, pre) {
    if (this.failed) return 0;
    this.acc += dt;
    let n = Math.floor(this.acc / this.h + 1e-6);
    if (n > this.C.maxSubsteps) { n = this.C.maxSubsteps; this.acc = 0; }
    else this.acc -= n * this.h;
    if (this.acc < 0) this.acc = 0;
    for (let i = 0; i < n && !this.failed; i++) { pre?.(this); this.substep(this.h); }
    return n;
  }

  substep(h) {
    const C = this.C, g = this.g;
    this.ticks++; this.t = this.ticks * h; this.stats.substeps++;
    const damp = Math.max(0, 1 - C.airDrag * h);
    for (const b of this.bodies) {
      if (b.G.asleep) continue;
      b.xp.copy(b.x); b.qp.copy(b.q);
      b.v.y -= g * h;
      b.v.multiplyScalar(damp);
      b.x.addScaledVector(b.v, h);
      rotateBy(b.q, b.w, h);
      b.updateInertia();
      b.touch = 0; b.touchN.set(0, 0, 0);
    }
    this.nc = 0;
    // A hinge the crash found outside its range (an animated elbow / knee) is let back in gently: its range was
    // widened to the starting angle and closes at limitEase rad/s (snapping it in one sub-step whips the limb).
    if (this.easing) {
      let any = false;
      const r = (C.limitEase ?? 2) * h;
      for (const j of this.joints) {
        if (j.min0 === undefined) continue;
        if (j.min < j.min0) { j.min = Math.min(j.min0, j.min + r); any = true; }
        if (j.max > j.max0) { j.max = Math.max(j.max0, j.max - r); any = true; }
      }
      this.easing = any;
    }
    // --- positions: joints (anchors, limits, drives), self-collision, then the world (priority)
    for (const j of this.joints) if (!j.b1.G.asleep) this.solveJoint(j, h);
    this.np = 0;
    for (const p of this.pairs) this.solvePair(p);
    for (const b of this.bodies) if (!b.G.asleep) this.collide(b, h);
    // More rounds of joints (anchors + limits, no drives) and snow for whatever touches it (positions only; the
    // contacts are recorded): contacts are solved last and stiff, and a hard landing would otherwise leave a joint
    // pulled apart or past its limit for a frame. The anchors get the last word (closed loops: the board, legs).
    for (let it = 0; it < C.iterations; it++) {
      for (const j of this.joints) if (!j.b1.G.asleep) this.solveJoint(j, h, true);
      this.rec = false;
      for (const b of this.bodies) if (b.touch && !b.G.asleep) this.collide(b, h);
      this.rec = true;
    }
    for (const j of this.joints) if (!j.b1.G.asleep) this.solveJoint(j, h, true);
    for (const j of this.joints) if (!j.b1.G.asleep) this.anchor(j, h);
    // --- velocities from the positions
    const ih = 1 / h;
    for (const b of this.bodies) {
      if (b.G.asleep) continue;
      b.v.subVectors(b.x, b.xp).multiplyScalar(ih);
      _q.copy(b.q).multiply(_q2.set(-b.qp.x, -b.qp.y, -b.qp.z, b.qp.w));
      const s = _q.w < 0 ? -2 * ih : 2 * ih;
      b.w.set(_q.x * s, _q.y * s, _q.z * s);
    }
    // --- velocity pass: friction, restitution, snow drag, joint damping
    // (a body lying on the snow doesn't glide on the bases of the skis it still has on: they're on their edges,
    // across, dragged — only a rider still on them slides along them)
    this.trunkDown = false;
    for (const b of this.bodies) if (b.isTrunk && b.touch && b.group === 0) this.trunkDown = true;
    for (let i = 0; i < this.nc; i++) this.contactVel(this.contacts[i], h);
    for (let i = 0; i < this.np; i++) this.pairVel(this.pc[i]);
    const digDecay = Math.exp(-(C.digDecay ?? 0) * h);
    for (const b of this.bodies) {
      if (b.G.asleep) continue;
      b.dig = (b.dig || 0) * digDecay;
      if (!b.touch) continue;
      const n = _n.copy(b.touchN).normalize();
      const vn = b.v.dot(n);
      // Snow drag while touching: ploughing, plus the hole a hard hit dug (b.dig, from the approach speeds).
      const k = Math.min(1, (b.plough + (C.ploughDig || 0) * Math.min(b.dig, C.digMax ?? 1e9)) * h);
      b.v.addScaledVector(_a.copy(b.v).addScaledVector(n, -vn), -k);
      b.w.multiplyScalar(Math.max(0, 1 - b.ploughSpin * h));
    }
    for (const j of this.joints) if (j.damp > 0 && !j.b1.G.asleep) this.dampJoint(j, h);
    // Settling: once a group is crawling (its centre of mass slower than settleSpeed, touching something), it
    // loses what's left quickly instead of creeping for seconds (people come to rest, gear stops wobbling).
    this.settling = false;
    for (const [gid, G] of this.groups) {
      if (G.asleep) continue;
      let touch = false, m = 0;
      _a.set(0, 0, 0);
      for (const b of this.bodies) if (b.group === gid) { _a.addScaledVector(b.v, b.m); m += b.m; if (b.touch) touch = true; }
      if (!touch || _a.length() / m > C.settleSpeed) continue;
      if (gid === 0) this.settling = true;
      // (only the wobble: spins and motion relative to the centre of mass; a body sliding off something keeps
      // sliding at gravity's pace instead of creeping through treacle)
      const k = Math.max(0, 1 - C.settleRate * h);
      _a.divideScalar(m);
      for (const b of this.bodies) if (b.group === gid) { b.v.sub(_a).multiplyScalar(k).add(_a); b.w.multiplyScalar(k); }
    }
    // Energy budget (group 0): muscle tone may move limbs but never adds energy beyond the crash's own
    // (World.budget is set from the seeded state); anything above it is taken out of the motion.
    if (this.budget !== undefined && !this.groups.get(0).asleep) {
      let ke = 0, pe = 0;
      for (const b of this.bodies) if (b.group === 0) { const e = b.energy(g), p = b.m * g * b.x.y; pe += p; ke += e - p; }
      if (ke + pe > this.budget && ke > 1e-9) {
        const k = Math.sqrt(Math.max(0, this.budget - pe) / ke);
        for (const b of this.bodies) if (b.group === 0) { b.v.multiplyScalar(k); b.w.multiplyScalar(k); }
        this.stats.budgetHits = (this.stats.budgetHits || 0) + 1;
      }
    }
    if (this.gov && !this.groups.get(0).asleep) this.govern(h);
    // --- safety, sleep
    for (const b of this.bodies) {
      const vl = b.v.length(), wl = b.w.length();
      if (!(Number.isFinite(vl) && Number.isFinite(wl) && Number.isFinite(b.x.x + b.x.y + b.x.z + b.q.w))) { this.fail(); return; }
      if (vl > C.maxSpeed) b.v.multiplyScalar(C.maxSpeed / vl);
      if (wl > C.maxSpin) b.w.multiplyScalar(C.maxSpin / wl);
    }
    for (const [gid, G] of this.groups) {
      if (G.asleep) continue;
      // Still: every piece slow — or the whole body at rest (centre of mass crawling) with only a limb
      // finishing a small swing (it would take seconds to die out against the joint and self-contacts).
      let still = true, loose = true, m = 0;
      _a.set(0, 0, 0);
      for (const b of this.bodies) {
        if (b.group !== gid) continue;
        const vl = b.v.length(), wl = b.w.length();
        if (vl > C.sleepSpeed || wl > C.sleepSpin) still = false;
        if (vl > 2 * C.sleepSpeed || wl > 2.5 * C.sleepSpin) loose = false;
        _a.addScaledVector(b.v, b.m); m += b.m;
      }
      if (!still && loose && _a.length() / m < C.sleepSpeed * 0.3) still = true;
      G.still = still ? G.still + h : 0;
      if (G.still > C.sleepTime) {
        G.asleep = true;
        for (const b of this.bodies) if (b.group === gid) { b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
      }
    }
  }

  /** The group's rotation as a whole: ω = I⁻¹·L about its centre of mass (null if degenerate). Leaves the centre in this._govC. */
  rigidOmega(group, out) {
    let m = 0;
    const c = (this._govC ||= new THREE.Vector3()).set(0, 0, 0), P = _b.set(0, 0, 0);
    for (const b of this.bodies) if (b.group === group) { c.addScaledVector(b.x, b.m); P.addScaledVector(b.v, b.m); m += b.m; }
    c.divideScalar(m); P.divideScalar(m);
    // L about the centre of mass and the whole-body inertia tensor (world).
    const L = _c.set(0, 0, 0), I = this._govI || (this._govI = new Float64Array(9));
    I.fill(0);
    for (const b of this.bodies) {
      if (b.group !== group) continue;
      const r = _d.subVectors(b.x, c), vr = _e.subVectors(b.v, P);
      L.x += b.m * (r.y * vr.z - r.z * vr.y); L.y += b.m * (r.z * vr.x - r.x * vr.z); L.z += b.m * (r.x * vr.y - r.y * vr.x);
      // R·I·Rᵀ (body inertia, diagonal in its frame) + parallel axis
      const { x, y, z, w } = b.q, dI = b.I;
      const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - w * z), r02 = 2 * (x * z + w * y);
      const r10 = 2 * (x * y + w * z), r11 = 1 - 2 * (x * x + z * z), r12 = 2 * (y * z - w * x);
      const r20 = 2 * (x * z - w * y), r21 = 2 * (y * z + w * x), r22 = 1 - 2 * (x * x + y * y);
      const X = dI.x, Y = dI.y, Z = dI.z, M = b.m, rr = r.lengthSq(), rx = r.x, ry = r.y, rz = r.z;
      const i00 = r00 * r00 * X + r01 * r01 * Y + r02 * r02 * Z + M * (rr - rx * rx);
      const i01 = r00 * r10 * X + r01 * r11 * Y + r02 * r12 * Z - M * rx * ry;
      const i02 = r00 * r20 * X + r01 * r21 * Y + r02 * r22 * Z - M * rx * rz;
      const i11 = r10 * r10 * X + r11 * r11 * Y + r12 * r12 * Z + M * (rr - ry * ry);
      const i12 = r10 * r20 * X + r11 * r21 * Y + r12 * r22 * Z - M * ry * rz;
      const i22 = r20 * r20 * X + r21 * r21 * Y + r22 * r22 * Z + M * (rr - rz * rz);
      I[0] += i00; I[1] += i01; I[2] += i02; I[3] += i01; I[4] += i11; I[5] += i12; I[6] += i02; I[7] += i12; I[8] += i22;
      // spin of the body itself: L += I_b·w_b
      const wb = _f.copy(b.w).applyQuaternion(_q.set(-x, -y, -z, w));
      _g.set(dI.x * wb.x, dI.y * wb.y, dI.z * wb.z).applyQuaternion(b.q);
      L.add(_g);
    }
    // ω = I⁻¹ L (3×3 inverse by cofactors)
    const a = I[0], b2 = I[1], c2 = I[2], d = I[4], e = I[5], f = I[8];
    const A = d * f - e * e, B = c2 * e - b2 * f, Cc = b2 * e - c2 * d;
    const det = a * A + b2 * B + c2 * Cc;
    if (!(det > 1e-9)) return null;
    const D2 = a * f - c2 * c2, E = b2 * c2 - a * e, F = a * d - b2 * b2;
    return out.set((A * L.x + B * L.y + Cc * L.z) / det, (B * L.x + D2 * L.y + E * L.z) / det, (Cc * L.x + E * L.y + F * L.z) / det);
  }

  /**
   * Tumble governor (group 0; World.gov = { cap, budget, ground }): the body's rotation as a whole — ω = I⁻¹·L, its
   * angular momentum about the centre of mass over the whole-body inertia — is held under `cap` rad/s while it
   * touches something (`ground`: only then; else always), and once the body has turned `budget` rad in all the cap
   * falls to a crawl: a small crash stays a fall onto the side, not a flip. Only that rigid rotation is taken out
   * (limbs keep their own motion, the slide keeps its speed): energy only ever goes down. It stands in for what a
   * real rider does — arms and legs out, edges and hands dug in — that a capsule body can't.
   */
  govern(h) {
    const G = this.gov;
    const om = this.rigidOmega(0, _n), c = this._govC;
    let touch = false;
    for (const b of this.bodies) if (b.group === 0 && b.touch) touch = true;
    if (!om) return;
    const wl = om.length();
    this.turned = (this.turned || 0) + wl * h;
    if (G.ground && !touch) return;
    // The cap: full up to 70 % of the budget, then down to a crawl (0.4 rad/s) at the budget.
    const over = (this.turned - 0.7 * G.budget) / (0.3 * G.budget);
    const cap = over <= 0 ? G.cap : over >= 1 ? 0.4 : G.cap + (0.4 - G.cap) * over * over * (3 - 2 * over);
    if (wl <= cap) return;
    // Take out (1 − cap/|ω|) of the rigid rotation, at most `rate` per second (no visible jolt).
    const k = Math.min(1 - cap / wl, (G.rate ?? 40) * h);
    om.multiplyScalar(k);
    for (const b of this.bodies) {
      if (b.group !== 0) continue;
      b.v.sub(_d.crossVectors(om, _e.subVectors(b.x, c)));
      b.w.sub(om);
    }
    this.stats.govHits = (this.stats.govHits || 0) + 1;
  }

  fail() {
    // Never seen in the fuzz test; if it ever happens, freeze where the last good sub-step was.
    this.failed = true;
    for (const b of this.bodies) { b.x.copy(b.xp); b.q.copy(b.qp); b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
    for (const G of this.groups.values()) G.asleep = true;
  }

  // ------------------------------------------------------------------ constraint primitives
  /** Move the anchors together: b1 by +n, b0 by −n (c ≥ 0 metres). Returns λ. */
  pos(b0, b1, r0, r1, n, c, alpha, h) {
    let w = 0;
    if (b0 && b0.invM) w += b0.wPos(r0, n);
    if (b1 && b1.invM) w += b1.wPos(r1, n);
    if (w <= 1e-12) return 0;
    const dl = c / (w + alpha / (h * h));
    if (b1 && b1.invM) b1.pushPos(r1, n, dl);
    if (b0 && b0.invM) b0.pushPos(r0, n, -dl);
    return dl;
  }

  /** Rotate the child by the rotation vector d (and the parent the other way, by inertia). */
  rot(b0, b1, d, alpha, h) {
    const th = d.length();
    if (th < 1e-9) return 0;
    _n.copy(d).divideScalar(th);
    const w = b0.wRot(_n) + b1.wRot(_n);
    const dl = th / (w + alpha / (h * h));
    const n = _g.copy(_n);
    b1.pushRot(n, dl);
    b0.pushRot(n, -dl);
    return dl;
  }

  anchor(j, h) {
    const b0 = j.b0, b1 = j.b1;
    b0.offset(j.r0, _r0); b1.offset(j.r1, _r1);
    _p0.addVectors(b0.x, _r0); _p1.addVectors(b1.x, _r1);
    _d.subVectors(_p0, _p1);
    const c = _d.length();
    if (c > 1e-7) this.pos(b0, b1, _r0, _r1, _d.divideScalar(c), c, 0, h);
  }

  solveJoint(j, h, noDrive = false) {
    const b0 = j.b0, b1 = j.b1;
    // 1. anchors coincide
    b0.offset(j.r0, _r0); b1.offset(j.r1, _r1);
    _p0.addVectors(b0.x, _r0); _p1.addVectors(b1.x, _r1);
    _d.subVectors(_p0, _p1);
    const c = _d.length();
    if (c > 1e-7) this.pos(b0, b1, _r0, _r1, _d.divideScalar(c), c, 0, h);
    // 2. angular limits
    if (j.type === 'hinge') {
      const a0 = _a.copy(j.hP).applyQuaternion(b0.q), a1 = _b.copy(j.hC).applyQuaternion(b1.q);
      this.rot(b0, b1, _c.crossVectors(a1, a0), 0, h);
      a0.copy(j.hP).applyQuaternion(b0.q);
      const r0 = _b.copy(j.refP).applyQuaternion(b0.q), r1 = _c.copy(j.refC).applyQuaternion(b1.q);
      const phi = Math.atan2(_d.crossVectors(r0, r1).dot(a0), r0.dot(r1));
      if (phi < j.min) this.rot(b0, b1, _d.copy(a0).multiplyScalar(j.min - phi), 0, h);
      else if (phi > j.max) this.rot(b0, b1, _d.copy(a0).multiplyScalar(j.max - phi), 0, h);
    } else {
      const a0 = _a.copy(j.aP).applyQuaternion(b0.q), a1 = _b.copy(j.aC).applyQuaternion(b1.q);
      const cos = Math.max(-1, Math.min(1, a0.dot(a1)));
      const ang = Math.acos(cos);
      if (ang > j.cone) {
        _c.crossVectors(a1, a0);
        let s = _c.length();
        if (s < 1e-6) { _c.set(1, 0, 0).cross(a1); if (_c.lengthSq() < 1e-6) _c.set(0, 0, 1).cross(a1); s = _c.length(); }
        this.rot(b0, b1, _c.multiplyScalar((ang - j.cone) / s), 0, h);
      }
      if (j.twist < Math.PI) {
        a0.copy(j.aP).applyQuaternion(b0.q); a1.copy(j.aC).applyQuaternion(b1.q);
        const n = _c.addVectors(a0, a1);
        if (n.lengthSq() > 1e-6) {
          n.normalize();
          const t0 = _d.copy(j.tP).applyQuaternion(b0.q), t1 = _e.copy(j.tC).applyQuaternion(b1.q);
          t0.addScaledVector(n, -n.dot(t0)); t1.addScaledVector(n, -n.dot(t1));
          if (t0.lengthSq() > 1e-8 && t1.lengthSq() > 1e-8) {
            t0.normalize(); t1.normalize();
            const phi = Math.atan2(_f.crossVectors(t0, t1).dot(n), t0.dot(t1));
            if (phi > j.twist) this.rot(b0, b1, n.multiplyScalar(j.twist - phi), 0, h);
            else if (phi < -j.twist) this.rot(b0, b1, n.multiplyScalar(-j.twist - phi), 0, h);
          }
        }
      }
    }
    // 3. muscle tone: a soft spring toward the target relative orientation
    if (j.k > 0 && j.qT && !noDrive) {
      _q.copy(b0.q).multiply(j.qT).multiply(_q2.set(-b1.q.x, -b1.q.y, -b1.q.z, b1.q.w));
      rotVec(_q, _d);
      // Muscles have a strength limit: far from the target the pull saturates (no whip-crack snap into the tuck).
      const e = _d.length();
      if (j.maxErr && e > j.maxErr) _d.multiplyScalar(j.maxErr / e);
      this.rot(b0, b1, _d, 1 / j.k, h);
    }
  }

  /** Relative spin damping (velocity pass). */
  dampJoint(j, h) {
    const b0 = j.b0, b1 = j.b1;
    // The child's swing is in its centre's velocity too (a pendulum about the joint): damp its velocity relative to
    // where the parent's rigid motion would carry it, as an equal and opposite impulse at the joint.
    if (this.C.swingDamping) {
      b0.offset(j.r0, _r0);
      _p0.addVectors(b0.x, _r0);                       // the joint
      _r1.subVectors(_p0, b1.x);                       // child centre → joint
      _a.subVectors(b1.x, b0.x);
      const vr = _b.crossVectors(b0.w, _a).add(b0.v).sub(b1.v);   // parent-rigid velocity − child velocity (at the child's centre)
      const k = Math.min(1, j.damp * h);
      if (vr.lengthSq() > 1e-10) {
        const p = _c.copy(vr).multiplyScalar(k / (b1.invM + b0.invM));
        b1.v.addScaledVector(p, b1.invM);
        b0.impulse(_d.subVectors(b1.x, b0.x), p.negate());
      }
    }
    _d.subVectors(b1.w, b0.w);
    const s = _d.length();
    if (s < 1e-6) return;
    const n = _n.copy(_d).divideScalar(s);
    const w = b0.wRot(n) + b1.wRot(n);
    const L = s * Math.min(1, j.damp * h) / w;
    b1.invIw(_a.copy(n).multiplyScalar(-L), _b); b1.w.add(_b);
    b0.invIw(_a.copy(n).multiplyScalar(L), _b); b0.w.add(_b);
  }

  /** Two capsules / spheres of the same body never overlap: push apart. */
  solvePair([A, sa, B, sb]) {
    if (A.G.asleep) return;
    // Bounding spheres first (most pairs are far apart): shape centre ± half its length + radius.
    if (sa.c === undefined) for (const sh of [sa, sb]) { sh.c = sh.kind === 'c' ? sh.a.clone().lerp(sh.b, 0.5) : sh.a.clone(); sh.ext = (sh.kind === 'c' ? sh.a.distanceTo(sh.b) / 2 : 0) + sh.r; }
    if (sb.c === undefined) { sb.c = sb.kind === 'c' ? sb.a.clone().lerp(sb.b, 0.5) : sb.a.clone(); sb.ext = (sb.kind === 'c' ? sb.a.distanceTo(sb.b) / 2 : 0) + sb.r; }
    A.point(sa.c, _a); B.point(sb.c, _b);
    const ext = sa.ext + sb.ext;
    if (_a.distanceToSquared(_b) > ext * ext) return;
    A.point(sa.a, _a); A.point(sa.kind === 'c' ? sa.b : sa.a, _b);
    B.point(sb.a, _c); B.point(sb.kind === 'c' ? sb.b : sb.a, _d);
    closestSegSeg(_a, _b, _c, _d, _p0, _p1);
    const dv = _g.subVectors(_p1, _p0), d = dv.length(), R = sa.r + sb.r;
    if (d >= R || d < 1e-7) return;
    dv.divideScalar(d);
    _r0.subVectors(_p0, A.x); _r1.subVectors(_p1, B.x);
    // Approach speed before the push (the velocity pass takes out what the push adds: no bounce, no jitter).
    const vn = _a.crossVectors(B.w, _r1).add(B.v).sub(_b.crossVectors(A.w, _r0).add(A.v)).dot(dv);
    this.pos(A, B, _r0, _r1, dv, R - d, 0, this.h);
    if (this.np < 64) {
      const c = this.pc[this.np] ||= { rA: new THREE.Vector3(), rB: new THREE.Vector3(), n: new THREE.Vector3() };
      this.np++;
      c.A = A; c.B = B; c.n.copy(dv); c.vn = vn;
      c.rA.copy(_r0).applyQuaternion(_q.set(-A.q.x, -A.q.y, -A.q.z, A.q.w));   // body-local (re-rotated in the velocity pass)
      c.rB.copy(_r1).applyQuaternion(_q.set(-B.q.x, -B.q.y, -B.q.z, B.q.w));
    }
  }

  /** Self-contact velocity: no separating speed beyond what was approaching (restitution 0). */
  pairVel(c) {
    const A = c.A, B = c.B;
    const rA = _r0.copy(c.rA).applyQuaternion(A.q), rB = _r1.copy(c.rB).applyQuaternion(B.q);
    const vrel = _a.crossVectors(B.w, rB).add(B.v).sub(_b.crossVectors(A.w, rA).add(A.v));
    const vn = vrel.dot(c.n);
    const dv = -vn;   // target 0 relative normal speed
    if (Math.abs(dv) < 1e-6) return;
    const w = A.wPos(rA, c.n) + B.wPos(rB, c.n);
    if (w < 1e-12) return;
    const p = _c.copy(c.n).multiplyScalar(dv / w);
    B.impulse(rB, p);
    A.impulse(rA, p.negate());
  }

  // ------------------------------------------------------------------ the world: snow, obstacles, rails
  collide(b, h) {
    const env = this.env, C = this.C;
    for (const s of b.samples) {
      b.point(s.p, _p0);
      const r = s.r;
      // Snow: the height field as a local plane per sample (re-read every 8 sub-steps or 25 cm: terrain
      // queries are the expensive part), distance along its normal.
      if (s.tk === undefined || this.ticks - s.tk >= 8 || Math.abs(_p0.x - s.x0) + Math.abs(_p0.z - s.z0) > 0.25) {
        s.tk = this.ticks; s.x0 = _p0.x; s.z0 = _p0.z; s.h0 = env.height(_p0.x, _p0.z);
        env.normal(_p0.x, _p0.z, _n); s.nx = _n.x; s.ny = _n.y; s.nz = _n.z;
        this.stats.queries = (this.stats.queries || 0) + 5;
      }
      const dist = s.nx * (_p0.x - s.x0) + s.ny * (_p0.y - s.h0) + s.nz * (_p0.z - s.z0);
      const pen = r - dist;
      if (pen > 0) {
        if (pen > C.wallPen) {
          // A step in the height field (a kicker's side, a roof edge) met sideways: a wall, not a floor.
          // Where was this sample at the start of the sub-step?
          _p1.copy(s.p).applyQuaternion(b.qp).add(b.xp);
          const prevGap = _p1.y - env.height(_p1.x, _p1.z);
          if (prevGap > -0.05) {
            b.x.x = b.xp.x; b.x.z = b.xp.z; s.tk = undefined;
            // Back where it came from: whatever is still under the snow there is an ordinary contact.
            b.point(s.p, _p0);
            const H2 = env.height(_p0.x, _p0.z), pen2 = r - (_p0.y - H2) * s.ny;
            if (pen2 > 0 && pen2 <= C.wallPen) this.contact(b, _p0, _n.set(s.nx, s.ny, s.nz), r, pen2, s.mu ?? b.mu, s.muS ?? b.muS, b.e, h, s);
            continue;
          }
          // Already deep (started underground): ease out without gaining speed.
          const lift = Math.min(pen, 0.01);
          b.x.y += lift; b.xp.y += lift;
          continue;
        }
        this.contact(b, _p0, _n.set(s.nx, s.ny, s.nz), r, pen, s.mu ?? b.mu, s.muS ?? b.muS, b.e, h, s);
      }
      // Obstacles: trunks / posts are vertical cylinders from the snow to their top; rocks are domes (a sphere of
      // the rock's radius whose top is the rock's top: smooth, no corner for a limb to rattle on).
      for (const o of env.obstacles) {
        const dx = _p0.x - o.x, dz = _p0.z - o.z, R = o.r + r;
        if (dx * dx + dz * dz >= R * R || _p0.y > o.y1 + r || _p0.y < o.y0 - 1) continue;
        if (o.cap) {
          const dy = _p0.y - (o.y1 - o.r), d = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (d >= R || d < 1e-6) continue;
          this.contact(b, _p0, _g.set(dx / d, dy / d, dz / d), r, R - d, C.muBark, C.muBark, 0.1, h);
          continue;
        }
        // Push out the side the sample came from (no tunnelling through a trunk in one sub-step).
        _p1.copy(s.p).applyQuaternion(b.qp).add(b.xp);
        let nx = _p1.x - o.x, nz = _p1.z - o.z;
        const dp = Math.sqrt(nx * nx + nz * nz);
        if (dp > 1e-6) { nx /= dp; nz /= dp; } else { const d = Math.sqrt(dx * dx + dz * dz) || 1; nx = dx / d; nz = dz / d; }
        this.contact(b, _p0, _g.set(nx, 0, nz), r, R - (nx * dx + nz * dz), C.muBark, C.muBark, 0.15, h);
      }
      // Rails / boxes: capsules along their top line.
      for (const rl of env.rails) {
        closestPointSeg(_p0, rl.a, rl.b, _p1);
        const dv = _c.subVectors(_p0, _p1), d = dv.length(), R = rl.r + r;
        if (d >= R || d < 1e-6) continue;
        dv.divideScalar(d);
        this.contact(b, _p0, dv, r, R - d, 0.25, 0.3, 0.2, h);
      }
    }
  }

  /** One contact against the static world at sample centre p (sphere radius r), normal n, depth pen. */
  contact(b, p, n, r, pen, mu, muS, e, h, smp = null) {
    const nn = _b.copy(n);

    const rr = _r0.copy(p).addScaledVector(nn, -r).sub(b.x);
    // Approach speed before this sub-step (restitution, impact events).
    const vn = _a.crossVectors(b.w, rr).add(b.v).dot(nn);
    const loc = _r1.copy(rr).applyQuaternion(_q.set(-b.q.x, -b.q.y, -b.q.z, b.q.w));   // body-local contact point
    const lam = this.pos(null, b, null, rr, nn, pen, 0, h);
    // Static friction: the contact point stays where it was if its sideways slip is within μs · the push.
    const slip = _c.copy(loc).applyQuaternion(b.q).add(b.x).sub(_p1.copy(loc).applyQuaternion(b.qp).add(b.xp));
    slip.addScaledVector(nn, -slip.dot(nn));
    const sl = slip.length();
    if (sl > 1e-9 && sl < muS * pen) this.pos(null, b, null, _r0.copy(loc).applyQuaternion(b.q), slip.divideScalar(-sl), sl, 0, h);
    if (!this.rec) {
      // A later snow pass of the same sub-step: its push is part of this contact's normal impulse (friction).
      if (smp && smp.cTick === this.ticks) smp.cRec.lam += lam;
      return;
    }
    b.touch++; b.touchN.add(nn);
    if (smp) {
      // Snow contacts since the controller last read them (snow marks / spray only where something touches):
      // one entry per body (or per strapped-on ski), averaged contact point, hardest approach speed.
      const key = smp.gear || b.name;
      let e2 = this.snow.get(key);
      if (!e2) this.snow.set(key, e2 = { key, b, gear: smp.gear || null, p: new THREE.Vector3(), n: 0, imp: 0 });
      if (e2.n === 0) { e2.p.set(0, 0, 0); e2.imp = 0; }
      e2.p.add(_c.copy(p).addScaledVector(nn, -r));
      e2.n++;
      if (-vn > e2.imp) e2.imp = -vn;
    }
    if (this.nc < 256) {
      const c = this.contacts[this.nc] ||= { r: new THREE.Vector3(), n: new THREE.Vector3() };
      this.nc++;
      c.b = b; c.r.copy(loc).applyQuaternion(b.q); c.n.copy(nn); c.lam = lam; c.vn = vn; c.mu = mu; c.e = e;
      c.ax = smp?.axis || null; c.muA = smp?.muAlong ?? mu; c.muS = smp ? muS : mu;
      if (smp) { smp.cTick = this.ticks; smp.cRec = c; }
    }
    if (b.group === 0 && -vn > this.impact) { this.impact = -vn; this.impactAt.copy(p); }
    if (smp && -vn > (b.dig || 0)) b.dig = -vn;
    if (b.isHand || (b.isTrunk && b.group === 0)) this.handTouch = true;   // (bracing ends once a hand or the trunk is down)
  }

  contactVel(c, h) {
    const b = c.b;
    if (b.G.asleep) return;
    const v = b.velAt(c.r, _a);
    const vn = v.dot(c.n);
    const vt = _b.copy(v).addScaledVector(c.n, -vn);
    const vtl = vt.length();
    const dv = _c.set(0, 0, 0);
    // Coulomb: the friction impulse is at most μ · the normal impulse (λ / h); as a speed change at this point
    // that is μ · λ / h · w_t (the generalised inverse mass along the slip). A slam counts as at most
    // impactGrip m/s into the snow: the snow gives way, the body doesn't stop dead on its first hit.
    if (vtl > 1e-9) {
      const wt = b.wPos(c.r, _d.copy(vt).divideScalar(vtl));
      // Slow slides grip more (the body settles into the snow): μ rises toward the static μ under slowGrip m/s.
      const sg = this.C.slowGrip || 0;
      let mu = sg > 0 && vtl < sg ? c.muS + (c.mu - c.muS) * (vtl / sg) * (2 - vtl / sg) : c.mu;
      if (c.ax && !(this.trunkDown && this.C.skiDragDown)) {
        // A ski base: slides along its length (muA), its edge bites across it (mu).
        const ca = _e.copy(c.ax).applyQuaternion(b.q).dot(_d), c2 = ca * ca;
        mu = c.muA * c2 + mu * (1 - c2);
      }
      dv.addScaledVector(vt, -Math.min(mu * Math.min(Math.abs(c.lam) * wt / h, this.C.impactGrip ?? 1e9), vtl) / vtl);
    }
    const target = c.vn < -2 * this.g * h ? Math.max(-c.e * c.vn, 0) : 0;
    dv.addScaledVector(c.n, target - vn);
    const m = dv.length();
    if (m < 1e-9) return;
    const d = _d.copy(dv).divideScalar(m);
    const w = b.wPos(c.r, d);
    b.impulse(c.r, d.multiplyScalar(m / w));
  }

  // ------------------------------------------------------------------ measurements
  energy(group = 0) {
    let E = 0;
    for (const b of this.bodies) if (b.group === group) E += b.energy(this.g);
    return E;
  }
  com(group, out) {
    out.set(0, 0, 0);
    let m = 0;
    for (const b of this.bodies) if (b.group === group) { out.addScaledVector(b.x, b.m); m += b.m; }
    return m ? out.divideScalar(m) : out;
  }
  comVel(group, out) {
    out.set(0, 0, 0);
    let m = 0;
    for (const b of this.bodies) if (b.group === group) { out.addScaledVector(b.v, b.m); m += b.m; }
    return m ? out.divideScalar(m) : out;
  }
  /** Largest anchor separation of any joint (m). */
  stretch() {
    let s = 0;
    for (const j of this.joints) {
      j.b0.point(j.r0, _p0); j.b1.point(j.r1, _p1);
      const d = _p0.distanceTo(_p1);
      if (d > s) { s = d; this.stretchName = j.name; }
    }
    return s;
  }
  /** Hinge angle (rad) as the limits see it. */
  hingeAngle(j) {
    const a0 = _a.copy(j.hP).applyQuaternion(j.b0.q);
    const r0 = _b.copy(j.refP).applyQuaternion(j.b0.q), r1 = _c.copy(j.refC).applyQuaternion(j.b1.q);
    return Math.atan2(_d.crossVectors(r0, r1).dot(a0), r0.dot(r1));
  }
  /** Widen every hinge's range to include its starting angle (it closes again at C.limitEase rad/s). */
  easeLimits() {
    for (const j of this.joints) {
      if (j.type !== 'hinge') continue;
      const phi = this.hingeAngle(j);
      j.min0 = j.min; j.max0 = j.max;
      if (phi < j.min) { j.min = phi; this.easing = true; }
      if (phi > j.max) { j.max = phi; this.easing = true; }
    }
  }

  /** Largest joint-limit violation (rad). */
  limitViolation() {
    let worst = 0;
    for (const j of this.joints) {
      const b0 = j.b0, b1 = j.b1;
      if (j.type === 'hinge') {
        const a0 = _a.copy(j.hP).applyQuaternion(b0.q), a1 = _b.copy(j.hC).applyQuaternion(b1.q);
        worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, a0.dot(a1)))));
        const r0 = _b.copy(j.refP).applyQuaternion(b0.q), r1 = _c.copy(j.refC).applyQuaternion(b1.q);
        const phi = Math.atan2(_d.crossVectors(r0, r1).dot(a0), r0.dot(r1));
        const v = Math.max(j.min - phi, phi - j.max);
        if (v > worst) { worst = v; this.limitName = j.name; }
      } else {
        const a0 = _a.copy(j.aP).applyQuaternion(b0.q), a1 = _b.copy(j.aC).applyQuaternion(b1.q);
        const v = Math.acos(Math.max(-1, Math.min(1, a0.dot(a1)))) - j.cone;
        if (v > worst) { worst = v; this.limitName = j.name; }
      }
    }
    return worst;
  }
}

// ------------------------------------------------------------------ geometry helpers
export function closestPointSeg(p, a, b, out) {
  _f.subVectors(b, a);
  const L2 = _f.lengthSq();
  const t = L2 > 1e-12 ? Math.max(0, Math.min(1, _g.subVectors(p, a).dot(_f) / L2)) : 0;
  return out.copy(a).addScaledVector(_f, t);
}

/** Closest points between segments p1–q1 and p2–q2 (Ericson, Real-Time Collision Detection 5.1.9). */
export function closestSegSeg(p1, q1, p2, q2, c1, c2) {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s, t;
  if (a <= 1e-12 && e <= 1e-12) { s = 0; t = 0; }
  else if (a <= 1e-12) { s = 0; t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
    else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  c1.set(p1.x + d1x * s, p1.y + d1y * s, p1.z + d1z * s);
  c2.set(p2.x + d2x * t, p2.y + d2y * t, p2.z + d2z * t);
}

export { UP };
