// Dragonback — a big-mountain face packed with ridges (map 5). One deterministic height function:
//   macro: a steep face under a serrated summit ridge (the Dragon's Back), framing walls, a valley below,
//          wild ranges around (Ravenspire's recipe, different peaks);
//   ridges: fall-line arêtes and fins (ridges.js) smooth-unioned on top of the face: sharp or rounded
//          crests, concave flanks, gendarme step-downs with rolled lips, notch gaps, prow ends, wind lips
//          that kick you across a gully onto the next ridge; a tight spine field (the Organ Pipes);
//   detail: low powder lumps, sluff runnels in the gullies, wind lips, pillow tongues.
// Course-compatible (course.js / realcourse.js API) exactly like Ravenspire: path, length, dropsAt,
// finishAt, progress(), height(), generate(), menuFocus(), lifts, forestAt / pisteAt / treeline,
// park:false, physics / camera (per-map tuning), featureAt (named take-offs), dropZones, lineGoals,
// challenge (medals, gates, flakes), onPlayer (ridge-hop scoring).
import * as THREE from 'three';
import { vnoise, noise1, fbm, ridged, smooth, sstep, hash1 } from '../ravenspire/noise.js';
import {
  TILE, START_X, TOP, FINISH_U, PROFILE, BEHIND, FACE, RIDGES, HOPS, SPINE_FIELD, HITS, PILLOWS, DROP_ZONES, LINE_GOALS, RIDE_LINES,
} from './layout.js';
import { Ridge, cliff, smax } from './ridges.js';
import { DRAGONBACK_PHYSICS, DRAGONBACK_CAMERA } from './tuning.js';
import { attachRidgeScoring } from './scoring.js';
import { attachSluff } from './sluff.js';

const U_MIN = -7000, U_MAX = 9000;      // profile table range (1 m)
const DEG = Math.PI / 180;
// The Dragon's Back towers: [v, height above the start, flank slope, twist].
const SUMMIT_TOWERS = [[-380, 170, 1.9, 0.3], [-280, 210, 2.0, 1.1], [-175, 165, 2.2, 0.6], [-95, 245, 1.8, 0.2], [20, 150, 2.3, 1.4],
  [110, 200, 1.9, 0.8], [215, 175, 2.1, 0.4], [320, 225, 1.8, 1.2], [430, 160, 2.0, 0.9]];

export class DragonbackCourse {
  constructor() {
    this.name = 'Dragonback';
    this.id = 'dragonback';
    this.meta = { id: 'dragonback' };    // activities / leaderboard key
    this.park = false;                   // no kickers, rollers, banners or crowds (features.js)
    this.life = { skiers: 0, lodge: false };
    // scatter.js overrides: a few boulders, a sparse larch / pine fringe low down only.
    this.spawn = { rockClusterChance: 0.03, rockScale: [0.7, 2.0], rockMinSlope: 22, treeStep: 10, treeMax: 6000 };
    this.challenge = { medalSpeeds: { gold: 21.5, silver: 18.5, bronze: 15.5 } };   // m/s down the fall line (FINISH_U / time)
    this.physics = DRAGONBACK_PHYSICS;
    this.camera = DRAGONBACK_CAMERA;
    this.water = -1e5;
    this.edgeHint = 'Edge of the range — head back onto the ridges';
    this.lifts = [];
    this.obstacles = [];
    this.buildTables();
    this.ridges = RIDGES.map((def) => new Ridge(def));
    this.ridgeById = Object.fromEntries(this.ridges.map((r) => [r.id, r]));
    this.buildHops();
    this.buildRidgeIndex();
    this.buildPath();
    this.treeline = this.profileAt(1700) + 30;
    this.lineGoals = LINE_GOALS.map(([name, bonus, ...features]) => ({ name, bonus, features }));
    this.dropZones = DROP_ZONES.map(([name, u, v]) => ({ name, x: START_X + u, z: v, heading: -Math.PI / 2 }));
    this.challenge.flakes = this.placeFlakes();
    this.challenge.gates = this.placeGates();
    this.placeProps();
  }

  /**
   * Where the props stand (props.js draws them): bivouacs (they collide: course.obstacles), cairns at every
   * notch lip and hop spur, prayer-flag strings at the Shoulder and over the finish, marker poles along the
   * rollover, the summit cross on the Dragon's Back's highest tower. World x / z.
   */
  placeProps() {
    const W = (u, v) => [START_X + u, v];
    const bivouacs = [[8, -118, 0.15], [96, -330, -0.3], [1050, -300, 0.4], [640, 420, -0.2]].map(([u, v, yaw]) => { const [x, z] = W(u, v); return { x, z, yaw }; });
    for (const b of bivouacs) this.obstacles.push([b.x, b.z, 3.0, 'tower']);
    const cairns = [];
    for (const r of this.ridges) {
      for (const g of r.gaps) for (const sd of [-1, 1]) { const [x, z] = W(g.u - 5, r.crestAt(g.u - 5) + sd * (r.topAt(g.u) + 3.5)); cairns.push({ x, z, stick: sd > 0 }); }
      if (r.end === 'prow' && !r.id.startsWith('hop')) { const [x, z] = W(r.u1 - 6, r.crestAt(r.u1) + r.topAt(r.u1) + 3); cairns.push({ x, z, size: 0.8 }); }
    }
    for (const h of this.hops) {
      const sp = h.spur, side = Math.sign(sp.crestAt(sp.u1) - sp.crestAt(sp.u0));
      const [x, z] = W(sp.u0 + 4, h.fromRidge.crestAt(sp.u0 + 4) - side * (h.fromRidge.topAt(sp.u0) + 3));
      cairns.push({ x, z, stick: true, size: 1.2 });
    }
    for (let v = -300; v <= 330; v += 70) { const [x, z] = W(FINISH_U, v); if (Math.abs(v - 5) > 60) cairns.push({ x, z, size: 1.1 }); }
    const flags = [
      { a: W(8, -112), b: W(40, -58), h: 3.4, sag: 0.6 },
      { a: W(30, -120), b: W(52, -10), h: 4.6, sag: 0.9 },
      { a: W(26, 20), b: W(48, 110), h: 4.6, sag: 0.9 },
      { a: W(FINISH_U, -55), b: W(FINISH_U, 65), h: 7, sag: 1.4 },
    ];
    const poles = [];
    for (let v = -420; v <= 420; v += 26) { const u = 84 + 6 * Math.sin(v / 37); if (this.lineDist(u, v) > 6) { const [x, z] = W(u, v); poles.push({ x, z }); } }
    let cross = null, best = -Infinity;
    for (let u = -260; u <= -30; u += 4) for (let v = -200; v <= 200; v += 4) { const y = this.height(START_X + u, v); if (y > best) { best = y; cross = { x: START_X + u, z: v }; } }
    this.props = { bivouacs, cairns, flags, poles, cross };
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
  }

  profileAt(u) {
    const f = Math.min(Math.max(u - U_MIN, 0), U_MAX - U_MIN - 1.0001);
    const i = f | 0, k = f - i;
    return this.e0[i] + (this.e0[i + 1] - this.e0[i]) * k;
  }

  /** Ridges active per 20 m band of u (a ridge reaches its full foot width either side of its crest). */
  buildRidgeIndex() {
    this.band = [];
    for (let b = 0; b * 20 < FINISH_U + 200; b++) {
      const u0 = b * 20, u1 = u0 + 20;
      this.band.push(this.ridges.filter((r) => r.u1 + r.tail > u0 && r.u0 - r.head < u1));
    }
  }

  /**
   * Ridge-to-ridge hops: a spur — a short side arête — peels off the `from` ridge's crest `len` m above `u`
   * and runs straight at the landing on the `to` ridge, ending at `u` in a wind-lip kicker over the gully.
   * Ride the spur and you are already flying the right way: the kick and the drop do the rest. The spur
   * is a ridge of its own, named after the hop (so the hop is a feature line goals can ask for).
   */
  buildHops() {
    this.hops = HOPS.map((h, i) => {
      const from = this.ridgeById[h.from], to = this.ridgeById[h.to];
      const L = h.len ?? 90, u0 = h.u - L;
      const vc = from.crestAt(u0), H0 = from.heightAt(u0);
      // Aim a little past the target's crest: a flight that comes up short still lands on its crest.
      const side = Math.sign(to.crestAt(h.land) - vc);
      const target = [h.land, to.crestAt(h.land) + side * (h.over ?? 5)];
      // The spur leaves the crest tangentially and curves out to its line (a rider following the crest at
      // 30 m/s is steered onto it, never thrown off the main crest's convex top), then runs straight at the
      // landing for its second half: g(t) = t² / 2a below a, t − a / 2 above. Over 90 m the curve-in is a
      // ~65 m radius: ~1.4 g at 30 m/s, inside what skis and boards can carve at that speed.
      const a = 0.5, g = (t) => (t < a ? (t * t) / (2 * a) : t - a / 2);
      const slope = (target[1] - vc) / (target[0] - u0);         // the straight line's heading from the root…
      const dEnd = slope * L * 1.15;                             // …steepened so the straight part points at the landing
      const knots = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, uu = u0 + L * t;
        knots.push([uu, vc + dEnd * g(t) / g(1), from.heightAt(uu) * (1 - (h.drop ?? 0.08) * t), 26 - 2 * t]);   // as high as the parent's crest
      }
      const spur = new Ridge({
        id: `hop${i}`, name: h.name, prowName: h.name, top: h.top ?? 4, p: 1.7, rise: 0, end: 'kicker', kick: h.h ?? 2.5,
        wander: 0, seed: 50 + i, knots,
      });
      this.ridges.push(spur);
      this.ridgeById[spur.id] = spur;
      return { ...h, fromRidge: from, toRidge: to, spur, target };
    });
    this.hopByName = Object.fromEntries(this.hops.map((h) => [h.name, h]));
  }

  // ---------------------------------------------------------------- path (the hero line)
  buildPath() {
    // The hero line is the Dragon's Spine line (RIDE_LINES.spine): down the crest and both gaps, the Fork's left
    // branch, the Organ Pipes, the apron and the runout. The HUD, the challenge gates and the perf spots use it.
    const pts = this.linePoints(RIDE_LINES.spine).filter(([u]) => u <= FINISH_U + 160).map(([u, v]) => new THREE.Vector2(START_X + u, v));
    this.path = pts;
    this.length = 0;
    for (let i = 1; i < pts.length; i++) this.length += pts[i].distanceTo(pts[i - 1]);
    this.finishAt = FINISH_U;
    this.dropsAt = [];
  }

  progress(x) { return x - START_X; }
  tAt(z) { void z; return 0; }
  menuFocus() { return new THREE.Vector3(START_X + 1100, this.profileAt(1100) + 650, 0); }

  // ---------------------------------------------------------------- the height function
  /** Macro shape only (everywhere): the face, framing walls, summit ridge, valley and the ranges around. */
  macro(x, z) {
    const u = x - START_X, v = z;
    let e = this.profileAt(u);
    const sd = v < 0 ? 0 : 1;
    const W = FACE.halfWidth(u) * (1 + 0.06 * (noise1(u / 190, 3 + sd) * 2 - 1));
    const Rh = FACE.ridgeHeight(u) * (0.85 + 0.3 * noise1(u / 240, 7 + sd));
    const crest = 34 * Math.pow(ridged(u / 80, sd * 5.3 + 1, 2), 3) * sstep(-100, 200, u) * Math.exp(-(((Math.abs(v) - W) / 28) ** 2));
    const av = Math.abs(v), a = av / W;
    e += crest;
    if (a <= 1) {
      e += Rh * Math.pow(a, FACE.bowlPower);
      const wall = FACE.wallHeight(u);
      if (wall > 0) { const s = sstep(0.8, 1.0, a); e += wall * s * s; }
    } else {
      const d = av - W;
      e += Rh - d * 0.75 * (1 - 0.6 * sstep(0, 700, d)) + 80 * (vnoise(d / 130 + 1.7, u / 240 + sd * 9) - 0.5) * sstep(0, 200, d);
    }
    // Wild ranges around; the valley below bends south and is closed off by peaks.
    const side = av - W - 220, back = -u - 380, beyond = u - 2700 - Math.max(0, v) * 0.6;
    const r = Math.hypot(x, z);
    const m = Math.max(side, back * 1.2, beyond * 0.7, (r - 4200) * 0.8);
    if (m > -200) {
      const k = sstep(-200, 1100, m);
      const amp = 1100 + 500 * sstep(-350, 350, v);   // the south (v > 0) ranges are the big dark ones here
      const far = sstep(4500, 10500, r);
      e += k * (amp * (1 + 0.7 * far) * Math.pow(ridged(x / 2500 - 3.3, z / 2500 + 2.2, 5), 1.3) + 240 * (fbm(x / 900 + 7, z / 900, 3) - 0.5)) + far * 1100;
    }
    // The Dragon's Back: the summit ridge behind the start is a row of rock towers (a serrated skyline),
    // the highest a little left of the col; a lone fang far down the valley.
    e = this.summitRidge(e, u, v);
    e = horn(e, x, z, START_X + 5200, 3400, 4200, 0.95, 0.7);
    e = horn(e, x, z, START_X + 2400, -3000, 3600, 0.9, 1.3);
    return e;
  }

  /** The serrated summit ridge across the top of the face: towers on a long crest behind the start. */
  summitRidge(e, u, v) {
    if (u > 40 || u < -700 || Math.abs(v) > 1100) return e;
    const behind = -u;
    // Main crest: about 60 m behind the col, rising toward both ends; towers along it.
    const crestU = -70 - 25 * Math.sin(v / 210);
    const du = u - crestU;
    const base = TOP + 70 + 0.12 * Math.abs(v) + 35 * noise1(v / 120, 51);
    // Towers: ridged noise along the crest, tall and sharp.
    const tw = 140 * Math.pow(ridged(v / 95 + 3.3, 0.7, 2), 2.4) * sstep(60, 160, Math.abs(v + 10));
    const top = base + tw;
    // Cross-section: steep both sides (rock), the face side meets the bowl.
    const prof = top - Math.abs(du) * (du > 0 ? 1.15 : 1.6) - Math.max(0, Math.abs(du) - 30) * 0.4;
    const k = sstep(-650, -250, -behind) * sstep(1100, 700, Math.abs(v));
    if (prof > e) e += (prof - e) * smooth((prof - e) / 40) * k;
    // The towers: a row of lobed rock horns along the crest (the dragon's dorsal plates), tallest just left of
    // the start; you see them serrate the sky behind you at the Shoulder.
    for (const [tv, th, sl, tw] of SUMMIT_TOWERS) e = horn(e, START_X + u, v, START_X - 175 - 25 * Math.sin(tv / 210) + 14 * Math.sin(tv), tv, TOP + th, sl, tw);
    return e;
  }

  /** Terrain without the snow details (no hits / pillows): the face and every ridge. */
  natural(x, z) {
    const u = x - START_X, v = z;
    let e = this.macro(x, z);
    if (Math.abs(x) > TILE.size * 0.5 + 60 || Math.abs(z) > TILE.size * 0.5 + 60) return e;
    // Low, long powder lumps (curvature radius ≳ 150 m at 30 m/s: they never throw you).
    e += (fbm(u / 90 + 3.1, v / 60, 3) - 0.5) * 1.8 + (vnoise(x / 13, z / 13) - 0.5) * 0.25;
    const rg = this.ridgesAt(u, v);
    e += rg;
    // Sluff runnels in the gullies: shallow fall-line grooves (the snow the ridges shed), only where no ridge is.
    const face = sstep(130, 220, u) * (1 - sstep(1650, 1800, u));
    if (face > 0 && rg < 3) e += face * (1 - rg / 3) * 0.9 * (Math.abs(noise1(v / 11 + 0.4 * noise1(u / 140, 61), 62) * 2 - 1) - 0.5);
    e += this.spineField(u, v);
    e += this.hits(u, v);
    e += this.pillowsAt(u, v);
    return e;
  }

  height(x, z) { return this.natural(x, z); }

  /** Smooth union of every ridge near u (each one: crest, flanks, steps, gaps, prow, lips). */
  ridgesAt(u, v) {
    const b = this.band[Math.floor(u / 20)];
    if (!b) return 0;
    let h = 0;
    for (const r of b) {
      const a = r.at(u, v);
      if (a > 0) h = smax(h, a, 4);
    }
    return h;
  }

  /** The Organ Pipes: a tight field of sharp spines and sluff channels (a triangle wave across the fall line). */
  spineField(u, v) {
    const S = SPINE_FIELD;
    if (u < S.u0 - 10 || u > S.u1 + 30 || v < S.v0 - 20 || v > S.v1 + 20) return 0;
    const env = sstep(S.u0 - 10, S.u0 + 60, u) * sstep(S.v0 - 20, S.v0 + 25, v) * (1 - sstep(S.v1 - 25, S.v1 + 20, v));
    if (env <= 0) return 0;
    const s = (v + S.wander * (noise1(u / 90, S.seed) * 2 - 1) + 4 * (noise1(u / 33, S.seed + 1) * 2 - 1)) / S.spacing;
    const i = Math.floor(s), f = s - i;
    const d = Math.abs(f - 0.5) * S.spacing;             // m from the crest
    const top = S.top;
    const x = (Math.sqrt(d * d + top * top) - top) / (S.spacing * 0.5);
    // Each spine has its own height and its own end: it drops off in a short cliff at its bottom.
    const hk = hash1(i * 13 + S.seed);
    const uEnd = S.u1 - 70 * hash1(i * 7 + 3);
    const H = S.height * env * (0.65 + 0.6 * hk) * (0.8 + 0.4 * noise1(u / 110, i + 40));
    const endF = u < uEnd ? 1 : 1 - smooth((u - uEnd) / Math.max(1.6, H * 0.12));
    const roll = u < uEnd && u > uEnd - 20 ? (1 - 0.1 * ((u - (uEnd - 20)) / 20) ** 2) : 1;
    return H * endF * roll * (Math.pow(Math.max(0, 1 - x), 1.5) - 0.12);
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

  pillowsAt(u, v) {
    let add = 0;
    for (const F of PILLOWS) {
      if (u < F.u0 - 10 || u > F.u1 + 10 || v < F.v0 - 10 || v > F.v1 + 10) continue;
      const env = sstep(F.u0 - 10, F.u0 + 20, u) * (1 - sstep(F.u1 - 20, F.u1 + 10, u)) * sstep(F.v0 - 10, F.v0 + 15, v) * (1 - sstep(F.v1 - 15, F.v1 + 10, v));
      if (env <= 0) continue;
      const G = (this.profileAt(u - 6) - this.profileAt(u + 6)) / 12;
      const S = F.step, f = (u + S * 1.3 * noise1(v / 16, F.seed) + S * 0.5 * noise1(v / 5.5, F.seed + 3)) / S;
      const fr = f - Math.floor(f);
      const tp = F.top;
      const s = fr < tp ? fr / tp - 0.12 * Math.sin(Math.PI * fr / tp) : 1 - smooth((fr - tp) / (1 - tp));
      const lobe = 0.35 + 0.65 * Math.pow(Math.cos(Math.PI * (v + 3 * noise1(u / 7, F.seed + 5)) / F.lobe), 2);
      add += env * G * S * F.terrace * lobe * (s - 0.5);
    }
    return add;
  }

  // ---------------------------------------------------------------- named features (scoring, HUD)
  /** The ridge whose crest region holds (u, v), or null: { ridge, d (m from the crest), H }. */
  ridgeAt(u, v, reach = 0.55) {
    const b = this.band[Math.floor(u / 20)];
    if (!b) return null;
    let best = null;
    for (const r of b) {
      if (u < r.u0 - 5 || u > r.u1 + 3) continue;
      const H = r.heightAt(u);
      if (H < 4) continue;
      const d = Math.abs(v - r.crestAt(u));
      if (d < r.widthAt(u) * reach && (!best || d < best.d)) best = { ridge: r, d, H };
    }
    return best;
  }

  /** Name of the feature a rider launched off at world (x, z), or null (player.js names drops with it). */
  featureAt(x, z) {
    const u = x - START_X, v = z;
    const hit = this.ridgeAt(u, v);
    if (hit) {
      const r = hit.ridge;
      for (const g of r.gaps) if (g.name && u > g.u - 30 && u < g.u + 4) return g.name;
      if (r.end === 'prow' && u > r.u1 - 30) return r.prowName;
      return r.name;
    }
    const S = SPINE_FIELD;
    if (u > S.u0 && u < S.u1 + 20 && v > S.v0 && v < S.v1) return 'The Organ Pipes';
    for (const F of PILLOWS) if (u > F.u0 && u < F.u1 && v > F.v0 && v < F.v1) return 'Pillow Tongues';
    for (const [hu, hv, L, , kind] of HITS) if (Math.abs(u - hu) < 20 && Math.abs(v - hv) < L) return kind === 'lip' ? 'Wind Lip' : 'Roller';
    if (u < 60) return 'The Col';
    return null;
  }

  roofAt() { return null; }

  /** Per-rider hooks (player.js): ridge-to-ridge hops score on their own (scoring.js), gullies drag (sluff.js). */
  onPlayer(pl) { attachRidgeScoring(this, pl); attachSluff(this, pl); }

  /**
   * How deep in a gully (x, z) is, 0..1: low (no ridge under you) with ridges standing on both sides within
   * ~70 m, on the ridged part of the face. The sluffed powder piles up there (sluff.js).
   */
  gullyAt(x, z) {
    const u = x - START_X;
    if (u < 150 || u > 1680) return 0;
    const here = this.ridgesAt(u, z);
    if (here > 5) return 0;
    let l = 0, r = 0;
    for (const d of [24, 46, 70]) { l = Math.max(l, this.ridgesAt(u, z - d)); r = Math.max(r, this.ridgesAt(u, z + d)); }
    return (1 - here / 5) * sstep(4, 12, Math.min(l, r));
  }

  // ---------------------------------------------------------------- scatter hooks (trees, rocks, cornices)
  forestAt(x, z) {
    const u = x - START_X;
    if (u < 1700) return 0;
    const n = fbm(x / 160, z / 160, 3);
    return sstep(1750, 2150, u) * sstep(0.45, 0.65, n);
  }

  pisteAt(x, z) {
    const u = x - START_X;
    return u > 1650 && this.lineDist(u, z) < 13 + 4 * (noise1(u / 41 + z / 57, 77) * 2 - 1) ? 1 : 0;
  }

  /** Cornices are visual only: keep them to the framing walls and the summit ridge, off every rideable crest. */
  corniceOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 45) return false;
    for (const d of this.dropZones) if (Math.hypot(x - d.x, z - d.z) < 160) return false;
    if (this.ridgeAt(u, z, 1.1)) return false;
    return u < -20 || Math.abs(z) > FACE.halfWidth(Math.max(0, u)) * 0.88;
  }

  /** Rock clusters stay off the lines, the drop zones and every ridge crest and gully floor. */
  rockOk(x, z) {
    const u = x - START_X;
    if (this.lineDist(u, z) < 24) return false;
    for (const d of this.dropZones) if (Math.hypot(x - d.x, z - d.z) < 45) return false;
    if (this.ridgeAt(u, z, 0.35)) return false;
    return true;
  }

  /** Distance (m, in u / v) to the nearest canonical line (layout.js RIDE_LINES); ≥ 32 reads as "far". */
  lineDist(u, v) {
    if (!this._lineHash) {
      const H = new Map();
      const add = (a, b) => { const k = Math.floor(a / 32) * 4096 + Math.floor(b / 32); let l = H.get(k); if (!l) H.set(k, (l = [])); l.push(a, b); };
      for (const L of Object.values(RIDE_LINES)) {
        const pts = this.linePoints(L);
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

  /**
   * A canonical line as [u, v] points every ≤ 10 m: waypoints are [u, v] or [u, '@ridgeId'] (that ridge's
   * crest at u; consecutive crest waypoints follow the crest between them).
   */
  linePoints(L) {
    // Resolve '>Hop' (the lip, then the landing is the next waypoint) and '@ridge' waypoints.
    const way = L.pts.flatMap((p) => (typeof p === 'string' ? (() => { const r = this.hopByName[p.slice(1)].spur; return [[r.u0, `@${r.id}`], [r.u1, `@${r.id}`]]; })() : [p]));
    // Keep u increasing (a hop's spur may start above the previous waypoint).
    for (let i = way.length - 2; i >= 0; i--) if (way[i][0] >= way[i + 1][0]) way.splice(i, 1);
    const pts = [];
    const vAt = (p, u) => (typeof p[1] === 'string' ? this.ridgeById[p[1].slice(1)].crestAt(u) : p[1]);
    for (let i = 0; i < way.length; i++) {
      const p = way[i], q = way[i + 1];
      if (!q) { pts.push([p[0], vAt(p, p[0])]); break; }
      const n = Math.max(1, Math.ceil((q[0] - p[0]) / 5));
      // From a crest waypoint, follow that crest and ease onto the next waypoint; otherwise a straight line.
      const off = vAt(q, q[0]) - vAt(p, q[0]);
      for (let k = 0; k < n; k++) {
        const u = p[0] + (q[0] - p[0]) * k / n, t = k / n;
        pts.push([u, typeof p[1] === 'string' ? vAt(p, u) + off * smooth(t) : vAt(p, p[0]) + (vAt(q, q[0]) - vAt(p, p[0])) * t]);
      }
    }
    return pts;
  }

  lobbySpot() { return { x: START_X + 10, z: -54, heading: -Math.PI / 2 - 0.1 }; }

  /**
   * Golden snowflakes (activities.js `course.challenge.flakes`): the hard spots. Over the middle of the big
   * gaps (you only get them flying the gap), on knife-edge crests, on the lips that start ridge-to-ridge hops,
   * at the top of the prows. [{ x, z, y above the snow }].
   */
  placeFlakes() {
    const H = (u, v) => this.height(START_X + u, v);
    const R = this.ridgeById;
    const on = (u, v, up = 1.2) => ({ x: START_X + u, z: v, y: up });
    const crest = (id, u, up = 1.1) => on(u, R[id].crestAt(u), up);
    // Over a gap: the flake floats on the take-off line, high enough above the notch floor that you only
    // pick it up in the air (at the crest's take-off height, a little below).
    const gap = (id, k) => {
      // On the flight line over the middle of the notch: the take-off's height, carried on down the crest's
      // slope at the lip (a rider leaves along it), less the fall of a ~25 m/s flight, ~1 m below the rider's
      // centre so it's picked up in the air (and nowhere near the notch floor).
      const r = R[id], g = r.gaps[k], u = g.u + g.N * 0.18 + g.L * 0.5, v = r.crestAt(u);
      const lipY = H(g.u - 1, r.crestAt(g.u - 1)), dydu = (H(g.u - 9, r.crestAt(g.u - 9)) - lipY) / 8;
      const du = u - (g.u - 1), t = du / 25;
      const y = lipY - dydu * du - 0.5 * 9.81 * t * t + 0.4;
      return on(u, v, Math.max(2, y - H(u, v)));
    };
    const lip = (name) => { const r = this.hopByName[name].spur; return on(r.u1 - 3, r.crestAt(r.u1 - 3), 1.6); };
    return [
      crest('blade', 220),             // the Blade's knife edge, high up
      gap('spine', 0),                 // over the Little Gap
      gap('spine', 1),                 // over the Spine's Gap
      gap('blade', 0),                 // over the Blade's Notch
      lip('Keel Leap'),                // the Keel Leap's lip
      lip('Twin Hop Back'),            // the hop back across the Twins
      lip('Stair Hop 2'),              // the second stair's launch lip
      crest('stair4', 1240),           // landed the last stair
      gap('knife', 0),                 // over the Knife's Notch
      crest('knife', 1500),            // the Knife's crest, low down
      crest('eastwall', 1610, 1.2),    // the East Wall's prow
      on(1720, -240),                  // the pillow tongues
    ];
  }

  /**
   * Challenge gates along the hero line (the Dragon's Spine line): on the crest between its steps and gaps, the
   * Fork, through the Organ Pipes and down the apron — stay high or pay +2 s a gate. [{ at, lateral, width }].
   */
  placeGates() {
    const gates = [];
    let at = 0;
    // Mid-segment on the crest (never right after a gap: you can't steer a flight, so the landing scatters a
    // few metres), the Fork, the Organ Pipes, the apron.
    const marks = [200, 390, 480, 720, 900, 1060, 1210, 1360, 1540, 1750, 1980, 2200];
    for (let i = 1, m = 0; i < this.path.length && m < marks.length; i++) {
      at += this.path[i].distanceTo(this.path[i - 1]);
      if (this.path[i].x - START_X >= marks[m]) { gates.push({ at, lateral: 0, width: marks[m] < 1150 ? 14 : 18 }); m++; }
    }
    return gates;
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
      // Wind-packed snow on convex crests (ridge tops, lips, prows): faster, harder landings.
      if (i > 2 && j > 2 && i < N - 3 && j < N - 3) {
        const lap = (hAt(i - 3, j) + hAt(i + 3, j) + hAt(i, j - 3) + hAt(i, j + 3) - 4 * heights[k]) / (9 * sp * sp);
        splat[k * 3] = Math.round(smooth((-lap - 0.035) / 0.07) * 0.6 * 255);
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

  /** The start: the col on the summit ridge, facing down the face. */
  spawnPoint() { return { x: START_X + 14, z: -30, heading: -Math.PI / 2 }; }
}

/** A pyramidal horn rising out of the terrain (Ravenspire's, lobed, with gullies down its faces). */
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

export { cliff };
