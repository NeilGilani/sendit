// SkiPhysics — two independent edges, quick edge changes, high grip (parallel carved turns from the
// sidecut), rotary steering for skidded turns, snowplough below plowSpeed, hockey stop above it,
// a proper aero tuck and pole pushes on the flat. Tunables: PHYSICS.ski in config.js.
import { PHYSICS as P } from '../config.js';
import { EdgePhysics, flipCount } from './edge.js';
import { clamp, smoothstep, angleDiff, DEG } from './math.js';

export class SkiPhysics extends EdgePhysics {
  constructor(player, spec, handling) {
    super(player, spec, handling, P.ski);
    this.plow = 0;
  }

  get type() { return 'ski'; }

  /** W: double-pole / skate below push speed, tuck above it (not while loading a nose press / nollie). */
  tuckFromUp(ctrl) { return this.charging ? 0 : ctrl.up * smoothstep(this.C.pushMaxSpeed - 1.5, this.C.pushMaxSpeed + 0.5, this.pl.speed); }

  /** Directional skis butter stiffly; twin tips (park) are made for it. */
  butterScale() { return this.H.twin ? 1 : this.C.butterNonTwin; }

  onControl(dt, ctrl, grounded) {
    const pl = this.pl, C = this.C;
    this.pressAndButter(dt, ctrl, grounded);
    // Snowplough (pizza) when slow, hockey stop when fast. Hysteresis keeps a stop going until slow.
    const b = grounded && !this.charging ? ctrl.brake : 0;   // S while charging preloads a backflip instead
    const wantStop = b > 0.3 && (pl.speed > C.plowSpeed || (this.stop > 0.3 && pl.speed > 1.2));
    if (wantStop && this.stop < 0.05) {
      // Stop toward the steer side, else toward the side the skis already point, else uphill.
      this.stopSide = Math.sign(ctrl.steer) || Math.sign(pl.skidAngle) || Math.sign(this.edge) || this.uphillSide();
    }
    this.stop += ((wantStop ? 1 : 0) - this.stop) * (1 - Math.exp(-(wantStop ? 9 : 5) * dt));
    const wantPlow = b > 0.05 && !wantStop ? b : 0;
    this.plow += (wantPlow - this.plow) * (1 - Math.exp(-7 * dt));
    pl.plow = this.plow;
    pl.stop = this.stop; pl.stopSide = this.stopSide;
  }

  uphillSide() {
    const n = this.pl.groundNormal, h = this.pl.heading;
    // Right-of-nose vector (cos h, 0, −sin h); the uphill side is opposite the slope's downhill pull.
    const rx = Math.cos(h), rz = -Math.sin(h);
    return (n.x * rx + n.z * rz) > 0 ? -1 : 1;
  }

  modes(dt, ctx) {
    const C = this.C;
    const m = {};
    if (this.stop > 0.02 && ctx.speed > 0.8) {
      // Hockey stop: pivot the skis ~80° across the path, set the edges, scrape.
      const velYaw = Math.atan2(-ctx.v.x, -ctx.v.z) + (this.travel < 0 ? Math.PI : 0);
      const target = velYaw - this.stopSide * C.stopAngle * DEG;
      const err = angleDiff(this.pl.heading, target);
      m.yaw = clamp(-err * 10, -C.stopTurnRate, C.stopTurnRate) * this.stop;
      m.edge = this.stopSide * C.stopEdge * DEG * this.stop;
      m.gripMul = 1 - this.stop * 0.94;
      m.effMul = 1 - this.stop;
      m.noAlign = true;
    }
    if (this.plow > 0.05) {
      m.pivotMul = 1 - (1 - C.plowTurn) * this.plow;
      if (m.edge === undefined) m.edge = this.edge * (1 - this.plow * 0.6);
    } else if (!(this.stop > 0.02)) this.butterModes(m);
    return m;
  }

  extraDecel(ctx) {
    // Wedge: both inside edges push snow; strongest when slow.
    return this.plow * this.C.plowDecel * (0.6 + 0.4 * smoothstep(0, 3, ctx.speed)) + this.butter * this.C.butterDrag;
  }

  stopMu() { return this.C.stopMu; }

  tailLandings() { return this.H.twin; }

  grabName() { return this.pl.turnInput > 0.2 ? 'Japan' : this.pl.turnInput < -0.2 ? 'Mute' : 'Safety'; }

  /** Skis: only the tips may lead; backwards landings work on twin tips (switch), else stumble/crash. */
  land(devNose, tol = 1) {
    const C = this.C;
    const dn = devNose / DEG, dt = 180 - dn;
    if (dt <= C.switchLand) {
      if (this.H.twin) return { result: dt <= C.landClean * tol ? 'clean' : 'stumble', switch: true, dev: dt };
      return { result: dt <= C.landClean * tol ? 'stumble' : 'crash', switch: true, dev: dt };
    }
    if (dn <= C.landClean * tol) return { result: 'clean', switch: false, dev: dn };
    if (dn <= C.landStumble * tol) return { result: 'stumble', switch: false, dev: dn };
    if (dn <= C.landCrash * tol) return { result: 'slide', switch: false, dev: dn };
    return { result: 'crash', switch: false, dev: dn };
  }

  trickLabel(t, spins, flip) {
    const parts = [];
    if (t.switch) parts.push('Switch');
    if (t.end === 'nose' && (spins >= 1 || flip?.flips >= 1)) parts.push('Nollie');
    const dir = t.spin > 0 ? 'Left' : 'Right';
    if (flip?.flips >= 1) {
      // Off-axis: a backflip with a spin is a cork, a frontflip with a spin a misty.
      const n = flipCount(flip.flips);
      if (spins >= 2) parts.push(`${dir} ${n}${flip.back ? 'Cork' : 'Misty'} ${spins * 180}`);
      else parts.push(`${n}${flip.back ? 'Backflip' : 'Frontflip'}`);
    } else if (spins >= 1) parts.push(`${dir} ${spins * 180}`);
    if (t.grab && t.grabT > 0.25) parts.push(t.grab);
    return parts.join(' ');
  }
}
