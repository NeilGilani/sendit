// PlayerPhysics — arcade snowboard controller on the real mountain (fixed 60 Hz step, interpolated
// for rendering). Slope gravity, snappy carving that keeps momentum, squat-charged jumps, air spins,
// aerodynamic auto-tuck, landing evaluation (clean / stumble & recover / crash), near-miss and
// hard-brake events for the FX and camera, plus lift rides. Every tunable lives in config.js.
import * as THREE from 'three';
import { PHYSICS as P, FX } from './config.js';
import { game, Mode, setMode, emit, addScore } from './state.js';
import { angleDiff, lerpAngle, clamp } from './world.js';

export const State = { FROZEN: 0, GROUNDED: 1, AIR: 2, CRASH: 3, LIFT: 4 };
const UP = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _v = new THREE.Vector3();

export class Player {
  constructor(terrain, scatter, lifts, input) {
    Object.assign(this, { terrain, scatter, lifts, input });
    this.state = State.FROZEN;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;                 // board nose direction (yaw, 0 = facing -Z)
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.speed = 0;
    this.turnInput = 0;               // smoothed −1..1
    this.turnVelocity = 0;            // rad/s actually turning (drives edge roll)
    this.brake = 0;
    this.tuck = 0;                    // 0..1 (manual or aerodynamic auto-tuck)
    this.squat = 0;                   // 0..1 pre-jump compression
    this.carve = 0;
    this.skid = 0;
    this.airTime = 0;
    this.spinRate = 0;
    this.crashT = 0;
    this.liftT = 0;
    this.stumbleT = 0;                // > 0 while stumbling
    this.landingVy = 0;               // vertical landing speed for squash & stretch
    this.landingEvent = 0;            // increments on each landing (rig listens)
    this.surface = new THREE.Vector4(1, 0, 0, 0);
    this.orient = new THREE.Quaternion();
    this.prevPos = new THREE.Vector3(); this.prevOrient = new THREE.Quaternion();
    this.renderPos = new THREE.Vector3(); this.renderOrient = new THREE.Quaternion();
    this.fade = async () => {};
    this._noInputT = 0; this._charging = false; this._spinTotal = 0; this._alignTimer = 0;
    this._safe = []; this._safeTimer = 0; this._busy = false; this._hintCool = 0; this._crashStage = 0;
    this._lift = null; this._liftD = 0; this._dist = 0; this._nearCool = 0; this._lastNear = null;
    this._prevBrakeIn = 0;
  }

  get speedRatio() { return clamp(this.speed / P.maxVelocity, 0, 1); }
  get handling() { return this.stumbleT > 0 ? P.stumbleHandling : 1; }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.heading), 0, -Math.cos(this.heading)); }
  controllable() { return game.mode === Mode.RIDING && !this._busy; }

  place(pos, yaw) {
    const T = this.terrain;
    this.position.set(pos.x, T.getHeight(pos.x, pos.z), pos.z);
    this.heading = yaw;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    T.getNormal(pos.x, pos.z, P.normalRadius, this.groundNormal);
    groundQuat(this.groundNormal, yaw, this.orient);
    this.state = State.GROUNDED;
    this.airTime = 0; this.squat = 0; this._charging = false; this.stumbleT = 0;
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
    if (this.state === State.GROUNDED || this.state === State.AIR) { this.collide(); this.keepInside(); this.nearMiss(dt); }
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    this._hintCool = Math.max(0, this._hintCool - dt);
    this.applyOrient(dt);
  }

  interpolate(alpha) {
    this.renderPos.lerpVectors(this.prevPos, this.position, alpha);
    this.renderOrient.slerpQuaternions(this.prevOrient, this.orient, alpha);
  }

  readInput(dt) {
    const I = this.input;
    let turn = 0, b = 0, k = 0;
    if (this.controllable() && this.state !== State.LIFT) {
      turn = I.strength('right') - I.strength('left');
      b = I.strength('brake');
      k = Math.max(I.strength('tuck'), I.strength('speedUp'));
      if (I.justPressed('reset')) this.resetToTop();
    }
    // Hard brake: a fan of snow + camera FoV snap.
    if (b > 0.6 && this._prevBrakeIn <= 0.6 && this.speed > 10 && this.state === State.GROUNDED) emit('hardBrake', this.speed);
    this._prevBrakeIn = b;
    this.turnInput += (turn - this.turnInput) * (1 - Math.exp(-P.steerResponse * this.handling * dt));
    this.brake += (b - this.brake) * (1 - Math.exp(-6 * dt));
    // Aerodynamic auto-tuck after a while without directional input at speed.
    const anyDir = Math.abs(turn) > 0.1 || b > 0.1;
    this._noInputT = anyDir ? 0 : this._noInputT + dt;
    const auto = this._noInputT > P.autoTuckDelay && this.speedRatio > P.autoTuckSpeedRatio ? 1 : 0;
    const want = Math.max(k, auto) * (1 - b);
    this.tuck += (want - this.tuck) * (1 - Math.exp(-3.5 * dt));
    if (this.controllable() && this.state === State.GROUNDED) {
      if (I.strength('jump') > 0.5) { this._charging = true; this.squat = Math.min(1, this.squat + dt / P.chargeTime); }
      else if (this._charging) { this._charging = false; this.jump(); }
    } else this._charging = false;
    if (!this._charging) this.squat = Math.max(0, this.squat - dt * 6);
  }

  groundStep(dt) {
    const T = this.terrain;
    const n = T.getNormal(this.position.x, this.position.z, P.normalRadius, _n);
    this.groundNormal.copy(n);
    T.getSurface(this.position.x, this.position.z, this.surface);
    const g = new THREE.Vector3(0, -P.gravity, 0);
    const gTan = g.clone().addScaledVector(n, -g.dot(n));
    const v = this.velocity.clone().addScaledVector(n, -this.velocity.dot(n));
    const speed = v.length();
    const velYaw = Math.atan2(-v.x, -v.z);

    const rate = (P.turnRateSlow + (P.turnRateFast - P.turnRateSlow) * this.speedRatio) * this.handling;
    const before = this.heading;
    this.heading -= this.turnInput * rate * dt;
    if (this._alignTimer > 0) {
      this._alignTimer -= dt;
      if (speed > 1) this.heading = lerpAngle(this.heading, velYaw, 1 - Math.exp(-P.landAlignRate * dt));
    } else if (speed > 2 && Math.abs(this.turnInput) < 0.2 && Math.abs(angleDiff(this.heading, velYaw)) < 1.6) {
      this.heading = lerpAngle(this.heading, velYaw, 1 - Math.exp(-P.autoAlign * dt));
    }
    if (speed < 1.5 && Math.abs(this.turnInput) < 0.1 && n.y < 0.995) {
      this.heading = lerpAngle(this.heading, Math.atan2(-n.x, -n.z), 1 - Math.exp(-1.4 * dt));
    }
    this.turnVelocity = angleDiff(before, this.heading) / dt;

    const ff = this.forward(_f);
    const fwd = ff.clone().addScaledVector(n, -ff.dot(n)).normalize();
    const right = _r.crossVectors(fwd, n).normalize();
    let vf = v.dot(fwd), vl = v.dot(right);
    const grip = (P.grip + (P.powderGrip - P.grip) * this.surface.y) * (1 - this.brake * 0.8) * this.handling;
    const nl = vl * Math.exp(-grip * dt);
    vf += (Math.abs(vl) - Math.abs(nl)) * P.carveEfficiency * (1 - this.brake) * (vf >= 0 ? 1 : -1);
    vl = nl;
    v.copy(fwd).multiplyScalar(vf).addScaledVector(right, vl);
    this.skid += (clamp(Math.abs(vl) / Math.max(speed, 2) * 2 + this.brake * 0.8, 0, 1) - this.skid) * (1 - Math.exp(-6 * dt));
    this.carve += (clamp(this.turnInput * clamp(speed / 8, 0, 1), -1, 1) - this.carve) * (1 - Math.exp(-7 * dt));
    v.addScaledVector(gTan, dt);
    if (this.controllable() && this.input.strength('speedUp') > 0.3 && v.length() < P.pushMaxSpeed) v.addScaledVector(fwd, P.pushAccel * dt);
    const S = this.surface;
    const mu = (P.frictionGroomed * S.x + P.frictionPowder * S.y + P.frictionRock * S.z + P.frictionPowder * S.w) / Math.max(1e-3, S.x + S.y + S.z + S.w);
    const sp = v.length();
    let decel = mu * P.gravity * n.y;
    decel += (P.dragUpright + (P.dragTuck - P.dragUpright) * this.tuck) * sp * sp;
    decel += P.softCapDrag * Math.max(0, sp - P.maxVelocity) ** 2;
    decel += this.brake * P.brakeDecel;
    if (sp > 1e-4) v.multiplyScalar(Math.max(0, sp - decel * dt) / sp);
    if (v.length() < 0.35 && (1 - n.y < P.holdStillSlope || this.brake > 0.6) && !(this.controllable() && this.input.strength('speedUp') > 0.3)) v.set(0, 0, 0);

    this.velocity.copy(v);
    this.speed = v.length();
    const np = this.position.clone().addScaledVector(v, dt);
    const gh = T.getHeight(np.x, np.z);
    if (np.y - gh > P.takeoffGap && this.speed > 4) {
      this.position.copy(np);
      this.enterAir();
    } else {
      np.y = gh;
      const n2 = T.getNormal(np.x, np.z, P.normalRadius, _v);
      const into = this.velocity.dot(n2);
      if (into < 0) {
        const mag = this.velocity.length();
        this.velocity.addScaledVector(n2, -into).normalize().multiplyScalar(mag * 0.997);
      }
      this.position.copy(np);
    }
    this.trackProgress(dt);
    this.checkLift();
  }

  jump() {
    if (this.state !== State.GROUNDED) return;
    const depth = this.squat;
    const pop = P.jumpMin + (P.jumpMax - P.jumpMin) * depth;
    this.velocity.addScaledVector(this.groundNormal, pop);
    this.position.addScaledVector(this.groundNormal, 0.06);
    emit('jumped', depth);
    this.squat = 0;
    this.enterAir();
  }

  enterAir() { this.state = State.AIR; this.airTime = 0; this._spinTotal = 0; this.spinRate = 0; this.turnVelocity = 0; }

  airStep(dt) {
    this.velocity.y -= P.gravity * dt;
    this.velocity.multiplyScalar(1 - P.airDrag * this.velocity.length() * dt * 0.1);
    const target = this.controllable() ? -this.turnInput * P.spinRateMax : 0;
    this.spinRate += (target - this.spinRate) * (1 - Math.exp(-P.spinResponse * dt));
    this.heading += this.spinRate * dt;
    this._spinTotal += this.spinRate * dt;
    this.turnVelocity = this.spinRate;
    this.carve *= Math.exp(-3 * dt);
    this.skid *= Math.exp(-4 * dt);
    this.airTime += dt;
    this.speed = this.velocity.length();
    this.position.addScaledVector(this.velocity, dt);
    const gh = this.terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y <= gh) { this.position.y = gh; this.land(); }
  }

  land() {
    const n = this.terrain.getNormal(this.position.x, this.position.z, P.normalRadius, this.groundNormal);
    const vn = this.velocity.dot(n);
    const impact = Math.max(0, -vn);
    this.landingVy = impact;
    this.velocity.addScaledVector(n, -vn);
    const velYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    let diff = Math.abs(angleDiff(this.heading, velYaw));
    const switchStance = diff > Math.PI / 2;
    if (switchStance) diff = Math.PI - diff;        // boards ride both ways
    const dev = THREE.MathUtils.radToDeg(diff);
    const spins = Math.round(Math.abs(this._spinTotal) / Math.PI);  // 180s
    if (impact > P.crashImpact || dev > P.crashAngle) { this.crash('landing'); return; }
    if (switchStance) this.heading = velYaw + (angleDiff(velYaw, this.heading) > 0 ? Math.PI : -Math.PI);
    this.state = State.GROUNDED;
    this._alignTimer = 0.35;
    this.landingEvent++;
    if (dev > P.stumbleAngle) {
      this.stumbleT = P.stumbleTime;
      this.velocity.multiplyScalar(0.85);
      emit('stumble');
    }
    emit('landed', { impact, air: this.airTime, clean: dev <= P.stumbleAngle, perfect: dev < 8 && this.airTime > 0.6 });
    if (this.airTime > 0.7 && dev <= P.stumbleAngle) {
      const deg = spins * 180;
      let label = deg >= 180 ? `${deg}` : `Air ${this.airTime.toFixed(1)}s`;
      if (dev < 8) label = `Perfect ${label}`;
      game.airTotal += this.airTime;
      addScore(label, Math.floor(this.airTime * 80) + spins * 90 + (dev < 8 ? 50 : 0));
    }
    this.airTime = 0;
  }

  crash(kind) {
    this.state = State.CRASH; this.crashT = 0; this._crashStage = 0;
    emit('crashed', kind);
  }

  crashStep(dt) {
    this.crashT += dt;
    this.velocity.multiplyScalar(Math.exp(-2.0 * dt));
    const n = this.terrain.getNormal(this.position.x, this.position.z, 2, _n);
    this.velocity.addScaledVector(n, -this.velocity.dot(n));
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = this.terrain.getHeight(this.position.x, this.position.z);
    this.speed = this.velocity.length();
    if (this._crashStage === 0 && this.crashT > P.tumbleTime) { this._crashStage = 1; this.fadeThen(() => this.respawnSafe()); }
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
    await this.fade(true, 0.45);
    action();
    await new Promise((r) => setTimeout(r, 120));
    this.fade(false, 0.7);
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
    if (into > P.treeCrashSpeed && this.state === State.GROUNDED) {
      this.velocity.addScaledVector(away, into * 0.6);
      this.crash(o[3] || 'tree');
      return;
    }
    if (into > 0) { this.velocity.addScaledVector(away, into * 1.1); emit('bump', into); }
    this.position.x = o[0] + away.x * (o[2] + 0.36);
    this.position.z = o[1] + away.z * (o[2] + 0.36);
  }

  /** Close shaves: passing within FX.nearMissRadius of a tree/rock at speed. */
  nearMiss(dt) {
    this._nearCool = Math.max(0, this._nearCool - dt);
    if (!this.scatter || this.speed < 11) return;
    const near = this.scatter.nearest(this.position, FX.nearMissRadius);
    if (near && near.dist > 0.2) {
      this.nearDist = near.dist;
      if (this._nearCool <= 0 && near.o !== this._lastNear) {
        this._lastNear = near.o;
        this._nearCool = 0.35;
        emit('nearMiss', { dist: near.dist, kind: near.o[3] });
        addScore('Close shave', 15);
      }
    } else this.nearDist = Infinity;
  }

  keepInside() {
    const lim = this.terrain.half - 40;
    const p = this.position;
    if (Math.abs(p.x) > lim || Math.abs(p.z) > lim) {
      if (Math.abs(p.x) > lim && p.x * this.velocity.x > 0) this.velocity.x = 0;
      if (Math.abs(p.z) > lim && p.z * this.velocity.z > 0) this.velocity.z = 0;
      p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
      if (this._hintCool <= 0) { emit('hint', 'Edge of the mountain — head back into the gully'); this._hintCool = 6; }
    }
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
    if (this.speed < P.liftBoardSpeed) this.board(lift);
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
    let rs = Math.max(this._lift.speed, len / P.liftRideSeconds);
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
    this.orient.slerp(target, 1 - Math.exp(-12 * dt));
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
