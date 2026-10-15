// The hand-built world. One deterministic height function H(x, z) shapes everything:
//  - a winding powder gully (half-pipe floor, rock walls of varying steepness, berms / side hits)
//  - natural drops sitting at the top of steep pitches (lip → air → smooth landing)
//  - soft rolling lumps and fine detail, rock ledges on the walls
//  - valley sides climbing into ridged peaks, a long valley past the finish and a horn on the horizon
// It also produces the terrain arrays (heights, normals, splat, far backdrop) for terrain.js.
import * as THREE from 'three';
import { COURSE } from './scene.js';

const T0 = -14000, T1 = 17000;           // table range in t (metres down the fall line)

// ------------------------------------------------------------------ noise
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
const smooth = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };

export class Course {
  constructor(params = COURSE) {
    this.P = params;
    this.buildTables();
  }

  // ---------------------------------------------------------------- per-t tables (1 m)
  buildTables() {
    const P = this.P;
    const n = T1 - T0 + 1;
    const grad = new Float64Array(n);
    // Gradient profile with smooth ±25 m transitions between segments.
    const segs = [];
    let acc = 0;
    for (const [len, deg] of P.profile) { segs.push([acc, acc + len, Math.tan(THREE.MathUtils.degToRad(deg))]); acc += len; }
    const behind = Math.tan(THREE.MathUtils.degToRad(P.behindGradient));
    const gAt = (t) => {
      if (t < 0) return behind;
      for (const s of segs) if (t < s[1]) return s[2];
      return segs[segs.length - 1][2];
    };
    for (let i = 0; i < n; i++) {
      const t = T0 + i;
      let g = 0, w = 0;
      for (let k = -25; k <= 25; k += 5) { g += gAt(t + k); w++; }
      grad[i] = g / w;
    }
    // Integrate elevation from the start (t = 0 at index -T0).
    const e = new Float64Array(n);
    const i0 = -T0;
    e[i0] = P.topElevation;
    for (let i = i0 + 1; i < n; i++) e[i] = e[i - 1] - grad[i];
    for (let i = i0 - 1; i >= 0; i--) e[i] = e[i + 1] + grad[i];
    // Natural drops: a small lip, then a steep step down onto the following pitch.
    for (const [td, D] of P.drops) {
      for (let i = 0; i < n; i++) {
        const t = T0 + i;
        e[i] += -D * smooth((t - td) / 2.5) + D * 0.22 * Math.exp(-(((t - td + 3) / 4) ** 2));
      }
    }
    // Centreline meander (straight for the first 80 m, calmer far away from the course).
    const xc = new Float64Array(n), dxc = new Float64Array(n);
    const amp = (t) => smooth((t - 20) / 120) * (1 - 0.6 * smooth((t - 2600) / 1500)) * (t < 0 ? 0 : 1);
    const raw = (t) => P.meander.reduce((s, [a, wl, ph]) => s + a * Math.sin(t / wl + ph), 0);
    const r0 = raw(0);
    for (let i = 0; i < n; i++) { const t = T0 + i; xc[i] = (raw(t) - r0) * amp(t); }
    for (let i = 1; i < n - 1; i++) dxc[i] = (xc[i + 1] - xc[i - 1]) / 2;
    // Floor width, wall heights / widths, berms.
    const w = new Float64Array(n), wl = new Float64Array(n), wr = new Float64Array(n), ww = new Float64Array(n), berm = new Float64Array(n);
    const [w0, w1, w2] = P.floorHalfWidth;
    for (let i = 0; i < n; i++) {
      const t = T0 + i;
      w[i] = w0 + w1 * Math.sin(t / 210 + 2) + w2 * Math.sin(t / 77 + 0.4) + 10 * (1 - smooth(t / 60));
      wl[i] = P.wallHeight[0][0] + P.wallHeight[0][1] * vnoise(t / 300, 3.3);
      wr[i] = P.wallHeight[1][0] + P.wallHeight[1][1] * vnoise(t / 260, 8.1);
      ww[i] = P.wallWidth[0] + (P.wallWidth[1] - P.wallWidth[0]) * vnoise(t / 350, 1.7);
      berm[i] = P.bermHeight * smooth((vnoise(t / 90, 5.5) - 0.45) / 0.2);
    }
    Object.assign(this, { e, xc, dxc, w, wl, wr, ww, berm });
    // Course path (x/z polyline from the start to past the finish) + path length per t.
    this.path = [];
    this.pathLenAt = new Float64Array(n);
    let L = 0, px = xc[i0], pz = P.startZ;
    for (let t = 0; t <= P.finishT + 200; t += 1) {
      const x = xc[i0 + t], z = P.startZ - t;
      L += Math.hypot(x - px, z - pz); px = x; pz = z;
      this.pathLenAt[i0 + t] = L;
      if (t % 8 === 0) this.path.push(new THREE.Vector2(x, z));
    }
    this.length = L;
  }

  /** Table lookup with linear interpolation. */
  at(arr, t) {
    const f = Math.min(Math.max(t - T0, 0), T1 - T0 - 1.0001);
    const i = f | 0, k = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * k;
  }

  tAt(z) { return this.P.startZ - z; }
  /** Path length (metres along the winding line) at fall-line position t. */
  pathLength(t) { return this.at(this.pathLenAt, Math.min(Math.max(t, 0), this.P.finishT + 200)); }
  /** Course centre at fall-line position t: { x, z, y, heading }. */
  centre(t) {
    const x = this.at(this.xc, t), z = this.P.startZ - t;
    const d = this.at(this.dxc, t);
    return { x, z, y: this.height(x, z), heading: Math.atan2(-d, 1) };
  }

  // ---------------------------------------------------------------- the height function
  height(x, z) {
    const P = this.P;
    const t = P.startZ - z;
    const e = this.at(this.e, t), xc = this.at(this.xc, t), dx = this.at(this.dxc, t);
    const w = this.at(this.w, t);
    const d = (x - xc) / Math.sqrt(1 + dx * dx);
    const ad = Math.abs(d);
    let h = e;
    let wallness = 0;
    if (ad < w) {
      h += P.floorDepth * (ad / w) * (ad / w);
    } else {
      const u = ad - w;
      const WH = d < 0 ? this.at(this.wl, t) : this.at(this.wr, t);
      const WW = this.at(this.ww, t);
      wallness = smooth(u / WW);
      h += P.floorDepth + P.floorDepth * 2 * Math.min(u, 6) / w + WH * wallness;
      const v = Math.max(0, u - WW);
      if (v > 0) {
        const A = smooth(v / 900);
        h += v * P.valleySideSlope
          + A * P.mountainHeight * ridged(x / 3000 + 3.1, z / 3000 + 7.7, 4)
          + smooth(v / 300) * 260 * (fbm(x / 800, z / 800, 3) - 0.5);
      }
    }
    // Berms / side hits just inside the floor edges.
    const b = this.at(this.berm, t);
    if (b > 0.01) h += b * Math.exp(-(((ad - (w - 3)) / 3.5) ** 2));
    // Soft rolling lumps + fine detail; rock ledges on the walls.
    h += (fbm(x / 38, z / 38, 3) - 0.5) * P.lumps + (vnoise(x / 11, z / 11) - 0.5) * P.fineLumps;
    if (wallness > 0.05) h += (ridged(x / 42, z / 42, 3) - 0.35) * P.ledges * wallness * (1 - 0.5 * wallness);
    // The horn on the horizon.
    const H = P.horn;
    const hx = x - H.x, hz = z - H.z;
    const c = Math.cos(H.twist), s = Math.sin(H.twist);
    const r = Math.max(Math.abs(hx * c + hz * s), Math.abs(-hx * s + hz * c)) * 0.85 + Math.hypot(hx, hz) * 0.15;
    if (r < 3200) {
      const horn = H.peak - r * H.slope + (ridged(hx / 700, hz / 700, 3) - 0.5) * 220 * smooth(r / 600);
      if (horn > h) h = h + (horn - h) * smooth((horn - h) / 60);
    }
    return h;
  }

  // ---------------------------------------------------------------- terrain arrays
  /** Fill the playable tile + far backdrop. Yields to the browser so the loading bar moves. */
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
      const up = ny / l;
      splat[k * 3 + 1] = Math.round(smooth((0.68 - up) / 0.16) * 255);   // rock on steep faces (>~47°)
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
}
