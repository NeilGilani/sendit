// Crash ragdoll controller (docs/body.md § Crash ragdoll). Installed once on the real player + rider (main.js):
//   installRagdoll({ player, rider, scatter, course })
// It does nothing until the player enters State.CRASH:
//   • every rendered frame before that, track() READS a few joint positions of the posed rig (the crash's
//     momentum comes from the last two animated frames); it never writes to the pose or the player
//   • player.crashStep(dt) → stepCrash(): on the first crash step the ragdoll is built from the posed rig and
//     seeded with the rider's momentum, then it is stepped (fixed sub-steps) and the player follows its centre
//     of mass (camera, audio, juice); the respawn fade starts once it rests (or at RAGDOLL.maxTumble)
//   • rider.update() → pose(): bones and loose gear from the bodies (interpolated between frame steps)
//   • on 'respawned' (or leaving State.CRASH) it is dropped; the rider poses itself again
// Without it (?ragdoll=0, other riders, Node benches) the old slide-and-roll crash runs unchanged.
import * as THREE from 'three';
import { RAGDOLL, PHYSICS } from '../../config.js';
import { on, emit } from '../../state.js';
import { buildHumanoid, seedMotion, depenetrate, updateTone } from './humanoid.js';
import { captureSeed, applyPose } from './rig.js';
import { crashSeverity } from './severity.js';

const CRASH = 3;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const TRACK = ['pelvis', 'spine_03', 'thigh_l', 'thigh_r', 'Head'];
// Limb → the trunk body its flapping is measured against (measure()).
const FLAP = [['upperarmL', 'chest'], ['upperarmR', 'chest'], ['forearmL', 'chest'], ['forearmR', 'chest'], ['head', 'chest'],
  ['thighL', 'pelvis'], ['thighR', 'pelvis'], ['shinL', 'pelvis'], ['shinR', 'pelvis']];

/** Terrain / obstacle / rail adapter the solver talks to. */
export function makeEnv(terrain, scatter, course) {
  const env = {
    height: (x, z) => terrain.getHeight(x, z),
    normal: (x, z, out) => {
      const e = 0.12;
      return out.set(terrain.getHeight(x - e, z) - terrain.getHeight(x + e, z), 2 * e, terrain.getHeight(x, z - e) - terrain.getHeight(x, z + e)).normalize();
    },
    obstacles: [],
    rails: [],
    _railsAll: null,
    _cache: new Map(),
    /** Gather obstacles and rails within `r` m of p (call every frame step; cheap). */
    refresh(p, r = 4) {
      env.obstacles.length = 0;
      if (scatter?.obstaclesNear) {
        for (const o of scatter.obstaclesNear(p, r)) {
          let e = env._cache.get(o);   // (one entry per scatter obstacle: no garbage per refresh)
          if (!e) {
            const kind = o[3];
            const top = kind === 'tree' ? o[2] * 26 : kind === 'rock' ? o[2] * 1.1 + 0.3 : kind === 'tower' ? 15 : 2;
            const y0 = terrain.getHeight(o[0], o[1]);
            env._cache.set(o, e = { x: o[0], z: o[1], r: o[2], y0, y1: y0 + top, cap: kind !== 'tree' && kind !== 'tower' });
          }
          env.obstacles.push(e);
        }
      }
      if (env._railsAll === null) {
        env._railsAll = [];
        for (const rl of course?.rails || []) {
          const half = rl.half ?? 0.05;
          for (let i = 0; i + 1 < rl.pts.length; i++) {
            const a = new THREE.Vector3(...rl.pts[i]), b = new THREE.Vector3(...rl.pts[i + 1]);
            a.y -= half; b.y -= half;   // the top line is the grind surface; the capsule's axis is half below it
            env._railsAll.push({ a, b, r: half });
          }
        }
      }
      env.rails.length = 0;
      for (const s of env._railsAll) {
        const mx = (s.a.x + s.b.x) / 2, mz = (s.a.z + s.b.z) / 2, half = s.a.distanceTo(s.b) / 2;
        if (Math.hypot(p.x - mx, p.z - mz) < r + half) env.rails.push(s);
      }
    },
  };
  return env;
}

/** Deterministic 0..1 random from a seed (mulberry32). */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/**
 * Seed velocity from two tracked frames (world positions + times): the trunk's linear velocity and its
 * spin (the rotation of the hips → chest frame). Returns { v, w } or null.
 */
export function trackedMotion(f0, f1, maxSpin) {
  const dt = f1.t - f0.t;
  if (!(dt > 1 / 400) || dt > 0.2) return null;
  const v = new THREE.Vector3().addVectors(f1.p[0], f1.p[1]).sub(f0.p[0]).sub(f0.p[1]).multiplyScalar(0.5 / dt);
  const frame = (f, out) => {
    const x = _a.subVectors(f.p[2], f.p[3]).normalize();
    const y = _b.subVectors(f.p[1], f.p[0]);
    y.addScaledVector(x, -y.dot(x)).normalize();
    const z = _c.crossVectors(x, y);
    return out.setFromRotationMatrix(_m.makeBasis(x, y, z));
  };
  frame(f0, _q); frame(f1, _q2);
  const dq = _q2.multiply(_q.invert());
  if (dq.w < 0) { dq.x = -dq.x; dq.y = -dq.y; dq.z = -dq.z; dq.w = -dq.w; }
  const s = Math.hypot(dq.x, dq.y, dq.z);
  const w = new THREE.Vector3();
  if (s > 1e-9) w.set(dq.x, dq.y, dq.z).multiplyScalar(2 * Math.atan2(s, dq.w) / s / dt);
  if (w.length() > maxSpin) w.setLength(maxSpin);
  return { v, w };
}

export class RagdollController {
  constructor({ player, rider, scatter, course, C = RAGDOLL, fpPoleLength = 1.2 }) {
    this.player = player; this.rider = rider; this.C = C;
    this.env = makeEnv(player.terrain, scatter ?? player.scatter, course ?? player.terrain?.course);
    this.fpPoleLength = fpPoleLength;
    this.active = false; this.failed = false;
    this.frames = [];          // tracked animated frames: { t, p: [Vector3 × TRACK] }
    this.kind = null;
    this.H = null;
    this.t = 0;
    this.restT = 0;
    this.alpha = 1;
    this._impactCool = 0;
    this.stats = { crashes: 0, maxMs: 0, lastMs: 0 };
    this._pre = (W) => this.preSub(W);
    this.install();
  }

  /** Hook into the player (crash steps) and the rider (posing); listen for crashes / respawns. */
  install() {
    const player = this.player;
    this.uninstalled = false;
    player.ragdoll = this; this.rider.ragdoll = this;
    this._off = [
      on('crashed', (kind) => { this.kind = kind; }),
      on('respawned', () => { this.stop(); this.frames.length = 0; }),
      on('equipmentChanged', (e) => { if (this.active && (!e.player || e.player === player)) { this.stop(); this.failed = true; } }),
    ];
  }

  /** Unhook completely: the game runs exactly as without the module (ragdoll-identity.mjs compares both). */
  uninstall() {
    this.stop();
    this.uninstalled = true;
    this._off.forEach((f) => f?.());
    this.frames.length = 0;
    if (this.player.ragdoll === this) this.player.ragdoll = null;
    if (this.rider.ragdoll === this) this.rider.ragdoll = null;
  }

  /** After each rendered (animated) frame: remember where the trunk joints are. Read-only. */
  track() {
    const pl = this.player, r = this.rider;
    if (this.uninstalled || pl.state === CRASH || !pl.simulated || !r.bones) return;
    const t = (pl.simTime || 0) + ((pl.renderAlpha ?? 1) - 1) * (pl.stepDt || 1 / 60);
    const F = this.frames, last = F[F.length - 1];
    let f;
    if (last && t - last.t < 1e-6) f = last;              // no game time passed (paused): refresh it
    else {
      f = F.length >= 3 ? F.shift() : { t, p: TRACK.map(() => new THREE.Vector3()) };
      F.push(f);
    }
    f.t = t;
    for (let i = 0; i < TRACK.length; i++) f.p[i].setFromMatrixPosition(r.bones[TRACK[i]].matrixWorld);
  }

  /** Is the ragdoll posing the rider this frame? */
  drives(pl = this.player) { return this.active && pl.state === CRASH; }

  /** player.crashStep → true when the ragdoll ran this step (the player then follows it). */
  stepCrash(pl, dt) {
    if (pl.crashT <= dt + 1e-9) { this.stop(); this.failed = false; }   // a new crash (whatever happened since the last)
    if (this.failed || !this.C.enabled) return false;
    if (!this.active && !this.begin(pl)) { this.failed = true; return false; }
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const H = this.H, W = H.world, C = this.C;
    for (const b of W.bodies) { b.xr.copy(b.x); b.qr.copy(b.q); }
    W.step(dt, this._pre);
    this.t += dt;
    if (W.failed) console.warn('[ragdoll] solver failed; frozen');
    // The player follows the body's centre of mass (camera aim, audio, wipeout distance).
    const com = W.com(0, _a);
    const gy = pl.terrain.getHeight(com.x, com.z);
    pl.position.set(com.x, Math.max(gy, com.y - 0.6), com.z);
    W.comVel(0, pl.velocity);
    pl.speed = pl.velocity.length();
    pl.terrain.getNormal(com.x, com.z, 1, pl.groundNormal);
    // Impacts (audio thumps, a camera knock): hard hits after the first moment (the crash itself has its sound).
    this._impactCool -= dt;
    if (W.impact > C.impactSpeed && this.t > 0.18 && this._impactCool <= 0) {
      emit('ragdollImpact', { speed: W.impact, k: Math.min(1.3, W.impact / 8), x: W.impactAt.x, y: W.impactAt.y, z: W.impactAt.z });
      this._impactCool = 0.16;
    }
    W.impact = 0;
    this.restT = W.asleep(0) ? this.restT + dt : 0;
    this.measure(dt);
    const ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
    this.stats.lastMs = ms; this.stats.maxMs = Math.max(this.stats.maxMs, ms); this.stats.sumMs = (this.stats.sumMs || 0) + ms; this.stats.steps = (this.stats.steps || 0) + 1;
    return true;
  }

  /**
   * Crash metrics (tests: ragdoll-fuzz / ragdoll-shots): how much the limbs flap relative to the trunk (arms and
   * head against the chest, legs against the pelvis: peak and mean rad/s over the first 2.5 s awake, and the number
   * of big swings: a limb's relative spin rising past 8 rad/s after it had dropped under 4), and how far the
   * centre of mass travels (horizontal, from the crash) — `m.dist` — plus where it was at the fade (`m.fadeDist`).
   */
  measure(dt) {
    const H = this.H, P = H.parts, m = this.m;
    const com = H.world.com(0, _a);
    if (!m.c0) m.c0 = com.clone();
    m.dist = Math.hypot(com.x - m.c0.x, com.z - m.c0.z);
    if (H.world.asleep(0) || this.t > 2.5) return;
    // Tumbling: the angle the trunk's long axis (pelvis → chest) sweeps (head over heels / cartwheels: 360° = one
    // flip) and the roll about that axis (a log roll), the trunk's peak spin; limb spread: each hand's distance from
    // the trunk segment and the distance between the ankles (peak and time average).
    const pv = P.pelvis, ch = P.chest;
    const u = _c.subVectors(ch.x, pv.x).normalize();
    if (m.u) { m.tumble += Math.acos(Math.max(-1, Math.min(1, u.dot(m.u)))); m.roll += Math.abs(_b.addVectors(pv.w, ch.w).multiplyScalar(0.5).dot(u)) * dt; }
    else m.u = new THREE.Vector3();
    m.u.copy(u);
    if (this.t > 0.05) m.wMax = Math.max(m.wMax, pv.w.length(), ch.w.length());
    let arm = 0;
    for (const f of [P.forearmL, P.forearmR]) {
      f.point(f.shapes[1].a, _b);
      const L = ch.x.distanceTo(pv.x);
      const k = Math.max(0, Math.min(L, _b.clone().sub(pv.x).dot(u)));
      arm = Math.max(arm, _b.sub(pv.x).addScaledVector(u, -k).length());
    }
    const ankle = (sh, out) => sh.point(sh.shapes[0].b, out);
    const leg = ankle(P.shinL, _b).distanceTo(ankle(P.shinR, _a.clone()));
    m.armPeak = Math.max(m.armPeak, arm); m.legPeak = Math.max(m.legPeak, leg);
    m.armSum += arm * dt; m.legSum += leg * dt;
    let sum = 0;
    for (let i = 0; i < FLAP.length; i++) {
      const [limb, trunk] = FLAP[i];
      const w = _b.subVectors(P[limb].w, P[trunk].w).length();
      sum += w;
      if (w > m.peak) m.peak = w;
      if (m.armed[i] && w > 8) { m.swings++; m.armed[i] = false; } else if (w < 4) m.armed[i] = true;
    }
    m.sum += sum / FLAP.length * dt; m.T += dt;
    m.mean = m.sum / m.T;
  }

  /**
   * Where the crashed body (and its gear) touched the snow since the last call (fx.js: snow marks and spray only
   * at real contacts, nothing under a body in the air). Fills `out` with
   *   { key, part: 'chest' | 'pelvis' | 'head' | 'thigh' | 'shin' | 'upperarm' | 'forearm' | 'ski' | 'board' | 'pole',
   *     p (contact point on the snow), v (that body's velocity), speed, imp (hardest approach speed, m/s), heading,
   *     axis (body axis, world), hits (sub-step contacts) }
   * and returns it. Entries are pooled (copy what you keep).
   */
  snowContacts(out = []) {
    out.length = 0;
    if (!this.H) return out;
    const W = this.H.world, pool = this._snowPool || (this._snowPool = new Map());
    for (const e of W.snow.values()) {
      if (e.n === 0) continue;
      let c = pool.get(e.key);
      if (!c) pool.set(e.key, c = { key: e.key, part: '', p: new THREE.Vector3(), v: new THREE.Vector3(), axis: new THREE.Vector3(), speed: 0, imp: 0, heading: 0, hits: 0 });
      const b = e.b;
      c.part = e.gear ? 'ski' : b.name.replace(/[LR]$/, '').replace(/\d+$/, '');
      c.p.copy(e.p).divideScalar(e.n);
      c.v.copy(b.v); c.speed = b.v.length(); c.imp = e.imp; c.hits = e.n;
      // Axis: a strapped-on ski along its length, a body along its capsule.
      if (e.gear) { const s = b.samples.find((q) => q.gear === e.gear); c.axis.copy(s.axis).applyQuaternion(b.q); }
      else c.axis.set(0, 1, 0).applyQuaternion(b.q);
      c.heading = Math.atan2(-c.axis.x, -c.axis.z);
      e.n = 0;
      out.push(c);
    }
    return out;
  }

  /** Time for the respawn fade? (player.crashStep asks once the ragdoll ran) */
  doneAt(crashT) {
    const d = this._doneAt(crashT);
    if (d && this.m && this.m.fadeAt === undefined) this.m.fadeAt = +crashT.toFixed(3);
    return d;
  }

  _doneAt(crashT) {
    const C = this.C;
    if ((crashT > PHYSICS.tumbleTime && this.restT > C.restHold) || crashT > C.maxTumble || this.H?.world.failed) return true;
    // Still going after the tumble: on a steep face (a body keeps sliding there) or once it has slid far enough,
    // the fade starts instead of showing a long slide.
    if (crashT > C.slideFadeTime && this.H) {
      if (this.m.dist > C.slideFadeDist) return true;
      if (this.player.speed > C.steepFadeSpeed) {
        const n = this.player.groundNormal;
        if (n && n.y < Math.cos(C.steepFadeDeg * Math.PI / 180)) return true;
      }
    }
    return false;
  }

  /** Before every sub-step: obstacles nearby, bracing, muscle tone (all on the sub-step clock). */
  preSub(W) {
    const C = this.C, H = this.H;
    if (W.ticks % 12 === 0) this.env.refresh(W.bodies[0].x, 4);
    // Bracing: the hands reach toward the snow the body is falling onto until one lands (or braceTime).
    let brace = null;
    const sp = W.comVel(0, _a).length(), hs = C.toneHoldSpeed || 0;
    const hold = hs > 0 ? Math.min(1, Math.max(0, (sp - hs * 0.25) / (hs * 0.75))) : 0;
    if (W.t < C.braceTime && !W.handTouch) {
      _a.setY(0);
      brace = _b.copy(_a.lengthSq() > 1 ? _a.normalize() : this.fallDir).multiplyScalar(0.75).add(_c.set(0, -1, 0)).normalize();
    }
    // Lying still: the muscles let go (a resting limb pushed by its tone against snow or bark would jitter).
    // Still upright after the first moments (a board under both feet makes a stable base): the knees and hips let
    // go, so the body sinks and falls instead of riding on like a skier.
    _c.set(0, 1, 0).applyQuaternion(H.parts.chest.q);
    const upright = W.t > C.uprightAfter && _c.y > 0.75 && H.parts.chest.x.y - H.parts.pelvis.x.y > 0.15;
    this.rest = W.settling || upright ? this.rest * Math.exp(-6 * W.h) : Math.min(1, this.rest + W.h);
    updateTone(H, W.t, W.h, brace, C, this.rest, hold * hold * (3 - 2 * hold));
  }

  begin(pl) {
    const r = this.rider;
    if (!r.bones || !r.restGlobal || !r.equip) return false;
    const seed = captureSeed(r, this.fpPoleLength);
    // Momentum: the trunk's motion over the last animated frames; the player's own velocity if there are
    // none (or they jumped: a teleport between them).
    const C = this.C;
    let mot = this.frames.length >= 2 ? trackedMotion(this.frames[this.frames.length - 2], this.frames[this.frames.length - 1], C.maxSeedSpin) : null;
    const reason = pl.lastCrash?.reason;
    if (mot && mot.v.distanceTo(pl.velocity) > 16) mot = null;
    if (!mot) mot = { v: pl.velocity.clone(), w: new THREE.Vector3() };
    if (this.kind === 'rail' && reason === 'balance') mot.v.copy(pl.velocity);
    const sp = mot.v.length();
    seed.powder = pl.powder || 0;
    seed.eject = seed.type === 'ski' && (sp > C.ejectSpeed || /tree|rock|tower|post|wall|fence/.test(this.kind || ''));
    this.env.obstacles.length = 0;
    this.env.refresh(seed.bones.pelvis.p, 4);
    const H = buildHumanoid(seed, this.env, C);
    const shift = depenetrate(H, this.env);
    H.world.easeLimits();
    const com = H.world.com(0, new THREE.Vector3());
    const groundN = this.env.normal(com.x, com.z, new THREE.Vector3());
    const dc = pl.dyn?.C || {};
    this.sev = crashSeverity({ crash: pl.lastCrash, kind: this.kind, v: mot.v, w: mot.w, n: groundN, C,
      lim: { flipStumble: dc.flipLandStumble, yawCrash: seed.type === 'snowboard' ? dc.landSlide : dc.landCrash } });
    const p0 = seed.bones.pelvis.p;
    const rnd = rng(Math.floor(p0.x * 131 + p0.z * 977 + (pl.simTime || 0) * 61));
    seedMotion(H, { vCom: mot.v, w: mot.w, com, cause: { kind: this.kind, reason }, groundN, rnd, C });
    this.stats.seed = { kind: this.kind, reason, sev: +this.sev.s.toFixed(2), tier: this.sev.tier, v: +mot.v.length().toFixed(2), vy: +mot.v.y.toFixed(2), w: +mot.w.length().toFixed(2), pl: +pl.velocity.length().toFixed(2), tracked: this.frames.length, shift: +shift.length().toFixed(3) };
    this.fallDir = new THREE.Vector3(mot.v.x, 0, mot.v.z);
    if (this.fallDir.lengthSq() < 1e-4) this.fallDir.set(-Math.sin(pl.heading), 0, -Math.cos(pl.heading));
    this.fallDir.normalize();
    this.H = H; this.seed = seed; this.shift = shift;
    this.t = 0; this.restT = 0; this.rest = 1; this.active = true;
    this.m = { peak: 0, mean: 0, sum: 0, T: 0, swings: 0, armed: FLAP.map(() => true), dist: 0, c0: null,
      tumble: 0, roll: 0, wMax: 0, armPeak: 0, armSum: 0, legPeak: 0, legSum: 0, u: null, tier: this.sev.tier, sev: this.sev.s };
    this.E0 = H.world.energy(0);
    H.world.budget = this.E0;
    this.stats.crashes++;
    return true;
  }

  stop() {
    this.active = false;
    this.rider._crashHideHead = false;
    this.H = null; this.seed = null;
    this.failed = false;
  }

  /** player.interpolate → the render fraction between the last two frame steps. */
  interpolate(alpha) { this.alpha = alpha; }

  /** rider.update while crashed: bones + gear from the bodies. */
  pose(rider) {
    if (!this.H) return;
    const ease = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
    // The pose blends in over blendTime; a lift out of the snow / a trunk eases in over shiftTime (a body that
    // landed head-first into a slope has to come out of it somehow, not in one frame).
    applyPose(rider, this.H, this.seed, this.player.renderAlpha ?? 1, ease(this.t / Math.max(1e-3, this.C.blendTime)), this.player.renderPos,
      ease(this.t / Math.max(1e-3, this.C.shiftTime ?? 0.25)));
  }
}

export function installRagdoll(opts) {
  return new RagdollController(opts);
}
