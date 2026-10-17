// Dragonback — the ridge primitive. A ridge is a fall-line arête: a crest path v(u) with a height above the
// face H(u), a flank foot half-width W(u) and a crest-top half-width (knife edge → broad back). Across it the
// profile is concave: H · (1 − x)^p with x = (√(d² + top²) − top) / W, so the flanks are steepest just under
// the crest and ease into the gully (a rider who leaves the crest sideways lands on a slope that falls away
// as fast as they do). Along it, the crest carries
//   • steps   gendarme step-downs: the crest flattens into a lip that rolls over (Ravenspire's cliff() shape,
//             so the take-off points down the landing) and drops D m;
//   • gaps    notches: a short steep wall down N m, a floor L m long, a long gentle far wall climbing back to
//             a crest S m lower than the take-off (come up short and you land on a gentle wall, not a face);
//   • lips    wind lips on the crest's edge, aimed sideways and down at the neighbouring ridge;
//   • a prow  the ridge's bottom end: a cliff of the ridge's full height (rolled lip, then the face below).
// Everything is tabulated per metre of u at construction, so at() is a table lookup plus a few flops.
import { smooth, sstep, noise1 } from '../ravenspire/noise.js';

const LIP_ROLL = 0.2, LIP_ROLL_LEN = 24;     // Ravenspire's lip roll-over (slope, metres)
const GAP_KICK = 1.4;                        // m: the wind-lip kick at a notch's take-off

/**
 * A cliff at `uc` of height h with a bench of length L above it (Ravenspire's shape): the approach
 * flattens, its last metres roll back over, then a near-vertical face drops h onto the unchanged slope.
 * Returns the height added at u.
 */
export function cliff(u, uc, h, L) {
  const wF = Math.max(1.4, h * 0.11);
  if (u >= uc) return u > uc + wF ? 0 : h * (1 - smooth((u - uc) / wF));
  const t = (u - (uc - L)) / L;
  if (t <= 0) return 0;
  const Lr = Math.min(L * 0.5, LIP_ROLL_LEN), drop = Lr * LIP_ROLL / 2;
  const s = Math.max(0, (u - (uc - Lr)) / Lr);
  return (h + drop) * Math.pow(t, 1.25) - drop * s * s;
}

/** Polynomial smooth max (k = blend width in metres). */
export function smax(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.max(a, b) + h * h * k * 0.25;
}

/**
 * The crest position at u: a Catmull-Rom spline through the knots (tangents from the neighbours, secants at the
 * ends), so a ridge keeps its heading through a knot and a two-knot spur is a straight line at its angle.
 */
function crestKnot(K, u) {
  if (u <= K[0][0]) return K[0][1];
  const n = K.length;
  if (u >= K[n - 1][0]) return K[n - 1][1];
  let i = 0;
  while (i < n - 2 && u > K[i + 1][0]) i++;
  const slope = (j) => {
    const a = K[Math.max(0, j - 1)], b = K[Math.min(n - 1, j + 1)];
    return (b[1] - a[1]) / (b[0] - a[0]);
  };
  const [u0, v0] = K[i], [u1, v1] = K[i + 1], h = u1 - u0, t = (u - u0) / h;
  const m0 = slope(i) * h, m1 = slope(i + 1) * h;
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
}

/** Interpolate knot column `c` at u (smoothstep between knots, clamped at the ends). */
function knotAt(K, u, c) {
  if (u <= K[0][0]) return K[0][c];
  for (let i = 0; i < K.length - 1; i++) {
    if (u <= K[i + 1][0]) { const t = smooth((u - K[i][0]) / (K[i + 1][0] - K[i][0])); return K[i][c] + (K[i + 1][c] - K[i][c]) * t; }
  }
  return K[K.length - 1][c];
}

export class Ridge {
  constructor(def) {
    Object.assign(this, { top: 4, p: 1.8, asym: 1, rise: 0, end: 'fade', kick: 2.5, wander: 3.5, steps: [], gaps: [], lips: [], seed: 1 }, def);
    const K = this.knots;
    this.u0 = K[0][0];
    this.u1 = K[K.length - 1][0];
    this.head = this.rise > 0 ? 0 : 40;          // a ridge from the summit ridge blends back into it
    this.tail = this.end === 'fade' ? 0 : 4;
    this.prowName = def.prowName ?? `${this.name} Prow`;
    this.gaps = this.gaps.map(([u, N, L, S, name, kick]) => ({ u, N, L, S, kick: kick ?? GAP_KICK, name: name ?? `${this.name}'s Notch` }));
    this.lips = this.lips.map(([u, side, h]) => ({ u, side, h }));
    this.steps = this.steps.map(([u, D]) => ({ u, D }));
    // Tables per metre over [u0 − head, u1 + tail + 2].
    this.t0 = Math.floor(this.u0 - this.head);
    const n = Math.ceil(this.u1 + this.tail + 3) - this.t0;
    this.tv = new Float32Array(n); this.tH = new Float32Array(n); this.tW = new Float32Array(n); this.tTop = new Float32Array(n); this.tCos = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const u = this.t0 + i;
      // The crest wanders a few metres (it is never a ruler line).
      this.tv[i] = crestKnot(K, u) + this.wander * (noise1(u / 60, this.seed + 70) * 2 - 1);
      this.tW[i] = knotAt(K, u, 3);
      this.tTop[i] = this.top * (0.85 + 0.3 * noise1(u / 45, this.seed + 80));
      this.tH[i] = this.crestHeight(u);
    }
    for (let i = 0; i < n; i++) {
      const a = this.tv[Math.max(0, i - 3)], b = this.tv[Math.min(n - 1, i + 3)];
      const slope = (b - a) / (Math.min(n - 1, i + 3) - Math.max(0, i - 3));
      this.tCos[i] = 1 / Math.sqrt(1 + slope * slope);
    }
    // Lips: centre on the crest's edge, aimed 30° off the fall line toward their side.
    const lips = this.lips;
    this.lips = [];
    for (const l of lips) this.addLip({ u: l.u, side: l.side, h: l.h, aim: 0.55 });
  }

  /**
   * A wind lip on the crest's edge at u, on `side`, aimed `aim` rad off the fall line toward that side (or at
   * a point: to = [u, v]). Returns the lip ({ u, v, du, dv, h, name }).
   */
  addLip({ u, side, h, aim = 0.55, to = null, name = null }) {
    const v = this.crestAt(u) + side * (this.topAt(u) + 2.5);
    let du = Math.cos(aim), dv = Math.sin(aim) * side;
    if (to) { const a = to[0] - u, b = to[1] - v, n = Math.hypot(a, b); du = a / n; dv = b / n; }
    const lip = { u, v, side, h, du, dv, name };
    this.lips.push(lip);
    return lip;
  }

  /** Crest height above the face at u (knots + gendarme steps − gaps, faded in at the top, prow at the end). */
  crestHeight(u) {
    let H = knotAt(this.knots, u, 2) * (0.92 + 0.16 * noise1(u / 70, this.seed + 60));
    for (const s of this.steps) H += cliff(u, s.u, s.D, Math.max(30, s.D * 4));
    for (const g of this.gaps) {
      // The take-off: a bench S m high (the far crest is S lower) with NO roll-over — a cliff's rolled lip
      // points you down at the landing below it, but over a notch it dives you into the far wall — and a
      // small wind-lip kick (≈ 8° over the last ~10 m) so a 20+ m/s rider clears the notch without a pop.
      const Lb = Math.max(30, g.S * 4);
      if (u < g.u && u > g.u - Lb) H += g.S * Math.pow((u - (g.u - Lb)) / Lb, 1.25) + g.kick * Math.exp(-(((u - g.u) / 5) ** 2));
      else if (u >= g.u && u < g.u + 2) H += (g.S + g.kick) * (1 - smooth((u - g.u) / 2));
      const wN = Math.max(2, g.N * 0.18), Lf = Math.max(12, g.N * 1.4);
      const a = g.u, b = a + wN, c = b + g.L, d = c + Lf;
      let k = 0;
      if (u > a && u < b) k = smooth((u - a) / wN);
      else if (u >= b && u <= c) k = 1;
      else if (u > c && u < d) k = 1 - smooth((u - c) / Lf);
      H -= g.N * k;
    }
    if (this.rise > 0) H *= sstep(this.u0, this.u0 + this.rise, u);
    else H *= sstep(this.u0 - 40, this.u0, u);
    if (this.end === 'prow') {
      // A ridge-end cliff: the crest rolls over (the take-off points down the landing), then drops.
      const h = Math.max(0, H);
      const Lr = 20, drop = Lr * LIP_ROLL / 2;
      if (u > this.u1 - Lr && u <= this.u1) { const s = (u - (this.u1 - Lr)) / Lr; H -= drop * s * s; }
      const wF = Math.max(1.6, h * 0.11);
      if (u > this.u1) H = u > this.u1 + wF ? 0 : (H - drop) * (1 - smooth((u - this.u1) / wF));
    } else if (this.end === 'kicker') {
      // A hop spur's end: a wind lip on the crest kicks you up and out (≈ 10–12° above the crest over its
      // last ~12 m), then the end of the spur drops away under you.
      const h = Math.max(0, H);
      if (u <= this.u1) H += this.kick * Math.exp(-(((u - this.u1) / 7) ** 2));
      const wF = Math.max(1.6, h * 0.11);
      if (u > this.u1) H = u > this.u1 + wF ? 0 : (H + this.kick) * (1 - smooth((u - this.u1) / wF));
    } else {
      H *= 1 - sstep(this.u1 - 80, this.u1, u);
    }
    return Math.max(0, H);
  }

  _i(u) { return Math.min(Math.max(u - this.t0, 0), this.tv.length - 1.0001); }
  _get(T, u) { const f = this._i(u), i = f | 0, k = f - i; return T[i] + (T[i + 1] - T[i]) * k; }
  crestAt(u) { return this._get(this.tv, u); }
  heightAt(u) { return this._get(this.tH, u); }
  widthAt(u) { return this._get(this.tW, u); }
  topAt(u) { return this._get(this.tTop, u); }

  /** Height this ridge adds at (u, v) (0 outside it). */
  at(u, v) {
    if (u < this.t0 || u > this.t0 + this.tv.length - 1.01) return 0;
    const f = u - this.t0, i = f | 0, k = f - i;
    const H = this.tH[i] + (this.tH[i + 1] - this.tH[i]) * k;
    let lip = 0;
    for (const l of this.lips) lip += this.lipAt(l, u, v);
    if (H <= 0.01 && lip === 0) return 0;
    const vc = this.tv[i] + (this.tv[i + 1] - this.tv[i]) * k;
    const W0 = this.tW[i] + (this.tW[i + 1] - this.tW[i]) * k;
    const dv = v - vc;
    const W = dv < 0 ? W0 / Math.sqrt(this.asym) : W0 * Math.sqrt(this.asym);
    const top = this.tTop[i];
    const d = Math.abs(dv) * this.tCos[i];
    if (d > W + top + 1) return lip;
    const x = (Math.sqrt(d * d + top * top) - top) / W;
    if (x >= 1) return lip;
    // Rock fluting down the flanks: shallow ribs and runnels a few metres apart (never on the crest top, gone at
    // the foot), so the flanks read as rock buttresses instead of smooth tents.
    const flank = x > 0.05 ? Math.sin(Math.PI * Math.min(1, (x - 0.05) / 0.9)) : 0;
    const flute = flank > 0 ? flank * Math.min(2.2, 0.07 * H) * (noise1(d / 7.5 + u / 90 + (dv < 0 ? 17 : 0), this.seed + 90) - 0.5) * 2 : 0;
    return H * Math.pow(1 - x, this.p) + flute + lip;
  }

  /**
   * A wind lip on the crest's edge: a ramp rising h over ~14 m along its aim (across the crest edge and down),
   * then an abrupt 2.5 m drop; ±9 m wide. It sits on top of the ridge.
   */
  lipAt(l, u, v) {
    const a = (u - l.u) * l.du + (v - l.v) * l.dv;          // along the aim
    const c = -(u - l.u) * l.dv + (v - l.v) * l.du;         // across it
    if (a < -16 || a > 4 || Math.abs(c) > 11) return 0;
    const lat = 1 - sstep(6, 11, Math.abs(c));
    const along = a < 0 ? Math.exp(-((a / 8) ** 2)) : Math.exp(-((a / 1.6) ** 2));
    return l.h * along * lat;
  }
}
