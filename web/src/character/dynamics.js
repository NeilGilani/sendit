// Body dynamics: how the rider's body reacts to the forces the physics actually produces, as springs
// layered on top of the posed stance (rider.js). Everything is driven by the specific force the rider
// feels (acceleration minus gravity, in the gear frame), so the body moves because something happened:
//   • absorb — knees and hips soak up load: compressions, dips, landings, the extra g of a hard carve; they
//     extend over crests and at an edge change, and snap long at the pop (a damped spring, ~1.8 Hz)
//   • fore   — braking throws the upper body forward over the feet, a sudden push (a steeper pitch, a
//     rail exit) leaves it behind (inertia: a spring on the high-passed longitudinal force)
//   • arm    — hands lag the body: they float up when weightless (crests, the air), are pressed down on
//     the landing and swing out in the turns
//   • reactions to events: a flinch away from a tree that went past close, a jolt off a bump, balance
//     reaching after a hard landing (a hand dabbing the snow if it was very hard), windmilling arms when
//     the body starts to tip in the air, and an irregular, recovering flail while stumbling
// All values are in metres / radians in the gear frame (x right, y up, z forward). update() once a frame.
import * as THREE from 'three';
import { on } from '../state.js';

const G = 9.81;
const _v = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _w = new THREE.Vector3();
const _q = new THREE.Quaternion();

export const DYN = {
  absorbPerG: 0.075,       // m the hips drop per extra g of load (a 2 g compression: 7.5 cm, plus the spring's overshoot)
  absorbFreq: 11,          // rad/s natural frequency of the legs' spring
  absorbZeta: 0.5,         // damping ratio (a slight rebound after a landing, settled in ~0.5 s)
  absorbMin: -0.06, absorbMax: 0.34,   // m: extension above the stance … deepest compression
  landKick: 0.075,         // m/s of compression speed per m/s of vertical landing speed
  popKick: -1.3,           // m/s: legs extend at the pop
  foreGain: 0.011,         // m of upper-body shift per m/s² of sudden longitudinal deceleration
  foreFreq: 7, foreZeta: 0.6, foreMax: 0.13,
  armGain: 0.022,          // hand offset (direction units) per m/s² of felt-force change
  armFreq: 6.5, armZeta: 0.32, armMax: 0.5,
  flinchIn: 28, flinchOut: 3.2,   // 1/s
  landReachOut: 1.8,       // 1/s the post-landing balance reach fades
  dabImpact: 11,           // m/s vertical landing speed above which a hand dabs the snow
  windmillRate: 0.9,       // rad/s of uncommanded pitch in the air that starts the arms circling
};

/** Critically-ish damped spring step: x'' = w²(target − x) − 2ζw x'. */
function spring(s, target, w, z, dt) {
  // Semi-implicit Euler, sub-stepped for stability at low frame rates.
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    s.v += (w * w * (target - s.x) - 2 * z * w * s.v) * h;
    s.x += s.v * h;
  }
}

export class BodyDynamics {
  constructor(player) {
    this.pl = player;
    this.absorb = { x: 0, v: 0 };
    this.fore = { x: 0, v: 0 };
    this.arm = [{ x: 0, v: 0 }, { x: 0, v: 0 }, { x: 0, v: 0 }];   // gear-frame x, y, z
    this.vPrev = null;
    this.acc = new THREE.Vector3();          // low-passed world acceleration
    this.fLongLP = 0;                        // slow average of the longitudinal force (high-pass reference)
    this.flinch = 0; this.flinchSide = 0; this.flinchT = 0;   // side: +1 = obstacle on the right
    this.landReach = 0; this.dab = 0; this.dabSide = 1;
    this.windmill = 0; this.wmPhase = 0; this.wmDir = 1;
    this.stumbleSeed = 0;
    this.exertion = 0;                       // 0..1: builds with fast riding and hard landings, fades at rest
    this.qPrev = new THREE.Quaternion(); this.qInit = false;
    this.pitchRate = 0;
    on('nearMiss', (e) => {
      if (!this.pl?.simulated || !e || e.x === undefined) return;
      const pl = this.pl;
      _r.set(1, 0, 0).applyQuaternion(pl.renderOrient);
      const side = Math.sign((e.x - pl.position.x) * _r.x + (e.z - pl.position.z) * _r.z) * (pl.travelSign || 1) || 1;
      this.flinchSide = side;
      this.flinchT = 1;   // rising
    });
    on('bump', (into) => { if (this.pl?.simulated) { this.absorb.v += Math.min(1.5, (into || 0) * 0.25); this.arm[1].v += 1.2; } });
    on('jumped', () => { if (this.pl?.simulated) this.absorb.v += DYN.popKick; });
    on('landed', (e) => {
      if (!this.pl?.simulated || !e) return;
      const vy = e.rawImpact ?? e.impact ?? 0;
      this.landReach = Math.min(1, vy / 9);
      this.exertion = Math.min(1, this.exertion + vy / 45);
      if (vy > DYN.dabImpact && e.result !== 'crash') {
        this.dab = 1;
        // The hand on the downhill / inside side goes down (the lean decides; straight landings: the right).
        this.dabSide = (this.pl.rider?.p?.lean || 0) >= 0 ? 1 : -1;
      }
    });
    on('respawned', () => this.reset());
  }

  reset() {
    this.absorb.x = this.absorb.v = 0; this.fore.x = this.fore.v = 0;
    for (const a of this.arm) a.x = a.v = 0;
    this.vPrev = null; this.acc.set(0, 0, 0); this.fLongLP = 0;
    this.flinch = this.flinchT = 0; this.landReach = 0; this.dab = 0; this.windmill = 0; this.qInit = false;
    this.exertion *= 0.5;
  }

  update(dt, rider) {
    const pl = this.pl;
    if (!pl || dt <= 0) return;
    const p = rider.p;
    const ground = pl.state === 1, air = pl.state === 2, grind = pl.state === 5;
    // A teleport (respawn, drop zone, a debug place()) is not a force: start over from the new state.
    if (this.pPrev && this.pPrev.distanceTo(pl.renderPos) > 1 + (pl.speed + 5) * dt * 2) this.reset();
    this.pPrev = (this.pPrev || new THREE.Vector3()).copy(pl.renderPos);
    // World acceleration from the physics velocity, over the physics time it changed in (pl.simTime): frames and
    // the fixed 60 Hz steps don't line up, and dividing by the frame dt read 0 on frames without a step and 2.4×
    // on the others at 144 Hz — a 14 % ripple in every force-driven reaction (physics steady, 30 / 60 Hz exact).
    const simDt = pl.simTime !== undefined && this.simPrev !== undefined ? pl.simTime - this.simPrev : dt;
    if (this.vPrev && pl.simulated && simDt > 1e-6) {
      _v.subVectors(pl.velocity, this.vPrev).divideScalar(simDt);
      if (_v.lengthSq() > 900 * 900) _v.set(0, 0, 0);                       // teleports (respawn, drop zones)
      this.acc.lerp(_v, 1 - Math.exp(-simDt / 0.035));
    }
    if (simDt > 1e-6 || !this.vPrev) { this.vPrev = (this.vPrev || new THREE.Vector3()).copy(pl.velocity); this.simPrev = pl.simTime; }
    // Felt (specific) force: what the snow / rail pushes on the body with. Weightless in the air.
    _f.copy(this.acc); _f.y += G;
    if (air) _f.set(0, 0, 0);
    // Gear frame (x right, y up, z forward along travel).
    const q = pl.renderOrient, ts = pl.travelSign || 1;
    _r.set(1, 0, 0).applyQuaternion(q).multiplyScalar(ts);
    _u.set(0, 1, 0).applyQuaternion(q);
    _w.set(0, 0, -1).applyQuaternion(q).multiplyScalar(ts);
    const fx = _f.dot(_r), fy = _f.dot(_u), fz = _f.dot(_w);

    // --- absorb: the body leans into the force, so its legs carry |f| (a carve's extra g too).
    const load = ground || grind ? Math.hypot(fx, fy) / G : 0;
    const absorbT = THREE.MathUtils.clamp((load - (ground || grind ? 1 : 0)) * DYN.absorbPerG, DYN.absorbMin, DYN.absorbMax * 0.6);
    spring(this.absorb, absorbT, DYN.absorbFreq, DYN.absorbZeta, dt);
    this.absorb.x = THREE.MathUtils.clamp(this.absorb.x, DYN.absorbMin, DYN.absorbMax);

    // --- fore: sudden changes of the longitudinal force (not the steady pull of a long slope).
    this.fLongLP += (fz - this.fLongLP) * (1 - Math.exp(-dt / 0.9));
    const dev = ground ? fz - this.fLongLP : 0;
    spring(this.fore, THREE.MathUtils.clamp(-dev * DYN.foreGain, -DYN.foreMax, DYN.foreMax), DYN.foreFreq, DYN.foreZeta, dt);

    // --- arms: lag the body. Vertical: the felt force against 1 g (weightless → float up); sideways and
    // fore-aft: the change of the force (they swing, then settle).
    const tgt = [
      -(fx - (this._fxLP = (this._fxLP || 0) + (fx - (this._fxLP || 0)) * (1 - Math.exp(-dt / 0.5)))) * DYN.armGain,
      -(fy - G) * DYN.armGain * (pl.simulated ? 1 : 0) * (air ? 0.45 : 1),   // weightless: a lift, not a float overhead
      -dev * DYN.armGain * 0.6,
    ];
    for (let i = 0; i < 3; i++) {
      spring(this.arm[i], THREE.MathUtils.clamp(tgt[i], -DYN.armMax, DYN.armMax), DYN.armFreq, DYN.armZeta, dt);
      this.arm[i].x = THREE.MathUtils.clamp(this.arm[i].x, -DYN.armMax, DYN.armMax);
    }

    // --- flinch: snaps in, eases out.
    if (this.flinchT > 0) { this.flinch += (1 - this.flinch) * (1 - Math.exp(-DYN.flinchIn * dt)); if (this.flinch > 0.95) this.flinchT = 0; }
    else this.flinch *= Math.exp(-DYN.flinchOut * dt);
    this.landReach *= Math.exp(-DYN.landReachOut * dt);
    this.dab = Math.max(0, this.dab - dt / 0.55);

    // --- windmill: the body pitching in the air without a trick asking for it (the arms circle to stop it).
    if (!this.qInit) { this.qPrev.copy(q); this.qInit = true; }
    _q.copy(this.qPrev).invert().premultiply(q);   // world-frame delta
    const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)));
    const axis = _v.set(_q.x, _q.y, _q.z);
    const pr = ang > 1e-5 && axis.lengthSq() > 1e-12 ? axis.normalize().dot(_r) * ang / dt * Math.sign(_q.w || 1) : 0;
    this.pitchRate += (pr - this.pitchRate) * (1 - Math.exp(-dt / 0.08));
    this.qPrev.copy(q);
    const trick = Math.abs(pl.flipRate || 0) > 0.6 || Math.abs(pl.spinRate || 0) > 1 || (pl.grab || 0) > 0.2;
    const wmT = air && !trick ? THREE.MathUtils.smoothstep(Math.abs(this.pitchRate), DYN.windmillRate, DYN.windmillRate * 2.5) : 0;
    this.windmill += (wmT - this.windmill) * (1 - Math.exp(-(wmT > this.windmill ? 8 : 3) * dt));
    if (this.windmill > 0.01) {
      if (wmT > 0.2) this.wmDir = this.pitchRate > 0 ? 1 : -1;   // nose dropping → arms circle forward
      this.wmPhase += dt * 8.5 * this.wmDir;
    }
    this.stumbleSeed += dt;
    // Exertion: a long fast run (and every hard landing) leaves the rider breathing hard when they stop.
    const work = ground ? Math.min(1, pl.speed / 16) * (0.6 + 0.4 * Math.min(1, Math.abs(p.lean || 0) / 0.5)) : air ? 0.5 : 0;
    this.exertion += (work - this.exertion) * (1 - Math.exp(-dt / (work > this.exertion ? 14 : 20)));
  }

  /** Arm offset in armature space (+X = the rider's left, +Z forward), for a body yawed by `yaw`. */
  armOffset(out, yaw = 0) {
    const x = -this.arm[0].x, y = this.arm[1].x, z = this.arm[2].x;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // The body yaw turns the armature relative to the gear frame (snowboard stance).
    return out.set(x * c - z * s, y, x * s + z * c);
  }

  /** Irregular flail for a stumbling arm: sums of incommensurate sines (never a visible loop). */
  flail(side, t) {
    const a = t * 7.3 + side * 1.7, b = t * 11.9 + side * 0.6, c = t * 4.1 + side * 2.9;
    return [Math.sin(a) * 0.55 + Math.sin(b) * 0.25, Math.sin(c) * 0.5 + Math.sin(a * 1.31) * 0.35, Math.sin(b * 0.77) * 0.5 + Math.sin(c * 1.7) * 0.3];
  }
}
