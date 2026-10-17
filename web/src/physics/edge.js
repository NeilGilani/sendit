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
import { emit } from '../state.js';

let lockHinted = false, lateHinted = false;   // the "held key is locked" / "too late to flip" hints show once per page

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
    // Letting go (input back at neutral) relaxes faster than a turn builds, so the turn settles
    // instead of fading out; steering itself keeps the normal response.
    this.released = Math.abs(ctrl.steer) < 0.05;
    const resp = this.released ? (C.steerRelease ?? C.steerResponse ?? P.steerResponse) : (C.steerResponse ?? P.steerResponse);
    pl.turnInput += (steer - pl.turnInput) * (1 - Math.exp(-resp * pl.handling * dt));
    // S while charging a pop is a backflip preload, not a brake.
    const brakeIn = this.charging ? 0 : ctrl.brake;
    pl.brake += (brakeIn - pl.brake) * (1 - Math.exp(-6 * dt));
    const anyDir = Math.abs(ctrl.steer) > 0.1 || ctrl.brake > 0.1;
    this._noInputT = anyDir ? 0 : (this._noInputT || 0) + dt;
    const auto = this._noInputT > P.autoTuckDelay && pl.speedRatio > P.autoTuckSpeedRatio ? 1 : 0;
    const want = Math.max(ctrl.tuck, this.tuckFromUp(ctrl), auto) * (1 - brakeIn);
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
  onChargeStart(ctrl) { this._popEnd = ctrl.up > 0.3 ? 'nose' : 'tail'; this._upHeld = ctrl.up > 0.3; }   // W from the start: a nollie, not a frontflip preload
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
    // … and W pressed while charging winds up a frontflip, which only commits if W is still held as the
    // rider leaves the snow. W already held when the charge starts (a tuck, or W + Space for a nollie)
    // doesn't count until it's let go and pressed again, so tucking into a pop never frontflips.
    if (!this.charging) this._upHeld = ctrl.up > 0.3;
    else if (ctrl.up < 0.2) this._upHeld = false;
    this.frontLoad = approach(this.frontLoad || 0, loading && ctrl.up > 0.3 && !this._upHeld && ctrl.brake < 0.3 ? 1 : 0, dt / (this.charging ? 0.35 : 0.1));
    pl.flipLoad = this.flipLoad - this.frontLoad;   // signed for the rider: + arches back, − folds forward
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
    // First-order lean response, rate-limited by how fast the rider can roll edge to edge. With the
    // input released (and no stop / plough / butter setting the edge) the gear flattens at edgeRelease.
    const er = this.released && mode.edge === undefined ? (C.edgeRelease ?? C.edgeResponse) : C.edgeResponse;
    this.edge = approach(this.edge, lerp(this.edge, edgeT, 1 - Math.exp(-er * dt)), rate * dt);

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
    // At speed the grip limit is reached on a light edge (≈ 20° at 30 m/s), so past it more input only
    // added skid. The share of the max edge the rider holds now picks the same share of the grip-limited
    // curvature (C.carveInput blends it in): the turn grows evenly with the stick at 50–70 mph. Slow
    // carves never reach the grip limit, so they're unchanged; stops / ploughs set their own edge.
    const frac = mode.edge === undefined ? clamp(th / Math.max(thMax, 1e-3), 0, 1) : 1;
    const kIn = kGrip * lerp(1, frac, C.carveInput ?? 0);
    const k = Math.min(kGeo, kIn);
    // Over-demand that does skid is capped at washMax × the grip curvature: at 30 m/s a full edge asks
    // 3–4× what grip allows, which used to turn into a 15–19° wash-out.
    const wash = Math.min(Math.max(0, kGeo - kGrip) * (1 - C.carveAssist), kGrip * (C.washMax ?? Infinity)) * lerp(1, frac, C.carveInput ?? 0);
    const track = 1 - smoothstep(C.trackBeta[0] * DEG, C.trackBeta[1] * DEG, Math.abs(beta));
    let yaw = eSide * Math.abs(vf) * (k * track + wash) * (1 - this.stop);
    // Rotary pivot (skidded steering) only fills the gap between what the carve gives and the turn
    // rate the rider asks for: slow → mostly pivot/skid, mid speed → pure carve, fast → grip-limited
    // carve plus a little skid when asking for more.
    // At speed the turn asked for is held near what the grip can carve (C.pivotGrip ×), so full lock
    // is a deep carve with a little drift instead of washing out into a skid.
    const wantFull = lerp(C.pivotRate, C.turnRateFast, smoothstep(C.pivotFade[0], C.pivotFade[1], speed)) * H.pivot;
    const want = Math.abs(s) * Math.min(wantFull, C.pivotGrip ? kGrip * Math.abs(vf) * C.pivotGrip : Infinity);
    let pivot = Math.sign(s) * Math.max(0, want - Math.abs(yaw) * (Math.sign(yaw) === Math.sign(s) ? 1 : 0)) * (1 - this.stop) * (mode.pivotMul ?? 1);
    // Pivot can't wind the skid angle up forever: fade as β (same direction) approaches betaMax.
    if (pivot * beta > 0) pivot *= Math.max(0, 1 - Math.abs(beta) / (C.betaMax * DEG));
    yaw += pivot + (mode.yaw || 0);
    pl.heading -= yaw * dt;              // + yaw = turning right = heading decreasing
    // Pivoting about a pressed end (butters): the stance centre swings around that end.
    if (mode.pivotOffset) pl.position.addScaledVector(_r.crossVectors(fwd, n).normalize(), mode.pivotOffset * (mode.yaw || 0) * dt);
    // Edges track their own path when the rider isn't steering (self-aligning).
    if (speed > 1.2 && !mode.noAlign) {
      // (P.wallAlign, opt-in: on steep transitions — pipe walls — track the path ON the snow, not its horizontal part.)
      const velYaw = (P.wallAlign && n.y < 0.94 ? pathYaw(v, n) : Math.atan2(-v.x, -v.z)) + (this.travel < 0 ? Math.PI : 0);
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
    // SEND IT (flow state): tucking boosts, SSX-style — a little thrust on top of gravity.
    if (pl.flowBoost && pl.tuck > 0.3 && this.stop < 0.2) v.addScaledVector(tdir, flowK(pl, 'boostAccel') * pl.tuck * dt);
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
    decel += P.softCapDrag * Math.max(0, speed - C.maxVelocity * (1 + flowK(pl, 'speedBoost'))) ** 2;
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
    const v = (C.popMin + (C.popMax - C.popMin) * this.charge) * H.pop * (1 + flowK(this.pl, 'popBoost'));
    return this._popEnd === 'nose' && C.nollie ? v * C.nollie : v;   // the nose is shorter / softer than the tail
  }

  // Rotation in the air follows angular momentum (docs/jumps-research.md):
  //   • The take-off SETS it: the carve's pre-wind, the wind-up (steer while loading the pop), the flip
  //     preload (S while loading), all scaled by how well the pop was timed (popQ: 1 = released right at
  //     the lip, less for an early pop on the flat, a late coyote pop or rolling off without one).
  //   • For the first `spinThrow` / `flipThrow` s of the air the arms and shoulders can still finish the
  //     throw (steer / W / S add to it, less and less as the window closes).
  //   • After that the rider can only change shape: tuck (keep the stick / key in the direction of the
  //     rotation) turns faster, × spinTuckGain / flipTuckGain; opening up (stick against it) slows down,
  //     × spinOpen; let go and the rider spots the landing — picks the pose, within what the momentum
  //     allows, that arrives at the next rideable alignment at touchdown, extending for the last
  //     flipSpot s. So how far you rotate comes from the set and the air time, not from holding a key:
  //     1–2 flips with good timing on a big kicker, a triple needs a perfect set and ~2.8 s of air.
  // State: spinH / flipH = angular momentum as the rate in the neutral (spin) / open (flip) pose, rad/s.

  /** Called by Player.enterAir — trick bookkeeping and the rotation set at take-off. */
  takeoffInfo(popped) {
    const pl = this.pl, C = this.C;
    // Rolled off a crest while loaded: keep the charge (and preload / wind-up) for a late pop.
    const late = !popped && this.charging;
    const keep = late ? { charge: this.charge, flipLoad: this.flipLoad, frontLoad: this.frontLoad, windup: this.windup } : null;
    this._lateT = late ? P.latePopTime : 0;
    this.takeoff = { switch: this.travel < 0, popped, spin: 0, flip: 0, grabT: 0, grab: null, end: this._popEnd || 'tail' };
    // How well the set was timed: the pop's own quality, or a weaker set rolling off without a pop.
    const q = this.popQ = popped ? clamp(pl.lastPopQ ?? 1, 0, 1) : C.rollSet;
    pl.flip = 0; pl.flipRate = 0; pl.flipTuck = 0;
    this.flipH = 0; this.tuckLoad = 0;
    // A preloaded flip leaves the lip already rotating and commits to it: S while charging = backflip,
    // W while charging and still held at the lip = frontflip (off the nose).
    const c = pl._ctrl || {};
    const front = popped && (this.frontLoad || 0) > 0.25 && (c.up || 0) > 0.3 && !((this.flipLoad || 0) > 0.25);
    this._flipCommit = popped && ((this.flipLoad || 0) > 0.25 || front);
    if (this._flipCommit) this.flipH = (front ? -this.frontLoad : this.flipLoad) * C.flipPreload * q * this.flipCap();
    this.flipLoad = 0; this.frontLoad = 0; pl.flipLoad = 0;
    // W / S already held at take-off (tuck, brake) don't throw a flip until pressed again — a W tuck held
    // down a line and off a cliff mustn't flip you — but the key of a preload is the same throw, so it
    // carries on. A re-press works at any time (the late throw, flipStep).
    this._flipLock = { up: (c.up || 0) > 0.2 && !(front && this._flipCommit), brake: (c.brake || 0) > 0.2 && !(this._flipCommit && !front) };
    this._lockHintT = 0;
    // How long this air should last (sets how long the throw window stays open, flipStep / spinStep).
    this.airPred = this.timeToLand();
    // Rolling off a crest / lip without popping: the turn held from the ground is carving, not a spin
    // — it only spins once steer is let go and pressed again (popped jumps spin straight away).
    this._spinLock = !popped && Math.abs(c.steer || 0) > 0.2 ? Math.sign(c.steer) : 0;
    // Pre-wind: carry part of the ground rotation into the air (maps with airSettleAngle: rolling off a lip
    // by accident carries only a third of the carve into the air); the wind-up springs into the spin.
    let h = -this.yawRate * C.prewind * (popped || !P.airSettleAngle ? 1 : 0.35);
    if (popped) h += -(this.windup || 0) * C.windupSpin * this.H.spin * q;
    this._spinPre = popped && Math.abs(this.windup || 0) > 0.3;   // wound up: the throw can finish a full set
    if (this.butter > 0.3) h += -this.yawRate * 0.4;   // spinning out of a butter pre-winds the spin
    this.spinH = clamp(h, -this.spinCap(), this.spinCap());
    pl.spinRate = this.spinH; pl.spinTuck = 0;
    this.takeoff.end = popped ? this._popEnd : null;
    this.takeoff.set = q;
    this.windup = 0; pl.windup = 0; pl.grabName = null;
    this.charge = 0; this.charging = false; pl.squat = 0;
    this.butter = 0; this.press = 0;
    if (keep) { Object.assign(this, keep); this.charging = true; pl.squat = this.charge; }
  }

  /** Largest spin momentum (neutral-pose rad/s) a full set gives this gear. */
  spinCap() { return this.C.spinSet * this.H.spin * (1 + flowK(this.pl, 'spinBoost')); }
  /** Largest flip momentum (open-pose rad/s). */
  flipCap() { return this.C.flipSet * Math.sqrt(this.H.spin) * (1 + flowK(this.pl, 'spinBoost')); }

  air(dt, ctrl) {
    const pl = this.pl, C = this.C;
    const tLand = this.timeToLand();
    // Grabs: reached for after the take-off, let go of just before touchdown (the legs land, not the hand).
    const grabbing = ctrl.active && ctrl.tuck > 0.5 && pl.airTime > 0.12 && tLand > C.grabLetGo;
    this.spinStep(dt, ctrl, grabbing, tLand);
    if (this.takeoff) this.takeoff.spin += pl.spinRate * dt;
    this.flipStep(dt, ctrl, grabbing, tLand);
    // Grabs take a moment to reach (~0.2 s) and to let go of.
    pl.grab += ((grabbing ? 1 : 0) - pl.grab) * (1 - Math.exp(-(grabbing ? C.grabRate : C.grabRelease) * dt));
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
          this.spinH *= Math.exp(-12 * dt);
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

  /** Spin about the vertical (see the rotation notes above). Sets pl.spinRate, pl.spinTuck (−1 open … +1 tucked). */
  spinStep(dt, ctrl, grabbing, tLand) {
    const pl = this.pl, C = this.C;
    const cap = this.spinCap(), t = pl.airTime;
    if (this._spinLock && (Math.abs(ctrl.steer) < 0.2 || Math.sign(ctrl.steer) !== this._spinLock)) this._spinLock = 0;
    const steer = ctrl.active && !this._spinLock && Math.abs(ctrl.steer) > 0.2 ? ctrl.steer : 0;
    let h = this.spinH || 0;
    // The throw: early in the air the shoulders can still add to the set (less and less).
    const win = C.spinThrow + C.spinThrowAir * clamp((this.airPred ?? 1) - 1, 0, 2);   // longer on a bigger air
    const throwing = steer && t < win;
    if (throwing) {
      const eff = (1 - (t / win) ** 2) * (0.5 + 0.5 * this.popQ);
      // A throw alone sets less than a wound-up pop; a full set needs the pop right at the lip too.
      const lim = (this._spinPre ? cap * (0.6 + 0.4 * this.popQ) : C.spinThrowMax * this.H.spin) * Math.sign(-steer);
      h = approach(h, clamp(lim, -cap, cap), C.spinThrowRate * Math.abs(steer) * eff * dt);
    }
    // Shape: tucked (stick with the spin), open (against), grabbing = compact, released = spotting.
    let pose = 0, rate = null;
    const dir = Math.sign(h), spinning = Math.abs(h) > C.spinMinH;
    if (grabbing) pose = 0.6;
    else if (throwing) pose = 0.5;
    else if (steer && spinning) pose = Math.sign(-steer) === dir ? 1 : -1;
    else if (steer) rate = -steer * C.airTwist;   // no momentum: twist the hips a little (no momentum is made)
    else if (pl.airTime > 0.1) {
      // Spot the landing: the next rideable alignment (nose, or tail if allowed, along the path).
      const velYaw = Math.atan2(-pl.velocity.x, -pl.velocity.z);
      const tail = this.tailLandings();
      let d = angleDiff(pl.heading, velYaw);
      if (tail && Math.abs(d) > Math.PI / 2) d = angleDiff(pl.heading, velYaw + Math.PI);
      const settleA = !spinning && P.airSettleAngle ? Math.max(P.spinCheckAngle, P.airSettleAngle) : P.spinCheckAngle;
      const period = tail ? Math.PI : Math.PI * 2;
      let ahead = spinning ? ((velYaw - pl.heading) * dir) % period : 0;
      if (ahead < 0) ahead += period;
      const need = ahead / Math.max(tLand, 0.12);   // rate that arrives on the next alignment at touchdown
      const reach = need <= Math.abs(h) * C.spinTuckGain;
      // The alignment just passed, if the upper body can still check back to it before touchdown.
      const back = spinning ? period - ahead : Infinity, canCheck = back <= C.spinCheck * Math.max(tLand, 0.1);
      if (Math.abs(d) < settleA * DEG && (!spinning || !reach || Math.abs(d) < 12 * DEG)) {
        // Close to an alignment (or not spinning): check the spin onto it (the upper body counter-rotates).
        rate = clamp(d / Math.max(tLand, 0.1), -C.spinCheck, C.spinCheck);
      } else if (spinning && !reach && canCheck) {
        // Too little spin to come round (a carve's pre-wind off a lip, an under-set): check back instead of
        // landing sideways or backwards.
        rate = clamp(-dir * back / Math.max(tLand, 0.1), -C.spinCheck, C.spinCheck);
      } else if (spinning) {
        const f = need / Math.abs(h);
        pose = f >= 1 ? Math.min(1, (f - 1) / (C.spinTuckGain - 1)) : -Math.min(1, (1 - f) / (1 - C.spinOpen));
      }
    }
    pl.spinTuck = approach(pl.spinTuck || 0, pose, dt / C.poseTime);
    const k = pl.spinTuck >= 0 ? 1 + (C.spinTuckGain - 1) * pl.spinTuck : 1 + (1 - C.spinOpen) * pl.spinTuck;
    const target = rate !== null ? rate : h * k;
    pl.spinRate += (target - pl.spinRate) * (1 - Math.exp(-C.spinResponse * dt));
    // Checking a spin (or twisting against it) bleeds the momentum off; it doesn't come back.
    if (rate !== null && spinning) h = Math.sign(pl.spinRate) === dir ? dir * Math.min(Math.abs(h), Math.abs(pl.spinRate)) : 0;
    this.spinH = h;
    pl.heading += pl.spinRate * dt;
  }

  /**
   * Flips about the gear's lateral axis (W = front, S = back; + flip = backflip, the leading end up).
   * Momentum (flipH) comes from the preload and the throw (see the rotation notes above); the key held
   * in the flip's direction tucks (× flipTuckGain), against it opens to the layout; let go and the rider
   * spots the landing: the tuck that brings the next upright round at touchdown, extending for the last
   * flipSpot s. Combined with a spin this reads as a cork / rodeo / misty.
   */
  flipStep(dt, ctrl, grabbing, tLand) {
    const pl = this.pl, C = this.C;
    const cap = this.flipCap(), t = pl.airTime;
    const L = this._flipLock || (this._flipLock = {});
    if (ctrl.up < 0.2) L.up = false;
    if (ctrl.brake < 0.2) L.brake = false;
    // A key held through the take-off stays locked until it's pressed again: on a real air, say so (once).
    if (ctrl.active && !lockHinted && t > 0.5 && tLand > 0.8 && ((L.up && ctrl.up > 0.5) || (L.brake && ctrl.brake > 0.5))) {
      lockHinted = true;
      emit('hint', 'Flip: let go of W / S and press it again in the air (held from the take-off it stays a tuck / brake)');
    }
    // (A grab no longer blocks the flip keys: a grabbed backflip is a tuck with a hand on the board.)
    const raw = ctrl.active && t > 0.04 ? (L.brake ? 0 : ctrl.brake) - (L.up ? 0 : ctrl.up) : 0;
    // Wide dead zone: a stick pushed a little off-axis while spinning shouldn't flip (keys = full).
    const input = Math.sign(raw) * clamp((Math.abs(raw) - 0.4) / 0.6, 0, 1);
    let h = this.flipH || 0;
    const rem = wrapPi(pl.flip);                       // signed distance from upright
    // No new flip on a little hop or just before touchdown.
    const room = !(tLand < C.flipMinAir && Math.abs(h) < C.flipMinH);
    // The throw: early in the air W / S add to the flip (a preload already set most of it). The window
    // stays open longer on a bigger air (flipThrowAir s per s of expected air beyond 1 s).
    const win = C.flipThrow + C.flipThrowAir * clamp((this.airPred ?? 1) - 1, 0, 2);
    const throwing = Math.abs(input) > 0.2 && t < win && room;
    if (throwing) {
      const eff = (1 - (t / win) ** 2) * (0.5 + 0.5 * this.popQ);
      // A throw alone sets less than a preload; a full set needs the pop right at the lip too.
      const lim = (this._flipCommit ? cap * (0.6 + 0.4 * this.popQ) : C.flipThrowMax * Math.sqrt(this.H.spin)) * Math.sign(input);
      h = approach(h, clamp(lim, -cap, cap), C.flipThrowRate * Math.abs(input) * eff * dt);
    }
    // The late throw: after the window W / S still start (or build) a flip — slowly, and only up to
    // flipLateMax, so a big air allows a late single but never a set; it needs flipLateAir s of air left.
    const late = !throwing && Math.abs(input) > 0.2 && Math.abs(h) < C.flipLateMax
      && (Math.sign(input) === Math.sign(h) || Math.abs(h) < C.flipMinH) && (Math.abs(h) > C.flipMinH || tLand > C.flipLateAir);
    if (late) h = approach(h, Math.sign(input) * C.flipLateMax, C.flipLateRate * Math.abs(input) * dt);
    // Pressed too late for any flip to come round: say how it's done (once), rather than nothing at all.
    else if (!throwing && Math.abs(input) > 0.5 && Math.abs(h) < C.flipMinH && ctrl.active && !lateHinted && t > 0.2) {
      lateHinted = true;
      emit('hint', 'Flips are thrown at the lip: press W / S as you pop (or hold S while loading the jump)');
    }
    const dir = Math.sign(h), flipping = Math.abs(h) > C.flipMinH;
    // Shape: −1 stretched layout (× flipOpen), 0 open, 1 tight tuck (× flipTuckGain).
    let tuck = 0, rate = null;
    if (throwing || late) tuck = 1;
    else if (flipping && Math.abs(input) > 0.2) tuck = Math.sign(input) === dir ? 1 : -1;   // against the flip: stretch out
    else if (flipping) {
      // Spot the landing: the next upright ahead in the flip's direction, arriving at touchdown.
      // Plan to come round early and open up (layout, legs stretched) for the last flipSpot s: the tuck
      // needed until then is whatever the rest of the rotation asks for beyond the open rate.
      const ahead = dir > 0 ? Math.PI * 2 - mod2Pi(pl.flip) : mod2Pi(pl.flip);
      const tOpen = Math.min(C.flipSpot, tLand * 0.5);
      const need = tLand > tOpen + 0.05 ? Math.max(0, ahead - Math.abs(h) * tOpen) / (tLand - tOpen) : ahead / Math.max(tLand, 0.08);
      const f = need / Math.abs(h);
      tuck = f >= 1 ? clamp((f - 1) / (C.flipTuckGain - 1), 0, 1) : -clamp((1 - f) / (1 - C.flipOpen), 0, 1);
      // Just past upright with the next one out of reach: stretch out and ride out the small over-rotation
      // (whichever lands closer to upright) instead of chasing a whole extra turn.
      const past = Math.PI * 2 - ahead, over = past + Math.abs(h) * C.flipOpen * tLand;
      const short = Math.max(0, ahead - Math.abs(h) * C.flipTuckGain * tLand);
      if (over < short) tuck = -1;
      if (grabbing) tuck = Math.max(tuck, 0.1);             // a grab keeps the body compact (no stretched layout)
    } else rate = clamp(-rem / Math.max(tLand, 0.15), -C.flipCheck, C.flipCheck);   // no flip: just level out
    // A tight tuck at speed takes real strength (the legs hold against a load ∝ ω²): it holds at full gain
    // for flipTuckHold s, then fades over flipTuckFade s to flipTuckFloor of the tuck; opening up recovers.
    this.tuckLoad = Math.max(0, (this.tuckLoad || 0) + (pl.flipTuck > 0.3 ? pl.flipTuck : -0.5) * dt);
    const strength = 1 - (1 - C.flipTuckFloor) * clamp((this.tuckLoad - C.flipTuckHold) / C.flipTuckFade, 0, 1);
    pl.flipTuck = approach(pl.flipTuck || 0, Math.min(tuck, strength), dt / C.poseTime);
    const k = pl.flipTuck >= 0 ? 1 + (C.flipTuckGain - 1) * pl.flipTuck : 1 + (1 - C.flipOpen) * pl.flipTuck;
    const target = rate !== null ? rate : h * k;
    pl.flipRate += (target - pl.flipRate) * (1 - Math.exp(-C.flipResponse * dt));
    this.flipH = h;
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
    // March the ballistic path against the real terrain (a drop or a downhill landing is longer than
    // the height above the snow right below suggests).
    const pl = this.pl, T = pl.terrain;
    if (!T) return 0.6;
    const g = P.gravity * (P.airGravity ?? 1), h = 0.04;
    let x = pl.position.x, y = pl.position.y, z = pl.position.z, vy = pl.velocity.y;
    const vx = pl.velocity.x, vz = pl.velocity.z;
    for (let t = h; t <= 3; t += h) {
      vy -= g * h; x += vx * h; y += vy * h; z += vz * h;
      if (y <= T.getHeight(x, z)) return t;
    }
    return 3;
  }

  /** Late pop (coyote time): add the loaded wind-up / preload to the air already under way. */
  latePop() {
    const pl = this.pl, C = this.C, t = this.takeoff;
    // The set off a late pop is weaker the later it comes (popQ from Player.jump).
    const q = this.popQ = clamp(pl.lastPopQ ?? 0.8, 0, 1);
    if (t) { t.popped = true; t.end = this._popEnd; t.set = q; }
    const cap = this.spinCap();
    this.spinH = clamp((this.spinH || 0) - (this.windup || 0) * C.windupSpin * this.H.spin * q, -cap, cap);
    if (Math.abs(this.windup || 0) > 0.3) this._spinPre = true;
    if ((this.flipLoad || 0) > 0.25 && Math.abs(pl.flip) < 0.3) {
      this._flipCommit = true;
      this._flipLock.brake = false;
      this.flipH = Math.max(this.flipH || 0, this.flipLoad * C.flipPreload * q * this.flipCap());
    } else if ((this.frontLoad || 0) > 0.25 && (pl._ctrl?.up || 0) > 0.3 && Math.abs(pl.flip) < 0.3) {
      this._flipCommit = true;
      this._flipLock.up = false;
      this.flipH = Math.min(this.flipH || 0, -this.frontLoad * C.flipPreload * q * this.flipCap());
    }
    this.windup = 0; pl.windup = 0; this.flipLoad = 0; this.frontLoad = 0; pl.flipLoad = 0;
    this.charge = 0; this.charging = false; pl.squat = 0; this._lateT = 0;
    this._spinLock = 0;   // a deliberate pop: the held turn spins
  }

  grabName() { return 'Grab'; }
  /** Can this gear land tail-first? (boards always, skis only twin tips) */
  tailLandings() { return true; }

  /**
   * Landing evaluation. `devNose` = |yaw between the nose and the path| (0..π).
   * Returns { result: 'clean'|'stumble'|'slide'|'crash', switch, dev (deg) }.
   */
  land(devNose, tol = 1) { void devNose; void tol; return { result: 'clean', switch: false, dev: 0 }; }

  /** Trick name for the score popup. */
  trickLabel(t, spins) { return spins >= 1 ? `${spins * 180}` : ''; }
}

/**
 * The yaw whose projection onto the slope (normal n) points along v: h = v − (v.y / n.y)·n is horizontal and
 * projects onto v. On a 70–80° pipe wall the horizontal part of a climbing velocity points along the wall, so the
 * plain atan2 of it would steer the gear sideways.
 */
export function pathYaw(v, n) {
  const k = v.y / Math.max(n.y, 0.05), hx = v.x - k * n.x, hz = v.z - k * n.z;
  return hx * hx + hz * hz > 1e-8 ? Math.atan2(-hx, -hz) : Math.atan2(-v.x, -v.z);
}

/** Flow-state boost for a tunable (physics/flow.js): 0 unless the map runs the flow layer and it is on. */
function flowK(pl, key) { return pl.flowBoost ? pl.flowBoost * (pl.flow?.C[key] || 0) : 0; }
