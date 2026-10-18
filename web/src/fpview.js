// First person (helmet cam). The camera is the rider's eyes: it sits in front of the head bone (so crouch,
// carve lean, chatter, landing squash and every trick move it) and in the air it turns WITH the body —
// pitch through flips, yaw through spins, roll through corks — so the horizon and the slope swing
// through the view the way they do in helmet-cam footage. The head leads the rotation a little (riders
// spot ahead), the lens opens and the goggle frame darkens with the rotation rate, and the view settles
// back onto the run on landing. See docs/first-person.md (tunables: FP below).
//
// Used by camera.js (CameraController.firstPerson → FPView.update) and rider.js (first-person arm,
// pole and shadow helpers below).
import * as THREE from 'three';
import { CAMERA as C } from './config.js';
import { State } from './player.js';
import { settings } from './state.js';
import { lerpAngle, clamp } from './world.js';

export const FP = {
  // Eye: from the head bone (base of the skull), in the view frame: up / forward, metres.
  eyeUp: 0.1, eyeFwd: 0.11,
  eyeFwdBoard: 0.17,          // snowboard: the view runs past the front shoulder, so the eye sits further out
  near: 0.05,
  // Lens: CAMERA.fpFov / fpFovBonus / fpSpinFov in config.js.
  // Ground look: pitch (deg, − = down), extra per degree of slope, per unit speed ratio, in a tuck.
  pitch: -19, slopePitch: 0.55, speedPitch: 4, tuckPitch: 5, lookIntoTurn: 0.2,
  travelWeight: 0.8,          // yaw toward the velocity (vs the gear's travel axis) once moving
  carveRoll: 0.45,            // share of the body's lean that tilts the horizon in a carve
  yawRate: 7, pitchRate: 6, rollRate: 7,
  // Air: the head leads the body's rotation by leadTime s of it (max maxLead rad); landings blend back
  // to the ground look at landBlend 1/s. stableShare: pitch / roll share kept when stabilised (settings.fpStable).
  leadTime: 0.07, maxLead: 0.45, landBlend: 6, stableShare: 0.3,
  dipKick: 0.16, dipMax: 2.2, dipSpring: 160, dipDamp: 14, dipPitch: 40,
  lookMin: -60, lookMax: 45, pitchMin: -54,   // look limits (deg): input, and the total on the snow
};

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
const RY_PI = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI);
const deg = THREE.MathUtils.degToRad;

/** World frame of the rider's head, camera-style (−Z = where the face points, +Y = up out of the skull). */
export function headFrame(rider, out = new THREE.Quaternion(), pos) {
  const head = rider.bones.Head;
  head.matrixWorld.decompose(_v2, out, _s);
  if (pos) pos.copy(_v2);
  if (!rider._restHeadQInv) rider._restHeadQInv = new THREE.Quaternion().setFromRotationMatrix(rider.restGlobal.get(head)).invert();
  return out.multiply(rider._restHeadQInv).multiply(RY_PI);
}

/** Swing-twist: split q into a rotation about `axis` (twist) and the rest (swing = q · twist⁻¹). */
function twistAbout(q, axis, out) {
  const d = q.x * axis.x + q.y * axis.y + q.z * axis.z;
  out.set(axis.x * d, axis.y * d, axis.z * d, q.w);
  const l = out.length();
  return l < 1e-6 ? out.identity() : out.multiplyScalar(1 / l);
}

export class FPView {
  constructor(ctrl) {
    this.c = ctrl;                         // the CameraController (camera, player, rider, input, trauma…)
    this.q = new THREE.Quaternion();       // camera orientation before shake
    this.qGround = new THREE.Quaternion();
    this.qAir = new THREE.Quaternion();
    this.hLook = new THREE.Quaternion();   // body → look offset captured at take-off
    this.B0 = new THREE.Quaternion();      // body orientation at take-off
    this.prevBody = new THREE.Quaternion();
    this.omega = new THREE.Vector3();      // smoothed body angular velocity (world, rad/s)
    this.eye = new THREE.Vector3();
    this.wAir = 0; this.wasAir = false; this.active = false;
    this.yaw = 0; this.pitch = FP.pitch; this.roll = 0; this.airAdj = 0;
    this.lookYaw = 0; this.lookPitch = 0; this.lookIdle = 10;
    this.dip = 0; this.dipV = 0; this.fov = C.fpFov; this.rot = 0;
  }

  /** Landing compression kick (camera.js forwards the 'landed' event). */
  kick(impact) { this.dipV += Math.min(FP.dipMax, impact * FP.dipKick); }

  /** Next update starts fresh (after the chase camera, a respawn or a menu). */
  reset() { this.active = false; if (this.c.rider?.fpCam) this.c.rider.fpCam.ok = false; }

  update(dt) {
    const ctl = this.c, cam = ctl.camera, s = ctl.player, rider = ctl.rider, rp = rider.p;
    const k = (r) => 1 - Math.exp(-r * dt);
    const st = s.state, air = st === State.AIR, lift = st === State.LIFT;
    const ground = st === State.GROUNDED || st === State.GRIND;
    const r = s.speedRatio, t = ctl.t;
    if (cam.near !== FP.near) { cam.near = FP.near; cam.updateProjectionMatrix(); }

    // --- input look (mouse / right stick), springs back when idle
    const look = ctl.input.takeLook(), pad = ctl.input.pad;
    this.lookYaw -= look.x * settings.mouseSens * 0.0025 + pad.rx * 2.2 * settings.camSens * dt;
    this.lookPitch = clamp(this.lookPitch - look.y * settings.mouseSens * 0.0025 * 57.3 - pad.ry * 70 * settings.camSens * dt, FP.lookMin, FP.lookMax);
    if (Math.abs(look.x) + Math.abs(look.y) + Math.abs(pad.rx) + Math.abs(pad.ry) > 0.05) this.lookIdle = 0;
    this.lookIdle += dt;
    if (this.lookIdle > 1.2) { this.lookYaw = lerpAngle(this.lookYaw, 0, k(2.5)); this.lookPitch -= this.lookPitch * k(2.5); }
    // Debug / scripted look (fpshots): cam.lookYaw / lookPitch on the controller override.
    if (ctl.fpLook) { this.lookYaw = ctl.fpLook.yaw || 0; this.lookPitch = ctl.fpLook.pitch || 0; }

    // --- ground look: down the direction of travel, into the turn, leaning with the carve
    const sp = Math.hypot(s.velocity.x, s.velocity.z);
    // Riding switch: look back down the path (over the shoulder), but not when just creeping backward.
    let travel = s.heading + ((s.travelSign ?? 1) < 0 && sp > 1.5 ? Math.PI : 0);
    if (lift) travel = s.heading;
    else if (sp > 2) travel = lerpAngle(travel, Math.atan2(-s.velocity.x, -s.velocity.z), clamp((sp - 2) / 6, 0, 1) * (FP.travelWeight + (1 - FP.travelWeight) * (s.stop || 0)));
    const wantYaw = travel - (ground ? (s.turnInput || 0) * FP.lookIntoTurn * (0.4 + r) : 0) + this.lookYaw;
    const n = s.groundNormal;
    const fx = -Math.sin(travel), fz = -Math.cos(travel);
    const drop = (fx * n.x + fz * n.z) / Math.max(n.y, 0.2);   // > 0 facing downhill
    const slopeDeg = THREE.MathUtils.radToDeg(Math.atan(Math.max(drop, 0)));
    let wantPitch = FP.pitch - slopeDeg * FP.slopePitch + r * FP.speedPitch + (rp.tuck || 0) * FP.tuckPitch + this.lookPitch;
    wantPitch = Math.max(wantPitch, FP.pitchMin);
    if (lift) wantPitch = -6 + this.lookPitch;
    if (air) wantPitch = FP.pitch - 6 + this.lookPitch;      // ready for the landing
    if (!this.active) { this.yaw = wantYaw; this.pitch = wantPitch; this.roll = 0; }
    this.yaw = lerpAngle(this.yaw, wantYaw, k(air ? 3 : FP.yawRate));
    this.pitch += (wantPitch - this.pitch) * k(FP.pitchRate);
    // Roll with the carve: the body's lean (visual roll −lean about the gear's forward axis).
    const wantRoll = ground ? -(rp.lean || 0) * FP.carveRoll : 0;
    this.roll += (wantRoll - this.roll) * k(FP.rollRate);

    // Landing compression: a damped spring kicked by the impact.
    this.dipV -= (this.dip * FP.dipSpring + this.dipV * FP.dipDamp) * dt;
    this.dip += this.dipV * dt;
    _e.set(deg(this.pitch - this.dip * FP.dipPitch), this.yaw, this.roll, 'YXZ');
    this.qGround.setFromEuler(_e);

    // --- body rotation (renderOrient carries spins in its yaw and flips about the gear's +X)
    const body = s.renderOrient;
    if (!this.active) { this.prevBody.copy(body); this.omega.set(0, 0, 0); this.wAir = 0; this.wasAir = false; }
    // Angular velocity: dq = body · prev⁻¹ → axis · angle / dt, low-passed.
    _q.copy(body).multiply(_q2.copy(this.prevBody).invert());
    if (_q.w < 0) _q.set(-_q.x, -_q.y, -_q.z, -_q.w);
    const ang = 2 * Math.acos(clamp(_q.w, -1, 1));
    if (dt > 1e-4) {
      const sn = Math.sqrt(Math.max(1e-12, 1 - _q.w * _q.w));
      _v.set(_q.x / sn, _q.y / sn, _q.z / sn).multiplyScalar(ang > 1e-5 ? ang / dt : 0);
      this.omega.lerp(_v, k(air ? 18 : 10));
    }
    this.prevBody.copy(body);

    // --- air: the view turns with the body
    if (air && (!this.wasAir || !this.active)) {
      this.B0.copy(body);
      // Look offset relative to the body: the current view (continuous at the lip), or — entering first
      // person mid-air — a look down the travel direction with the body upright.
      const from = this.active ? this.q : _q3.setFromEuler(_e.set(deg(FP.pitch), (s.travelSign ?? 1) < 0 ? Math.PI : 0, 0, 'YXZ'));
      if (this.active) this.hLook.copy(body).invert().multiply(from); else this.hLook.copy(from);
      this.pitch0 = this.pitch; this.airAdj = 0;
    }
    this.wasAir = air;
    if (air) this.wAir = 1; else this.wAir *= Math.exp(-FP.landBlend * dt);
    this.rot = this.omega.length();
    if (this.wAir > 1e-3) {
      // Comfort option: keep the spin (yaw) but only a share of the flip / cork pitch and roll.
      const rel = _q.copy(body).multiply(_q2.copy(this.B0).invert());
      if (settings.fpStable) {
        const tw = twistAbout(rel, Y, _q2);                       // rel = swing · twist
        const swing = _q3.copy(tw).invert().premultiply(rel);
        rel.identity().slerp(swing, FP.stableShare).multiply(tw);
      }
      // Straight airs (no flip): tilt the view with the flight, toward the landing as the rider drops.
      const fw = 1 - THREE.MathUtils.smoothstep(Math.abs(Math.atan2(Math.sin(s.flip || 0), Math.cos(s.flip || 0))), 0.2, 0.8);
      if (air) {
        const want = clamp(THREE.MathUtils.radToDeg(Math.atan2(s.velocity.y, Math.max(sp, 1))) * 0.6 - 18, -55, -5) - (FP.pitch - 2);
        this.airAdj += (want * fw - this.airAdj) * k(2.5);
      }
      // The head leads the rotation (spotting): a short look-ahead about the angular velocity.
      const lead = Math.min(FP.maxLead, this.rot * FP.leadTime);
      _q2.identity();
      if (lead > 1e-3) _q2.setFromAxisAngle(_v.copy(this.omega).normalize(), lead);
      this.qAir.copy(_q2).multiply(rel).multiply(this.B0).multiply(this.hLook).multiply(_q3.setFromAxisAngle(X, deg(this.airAdj)));
      this.q.copy(this.qGround).slerp(this.qAir, this.wAir);
    } else this.q.copy(this.qGround);

    // --- eye: in front of the head bone along the view (the head turns about the neck with the look,
    // so looking down puts the eyes out over the chest, looking aside never puts them in a shoulder)
    rider.bones.Head.getWorldPosition(this.eye);
    this.eye.add(_v.set(0, FP.eyeUp, -(rider.isBoard ? FP.eyeFwdBoard : FP.eyeFwd)).applyQuaternion(this.q));
    // Snow chatter: a fine vertical buzz that grows with speed on the ground.
    const chat = ground ? (0.003 + r * r * 0.012) : 0.0008;
    this.eye.y += (noise1(t * 26, 2.1) * 0.7 + noise1(t * 53, 4.4) * 0.3) * chat;
    this.eye.y -= this.dip * 0.5;
    cam.position.copy(this.eye);
    cam.quaternion.copy(this.q);
    if (ground) cam.rotateZ(noise1(t * 31, 9.3) * chat * 0.6);

    // Trauma shake, gentler than the chase camera's; scaled by the screen-shake setting like the chase cam.
    const tr2 = ctl.trauma * ctl.trauma * (settings.juiceShake ?? (ctl.reducedMotion ? 0.4 : 1));
    if (tr2 > 1e-4) {
      const f = t * C.shakeFreq;
      cam.rotateX(deg(noise1(f, 11.2) * C.shakeAngle * 0.7 * tr2));
      cam.rotateY(deg(noise1(f, 17.9) * C.shakeAngle * 0.7 * tr2));
      cam.rotateZ(deg(noise1(f, 3.7) * C.shakeAngle * 0.7 * tr2));
    }

    // Lens: wide, opening with speed and with the rotation rate; snaps in on hard stops.
    let wantFov = C.fpFov + r * C.fpFovBonus + Math.min(1, this.rot / (Math.PI * 2)) * C.fpSpinFov;
    if (ctl.snapT > 0) wantFov = C.fpFov - 5;
    ctl.fov += (wantFov - ctl.fov) * k(ctl.snapT > 0 || wantFov < ctl.fov ? C.fovSnapRate : C.fovRiseRate * (this.rot > 1 ? 3 : 1));
    cam.fov = clamp(ctl.fov, 50, 115);
    cam.updateProjectionMatrix();
    // Goggle frame: a touch darker while rotating fast (speed readability, motion comfort).
    if (typeof document !== 'undefined') {
      const g = Math.min(1, this.rot / 9) * 0.5 + THREE.MathUtils.smoothstep(r, 0.6, 1) * 0.2;
      if (Math.abs(g - (this._g ?? -1)) > 0.01) { this._g = g; document.body.style.setProperty('--fp-rush', g.toFixed(2)); }
    }
    rider.fpLookPitch = THREE.MathUtils.radToDeg(_e.setFromQuaternion(this.q, 'YXZ').x);
    // The arms (rider.js → fpBoardArm) frame the gloves in this view next frame.
    const fc = rider.fpCam ||= { q: new THREE.Quaternion(), eye: new THREE.Vector3(), ok: false };
    fc.q.copy(this.q); fc.eye.copy(this.eye); fc.ok = true;
    this.active = true;
  }
}

// ------------------------------------------------------------------ arms, poles, shadow (rider.js)
// Armature space: +X = the rider's left, +Y up, +Z forward. Hand targets are relative to the eye so
// they frame the same way whatever the crouch: gloves in the bottom corners at arm's length (never a
// giant mitt in the lens), pole shafts angled out past the gloves so they never hide behind the forearms.
export const FP_ARMS = {
  ski: { x: 0.27, y: -0.37, z: 0.33 },    // glove relative to the eye (x outward)
  skiSpeed: { x: -0.02, y: 0.03, z: 0.08 },
  skiTuck: { x: 0.12, y: -0.4, z: 0.3 },
  plantReach: 0.14, turnReach: 0.06,
  minEye: 0.46,                             // gloves never closer to the eye than this (m)
  protract: 0.42, shrug: 0.0,               // shoulder blades forward (rad about Y) / up
  handScale: 0.86,                          // viewmodel glove scale
  elbow: [0.75, -0.55, -0.35],              // elbow pole (x outward)
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _hq = new THREE.Quaternion(), _hq2 = new THREE.Quaternion();
const posOf = (m, out) => out.setFromMatrixPosition(m);

/** Eye position in armature space: the head bone + the camera's eye offset for a look ~25° down the run. */
export function eyeArmature(rider, out = new THREE.Vector3()) {
  posOf(rider.g(rider.bones.Head), out);
  return out.add(_a.set(0, FP.eyeUp * 0.9 + FP.eyeFwd * 0.42, FP.eyeFwd * 0.9 - FP.eyeUp * 0.42));
}

/** First person: shoulder blades drawn forward (protraction) so the gloves reach into view. */
export function fpProtract(rider, side) {
  const c = rider.bones['clavicle' + (side > 0 ? '_l' : '_r')];
  const amt = rider.fpProt?.[side > 0 ? 0 : 1] ?? FP_ARMS.protract;   // per-arm override (fpBoardArm)
  const drop = rider.fpDrop?.[side > 0 ? 0 : 1] ?? 0;                  // shoulder lowered (rad, fpBoardArm)
  if (drop) rider.rotateGlobal(c, _hq.setFromAxisAngle(Z, -side * drop));
  rider.rotateGlobal(c, _hq.setFromAxisAngle(Y, -side * amt).multiply(_hq2.setFromAxisAngle(X, -FP_ARMS.shrug)));
}

/** First person: smaller gloves (viewmodel scale) turned into a pole grip / board-balance hand. */
export function fpHand(rider, side, grip) {
  const h = rider.bones['hand' + (side > 0 ? '_l' : '_r')];
  if (grip) rider.rotateGlobal(h, _hq.setFromAxisAngle(Z, side * 1.35).multiply(_hq2.setFromAxisAngle(X, 0.5)));
  h.scale.multiplyScalar(FP_ARMS.handScale);
}

/** Two-bone arm IK: shoulder → `hand` (armature space), elbow toward `pole`. Returns [upper dir, lower dir]. */
export function armIK(rider, side, hand, pole) {
  const B = rider.bones, s = side > 0 ? '_l' : '_r';
  const upper = B['upperarm' + s], lower = B['lowerarm' + s], handB = B['hand' + s];
  rider.inherit(B['clavicle' + s]); fpProtract(rider, side); rider.inherit(upper);
  const S = posOf(rider.g(upper), _b);
  const l1 = rider.restLocal.get(lower).p.length(), l2 = rider.restLocal.get(handB).p.length();
  const to = _c.copy(hand).sub(S);
  const d = clamp(to.length(), 0.05, l1 + l2 - 0.003);
  const dir = to.normalize();
  const pl = _d.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const axis = _a.crossVectors(dir, pl).normalize();
  const u = dir.clone().applyAxisAngle(axis, -Math.acos(cosA));
  // Pick the solution that bends toward the pole.
  if (u.dot(pl) < 0) u.copy(dir).applyAxisAngle(axis, Math.acos(cosA));
  const elbow = S.clone().addScaledVector(u, l1);
  const l = S.clone().addScaledVector(dir, d).sub(elbow);   // out of reach: the arm straight toward it
  return [u, l];
}

/** Hand position (armature space) the third-person arm directions u, l would reach. */
function handFrom(rider, side, u, l) {
  const B = rider.bones, s = side > 0 ? '_l' : '_r';
  rider.inherit(B['clavicle' + s]); fpProtract(rider, side); rider.inherit(B['upperarm' + s]);
  const S = posOf(rider.g(B['upperarm' + s]), new THREE.Vector3());
  return S.addScaledVector(u.clone().normalize(), rider.restLocal.get(B['lowerarm' + s]).p.length())
    .addScaledVector(l.clone().normalize(), rider.restLocal.get(B['hand' + s]).p.length());
}

/** Keep a glove at least `min` m from the eye and below it (no mitt filling the lens, no near-plane clip). */
function keepOffEye(hand, eye, min) {
  const v = _a.copy(hand).sub(eye);
  if (v.y > -0.18) { hand.y = eye.y - 0.18; v.y = -0.18; }
  const dl = v.length();
  if (dl < min) hand.copy(eye).addScaledVector(v.normalize(), min);
  return hand;
}

/**
 * First-person ski arm: on the snow the gloves frame the bottom corners (reaching on pole plants and
 * into the turn, low and forward in a tuck, a double-pole push cycle); in the air, on rails, stumbling
 * or crashing the third-person arm (u, l) is kept, held off the lens. Returns new [u, l] for armAim.
 */
export function fpSkiArm(rider, side, pl, u, l) {
  const p = rider.p, A = FP_ARMS;
  rider.fpProt = null; rider.fpDrop = null;
  const eye = eyeArmature(rider, new THREE.Vector3());
  const tp = handFrom(rider, side, u, l);
  const r = pl.speedRatio || 0;
  const plant = p.plant[side > 0 ? 0 : 1];
  // Plant envelope: a quick reach forward, then the hand rides past the planted pole.
  const ph = 1 - plant, env = plant > 0 ? (ph < 0.3 ? ph / 0.3 : 1 - (ph - 0.3) / 0.7) : 0;
  const reach = Math.max(0, (pl.turnInput || 0) * -side) * A.turnReach;   // inside hand leads the turn
  const sway = Math.sin(p.t * 1.3 + side) * 0.012;
  const fp = new THREE.Vector3(
    side * (A.ski.x + A.skiSpeed.x * r),
    A.ski.y + A.skiSpeed.y * r + env * 0.06 + sway,
    A.ski.z + A.skiSpeed.z * r + env * A.plantReach + reach,
  );
  // Tuck: gloves together in front of the chin, poles under the arms.
  fp.lerp(_b.set(side * A.skiTuck.x, A.skiTuck.y, A.skiTuck.z), p.tuck || 0);
  // Double-pole push: reach forward and up, plant, drive the hands back down past the hips.
  const pu = p.push || 0;
  if (pu > 0.01) {
    const q = p.pushPhase || 0, f = q < 0.4 ? q / 0.4 : 1 - (q - 0.4) / 0.6;
    fp.lerp(_b.set(side * 0.27, -0.85 + f * 0.33, 0.05 + f * 0.47), pu);
  }
  // Looking down: the gloves part so the knees and skis show between them.
  const ld = THREE.MathUtils.smoothstep(-(rider.fpLookPitch ?? -20), 30, 55);
  fp.x += side * 0.16 * ld; fp.y -= 0.05 * ld;
  // Hockey stop / plough: hands forward and a little wider for balance.
  fp.x += side * 0.06 * Math.max(p.stop || 0, p.plow || 0); fp.z += 0.05 * (p.stop || 0);
  fp.add(eye);
  const w = (1 - (p.air || 0)) * (1 - (p.stumble || 0)) * (1 - (p.crash || 0)) * (1 - (p.grind || 0)) * (1 - (p.sit || 0)) * (1 - (p.grab || 0));
  const hand = tp.lerp(fp, w);
  if ((p.sit || 0) < 0.5 && (p.crash || 0) < 0.5) keepOffEye(hand, eye, A.minEye);
  return armIK(rider, side, hand, _c.set(side * A.elbow[0], A.elbow[1], A.elbow[2]).normalize().clone());
}

// Snowboard: the camera looks down the nose (sideways to the chest), so view-frame targets are turned
// into armature space through the helmet cam's orientation relative to the armature (last frame's
// camera and armature; their relative turn changes slowly, even mid-flip, so the lag doesn't show).
// Glove targets: x = toward the arm's own shoulder side of the view (the nose-side shoulder sits ahead
// on the heel side once the shoulders open, the rear one behind on the toe side, so the arms never
// cross the lens), y = up, z = forward along the view, metres from the eye.
export const FP_BOARD = {
  ride: { x: 0.33, y: -0.26, z: 0.46 },    // balance hands just inside the lower frame edges
  rearReach: 0.1,                           // the rear (behind-the-eye) glove sits a little closer
  rearProtract: 0.45,                       // extra shoulder-blade reach (rad) for the rear arm
  frontDrop: 0.35,                          // nose-side shoulder lowered (rad) so it never fills the lower view
  twist: 0.28,                              // extra shoulder opening toward the nose (rad, rider.js poseBoard)
  speed: { x: 0.02, y: 0.02, z: 0.05 },     // at top speed: a touch wider and further forward
  crouch: -0.07,                            // lower with the crouch / tuck
  toe: { x: 0.05, y: -0.08 },               // toe-side carve: the toe-side hand drops toward the snow
  heel: { y: 0.04, z: 0.06 },               // heel-side carve: both hands reach forward against the sit
  air: { x: 0.07, y: 0.07 },                // in the air: a little wider and higher (balance)
  spinIn: { x: -0.09, y: -0.06 },           // spin wrap (arms in across the chest) / flung wide (−)
  flipTuck: { x: -0.08, y: -0.16, z: 0.04 },// flip tuck: hands down toward the shins
  grind: { x: 0.08, y: 0.05 },
  minEye: 0.44,
};

const _bq = new THREE.Quaternion(), _bq2 = new THREE.Quaternion(), _bm = new THREE.Matrix4();
const _bx = new THREE.Vector3(), _by = new THREE.Vector3(), _bz = new THREE.Vector3(), _be = new THREE.Vector3();

/**
 * Helmet-cam frame in armature space (from last frame's camera, FPView sets rider.fpCam): fills
 * right / up / forward unit vectors and the eye position. Returns false before the first FP frame.
 */
function viewArmature(rider, right, up, fwd, eye) {
  const fc = rider.fpCam, arm = rider.armature;
  if (!fc?.ok || !arm) return false;
  arm.matrixWorld.decompose(_be, _bq, _bx);
  _bq2.copy(_bq).invert().multiply(fc.q);
  right.set(1, 0, 0).applyQuaternion(_bq2);
  up.set(0, 1, 0).applyQuaternion(_bq2);
  fwd.set(0, 0, -1).applyQuaternion(_bq2);
  eye.copy(fc.eye).applyMatrix4(_bm.copy(arm.matrixWorld).invert());
  return true;
}

/**
 * First-person snowboard arm: gloves balance at the lower frame edges (the nose-side glove on its side
 * of the view, the rear one on the other), dropping on toe-side carves, reaching forward on heel side,
 * wider in the air, in toward the shins in a flip tuck; grabs and hand drags reach for real (the
 * third-person arm), held off the lens. `front` = the nose-side arm. Returns new [u, l] for armAim.
 */
export function fpBoardArm(rider, side, front, pl, u, l) {
  const p = rider.p, A = FP_BOARD;
  const right = _bx, up = _by, fwd = _bz;
  const eye = new THREE.Vector3();
  if (!viewArmature(rider, right, up, fwd, eye)) return [u, l];
  const tp = handFrom(rider, side, u, l);
  // Which side of the view this arm's shoulder is on (handles goofy, switch and the head turning).
  const B = rider.bones, sh = posOf(rider.g(B['upperarm' + (side > 0 ? '_l' : '_r')]), new THREE.Vector3()).sub(eye);
  const sx = sh.dot(right) >= 0 ? 1 : -1;
  const behind = THREE.MathUtils.smoothstep(-sh.dot(fwd), -0.05, 0.12);   // shoulder behind the eye
  (rider.fpProt ||= [FP_ARMS.protract, FP_ARMS.protract])[side > 0 ? 0 : 1] = FP_ARMS.protract + behind * A.rearProtract;
  (rider.fpDrop ||= [0, 0])[side > 0 ? 0 : 1] = (1 - behind) * A.frontDrop;   // the shoulder ahead of the eye drops out of the view
  const r = pl.speedRatio || 0, crouch = clamp(((p.crouch || 0) - 0.45) / 0.5, 0, 1);
  // Toe side of the view: + when the chest (+Z armature) faces view-right.
  const toeSide = Math.sign(_a.set(0, 0, 1).dot(right)) || 1;
  const sway = Math.sin(p.t * 1.1 + side * 1.7) * 0.01;
  let x = A.ride.x + A.speed.x * r - behind * A.rearReach * 0.5;
  let y = A.ride.y + A.speed.y * r + A.crouch * crouch + sway;
  let z = A.ride.z + A.speed.z * r - behind * A.rearReach;
  const ground = 1 - (p.air || 0);
  const toe = (p.toe || 0) * ground, heel = (p.heel || 0) * ground;
  if (sx === toeSide) { x += A.toe.x * toe; y += A.toe.y * toe; }
  y += A.heel.y * heel; z += A.heel.z * heel;
  x += A.air.x * (p.air || 0); y += A.air.y * (p.air || 0) + Math.sin(p.t * 3.1 + side) * 0.025 * (p.air || 0);
  const si = clamp(p.spinTuck || 0, -1, 1);
  x += A.spinIn.x * si; y += A.spinIn.y * Math.max(0, si);
  const ft = clamp(p.flipTuck || 0, 0, 1);
  x += A.flipTuck.x * ft; y += A.flipTuck.y * ft; z += A.flipTuck.z * ft;
  x += A.grind.x * (p.grind || 0); y += A.grind.y * (p.grind || 0);
  x += 0.05 * (p.stop || 0);
  const fp = eye.clone().addScaledVector(right, sx * x).addScaledVector(up, y).addScaledVector(fwd, z);
  // The grab hand and a dragging hand reach for real; stumbling flails half of it; the lift chair sits.
  const name = pl.grabName || 'Indy';
  const grabbing = front === (name === 'Melon' || name === 'Nose grab') ? (p.grab || 0) : 0;
  const dragging = front === ((p.toe || 0) >= (p.heel || 0)) ? (p.drag || 0) : 0;
  const w = (1 - grabbing) * (1 - dragging) * (1 - 0.6 * (p.stumble || 0)) * (1 - (p.sit || 0)) * (1 - (p.crash || 0));
  const hand = tp.lerp(fp, w);
  if ((p.sit || 0) < 0.5 && (p.crash || 0) < 0.5) keepOffEye(hand, eye, A.minEye);
  // Elbow out to the arm's side of the view and down.
  const pole = _c.copy(right).multiplyScalar(sx * 0.8).addScaledVector(up, -0.6).addScaledVector(fwd, -0.2).normalize().clone();
  return armIK(rider, side, hand, pole);
}

/**
 * First-person pole shaft direction (rider.visual frame: +X right, −Z forward; `sx` −1 left / +1 right):
 * angled out past the glove and trailing a little while gliding, swung forward to the snow on a plant,
 * tucked back under the arms in a tuck. Air / push / grind blends are applied by the caller.
 */
export function fpPoleDir(rider, i, sx, out) {
  const p = rider.p, plant = p.plant[i];
  const ph = 1 - plant, env = plant > 0 ? (ph < 0.25 ? ph / 0.25 : 1 - (ph - 0.25) / 0.75) : 0;
  out.set(sx * 0.4, -1, -0.12).normalize();
  out.lerp(_a.set(sx * 0.2, -1, -0.62).normalize(), env).normalize();
  return out;
}

// Shadow-only stand-ins on their own layer: the sun's shadow camera renders them, the view (and every
// post pass) doesn't. In first person the head bone is collapsed (no helmet in the lens), so without
// these the rider's shadow on the snow would be headless.
export const FP_SHADOW_LAYER = 6;
const _sm = new THREE.Matrix4(), _sp = new THREE.Vector3(), _sq = new THREE.Quaternion(), _ss = new THREE.Vector3();

/** Call after the rider's matrices are final (end of Rider.update). Hides itself in third person. */
export function fpShadow(rider) {
  const helmet = rider.look?.meshes?.helmet;
  if (!helmet) return;
  let sh = rider._fpShadow;
  if (!sh) {
    if (!rider.fp) return;
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
    const shell = new THREE.Mesh(helmet.geometry, mat);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.095, 12, 8), mat);
    for (const m of [shell, face]) {
      m.matrixAutoUpdate = false; m.matrixWorldAutoUpdate = false; m.castShadow = true; m.frustumCulled = false;
      m.layers.set(FP_SHADOW_LAYER);
      rider.root.add(m);
    }
    shell.name = 'fpHelmetShadow'; face.name = 'fpHeadShadow';
    sh = rider._fpShadow = { shell, face, lit: false };
  }
  sh.shell.visible = sh.face.visible = !!rider.fp;
  if (!rider.fp) return;
  if (!sh.lit) {
    let top = rider.root; while (top.parent) top = top.parent;
    top.traverse((o) => { if (o.isDirectionalLight && o.castShadow) { o.shadow.camera.layers.enable(FP_SHADOW_LAYER); sh.lit = true; } });
  }
  const head = rider.bones.Head;
  sh.shell.geometry = helmet.geometry;   // follows outfit changes
  _sm.compose(head.position, head.quaternion, _ss.copy(rider.restLocal.get(head).s));
  sh.shell.matrixWorld.multiplyMatrices(head.parent.matrixWorld, _sm).multiply(helmet.matrix);
  headFrame(rider, _sq, _sp);
  _sp.add(_ss.set(0, 0.06, -0.03).applyQuaternion(_sq));
  sh.face.matrixWorld.compose(_sp, _sq, _ss.set(1, 1.1, 1));
}

/** Smooth 1D value noise in [−1, 1]. */
export function noise1(x, seed) {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 57.0) * 12.9898) * 43758.5453; return (s - Math.floor(s)) * 2 - 1; };
  const u = f * f * (3 - 2 * f);
  return h(i) * (1 - u) + h(i + 1) * u;
}
void _m;
