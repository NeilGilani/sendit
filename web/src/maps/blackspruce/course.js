// Blackspruce Plunge — a steep, fast forest run. Same interface as Course (course.js): path, length,
// dropsAt, finishAt, progress(), height(), generate(), menuFocus(), centre(), plus the opt-in hooks
// the engine reads from a course object:
//   key            storage key for challenge bests / ghost / snowflakes (activities.js)
//   features       { kickers, jumps } — explicit kickers, no random park stream (features.js)
//   challenge      { gates, flakes, medalSpeeds } — checkpoints at the clearings (activities.js)
//   spawn          SPAWN overrides for the generic background forest (scatter.js)
//   populate(...)  plants the designed forest, logs, stumps, snags, rocks, signs (scatter.js)
//   perf           { treeNear, treeMid } — smaller tree-pool radii for this dense map (scatter.js)
//   life           { skiers: 0 } — no background skiers (life.js)
//   physics        per-map PHYSICS / equipment overrides (applied by the per-map physics hook)
//   w              the face half-width table, so terrain.js sculpts rock on the outer walls only
// Layout data: layout.js (positions may be lane-relative: resolveD). Forest planning and meshes:
// forest.js. Scoring and juice: scoring.js. Docs: docs/map2.md.
import * as THREE from 'three';
import { BLACKSPRUCE, BAND, CLEARINGS, LANES, PILLOWS, ROLLERS, LOGS, KICKERS, GATES, FLAKES } from './layout.js';
import { planForest, populateForest } from './forest.js';
import { installScoring } from './scoring.js';

const T0 = -14000, T1 = 17000;

// ------------------------------------------------------------------ noise (same family as course.js)
function hash2(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  let fx = x - i, fy = y - j;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = hash2(i, j), b = hash2(i + 1, j), c = hash2(i, j + 1), d = hash2(i + 1, j + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
function fbm(x, y, oct) {
  let a = 0, amp = 0.5, tot = 0, f = 1;
  for (let k = 0; k < oct; k++) { a += vnoise(x * f + k * 17.1, y * f - k * 9.3) * amp; tot += amp; amp *= 0.5; f *= 2.03; }
  return a / tot;
}
function ridged(x, y, oct) {
  let a = 0, amp = 0.5, tot = 0, f = 1;
  for (let k = 0; k < oct; k++) {
    const n = 1 - Math.abs(vnoise(x * f + k * 31.7, y * f + k * 5.9) * 2 - 1);
    a += n * n * amp; tot += amp; amp *= 0.5; f *= 2.1;
  }
  return a / tot;
}
export const smooth = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };

/** Cubic Hermite through control points [t, d, hw] (finite-difference tangents). */
function hermite(pts, t, k) {
  if (t <= pts[0][0]) return pts[0][k];
  const n = pts.length;
  if (t >= pts[n - 1][0]) return pts[n - 1][k];
  let i = 0;
  while (i < n - 2 && t > pts[i + 1][0]) i++;
  const p0 = pts[i], p1 = pts[i + 1];
  const h = p1[0] - p0[0], s = (t - p0[0]) / h;
  const tan = (j) => {
    const a = pts[Math.max(0, j - 1)], b = pts[Math.min(n - 1, j + 1)];
    return (b[k] - a[k]) / Math.max(1e-6, b[0] - a[0]);
  };
  const m0 = tan(i) * h, m1 = tan(i + 1) * h;
  const s2 = s * s, s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * p0[k] + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2) * p1[k] + (s3 - s2) * m1;
}

export class BlackspruceCourse {
  constructor(params = BLACKSPRUCE) {
    this.P = params;
    this.name = 'Blackspruce Plunge';
    this.key = 'blackspruce';
    this.buildTables();
    this.buildLanes();
    this.clearings = CLEARINGS.map(([t, d, a, b]) => [t, this.resolveD(t, d), a, b]);
    this.buildPath();
    this.buildBumps();
    this.forest = planForest(this);
    this.setupHooks();
  }

  // ---------------------------------------------------------------- per-t tables (1 m)
  buildTables() {
    const P = this.P;
    const n = T1 - T0 + 1;
    const segs = [];
    let acc = 0;
    for (const [len, deg] of P.profile) { segs.push([acc, acc + len, Math.tan(THREE.MathUtils.degToRad(deg))]); acc += len; }
    const behind = Math.tan(THREE.MathUtils.degToRad(P.behindGradient));
    const gAt = (t) => {
      if (t < 0) return behind;
      for (const s of segs) if (t < s[1]) return s[2];
      return segs[segs.length - 1][2];
    };
    const grad = new Float64Array(n);
    const S = P.gradeSmooth;
    for (let i = 0; i < n; i++) {
      const t = T0 + i;
      let g = 0, w = 0;
      for (let k = -S; k <= S; k += 2) { g += gAt(t + k); w++; }
      grad[i] = g / w;
    }
    const e = new Float64Array(n);
    const i0 = -T0;
    e[i0] = P.topElevation;
    for (let i = i0 + 1; i < n; i++) e[i] = e[i - 1] - grad[i];
    for (let i = i0 - 1; i >= 0; i--) e[i] = e[i + 1] + grad[i];
    // The rock band's drop happens everywhere, gradually (the chute ramp); the cliff parts add the
    // difference back and step down sharply (height()).
    const B = BAND;
    for (let i = 0; i < n; i++) e[i] -= B.drop * this.bandRamp(T0 + i);
    // Centre-line meander (straight for the first 70 m).
    const xc = new Float64Array(n), dxc = new Float64Array(n), W = new Float64Array(n);
    const amp = (t) => (t < 0 ? 0 : smooth((t - 30) / 160));
    const raw = (t) => P.meander.reduce((s, [a, wl, ph]) => s + a * Math.sin(t / wl + ph), 0);
    const r0 = raw(0);
    for (let i = 0; i < n; i++) { const t = T0 + i; xc[i] = (raw(t) - r0) * amp(t); }
    for (let i = 1; i < n - 1; i++) dxc[i] = (xc[i + 1] - xc[i - 1]) / 2;
    const [w0, w1] = P.faceHalfWidth;
    for (let i = 0; i < n; i++) { const t = T0 + i; W[i] = w0 + w1 * Math.sin(t / 260 + 1.1); }
    // `w` (the riding floor's half-width) lets terrain.js sculpt fluted rock on the outer walls only.
    Object.assign(this, { e, xc, dxc, W, w: W });
  }

  bandRamp(t) { const B = BAND; return smooth((t - B.t - B.ramp[0]) / (B.ramp[1] - B.ramp[0])); }
  /** 1 where the rock band is a cliff, 0 in the chutes and beyond its ends. */
  bandMask(d) {
    const B = BAND;
    let m = 1 - smooth((Math.abs(d) - B.reach) / 16);
    for (const [c, hw] of B.chutes) m *= smooth((Math.abs(d - c) - hw) / 3);
    return m;
  }

  /** Table lookup with linear interpolation. */
  at(arr, t) {
    const f = Math.min(Math.max(t - T0, 0), T1 - T0 - 1.0001);
    const i = f | 0, k = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * k;
  }
  tAt(z) { return this.P.startZ - z; }
  /** World x/z of run coordinates (t, d). */
  world(t, d, out = { x: 0, z: 0 }) {
    const dx = this.at(this.dxc, t);
    out.x = this.at(this.xc, t) + d * Math.sqrt(1 + dx * dx);
    out.z = this.P.startZ - t;
    return out;
  }
  /** Lateral run coordinate d of world x at fall-line position t. */
  dAt(x, t) { const dx = this.at(this.dxc, t); return (x - this.at(this.xc, t)) / Math.sqrt(1 + dx * dx); }

  // ---------------------------------------------------------------- lanes
  buildLanes() {
    this.lanes = [];
    for (const def of LANES) {
      // 'm' = on the main line at that t (side lanes branch off it and merge back into it).
      const L = { ...def, pts: def.pts.map(([t, d, w]) => [t, d === 'm' ? this.laneAt(this.mainLane, t).d : d, w]) };
      const t0 = L.pts[0][0], t1 = L.pts[L.pts.length - 1][0];
      const n = Math.ceil(t1 - t0) + 1;
      const d = new Float32Array(n), hw = new Float32Array(n);
      const [wa, wl] = L.weave || [0, 1];
      for (let i = 0; i < n; i++) {
        const t = t0 + i;
        const w = hermite(L.pts, t, 2);
        // Weave only where the lane is tight (clearings stay straight) and away from its ends.
        const env = (1 - smooth((w - 5) / 3)) * smooth((t - t0) / 25) * smooth((t1 - t) / 25);
        d[i] = hermite(L.pts, t, 1) + wa * env * Math.sin((t / wl) * Math.PI * 2 + L.id.length);
        hw[i] = w;
      }
      this.lanes.push({ ...L, t0, t1, d, hw });
      if (L.id === 'main') this.mainLane = this.lanes[this.lanes.length - 1];
    }
  }

  /** A layout position across the run: metres, or [laneId, offset] relative to that lane's centre at t. */
  resolveD(t, d) {
    if (!Array.isArray(d)) return d;
    const L = this.lanes.find((l) => l.id === d[0]);
    if (!L) throw new Error(`blackspruce: unknown lane "${d[0]}"`);
    return (this.laneAt(L, t) || this.laneAt(this.mainLane, t)).d + (d[1] || 0);
  }

  /** Lane centre and half-width at t: { d, hw } or null outside the lane. */
  laneAt(lane, t) {
    if (t < lane.t0 || t > lane.t1) return null;
    const f = t - lane.t0, i = Math.min(lane.d.length - 2, f | 0), k = f - i;
    return { d: lane.d[i] + (lane.d[i + 1] - lane.d[i]) * k, hw: lane.hw[i] + (lane.hw[i + 1] - lane.hw[i]) * k };
  }

  // ---------------------------------------------------------------- the path (main lane)
  buildPath() {
    const P = this.P;
    const n = T1 - T0 + 1;
    this.pathLenAt = new Float64Array(n);
    this.path = [];
    const i0 = -T0, end = P.finishT + 200;
    const p = { x: 0, z: 0 };
    let L = 0, px = null, pz = null;
    for (let t = 0; t <= end; t++) {
      this.world(t, this.laneAt(this.mainLane, t).d, p);
      if (px !== null) L += Math.hypot(p.x - px, p.z - pz);
      px = p.x; pz = p.z;
      this.pathLenAt[i0 + t] = L;
      if (t % 4 === 0) this.path.push(new THREE.Vector2(p.x, p.z));
    }
    for (let i = i0 + end + 1; i < n; i++) this.pathLenAt[i] = L;
    this.length = L;
  }

  get dropsAt() { return [this.pathLength(BAND.t)]; }
  get finishAt() { return this.pathLength(this.P.finishT); }
  get lifts() { return []; }
  progress(x, z) { return this.pathLength(this.tAt(z)); }
  pathLength(t) { return this.at(this.pathLenAt, Math.min(Math.max(t, 0), this.P.finishT + 200)); }
  menuFocus() { const c = this.centre(this.P.finishT * 0.45); return new THREE.Vector3(c.x, c.y + 650, c.z); }
  /** Point on the main line at fall-line position t: { x, z, y, heading }. */
  centre(t) {
    const a = this.world(t, this.laneAt(this.mainLane, t).d);
    const b = this.world(t + 6, this.laneAt(this.mainLane, t + 6).d);
    return { x: a.x, z: a.z, y: this.height(a.x, a.z), heading: Math.atan2(-(b.x - a.x), -(b.z - a.z)) };
  }

  // ---------------------------------------------------------------- baked bumps (pillows, rollers, logs)
  buildBumps() {
    const bumps = [];
    const p = { x: 0, z: 0 };
    for (const [t, d, R, H] of PILLOWS) { this.world(t, d, p); bumps.push({ kind: 'pillow', x: p.x, z: p.z, R, H, reach: R }); }
    for (const [t, d, hw, H, sig] of ROLLERS) {
      this.world(t, d, p);
      bumps.push({ kind: 'roller', x: p.x, z: p.z, t, d, hw, H, sig, reach: Math.max(hw + 8, sig * 3) });
    }
    this.logs = LOGS.map(([t, dd, ang, len, r]) => {
      const d = this.resolveD(t, dd);
      this.world(t, d, p);
      // Axis across the slope, turned by `ang`; n points downhill (−z).
      const ax = Math.cos(ang), az = Math.sin(ang);
      const log = { kind: 'log', t, d, x: p.x, z: p.z, ax, az, nx: az, nz: -ax, len, r, H: 0.55 + r * 0.4, reach: len / 2 + 6 };
      bumps.push(log);
      return log;
    });
    // Spatial hash (24 m cells).
    this.bumpHash = new Map();
    for (const b of bumps) {
      const r = b.reach;
      for (let cz = Math.floor((b.z - r) / 24); cz <= Math.floor((b.z + r) / 24); cz++) {
        for (let cx = Math.floor((b.x - r) / 24); cx <= Math.floor((b.x + r) / 24); cx++) {
          const k = cx * 100003 + cz;
          if (!this.bumpHash.has(k)) this.bumpHash.set(k, []);
          this.bumpHash.get(k).push(b);
        }
      }
    }
  }

  bumpHeight(x, z, t, d) {
    const a = this.bumpHash.get(Math.floor(x / 24) * 100003 + Math.floor(z / 24));
    if (!a) return 0;
    let h = 0;
    for (const b of a) {
      if (b.kind === 'pillow') {
        const q = Math.hypot(x - b.x, z - b.z) / b.R;
        if (q < 1) h += b.H * Math.pow(1 - q * q, 1.6);
      } else if (b.kind === 'roller') {
        const along = (t - b.t) / b.sig;
        if (Math.abs(along) < 3) h += b.H * Math.exp(-along * along) * (1 - smooth((Math.abs(d - b.d) - b.hw) / 8));
      } else {
        const dx = x - b.x, dz = z - b.z;
        const u = dx * b.ax + dz * b.az, v = dx * b.nx + dz * b.nz;
        const end = 1 - smooth((Math.abs(u) - b.len / 2 + 1.5) / 2.5);
        if (end <= 0) continue;
        // Wind-drifted snow piles up the uphill side (a ramp); the downhill side drops off the log.
        const s = v < 0 ? 2.1 : 0.85;
        if (Math.abs(v) < s * 3) h += b.H * Math.exp(-(v / s) * (v / s)) * end;
      }
    }
    return h;
  }

  // ---------------------------------------------------------------- the height function
  height(x, z) {
    const P = this.P;
    const t = P.startZ - z;
    const e = this.at(this.e, t), xc = this.at(this.xc, t), dx = this.at(this.dxc, t);
    const W = this.at(this.W, t);
    const d = (x - xc) / Math.sqrt(1 + dx * dx);
    const ad = Math.abs(d);
    let h = e;
    if (ad < W) {
      h += P.dish * (ad / W) * (ad / W);
    } else {
      const u = ad - W;
      const WH = P.wallHeight[0] + P.wallHeight[1] * vnoise(t / 280, d < 0 ? 3.3 : 8.1);
      const WW = P.wallWidth[0] + (P.wallWidth[1] - P.wallWidth[0]) * vnoise(t / 330, 1.7);
      h += P.dish + P.dish * 2 * Math.min(u, 8) / W + WH * smooth(u / WW);
      const v = Math.max(0, u - WW);
      if (v > 0) {
        const A = smooth(v / 900);
        h += v * P.valleySideSlope
          + A * P.mountainHeight * ridged(x / 3000 + 3.1, z / 3000 + 7.7, 4)
          + smooth(v / 300) * 260 * (fbm(x / 800, z / 800, 3) - 0.5);
        const R = smooth((v - 30) / 420);
        if (R > 0) {
          h += R * P.sideRibs * (ridged(x / 650 + 1.3, z / 170 + 4.1, 3) - 0.45)
            + R * P.sideRibs * 0.35 * (ridged(x / 260 + 7.7, z / 64 + 2.2, 2) - 0.45);
        }
      }
    }
    // Fall-line ribs (gentle side hits), calmer in the clearings near the centre.
    if (ad < W + 40) h += P.ribs * Math.sin((d / P.ribWave) * Math.PI * 2 + t / 97) * smooth(ad / 25);
    // The rock band: cliffs between the chutes, a small lip on top.
    const B = BAND;
    if (t > B.t + B.ramp[0] - 8 && t < B.t + B.ramp[1] + 2) {
      const m = this.bandMask(d);
      if (m > 0) {
        const step = smooth((t - B.t) / 1.6);
        h += m * (B.drop * (this.bandRamp(t) - step) + B.drop * 0.2 * Math.exp(-(((t - B.t + 2.5) / 3) ** 2)));
      }
    }
    h += this.bumpHeight(x, z, t, d);
    h += (fbm(x / 34, z / 34, 3) - 0.5) * P.lumps + (vnoise(x / 11, z / 11) - 0.5) * P.fineLumps;
    // A horn on the horizon, down the valley.
    const Hn = P.horn;
    const hx = x - Hn.x, hz = z - Hn.z;
    const c = Math.cos(Hn.twist), s = Math.sin(Hn.twist);
    const r = Math.max(Math.abs(hx * c + hz * s), Math.abs(-hx * s + hz * c)) * 0.85 + Math.hypot(hx, hz) * 0.15;
    if (r < 3200) {
      const horn = Hn.peak - r * Hn.slope + (ridged(hx / 700, hz / 700, 3) - 0.5) * 220 * smooth(r / 600);
      if (horn > h) h = h + (horn - h) * smooth((horn - h) / 60);
    }
    return h;
  }

  // ---------------------------------------------------------------- terrain arrays
  async generate(onProgress = () => {}) {
    const P = this.P;
    const N = P.tileRes, size = P.tileSize, sp = size / (N - 1), half = size / 2;
    const heights = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -half + j * sp;
      for (let i = 0; i < N; i++) heights[j * N + i] = this.height(-half + i * sp, z);
      if ((j & 63) === 0) { onProgress(0.75 * j / N); await new Promise((r) => setTimeout(r, 0)); }
    }
    const normals = new Uint8Array(N * N * 2);
    const splat = new Uint8Array(N * N * 3);
    const hAt = (i, j) => heights[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = hAt(i - 1, j) - hAt(i + 1, j), ny = 2 * sp, nz = hAt(i, j - 1) - hAt(i, j + 1);
      const l = Math.hypot(nx, ny, nz);
      const k = j * N + i;
      normals[k * 2] = Math.round((nx / l) * 127.5 + 127.5);
      normals[k * 2 + 1] = Math.round((nz / l) * 127.5 + 127.5);
      splat[k * 3 + 1] = Math.round(smooth((0.68 - ny / l) / 0.16) * 255);   // rock on steep faces (the cliff band)
    }
    // Packed snow at the start and finish; forest floor (needle litter, shade) under the trees so
    // the open lanes read brighter than the woods.
    for (let j = 0; j < N; j++) {
      const z = -half + j * sp, t = this.tAt(z);
      if (!(t < 60 || (t > P.finishT - 50 && t < P.finishT + 260))) continue;
      for (let i = 0; i < N; i++) {
        const d = Math.abs(this.dAt(-half + i * sp, t));
        if (d < 40) splat[(j * N + i) * 3] = Math.round(0.5 * (1 - smooth((d - 24) / 16)) * 255);
      }
    }
    for (const tr of this.forest.trees) {
      const gi = (tr[0] + half) / sp, gj = (tr[1] + half) / sp, R = 4.2 * tr[3];
      const r = Math.ceil(R / sp);
      for (let j = Math.max(0, Math.floor(gj - r)); j <= Math.min(N - 1, Math.ceil(gj + r)); j++) {
        for (let i = Math.max(0, Math.floor(gi - r)); i <= Math.min(N - 1, Math.ceil(gi + r)); i++) {
          const q = Math.hypot(i - gi, j - gj) * sp / R;
          if (q >= 1) continue;
          const k = (j * N + i) * 3 + 2;
          splat[k] = Math.max(splat[k], Math.round((1 - q * q) * 0.75 * 255));
        }
      }
    }
    onProgress(0.85);
    const FN = P.farRes, fs = P.farSize, fsp = fs / (FN - 1);
    const far = new Float32Array(FN * FN);
    let farMin = Infinity;
    for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
      const v = this.height(-fs / 2 + i * fsp, -fs / 2 + j * fsp);
      far[j * FN + i] = v;
      if (v < farMin) farMin = v;
    }
    onProgress(1);
    const s = this.centre(12);
    return {
      meta: {
        size_m: size, res: N, spacing: sp, far_size_m: fs, far_res: FN, far_min_height: farMin,
        spawn: { position: [s.x, s.y, s.z], heading: s.heading },
      },
      heights, normals, splat, far,
    };
  }

  // ---------------------------------------------------------------- engine hooks
  setupHooks() {
    const kick = KICKERS.map((k) => ({ ...k, at: this.pathLength(k.t) }));
    this.features = { kickers: kick, jumps: { endAt: 0, freePillows: 0 } };
    this.challenge = {
      gates: GATES.map(([t, width]) => ({ at: this.pathLength(t), lateral: 0, width })),
      flakes: FLAKES.map(([t, d, y]) => { const w = this.world(t, this.resolveD(t, d)); return { x: w.x, z: w.z, y }; }),
      // Average m/s over the run (finishAt / time incl. penalties). Calibrated with the bot
      // (web/scripts/map2-bot.mjs) and test rides: see docs/map2.md.
      medalSpeeds: { gold: 16, silver: 14, bronze: 12 },
    };
    // The generic background forest stays outside the designed one.
    this.spawn = { runCorridor: 150, ridgeFenceMax: 0, runLength: 2400, treeMax: 20000 };
    // No background skiers: on a tree run they would ghost through the pivot trees.
    this.life = { skiers: 0 };
    // Dense forest: full-frond trees only close by, mid-detail trees hand over to the opaque far
    // shells sooner (scatter.js scales the quality tier's pool radii). See docs/map2.md (perf).
    this.perf = { treeNear: 0.44, treeMid: 0.35 };
    // Per-map physics overrides (merged over config.js PHYSICS by the per-map physics hook):
    // a steeper, faster run needs a higher speed reference so the soft cap doesn't eat the slope.
    this.physics = {
      ski: { maxVelocity: 18 },
      snowboard: { maxVelocity: 17.5 },
    };
  }

  /** scatter.js calls this before planting its generic forest. */
  populate(scatter) {
    populateForest(this, scatter);
    if (!this._scoring) this._scoring = installScoring(this);
  }
}
