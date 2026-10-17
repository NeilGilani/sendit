// PlayerPhysics — rider controller on the mountain (fixed 60 Hz step, interpolated for rendering).
// Owns the state machine (grounded / air / crash / lift), terrain following, take-off detection,
// collisions, near-misses, scoring, respawns and lifts. Everything that depends on the equipment —
// edge carving, skids, brakes, pop, spins, grabs and landing evaluation — is delegated to a
// SkiPhysics or SnowboardPhysics instance (physics/), chosen with setEquipment(type, variant).
// Tunables: PHYSICS (+ PHYSICS.ski / PHYSICS.snowboard) in config.js.
import * as THREE from 'three';
import { PHYSICS as P, FX, applyMapTuning } from './config.js';
import { game, Mode, setMode, emit, addScore, on } from './state.js';
import { angleDiff, lerpAngle, clamp } from './physics/math.js';
import { SkiPhysics } from './physics/ski.js';
import { SnowboardPhysics } from './physics/snowboard.js';
import { Flow } from './physics/flow.js';
import { Grind } from './physics/grind.js';
import { getEquipmentSpec, deriveHandling, normalizeType } from './equipment/registry.js';

export const State = { FROZEN: 0, GROUNDED: 1, AIR: 2, CRASH: 3, LIFT: 4, GRIND: 5 };
const UP = new THREE.Vector3(0, 1, 0);
const _X = new THREE.Vector3(1, 0, 0), _qf = new THREE.Quaternion();
const _n = new THREE.Vector3(), _v = new THREE.Vector3(), _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3();

export class Player {
  constructor(terrain, scatter, lifts, input) {
    Object.assign(this, { terrain, scatter, lifts, input });
    // Per-map physics (course.physics, config.js applyMapTuning): only for a real world terrain, so lobby
    // previews on a flat stand-in never reset the loaded map's tuning.
    if (terrain && terrain.course !== undefined) applyMapTuning(terrain.course);
    this.flow = terrain && terrain.course !== undefined && P.flow?.enabled ? new Flow(this) : null;   // SSX-style energy layer (opt-in)
    // Maps with drop zones say so once the ride is under way.
    if (terrain?.course?.dropZones?.length && typeof document !== 'undefined') {
      on('rideStarted', () => setTimeout(() => emit('hint', `Drop zones: keys 1–${Math.min(9, terrain.course.dropZones.length)} or d-pad ◀ ▶`), 5000));
    }
    this.grind = terrain?.course?.rails?.length ? new Grind(this, terrain.course.rails) : null;   // rails, boxes, tubes (opt-in: course.rails)
    if (terrain?.course?.onPlayer) terrain.course.onPlayer(this);   // a map's own per-rider hooks (opt-in)
    if (this.flow && typeof document !== 'undefined') import('./flowhud.js').then((m) => m.mountFlowHud(this)).catch((e) => console.warn('[flow] HUD failed', e));
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
    // Drawn flip (signed about the gear's +X, i.e. flip · travelSign, plus a residual that settles after
    // touchdown). `orient` stays the un-flipped base; renderOrient = base · Rx(renderFlip).
    this.visFlip = 0; this.flipSettle = 0; this.prevFlip = 0; this.renderFlip = 0;
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
      // Mid-air swaps keep the trick going (bookkeeping, flip commitment, input locks).
      for (const k of ['takeoff', '_flipCommit', '_spinLock', '_flipLock', 'spinH', 'flipH', 'popQ', '_spinPre', 'airPred', 'tuckLoad']) this.dyn[k] = prev[k];
      // New gear goes on facing the direction of travel (a switch rider swaps to forward-facing gear).
      if (prev.travel < 0) {
        this.heading += Math.PI;
        this.flip = -this.flip; this.flipRate = -this.flipRate;   // keep the drawn flip (flip · travel) continuous
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
    this.airTime = 0; this.squat = 0; this.stumbleT = 0; this.compression = 0; this._landGrace = 0;
    this.dyn.charge = 0; this.dyn.charging = false; this.dyn.travel = 1; this.dyn.edge = 0; this.dyn.stop = 0;
    this.travelSign = 1; this.edgeAngle = 0; this.skidAngle = 0; this.latAccel = 0;
    this.flip = 0; this.flipRate = 0; this.visFlip = 0; this.flipSettle = 0; this.prevFlip = 0; this.renderFlip = 0;
    this._safe = [[this.position.clone(), yaw]];
    this.snapRender();
  }

  snapRender() {
    this.prevPos.copy(this.position); this.renderPos.copy(this.position);
    this.prevOrient.copy(this.orient); this.renderOrient.copy(this.orient);
    this.prevFlip = this.renderFlip = this.visFlip;
    if (this.visFlip) this.renderOrient.multiply(_qf.setFromAxisAngle(_X, this.visFlip));
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
    this.prevFlip = this.visFlip;
    if (this.state === State.FROZEN || this.debugFreeze) return;   // debugFreeze: hold a pose for inspection
    if (P.slowmo) dt *= this.slowmoScale(dt);                      // huge airs: a moment of slow motion (opt-in)
    this.readInput(dt);
    switch (this.state) {
      case State.GROUNDED: this.groundStep(dt); break;
      case State.AIR: this.airStep(dt); break;
      case State.CRASH: this.crashStep(dt); break;
      case State.LIFT: this.liftStep(dt); break;
      case State.GRIND: this.grind.step(dt); break;
    }
    if (this.state === State.GROUNDED || this.state === State.AIR) { this.collide(); this.keepInside(); this.nearMiss(dt); this.grind?.detect(dt); }
    this.stumbleT = Math.max(0, this.stumbleT - dt);
    if (this.flow) this.flow.update(dt);
    this._hintCool = Math.max(0, this._hintCool - dt);
    this.applyOrient(dt);
  }

  /**
   * Apex slow motion (PHYSICS.slowmo = { minAir, scale, easeIn, hold, easeOut, cooldown }, real seconds):
   * once per air, when the predicted flight is longer than minAir, time eases down to `scale` near the
   * top of the arc and back before the landing. Returns this step's time scale; emits 'slowmo' {scale}.
   */
  slowmoScale(realDt) {
    const S = P.slowmo;
    this._smCool = Math.max(0, (this._smCool || 0) - realDt);
    if (this.state !== State.AIR) { this._smT = -1; this._smArmed = true; if (this.timeScale !== 1) { this.timeScale = 1; emit('slowmo', { scale: 1 }); } return 1; }
    if (this._smT < 0 && this._smArmed && this._smCool <= 0 && this.airTime > 0.25 && this.velocity.y < 2) {
      const tLand = this.dyn.timeToLand();
      // Only genuinely big air: a long flight AND real height under the rider (minDrop m above the snow).
      const above = this.position.y - this.terrain.getHeight(this.position.x, this.position.z);
      if (tLand > S.minAir * 0.6 && this.airTime + tLand > S.minAir && above > (S.minDrop ?? 0)) { this._smT = 0; this._smArmed = false; this._smCool = S.cooldown; }
    }
    let k = 1;
    if (this._smT >= 0) {
      this._smT += realDt;
      const t = this._smT;
      const a = t < S.easeIn ? t / S.easeIn : t < S.easeIn + S.hold ? 1 : 1 - (t - S.easeIn - S.hold) / S.easeOut;
      const w = Math.max(0, Math.min(1, a));
      k = 1 - (1 - S.scale) * w * w * (3 - 2 * w);
      // Never slow the last moments before touchdown (the landing needs real-time control).
      if (this.dyn.timeToLand() < 0.45) k = Math.max(k, 0.9);
      if (t > S.easeIn + S.hold + S.easeOut) this._smT = -2;
    }
    if (Math.abs(k - (this.timeScale ?? 1)) > 0.01 || (k === 1 && this.timeScale !== 1)) { this.timeScale = k; emit('slowmo', { scale: k }); }
    return k;
  }

  interpolate(alpha) {
    this.renderPos.lerpVectors(this.prevPos, this.position, alpha);
    this.renderOrient.slerpQuaternions(this.prevOrient, this.orient, alpha);
    this.renderFlip = this.prevFlip + (this.visFlip - this.prevFlip) * alpha;
    if (this.renderFlip) this.renderOrient.multiply(_qf.setFromAxisAngle(_X, this.renderFlip));
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
      this.dropZoneInput();
    }
    if (this.script) this.script(c, this);   // headless tests / demos can drive the controls
    // Hard brake: a fan of snow + camera FoV snap.
    if (c.brake > 0.6 && this._prevBrakeIn <= 0.6 && this.speed > 10 && this.state === State.GROUNDED && !this.dyn.charging) emit('hardBrake', this.speed);
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
    // Solid walls (buildings): blocked before the height lookup, which would otherwise lift the rider onto the roof.
    if (T.features?.blockAt) {
      const b = T.features.blockAt(np.x, this.position.y, np.z, this.position.x, this.position.y, this.position.z);
      if (b && this.hitWall(np, b)) return;
    }
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
      // A rider crouched to pop (charging) absorbs crests: hold to stay low, release on the crest to boost.
      const grip = P.liftOffGrip * (1 + P.liftOffAbsorb * this.dyn.charge);
      if (into > P.liftOffMin && into / dt > P.gravity * n2.y * grip && this.speed > 5) {
        this.position.copy(np);
        this.enterAir(false);
        this.trackProgress(dt);
        return;
      }
      // Compression: normal velocity the legs absorb over the last ~0.12 s (a flat bottom at speed piles up).
      this.compression = (this.compression || 0) * Math.exp(-dt / 0.12) + Math.max(0, -into);
      if (into < 0) {
        const mag = this.velocity.length();
        // Follow the terrain: rotate the velocity onto the new surface (keeps speed; a dip costs a little).
        const loss = Math.min(0.03 * mag, Math.max(0, -into - P.smoothFollow) * P.terrainImpactLoss);
        _t1.copy(this.velocity).divideScalar(mag || 1);
        this.velocity.addScaledVector(n2, -into).normalize();
        // A real transition turns the path a few degrees per step; a step in the height field would
        // turn it by tens of degrees at once and fire the rider off it like a ramp. Turn at most
        // followMaxRate (rad/s); the rest is a bump the legs take (compression), never a launch.
        const turn = _t1.angleTo(this.velocity), maxTurn = P.followMaxRate * dt;
        if (turn > maxTurn) this.velocity.lerpVectors(_t1, this.velocity, maxTurn / turn).normalize();
        this.velocity.multiplyScalar(mag - loss);
        this._followLoss = (this._followLoss || 0) + loss;
      }
      this.position.copy(np);
      if (this.compression > P.compressionCrash) {
        this.lastCrash = { reason: 'compression', impact: this.compression, air: 0, spins: 0, flips: 0 };
        this.compression = 0;
        this.crash('compression');
        return;
      }
      if (this.compression > P.compressionStumble && this.stumbleT <= 0 && !(this._landGrace > 0)) {
        this.stumbleT = P.stumbleTime * 0.7;
        this.velocity.multiplyScalar(0.9);
        emit('stumble', 'compression');
      }
    }
    this._landGrace = Math.max(0, (this._landGrace || 0) - dt);
    this.trackProgress(dt);
    this.checkLift();
  }

  jump() {
    const late = this.state === State.AIR && this.dyn._lateT > 0;
    if (this.state !== State.GROUNDED && !late) return;
    const depth = this.dyn.charge;
    // A kicker lip and speed both shorten the time the legs have to push (docs/jumps-research.md: real
    // riders add −2.5…+1.1 m/s on a park lip): lipPopBonus on a kicker, popSpeedFade [v0, v1, share] at speed.
    const T = this.terrain;
    const feature = T.baseHeight ? T.getHeight(this.position.x, this.position.z) - T.baseHeight(this.position.x, this.position.z) : 0;
    const lip = clamp(feature / 0.5, 0, 1);
    const F = P.popSpeedFade, fade = F ? 1 + (F[2] - 1) * clamp((this.speed - F[0]) / (F[1] - F[0]), 0, 1) : 1;
    const pop = this.dyn.pop() * (1 + (P.lipPopBonus - 1) * lip) * fade;
    // How well the pop was timed sets the rotation (edge.js takeoffInfo): right at the lip = 1.
    this.lastPopQ = this.popTiming(late);
    this.lastLip = lip;
    this.lastPop = pop;
    this.velocity.addScaledVector(this.groundNormal, pop);
    if (late) {
      // Late pop off a crest: already airborne, so re-run the take-off bookkeeping as a popped jump.
      emit('jumped', depth);
      this.dyn.latePop();
      return;
    }
    this.position.addScaledVector(this.groundNormal, 0.06);
    emit('jumped', depth);
    this.enterAir(true);
  }

  /**
   * Pop timing, 0..1 (scales the spin / flip set): 1 when released right at a lip (the snow falls away
   * from the path within popLipTime), less the earlier it comes (popEarly s ahead → popEarlySet), a flat-
   * ground pop with no lip ahead = popFlatSet, a late (coyote) pop loses up to a third by latePopTime.
   */
  popTiming(late) {
    if (late) return clamp(1 - (this.airTime / P.latePopTime) * 0.35, 0.5, 1);
    const ahead = this.lipAhead(P.popEarly + 0.2);
    if (ahead === null) return P.popFlatSet;
    return 1 - (1 - P.popEarlySet) * clamp((ahead - P.popLipTime) / (P.popEarly - P.popLipTime), 0, 1);
  }

  /** Seconds until the snow falls away from the rider's path (a lip / kicker end), or null within maxT. */
  lipAhead(maxT) {
    const T = this.terrain, p = this.position, v = this.velocity, g = P.gravity;
    for (let t = 0.04; t <= maxT; t += 0.04) {
      const y = p.y + v.y * t - 0.5 * g * t * t;
      if (T.getHeight(p.x + v.x * t, p.z + v.z * t) < y - 0.12) return t;
    }
    return null;
  }

  enterAir(popped = false) {
    this.takeoffPos = (this.takeoffPos || new THREE.Vector3()).copy(this.position);
    this._maxAbove = 0;
    this.state = State.AIR; this.airTime = 0; this._spinTotal = 0; this.spinRate = 0; this.turnVelocity = 0;
    this.grab = 0; this.stop = 0; this.butter = 0; this.press = 0;
    this.dyn.takeoffInfo(popped);
    emit('takeoff', { popped, switch: this.isSwitch, type: this.equipment.type });
  }

  airStep(dt) {
    this.velocity.y -= P.gravity * P.airGravity * dt;
    // Aerodynamic drag a = k·v², k = ρ·CdA / 2m (PHYSICS.airDrag); a tuck or a grab is more compact.
    const compact = Math.max(this.grab, this.flipTuck || 0);
    const kd = P.airDrag * (1 - (1 - P.airDragCompact) * compact);
    this.velocity.multiplyScalar(1 / (1 + kd * this.velocity.length() * dt));
    this.dyn.air(dt, this._ctrl);
    this._spinTotal += this.spinRate * dt;
    this.carve *= Math.exp(-3 * dt);
    this.sink *= Math.exp(-8 * dt);
    this.skid *= Math.exp(-4 * dt);
    this.airTime += dt;
    this.speed = this.velocity.length();
    const px = this.position.x, py = this.position.y, pz = this.position.z;
    this.position.addScaledVector(this.velocity, dt);
    // Flying into a wall from the side (landing on a roof from above is fine).
    const blockAt = this.terrain.features?.blockAt;
    if (blockAt) {
      const b = blockAt(this.position.x, this.position.y, this.position.z, px, py, pz);
      if (b && this.hitWall(this.position, b)) return;
    }
    const gh = this.terrain.getHeight(this.position.x, this.position.z);
    if (this.position.y - gh > (this._maxAbove || 0)) this._maxAbove = this.position.y - gh;
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
    this._preLandYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    const vn = this.velocity.dot(n);
    const rawImpact = Math.max(0, -vn);
    // Deep powder soaks up part of the hit (big-mountain maps; 0 by default). Roofs and rock don't.
    const surf = this.terrain.getSurface(this.position.x, this.position.z, this.surface);
    const onRoof = this.terrain.baseHeight ? this.terrain.getHeight(this.position.x, this.position.z) - this.terrain.baseHeight(this.position.x, this.position.z) > 0.3 : false;
    const soft = onRoof ? 0.5 : clamp(surf.y + surf.w, 0, 1);
    const impact = Math.max(0, rawImpact - P.landPowderAbsorb * soft);
    this.landingVy = rawImpact;
    this.velocity.addScaledVector(n, -vn);
    // A hop of a step or two at speed (a bump skimmed mid-carve) isn't a landing: whatever skid angle the
    // rider had stays a skid, not a sideways touchdown (PHYSICS.microHop seconds, 0 = off).
    if (P.microHop && this.airTime < P.microHop * (this.dyn.takeoff?.popped ? 1 : 2.5) && rawImpact < P.hardLanding * 0.5 && !this.flip) {
      this.state = State.GROUNDED;
      this.compression = 0; this._landGrace = 0.15;
      this.airTime = 0; this._maxAbove = 0; this.grab = 0;
      return;
    }
    if (P.landPowderScrub) this.velocity.multiplyScalar(Math.max(0.55, 1 - P.landPowderScrub * rawImpact * soft));
    // Big drops onto steep landings turn the fall into speed; above landSpeedCap most of it goes into the snow.
    if (P.landSpeedCap) {
      const sp = this.velocity.length();
      if (sp > P.landSpeedCap) this.velocity.multiplyScalar((P.landSpeedCap + (sp - P.landSpeedCap) * 0.35) / sp);
      this.speed = this.velocity.length();   // not the in-air speed (vertical included) on the speedometer for a frame
    }
    const velYaw = Math.atan2(-this.velocity.x, -this.velocity.z);
    // Landing on a sidewall bends the path; a rider lined up with the flight pivots into the new line
    // (PHYSICS.landRedirect degrees absorbed, 0 = off). preYaw = the flight direction before touchdown.
    if (P.landRedirect && this._preLandYaw !== undefined) {
      const tailOk = this.dyn.tailLandings();
      const near = (yaw) => { let d = angleDiff(this.heading, yaw); if (tailOk && Math.abs(d) > Math.PI / 2) d = angleDiff(this.heading, yaw + Math.PI); return d; };
      const pre = near(this._preLandYaw), post = near(velYaw);
      if (Math.abs(pre) < 15 * Math.PI / 180 && Math.abs(post) > Math.abs(pre)) {
        const turn = Math.sign(post) * Math.min(Math.abs(post) - Math.abs(pre), P.landRedirect * Math.PI / 180);
        this.heading += turn;
      }
    }
    const devNose = Math.abs(angleDiff(this.heading, velYaw));
    const spins = Math.round(Math.abs(this._spinTotal) / Math.PI);  // 180s
    const landSpeed = this.velocity.length();
    const slow = landSpeed < 1.5;
    // Fast landings forgive less sideways (landYawSpeed: tolerances × scale from v0 → v1).
    const ys = (P.landYawSpeed ? 1 + (P.landYawSpeed[2] - 1) * clamp((landSpeed - P.landYawSpeed[0]) / (P.landYawSpeed[1] - P.landYawSpeed[0]), 0, 1) : 1)
      * (1 + (this.flowBoost || 0) * (this.flow?.C.landBoost || 0));   // flow state: a little more forgiving
    const ev = slow ? { result: 'clean', switch: this.isSwitch, dev: 0 } : this.dyn.land(devNose, ys);
    // Pitch: a flip has to come round to (near) upright; the worse of yaw and pitch decides.
    const fl = this.dyn.landFlip();
    if (fl.result === 'crash') ev.result = 'crash';
    else if (fl.result === 'stumble' && ev.result === 'clean') ev.result = 'stumble';
    ev.flipDev = fl.dev;
    if (impact > P.hardLanding && ev.result === 'clean') ev.result = 'stumble';
    const t = this.dyn.takeoff || { switch: false, spin: 0 };
    this.grab = 0;
    // The leftover pitch (within the landing tolerance) settles visually over a few frames.
    this.flipSettle = Math.atan2(Math.sin(this.flip), Math.cos(this.flip)) * this.travelSign;
    this.flip = 0; this.flipRate = 0;
    if (impact > P.crashImpact || ev.result === 'crash') {
      // Why it went wrong (for UI / tuning): too hard, or yaw / pitch out of line.
      const reason = impact > P.crashImpact ? 'impact' : fl.result === 'crash' ? 'pitch' : 'yaw';
      this.lastCrash = { reason, impact, dev: ev.dev, flipDev: fl.dev, air: this.airTime, spins, flips: fl.flips };
      this.crash('landing');
      return;
    }
    this.dyn.travel = ev.switch ? -1 : 1;
    this.travelSign = this.dyn.travel;
    this.state = State.GROUNDED;
    this.compression = 0; this._landGrace = 0.3;   // the landing itself was judged above
    this._alignTimer = 0.35;
    this.landingEvent++;
    const clean = ev.result === 'clean';
    if (!clean) {
      this.stumbleT = ev.result === 'slide' ? P.stumbleTime * 1.4 : P.stumbleTime;
      this.velocity.multiplyScalar(ev.result === 'slide' ? 0.62 : 0.82);
      emit('stumble', ev.result);
    }
    const perfect = clean && ev.dev < 8 && fl.dev < 10 && this.airTime > 0.6;
    const trick = this.dyn.trickLabel(t, spins, fl);
    const scored = clean && (this.airTime > 0.7 || (trick && this.airTime > 0.35));
    const grabPts = t.grab && t.grabT > 0.25 ? Math.floor((40 + Math.floor(t.grabT * 60)) * (P.trickStyle && t.grabT > 0.9 ? 1.5 : 1)) : 0;
    let points = scored ? Math.floor(this.airTime * 80) + spins * 90 + fl.flips * 150 + grabPts + (t.switch ? 30 : 0) + (perfect ? 50 : 0) : 0;
    // Big-mountain extras (flow maps): the drop (greatest height above the snow in this air), a landing
    // grade, and flow-state trick points.
    const flow = this.flow;
    const drop = this._maxAbove || 0;
    let grade = null;
    if (flow) {
      grade = !clean ? 'sketchy' : perfect && impact <= P.hardLanding * 0.55 ? 'stomped' : 'clean';
      // Stomp it and ride out faster (SSX): a small push along the new line.
      if (grade === 'stomped' && flow.C.stompBoost) { const sp = this.velocity.length(); if (sp > 1) this.velocity.multiplyScalar((sp + flow.C.stompBoost) / sp); this.speed = this.velocity.length(); }
      points = Math.round(points * flow.scoreMul());
    }
    this.lastLanding = { ...ev, impact, air: this.airTime, spins, flips: fl.flips, trick, drop, grade, rawImpact };
    emit('landed', { impact, air: this.airTime, clean, perfect, switch: ev.switch, result: ev.result, trick, drop, grade, points, rawImpact });
    if (scored) {
      let label = trick || `Air ${this.airTime.toFixed(1)}s`;
      if (perfect) label = `Perfect ${label}`;
      game.airTotal += this.airTime;
      addScore(label, points);
    }
    // Named features (course.featureAt / roofAt): drops carry the name of what you launched off, roof
    // landings score on their own.
    const C = this.terrain.course;
    const feature = flow && C?.featureAt && this.takeoffPos ? C.featureAt(this.takeoffPos.x, this.takeoffPos.z) : null;
    const roof = flow && clean && C?.roofAt ? C.roofAt(this.position.x, this.position.z) : null;
    if (flow && clean && drop >= 6) addScore(`${feature ? `${feature} · ` : ''}${Math.round(drop)} m drop`, Math.round((drop * 12 + Math.max(0, drop - 15) * 10) * flow.scoreMul()));
    if (roof && this.airTime > 0.5) addScore(`Roof landing · ${roof}`, Math.round(200 * flow.scoreMul()));
    // Pillow line: clean landings off pillow after pillow (each within 3 s of the last) count up.
    if (flow && clean && feature === 'Pillow Stacks' && this.airTime > 0.35) {
      const t = flow.run?.time ?? 0;
      this._pillows = t - (this._pillowT ?? -99) < 3 ? (this._pillows || 0) + 1 : 1;
      this._pillowT = t;
      if (this._pillows >= 3) addScore(`Pillow line ×${this._pillows}`, Math.round(40 * Math.min(6, this._pillows) * flow.scoreMul()));
    }
    if (flow && this.airTime > 0.35) emit('landingGrade', { grade, drop, impact, rawImpact, air: this.airTime, trick, perfect, feature, roof });
    this.airTime = 0;
    this._maxAbove = 0;
  }

  crash(kind) {
    this.state = State.CRASH; this.crashT = 0; this._crashStage = 0;
    if (this.flip) this.flipSettle = Math.atan2(Math.sin(this.flip), Math.cos(this.flip)) * this.travelSign;
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

  /**
   * Drop zones (course.dropZones = [{ name, x, z, heading }], Steep-style): keys 1–9 pick one, the
   * d-pad ◀ ▶ cycles them; the rider fades to the top of that line.
   */
  dropZoneInput() {
    const Z = this.terrain.course?.dropZones, I = this.input;
    if (!Z?.length || this._busy || !I.codePressed) return;
    let pick = -1;
    for (let i = 0; i < Math.min(9, Z.length); i++) if (I.codePressed(`Digit${i + 1}`)) pick = i;
    const cur = this._zone ?? 0;
    if (I.btnPressed?.(15)) pick = (cur + 1) % Z.length;              // d-pad right
    if (I.btnPressed?.(14)) pick = (cur - 1 + Z.length) % Z.length;   // d-pad left
    if (pick < 0) return;
    this._zone = pick;
    const z = Z[pick];
    emit('hint', `Drop zone ${pick + 1} · ${z.name}`);
    this.fadeThen(() => {
      this.place(new THREE.Vector3(z.x, 0, z.z), z.heading);
      emit('respawned');
      emit('dropZone', { index: pick, ...z });
    });
  }

  resetToTop() { if (!this._busy && this.state !== State.FROZEN) this.fadeThen(() => { this.startRiding(); emit('resetTop'); }); }

  async fadeThen(action) {
    this._busy = true;
    await this.fade(true, 0.45);
    action();
    await new Promise((r) => setTimeout(r, 120));
    this.fade(false, 0.7);
    this._busy = false;
  }

  /**
   * A building wall (terrain.features.blockAt): push out along the wall normal and keep the speed along
   * the wall, so a glancing touch slides past instead of snagging; hitting it square at speed knocks the
   * rider down. `pos` is corrected in place. Returns true when the step should end here.
   */
  hitWall(pos, b) {
    pos.x += b.nx * (b.depth + 0.03);
    pos.z += b.nz * (b.depth + 0.03);
    const into = -(this.velocity.x * b.nx + this.velocity.z * b.nz);
    if (into > 0) {
      this.velocity.x += b.nx * into * 1.15;
      this.velocity.z += b.nz * into * 1.15;
      if (into > P.wallCrashSpeed) {
        this.position.copy(pos);
        if (this.state === State.GROUNDED) this.position.y = this.terrain.getHeight(pos.x, pos.z);
        this.velocity.multiplyScalar(0.4);
        this.lastCrash = { reason: b.kind, impact: into, air: this.airTime, spins: 0, flips: 0 };
        this.crash(b.kind);
        return true;
      }
      emit('bump', into);
    }
    return false;
  }

  collide() {
    if (!this.scatter) return;
    const o = this.scatter.findObstacle(this.position, 0.35);
    if (!o) return;
    // Obstacles have a height (opt-in): flying well over a tree crown or a boulder clears it.
    if (P.obstacleHeights && this.state === State.AIR) {
      const top = o[3] === 'tree' ? o[2] * 26 : o[3] === 'rock' ? o[2] * 1.1 + 0.3 : o[3] === 'tower' ? 15 : 2;
      if (this.position.y - this.terrain.getHeight(o[0], o[1]) > top) return;
    }
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
        emit('nearMiss', { dist: near.dist, kind: near.o[3], x: near.o[0], z: near.o[1] });
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
      if (this._hintCool <= 0) { emit('hint', this.terrain.course?.edgeHint ?? 'Edge of the mountain — head back into the gully'); this._hintCool = 6; }
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
    // Flips rotate about the gear's lateral axis (+X); + flip lifts the leading end (nose, or tail when switch).
    this.flipSettle *= Math.exp(-14 * dt);
    if (Math.abs(this.flipSettle) < 1e-3) this.flipSettle = 0;
    this.visFlip = this.flip * this.travelSign + this.flipSettle;
    if (this.state === State.LIFT) { this.orient.setFromAxisAngle(UP, this.heading); return; }
    const n = this.state === State.AIR ? _v.set(0, 1, 0).lerp(this.groundNormal, 0.3).normalize() : this.groundNormal;
    const target = groundQuat(n, this.heading, new THREE.Quaternion());
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
