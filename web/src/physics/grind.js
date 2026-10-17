// Grind — rails, boxes, tubes and ledges (docs/map4.md §3). Opt-in per map: a course with `rails`
// gets one Grind per Player (player.js), which locks the rider onto a rail and runs State.GRIND.
//
// Rails are data (course.rails), so any map can add them:
//   { id, name, kind: 'rail' | 'box' | 'tube' | 'ledge', shape?: 'flat' | 'down' | 'kinked' | 'rainbow' | 'c' | …,
//     pts: [[x, y, z], …]   the TOP line of the grind surface (where the gear base rides), world metres,
//     half: m               contact half-width (round rail ≈ 0.05, box ≈ 0.3, tube ≈ 0.35),
//     difficulty?: 1        score multiplier (kinks, rainbows, C-rails are harder) }
//
// Lock-on (detect, every grounded / air step): the feet come down onto the top line (or ride onto it
// off a flush on-ramp) within `capture` of it, moving along it (crossing it at < maxCross°) faster than
// minSpeed. The gear's yaw against the rail picks the trick: along it = 50-50 (switch if backwards),
// across it = boardslide / lipslide (skis: slide / lipslide) — nose or tail over the rail, decided by
// the side you came from. Off-alignment locks still hold, but kick the balance.
//
// On the rail (step): speed follows the rail (gravity along it, friction, drag); the balance is an
// unstable pendulum (instability by rail kind, slides vs 50-50s, presses, time on the rail, curves and
// kinks) the rider holds with A / D (left / right of the direction of travel); past ±1 they fall off.
//   Space tap → a hop: steer in it to switch up (rotate 90° / 180° and lock again). Space held → load,
//   release → pop off (steer while loading winds up a spin, S / W preload a flip, as on the snow); a pop
//   right at the end of the rail is a perfect pop. W / S (not loading) = nose / tail press; Shift = grab.
//   Rolling off the end without a pop turns the gear back out of a slide.
// Score: pending on exit, banked on a clean ride-away (half for a sketchy one, lost on a crash).
// Events: grindStart {name, kind, trick}, grindTrick {trick} (switch-ups), grindEnd {reason, …},
//         grindScore {label, points}, grindClip, railSpark (per step while grinding: the FX listen).
import * as THREE from 'three';
import { PHYSICS as P } from '../config.js';
import { emit, on, addScore } from '../state.js';
import { clamp, angleDiff, approach, DEG } from './math.js';

export const GRIND_DEFAULTS = {
  // Lock-on
  capture: 0.34,              // m beyond the contact half-width that still locks (the feet over the rail)
  above: 0.32,                // m above the top line (this step) that still locks …
  below: 0.3,                 // … and below it (a fast fall crosses it between steps)
  minSpeed: 1.6,              // m/s along the rail
  maxCross: 52,               // deg: crossing the rail more squarely than this clips it instead
  lockSlop: 42,               // deg off a 50-50 / slide alignment that still locks (the balance pays)
  slamSpeed: 9.5,             // m/s down onto the rail: harder than this is a slam (crash)
  // Speed along the rail
  friction: { rail: 0.045, box: 0.04, tube: 0.055, ledge: 0.06 },
  slideFriction: 1.5,         // × friction with the gear across the rail (more base / edge in contact)
  drag: 0.003,                // a = k v² (an upright rider)
  stallSpeed: 0.7,            // m/s: slower than this and the grind stalls (drop off the side)
  // Balance: b in −1..1 (+ = falling to the right of the direction of travel), b'' = λ²b − c·b' + steer·G + noise
  balance: { rail: 3.4, box: 1.4, tube: 2.2, ledge: 1.8 },   // λ² (1/s²): how unstable each kind is
  noise: { rail: 1.5, box: 0.8, tube: 1.1, ledge: 1.0 },      // disturbance amplitude (1/s²)
  slideBalance: 0.85,         // × λ² in a slide (more base on the rail)
  pressBalance: 1.6,          // × λ² in a full nose / tail press
  grabBalance: 1.25,          // × λ² while grabbing
  timeHarden: 0.18,           // λ² × (1 + this · seconds on the rail): long rails get harder
  speedNoise: 0.035,          // noise × (1 + this · speed)
  steerGain: 8.5,             // 1/s² per unit of steer
  loadSteer: 0.4,             // steer share that still balances while loading a pop (the rest winds up)
  damping: 2.6,               // 1/s
  lockKick: 0.9,              // b′ (1/s) per radian of misalignment at lock-on
  offsetKick: 0.35,           // b at lock-on per unit of lateral offset (share of the capture width)
  kinkKick: 0.09,             // b′ per (rad of kink · m/s)
  curveKick: 0.5,             // b'' per g of centripetal acceleration on a curved (C) rail
  // Hops, switch-ups, pops
  tapTime: 0.17,              // s: Space released sooner than this is a hop (switch-up), later a pop off
  hopSpeed: 2.3,              // m/s up off the rail
  hopYawRate: 10,             // rad/s the gear turns in a hop while steering
  hopSnap: 32,                // deg: a hop lands within this of an alignment (else sketchy)
  popMul: 0.9,                // × the gear's pop off a rail
  popWindow: 0.16,            // s before the end that still counts as a perfect pop
  turnOut: 9,                 // rad/s the gear turns back out of a slide off the end
  reLock: 0.35,               // s before the same rail can lock again
  // Score
  points: { base: 40, perM: 16, perS: 20, switchUp: 110, spinOn: 45, kink: 35, perfectPop: 60, transfer: 120 },
  style: { slide: 1.2, lip: 1.35, switch: 1.25, press: 0.45, grab: 0.25, lockedIn: 1.15 },
  kindMult: { rail: 1.15, box: 0.85, tube: 1.0, ledge: 0.95 },
  payWindow: 2.5,             // s after leaving the rail to ride away clean and bank the grind
};

const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3();
const yawOf = (x, z) => Math.atan2(-x, -z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const CELL = 6;

/** Rails → segments with tangents, arc lengths, kinks and a spatial hash. */
export function buildRailIndex(rails) {
  const list = [], hash = new Map();
  for (const r of rails || []) {
    const pts = r.pts.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
    if (pts.length < 2) continue;
    const segs = [];
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], d = b.clone().sub(a), len = d.length();
      if (len < 1e-4) continue;
      segs.push({ a, b, t: d.divideScalar(len), len, s0: s, i: segs.length });
      s += len;
    }
    // Kink angle at the start of each segment (vs the previous one) and horizontal curvature (C-rails).
    for (let i = 1; i < segs.length; i++) {
      const p = segs[i - 1], q = segs[i];
      q.kink = Math.acos(clamp(p.t.dot(q.t), -1, 1));
      const yp = Math.atan2(p.t.x, p.t.z), yq = Math.atan2(q.t.x, q.t.z);
      q.turn = wrap(yq - yp);                       // horizontal turn at the joint (rad)
      q.kappa = Math.abs(q.turn) / Math.max(0.3, (p.len + q.len) / 2);
      q.pitchKink = Math.asin(clamp(q.t.y, -1, 1)) - Math.asin(clamp(p.t.y, -1, 1));
    }
    const rail = { ...r, pts, segs, length: s, half: r.half ?? 0.05, kind: r.kind || 'rail', difficulty: r.difficulty ?? 1 };
    // Big kinks (≥ 8°) are named kinks (score), smaller ones are the facets of a curve.
    rail.kinks = segs.filter((q) => (q.kink || 0) > 8 * DEG).length;
    list.push(rail);
    for (const g of segs) {
      const r0 = rail.half + 1.2;
      const x0 = Math.floor((Math.min(g.a.x, g.b.x) - r0) / CELL), x1 = Math.floor((Math.max(g.a.x, g.b.x) + r0) / CELL);
      const z0 = Math.floor((Math.min(g.a.z, g.b.z) - r0) / CELL), z1 = Math.floor((Math.max(g.a.z, g.b.z) + r0) / CELL);
      for (let cx = x0; cx <= x1; cx++) for (let cz = z0; cz <= z1; cz++) {
        const k = cx * 65536 + cz;
        let a = hash.get(k);
        if (!a) hash.set(k, (a = []));
        a.push([rail, g]);
      }
    }
  }
  return { list, hash };
}

/** Point and tangent at arc length s along a rail (clamped): { p, t, seg }. */
export function railAt(rail, s, out = new THREE.Vector3()) {
  const segs = rail.segs;
  let g = segs[segs.length - 1];
  for (const q of segs) if (s <= q.s0 + q.len) { g = q; break; }
  const k = clamp((s - g.s0) / g.len, 0, 1);
  return { p: out.copy(g.a).lerp(g.b, k), t: g.t, seg: g };
}

export class Grind {
  constructor(player, rails) {
    this.pl = player;
    this.C = { ...GRIND_DEFAULTS, ...(P.grind || {}) };
    for (const k of ['friction', 'balance', 'noise', 'points', 'style', 'kindMult']) this.C[k] = { ...GRIND_DEFAULTS[k], ...(P.grind?.[k] || {}) };
    this.index = buildRailIndex(rails);
    this.g = null;            // the current grind (State.GRIND)
    this.pending = null;      // a finished grind waiting for a clean ride-away
    this.after = null;        // turning out of a slide after the rail
    this.cool = 0; this.coolRail = null;
    this.offs = [
      on('landed', (e) => this.onLanded(e)),
      on('crashed', () => { if (this.pending) { emit('grindLost', { label: this.pending.label }); this.pending = null; } }),
      on('respawned', () => { this.pending = null; this.after = null; this.g = null; }),
    ];
  }

  dispose() { for (const o of this.offs) o(); }

  get active() { return !!this.g; }

  // ------------------------------------------------------------------ lock-on
  /** After a grounded / air step: lock onto a rail under the feet. Returns true when it locked. */
  detect(dt) {
    const pl = this.pl, C = this.C;
    this.cool = Math.max(0, this.cool - dt);
    this.afterStep(dt);
    if (this.pending) {
      this.pending.t += dt;
      // Rode away on the snow without a judged landing (a flush box end, a skimmed hop): bank it.
      if (pl.state === 1 && this.pending.t > 0.35 && this.pending.ground !== false) this.pay(1, 'ride');
      else if (this.pending && this.pending.t > C.payWindow + 2) this.pay(pl.state === 1 ? 1 : 0, 'late');
    }
    if (pl.state !== 1 && pl.state !== 2) return false;
    const p = pl.position, p0 = pl.prevPos, v = pl.velocity;
    const sp = v.length();
    if (sp < C.minSpeed) return false;
    if (Math.abs(wrap(pl.flip || 0)) > 40 * DEG) return false;   // upside down: no lock
    const cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL);
    const cand = this.index.hash.get(cx * 65536 + cz);
    if (!cand) return false;
    let best = null;
    for (const [rail, g] of cand) {
      if (this.cool > 0 && rail === this.coolRail) continue;
      // Closest point on the segment in plan, the top line's height there.
      const dx = g.b.x - g.a.x, dz = g.b.z - g.a.z, L2 = dx * dx + dz * dz;
      if (L2 < 1e-6) continue;
      const k = clamp(((p.x - g.a.x) * dx + (p.z - g.a.z) * dz) / L2, 0, 1);
      const qx = g.a.x + dx * k, qy = g.a.y + (g.b.y - g.a.y) * k, qz = g.a.z + dz * k;
      const dh = Math.hypot(p.x - qx, p.z - qz);
      const reach = rail.half + C.capture;
      if (dh > reach) continue;
      const dy = p.y - qy;
      const k0 = clamp(((p0.x - g.a.x) * dx + (p0.z - g.a.z) * dz) / L2, 0, 1);
      const dy0 = p0.y - (g.a.y + (g.b.y - g.a.y) * k0);
      // Coming down onto the top line (or riding onto it off a flush on-ramp).
      const grounded = pl.state === 1;
      const vertOk = grounded ? Math.abs(dy) < 0.16 : dy <= C.above && dy >= -C.below && dy0 >= -0.06;
      if (!vertOk) continue;
      const along = v.dot(g.t);
      if (Math.abs(along) < C.minSpeed) continue;
      // Crossing angle in plan.
      const th = Math.hypot(g.t.x, g.t.z) || 1, vh = Math.hypot(v.x, v.z) || 1;
      const cross = Math.acos(clamp(Math.abs(v.x * g.t.x + v.z * g.t.z) / (th * vh), 0, 1)) / DEG;
      if (cross > C.maxCross) {
        if (!grounded && dy < 0.05 && this.cool <= 0) { this.clip(rail); return false; }
        continue;
      }
      const score = dh / reach + Math.abs(dy);
      if (!best || score < best.score) best = { score, rail, g, k, dh, dy, along, side: Math.sign((p0.x - qx) * g.t.z - (p0.z - qz) * g.t.x) };
    }
    if (!best) return false;
    this.lock(best);
    return true;
  }

  /** Feet came down on the rail crossing it too squarely: a clip (stumble, lose some speed), no lock. */
  clip(rail) {
    const pl = this.pl;
    this.cool = 0.5; this.coolRail = rail;
    pl.velocity.multiplyScalar(0.75);
    pl.stumbleT = Math.max(pl.stumbleT, P.stumbleTime * 0.6);
    emit('grindClip', { name: rail.name });
    emit('stumble', 'clip');
  }

  lock({ rail, g, k, dh, along, side }) {
    const pl = this.pl, C = this.C, dyn = pl.dyn;
    const dir = along >= 0 ? 1 : -1;
    const s = g.s0 + g.len * k;
    const T = _a.copy(g.t).multiplyScalar(dir);
    const travelYaw = yawOf(T.x, T.z);
    // Gear alignment: nose along (0), switch (π), or across (±π/2).
    const rel = angleDiff(travelYaw, pl.heading);   // heading − travel, wrapped
    const snaps = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
    let snap = 0, dev = Infinity;
    for (const a of snaps) { const d = Math.abs(wrap(rel - a)); if (d < dev) { dev = d; snap = a; } }
    const wasAir = pl.state === 2;
    const vy = -Math.min(0, pl.velocity.dot(_n.set(-T.y * T.x, 1 - T.y * T.y, -T.y * T.z).normalize()));   // into the rail (its up normal)
    // Slammed onto it from too high: crash.
    if (vy > C.slamSpeed) {
      pl.position.y = g.a.y + (g.b.y - g.a.y) * k;
      pl.lastCrash = { reason: 'rail', impact: vy, air: pl.airTime, spins: 0, flips: 0 };
      this.cool = 1; this.coolRail = rail;
      pl.crash('rail');
      return;
    }
    // A finished grind still waiting: this is a transfer (rail to rail), bank it now with a bonus.
    if (this.pending) this.pay(1, 'transfer');
    const slide = Math.abs(snap) === Math.PI / 2;
    const sw = snap === Math.PI;
    // Nose or tail over the rail: the nose points away from the side we came from → boardslide.
    let lip = false;
    if (slide) {
      const noseX = -Math.sin(pl.heading), noseZ = -Math.cos(pl.heading);
      const noseSide = Math.sign(noseX * g.t.z - noseZ * g.t.x);
      lip = side !== 0 ? noseSide === side : (pl._spinTotal || 0) * snap < 0;
    }
    // Spun on: the rotation in the air before locking, in 90° steps (≥ 180 counts).
    const spun = wasAir && pl.airTime > 0.2 ? Math.round(Math.abs(pl._spinTotal || 0) / (Math.PI / 2)) * 90 : 0;
    const spinOn = spun >= 180 ? spun : 0;
    const misalign = wrap(rel - snap);
    const reach = rail.half + C.capture;
    const off = clamp(dh / reach, 0, 1) * Math.sign(side || 1) * -1;   // landed off-centre: falling that way
    this.g = {
      rail, seg: g, s, dir, v: Math.abs(along), snap, rel: snap + misalign, slide, sw, lip,
      b: clamp(off * C.offsetKick + Math.sign(misalign) * Math.min(0.35, Math.abs(misalign) * 0.6), -0.7, 0.7),
      bv: misalign * C.lockKick * (slide ? -1 : 1) + (pl.velocity.dot(_b.crossVectors(T, UP).normalize())) * 0.12,
      t: 0, dist: 0, kinks: 0, press: 0, pressT: 0, grabT: 0, absB: 0, maxB: 0,
      charge: 0, charging: false, chargeT: 0, windup: 0, flipLoad: 0, frontLoad: 0, upHeld: false,
      hop: null, tricks: [this.trickName(snap, slide, lip, sw)], switchUps: 0, spinOn, phase: (rail.id ? hashStr(rail.id) : 0) % 97 + s * 0.37,
      dev: dev / DEG, entryAir: wasAir ? pl.airTime : 0, perfectPop: false,
    };
    this.after = null;
    pl.state = 5;   // State.GRIND
    pl.airTime = 0;
    pl.grab = 0; pl.grabName = null;
    pl.flip = 0; pl.flipRate = 0; pl.flipTuck = 0; pl.spinRate = 0; pl.spinTuck = 0;
    pl.stop = 0; pl.butter = 0; pl.press = 0; pl.plow = 0;
    if (pl.flowBoost === undefined) pl.flowBoost = 0;
    dyn.charge = 0; dyn.charging = false; dyn.windup = 0; dyn.flipLoad = 0; dyn.frontLoad = 0; dyn.stop = 0; dyn.butter = 0; dyn.press = 0;
    dyn.yawRate = 0;
    this.place(0);
    pl.landingVy = Math.min(vy, 6); pl.landingEvent++;   // a little squash on the lock
    emit('grindStart', { name: rail.name, kind: rail.kind, trick: this.g.tricks[0], spinOn, dev: this.g.dev, rail });
  }

  trickName(snap, slide, lip, sw) {
    const board = this.pl.equipment?.type === 'snowboard';
    if (!slide) return sw ? 'Switch 50-50' : '50-50';
    const name = lip ? 'Lipslide' : board ? 'Boardslide' : 'Slide';
    if (!board) return name;
    // Frontside / backside: chest (toe edge) facing down the rail = FS.
    const toeRight = this.pl.stance === 'goofy' ? -1 : 1;   // toe edge on the nose's right (regular)
    const facing = -Math.sign(snap) * toeRight;           // + = the toes face the direction of travel
    return `${facing > 0 ? 'FS' : 'BS'} ${name}`;
  }

  // ------------------------------------------------------------------ on the rail
  step(dt) {
    const g = this.g;
    if (!g) { this.pl.state = 2; return; }   // (should not happen) fall back to the air
    const pl = this.pl, C = this.C, ctrl = pl._ctrl, dyn = pl.dyn, rail = g.rail;
    const steer = ctrl.active ? clamp(ctrl.steer, -1, 1) : 0;
    g.t += dt;
    // --- controls: load / hop / pop, press, grab
    if (ctrl.active && ctrl.jump && !g.hop) {
      if (!g.charging) { g.charging = true; g.chargeT = 0; g.upHeld = ctrl.up > 0.3; }
      g.chargeT += dt;
      g.charge = Math.min(1, g.chargeT / dyn.C.chargeTime);
      g.windup = approach(g.windup, steer, dt / 0.25);
      if (ctrl.up < 0.2) g.upHeld = false;
      g.flipLoad = approach(g.flipLoad, ctrl.brake > 0.3 ? 1 : 0, dt / 0.35);
      g.frontLoad = approach(g.frontLoad, ctrl.up > 0.3 && !g.upHeld && ctrl.brake < 0.3 ? 1 : 0, dt / 0.35);
    } else if (g.charging) {
      g.charging = false;
      if (g.chargeT < C.tapTime) this.hop();
      else { this.popOff(); return; }
    } else { g.charge = Math.max(0, g.charge - dt * 6); g.windup = approach(g.windup, 0, dt / 0.12); g.flipLoad = approach(g.flipLoad, 0, dt / 0.1); g.frontLoad = approach(g.frontLoad, 0, dt / 0.1); }
    const wantPress = ctrl.active && !g.charging && !g.hop ? clamp((ctrl.up > 0.3 ? 1 : 0) - (ctrl.brake > 0.3 ? 1 : 0), -1, 1) : 0;
    g.press += (wantPress - g.press) * (1 - Math.exp(-8 * dt));
    if (Math.abs(g.press) > 0.6) g.pressT += dt;
    const grabbing = ctrl.active && ctrl.tuck > 0.5 && !g.hop;
    pl.grab += ((grabbing ? 1 : 0) - pl.grab) * (1 - Math.exp(-(grabbing ? 7 : 9) * dt));
    if (pl.grab > 0.7) { g.grabT += dt; pl.grabName = pl.grabName || dyn.grabName(); }
    else if (!grabbing && pl.grab < 0.3) pl.grabName = null;
    // --- balance (frozen in a hop: you are off the rail)
    if (!g.hop) {
      const K = C.balance[rail.kind] ?? C.balance.rail;
      const lam = K * (g.slide ? C.slideBalance : 1) * (1 + Math.abs(g.press) * (C.pressBalance - 1)) * (1 + pl.grab * (C.grabBalance - 1))
        * (1 + C.timeHarden * g.t) * (rail.wobble ?? 1);
      const ph = g.phase + g.t;
      const noise = (C.noise[rail.kind] ?? C.noise.rail) * (1 + C.speedNoise * g.v) * (Math.sin(ph * 1.7 + 0.4) * 0.6 + Math.sin(ph * 3.3 + 1.9) * 0.4);
      // On a curved (C) rail the rider leans into the curve; speed pushes the balance out of it.
      const kappa = this.curvature();
      const curve = C.curveKick * (g.v * g.v * kappa.k / P.gravity) * kappa.out;
      const ctl = C.steerGain * steer * (g.charging ? C.loadSteer : 1);
      g.bv += (lam * g.b + noise + curve + ctl - C.damping * g.bv) * dt;
      g.b += g.bv * dt;
    } else g.bv *= Math.exp(-4 * dt);
    g.absB += Math.abs(g.b) * dt;
    g.maxB = Math.max(g.maxB, Math.abs(g.b));
    if (Math.abs(g.b) >= 1) { this.bail(); return; }
    // --- speed along the rail
    const T = _a.copy(g.seg.t).multiplyScalar(g.dir);
    const mu = (C.friction[rail.kind] ?? C.friction.rail) * (g.slide ? C.slideFriction : 1);
    const acc = -P.gravity * T.y - mu * P.gravity * Math.sqrt(Math.max(0, 1 - T.y * T.y)) - C.drag * g.v * g.v;
    g.v += acc * dt;
    if (g.v < C.stallSpeed) { this.stall(); return; }
    // --- advance (segments, kinks, the end)
    let ds = g.v * dt;
    g.dist += ds;
    while (ds > 0) {
      const sNext = g.s + ds * g.dir;
      const lo = g.seg.s0, hi = g.seg.s0 + g.seg.len;
      if (sNext >= lo && sNext <= hi) { g.s = sNext; ds = 0; break; }
      const edge = g.dir > 0 ? hi : lo;
      ds -= Math.abs(edge - g.s);
      const ni = g.seg.i + g.dir;
      if (ni < 0 || ni >= rail.segs.length) { g.s = edge; this.place(dt); this.leave('end', dt); return; }
      const next = rail.segs[ni];
      // A kink kicks the balance (harder the faster and sharper); facets of a curve barely do.
      const joint = g.dir > 0 ? next : g.seg;
      const kink = joint.kink || 0;
      if (kink > 8 * DEG) { g.kinks++; if (!g.hop) g.bv += (g.phase % 2 > 1 ? 1 : -1) * C.kinkKick * kink / DEG * 0.0175 * g.v * 3; emit('grindKink', { kink: kink / DEG }); }
      g.seg = next; g.s = edge;
    }
    // --- the hop (switch-ups)
    if (g.hop) {
      const h = g.hop;
      h.t += dt; h.vy -= P.gravity * dt; h.y += h.vy * dt;
      if (Math.abs(steer) > 0.3) h.turned += -steer * C.hopYawRate * dt;   // steer right → turn right (heading decreases)
      g.rel = h.rel0 + h.turned;
      if (h.y <= 0 && h.vy < 0) this.hopLand();
    } else {
      // Settle the gear onto its alignment (a sketchy lock straightens out over ~0.3 s).
      g.rel += wrap(g.snap - g.rel) * (1 - Math.exp(-6 * dt));
    }
    this.place(dt);
    // --- perfect-pop window at the end: release the load right as the rail ends
    g.toEnd = g.dir > 0 ? rail.length - g.s : g.s;
    // Rolling toward the end of a slide without a pop: turn the gear back out over the last metres.
    // --- outputs
    pl.squat = g.charge;
    pl.windup = g.windup;
    pl.flipLoad = g.flipLoad - g.frontLoad;
    pl.press = g.slide ? 0 : g.press;
    pl.turnVelocity = 0;
    if (pl.flow) pl.flow.idle = 0;                       // a grind keeps the line chain alive
    emit('railSpark', { kind: rail.kind, v: g.v, b: g.b });
  }

  /** Horizontal curvature at the rider and which way is "out" of the curve in the balance frame (+1 right). */
  curvature() {
    const g = this.g, segs = g.rail.segs, i = g.seg.i;
    const next = segs[i + g.dir] || null;
    const joint = g.dir > 0 ? next : g.seg;
    if (!joint || !joint.kappa || (joint.kink || 0) > 8 * DEG) return { k: 0, out: 0 };
    // turn > 0: the rail bends left (yaw increasing) going forward along the index; out = right.
    const turnLeft = joint.turn * g.dir > 0;
    return { k: joint.kappa, out: turnLeft ? 1 : -1 };
  }

  /** Put the rider on the rail at the current s (plus the hop) and set heading, velocity, normal. */
  place(dt) {
    const pl = this.pl, g = this.g;
    const at = railAt(g.rail, g.s, _b);
    const T = _a.copy(g.seg.t).multiplyScalar(g.dir);
    pl.position.copy(at.p);
    if (g.hop) pl.position.y += g.hop.y;
    pl.velocity.copy(T).multiplyScalar(g.v);
    if (g.hop) pl.velocity.y += g.hop.vy;
    pl.speed = g.v;
    const travelYaw = yawOf(T.x, T.z);
    pl.heading = travelYaw + g.rel;
    // The gear's up: perpendicular to the rail in its vertical plane (a down rail pitches a 50-50).
    pl.groundNormal.set(-T.y * T.x, 1 - T.y * T.y, -T.y * T.z).normalize();
    // Visual lean: the balance shows as a roll toward the fall (50-50) / a tip toward nose or tail (slides).
    const sw = Math.abs(wrap(g.rel)) > Math.PI / 2;
    pl.travelSign = g.slide ? pl.travelSign : sw ? -1 : 1;
    pl.dyn.travel = pl.travelSign;
    pl.edgeAngle = 0; pl.skidAngle = 0; pl.latAccel = 0;
    // The fall direction (right of travel × b) in the gear frame: roll across the gear, pitch along it (+ = toward the nose).
    const nx = -Math.sin(pl.heading), nz = -Math.cos(pl.heading);
    const rx = -T.z, rz = T.x;                                  // right of travel (plan)
    const hr = Math.hypot(rx, rz) || 1;
    const along = (rx * nx + rz * nz) / hr, across = (rx * -nz + rz * nx) / hr;   // · nose, · nose-right
    pl.grindTilt = pl.grindTilt || { roll: 0, pitch: 0, slide: false };
    pl.grindTilt.roll = g.b * across; pl.grindTilt.pitch = g.b * along; pl.grindTilt.slide = g.slide;
    pl.grindTilt.travel = wrap(-g.rel);                         // travel direction relative to the nose (rad, + = left)
    pl.gearLatAccel = 0;
    pl.carve = 0; pl.skid = 0; pl.sink = 0; pl.tuck = 0;
    void dt;
  }

  hop() {
    const g = this.g, C = this.C;
    g.hop = { t: 0, y: 0, vy: C.hopSpeed, rel0: g.rel, turned: 0 };
    emit('grindHop', {});
  }

  hopLand() {
    const g = this.g, C = this.C, h = g.hop;
    g.hop = null;
    const snaps = [0, Math.PI / 2, -Math.PI / 2, Math.PI];
    let snap = g.snap, dev = Infinity;
    for (const a of snaps) { const d = Math.abs(wrap(g.rel - a)); if (d < dev) { dev = d; snap = a; } }
    if (dev > C.hopSnap * DEG) g.bv += Math.sign(wrap(g.rel - snap) || 1) * 1.6;   // came down crooked
    g.bv += Math.sign(g.b || 1) * 0.15;
    if (Math.abs(wrap(snap - g.snap)) > 0.1) {
      const slide = Math.abs(snap) === Math.PI / 2, sw = snap === Math.PI;
      // A 180 switch-up flips which side the nose crossed from; the boardslide / lipslide follows the turn.
      const lip = slide ? (g.slide ? !g.lip : (h.turned > 0) === (snap > 0)) : false;
      const deg = Math.round(Math.abs(wrap(snap - g.snap)) / DEG / 90) * 90;
      g.snap = snap; g.slide = slide; g.sw = sw; g.lip = lip;
      const name = this.trickName(snap, slide, lip, sw);
      g.tricks.push(name);
      g.switchUps++;
      emit('grindTrick', { trick: name, deg });
    }
    this.pl.landingVy = 2; this.pl.landingEvent++;
  }

  // ------------------------------------------------------------------ leaving
  /** Pop off (Space released after loading): the gear's pop along the rail's up, spin / flip sets as on the snow. */
  popOff() {
    const pl = this.pl, g = this.g, C = this.C, dyn = pl.dyn;
    // Right at the end of the rail = a perfect pop (rotation set 1); mid-rail = an ollie off (0.8).
    const end = g.toEnd ?? 99;
    const perfect = end <= g.v * C.popWindow + 0.25;
    g.perfectPop = perfect;
    dyn.charge = g.charge; dyn.windup = g.windup; dyn.flipLoad = g.flipLoad; dyn.frontLoad = g.frontLoad; dyn._popEnd = 'tail'; dyn._upHeld = g.upHeld;
    pl.lastPopQ = perfect ? 1 : 0.8;
    pl.lastLip = 0;
    const pop = dyn.pop() * C.popMul;
    pl.lastPop = pop;
    this.leave('pop', 0, pop);
  }

  stall() { this.leave('stall', 0); }

  /**
   * Leave the rail: 'end' (rolled off), 'pop', 'stall' (too slow: step off the side). The rider goes to the
   * air with the rail's velocity; a slide turns back out (the gear squares up to the path) unless spun.
   */
  leave(reason, dt, pop = 0) {
    const pl = this.pl, g = this.g, C = this.C, dyn = pl.dyn;
    const T = _a.copy(g.seg.t).multiplyScalar(g.dir);
    const up = _n.set(-T.y * T.x, 1 - T.y * T.y, -T.y * T.z).normalize();
    pl.velocity.copy(T).multiplyScalar(g.v);
    if (reason === 'stall') {
      // Step off the side the balance leans to.
      const side = _b.crossVectors(T, UP).normalize().multiplyScalar(Math.sign(g.b || 1) * 1.2);
      pl.velocity.add(side);
    }
    if (pop) pl.velocity.addScaledVector(up, pop);
    pl.position.addScaledVector(up, 0.04);
    this.g = null;
    this.cool = C.reLock; this.coolRail = g.rail;
    dyn.yawRate = 0;
    const popped = reason === 'pop';
    if (!popped) { dyn.charge = 0; dyn.charging = false; dyn.windup = 0; dyn.flipLoad = 0; dyn.frontLoad = 0; }
    pl.state = 2;
    pl.enterAir(popped);
    // Count the air rotation from the gear's offset to the path, so turning out of a slide is no "180".
    const off = wrap(g.rel);
    pl._spinTotal = g.slide ? off : 0;
    // Out of a slide: turn the gear back to the alignment it came from (unless a spin was wound up).
    const spun = popped && Math.abs(g.windup) > 0.3;
    if (g.slide && !spun) this.after = { t: 0, target: g.rel - off + (Math.abs(off) > Math.PI / 2 ? Math.sign(off) * Math.PI : 0) };
    else this.after = null;
    const done = { ...g, reason, exitYaw: pl.heading, exitOff: pl._spinTotal };
    this.pending = this.score(done);
    emit('grindEnd', { reason, name: g.rail.name, dist: g.dist, time: g.t, tricks: g.tricks, label: this.pending?.label, points: this.pending?.points });
    void dt;
  }

  /** Lost the balance: off the side, a crash on the snow below. */
  bail() {
    const pl = this.pl, g = this.g;
    const T = _a.copy(g.seg.t).multiplyScalar(g.dir);
    const side = _b.crossVectors(T, UP).normalize();
    pl.velocity.copy(T).multiplyScalar(g.v * 0.7).addScaledVector(side, Math.sign(g.b) * 2.2);
    this.g = null;
    this.pending = null;
    this.cool = 0.6; this.coolRail = g.rail;
    pl.lastCrash = { reason: 'balance', impact: 0, air: 0, spins: 0, flips: 0 };
    emit('grindEnd', { reason: 'bail', name: g.rail.name, dist: g.dist, time: g.t, tricks: g.tricks });
    pl.state = 2;
    pl.crash('rail');
    // Drop to the snow beside the rail (crashStep slides along it from there).
    const T2 = pl.terrain;
    pl.position.addScaledVector(side, Math.sign(g.b) * 0.5);
    pl.position.y = T2.getHeight(pl.position.x, pl.position.z);
  }

  /** After leaving a slide: turn the gear back in line with the path over ~0.2 s. */
  afterStep(dt) {
    const a = this.after, pl = this.pl;
    if (!a) return;
    a.t += dt;
    if (pl.state !== 2 || a.t > 0.6) { this.after = null; return; }
    if (Math.abs(pl.spinRate) > 2) { this.after = null; return; }   // the rider threw a spin instead
    const travel = yawOf(pl.velocity.x, pl.velocity.z);
    const want = travel + wrap(a.target);
    const d = wrap(want - pl.heading);
    const step = Math.sign(d) * Math.min(Math.abs(d), this.C.turnOut * dt);
    pl.heading += step;
    pl._spinTotal -= 0;   // (direct heading changes are not counted as spin)
    if (Math.abs(d) < 0.02) this.after = null;
  }

  // ------------------------------------------------------------------ score
  score(g) {
    const C = this.C, Pt = C.points, S = C.style;
    if (g.dist < 0.8 && g.t < 0.15) return null;
    const rail = g.rail;
    let mult = (C.kindMult[rail.kind] ?? 1) * rail.difficulty;
    const last = g.tricks[g.tricks.length - 1];
    if (g.slide || g.tricks.some((t) => /slide/i.test(t))) mult *= S.slide;
    if (g.tricks.some((t) => /Lipslide/.test(t))) mult *= S.lip / S.slide;
    if (g.tricks.some((t) => /^Switch/.test(t))) mult *= S.switch;
    const pressShare = g.t > 0 ? clamp(g.pressT / g.t, 0, 1) : 0;
    mult *= 1 + S.press * pressShare + (g.grabT > 0.3 ? S.grab : 0);
    const avgB = g.t > 0 ? g.absB / g.t : 1;
    const locked = avgB < 0.22 && g.maxB < 0.6 && g.dist > 3;
    if (locked) mult *= S.lockedIn;
    let pts = (Pt.base + Pt.perM * g.dist + Pt.perS * g.t) * mult;
    pts += g.switchUps * Pt.switchUp + (g.spinOn / 90) * Pt.spinOn + g.kinks * Pt.kink + (g.perfectPop ? Pt.perfectPop : 0);
    if (g.reason === 'stall') pts *= 0.5;
    // Label: the tricks in order, the press / grab, the length.
    const press = pressShare > 0.4 ? (g.press >= 0 ? 'Nose press ' : 'Tail press ') : '';
    const seq = g.tricks.length > 3 ? `${g.tricks[0]} … ${last}` : g.tricks.join(' to ');
    const on = g.spinOn ? `${g.spinOn} on ` : '';
    let label = `${on}${press}${seq}${g.grabT > 0.3 ? ' grab' : ''} · ${g.dist.toFixed(g.dist < 10 ? 1 : 0)} m`;
    if (locked) label = `Locked-in ${label}`;
    return {
      label, points: Math.round(pts), t: 0, ground: true, rail: rail.name, kind: rail.kind, dist: g.dist, time: g.t,
      tricks: g.tricks.slice(), switchUps: g.switchUps, spinOn: g.spinOn, perfectPop: g.perfectPop, locked, reason: g.reason, exitYaw: g.exitYaw, exitOff: g.exitOff || 0,
    };
  }

  /** A judged landing after a rail: clean banks the grind (and names the spin out), sketchy banks half. */
  onLanded(e) {
    const p = this.pending;
    if (!p || this.g) return;
    this.pay(e.clean ? 1 : e.result === 'crash' ? 0 : 0.5, 'land', e);
  }

  pay(share, how, landing = null) {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    if (share <= 0) { emit('grindLost', { label: p.label }); return; }
    let label = p.label, pts = p.points;
    if (how === 'transfer') { label = `${label} · transfer`; pts += this.C.points.transfer; }
    // Spun out: the rotation from the rail to the landing, in 90° steps.
    if (landing && p.exitYaw !== undefined) {
      const out = Math.round(Math.abs((this.pl._spinTotal || 0) - p.exitOff) / (Math.PI / 2)) * 90;
      if (out >= 180) { label = `${label} · ${out} out`; pts += (out / 90) * this.C.points.spinOn; }
    }
    if (p.perfectPop) label = `${label} · perfect pop`;
    pts = Math.round(pts * share * (this.pl.flow ? this.pl.flow.scoreMul() : 1));
    if (share < 1) label = `Sketchy ${label}`;
    addScore(label, pts);
    emit('grindScore', { ...p, label, points: pts });
  }
}

function hashStr(s) { let h = 2166136261; for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) % 1000; }
