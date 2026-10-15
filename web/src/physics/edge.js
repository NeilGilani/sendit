// EdgePhysics — the shared carve / skid ground model behind both skis and snowboards. Player
// (player.js) owns the state machine, terrain following, collisions, lifts and scoring; it delegates
// everything that depends on the equipment to a SkiPhysics / SnowboardPhysics instance:
//   control(dt, ctrl)   map raw input → steer / brake / tuck / charge, returns true to pop
//   ground(dt, n, v, g) edge angle, sidecut carving, rotary pivot, grip & skid, brakes, drag, powder
//   pop()               take-off impulse (ollie / nollie / hop)
//   air(dt, ctrl)       spins and grabs
//   land(info)          landing evaluation (handles switch)
//
// Model (see docs/equipment.md for the derivation and docs/equipment-research.md for the numbers):
//   • The steer input sets a target edge angle; the edge follows at a limited roll rate (edge-switch
//     time). Carve-assist caps it near the largest edge whose carve the grip can hold at this speed.
//   • Sidecut carving: path curvature κ = engage(θ) / (R_sidecut · cos θ), limited by lateral grip
//     κ ≤ a_max / v². The skis/board rotate with the path; velocity is redirected by edge grip with
//     energy-conserving conversion (clean carve keeps ~all speed).
//   • Rotary pivot (skidded steering) adds yaw independent of speed, strongest when slow; the
//     resulting skid angle β costs a = μ_side·g·sin β and sprays snow.
//   • Heading is the physical NOSE direction. Riding switch (tail first) is simply travel = −1.
import * as THREE from 'three';
import { PHYSICS as P } from '../config.js';
import { clamp, lerp, smoothstep, angleDiff, lerpAngle, approach, DEG } from './math.js';

const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const mod2Pi = (a) => ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
/** "", "Double ", "Triple "… for n whole flips. */
export const flipCount = (n) => (n <= 1 ? '' : n === 2 ? 'Double ' : n === 3 ? 'Triple ' : `${n}x `);

const _f = new THREE.Vector3(), _t = new THREE.Vector3(), _r = new THREE.Vector3(), _v0 = new THREE.Vector3(), _a = new THREE.Vector3();

/** Unit nose direction for `yaw`, projected on the slope plane with normal n. */
export function slopeForward(yaw, n, out) {
  out.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  return out.addScaledVector(n, -out.dot(n)).normalize();
}

export class EdgePhysics {
  constructor(player, spec, handling, C) {
    this.pl = player;
    this.spec = spec;
    this.H = handling;
    this.C = C;
    this.travel = 1;          // +1 nose first, −1 switch (tail first)
    this.edge = 0;            // signed edge angle (rad), + = on the right-turn edge (relative to travel)
    this.stop = 0;            // 0..1 slide / hockey stop engagement
    this.stopSide = 1;        // +1 stop to the right of travel, −1 left
    this.steer = 0;           // −1..1 effective steer this step
    this.yawRate = 0;         // rad/s heading change on the ground (+ = turning right)
    this.velYawRate = 0;      // rad/s path curvature · speed (drives lean)
    this.charge = 0;          // 0..1 pop charge (squat)
    this.charging = false;
    this.press = 0;           // −1 tail … +1 nose (loading for a pop doubles as a press)
    this.butter = 0;          // 0..1 butter engagement (press + steer when slow)
    this.takeoff = null;      // trick bookkeeping for the current air
    this.dbg = {};            // last step's deceleration terms (m/s²), see ground()
  }

  get type() { return 'edge'; }
  get maxVelocity() { return this.C.maxVelocity; }

  // ------------------------------------------------------------------ per-type hooks
  maxEdge(/* side */) { return this.C.maxEdge * DEG; }
  latG(/* side */) { return this.C.latG; }
  sidecut(/* side */) { return this.H.sidecutRadius; }
  /** Roll rate limit (rad/s) moving from edge `from` toward `to`. */
  edgeRate(/* from, to */) { return (2 * this.C.maxEdge * DEG) / this.C.edgeSwitchTime; }
  /** Mode specific additions: return { yaw (rad/s, + right), edge target override, grip mul, eff mul } */
  modes(/* dt, ctx */) { return null; }
  /** Resistive deceleration specific to the type (m/s²): plough, butter… */
  extraDecel(/* ctx */) { return 0; }

  // ------------------------------------------------------------------ controls
  /**
   * ctrl = { steer −1..1, brake 0..1, up 0..1 (W), jump bool (held), tuck 0..1, active bool }
   * Sets player.turnInput / brake / tuck / squat. Returns true when a pop should fire this step.
   */
  control(dt, ctrl, grounded) {
    const pl = this.pl, C = this.C;
    // Digital steering (keys / full stick) ramps from a partial edge to full lock while held, so taps
    // carve gently and holding commits; analog input passes straight through.
    let steer = ctrl.steer;
    if (Math.abs(steer) > 0.98) {
      // Linking turns (straight from the other key) commits at once; pressing from neutral ramps.
      this._holdT = Math.sign(steer) === this._holdSign ? (this._holdT || 0) + dt : (this._holdSign === -Math.sign(steer) ? P.digitalSteerRamp : 0);
      this._holdSign = Math.sign(steer);
      steer = Math.sign(steer) * Math.min(1, P.digitalSteerStart + this._holdT / P.digitalSteerRamp * (1 - P.digitalSteerStart));
    } else { this._holdT = 0; this._holdSign = 0; }
    pl.turnInput += (steer - pl.turnInput) * (1 - Math.exp(-(C.steerResponse ?? P.steerResponse) * pl.handling * dt));
    pl.brake += (ctrl.brake - pl.brake) * (1 - Math.exp(-6 * dt));
    const anyDir = Math.abs(ctrl.steer) > 0.1 || ctrl.brake > 0.1;
    this._noInputT = anyDir ? 0 : (this._noInputT || 0) + dt;
    const auto = this._noInputT > P.autoTuckDelay && pl.speedRatio > P.autoTuckSpeedRatio ? 1 : 0;
    const want = Math.max(ctrl.tuck, this.tuckFromUp(ctrl), auto) * (1 - ctrl.brake);
    pl.tuck += (want - pl.tuck) * (1 - Math.exp(-3.5 * dt));
    let fire = false;
    if (ctrl.active && grounded) {
      if (ctrl.jump) {
        if (!this.charging) this.onChargeStart(ctrl);
        this.charging = true;
        this.charge = Math.min(1, this.charge + dt / C.chargeTime);
      } else if (this.charging) { this.charging = false; fire = true; }
    } else if (ctrl.active && this._lateT > 0 && this.charging) {
      // Late pop ("coyote time"): the snow fell away under a loaded rider; releasing now still pops.
      this._lateT -= dt;
      if (!ctrl.jump) { this.charging = false; fire = true; }
    } else this.charging = false;
    if (!this.charging && !fire) this.charge = Math.max(0, this.charge - dt * 6);
    pl.squat = this.charge;
    // Spin wind-up: steering while loading a pop pre-rotates the shoulders; the release adds spin.
    if (grounded) this.windup = approach(this.windup || 0, this.charging ? ctrl.steer : 0, dt / (this.charging ? 0.25 : 0.12));
    pl.windup = this.windup || 0;
    this.onControl(dt, ctrl, grounded);
    return fire;
  }

  tuckFromUp(ctrl) { return ctrl.up; }
  /** Space alone loads the tail (ollie); W + Space loads the nose (nollie). */
  onChargeStart(ctrl) { this._popEnd = ctrl.up > 0.3 ? 'nose' : 'tail'; }
  onControl() {}

  /**
   * Nose / tail press while charging a pop; steering on top of it at low speed is a butter (the gear
   * pivots on the pressed end with the base flat). Tunables: butterRate, butterMaxSpeed, butterDrag.
   */
  pressAndButter(dt, ctrl, grounded) {
    const pl = this.pl, C = this.C;
    // Flip preload (Steep / Shredders): S held while charging winds up a backflip off the tail.
    const loading = (grounded || this._lateT > 0) && this.charging;
    this.flipLoad = approach(this.flipLoad || 0, loading && ctrl.brake > 0.3 ? 1 : 0, dt / (this.charging ? 0.35 : 0.1));
    pl.flipLoad = this.flipLoad;
    const pressT = grounded && this.charging ? (this._popEnd === 'nose' ? 1 : -1) * (0.4 + 0.6 * this.charge) : 0;
    this.press += (pressT - this.press) * (1 - Math.exp(-10 * dt));
    const canButter = grounded && this.charging && pl.speed < C.butterMaxSpeed;
    const wantButter = canButter && Math.abs(ctrl.steer) > 0.2 ? 1 : 0;
    this.butter += (wantButter - this.butter) * (1 - Math.exp(-(wantButter ? 10 : 6) * dt));
    pl.press = this.press; pl.butter = this.butter;
  }

  /** Ground-mode overrides for a butter (or the extra pivot of a plain press). */
  butterModes(m) {
    const C = this.C;
    if (this.butter > 0.02) {
      // Butter: base flat, the gear pivots on the pressed end; the path barely follows.
      m.edge = 0;
      m.yaw = this.steer * C.butterRate * this.butterScale() * this.H.pivot * this.butter;
      m.pivotMul = 1 - this.butter;
      m.gripMul = 1 - this.butter * 0.85;
      m.effMul = 1 - this.butter * 0.7;
      m.skidMul = 1 - this.butter * 0.8;   // flat base slides, edges don't scrape
      // Pivot on the pressed end: tail press → the centre swings with the nose, nose press → opposite.
      m.pivotOffset = -Math.sign(this.press || -1) * this.spec.length * 0.33 * this.butter;
      m.noAlign = true;
    } else if (Math.abs(this.press) > 0.05) {
      m.pivotMul = 1 + Math.abs(this.press) * 0.3;
    }
    return m;
  }

  butterScale() { return 1; }

  // ------------------------------------------------------------------ ground
  /** Integrates one grounded step. `v` (tangent velocity, modified in place), `gTan` slope gravity. */
  ground(dt, n, v, gTan) {
    const pl = this.pl, C = this.C, H = this.H, S = pl.surface;
    const g = P.gravity;
    _v0.copy(v);
    v.addScaledVector(gTan, dt);
    let speed = v.length();
    // Travel direction (nose first or switch), with hysteresis so sideways stops don't flicker.
    const fwd = slopeForward(pl.heading, n, _f);
    const vfN = v.dot(fwd);
    if (speed > 0.6 && this.stop < 0.5) {
      if (vfN < -0.3 * speed) this.travel = -1;
      else if (vfN > 0.3 * speed) this.travel = 1;
    }
    let tdir = _t.copy(fwd).multiplyScalar(this.travel);
    let tright = _r.crossVectors(tdir, n).normalize();
    let vf = v.dot(tdir), vl = v.dot(tright);
    let beta = speed > 0.4 ? Math.atan2(-vl, Math.max(Math.abs(vf), 0.3)) : 0;   // + = skis rotated right of the path

    const pw = clamp(S.y + S.w, 0, 1);
    const surfGrip = lerp(1, lerp(0.72, 0.9, clamp(C.powderSteer, 0, 1)), pw) * (1 - S.z * 0.35);
    const ctx = { dt, n, v, speed, vf, vl, beta, pw, surfGrip, fwd, tdir, tright };

    // --- 1. target edge angle: the rider rolls toward steer · maxEdge at the edge-switch rate
    const s = this.steer = clamp(pl.turnInput, -1, 1) * (pl.stumbleT > 0 ? P.stumbleHandling : 1);
    const side = Math.sign(s) || Math.sign(this.edge) || 1;
    // Edge angle ≈ body inclination + angulation, and inclination needs a turn force to lean against
    // (tan φ = a_lat / g): slow riders can't tip onto a high edge, so slow turns are skidded pivots.
    const thMax = Math.min(this.maxEdge(side) * (1 - 0.4 * pl.tuck), this.speedEdgeLimit(speed, side, surfGrip));
    let edgeT = s * thMax;
    const mode = this.modes(dt, ctx) || {};
    if (mode.edge !== undefined) edgeT = mode.edge;
    const rate = this.edgeRate(this.edge, edgeT);
    // First-order lean response, rate-limited by how fast the rider can roll edge to edge.
    this.edge = approach(this.edge, lerp(this.edge, edgeT, 1 - Math.exp(-C.edgeResponse * dt)), rate * dt);

    // --- 2. heading: sidecut carve + rotary pivot + mode yaw
    //   R = R_eff · cos θ, where R_eff grows with speed (the gear is bent less at speed, research: ×1.6+),
    //   capped by lateral grip κ ≤ a_max / v². Demand beyond grip mostly just widens the arc (carve
    //   assist); the rest rotates the gear past the path → skid.
    const th = Math.abs(this.edge), eSide = Math.sign(this.edge);
    const engage = smoothstep(C.engage[0] * DEG, C.engage[1] * DEG, th);
    const aCap = this.latG(eSide || 1) * g * surfGrip * H.grip * pl.handling;
    const rEff = this.sidecut(eSide || 1) * (1 + C.speedRadius * smoothstep(C.speedRadiusV[0], C.speedRadiusV[1], speed));
    const kGeo = engage / (rEff * Math.max(0.2, Math.cos(th)));
    const kGrip = aCap / Math.max(speed * speed, 0.25);
    const k = Math.min(kGeo, kGrip);
    const wash = Math.max(0, kGeo - kGrip) * (1 - C.carveAssist);
    const track = 1 - smoothstep(C.trackBeta[0] * DEG, C.trackBeta[1] * DEG, Math.abs(beta));
    let yaw = eSide * Math.abs(vf) * (k * track + wash) * (1 - this.stop);
    // Rotary pivot (skidded steering) only fills the gap between what the carve gives and the turn
    // rate the rider asks for: slow → mostly pivot/skid, mid speed → pure carve, fast → grip-limited
    // carve plus a little skid when asking for more.
    const want = Math.abs(s) * lerp(C.pivotRate, C.turnRateFast, smoothstep(C.pivotFade[0], C.pivotFade[1], speed)) * H.pivot;
    let pivot = Math.sign(s) * Math.max(0, want - Math.abs(yaw) * (Math.sign(yaw) === Math.sign(s) ? 1 : 0)) * (1 - this.stop) * (mode.pivotMul ?? 1);
    // Pivot can't wind the skid angle up forever: fade as β (same direction) approaches betaMax.
    if (pivot * beta > 0) pivot *= Math.max(0, 1 - Math.abs(beta) / (C.betaMax * DEG));
    yaw += pivot + (mode.yaw || 0);
    pl.heading -= yaw * dt;              // + yaw = turning right = heading decreasing
    // Pivoting about a pressed end (butters): the stance centre swings around that end.
    if (mode.pivotOffset) pl.position.addScaledVector(_r.crossVectors(fwd, n).normalize(), mode.pivotOffset * (mode.yaw || 0) * dt);
    // Edges track their own path when the rider isn't steering (self-aligning).
    if (speed > 1.2 && !mode.noAlign) {
      const velYaw = Math.atan2(-v.x, -v.z) + (this.travel < 0 ? Math.PI : 0);
      const a = C.selfAlign * (1 - Math.min(1, Math.abs(s)) * 0.85) * (pl._alignTimer > 0 ? 3 : 1);
      pl.heading = lerpAngle(pl.heading, velYaw, 1 - Math.exp(-a * dt));
    }
    this.yawRate = yaw;

    // --- 3. edge grip redirects the velocity onto the new axis
    slopeForward(pl.heading, n, _f);
    tdir = _t.copy(_f).multiplyScalar(this.travel);
    tright = _r.crossVectors(tdir, n).normalize();
    const yaw0 = Math.atan2(-v.x, -v.z);
    vf = v.dot(tdir); vl = v.dot(tright);
    const edgeGrip = lerp(C.flatGrip, 1, smoothstep(0.03, 0.3, th));
    const kRate = C.gripRate * edgeGrip * (mode.gripMul ?? 1) * surfGrip;
    const remove = Math.min(Math.abs(vl) * (1 - Math.exp(-kRate * dt)), aCap * dt * (0.4 + 0.6 * edgeGrip) * (mode.gripMul ?? 1));
    const eff = lerp(C.carveEff, C.skidEff, smoothstep(4 * DEG, 25 * DEG, Math.abs(beta))) * (mode.effMul ?? 1);
    const vl2 = Math.sign(vl) * (Math.abs(vl) - remove);
    const vf2 = Math.sign(vf || 1) * Math.sqrt(Math.max(0, vf * vf + eff * (vl * vl - vl2 * vl2)));
    v.copy(tdir).multiplyScalar(vf2).addScaledVector(tright, vl2);
    speed = v.length();
    beta = speed > 0.4 ? Math.atan2(-vl2, Math.max(Math.abs(vf2), 0.3)) : 0;
    this.velYawRate = speed > 0.5 ? -angleDiff(yaw0, Math.atan2(-v.x, -v.z)) / dt : 0;

    // --- 4. push, friction, drag, skid scrub, powder
    if (pl.controllable() && pl._ctrl.up > 0.3 && speed < C.pushMaxSpeed && this.stop < 0.2) v.addScaledVector(tdir, C.pushAccel * dt);
    // Clean carves pump a little speed back (edge rebound, pressure timing): carving beats skidding.
    const quality = clamp(1 - wash / Math.max(k, 1e-3), 0, 1) * track * (1 - smoothstep(4 * DEG, 14 * DEG, Math.abs(beta)));
    const pump = C.carvePump * Math.abs(speed * this.velYawRate) * quality * smoothstep(3, 6, speed) * (1 - this.stop);
    v.addScaledVector(tdir, pump * dt);
    this.dbg.pump = pump;
    // Powder glide friction scales with how deep the course powder is and how well the gear floats.
    const muPow = lerp(P.frictionGroomed, P.frictionPowder, P.powderDepth) / Math.sqrt(H.float * C.powderFloat);
    const mu = (P.frictionGroomed * S.x + muPow * S.y + P.frictionRock * S.z + muPow * S.w) / Math.max(1e-3, S.x + S.y + S.z + S.w);
    speed = v.length();
    let decel = mu * g * n.y;
    decel += lerp(C.dragUpright, C.dragTuck, pl.tuck) * speed * speed;
    decel += P.softCapDrag * Math.max(0, speed - C.maxVelocity) ** 2;
    const skidMu = this.stop > 0 ? lerp(C.skidMu, this.stopMu(), this.stop) : C.skidMu;
    // Slow pivots are steering more than scraping; real scrub builds with speed (stops excepted).
    const slowSkid = lerp(smoothstep(1.5, 8, speed) * 0.7 + 0.3, 1, this.stop);
    decel += skidMu * g * Math.abs(Math.sin(beta)) * (0.35 + 0.65 * edgeGrip) / Math.max(0.7, H.stability) * (mode.skidMul ?? 1) * slowSkid;
    decel += this.extraDecel(ctx);
    // Powder: slow skis plough and sink, fast ones plane; floatier gear sinks less and bogs later.
    const float = H.float * C.powderFloat;
    pl.powder = pw;
    const plane = smoothstep(C.powderBog * 0.6, C.powderBog * 1.6, speed);
    // Sink depth: deep when slow, planing up with speed; floatier gear (area, rocker, setback) sinks less.
    const sinkT = pw * lerp(C.sinkSlow, C.sinkFast, plane * plane * (3 - 2 * plane)) / Math.sqrt(float / C.powderFloat);
    pl.sink += (sinkT - pl.sink) * (1 - Math.exp(-4 * dt));
    decel += P.turnScrub * Math.abs(pl.carve) * speed * pw / Math.sqrt(float);
    decel += C.powderBogDecel * pw * (1 - plane) / H.float * P.powderDepth;   // bogging down below the planing speed
    decel += C.powderDrag * pl.sink * speed * P.powderDepth;               // ploughing: a = k · depth · v
    const D = this.dbg;   // per-term breakdown (m/s²) for tuning tools
    D.fric = mu * g * n.y; D.air = lerp(C.dragUpright, C.dragTuck, pl.tuck) * speed * speed;
    D.skid = skidMu * g * Math.abs(Math.sin(beta)) * (0.35 + 0.65 * edgeGrip) / Math.max(0.7, H.stability) * (mode.skidMul ?? 1) * slowSkid;
    D.extra = this.extraDecel(ctx); D.total = decel; D.beta = beta; D.grav = gTan.length();
    if (speed > 1e-4) v.multiplyScalar(Math.max(0, speed - decel * dt) / speed);
    const holding = pl.controllable() && pl._ctrl.up > 0.3;
    if (v.length() < 0.35 && (1 - n.y < P.holdStillSlope || pl.brake > 0.6) && !holding) v.set(0, 0, 0);
    speed = v.length();

    // --- 5. outputs for the rider / FX / audio
    pl.travelSign = this.travel;
    pl.edgeAngle = this.edge;
    pl.skidAngle = beta;
    const latA = speed * this.velYawRate;
    pl.latAccel += (latA - pl.latAccel) * (1 - Math.exp(-10 * dt));
    pl.turnVelocity = -yaw;     // legacy sign: + = turning left
    // Contact force per unit mass (what the rider leans against), lateral in the NOSE frame (+ = right
    // of the nose): carving pulls toward the inside, a sideways stop pushes back up the hill.
    _a.copy(v).sub(_v0).divideScalar(dt).sub(gTan);
    const noseRight = _r.crossVectors(slopeForward(pl.heading, n, _f), n).normalize();
    const lat = _a.dot(noseRight);
    pl.gearLatAccel += (clamp(lat, -30, 30) - pl.gearLatAccel) * (1 - Math.exp(-12 * dt));
    pl.skid += (clamp(Math.abs(Math.sin(beta)) * 2.2 + this.stop * 0.8, 0, 1) - pl.skid) * (1 - Math.exp(-8 * dt));
    pl.carve += (clamp(s * clamp(speed / 8, 0, 1), -1, 1) - pl.carve) * (1 - Math.exp(-7 * dt));
    pl.carveQuality = clamp(1 - wash / Math.max(k, 1e-3), 0, 1) * track;
  }

  stopMu() { return this.C.stopMu ?? this.C.skidMu; }

  /**
   * Largest edge angle θ the rider can hold at `speed`: θ ≤ φ(θ) + angulation, where φ = atan(a/g)
   * is the lean supported by the carve at θ (a = v² / (R_eff·cos θ), capped by grip). Bisection.
   */
  speedEdgeLimit(speed, side, surfGrip) {
    const C = this.C, g = P.gravity;
    const ang = (C.angulation ?? 25) * DEG, top = this.maxEdge(side);
    const rEff = this.sidecut(side) * (1 + C.speedRadius * smoothstep(C.speedRadiusV[0], C.speedRadiusV[1], speed));
    const aCap = this.latG(side) * g * surfGrip * this.H.grip;
    const ok = (th) => th <= Math.atan(Math.min(speed * speed / (rEff * Math.cos(th)), aCap) / g) + ang;
    if (ok(top)) return top;
    let lo = ang, hi = top;
    for (let i = 0; i < 10; i++) { const m = (lo + hi) / 2; if (ok(m)) lo = m; else hi = m; }
    return lo;
  }

  // ------------------------------------------------------------------ air
  pop() {
    const C = this.C, H = this.H;
    const v = (C.popMin + (C.popMax - C.popMin) * this.charge) * H.pop;
    return this._popEnd === 'nose' && C.nollie ? v * C.nollie : v;   // the nose is shorter / softer than the tail
  }

  /** Called by Player.enterAir — trick bookkeeping. */
  takeoffInfo(popped) {
    const pl = this.pl;
    // Rolled off a crest while loaded: keep the charge (and preload / wind-up) for a late pop.
    const late = !popped && this.charging;
    const keep = late ? { charge: this.charge, flipLoad: this.flipLoad, windup: this.windup } : null;
    this._lateT = late ? P.latePopTime : 0;
    this.takeoff = { switch: this.travel < 0, popped, spin: 0, flip: 0, grabT: 0, grab: null, end: this._popEnd || 'tail' };
    pl.flip = 0; pl.flipRate = 0;
    // A preloaded backflip leaves the lip already rotating and commits to the flip.
    this._flipCommit = popped && (this.flipLoad || 0) > 0.25;
    if (this._flipCommit) pl.flipRate = this.flipLoad * this.C.flipPreload;
    this.flipLoad = 0; pl.flipLoad = 0;
    // W / S already held at take-off (tuck, brake, nollie) don't start a flip until pressed again.
    const c = pl._ctrl || {};
    this._flipLock = { up: (c.up || 0) > 0.2, brake: (c.brake || 0) > 0.2 };
    // Pre-wind: carry part of the ground rotation into the air.
    pl.spinRate = -this.yawRate * this.C.prewind;
    if (popped) pl.spinRate += -(this.windup || 0) * this.C.windupSpin * this.H.spin;
    const cap = this.C.spinRateMax * this.H.spin;
    pl.spinRate = clamp(pl.spinRate, -cap, cap);
    // Spinning out of a butter pre-winds the spin.
    if (this.butter > 0.3) pl.spinRate += -this.yawRate * 0.4;
    this.takeoff.end = popped ? this._popEnd : null;
    this.windup = 0; pl.windup = 0; pl.grabName = null;
    this.charge = 0; this.charging = false; pl.squat = 0;
    this.butter = 0; this.press = 0;
    if (keep) { Object.assign(this, keep); this.charging = true; pl.squat = this.charge; }
  }

  air(dt, ctrl) {
    const pl = this.pl, C = this.C;
    const max = C.spinRateMax * this.H.spin * (1 - pl.grab * 0.15);
    const tLand = this.timeToLand();
    let target = 0, resp = C.spinResponse;
    if (ctrl.active && Math.abs(ctrl.steer) > 0.2) target = -ctrl.steer * max;
    else if (pl.airTime > 0.1) {
      // Stick released: within spinCheckAngle of a rideable alignment (nose, or tail if allowed, along
      // the path) settle onto it — checking the rotation if it just went past; farther away, momentum
      // carries the spin on to the next alignment, arriving by touchdown when that's reachable.
      const velYaw = Math.atan2(-pl.velocity.x, -pl.velocity.z);
      const tail = this.tailLandings();
      let d = angleDiff(pl.heading, velYaw);
      if (tail && Math.abs(d) > Math.PI / 2) d = angleDiff(pl.heading, velYaw + Math.PI);
      if (Math.abs(d) < P.spinCheckAngle * DEG) {
        target = Math.sign(d) * Math.min(max * 0.6, Math.abs(d) / Math.max(tLand, 0.1));
        resp = 10;
      } else if (Math.abs(pl.spinRate) > 0.8) {
        const dir = Math.sign(pl.spinRate), period = tail ? Math.PI : Math.PI * 2;
        let ahead = ((velYaw - pl.heading) * dir) % period;
        if (ahead < 0) ahead += period;
        target = dir * Math.min(max, ahead / Math.max(tLand, 0.12));
        resp = 5;
      }
    }
    pl.spinRate += (target - pl.spinRate) * (1 - Math.exp(-resp * dt));
    pl.heading += pl.spinRate * dt;
    if (this.takeoff) this.takeoff.spin += pl.spinRate * dt;
    const grabbing = ctrl.active && ctrl.tuck > 0.5 && pl.airTime > 0.12;
    this.flipStep(dt, ctrl, grabbing, tLand);
    pl.grab += ((grabbing ? 1 : 0) - pl.grab) * (1 - Math.exp(-(grabbing ? 12 : 8) * dt));
    if (this.takeoff && pl.grab > 0.7) { this.takeoff.grabT += dt; this.takeoff.grab ||= this.grabName(); pl.grabName = this.takeoff.grab; }
    if (!grabbing && pl.grab < 0.3) pl.grabName = null;
    // Landing assist (SSX-style): stick released just before touchdown → settle onto the nearest
    // rideable end if it's within a few degrees.
    if (ctrl.active && Math.abs(ctrl.steer) < 0.2 && pl.airTime > 0.2) {
      if (tLand < P.landAssistTime) {
        const velYaw = Math.atan2(-pl.velocity.x, -pl.velocity.z);
        let d = angleDiff(pl.heading, velYaw);
        if (this.tailLandings() && Math.abs(d) > Math.PI / 2) d = angleDiff(pl.heading, velYaw + Math.PI);
        if (Math.abs(d) < P.landAssistAngle * DEG) {
          pl.heading += d * (1 - Math.exp(-14 * dt));
          pl.spinRate *= Math.exp(-12 * dt);
        }
      }
    }
    pl.turnVelocity = pl.spinRate;
    this.edge *= Math.exp(-4 * dt);
    pl.edgeAngle = this.edge;
    pl.latAccel *= Math.exp(-6 * dt);
    pl.gearLatAccel *= Math.exp(-6 * dt);
    this.stop = 0;
  }

  /**
   * Flips about the gear's lateral axis (W = front, S = back; + flip = backflip, the leading end up).
   * A flip is a commitment: let go of the stick far from upright and momentum carries it on to the
   * next upright, timed to arrive by touchdown when it can; within flipSettle of upright the rider
   * spots the landing and opens up. Combined with a spin this reads as a cork / rodeo / misty.
   */
  flipStep(dt, ctrl, grabbing, tLand) {
    const pl = this.pl, C = this.C;
    const max = C.flipRateMax * Math.sqrt(this.H.spin) * (1 - pl.grab * 0.1);
    const L = this._flipLock || (this._flipLock = {});
    if (ctrl.up < 0.2) L.up = false;
    if (ctrl.brake < 0.2) L.brake = false;
    const input = ctrl.active && !grabbing && pl.airTime > 0.08 ? (L.brake ? 0 : ctrl.brake) - (L.up ? 0 : ctrl.up) : 0;
    const rem = wrapPi(pl.flip);                       // signed distance from upright
    // A preloaded take-off is committed through its first half turn (then momentum carries it anyway).
    if (Math.abs(pl.flip) >= Math.PI) this._flipCommit = false;
    const starting = this._flipCommit && Math.abs(pl.flip) < Math.PI;
    let target = 0, resp = C.flipResponse;
    if (Math.abs(input) > 0.2) target = input * max;
    else if (!starting && (Math.abs(rem) < 50 * DEG || Math.abs(pl.flipRate) < 0.6)) {
      target = clamp(-rem / Math.max(tLand, 0.15), -max * 0.7, max * 0.7);
      resp = 6;
    } else {
      const dir = Math.sign(pl.flipRate);
      const ahead = dir > 0 ? Math.PI * 2 - mod2Pi(pl.flip) : mod2Pi(pl.flip);
      target = dir * clamp(ahead / Math.max(tLand, 0.15), 1.2, max);
      resp = 3;
    }
    pl.flipRate += (target - pl.flipRate) * (1 - Math.exp(-resp * dt));
    pl.flip += pl.flipRate * dt;
    if (this.takeoff) this.takeoff.flip = pl.flip;
  }

  /** Pitch landing check: { dev (deg from upright), flips (whole rotations), back (bool), result }. */
  landFlip() {
    const pl = this.pl, C = this.C;
    const dev = Math.abs(wrapPi(pl.flip || 0)) / DEG;
    const flips = Math.round(Math.abs(pl.flip || 0) / (Math.PI * 2));
    const result = dev <= C.flipLandClean ? 'clean' : dev <= C.flipLandStumble ? 'stumble' : 'crash';
    return { dev, flips, back: (pl.flip || 0) > 0, result };
  }

  /** Predicted seconds until touchdown (ballistic, flat ground under the rider). */
  timeToLand() {
    const pl = this.pl;
    if (!pl.terrain) return 0.6;
    const h = Math.max(0, pl.position.y - pl.terrain.getHeight(pl.position.x, pl.position.z));
    const vy = pl.velocity.y, g = P.gravity;
    return (vy + Math.sqrt(Math.max(0, vy * vy + 2 * g * h))) / g;
  }

  grabName() { return 'Grab'; }
  /** Can this gear land tail-first? (boards always, skis only twin tips) */
  tailLandings() { return true; }

  /**
   * Landing evaluation. `devNose` = |yaw between the nose and the path| (0..π).
   * Returns { result: 'clean'|'stumble'|'slide'|'crash', switch, dev (deg) }.
   */
  land(devNose) { void devNose; return { result: 'clean', switch: false, dev: 0 }; }

  /** Trick name for the score popup. */
  trickLabel(t, spins) { return spins >= 1 ? `${spins * 180}` : ''; }
}
