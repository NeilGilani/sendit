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
import { EdgePhysics, flipCount } from './edge.js';
import { clamp, smoothstep, angleDiff, DEG } from './math.js';

export class SnowboardPhysics extends EdgePhysics {
  constructor(player, spec, handling) {
    super(player, spec, handling, P.snowboard);
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

  /** W: one-foot skate when slow, a low crouch at speed (never while loading a nollie). */
  tuckFromUp(ctrl) { return this.charging ? 0 : ctrl.up * 0.7 * smoothstep(this.C.pushMaxSpeed - 1, this.C.pushMaxSpeed + 1, this.pl.speed); }

  onControl(dt, ctrl, grounded) {
    const pl = this.pl;
    this.pressAndButter(dt, ctrl, grounded);
    // Slide stop: heel side by default; toe side when steering toward the toes.
    const b = grounded && !this.charging ? ctrl.brake : 0;   // S while charging preloads a backflip instead
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
    } else this.butterModes(m);
    return m;
  }

  extraDecel() { return this.butter * this.C.butterDrag; }

  stopMu() { return this.stopSide === this.toeSide ? this.C.stopMuToe : this.C.stopMuHeel; }

  takeoffInfo(popped) {
    super.takeoffInfo(popped);
    this.takeoff.toeSide = this.toeSide;
  }

  grabName() {
    // Rear hand to the toe edge between the feet = Indy; front hand to the heel edge = Melon; nose/tail.
    const pl = this.pl;
    if (pl._ctrl?.up > 0.3) return 'Nose grab';
    if (pl._ctrl?.brake > 0.3) return 'Tail grab';
    return Math.abs(pl.spinRate) > 1 && Math.sign(pl.spinRate) !== (this.takeoff?.toeSide || 1) ? 'Melon' : 'Indy';
  }

  /** Boards land with either end leading; sideways landings slide out before they crash. */
  land(devNose, tol = 1) {
    const C = this.C;
    const dn = devNose / DEG;
    const sw = dn > 90;
    const dev = sw ? 180 - dn : dn;
    let result = 'crash';
    if (dev <= C.landClean * tol) result = 'clean';
    else if (dev <= C.landStumble * tol) result = 'stumble';
    else if (dev <= C.landSlide * tol) result = 'slide';
    return { result, switch: sw, dev };
  }

  trickLabel(t, spins, flip) {
    const parts = [];
    // Frontside: the toe side (chest) swings toward the direction of travel first.
    const fs = Math.sign(t.spin) === t.toeSide;
    // Switch frontside spins are "Cab" (half-cab for a 180), named after Steve Caballero.
    const cab = t.switch && fs && spins >= 1 && !(flip?.flips >= 1 && spins < 2);
    if (t.switch && !cab) parts.push('Switch');
    if (t.end === 'nose') parts.push('Nollie');
    const side = cab ? (spins === 1 ? 'Half-Cab' : 'Cab') : fs ? 'FS' : 'BS';
    if (flip?.flips >= 1) {
      // Wildcat = backflip over the tail, Tamedog = frontflip off the nose (toe-heel axis). With a spin:
      // a single backflip is a rodeo, more are corks; a frontflip with a spin is a misty.
      const n = flipCount(flip.flips);
      if (spins >= 2) parts.push(`${side} ${flip.back ? (flip.flips === 1 ? 'Rodeo' : `${n}Cork`) : `${n}Misty`} ${spins * 180}`);
      else parts.push(`${n}${flip.back ? 'Wildcat' : 'Tamedog'}`);
    } else if (spins >= 1) parts.push(side === 'Half-Cab' ? 'Half-Cab' : `${side} ${spins * 180}`);
    else if (t.end === 'tail' && !t.grab) parts.push('Ollie');
    if (t.grab && t.grabT > 0.25) parts.push(t.grab);
    return parts.join(' ');
  }
}
