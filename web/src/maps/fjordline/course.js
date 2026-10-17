// Fjordline — a Norwegian ski-to-sea mountain (map 7). One deterministic height function:
//   macro: a cirque under the summit (Skarvtinden) between a long shoulder (left) and a headland ridge
//   (right) that runs out into the fjord; the base land is cut by the coast, the fjord lies 60 m deep in front,
//   and the Lyngen-style range rises straight out of the water on the far shore;
//   detail: powder lumps, fall-line drainages, the Skaret couloir in its rock band (a choke, a chokestone),
//   the Sølvryggene spines, cliff bands with benches, wind lips, the big rollers (Bølgene), the shoulder's
//   rollers, the headland's stairs, and drifts piled against the village houses, whose roofs are rideable
//   (structures.js); the quay and the pier are rideable decks over the water.
// Course-compatible (course.js / ravenspire API): path, length, dropsAt, finishAt, progress(), height(),
// generate(), menuFocus(), lifts, forestAt/pisteAt/treeline, park:false, heightAt/blockAt, buildProps(),
// physics / camera / atmosphere, trails (trailSpawn / trailFinish), onPlayer (water, run completion).
import * as THREE from 'three';
import { vnoise, noise1, fbm, ridged, smooth, sstep, hash1 } from './noise.js';
import {
  TILE, START_X, SEA, BEACH, SHORE_U, FINISH_U, PROFILE, BEHIND, SHOULDER, CIRQUE, COULOIR, BANDS, SPINES, HITS,
  SHOULDER_ROLLERS, HEADLAND, BUTTRESSES, FJORD, BUILDINGS, QUAY, HARBOUR, DROP_ZONES, TRAILS, LINE_GOALS, RIDE_LINES, LIGHTHOUSE,
  HJELL, coastU, finishCoastU,
} from './layout.js';
import { Structure, Deck } from './structures.js';
import { FJORDLINE_PHYSICS, FJORDLINE_CAMERA, FJORDLINE_ATMOSPHERE } from './tuning.js';
import { game, on, emit } from '../../state.js';

const U_MIN = -7000, U_MAX = 12000;      // profile table range (1 m)
const DEG = Math.PI / 180;
const FALL = [1, 0];                     // the mountain falls toward +x
const BENCH_PER_M = 4;                   // bench length per metre of cliff height (Ravenspire's rule)
const VC = (CIRQUE.left + CIRQUE.right) / 2, VW = (CIRQUE.right - CIRQUE.left) / 2;

export class FjordlineCourse {
  constructor() {
    this.name = 'Fjordline';
    this.id = 'fjordline';
    this.meta = { id: 'fjordline' };    // activities / leaderboard key
    this.park = false;                  // no generic kickers / banners / crowds (features.js)
    this.life = { skiers: 0, lodge: false };
    // Few, small boulders; a sparse birch line (scatter.js overrides).
    this.spawn = { rockClusterChance: 0.03, rockScale: [0.7, 2.0], rockMinSlope: 20, treeStep: 13, treeMax: 4000 };
    this.challenge = { medalSpeeds: { gold: 23, silver: 19, bronze: 15 } };
    this.physics = FJORDLINE_PHYSICS;
    this.camera = FJORDLINE_CAMERA;
    this.atmosphere = FJORDLINE_ATMOSPHERE;
    this.sea = SEA;
    this.water = SEA - 1.5;             // the snow shader's flat-water tint stays under the water plane
    this.edgeHint = 'Edge of the peninsula — head back toward the fjord';
    this.lifts = [];
    this.trails = TRAILS;
    this.buildTables();
    this.buildStructures();
    this.buildPath();
    this.treeline = SEA + 330;
    this.lineGoals = LINE_GOALS.map(([name, bonus, ...features]) => ({ name, bonus, features }));
    this.dropZones = DROP_ZONES.map(([name, u, v, trail]) => {
      const p = this.spot(u, v);
      return { name, x: p.x, z: p.z, heading: -Math.PI / 2, trail: trail ?? null };
    });
    this.challenge.flakes = this.placeFlakes();
    this.challenge.gates = this.placeGates();
    this.obstacles = this.obstacles.concat(this.propObstacles());
  }

  /** World spot for a layout (u, v) where v may be 'headland' / 'shoulder' (their crest at u). */
  spot(u, v) {
    const z = v === 'headland' ? HEADLAND.crest(u) : v === 'shoulder' ? SHOULDER.crest(u) : v;
    return { x: START_X + u, z };
  }

  // ---------------------------------------------------------------- tables
  buildTables() {
    const integrate = (profile, back) => {
      const n = U_MAX - U_MIN + 1;
      const segs = [];
      let acc = 0;
      for (const [len, deg] of profile) { segs.push([acc, acc + len, Math.tan(deg * DEG)]); acc += len; }
      const bk = [];
      acc = 0;
      for (const [len, deg] of back) { bk.push([acc, acc + len, Math.tan(deg * DEG)]); acc += len; }
      const gAt = (u) => {
        if (u >= 0) { for (const s of segs) if (u < s[1]) return s[2]; return segs[segs.length - 1][2]; }
        for (const s of bk) if (-u < s[1]) return s[2];
        return bk[bk.length - 1][2];
      };
      const e = new Float64Array(n), i0 = -U_MIN;
      const grad = (u) => { let g = 0, w = 0; for (let k = -15; k <= 15; k += 3) { g += gAt(u + k); w++; } return g / w; };
      for (let i = i0 + 1; i < n; i++) e[i] = e[i - 1] - grad(U_MIN + i);
      for (let i = i0 - 1; i >= 0; i--) e[i] = e[i + 1] + grad(U_MIN + i);
      return e;
    };
    // Face: shifted so it lands on the beach (SEA + BEACH) where the profile goes flat.
    const face = integrate(PROFILE, BEHIND);
    const flatU = PROFILE.slice(0, -1).reduce((a, [l]) => a + l, 0) + 20;
    const off = SEA + BEACH - face[flatU - U_MIN];
    for (let i = 0; i < face.length; i++) face[i] += off;
    this.e0 = face;
    this.top = face[-U_MIN];
    const sh = integrate(SHOULDER.profile, SHOULDER.behind);
    const shFlat = SHOULDER.profile.slice(0, -1).reduce((a, [l]) => a + l, 0) + 20;
    const off2 = SEA + BEACH - sh[shFlat - U_MIN];
    for (let i = 0; i < sh.length; i++) sh[i] += off2;
    this.s0 = sh;
    this.shoulderTop = sh[-U_MIN];
    // Headland crest: the fall-line profile from u0, scaled so the point sits tipAbove over the sea, plus steps.
    const H = HEADLAND, hn = H.u1 - H.u0 + 81;
    const start = this.profileAt(H.u0) + this.bowl(H.u0, H.crest(H.u0)) + 6;
    const raw = new Float64Array(hn);
    const segs = [];
    let acc = 0;
    for (const [len, deg] of H.profile) { segs.push([acc, acc + len, Math.tan(deg * DEG)]); acc += len; }
    const gAt = (d) => { for (const s of segs) if (d < s[1]) return s[2]; return segs[segs.length - 1][2]; };
    for (let i = 1; i < hn; i++) {
      let g = 0, w = 0;
      for (let k = -15; k <= 15; k += 3) { g += gAt(Math.max(0, i - 40 + k)); w++; }
      raw[i] = raw[i - 1] + g / w;
    }
    const ti = H.tip - (H.u0 - 40);
    const scale = (start - (SEA + H.tipAbove)) / raw[ti];
    this.hc = new Float64Array(hn);
    for (let i = 0; i < hn; i++) {
      const u = H.u0 - 40 + i;
      let e = start - raw[i] * scale;
      for (const s of H.steps) e += cliff(u, s.uc, s.h, Math.max(40, s.h * BENCH_PER_M));
      // Past the point: the sea cliff.
      if (u > H.tip) e -= (u - H.tip) * 2.6;
      this.hc[i] = e;
    }
    this.headlandScale = scale;
  }

  profileAt(u) { return lerpTable(this.e0, u - U_MIN); }
  shoulderAt(u) { return lerpTable(this.s0, u - U_MIN); }
  crestAt(u) { return lerpTable(this.hc, u - (HEADLAND.u0 - 40)); }

  /** The cirque's cross-section (m above the centre-line profile) at (u, v). */
  bowl(u, v) {
    // The rims wander (no ruler-straight ridges) and carry rock towers near the top.
    const a = Math.abs(v - VC + 40 * (noise1(u / 230, v < VC ? 11 : 12) - 0.5)) / VW;
    const Rh = CIRQUE.ridgeHeight(u) * (0.88 + 0.24 * noise1(u / 260, v < VC ? 7 : 8));
    if (a <= 1) {
      let e = Rh * Math.pow(a, CIRQUE.power);
      const wall = CIRQUE.wallHeight(u);
      if (wall > 0) { const s = sstep(0.8, 1.0, a); e += wall * s * s; }
      return e;
    }
    // Past the ridge: on the left a steep rock wall down to the shoulder, on the right a rocky flank.
    const d = (a - 1) * VW;
    // Left: a steep rocky flank down to the shoulder (it has to lose the col's height to the shoulder's in ~300 m).
    const fall = v < VC ? d * (1.3 - 0.6 * sstep(300, 1200, u)) * (1 - 0.3 * sstep(200, 700, d)) : d * 0.75 * (1 - 0.45 * sstep(0, 600, d));
    return Rh + CIRQUE.wallHeight(u) - fall;
  }

  // ---------------------------------------------------------------- buildings, decks
  buildStructures() {
    const ground = (x, z) => this.natural(x, z);
    this.structures = BUILDINGS.map((b) => {
      const g = b.stilts ? (x, z) => Math.max(ground(x, z), SEA + b.stilts) : ground;
      return new Structure(b, START_X + b.u, b.v, FALL, g);
    });
    this.driftBox = [Infinity, -Infinity, Infinity, -Infinity];
    for (const s of this.structures) {
      const r = s.hl + 26 + s.hw + 2;
      this.driftBox = [Math.min(this.driftBox[0], s.x - r), Math.max(this.driftBox[1], s.x + r), Math.min(this.driftBox[2], s.z - r), Math.max(this.driftBox[3], s.z + r)];
    }
    const Q = HARBOUR.quay, P = HARBOUR.pier;
    this.decks = [
      new Deck('Brygga', START_X + Q.u0, START_X + Q.u1, Q.v0, Q.v1, SEA + QUAY),
      new Deck('Kaia', START_X + P.u0, START_X + P.u1, P.v0, P.v1, SEA + QUAY),
    ];
    this.obstacles = [];
    // Stilts under the rorbuer and the pier's piles are under the decks / buildings: no rider reaches them.
  }

  /** Lighthouse, flag pole, drying racks, the cairn: collision circles [x, z, r, kind]. */
  propObstacles() {
    const out = [];
    const lu = LIGHTHOUSE.u, lv = HEADLAND.crest(lu);
    this.lighthouse = { x: START_X + lu, z: lv, y: this.height(START_X + lu, lv), h: LIGHTHOUSE.h };
    out.push([this.lighthouse.x, this.lighthouse.z, 2.6, 'tower']);
    for (const [u, v, len, yaw] of HJELL) {
      const ax = Math.sin(yaw), az = Math.cos(yaw);
      for (let s = -len / 2; s <= len / 2 + 0.01; s += 2.5) out.push([START_X + u + ax * s, v + az * s, 0.5, 'rock']);
    }
    this.flag = { x: START_X + SHORE_U - 18, z: 22 };
    out.push([this.flag.x, this.flag.z, 0.3, 'tower']);
    this.cairn = { x: START_X + 8, z: 58 };
    out.push([this.cairn.x, this.cairn.z, 1.0, 'rock']);
    return out;
  }

  // ---------------------------------------------------------------- path (the hero line), finish
  buildPath() {
    // The hero line (challenge gates, perf spots): out of Skaret, down the open face through the bands' gaps,
    // over the rollers and through the village to the quay.
    const knots = [[0, 175], [150, 190], [330, 178], [520, 150], [600, 95], [800, 40], [1000, -40], [1075, -245], [1200, -160],
      [1450, -100], [1800, -80], [2050, -60], [2300, -40], [FINISH_U + 50, -60]];
    const pts = [];
    for (let u = 0; u <= FINISH_U + 50; u += 8) {
      let k = 0;
      while (k < knots.length - 2 && knots[k + 1][0] < u) k++;
      const [ua, va] = knots[k], [ub, vb] = knots[k + 1];
      const t = smooth((u - ua) / (ub - ua));
      pts.push(new THREE.Vector2(START_X + u, va + (vb - va) * t));
    }
    this.path = pts;
    this.length = 0;
    for (let i = 1; i < pts.length; i++) this.length += pts[i].distanceTo(pts[i - 1]);
    this.finishAt = FINISH_U;
    this.dropsAt = BANDS.filter((b) => b.v0 < 0 && b.v1 > 0).map((b) => b.uc);
  }

  /** Metres down the mountain, normalised so that every coast (bay, Sandvika, the point) finishes at FINISH_U. */
  progress(x, z) { return x - START_X - (finishCoastU(z ?? 0) - SHORE_U); }
  tAt(z) { void z; return 0; }
  menuFocus() { return new THREE.Vector3(START_X + 1300, this.profileAt(1300) + 700, 0); }

  // ---------------------------------------------------------------- the height function
  /** Macro shape (everywhere, also the mid ring and the 30 km backdrop). */
  macro(x, z) {
    const u = x - START_X, v = z;
    // The face: profile + cirque cross-section; the shoulder: its own profile, a crowned ridge.
    let e = this.profileAt(u) + this.bowl(u, v);
    const sd = (v - SHOULDER.crest(u)) / SHOULDER.width;
    const sh = this.shoulderAt(u) - SHOULDER.crown * (Math.abs(sd) < 1 ? sd * sd : 2 * Math.abs(sd) - 1) - (sd > 1.2 ? (sd - 1.2) * 120 : 0);
    e = smax(e, sh, 22);
    // Wild ranges around on this side (behind and to the sides; land only, the coast cuts them).
    const side = Math.max(v - 1150, -v - 1550), back = -u - 350;
    const m = Math.max(side, back * 1.2);
    if (m > -200) {
      const k = sstep(-200, 1200, m);
      const r = Math.hypot(x, z), far = sstep(5000, 11000, r);
      e += k * ((900 + 500 * far) * Math.pow(ridged(x / 2500 + 1.3, z / 2500 - 2.7, 5), 1.3) + 200 * (fbm(x / 800, z / 800, 3) - 0.5)) + far * 700;
    }
    // Skarvtinden: the summit pyramid behind the col (Slogen-style), its shoulder, a sharp tooth on the right.
    e = horn(e, x, z, START_X - 260, 60, this.top + 470, 1.6, 0.4);
    e = horn(e, x, z, START_X - 330, -420, this.top + 260, 1.4, 1.1);   // its north shoulder, over the spines
    e = horn(e, x, z, START_X - 40, 600, this.top + 170, 1.45, 0.7);    // Kvaltinden, the headland's root
    e = horn(e, x, z, START_X + 240, -770, this.top - 40, 1.7, 0.2);    // a tooth on the left rim
    // Land never dips under the sea inland (no lagoons); the coast cuts it, the fjord floor shelves away.
    e = Math.max(e, SEA + BEACH + 0.3 * (vnoise(x / 40, z / 40) - 0.5));
    e = this.coastCut(u, v, e, coastU(v) + (Math.abs(v) > 1300 ? 380 * (fbm(v / 1900, 3.3, 2) - 0.5) : 0));
    // The headland (Kvalneset): a ridge on top of all that, diving into the sea at its flanks and tip.
    const hd = this.headland(u, v);
    if (hd > -1e8) e = smax(e, hd, 7);
    // The far shore: the range across the fjord rises straight out of the water.
    const far = u - FJORD.farShore - 500 * (fbm(v / 2600, 9.1, 2) - 0.5);
    if (far > -400) {
      const k = sstep(-400, 1400, far);
      const rise = SEA - FJORD.depth + k * (FJORD.depth + 120 + 1350 * Math.pow(ridged(x / 2100 - 3.1, z / 2100 + 1.7, 5), 1.25) + 380 * sstep(1500, 6000, far));
      e = Math.max(e, rise);
      e = horn(e, x, z, START_X + 8200, -2600, SEA + 1830, 1.0, 0.8);   // the big one across the water (Jiehkkevárri-like)
      e = horn(e, x, z, START_X + 7600, 2400, SEA + 1500, 1.15, 0.3);
    }
    return e;
  }

  /** Below the coast line the land drops into the fjord: a 1.2 m ice edge, then the shelving floor. */
  coastCut(u, v, e, c) {
    const d = u - c;
    if (d < -60) return e;
    const cut = Math.max(SEA + BEACH - d * 3, SEA - Math.min(FJORD.depth, 1.5 + Math.max(0, d) * FJORD.shelf));
    return smin(e, cut, 1.2);
  }

  /** The headland's surface at (u, v), or −1e9 outside its reach. */
  headland(u, v) {
    const H = HEADLAND;
    if (u < H.u0 - 30 || u > H.u1 + 30) return -1e9;
    const d = v - H.crest(u), ad = Math.abs(d);
    if (ad > 520) return -1e9;
    let e = this.crestAt(u);
    const flank = Math.tan((d < 0 ? H.bayFlank : H.seaFlank) * DEG);
    // Rounded crest, a shoulder, then the flank (rockier and steeper on the sea side).
    const t = ad - H.top;
    e -= t <= 0 ? 2.4 * (ad / H.top) ** 2 : 2.4 + t * flank * sstep(0, 16, t) + t * 0.08;
    // Gullies and rock ribs down the flanks (the bay side holds snow in the gullies, the sea side is rock).
    if (t > 6) e += sstep(6, 40, t) * (ridged(u / 38 + (d < 0 ? 0 : 7.7), t / 90, 3) - 0.45) * (d < 0 ? 9 : 14) * (1 - sstep(H.tip - 40, H.tip, u) * 0.5);
    // Fade in where it grows out of the cirque's right ridge.
    e -= 400 * (1 - sstep(H.u0 - 30, H.u0 + 60, u));
    return e;
  }

  /** Terrain without building drifts (buildings are founded on this). */
  natural(x, z) {
    const u = x - START_X, v = z;
    let e = this.macro(x, z);
    if (Math.abs(x) > TILE.size * 0.5 + 60 || Math.abs(z) > TILE.size * 0.5 + 60) return e;
    if (e < SEA - 2) return e;   // under the fjord: no detail
    const land = sstep(SEA + 3, SEA + 12, e);
    // Powder lumps sized for 25–30 m/s (long and low), a little fine detail.
    e += land * ((fbm(u / 95 + 3.1, v / 60, 3) - 0.5) * 2.2 + (vnoise(x / 13, z / 13) - 0.5) * 0.3);
    // Drainages across the face, strongest on the upper / mid face, calm on the cruiser and in the village.
    const onFace = sstep(40, 140, u) * (1 - sstep(1300, 1700, u)) * (1 - sstep(-760, -680, -v)) * (1 - sstep(380, 470, v));
    if (onFace > 0) {
      const calm = 1 - 0.65 * sstep(560, 640, u) * (1 - sstep(1100, 1200, u)) * (1 - sstep(220, 300, Math.abs(v + 20)));
      const big = rib1(v / 150 + 0.9 * noise1(u / 650, 31) + 2.1, 41) * (0.6 + 0.4 * noise1(u / 420, 32));
      const small = rib1(v / 44 + 0.7 * noise1(u / 260, 33) + 1.1, 42) * (0.5 + 0.5 * noise1(u / 200, 34));
      e += onFace * (calm * (big - 0.42) * 44 + (small - 0.45) * 5.5);
    }
    // Lower mountain: broad lateral undulations (natural banks between the lines).
    const low = sstep(1350, 1600, u) * (1 - sstep(2050, 2250, u)) * land;
    if (low > 0) e += low * (fbm(u / 260 + 4, v / 120, 2) - 0.5) * 14;
    // Big buttresses and bowls across the whole mountain (seen from the fjord it must not read as a plane).
    const wide = sstep(60, 300, u) * (1 - sstep(1900, 2200, u)) * land;
    if (wide > 0) e += wide * (fbm(u / 700 + 1.3, v / 230 + 8.1, 3) - 0.5) * 80 * (1 - 0.8 * Math.exp(-((this.lineDistFast(u, v) / 50) ** 2)));
    if (u > 130 && u < 1750) e += this.outcrops(u, v);
    for (const B of BUTTRESSES) e += buttress(u, v, B);
    e += this.spines(u, v);
    e += this.bands(u, v);
    e += this.hits(u, v) * land;
    e += this.shoulderRollers(u, v);
    e = this.couloir(u, v, e);
    return e;
  }

  height(x, z) {
    let e = this.natural(x, z);
    const B = this.driftBox;
    if (this.structures && x > B[0] && x < B[1] && z > B[2] && z < B[3]) for (const s of this.structures) e += s.driftAt(x, z, e);
    return e;
  }

  /**
   * Rock islands: knobs of rock poking out of the face on a 55 m hashed grid (about one cell in five), 3–8 m tall
   * with steep sides, a snow ramp up their uphill side (natural kickers off the lines), kept 45 m off the canonical
   * lines and off the couloir, the spines, the cliff lips and the drop zones.
   */
  outcrops(u, v) {
    const C = 55;
    const ci = Math.floor(u / C), cj = Math.floor(v / C);
    let add = 0;
    for (let di = -1; di <= 0; di++) for (let dj = -1; dj <= 0; dj++) {
      const i = ci + di + (u - ci * C > C / 2 ? 1 : 0), j = cj + dj + (v - cj * C > C / 2 ? 1 : 0);
      if (hash1(i * 7919 + j * 104729 + 23) < 0.8) continue;
      const ou = (i + 0.2 + 0.6 * hash1(i * 31 + j * 7 + 3)) * C, ov = (j + 0.2 + 0.6 * hash1(i * 13 + j * 29 + 5)) * C;
      if (!this.outcropOk(ou, ov)) continue;
      const R = 7 + 9 * hash1(i * 3 + j * 11 + 9), H = 3 + 5 * hash1(i * 17 + j * 5 + 1);
      const du = (u - ou) / (u < ou ? R * 3 : R * 0.9), dv = (v - ov) / R;
      const q = du * du + dv * dv;
      if (q < 1) add += H * Math.pow(1 - q, 0.55);
    }
    return add;
  }

  outcropOk(u, v) {
    if (u < 140 || u > 1700) return false;
    if (this.lineDistFast(u, v) < 45) return false;
    if (u < COULOIR.u1 + 30 && Math.abs(v - COULOIR.centre(Math.max(u, COULOIR.u0))) < COULOIR.halfWidth(Math.max(u, COULOIR.u0)) + 20) return false;
    if (u > SPINES.u0 - 20 && u < SPINES.u1 + 20 && v > SPINES.v0 - 20 && v < SPINES.v1 + 20) return false;
    for (const B of BANDS) if (Math.abs(u - B.uc) < 45 && v > B.v0 - 30 && v < B.v1 + 30) return false;
    for (const [hu, hv, L] of HITS) if (Math.abs(u - hu) < 40 && Math.abs(v - hv) < L + 20) return false;
    if (Math.abs(v - HEADLAND.crest(u)) < 60 || Math.abs(v - SHOULDER.crest(u)) < 70) return false;
    for (const B of BUTTRESSES) if (u > B.u0 - 20 && u < B.u1 + 20 && Math.abs(v - (B.v0 + (B.v1 - B.v0) * (u - B.u0) / (B.u1 - B.u0))) < B.w + 15) return false;
    for (const [, zu, zv] of DROP_ZONES) if (typeof zv === 'number' && Math.hypot(u - zu, v - zv) < 60) return false;
    return true;
  }

  spines(u, v) {
    const S = SPINES;
    if (u < S.u0 || u > S.u1 || v < S.v0 - 20 || v > S.v1 + 20) return 0;
    const env = sstep(S.u0, S.u0 + 90, u) * (1 - sstep(S.u1 - 150, S.u1, u)) * sstep(S.v0 - 20, S.v0 + 30, v) * (1 - sstep(S.v1 - 30, S.v1 + 20, v));
    if (env <= 0) return 0;
    const s = (v + S.wander * (noise1(u / 85, 21) * 2 - 1) + 6 * (noise1(u / 31, 22) * 2 - 1)) / S.spacing;
    const i = Math.floor(s), f = s - i;
    const d = Math.abs(f - 0.5) * 2;
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
      let taper = sstep(B.v0 - 40, B.v0 + 25, v) * (1 - sstep(B.v1 - 25, B.v1 + 40, v));
      for (const [gv, gw] of B.gaps) taper *= sstep(gw * 0.35, gw, Math.abs(v - gv));
      h *= taper;
      if (h < 0.05) continue;
      add += cliff(u, uc, h, Math.max(B.bench, h * BENCH_PER_M));
    }
    return add;
  }

  hits(u, v) {
    let add = 0;
    for (const [hu, hv, L, H, kind] of HITS) {
      // Long rollers wander across the slope (a ruler-straight 600 m roller reads as a terrace from the fjord).
      const du = u - hu - (L > 100 ? 22 * (noise1(v / 110, hu) * 2 - 1) : 0), dv = Math.abs(v - hv);
      if (du < -60 || du > 30 || dv > L + 25) continue;
      const lat = 1 - sstep(L - 14, L + 10, dv);
      if (lat <= 0) continue;
      if (kind === 'roller') add += H * Math.exp(-((du / 13) ** 2)) * lat;
      else if (kind === 'kicker') add += H * (du < 0 ? Math.exp(-((du / 8.5) ** 2)) : Math.exp(-((du / 1.6) ** 2))) * lat;
      else add += H * (du < 0 ? Math.exp(-((du / 15) ** 2)) : Math.exp(-((du / 2.6) ** 2))) * lat;
    }
    return add;
  }

  shoulderRollers(u, v) {
    const R = SHOULDER_ROLLERS;
    if (u < R.us[0] - 40 || u > R.us[R.us.length - 1] + 40) return 0;
    const dv = Math.abs(v - SHOULDER.crest(u));
    if (dv > R.half + 10) return 0;
    const lat = 1 - sstep(R.half - 50, R.half + 10, dv);
    let add = 0;
    const wob = 14 * (noise1(v / 70, 5) * 2 - 1);
    for (const ur of R.us) { const t = (u - ur - wob) / R.width; if (Math.abs(t) < 3.5) add += R.h * Math.exp(-t * t); }
    return add * lat;
  }

  /** Skaret: a rock band split by the couloir; the floor keeps the face, the walls rise above it. */
  couloir(u, v, e) {
    const C = COULOIR;
    if (u < C.u0 - 5 || u > C.u1 + 5) return e;
    const H = C.wallH(u);
    const vc = C.centre(u), hw = C.halfWidth(u), dv = Math.abs(v - vc);
    if (dv > hw + C.mass + 5) return e;
    if (dv <= hw) {
      // Half-pipe floor (gentle), and the chokestone: a bench dropping off an icy step.
      const [cu, ch] = C.chokestone;
      return e - Math.min(1.6, H * 0.06) * (1 - (dv / hw) ** 2) + benchRaise(u, cu, ch, 18, 1.4) * (1 - sstep(hw - 3, hw, dv));
    }
    if (H <= 0.05) return e;
    const t = (dv - hw) / C.mass;
    // Steep walls at the foot (quarter-pipe transition), a rough top, falling back to the face on the outside.
    const w = t < 0.02 ? 0.12 * (t / 0.02) ** 2 : t < 0.16 ? 0.12 + 0.88 * smooth((t - 0.02) / 0.14) : 1 - sstep(0.55, 1, t);
    const rough = 1 + 0.18 * (ridged(u / 25, v / 25, 2) - 0.5);
    return e + H * w * rough;
  }

  // ---------------------------------------------------------------- features hook (terrain.features)
  /** Rideable extra surfaces (snowy roofs, the quay and the pier) at x/z, or null. */
  heightAt(x, z) {
    let best = null;
    for (const s of this.structures) {
      const y = s.surface(x, z);
      if (y !== null && (best === null || y > best)) best = y;
    }
    for (const d of this.decks) {
      const y = d.surface(x, z);
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
  featureAt(x, z) {
    const u = x - START_X, v = z;
    for (const s of this.structures) if (s.surface(x, z) !== null) return s.name;
    for (const d of this.decks) if (d.surface(x, z) !== null) return d.name === 'Kaia' ? 'Kaihoppet' : d.name;
    for (const B of BANDS) {
      if (v < B.v0 - 20 || v > B.v1 + 20) continue;
      const uc = B.uc + B.wob * (noise1(v / 45, B.seed + 50) * 2 - 1);
      if (u > uc - 30 && u < uc + 6) return B.name;
    }
    const H = HEADLAND;
    if (u > H.u0 && u < H.u1 && Math.abs(v - H.crest(u)) < H.top + 25) {
      for (const s of H.steps) if (u > s.uc - 30 && u < s.uc + 6) return s.name;
      return 'Kvalneset';
    }
    const C = COULOIR;
    if (u > C.u0 && u < C.u1 && Math.abs(v - C.centre(u)) < C.halfWidth(u) + 6) {
      if (Math.abs(u - C.chokestone[0]) < 20) return 'Chokestone';
      return 'Skaret';
    }
    if (u > SPINES.u0 && u < SPINES.u1 && v > SPINES.v0 - 10 && v < SPINES.v1 + 10) return 'Sølvryggene';
    for (const [hu, hv, L, , kind, name] of HITS) if (u > hu - (L > 100 ? 45 : 22) && u < hu + (L > 100 ? 28 : 6) && Math.abs(v - hv) < L) return name || (kind === 'lip' ? 'Wind Lip' : 'Roller');
    if (Math.abs(v - SHOULDER.crest(u)) < SHOULDER_ROLLERS.half && SHOULDER_ROLLERS.us.some((r) => Math.abs(u - r) < 18)) return 'Fjordryggen Roller';
    if (u < 70) return 'The Col';
    return null;
  }

  roofAt(x, z) {
    for (const s of this.structures) if (s.surface(x, z) !== null) return s.name;
    return null;
  }

  // ---------------------------------------------------------------- scatter hooks (trees, rocks, cornices)
  /** A sparse birch line low down (the scatter's trees), never on the beach, the decks or the village lanes. */
  forestAt(x, z) {
    const u = x - START_X;
    if (u < 1650) return 0;
    const h = this.macro(x, z);
    if (h < SEA + 14) return 0;
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 12) return 0;
    const n = fbm(x / 140, z / 140, 3);
    const band = sstep(1700, 1950, u) * (1 - sstep(2150, 2300, u));
    const village = 1 - sstep(-260, -200, -Math.abs(z + 20)) * sstep(2050, 2150, u);   // the village keeps open
    return Math.min(1, band * village * sstep(0.52, 0.72, n) * 0.85);
  }

  pisteAt(x, z) {
    const u = x - START_X;
    if (u > 1550 && this.lineDist(u, z) < 13 + 4 * (noise1(u / 41 + z / 57, 77) * 2 - 1)) return 1;
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 10) return 1;
    return 0;
  }

  corniceOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 45) return false;
    for (const d of this.dropZones) if (Math.hypot(x - d.x, z - d.z) < 180) return false;
    if (u > 400) return false;
    return u < -10 || z < CIRQUE.left + 60 || z > CIRQUE.right - 40;
  }

  rockOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 24) return false;
    for (const d of this.dropZones) if (Math.hypot(x - d.x, z - d.z) < 45) return false;
    if (u > COULOIR.u0 - 30 && u < COULOIR.u1 && Math.abs(z - COULOIR.centre(u)) < COULOIR.halfWidth(u) + 10) return false;
    if (u > 2100) return false;   // the village and the beach
    return true;
  }

  /** The canonical line points in (u, v) for a RIDE_LINES entry ('couloir' / 'headland' / 'shoulder' expanded). */
  linePoints(L) {
    const pts = [];
    for (const p of L.pts) {
      if (p === 'couloir') for (let u = 40; u <= 580; u += 15) pts.push([u, COULOIR.centre(u)]);
      else if (p === 'headland') for (let u = 680; u <= 2840; u += 20) pts.push([u, HEADLAND.crest(u)]);
      else if (p === 'shoulder') for (let u = 0; u <= 2400; u += 25) pts.push([u, SHOULDER.crest(u)]);
      else pts.push([p[0], p[1] === 'headland' ? HEADLAND.crest(p[0]) : p[1] === 'shoulder' ? SHOULDER.crest(p[0]) : p[1]]);
    }
    return pts;
  }

  /** lineDist() from a precomputed 8 m grid (bilinear; capped at 200 m): cheap enough for the height function. */
  lineDistFast(u, v) {
    const G = 8, U0 = -240, V0 = -1560, NU = 400, NV = 392;
    if (!this._ldGrid) {
      const g = new Float32Array(NU * NV);
      for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) g[j * NU + i] = Math.min(200, this.lineDist(U0 + i * G, V0 + j * G));
      this._ldGrid = g;
    }
    const fi = Math.min(Math.max((u - U0) / G, 0), NU - 1.001), fj = Math.min(Math.max((v - V0) / G, 0), NV - 1.001);
    const i = fi | 0, j = fj | 0, ti = fi - i, tj = fj - j, g = this._ldGrid, k = j * NU + i;
    return (g[k] * (1 - ti) + g[k + 1] * ti) * (1 - tj) + (g[k + NU] * (1 - ti) + g[k + NU + 1] * ti) * tj;
  }

  /** Distance (m) to the nearest canonical line, or to line `key` only. */
  lineDist(u, v, key = null) {
    if (!this._lineHash) {
      this._lineHash = new Map();
      for (const [k, L] of Object.entries(RIDE_LINES)) {
        const H = new Map();
        const add = (a, b) => { const kk = Math.floor(a / 32) * 4096 + Math.floor(b / 32); let l = H.get(kk); if (!l) H.set(kk, (l = [])); l.push(a, b); };
        const pts = this.linePoints(L);
        for (let i = 0; i < pts.length - 1; i++) {
          const [a0, b0] = pts[i], [a1, b1] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, b1 - b0) / 4));
          for (let s = 0; s < n; s++) add(a0 + (a1 - a0) * s / n, b0 + (b1 - b0) * s / n);
        }
        this._lineHash.set(k, H);
      }
    }
    const cu = Math.floor(u / 32), cv = Math.floor(v / 32);
    let best = 1e9;
    for (const [k, H] of this._lineHash) {
      if (key && k !== key) continue;
      for (let du = -1; du <= 1; du++) for (let dv = -1; dv <= 1; dv++) {
        const l = H.get((cu + du) * 4096 + cv + dv);
        if (l) for (let i = 0; i < l.length; i += 2) best = Math.min(best, Math.hypot(u - l[i], v - l[i + 1]));
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- trails (lobby contract)
  /** The trail's top: { x, z, heading } (heading 0 = facing −Z; downhill is −π/2). */
  trailSpawn(trailId) {
    const z = this.dropZones.find((d) => d.trail === trailId);
    return z ? { x: z.x, z: z.z, heading: z.heading } : null;
  }

  /**
   * The trail's finish ({ progress } form of the contract): every trail ends at the water's edge, so the finish is
   * "reached the coast" — progress() is normalised to the bay, Sandvika and the point, which keeps a rider who
   * strays to another beach from being stuck without a finish. `at` is where the trail's own finish is (the
   * harbour quay, Sandvika for the cruiser, the lighthouse for the headland), for HUD / map markers.
   */
  trailFinish(trailId) {
    if (!TRAILS.some((t) => t.id === trailId)) return null;
    const at = trailId === 'kvalneset' ? { x: START_X + LIGHTHOUSE.u + 20, z: HEADLAND.crest(LIGHTHOUSE.u + 20) }
      : trailId === 'fjordlopa' ? { x: START_X + 2470, z: -470 } : { x: START_X + FINISH_U + 10, z: -100 };
    return { progress: FINISH_U, at };
  }

  /** Which trail a rider at world (x, z) is on: the nearest canonical line (and its trail). */
  trailAt(x, z) {
    let best = null, bd = 1e9;
    for (const [k, L] of Object.entries(RIDE_LINES)) {
      const d = this.lineDist(x - START_X, z, k);
      if (d < bd) { bd = d; best = L.trail; }
    }
    return best;
  }

  // ---------------------------------------------------------------- the rider: water, finish run-out, run completion
  /**
   * Per-rider hooks (player.js calls course.onPlayer(player)): the fjord is water you can't ride into (a splash,
   * a fade, back on the shore), the quay slows you after the finish, and a finished run emits `runCompleted`
   * { mapId, trailId, distance, time, score } on the state bus (rewards, leaderboards).
   */
  onPlayer(p) {
    const run = { t: 0, trail: null, votes: new Map(), finished: false, vote: 0 };
    const reset = () => { run.t = 0; run.votes.clear(); run.finished = false; run.trail = null; run.vote = 0; p._fjordSplash = 0; };
    let lastEmit = -1e9;   // the ride tracker (profile/tracker.js) also announces finished runs: never twice
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const done = (res) => {
      if (run.finished) return;
      run.finished = true;
      if (now() - lastEmit < 2000) return;
      let trail = run.trail, n = 0;
      for (const [k, c] of run.votes) if (c > n) { n = c; trail = k; }
      const ev = { mapId: this.id, trailId: trail ?? this.trailAt(p.position.x, p.position.z), distance: Math.round(game.distance), time: +(res?.raw ?? res?.time ?? run.t).toFixed(2), score: Math.round(res?.score ?? game.score) };
      this.lastRun = ev;
      emit('runCompleted', ev);
    };
    const offs = [
      on('rideStarted', reset), on('resetTop', reset),
      on('dropZone', (z) => { reset(); run.trail = z?.trail ?? null; }),
      on('runCompleted', (e) => { if (e?.mapId === this.id && e !== this.lastRun) lastEmit = now(); }),
      on('runComplete', () => done(null)),
      on('runFinished', (res) => done(res)),
    ];
    const step = p.step.bind(p);
    p.step = (dt) => {
      if (p._fjordSplash > 0) { this.sink(p, dt); return; }
      step(dt);
      if (p.state === 0 /* FROZEN */) return;
      run.t += dt;
      // Which line are we on (for runCompleted): a vote every half second.
      run.vote -= dt;
      if (run.vote <= 0) { run.vote = 0.5; const k = this.trailAt(p.position.x, p.position.z); run.votes.set(k, (run.votes.get(k) || 0) + 1); }
      const P = p.position;
      const g = p.terrain.getHeight(P.x, P.z);
      if (g < SEA - 0.25 && P.y < SEA + 0.15) { this.splash(p, run); return; }
      // The quay is a run-out: past the finish, on the flats, the rider is slowed down like a finish corral.
      if (p.state === 1 /* GROUNDED */ && this.progress(P.x, P.z) > FINISH_U + 4 && g < SEA + 3 && p.speed > 6) {
        const k = Math.max(0, 1 - 0.9 * dt);
        p.velocity.x *= k; p.velocity.z *= k;
      }
    };
    p.fjord = { run, dispose: () => { for (const o of offs) o(); } };
  }

  /** Into the fjord: a splash, then (unless the run just finished) back on the shore. */
  splash(p, run) {
    p._fjordSplash = 1;
    const P = p.position;
    emit('fjordSplash', { x: P.x, y: SEA, z: P.z, speed: p.speed });
    emit('hint', 'SPLASH! The fjord is cold — back on the shore');
    p.velocity.multiplyScalar(0.2);
    const respawn = () => {
      if (run.finished) return;   // the finish already sends the rider back to the top
      const spot = this.shoreSpot(P.x, P.z);
      p.place(new THREE.Vector3(spot.x, 0, spot.z), spot.heading);
      emit('respawned');
    };
    if (p.fade && typeof p.fadeThen === 'function') {
      p.fadeThen(() => { respawn(); p._fjordSplash = 0; });
    } else { respawn(); p._fjordSplash = 0; }
  }

  sink(p, dt) {
    p.position.addScaledVector(p.velocity, dt);
    p.velocity.multiplyScalar(Math.max(0, 1 - 4 * dt));
    p.position.y = Math.max(p.position.y - 1.5 * dt, SEA - 1.6);
    p.speed = p.velocity.length();
    p.snapRender?.();
  }

  /** The nearest dry, gentle spot back up the fall line from (x, z): on the beach, facing the harbour. */
  shoreSpot(x, z) {
    let u = x - START_X;
    for (let k = 0; k < 400 && this.height(START_X + u, z) < SEA + BEACH - 0.05; k++) u -= 2;
    u -= 14;
    const nx = START_X + u;
    const toQuay = Math.atan2(-(START_X + FINISH_U - nx), -(-100 - z));
    return { x: nx, z, heading: Math.abs(z + 100) < 40 ? -Math.PI / 2 : toQuay };
  }

  lobbySpot() { return { x: START_X + 22, z: 120, heading: -Math.PI / 2 + 0.12 }; }

  // ---------------------------------------------------------------- collectibles, gates
  /** The 12 golden snowflakes: on the lips, the couloir, the roofs, the headland, the pier. y above the snow. */
  placeFlakes() {
    const H = (u, v) => this.height(START_X + u, v);
    const lip = (u0, v, span = 25) => {
      let best = u0, drop = -1e9;
      for (let u = u0 - span; u < u0 + span; u += 0.5) { const d = H(u, v) - H(u + 1.5, v); if (d > drop) { drop = d; best = u; } }
      let top = best;
      while (top > best - 12 && H(top - 0.5, v) - H(top, v) > 0.42) top -= 0.5;
      return { x: START_X + top - 0.5, z: v, y: 1.0 };
    };
    const on = (u, v, up = 1.2) => ({ x: START_X + u, z: v, y: up });
    const roof = (id) => { const s = this.structures.find((k) => k.id === id); const [x, z] = s.world(0, 0); return { x, z, y: 1.3 }; };
    const hc = (u) => HEADLAND.crest(u);
    return [
      on(312, COULOIR.centre(312), 1.1),          // the choke
      lip(COULOIR.chokestone[0], COULOIR.centre(COULOIR.chokestone[0]), 8),   // the chokestone
      lip(612, 175, 20),                           // Ørneredet's nest (straight out of the couloir)
      lip(1075, -30),                              // Hammaren's peak
      on(400, -500, 1.4),                          // a spine crest, Sølvryggene
      lip(1520, hc(1520), 12),                     // Trappa II
      lip(2290, hc(2290), 12),                     // Neskanten
      on(1600, -80, 2.2),                          // over a big roller (Bølgene)
      on(1000, SHOULDER.crest(1000), 2.4),         // a shoulder roller
      roof('hus2'),                                // the bakery's roof
      on(2404, -110, 7.6),                         // high over the boathouse (Naustgapet)
      on(HARBOUR.pier.u1 - 6, -48, 1.2),           // the end of the pier
    ];
  }

  /** Challenge gates down the hero line (at = metres of path ≈ u), avoiding the cliff lips. */
  placeGates() {
    const out = [];
    let side = 1;
    for (let at = 120; at < FINISH_U - 60; at += 70) {
      if (BANDS.some((b) => Math.abs(b.uc - at) < 45) || Math.abs(at - COULOIR.chokestone[0]) < 30) continue;
      out.push({ at, lateral: at < 560 ? 0 : side * 5, width: at < 560 ? 7 : 9 });
      side = -side;
    }
    return out;
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
      const up = ny / l, h = heights[k];
      // Rock on faces steeper than ~46°, and the dark wet band the tide leaves along the coast.
      let rock = smooth((0.7 - up) / 0.16);
      if (h < SEA + 0.9) rock = Math.max(rock, 1 - smooth((h - SEA - 0.3) / 0.6));
      splat[k * 3 + 1] = Math.round(rock * 255);
      if (i > 2 && j > 2 && i < N - 3 && j < N - 3) {
        const lap = (hAt(i - 3, j) + hAt(i + 3, j) + hAt(i, j - 3) + hAt(i, j + 3) - 4 * h) / (9 * sp * sp);
        let packed = smooth((-lap - 0.035) / 0.07) * 0.55;
        if (h < SEA + 3) packed = Math.max(packed, 0.7);   // the beach and the sea ice: hard, fast
        splat[k * 3] = Math.round(packed * 255);
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

  /** The default start: the summit col above Skaret (the first trail's top). */
  spawnPoint() { const z = this.dropZones[0]; return { x: z.x, z: z.z, heading: z.heading }; }
}

// ------------------------------------------------------------------ shapes
const LIP_ROLL = 0.2, LIP_ROLL_LEN = 24;
/** A cliff at `uc` (lip) of height h with a bench of length L above it (Ravenspire's cliff band). */
function cliff(u, uc, h, L) {
  const wF = Math.max(1.4, h * 0.11);
  if (u >= uc) return u > uc + wF ? 0 : h * (1 - smooth((u - uc) / wF));
  const t = (u - (uc - L)) / L;
  if (t <= 0) return 0;
  const Lr = Math.min(L * 0.5, LIP_ROLL_LEN), drop = Lr * LIP_ROLL / 2;
  const s = Math.max(0, (u - (uc - Lr)) / Lr);
  return (h + drop) * Math.pow(t, 1.25) - drop * s * s;
}

function benchRaise(u, uc, h, L, wF) {
  if (u >= uc) return u > uc + wF ? 0 : h * (1 - smooth((u - uc) / wF));
  const t = (u - (uc - L)) / L;
  if (t <= 0) return 0;
  return h * (1.6 * t * t - 0.6 * t * t * t);
}

function horn(e, x, z, hx, hz, peak, slope, twist) {
  const dx = x - hx, dz = z - hz;
  if (peak - Math.hypot(dx, dz) * 0.684 * slope + 120 <= e) return e;
  const c = Math.cos(twist), s = Math.sin(twist);
  const ang = Math.atan2(dz, dx);
  const lobes = 1 + 0.09 * Math.sin(ang * 3 + twist * 5) + 0.05 * Math.sin(ang * 7 + twist * 3);
  const r = (Math.max(Math.abs(dx * c + dz * s), Math.abs(-dx * s + dz * c)) * 0.7 + Math.hypot(dx, dz) * 0.3) * lobes;
  if (peak - r * slope + 120 <= e) return e;
  const gullies = (ridged(ang * 5.5 + twist, r / 140, 2) - 0.45) * 55 * sstep(25, 160, r);
  const top = peak - r * slope + (ridged(dx / 260, dz / 260, 4) - 0.5) * 150 * sstep(30, 300, r) + gullies;
  if (top <= e) return e;
  return e + (top - e) * smooth((top - e) / 50);
}

/** A rock arete along the fall line: jagged crest, steep flanks, fading in at the top and out below (Ravenspire's). */
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

function rib1(x, seed) {
  const a = 1 - Math.abs(noise1(x, seed) * 2 - 1), b = 1 - Math.abs(noise1(x * 2.1 + 5.3, seed + 1) * 2 - 1);
  return (a * a * 0.7 + b * b * 0.3);
}

function lerpTable(t, f) {
  f = Math.min(Math.max(f, 0), t.length - 1.0001);
  const i = f | 0, k = f - i;
  return t[i] + (t[i + 1] - t[i]) * k;
}
/** Smooth max / min (polynomial, blend width k metres). */
function smax(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.max(a, b) + h * h * k * 0.25; }
function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
