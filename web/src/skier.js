// Custom ski controller (fixed 60 Hz step, interpolated for rendering): slope gravity, carving that
// keeps momentum, forgiving grip, tuck, skid braking, charged jumps, slow air spins, soft landings,
// gentle crashes, and lift rides. Mirrors the Godot version's SkiTuning.
import * as THREE from 'three';
import { game, Mode, setMode, emit, addScore } from './state.js';
import { angleDiff, lerpAngle, clamp } from './world.js';

export const tuning = {
  steerResponse: 5.0, brakeResponse: 4.0, tuckResponse: 3.0,
  turnRateSlow: 2.2, turnRateFast: 1.15, grip: 4.5, powderGrip: 3.2, carveEfficiency: 0.9,
  autoAlign: 0.9, downhillSettle: 1.2,
  gravity: 9.81, frictionGroomed: 0.035, frictionPowder: 0.075, frictionRock: 0.14, frictionForest: 0.06,
  dragUpright: 0.0036, dragTuck: 0.0016, softCapSpeed: 20, softCapDrag: 0.045,
  pushAccel: 2.6, pushMaxSpeed: 7, brakeDecel: 5.5, brakeSkidAngle: 1.15, holdStillSlope: 0.006,
  takeoffGap: 0.35, chargeTime: 0.9, jumpMin: 2.4, jumpMax: 6.2, airDrag: 0.008,
  spinRateMax: 3.1, spinResponse: 2.5, landAlignRate: 7.0,
  crashImpact: 15, crashAngle: 115, crashAngleMinSpeed: 9, treeCrashSpeed: 10, tumbleTime: 1.3, fadeTime: 0.7,
  orientResponse: 10, normalRadius: 1.6, liftRideSeconds: 70, liftBoardSpeed: 7,
};

export const State = { FROZEN: 0, GROUNDED: 1, AIR: 2, CRASH: 3, LIFT: 4 };
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _g = new THREE.Vector3();

export class Skier {
  constructor(terrain, scatter, lifts, input) {
    Object.assign(this, { terrain, scatter, lifts, input });
    this.state = State.FROZEN;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.speed = 0;
    this.steer = 0; this.brake = 0; this.tuck = 0; this.charge = 0;
    this.carve = 0; this.skid = 0; this.airTime = 0; this.spinRate = 0; this.crashT = 0;
    this.liftT = 0; this.landingSquash = 0;
    this.surface = new THREE.Vector4(1, 0, 0, 0);
    this.orient = new THREE.Quaternion();
    this.prevPos = new THREE.Vector3(); this.prevOrient = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3(); this.renderOrient = new THREE.Quaternion();
    this.fade = async () => {};
    this._alignTimer = 0; this._charging = false; this._spinTotal = 0;
    this._safe = []; this._safeTimer = 0;
    this._turnDir = 0; this._turnAngle = 0; this._turnSkid = 0; this._turnTime = 0; this._lastHeading = 0;
    this._dist = 0; this._busy = false; this._hintCool = 0; this._crashStage = 0;
    this._lift = null; this._liftD = 0;
  }

  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  controllable() { return game.mode === Mode.RIDING && !this._busy; }

  place(pos, yaw) {
    const T = this.terrain;
    this.position.set(pos.x, T.getHeight(pos.x, pos.z), pos.z);
    this.heading = yaw;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    T.getNormal(pos.x, pos.z, tuning.normalRadius, this.groundNormal);
    groundQuat(this.groundNormal, yaw, this.orient);
    this.state = State.GROUNDED;
    this.airTime = 0; this.charge = 0; this._charging = false; this._alignTimer = 0;
    this._safe = [[this.position.clone(), yaw]];
    this.snapRender();
  }

  snapRender() {
    this.prevPos.copy(this.position); this.renderPos.copy(this.position);
    this.prevOrient.copy(this.orient); this.renderOrient.copy(this.orient);
  }

  startRiding() {
    const s = this.terrain.getSpawn();
    this.place(s.position, s.heading);
    emit('respawned');
  }

  /** Fixed step. */
  step(dt) {
    this.prevPos.copy(this.position);
    this.prevOrient.copy(this.orient);
    if (this.state === State.FROZEN) return;
    this.readInput(dt);
    switch (this.state) {
      case State.GROUNDED: this.groundStep(dt); break;
      case State.AIR: this.airStep(dt); break;
      case State.CRASH: this.crashStep(dt); break;
      case State.LIFT: this.liftStep(dt); break;
    }
    if (this.state === State.GROUNDED || this.state === State.AIR) { this.collide(); this.keepInside(); }
    this.landingSquash = Math.max(0, this.landingSquash - dt * 2.5);
    this._hintCool = Math.max(0, this._hintCool - dt);
    this.applyOrient(dt);
  }

  interpolate(alpha) {
    this.renderPos.lerpVectors(this.prevPos, this.position, alpha);
    this.renderOrient.slerpQuaternions(this.prevOrient, this.orient, alpha);
  }

  readInput(dt) {
    const I = this.input, t = tuning;
    let s = 0, b = 0, k = 0;
    if (this.controllable() && this.state !== State.LIFT) {
      s = I.strength('right') - I.strength('left');
      b = I.strength('brake');
      k = Math.max(I.strength('tuck'), I.strength('speedUp'));
      if (I.justPressed('reset')) this.resetToTop();
    }
    this.steer += (s - this.steer) * (1 - Math.exp(-t.steerResponse * dt));
    this.brake += (b - this.brake) * (1 - Math.exp(-t.brakeResponse * dt));
    this.tuck += (k * (1 - b) - this.tuck) * (1 - Math.exp(-t.tuckResponse * dt));
    if (this.controllable() && this.state === State.GROUNDED) {
      if (I.strength('jump') > 0.5) { this._charging = true; this.charge = Math.min(1, this.charge + dt / t.chargeTime); }
      else if (this._charging) { this._charging = false; this.jump(); }
    } else this._charging = false;
    if (!this._charging && this.state !== State.GROUNDED) this.charge = Math.max(0, this.charge - dt * 3);
  }

  groundStep(dt) {
    const T = this.terrain, t = tuning;
    const n = T.getNormal(this.position.x, this.position.z, t.normalRadius, _n);
    this.groundNormal.copy(n);
    T.getSurface(this.position.x, this.position.z, this.surface);
    const g = _g.set(0, -t.gravity, 0);
    const gTan = g.clone().addScaledVector(n, -g.dot(n));
    const v = this.velocity.clone().addScaledVector(n, -this.velocity.dot(n));
    let speed = v.length();
    const velYaw = Math.atan2(-v.x, -v.z);

    const rate = t.turnRateSlow + (t.turnRateFast - t.turnRateSlow) * clamp(speed / 22, 0, 1);
    this.heading -= this.steer * rate * dt;
    if (this._alignTimer > 0) {
      this._alignTimer -= dt;
      if (speed > 1) this.heading = lerpAngle(this.heading, velYaw, 1 - Math.exp(-t.landAlignRate * dt));
    } else if (speed > 2 && Math.abs(this.steer) < 0.2 && Math.abs(angleDiff(this.heading, velYaw)) < 1.6) {
      this.heading = lerpAngle(this.heading, velYaw, (1 - Math.exp(-t.autoAlign * dt)) * (1 - Math.abs(this.steer) * 5));
    }
    if (speed < 1.5 && Math.abs(this.steer) < 0.1 && n.y < 0.995) {
      this.heading = lerpAngle(this.heading, Math.atan2(-n.x, -n.z), 1 - Math.exp(-t.downhillSettle * dt));
    }
    const ff = this.forward(_f);
    const fwd = ff.clone().addScaledVector(n, -ff.dot(n)).normalize();
    const right = _r.crossVectors(fwd, n).normalize();
    let vf = v.dot(fwd), vl = v.dot(right);
    const grip = (t.grip + (t.powderGrip - t.grip) * this.surface.y) * (1 - this.brake * 0.75);
    const nl = vl * Math.exp(-grip * dt);
    const redirected = (Math.abs(vl) - Math.abs(nl)) * t.carveEfficiency * (1 - this.brake);
    vf += redirected * (vf >= 0 ? 1 : -1);
    vl = nl;
    v.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl);
    this.skid += (clamp(Math.abs(vl) / Math.max(speed, 2) * 2 + this.brake * 0.8, 0, 1) - this.skid) * (1 - Math.exp(-6 * dt));
    this.carve += (clamp(this.steer * clamp(speed / 8, 0, 1), -1, 1) - this.carve) * (1 - Math.exp(-5 * dt));
    v.addScaledVector(gTan, dt);
    if (this.controllable() && this.input.strength('speedUp') > 0.3 && v.length() < t.pushMaxSpeed) v.addScaledVector(fwd, t.pushAccel * dt);
    const S = this.surface;
    let mu = t.frictionGroomed * S.x + t.frictionPowder * S.y + t.frictionRock * S.z + t.frictionForest * S.w;
    mu /= Math.max(0.001, S.x + S.y + S.z + S.w);
    const sp = v.length();
    let decel = mu * t.gravity * n.y;
    decel += (t.dragUpright + (t.dragTuck - t.dragUpright) * this.tuck) * sp * sp;
    decel += t.softCapDrag * Math.max(0, sp - t.softCapSpeed) ** 2;
    decel += this.brake * t.brakeDecel;
    if (sp > 1e-4) v.multiplyScalar(Math.max(0, sp - decel * dt) / sp);
    const slope = 1 - n.y;
    if (v.length() < 0.35 && (slope < t.holdStillSlope || this.brake > 0.6) && !(this.controllable() && this.input.strength('speedUp') > 0.3)) v.set(0, 0, 0);

    this.velocity.copy(v);
    this.speed = v.length();
    const np = this.position.clone().addScaledVector(v, dt);
    const gh = T.getHeight(np.x, np.z);
    if (np.y - gh > t.takeoffGap && this.speed > 4) {
      this.position.copy(np);
      this.enterAir();
    } else {
      np.y = gh;
      const n2 = T.getNormal(np.x, np.z, t.normalRadius, _v);
      const into = this.velocity.dot(n2);
      if (into < 0) {
        const mag = this.velocity.length();
        this.velocity.addScaledVector(n2, -into).normalize().multiplyScalar(mag * 0.995);
      }
      this.position.copy(np);
    }
    this.trackTurns(dt);
    this.trackProgress(dt);
    this.checkLift();
  }

  jump() {
    if (this.state !== State.GROUNDED) return;
    const pop = tuning.jumpMin + (tuning.jumpMax - tuning.jumpMin) * this.charge;
    this.velocity.addScaledVector(this.groundNormal, pop);
    this.position.addScaledVector(this.groundNormal, 0.06);
    emit('jumped', this.charge);
    this.charge = 0;
    this.enterAir();
  }

  enterAir() { this.state = State.AIR; this.airTime = 0; this._spinTotal = 0; this.spinRate = 0; }

  airStep(dt) {
    const t = tuning;
    this.velocity.y -= t.gravity * dt;
    this.velocity.multiplyScalar(1 - t.airDrag * this.velocity.length() * dt * 0.1);
    const target = this.controllable() ? -this.steer * t.spinRateMax : 0;
    this.spinRate += (target - this.spinRate) * (1 - Math.exp(-t.spinResponse * dt));
    this.heading += this.spinRate * dt;
    this._spinTotal += this.spinRate * dt;
    this.carve *= Math.exp(-3 * dt);
    this.skid *= Math.exp(-4 * dt);
    this.airTime += dt;
    this.speed = this.velocity.length();
    this.position.addScaledVector(this.velocity, dt);
    const gh = this.terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y <= gh) { this.position.y = gh; this.land(); }
  }

  land() {
    const t = tuning;
    const n = this.terrain.getNormal(this.position.x, this.position.z, t.normalRadius, this.groundNormal);
    const vn = this.velocity.dot(n);
    const impact = Math.max(0, -vn);
    this.velocity.addScaledVector(n, -vn);
    const velYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    const diff = Math.abs(angleDiff(this.heading, velYaw));
    const sp = this.velocity.length();
    const spins = Math.round(Math.abs(this._spinTotal) / (Math.PI * 2));
    if (impact > t.crashImpact || (diff > THREE.MathUtils.degToRad(t.crashAngle) && diff < Math.PI - 0.35 && sp > t.crashAngleMinSpeed)) {
      this.crash();
      return;
    }
    if (diff > Math.PI - 0.35) this.heading = velYaw; // landed backwards: quietly pivot around
    this.velocity.multiplyScalar(1 - 0.18 * clamp(diff / Math.PI, 0, 1));
    this.state = State.GROUNDED;
    this._alignTimer = 0.45;
    this.landingSquash = clamp(impact / 8, 0.25, 1);
    emit('landed', { impact, air: this.airTime });
    if (this.airTime > 0.8) {
      let label = `Air ${this.airTime.toFixed(1)}s`;
      if (spins > 0) label = (spins > 1 ? `${spins * 360}° spin` : '360') + ` · ${this.airTime.toFixed(1)}s air`;
      game.airTotal += this.airTime;
      addScore(label, Math.floor(this.airTime * 60) + spins * 120);
    }
    this.airTime = 0;
  }

  crash() { this.state = State.CRASH; this.crashT = 0; this._crashStage = 0; emit('crashed'); }

  crashStep(dt) {
    this.crashT += dt;
    this.velocity.multiplyScalar(Math.exp(-2.2 * dt));
    const n = this.terrain.getNormal(this.position.x, this.position.z, 2, _n);
    this.velocity.addScaledVector(n, -this.velocity.dot(n));
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = this.terrain.getHeight(this.position.x, this.position.z);
    this.speed = this.velocity.length();
    this.carve *= Math.exp(-3 * dt);
    if (this._crashStage === 0 && this.crashT > tuning.tumbleTime) {
      this._crashStage = 1;
      this.fadeThen(() => this.respawnSafe());
    }
  }

  respawnSafe() {
    const pts = this._safe;
    let p = pts.length ? pts[Math.max(0, pts.length - 3)] : null;
    if (!p) { const s = this.terrain.getSpawn(); p = [s.position, s.heading]; }
    const keep = pts.slice(0, Math.max(1, pts.length - 2));
    this.place(p[0], p[1]);
    this._safe = keep;
    emit('respawned');
  }

  resetToTop() { if (!this._busy && this.state !== State.FROZEN) this.fadeThen(() => this.startRiding()); }

  async fadeThen(action) {
    this._busy = true;
    await this.fade(true, tuning.fadeTime);
    action();
    await new Promise((r) => setTimeout(r, 150));
    this.fade(false, tuning.fadeTime * 1.4);
    this._busy = false;
  }

  collide() {
    if (!this.scatter) return;
    const o = this.scatter.findObstacle(this.position, 0.35);
    if (!o) return;
    const away = new THREE.Vector3(this.position.x - o[0], 0, this.position.z - o[1]);
    if (away.lengthSq() < 1e-4) away.copy(this.forward()).negate();
    away.normalize();
    const into = -this.velocity.dot(away);
    if (into > tuning.treeCrashSpeed && this.state === State.GROUNDED) {
      this.velocity.addScaledVector(away, into * 0.6);
      this.crash();
      return;
    }
    if (into > 0) this.velocity.addScaledVector(away, into * 1.1);
    this.position.x = o[0] + away.x * (o[2] + 0.36);
    this.position.z = o[1] + away.z * (o[2] + 0.36);
  }

  keepInside() {
    const lim = this.terrain.half - 40;
    const p = this.position;
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) {
      if (Math.abs(p.x) > lim && p.x * this.velocity.x > 0) this.velocity.x = 0;
      if (Math.abs(p.z) > lim && p.z * this.velocity.z > 0) this.velocity.z = 0;
      p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
      if (this._hintCool <= 0) { emit('hint', 'The valley ends here — turn back toward the lifts'); this._hintCool = 6; }
    }
  }

  trackTurns(dt) {
    const dh = angleDiff(this._lastHeading, this.heading);
    this._lastHeading = this.heading;
    if (this.speed < 6) { this._turnDir = 0; this._turnAngle = 0; return; }
    const dir = dh > 0.0008 ? 1 : dh < -0.0008 ? -1 : 0;
    if (dir !== 0 && dir !== this._turnDir) {
      if (this._turnDir !== 0 && this._turnAngle > 0.45 && this._turnTime > 0.6) {
        const quality = clamp(1 - (this._turnSkid / Math.max(this._turnTime, 0.01)) * 2.2, 0, 1);
        if (quality > 0.45) {
          game.smoothTurns++;
          addScore(quality < 0.8 ? 'Smooth turn' : 'Silky turn', Math.floor(10 + 30 * quality));
        }
      }
      this._turnDir = dir; this._turnAngle = 0; this._turnSkid = 0; this._turnTime = 0;
    }
    this._turnAngle += Math.abs(dh);
    this._turnSkid += this.skid * dt;
    this._turnTime += dt;
  }

  trackProgress(dt) {
    if (!this.controllable()) return;
    const d = this.speed * dt;
    game.distance += d;
    this._dist += d;
    if (this._dist >= 250) { this._dist -= 250; addScore(`${Math.floor(game.distance)} m`, 25); }
    this._safeTimer += dt;
    if (this._safeTimer > 1.5 && this.speed > 1.5 && this.skid < 0.5) {
      this._safeTimer = 0;
      this._safe.push([this.position.clone(), Math.atan2(-this.velocity.x, -this.velocity.z)]);
      if (this._safe.length > 12) this._safe.shift();
    }
  }

  checkLift() {
    if (!this.lifts || !this.controllable()) return;
    const lift = this.lifts.findBoardable(this.position);
    if (!lift) {
      const near = this.lifts.nearestBase(this.position);
      if (near && this.position.distanceTo(near.bottom) < 90 && this._hintCool <= 0) {
        emit('hint', `Glide slowly into the ${near.name} to ride up`);
        this._hintCool = 12;
      }
      return;
    }
    if (this.speed < tuning.liftBoardSpeed) this.board(lift);
  }

  board(lift) {
    this._lift = lift; this._liftD = 0; this.liftT = 0;
    emit('liftBoarded', lift.name);
    this.fadeThen(() => {
      this.state = State.LIFT;
      setMode(Mode.LIFT);
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      const s = this.lifts.seat(lift, 0);
      this.position.copy(s.position);
      this.heading = s.yaw;
      this.orient.setFromAxisAngle(UP, s.yaw);
      this.snapRender();
    });
  }

  liftStep(dt) {
    if (this._busy) return;
    const len = this.lifts.rideLength(this._lift);
    let rs = Math.max(this._lift.speed, len / tuning.liftRideSeconds);
    if (this.input.strength('speedUp') > 0.3) rs *= 3;
    this._liftD += rs * dt;
    this.liftT = this._liftD / len;
    const s = this.lifts.seat(this._lift, this._liftD);
    this.position.copy(s.position);
    this.heading = lerpAngle(this.heading, s.yaw, 1 - Math.exp(-4 * dt));
    this.speed = rs;
    if (this._liftD >= len - 1) { this._busy = true; this.fadeThen(() => this.dismount()); }
  }

  dismount() {
    const top = this._lift.top, bottom = this._lift.bottom;
    const away = new THREE.Vector3(top.x - bottom.x, 0, top.z - bottom.z).normalize();
    const pos = top.clone().addScaledVector(away, 14);
    const n = this.terrain.getNormal(pos.x, pos.z, 6, _n);
    const yaw = Math.hypot(n.x, n.z) > 0.02 ? Math.atan2(-n.x, -n.z) : Math.atan2(-away.x, -away.z);
    setMode(Mode.RIDING);
    this.place(pos, yaw);
    emit('liftArrived');
  }

  applyOrient(dt) {
    if (this.state === State.LIFT) { this.orient.setFromAxisAngle(UP, this.heading); return; }
    const n = this.state === State.AIR ? _v.set(0, 1, 0).lerp(this.groundNormal, 0.3).normalize() : this.groundNormal;
    const target = groundQuat(n, this.heading, new THREE.Quaternion());
    this.orient.slerp(target, 1 - Math.exp(-tuning.orientResponse * dt));
  }
}

/** Quaternion whose -Z faces along `yaw` projected on the slope with up = n. */
export function groundQuat(n, yaw, out) {
  const f = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  f.addScaledVector(n, -f.dot(n)).normalize();
  const r = new THREE.Vector3().crossVectors(f, n).normalize();
  const m = new THREE.Matrix4().makeBasis(r, n, f.clone().negate());
  return out.setFromRotationMatrix(m);
}
