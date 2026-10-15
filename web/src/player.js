// PlayerPhysics — rider controller on the mountain (fixed 60 Hz step, interpolated for rendering).
// Owns the state machine (grounded / air / crash / lift), terrain following, take-off detection,
// collisions, near-misses, scoring, respawns and lifts. Everything that depends on the equipment —
// edge carving, skids, brakes, pop, spins, grabs and landing evaluation — is delegated to a
// SkiPhysics or SnowboardPhysics instance (physics/), chosen with setEquipment(type, variant).
// Tunables: PHYSICS (+ PHYSICS.ski / PHYSICS.snowboard) in config.js.
import * as THREE from 'three';
import { PHYSICS as P, FX } from './config.js';
import { game, Mode, setMode, emit, addScore } from './state.js';
import { angleDiff, lerpAngle, clamp } from './physics/math.js';
import { SkiPhysics } from './physics/ski.js';
import { SnowboardPhysics } from './physics/snowboard.js';
import { getEquipmentSpec, deriveHandling, normalizeType } from './equipment/registry.js';

export const State = { FROZEN: 0, GROUNDED: 1, AIR: 2, CRASH: 3, LIFT: 4 };
const UP = new THREE.Vector3(0, 1, 0);
const _X = new THREE.Vector3(1, 0, 0), _qf = new THREE.Quaternion();
const _n = new THREE.Vector3(), _v = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();

export class Player {
  constructor(terrain, scatter, lifts, input) {
    Object.assign(this, { terrain, scatter, lifts, input });
    this.state = State.FROZEN;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;                 // equipment NOSE direction (yaw, 0 = facing −Z); switch = nose trailing
    this.groundNormal = new THREE.Vector3(0, 1, 0);
    this.speed = 0;
    this.turnInput = 0;               // smoothed −1..1 (+ = right)
    this.turnVelocity = 0;            // rad/s actually turning (+ = left, legacy sign)
    this.brake = 0;
    this.tuck = 0;                    // 0..1 (manual or aerodynamic auto-tuck)
    this.squat = 0;                   // 0..1 pre-jump compression
    this.carve = 0;
    this.skid = 0;
    this.sink = 0;                    // metres the skis / board sit below the powder surface (visual)
    this.powder = 0;                  // 0..1 how deep / soft the snow underfoot is
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
    this._spinTotal = 0; this._alignTimer = 0;
    this._safe = []; this._safeTimer = 0; this._busy = false; this._hintCool = 0; this._crashStage = 0;
    this._lift = null; this._liftD = 0; this._dist = 0; this._nearCool = 0; this._lastNear = null;
    this._prevBrakeIn = 0;
    // Equipment-driven state (read by the rider, FX and the graphics' contact points).
    this.stance = 'regular';          // 'regular' (left foot forward) | 'goofy' — snowboard only
    this.travelSign = 1;              // +1 nose first, −1 riding switch (tail first)
    this.edgeAngle = 0;               // signed edge angle (rad), + = right-turn edge
    this.skidAngle = 0;               // rad between the equipment axis and the path (+ = rotated right)
    this.latAccel = 0;                // m/s² centripetal (+ = turning right)
    this.gearLatAccel = 0;            // m/s² contact force across the gear, nose frame (+ = toward the nose's right)
    this.carveQuality = 1;            // 1 = clean carve, → 0 washing out / skidding
    this.plow = 0; this.stop = 0; this.stopSide = 1; this.stopToe = false;
    this.press = 0; this.butter = 0; this.grab = 0; this.windup = 0; this.grabName = null;
    this.flip = 0; this.flipRate = 0;   // rad about the gear's lateral axis in the air (+ = backflip), rad/s
    this.prevFlip = 0; this.renderFlip = 0;
    this._ctrl = { steer: 0, brake: 0, up: 0, jump: false, tuck: 0, active: false };
    this.setEquipment('ski');
  }

  /**
   * Swap equipment at runtime: type 'ski' | 'snowboard', variant id or (partial) spec object (see
   * equipment/). Keeps position and velocity; emits 'equipmentChanged' so the rider rebuilds its gear.
   */
  setEquipment(type, variant) {
    const t = normalizeType(type);
    const spec = getEquipmentSpec(t, variant);
    const custom = variant && typeof variant === 'object';
    if (this.equipment && this.equipment.type === t && this.equipment.variant === spec.id && !custom) return this.equipment;
    const handling = deriveHandling(t, spec);
    const prev = this.dyn;
    this.dyn = t === 'snowboard' ? new SnowboardPhysics(this, spec, handling) : new SkiPhysics(this, spec, handling);
    if (prev) {
      this.dyn.edge = prev.edge;
      // New gear goes on facing the direction of travel (a switch rider swaps to forward-facing gear).
      if (prev.travel < 0) {
        this.heading += Math.PI;
        groundQuat(this.groundNormal, this.heading, this.orient);
        this.prevOrient.copy(this.orient); this.renderOrient.copy(this.orient);
        this.travelSign = 1;   // edge angles are relative to travel, so they carry over unchanged
      }
    }
    this.equipment = { type: t, variant: spec.id, spec, handling };
    this.plow = 0; this.stop = 0; this.press = 0; this.butter = 0; this.grab = 0;
    emit('equipmentChanged', { type: t, variant: spec.id, spec, stance: this.stance, player: this });
    return this.equipment;
  }

  /** Snowboard stance: 'regular' (left foot forward) or 'goofy'. */
  setStance(stance) {
    this.stance = stance === 'goofy' ? 'goofy' : 'regular';
    emit('equipmentChanged', { type: this.equipment.type, variant: this.equipment.variant, spec: this.equipment.spec, stance: this.stance, player: this });
  }

  get isSwitch() { return this.travelSign < 0; }
  get speedRatio() { return clamp(this.speed / this.dyn.maxVelocity, 0, 1); }
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
    this.airTime = 0; this.squat = 0; this.stumbleT = 0;
    this.dyn.charge = 0; this.dyn.charging = false; this.dyn.travel = 1; this.dyn.edge = 0; this.dyn.stop = 0;
    this.travelSign = 1; this.edgeAngle = 0; this.skidAngle = 0; this.latAccel = 0;
    this.flip = 0; this.flipRate = 0; this.prevFlip = 0; this.renderFlip = 0;
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
    this.simulated = true;            // riders fall back to pose-only cues for players that never step (lobby previews)
    this.prevPos.copy(this.position);
    this.prevOrient.copy(this.orient);
    this.prevFlip = this.flip;
    if (this.state === State.FROZEN || this.debugFreeze) return;   // debugFreeze: hold a pose for inspection
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
    this.renderFlip = this.prevFlip + (this.flip - this.prevFlip) * alpha;
  }

  readInput(dt) {
    const I = this.input, c = this._ctrl;
    c.active = this.controllable() && this.state !== State.LIFT;
    c.steer = 0; c.brake = 0; c.up = 0; c.jump = false; c.tuck = 0;
    if (c.active) {
      c.steer = I.strength('right') - I.strength('left');
      c.brake = I.strength('brake');
      c.up = I.strength('speedUp');
      c.tuck = I.strength('tuck');
      c.jump = I.strength('jump') > 0.5;
      if (I.justPressed('reset')) this.resetToTop();
    }
    if (this.script) this.script(c, this);   // headless tests / demos can drive the controls
    // Hard brake: a fan of snow + camera FoV snap.
    if (c.brake > 0.6 && this._prevBrakeIn <= 0.6 && this.speed > 10 && this.state === State.GROUNDED) emit('hardBrake', this.speed);
    this._prevBrakeIn = c.brake;
    if (this.dyn.control(dt, c, this.state === State.GROUNDED)) this.jump();
  }

  /**
   * Ground normal for physics. The terrain's own normal is sampled at grid spacing (~3 m), which
   * smears across kicker lips; on park features use a fine finite difference of the true height.
   */
  normalAt(x, z, out) {
    const T = this.terrain;
    const feat = T.baseHeight ? Math.max(T.getHeight(x, z) - T.baseHeight(x, z), T.getHeight(x + 1.5, z) - T.baseHeight(x + 1.5, z),
      T.getHeight(x - 1.5, z) - T.baseHeight(x - 1.5, z), T.getHeight(x, z + 1.5) - T.baseHeight(x, z + 1.5), T.getHeight(x, z - 1.5) - T.baseHeight(x, z - 1.5)) : 0;
    if (feat < 0.02) return T.getNormal(x, z, P.normalRadius, out);
    // One-sided along the direction of travel (never looks past a lip), centred across it.
    const e = 0.35, sp = Math.hypot(this.velocity.x, this.velocity.z);
    const dx = sp > 0.5 ? this.velocity.x / sp : -Math.sin(this.heading), dz = sp > 0.5 ? this.velocity.z / sp : -Math.cos(this.heading);
    const rx = -dz, rz = dx;
    const h0 = T.getHeight(x, z), hb = T.getHeight(x - dx * e, z - dz * e);
    const hl = T.getHeight(x + rx * e, z + rz * e), hr = T.getHeight(x - rx * e, z - rz * e);
    _t1.set(dx * e, h0 - hb, dz * e); _t2.set(rx * 2 * e, hl - hr, rz * 2 * e);
    out.crossVectors(_t2, _t1).normalize();
    if (out.y < 0) out.negate();
    return out;
  }

  groundStep(dt) {
    const T = this.terrain;
    const n = this.normalAt(this.position.x, this.position.z, _n);
    this.groundNormal.copy(n);
    T.getSurface(this.position.x, this.position.z, this.surface);
    const g = new THREE.Vector3(0, -P.gravity, 0);
    const gTan = g.clone().addScaledVector(n, -g.dot(n));
    const v = this.velocity.clone().addScaledVector(n, -this.velocity.dot(n));
    if (this._alignTimer > 0) this._alignTimer -= dt;
    // Downhill settle when stopped and not steering: the gear slowly points down the fall line.
    if (v.length() < 1.5 && Math.abs(this.turnInput) < 0.1 && n.y < 0.995 && this.stop < 0.1) {
      this.heading = lerpAngle(this.heading, Math.atan2(-n.x, -n.z) + (this.travelSign < 0 ? Math.PI : 0), 1 - Math.exp(-1.4 * dt));
    }
    this.dyn.ground(dt, n, v, gTan);
    this.velocity.copy(v);
    this.speed = v.length();
    const np = this.position.clone().addScaledVector(v, dt);
    const gh = T.getHeight(np.x, np.z);
    if (np.y - gh > P.takeoffGap && this.speed > 4) {
      this.position.copy(np);
      this.enterAir(false);
    } else {
      np.y = gh;
      const n2 = this.normalAt(np.x, np.z, _v);
      const into = this.velocity.dot(n2);
      // Convex terrain (drop lips, rollers, the crest of a bump): the snow falls away faster than
      // gravity can pull the rider onto it — v·n'/dt > g·n'.y, i.e. v²κ > g·cos θ — so they leave it.
      // liftOffGrip > 1 is the legs absorbing a little (riders suck up small crests).
      if (into > P.liftOffMin && into / dt > P.gravity * n2.y * P.liftOffGrip && this.speed > 5) {
        this.position.copy(np);
        this.enterAir(false);
        this.trackProgress(dt);
        return;
      }
      if (into < 0) {
        const mag = this.velocity.length();
        // Follow the terrain: rotate the velocity onto the new surface (keeps speed; a dip costs a little).
        const loss = Math.min(0.03 * mag, Math.max(0, -into - P.smoothFollow) * P.terrainImpactLoss);
        this.velocity.addScaledVector(n2, -into).normalize().multiplyScalar(mag - loss);
        this._followLoss = (this._followLoss || 0) + loss;
      }
      this.position.copy(np);
    }
    this.trackProgress(dt);
    this.checkLift();
  }

  jump() {
    if (this.state !== State.GROUNDED) return;
    const depth = this.dyn.charge;
    // Popping off a kicker / roller lip springs much higher than an ollie on the flat (arcade bonus).
    const T = this.terrain;
    const feature = T.baseHeight ? T.getHeight(this.position.x, this.position.z) - T.baseHeight(this.position.x, this.position.z) : 0;
    const lip = clamp(feature / 0.5, 0, 1);
    const pop = this.dyn.pop() * (1 + (P.lipPopBonus - 1) * lip);
    this.lastLip = lip;
    this.lastPop = pop;
    this.velocity.addScaledVector(this.groundNormal, pop);
    this.position.addScaledVector(this.groundNormal, 0.06);
    emit('jumped', depth);
    this.enterAir(true);
  }

  enterAir(popped = false) {
    this.state = State.AIR; this.airTime = 0; this._spinTotal = 0; this.spinRate = 0; this.turnVelocity = 0;
    this.grab = 0; this.stop = 0; this.butter = 0; this.press = 0;
    this.dyn.takeoffInfo(popped);
    emit('takeoff', { popped, switch: this.isSwitch, type: this.equipment.type });
  }

  airStep(dt) {
    this.velocity.y -= P.gravity * dt;
    this.velocity.multiplyScalar(1 - P.airDrag * this.velocity.length() * dt * 0.1);
    this.dyn.air(dt, this._ctrl);
    this._spinTotal += this.spinRate * dt;
    this.carve *= Math.exp(-3 * dt);
    this.sink *= Math.exp(-8 * dt);
    this.skid *= Math.exp(-4 * dt);
    this.airTime += dt;
    this.speed = this.velocity.length();
    this.position.addScaledVector(this.velocity, dt);
    const gh = this.terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y <= gh) {
      this.position.y = gh;
      // Just popped on a rising ramp and still moving away from the surface: ride up it airborne.
      const n = this.normalAt(this.position.x, this.position.z, _n);
      if (this.airTime < 0.25 && this.velocity.dot(n) > 0.8) return;
      this.land();
    }
  }

  land() {
    const n = this.normalAt(this.position.x, this.position.z, this.groundNormal);
    const vn = this.velocity.dot(n);
    const impact = Math.max(0, -vn);
    this.landingVy = impact;
    this.velocity.addScaledVector(n, -vn);
    const velYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    const devNose = Math.abs(angleDiff(this.heading, velYaw));
    const spins = Math.round(Math.abs(this._spinTotal) / Math.PI);  // 180s
    const slow = this.velocity.length() < 1.5;
    const ev = slow ? { result: 'clean', switch: this.isSwitch, dev: 0 } : this.dyn.land(devNose);
    // Pitch: a flip has to come round to (near) upright; the worse of yaw and pitch decides.
    const fl = this.dyn.landFlip();
    if (fl.result === 'crash') ev.result = 'crash';
    else if (fl.result === 'stumble' && ev.result === 'clean') ev.result = 'stumble';
    ev.flipDev = fl.dev;
    if (impact > P.hardLanding && ev.result === 'clean') ev.result = 'stumble';
    const t = this.dyn.takeoff || { switch: false, spin: 0 };
    this.grab = 0;
    this.flip = 0; this.flipRate = 0; this.prevFlip = 0;
    if (impact > P.crashImpact || ev.result === 'crash') { this.crash('landing'); return; }
    this.dyn.travel = ev.switch ? -1 : 1;
    this.travelSign = this.dyn.travel;
    this.state = State.GROUNDED;
    this._alignTimer = 0.35;
    this.landingEvent++;
    const clean = ev.result === 'clean';
    if (!clean) {
      this.stumbleT = ev.result === 'slide' ? P.stumbleTime * 1.4 : P.stumbleTime;
      this.velocity.multiplyScalar(ev.result === 'slide' ? 0.62 : 0.82);
      emit('stumble', ev.result);
    }
    const perfect = ev.dev < 8 && fl.dev < 10 && this.airTime > 0.6;
    const trick = this.dyn.trickLabel(t, spins, fl);
    this.lastLanding = { ...ev, impact, air: this.airTime, spins, flips: fl.flips, trick };
    emit('landed', { impact, air: this.airTime, clean, perfect, switch: ev.switch, result: ev.result, trick });
    if (clean && (this.airTime > 0.7 || (trick && this.airTime > 0.35))) {
      let label = trick || `Air ${this.airTime.toFixed(1)}s`;
      if (perfect) label = `Perfect ${label}`;
      game.airTotal += this.airTime;
      const grabPts = t.grab && t.grabT > 0.25 ? 40 + Math.floor(t.grabT * 60) : 0;
      addScore(label, Math.floor(this.airTime * 80) + spins * 90 + fl.flips * 150 + grabPts + (t.switch ? 30 : 0) + (perfect ? 50 : 0));
    }
    this.airTime = 0;
  }

  crash(kind) {
    this.state = State.CRASH; this.crashT = 0; this._crashStage = 0;
    this.flip = 0; this.flipRate = 0;
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
      // Respawn nose-first along the path (a switch rider respawns riding forward).
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
    // Flips rotate about the gear's lateral axis (+X); + flip lifts the leading end (nose, or tail when switch).
    if (this.flip) target.multiply(_qf.setFromAxisAngle(_X, this.flip * this.travelSign));
    // Fast follow on the ground (stops / butters / spins rotate quickly), smoothing only the terrain.
    const k = this.state === State.GROUNDED ? 22 : 30;
    this.orient.slerp(target, 1 - Math.exp(-k * dt));
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
