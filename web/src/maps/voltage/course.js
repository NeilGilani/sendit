// Voltage Park (map 4) — an event terrain park: an Olympic-style slopestyle course (three rail sections,
// then three big table-tops), three park lanes (small / medium / pro), a jib garden, a 22 ft superpipe,
// a scaffold big air, skew kickers, quarterpipes and a finish arena. docs/map4.md.
//
// Course-compatible (course.js / ravenspire API): path, length, dropsAt, finishAt, progress(), height(),
// natural(), macro(), generate(), menuFocus(), lifts, forestAt / pisteAt / treeline / rockOk / corniceOk
// (scatter), park:false + heightAt (features hook: every park feature is an analytic surface over the base
// snow, shapes.js), rails (physics/grind.js), dropZones, lineGoals, challenge, physics / camera (tuning.js),
// featureAt (named take-offs), onPlayer (pipe air, sweet-spot and pop feedback).
import * as THREE from 'three';
import { fbm, ridged, vnoise, smooth, sstep, mulberry32 } from './noise.js';
import { ProfileBuilder, ProfileFeature, PipeFeature, FeatureIndex, STEP } from './shapes.js';
import {
  TILE, START_X, TOP, FINISH_U, PARK_HALF, PROFILE, BEHIND, JIBS, JUMPS, LANES, LANE_JUMPS, STEPS, HIPS, QUARTERPIPES,
  ROLLERS, LANE_JIBS, GRID_JIBS, PIPE, BIG_AIR, DROP_ZONES, LINE_GOALS,
} from './layout.js';
import { VOLTAGE_PHYSICS, VOLTAGE_CAMERA } from './tuning.js';
import { attachPark } from './park.js';
import { SlopeJudge } from './scoring.js';

const U_MIN = -6000, U_MAX = 9000;
const DEG = Math.PI / 180;
const SECTION = { 1: 'Section 1', 2: 'Section 2', 3: 'Section 3' };

export class VoltageCourse {
  constructor() {
    this.name = 'Voltage Park';
    this.id = 'voltage-park';
    this.meta = { id: 'voltage-park' };
    this.park = false;                          // features.js: no generic kickers / rollers / banners (we build our own)
    this.life = { skiers: 0, lodge: false };
    this.spawn = { rockClusterChance: 0, treeStep: 8, treeMax: 7000, fenceFrom: 0, fenceTo: 0, ridgeFenceMax: 0, runCorridor: 12 };
    this.physics = VOLTAGE_PHYSICS;
    this.camera = VOLTAGE_CAMERA;
    this.water = -1e5;
    this.edgeHint = 'Edge of the park — head back to the features';
    this.lifts = [];
    this.buildTables();
    this.base = (x, z) => this.natural(x, z);
    this.features = [];
    this.rails = [];
    this.named = [];                             // { name, kind, x, z, r } take-off zones for featureAt
    this.walls = [];                             // quarterpipe walls (vert assist)
    this.buildAll();
    this.index = new FeatureIndex(this.features);
    this.buildPath();
    this.treeline = TOP + 400;
    this.lineGoals = LINE_GOALS.map(([name, bonus, ...features]) => ({ name, bonus, features }));
    this.dropZones = this.buildDropZones();
    this.obstacles = [];                         // light towers, arch posts (props.js fills it)
    this.judgeRun = new SlopeJudge(this);
    // Challenge = a judged slopestyle run (activities.js `challenge.judge`): no gates, medals by the judges' score.
    this.challenge = { gates: [], flakes: this.placeFlakes(), medalSpeeds: { gold: 13, silver: 11, bronze: 9 }, judge: () => this.judgeRun.judge() };
  }

  // ---------------------------------------------------------------- base snow
  buildTables() {
    const n = U_MAX - U_MIN + 1;
    const seg = (list) => { const out = []; let acc = 0; for (const [len, deg] of list) { out.push([acc, acc + len, Math.tan(deg * DEG)]); acc += len; } return out; };
    const fwd = seg(PROFILE), back = seg(BEHIND);
    const gAt = (u) => {
      if (u >= 0) { for (const s of fwd) if (u < s[1]) return s[2]; return fwd[fwd.length - 1][2]; }
      for (const s of back) if (-u < s[1]) return s[2];
      return back[back.length - 1][2];
    };
    const grad = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const u = U_MIN + i;
      let g = 0, w = 0;
      for (let k = -10; k <= 10; k += 2) { g += gAt(u + k); w++; }
      grad[i] = g / w;
    }
    const e = new Float64Array(n), i0 = -U_MIN;
    e[i0] = TOP;
    for (let i = i0 + 1; i < n; i++) e[i] = e[i - 1] - grad[i];
    for (let i = i0 - 1; i >= 0; i--) e[i] = e[i + 1] + grad[i];
    this.e0 = e;
  }

  profileAt(u) {
    const f = Math.min(Math.max(u - U_MIN, 0), U_MAX - U_MIN - 1.0001);
    const i = f | 0, k = f - i;
    return this.e0[i] + (this.e0[i + 1] - this.e0[i]) * k;
  }

  /** Mountains around the park (also the mid ring and the 30 km backdrop). */
  macro(x, z) {
    const u = x - START_X, v = z, av = Math.abs(v);
    let e = this.profileAt(u);
    // Banks either side of the groomed park, rising into forested shoulders and ridges.
    const side = av - PARK_HALF;
    if (side > 0) e += side * 0.32 * sstep(0, 120, side) + 40 * sstep(60, 400, side) * (fbm(x / 300, z / 300, 3) - 0.3);
    // Behind the start: the summit ridge the park drops off.
    if (u < -60) e += (-u - 60) * 0.25 * sstep(-60, -300, u);
    const m = Math.max(side - 250, -u - 700, u - 1500, (Math.hypot(x, z) - 2600) * 0.8);
    if (m > -200) {
      const k = sstep(-200, 1100, m);
      const far = sstep(3500, 9000, Math.hypot(x, z));
      e += k * (900 * (1 + 0.8 * far) * Math.pow(ridged(x / 2300 + 4.1, z / 2300 - 1.3, 5), 1.3) + 200 * (fbm(x / 800, z / 800, 3) - 0.5)) + far * 900;
    }
    // A horn behind the start (the park's backdrop when you look up from the finish arena).
    const hx = x - (START_X - 1500), hz = z + 380, r = Math.hypot(hx, hz);
    if (r < 2600) { const top = TOP + 1250 - r * 1.05 + (ridged(hx / 400, hz / 400, 3) - 0.5) * 140 * sstep(40, 300, r); if (top > e) e += (top - e) * smooth((top - e) / 60); }
    return e;
  }

  /** The groomed base snow (no features). */
  natural(x, z) {
    let e = this.macro(x, z);
    const u = x - START_X, v = z;
    // A little natural relief off the groomed park only (the park itself is cat-smooth).
    const off = sstep(PARK_HALF - 10, PARK_HALF + 40, Math.abs(v)) + sstep(-60, -140, u) + sstep(FINISH_U + 200, FINISH_U + 320, u);
    if (off > 0) e += Math.min(1, off) * ((fbm(x / 60, z / 60, 3) - 0.5) * 4 + (vnoise(x / 13, z / 13) - 0.5) * 0.6);
    return e;
  }

  height(x, z) { return this.natural(x, z); }

  // ---------------------------------------------------------------- features
  P(u, v, yaw = 0, hw = 3) { return new ProfileBuilder(this.base, { x: START_X + u, z: v, yaw: yaw * DEG, hw }); }

  buildAll() {
    for (const s of JUMPS) this.addJump(s, { slope: true });
    for (const s of LANE_JUMPS) this.addJump(s, {});
    for (const s of HIPS) this.addJump({ ...s, yaw: s.turn }, { skew: true });
    for (const s of STEPS) s.kind === 'stepup' ? this.addStepUp(s) : this.addJump({ ...s, deckDeg: -14 }, {});
    for (const s of QUARTERPIPES) this.addQP(s);
    for (const r of ROLLERS) this.addRoller(...r);
    for (const s of JIBS) this.addJib(s, SECTION[s.sec]);
    for (const s of LANE_JIBS) this.addJib(s, null);
    for (const s of GRID_JIBS) this.addJib({ ...s, lane: 'grid' }, 'The Grid');
    this.addPipe(PIPE);
    this.addBigAir(BIG_AIR);
  }

  /**
   * A kicker along builder B0() ending at lipA, its lip kickH over the in-run snow there, at lipDeg, with the
   * last `straight` m straight (research §8: no inversion surprises). The transition radius is whatever
   * gives that height (≤ Rmax). Leaves the pen on the lip.
   */
  kicker(B0, lipA, kickH, lipDeg, Rmax = 40, straight = 2) {
    let B = null, shift = 0;
    for (let it = 0; it < 4; it++) {
      B = B0();
      const g = B.baseAngle(lipA - 4) * DEG, a1 = lipDeg * DEG;
      const hOf = (R) => R * (Math.cos(g) - Math.cos(a1)) + straight * Math.sin(a1) + (R * (Math.sin(a1) - Math.sin(g)) + straight * Math.cos(a1)) * Math.tan(-g);
      let lo = 0.3, hi = Rmax;
      if (hOf(hi) < kickH) lo = hi;
      else for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (hOf(m) < kickH) lo = m; else hi = m; }
      const R = lo;
      const run = R * (Math.sin(a1) - Math.sin(g)) + straight * Math.cos(a1);
      const start = Math.max(0, lipA - run - shift);
      B.snow(start);
      B.arc(R, lipDeg);
      const want = B.baseAt(lipA) + kickH;
      const extra = Math.max(straight, (want - B.y) / Math.tan(a1));
      B.line(extra);
      shift += B.a - lipA;
      if (Math.abs(B.a - lipA) < 0.05) break;
    }
    return B;
  }

  /**
   * A table-top: kicker → lip face → deck (table) → rounded knuckle → constant-EFH landing → run-out.
   * Beside the kicker a 20° ride-up ramp leads onto the deck (go around the kicker, roll the deck).
   */
  addJump(s, { slope = false, skew = false }) {
    const yaw = s.yaw || 0;
    const back = 40;                                     // the axis starts this far above the lip
    const u0 = s.u - back * Math.cos(yaw * DEG), v0 = s.v - back * Math.sin(yaw * DEG);
    const mk = () => this.P(u0, v0, yaw, s.deckHw);       // full deck width all along: the kicker is the centre, the ride-up ramp the sides
    const B = this.kicker(mk, back, s.kickH, s.lipDeg, s.R);
    B.mark('lip');
    const lip = { a: B.a, y: B.y, ang: s.lipDeg };
    // Lip face down to the deck, the deck (table), then the EFH landing.
    const deckDrop = Math.min(0.6, s.kickH * 0.3);
    B.lineBy(-deckDrop, -58);
    const deckDeg = s.deckDeg ?? 0;                       // a level table: the snow falls away under it
    const remain = s.table - (B.a - lip.a);
    if (remain > 0.5) B.line(remain, deckDeg);
    B.width(s.landHw);
    const outR = s.outR ?? 30;
    const land = B.efhLanding(lip, { vMax: s.vMax, vn: s.vn ?? 3.4, Rk: s.Rk ?? Math.max(3, s.table * 0.22), minDeg: 22, maxDeg: s.maxDeg ?? 38, extra: s.extra ?? 8, outR });
    B.toBase(outR, 4);
    const f = B.build({ name: s.name, kind: 'jump', lane: s.lane ?? (slope ? 'slope' : null), rake: 1.1 });
    // Side profile: a ride-up ramp to the deck beside the kicker (20°), the same as the deck from the lip on.
    const Ys = new Float32Array(f.Y.length);
    const deckY = f.yAt(lip.a + 0.6);
    for (let i = 0; i < Ys.length; i++) {
      const a = f.a0 + i * STEP;
      if (a >= lip.a + 0.5) { Ys[i] = f.Y[i]; continue; }
      const b = B.baseAt(a);
      Ys[i] = Math.max(b - 0.2, deckY - (lip.a + 0.5 - a) * Math.tan(20 * DEG));
    }
    f.side = { Y: Ys, hwc: s.hw, blend: 1.4 };
    f.jump = { ...s, lipA: lip.a, lipY: lip.y, land, knuckle: f.marks.knuckle, skew };
    this.features.push(f);
    const [lx, lz] = f.world(lip.a);
    this.named.push({ name: s.name, kind: 'jump', x: lx, z: lz, r: Math.max(6, s.hw + 3), back: 14, f });
    return f;
  }

  /** Step-up: a steep kicker over a gap onto a raised deck (land near the top of the flight), roll off the back. */
  addStepUp(s) {
    const back = 30;
    const mk = () => this.P(s.u - back, s.v, 0, s.hw);
    const B = this.kicker(mk, back, s.kickH, s.lipDeg, s.R);
    B.mark('lip');
    const lipY = B.y;
    B.lineBy(-(B.y - B.baseAt(B.a)) + 0.05, -60);
    B.snow(Math.max(0.5, s.gap - 2.5));
    // The step: a 34° face up to the deck, the deck, then down the back at 30° to the snow.
    B.width(s.landHw);
    const deckY = lipY + s.rise;
    B.lineBy(deckY - B.y, 34);
    B.mark('deck');
    B.arc(4, -14).line(s.deckLen, -14);   // the deck falls with the hill (a little flatter): you land near the top of the flight
    B.arc(5, -36).toBase(16, 3);
    const f = B.build({ name: s.name, kind: 'stepup', lane: s.lane, rake: 1.1 });
    f.jump = { ...s, lipA: f.marks.lip.a, lipY };
    this.features.push(f);
    const [lx, lz] = f.world(f.marks.lip.a);
    this.named.push({ name: s.name, kind: 'jump', x: lx, z: lz, r: s.hw + 3, back: 12, f });
  }

  /** Quarterpipe across the fall line: transition radius R up to 82°, height H, a deck, a ramp down the back. */
  addQP(s) {
    const back = 6;
    const B = this.P(s.u - back, s.v, 0, s.w / 2);
    B.snow(back);
    B.mark('foot');
    B.arc(s.R, 80);
    B.lineBy(s.H - (B.y - B.baseAt(B.a)), 80);
    B.mark('coping');
    B.line(3, 0).line(2.5, -40);
    B.toBase(3, 2);
    const f = B.build({ name: s.name, kind: 'qp', lane: null, rake: 0.6 });
    this.features.push(f);
    // The wall (≥ 55°) sends you straight up (pipe.js-style vert): from where the transition passes 55°.
    const a55 = f.marks.foot.a + s.R * Math.sin(55 * DEG);
    this.walls.push({ f, a0: a55, a1: f.marks.coping.a + 0.6, hw: s.w / 2, nx: -f.fx, nz: -f.fz, name: s.name });
    const [cx, cz] = f.world(f.marks.coping.a);
    this.named.push({ name: s.name, kind: 'qp', x: cx, z: cz, r: s.w / 2 + 1, back: 6, f });
  }

  addRoller(u, v, hw, H, sig) {
    const B = this.P(u - 3 * sig, v, 0, hw);
    const pts = [];
    for (let a = 0; a <= 6 * sig; a += STEP) pts.push([a, B.baseAt(a) + H * Math.exp(-(((a - 3 * sig) / sig) ** 2)), hw]);
    B.pts = pts;
    this.features.push(B.build({ name: 'Roller', kind: 'roller', rake: 2.5, minRun: 3 }));
  }

  /**
   * A jib: the rail / box / tube (grind data, course.rails), a snow mound under it where it stands over the
   * snow by more than its clearance (flat sections on a slope), and its on-ramp (flush or gap-on).
   */
  addJib(s, section) {
    const yaw = (s.yaw || 0) * DEG;
    const fx = Math.cos(yaw), fz = Math.sin(yaw);
    const x0 = START_X + s.u, z0 = s.v;
    const y0 = this.base(x0, z0) + s.h0;
    const half = s.half ?? (s.kind === 'tube' ? 0.45 : s.kind === 'box' ? 0.3 : s.kind === 'ledge' ? 0.35 : 0.04);
    const pts = [];
    let plan = null;                                     // straight axis (mound + ramp) unless a C-rail
    if (s.shape === 'c') {
      // Curved in plan: an arc of `turn` degrees over `len` m, following the snow at h0.
      const n = 16, R = s.len / Math.abs(s.turn * DEG), sg = Math.sign(s.turn);
      for (let i = 0; i <= n; i++) {
        const th = (i / n) * Math.abs(s.turn) * DEG;
        const along = R * Math.sin(th), across = sg * R * (1 - Math.cos(th));
        const x = x0 + fx * along - fz * across, z = z0 + fz * along + fx * across;
        pts.push([x, this.base(x, z) + s.h0, z]);
      }
    } else if (s.shape === 'rainbow') {
      // A hump over the snow chord.
      const n = 14;
      const xe = x0 + fx * s.len, ze = z0 + fz * s.len, ye = this.base(xe, ze) + s.h0;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        pts.push([x0 + fx * s.len * t, y0 + (ye - y0) * t + s.hump * Math.sin(Math.PI * t), z0 + fz * s.len * t]);
      }
      plan = true;
    } else {
      let a = 0, y = y0;
      pts.push([x0, y0, z0]);
      for (const [len, deg] of s.segs) {
        a += len * Math.cos(deg * DEG); y += len * Math.sin(deg * DEG);
        pts.push([x0 + fx * a, y, z0 + fz * a]);
      }
      plan = true;
    }
    const rail = { id: s.name, name: s.name, kind: s.kind, half, pts, difficulty: s.difficulty ?? 1, section, lane: s.lane ?? (section ? 'slope' : null), shape: s.shape || (s.segs?.length > 1 ? 'kinked' : 'straight') };
    this.rails.push(rail);
    // Along-axis helpers (straight jibs).
    const len = plan ? Math.hypot(pts[pts.length - 1][0] - x0, pts[pts.length - 1][2] - z0) : 0;
    const railY = (a) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const ai = Math.hypot(pts[i][0] - x0, pts[i][2] - z0), aj = Math.hypot(pts[i + 1][0] - x0, pts[i + 1][2] - z0);
        if (a <= aj || i === pts.length - 2) return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * Math.min(1, Math.max(0, (a - ai) / Math.max(1e-6, aj - ai)));
      }
      return y0;
    };
    // Mound: snow up to (top − clearance) under a rail standing high over the snow.
    if (plan) {
      const clear = s.kind === 'rail' ? 0.55 : s.kind === 'tube' ? half * 2 + 0.1 : 0.32;
      const B = new ProfileBuilder(this.base, { x: x0, z: z0, yaw, hw: half + 0.6 });
      const mpts = [];
      let any = false;
      for (let a = -0.5; a <= len + 0.5; a += STEP) {
        const b = B.baseAt(a), y = railY(Math.min(len, Math.max(0, a))) - clear;
        if (y > b + 0.08) any = true;
        mpts.push([a, Math.max(b - 0.05, y), half + 0.6]);
      }
      if (any) {
        // Ramp the mound's ends down to the snow at 35°.
        const B2 = new ProfileBuilder(this.base, { x: x0, z: z0, yaw, hw: half + 0.6 });
        const first = mpts[0], last = mpts[mpts.length - 1];
        const pre = [];
        for (let a = first[0] - STEP; ; a -= STEP) { const y = first[1] - (first[0] - a) * Math.tan(35 * DEG); if (y < B2.baseAt(a) - 0.05 || a < -12) break; pre.unshift([a, y, half + 0.6]); }
        const post = [];
        for (let a = last[0] + STEP; ; a += STEP) { const y = last[1] - (a - last[0]) * Math.tan(35 * DEG); if (y < B2.baseAt(a) - 0.05 || a > len + 14) break; post.push([a, y, half + 0.6]); }
        B2.pts = [...pre, ...mpts, ...post];
        const m = B2.build({ name: s.name, kind: 'mound', lane: rail.lane, rake: 1.3 });
        m.rail = rail;
        this.features.push(m);
      }
    }
    // On-ramp.
    if (s.ramp) {
      const B0 = () => this.P(s.u - 20 * fx, s.v - 20 * fz, s.yaw || 0, Math.max(0.9, half + 0.7));
      if (s.ramp === 'flush') {
        // Rise ≈13° over the snow (rounded at the foot) to exactly the jib's start height, then a short face behind.
        const B = B0();
        const L = s.h0 / Math.tan(13 * DEG) + 0.6, aS = 20 - L;
        const pts = [];
        for (let a = Math.max(0, aS - 0.5); a <= 20.001; a += STEP / 2) {
          const k = Math.max(0, (a - aS) / L);
          const e = k < 0.25 ? 2 * k * k : k - 0.125;           // eased foot, then straight
          pts.push([a, B.baseAt(a) + s.h0 * Math.min(1, e / 0.875) + (y0 - B.baseAt(20) - s.h0) * Math.min(1, k), B.hw]);
        }
        pts.push([20.05, y0, B.hw]);
        for (let a = 20.1; ; a += STEP / 2) { const y = y0 - (a - 20.05) * Math.tan(55 * DEG); if (y < B.baseAt(a) - 0.05) break; pts.push([a, y, B.hw]); }
        B.pts = pts;
        B.mark('end');
        const f = B.build({ name: s.name, kind: 'ramp', lane: rail.lane, rake: 1.2 });
        f.rail = rail;
        this.features.push(f);
      } else {
        const r = s.ramp;
        const lipA = 20 - r.gap;
        const first = s.shape === 'rainbow' ? Math.atan2(s.hump * Math.PI / s.len, 1) / DEG - 12 : s.shape === 'c' ? -12 : s.segs[0][1];
        const deg = r.deg ?? Math.max(3, Math.min(18, first + (r.gap >= 2 ? 14 : 9)));   // (a kicker needs to rise: ≥ 3°)
        // A straight snow ramp (eased at the foot) rising to the lip at `deg`, `drop` under the jib's start height.
        const B = B0();
        const lipY = y0 - r.drop, g = B.baseAngle(lipA - 2);
        const H = lipY - B.baseAt(lipA), rel = Math.max(6, deg - g) * DEG, Lr = H / Math.tan(rel) * 1.15, aS = lipA - Lr;
        const pts = [];
        for (let a = Math.max(0, aS - 0.5); a <= lipA + 1e-6; a += STEP / 2) {
          const k = Math.max(0, (a - aS) / Lr);
          const e = k < 0.3 ? k * k / 0.6 : k - 0.15;
          pts.push([a, B.baseAt(a) + H * Math.min(1, e / 0.85) + (lipY - B.baseAt(lipA) - H) * k, B.hw]);
        }
        pts[pts.length - 1][1] = lipY;
        for (let a = lipA + STEP / 2; ; a += STEP / 2) { const y = lipY - (a - lipA) * Math.tan(55 * DEG); if (y < B.baseAt(a) - 0.05) break; pts.push([a, y, B.hw]); }
        B.pts = pts;
        B.marks.lip = { a: lipA, y: lipY, ang: deg };
        const f = B.build({ name: s.name, kind: 'ramp', lane: rail.lane, rake: 1.2 });
        f.rail = rail;
        this.features.push(f);
      }
    }
    // Stair set beside a handrail: snow steps following the rail's down section.
    if (s.stairs && plan) {
      const off = s.stairs.side * 2.2, sx = x0 - fz * off, sz = z0 + fx * off;
      const B = new ProfileBuilder(this.base, { x: sx, z: sz, yaw, hw: 1.5 });
      const segs = s.segs, aFlat = segs[0][0], aDown = segs[1][0] * Math.cos(segs[1][1] * DEG), drop = -segs[1][0] * Math.sin(segs[1][1] * DEG);
      const top = y0 - 0.95, n = s.stairs.steps, tread = aDown / n, rise = drop / n;
      const pts = [];
      for (let a = -3; a <= aFlat + aDown + 4; a += STEP / 2) {
        let y;
        if (a < 0) y = top - (-a) * Math.tan(28 * DEG);
        else if (a <= aFlat) y = top;
        else if (a <= aFlat + aDown) { const k = Math.floor((a - aFlat) / tread); const f = (a - aFlat) / tread - k; y = top - rise * k - rise * smooth((f - 0.82) / 0.18); }
        else y = top - drop - (a - aFlat - aDown) * Math.tan(12 * DEG);
        pts.push([a, Math.max(B.baseAt(a) - 0.05, y), 1.5]);
      }
      B.pts = pts;
      const f = B.build({ name: `${s.name} Stairs`, kind: 'stairs', lane: rail.lane, rake: 0.9 });
      f.stairs = { n, tread, rise, aFlat };
      this.features.push(f);
    }
    // Take-off zone name for the jib (an ollie / pop onto it counts as this feature).
    this.named.push({ name: s.name, kind: 'jib', x: x0 - fx * 2, z: z0 - fz * 2, r: 3, back: 4, rail, section });
  }

  addPipe(s) {
    const pipe = new PipeFeature({ name: s.name, x: START_X + s.u0, z: s.v, length: s.u1 - s.u0, F: s.F, R: s.R, H: s.H, vertDeg: s.vertDeg, D: s.D, base: this.base });
    this.features.push(pipe);
    this.pipe = pipe;
    this.named.push({ name: s.name, kind: 'pipe', x: START_X + (s.u0 + s.u1) / 2, z: s.v, r: 0, pipe });
  }

  /** The big air: a scaffold deck and 34° in-run, a 32° kicker, a 24 m table, an EFH landing to 26 m/s. */
  addBigAir(s) {
    const B = this.P(s.u, s.v, 0, s.hw);
    B.lift(s.top);
    B.line(s.deckLen, -9);                                // the start deck: steep enough to roll in from a standstill
    B.mark('top');
    B.arc(10, -s.inDeg);
    // In-run until the concave transition (+2 m straight at the lip) leaves the lip kickH over the snow.
    for (let guard = 0; guard < 2000; guard++) {
      const e = B.arcEnd(s.R, s.lipDeg);
      const lipY = e.y + 2 * Math.tan(s.lipDeg * DEG), lipA = e.a + 2;
      if (lipY - B.baseAt(lipA) <= s.kickH) break;
      B.line(STEP, -s.inDeg);
    }
    B.mark('inrunEnd');
    B.arc(s.R, s.lipDeg).line(2);
    B.mark('lip');
    const lip = { a: B.a, y: B.y, ang: s.lipDeg };
    B.width(s.deckHw);
    B.lineBy(-1.2, -58);
    B.line(s.table - (B.a - lip.a), 4);                    // the table rises a little: a taller knuckle, a longer landing
    B.width(s.landHw);
    const land = B.efhLanding(lip, { vMax: s.vMax, vn: 3.6, Rk: 6, minDeg: 24, maxDeg: 38, extra: 14, outR: 36 });
    B.toBase(36, 4);
    const f = B.build({ name: s.name, kind: 'bigair', lane: 'bigair', rake: 1.1 });
    // The scaffold in-run is a narrow ramp: thin edges until the kicker meets the snow.
    f.thinUntil = f.marks.inrunEnd.a + 4;
    const Ys = new Float32Array(f.Y.length);
    const deckY = f.yAt(lip.a + 0.8);
    for (let i = 0; i < Ys.length; i++) {
      const a = f.a0 + i * STEP;
      Ys[i] = a >= lip.a + 0.6 ? f.Y[i] : Math.max(B.baseAt(a) - 0.2, deckY - (lip.a + 0.6 - a) * Math.tan(22 * DEG));
    }
    f.side = { Y: Ys, hwc: s.hw, blend: 1.4 };
    f.jump = { ...s, lipA: lip.a, lipY: lip.y, land, knuckle: f.marks.knuckle };
    this.features.push(f);
    this.bigAir = f;
    const [lx, lz] = f.world(lip.a);
    this.named.push({ name: s.name, kind: 'jump', x: lx, z: lz, r: s.hw + 3, back: 30, f });
  }

  // ---------------------------------------------------------------- features hook (terrain.features)
  heightAt(x, z, base) { return this.index.height(x, z, base); }

  /** Name of the feature a rider took off from at (x, z) (scoring, line goals), or null. */
  featureAt(x, z) {
    for (const n of this.named) {
      if (n.kind === 'pipe') { if (n.pipe.at(x, z, this.base(x, z) - 0.5) !== null) return n.name; continue; }
      if (n.kind === 'jump' || n.kind === 'qp') {
        const [a, b] = n.f.local(x, z), la = n.kind === 'qp' ? n.f.marks.coping.a : n.f.jump.lipA;
        if (Math.abs(b) < n.r && a > la - n.back && a < la + 3) return n.name;
        continue;
      }
      if (Math.hypot(x - n.x, z - n.z) < n.r) return n.name;
    }
    return null;
  }

  /** Quarterpipe / superpipe wall under (x, z) steep enough to send you straight up: horizontal normal back in, or null. */
  wallNormal(x, z) {
    if (this.pipe) { const n = this.pipe.wallNormal(x, z); if (n) return n; }
    for (const w of this.walls) {
      const [a, b] = w.f.local(x, z);
      if (a > w.a0 && a < w.a1 && Math.abs(b) < w.hw + 0.5) return [w.nx, w.nz];
    }
    return null;
  }

  /** The jump (table-top / big air) whose landing (x, z) is on, with the sweet spot: { f, a, sweet } or null. */
  landingAt(x, z) {
    for (const f of this.features) {
      if (!f.jump?.land || x < f.box[0] || x > f.box[1] || z < f.box[2] || z > f.box[3]) continue;
      const [a, b] = f.local(x, z);
      if (Math.abs(b) > f.hwAt(a) + 2 || a < f.jump.lipA || a > f.a0 + f.len) continue;
      return { f, a, b };
    }
    return null;
  }

  // ---------------------------------------------------------------- path, drop zones, flakes
  buildPath() {
    const pts = [];
    for (let u = 0; u <= FINISH_U + 160; u += 8) pts.push(new THREE.Vector2(START_X + u, 0));
    this.path = pts;
    this.length = FINISH_U + 160;
    this.finishAt = FINISH_U;
    this.dropsAt = [];
  }
  progress(x) { return x - START_X; }
  tAt() { return 0; }
  menuFocus() { return new THREE.Vector3(START_X + 400, this.profileAt(400) + 380, 60); }

  buildDropZones() {
    return DROP_ZONES.map(([name, u, v, hd], i) => {
      if (i === 4) {   // the big air's scaffold deck
        const [x, z] = this.bigAir.world(this.bigAir.marks.top.a - BIG_AIR.deckLen + 1);
        return { name, x, z, heading: -Math.PI / 2 };
      }
      if (i === 5) return { name, x: this.pipe.world(4, 0)[0], z: this.pipe.world(4, 0)[1], heading: -Math.PI / 2 + 0.25 };
      return { name, x: START_X + u, z: v, heading: -Math.PI / 2 + hd * DEG };
    });
  }

  /** Golden snowflakes: over the big lips, on rails, high in the pipe, on the step-up deck and the tower. */
  placeFlakes() {
    const out = [];
    const overLip = (f, up) => { const [x, z] = f.world(f.jump.lipA + 6); return { x, z, y: up }; };
    const J = this.features.filter((f) => f.kind === 'jump' && f.lane === 'slope');
    for (const f of J) out.push(overLip(f, 4.5));
    const railMid = (name, up = 1.4) => { const r = this.rails.find((q) => q.name === name); const p = r.pts[Math.floor(r.pts.length / 2)]; return { x: p[0], z: p[2], y: p[1] - this.base(p[0], p[2]) + up }; };
    out.push(railMid('Circuit Flat-Down'), railMid('Surge Rainbow'), railMid('Overload C-Rail'), railMid('Grid Finale DFD'), railMid('High DFD'));
    const [px, pz] = this.pipe.world(120, this.pipe.F + this.pipe.wallRun - 0.5);
    out.push({ x: px, z: pz, y: 3.5 });
    out.push(overLip(this.bigAir, 7));
    const su = this.features.find((f) => f.kind === 'stepup');
    const [sx, sz] = su.world(su.marks.deck.a + 3);
    out.push({ x: sx, z: sz, y: 1.6 });
    const qp = this.walls[1];
    const [qx, qz] = qp.f.world(qp.f.marks.coping.a - 1);
    out.push({ x: qx, z: qz, y: 3.2 });
    return out.slice(0, 12);
  }

  // ---------------------------------------------------------------- scatter hooks
  forestAt(x, z) {
    const u = x - START_X, av = Math.abs(z);
    if (av < PARK_HALF + 25 && u > -60 && u < FINISH_U + 220) return 0;
    return sstep(0.38, 0.6, fbm(x / 170, z / 170, 3)) * 0.8 + 0.2 * sstep(PARK_HALF + 25, PARK_HALF + 90, av);
  }
  pisteAt(x, z) {
    const u = x - START_X;
    return Math.abs(z) < PARK_HALF + 20 && u > -80 && u < FINISH_U + 240 ? 1 : 0;
  }
  rockOk(x, z) { return Math.abs(z) > PARK_HALF + 60 || x - START_X < -150 || x - START_X > FINISH_U + 300; }
  corniceOk(x, z) { return Math.abs(z) > PARK_HALF + 150 || x - START_X < -250; }
  lobbySpot() { return { x: START_X + 6, z: -9, heading: -Math.PI / 2 + 0.12 }; }
  spawnPoint() { return { x: START_X + 2, z: 0, heading: -Math.PI / 2 }; }

  /** Player hook (player.js): the pipe / quarterpipe vert, landing and pop feedback (park.js). */
  onPlayer(pl) { attachPark(this, pl); }

  // ---------------------------------------------------------------- terrain arrays
  async generate(onProgress = () => {}) {
    const N = TILE.res, size = TILE.size, sp = size / (N - 1), half = size / 2;
    const heights = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -half + j * sp;
      for (let i = 0; i < N; i++) heights[j * N + i] = this.natural(-half + i * sp, z);
      if ((j & 63) === 0) { onProgress(0.75 * j / N); await new Promise((r) => setTimeout(r, 0)); }
    }
    const normals = new Uint8Array(N * N * 2), splat = new Uint8Array(N * N * 3);
    const hAt = (i, j) => heights[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = hAt(i - 1, j) - hAt(i + 1, j), ny = 2 * sp, nz = hAt(i, j - 1) - hAt(i, j + 1);
      const l = Math.hypot(nx, ny, nz), k = j * N + i;
      normals[k * 2] = Math.round((nx / l) * 127.5 + 127.5);
      normals[k * 2 + 1] = Math.round((nz / l) * 127.5 + 127.5);
      splat[k * 3 + 1] = Math.round(smooth((0.7 - ny / l) / 0.16) * 255);
      // Groomed (corduroy, hard and fast) all over the park.
      const x = -half + i * sp, z = -half + j * sp;
      splat[k * 3] = Math.round(this.pisteAt(x, z) * (1 - sstep(PARK_HALF + 5, PARK_HALF + 20, Math.abs(z))) * 255);
    }
    onProgress(0.85);
    const FN = TILE.farRes, fs = TILE.farSize, fsp = fs / (FN - 1);
    const far = new Float32Array(FN * FN);
    let farMin = Infinity;
    for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
      const v = this.macro(-fs / 2 + i * fsp, -fs / 2 + j * fsp);
      far[j * FN + i] = v;
      if (v < farMin) farMin = v;
    }
    onProgress(1);
    const s = this.spawnPoint();
    return {
      meta: { size_m: size, res: N, spacing: sp, far_size_m: fs, far_res: FN, far_min_height: farMin, spawn: { position: [s.x, 0, s.z], heading: s.heading } },
      heights, normals, splat, far,
    };
  }
}

export { LANES, mulberry32 };
