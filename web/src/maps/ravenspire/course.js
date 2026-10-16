// Ravenspire — an isolated big-mountain freeride face (map 3). One deterministic height function:
//   macro: the face between two converging ridges under a summit horn, a valley below, wild ranges
//   around (north peaks big and dark, south ones lower so the face stays in the sun);
//   detail: powder lumps, fall-line rock ribs, a spine field, stacked cliff bands with benches and
//   rounded lips, pillow fields, wind lips and rollers, a deep ravine with frozen ledges, and drifts
//   piled against old buildings whose snowy roofs are rideable (structures.js).
// Course-compatible (course.js / realcourse.js API): path, length, dropsAt, finishAt, progress(),
// centre-free, height(), generate(), menuFocus(), lifts, plus forestAt/pisteAt/treeline (scatter),
// park:false (no kickers / banners / crowds), heightAt/blockAt (features hook), buildProps(),
// physics (per-map physics hook) and camera (per-map camera tuning).
import * as THREE from 'three';
import { vnoise, noise1, fbm, ridged, smooth, sstep, mulberry32, hash1 } from './noise.js';
import {
  TILE, START_X, TOP, FINISH_U, PROFILE, BEHIND, FACE, BANDS, SPINES, PILLOWS, RAVINE, HITS, BUILDINGS, GONDOLA, BUTTRESSES, DROP_ZONES, LINE_GOALS, RIDE_LINES,
} from './layout.js';
import { Structure } from './structures.js';
import { RAVENSPIRE_PHYSICS, RAVENSPIRE_CAMERA } from './tuning.js';

const U_MIN = -7000, U_MAX = 9000;      // profile table range (1 m)
const DEG = Math.PI / 180;
const FALL = [1, 0];                    // the face falls toward +x
const BENCH_PER_M = 4;                  // bench length per metre of cliff height (keeps the lip angle ≳ 30°)

export class RavenspireCourse {
  constructor() {
    this.name = 'Ravenspire';
    this.id = 'ravenspire';
    this.meta = { id: 'ravenspire' };   // activities / leaderboard key
    this.park = false;                  // no kickers, rollers, banners or crowds (features.js)
    this.life = { skiers: 0, lodge: false };   // no other people, no lodge (life.js)
    // scatter.js overrides: fewer, smaller boulders on the face; a sparser larch forest (trees are the most
    // expensive thing in the frame, docs/graphics-perf.md) — ~8k trees instead of 16k.
    this.spawn = { rockClusterChance: 0.035, rockScale: [0.7, 2.2], rockMinSlope: 20, treeStep: 9.5, treeMax: 9000 };
    this.challenge = { medalSpeeds: { gold: 24, silver: 20, bronze: 16 } };
    this.physics = RAVENSPIRE_PHYSICS;
    this.camera = RAVENSPIRE_CAMERA;
    this.water = -1e5;
    this.edgeHint = 'Edge of the wild — head back onto the face';
    this.lifts = [];
    this.buildTables();
    this.buildPillows();
    this.buildStructures();
    this.buildPath();
    this.treeline = this.profileAt(1640) + 40;
    // Line goals (physics/flow.js): named features in order, in one clean run.
    this.lineGoals = LINE_GOALS.map(([name, bonus, ...features]) => ({ name, bonus, features }));
    // Drop zones (player.js): { name, x, z, heading }.
    this.dropZones = DROP_ZONES.map(([name, u, v]) => ({ name, x: START_X + u, z: v === 'ravine' ? this.rvAt(this.rv.c, u) : v, heading: -Math.PI / 2 }));
  }

  // ---------------------------------------------------------------- tables
  buildTables() {
    const n = U_MAX - U_MIN + 1;
    const segs = [];
    let acc = 0;
    for (const [len, deg] of PROFILE) { segs.push([acc, acc + len, Math.tan(deg * DEG)]); acc += len; }
    const back = [];
    acc = 0;
    for (const [len, deg] of BEHIND) { back.push([acc, acc + len, Math.tan(deg * DEG)]); acc += len; }
    const gAt = (u) => {
      if (u >= 0) { for (const s of segs) if (u < s[1]) return s[2]; return segs[segs.length - 1][2]; }
      for (const s of back) if (-u < s[1]) return s[2];
      return back[back.length - 1][2];
    };
    const grad = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const u = U_MIN + i;
      let g = 0, w = 0;
      for (let k = -15; k <= 15; k += 3) { g += gAt(u + k); w++; }
      grad[i] = g / w;
    }
    const e = new Float64Array(n);
    const i0 = -U_MIN;
    e[i0] = TOP;
    for (let i = i0 + 1; i < n; i++) e[i] = e[i - 1] - grad[i];
    for (let i = i0 - 1; i >= 0; i--) e[i] = e[i + 1] + grad[i];
    this.e0 = e;
    // Ravine tables (1 m) over its extent.
    const R = RAVINE, rn = R.u1 - R.u0 + 41;
    this.rv = { c: new Float64Array(rn), f: new Float64Array(rn), d: new Float64Array(rn), w: new Float64Array(rn), l: new Float64Array(rn) };
    for (let i = 0; i < rn; i++) {
      const u = R.u0 - 20 + i;
      this.rv.c[i] = R.centre(u); this.rv.f[i] = R.floor(u); this.rv.d[i] = R.depth(u); this.rv.w[i] = R.wall(u);
      // Frozen ledges in the floor: a short bench above each step (raise), dropping at the ledge.
      let l = 0;
      for (const [ul, h] of R.ledges) l += benchRaise(u, ul, h, Math.max(24, h * 4), 1.4 + h * 0.06);
      this.rv.l[i] = l;
    }
  }

  profileAt(u) {
    const f = Math.min(Math.max(u - U_MIN, 0), U_MAX - U_MIN - 1.0001);
    const i = f | 0, k = f - i;
    return this.e0[i] + (this.e0[i + 1] - this.e0[i]) * k;
  }

  rvAt(arr, u) {
    const f = Math.min(Math.max(u - (RAVINE.u0 - 20), 0), arr.length - 1.0001);
    const i = f | 0, k = f - i;
    return arr[i] + (arr[i + 1] - arr[i]) * k;
  }

  // ---------------------------------------------------------------- pillows (precomputed domes)
  buildPillows() {
    this.pillows = [];
    for (const F of PILLOWS) {
      const rnd = mulberry32(F.seed * 977);
      const du = (F.u1 - F.u0) / F.rows;
      for (let r = 0; r < F.rows; r++) {
        let v = F.v0 + (r % 2) * 5 + rnd() * 4;
        while (v < F.v1) {
          const R = (4.6 + rnd() * 3.2) * F.size;
          const u = F.u0 + (r + 0.5) * du + (rnd() - 0.5) * du * 0.55;
          const edge = Math.min(v - F.v0, F.v1 - v, u - F.u0, F.u1 - u);
          const H = (2.2 + rnd() * 2.6) * F.size * (0.55 + 0.45 * smooth(edge / 25));
          if (rnd() > 0.12) this.pillows.push({ u, v, R, H, Rv: R * (1.25 + rnd() * 0.3) });
          v += R * (1.9 + rnd() * 0.5);
        }
      }
    }
    // Spatial hash (16 m cells, u/v).
    this.pillowHash = new Map();
    for (const p of this.pillows) {
      const r = p.Rv + 1;
      for (let cu = Math.floor((p.u - r) / 16); cu <= Math.floor((p.u + r) / 16); cu++) {
        for (let cv = Math.floor((p.v - r) / 16); cv <= Math.floor((p.v + r) / 16); cv++) {
          const k = cu * 4096 + cv;
          let a = this.pillowHash.get(k);
          if (!a) this.pillowHash.set(k, (a = []));
          a.push(p);
        }
      }
    }
  }

  // ---------------------------------------------------------------- buildings
  buildStructures() {
    this.structures = BUILDINGS.map((b) => new Structure(b, START_X + b.u, b.v, FALL, (x, z) => this.natural(x, z)));
    // Bounding box of every drift (driftAt's own reach test, padded), so height() skips them elsewhere.
    this.driftBox = [Infinity, -Infinity, Infinity, -Infinity];
    for (const s of this.structures) {
      const r = s.hl + 26 + s.hw + 2;
      this.driftBox = [Math.min(this.driftBox[0], s.x - r), Math.max(this.driftBox[1], s.x + r), Math.min(this.driftBox[2], s.z - r), Math.max(this.driftBox[3], s.z + r)];
    }
    // Gondola towers along the old line (obstacles + props).
    const G = GONDOLA, towers = [];
    for (let i = 1; i <= G.towers; i++) {
      const t = i / (G.towers + 1);
      const u = G.from[0] + (G.to[0] - G.from[0]) * t, v = G.from[1] + (G.to[1] - G.from[1]) * t;
      towers.push({ x: START_X + u, z: v, lean: (hash1(i * 31) - 0.5) * 0.09, roll: (hash1(i * 17) - 0.5) * 0.06 });
    }
    this.towers = towers;
    this.obstacles = [];
    for (const t of towers) this.obstacles.push([t.x, t.z, 1.1, 'tower']);
    // The station's weather mast (props.js): beside the uphill corner, tall enough to show over the lip.
    const st = this.structures.find((k) => k.id === 'station');
    if (st) {
      const [x, z] = st.world(-st.hl + 3, -(st.hw + 3.5));
      this.mast = { x, z, h: 24 };
      this.obstacles.push([x, z, 0.4, 'tower']);
    }
  }

  // ---------------------------------------------------------------- path (the hero line)
  buildPath() {
    // A natural top-to-bottom line: centre of the face, through the Throne, left of the station,
    // down the bowl past the refuge to the valley.
    const knots = [[0, 0], [300, 20], [548, -20], [800, -40], [1010, -60], [1150, -40], [1292, -10], [1400, 120],
      [1550, 160], [1700, 40], [1880, -90], [2050, -40], [2250, 30], [2450, 40], [FINISH_U + 160, 40]];
    const pts = [];
    for (let u = 0; u <= FINISH_U + 160; u += 8) {
      let k = 0;
      while (k < knots.length - 2 && knots[k + 1][0] < u) k++;
      const [ua, va] = knots[k], [ub, vb] = knots[k + 1];
      const t = smooth((u - ua) / (ub - ua));
      pts.push(new THREE.Vector2(START_X + u, va + (vb - va) * t));
    }
    this.path = pts;
    this.length = 0;
    for (let i = 1; i < pts.length; i++) this.length += pts[i].distanceTo(pts[i - 1]);
    // Interface: progress is metres down the fall line (any line counts), finish across the valley.
    this.finishAt = FINISH_U;
    this.dropsAt = BANDS.filter((b) => b.v0 < 0 && b.v1 > 0).map((b) => b.uc);
  }

  progress(x) { return x - START_X; }
  tAt(z) { void z; return 0; }
  menuFocus() { return new THREE.Vector3(START_X + 1250, this.profileAt(1250) + 700, 0); }

  // ---------------------------------------------------------------- the height function
  /** Macro shape only (everywhere): face, ridges, summit horn, valley and the wild ranges around. */
  macro(x, z) {
    const u = x - START_X, v = z;
    let e = this.profileAt(u);
    const sd = v < 0 ? 0 : 1;
    // Ridge crests wander and carry gendarmes (rock towers), different on each side.
    const W = (FACE.halfWidth(u) + (sd ? FACE.rightExtra(u) : 0)) * (1 + 0.07 * (noise1(u / 170, 3 + sd) * 2 - 1));
    const Rh = FACE.ridgeHeight(u) * (0.85 + 0.3 * noise1(u / 260, 7 + sd));
    // Gendarmes: rock towers on the crest itself (within ~30 m of it), never on the face.
    const crest = 30 * Math.pow(ridged(u / 90, sd * 5.3, 2), 3) * sstep(-100, 200, u) * Math.exp(-(((Math.abs(v) - W) / 30) ** 2));
    const av = Math.abs(v), a = av / W;
    e += crest;
    if (a <= 1) {
      e += Rh * Math.pow(a, FACE.bowlPower);
      // The upper face is framed by steep rock walls: the outer ~20 % of the bowl rears up toward the crests.
      const wall = FACE.wallHeight(u, sd);
      if (wall > 0) { const s = sstep(0.78, 1.0, a); e += wall * s * s; }
    }
    else {
      // Past the crest: a steep rocky flank into the neighbouring couloir, then the next ridges.
      const d = av - W;
      e += Rh - d * 0.7 * (1 - 0.6 * sstep(0, 700, d)) + 70 * (vnoise(d / 140 + 3.7, u / 260 + sd * 9) - 0.5) * sstep(0, 200, d);
    }
    // Wild ranges around (bigger and darker north / left, lower south / right so the face keeps the sun);
    // the valley below bends north and is closed off by peaks, so every view ends in mountains.
    const side = av - W - 240, back = -u - 420, beyond = u - 2900 - Math.max(0, -v) * 0.6;
    const r = Math.hypot(x, z);
    const m = Math.max(side, back * 1.2, beyond * 0.7, (r - 4200) * 0.8);
    if (m > -200) {
      const k = sstep(-200, 1100, m);
      const amp = 1050 + 600 * sstep(350, -350, v);   // north (v < 0) bigger; blended so there is no seam
      // Further out the ranges grow (a wall of big peaks around the horizon hides the backdrop's sunk rim).
      const far = sstep(4500, 10500, r);
      e += k * (amp * (1 + 0.7 * far) * Math.pow(ridged(x / 2700 + 1.7, z / 2700 - 4.1, 5), 1.35) + 240 * (fbm(x / 900, z / 900, 3) - 0.5)) + far * 1100;
    }
    // The summit horn above the start (left / behind), and a distant spire in the view down the valley.
    // The Ravenspire itself: a sharp horn ~400 m above the heli shoulder, so the face reads as a real summit.
    e = horn(e, x, z, START_X - 285, 30, TOP + 430, 1.6, 0.35);
    e = horn(e, x, z, START_X - 420, 190, TOP + 330, 1.45, 1.0);    // its shoulder, so the silhouette is not a pyramid
    e = horn(e, x, z, START_X - 95, -185, TOP + 150, 1.25, 0.6);
    e = horn(e, x, z, START_X + 5600, -3600, 4250, 0.95, 1.1);
    e = horn(e, x, z, START_X + 2300, 2900, 3550, 0.9, 0.2);
    return e;
  }

  /** Terrain without building drifts (buildings are founded on this). */
  natural(x, z) {
    const u = x - START_X, v = z;
    let e = this.macro(x, z);
    if (Math.abs(x) > TILE.size * 0.5 + 60 || Math.abs(z) > TILE.size * 0.5 + 60) return e;
    const W = FACE.halfWidth(u) + (v > 0 ? FACE.rightExtra(u) : 0);
    const onFace = sstep(30, 110, u) * (1 - sstep(2300, 2700, u)) * (1 - sstep(0.95, 1.15, Math.abs(v) / W));
    // Powder lumps, sized for 25–30 m/s: long and low (radius of curvature ≳ 150 m, so they don't throw
    // riders off at speed), stretched across the fall line like wind drifts; a little fine detail.
    e += (fbm(u / 95 + 3.1, v / 60, 3) - 0.5) * 2.2 + (vnoise(x / 13, z / 13) - 0.5) * 0.3;
    // Drainages: fall-line ribs (rocky aretes) and the gullies between them. They vary ACROSS the face
    // and only drift slowly along it, so they shape lines without launching riders. Strongest up high,
    // calmer through the Stacks so the cliff bands stay clean.
    const ribs = onFace * (1 - sstep(1300, 1750, u));
    if (ribs > 0) {
      const calm = 1 - 0.6 * sstep(820, 950, u) * (1 - sstep(1370, 1450, u)) * (1 - sstep(170, 260, Math.abs(v + 30)));
      const big = rib1(v / 150 + 0.9 * noise1(u / 650, 31) + 2.1, 41) * (0.6 + 0.4 * noise1(u / 420, 32));
      const small = rib1(v / 44 + 0.7 * noise1(u / 260, 33) + 1.1, 42) * (0.5 + 0.5 * noise1(u / 200, 34));
      e += ribs * (calm * (big - 0.42) * 30 + (small - 0.45) * 6.5);
    }
    for (const B of BUTTRESSES) e += buttress(u, v, B);
    if (u > 110 && u < 1560) e += this.outcrops(u, v);
    // Big lateral undulations on the lower bowl (natural halfpipes and spines between drainages).
    const low = sstep(1450, 1700, u) * (1 - sstep(2350, 2600, u));
    if (low > 0) e += low * (fbm(u / 260 + 4, v / 110, 2) - 0.5) * 22;
    e += this.spines(u, v, W);
    e += this.bands(u, v);
    e += this.pillowsAt(u, v);
    e += this.hits(u, v);
    e = this.ravine(u, v, e);
    return e;
  }

  height(x, z) {
    let e = this.natural(x, z);
    const B = this.driftBox;
    if (this.structures && x > B[0] && x < B[1] && z > B[2] && z < B[3]) for (const s of this.structures) e += s.driftAt(x, z, e);
    return e;
  }

  /**
   * Rock islands: knobs of rock poking out of the face on a 60 m hashed grid (about one cell in six),
   * 3–7 m tall with steep sides (rock shows), kept off the signature lines (the Stacks corridor, the
   * ravine, the spine and pillow fields, cliff lips, buildings, drop zones).
   */
  outcrops(u, v) {
    const C = 60;
    const ci = Math.floor(u / C), cj = Math.floor(v / C);
    let add = 0;
    for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) {
      const i = ci + di + (u - ci * C > C / 2 ? 1 : 0), j = cj + dj + (v - cj * C > C / 2 ? 1 : 0);
      const hsh = hash1(i * 7919 + j * 104729 + 17);
      if (hsh < 0.83) continue;
      const ou = (i + 0.2 + 0.6 * hash1(i * 31 + j * 7 + 3)) * C, ov = (j + 0.2 + 0.6 * hash1(i * 13 + j * 29 + 5)) * C;
      if (!this.outcropOk(ou, ov)) continue;
      const R = 6 + 7 * hash1(i * 3 + j * 11 + 9), H = 3 + 4 * hash1(i * 17 + j * 5 + 1);
      // Snow ramps up the uphill side (a natural kicker), rock drops away on the downhill side.
      const du = (u - ou) / (u < ou ? R * 3.2 : R * 0.9), dv = (v - ov) / R;
      const q = du * du + dv * dv;
      if (q < 1) add += H * Math.pow(1 - q, 0.55);
    }
    return add;
  }

  outcropOk(u, v) {
    if (u < 140 || u > 1520) return false;
    if (u > 430 && u < 1420 && Math.abs(v + 40) < 170) return false;           // the Stacks corridor
    if (u > RAVINE.u0 - 40 && Math.abs(v - this.rvAt(this.rv.c, Math.min(u, RAVINE.u1))) < 90) return false;
    const W = FACE.halfWidth(u);
    if (u > SPINES.u0 - 20 && u < SPINES.u1 + 20 && v > SPINES.v0 * W - 20 && v < SPINES.v1 * W + 20) return false;
    if (Math.abs(v) > W * 0.86) return false;                                    // the framing walls are rock already
    for (const B of BANDS) if (Math.abs(u - B.uc) < 45 && v > B.v0 - 30 && v < B.v1 + 30) return false;
    for (const b of BUILDINGS) if (Math.hypot(u - b.u, v - b.v) < 80) return false;
    for (const [, zu, zv] of DROP_ZONES) if (typeof zv === 'number' && Math.hypot(u - zu, v - zv) < 60) return false;
    return true;
  }

  spines(u, v, W) {
    const S = SPINES;
    if (u < S.u0 || u > S.u1) return 0;
    const v0 = S.v0 * W, v1 = S.v1 * W;
    if (v < v0 - 20 || v > v1 + 20) return 0;
    const env = sstep(S.u0, S.u0 + 90, u) * (1 - sstep(S.u1 - 140, S.u1, u)) * sstep(v0 - 20, v0 + 30, v) * (1 - sstep(v1 - 30, v1 + 20, v));
    if (env <= 0) return 0;
    const s = (v + S.wander * (noise1(u / 85, 21) * 2 - 1) + 6 * (noise1(u / 31, 22) * 2 - 1)) / S.spacing;
    const i = Math.floor(s), f = s - i;
    const d = Math.abs(f - 0.5) * 2;                      // 0 on the crest, 1 in the sluff channel
    const A = S.height * env * (0.6 + 0.7 * hash1(i * 13 + 5)) * (0.75 + 0.5 * noise1(u / 120, i + 40));
    return A * (Math.pow(1 - d, 1.7) - 0.37);
  }

  bands(u, v) {
    let add = 0;
    for (const B of BANDS) {
      if (v < B.v0 - 50 || v > B.v1 + 50) continue;
      const uc = B.uc + B.wob * (noise1(v / 45, B.seed + 50) * 2 - 1) + 2.2 * (noise1(v / 11, B.seed + 70) * 2 - 1);
      if (u < uc - Math.max(B.bench, (B.h + B.var + (B.peak ? B.peak[1] : 0)) * BENCH_PER_M) - 2 || u > uc + 40) continue;
      let h = B.h + B.var * (noise1(v / 58, B.seed) * 2 - 1);
      if (B.peak) h += B.peak[1] * Math.exp(-(((v - B.peak[0]) / B.peak[2]) ** 2));
      const fo = B.fadeOut ?? 40;   // a short fade where a band meets the ravine rim
      let taper = sstep(B.v0 - 40, B.v0 + 25, v) * (1 - sstep(B.v1 - 25, B.v1 + fo, v));
      for (const [gv, gw] of B.gaps) taper *= sstep(gw * 0.35, gw, Math.abs(v - gv));
      h *= taper;
      if (h < 0.05) continue;
      add += cliff(u, uc, h, Math.max(B.bench, h * BENCH_PER_M));   // taller cliffs get a longer, gentler bench
      // Rock teeth just over the lip: dark knobs that mark the edge when you look down from above.
      if (h > 5 && u > uc - 2.5 && u < uc + 1) {
        const cell = Math.floor(v / 9), f = v / 9 - cell;
        const hk = hash1(cell * 7 + B.seed * 131);
        if (hk > 0.55) add += (0.8 + 1.8 * hk) * Math.sin(Math.PI * f) ** 2 * Math.exp(-(((u - uc + 0.7) / 0.9) ** 2));
      }
    }
    return add;
  }

  pillowsAt(u, v) {
    let add = 0;
    // Terraced pillow stacks: each `step` the slope pauses (flat-ish top) and then drops ~5 m.
    for (const F of PILLOWS) {
      if (!F.terrace || u < F.u0 - 10 || u > F.u1 + 10 || v < F.v0 - 10 || v > F.v1 + 10) continue;
      const env = sstep(F.u0 - 10, F.u0 + 20, u) * (1 - sstep(F.u1 - 20, F.u1 + 10, u)) * sstep(F.v0 - 10, F.v0 + 15, v) * (1 - sstep(F.v1 - 15, F.v1 + 10, v));
      if (env <= 0) continue;
      const G = (this.profileAt(u - 6) - this.profileAt(u + 6)) / 12;
      const S = F.step, f = (u + S * 1.3 * noise1(v / 16, F.seed) + S * 0.5 * noise1(v / 5.5, F.seed + 3)) / S;
      const fr = f - Math.floor(f);
      // Rounded pillow: the top rises gently, rolls over and drops over the last ~40 % of the step.
      const s = fr < 0.6 ? fr / 0.6 - 0.12 * Math.sin(Math.PI * fr / 0.6) : 1 - smooth((fr - 0.6) / 0.4);
      // Lobes across the field: each step breaks into separate rounded pillows with soft gaps between.
      const lobe = F.lobe ? 0.35 + 0.65 * Math.pow(Math.cos(Math.PI * (v + 3 * noise1(u / 7, F.seed + 5)) / F.lobe), 2) : 1;
      add += env * G * S * F.terrace * lobe * (s - 0.5);
    }
    const a = this.pillowHash.get(Math.floor(u / 16) * 4096 + Math.floor(v / 16));
    if (!a) return add;
    let best = 0;
    for (const p of a) {
      const du = (u - p.u) / p.R, dv = (v - p.v) / p.Rv;
      const q = du * du + dv * dv;
      if (q >= 1) continue;
      // Mushroom: rounded top, steep sides (the downhill flank on a steep face becomes a small drop).
      const h = p.H * Math.pow(1 - q * q, 1.25);
      if (h > best) best = h;
    }
    return add + best;
  }

  hits(u, v) {
    let add = 0;
    for (const [hu, hv, L, H, kind] of HITS) {
      const du = u - hu, dv = Math.abs(v - hv);
      if (du < -45 || du > 25 || dv > L + 25) continue;
      const lat = 1 - sstep(L - 14, L + 10, dv);
      if (lat <= 0) continue;
      if (kind === 'roller') add += H * Math.exp(-((du / 8) ** 2)) * lat;
      else add += H * (du < 0 ? Math.exp(-((du / 15) ** 2)) : Math.exp(-((du / 2.6) ** 2))) * lat;
    }
    return add;
  }

  ravine(u, v, e) {
    const R = RAVINE;
    if (u < R.u0 - 10 || u > R.u1 + 10) return e;
    const D = this.rvAt(this.rv.d, u);
    if (D < 0.05) return e;
    const vc = this.rvAt(this.rv.c, u), wf = this.rvAt(this.rv.f, u), ww = this.rvAt(this.rv.w, u) * (0.45 + 0.55 * sstep(R.u0, 820, u));
    const dv = Math.abs(v - vc);
    if (dv > wf + ww + 2) return e;
    let carve;
    if (dv <= wf) carve = D - Math.min(3, D * 0.08) * (dv / wf) ** 2;   // gentle half-pipe floor
    else {
      const t = (dv - wf) / ww;
      // Quarter-pipe transition at the foot, steep rock in the middle, a rounded rim.
      const w = t < 0.3 ? 0.18 * (t / 0.3) ** 2 : t < 0.8 ? 0.18 + 0.72 * ((t - 0.3) / 0.5) : 0.9 + 0.1 * (1 - (1 - (t - 0.8) / 0.2) ** 2);
      carve = (D - Math.min(3, D * 0.08)) * (1 - Math.min(1, w));
    }
    const floorMask = 1 - sstep(wf - 2, wf + ww * 0.25, dv);
    return e - carve + this.rvAt(this.rv.l, u) * floorMask;
  }

  // ---------------------------------------------------------------- features hook (terrain.features)
  /** Rideable extra surfaces (snowy roofs) at x/z, or null. */
  heightAt(x, z) {
    let best = null;
    for (const s of this.structures) {
      const y = s.surface(x, z);
      if (y !== null && (best === null || y > best)) best = y;
    }
    return best;
  }

  /** Solid walls: { nx, nz, depth, kind } for a rider moving (px, py, pz) → (x, y, z), or null. */
  blockAt(x, y, z, px, py, pz) {
    for (const s of this.structures) {
      const b = s.block(x, y, z, px, py, pz);
      if (b) return b;
    }
    return null;
  }

  // ---------------------------------------------------------------- named features (scoring, HUD)
  /** Name of the feature a rider launched off at world (x, z), or null (player.js names drops with it). */
  featureAt(x, z) {
    const u = x - START_X, v = z;
    for (const s of this.structures) if (s.surface(x, z) !== null) return s.name;
    for (const B of BANDS) {
      if (v < B.v0 - 20 || v > B.v1 + 20) continue;
      const uc = B.uc + B.wob * (noise1(v / 45, B.seed + 50) * 2 - 1);
      if (u > uc - 30 && u < uc + 6) return B.name;
    }
    if (u > RAVINE.u0 && u < RAVINE.u1 && this.rvAt(this.rv.d, u) > 8) {
      const dv = Math.abs(v - this.rvAt(this.rv.c, u));
      if (dv < this.rvAt(this.rv.f, u) + this.rvAt(this.rv.w, u)) {
        for (const [ul, , name] of RAVINE.ledges) if (name && u > ul - 30 && u < ul + 4) return name;
        return u < 760 ? 'The Couloir' : 'The Ravine';
      }
    }
    const W = FACE.halfWidth(u);
    if (u > SPINES.u0 && u < SPINES.u1 && v > SPINES.v0 * W - 10 && v < SPINES.v1 * W + 10) return 'Spine Wall';
    for (const F of PILLOWS) if (F.terrace && u > F.u0 && u < F.u1 && v > F.v0 && v < F.v1) return 'Pillow Stacks';
    for (const [hu, hv, L, , kind] of HITS) if (Math.abs(u - hu) < 20 && Math.abs(v - hv) < L) return kind === 'lip' ? 'Wind Lip' : 'Roller';
    for (const B of BUTTRESSES) if (u > B.u0 && u < B.u1 && Math.abs(v - (B.v0 + (B.v1 - B.v0) * (u - B.u0) / (B.u1 - B.u0))) < B.w * 0.5) return B.name;
    if (u < 70) return 'The Rollover';
    return null;
  }

  /** Name of the building whose roof is at world (x, z), or null. */
  roofAt(x, z) {
    for (const s of this.structures) if (s.surface(x, z) !== null) return s.name;
    return null;
  }

  // ---------------------------------------------------------------- scatter hooks (trees)
  forestAt(x, z) {
    const u = x - START_X;
    if (u < 1500) return 0;
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 14) return 0;
    const n = fbm(x / 160, z / 160, 3);
    const lower = sstep(1650, 2150, u);
    // Larches love the ravine banks and the lower drainages.
    const vc = u < RAVINE.u1 ? this.rvAt(this.rv.c, u) : 1e9;
    const bank = Math.exp(-(((Math.abs(z - vc) - 45) / 40) ** 2)) * sstep(1550, 1800, u);
    return Math.min(1, lower * sstep(0.42, 0.62, n) + bank * 0.8);
  }

  pisteAt(x, z) {
    // Clearings around the old buildings, and the gondola corridor (cut decades ago) stay free of trees.
    // The canonical lines run through ~22 m glades in the larches (you can ride the lower bowl at speed).
    const u = x - START_X;
    if (u > 1500 && this.lineDist(u, z) < 10 + 5 * (noise1(u / 41 + z / 57, 77) * 2 - 1)) return 1;   // 5–15 m half-width, wandering
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 12) return 1;
    const G = GONDOLA;
    const ax = START_X + G.from[0], az = G.from[1], bx = START_X + G.to[0], bz = G.to[1];
    const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    const d = Math.hypot(x - ax - (bx - ax) * t, z - az - (bz - az) * t);
    return d < 9 ? 1 : 0;
  }

  // ---------------------------------------------------------------- lobby / spawn
  /** Where the lobby plinth stands: on the summit shoulder, looking down the face. */
  /** Rock clusters (scatter.js) stay off the canonical lines, the drop zones and the ravine floor. */
  rockOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 24) return false;
    for (const [, zu, zv] of DROP_ZONES) {
      const v = zv === 'ravine' ? this.rvAt(this.rv.c, zu) : zv;
      if (Math.hypot(u - zu, z - v) < 45) return false;
    }
    if (u > RAVINE.u0 - 60 && u < RAVINE.u1) {
      const uu = Math.max(RAVINE.u0, u);
      if (Math.abs(z - this.rvAt(this.rv.c, uu)) < this.rvAt(this.rv.f, uu) + 12) return false;
    }
    return true;
  }

  /** Distance (m, in u / v) to the nearest canonical line (layout.js RIDE_LINES); ≥ 32 reads as "far". */
  lineDist(u, v) {
    if (!this._lineHash) {
      const H = new Map();
      const add = (a, b) => { const k = Math.floor(a / 32) * 4096 + Math.floor(b / 32); let l = H.get(k); if (!l) H.set(k, (l = [])); l.push(a, b); };
      for (const L of Object.values(RIDE_LINES)) {
        const pts = [];
        for (const p of L.pts) {
          if (p === 'ravine') for (let k = 420; k <= 2180; k += 20) pts.push([k, this.rvAt(this.rv.c, k)]);
          else pts.push(p);
        }
        for (let i = 0; i < pts.length - 1; i++) {
          const [a0, b0] = pts[i], [a1, b1] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, b1 - b0) / 4));
          for (let k = 0; k < n; k++) add(a0 + (a1 - a0) * k / n, b0 + (b1 - b0) * k / n);
        }
      }
      this._lineHash = H;
    }
    const cu = Math.floor(u / 32), cv = Math.floor(v / 32);
    let best = 1e9;
    for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
      const l = this._lineHash.get((cu + du) * 4096 + cv + dv);
      if (l) for (let i = 0; i < l.length; i += 2) best = Math.min(best, Math.hypot(u - l[i], v - l[i + 1]));
    }
    return best;
  }

  lobbySpot() { return { x: START_X + 22, z: -18, heading: -Math.PI / 2 - 0.18 }; }

  /**
   * Golden snowflakes (activities.js), placed by hand across every line instead of along one path: just
   * off the big lips (you pick them up as you send it), on the roofs, in the gorge, on a spine crest.
   * Returns [{ x, y, z }] in world space.
   */
  flakeSpots() {
    const H = (u, v) => this.height(START_X + u, v);
    // The lip near u0 at v: where the snow falls away hardest; the flake hangs just out over the edge,
    // on the path of a rider who pops off the lip.
    const lip = (u0, v, span = 25) => {
      let best = u0, drop = -1e9;
      for (let u = u0 - span; u < u0 + span; u += 0.5) {
        const d = H(u, v) - H(u + 1.5, v);
        if (d > drop) { drop = d; best = u; }
      }
      // Walk back up the face to its top (the last point that is still bench, under ~40°).
      let top = best;
      while (top > best - 12 && H(top - 0.5, v) - H(top, v) > 0.42) top -= 0.5;
      return { x: START_X + top + 3, y: H(top, v) + 0.4, z: v };
    };
    const on = (u, v, up = 1.2) => ({ x: START_X + u, y: H(u, v) + up, z: v });
    const roof = (id) => {
      const s = this.structures.find((k) => k.id === id);
      const [x, z] = s.world(s.hl * 0.2, 0);
      return { x, y: s.surface(x, z) + 1.2, z };
    };
    const rv = (u) => this.rvAt(this.rv.c, u);
    // Crest of the spine nearest v at u (the highest point across ±15 m).
    const crest = (u, v) => {
      let bv = v;
      for (let k = v - 15; k <= v + 15; k += 0.5) if (H(u, k) > H(u, bv)) bv = k;
      return on(u, bv, 1.0);
    };
    return [
      lip(548, -40),               // Band A, on the Stacks line
      crest(330, -330),            // a spine crest on the Spine Wall
      lip(905, 700, 30),           // the Hammer
      lip(990, 40),                // the First Stack
      on(1000, rv(1000)),          // deep in the Ravine
      lip(1160, -40),              // the Throne's peak
      lip(1330, rv(1330), 12),     // Frozen Falls
      lip(1418, 280),              // Station Cliff
      roof('station'),             // on the Old Lift Station's roof
      on(1655, -360),              // the pillow stacks
      lip(1835, -40, 10),          // a wind lip in the lower bowl
      roof('refuge'),              // on the Corvo Refuge's roof
    ];
  }

  // ---------------------------------------------------------------- terrain arrays
  async generate(onProgress = () => {}) {
    const N = TILE.res, size = TILE.size, sp = size / (N - 1), half = size / 2;
    const heights = new Float32Array(N * N);
    for (let j = 0; j < N; j++) {
      const z = -half + j * sp;
      for (let i = 0; i < N; i++) heights[j * N + i] = this.height(-half + i * sp, z);
      if ((j & 31) === 0) { onProgress(0.75 * j / N); await new Promise((r) => setTimeout(r, 0)); }
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
      splat[k * 3 + 1] = Math.round(smooth((0.7 - up) / 0.16) * 255);   // rock on faces steeper than ~46°
      // Wind-packed snow on convex crests (ridges, spine crests, rollovers): faster, harder landings.
      if (i > 2 && j > 2 && i < N - 3 && j < N - 3) {
        const lap = (hAt(i - 3, j) + hAt(i + 3, j) + hAt(i, j - 3) + hAt(i, j + 3) - 4 * heights[k]) / (9 * sp * sp);
        splat[k * 3] = Math.round(smooth((-lap - 0.035) / 0.07) * 0.55 * 255);
      }
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
      meta: {
        size_m: size, res: N, spacing: sp, far_size_m: fs, far_res: FN, far_min_height: farMin,
        spawn: { position: [s.x, 0, s.z], heading: s.heading },
      },
      heights, normals, splat, far,
    };
  }

  /** The heli drop: on the summit shoulder, facing down the face. */
  spawnPoint() { return { x: START_X + 30, z: 0, heading: -Math.PI / 2 }; }   // right at the rollover: you see the face fall away
}

// ------------------------------------------------------------------ shapes
/**
 * A cliff band at `uc` (lip), height h, with a bench of length L above it: the approach flattens
 * toward a slightly kicked, rounded lip, then the face drops h (near vertical) onto the unchanged
 * steep landing below.
 */
function cliff(u, uc, h, L) {
  const wF = Math.max(1.4, h * 0.11);                 // face width: taller cliffs lean back a little
  if (u >= uc) return u > uc + wF ? 0 : h * (1 - smooth((u - uc) / wF));
  const t = (u - (uc - L)) / L;
  if (t <= 0) return 0;
  // The bench flattens steadily toward the lip (flattest at the lip: a clean take-off, never a kicker).
  // Lip slope reduction = 1.25·h/L; with L = 4·h that is ≈0.31 (41° → ~30°).
  const r = Math.pow(t, 1.25);
  const lip = Math.min(0.5, 0.15 + h * 0.02) * Math.exp(-(((u - uc + 2.0) / 1.6) ** 2));   // rounded snow lip, not a kicker
  return h * r + lip;
}

/** Bench raise for a ledge in a channel floor (same idea as cliff, shorter). */
function benchRaise(u, uc, h, L, wF) {
  if (u >= uc) return u > uc + wF ? 0 : h * (1 - smooth((u - uc) / wF));
  const t = (u - (uc - L)) / L;
  if (t <= 0) return 0;
  return h * (1.6 * t * t - 0.6 * t * t * t);
}

/** A pyramidal horn rising out of the terrain. */
function horn(e, x, z, hx, hz, peak, slope, twist) {
  const dx = x - hx, dz = z - hz;
  // Cheap bound first: r below is never under 0.684 × the distance (max(|a|,|b|) ≥ d/√2, lobes ≥ 0.86).
  if (peak - Math.hypot(dx, dz) * 0.684 * slope + 120 <= e) return e;
  const c = Math.cos(twist), s = Math.sin(twist);
  // A lobed footprint (aretes and faces, not a pyramid) and radial gullies / ribs down its faces.
  const ang = Math.atan2(dz, dx);
  const lobes = 1 + 0.09 * Math.sin(ang * 3 + twist * 5) + 0.05 * Math.sin(ang * 7 + twist * 3);
  const r = (Math.max(Math.abs(dx * c + dz * s), Math.abs(-dx * s + dz * c)) * 0.7 + Math.hypot(dx, dz) * 0.3) * lobes;
  if (peak - r * slope + 120 <= e) return e;
  const gullies = (ridged(ang * 5.5 + twist, r / 140, 2) - 0.45) * 55 * sstep(25, 160, r);
  const top = peak - r * slope + (ridged(dx / 260, dz / 260, 4) - 0.5) * 150 * sstep(30, 300, r) + gullies;
  if (top <= e) return e;
  return e + (top - e) * smooth((top - e) / 50);
}

/** A rock arete along the fall line: sharp jagged crest, steep flanks, fading in at the top and out below. */
function buttress(u, v, B) {
  if (u < B.u0 - 5 || u > B.u1 + 5) return 0;
  const t = (u - B.u0) / (B.u1 - B.u0);
  const vc = B.v0 + (B.v1 - B.v0) * t + 12 * (noise1(u / 70, B.seed + 90) * 2 - 1);
  const dv = Math.abs(v - vc);
  if (dv > B.w) return 0;
  const H = B.h * sstep(0, 0.15, t) * (1 - sstep(0.75, 1, t)) * (0.75 + 0.5 * Math.pow(ridged(u / 55, B.seed * 3.1, 2), 2));
  const k = 1 - dv / B.w;
  return H * k * k;
}

/** 1D ridged noise (two octaves): sharp crests, rounded troughs, in [0, 1]. */
function rib1(x, seed) {
  const a = 1 - Math.abs(noise1(x, seed) * 2 - 1), b = 1 - Math.abs(noise1(x * 2.1 + 5.3, seed + 1) * 2 - 1);
  return (a * a * 0.7 + b * b * 0.3);
}
