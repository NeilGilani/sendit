// Loading scene terrain: one analytic height function H(x, z) for the hero line and the whole range
// around it, meshed twice so the seam is watertight:
//   near  a 240² grid over ±L (dense around the cliff: ~0.3 m cells on the line, ~7 m at the edge)
//   far   a ring from the near grid's square boundary out to a 40 km circle (same boundary vertices)
// The hero line runs down −Z: a 14° in-run on a narrow spine, a wind lip at the origin (the take-off),
// a ~13 m rock band below it and a 35° landing apron that rolls into the face. Mountain-scale sun and sky
// visibility are baked per vertex by marching a coarse height grid toward the sun (shadow maps cover
// only the action). Shading reuses the game's snow optics (gfx/snow.js SNOW_BAND_GLSL + rockShade)
// through world.js toonMaterial, plus loading/sky.js aerial perspective.
import * as THREE from 'three';
import { toonMaterial } from '../world.js';
import { SNOW_COMMON_PARS, SNOW_BAND_GLSL } from '../gfx/snow.js';
import { SNOW, ROCK } from '../scene.js';
import { ATMO_PARS_GLSL } from './sky.js';
import { rng } from './variants.js';
import { makeAxis } from './clip.js';

const D = Math.PI / 180;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Classic 2D gradient noise in [-1, 1] (seeded permutation). */
function makeNoise(seed) {
  const r = rng(seed);
  const perm = new Uint8Array(512), gx = new Float32Array(256), gy = new Float32Array(256);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  for (let i = 0; i < 256; i++) { const a = r() * Math.PI * 2; gx[i] = Math.cos(a); gy[i] = Math.sin(a); }
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10), v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const a = perm[X + perm[Y]], b = perm[X + 1 + perm[Y]], c = perm[X + perm[Y + 1]], d = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[a] * xf + gy[a] * yf, n10 = gx[b] * (xf - 1) + gy[b] * yf;
    const n01 = gx[c] * xf + gy[c] * (yf - 1), n11 = gx[d] * (xf - 1) + gy[d] * (yf - 1);
    const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
    return (nx0 + (nx1 - nx0) * v) * 1.41;
  };
}

/**
 * The height function for a variant. Returns { H, line } where line holds the hero-line geometry the
 * choreography needs (lip, cliff height, landing slope).
 */
export function makeHeight(v) {
  const M = v.mountain;
  const r = rng(v.terrainSeed);
  const n1 = makeNoise(v.terrainSeed), n2 = makeNoise(v.terrainSeed + 17), n3 = makeNoise(v.terrainSeed + 41);
  const fbm = (x, y, oct, g = 0.5) => { let a = 0, w = 1, s = 0; for (let i = 0; i < oct; i++) { a += w * n1(x, y); s += w; x = x * 2.03 + 7.1; y = y * 2.03 + 3.3; w *= g; } return a / s; };
  // Ridged multifractal: sharp crests, smooth valleys (successive octaves weighted by the previous).
  const ridged = (x, y, oct) => {
    let a = 0, w = 1, amp = 0.5, s = 0;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(n2(x, y));
      n = i < 1 ? Math.pow(n, 2.5) : n * n;     // sharp crests on the big ridges (not needle cones)
      n *= w;
      w = Math.min(1, n * 2.2);
      a += n * amp; s += amp;
      x = x * 2.1 + 5.3; y = y * 2.1 + 1.7; amp *= 0.52;
    }
    return a / s;
  };
  const line = {
    inrun: Math.tan(14 * D), lipUp: 0.21, lipLen: 4,
    cliff: r.range(12, 16), cliffLen: r.range(4.6, 6), land0: Math.tan(r.range(24, 28) * D), land1: Math.tan(r.range(36, 40) * D),
  };
  // Hero line profile along z (0 = lip; +z uphill in-run, −z the cliff and landing).
  const profile = (z) => {
    if (z >= 0) {
      if (z < line.lipLen) { const a = (line.inrun + line.lipUp) / (2 * line.lipLen); return a * z * z - line.lipUp * z; }
      const a = (line.inrun + line.lipUp) / (2 * line.lipLen);
      return a * line.lipLen * line.lipLen - line.lipUp * line.lipLen + line.inrun * (z - line.lipLen);
    }
    const u = -z, L = line.cliffLen;
    const s = u < L ? (1 - Math.cos(Math.PI * u / L)) / 2 : 1;
    // Apron below the band: eases in at land0 (a catchable landing) and steepens to land1 down the face.
    const f = Math.min(apron.length - 1.001, u * 4);
    const i = f | 0;
    return -line.cliff * s - (apron[i] + (apron[i + 1] - apron[i]) * (f - i));
  };
  // Integrated apron drop (0.25 m steps to 600 m): slope ramps from 0 at the lip to land0 past the
  // band, then to land1 between 15 m and 80 m.
  const apron = new Float32Array(2401);
  for (let k = 1; k < apron.length; k++) {
    const u = (k - 0.5) * 0.25;
    const sl = line.land0 * smooth(line.cliffLen * 0.25, line.cliffLen * 1.2, u) + (line.land1 - line.land0) * smooth(15, 80, u);
    apron[k] = apron[k - 1] + sl * 0.25;
  }
  line.land = line.land0;
  const hz = M.horn ? { x: (r() < 0.5 ? -1 : 1) * r.range(1400, 3200), z: -r.range(7500, 11000), h: r.range(1500, 2100) * M.peakScale, rot: r() * Math.PI } : null;
  const regional = (x, z) => {
    const u = -z, ax = Math.abs(x), rr = Math.hypot(x, z);
    // The face we're on falls toward −Z into the valley; the massif rises behind us.
    let y = -1500 * smooth(-500, 4300, u) * (1 - 0.35 * smooth(2500, 7000, ax));
    y += 420 * Math.exp(-((x + 120) ** 2) / 700 ** 2 - ((z - 950) ** 2) / 800 ** 2);
    y += 0.12 * Math.max(0, z) * smooth(0, 600, z) * (1 - smooth(900, 2500, z));
    // Ranges: across the valley and down both sides, growing with distance.
    const big = ridged(x / 3400 + 11.3, z / 3400 + 4.1, 7);
    // Massifs: a very low-frequency mask so the skyline has a few dominant groups of peaks and low cols
    // between them (a uniform ridged field reads as an egg crate of same-size cones).
    const mass = 0.35 + 1.05 * smooth(-0.35, 0.55, fbm(x / 11000 + 1.7, z / 11000 + 6.2, 3));
    const amp = (90 + 1900 * smooth(500, 7000, rr) * mass) * M.range * M.peakScale;
    // Ranges across the valley and on both sides (side views from the arete need peaks too).
    const across = Math.max(smooth(2800, 8000, u), smooth(1500, 5200, ax));
    y += (Math.pow(big, 1.25) * 1.25 - 0.3) * amp * (0.35 + 0.65 * Math.min(1, across));
    y += fbm(x / 900 + 3.1, z / 900 + 9.7, 6) * 160 * smooth(300, 3000, rr);
    // We stand on an arete: the mountain falls away steeply to both sides of the line (so side views
    // look out across the void to the ranges), fading out a couple of kilometres away.
    const fall = 3 * Math.log1p(Math.exp((ax - 14) / 3));
    const near = (1 - smooth(900, 2600, rr)) * (1 - 0.6 * smooth(250, 900, z));
    y -= Math.min(fall * 0.66, 420) * near;
    // Spur-and-gully relief down both flanks (ribs run down the fall line, i.e. across x): rock
    // spurs between snow couloirs instead of one smooth white wedge.
    const rib = 1 - Math.abs(n3(ax / 70 + 2.1, z / 16));
    y += (rib * rib * 14 - 5) * smooth(18, 70, ax) * near;
    if (hz) {
      // A lone horn across the valley: a four-faced pyramid, ridged and skewed.
      const dx = x - hz.x, dz = z - hz.z;
      const cr = Math.cos(hz.rot), sr = Math.sin(hz.rot);
      const px = dx * cr - dz * sr, pz = dx * sr + dz * cr;
      const d = (Math.abs(px) + Math.abs(pz)) * 0.55 + Math.hypot(px, pz) * 0.45;
      const t = Math.max(0, 1 - d / 2600);
      y += hz.h * Math.pow(t, 1.35 + 0.4 * M.sharp) * (0.92 + 0.08 * n3(px / 300, pz / 300));
    }
    return y;
  };
  // Value of the regional function at the lip, so the local line sits at y ≈ 0.
  const R0 = regional(0, 0);
  const clipG = v.clipPrep || null;
  // Only broad rolls (≥ ~40 m) beyond a clip's patch: the near grid is dense in strips there (its core follows the
  // line), and fine relief resolved in those strips but not beside them reads as bands of rock.
  const clipDetail = (x, z) => fbm(x / 70 + 4.4, z / 70 + 2.2, 2) * 4.0 + fbm(x / 180, z / 180 + 8.1, 2) * 8.0;
  const H = (x, z) => {
    const rr = Math.hypot(x, z * 0.8);
    const w = 1 - smooth(160, 520, rr);
    let reg = regional(x, z) - R0;
    if (w <= 0) return reg;
    // A saved highlight (loading/clip.js): the real mountain's snow around the ridden line, a fitted plane
    // with the scene's own rolls beyond it.
    if (clipG) return reg * (1 - w) + (clipG.local(x, z, clipDetail) + reg * 0.25 * (1 - w)) * w;
    // Local: the spine in-run, the rock band and the landing apron.
    const ax = Math.abs(x);
    // The rock band is ~70 m wide: past it the flank just keeps falling (no step cut into the sides).
    let y = z >= 0 ? profile(z) : profile(z) + line.cliff * smooth(22, 46, ax) * smooth(0, line.cliffLen, -z);
    // Cross-section, continuous through the lip: a knife-edged spine above it (narrow rideable crest,
    // steep rocky flanks), a broad shoulder below the band (the apron), both falling away to the sides.
    const spN = 2 * Math.log1p(Math.exp((ax - 6) / 2));
    const spW = 3 * Math.log1p(Math.exp((ax - 22) / 3));
    const kN = smooth(-8, 4, z);
    // Convex crest, monotonic away from the line (a tapered x² here folded a crease into the flanks).
    y += -0.75 * (Math.sqrt(1 + (ax / 4) ** 2) - 1) * smooth(0, 6, z);
    y -= 0.85 * spN * kN + 0.75 * spW * (1 - kN);
    // Detail: smooth on the line, rougher off it (rock buttresses, drifts).
    const off = smooth(4, 26, ax) + smooth(30, 90, z) + smooth(80, 200, -z);
    // The rock band's face: ledges and buttresses (it is a heightfield, so roughness in y on a steep
    // face reads as horizontal ledges), clear of the lip itself.
    const face = smooth(0.8, 2.0, -z) * (1 - smooth(line.cliffLen, line.cliffLen + 4, -z));
    if (face > 0) y += (fbm(x / 4.2 + 3.3, z / 2.2 + 1.1, 4) * 1.8 + fbm(x / 13, z / 5, 2) * 1.5) * face;
    // Rolls and pillows everywhere but the lip (a 35° apron that is a perfect plane reads as CG).
    y += fbm(x / 16 + 4.4, z / 16 + 2.2, 3) * 0.9 * smooth(5, 14, Math.abs(z + 2)) + fbm(x / 55, z / 55 + 8.1, 3) * 3.0 * smooth(10, 40, Math.abs(z));
    const det = fbm(x / 26 + 1.3, z / 26 + 7.7, 5) * (0.35 + 5.5 * Math.min(1, off)) + fbm(x / 7, z / 7, 3) * 0.12;
    y += det;
    return reg * (1 - w) + (y + reg * 0.25 * (1 - w)) * w;
  };
  // Clip: the near grid's dense core follows the ridden line (≤ 0.6 m cells), not the made-up cliff.
  const mesh = clipG ? { ax: makeAxis(170, -L, L, clipG.core.x0, clipG.core.x1, 0.6), az: makeAxis(300, -L + CZ, L + CZ, clipG.core.z0, clipG.core.z1, 0.6) } : null;
  return { H, line, profile, horn: hz, mesh, clear: clipG?.clear, inPatch: clipG?.inPatch };
}

// --------------------------------------------------------------------- meshing
const L = 420;            // near grid half-size (m)
const NN = 210;           // near grid vertices per side
const RFAR = 42000;       // far ring outer radius (m)
const NR = 300;           // far ring rows
const CZ = -14;           // near grid centre z (dense around the cliff and landing)

function axis(n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1)) * 2 - 1;
    a[i] = L * (0.085 * u + 0.915 * u * u * u);
  }
  return a;
}

/** Coarse height grid over ±half for the visibility march (and the cloud sea's thickness test). */
function heightGrid(H, n, half) {
  const g = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g[j * n + i] = H(-half + (i / (n - 1)) * 2 * half, -half + (j / (n - 1)) * 2 * half);
  const s = (n - 1) / (2 * half);
  const at = (x, z) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x + half) * s)), fz = Math.min(n - 1.001, Math.max(0, (z + half) * s));
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * n + i;
    return (g[k] * (1 - tx) + g[k + 1] * tx) * (1 - tz) + (g[k + n] * (1 - tx) + g[k + n + 1] * tx) * tz;
  };
  return { g, n, half, at };
}

/**
 * Build both meshes + per-vertex visibility. sunDir: THREE.Vector3 (toward the sun).
 * Returns { near, far, grid, stats }.
 */
export function buildTerrain(height, sunDir, material, farMaterial) {
  const t0 = performance.now();
  const { H } = height;
  const coarse = heightGrid(H, 288, 26000);
  const fine = heightGrid(H, 200, 700);
  // Near grid axes: x and z (absolute). Default: the same cubic axis both ways around the cliff; a clip
  // brings its own (a dense core along the ridden line).
  const ax = height.mesh?.ax || axis(NN);
  const az = height.mesh?.az || axis(NN).map((v) => v + CZ);
  const NX = ax.length, NZ = az.length;
  // ---- near grid
  const nPos = new Float32Array(NX * NZ * 3);
  for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
    const x = ax[i], z = az[j], k = (j * NX + i) * 3;
    nPos[k] = x; nPos[k + 1] = H(x, z); nPos[k + 2] = z;
  }
  const nIdx = [];
  for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
    const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
    nIdx.push(a, c, b, b, c, d);
  }
  // ---- far ring: inner boundary = the near grid's boundary (counter-clockwise, seen from above).
  const ring = [];
  for (let i = 0; i < NX - 1; i++) ring.push([ax[i], az[0]]);                 // z = −L edge, x →
  for (let j = 0; j < NZ - 1; j++) ring.push([ax[NX - 1], az[j]]);            // x = +L edge, z →
  for (let i = NX - 1; i > 0; i--) ring.push([ax[i], az[NZ - 1]]);            // z = +L edge, x ←
  for (let j = NZ - 1; j > 0; j--) ring.push([ax[0], az[j]]);                 // x = −L edge, z ←
  // Row 0 = the near grid boundary (P0 vertices); rows 1.. use every other column (P1) and grow
  // exponentially, so far triangles stay roughly square (no radial streaks on distant faces).
  const P0 = ring.length, P1 = P0;   // every boundary column: ~38 m spacing at 5 km (silhouettes stay smooth)
  const P = P0;
  const fPos = new Float32Array((P0 + P1 * (NR - 1)) * 3);
  for (let p = 0; p < P0; p++) {
    const [bx, bz] = ring[p];
    fPos[p * 3] = bx; fPos[p * 3 + 1] = H(bx, bz); fPos[p * 3 + 2] = bz;
  }
  for (let rI = 1; rI < NR; rI++) {
    const t = rI / (NR - 1);
    for (let j = 0; j < P1; j++) {
      const [bx, bz] = ring[j];
      const rb = Math.hypot(bx, bz);
      const f = (rb * Math.pow(RFAR / rb, t) - rb) / (RFAR - rb);
      const a = Math.atan2(bz, bx);
      const x = bx + (Math.cos(a) * RFAR - bx) * f, z = bz + (Math.sin(a) * RFAR - bz) * f;
      const k = (P0 + (rI - 1) * P1 + j) * 3;
      fPos[k] = x; fPos[k + 1] = H(x, z); fPos[k + 2] = z;
    }
  }
  const fIdx = [];
  const out = (rI, j) => (rI === 0 ? j % P0 : P0 + (rI - 1) * P1 + (j % P1));
  for (let rI = 0; rI < NR - 1; rI++) for (let j = 0; j < P1; j++) {
    const a = out(rI, j), b = out(rI, j + 1), c = out(rI + 1, j), d = out(rI + 1, j + 1);
    fIdx.push(a, b, c, b, d, c);
  }
  const tBuild = performance.now() - t0;
  // ---- normals (finite differences of H) + visibility
  // Seam vertices (near boundary = far row 0) get finite-difference normals of H so both meshes agree.
  const fdNormal = (x, z, out, k) => {
    const e = Math.max(0.15, Math.hypot(x, z) * 0.004);
    const nx = -(H(x + e, z) - H(x - e, z)), ny = 2 * e, nz = -(H(x, z + e) - H(x, z - e));
    const l = Math.hypot(nx, ny, nz);
    out[k] = nx / l; out[k + 1] = ny / l; out[k + 2] = nz / l;
  };
  const geo = (pos, idx, seam, gridW = 0) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const nor = g.attributes.normal.array;
    for (const i of seam) fdNormal(pos[i * 3], pos[i * 3 + 2], nor, i * 3);
    // A clip's grid is dense one way and coarse the other in long strips (0.6 m × 10 m cells): face normals
    // of those slivers alias the fine relief into hatching. Normals from H at the cell's own scale instead.
    if (gridW && height.mesh) {
      const rows = pos.length / 3 / gridW;
      for (let j = 0; j < rows; j++) for (let i = 0; i < gridW; i++) {
        const ex = (ax[Math.min(gridW - 1, i + 1)] - ax[Math.max(0, i - 1)]) / 2, ez = (az[Math.min(rows - 1, j + 1)] - az[Math.max(0, j - 1)]) / 2;
        const e = Math.max(0.15, Math.max(ex, ez) * 0.6), k = (j * gridW + i) * 3, x = pos[k], z = pos[k + 2];
        const nx = -(H(x + e, z) - H(x - e, z)), ny = 2 * e, nz = -(H(x, z + e) - H(x, z - e)), l = Math.hypot(nx, ny, nz);
        nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
      }
    }
    const n = pos.length / 3;
    const vis = new Float32Array(n * 2);
    const sx = sunDir.x, sy = sunDir.y, sz = sunDir.z;
    const sh = Math.hypot(sx, sz) || 1, dxs = sx / sh, dzs = sz / sh, tanSun = sy / sh;
    const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      const rr = Math.hypot(x, z);
      // Sun: the steepest horizon toward the sun (fine grid first, then coarse), soft penumbra.
      // Facing away from the sun: Lambert already has it dark, skip the march.
      const ndl = nor[i * 3] * sx + nor[i * 3 + 1] * sy + nor[i * 3 + 2] * sz;
      // Heights are compared on the march grid itself (its surface can sit a metre off the detailed mesh,
      // which made vertices shadow themselves in blotches); start a few cells out.
      const inFine = Math.abs(x) < 690 && Math.abs(z) < 690;
      const y0 = Math.max(y, inFine ? fine.at(x, z) : coarse.at(x, z));
      let maxT = -1e9, d = Math.max(inFine ? 10 : 150, rr * 0.01);
      if (ndl < -0.15) d = 1e9;
      while (d < 30000) {
        const px = x + dxs * d, pz = z + dzs * d;
        const near = Math.abs(px) < 690 && Math.abs(pz) < 690;
        const hh = near ? fine.at(px, pz) : coarse.at(px, pz);
        const tt = (hh - y0 - 0.6) / d;
        if (tt > maxT) maxT = tt;
        d *= near ? 1.2 : 1.3;
      }
      const sunVis = smooth(-0.07, 0.07, tanSun - maxT);
      // Sky: average openness over six azimuths (a cheap horizon-based AO).
      let open = 0;
      for (const [cx, cz] of dirs) {
        let m = 0, dd = Math.max(3, rr * 0.02);
        for (let s = 0; s < 5; s++) {
          const px = x + cx * dd, pz = z + cz * dd;
          const near = Math.abs(px) < 690 && Math.abs(pz) < 690;
          const hh = near ? fine.at(px, pz) : coarse.at(px, pz);
          m = Math.max(m, (hh - y) / dd);
          dd *= 2.6;
        }
        open += 1 - Math.min(1, Math.max(0, Math.atan(m) / (Math.PI / 2)));
      }
      vis[i * 2] = sunVis; vis[i * 2 + 1] = Math.pow(open / dirs.length, 1.3);
    }
    // Near grid: two 3×3 box passes over the baked visibility (it comes from a 7 m height grid and would
    // otherwise show as blocky, grid-aligned shadow shapes on the snow).
    if (gridW) for (let pass = 0; pass < 2; pass++) {
      const src = vis.slice(), H2 = n / gridW;
      for (let j = 1; j < H2 - 1; j++) for (let i = 1; i < gridW - 1; i++) {
        for (let c = 0; c < 2; c++) {
          let a = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) a += src[((j + dj) * gridW + i + di) * 2 + c];
          vis[(j * gridW + i) * 2 + c] = a / 9;
        }
      }
    }
    g.setAttribute('aVis', new THREE.BufferAttribute(vis, 2));
    g.computeBoundingSphere();
    return g;
  };
  const seamN = [];
  for (let k = 0; k < NX; k++) seamN.push(k, (NZ - 1) * NX + k);
  for (let k = 0; k < NZ; k++) seamN.push(k * NX, k * NX + NX - 1);
  const near = new THREE.Mesh(geo(nPos, nIdx, seamN, NX), material);
  near.name = 'loadingTerrainNear';
  near.receiveShadow = true;
  // Only the rider casts into the shadow map: the terrain's own bumps cast faceted, blocky shadows at
  // low sun (and cost a shadow pass); its self-shadowing comes from the baked visibility instead.
  near.castShadow = false;
  const far = new THREE.Mesh(geo(fPos, fIdx, [...Array(P).keys()]), farMaterial);
  far.name = 'loadingTerrainFar';
  far.frustumCulled = false;
  return { near, far, coarse, fine, stats: { build: Math.round(tBuild), total: Math.round(performance.now() - t0), verts: NX * NZ + fPos.length / 3 } };
}

// --------------------------------------------------------------------- material
/** The uniforms snow.js's band + rockShade read (snowUniforms() without its DOM rock texture). */
export function snowUniformsLite(noiseTex, rockTex) {
  const lin = (hex) => new THREE.Color(hex);
  return {
    uSnowAlbedo: { value: lin(SNOW.albedo) }, uSnowOld: { value: lin(SNOW.albedoPacked) },
    uSnowSSS: { value: lin(SNOW.subsurface).multiplyScalar(SNOW.subsurfaceStrength) },
    uSnowLook: { value: new THREE.Vector4(SNOW.wrap, SNOW.roughness, SNOW.specular, SNOW.forwardScatter) },
    uSparkle: { value: new THREE.Vector3(SNOW.sparkle, SNOW.sparkleDensity, SNOW.sparkleCone) },
    uWindDir: { value: new THREE.Vector2(Math.cos(SNOW.windAngle), Math.sin(SNOW.windAngle)) },
    uDetail: { value: 2 }, uSnowShape: { value: new THREE.Vector4(SNOW.drift, SNOW.ripple, SNOW.sastrugi, SNOW.corduroy) },
    uTrackLook: { value: new THREE.Vector3(SNOW.trackDepth, SNOW.trackLip, SNOW.trackDark) },
    uRockA: { value: lin(ROCK.dark) }, uRockB: { value: lin(ROCK.light) }, uRockC: { value: lin(ROCK.rust) },
    uRockLook: { value: new THREE.Vector4(ROCK.strataScale, ROCK.ledgeSnow, ROCK.exposeSlope, ROCK.exposeSoft) },
    uForestCol: { value: lin(SNOW.forest) }, uFarForest: { value: new THREE.Vector3(2350, 300, 9500) },
    uRockTex: { value: rockTex }, uRockScale: { value: new THREE.Vector4(ROCK.blockBig, ROCK.blockMid, ROCK.blockSmall, ROCK.photoTile) },
    noiseTex: { value: noiseTex },
  };
}

const TERRAIN_FRAG = /* glsl */`
{
  vec3 N = normalize(vWN);
  tFP = max(length(dFdx(vW)), length(dFdy(vW)));
  float slope = 1.0 - N.y;
  float n0 = texture2D(noiseTex, vW.xz * 0.0041 + 0.13).r;
  float n1 = texture2D(noiseTex, vW.xz * 0.031 + 0.71).g;
  // Snow holds up to ~50° (less where the wind scours ridges); rock bands show through above.
  // Near: snow sticks to anything under ~55° (big, soft-edged rock bands above that, never spots).
  float nb = texture2D(noiseTex, vW.xz * 0.0017 + 0.31).g;
  float hold = 0.36 + (nb - 0.5) * 0.14 + (n0 - 0.5) * 0.06;
  // A wide transition: a narrow one turns every line of maximum slope into a 1-px dark contour.
  float rock = smoothstep(hold, hold + 0.24, slope);
#ifdef FAR
  // Big faces shed snow from ~35°: dark rock walls, snow in the couloirs and on the shoulders.
  // Low-frequency hold line and a wide band: a narrow threshold on detailed noise mottles into speckle.
  float holdF = 0.2 + (texture2D(noiseTex, vW.xz * 0.0011 + 0.5).g - 0.5) * 0.2 + (texture2D(noiseTex, vW.xz * 0.0004 + 0.1).r - 0.5) * 0.1;
  rock = smoothstep(holdF - 0.04, holdF + 0.16, slope);
  // Conifers below the treeline on the gentler valley sides: near-black green, speckled.
  float nT = texture2D(noiseTex, vW.xz * 0.0007 + 0.21).r;   // low-frequency treeline jitter (fine noise flecked the valleys)
  float tree = (1.0 - smoothstep(uTreeLine - 260.0, uTreeLine + 220.0, vW.y + (nT - 0.5) * 320.0)) * (1.0 - smoothstep(0.32, 0.5, slope));
  tree *= smoothstep(0.1, 0.4, texture2D(noiseTex, vW.xz * 0.0011).g + 0.25);   // dense forest, broken only in big glades
#endif
  vec3 rc = vec3(0.3), Nr = N, Nh = N; float band = 0.0;
  if (rock > 0.01) {
#ifdef FAR
    // Far faces (most of the frame in wide shots): the game's rock albedo + strata ledges, no Voronoi
    // block lighting (it costs a lot of fill rate at high DPI and can't be seen past a few hundred metres).
    vec2 ru = vec2(vW.x * 0.7 + vW.z * 0.7, vW.y);
    // A smooth tone (the game's rockAlbedo streak / bed lookups alias into crosses at this range).
    float rt = texture2D(noiseTex, ru * vec2(0.0021, 0.0034)).r * 0.6 + texture2D(noiseTex, ru * 0.009 + 0.37).g * 0.4;
    rc = mix(uRockA, uRockB, smoothstep(0.25, 0.8, rt)) * (0.88 + 0.24 * n1);
    // (no ledge lines here: at this scale they alias into speckle)
#else
    rockShade(vW, N, tFP, rc, Nr, Nh, band);
#endif
    // Snow on ledges and on block tops that tilt up.
#ifdef FAR
    float ledge = band * 0.6;
#else
    float ledge = smoothstep(0.55, 0.8, Nh.y) * smoothstep(0.35, 0.7, n1) + band * 0.6;
#endif
    rock *= 1.0 - clamp(ledge, 0.0, 0.85);
  }
  // Snow relief: soft drifts + wind ripples from the noise gradients (fades with distance).
  // Differences over ~4 texels: 1-texel steps pick up the bilinear grid of the noise (a brick pattern).
  float e = 0.016;
  // Wind-carved: long drifts and sastrugi stretched along the wind, not round blotches. Faded out by
  // ~1 m/px: differences of a far mip level show the texture's bilinear grid as crosses.
  vec2 q = vec2(dot(vW.xz, uWindDir), dot(vW.xz, vec2(-uWindDir.y, uWindDir.x))) * vec2(0.008, 0.03);
  float h0 = texture2D(noiseTex, q).r, hx = texture2D(noiseTex, q + vec2(e, 0.0)).r, hy = texture2D(noiseTex, q + vec2(0.0, e)).r;
  vec2 qf = vW.xz * 0.09 + 0.37;
  float f0 = texture2D(noiseTex, qf).g, fx = texture2D(noiseTex, qf + vec2(e, 0.0)).g, fy = texture2D(noiseTex, qf + vec2(0.0, e)).g;
  vec2 q2 = vec2(dot(vW.xz, uWindDir), dot(vW.xz, vec2(-uWindDir.y, uWindDir.x))) * vec2(0.9, 0.25);
  float r0 = texture2D(noiseTex, q2).b, rx = texture2D(noiseTex, q2 + vec2(e, 0.0)).b;
  float fade = 1.0 - smoothstep(0.08, 1.2, tFP);
  vec3 Ns = normalize(N + (vec3(uWindDir.x, 0.0, uWindDir.y) * (hx - h0) + vec3(-uWindDir.y, 0.0, uWindDir.x) * (hy - h0)) * (-3.4) * (1.0 - smoothstep(0.25, 1.2, tFP)) + vec3(fx - f0, 0.0, fy - f0) * (-0.35) * fade + vec3(uWindDir.x, 0.0, uWindDir.y) * (rx - r0) * (-30.0) * (1.0 - smoothstep(0.02, 0.18, tFP)) * 0.03);
#ifdef FAR
  if (tree > 0.01) {
    // Forest as a dark mass with soft clumps (a fine speckle reads as crosses at high DPI).
    float sp = texture2D(noiseTex, vW.xz * 0.009).r * 0.7 + texture2D(noiseTex, vW.xz * 0.031 + 0.4).g * 0.3;
    rc = mix(rc, uForestCol * (0.5 + 0.5 * sp), tree);
    rock = max(rock, tree * 0.92);
  }
#endif
  tN = normalize(mix(Ns, Nr, rock));
  tRock = rock;
  float age = smoothstep(0.3, 0.8, texture2D(noiseTex, vW.xz * 0.011 + 0.4).g);
  vec3 snowC = mix(uSnowAlbedo, uSnowOld, 0.15 + 0.35 * age) * (0.97 + 0.06 * n1);
  diffuseColor.rgb = mix(snowC, rc, rock * rock);   // partial cover stays snowy, not grey
  tCavity = mix(0.8, 1.0, vVisT.y);
  tGlaze = 0.25 + 0.4 * smoothstep(0.5, 0.9, n0);
  tGlintMask = 1.0 - rock;
}`;

// Shaded rock reads as a black hole under the game grade at these sizes: a little bounce off the snow.
const ROCK_FILL_GLSL = 'light += (uSkyAmb * 0.35 + uGroundAmb * 0.25) * tRock * occl;';

/** Snow + rock material (near: full rock detail; far: ROCK_LITE + ROCK_FAR, no sparkle). */
export function terrainMaterial(uniforms, atmo, { far = false } = {}) {
  const m = toonMaterial({
    name: far ? 'loadingTerrainFar' : 'loadingTerrainNear',
    uniforms: { ...uniforms, ...atmo, uTreeLine: { value: -1150 } },
    vertPars: 'attribute vec2 aVis; varying vec2 vVisT;',
    vert: 'vVisT = aVis;',
    fragPars: SNOW_COMMON_PARS + ATMO_PARS_GLSL + 'vec3 tN; varying vec2 vVisT; uniform float uTreeLine;',
    frag: TERRAIN_FRAG,
    band: SNOW_BAND_GLSL + ROCK_FILL_GLSL,
  });
  m.defines = far ? { FAR: 1, ROCK_LITE: 1, ROCK_FAR: 1, DEBUGVIEW: (typeof self !== 'undefined' && self.__loadDebugView) || 0 } : { SNOW_SPARKLE: 1, ROCK_LITE: 1, DEBUGVIEW: (typeof self !== 'undefined' && self.__loadDebugView) || 0 };   // ?loaddebug=view1|2|3: rock mask / normals / baked visibility
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(tN, 0.0)).xyz);')
      .replace('sunMaskFactor = sm.r;', 'sunMaskFactor = sm.r * vVisT.x;')
      .replace('skyVis = sm.g;', 'skyVis = sm.g * vVisT.y;')
      .replace('#include <fog_fragment>', `gl_FragColor.rgb = aerial(gl_FragColor.rgb, vW);
#if defined(DEBUGVIEW) && DEBUGVIEW == 1
gl_FragColor.rgb = vec3(tRock, 0.2, 1.0 - tRock) * 3.0;
#elif defined(DEBUGVIEW) && DEBUGVIEW == 2
gl_FragColor.rgb = (normalize(vWN) * 0.5 + 0.5) * 3.0;
#elif defined(DEBUGVIEW) && DEBUGVIEW == 3
gl_FragColor.rgb = vec3(vVisT, 0.0) * 3.0;
#elif defined(DEBUGVIEW) && DEBUGVIEW == 4
gl_FragColor.rgb = diffuseColor.rgb * 2.0;
#elif defined(DEBUGVIEW) && DEBUGVIEW == 5
gl_FragColor.rgb = (tN * 0.5 + 0.5) * 2.0;
#endif
`);
  };
  m.customProgramCacheKey = () => m.name;
  return m;
}
