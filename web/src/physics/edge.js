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
    this.takeoff = null;      // trick bookkeeping for the current air
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
    pl.turnInput += (ctrl.steer - pl.turnInput) * (1 - Math.exp(-(C.steerResponse ?? P.steerResponse) * pl.handling * dt));
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
    } else this.charging = false;
    if (!this.charging && !fire) this.charge = Math.max(0, this.charge - dt * 6);
    pl.squat = this.charge;
    this.onControl(dt, ctrl, grounded);
    return fire;
  }

  tuckFromUp(ctrl) { return ctrl.up; }
  onChargeStart() {}
  onControl() {}

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
    const thMax = this.maxEdge(side) * (1 - 0.4 * pl.tuck);
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
    const auth = C.pivotRate * H.pivot * (1 - smoothstep(C.pivotFade[0], C.pivotFade[1], speed) * (1 - C.pivotHigh));
    let pivot = s * auth * (1 - this.stop) * (mode.pivotMul ?? 1);
    // Pivot can't wind the skid angle up forever: fade as β (same direction) approaches betaMax.
    if (pivot * beta > 0) pivot *= Math.max(0, 1 - Math.abs(beta) / (C.betaMax * DEG));
    yaw += pivot + (mode.yaw || 0);
    pl.heading -= yaw * dt;              // + yaw = turning right = heading decreasing
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
    const mu = (P.frictionGroomed * S.x + P.frictionPowder * S.y / Math.sqrt(H.float * C.powderFloat) + P.frictionRock * S.z
      + P.frictionPowder * S.w / Math.sqrt(H.float * C.powderFloat)) / Math.max(1e-3, S.x + S.y + S.z + S.w);
    speed = v.length();
    let decel = mu * g * n.y;
    decel += lerp(C.dragUpright, C.dragTuck, pl.tuck) * speed * speed;
    decel += P.softCapDrag * Math.max(0, speed - C.maxVelocity) ** 2;
    const skidMu = this.stop > 0 ? lerp(C.skidMu, this.stopMu(), this.stop) : C.skidMu;
    decel += skidMu * g * Math.abs(Math.sin(beta)) * (0.35 + 0.65 * edgeGrip) / Math.max(0.7, H.stability) * (mode.skidMul ?? 1);
    decel += this.extraDecel(ctx);
    // Powder: slow skis plough and sink, fast ones plane; floatier gear sinks less and bogs later.
    const float = H.float * C.powderFloat;
    pl.powder = pw;
    const plane = smoothstep(C.powderBog * 0.6, C.powderBog * 1.6, speed);
    // Sink depth: deep when slow, planing up with speed; floatier gear (area, rocker, setback) sinks less.
    const sinkT = pw * lerp(C.sinkSlow, C.sinkFast, plane * plane * (3 - 2 * plane)) / Math.sqrt(float / C.powderFloat);
    pl.sink += (sinkT - pl.sink) * (1 - Math.exp(-4 * dt));
    decel += P.turnScrub * Math.abs(pl.carve) * speed * pw / Math.sqrt(float);
    decel += C.powderBogDecel * pw * (1 - plane) / H.float;          // bogging down below the planing speed
    decel += C.powderDrag * pl.sink * speed;                         // ploughing: a = k · depth · v
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

  // ------------------------------------------------------------------ air
  pop() {
    const C = this.C, H = this.H;
    const v = (C.popMin + (C.popMax - C.popMin) * this.charge) * H.pop;
    return v;
  }

  /** Called by Player.enterAir — trick bookkeeping. */
  takeoffInfo(popped) {
    const pl = this.pl;
    this.takeoff = { switch: this.travel < 0, popped, spin: 0, grabT: 0, grab: null, end: this._popEnd || 'tail' };
    // Pre-wind: carry part of the ground rotation into the air.
    pl.spinRate = -this.yawRate * this.C.prewind;
    this.charge = 0; this.charging = false; pl.squat = 0;
  }

  air(dt, ctrl) {
    const pl = this.pl, C = this.C;
    const target = ctrl.active ? -ctrl.steer * C.spinRateMax * this.H.spin * (1 - pl.grab * 0.15) : 0;
    pl.spinRate += (target - pl.spinRate) * (1 - Math.exp(-C.spinResponse * dt));
    pl.heading += pl.spinRate * dt;
    if (this.takeoff) this.takeoff.spin += pl.spinRate * dt;
    const grabbing = ctrl.active && ctrl.tuck > 0.5 && pl.airTime > 0.12;
    pl.grab += ((grabbing ? 1 : 0) - pl.grab) * (1 - Math.exp(-(grabbing ? 12 : 8) * dt));
    if (this.takeoff && pl.grab > 0.7) { this.takeoff.grabT += dt; this.takeoff.grab ||= this.grabName(); }
    pl.turnVelocity = pl.spinRate;
    this.edge *= Math.exp(-4 * dt);
    pl.edgeAngle = this.edge;
    pl.latAccel *= Math.exp(-6 * dt);
    pl.gearLatAccel *= Math.exp(-6 * dt);
    this.stop = 0;
  }

  grabName() { return 'Grab'; }

  /**
   * Landing evaluation. `devNose` = |yaw between the nose and the path| (0..π).
   * Returns { result: 'clean'|'stumble'|'slide'|'crash', switch, dev (deg) }.
   */
  land(devNose) { void devNose; return { result: 'clean', switch: false, dev: 0 }; }

  /** Trick name for the score popup. */
  trickLabel(t, spins) { return spins >= 1 ? `${spins * 180}` : ''; }
}
