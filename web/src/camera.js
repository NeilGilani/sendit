// Floaty chase camera: smooth-damped follow, lagged yaw toward travel, FOV that breathes with
// speed, terrain-aware arm (never clips), a calm orbit when standing still, mouse/stick look, and a
// slow flyover around the Matterhorn for the menu.
import * as THREE from 'three';
import { State } from './skier.js';
import { game, Mode, settings } from './state.js';
import { lerpAngle, clamp, smoothstep } from './world.js';

export class ChaseCamera {
  constructor(camera, skier, terrain, input) {
    Object.assign(this, { camera, skier, terrain, input });
    this.pos = new THREE.Vector3();
    this.vel = [0, 0, 0];
    this.yaw = 0; this.pitch = -16; this.lookYaw = 0; this.lookPitch = 0; this.lookIdle = 10;
    this.still = 0; this.orbit = 0; this.fov = 68; this.dist = 5.4;
    this.baseDistance = 5.4; this.height = 1.9; this.basePitch = -16;
    this.summit = terrain.summit();
    const sp = terrain.getSpawn().position;
    const to = sp.clone().sub(this.summit);
    this.menuAngle = Math.atan2(to.x, to.z);
    this.menuRadius = clamp(Math.hypot(to.x, to.z) * 0.8, 1300, 2400);
    this.wasMenu = true;
  }

  snap() {
    this.pos.copy(this.skier.renderPos).add(new THREE.Vector3(0, this.height, 0));
    this.vel = [0, 0, 0];
    this.yaw = this.skier.heading;
    this.lookYaw = 0; this.lookPitch = 0;
  }

  update(dt) {
    if (game.mode === Mode.MENU) { this.flyover(dt); this.wasMenu = true; return; }
    if (this.wasMenu) { this.wasMenu = false; this.snap(); }
    this.follow(dt);
  }

  flyover(dt) {
    this.menuAngle += dt * 0.018;
    const p = this.summit.clone().add(new THREE.Vector3(Math.sin(this.menuAngle), 0, Math.cos(this.menuAngle)).multiplyScalar(this.menuRadius));
    p.y = Math.max(this.terrain.getHeight(p.x, p.z) + 220, this.summit.y - 650);
    this.camera.position.copy(p);
    this.camera.lookAt(this.summit.x, this.summit.y - 700, this.summit.z);
    this.fov += (55 - this.fov) * (1 - Math.exp(-2 * dt));
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }

  follow(dt) {
    const s = this.skier;
    const target = s.renderPos.clone().add(new THREE.Vector3(0, this.height, 0));
    const lift = s.state === State.LIFT;
    const sh = lift ? 0.35 : 0.16;
    this.pos.x = this.damp(this.pos.x, target.x, 0, sh, dt);
    this.pos.z = this.damp(this.pos.z, target.z, 2, sh, dt);
    this.pos.y = this.damp(this.pos.y, target.y, 1, 0.28, dt);
    if (this.pos.distanceTo(target) > 40) this.snap();

    const speed = s.speed;
    let wantYaw = s.heading;
    if (speed > 2.5 && s.state !== State.CRASH) {
      wantYaw = lerpAngle(s.heading, Math.atan2(-s.velocity.x, -s.velocity.z), clamp((speed - 2.5) / 4, 0, 1));
    }
    this.yaw = lerpAngle(this.yaw, wantYaw, 1 - Math.exp(-(s.state === State.AIR ? 0.8 : 2.0) * dt));

    // Mouse / right-stick look, easing back after a while.
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
    if (orbiting) this.orbit += dt * 0.12 * clamp(this.still - 3, 0, 1);
    else this.orbit = lerpAngle(this.orbit, 0, 1 - Math.exp(-1.5 * dt));
    if (this.lookIdle > 2.5 && !orbiting) {
      this.lookYaw = lerpAngle(this.lookYaw, 0, 1 - Math.exp(-1.2 * dt));
      this.lookPitch += (0 - this.lookPitch) * (1 - Math.exp(-1.2 * dt));
    }

    const s01 = clamp(speed / 24, 0, 1);
    const yawT = this.yaw + this.lookYaw + this.orbit;
    const back = new THREE.Vector3(Math.sin(yawT), 0, Math.cos(yawT));
    const n = s.groundNormal;
    const rise = -back.dot(new THREE.Vector3(n.x, 0, n.z)) / Math.max(n.y, 0.2);
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan(Math.max(rise, 0)));
    let wantPitch = this.basePitch - s01 * 3 - slopeDeg * 0.75 + this.lookPitch;
    if (orbiting) wantPitch = -8 + this.lookPitch;
    if (lift) wantPitch = -9 + this.lookPitch;
    this.pitch += (wantPitch - this.pitch) * (1 - Math.exp(-2.5 * dt));
    let wantDist = this.baseDistance + s01 * 1.2 - s.tuck * 0.6;
    if (orbiting) wantDist = 6.5;
    if (lift) wantDist = 7.5;
    if (s.state === State.CRASH) wantDist = 6;
    this.dist += (wantDist - this.dist) * (1 - Math.exp(-1.5 * dt));

    // Arm direction, shortened if the snow gets in the way.
    const pr = THREE.MathUtils.degToRad(-this.pitch);
    const dir = new THREE.Vector3(back.x * Math.cos(pr), Math.sin(pr), back.z * Math.cos(pr));
    let len = this.dist;
    for (let i = 1; i <= 8; i++) {
      const t = (i / 8) * this.dist;
      const q = this.pos.clone().addScaledVector(dir, t);
      if (q.y < this.terrain.getHeight(q.x, q.z) + 0.6) { len = Math.max(0.8, t - this.dist / 8); break; }
    }
    this.arm = this.arm === undefined ? len : (len < this.arm ? len : this.arm + (len - this.arm) * (1 - Math.exp(-3 * dt)));
    const cp = this.pos.clone().addScaledVector(dir, this.arm);
    cp.y = Math.max(cp.y, this.terrain.getHeight(cp.x, cp.z) + 0.7);
    this.camera.position.copy(cp);
    const aimAt = this.pos.clone().addScaledVector(dir, -4).add(new THREE.Vector3(0, -0.4, 0));
    this.camera.lookAt(aimAt);
    const wantFov = 68 + (80 - 68) * smoothstep(0.25, 1, s01);
    this.fov += (wantFov - this.fov) * (1 - Math.exp(-1.2 * dt));
    this.camera.fov = this.fov;
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
