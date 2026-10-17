// One hero shot's choreography: in-run → pop off the wind lip → the trick over the rock band →
// touchdown in powder → a slash and ride-out. Everything is a function of "real" time t (0 = the
// pop); the screen runs on a speed ramp (real speed on the in-run, easing into deep slow motion just
// before the lip, back to real speed after the landing), like a ski-film hero shot.
// It drives a puppet Player (the real player.js class, no physics) that the real Rider rig
// (rider.js) reads: renderPos / renderOrient, state, squat, grab + grabName, flip / spin rates and
// tucks, landing events, turnInput (lean). It also fires the powder (particles.js).
import * as THREE from 'three';
import { State } from '../player.js';
import { emit } from '../state.js';
import { ANIM } from '../config.js';
import { TRICKS } from './variants.js';

const G = 9.81;
const UP = new THREE.Vector3(0, 1, 0);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Gear orientation: nose along `fwd` (projected on the surface with normal `n`), up = n. */
function orientFrom(fwd, n, out) {
  const z = _v.copy(fwd).multiplyScalar(-1);                 // gear +Z points backwards (nose = −Z)
  const x = _v2.crossVectors(n, z).normalize();
  const zz = _v3.crossVectors(x, n).normalize();
  _m.makeBasis(x, n, zz);
  return out.setFromRotationMatrix(_m);
}

export class Shot {
  /**
   * @param {object} o
   * @param {(x:number,z:number)=>number} o.H  terrain height
   * @param {object} o.line   hero-line geometry (terrain.js makeHeight)
   * @param {string} o.trick  TRICKS key
   * @param {string} o.gear   'ski' | 'snowboard'
   * @param {function} o.r    seeded random (variants.js rng)
   */
  constructor({ H, line, trick, gear, r }) {
    Object.assign(this, { H, line, gear });
    this.trickId = trick;
    this.T = TRICKS[trick];
    const T = this.T;
    this.board = gear === 'snowboard';
    this.speed = r.range(13.5, 16);                        // m/s off the lip
    const ang = (r.range(17, 23) + (T.flip ? 3 : 0)) * Math.PI / 180;
    this.v0 = new THREE.Vector3(r.range(-0.4, 0.4), this.speed * Math.sin(ang), -this.speed * Math.cos(ang));
    this.spinDir = r() < 0.5 ? -1 : 1;
    this.flipDir = 1;                                      // back / corked over the back shoulder
    this.rollDir = r() < 0.5 ? -1 : 1;
    this.slow = r.range(0.24, 0.34);                       // slow-motion rate in the air
    this.slashSide = r() < 0.5 ? -1 : 1;
    this.pivot = ANIM.flipPivot;
    this.p0 = new THREE.Vector3(0, H(0, 0) + this.pivot, 0);   // COM at the pop
    // Touchdown: march the ballistic COM until the feet meet the snow (past the rock band).
    let t = 0.3;
    for (; t < 6; t += 0.004) {
      const p = this.com(t, _v);
      if (p.y - this.pivot <= H(p.x, p.z) && p.z < -line.cliffLen) break;
    }
    this.Ta = t;
    this.pLand = this.com(t, new THREE.Vector3());
    this.pLand.y = H(this.pLand.x, this.pLand.z) + this.pivot;
    this.vLand = new THREE.Vector3(this.v0.x, this.v0.y - G * t, this.v0.z);
    this.apex = this.com(Math.min(t * 0.5, this.v0.y / G), new THREE.Vector3());
    this.mid = this.com(t * 0.5, new THREE.Vector3());
    // Rotation: spins can land switch (540, 900).
    const turns = T.spin / Math.PI;
    this.landSwitch = Math.round(turns) % 2 === 1;
    this.tStart = -2.4;                                    // in-run start (real s before the pop)
    this.tEnd = this.Ta + 3.2;                             // ride-out end
    this.state = { grounded: true, landed: false, slashing: false };
    // Ride-out path (computed once): starts at the touchdown, follows the fall line, slashes.
    this.out = this.planRideOut();
    this.emitted = { pop: false, land: false };
  }

  /** Ballistic COM at air time t (no drag; slow-mo hides it). */
  com(t, out) { return out.copy(this.p0).addScaledVector(this.v0, t).add(_v3.set(0, -0.5 * G * t * t, 0)); }

  /** Real-time rate of the speed ramp at real time t (1 = real speed). */
  rate(t) {
    const into = smooth(-0.75, -0.05, t), outOf = smooth(this.Ta + 0.15, this.Ta + 1.0, t);
    return 1 + (this.slow - 1) * into * (1 - outOf);
  }

  /** Screen seconds the whole shot takes (for shot planning). */
  screenLength() {
    let s = 0;
    for (let t = this.tStart; t < this.tEnd; t += 0.01) s += 0.01 / this.rate(t);
    return s;
  }

  planRideOut() {
    const pts = [];
    const H = this.H;
    let p = new THREE.Vector3(this.pLand.x, 0, this.pLand.z);
    let vh = Math.hypot(this.vLand.x, this.vLand.z) * 0.95;
    let head = Math.atan2(this.vLand.x, -this.vLand.z);   // 0 = −Z
    const dt = 1 / 60;
    for (let t = 0; t < 3.6; t += dt) {
      // Slash: carve hard to one side ~0.7 s after touchdown, then straighten out.
      const turn = this.slashSide * (smooth(0.55, 0.85, t) - smooth(1.35, 1.9, t)) * 1.25;
      head += turn * dt;
      const slope = (H(p.x, p.z - 1) - H(p.x, p.z + 1)) / 2;   // >0 when it falls toward −Z
      vh = Math.max(6, vh + (G * 0.35 * Math.max(0, -slope) - (Math.abs(turn) > 0.3 ? 4.5 : 0.6)) * dt);
      p = p.clone().add(new THREE.Vector3(Math.sin(head) * vh * dt, 0, -Math.cos(head) * vh * dt));
      pts.push({ x: p.x, z: p.z, head, vh, turn });
    }
    return pts;
  }

  /**
   * Pose the puppet at real time t. Returns { com, vel, air, phase } and fires powder via `fx`.
   * @param {Player} pl
   */
  pose(pl, t, dtReal, fx, simT) {
    const H = this.H, T = this.T;
    const res = this._res || (this._res = { com: new THREE.Vector3(), vel: new THREE.Vector3(), feet: new THREE.Vector3(), air: false, phase: 'inrun' });
    pl.travelSign = 1;
    pl.turnInput = 0;
    pl.grab = 0; pl.flipRate = 0; pl.spinRate = 0; pl.flipTuck = 0; pl.spinTuck = 0; pl.windup = 0;
    pl.speed = this.speed;
    if (t < 0) {
      // In-run: straight down the spine, compressing for the pop over the last half second.
      const z = -this.v0.z * -t;                            // v0.z < 0 → z > 0 uphill
      const x = this.v0.x * t;
      const y = H(x, z);
      const n = _v2.set(H(x - 0.5, z) - H(x + 0.5, z), 1, H(x, z - 0.5) - H(x, z + 0.5)).normalize().clone();
      const fwd = new THREE.Vector3(this.v0.x, (H(x, z - 0.6) - H(x, z + 0.6)) / 1.2 * -this.v0.z, this.v0.z).normalize();
      orientFrom(fwd, n, pl.renderOrient);
      pl.renderPos.set(x, y, z);
      pl.state = State.GROUNDED;
      pl.squat = smooth(-0.55, -0.12, t) * (1 - smooth(-0.06, 0, t)) * 0.95;
      if (T.spin) pl.windup = -this.spinDir * smooth(-0.6, -0.1, t) * 0.8;
      res.com.set(x, y + this.pivot, z);
      res.vel.copy(fwd).multiplyScalar(this.speed);
      res.air = false; res.phase = 'inrun';
      if (t > -0.25 && !this.emitted.pre) { this.emitted.pre = true; fx.spray(simT, res.com.clone().setY(y), fwd, 0.5); }
      return res;
    }
    if (t < this.Ta) {
      if (!this.emitted.pop) { this.emitted.pop = true; emit('jumped'); fx.takeoff(simT, new THREE.Vector3(0, H(0, 0), 0), this.v0); }
      const com = this.com(t, res.com);
      const vel = res.vel.set(this.v0.x, this.v0.y - G * t, this.v0.z);
      const x = t / this.Ta;
      // Base attitude: from the lip angle to the landing slope (spotting the landing), heading along travel.
      const lipPitch = Math.atan2(this.v0.y, -this.v0.z) * 0.6;
      const landPitch = -Math.atan(this.line.land) * 0.92;
      const pitch = lipPitch + (landPitch - lipPitch) * smooth(0.15, 0.92, x);
      const heading = Math.atan2(-this.v0.x, -this.v0.z);
      const base = _q.setFromAxisAngle(UP, heading).multiply(_q2.setFromAxisAngle(_v.set(1, 0, 0), pitch));
      // Trick progress: a quick start off the lip, steady through the middle, opening up to spot.
      const w0 = 0.04, w1 = T.flip ? 0.86 : 0.9;
      const u = clamp((x - w0) / (w1 - w0), 0, 1);
      const prog = 0.55 * u + 0.45 * (u * u * (3 - 2 * u));
      const dprog = (u > 0 && u < 1 ? (0.55 + 0.45 * 6 * u * (1 - u)) / (w1 - w0) / this.Ta : 0);
      const spin = this.spinDir * T.spin * prog;
      const flip = this.flipDir * T.flip * prog;
      // World-fixed flip axis (lateral / travel / diagonal) applied over the spin: lands upright.
      const lat = _v2.set(Math.cos(heading), 0, -Math.sin(heading));
      const trav = _v3.set(-Math.sin(heading), 0, -Math.cos(heading));
      const ax = T.axis === 'lat' ? lat.clone() : T.axis === 'travel' ? trav.clone().multiplyScalar(this.rollDir) : lat.clone().addScaledVector(trav, 0.85 * this.rollDir).normalize();
      const qSpin = _q3.setFromAxisAngle(UP, spin);
      const qFlip = new THREE.Quaternion().setFromAxisAngle(ax, flip);
      pl.renderOrient.copy(qFlip).multiply(qSpin).multiply(base);
      // Feet = COM − R·(0, pivot, 0): the rig turns about the centre of mass.
      pl.renderPos.copy(com).sub(_v.set(0, this.pivot, 0).applyQuaternion(pl.renderOrient));
      pl.state = State.AIR;
      pl.squat = 0;
      // Grab window (+ tweak time for the rig's style layer).
      const [g0, g1] = T.grabWin;
      pl.grab = smooth(g0 - 0.06, g0 + 0.04, x) * (1 - smooth(g1 - 0.04, g1 + 0.06, x));
      pl.grabName = (this.board ? T.grab.board : T.grab.ski);
      pl.dyn.takeoff = { grabT: Math.max(0, (x - g0) * this.Ta) * (T.tweak ? 1.6 : 1), grab: pl.grabName };
      pl.flipRate = this.flipDir * T.flip * dprog;
      pl.spinRate = this.spinDir * T.spin * dprog;
      pl.flipTuck = T.flip ? T.tuck * (1 - smooth(0.75, 0.9, x)) : 0;
      pl.spinTuck = T.spin ? 0.7 * (1 - smooth(0.78, 0.92, x)) : 0;
      res.air = true; res.phase = 'air';
      return res;
    }
    // Ride-out.
    const k = Math.min(this.out.length - 1, Math.floor((t - this.Ta) * 60));
    const o = this.out[k];
    const y = H(o.x, o.z);
    if (!this.emitted.land) {
      this.emitted.land = true;
      pl.landingEvent = (pl.landingEvent || 0) + 1;
      pl.landingVy = Math.abs(this.vLand.y) * 0.55;
      fx.landing(simT, new THREE.Vector3(o.x, y, o.z), this.vLand);
    }
    const n = new THREE.Vector3(H(o.x - 0.5, o.z) - H(o.x + 0.5, o.z), 1, H(o.x, o.z - 0.5) - H(o.x, o.z + 0.5)).normalize();
    const fwd = new THREE.Vector3(Math.sin(o.head), 0, -Math.cos(o.head));
    fwd.y = -(fwd.x * n.x + fwd.z * n.z) / n.y;
    fwd.normalize();
    orientFrom(fwd, n, pl.renderOrient);
    if (this.landSwitch) { pl.renderOrient.multiply(_q.setFromAxisAngle(UP, Math.PI)); pl.travelSign = -1; }
    pl.renderPos.set(o.x, y, o.z);
    pl.state = State.GROUNDED;
    pl.speed = o.vh;
    pl.turnInput = clamp(o.turn * 0.9 * (this.landSwitch ? -1 : 1), -1, 1);
    // Absorb the landing: deep crouch that eases out.
    const tl = t - this.Ta;
    pl.squat = 0.7 * Math.exp(-tl * 2.4);
    res.com.set(o.x, y + this.pivot, o.z);
    res.vel.copy(fwd).multiplyScalar(o.vh);
    res.air = false; res.phase = 'out';
    if (Math.abs(o.turn) > 0.5) fx.slash(simT, dtReal, new THREE.Vector3(o.x, y, o.z), fwd, n, Math.sign(o.turn), o.vh);
    return res;
  }
}
