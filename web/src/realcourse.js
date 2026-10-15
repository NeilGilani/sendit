// Real mountains (Lake Tahoe) with the same feel as the hand-built gully. Elevation, runs, lifts
// and forest come from tools/build_resorts.py (Copernicus DEM + OpenStreetMap); this class turns
// them into a playable tile: the chosen top-to-bottom run is carved in as a smooth groomed lane
// with banked edges, everything gets soft rolling lumps, pistes are cut through the forest, real
// lifts stand where they really are, and Lake Tahoe shimmers on the horizon.
// Same interface as Course (course.js): path, length, dropsAt, finishAt, progress(), height(),
// generate(), menuFocus(), plus forestAt(), pisteAt(), water, lifts.
import * as THREE from 'three';

const smooth = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
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
/** Catmull-Rom bicubic sample of a row-major float grid (row 0 = north = -z). */
function bicubic(g, res, size, x, z) {
  const sp = size / (res - 1);
  const fx = (x + size / 2) / sp, fz = (z + size / 2) / sp;
  const x0 = Math.floor(fx), z0 = Math.floor(fz), tx = fx - x0, tz = fz - z0;
  const w = (t) => { const t2 = t * t, t3 = t2 * t; return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]; };
  const wx = w(tx), wz = w(tz);
  let out = 0;
  for (let j = 0; j < 4; j++) {
    const zz = Math.min(res - 1, Math.max(0, z0 + j - 1)) * res;
    let row = 0;
    for (let i = 0; i < 4; i++) row += wx[i] * g[zz + Math.min(res - 1, Math.max(0, x0 + i - 1))];
    out += wz[j] * row;
  }
  return out;
}

export const REAL = {
  corridorHalfWidth: 17,         // metres — the carved run
  corridorBlend: 30,             // metres to blend back into the natural slope
  corridorDepth: 2.2,            // gentle half-pipe across the run
  corridorSmooth: 9,             // path samples (×8 m) used to smooth the run's long profile
  lumps: 2.6,                    // soft rolling lumps off the run
  fineLumps: 0.2,
  treeline: 2950,                // Sierra Nevada treeline (m)
  tileMin: 2560, tileMax: 4096,
};

export class RealCourse {
  static async load(id, runIndex = 0) {
    const base = '/resorts/';
    const meta = await (await fetch(`${base}${id}.json`)).json();
    const [dem, far, mask] = await Promise.all([
      fetch(`${base}${id}_dem.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}${id}_far.bin`).then((r) => r.arrayBuffer()),
      fetch(`${base}${id}_mask.bin`).then((r) => r.arrayBuffer()),
    ]);
    return new RealCourse(meta, new Float32Array(dem), new Float32Array(far), new Uint8Array(mask), runIndex);
  }

  constructor(meta, dem, far, mask, runIndex) {
    this.runIndex = runIndex;
    this.meta = meta;
    this.dem = dem; this.farGrid = far; this.mask = mask;
    this.run = meta.runs[Math.min(runIndex, meta.runs.length - 1)];
    this.name = meta.name;
    this.water = meta.water ?? -1e5;
    this.treeline = REAL.treeline;
    // Centre the playable tile on the run.
    const raw = this.run.path;
    let lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
    for (const [x, z] of raw) { lo = [Math.min(lo[0], x), Math.min(lo[1], z)]; hi = [Math.max(hi[0], x), Math.max(hi[1], z)]; }
    this.ox = (lo[0] + hi[0]) / 2; this.oz = (lo[1] + hi[1]) / 2;
    const ext = Math.max(hi[0] - lo[0], hi[1] - lo[1]) + 700;
    this.tileSize = Math.min(REAL.tileMax, Math.max(REAL.tileMin, Math.ceil(ext / 256) * 256));
    this.path = raw.map(([x, z]) => new THREE.Vector2(x - this.ox, z - this.oz));
    this.cum = [0];
    for (let i = 1; i < this.path.length; i++) this.cum.push(this.cum[i - 1] + this.path[i].distanceTo(this.path[i - 1]));
    this.length = this.cum[this.cum.length - 1];
    this.finishAt = Math.max(100, this.length - 40);
    this.dropsAt = [];
    // Smoothed long profile of the run (the carved lane follows it).
    const hRaw = this.path.map((p) => this.natural(p.x, p.y));
    const K = REAL.corridorSmooth;
    this.profile = hRaw.map((_, i) => {
      let s = 0, n = 0;
      for (let k = -K; k <= K; k++) { const j = Math.min(hRaw.length - 1, Math.max(0, i + k)); s += hRaw[j]; n++; }
      return s / n;
    });
    // Start where the slope picks up (real summits are often flat plateaus); at most 25% in.
    let start = 0;
    for (let i = 0; i < this.path.length * 0.25; i++) {
      const j = Math.min(this.path.length - 1, i + 5);
      if ((this.profile[i] - this.profile[j]) / Math.max(1, this.cum[j] - this.cum[i]) > 0.12) { start = i; break; }
    }
    if (start > 0) {
      this.path = this.path.slice(start);
      this.profile = this.profile.slice(start);
      this.cum = this.cum.slice(start).map((c) => c - this.cum[start]);
      this.length = this.cum[this.cum.length - 1];
      this.finishAt = Math.max(100, this.length - 40);
    }
    // Spatial hash of path samples for progress / distance queries.
    this.hash = new Map();
    this.path.forEach((p, i) => {
      const key = `${Math.floor(p.x / 64)},${Math.floor(p.y / 64)}`;
      if (!this.hash.has(key)) this.hash.set(key, []);
      this.hash.get(key).push(i);
    });
    // Real lifts, moved into tile coordinates.
    this.lifts = (meta.lifts || []).map((L) => ({
      ...L,
      line: L.line.map(([x, y, z]) => [x - this.ox, y, z - this.oz]),
      towers: L.towers.map(([x, y, z]) => [x - this.ox, y, z - this.oz]),
    }));
  }

  /** Natural terrain (DEM, then the far grid outside the 10 km window), tile coordinates. */
  natural(x, z) {
    const X = x + this.ox, Z = z + this.oz;
    const D = this.meta.dem, F = this.meta.far;
    const edge = Math.max(Math.abs(X), Math.abs(Z));
    const inner = D.size_m / 2 - 60;
    if (edge < inner - 400) return bicubic(this.dem, D.res, D.size_m, X, Z);
    const f = bicubic(this.farGrid, F.res, F.size_m, X, Z);
    if (edge >= inner) return f;
    return f + (bicubic(this.dem, D.res, D.size_m, X, Z) - f) * smooth((inner - edge) / 400);
  }

  maskAt(x, z, ch) {
    const D = this.meta.dem, sp = D.size_m / (D.res - 1);
    const i = Math.round((x + this.ox + D.size_m / 2) / sp), j = Math.round((z + this.oz + D.size_m / 2) / sp);
    if (i < 0 || j < 0 || i >= D.res || j >= D.res) return 0;
    return this.mask[(j * D.res + i) * 2 + ch] / 255;
  }
  forestAt(x, z) { return this.maskAt(x, z, 0); }
  pisteAt(x, z) { return Math.max(this.maskAt(x, z, 1), this.nearestRun(x, z, 40).d < REAL.corridorHalfWidth + 6 ? 1 : 0); }

  /** Nearest point on the run: { d, s (path length), i } within maxR (d = Infinity if none). */
  nearestRun(x, z, maxR = 60) {
    const cx = Math.floor(x / 64), cz = Math.floor(z / 64), r = Math.ceil(maxR / 64);
    let best = { d: Infinity, s: -1, i: -1 };
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const a = this.hash.get(`${cx + dx},${cz + dz}`);
      if (!a) continue;
      for (const i of a) {
        const d = Math.hypot(x - this.path[i].x, z - this.path[i].y);
        if (d < best.d) best = { d, s: this.cum[i], i };
      }
    }
    if (best.d > maxR) best.d = Infinity;
    return best;
  }

  progress(x, z) { const n = this.nearestRun(x, z, 80); return n.d === Infinity ? -1 : n.s; }
  menuFocus() { const i = Math.floor(this.path.length * 0.45); const p = this.path[i]; return new THREE.Vector3(p.x, this.profile[i] + 650, p.y); }

  /** Full-detail height (used for the tile). corr: optional { d, s, i } nearest-run info. */
  height(x, z, corr = null) {
    let h = this.natural(x, z);
    const R = REAL;
    let lane = 0;
    if (corr && corr.d < R.corridorHalfWidth + R.corridorBlend) {
      const i = Math.floor(corr.i), i2 = Math.min(this.path.length - 1, i + 1);
      const hc = this.profile[i] + (this.profile[i2] - this.profile[i]) * (corr.i - i);
      const floor = hc + R.corridorDepth * Math.min(1, (corr.d / R.corridorHalfWidth) ** 2) - 0.6;
      lane = 1 - smooth((corr.d - R.corridorHalfWidth) / R.corridorBlend);
      h = h + (floor - h) * lane;
    }
    const pisted = Math.max(lane, this.maskAt(x, z, 1) * 0.6);
    h += ((fbm(x / 38, z / 38, 3) - 0.5) * R.lumps + (vnoise(x / 11, z / 11) - 0.5) * R.fineLumps) * (1 - 0.65 * pisted);
    return h;
  }

  async generate(onProgress = () => {}) {
    const N = 2049, size = this.tileSize, sp = size / (N - 1), half = size / 2;
    // Rasterise the run corridor: nearest-run distance per grid cell.
    const reach = REAL.corridorHalfWidth + REAL.corridorBlend + 4;
    const dist = new Float32Array(N * N).fill(Infinity);
    const idx = new Float32Array(N * N).fill(-1);   // fractional path index (segment + t)
    for (let k = 0; k < this.path.length - 1; k++) {
      const a = this.path[k], b = this.path[k + 1];
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - reach + half) / sp)), i1 = Math.min(N - 1, Math.ceil((Math.max(a.x, b.x) + reach + half) / sp));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - reach + half) / sp)), j1 = Math.min(N - 1, Math.ceil((Math.max(a.y, b.y) + reach + half) / sp));
      const abx = b.x - a.x, abz = b.y - a.y, L2 = Math.max(abx * abx + abz * abz, 1e-6);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -half + i * sp, z = -half + j * sp;
        const t = Math.min(1, Math.max(0, ((x - a.x) * abx + (z - a.y) * abz) / L2));
        const d = Math.hypot(x - a.x - abx * t, z - a.y - abz * t);
        const c = j * N + i;
        if (d < dist[c]) { dist[c] = d; idx[c] = k + t; }
      }
    }
    const heights = new Float32Array(N * N);
    const corr = { d: 0, i: 0 };
    for (let j = 0; j < N; j++) {
      const z = -half + j * sp;
      for (let i = 0; i < N; i++) {
        const c = j * N + i;
        corr.d = dist[c]; corr.i = idx[c];
        heights[c] = this.height(-half + i * sp, z, idx[c] >= 0 ? corr : null);
      }
      if ((j & 63) === 0) { onProgress(0.75 * j / N); await new Promise((r) => setTimeout(r, 0)); }
    }
    const normals = new Uint8Array(N * N * 2), splat = new Uint8Array(N * N * 3);
    const hAt = (i, j) => heights[Math.min(N - 1, Math.max(0, j)) * N + Math.min(N - 1, Math.max(0, i))];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const nx = hAt(i - 1, j) - hAt(i + 1, j), ny = 2 * sp, nz = hAt(i, j - 1) - hAt(i, j + 1);
      const l = Math.hypot(nx, ny, nz);
      const k = j * N + i;
      normals[k * 2] = Math.round((nx / l) * 127.5 + 127.5);
      normals[k * 2 + 1] = Math.round((nz / l) * 127.5 + 127.5);
      const lane = dist[k] < REAL.corridorHalfWidth ? 1 : 0;
      const piste = Math.max(lane, this.maskAt(-half + i * sp, -half + j * sp, 1));
      splat[k * 3] = Math.round(piste * 0.55 * 255);                        // partly groomed on pistes
      splat[k * 3 + 1] = Math.round(smooth((0.68 - ny / l) / 0.16) * 255);   // rock on steep faces
    }
    onProgress(0.85);
    const FN = 512, fs = 30000, fsp = fs / (FN - 1);
    const farH = new Float32Array(FN * FN);
    let farMin = Infinity;
    for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) {
      const v = this.natural(-fs / 2 + i * fsp, -fs / 2 + j * fsp);
      farH[j * FN + i] = v;
      if (v < farMin) farMin = v;
    }
    onProgress(1);
    const p0 = this.path[1], p1 = this.path[Math.min(4, this.path.length - 1)];
    const heading = Math.atan2(-(p1.x - p0.x), -(p1.y - p0.y));
    return {
      meta: {
        size_m: size, res: N, spacing: sp, far_size_m: fs, far_res: FN, far_min_height: farMin,
        spawn: { position: [p0.x, 0, p0.y], heading },
      },
      heights, normals, splat, far: farH,
    };
  }
}
