// CameraController — chase camera with:
//   • FoV elasticity: currentFoV = baseFoV + velocityRatio · maxFoVBonus, snapping back sharply on
//     crashes and hard braking to sell the deceleration
//   • trauma-based shake: offset = noise · trauma², trauma decays linearly
//   • speed pull-back, carve tilt, cinematic side swing on big air, terrain-aware arm, idle orbit,
//     mouse/stick look, and a slow flyover for the menu.
//   • first person helmet cam (settings.view === 'fp'): see firstPerson()
import * as THREE from 'three';
import { CAMERA as C, PHYSICS } from './config.js';
import { State } from './player.js';
import { game, Mode, settings, on } from './state.js';
import { lerpAngle, angleDiff, clamp, smoothstep } from './world.js';
import { FPView } from './fpview.js';
import { urlParams } from './flags.js';

const _v = new THREE.Vector3();
const LIFT_SMOOTH = 0.12;   // s, follow smoothing on a lift ride
const LIFT_SIDE = 1.1;      // rad the lift camera sits off the cable line (straight behind, the cable and the chair back hid the rider; from the side the seated rider shows)

export class CameraController {
  constructor(camera, player, terrain, input) {
    Object.assign(this, { camera, player, terrain, input });
    this.pos = new THREE.Vector3();
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = C.pitch; this.lookYaw = 0; this.lookPitch = 0; this.lookIdle = 10;
    this.still = 0; this.orbit = 0; this.fov = C.baseFov; this.dist = C.distance; this.arm = C.distance;
    this.side = 0; this.sideSign = 1; this.roll = 0;
    this.trauma = 0;
    // Air framing (follow): eased amounts, springs, the predicted touchdown, the smoothed turn rate.
    this.airK = 0; this.preK = 0; this.airTotal = 0; this.turnRate = 0; this.prevVelYaw = null; this.armLift = 0;
    this.sv = {}; this.landPt = new THREE.Vector3(); this._land = { t: 0, p: new THREE.Vector3() };
    this.reducedMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;   // gentler default shake
    this.snapT = 0;            // > 0 while the FoV snaps back (crash / hard brake)
    this.t = 0;
    this.summit = terrain.summit();
    const sp = terrain.getSpawn().position;
    const to = sp.clone().sub(this.summit);
    this.menuAngle = Math.atan2(to.x, to.z);
    this.menuRadius = clamp(Math.hypot(to.x, to.z) * 0.8, 1300, 2400);
    this.wasMenu = true;
    this.intro = 1;
    const camParam = typeof location !== 'undefined' ? urlParams().get('cam') : null;
    if (typeof window !== 'undefined') window.__cam = this;   // debug handle (inspect view)
    if (camParam) this.inspect = { yaw: { side: 90, front: 180, back: 0, top: 0 }[camParam] ?? (Number(camParam) || 0), height: camParam === 'top' ? 3 : 0.9 };
    on('landed', ({ impact }) => this.addTrauma(Math.max(0, impact - 4) * C.landTrauma));
    on('crashed', () => { this.addTrauma(C.crashTrauma); this.snapT = 0.6; });
    on('hardBrake', () => { this.snapT = 0.35; this.addTrauma(0.12); });
    on('ragdollImpact', ({ k }) => this.addTrauma(Math.min(0.3, k * 0.22)));   // the tumbling body slamming down again
    on('flowState', ({ on: st }) => { if (st) { this.flowKick = 1; this.addTrauma(0.25); } this.flowHold = st ? 0.5 : 0; });
    on('slowmo', ({ scale }) => { this.slow = 1 - scale; });   // apex slow motion: the lens tightens a touch
    on('bump', (v) => this.addTrauma(Math.min(1, v * 0.06) * C.obstacleTrauma));
    on('stumble', () => this.addTrauma(0.25));
    on('landed', ({ impact }) => this.fpView?.kick(impact));
    // Respawns / drop zones / reset to top teleport the rider (often 10-35 m back up the track): jump the chase
    // camera there instead of gliding after it, which flew it through the rider just as the fade cleared.
    on('respawned', () => { if (this.intro >= 1 && game.mode !== Mode.MENU) this.snap(); });
  }

  addTrauma(a) { this.trauma = clamp(this.trauma + a, 0, 1); }

  /**
   * Juice punches (juice/impact.js): { fov (deg), dip (m, down), roll (deg) } jump in at once and spring
   * back (underdamped, a small overshoot). Chase camera only; the helmet cam has its own landing dip.
   */
  kick({ fov = 0, dip = 0, roll = 0 } = {}) {
    const k = this.kicks ||= { fov: [0, 0], dip: [0, 0], roll: [0, 0] };
    k.fov[0] = clamp(k.fov[0] + fov, -10, 10);
    k.dip[0] = clamp(k.dip[0] + dip, 0, 0.8);
    k.roll[0] = clamp(k.roll[0] + roll, -6, 6);
  }

  stepKicks(dt) {
    const k = this.kicks;
    if (!k) return null;
    for (const s of [k.fov, k.dip, k.roll]) {
      // x'' = -w² x - 2ζw x'  (w = 15 rad/s, ζ = 0.55), sub-stepped for stability at low frame rates
      const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
      for (let i = 0; i < n; i++) { s[1] += (-225 * s[0] - 16.5 * s[1]) * h; s[0] += s[1] * h; }
      if (Math.abs(s[0]) < 1e-4 && Math.abs(s[1]) < 1e-3) { s[0] = 0; s[1] = 0; }
    }
    return k;
  }

  snap() {
    this.pos.copy(this.player.renderPos).add(new THREE.Vector3(0, C.height, 0));
    this.vel = [0, 0, 0];
    this.yaw = this.player.heading + ((this.player.travelSign ?? 1) < 0 ? Math.PI : 0);
    this.lookYaw = 0; this.lookPitch = 0; this.side = 0;
    this.airK = 0; this.preK = 0; this.airTotal = 0; this.turnRate = 0; this.prevVelYaw = null; this.armLift = 0; this.crashK = 0; this.sv = {}; this.landPt.set(0, 0, 0);
  }

  startIntro() {
    this.introFrom = { p: this.camera.position.clone(), q: this.camera.quaternion.clone(), fov: this.camera.fov };
    this.intro = 0;
    this.snap();
  }

  update(dt) {
    this.t += dt;
    this.trauma = Math.max(0, this.trauma - C.traumaDecay * dt);
    this.snapT = Math.max(0, this.snapT - dt);
    if (game.mode === Mode.MENU) { this.flyover(dt); this.wasMenu = true; this.setNear(0.25); this.fpView?.reset(); this.fpWas = false; return; }
    if (this.wasMenu) { this.wasMenu = false; if (this.intro >= 1) this.snap(); }
    // First person (helmet cam). Crashes: the camera is knocked out of the head and follows the body
    // from a few metres back (FPView.crash), so the tumble stays readable.
    if (settings.view === 'fp' && this.rider && this.player.state === State.CRASH && this.intro >= 1 && this.fpWas) {
      this.fpView.crash(dt);
      return;
    }
    if (settings.view === 'fp' && this.rider && this.player.state !== State.CRASH && this.intro >= 1) {
      this.firstPerson(dt);
      this.fpWas = true;
      return;
    }
    if (this.fpWas) { this.fpWas = false; this.fpView?.reset(); this.snap(); }
    this.setNear(0.25);
    this.follow(dt);
    if (this.inspect) this.inspectView();
  }

  /**
   * Debug close-up for tuning the rider (not used in play): `cam.inspect = { yaw, dist, height }`
   * or `?cam=side|front|back|top|<yawDeg>`. Yaw in degrees around the rider, relative to the travel
   * direction (0 = behind, 90 = the rider's right side).
   */
  inspectView() {
    const s = this.player, o = this.inspect;
    const travel = s.heading + ((s.travelSign ?? 1) < 0 ? Math.PI : 0);
    const yaw = travel + THREE.MathUtils.degToRad(o.yaw ?? 90);
    const d = o.dist ?? 3.2, h = o.height ?? 0.9;
    const c = s.renderPos.clone().add(new THREE.Vector3(0, 0.75, 0));
    this.camera.position.set(c.x + Math.sin(yaw) * d, c.y + h, c.z + Math.cos(yaw) * d);
    this.camera.lookAt(c);
    this.camera.fov = o.fov ?? 40;
    this.setNear(0.05);
    this.camera.updateProjectionMatrix();
  }

  flyover(dt) {
    this.menuAngle += dt * 0.02;
    const p = this.summit.clone().add(new THREE.Vector3(Math.sin(this.menuAngle), 0, Math.cos(this.menuAngle)).multiplyScalar(this.menuRadius));
    p.y = Math.max(this.terrain.getHeight(p.x, p.z) + 220, this.summit.y - 650);
    this.camera.position.copy(p);
    this.camera.lookAt(this.summit.x, this.summit.y - 700, this.summit.z);
    this.fov += (55 - this.fov) * (1 - Math.exp(-2 * dt));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  follow(dt) {
    const s = this.player;
    const air = s.state === State.AIR, lift = s.state === State.LIFT, crash = s.state === State.CRASH;
    const k = (rate) => 1 - Math.exp(-rate * dt);
    // Big-mountain framing (CAMERA.heightAtSpeed / steepLift, 0 by default): higher at speed and on steep faces.
    const steep = Math.max(0, THREE.MathUtils.radToDeg(Math.acos(Math.min(1, s.groundNormal.y))) - 30) / 10;
    this.steep = (this.steep || 0) + (steep - (this.steep || 0)) * k(2);
    const target = s.renderPos.clone().add(new THREE.Vector3(0, C.height + s.speedRatio * C.heightAtSpeed + this.steep * C.steepLift, 0));
    // Lift: long chairs run at up to ~20 m/s (length / liftRideSeconds); a 0.35 s smoothing trailed 7 m behind the
    // set 7.5 m arm, so the chair was a speck 14-29 m away with the haul cable drawn straight through it.
    const sm = lift ? LIFT_SMOOTH : C.followSmooth;
    // The anchor follows the path (renderPos), never the rotating body: flips turn about the rider's centre of
    // mass (rider.js) and spins about the vertical, so the anchor stays on the flight line and the horizon level.
    this.pos.x = this.damp(this.pos.x, target.x, 0, sm, dt);
    this.pos.z = this.damp(this.pos.z, target.z, 2, sm, dt);
    // CAMERA.airFollowY: a tighter vertical follow in the air (long drops would leave the rider at the frame edge).
    this.pos.y = this.damp(this.pos.y, target.y, 1, air ? C.airFollowY ?? sm * 1.2 : sm * 1.8, dt);
    if (this.pos.distanceTo(target) > 40) this.snap();

    // ---- Air framing: where and when the rider comes down (ballistic, against the real terrain).
    //   big  0..1  how big this air is (predicted total air time): hops change nothing
    //   pre  0..1  the landing approach: 0 until CAMERA.landLead s before touchdown, 1 at landSettle s
    // Both are eased (airK, preK) so take-off and touchdown never snap the view.
    const L = air ? this.predictLanding(s) : null;
    if (air && L) this.airTotal = s.airTime + L.t;
    else if (!air) this.airTotal = 0;
    const big = air ? smoothstep(C.airFrameFrom, C.airFrameFull, this.airTotal) : 0;
    const pre = L ? 1 - smoothstep(C.landSettle, C.landLead, L.t) : 0;
    this.airK = this.spring('airK', air ? big : 0, air ? C.airIn : C.airOut, dt);
    this.preK = this.spring('preK', L ? pre * big : 0, L ? 9 : C.airOut, dt);
    if (L) { if (this.landPt.lengthSq() === 0) this.landPt.copy(L.p); else this.landPt.lerp(L.p, k(12)); }
    else if (this.preK < 0.001) this.landPt.set(0, 0, 0);

    const speed = s.speed;
    // Follow the direction of travel: the nose, or the tail when riding switch. During a slide /
    // hockey stop the gear turns ~90° across the path, so hold the current framing instead. In the air the
    // heading spins with the rider, so only the flight direction counts (held when there is hardly any).
    const travelYaw = s.heading + ((s.travelSign ?? 1) < 0 ? Math.PI : 0);
    const velYaw = Math.atan2(-s.velocity.x, -s.velocity.z), hSpeed = Math.hypot(s.velocity.x, s.velocity.z);
    const holding = (s.stop ?? 0) > 0.3 && s.state === State.GROUNDED;
    let wantYaw = holding ? this.yaw : travelYaw;
    if (air) wantYaw = hSpeed > 1 ? velYaw : this.yaw;
    // (hSpeed, not speed: on a lift ride speed is the cable speed and the velocity is zero, which used to pull the
    // yaw toward world north.)
    else if (hSpeed > 2.5 && !crash) wantYaw = lerpAngle(wantYaw, velYaw, clamp((hSpeed - 2.5) / 4, 0, 1));
    // Turn lag (HANDOFF #4): a plain exponential chase trails a steady carve by turnRate / yawRate (≈20° in a hard
    // turn). Lead the target by the smoothed turn rate and chase a little harder while turning: the camera stays a
    // few degrees behind the carve, and the low-passed rate keeps edge changes from twitching it.
    const vr = this.prevVelYaw == null || dt <= 0 ? 0 : angleDiff(this.prevVelYaw, velYaw) / dt;
    this.prevVelYaw = velYaw;
    const turning = s.state === State.GROUNDED && !holding && speed > 4;
    this.turnRate += ((turning ? clamp(vr, -2.5, 2.5) : 0) - this.turnRate) * k(C.turnRateSmooth);
    if (turning) wantYaw += this.turnRate * C.turnLead;
    // Big air chases the flight line gently; the ground rate comes back as the air framing eases out (no snap).
    const gRate = C.yawRate + C.yawRateTurn * Math.min(1, Math.abs(this.turnRate));
    const yawRate = gRate + (C.airYawRate - gRate) * clamp(this.airK, 0, 1);
    this.yaw = lerpAngle(this.yaw, wantYaw, k(yawRate));

    const look = this.input.takeLook();
    const pad = this.input.pad;
    if (Math.abs(look.x) + Math.abs(look.y) > 0) {
      const ks = settings.mouseSens * 0.0025;
      this.lookYaw -= look.x * ks;
      this.lookPitch = clamp(this.lookPitch - look.y * ks * 57.3, -35, 40);
      this.lookIdle = 0;
    }
    if (Math.abs(pad.rx) + Math.abs(pad.ry) > 0.1) {
      this.lookYaw -= pad.rx * 2.2 * settings.camSens * dt;
      this.lookPitch = clamp(this.lookPitch - pad.ry * 70 * settings.camSens * dt, -35, 40);
      this.lookIdle = 0;
    }
    this.lookIdle += dt;
    if (speed < 0.5 && s.state === State.GROUNDED) this.still += dt; else this.still = 0;
    const orbiting = this.still > 3;
    if (orbiting) this.orbit += dt * 0.15 * clamp(this.still - 3, 0, 1);
    else this.orbit = lerpAngle(this.orbit, 0, k(1.5));
    if (this.lookIdle > 2.0 && !orbiting) {
      this.lookYaw = lerpAngle(this.lookYaw, 0, k(1.6));
      this.lookPitch += -this.lookPitch * k(1.6);
    }

    // Big air: swing out to a three-quarter side angle (shows flips and spins together) and come most of the way
    // back behind for the landing approach, so the player reads the line and the slope (airSideLand of the swing
    // is left at touchdown, then it eases home at sideReturn).
    const above = s.position.y - this.terrain.getHeight(s.position.x, s.position.z);
    const sideBig = air ? smoothstep(C.airSideFrom, C.airSideFull, this.airTotal) : 0;
    if (sideBig > 0 && this.side < 0.05) this.sideSign = s.spinRate <= 0 ? 1 : -1;
    const sideWant = sideBig * (1 - this.preK * (1 - C.airSideLand));
    this.side = this.spring('side', sideWant, sideWant > this.side ? C.sideIn : C.sideReturn, dt);

    const r = s.speedRatio;
    const yawT = this.yaw + this.lookYaw + this.orbit + this.side * this.sideSign * THREE.MathUtils.degToRad(C.airSideDeg) + (lift ? LIFT_SIDE : 0);
    const back = new THREE.Vector3(Math.sin(yawT), 0, Math.cos(yawT));
    const n = s.groundNormal;
    const rise = -back.dot(new THREE.Vector3(n.x, 0, n.z)) / Math.max(n.y, 0.2);
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan(Math.max(rise, 0)));
    let wantPitch = C.pitch - r * 5 - slopeDeg * 0.75 * (1 - this.side) + this.lookPitch - this.steep * C.steepPitch;
    wantPitch = wantPitch * (1 - this.side) + (C.airSidePitch + this.lookPitch) * this.side;
    // The landing approach: a higher arm looks down onto the landing over the rider, steeper by the landing's
    // slope like on the snow (so a steep landing doesn't rise into the arm at the last moment).
    if (this.preK > 0.001) {
      const ln = this.terrain.getNormal(this.landPt.x, this.landPt.z, 2, _v);
      const lr = -(back.x * ln.x + back.z * ln.z) / Math.max(ln.y, 0.2);
      const landSlope = THREE.MathUtils.radToDeg(Math.atan(Math.max(lr, 0)));
      wantPitch += (C.landPitch - landSlope * 0.75 + this.lookPitch - wantPitch) * this.preK;
    }
    if (orbiting) wantPitch = -8 + this.lookPitch;
    if (lift) wantPitch = -12 + this.lookPitch;
    this.pitch += (wantPitch - this.pitch) * k(3);
    let wantDist = C.distance + r * C.distanceAtSpeed - s.tuck * 0.4 + this.airK * C.airPull;
    wantDist = wantDist * (1 - this.side) + (C.airSideDist + this.airK * C.airPull) * this.side;
    if (orbiting) wantDist = 6.5;
    if (lift) wantDist = 6.5;
    if (crash) wantDist = 7;
    this.dist += (wantDist - this.dist) * k(2);

    const pr = THREE.MathUtils.degToRad(-this.pitch);
    const dir = new THREE.Vector3(back.x * Math.cos(pr), Math.sin(pr), back.z * Math.cos(pr));
    // Terrain in the way of the arm. In the air (a landing slope or knuckle rising behind the rider) the arm tilts
    // up over it (armLift, m at the camera end: quick to rise, slow to settle) instead of collapsing toward the rider
    // in one frame; on the snow, and for anything lift can't clear, the arm shortens as before.
    const up = this.airK * C.airRise;
    let need = 0;
    if (this.airK > 0.01 || this.armLift > 0.01) {
      for (let i = 2; i <= 8; i++) {
        const f = i / 8, q = this.pos.clone().addScaledVector(dir, f * this.dist);
        need = Math.max(need, (this.terrain.getHeight(q.x, q.z) + C.armClear - q.y - up * f) / f);
      }
      need = Math.min(C.liftMax, need) * clamp(this.airK * 3, 0, 1);
    }
    this.armLift += (need - this.armLift) * k(need > this.armLift ? 10 : 1.5);
    let len = this.dist;
    for (let i = 1; i <= 8; i++) {
      const f = i / 8, t = f * this.dist;
      const q = this.pos.clone().addScaledVector(dir, t);
      if (q.y + (this.armLift + up) * f < this.terrain.getHeight(q.x, q.z) + 0.6) { len = Math.max(0.8, t - this.dist / 8); break; }
    }
    this.arm = len < this.arm ? len : this.arm + (len - this.arm) * k(3);
    const cp = this.pos.clone().addScaledVector(dir, this.arm);
    cp.y += (up + this.armLift) * (this.arm / Math.max(this.dist, 1e-3));
    cp.y = Math.max(cp.y, this.terrain.getHeight(cp.x, cp.z) + 0.7);
    this.camera.position.copy(cp);
    // Aim: just past the rider, a little low so the snow ahead shows; in big air on maps with airLook further down
    // toward the drop. On the landing approach the aim moves to a point between the rider and the predicted
    // landing (landLook), never so far that the rider leaves the middle landKeep of the frame.
    const aim = this.pos.clone().addScaledVector(dir, -4);
    aim.y += -0.4 + this.side * 0.3 - this.side * C.airLook * Math.min(18, Math.max(0, above)) * (1 - this.preK);
    if (this.preK > 0.001) {
      const rider = this.pos.clone();
      rider.y -= C.height * 0.5;
      const mid = rider.clone().lerp(_v.copy(this.landPt).setY(this.landPt.y + 0.5), C.landLook);
      aim.lerp(mid, this.preK);
      const toR = rider.sub(cp).normalize(), toA = aim.clone().sub(cp), dA = toA.length();
      toA.divideScalar(dA);
      const maxA = THREE.MathUtils.degToRad(this.camera.fov * 0.5 * C.landKeep), ang = toR.angleTo(toA);
      if (ang > maxA) aim.copy(cp).addScaledVector(toR.lerp(toA, maxA / ang).normalize(), dA);
    }
    // Crash: aim at the tumbling body. It slides fast down steep faces and the anchor's vertical smoothing left the
    // camera 3-4 m above it, aimed past it: on Blackspruce the body sat below the bottom edge for most of the crash.
    this.crashK = this.spring('crashK', crash ? 1 : 0, crash ? 4 : 3, dt);
    if (this.crashK > 0.001) aim.lerp(_v.copy(s.renderPos).setY(s.renderPos.y + 0.3), clamp(this.crashK, 0, 1) * 0.85);
    this.camera.lookAt(aim);
    // Carve tilt
    const wantRoll = -s.turnInput * r * THREE.MathUtils.degToRad(7) * (1 - this.side) * (s.state === State.GROUNDED ? 1 : 0);
    this.roll += (wantRoll - this.roll) * k(4);
    this.camera.rotateZ(this.roll);
    // Juice punches (kick()): landing dip, near-miss roll; the FoV part is added below.
    const kk = this.stepKicks(dt);
    if (kk) { if (kk.dip[0]) this.camera.translateY(-kk.dip[0]); if (kk.roll[0]) this.camera.rotateZ(THREE.MathUtils.degToRad(kk.roll[0])); }

    // Trauma shake: offset = noise · trauma²
    // Continuous speed shake on the snow (CAMERA.speedShake, 0 by default) on top of the trauma.
    const ss = s.state === State.GROUNDED ? C.speedShake * smoothstep(C.speedShakeFrom, 1, r) * (0.7 + 0.3 * noise1(this.t * 0.7, 5.5)) : 0;
    const tr2 = (this.trauma * this.trauma + ss * ss) * (settings.juiceShake ?? (this.reducedMotion ? 0.4 : 1));   // settings slider (juice/settings.js)
    if (tr2 > 1e-4) {
      const f = this.t * C.shakeFreq;
      const nx = noise1(f, 1.3), ny = noise1(f, 7.1), nz = noise1(f, 3.7);
      this.camera.translateX(nx * C.shakeOffset * tr2);
      this.camera.translateY(ny * C.shakeOffset * tr2);
      this.camera.rotateX(THREE.MathUtils.degToRad(noise1(f, 11.2) * C.shakeAngle * tr2));
      this.camera.rotateY(THREE.MathUtils.degToRad(noise1(f, 17.9) * C.shakeAngle * tr2));
      this.camera.rotateZ(THREE.MathUtils.degToRad(nz * C.shakeAngle * tr2));
    }

    // FoV elasticity: base + velocityRatio · bonus; sharp snap back when crashing / braking hard.
    // The lens opens in the top of the speed range (fovCurve > 1), kicks open entering the flow state.
    this.flowKick = Math.max(this.flowHold || 0, (this.flowKick || 0) * Math.exp(-1.6 * dt));
    let wantFov = C.baseFov + Math.pow(r, C.fovCurve) * C.maxFovBonus + this.flowKick * C.flowFov - (this.slow || 0) * 9;
    if (this.snapT > 0) wantFov = C.baseFov - 6;
    if (s.state === State.CRASH) wantFov = C.baseFov - 4;
    const rate = this.snapT > 0 || wantFov < this.fov ? C.fovSnapRate : C.fovRiseRate;
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-rate * dt));
    // Juice: punches (kick) and the combo build-up (juiceFov, eased; set by juice/index.js).
    this.juiceFovS = (this.juiceFovS || 0) + ((this.juiceFov || 0) - (this.juiceFovS || 0)) * (1 - Math.exp(-1.5 * dt));
    let fov = this.fov + this.airK * C.airFov - this.side * C.airSideFov + (kk ? kk.fov[0] : 0) + this.juiceFovS;

    if (this.intro < 1) {
      this.intro = Math.min(1, this.intro + dt / 2.8);
      const e = this.intro * this.intro * (3 - 2 * this.intro);
      const from = this.introFrom;
      const p = from.p.clone().lerp(this.camera.position, e);
      p.y += Math.sin(this.intro * Math.PI) * 40 * (1 - this.intro);
      this.camera.quaternion.copy(from.q.clone().slerp(this.camera.quaternion, e));
      this.camera.position.copy(p);
      fov = from.fov + (fov - from.fov) * e;
    }
    this.camera.fov = clamp(fov, 30, 110);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Critically damped spring toward `target` (state in this.sv[name]): starts and stops without the velocity
   * step of an exponential chase, so swinging out at take-off and home after touchdown never jerks.
   * `rate` is in the same units as the exponential rates (1/s): ω = 2 · rate.
   */
  spring(name, target, rate, dt) {
    const sv = this.sv[name] ||= [this[name] ?? target, 0];   // named after the field it drives
    if (dt <= 0) return sv[0];
    const w = 2 * rate, n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n;
    for (let i = 0; i < n; i++) { sv[1] += (w * w * (target - sv[0]) - 2 * w * sv[1]) * h; sv[0] += sv[1] * h; }
    return sv[0];
  }

  /**
   * Predicted touchdown: march the flight (gravity, air drag) against the real terrain. Returns { t (s), p }
   * (a reused object) or null if nothing within 4 s.
   */
  predictLanding(s) {
    const T = this.terrain, g = PHYSICS.gravity * (PHYSICS.airGravity ?? 1), kd = PHYSICS.airDrag ?? 0, h = 1 / 30;
    let x = s.position.x, y = s.position.y, z = s.position.z;
    let vx = s.velocity.x, vy = s.velocity.y, vz = s.velocity.z;
    let d0 = y - T.getHeight(x, z);
    for (let t = h; t <= 4; t += h) {
      const v = Math.hypot(vx, vy, vz), a = kd * v;
      vx -= vx * a * h; vz -= vz * a * h; vy -= (g + vy * a) * h;
      const px = x, py = y, pz = z;
      x += vx * h; y += vy * h; z += vz * h;
      const gy = T.getHeight(x, z), d1 = y - gy;
      if (d1 <= 0) {
        const f = d0 > 0 ? d0 / (d0 - d1) : 1;
        this._land.t = t - h + f * h;
        this._land.p.set(px + (x - px) * f, py + (y - py) * f, pz + (z - pz) * f);
        return this._land;
      }
      d0 = d1;
    }
    return null;
  }

  setNear(n) {
    if (this.camera.near !== n) { this.camera.near = n; this.camera.updateProjectionMatrix(); }
  }

  /** Helmet cam (first person): fpview.js. */
  firstPerson(dt) {
    if (!this.fpView) this.fpView = new FPView(this);
    this.fpView.update(dt);
  }

  damp(cur, target, axis, smooth, dt) {
    const omega = 2 / Math.max(smooth, 1e-4);
    const x = omega * dt;
    const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = cur - target;
    const temp = (this.vel[axis] + omega * change) * dt;
    this.vel[axis] = (this.vel[axis] - omega * temp) * e;
    return target + (change + temp) * e;
  }
}

/** Smooth 1D value noise in [−1, 1]. */
function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.0) * 12.9898) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
