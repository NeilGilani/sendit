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
    // Spatial hash for nearest-skin lookups.
    this.cell = 0.05;
    this.grid = new Map();
    for (let i = 0; i < n; i++) {
      const k = this.key(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(i);
    }
  }

  key(x, y, z) { const c = this.cell; return `${Math.floor(x / c)},${Math.floor(y / c)},${Math.floor(z / c)}`; }
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
    for (let i = 0; i < this.n; i++) {
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
    for (let i = 0; i < this.n; i++) {
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
  skinAt(x, y, z, boneSet, out, k = 8) {
    const c = this.cell;
    const cx = Math.floor(x / c), cy = Math.floor(y / c), cz = Math.floor(z / c);
    const best = [];   // [d2, i] sorted, length ≤ k
    for (let ring = 1; ring <= 6; ring++) {
      for (let dx = -ring; dx <= ring; dx++) for (let dy = -ring; dy <= ring; dy++) for (let dz = -ring; dz <= ring; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== ring && ring > 1) continue;
        const a = this.grid.get(`${cx + dx},${cy + dy},${cz + dz}`);
        if (!a) continue;
        for (const i of a) {
          if (boneSet && !boneSet.has(this.dom[i])) continue;
          const ex = this.pos[i * 3] - x, ey = this.pos[i * 3 + 1] - y, ez = this.pos[i * 3 + 2] - z;
          const d2 = ex * ex + ey * ey + ez * ez;
          if (best.length < k || d2 < best[best.length - 1][0]) {
            best.push([d2, i]); best.sort((p, q) => p[0] - q[0]); if (best.length > k) best.pop();
          }
        }
      }
      // Done once the k-th nearest is closer than anything an outer ring could hold.
      if (best.length >= k && Math.sqrt(best[best.length - 1][0]) < ring * c) break;
    }
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
