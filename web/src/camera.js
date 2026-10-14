// CameraController — chase camera with:
//   • FoV elasticity: currentFoV = baseFoV + velocityRatio · maxFoVBonus, snapping back sharply on
//     crashes and hard braking to sell the deceleration
//   • trauma-based shake: offset = noise · trauma², trauma decays linearly
//   • speed pull-back, carve tilt, cinematic side swing on big air, terrain-aware arm, idle orbit,
//     mouse/stick look, and a slow Matterhorn flyover for the menu.
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
    this.snapT = 0;            // > 0 while the FoV snaps back (crash / hard brake)
    this.t = 0;
    this.summit = terrain.summit();
    const sp = terrain.getSpawn().position;
    const to = sp.clone().sub(this.summit);
    this.menuAngle = Math.atan2(to.x, to.z);
    this.menuRadius = clamp(Math.hypot(to.x, to.z) * 0.8, 1300, 2400);
    this.wasMenu = true;
    this.intro = 1;
    on('landed', ({ impact }) => this.addTrauma(Math.max(0, impact - 4) * C.landTrauma));
    on('crashed', () => { this.addTrauma(C.crashTrauma); this.snapT = 0.6; });
    on('hardBrake', () => { this.snapT = 0.35; this.addTrauma(0.12); });
    on('bump', (v) => this.addTrauma(Math.min(1, v * 0.06) * C.obstacleTrauma));
    on('stumble', () => this.addTrauma(0.25));
  }

  addTrauma(a) { this.trauma = clamp(this.trauma + a, 0, 1); }

  snap() {
    this.pos.copy(this.player.renderPos).add(new THREE.Vector3(0, C.height, 0));
    this.vel = [0, 0, 0];
    this.yaw = this.player.heading;
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
    if (game.mode === Mode.MENU) { this.flyover(dt); this.wasMenu = true; return; }
    if (this.wasMenu) { this.wasMenu = false; if (this.intro >= 1) this.snap(); }
    this.follow(dt);
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
    const target = s.renderPos.clone().add(new THREE.Vector3(0, C.height, 0));
    const lift = s.state === State.LIFT;
    const sm = lift ? 0.35 : C.followSmooth;
    this.pos.x = this.damp(this.pos.x, target.x, 0, sm, dt);
    this.pos.z = this.damp(this.pos.z, target.z, 2, sm, dt);
    this.pos.y = this.damp(this.pos.y, target.y, 1, sm * 1.8, dt);
    if (this.pos.distanceTo(target) > 40) this.snap();

    const speed = s.speed;
    const air = s.state === State.AIR;
    let wantYaw = s.heading;
    if (speed > 2.5 && s.state !== State.CRASH) {
      wantYaw = lerpAngle(s.heading, Math.atan2(-s.velocity.x, -s.velocity.z), clamp((speed - 2.5) / 4, 0, 1));
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
    let wantPitch = C.pitch - r * 5 - slopeDeg * 0.75 * (1 - this.side) + this.lookPitch;
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
    this.camera.lookAt(this.pos.clone().addScaledVector(dir, -4).add(new THREE.Vector3(0, -0.4 + this.side * 0.3, 0)));
    // Carve tilt
    const wantRoll = -s.turnInput * r * THREE.MathUtils.degToRad(7) * (1 - this.side) * (s.state === State.GROUNDED ? 1 : 0);
    this.roll += (wantRoll - this.roll) * (1 - Math.exp(-4 * dt));
    this.camera.rotateZ(this.roll);

    // Trauma shake: offset = noise · trauma²
    const tr2 = this.trauma * this.trauma;
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
    let wantFov = C.baseFov + r * C.maxFovBonus;
    if (this.snapT > 0) wantFov = C.baseFov - 6;
    if (s.state === State.CRASH) wantFov = C.baseFov - 4;
    const rate = this.snapT > 0 || wantFov < this.fov ? C.fovSnapRate : C.fovRiseRate;
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-rate * dt));
    let fov = this.fov - this.side * 6;

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
