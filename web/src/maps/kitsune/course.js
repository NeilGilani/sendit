// Kitsune Peak: a Japanese deep-powder volcano at dusk (map 6). One deterministic height function:
//   macro: the east flank of a stratovolcano (a Yotei-like cone with a crater behind the start), the face
//   between two soft ridges, rounded Hokkaido ranges around and a second volcano on the horizon;
//   detail: long low powder lumps, the Kazan Rim ridge (a rollercoaster of whoops and step-down gaps),
//   the Kitsunebi gully (a natural half-pipe), terraced pillow stacks, small cliff bands, wind lips and
//   rollers, the shrine village bench with its torii tunnel, tree wells around the firs, and drifts
//   piled against buildings whose curved snowy roofs are rideable (structures.js).
// Course-compatible (course.js / realcourse.js API): path, length, dropsAt, finishAt, progress(),
// height(), generate(), menuFocus(), lifts, plus forestAt/pisteAt/treeline (scatter), populate (the
// designed forest), park:false, heightAt/blockAt (features hook), buildProps(), obstacles, physics and
// camera (per-map tuning), dropZones, lineGoals, featureAt/roofAt, challenge, and the contracts other
// sessions build tonight: mountain / trails (index.js), trailSpawn / trailFinish, atmosphere, runCompleted.
import * as THREE from 'three';
import { vnoise, noise1, fbm, ridged, smooth, sstep, hash1 } from './noise.js';
import {
  TILE, START_X, TOP, FINISH_U, PROFILE, BEHIND, CRATER, FACE, KAZAN, GULLY, BANDS, PILLOWS, HITS, BUILDINGS, PAGODA,
  OTORII, TUNNEL, ONSEN, GONDOLA, DROP_ZONES, WEAVE, RIDE_LINES, TRAILS, LINE_GOALS,
} from './layout.js';
import { Structure } from './structures.js';
import { planForest, FIR_WELL } from './forest.js';
import { KITSUNE_PHYSICS, KITSUNE_CAMERA, KITSUNE_ATMOSPHERE } from './tuning.js';
import { attachKitsune } from './scoring.js';

const U_MIN = -7000, U_MAX = 9000;      // profile table range (1 m)
const DEG = Math.PI / 180;
const FALL = [1, 0];                    // the mountain falls toward +x
const BENCH_PER_M = 4;

export class KitsuneCourse {
  constructor() {
    this.name = 'Kitsune Peak';
    this.id = 'kitsune-peak';
    this.meta = { id: 'kitsune-peak' };   // activities / leaderboard key
    this.park = false;                    // no generic kickers / banners / crowds (features.js)
    this.life = { skiers: 0, lodge: false };
    // scatter.js: no generic boulders on the powder (a few volcanic rocks off the lines), a fir forest on the
    // lower mountain from forestAt (the glades and the village are planted by populate()).
    this.spawn = { rockClusterChance: 0.02, rockScale: [0.7, 2.0], rockMinSlope: 24, treeStep: 9, treeMax: 7000 };
    this.challenge = { medalSpeeds: { gold: 23, silver: 19, bronze: 15 } };
    this.physics = KITSUNE_PHYSICS;
    this.camera = KITSUNE_CAMERA;
    this.atmosphere = KITSUNE_ATMOSPHERE;   // the dusk look (graphics hook; ignored until it exists)
    this.water = -1e5;
    this.edgeHint = 'Out of bounds — the patrol says head back onto Kitsune Peak';
    this.lifts = [];
    this.trails = TRAILS.map((t) => ({ ...t }));
    this.activeTrail = 'okama';
    this.buildTables();
    this.buildPillows();
    this.forest = planForest(this);         // birches, firs (with wells), snow monsters: pure data
    this.buildWells();
    this.buildStructures();
    this.buildPath();
    this.treeline = this.profileAt(620) + 30;
    this.lineGoals = LINE_GOALS.map(([name, bonus, ...features]) => ({ name, bonus, features }));
    this.dropZones = DROP_ZONES.map(([name, u, v]) => ({ name, x: START_X + u, z: v, heading: -Math.PI / 2 }));
    this.challenge.flakes = this.placeFlakes();
    this.measureTrails();
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
    // Kazan crest, gully centre / floor / depth tables (1 m).
    const t = (fn, a, b) => { const arr = new Float64Array(b - a + 1); for (let i = 0; i < arr.length; i++) arr[i] = fn(a + i); return { a, arr }; };
    this.kz = { c: t(KAZAN.crest, KAZAN.u0 - 20, KAZAN.u1 + 20), h: t(KAZAN.height, KAZAN.u0 - 20, KAZAN.u1 + 20) };
    this.gl = { c: t(GULLY.centre, GULLY.u0 - 20, GULLY.u1 + 20), f: t(GULLY.floor, GULLY.u0 - 20, GULLY.u1 + 20), d: t(GULLY.depth, GULLY.u0 - 20, GULLY.u1 + 20) };
  }

  profileAt(u) {
    const f = Math.min(Math.max(u - U_MIN, 0), U_MAX - U_MIN - 1.0001);
    const i = f | 0, k = f - i;
    return this.e0[i] + (this.e0[i + 1] - this.e0[i]) * k;
  }

  tab(T, u) {
    const f = Math.min(Math.max(u - T.a, 0), T.arr.length - 1.0001);
    const i = f | 0, k = f - i;
    return T.arr[i] + (T.arr[i + 1] - T.arr[i]) * k;
  }

  kazanCrest(u) { return this.tab(this.kz.c, u); }
  gullyCentre(u) { return this.tab(this.gl.c, u); }

  // ---------------------------------------------------------------- pillows (precomputed domes)
  buildPillows() {
    this.pillows = [];
    let seed = 1;
    for (const F of PILLOWS) {
      if (!F.rows) continue;
      let a = (F.seed * 977) >>> 0;
      const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const du = (F.u1 - F.u0) / F.rows;
      for (let r = 0; r < F.rows; r++) {
        let v = F.v0 + (r % 2) * 5 + rnd() * 4;
        while (v < F.v1) {
          const R = (4.6 + rnd() * 3.2) * F.size;
          const u = F.u0 + (r + 0.5) * du + (rnd() - 0.5) * du * 0.55;
          const edge = Math.min(v - F.v0, F.v1 - v, u - F.u0, F.u1 - u);
          const H = (2.2 + rnd() * 2.6) * F.size * (0.55 + 0.45 * smooth(edge / 25));
          if (rnd() > 0.12) this.pillows.push({ u, v, R, H, Rv: R * (1.25 + rnd() * 0.3), id: seed++ });
          v += R * (1.9 + rnd() * 0.5);
        }
      }
    }
    this.pillowHash = hashPoints(this.pillows, (p) => [p.u, p.v, p.Rv + 1], 16);
  }

  /** Tree wells: a soft dish around every designed fir (forest.js), in u / v. */
  buildWells() {
    this.wells = this.forest.firs.map(([x, z, sc]) => ({ u: x - START_X, v: z, r: FIR_WELL.radius * sc, d: FIR_WELL.depth * Math.min(1.3, sc) }));
    this.wellHash = hashPoints(this.wells, (w) => [w.u, w.v, w.r], 16);
  }

  // ---------------------------------------------------------------- buildings, gates, obstacles
  buildStructures() {
    this.structures = BUILDINGS.map((b) => new Structure(b, START_X + b.u, b.v, FALL, (x, z) => this.natural(x, z)));
    this.driftBox = [Infinity, -Infinity, Infinity, -Infinity];
    for (const s of this.structures) {
      const r = s.hl + 28 + s.hw + 2;
      this.driftBox = [Math.min(this.driftBox[0], s.x - r), Math.max(this.driftBox[1], s.x + r), Math.min(this.driftBox[2], s.z - r), Math.max(this.driftBox[3], s.z + r)];
    }
    const obs = this.obstacles = [];
    // Torii posts (the tunnel gates and the two great gates): solid. Kind 'tower' clears only 15 m up.
    this.gates = [];
    for (let u = TUNNEL.u0; u <= TUNNEL.u1 + 0.01; u += TUNNEL.every) {
      const v = TUNNEL.centre(u);
      // Gate faces along the corridor: its posts sit across the local direction of travel.
      const dv = (TUNNEL.centre(u + 1) - TUNNEL.centre(u - 1)) / 2, n = Math.hypot(1, dv);
      const rx = -dv / n, rz = 1 / n;
      const g = { u, v, x: START_X + u, z: v, rx, rz, span: TUNNEL.span, height: TUNNEL.height, yaw: Math.atan2(dv, 1) };
      this.gates.push(g);
      for (const s of [-1, 1]) obs.push([g.x + rx * s * g.span / 2, g.z + rz * s * g.span / 2, 0.2, 'tower']);
    }
    for (const t of OTORII) for (const s of [-1, 1]) obs.push([START_X + t.u, t.v + s * t.span / 2, 0.45, 'tower']);
    // The pagoda (solid core) and its stone lanterns.
    obs.push([START_X + PAGODA.u, PAGODA.v, PAGODA.base * 0.62, 'wall']);
    // Onsen: a ring of rocks around the pool.
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * Math.PI * 2;
      obs.push([START_X + ONSEN.u + Math.cos(a) * (ONSEN.r + 0.9), ONSEN.v + Math.sin(a) * (ONSEN.r + 0.9), 1.0, 'rock']);
    }
    // Gondola towers along the line.
    const G = GONDOLA;
    this.towers = [];
    for (let i = 1; i <= G.towers; i++) {
      const t = i / (G.towers + 1);
      const u = G.from[0] + (G.to[0] - G.from[0]) * t, v = G.from[1] + (G.to[1] - G.from[1]) * t;
      this.towers.push({ x: START_X + u, z: v });
      obs.push([START_X + u, v, 1.0, 'tower']);
    }
    // Stone lanterns (tōrō) along the village paths and the tunnel mouth: [x, z, kind]. Paper lanterns on poles
    // (chōchin) line the gully rims: breakaway (no collision).
    this.lanterns = this.planLanterns();
    for (const L of this.lanterns) if (L.kind === 'toro') obs.push([L.x, L.z, 0.42, 'rock']);
    // Kitsune statues: a pair at the Ō-torii and a pair at the shrine, facing the way you arrive. [u, v, yaw]
    this.foxes = [[1494, 31, Math.PI / 2], [1494, 49, Math.PI / 2], [1728, 16, Math.PI / 2], [1728, 64, Math.PI / 2]];
    for (const [u, v] of this.foxes) obs.push([START_X + u, v, 0.75, 'rock']);
    // The designed forest's hitboxes (trunks and dense crowns, never the branch tips).
    for (const o of this.forest.obstacles) obs.push(o);
  }

  planLanterns() {
    const out = [];
    const add = (u, v, kind, extra = {}) => out.push({ x: START_X + u, z: v, u, v, kind, ...extra });
    // Kitsunebi: chōchin on bamboo poles along both gully rims every 22 m (the fox fire).
    for (let u = GULLY.u0 + 60; u < GULLY.u1 - 40; u += 22) {
      const c = this.gullyCentre(u), w = this.tab(this.gl.f, u) + GULLY.wall + 4;
      add(u, c - w, 'pole'); add(u + 11, this.gullyCentre(u + 11) + w, 'pole');
    }
    // Tōrō pairs: the approach to the Ō-torii, both sides of the main village path, the shrine forecourt and the finish.
    for (const u of [1450, 1475]) { add(u, 40 - 9, 'toro'); add(u, 40 + 9, 'toro'); }
    for (let u = 1560; u <= 1900; u += 34) { add(u, -100, 'toro'); add(u + 17, -20, 'toro'); }
    for (const [u, v] of [[1790, 120], [1850, 110], [1900, 230], [1960, 230], [1850, 330], [1900, 395]]) add(u, v, 'toro');
    for (let u = 2300; u <= 2420; u += 30) { add(u, 30, 'toro'); add(u, 95, 'toro'); }
    // Chōchin hung from every third tunnel gate (props.js reads course.gates).
    // Rope-line markers along the Kazan Rim crest edge (the boundary of the ridge), every 40 m, both sides.
    for (let u = 160; u < 1260; u += 40) {
      const c = this.kazanCrest(u);
      add(u, c - KAZAN.top - 2, 'marker'); add(u + 20, this.kazanCrest(u + 20) + KAZAN.top + 2, 'marker');
    }
    return out;
  }

  // ---------------------------------------------------------------- path (the hero line: Okama Bowl)
  buildPath() {
    const pts = this.linePoints('okama');
    const path = [];
    for (let u = 0; u <= FINISH_U + 160; u += 8) path.push(new THREE.Vector2(START_X + u, sampleLine(pts, u)));
    this.path = path;
    this.length = 0;
    for (let i = 1; i < path.length; i++) this.length += path[i].distanceTo(path[i - 1]);
    this.finishAt = FINISH_U;
    this.dropsAt = BANDS.filter((b) => b.v0 < 0 && b.v1 > 0).map((b) => b.uc);
  }

  progress(x) { return x - START_X; }
  tAt(z) { void z; return 0; }
  menuFocus() { return new THREE.Vector3(START_X + 1300, this.profileAt(1300) + 650, 0); }

  /** A ride line's waypoints with its special segments expanded (crest, gully, weave, tunnel): [[u, v], …]. */
  linePoints(key) {
    const L = RIDE_LINES[key];
    const pts = [];
    for (const p of L.pts) {
      if (p === 'crest') for (let u = 80; u <= 1440; u += 20) pts.push([u, this.kazanCrest(u)]);
      else if (p === 'gully') for (let u = GULLY.u0 + 40; u <= GULLY.u1; u += 20) pts.push([u, this.gullyCentre(u)]);
      else if (p === 'weave') for (let u = WEAVE.u0; u <= WEAVE.u1; u += 10) pts.push([u, WEAVE.v + WEAVE.amp * Math.sin((u - WEAVE.u0) / WEAVE.wave * Math.PI)]);
      else if (p === 'tunnel') for (let u = TUNNEL.u0; u <= TUNNEL.u1 + 0.1; u += 5) pts.push([u, TUNNEL.centre(u)]);
      else pts.push(p);
    }
    return pts;
  }

  // ---------------------------------------------------------------- the height function
  /** Macro shape only (everywhere): the cone and its crater, the face, ridges and the ranges around. */
  macro(x, z) {
    const u = x - START_X, v = z;
    let e = this.profileAt(u);
    const sd = v < 0 ? 0 : 1;
    const W = FACE.halfWidth(u) * (1 + 0.06 * (noise1(u / 210, 3 + sd) * 2 - 1));
    const Rh = FACE.ridgeHeight(u) * (0.85 + 0.3 * noise1(u / 300, 7 + sd));
    const av = Math.abs(v), a = av / W;
    if (a <= 1) e += Rh * Math.pow(a, FACE.bowlPower);
    else {
      // Past the crest: a rounded flank into the neighbouring drainage, then the next soft ridges.
      const d = av - W;
      e += Rh - d * 0.55 * (1 - 0.5 * sstep(0, 600, d)) + 60 * (vnoise(d / 160 + 3.7, u / 280 + sd * 9) - 0.5) * sstep(0, 220, d);
    }
    // The volcano: a cone around the crater (≈33°), merged with the face by a smooth max, and the crater cut in.
    const cx = START_X + CRATER.u, cz = CRATER.v;
    const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz);
    const ang = Math.atan2(dz, dx);
    // The rim: lowest at the saddle on the face side (= TOP), rising round the back, with a few notches.
    const rimH = TOP + CRATER.rimRise * (0.5 - 0.5 * Math.cos(ang)) * (0.85 + 0.25 * noise1(ang * 2.3 + 4, 61)) + 12 * (noise1(ang * 7 + 1, 62) - 0.5);
    if (r > CRATER.R) {
      const cone = rimH - (r - CRATER.R) * CRATER.coneSlope * (1 - 0.35 * sstep(1800, 4500, r))
        + (ridged(ang * 9 + 2, r / 260, 2) - 0.5) * 22 * sstep(CRATER.R + 60, CRATER.R + 500, r);   // radial gullies down the cone
      e = smax(e, cone, 40);
    } else {
      // Inside the crater: a bowl down to the floor (a frozen crater lake), with the inner wall steepest near the rim.
      const t = r / CRATER.R;
      e = (TOP - CRATER.floor) + (rimH - (TOP - CRATER.floor)) * Math.pow(t, 2.6);
    }
    // Rounded Hokkaido ranges around (lower than the volcano so it dominates every view), bigger to the north.
    const side = av - W - 260, beyond = u - 2900 - Math.max(0, -v) * 0.6;
    const rr = Math.hypot(x, z);
    const m = Math.max(side, beyond * 0.7, (rr - 4200) * 0.8);
    if (m > -200 && r > 900) {
      const k = sstep(-200, 1300, m) * sstep(900, 1600, r);
      const amp = 520 + 300 * sstep(350, -350, v);
      const far = sstep(4500, 10500, rr);
      e += k * (amp * (1 + 0.8 * far) * Math.pow(fbm(x / 2400 + 1.7, z / 2400 - 4.1, 4), 1.6) * 1.6 + 120 * (fbm(x / 800, z / 800, 3) - 0.5)) + far * 700;
    }
    // A second volcano on the horizon down the valley (the view from the village), and a sharp neighbour.
    e = cone(e, x, z, START_X + 7600, -2400, 3450, 0.62, 260);
    e = cone(e, x, z, START_X + 4200, 3900, 2650, 0.55, 0);
    return e;
  }

  /** Terrain without building drifts (buildings are founded on this). */
  natural(x, z) {
    const u = x - START_X, v = z;
    let e = this.macro(x, z);
    if (Math.abs(x) > TILE.size * 0.5 + 60 || Math.abs(z) > TILE.size * 0.5 + 60) return e;
    const W = FACE.halfWidth(u);
    const onFace = sstep(30, 110, u) * (1 - sstep(2400, 2700, u)) * (1 - sstep(0.95, 1.15, Math.abs(v) / W));
    // Powder lumps sized for 25 m/s: long and low, stretched across the fall line like wind drifts.
    e += (fbm(u / 100 + 3.1, v / 62, 3) - 0.5) * 2.4 * (0.4 + 0.6 * onFace) + (vnoise(x / 13, z / 13) - 0.5) * 0.3;
    // Gentle fall-line drainages on the mid-mountain (soft, Hokkaido: rounded ribs, not rock aretes).
    if (onFace > 0) {
      const mid = onFace * sstep(550, 800, u) * (1 - sstep(1450, 1560, u));
      if (mid > 0) e += mid * (fbm(v / 120 + 0.8 * noise1(u / 600, 31), u / 900, 2) - 0.5) * 10;
      // The lower mountain's gullies (Rusutsu style): ridges dropping into gullies that funnel to the runout.
      const low = onFace * sstep(1900, 2000, u) * (1 - sstep(2300, 2420, u));
      if (low > 0) e += low * (rib(v / 70 + 0.7 * noise1(u / 300, 33), 41) - 0.45) * 9;
    }
    // The village bench is calmer: the lumps fade under the buildings.
    e += this.kazan(u, v);
    e = this.gully(u, v, e);
    e += this.bands(u, v);
    e += this.pillowsAt(u, v);
    e += this.hits(u, v);
    e += this.tunnel(u, v);
    e -= this.wellsAt(u, v);
    e = this.onsen(u, v, e);
    return e;
  }

  height(x, z) {
    let e = this.natural(x, z);
    const B = this.driftBox;
    if (this.structures && x > B[0] && x < B[1] && z > B[2] && z < B[3]) for (const s of this.structures) e += s.driftAt(x, z, e);
    return e;
  }

  /** The Kazan Rim ridge: a rounded crest with whoops along it and step-down gaps, on 39° flanks. */
  kazan(u, v) {
    const K = KAZAN;
    if (u < K.u0 - 10 || u > K.u1 + 10) return 0;
    const H = this.tab(this.kz.h, u);
    if (H < 0.05) return 0;
    const dv = Math.abs(v - this.tab(this.kz.c, u));
    const reach = K.top + K.flank * (0.6 + 0.4 * H / 22);
    if (dv > reach) return 0;
    let p;
    if (dv <= K.top) p = 1 - 0.06 * (dv / K.top) ** 2;
    else p = 0.94 * (1 - smooth((dv - K.top) / (reach - K.top)));
    let add = H * p;
    // Whoops: rollers along the crest (they throw you at speed: that's the rollercoaster).
    const Wp = K.whoop;
    const crest = 1 - sstep(K.top - 2, K.top + 6, dv);
    if (crest > 0 && u > Wp.from && u < Wp.to) {
      const env = sstep(Wp.from, Wp.from + 60, u) * (1 - sstep(Wp.to - 60, Wp.to, u));
      let near = 1;
      for (const [gu] of K.gaps) near = Math.min(near, sstep(30, 70, Math.abs(u - gu)));
      const ph = (u - Wp.from + 6 * noise1(u / 90, 71)) / Wp.wave;
      add += crest * env * near * Wp.amp * (0.8 + 0.4 * noise1(Math.floor(ph), 72)) * (0.5 - 0.5 * Math.cos(2 * Math.PI * ph));
    }
    // Step-down gaps: the crest (and its flanks, in proportion) is raised above each break, then drops.
    for (const [gu, drop] of K.gaps) if (u > gu - drop * BENCH_PER_M - 2 && u < gu + 10) add += cliff(u, gu, drop, drop * BENCH_PER_M) * p;
    return add;
  }

  /** The Kitsunebi gully: a natural half-pipe carved into the face, with a lee lip along each rim. */
  gully(u, v, e) {
    const G = GULLY;
    if (u < G.u0 - 10 || u > G.u1 + 10) return e;
    const D = this.tab(this.gl.d, u);
    if (D < 0.05) return e;
    const wf = this.tab(this.gl.f, u), ww = G.wall;
    const dv = Math.abs(v - this.tab(this.gl.c, u));
    if (dv > wf + ww + 6) return e;
    let carve;
    if (dv <= wf) carve = D - 0.6 * (dv / wf) ** 2;   // a gently dished floor
    else {
      const t = (dv - wf) / ww;
      carve = t >= 1 ? 0 : (D - 0.6) * (0.5 + 0.5 * Math.cos(Math.PI * t));   // smooth transition, steepest mid-wall
    }
    const lip = 0.9 * (D / 13) * Math.exp(-(((dv - wf - ww + 1) / 2.6) ** 2));   // the lee lip you pop off
    return e - carve + lip;
  }

  bands(u, v) {
    let add = 0;
    for (const B of BANDS) {
      if (v < B.v0 - 50 || v > B.v1 + 50) continue;
      const uc = B.uc + B.wob * (noise1(v / 45, B.seed + 50) * 2 - 1) + 1.6 * (noise1(v / 11, B.seed + 70) * 2 - 1);
      if (u < uc - Math.max(B.bench, (B.h + B.var) * BENCH_PER_M) - 2 || u > uc + 30) continue;
      let h = B.h + B.var * (noise1(v / 58, B.seed) * 2 - 1);
      let taper = sstep(B.v0 - 30, B.v0 + 20, v) * (1 - sstep(B.v1 - 20, B.v1 + 30, v));
      for (const [gv, gw] of B.gaps) taper *= sstep(gw * 0.35, gw, Math.abs(v - gv));
      h *= taper;
      if (h < 0.05) continue;
      add += cliff(u, uc, h, Math.max(B.bench, h * BENCH_PER_M));
    }
    return add;
  }

  bandLip(B, v) { return B.uc + B.wob * (noise1(v / 45, B.seed + 50) * 2 - 1) + 1.6 * (noise1(v / 11, B.seed + 70) * 2 - 1); }

  pillowsAt(u, v) {
    let add = 0;
    for (const F of PILLOWS) {
      if (!F.terrace || u < F.u0 - 10 || u > F.u1 + 10 || v < F.v0 - 10 || v > F.v1 + 10) continue;
      const env = sstep(F.u0 - 10, F.u0 + 20, u) * (1 - sstep(F.u1 - 20, F.u1 + 10, u)) * sstep(F.v0 - 10, F.v0 + 15, v) * (1 - sstep(F.v1 - 15, F.v1 + 10, v));
      if (env <= 0) continue;
      const G = (this.profileAt(u - 6) - this.profileAt(u + 6)) / 12;
      const S = F.step, f = (u + S * 1.3 * noise1(v / 16, F.seed) + S * 0.5 * noise1(v / 5.5, F.seed + 3)) / S;
      const fr = f - Math.floor(f);
      const tp = F.top ?? 0.6;
      const s = fr < tp ? fr / tp - 0.12 * Math.sin(Math.PI * fr / tp) : 1 - smooth((fr - tp) / (1 - tp));
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
      const h = p.H * Math.pow(1 - q * q, 1.25);   // mushroom: rounded top, steep sides
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

  /** The senbon torii corridor: a shallow banked trough between the gate posts, and the pop at its exit. */
  tunnel(u, v) {
    const T = TUNNEL;
    if (u < T.u0 - 30 || u > T.u1 + 30) return 0;
    const dv = Math.abs(v - T.centre(Math.min(T.u1, Math.max(T.u0, u))));
    if (dv > 9) return 0;
    const along = sstep(T.u0 - 30, T.u0, u) * (1 - sstep(T.u1, T.u1 + 25, u));
    // Trough: the floor dips `trough` m in the middle, the banks rise a little under the posts.
    const tr = -T.trough * Math.cos(Math.min(1, dv / 7) * Math.PI / 2) ** 2 + 0.5 * Math.exp(-(((dv - 4) / 1.8) ** 2));
    // Exit kicker: a short lip a few metres past the last gate (named 'Torii Exit').
    const du = u - (T.u1 + 12);
    const kick = du > -16 && du < 4 && dv < 5 ? 1.5 * (du < 0 ? Math.exp(-((du / 7) ** 2)) : Math.exp(-((du / 1.6) ** 2))) * (1 - sstep(3, 5, dv)) : 0;
    return tr * along + kick;
  }

  /** Tree wells: a soft dish around each designed fir (the snow can't settle under the branches). */
  wellsAt(u, v) {
    const a = this.wellHash.get(Math.floor(u / 16) * 4096 + Math.floor(v / 16));
    if (!a) return 0;
    let best = 0;
    for (const w of a) {
      const q = ((u - w.u) ** 2 + (v - w.v) ** 2) / (w.r * w.r);
      if (q < 1) best = Math.max(best, w.d * (1 - q) * (1 - q));
    }
    return best;
  }

  /** The onsen: a level terrace with the pool sunk into it (props.js draws the water and the steam). */
  onsen(u, v, e) {
    const d = Math.hypot(u - ONSEN.u, v - ONSEN.v);
    if (d > ONSEN.r + 16) return e;
    const lvl = this.profileAt(ONSEN.u) + 1.5;
    const k = 1 - sstep(ONSEN.r + 4, ONSEN.r + 16, d);
    let y = e + (lvl - e) * k;
    if (d < ONSEN.r) y -= 0.9 * smooth((ONSEN.r - d) / 2);
    return y;
  }

  // ---------------------------------------------------------------- features hook (terrain.features)
  heightAt(x, z) {
    let best = null;
    for (const s of this.structures) {
      const y = s.surface(x, z);
      if (y !== null && (best === null || y > best)) best = y;
    }
    return best;
  }

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
    if (u > TUNNEL.u1 - 10 && u < TUNNEL.u1 + 25 && Math.abs(v - TUNNEL.centre(TUNNEL.u1)) < 8) return 'Torii Exit';
    if (u > TUNNEL.u0 && u < TUNNEL.u1 && Math.abs(v - TUNNEL.centre(u)) < 4) return 'Senbon Torii';
    for (const B of BANDS) {
      if (v < B.v0 - 20 || v > B.v1 + 20) continue;
      const uc = this.bandLip(B, v);
      if (u > uc - 30 && u < uc + 6) return B.name;
    }
    if (u > KAZAN.u0 && u < KAZAN.u1 && this.tab(this.kz.h, u) > 4 && Math.abs(v - this.kazanCrest(u)) < KAZAN.top + 6) {
      for (let i = 0; i < KAZAN.gaps.length; i++) if (u > KAZAN.gaps[i][0] - 30 && u < KAZAN.gaps[i][0] + 6) return `Kazan Gap ${i + 1}`;
      return 'Kazan Rim';
    }
    if (u > GULLY.u0 && u < GULLY.u1 && this.tab(this.gl.d, u) > 4 && Math.abs(v - this.gullyCentre(u)) < this.tab(this.gl.f, u) + GULLY.wall + 4) return 'Kitsunebi Gully';
    for (const F of PILLOWS) if (u > F.u0 && u < F.u1 && v > F.v0 && v < F.v1) return F.name;
    for (const [hu, hv, L, , kind, name] of HITS) if (Math.abs(u - hu) < 20 && Math.abs(v - hv) < L) return name || (kind === 'lip' ? 'Wind Lip' : 'Roller');
    if (u > WEAVE.u0 && u < WEAVE.u1 && v > -300 && v < 180) return 'Shirakaba';
    if (u < 70) return 'Crater Rim';
    return null;
  }

  roofAt(x, z) {
    for (const s of this.structures) if (s.surface(x, z) !== null) return s.name;
    return null;
  }

  // ---------------------------------------------------------------- scatter hooks (trees)
  /** The generic fir forest (scatter.js): the lower mountain and the flanks; the designed glades are planted by populate(). */
  forestAt(x, z) {
    const u = x - START_X;
    if (u < 900) return 0;
    if (u > 1480 && u < 2000 && z > -260 && z < 470) return 0;              // the village bench: designed only
    if (u < 1500 && z > -320 && z < 200) return 0;                           // the birch glade: designed only
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 14) return 0;
    const n = fbm(x / 170, z / 170, 3);
    return Math.min(1, sstep(1000, 1400, u) * sstep(0.38, 0.58, n) + sstep(1950, 2100, u) * 0.5);
  }

  pisteAt(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 13 + 3 * (noise1(u / 41 + z / 57, 77) * 2 - 1)) return 1;
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 12) return 1;
    if (Math.hypot(u - ONSEN.u, z - ONSEN.v) < ONSEN.r + 14) return 1;
    if (Math.hypot(u - PAGODA.u, z - PAGODA.v) < 18) return 1;
    // The gondola corridor (cut through the forest).
    const G = GONDOLA;
    const ax = G.from[0], az = G.from[1], bx = G.to[0], bz = G.to[1];
    const t = Math.max(0, Math.min(1, ((u - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)));
    if (Math.hypot(u - ax - (bx - ax) * t, z - az - (bz - az) * t) < 10) return 1;
    return 0;
  }

  /** The designed forest (birches are props; firs and their hitboxes go through scatter): see forest.js. */
  populate(scatter) {
    const T = scatter.terrain;
    for (const [x, z, sc, w, yaw] of this.forest.firs) {
      if (!T.isInside(x, z, 20)) continue;
      scatter.trees.add(x, T.getHeight(x, z) - 0.6, z, yaw, sc * w, sc, sc * w, 1);
      (scatter.wells || (scatter.wells = [])).push([x, z, sc * 1.3]);
    }
  }

  corniceOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 45) return false;
    for (const s of this.structures) if (Math.hypot(x - s.x, z - s.z) < s.R + 30) return false;
    for (const d of this.dropZones) if (Math.hypot(x - d.x, z - d.z) < 120) return false;
    if (u > KAZAN.u0 - 30 && u < KAZAN.u1 && Math.abs(z - this.kazanCrest(Math.max(KAZAN.u0, u))) < 60) return false;
    return u < -60 || Math.abs(z) > FACE.halfWidth(Math.max(0, u)) * 0.88;
  }

  rockOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 26) return false;
    if (u > 1450 && u < 2050 && z > -250 && z < 450) return false;
    for (const [, zu, zv] of DROP_ZONES) if (Math.hypot(u - zu, z - zv) < 45) return false;
    if (u > GULLY.u0 - 30 && u < GULLY.u1 + 10 && Math.abs(z - this.gullyCentre(Math.max(GULLY.u0, u))) < 40) return false;
    return true;
  }

  /** Distance (m, in u / v) to the nearest canonical line; ≥ 32 reads as "far". */
  lineDist(u, v) {
    if (!this._lineHash) {
      const H = new Map();
      const add = (a, b) => { const k = Math.floor(a / 32) * 4096 + Math.floor(b / 32); let l = H.get(k); if (!l) H.set(k, (l = [])); l.push(a, b); };
      for (const key of Object.keys(RIDE_LINES)) {
        const pts = this.linePoints(key);
        for (let i = 0; i < pts.length - 1; i++) {
          const [a0, b0] = pts[i], [a1, b1] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(a1 - a0, b1 - b0) / 3));
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

  // ---------------------------------------------------------------- trails (mountains-and-trails contract)
  /** Where a trail starts: { x, z, heading } (heading 0 = facing −z; −π/2 = down the fall line, +x). */
  trailSpawn(trailId) {
    const t = this.trails.find((k) => k.id === trailId) || this.trails[0];
    const [u, v] = t.start;
    // Face down the trail's line: toward its waypoint ~40 m ahead.
    const pts = this.linePoints(t.id);
    const ahead = sampleLine(pts, u + 40);
    return { x: START_X + u, z: v, heading: Math.atan2(-40, -(ahead - v)) };
  }

  /** Where a trail ends: the finish line across the base at its own spot. { x, z, u, width, heading }. */
  trailFinish(trailId) {
    const t = this.trails.find((k) => k.id === trailId) || this.trails[0];
    return { x: START_X + FINISH_U, z: t.finishV, u: FINISH_U, width: 120, heading: -Math.PI / 2 };
  }

  /** The trail whose line is nearest (u, v): used to name a run that started from a drop zone. */
  trailNear(u, v) {
    let best = null, bd = Infinity;
    for (const t of this.trails) {
      const pts = this.linePoints(t.id);
      if (u < pts[0][0] - 30) continue;
      const d = Math.abs(sampleLine(pts, u) - v);
      if (d < bd) { bd = d; best = t.id; }
    }
    return best;
  }

  /** Each trail's length (along its line, from its start to the finish) and vertical drop. */
  measureTrails() {
    for (const t of this.trails) {
      const pts = this.linePoints(t.id);
      const u0 = t.start[0];
      let len = 0, pu = u0, pv = t.start[1];
      for (let u = u0 + 5; u <= FINISH_U; u += 5) {
        const v = sampleLine(pts, u);
        len += Math.hypot(u - pu, v - pv, this.natural(START_X + u, v) - this.natural(START_X + pu, pv));
        pu = u; pv = v;
      }
      t.length = Math.round(len / 10) * 10;
      t.vertical = Math.round((this.natural(START_X + u0, t.start[1]) - this.natural(START_X + FINISH_U, t.finishV)) / 5) * 5;
    }
  }

  onPlayer(pl) { attachKitsune(this, pl); }

  lobbySpot() { return { x: START_X + 22, z: -14, heading: -Math.PI / 2 - 0.12 }; }

  /**
   * Golden snowflakes (activities.js `course.challenge.flakes`): one or two on every trail, on the lips,
   * roofs and walls you'd hit anyway. [{ x, z, y above the snow }]
   */
  placeFlakes() {
    const H = (u, v) => this.natural(START_X + u, v);
    const lip = (u0, v, span = 20) => {
      let best = u0, drop = -1e9;
      for (let u = u0 - span; u < u0 + span; u += 0.5) {
        const d = H(u, v) - H(u + 1.5, v);
        if (d > drop) { drop = d; best = u; }
      }
      return { x: START_X + best - 1, z: v, y: 1.0 };
    };
    const on = (u, v, up = 1.2) => ({ x: START_X + u, z: v, y: up });
    const roof = (id, a = 0.25) => {
      const s = this.structures.find((k) => k.id === id);
      const [x, z] = s.world(s.hl * a, 0);
      return { x, z, y: 1.2 };
    };
    const g = (u, side) => {   // high on a gully wall
      const c = this.gullyCentre(u), w = this.tab(this.gl.f, u) + GULLY.wall * 0.55;
      return on(u, c + side * w, 1.4);
    };
    return [
      on(330, -40),                          // Okama Bowl
      lip(600, -60, 12),                     // Okama Lip
      on(700, this.kazanCrest(700), 1.6),    // Kazan Rim crest
      lip(KAZAN.gaps[1][0], this.kazanCrest(KAZAN.gaps[1][0]), 10),   // Kazan Gap 2
      on(820, -440),                         // Makura Pillows
      lip(990, -440, 12),                    // Makura Cliff
      on(1000, WEAVE.v + WEAVE.amp * Math.sin((1000 - WEAVE.u0) / WEAVE.wave * Math.PI)),   // the weave
      g(800, 1), g(1150, -1),                // the gully walls
      on(TUNNEL.u1 - 20, TUNNEL.centre(TUNNEL.u1 - 20), 1.0),   // inside the torii tunnel
      roof('haiden'), roof('tsuki'),
      lip(1355, -250, 12),                   // Fox Ledge
      on(2150, 300, 1.5),                    // a fir lip
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
      // Rock only where it is really steep (deep snow sticks to everything here) — and dark volcanic rock
      // on the crater's inner wall.
      const x = -half + i * sp, z = -half + j * sp;
      const cr = Math.hypot(x - (START_X + CRATER.u), z - CRATER.v);
      const crater = cr < CRATER.R + 8 ? sstep(CRATER.R * 0.45, CRATER.R * 0.9, cr) * (1 - sstep(CRATER.R - 6, CRATER.R + 8, cr)) * 0.55 : 0;
      splat[k * 3 + 1] = Math.round(Math.max(smooth((0.66 - up) / 0.16), crater) * 255);
      // The village paths and the trail lines are packed (faster); wind-packed snow on convex crests.
      const u = x - START_X;
      let packed = 0;
      if (u > 1440 && u < 2480 && Math.abs(z) < 520) packed = Math.max(0, 1 - this.lineDist(u, z) / 9) * 0.6;
      if (i > 2 && j > 2 && i < N - 3 && j < N - 3) {
        const lap = (hAt(i - 3, j) + hAt(i + 3, j) + hAt(i, j - 3) + hAt(i, j + 3) - 4 * heights[k]) / (9 * sp * sp);
        packed = Math.max(packed, smooth((-lap - 0.04) / 0.07) * 0.45);
      }
      splat[k * 3] = Math.round(packed * 255);
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

  /** The selected trail's start (the crater-rim saddle on Okama Bowl by default). */
  spawnPoint() { return this.trailSpawn(this.activeTrail); }

  /** Choose the trail the rider starts on (and respawns to): true if it exists. */
  selectTrail(id) {
    if (!this.trails.some((t) => t.id === id)) return false;
    this.activeTrail = id;
    return true;
  }
}

// ------------------------------------------------------------------ helpers
/** v of a polyline [[u, v], …] at u (linear between points, clamped at the ends). */
export function sampleLine(pts, u) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / Math.max(1e-6, pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
  }
  return pts[pts.length - 1][1];
}

function hashPoints(list, ext, C) {
  const H = new Map();
  for (const p of list) {
    const [u, v, r] = ext(p);
    for (let cu = Math.floor((u - r) / C); cu <= Math.floor((u + r) / C); cu++) {
      for (let cv = Math.floor((v - r) / C); cv <= Math.floor((v + r) / C); cv++) {
        const k = cu * 4096 + cv;
        let a = H.get(k);
        if (!a) H.set(k, (a = []));
        a.push(p);
      }
    }
  }
  return H;
}

/** Smooth max (polynomial, blend width k). */
function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/**
 * A cliff at `uc` (lip), height h, with a bench of length L above it: the approach flattens, rolls over
 * toward the lip, then drops h onto the unchanged slope below (Ravenspire's shape).
 */
const LIP_ROLL = 0.2, LIP_ROLL_LEN = 20;
function cliff(u, uc, h, L) {
  const wF = Math.max(1.4, h * 0.11);
  if (u >= uc) return u > uc + wF ? 0 : h * (1 - smooth((u - uc) / wF));
  const t = (u - (uc - L)) / L;
  if (t <= 0) return 0;
  const Lr = Math.min(L * 0.5, LIP_ROLL_LEN), drop = Lr * LIP_ROLL / 2;
  const s = Math.max(0, (u - (uc - Lr)) / Lr);
  return (h + drop) * Math.pow(t, 1.25) - drop * s * s;
}

/** A volcanic cone rising out of the terrain (radial gullies down its flanks). */
function cone(e, x, z, cx, cz, peak, slope, crater) {
  const dx = x - cx, dz = z - cz, r = Math.hypot(dx, dz);
  if (peak - r * slope * 0.8 + 100 <= e) return e;
  const ang = Math.atan2(dz, dx);
  let top = peak - r * slope * (1 - 0.3 * sstep(800, 3500, r)) + (ridged(ang * 8 + 1, r / 300, 2) - 0.5) * 40 * sstep(150, 600, r);
  if (crater > 0 && r < crater) top -= 120 * (1 - (r / crater) ** 2);
  if (top <= e) return e;
  return e + (top - e) * smooth((top - e) / 50);
}

/** 1D ridged noise (two octaves): sharp crests, rounded troughs, in [0, 1]. */
function rib(x, seed) {
  const a = 1 - Math.abs(noise1(x, seed) * 2 - 1), b = 1 - Math.abs(noise1(x * 2.1 + 5.3, seed + 1) * 2 - 1);
  return (a * a * 0.7 + b * b * 0.3);
}

export { hash1 };
