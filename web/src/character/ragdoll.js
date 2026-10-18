// Crash ragdoll: when the rider wipes out, the body stops being posed and is thrown by its own momentum.
// A Verlet particle skeleton (17 joints) seeded from the last two animated frames, so every crash starts
// from exactly what the rider was doing (carving, flying, tucked) at exactly that speed:
//   • rigid bones (distance constraints), a stiff pelvis / rib cage, a spine and neck that bend only so far
//   • knees and elbows that hinge the right way, legs and arms that can't fold through the body
//   • snow: Coulomb friction (bodies slide 10–20 m at speed), a little bounce, powder that grabs; trees and
//     rocks are solid (scatter obstacles), so a tree hit folds the body around the trunk
//   • skis eject from the bindings and slide / cartwheel on their own (small particle rigid bodies), poles
//     drop out of the hands; a snowboard stays strapped to both feet
// The rider (rider.js) calls start() on the crash, step() + apply() every frame while crashed, and
// stop() on respawn. apply() writes the bones (armature space) and the loose gear transforms.
import * as THREE from 'three';

const G = 9.81;
const SUB = 1 / 120;                 // fixed sub-step (s)
const ITER = 8;                      // constraint iterations per sub-step
const MU_BODY = 0.42;                // snow friction on a sliding body (decelerates ~4 m/s²)
const MU_GEAR = 0.1;                 // skis slide much further than people
const BOUNCE = 0.12;                 // share of the impact speed returned off the snow
const AIR_DAMP = 0.02;               // 1/s velocity loss to the air
const BRACE = 26;                    // m/s² the hands are driven toward the snow ahead in the first moments
const BRACE_TIME = 0.55;             // s of bracing before the body goes limp

// Joints: name → bone the particle starts on, collision radius (m), mass weight.
const JOINTS = [
  // (Radii include the puffy outfit: a jacket stands ~5 cm off the body.)
  ['pelvis', 'pelvis', 0.16, 3], ['chest', 'spine_03', 0.18, 3], ['neck', 'neck_01', 0.08, 1], ['head', null, 0.14, 1.2],
  ['hipL', 'thigh_l', 0.11, 2], ['kneeL', 'calf_l', 0.09, 1.5], ['ankleL', 'foot_l', 0.08, 1], ['toeL', 'ball_l', 0.06, 0.5],
  ['hipR', 'thigh_r', 0.11, 2], ['kneeR', 'calf_r', 0.09, 1.5], ['ankleR', 'foot_r', 0.08, 1], ['toeR', 'ball_r', 0.06, 0.5],
  ['shoulderL', 'upperarm_l', 0.09, 1], ['elbowL', 'lowerarm_l', 0.07, 0.7], ['handL', 'hand_l', 0.06, 0.4],
  ['shoulderR', 'upperarm_r', 0.09, 1], ['elbowR', 'lowerarm_r', 0.07, 0.7], ['handR', 'hand_r', 0.06, 0.4],
];
const IDX = Object.fromEntries(JOINTS.map((j, i) => [j[0], i]));
const N = JOINTS.length;

// Distance constraints: [a, b, min share of rest, max share of rest] (1, 1 = rigid).
const RIGID = (a, b) => [a, b, 1, 1];
const LINKS = [
  // pelvis box + rib cage, each rigid
  RIGID('pelvis', 'hipL'), RIGID('pelvis', 'hipR'), RIGID('hipL', 'hipR'),
  RIGID('chest', 'shoulderL'), RIGID('chest', 'shoulderR'), RIGID('shoulderL', 'shoulderR'), RIGID('chest', 'neck'),
  RIGID('neck', 'shoulderL'), RIGID('neck', 'shoulderR'),
  // spine: a fixed length, bending and twisting within a range
  RIGID('pelvis', 'chest'), ['pelvis', 'neck', 0.9, 1.01], ['hipL', 'chest', 0.86, 1.08], ['hipR', 'chest', 0.86, 1.08],
  ['hipL', 'shoulderL', 0.8, 1.06], ['hipR', 'shoulderR', 0.8, 1.06], ['hipL', 'shoulderR', 0.85, 1.08], ['hipR', 'shoulderL', 0.85, 1.08],
  // head on the neck: nods and turns, can't drop through the chest
  RIGID('neck', 'head'), ['chest', 'head', 0.86, 1.02], ['shoulderL', 'head', 0.8, 1.12], ['shoulderR', 'head', 0.8, 1.12],
  // legs: rigid bones, the hip folds up to the chest but no further, feet stay below the knees-ish
  RIGID('hipL', 'kneeL'), RIGID('kneeL', 'ankleL'), RIGID('ankleL', 'toeL'), ['hipL', 'ankleL', 0.42, 1], ['kneeL', 'toeL', 0.75, 1.12],
  RIGID('hipR', 'kneeR'), RIGID('kneeR', 'ankleR'), RIGID('ankleR', 'toeR'), ['hipR', 'ankleR', 0.42, 1], ['kneeR', 'toeR', 0.75, 1.12],
  ['chest', 'kneeL', 0.55, 1.15], ['chest', 'kneeR', 0.55, 1.15], ['kneeL', 'kneeR', 0.35, 3.5], ['ankleL', 'ankleR', 0.35, 6],
  // arms: rigid bones, the elbow folds but not past ~30°
  RIGID('shoulderL', 'elbowL'), RIGID('elbowL', 'handL'), ['shoulderL', 'handL', 0.32, 1],
  RIGID('shoulderR', 'elbowR'), RIGID('elbowR', 'handR'), ['shoulderR', 'handR', 0.32, 1],
];

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();

/** A small rigid body made of particles (skis, poles): positions, previous positions, rest distances. */
class Stick {
  constructor(points, radius, mu) {
    this.p = points.map((v) => v.clone());
    this.o = points.map((v) => v.clone());
    this.r = radius; this.mu = mu;
    this.d = [];
    for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++) this.d.push([i, j, points[i].distanceTo(points[j])]);
  }
}

export class Ragdoll {
  constructor() {
    this.active = false;
    this.P = Array.from({ length: N }, () => new THREE.Vector3());   // positions (world)
    this.O = Array.from({ length: N }, () => new THREE.Vector3());   // previous positions
    this.last = Array.from({ length: N }, () => new THREE.Vector3()); // tracked animated pose (last frame)
    this.prev = Array.from({ length: N }, () => new THREE.Vector3()); // … and the frame before
    this.trackDt = 1 / 60; this.tracked = 0;
    this.inv = JOINTS.map((j) => 1 / j[3]);
    this.links = [];
    this.loose = [];   // ejected skis / poles: { stick, mesh, kind }
  }

  /** Every animated frame: remember where the joints are (crash velocities come from the last two). */
  track(rider, dt) {
    for (let i = 0; i < N; i++) {
      this.prev[i].copy(this.last[i]);
      this.jointWorld(rider, i, this.last[i]);
    }
    this.trackDt = Math.max(1 / 240, dt || 1 / 60);
    this.tracked++;
  }

  jointWorld(rider, i, out) {
    // World matrices are fresh: the rider calls this right after root.updateMatrixWorld().
    const B = rider.bones, bone = JOINTS[i][1];
    if (bone) return out.setFromMatrixPosition(B[bone].matrixWorld);
    // Head: the skull's centre, a hand's width up from the head bone along the neck.
    out.setFromMatrixPosition(B.Head.matrixWorld);
    _a.setFromMatrixPosition(B.neck_01.matrixWorld);
    return out.addScaledVector(_b.subVectors(out, _a).normalize(), 0.11);
  }

  /**
   * Take over from the animation. kind = the crash reason (player.crash(kind)); fwd = travel direction (world).
   */
  start(rider, pl, kind) {
    const terrain = pl.terrain;
    this.terrain = terrain; this.scatter = pl.scatter; this.pl = pl;
    const dt = this.trackDt;
    const have = this.tracked >= 2;
    for (let i = 0; i < N; i++) {
      const cur = have ? this.last[i] : this.jointWorld(rider, i, _a).clone();
      this.P[i].copy(cur);
      // Velocity: the animated joint velocity, which already includes the rider's own motion; capped so
      // a teleport (respawn, drop zone) between the tracked frames can't fling the body.
      const v = have ? _b.subVectors(this.last[i], this.prev[i]).divideScalar(dt) : _b.copy(pl.velocity);
      if (v.distanceTo(pl.velocity) > 12) v.copy(pl.velocity);
      this.O[i].copy(cur).addScaledVector(v, -SUB);
    }
    // Rest lengths from the pose the crash starts in (the rig's own bone lengths).
    this.links = LINKS.map(([a, b, lo, hi]) => {
      const ia = IDX[a], ib = IDX[b], d = this.P[ia].distanceTo(this.P[ib]);
      return [ia, ib, d * lo, d * hi];
    });
    // The fall itself. Obstacle hits: the player's velocity has already been bounced off the trunk, the
    // body hasn't — it carries on into the tree and folds around it. Everything else: the feet catch
    // (an edge, the landing) and the upper body is thrown on over them — forward, or back if the rider
    // was leaning back (a 'pitch' crash backwards), with a little twist so no two falls look alike.
    const obstacle = /tree|rock|tower|post|fence|cabin|lodge|sign|pylon|building|wall/.test(kind || '');
    const sp = pl.velocity.length();
    const fwd = _c.copy(pl.velocity).setY(0);
    if (fwd.lengthSq() < 1e-4) fwd.set(-Math.sin(pl.heading), 0, -Math.cos(pl.heading));
    fwd.normalize();
    const side = _d.set(-fwd.z, 0, fwd.x);
    const rnd = (Math.sin((pl.position.x + pl.position.z) * 12.9898) * 43758.5453) % 1;
    const back = kind === 'pitch' && (pl.flipSettle || 0) * (pl.travelSign || 1) < 0 ? -1 : 1;
    this.fallDir = (this.fallDir || new THREE.Vector3()).copy(fwd).multiplyScalar(obstacle ? -1 : back);
    if (!obstacle) {
      const throwV = Math.min(5, 1 + sp * 0.22);
      const feetCatch = Math.min(4, sp * 0.3);
      for (let i = 0; i < N; i++) {
        const name = JOINTS[i][0];
        const h = this.P[i].y - this.P[IDX.pelvis].y;          // above the hips: thrown, below: caught
        const v = _a.set(0, 0, 0);
        if (h > 0) v.addScaledVector(fwd, back * throwV * Math.min(1, h / 0.6)).addScaledVector(side, rnd * 1.6 * h);
        if (/ankle|toe|knee/.test(name)) v.addScaledVector(fwd, -feetCatch * (name.startsWith('knee') ? 0.5 : 1));
        if (/hand|elbow/.test(name)) v.y += 1.2;                // arms fly up as the body pitches
        this.O[i].addScaledVector(v, -SUB);
      }
    }
    this.ejectGear(rider, sp);
    this.t = 0;
    this.active = true;
  }

  /** Skis release from the bindings and poles leave the hands; a board stays on. */
  ejectGear(rider, speed) {
    this.loose = [];
    rider.root.updateMatrixWorld(true);
    const vel = this.pl.velocity;
    if (rider.skis && speed > 3) {
      rider.skis.forEach((ski, i) => {
        const len = rider.equip.spec.length || 1.7;
        const pts = [new THREE.Vector3(0, 0, -len * 0.55), new THREE.Vector3(0, 0, len * 0.45), new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(0, 0.05, 0)]
          .map((v) => ski.localToWorld(v));
        const st = new Stick(pts, 0.03, MU_GEAR);
        // The release kicks each ski off a little sideways and up, the tip and tail apart so it spins.
        const sgn = i ? 1 : -1;
        const kick = _a.copy(vel).multiplyScalar(0.92).add(_b.set(sgn * 0.9, 0.7, 0));
        st.o.forEach((o, k) => o.copy(st.p[k]).addScaledVector(kick, -SUB).addScaledVector(_b.set(sgn * (k === 0 ? 0.9 : k === 1 ? -0.9 : 0), 0, 0), -SUB));
        this.loose.push({ stick: st, mesh: ski, kind: 'ski' });
      });
    }
    if (rider.poles && !rider.isBoard) {
      rider.poles.forEach((pole) => {
        if (!pole.visible) return;
        const L = rider.poleLen || 1.2;
        const pts = [pole.localToWorld(new THREE.Vector3(0, 0, 0)), pole.localToWorld(new THREE.Vector3(0, -L, 0)), pole.localToWorld(new THREE.Vector3(0.04, -L * 0.5, 0))];
        const st = new Stick(pts, 0.025, MU_GEAR * 1.5);
        st.o.forEach((o, k) => o.copy(st.p[k]).addScaledVector(vel, -SUB * 0.85));
        this.loose.push({ stick: st, mesh: pole, kind: 'pole', L });
      });
    }
  }

  stop() { this.active = false; this.loose = []; }

  step(dt) {
    if (!this.active) return;
    this.acc = (this.acc || 0) + Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= SUB && n < 16) { this.sub(SUB); this.acc -= SUB; n++; }
    if (n === 16) this.acc = 0;
    this.t += dt;
  }

  sub(h) {
    const P = this.P, O = this.O, damp = 1 - AIR_DAMP * h;
    for (let i = 0; i < N; i++) {
      const p = P[i], o = O[i];
      _a.subVectors(p, o).multiplyScalar(damp);
      o.copy(p);
      p.add(_a).y -= G * h * h;
    }
    for (const L of this.loose) {
      const s = L.stick;
      for (let k = 0; k < s.p.length; k++) {
        _a.subVectors(s.p[k], s.o[k]).multiplyScalar(damp);
        s.o[k].copy(s.p[k]);
        s.p[k].add(_a).y -= G * h * h;
      }
    }
    // Bracing: for the first instant the rider is still trying — hands go out toward the snow they're falling on.
    if (this.t < BRACE_TIME && this.fallDir) {
      const w = (1 - this.t / BRACE_TIME) * BRACE * h * h;
      const ch = P[IDX.chest];
      const tx = ch.x + this.fallDir.x * 0.55, ty = this.ground(ch.x, ch.z), tz = ch.z + this.fallDir.z * 0.55;
      for (const n of ['handL', 'handR', 'elbowL', 'elbowR']) {
        const q = P[IDX[n]], k = n.startsWith('hand') ? 1 : 0.5;
        _a.set(tx - q.x, ty - q.y, tz - q.z);
        const d = _a.length();
        if (d > 0.05) q.addScaledVector(_a, w * k / d);
      }
    }
    for (let it = 0; it < ITER; it++) {
      this.solveLinks();
      if (it % 2 === 1) this.hinges();
      this.collideAll(h, it === ITER - 1);
      for (const L of this.loose) this.solveStick(L.stick, h, it === ITER - 1);
    }
  }

  solveLinks() {
    const P = this.P, w = this.inv;
    for (const [a, b, lo, hi] of this.links) {
      const d = _a.subVectors(P[b], P[a]), len = d.length();
      if (len < 1e-6) continue;
      const target = len < lo ? lo : len > hi ? hi : len;
      if (target === len) continue;
      const k = (len - target) / (len * (w[a] + w[b]));
      P[a].addScaledVector(d, k * w[a]);
      P[b].addScaledVector(d, -k * w[b]);
    }
  }

  /** Knees bend forward, elbows bend back: mirror a joint that has flipped through its limb's line. */
  hinges() {
    const P = this.P;
    const right = _a.subVectors(P[IDX.hipR], P[IDX.hipL]).normalize();
    const up = _b.subVectors(P[IDX.chest], P[IDX.pelvis]).normalize();
    const fwd = _c.crossVectors(up, right).normalize();
    const fix = (root, mid, end, sign, slack) => {
      const r = P[IDX[root]], m = P[IDX[mid]], e = P[IDX[end]];
      const line = _d.subVectors(e, r), L2 = line.lengthSq();
      if (L2 < 1e-6) return;
      const t = Math.max(0, Math.min(1, ((m.x - r.x) * line.x + (m.y - r.y) * line.y + (m.z - r.z) * line.z) / L2));
      // Offset of the joint from its limb's line, measured along the body's forward axis.
      const s = ((m.x - r.x - line.x * t) * fwd.x + (m.y - r.y - line.y * t) * fwd.y + (m.z - r.z - line.z * t) * fwd.z) * sign;
      if (s < -slack) m.addScaledVector(fwd, -(s + slack) * sign * 2);
    };
    fix('hipL', 'kneeL', 'ankleL', 1, 0.01); fix('hipR', 'kneeR', 'ankleR', 1, 0.01);
    fix('shoulderL', 'elbowL', 'handL', -1, 0.04); fix('shoulderR', 'elbowR', 'handR', -1, 0.04);
    // The toes point forward of the shin, not back through it.
    for (const s of ['L', 'R']) {
      const k = P[IDX['knee' + s]], an = P[IDX['ankle' + s]], toe = P[IDX['toe' + s]];
      void k;
      const f = (toe.x - an.x) * fwd.x + (toe.y - an.y) * fwd.y + (toe.z - an.z) * fwd.z;
      if (f < 0) toe.addScaledVector(fwd, -f * 1.5);
    }
  }

  ground(x, z) { return this.terrain.getHeight(x, z); }

  /** Snow and obstacles for every joint; friction is applied on the last iteration only. */
  collideAll(h, friction) {
    const P = this.P, O = this.O;
    const sc = this.scatter;
    const nearObs = sc && sc.nearest ? sc.nearest(P[IDX.pelvis], 2.5) : null;
    for (let i = 0; i < N; i++) {
      const p = P[i], r = JOINTS[i][2];
      if (nearObs) {
        const o = sc.findObstacle(p, r);
        if (o) {
          const top = o[3] === 'tree' ? o[2] * 26 : o[3] === 'rock' ? o[2] * 1.1 + 0.3 : 4;
          if (p.y - this.ground(o[0], o[1]) < top) {
            let dx = p.x - o[0], dz = p.z - o[1];
            const d = Math.hypot(dx, dz) || 1e-3; dx /= d; dz /= d;
            p.x = o[0] + dx * (o[2] + r); p.z = o[1] + dz * (o[2] + r);
            if (friction) { O[i].x += (p.x - O[i].x) * 0.35; O[i].z += (p.z - O[i].z) * 0.35; }   // bark is rough
          }
        }
      }
      const gy = this.ground(p.x, p.z) + r;
      if (p.y < gy) {
        p.y = gy;
        if (friction) this.contact(p, O[i], h, MU_BODY);
      }
    }
  }

  /** Coulomb friction + a small bounce for a particle resting on (or hitting) the snow. */
  contact(p, o, h, mu) {
    const v = _a.subVectors(p, o).divideScalar(h);
    const vn = Math.min(0, v.y);
    const vt = _b.set(v.x, 0, v.z);
    const sp = vt.length();
    // Normal load ≈ g plus whatever impact is being absorbed; the deceleration it buys is μ·load.
    const dv = mu * (G + Math.max(0, -vn) / h * 0.02) * h;
    if (sp > 1e-6) vt.multiplyScalar(Math.max(0, sp - dv) / sp);
    v.set(vt.x, vn < -0.5 ? -vn * BOUNCE : Math.max(v.y, 0), vt.z);
    o.copy(p).addScaledVector(v, -h);
  }

  solveStick(s, h, friction) {
    for (const [i, j, d] of s.d) {
      const v = _a.subVectors(s.p[j], s.p[i]), len = v.length();
      if (len < 1e-6) continue;
      const k = (len - d) / len * 0.5;
      s.p[i].addScaledVector(v, k); s.p[j].addScaledVector(v, -k);
    }
    for (let k = 0; k < s.p.length; k++) {
      const p = s.p[k], gy = this.ground(p.x, p.z) + s.r;
      if (p.y < gy) { p.y = gy; if (friction) this.contact(p, s.o[k], h, s.mu); }
    }
  }

  /** Centre of the body and its velocity (the camera / audio follow the player, which follows this). */
  pelvis() { return this.P[IDX.pelvis]; }
  pelvisVel(out) { return out.subVectors(this.P[IDX.pelvis], this.O[IDX.pelvis]).divideScalar(SUB); }

  // ------------------------------------------------------------------ writing the pose
  /**
   * Pose the rig from the particles. The rider has placed root / visual / body for this frame and called
   * pose()'s reset (bones at rest, G cleared); everything here is in armature space.
   */
  apply(rider) {
    const B = rider.bones;
    rider.root.updateMatrixWorld(true);
    const armInv = _m.copy(rider.armature.matrixWorld).invert();
    const A = this.P.map((p) => p.clone().applyMatrix4(armInv));
    const at = (n) => A[IDX[n]];
    const rest = (b) => rider.restGlobal.get(B[b]);
    const restPos = (b) => new THREE.Vector3().setFromMatrixPosition(rest(b));
    if (!this.restFrames) {
      // Rest frames of the pelvis and rib cage from the bind pose.
      const hp = frame(restPos('thigh_l').sub(restPos('thigh_r')), restPos('spine_03').sub(restPos('pelvis')));
      const ch = frame(restPos('upperarm_l').sub(restPos('upperarm_r')), restPos('neck_01').sub(restPos('spine_03')));
      this.restFrames = { hp: hp.invert(), ch: ch.invert() };
    }
    const hipF = frame(_a.subVectors(at('hipL'), at('hipR')), _b.subVectors(at('chest'), at('pelvis')));
    const chF = frame(_a.subVectors(at('shoulderL'), at('shoulderR')), _b.subVectors(at('neck'), at('chest')));
    const qH = new THREE.Quaternion().setFromRotationMatrix(hipF.multiply(this.restFrames.hp));
    const qC = new THREE.Quaternion().setFromRotationMatrix(chF.multiply(this.restFrames.ch));
    const setRot = (name, q, p) => {
      const b = B[name], r = rest(name);
      rider.inherit(b);
      const pos = p || new THREE.Vector3().setFromMatrixPosition(rider.g(b));
      rider.setGlobal(b, new THREE.Matrix4().compose(pos, q.clone().multiply(_q2.setFromRotationMatrix(r)), new THREE.Vector3().setFromMatrixScale(r)));
    };
    // Pelvis at its particle (offset from the hip-joint centre the same way the rig's pelvis is).
    setRot('pelvis', qH, at('pelvis').clone());
    setRot('spine_01', qH.clone().slerp(qC, 0.33));
    setRot('spine_02', qH.clone().slerp(qC, 0.66));
    setRot('spine_03', qC);
    rider.inherit(B.neck_01);
    rider.aim(B.neck_01, B.Head, _a.subVectors(at('head'), new THREE.Vector3().setFromMatrixPosition(rider.g(B.neck_01))));
    rider.inherit(B.Head);
    for (const [s, S] of [['_l', 'L'], ['_r', 'R']]) {
      const limb = (bones, pts) => {
        for (let k = 0; k < bones.length - 1; k++) {
          const b = B[bones[k]];
          rider.inherit(b);
          rider.aim(b, B[bones[k + 1]], _a.subVectors(pts[k], new THREE.Vector3().setFromMatrixPosition(rider.g(b))));
        }
        rider.inherit(B[bones[bones.length - 1]]);
      };
      limb(['thigh' + s, 'calf' + s, 'foot' + s, 'ball' + s], [at('knee' + S), at('ankle' + S), at('toe' + S)]);
      rider.inherit(B['clavicle' + s]);
      rider.aim(B['clavicle' + s], B['upperarm' + s], _a.subVectors(at('shoulder' + S), new THREE.Vector3().setFromMatrixPosition(rider.g(B['clavicle' + s]))));
      limb(['upperarm' + s, 'lowerarm' + s, 'hand' + s], [at('elbow' + S), at('hand' + S)]);
    }
    this.placeGear(rider);
  }

  placeGear(rider) {
    rider.root.updateMatrixWorld(true);
    for (const L of this.loose) {
      const s = L.stick, mesh = L.mesh;
      let wm;
      if (L.kind === 'ski') {
        // Frame from tip, tail and the side marker: −Z toward the tip, X toward the side marker.
        const z = _a.subVectors(s.p[1], s.p[0]).normalize();
        const x0 = _b.subVectors(s.p[2], _c.addVectors(s.p[0], s.p[1]).multiplyScalar(0.5));
        const x = x0.addScaledVector(z, -x0.dot(z)).normalize();
        const y = _d.crossVectors(z, x);
        const len = rider.equip.spec.length || 1.7;
        const centre = _c.copy(s.p[0]).addScaledVector(z, len * 0.55);
        wm = new THREE.Matrix4().makeBasis(x, y, z).setPosition(centre);
      } else {
        const down = _a.subVectors(s.p[1], s.p[0]).normalize();   // pole local −Y runs grip → tip
        const y = down.clone().negate();
        const x0 = _b.subVectors(s.p[2], s.p[0]);
        const x = x0.addScaledVector(y, -x0.dot(y)).normalize();
        const z = _d.crossVectors(x, y);
        wm = new THREE.Matrix4().makeBasis(x, y, z).setPosition(s.p[0]);
      }
      const local = mesh.parent.matrixWorld.clone().invert().multiply(wm);
      local.decompose(mesh.position, mesh.quaternion, _a);
      mesh.visible = true;
    }
    // A snowboard stays strapped on: under both boots, nose toward the front foot.
    if (rider.board) {
      const nx = rider.equip.stance === 'goofy' ? 'R' : 'L';
      const front = this.P[IDX['ankle' + nx]], backA = this.P[IDX['ankle' + (nx === 'L' ? 'R' : 'L')]];
      const z = _a.subVectors(backA, front).normalize();          // board −Z toward the nose
      const shin = _b.subVectors(this.P[IDX.kneeL], this.P[IDX.ankleL]).add(_c.subVectors(this.P[IDX.kneeR], this.P[IDX.ankleR]));
      const y = shin.addScaledVector(z, -shin.dot(z)).normalize();
      const x = _c.crossVectors(y, z);
      const centre = _d.addVectors(front, backA).multiplyScalar(0.5).addScaledVector(y, -0.09);
      const wm = new THREE.Matrix4().makeBasis(x, y, z).setPosition(centre);
      const local = rider.board.parent.matrixWorld.clone().invert().multiply(wm);
      local.decompose(rider.board.position, rider.board.quaternion, _a);
    }
  }
}

/** Orthonormal frame: X along `x`, Y along `y` made perpendicular to it. */
function frame(x, y) {
  const X = x.clone().normalize();
  const Y = y.clone().addScaledVector(X, -y.dot(X)).normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  return new THREE.Matrix4().makeBasis(X, Y, Z);
}
