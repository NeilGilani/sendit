// Off-axis rotation in the air: how a spin and a flip at the same time turn the body (corks, rodeos,
// misties, double corks). docs/jumps-research.md §8.
//
// The physics keeps two trick coordinates — the heading ψ (the spin: landing yaw, spin names) and the flip
// angle θ (whole flips: landing pitch, flip names) — set and shaped by angular momentum (physics/edge.js).
// This module turns them into the body's attitude:
//
//   • The flip axis F is fixed in the world at the start of the flip (the gear's lateral axis then), so it no
//     longer turns with the rider mid-spin (it used to: renderOrient = base · Rx(θ) with base carrying ψ).
//   • Each flip is one revolution of the body about ONE tilted axis A — between the vertical U and F,
//     α from vertical: A = s·cos α·U + sin α·F. The body's up axis traces a cone around A (a clean cork
//     path: the head drops to one side, goes round, comes back up), deepest at 2α. A full revolution about
//     A also carries 360° of the spin; what the heading turns beyond that is a twist about the body's long
//     axis (arms wrapped in): a cork 720 is one off-axis revolution plus a 360 of twist, a double cork 1080
//     two revolutions plus 360.
//   • With little spin per flip (under ≈ half a turn: a backflip, a flip with a 180) the axis is F itself
//     (α = 90°) and the spin is a twist about the long axis (an aerials-style twisting flip).
//
// Trick rotation (world frame, identity whenever θ is a whole number of flips, so take-offs and clean
// landings are exactly the plain heading):
//     flip:  R_F(θ)                        cork:  R_A(|θ|) · R_U(−s·|θ|)
//     q = slerp(flip, cork, m)             renderOrient = q · base(ψ)
// The shape (m, s, α) is chosen from the spin : flip rate ratio r near upright (|θ mod 2π| < window), where
// the two forms nearly coincide, and held through the rest of the revolution (α eases slowly), so nothing
// pops. Pure math (three.js only): runs in Node for the benches.
import * as THREE from 'three';

const DEG = Math.PI / 180, TAU = Math.PI * 2;
const wrapPi = (a) => a - TAU * Math.floor((a + Math.PI) / TAU);
const smooth = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const OFFAXIS = {
  window: 16 * DEG,     // |θ mod 2π| under this: the shape (cork / flip, spin side) may change
  corkR: [0.45, 0.75],  // spin : flip rate ratio (rad / rad) from which a flip turns off-axis (cork / rodeo / misty)
  modeTime: 0.12,       // s to blend between the flip and cork forms (only near upright)
  ratioTau: 0.1,        // s low-pass on the rate ratio
  // Axis tilt from vertical (deg) by spin : flip ratio r — [r, α]: a backflip 360 / rodeo 360 (r ≈ 1)
  // turns about a steep axis (≈ 72°: the body goes well past horizontal, 2α ≈ 145°), a rodeo / double cork
  // (r ≈ 1.5) ≈ 64°, a cork 720 (r ≈ 2) ≈ 58° (body ≈ 115° at the deepest), long corks flatten to 50°
  // (horizontal, 2α = 100°). Research: corks 45–60° from vertical, rodeos / misties 65–80° (§8).
  alphaTable: [[0.45, 78], [1, 72], [1.5, 64], [2, 58], [3, 52], [6, 50]],
  alphaFront: 6,        // deg steeper for a frontflip (a misty is flip-led: it inverts early, like a rodeo)
  alphaMax: 80,
  alphaRateNear: 160,   // deg/s α eases near upright …
  alphaRateFar: 25,     // … and through the rest of the revolution (the body changing its tilt)
};

/** Axis tilt from vertical (deg) for a spin : flip ratio r (spin radians per flip radian). */
export function corkAlpha(r, C = OFFAXIS) {
  const T = C.alphaTable;
  if (r <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (r <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (r - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
  return T[T.length - 1][1];
}

const _A = new THREE.Vector3(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _X = new THREE.Vector3(1, 0, 0), _Yv = new THREE.Vector3(0, 1, 0), _u = new THREE.Vector3();

export class OffAxis {
  constructor(C = OFFAXIS) {
    this.C = C;
    this.U = new THREE.Vector3(0, 1, 0);   // the trick's "vertical": the gear's up in the air
    this.F = new THREE.Vector3(1, 0, 0);   // world flip axis (+ = the drawn flip's positive sense)
    this.reset();
  }

  reset() {
    this.m = 0;              // 0 = flip form, 1 = cork form
    this.s = 1;              // spin side of the cork (+1 = heading increasing)
    this.alpha = this.C.alphaTable[0][1] * DEG;   // axis tilt from vertical (cork form)
    this.r = 0;              // low-passed spin : flip rate ratio
  }

  /**
   * Called every physics step in the air. theta = drawn flip (rad about the gear's +X, signed),
   * spinRate / flipRate in rad/s, base = the gear's un-flipped attitude (quaternion, carries the heading),
   * front = a frontflip (misty).
   */
  update(dt, theta, spinRate, flipRate, base, front = false) {
    const C = this.C, w = Math.abs(wrapPi(theta));
    // Between flips (upright, no flip under way): the flip axis follows the gear; it freezes once a flip
    // starts and stays for every revolution of it (a double cork turns twice about the same axis).
    if (w < 0.02 && Math.abs(flipRate) < 0.6) {
      this.U.copy(_Yv).applyQuaternion(base);
      this.F.copy(_X).applyQuaternion(base);
      this.F.addScaledVector(this.U, -this.F.dot(this.U)).normalize();
    }
    const ri = Math.abs(spinRate) / Math.max(Math.abs(flipRate), 0.6);
    this.r += (Math.min(ri, 6) - this.r) * (1 - Math.exp(-dt / C.ratioTau));
    const near = w < C.window;
    let mT;
    if (near) {
      mT = smooth(this.r, C.corkR[0], C.corkR[1]);
      // The spin side can only change in the flip form (it mirrors the cone and the twist).
      if (Math.abs(spinRate) > 0.3 && Math.sign(spinRate) !== this.s) {
        if (this.m < 0.02) this.s = Math.sign(spinRate);
        else mT = 0;
      }
    } else mT = this.m > 0.5 ? 1 : 0;   // mid-revolution: finish whatever blend was started, never start one
    this.m += Math.sign(mT - this.m) * Math.min(Math.abs(mT - this.m), dt / C.modeTime);
    const aT = Math.min(C.alphaMax, corkAlpha(this.r, C) + (front ? C.alphaFront : 0)) * DEG;
    const rate = (near ? C.alphaRateNear : C.alphaRateFar) * DEG * dt;
    this.alpha += Math.sign(aT - this.alpha) * Math.min(Math.abs(aT - this.alpha), rate);
  }

  /** World-frame trick rotation for a drawn flip θ (identity at whole flips). */
  quat(theta, out = new THREE.Quaternion()) {
    out.setFromAxisAngle(this.F, theta);
    if (this.m < 1e-4 || !theta) return out;
    const a = Math.min(this.alpha, 89.9 * DEG), sf = Math.sign(theta), t = Math.abs(theta);
    _A.copy(this.U).multiplyScalar(this.s * Math.cos(a)).addScaledVector(this.F, sf * Math.sin(a)).normalize();
    const cork = _q1.setFromAxisAngle(_A, t).multiply(_q2.setFromAxisAngle(this.U, -this.s * t));
    if (this.m > 1 - 1e-4) return out.copy(cork);
    if (out.dot(cork) < 0) cork.set(-cork.x, -cork.y, -cork.z, -cork.w);
    return out.slerp(cork, this.m);
  }

  /** How far (rad) the trick rotation tips the body's up axis off its upright for a drawn flip θ. */
  tilt(theta) {
    _u.copy(this.U).applyQuaternion(this.quat(theta, _q3));
    return Math.acos(Math.max(-1, Math.min(1, _u.dot(this.U))));
  }
}
