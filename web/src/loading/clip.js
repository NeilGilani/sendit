// A saved highlight (thrill/clipcodec.js) as a loading-scene shot. The trick is replayed exactly as it was
// ridden — every rig node's recorded transform — on a slope rebuilt from the real mountain's own snow
// heights around the line (the clip's patch), so the take-off, the flight and the touchdown line up to the
// centimetre: nothing floats or sinks. The real map can't run in the worker (it is the whole game), so the
// loading scene's made-up range surrounds the patch: the clip's coordinates are moved so the take-off
// sits at the scene's origin and the take-off → touchdown direction runs down −Z (the direction every
// hero camera move expects), and the scene's height function takes the patch inside it, a plane fitted to
// the patch just outside it, and the scene's own mountains beyond.
//
//   prepareClip(clip)      → { xf (map ↔ scene transform), local(x, z), clear(x, z), box, mesh axes, trees }
//   ClipShot               the Shot interface (choreo.js) for camera planning, driving the recorded rig
import * as THREE from 'three';
import { NODE_STRIDE, airSpan, patchHeight } from '../thrill/clipcodec.js';
import { HEAD_SCALE } from '../character/index.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3();

/** Root (node 0) world position of frame i (the clip is recorded in map coordinates). */
const rootAt = (clip, i, out) => { const o = i * clip.keys.length * NODE_STRIDE; return out.set(clip.frames[o], clip.frames[o + 1], clip.frames[o + 2]); };

/**
 * The map → scene transform and the ground for the loading scene's height function.
 * Throws when the clip has no usable trick (no air, no patch): the caller falls back to a made-up shot.
 */
export function prepareClip(clip) {
  if (!clip?.patch || !clip.frames || clip.n < 8) throw new Error('clip: nothing to replay');
  const fps = clip.fps;
  const hint = Number.isFinite(clip.meta?.land) ? Math.round(clip.meta.land * fps) : null;
  const span = airSpan(clip.air, fps, hint);
  if (!span || span.i1 - span.i0 < 3) throw new Error('clip: no air');
  const i0 = Math.max(0, span.i0 - 1), i1 = Math.min(clip.n - 1, span.i1);
  const o = rootAt(clip, i0, new THREE.Vector3()), l = rootAt(clip, i1, new THREE.Vector3());
  let dx = l.x - o.x, dz = l.z - o.z;
  if (Math.hypot(dx, dz) < 0.5) {   // straight up and down (a pole jam, a hop): use the in-run direction
    const a = rootAt(clip, Math.max(0, i0 - 10), new THREE.Vector3());
    dx = o.x - a.x; dz = o.z - a.z;
  }
  const theta = Math.PI - Math.atan2(dx, dz);
  const c = Math.cos(theta), s = Math.sin(theta);
  const xf = {
    theta, origin: o.clone(),
    // map → scene
    toScene: (x, y, z, out = new THREE.Vector3()) => { const px = x - o.x, pz = z - o.z; return out.set(px * c + pz * s, y - o.y, -px * s + pz * c); },
    // scene → map (x, z only)
    toMap: (x, z) => [x * c - z * s + o.x, x * s + z * c + o.z],
  };
  const P = clip.patch;
  const px1 = P.x0 + (P.nx - 1) * P.step, pz1 = P.z0 + (P.nz - 1) * P.step;
  const edge = (mx, mz) => Math.min(mx - P.x0, px1 - mx, mz - P.z0, pz1 - mz);   // < 0 outside
  // A plane through the patch (least squares, scene coordinates): what the slope does beyond it.
  let sxx = 0, sxz = 0, szz = 0, sx = 0, sz = 0, sn = 0, sxy = 0, szy = 0, sy = 0;
  const stepI = Math.max(1, Math.floor(Math.min(P.nx, P.nz) / 24));
  for (let j = 0; j < P.nz; j += stepI) for (let i = 0; i < P.nx; i += stepI) {
    const p = xf.toScene(P.x0 + i * P.step, P.h[j * P.nx + i], P.z0 + j * P.step, _v);
    sxx += p.x * p.x; sxz += p.x * p.z; szz += p.z * p.z; sx += p.x; sz += p.z; sn++; sxy += p.x * p.y; szy += p.z * p.y; sy += p.y;
  }
  const plane = solve3([[sxx, sxz, sx], [sxz, szz, sz], [sx, sz, sn]], [sxy, szy, sy]) || [0, 0.25, 0];
  // Bounds of the patch and of the ridden line in scene coordinates.
  const box = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const [mx, mz] of [[P.x0, P.z0], [px1, P.z0], [P.x0, pz1], [px1, pz1]]) {
    const p = xf.toScene(mx, 0, mz, _v);
    box.x0 = Math.min(box.x0, p.x); box.x1 = Math.max(box.x1, p.x); box.z0 = Math.min(box.z0, p.z); box.z1 = Math.max(box.z1, p.z);
  }
  const line = [];
  for (let i = 0; i < clip.n; i += 2) { const p = rootAt(clip, i, _v); const q = xf.toScene(p.x, p.y, p.z, new THREE.Vector3()); line.push(q); }
  const lbox = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of line) { lbox.x0 = Math.min(lbox.x0, p.x); lbox.x1 = Math.max(lbox.x1, p.x); lbox.z0 = Math.min(lbox.z0, p.z); lbox.z1 = Math.max(lbox.z1, p.z); }
  const FADE = Math.min(16, P.step * (Math.min(P.nx, P.nz) - 1) * 0.3);
  const planeY = (x, z) => plane[0] * x + plane[1] * z + plane[2];
  /** Scene ground near the line: the patch inside, eased into the fitted plane over its last FADE m. */
  const local = (x, z, detail) => {
    const [mx, mz] = xf.toMap(x, z);
    const e = edge(mx, mz);
    const pl = planeY(x, z);
    // Outside: the plane, rolling a little (the scene's own detail noise), falling gently away to the sides.
    const out = pl + (detail ? detail(x, z) : 0) * smooth(0, 30, -e) - 0.12 * Math.max(0, -e - 25);
    if (e <= 0) return out;
    const w = smooth(0, FADE, e);
    return out + (patchHeight(P, mx, mz) - o.y - out) * w;
  };
  /** Horizontal distance to the ridden line (keeps the made-up trees off it). */
  const clear = (x, z) => { let d = Infinity; for (const p of line) d = Math.min(d, (p.x - x) ** 2 + (p.z - z) ** 2); return Math.sqrt(d); };
  const inPatch = (x, z) => { const [mx, mz] = xf.toMap(x, z); return edge(mx, mz) > 0; };
  // The near grid: a dense even core over the line (≤ 0.6 m cells), growing out to the grid edge.
  const core = { x0: Math.max(-60, lbox.x0 - 22), x1: Math.min(60, lbox.x1 + 22), z0: Math.max(-140, lbox.z0 - 18), z1: Math.min(90, lbox.z1 + 18) };
  const trees = (clip.trees || []).filter((t) => t[3] === 'tree').map((t) => { const p = xf.toScene(t[0], 0, t[1], new THREE.Vector3()); return [p.x, p.z, t[2]]; });
  return { xf, local, clear, inPatch, box, lbox, core, plane, trees, span, i0, i1 };
}

function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < 3; c++) {
    let p = c;
    for (let r = c + 1; r < 3; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-9) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < 3; r++) if (r !== c) { const f = m[r][c] / m[c][c]; for (let k = c; k < 4; k++) m[r][k] -= f * m[c][k]; }
  }
  return [m[0][3] / m[0][0], m[1][3] / m[1][1], m[2][3] / m[2][2]];
}

/**
 * Axis for the near grid: an even core [c0, c1] at `step`, then cells growing geometrically to [lo, hi].
 * n vertices in all (the core gets what it needs, the rest is split by length).
 */
export function makeAxis(n, lo, hi, c0, c1, step) {
  let m = Math.ceil((c1 - c0) / step) + 1;
  if (m > n - 20) { m = n - 20; step = (c1 - c0) / (m - 1); }
  const rest = n - m, Lb = c0 - lo, La = hi - c1;
  const nb = Math.max(4, Math.round(rest * Lb / (Lb + La))), na = Math.max(4, rest - nb);
  const side = (k, L) => {
    // positions step·… growing: x_i = L·(i/k)^p with the first cell ≈ step
    const p = Math.max(1, Math.log(step / L) / Math.log(1 / k));
    return Array.from({ length: k }, (_, i) => L * Math.pow((i + 1) / k, p));
  };
  const a = [];
  const before = side(nb, Lb).reverse();
  for (const d of before) a.push(c0 - d);
  for (let i = 0; i < m; i++) a.push(c0 + i * step);
  for (const d of side(na, La)) a.push(c1 + d);
  return Float32Array.from(a.slice(0, n));
}

/** Maps clip node keys to the nodes of a rig built here (by key; unmatched nodes are left alone). */
export function mapNodes(keys, root, nodeKeys) {
  const mine = [];
  root.traverse((o) => mine.push(o));
  const myKeys = nodeKeys(root);
  const byKey = new Map(myKeys.map((k, i) => [k, mine[i]]));
  const map = keys.map((k) => byKey.get(k) || null);
  return { map, matched: map.filter(Boolean).length, total: keys.length };
}

export class ClipShot {
  /**
   * @param {object} o
   * @param clip      decoded clip (thrill/clipcodec.js)
   * @param prep      prepareClip(clip)
   * @param nodes     mapNodes(...).map: clip node index → rig node (or null)
   * @param rider     the scene's Rider (bones.pelvis for the centre of mass)
   * @param group     the Group holding rider.root, carrying the map → scene transform
   * @param H         scene height function
   */
  constructor({ clip, prep, nodes, rider, group, H }) {
    Object.assign(this, { clip, prep, nodes, rider, group, H });
    this.isClip = true;
    const fps = clip.fps;
    this.fps = fps;
    this.t0c = prep.span.takeoff;                  // clip time of the take-off (real t = 0)
    this.Ta = prep.span.land - prep.span.takeoff;   // air time
    this.tStart = -this.t0c;
    this.tEnd = (clip.n - 1) / fps - this.t0c;
    this.fpFix = !!clip.meta?.fp;
    // Slow motion in the air, deeper for short airs (a 0.6 s air at 0.3× is over before you see it).
    this.slow = Math.min(0.5, Math.max(0.26, 0.85 / Math.max(0.6, this.Ta + 0.6)));
    // Centre of mass (pelvis) and feet (root) per frame, in scene coordinates.
    const n = clip.n;
    this.comT = new Float32Array(n * 3);
    this.feetT = new Float32Array(n * 3);
    group.updateMatrixWorld(true);
    const pel = rider.bones?.pelvis;
    for (let i = 0; i < n; i++) {
      this.apply(i / fps);
      rider.root.updateMatrixWorld(true);
      const c = pel ? pel.getWorldPosition(_v) : rider.root.getWorldPosition(_v);
      this.comT.set([c.x, c.y, c.z], i * 3);
      const f = rider.root.getWorldPosition(_v);
      this.feetT.set([f.x, f.y, f.z], i * 3);
    }
    this.apex = new THREE.Vector3(-1e9, -1e9, -1e9);
    for (let i = prep.span.i0; i < prep.span.i1; i++) if (this.comT[i * 3 + 1] > this.apex.y) this.apex.set(this.comT[i * 3], this.comT[i * 3 + 1], this.comT[i * 3 + 2]);
    if (this.apex.y < -1e8) this.com(this.Ta / 2, this.apex);
    this.mid = this.com(this.Ta / 2, new THREE.Vector3());
    this.pLand = this.com(this.Ta, new THREE.Vector3());
    const lip = this.feet(0, new THREE.Vector3());
    const landDist = Math.hypot(this.pLand.x - lip.x, this.pLand.z - lip.z);
    const lf = this.feet(this.Ta + 0.2, new THREE.Vector3());
    this.line = { cliffLen: Math.max(3, landDist * 0.35), land: Math.max(0.05, (H(lf.x, lf.z + 1) - H(lf.x, lf.z - 1)) / 2) };
    this.v0 = this.com(0.06, new THREE.Vector3()).sub(this.com(0, new THREE.Vector3())).multiplyScalar(1 / 0.06);
    this.vLand = this.com(this.Ta, new THREE.Vector3()).sub(this.com(this.Ta - 0.06, new THREE.Vector3())).multiplyScalar(1 / 0.06);
    this.out = [];
    for (let t = this.Ta; t <= this.tEnd; t += 1 / 30) { const p = this.feet(t, _v); this.out.push({ x: p.x, z: p.z }); }
    if (!this.out.length) this.out.push({ x: this.pLand.x, z: this.pLand.z });
    this.emitted = {};
    this.base = { tStart: this.tStart, tEnd: this.tEnd };
  }

  /** Real time t (0 = take-off) → fractional frame. */
  frameAt(t) { return Math.min(this.clip.n - 1, Math.max(0, (t + this.t0c) * this.fps)); }
  track(T, t, out) {
    const f = this.frameAt(t), i = Math.min(this.clip.n - 2, Math.floor(f)), k = f - i;
    return out.set(T[i * 3] + (T[i * 3 + 3] - T[i * 3]) * k, T[i * 3 + 1] + (T[i * 3 + 4] - T[i * 3 + 1]) * k, T[i * 3 + 2] + (T[i * 3 + 5] - T[i * 3 + 2]) * k);
  }
  com(t, out) { return this.track(this.comT, t, out); }
  feet(t, out) { return this.track(this.feetT, t, out); }

  rate(t) {
    const into = smooth(-0.6, -0.05, t), outOf = smooth(this.Ta + 0.12, this.Ta + 0.9, t);
    return 1 + (this.slow - 1) * into * (1 - outOf);
  }

  screenLength() {
    let s = 0;
    for (let t = this.tStart; t < this.tEnd; t += 0.01) s += 0.01 / this.rate(t);
    return s;
  }

  /** Pose the rig at clip time tc (seconds from the clip's first frame). */
  apply(tc) {
    const c = this.clip, S = c.keys.length * NODE_STRIDE, F = c.frames;
    const f = Math.min(c.n - 1, Math.max(0, tc * c.fps)), i = Math.min(c.n - 2, Math.floor(f)), k = f - i;
    const A = i * S, B = A + S;
    for (let nd = 0; nd < this.nodes.length; nd++) {
      const node = this.nodes[nd];
      if (!node) continue;
      const a = A + nd * NODE_STRIDE, b = B + nd * NODE_STRIDE;
      node.position.set(F[a] + (F[b] - F[a]) * k, F[a + 1] + (F[b + 1] - F[a + 1]) * k, F[a + 2] + (F[b + 2] - F[a + 2]) * k);
      _q.set(F[a + 3], F[a + 4], F[a + 5], F[a + 6]); _q2.set(F[b + 3], F[b + 4], F[b + 5], F[b + 6]);
      node.quaternion.slerpQuaternions(_q, _q2, k).normalize();
      node.scale.set(F[a + 7] + (F[b + 7] - F[a + 7]) * k, F[a + 8] + (F[b + 8] - F[a + 8]) * k, F[a + 9] + (F[b + 9] - F[a + 9]) * k);
      if (!node.matrixAutoUpdate) node.matrix.compose(node.position, node.quaternion, node.scale);
    }
    // Recorded in the helmet cam: show the rider whole (first person shrinks the head).
    if (this.fpFix) { const Hd = this.rider.bones?.Head; if (Hd && Hd.scale.x < HEAD_SCALE * 0.95) Hd.scale.setScalar(HEAD_SCALE); }
  }

  /** The Shot interface: pose at real time t, fire the powder, return { com, vel, air, phase }. */
  pose(_pl, t, _dt, fx, simT) {
    const res = this._res || (this._res = { com: new THREE.Vector3(), vel: new THREE.Vector3(), air: false, phase: 'inrun' });
    this.apply(t + this.t0c);
    this.com(t, res.com);
    this.com(t + 0.03, res.vel).sub(this.com(t - 0.03, _v)).multiplyScalar(1 / 0.06);
    res.air = t >= 0 && t < this.Ta;
    res.phase = t < 0 ? 'inrun' : res.air ? 'air' : 'out';
    if (fx) {
      if (t >= 0 && !this.emitted.pop) { this.emitted.pop = true; fx.takeoff(simT, this.feet(0, new THREE.Vector3()), this.v0); }
      if (t >= this.Ta && !this.emitted.land) { this.emitted.land = true; const p = this.feet(this.Ta, new THREE.Vector3()); p.y = this.H(p.x, p.z); fx.landing(simT, p, this.vLand); }
    }
    return res;
  }

  /** Before each shot (nextClipShot trims tStart / tEnd per camera move). */
  reset() { this.emitted = {}; this.tStart = this.base.tStart; this.tEnd = this.base.tEnd; }
}
