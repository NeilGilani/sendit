// Voltage Park — analytic park shapes (headless: no renderer imports).
//
//   Profile features: a 1D vertical profile y(a) (absolute world height) along a straight axis, level
//   across within a half-width hw(a), with raked snow sidewalls down to the base snow. Kickers, tables,
//   knuckles, landings, step-ups, hips, quarterpipes, rail mounds and on-ramps are all profiles, drawn
//   with a ProfileBuilder (a pen: lines, arcs, faces, an equivalent-fall-height landing, back to base).
//   Pipe features: a superpipe cross-section (flat bottom, transitions, near-vertical walls, decks) on
//   an axis that follows the base slope.
// Everything is ABOVE the base snow (terrain.features.heightAt only raises the ground), so the base
// terrain grid stays smooth and the features are drawn as their own meshes (props.js) from the same
// functions the physics uses.
import { smooth } from './noise.js';

const DEG = Math.PI / 180;
export const STEP = 0.25;                 // m between profile samples

// ------------------------------------------------------------------ profile builder
/**
 * new ProfileBuilder(base, { x, z, yaw }) — base(x, z) is the snow without features; the axis starts at
 * (x, z) and points along yaw (rad from +x toward +z). The pen starts on the snow at a = 0 following the
 * base slope. Angles are in degrees, + = rising along the axis.
 */
export class ProfileBuilder {
  constructor(base, { x, z, yaw = 0, hw = 3 }) {
    this.base = base; this.x = x; this.z = z;
    this.fx = Math.cos(yaw); this.fz = Math.sin(yaw);
    this.a = 0; this.y = this.baseAt(0); this.ang = this.baseAngle(0); this.hw = hw;
    this.pts = [[0, this.y, hw]];
    this.marks = {};
  }
  baseAt(a) { return this.base(this.x + this.fx * a, this.z + this.fz * a); }
  baseAngle(a) { return Math.atan2(this.baseAt(a + 1) - this.baseAt(a - 1), 2) / DEG; }
  push() { this.pts.push([this.a, this.y, this.hw]); }
  /** Mark the current pen position (lip, knuckle …) for the course (names, flakes, drop zones). */
  mark(name) { this.marks[name] = { a: this.a, y: this.y, ang: this.ang }; return this; }
  width(hw) { this.hw = hw; return this; }
  /** Raise / lower the pen without moving along (only at the very start: a raised start). */
  lift(dy) { this.y += dy; this.pts[this.pts.length - 1][1] = this.y; return this; }
  /** Follow the base slope (snow level + offset) for len m. */
  snow(len, offset = 0) {
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let i = 1; i <= n; i++) { this.a += len / n; this.y = this.baseAt(this.a) + offset; this.push(); }
    this.ang = this.baseAngle(this.a);
    return this;
  }
  /** Straight at the current angle (or `deg`). */
  line(len, deg = this.ang) {
    this.ang = deg;
    const n = Math.max(1, Math.ceil(len / STEP)), t = Math.tan(deg * DEG);
    for (let i = 1; i <= n; i++) { this.a += len / n; this.y += t * len / n; this.push(); }
    return this;
  }
  /** Straight at `deg` until the pen is `dy` above / below its height now (dy < 0 = down). */
  lineBy(dy, deg) { return this.line(Math.abs(dy / Math.tan(deg * DEG)), deg); }
  /** Circular arc of radius R from the current angle to `deg` (concave up when turning up). */
  arc(R, deg) {
    const a0 = this.ang * DEG, a1 = deg * DEG;
    const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) * R / (STEP * 0.6)));
    const up = a1 > a0;
    // Centre of the circle (a, y) and the point at slope angle θ.
    const cx = up ? this.a - R * Math.sin(a0) : this.a + R * Math.sin(a0);
    const cy = up ? this.y + R * Math.cos(a0) : this.y - R * Math.cos(a0);
    for (let i = 1; i <= n; i++) {
      const th = a0 + (a1 - a0) * i / n;
      this.a = up ? cx + R * Math.sin(th) : cx - R * Math.sin(th);
      this.y = up ? cy - R * Math.cos(th) : cy + R * Math.cos(th);
      this.push();
    }
    this.ang = deg;
    return this;
  }
  /** Where an arc of radius R from the pen to angle deg would end: { a, y }. */
  arcEnd(R, deg, a = this.a, y = this.y, ang = this.ang) {
    const a0 = ang * DEG, a1 = deg * DEG, up = a1 > a0;
    const cx = up ? a - R * Math.sin(a0) : a + R * Math.sin(a0), cy = up ? y + R * Math.cos(a0) : y - R * Math.cos(a0);
    return { a: up ? cx + R * Math.sin(a1) : cx - R * Math.sin(a1), y: up ? cy - R * Math.cos(a1) : cy + R * Math.cos(a1) };
  }
  /**
   * Keep going straight, then round into the base slope with radius R, ending on the snow; then `tail` m
   * more along the snow. Works both ways: a landing coming down onto the run-out (concave), a deck
   * rolling down to the snow behind a feature (convex).
   */
  toBase(R, tail = 4) {
    for (let guard = 0; guard < 4000; guard++) {
      const b = this.baseAngle(this.a + 6);
      const e = this.arcEnd(R, b);
      if (e.y <= this.baseAt(e.a) + 0.01) break;
      this.line(STEP);
    }
    this.arc(R, this.baseAngle(this.a + 6));
    return this.snow(tail, 0);
  }
  /**
   * The constant equivalent-fall-height landing (McNeil & Hubbard): for every take-off speed between
   * the one that just clears the knuckle and vMax, the landing surface meets the flight at an angle that
   * leaves only vn (m/s) of velocity into the slope (EFH = vn² / 2g). Flights include the game's air drag
   * and a design pop (m/s along the lip normal). The knuckle rounds over with radius Rk; the landing is
   * kept between minDeg and maxDeg (descending angles) and runs on straight for `extra` m past vMax.
   * lip = { a, y, ang } (take-off point and angle). Returns { vMin, vMax, sweet } and draws the pen.
   */
  efhLanding(lip, { vMax, vn = 3.6, popN = 1.2, drag = 0.0027, g = 9.81, Rk = 5, minDeg = 24, maxDeg = 36, extra = 10, outR = 28 }) {
    const th = lip.ang * DEG;
    const fly = (v) => {
      const pts = [];
      let a = lip.a, y = lip.y, va = v * Math.cos(th) - popN * Math.sin(th), vy = v * Math.sin(th) + popN * Math.cos(th);
      const h = 1 / 240;
      for (let t = 0; t < 8; t += h) {
        const s = Math.hypot(va, vy);
        va -= drag * s * va * h; vy -= (g + drag * s * vy) * h;
        a += va * h; y += vy * h;
        pts.push([a, y, va, vy]);
        if (y < lip.y - 80) break;
      }
      return pts;
    };
    // Crossing of a flight with the line through (a0, y0) at descending angle φ beyond a0.
    const cross = (pts, a0, y0, phi) => {
      const t = Math.tan(phi);
      let prev = null;
      for (const p of pts) {
        const d = p[1] - (y0 - (p[0] - a0) * t);
        if (p[0] > a0 && prev && prev.d > 0 && d <= 0) {
          const k = prev.d / (prev.d - d), q = prev.p;
          return [q[0] + (p[0] - q[0]) * k, q[1] + (p[1] - q[1]) * k, q[2] + (p[2] - q[2]) * k, q[3] + (p[3] - q[3]) * k];
        }
        prev = { p, d };
      }
      return null;
    };
    const surfAngle = (va, vy) => {
      const V = Math.hypot(va, vy), alpha = Math.atan2(vy, va);    // alpha < 0 descending
      const phi = -alpha - Math.asin(Math.min(0.99, vn / V));
      return Math.min(maxDeg * DEG, Math.max(minDeg * DEG, phi));
    };
    // The knuckle corner K is the pen now (end of the deck). vMin: the flight that passes through K.
    const K = { a: this.a, y: this.y };
    let lo = 2, hi = 60;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2, f = fly(m);
      // Where is the flight when it reaches a = K.a?
      let yAt = -1e9;
      for (let j = 1; j < f.length; j++) if (f[j][0] >= K.a) { const k = (K.a - f[j - 1][0]) / (f[j][0] - f[j - 1][0]); yAt = f[j - 1][1] + (f[j][1] - f[j - 1][1]) * k; break; }
      if (yAt > K.y) hi = m; else lo = m;
    }
    const vMin = (lo + hi) / 2;
    // March the landing in speed.
    let fK = fly(vMin), hitK = null;
    for (let j = 1; j < fK.length; j++) if (fK[j][0] >= K.a) { hitK = fK[j]; break; }
    let phi = surfAngle(hitK[2], hitK[3]);
    // Knuckle: round the corner between the deck and the landing (tangent length Rk·tan(Δ/2)).
    const deckAng = this.ang * DEG, dTurn = Math.abs(-phi - deckAng), tl = Rk * Math.tan(dTurn / 2);
    this.pts = this.pts.filter((p) => p[0] <= K.a - tl + 1e-6);
    const last = this.pts[this.pts.length - 1];
    this.a = last[0]; this.y = last[1];
    this.arc(Rk, -phi / DEG);
    this.mark('knuckle');
    const land = [];
    let S = { a: this.a, y: this.y };
    let sweet = null, vTop = vMin, short = false;
    for (let v = vMin + 0.05; v <= vMax; v += 0.05) {
      const c = cross(fly(v), S.a, S.y, phi);
      if (!c) continue;                                 // lands on the knuckle's roll-over: a faster flight next
      const nphi = surfAngle(c[2], c[3]);
      // Draw the straight piece S → c, then turn to the new angle there.
      land.push([c[0], c[1]]);
      S = { a: c[0], y: c[1] };
      phi = nphi;
      vTop = v;
      if (!sweet && v >= vMin + (vMax - vMin) * 0.35) sweet = { a: c[0], y: c[1], v };
      // The hill can't go below the snow: stop where the run-out transition would meet it.
      const e = this.arcEnd(outR, this.baseAngle(c[0] + 6), c[0], c[1], -phi / DEG);
      if (e.y <= this.baseAt(e.a) + 0.05) { short = true; break; }
    }
    for (const [a, y] of land) {
      const n = Math.max(1, Math.ceil((a - this.a) / STEP));
      const a0 = this.a, y0 = this.y;
      for (let i = 1; i <= n; i++) { this.a = a0 + (a - a0) * i / n; this.y = y0 + (y - y0) * i / n; this.push(); }
    }
    this.ang = -phi / DEG;
    this.mark('landingEnd');
    if (!short) this.line(extra);
    if (!sweet) sweet = { a: S.a - (S.a - K.a) * 0.4, y: S.y, v: (vMin + vTop) / 2 };
    this.sweet = sweet;
    return { vMin, vMax: vTop, vAsked: vMax, sweet, angle: phi / DEG, short };
  }
  /** Finish: resample to a uniform grid. */
  build(meta = {}) {
    const p = this.pts.slice().sort((u, v) => u[0] - v[0]);
    const a0 = p[0][0], a1 = p[p.length - 1][0];
    const n = Math.max(2, Math.floor((a1 - a0) / STEP + 1e-6) + 1);
    const Y = new Float32Array(n), W = new Float32Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const a = a0 + i * STEP;
      while (j < p.length - 2 && p[j + 1][0] < a) j++;
      const q = p[j], r = p[j + 1] || q;
      const k = r[0] > q[0] ? Math.min(1, Math.max(0, (a - q[0]) / (r[0] - q[0]))) : 0;
      Y[i] = q[1] + (r[1] - q[1]) * k;
      W[i] = q[2] + (r[2] - q[2]) * k;
    }
    return new ProfileFeature({ ...meta, x: this.x, z: this.z, fx: this.fx, fz: this.fz, a0, Y, W, marks: this.marks });
  }
}

// ------------------------------------------------------------------ profile feature
export class ProfileFeature {
  constructor({ name, kind = 'profile', x, z, fx, fz, a0, Y, W, rake = 1.15, minRun = 0.9, marks = {}, lane = null, vert = null, solid = false, color = null, side = null }) {
    Object.assign(this, { name, kind, x, z, fx, fz, a0, Y, W, rake, minRun, marks, lane, vert, solid, color });
    // Optional side profile: beyond hwc of the axis the deck follows side.Y instead (a table's ride-up ramp
    // beside its kicker), blended over side.blend m. side.Y uses this feature's grid (same a0, STEP).
    this.side = side;
    this.rx = -fz; this.rz = fx;                      // right of the axis
    this.len = (Y.length - 1) * STEP;
    let hmax = 0;
    for (let i = 0; i < Y.length; i++) hmax = Math.max(hmax, W[i]);
    this.maxHw = hmax;
    // Reach across: deck + sidewalls (sidewall run ≤ rake · 14 m of height).
    const reach = hmax + Math.max(minRun, 16 * rake) + 1;
    const xs = [], zs = [];
    for (const a of [a0, a0 + this.len]) for (const b of [-reach, reach]) { xs.push(x + fx * a + this.rx * b); zs.push(z + fz * a + this.rz * b); }
    this.box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
    this.reach = reach;
  }
  /** World x/z of axis point a, lateral b. */
  world(a, b = 0) { return [this.x + this.fx * a + this.rx * b, this.z + this.fz * a + this.rz * b]; }
  /** (a, b) of a world point. */
  local(x, z) { const dx = x - this.x, dz = z - this.z; return [dx * this.fx + dz * this.fz, dx * this.rx + dz * this.rz]; }
  /** Deck height on the axis at a (null outside). */
  yAt(a, Y = this.Y) {
    const f = (a - this.a0) / STEP;
    if (f < 0 || f > Y.length - 1) return null;
    const i = Math.min(Y.length - 2, f | 0), k = f - i;
    return Y[i] + (Y[i + 1] - Y[i]) * k;
  }
  /** Deck height at (a, |b|) including the side profile (null outside the axis range). */
  deckAt(a, b) {
    const y = this.yAt(a);
    if (y === null || !this.side || b <= this.side.hwc) return y;
    const ys = this.yAt(a, this.side.Y);
    return y + (ys - y) * smooth((b - this.side.hwc) / this.side.blend);
  }
  hwAt(a) {
    const f = Math.min(Math.max((a - this.a0) / STEP, 0), this.W.length - 1);
    const i = Math.min(this.W.length - 2, f | 0), k = f - i;
    return this.W[i] + (this.W[i + 1] - this.W[i]) * k;
  }
  /** Surface height at world (x, z) over the base snow `base` there, or null. */
  at(x, z, base) {
    if (x < this.box[0] || x > this.box[1] || z < this.box[2] || z > this.box[3]) return null;
    const dx = x - this.x, dz = z - this.z;
    const a = dx * this.fx + dz * this.fz;
    const b = Math.abs(dx * this.rx + dz * this.rz), hw = this.hwAt(a);
    const y = this.deckAt(a, Math.min(b, hw));
    if (y === null) return null;
    const H = y - base;
    if (H <= 0) return null;
    if (b <= hw) return y;
    const run = a < (this.thinUntil ?? -1e9) ? 0.3 : Math.max(this.minRun, H * this.rake);   // scaffold ramps: sheer edges
    if (b >= hw + run) return null;
    return base + H * (1 - smooth((b - hw) / run));
  }
  /** Slope (deg, + rising) of the deck along the axis at a. */
  angleAt(a) { const y0 = this.yAt(a - 0.3), y1 = this.yAt(a + 0.3); return y0 === null || y1 === null ? 0 : Math.atan2(y1 - y0, 0.6) / DEG; }
}

// ------------------------------------------------------------------ superpipe
/**
 * A superpipe (or, with sides: [1] / [-1], a single quarterpipe wall along the axis) on the base slope:
 * flat bottom half-width F, transitions of radius R up to vertDeg, then that angle up to the wall height
 * H, a level deck D wide, an outer bank down to the snow. The walls grow in over `entry` m at the top.
 * The floor is the base snow on the axis (level across).
 */
export class PipeFeature {
  constructor({ name, x, z, yaw = 0, length, F = 3.5, R = 7, H = 6.7, vertDeg = 82, D = 6, bankDeg = 32, entry = 14, exit = 6, sides = [-1, 1], base }) {
    Object.assign(this, { name, kind: 'pipe', x, z, length, F, R, H, D, sides, entry, exit, base });
    this.fx = Math.cos(yaw); this.fz = Math.sin(yaw); this.rx = -this.fz; this.rz = this.fx;
    this.vert = vertDeg * DEG; this.bank = bankDeg * DEG;
    this.tR = R * Math.sin(this.vert);                       // horizontal run of the curved transition
    this.yR = R - R * Math.cos(this.vert);                   // its height
    this.wallRun = this.tR + Math.max(0, H - this.yR) / Math.tan(this.vert);
    this.outer = F + this.wallRun + D + H / Math.tan(this.bank);
    const xs = [], zs = [];
    for (const a of [0, length]) for (const b of [-this.outer - 1, this.outer + 1]) { xs.push(x + this.fx * a + this.rx * b); zs.push(z + this.fz * a + this.rz * b); }
    this.box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  }
  world(a, b = 0) { return [this.x + this.fx * a + this.rx * b, this.z + this.fz * a + this.rz * b]; }
  local(x, z) { const dx = x - this.x, dz = z - this.z; return [dx * this.fx + dz * this.fz, dx * this.rx + dz * this.rz]; }
  /** Height above the floor at lateral distance t from the axis (≥ 0), wall scale k. */
  cross(t) {
    const F = this.F, H = this.H;
    if (t <= F) return 0;
    const u = t - F;
    if (u <= this.tR) return this.R - Math.sqrt(Math.max(0, this.R * this.R - u * u));
    if (u <= this.wallRun) return Math.min(H, this.yR + (u - this.tR) * Math.tan(this.vert));
    const w = u - this.wallRun;
    if (w <= this.D) return H;
    return Math.max(0, H - (w - this.D) * Math.tan(this.bank));
  }
  /** Wall scale along the axis: grows in at the top, fades at the bottom. */
  scale(a) { return smooth(a / this.entry) * (1 - smooth((a - (this.length - this.exit)) / this.exit)); }
  floorAt(a) { const [x, z] = this.world(a, 0); return this.base(x, z); }
  at(x, z, base) {
    if (x < this.box[0] || x > this.box[1] || z < this.box[2] || z > this.box[3]) return null;
    const [a, b] = this.local(x, z);
    if (a < 0 || a > this.length) return null;
    const side = b >= 0 ? 1 : -1;
    if (!this.sides.includes(side)) return null;
    const t = Math.abs(b);
    if (t > this.outer) return null;
    const h = this.cross(t) * this.scale(a);
    if (h <= 0) return null;
    const y = this.floorAt(a) + h;
    return y > base ? y : null;
  }
  /** Horizontal unit normal of the wall at (x, z) pointing back into the pipe if it is on a wall steeper than minDeg, else null. */
  wallNormal(x, z, minDeg = 55) {
    const [a, b] = this.local(x, z);
    if (a < 0 || a > this.length) return null;
    const side = b >= 0 ? 1 : -1, t = Math.abs(b) - this.F;
    if (!this.sides.includes(side) || t <= 0 || t > this.wallRun + 0.6) return null;
    const ang = t <= this.tR ? Math.asin(Math.min(1, t / this.R)) : this.vert;
    if (ang < minDeg * DEG || this.scale(a) < 0.6) return null;
    return [-this.rx * side, -this.rz * side];
  }
}

// ------------------------------------------------------------------ index
/** Spatial hash over feature bounding boxes (16 m cells). */
export class FeatureIndex {
  constructor(features, cell = 16) {
    this.cell = cell; this.map = new Map(); this.all = features;
    for (const f of features) {
      const [x0, x1, z0, z1] = f.box;
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
        const k = i * 65536 + j;
        let l = this.map.get(k);
        if (!l) this.map.set(k, (l = []));
        l.push(f);
      }
    }
  }
  near(x, z) { return this.map.get(Math.floor(x / this.cell) * 65536 + Math.floor(z / this.cell)) || null; }
  /** Highest feature surface at (x, z) above `base`, or null. */
  height(x, z, base) {
    const l = this.near(x, z);
    if (!l) return null;
    let best = null;
    for (const f of l) { const y = f.at(x, z, base); if (y !== null && (best === null || y > best)) best = y; }
    return best;
  }
  /** The feature whose surface is highest at (x, z), or null. */
  featureAt(x, z, base) {
    const l = this.near(x, z);
    if (!l) return null;
    let best = null, by = base + 0.05;
    for (const f of l) { const y = f.at(x, z, base); if (y !== null && y > by) { by = y; best = f; } }
    return best;
  }
}
