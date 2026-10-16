// Ring-swept shells: the geometry kernel of the outfit. A garment piece is a list of rings (centre,
// two frame axes, one radius per segment) swept into a skinned triangle grid. Pieces are built in the
// body's bind space and merged into one geometry (one draw call for the whole outfit).
import * as THREE from 'three';

const TAU = Math.PI * 2;

// ------------------------------------------------------------------ noise (deterministic)
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
/** Smooth 2D value noise in [−1, 1]. */
export function vnoise(x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const a = hash2(x0, y0), b = hash2(x0 + 1, y0), c = hash2(x0, y0 + 1), d = hash2(x0 + 1, y0 + 1);
  return ((a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty) * 2 - 1;
}
/** Value noise periodic in x with period `px` integer cells (for seamless rings). */
export function pnoise(x, y, px) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  let tx = x - x0, ty = y - y0;
  tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
  const w = (i) => ((i % px) + px) % px;
  const a = hash2(w(x0), y0), b = hash2(w(x0 + 1), y0), c = hash2(w(x0), y0 + 1), d = hash2(w(x0 + 1), y0 + 1);
  return ((a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty) * 2 - 1;
}
export const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const bump = (x, c, w) => { const d = (x - c) / w; return Math.abs(d) >= 1 ? 0 : (1 - d * d) * (1 - d * d); };

/** Ring frame for an axis-aligned piece: 'y' (θ = 0 front +Z, θ = 90° the rider's left +X) or 'x±' (θ = 0 up, 90° front). */
export function frame(axis, side = 1) {
  if (axis === 'y') return { A: new THREE.Vector3(0, 1, 0), e1: new THREE.Vector3(0, 0, 1), e2: new THREE.Vector3(1, 0, 0) };
  return { A: new THREE.Vector3(side, 0, 0), e1: new THREE.Vector3(0, 1, 0), e2: new THREE.Vector3(0, 0, 1) };
}

// ------------------------------------------------------------------ rings from the body
/**
 * Sample rings around an axis-aligned piece of the body.
 * o: { axis, side, t0, t1, rings, segs, half, bones:Set, filter(x,y,z,bone), centre(t, c) → c (optional fix-up),
 *      smoothT (rings), smoothA (segments), ease(t, θ) → m, minEase, post(rings) }
 * Returns rings: [{ t, c, r: Float32Array, raw: Float32Array }] (θ_k = k/segs·τ).
 */
export function bodyRings(body, o) {
  const { A, e1, e2 } = frame(o.axis, o.side);
  const segs = o.segs, half = o.half ?? 0.025;
  const rings = [];
  for (let i = 0; i < o.rings; i++) {
    const t = o.t0 + (o.t1 - o.t0) * (i / (o.rings - 1));
    const c0 = o.axisPoint(t);
    let c = body.centre(c0, A, e1, e2, half, o.bones, o.filter);
    if (c) c.addScaledVector(A, t - c.dot(A));   // keep the ring on its plane
    rings.push({ t, c, ok: !!c });
  }
  // Fill empty slabs from the nearest sampled ring, then smooth the centre line.
  for (let i = 0; i < rings.length; i++) {
    if (rings[i].ok) continue;
    let j = 1;
    while (j < rings.length) {
      const a = rings[i - j], b = rings[i + j];
      if (a?.ok) { rings[i].c = a.c.clone().addScaledVector(A, rings[i].t - a.t); break; }
      if (b?.ok) { rings[i].c = b.c.clone().addScaledVector(A, rings[i].t - b.t); break; }
      j++;
    }
    if (!rings[i].c) rings[i].c = o.axisPoint(rings[i].t);
  }
  const cs = rings.map((r) => r.c.clone());
  const W = o.smoothC ?? 3;
  rings.forEach((r, i) => {
    const acc = new THREE.Vector3(); let n = 0;
    for (let j = Math.max(0, i - W); j <= Math.min(rings.length - 1, i + W); j++) { acc.add(cs[j]); n++; }
    acc.multiplyScalar(1 / n);
    acc.addScaledVector(A, r.t - acc.dot(A));
    r.c = o.centre ? o.centre(r.t, acc) : acc;
  });
  // Support radii around the smoothed centres.
  for (const r of rings) {
    const s = body.support(r.c, A, e1, e2, half, segs, o.bones, o.filter);
    r.raw = s.r; r.count = s.count;
  }
  // Empty / partial directions: fall back to the ring's mean, then to neighbours.
  for (const r of rings) {
    const good = [...r.raw].filter((x) => x > 0);
    const mean = good.length ? good.reduce((a, b) => a + b, 0) / good.length : -1;
    for (let k = 0; k < segs; k++) if (r.raw[k] <= 0) r.raw[k] = mean;
  }
  for (let i = 0; i < rings.length; i++) {
    if (rings[i].raw[0] > 0) continue;
    for (let j = 1; j < rings.length; j++) {
      const a = rings[i - j] || rings[i + j];
      if (a && a.raw[0] > 0) { rings[i].raw = a.raw.slice(); break; }
      const b = rings[i + j];
      if (b && b.raw[0] > 0) { rings[i].raw = b.raw.slice(); break; }
    }
  }
  // Smooth: circular blur across θ, then along t; the shell is the smooth surface plus ease, but
  // never closer to the skin than minEase.
  const sa = o.smoothA ?? 2, st = o.smoothT ?? 2;
  const blurA = rings.map((r) => {
    const out = new Float32Array(segs);
    for (let k = 0; k < segs; k++) {
      let acc = 0, wsum = 0;
      for (let d = -sa; d <= sa; d++) { const w = 1 - Math.abs(d) / (sa + 1); acc += r.raw[(k + d + segs) % segs] * w; wsum += w; }
      out[k] = acc / wsum;
    }
    return out;
  });
  rings.forEach((r, i) => {
    r.r = new Float32Array(segs);
    for (let k = 0; k < segs; k++) {
      let acc = 0, wsum = 0;
      for (let d = -st; d <= st; d++) {
        const j = i + d; if (j < 0 || j >= rings.length) continue;
        const w = 1 - Math.abs(d) / (st + 1); acc += blurA[j][k] * w; wsum += w;
      }
      const th = (k / segs) * TAU;
      const sm = acc / wsum;
      r.r[k] = Math.max(sm + o.ease(r.t, th), r.raw[k] + (o.minEase ?? 0.012));
    }
  });
  if (o.post) o.post(rings, segs);
  return rings;
}

/** "Hang" rule: going down the rings, a radius may only shrink by `perMetre` per metre (fabric drops straight). */
export function hang(rings, segs, from, perMetre, dir = -1) {
  for (let i = 1; i < rings.length; i++) {
    const a = rings[i - 1], b = rings[i];
    if ((b.t - from) * dir < 0) continue;
    const dt = Math.abs(b.t - a.t);
    for (let k = 0; k < segs; k++) b.r[k] = Math.max(b.r[k], a.r[k] - perMetre * dt);
  }
}

// ------------------------------------------------------------------ sweeping rings into a mesh
/**
 * One shell piece. rings: [{ c, r, t, off? (per-segment axial offsets, m), lining? (0..1) }].
 * meta: { id, side, axis A, e1, e2, v(t) → v coordinate, skinBones:Set, lipStart, lipEnd, capEnd, capStart }
 * Returns a piece { pos, nrm, g (id,u,v,side), lin, idx, skinBones } in plain arrays.
 */
export function sweep(rings, meta) {
  const { e1, e2, A } = meta;
  const segs = rings[0].r.length;
  const R = rings.slice();
  const dirT = Math.sign(R[R.length - 1].t - R[0].t) || 1;
  // Rolled edges: the shell turns over and runs back inside a little (reads as thickness).
  const lip = (end, at, sgn) => {
    const base = R[at];
    const mk = (dr, dt, lining) => ({ c: base.c.clone().addScaledVector(A, dt * sgn * dirT), r: base.r.map((x) => Math.max(0.004, x + dr)), t: base.t + dt * sgn * dirT, off: base.off, lining, v: (base.v ?? base.t) });
    const ls = [mk(-0.004, 0.004, 0), mk(-0.010, 0.0045, 1), mk(-0.016, -0.022, 1)];
    if (end) R.push(...ls); else R.unshift(...ls.reverse());
  };
  const cap = (end, at, sgn) => {
    const base = R[at];
    const n = 5, len = meta.capLen ?? 0.6;
    const extra = [];
    for (let j = 1; j <= n; j++) {
      const a = (j / n) * Math.PI / 2;
      const rr = base.r.map((x) => x * Math.cos(a) + 0.0005);
      const avg = base.r.reduce((p, q) => p + q, 0) / segs;
      extra.push({ c: base.c.clone().addScaledVector(A, Math.sin(a) * avg * len * sgn * dirT), r: rr, t: base.t + Math.sin(a) * avg * len * sgn * dirT, off: base.off, v: base.v });
    }
    if (end) R.push(...extra); else R.unshift(...extra.reverse());
  };
  if (meta.lipEnd) lip(true, R.length - 1, 1);
  if (meta.lipStart) lip(false, 0, -1);
  if (meta.capEnd) cap(true, R.length - 1, 1);
  if (meta.capStart) cap(false, 0, -1);

  const nr = R.length, cols = segs + 1;
  const P = new Float32Array(nr * cols * 3);
  const cosT = [], sinT = [];
  for (let k = 0; k <= segs; k++) { cosT.push(Math.cos((k / segs) * TAU)); sinT.push(Math.sin((k / segs) * TAU)); }
  for (let i = 0; i < nr; i++) {
    const ring = R[i];
    for (let k = 0; k <= segs; k++) {
      const kk = k % segs, r = ring.r[kk];
      const o = (i * cols + k) * 3;
      const ax = ring.off ? ring.off[kk] : 0;
      P[o] = ring.c.x + (e1.x * cosT[k] + e2.x * sinT[k]) * r + A.x * ax;
      P[o + 1] = ring.c.y + (e1.y * cosT[k] + e2.y * sinT[k]) * r + A.y * ax;
      P[o + 2] = ring.c.z + (e1.z * cosT[k] + e2.z * sinT[k]) * r + A.z * ax;
    }
  }
  // Grid normals (wrap around θ), oriented away from the centre line.
  const N = new Float32Array(P.length);
  const at = (i, k) => { i = Math.min(nr - 1, Math.max(0, i)); k = ((k % segs) + segs) % segs; const o = (i * cols + k) * 3; return [P[o], P[o + 1], P[o + 2]]; };
  const mid = Math.floor(nr / 2);
  let orient = 1;
  {
    const a = at(mid - 1, 0), b = at(mid + 1, 0), c = at(mid, 1), d = at(mid, -1);
    const dt = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], da = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
    const n = [dt[1] * da[2] - dt[2] * da[1], dt[2] * da[0] - dt[0] * da[2], dt[0] * da[1] - dt[1] * da[0]];
    const p = at(mid, 0), cc = R[mid].c;
    if (n[0] * (p[0] - cc.x) + n[1] * (p[1] - cc.y) + n[2] * (p[2] - cc.z) < 0) orient = -1;
  }
  for (let i = 0; i < nr; i++) {
    for (let k = 0; k <= segs; k++) {
      const a = at(i - 1, k), b = at(i + 1, k), c = at(i, k + 1), d = at(i, k - 1);
      const dt = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], da = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      let n = [dt[1] * da[2] - dt[2] * da[1], dt[2] * da[0] - dt[0] * da[2], dt[0] * da[1] - dt[1] * da[0]];
      let l = Math.hypot(n[0], n[1], n[2]);
      if (l < 1e-10) { const cc = R[i].c, p = at(i, k); n = [p[0] - cc.x, p[1] - cc.y, p[2] - cc.z]; l = Math.hypot(...n) || 1; n = n.map((x) => x * orient); }
      const o = (i * cols + k) * 3;
      N[o] = (n[0] / l) * orient; N[o + 1] = (n[1] / l) * orient; N[o + 2] = (n[2] / l) * orient;
    }
  }
  const G = new Float32Array(nr * cols * 4), L = new Float32Array(nr * cols);
  for (let i = 0; i < nr; i++) {
    const ring = R[i];
    const v = meta.v ? meta.v(ring.v ?? ring.t) : (ring.v ?? ring.t);
    for (let k = 0; k <= segs; k++) {
      const o = i * cols + k;
      G[o * 4] = meta.id; G[o * 4 + 1] = k / segs; G[o * 4 + 2] = v; G[o * 4 + 3] = meta.side ?? 0;
      L[o] = ring.lining ?? 0;
    }
  }
  const idx = [];
  for (let i = 0; i < nr - 1; i++) {
    for (let k = 0; k < segs; k++) {
      const a = i * cols + k, b = (i + 1) * cols + k, c = i * cols + k + 1, d = (i + 1) * cols + k + 1;
      if (orient > 0) idx.push(a, b, c, c, b, d); else idx.push(a, c, b, c, d, b);
    }
  }
  return { pos: P, nrm: N, g: G, lin: L, idx, rows: nr, cols, skinBones: meta.skinBones, rigid: meta.rigid };
}

// ------------------------------------------------------------------ skinning + merge
/** Copy skin weights from the body to each vertex of a piece, smooth them over the grid, keep 4. */
export function skinPiece(piece, body, smoothIters = 6) {
  const nv = piece.pos.length / 3, nb = body.nb;
  const W = new Float32Array(nv * nb);
  if (piece.rigid !== undefined) {
    for (let i = 0; i < nv; i++) W[i * nb + piece.rigid] = 1;
  } else {
    const tmp = new Float32Array(nb);
    for (let i = 0; i < nv; i++) {
      tmp.fill(0);
      body.skinAt(piece.pos[i * 3], piece.pos[i * 3 + 1], piece.pos[i * 3 + 2], piece.skinBones, tmp);
      let s = 0; for (let j = 0; j < nb; j++) s += tmp[j];
      if (s > 0) for (let j = 0; j < nb; j++) W[i * nb + j] = tmp[j] / s;
    }
    // Diffuse weights over the grid so neighbouring vertices bend together (no torn folds).
    const { rows, cols } = piece;
    const tmpW = new Float32Array(W.length);
    for (let it = 0; it < smoothIters; it++) {
      for (let i = 0; i < rows; i++) for (let k = 0; k < cols; k++) {
        const o = i * cols + k;
        const nbh = [o, i > 0 ? o - cols : o, i < rows - 1 ? o + cols : o, i * cols + ((k - 1 + cols - 1) % (cols - 1)), i * cols + ((k + 1) % (cols - 1))];
        for (let j = 0; j < nb; j++) {
          tmpW[o * nb + j] = (W[nbh[0] * nb + j] * 2 + W[nbh[1] * nb + j] + W[nbh[2] * nb + j] + W[nbh[3] * nb + j] + W[nbh[4] * nb + j]) / 6;
        }
      }
      W.set(tmpW);
      // keep the duplicated seam column identical
      for (let i = 0; i < rows; i++) for (let j = 0; j < nb; j++) W[(i * cols + cols - 1) * nb + j] = W[(i * cols) * nb + j];
    }
  }
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  for (let i = 0; i < nv; i++) {
    const top = [];
    for (let j = 0; j < nb; j++) { const w = W[i * nb + j]; if (w > 0.002) top.push([w, j]); }
    top.sort((a, b) => b[0] - a[0]);
    const t4 = top.slice(0, 4);
    const s = t4.reduce((a, b) => a + b[0], 0) || 1;
    t4.forEach(([w, j], q) => { si[i * 4 + q] = j; sw[i * 4 + q] = w / s; });
  }
  piece.si = si; piece.sw = sw;
  return piece;
}

/** Merge pieces into one skinned BufferGeometry (attributes: position, normal, aG, aLin, skinIndex, skinWeight). */
export function mergePieces(pieces) {
  let nv = 0, ni = 0;
  for (const p of pieces) { nv += p.pos.length / 3; ni += p.idx.length; }
  const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), g = new Float32Array(nv * 4), lin = new Float32Array(nv);
  const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
  const idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const p of pieces) {
    const n = p.pos.length / 3;
    pos.set(p.pos, ov * 3); nrm.set(p.nrm, ov * 3); g.set(p.g, ov * 4); lin.set(p.lin, ov);
    si.set(p.si, ov * 4); sw.set(p.sw, ov * 4);
    for (let i = 0; i < p.idx.length; i++) idx[oi + i] = p.idx[i] + ov;
    ov += n; oi += p.idx.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('aG', new THREE.BufferAttribute(g, 4));
  geo.setAttribute('aLin', new THREE.BufferAttribute(lin, 1));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  geo.setIndex(new THREE.BufferAttribute(nv > 65535 ? idx : new Uint16Array(idx), 1));
  geo.computeBoundingSphere();
  return geo;
}
