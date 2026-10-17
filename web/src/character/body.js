// Body analysis for the procedural outfit: reads the Quaternius body mesh in its bind pose (T-pose,
// Y up, facing +Z, metres) and answers the two questions the garment builder asks:
//   • how big is the body around an axis at this spot?   support()  — the convex outline of a slab
//   • which bones should a point on the clothes follow?   skinAt()   — weights copied from nearby skin
// Everything here runs once per page (results are cached by the caller) and touches no GPU state.
import * as THREE from 'three';

export class BodyInfo {
  /** @param {THREE.SkinnedMesh} mesh the body (its geometry is in bind space) */
  constructor(mesh) {
    const g = mesh.geometry;
    const P = g.attributes.position, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
    this.mesh = mesh;
    this.names = mesh.skeleton.bones.map((b) => b.name);
    this.nb = this.names.length;
    const n = this.n = P.count;
    this.pos = new Float32Array(n * 3);
    this.si = new Uint16Array(n * 4);
    this.sw = new Float32Array(n * 4);
    this.dom = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      this.pos[i * 3] = P.getX(i); this.pos[i * 3 + 1] = P.getY(i); this.pos[i * 3 + 2] = P.getZ(i);
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) {
        const j = SI.getComponent(i, k), w = SW.getComponent(i, k);
        this.si[i * 4 + k] = j; this.sw[i * 4 + k] = w;
        if (w > bw) { bw = w; best = j; }
      }
      this.dom[i] = best;
    }
    // Bind-space joint positions (bindMatrix ∘ inverse(boneInverse)).
    const bindInv = mesh.bindMatrix.clone().invert();   // (bindMatrixInverse tracks matrixWorld in 'attached' mode)
    this.joint = {};
    mesh.skeleton.boneInverses.forEach((bi, j) => {
      const m = bi.clone().invert().premultiply(bindInv);
      this.joint[this.names[j]] = new THREE.Vector3().setFromMatrixPosition(m);
    });
    // Spatial hash for nearest-skin lookups (numeric cell keys).
    this.cell = 0.09;
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const k = this.key(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(i);
    }
  }

  /** Vertex indices whose coordinate on an axis-aligned `axis` lies within c·axis ± half (all, if not aligned). */
  slab(c, axis, half) {
    const ax = Math.abs(axis.x) > 0.999 ? 0 : Math.abs(axis.y) > 0.999 ? 1 : Math.abs(axis.z) > 0.999 ? 2 : -1;
    if (ax < 0) return null;
    if (!this.sorted) this.sorted = [];
    if (!this.sorted[ax]) {
      const idx = Array.from({ length: this.n }, (_, i) => i).sort((a, b) => this.pos[a * 3 + ax] - this.pos[b * 3 + ax]);
      this.sorted[ax] = { idx: Int32Array.from(idx), val: Float32Array.from(idx, (i) => this.pos[i * 3 + ax]) };
    }
    const { idx, val } = this.sorted[ax];
    const t = ax === 0 ? c.x : ax === 1 ? c.y : c.z;
    const lo = (x) => { let a = 0, b = val.length; while (a < b) { const m = (a + b) >> 1; if (val[m] < x) a = m + 1; else b = m; } return a; };
    return idx.subarray(lo(t - half), lo(t + half + 1e-9));
  }

  /** Spatial hash of only the vertices whose dominant bone is in `boneSet` (cached per set). */
  gridFor(boneSet) {
    if (!boneSet) return this.grid;
    const key = [...boneSet].sort((a, b) => a - b).join(',');
    if (!this.grids) this.grids = new Map();
    let g = this.grids.get(key);
    if (!g) {
      g = new Map();
      for (const [k, list] of this.grid) {
        const f = list.filter((i) => boneSet.has(this.dom[i]));
        if (f.length) g.set(k, f);
      }
      this.grids.set(key, g);
    }
    return g;
  }

  cellKey(ix, iy, iz) { return ((ix + 512) * 1024 + (iy + 512)) * 1024 + (iz + 512); }
  key(x, y, z) { const c = this.cell; return this.cellKey(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c)); }
  bone(name) { return this.names.indexOf(name); }
  /** Set of bone indices from a name test (regexp or array of names). */
  bones(test) {
    const s = new Set();
    this.names.forEach((nm, j) => { if (Array.isArray(test) ? test.includes(nm) : test.test(nm)) s.add(j); });
    return s;
  }

  /**
   * Support radii of the body around a ring frame: for each of `segs` directions in the ring plane,
   * the furthest extent of the vertices (dominant bone in `boneSet`, optional `filter(x, y, z, boneName)`) inside
   * the slab |(p − c)·axis| < half. Returns { r: Float32Array, count } (r = −1 where no points).
   */
  support(c, axis, e1, e2, half, segs, boneSet, filter) {
    const r = new Float32Array(segs).fill(-1);
    const cs = new Float32Array(segs), sn = new Float32Array(segs);
    for (let k = 0; k < segs; k++) { const a = (k / segs) * Math.PI * 2; cs[k] = Math.cos(a); sn[k] = Math.sin(a); }
    let count = 0;
    const p = this.pos;
    const list = this.slab(c, axis, half);
    const N = list ? list.length : this.n;
    for (let q = 0; q < N; q++) {
      const i = list ? list[q] : q;
      if (boneSet && !boneSet.has(this.dom[i])) continue;
      const x = p[i * 3] - c.x, y = p[i * 3 + 1] - c.y, z = p[i * 3 + 2] - c.z;
      const t = x * axis.x + y * axis.y + z * axis.z;
      if (Math.abs(t) > half) continue;
      if (filter && !filter(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], this.names[this.dom[i]])) continue;
      count++;
      const u = x * e1.x + y * e1.y + z * e1.z, v = x * e2.x + y * e2.y + z * e2.z;
      for (let k = 0; k < segs; k++) { const d = u * cs[k] + v * sn[k]; if (d > r[k]) r[k] = d; }
    }
    return { r, count };
  }

  /** Midpoint of the extents of a slab along e1 / e2 (for centring rings), or null if empty. */
  centre(c, axis, e1, e2, half, boneSet, filter) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, count = 0;
    const p = this.pos;
    const list = this.slab(c, axis, half);
    const N = list ? list.length : this.n;
    for (let q = 0; q < N; q++) {
      const i = list ? list[q] : q;
      if (boneSet && !boneSet.has(this.dom[i])) continue;
      const x = p[i * 3] - c.x, y = p[i * 3 + 1] - c.y, z = p[i * 3 + 2] - c.z;
      if (Math.abs(x * axis.x + y * axis.y + z * axis.z) > half) continue;
      if (filter && !filter(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], this.names[this.dom[i]])) continue;
      count++;
      const u = x * e1.x + y * e1.y + z * e1.z, v = x * e2.x + y * e2.y + z * e2.z;
      a0 = Math.min(a0, u); a1 = Math.max(a1, u); b0 = Math.min(b0, v); b1 = Math.max(b1, v);
    }
    if (!count) return null;
    return c.clone().addScaledVector(e1, (a0 + a1) / 2).addScaledVector(e2, (b0 + b1) / 2);
  }

  /**
   * Skin weights for a point on the clothes: inverse-distance blend of the nearest body vertices
   * whose dominant bone is in `boneSet` (all if null). Accumulates into `out` (Float32Array, one
   * slot per bone).
   */
  skinAt(x, y, z, boneSet, out, k = 8, mask = null) {
    const c = this.cell;
    const cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c);
    const grid = this.gridFor(boneSet);
    const bd = new Float64Array(k).fill(Infinity), bi = new Int32Array(k).fill(-1);   // k nearest, sorted
    for (let ring = 1; ring <= 6; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) for (let dz = -ring; dz <= ring; dz++) {
        if (ring > 1 && Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring) continue;
        const a = grid.get(this.cellKey(cx + dx, cy + dy, cz + dz));
        if (!a) continue;
        for (const i of a) {
          if (mask && !mask(this.names[this.dom[i]], x, y, z)) continue;
          const ex = this.pos[i * 3] - x, ey = this.pos[i * 3 + 1] - y, ez = this.pos[i * 3 + 2] - z;
          const d2 = ex * ex + ey * ey + ez * ez;
          if (d2 >= bd[k - 1]) continue;
          let j = k - 1;
          while (j > 0 && bd[j - 1] > d2) { bd[j] = bd[j - 1]; bi[j] = bi[j - 1]; j--; }
          bd[j] = d2; bi[j] = i;
        }
      }
      // Done once the k-th nearest is closer than anything an outer ring could hold.
      if (bi[k - 1] >= 0 && Math.sqrt(bd[k - 1]) < ring * c) break;
    }
    const best = [];
    for (let j = 0; j < k; j++) if (bi[j] >= 0) best.push([bd[j], bi[j]]);
    if (!best.length) return false;
    const d0 = Math.sqrt(best[0][0]);
    let tot = 0;
    for (const [d2, i] of best) {
      const w = 1 / (Math.pow(Math.sqrt(d2) - d0 + 0.01, 2));
      for (let q = 0; q < 4; q++) out[this.si[i * 4 + q]] += this.sw[i * 4 + q] * w;
      tot += w;
    }
    void tot;
    return true;
  }
}

/**
 * Rig proportions on top of the Quaternius model, nearer a real adult skier (and Steep / Riders
 * Republic riders) than the model's superhero cut. Measured on the bind pose (1.81 m tall): the head
 * was ≈ 20 % too wide for the body (0.18 m vs ≈ 0.155 m), and the arm span was 1.65 m against a
 * height of 1.81 m (real arm span ≈ height), with the shortfall in the upper arm (0.25 m shoulder →
 * elbow vs ≈ 0.30 m). Bones are moved, not vertices, so the body, the outfit and the helmet (all
 * skinned or parented to these bones) follow, and the pose code just sees longer arms.
 *   head       × scale of the head bone (helmet and goggle included)
 *   upperArm   m added shoulder → elbow
 *   foreArm    m added elbow → wrist
 *   hand       × scale of the hand bones (the mitts are cut generously)
 */
export const PROPORTIONS = { head: 0.94, upperArm: 0.045, foreArm: 0.015, hand: 0.92 };

/** Apply PROPORTIONS to a rider's rest pose: `restLocal` maps bone → { p, q, s, m } (local, edited in place). */
export function proportionRig(bones, restLocal, P = PROPORTIONS) {
  const edit = (name, f) => {
    const r = bones[name] && restLocal.get(bones[name]);
    if (!r) return;
    f(r);
    r.m.compose(r.p, r.q, r.s);
  };
  const lengthen = (d) => (r) => { const l = r.p.length(); if (l > 1e-6) r.p.multiplyScalar((l + d) / l); };
  edit('Head', (r) => r.s.multiplyScalar(P.head));
  for (const s of ['_l', '_r']) {
    edit('lowerarm' + s, lengthen(P.upperArm));
    edit('hand' + s, lengthen(P.foreArm));
    edit('hand' + s, (r) => r.s.multiplyScalar(P.hand));
  }
}
