// SnowboardPhysics — one wide edge-to-edge platform ridden sideways. Differences from skis:
//   • stance (regular = left foot forward / goofy) and switch riding (tail first, travel = −1)
//   • toe-side vs heel-side asymmetry: toe edge carves deeper and grips harder, heel edge is lower,
//     slides earlier but stops harder; rolling toe → heel takes longer than heel → toe
//   • shorter sidecut (≈8 m) → tighter carves, slower edge changes, rotation-led skidded turns
//   • heel-side slide stop (or toe-side when steering toward the toes) instead of a snowplough
//   • butters: hold Space (tail press) or W+Space (nose press) and steer → pivot on the flexed end
//   • ollie (tail) / nollie (nose, W held) from the stored flex, pre-wound spins, frontside/backside
//   • nose float in powder (setback + rocker), weaker one-foot skate on the flat
// Tunables: PHYSICS.snowboard in config.js.
import { PHYSICS as P } from '../config.js';
import { EdgePhysics } from './edge.js';
import { clamp, smoothstep, angleDiff, DEG } from './math.js';

export class SnowboardPhysics extends EdgePhysics {
  constructor(player, spec, handling) {
    super(player, spec, handling, P.snowboard);
    this.press = 0;           // −1 tail … +1 nose
    this.butter = 0;          // 0..1 butter engagement
  }

  get type() { return 'snowboard'; }
  /** +1 if the toe edge is on the right of the travel direction (regular riding forward). */
  get toeSide() { return (this.pl.stance === 'goofy' ? -1 : 1) * this.travel; }
  isToe(side) { return side === this.toeSide; }

  maxEdge(side) { return (this.isToe(side) ? this.C.maxEdgeToe : this.C.maxEdgeHeel) * DEG; }
  latG(side) {
    const sw = this.travel < 0 && !this.H.twin ? 0.95 : 1;   // directional boards grip a touch less switch
    return (this.isToe(side) ? this.C.latGToe : this.C.latGHeel) * sw;
  }
  sidecut(side) { return this.H.sidecutRadius * (this.isToe(side) ? this.C.sidecutToe : this.C.sidecutHeel); }
  edgeRate(from, to) {
    const C = this.C;
    // Crossing flat toward the toe edge is quicker (knees/ankles drive) than rolling back onto the heels.
    const towardToe = Math.sign(to - from) === this.toeSide;
    const t = towardToe ? C.heelToToe : C.toeToHeel;
    return ((C.maxEdgeToe + C.maxEdgeHeel) * DEG) / t;
  }

  tuckFromUp(ctrl) { return this.charging ? 0 : ctrl.up * 0.7; }

  onChargeStart(ctrl) { this._popEnd = ctrl.up > 0.3 ? 'nose' : 'tail'; }

  onControl(dt, ctrl, grounded) {
    const pl = this.pl, C = this.C;
    // Nose / tail press: loading for a pop doubles as a press for butters.
    const pressT = grounded && this.charging ? (this._popEnd === 'nose' ? 1 : -1) * (0.4 + 0.6 * this.charge) : 0;
    this.press += (pressT - this.press) * (1 - Math.exp(-10 * dt));
    const canButter = grounded && this.charging && pl.speed < C.butterMaxSpeed;
    const wantButter = canButter && Math.abs(ctrl.steer) > 0.2 ? 1 : 0;
    this.butter += (wantButter - this.butter) * (1 - Math.exp(-(wantButter ? 10 : 6) * dt));
    // Slide stop: heel side by default; toe side when steering toward the toes.
    const b = grounded ? ctrl.brake : 0;
    const wantStop = b > 0.3 && (pl.speed > 1.0 || this.stop > 0.3);
    if (wantStop && this.stop < 0.05) {
      const toward = Math.sign(ctrl.steer);
      this.stopSide = toward || -this.toeSide;    // heel side = opposite the toes
    }
    this.stop += ((wantStop ? 1 : 0) - this.stop) * (1 - Math.exp(-(wantStop ? 8 : 4.5) * dt));
    pl.press = this.press; pl.butter = this.butter; pl.stop = this.stop; pl.stopSide = this.stopSide;
    pl.stopToe = this.stopSide === this.toeSide;
    pl.plow = 0;
  }

  modes(dt, ctx) {
    const C = this.C;
    const m = {};
    if (this.stop > 0.02 && ctx.speed > 0.6) {
      const velYaw = Math.atan2(-ctx.v.x, -ctx.v.z) + (this.travel < 0 ? Math.PI : 0);
      const target = velYaw - this.stopSide * C.stopAngle * DEG;
      const err = angleDiff(this.pl.heading, target);
      m.yaw = clamp(-err * 9, -C.stopTurnRate, C.stopTurnRate) * this.stop;
      const toe = this.stopSide === this.toeSide;
      m.edge = this.stopSide * (toe ? C.stopEdgeToe : C.stopEdgeHeel) * DEG * this.stop;
      m.gripMul = 1 - this.stop * 0.95;
      m.effMul = 1 - this.stop;
      m.noAlign = true;
    } else if (this.butter > 0.02) {
      // Butter: base flat, the board pivots on the pressed end; the path barely follows.
      m.edge = 0;
      m.yaw = this.steer * C.butterRate * this.H.pivot * this.butter;
      m.pivotMul = 1 - this.butter;
      m.gripMul = 1 - this.butter * 0.85;
      m.effMul = 1 - this.butter * 0.7;
      m.skidMul = 1 - this.butter * 0.8;   // flat base slides, edges don't scrape
      m.noAlign = true;
    } else if (Math.abs(this.press) > 0.05) {
      m.pivotMul = 1 + Math.abs(this.press) * 0.3;
    }
    return m;
  }

  extraDecel() { return this.butter * this.C.butterDrag; }

  stopMu() { return this.stopSide === this.toeSide ? this.C.stopMuToe : this.C.stopMuHeel; }

  pop() {
    const v = super.pop();
    return this._popEnd === 'nose' ? v * this.C.nollie : v;
  }

  takeoffInfo(popped) {
    const butterSpin = this.butter > 0.3 ? -this.yawRate * 0.4 : 0;
    super.takeoffInfo(popped);
    this.pl.spinRate += butterSpin;
    this.takeoff.toeSide = this.toeSide;
    this.takeoff.end = popped ? this._popEnd : null;
    this.butter = 0; this.press = 0;
  }

  grabName() {
    // Rear hand to the toe edge between the feet = Indy; front hand to the heel edge = Melon; nose/tail.
    const pl = this.pl;
    if (pl._ctrl?.up > 0.3) return 'Nose grab';
    if (pl._ctrl?.brake > 0.3) return 'Tail grab';
    return Math.abs(pl.spinRate) > 1 && Math.sign(pl.spinRate) !== (this.takeoff?.toeSide || 1) ? 'Melon' : 'Indy';
  }

  /** Boards land with either end leading; sideways landings slide out before they crash. */
  land(devNose) {
    const C = this.C;
    const dn = devNose / DEG;
    const sw = dn > 90;
    const dev = sw ? 180 - dn : dn;
    let result = 'crash';
    if (dev <= C.landClean) result = 'clean';
    else if (dev <= C.landStumble) result = 'stumble';
    else if (dev <= C.landSlide) result = 'slide';
    return { result, switch: sw, dev };
  }

  trickLabel(t, spins) {
    const parts = [];
    if (t.switch) parts.push('Switch');
    if (t.end === 'nose' && spins < 1) parts.push('Nollie');
    else if (t.end === 'nose') parts.push('Nollie');
    if (spins >= 1) {
      // Frontside: the toe side (chest) swings toward the direction of travel first.
      const fs = Math.sign(t.spin) === t.toeSide;
      parts.push(`${fs ? 'FS' : 'BS'} ${spins * 180}`);
    } else if (t.end === 'tail' && !t.grab) parts.push('Ollie');
    if (t.grab && t.grabT > 0.25) parts.push(t.grab);
    return parts.join(' ');
  }
}
