// CameraController — chase camera with:
//   • FoV elasticity: currentFoV = baseFoV + velocityRatio · maxFoVBonus, snapping back sharply on
//     crashes and hard braking to sell the deceleration
//   • trauma-based shake: offset = noise · trauma², trauma decays linearly
//   • speed pull-back, carve tilt, cinematic side swing on big air, terrain-aware arm, idle orbit,
//     mouse/stick look, and a slow flyover for the menu.
//   • first person helmet cam (settings.view === 'fp'): see firstPerson()
import * as THREE from 'three';
import { CAMERA as C } from './config.js';
import { State } from './player.js';
import { game, Mode, settings, on } from './state.js';
import { lerpAngle, clamp, smoothstep } from './world.js';

export class CameraController {
  constructor(camera, player, terrain, input) {
    Object.assign(this, { camera, player, terrain, input });
    this.pos = new THREE.Vector3();
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = C.pitch; this.lookYaw = 0; this.lookPitch = 0; this.lookIdle = 10;
    this.still = 0; this.orbit = 0; this.fov = C.baseFov; this.dist = C.distance; this.arm = C.distance;
    this.side = 0; this.sideSign = 1; this.roll = 0;
    this.trauma = 0;
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
    const camParam = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('cam') : null;
    if (typeof window !== 'undefined') window.__cam = this;   // debug handle (inspect view)
    if (camParam) this.inspect = { yaw: { side: 90, front: 180, back: 0, top: 0 }[camParam] ?? (Number(camParam) || 0), height: camParam === 'top' ? 3 : 0.9 };
    on('landed', ({ impact }) => this.addTrauma(Math.max(0, impact - 4) * C.landTrauma));
    on('crashed', () => { this.addTrauma(C.crashTrauma); this.snapT = 0.6; });
    on('hardBrake', () => { this.snapT = 0.35; this.addTrauma(0.12); });
    on('flowState', ({ on: st }) => { if (st) { this.flowKick = 1; this.addTrauma(0.25); } this.flowHold = st ? 0.5 : 0; });
    on('slowmo', ({ scale }) => { this.slow = 1 - scale; });   // apex slow motion: the lens tightens a touch
    on('bump', (v) => this.addTrauma(Math.min(1, v * 0.06) * C.obstacleTrauma));
    on('stumble', () => this.addTrauma(0.25));
    on('landed', ({ impact }) => { this.fpDipV = (this.fpDipV || 0) + Math.min(2.2, impact * 0.16); });
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
    if (game.mode === Mode.MENU) { this.flyover(dt); this.wasMenu = true; this.setNear(0.25); return; }
    if (this.wasMenu) { this.wasMenu = false; if (this.intro >= 1) this.snap(); }
    // First person (helmet cam) — crashes cut to the chase camera so the tumble stays readable.
    if (settings.view === 'fp' && this.rider && this.player.state !== State.CRASH && this.intro >= 1) {
      this.firstPerson(dt);
      this.fpWas = true;
      return;
    }
    if (this.fpWas) { this.fpWas = false; this.snap(); }
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
    // Big-mountain framing (CAMERA.heightAtSpeed / steepLift, 0 by default): higher at speed and on steep faces.
    const steep = Math.max(0, THREE.MathUtils.radToDeg(Math.acos(Math.min(1, s.groundNormal.y))) - 30) / 10;
    this.steep = (this.steep || 0) + (steep - (this.steep || 0)) * (1 - Math.exp(-2 * dt));
    const target = s.renderPos.clone().add(new THREE.Vector3(0, C.height + s.speedRatio * C.heightAtSpeed + this.steep * C.steepLift, 0));
    const lift = s.state === State.LIFT;
    const sm = lift ? 0.35 : C.followSmooth;
    this.pos.x = this.damp(this.pos.x, target.x, 0, sm, dt);
    this.pos.z = this.damp(this.pos.z, target.z, 2, sm, dt);
    // CAMERA.airFollowY: a tighter vertical follow in the air (long drops would leave the rider at the frame edge).
    this.pos.y = this.damp(this.pos.y, target.y, 1, s.state === State.AIR && C.airFollowY != null ? C.airFollowY : sm * 1.8, dt);
    if (this.pos.distanceTo(target) > 40) this.snap();

    const speed = s.speed;
    const air = s.state === State.AIR;
    // Follow the direction of travel: the nose, or the tail when riding switch. During a slide /
    // hockey stop the gear turns ~90° across the path, so hold the current framing instead.
    const travelYaw = s.heading + ((s.travelSign ?? 1) < 0 ? Math.PI : 0);
    let wantYaw = (s.stop ?? 0) > 0.3 && s.state === State.GROUNDED ? this.yaw : travelYaw;
    if (speed > 2.5 && s.state !== State.CRASH) {
      wantYaw = lerpAngle(wantYaw, Math.atan2(-s.velocity.x, -s.velocity.z), clamp((speed - 2.5) / 4, 0, 1));
    }
    this.yaw = lerpAngle(this.yaw, wantYaw, 1 - Math.exp(-(air ? 1.0 : 3.2) * dt));

    const look = this.input.takeLook();
    const pad = this.input.pad;
    if (Math.abs(look.x) + Math.abs(look.y) > 0) {
      const k = settings.mouseSens * 0.0025;
      this.lookYaw -= look.x * k;
      this.lookPitch = clamp(this.lookPitch - look.y * k * 57.3, -35, 40);
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
    else this.orbit = lerpAngle(this.orbit, 0, 1 - Math.exp(-1.5 * dt));
    if (this.lookIdle > 2.0 && !orbiting) {
      this.lookYaw = lerpAngle(this.lookYaw, 0, 1 - Math.exp(-1.6 * dt));
      this.lookPitch += -this.lookPitch * (1 - Math.exp(-1.6 * dt));
    }

    // Big air: swing to a cinematic side angle.
    const above = s.position.y - this.terrain.getHeight(s.position.x, s.position.z);
    const big = air && (above > 3 || s.airTime > 0.8);
    if (big && this.side < 0.05) this.sideSign = s.spinRate <= 0 ? 1 : -1;
    this.side += ((big ? 1 : 0) - this.side) * (1 - Math.exp(-(big ? 2.4 : 6) * dt));

    const r = s.speedRatio;
    const yawT = this.yaw + this.lookYaw + this.orbit + this.side * this.sideSign * THREE.MathUtils.degToRad(70);
    const back = new THREE.Vector3(Math.sin(yawT), 0, Math.cos(yawT));
    const n = s.groundNormal;
    const rise = -back.dot(new THREE.Vector3(n.x, 0, n.z)) / Math.max(n.y, 0.2);
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan(Math.max(rise, 0)));
    let wantPitch = C.pitch - r * 5 - slopeDeg * 0.75 * (1 - this.side) + this.lookPitch - this.steep * C.steepPitch;
    wantPitch = wantPitch * (1 - this.side) + (-4 + this.lookPitch) * this.side;
    if (orbiting) wantPitch = -8 + this.lookPitch;
    if (lift) wantPitch = -9 + this.lookPitch;
    this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-3 * dt));
    let wantDist = C.distance + r * C.distanceAtSpeed - s.tuck * 0.4;
    wantDist = wantDist * (1 - this.side) + 7.5 * this.side;
    if (orbiting) wantDist = 6.5;
    if (lift) wantDist = 7.5;
    if (s.state === State.CRASH) wantDist = 7;
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-2 * dt));

    const pr = THREE.MathUtils.degToRad(-this.pitch);
    const dir = new THREE.Vector3(back.x * Math.cos(pr), Math.sin(pr), back.z * Math.cos(pr));
    let len = this.dist;
    for (let i = 1; i <= 8; i++) {
      const t = (i / 8) * this.dist;
      const q = this.pos.clone().addScaledVector(dir, t);
      if (q.y < this.terrain.getHeight(q.x, q.z) + 0.6) { len = Math.max(0.8, t - this.dist / 8); break; }
    }
    this.arm = len < this.arm ? len : this.arm + (len - this.arm) * (1 - Math.exp(-3 * dt));
    const cp = this.pos.clone().addScaledVector(dir, this.arm);
    cp.y = Math.max(cp.y, this.terrain.getHeight(cp.x, cp.z) + 0.7);
    this.camera.position.copy(cp);
    this.camera.lookAt(this.pos.clone().addScaledVector(dir, -4).add(new THREE.Vector3(0, -0.4 + this.side * 0.3 - this.side * C.airLook * Math.min(18, Math.max(0, above)), 0)));
    // Carve tilt
    const wantRoll = -s.turnInput * r * THREE.MathUtils.degToRad(7) * (1 - this.side) * (s.state === State.GROUNDED ? 1 : 0);
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-4 * dt));
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
    let fov = this.fov - this.side * 6 + (kk ? kk.fov[0] : 0) + this.juiceFovS;

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
    void smoothstep;
  }

  setNear(n) {
    if (this.camera.near !== n) { this.camera.near = n; this.camera.updateProjectionMatrix(); }
  }

  /**
   * Helmet cam: eyes just in front of the rider's head bone (so crouch, carve lean, chatter and
   * landing squash all move the view), looking down the fall line and into the turn, leaning with
   * the carve, gloves / poles / ski tips in the bottom of the frame, wide FoV that opens with speed.
   */
  firstPerson(dt) {
    const s = this.player, rp = this.rider.p;
    const k = (r) => 1 - Math.exp(-r * dt);
    const ground = s.state === State.GROUNDED, air = s.state === State.AIR, lift = s.state === State.LIFT;
    const r = s.speedRatio;
    this.setNear(0.05);
    // Eye position from the head bone.
    const head = this.rider.bones?.Head;
    const eye = new THREE.Vector3();
    if (head) head.getWorldPosition(eye); else eye.copy(s.renderPos).add(new THREE.Vector3(0, 1.55, 0));
    const fwd = new THREE.Vector3(-Math.sin(s.heading), 0, -Math.cos(s.heading));
    eye.addScaledVector(fwd, 0.14).add(new THREE.Vector3(0, 0.05, 0));
    // Landing dip: a damped spring kicked by the impact.
    this.fpDipV = (this.fpDipV || 0) - (this.fpDip || 0) * 160 * dt - (this.fpDipV || 0) * 14 * dt;
    this.fpDip = (this.fpDip || 0) + this.fpDipV * dt;
    eye.y -= this.fpDip;
    // Snow chatter: fine vertical buzz that grows with speed on the ground.
    const t = this.t;
    const chat = ground ? (0.004 + r * r * 0.014) : 0.001;
    eye.y += (noise1(t * 26, 2.1) * 0.7 + noise1(t * 53, 4.4) * 0.3) * chat;
    // Look: down the travel direction, leading into the turn, plus mouse / right-stick look.
    const look = this.input.takeLook();
    const pad = this.input.pad;
    this.lookYaw = (this.lookYaw || 0) - look.x * settings.mouseSens * 0.0025 - pad.rx * 2.2 * settings.camSens * dt;
    this.lookPitch = clamp((this.lookPitch || 0) - look.y * settings.mouseSens * 0.0025 * 57.3 - pad.ry * 70 * settings.camSens * dt, -50, 45);
    if (Math.abs(look.x) + Math.abs(look.y) + Math.abs(pad.rx) + Math.abs(pad.ry) > 0.05) this.lookIdle = 0;
    this.lookIdle = (this.lookIdle || 0) + dt;
    if (this.lookIdle > 1.2) {
      this.lookYaw = lerpAngle(this.lookYaw, 0, k(2.5));
      this.lookPitch += -this.lookPitch * k(2.5);
    }
    let travel = s.heading;
    const sp = s.velocity.length();
    if (sp > 2) travel = lerpAngle(s.heading, Math.atan2(-s.velocity.x, -s.velocity.z), clamp((sp - 2) / 6, 0, 1) * 0.5);
    const wantYaw = travel - s.turnInput * 0.22 * (0.4 + r) + this.lookYaw;
    this.fpYaw = this.fpYaw === undefined ? wantYaw : lerpAngle(this.fpYaw, wantYaw, k(air ? 3 : 7));
    const n = s.groundNormal;
    const drop = (fwd.x * n.x + fwd.z * n.z) / Math.max(n.y, 0.2);   // > 0 facing downhill
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan(Math.max(drop, 0)));
    // Look down the fall line far enough that the ski tips sit in the bottom of the frame.
    let wantPitch = -21 - slopeDeg * 0.55 + r * 3 - rp.tuck * 3 + this.lookPitch;
    if (air) wantPitch = clamp(THREE.MathUtils.radToDeg(Math.atan2(s.velocity.y, Math.max(sp, 1))) * 0.6 - 18, -55, -5) + this.lookPitch;
    if (lift) wantPitch = -6 + this.lookPitch;
    this.fpPitch = this.fpPitch === undefined ? wantPitch : this.fpPitch + (wantPitch - this.fpPitch) * k(air ? 2.5 : 6);
    // Roll: lean with the carve (a share of the body's edge roll) + a touch of chatter.
    const wantRoll = (rp.roll || 0) * 0.55 + noise1(t * 31, 9.3) * chat * 0.6;
    this.fpRoll = (this.fpRoll || 0) + (wantRoll - (this.fpRoll || 0)) * k(8);
    this.camera.position.copy(eye);
    this.camera.quaternion.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(this.fpPitch - this.fpDip * 40), this.fpYaw, this.fpRoll, 'YXZ'));
    // Shake (trauma), a little gentler than the chase cam.
    const tr2 = this.trauma * this.trauma;
    if (tr2 > 1e-4) {
      const f = this.t * C.shakeFreq;
      this.camera.rotateX(THREE.MathUtils.degToRad(noise1(f, 11.2) * C.shakeAngle * 0.7 * tr2));
      this.camera.rotateY(THREE.MathUtils.degToRad(noise1(f, 17.9) * C.shakeAngle * 0.7 * tr2));
      this.camera.rotateZ(THREE.MathUtils.degToRad(noise1(f, 3.7) * C.shakeAngle * 0.7 * tr2));
    }
    // Wide lens that opens with speed; snaps in on hard stops.
    let wantFov = C.fpFov + r * C.fpFovBonus;
    if (this.snapT > 0) wantFov = C.fpFov - 5;
    this.fov += (wantFov - this.fov) * k(this.snapT > 0 || wantFov < this.fov ? C.fovSnapRate : C.fovRiseRate);
    this.camera.fov = clamp(this.fov, 50, 115);
    this.camera.updateProjectionMatrix();
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
