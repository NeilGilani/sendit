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
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  q.x /= l; q.y /= l; q.z /= l; q.w /= l;
}

/** Rotation vector (axis · angle) of a unit quaternion, shortest way round. */
export function rotVec(q, out) {
  let x = q.x, y = q.y, z = q.z, w = q.w;
  if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
  const s = Math.hypot(x, y, z);
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

  /** out = I⁻¹ · v (world frame). */
  invIw(v, out) {
    const q = this.q;
    _q2.set(-q.x, -q.y, -q.z, q.w);
    out.copy(v).applyQuaternion(_q2).multiply(this.invI).applyQuaternion(q);
    return out;
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
    this.groups = new Map(); // group → { asleep, still }
    this.t = 0;
    this.ticks = 0;
    this.acc = 0;
    this.failed = false;
    this.impact = 0;         // largest approach speed into the snow / an obstacle since last read (group 0)
    this.impactAt = new THREE.Vector3();
    this.handTouch = false;  // a hand touched something (bracing ends)
    this.stats = { substeps: 0 };
  }

  add(b) { this.bodies.push(b); if (!this.groups.has(b.group)) this.groups.set(b.group, { asleep: false, still: 0 }); return b; }
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
      if (this.groups.get(b.group).asleep) continue;
      b.xp.copy(b.x); b.qp.copy(b.q);
      b.v.y -= g * h;
      b.v.multiplyScalar(damp);
      b.x.addScaledVector(b.v, h);
      rotateBy(b.q, b.w, h);
      b.touch = 0; b.touchN.set(0, 0, 0);
    }
    this.nc = 0;
    // --- positions: joints (anchors, limits, drives), self-collision, then the world (priority)
    for (const j of this.joints) if (!this.groups.get(j.b1.group).asleep) this.solveJoint(j, h);
    this.np = 0;
    for (const p of this.pairs) this.solvePair(p);
    for (const b of this.bodies) if (!this.groups.get(b.group).asleep) this.collide(b, h);
    // A second joint pass (anchors + limits, no drives): contacts are solved last and stiff, and a hard impact
    // would otherwise leave the joints stretched / past their limits for that sub-step.
    for (const j of this.joints) if (!this.groups.get(j.b1.group).asleep) this.solveJoint(j, h, true);
    // --- velocities from the positions
    const ih = 1 / h;
    for (const b of this.bodies) {
      if (this.groups.get(b.group).asleep) continue;
      b.v.subVectors(b.x, b.xp).multiplyScalar(ih);
      _q.copy(b.q).multiply(_q2.set(-b.qp.x, -b.qp.y, -b.qp.z, b.qp.w));
      const s = _q.w < 0 ? -2 * ih : 2 * ih;
      b.w.set(_q.x * s, _q.y * s, _q.z * s);
    }
    // --- velocity pass: friction, restitution, snow drag, joint damping
    for (let i = 0; i < this.nc; i++) this.contactVel(this.contacts[i], h);
    for (let i = 0; i < this.np; i++) this.pairVel(this.pc[i]);
    for (const b of this.bodies) {
      if (!b.touch || this.groups.get(b.group).asleep) continue;
      const n = _n.copy(b.touchN).normalize();
      const vn = b.v.dot(n);
      const k = Math.min(1, b.plough * h);
      b.v.addScaledVector(_a.copy(b.v).addScaledVector(n, -vn), -k);
      b.w.multiplyScalar(Math.max(0, 1 - b.ploughSpin * h));
    }
    for (const j of this.joints) if (j.damp > 0 && !this.groups.get(j.b1.group).asleep) this.dampJoint(j, h);
    // Settling: once a group is crawling (its centre of mass slower than settleSpeed, touching something), it
    // loses what's left quickly instead of creeping for seconds (people come to rest, gear stops wobbling).
    for (const [gid, G] of this.groups) {
      if (G.asleep) continue;
      let touch = false, m = 0;
      _a.set(0, 0, 0);
      for (const b of this.bodies) if (b.group === gid) { _a.addScaledVector(b.v, b.m); m += b.m; if (b.touch) touch = true; }
      if (!touch || _a.length() / m > C.settleSpeed) continue;
      const k = Math.max(0, 1 - C.settleRate * h);
      for (const b of this.bodies) if (b.group === gid) { b.v.multiplyScalar(k); b.w.multiplyScalar(k); }
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
    // --- safety, sleep
    for (const b of this.bodies) {
      const vl = b.v.length(), wl = b.w.length();
      if (!(Number.isFinite(vl) && Number.isFinite(wl) && Number.isFinite(b.x.x + b.x.y + b.x.z + b.q.w))) { this.fail(); return; }
      if (vl > C.maxSpeed) b.v.multiplyScalar(C.maxSpeed / vl);
      if (wl > C.maxSpin) b.w.multiplyScalar(C.maxSpin / wl);
    }
    for (const [gid, G] of this.groups) {
      if (G.asleep) continue;
      let still = true;
      for (const b of this.bodies) if (b.group === gid && (b.v.length() > C.sleepSpeed || b.w.length() > C.sleepSpin)) { still = false; break; }
      G.still = still ? G.still + h : 0;
      if (G.still > C.sleepTime) {
        G.asleep = true;
        for (const b of this.bodies) if (b.group === gid) { b.v.set(0, 0, 0); b.w.set(0, 0, 0); }
      }
    }
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
      this.rot(b0, b1, _d, 1 / j.k, h);
    }
  }

  /** Relative spin damping (velocity pass). */
  dampJoint(j, h) {
    const b0 = j.b0, b1 = j.b1;
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
    if (this.groups.get(A.group).asleep) return;
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
      // Snow (height field): distance along the local normal.
      const H = env.height(_p0.x, _p0.z);
      const gap = _p0.y - H;
      if (gap < 2.2 * r + 0.03) {
        const n = env.normal(_p0.x, _p0.z, _n);
        const pen = r - gap * n.y;
        if (pen > 0) {
          if (pen > C.wallPen) {
            // A step in the height field (a kicker's side, a roof edge) met sideways: a wall, not a floor.
            // Where was this sample at the start of the sub-step?
            _p1.copy(s.p).applyQuaternion(b.qp).add(b.xp);
            const prevGap = _p1.y - env.height(_p1.x, _p1.z);
            if (prevGap > -0.05) { b.x.x = b.xp.x; b.x.z = b.xp.z; continue; }
            // Already deep (started underground): ease out without gaining speed.
            const lift = Math.min(pen, 0.01);
            b.x.y += lift; b.xp.y += lift;
            continue;
          }
          this.contact(b, _p0, n, r, pen, b.mu, b.muS, b.e, h);
        }
      }
      // Obstacles: vertical cylinders from the snow to their top (trees, rocks, posts).
      for (const o of env.obstacles) {
        const dx = _p0.x - o.x, dz = _p0.z - o.z, R = o.r + r;
        if (dx * dx + dz * dz >= R * R || _p0.y > o.y1 + r || _p0.y < o.y0 - 1) continue;
        // Push out the side the sample came from (no tunnelling through a trunk in one sub-step).
        _p1.copy(s.p).applyQuaternion(b.qp).add(b.xp);
        let nx = _p1.x - o.x, nz = _p1.z - o.z;
        const dp = Math.hypot(nx, nz);
        if (dp > 1e-6) { nx /= dp; nz /= dp; } else { const d = Math.hypot(dx, dz) || 1; nx = dx / d; nz = dz / d; }
        const penSide = R - (nx * dx + nz * dz);
        const penTop = o.y1 + r - _p0.y;
        if (o.cap && penTop < penSide && penTop < 0.15) this.contact(b, _p0, _g.set(0, 1, 0), r, penTop, C.muBark, C.muBark, 0.1, h);
        else this.contact(b, _p0, _g.set(nx, 0, nz), r, penSide, C.muBark, C.muBark, 0.15, h);
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
  contact(b, p, n, r, pen, mu, muS, e, h) {
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
    b.touch++; b.touchN.add(nn);
    if (this.nc < 256) {
      const c = this.contacts[this.nc] ||= { r: new THREE.Vector3(), n: new THREE.Vector3() };
      this.nc++;
      c.b = b; c.r.copy(loc).applyQuaternion(b.q); c.n.copy(nn); c.lam = lam; c.vn = vn; c.mu = mu; c.e = e;
    }
    if (b.group === 0 && -vn > this.impact) { this.impact = -vn; this.impactAt.copy(p); }
    if (b.isHand) this.handTouch = true;
  }

  contactVel(c, h) {
    const b = c.b;
    if (this.groups.get(b.group).asleep) return;
    const v = b.velAt(c.r, _a);
    const vn = v.dot(c.n);
    const vt = _b.copy(v).addScaledVector(c.n, -vn);
    const vtl = vt.length();
    const dv = _c.set(0, 0, 0);
    if (vtl > 1e-9) dv.addScaledVector(vt, -Math.min(c.mu * Math.abs(c.lam) / h, vtl) / vtl);
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
      s = Math.max(s, _p0.distanceTo(_p1));
    }
    return s;
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
        worst = Math.max(worst, j.min - phi, phi - j.max);
      } else {
        const a0 = _a.copy(j.aP).applyQuaternion(b0.q), a1 = _b.copy(j.aC).applyQuaternion(b1.q);
        worst = Math.max(worst, Math.acos(Math.max(-1, Math.min(1, a0.dot(a1)))) - j.cone);
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
