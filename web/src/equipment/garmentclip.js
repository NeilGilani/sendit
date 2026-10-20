// Garment ↔ garment interpenetration (dev only; clipharness.js → scripts/garment-clip.mjs).
//
// CPU-skins every outfit vertex (position + normal) of the posed rider and checks pairs of pieces that
// must stay layered (docs/character.md § Catalogue jackets, "Checks and sheets"):
//   pantsOut   pants (legs + bib) that sit inside the jacket in the bind pose but poke out through its
//              shell in the pose: the pants waist / thigh showing through the jacket front hem
//   hemIn      the jacket's hem band that sits outside the pants in the bind pose but sinks into them
//   sleeveIn   sleeve vertices outside the jacket body in the bind pose (beyond the armhole) that end up
//              inside it: "the sleeve goes into the jacket"
//   torsoOut   the jacket body outside the sleeve there: its side / shoulder poking out through the sleeve
// Each check casts short rays along the skinned vertex normals against the other piece's triangles
// (layerCheck / measureGarments below). Per pose: the deepest offender (cm) and the count of vertices.
import * as THREE from 'three';

const ID = { jacket: 0, sleeve: 1, pants: 2 };
const _m = new THREE.Matrix4(), _acc = new THREE.Matrix4();

/** World positions + normals of every outfit vertex in the current pose. */
export function skinOutfit(mesh) {
  mesh.updateMatrixWorld(true);
  mesh.skeleton.update();
  const g = mesh.geometry, P = g.attributes.position, N = g.attributes.normal;
  const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bm = mesh.skeleton.boneMatrices;
  const n = P.count, pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const pre = new THREE.Matrix4().copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse);
  const e = _acc.elements;
  const v = new THREE.Vector3(), nn = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (let i = 0; i < n; i++) {
    e.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = SW.getComponent(i, k);
      if (!w) continue;
      const b = SI.getComponent(i, k) * 16;
      for (let q = 0; q < 16; q++) e[q] += bm[b + q] * w;
    }
    _m.copy(pre).multiply(_acc).multiply(mesh.bindMatrix);
    v.fromBufferAttribute(P, i).applyMatrix4(_m);
    nn.fromBufferAttribute(N, i).applyMatrix3(nm.setFromMatrix4(_m)).normalize();
    pos.set([v.x, v.y, v.z], i * 3); nrm.set([nn.x, nn.y, nn.z], i * 3);
  }
  return { pos, nrm };
}

/** Triangles of the pieces `ids` (by their first vertex's piece id), in a hash grid, for short ray casts. */
function triGrid(S, index, G, L, ids, cell = 0.05) {
  const tris = [], map = new Map();
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t], b = index[t + 1], c = index[t + 2];
    if (!ids.includes(Math.round(G.getX(a))) || L.getX(a) > 0.5) continue;
    const ti = tris.length; tris.push(a, b, c);
    let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
    for (const v of [a, b, c]) {
      const x = S.pos[v * 3], y = S.pos[v * 3 + 1], z = S.pos[v * 3 + 2];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); z0 = Math.min(z0, z); x1 = Math.max(x1, x); y1 = Math.max(y1, y); z1 = Math.max(z1, z);
    }
    for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) for (let j = Math.floor(y0 / cell); j <= Math.floor(y1 / cell); j++) for (let k = Math.floor(z0 / cell); k <= Math.floor(z1 / cell); k++) {
      const key = `${i},${j},${k}`; let arr = map.get(key); if (!arr) map.set(key, arr = []); arr.push(ti);
    }
  }
  const P = S.pos, seen = new Set();
  /** Distance along (dx, dy, dz) (unit) from (ox, oy, oz) to the first triangle hit within len, or -1. */
  return (ox, oy, oz, dx, dy, dz, len) => {
    seen.clear();
    let best = -1;
    const steps = Math.ceil(len / (cell * 0.5));
    for (let s = 0; s <= steps; s++) {
      const f = (s / steps) * len;
      const key = `${Math.floor((ox + dx * f) / cell)},${Math.floor((oy + dy * f) / cell)},${Math.floor((oz + dz * f) / cell)}`;
      const arr = map.get(key); if (!arr) continue;
      for (const ti of arr) {
        if (seen.has(ti)) continue; seen.add(ti);
        const a = tris[ti] * 3, b = tris[ti + 1] * 3, c = tris[ti + 2] * 3;
        const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
        const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
        const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det, tx = ox - P[a], ty = oy - P[a + 1], tz = oz - P[a + 2];
        const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * inv; if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (t > 1e-4 && t <= len && (best < 0 || t < best)) best = t;
      }
    }
    return best;
  };
}

/**
 * Visibility-based layer checks (the numbers garment-clip.mjs reports). For a vertex of the inner layer
 * that is hidden under the outer one in the bind pose, "poking through" = the outer layer is now BEHIND
 * it (a ray inward along its normal hits the outer layer within 5 cm) and nothing of the outer layer is in
 * front of it (the outward ray misses): it is drawn in front of the shell. Depth = distance to the shell
 * behind it. A pair that is only exposed (a hem lifting off the pants) does not count.
 */
const RAY = 0.05;
function layerCheck(S, list, hitOuter, sign = 1) {
  let worst = 0, n = 0, at = null;
  for (const i of list) {
    const ox = S.pos[i * 3], oy = S.pos[i * 3 + 1], oz = S.pos[i * 3 + 2];
    const nx = S.nrm[i * 3] * sign, ny = S.nrm[i * 3 + 1] * sign, nz = S.nrm[i * 3 + 2] * sign;
    const back = hitOuter(ox, oy, oz, -nx, -ny, -nz, RAY);
    if (back < 0) continue;
    if (hitOuter(ox, oy, oz, nx, ny, nz, RAY * 2) >= 0) continue;
    n++;
    if (back > worst) { worst = back; at = i; }
  }
  return { worst, n, at };
}

/**
 * Prepare a rider's outfit for measuring: vertex sets per piece and the bind-pose sides (so only pairs
 * that are layered in the bind pose count). Call again after the outfit changes.
 */
export function prepare(rider) {
  const mesh = rider.look.meshes.garments, g = mesh.geometry;
  const G = g.attributes.aG, L = g.attributes.aLin, P = g.attributes.position, n = P.count, index = g.index.array;
  const sets = { hem: [], sleeve: [], pants: [], torsoArm: [] };
  const jc = rider.look.outfit?.garments?.jacket?.cut || {};
  const hemLow = Math.min(jc.hemFront ?? 0.9, jc.hemBack ?? 0.9);
  const armY = 1.43;
  for (let i = 0; i < n; i++) {
    if (L.getX(i) > 0.5) continue;   // lining (rolled edges) is inside by design
    const id = Math.round(G.getX(i)), y = P.getY(i), ax = Math.abs(P.getX(i));
    if (id === ID.jacket) {
      if (y < hemLow + 0.12) sets.hem.push(i);
      if (y > 1.22 && ax > 0.19) sets.torsoArm.push(i);   // (where the sleeve is)
    } else if (id === ID.sleeve) {
      // the sleeve's top, front and back (its underside lies against the body when the arm is down)
      // (the upper sleeve and its head: a forearm reaching across the body in a grab is the animation's business)
      if (ax < 0.42 && y > armY) sets.sleeve.push(i);
    } else if (id === ID.pants) { if (y > hemLow + 0.015 && Math.round(G.getW(i)) !== 2) sets.pants.push(i); }
  }
  // Bind pose = the geometry itself (positions / normals as built).
  const B = { pos: P.array, nrm: g.attributes.normal.array };
  const hit = (ids) => triGrid(B, index, G, L, ids);
  const hJ = hit([ID.jacket]), hP = hit([ID.pants]), hS = hit([ID.sleeve]);
  const out = (h, len = RAY) => (i) => h(B.pos[i * 3], B.pos[i * 3 + 1], B.pos[i * 3 + 2], B.nrm[i * 3], B.nrm[i * 3 + 1], B.nrm[i * 3 + 2], len);
  return {
    mesh, index, G, L,
    pantsIn: sets.pants.filter((i) => out(hJ, 0.12)(i) >= 0),      // pants covered by the jacket
    hemOut: sets.hem.filter((i) => out(hP)(i) < 0),               // jacket hem not covered by the pants
    sleeveOut: sets.sleeve.filter((i) => out(hJ)(i) < 0),         // sleeve not covered by the jacket body
    torsoIn: sets.torsoArm.filter((i) => out(hS)(i) >= 0),        // jacket body under the sleeve head
  };
}

/** Measure the current pose. Returns depths (cm) and counts, plus the worst vertex of each kind. */
export function measureGarments(prep) {
  const S = skinOutfit(prep.mesh);
  const hit = (ids) => triGrid(S, prep.index, prep.G, prep.L, ids);
  const hJ = hit([ID.jacket]), hP = hit([ID.pants]), hS = hit([ID.sleeve]);
  const res = {};
  const put = (key, { worst, n, at }) => {
    res[key] = +(worst * 100).toFixed(2); res[key + 'N'] = n;
    if (at !== null) res[key + 'At'] = [at, ...[0, 1, 2].map((q) => +S.pos[at * 3 + q].toFixed(3))];
  };
  // sunk = the other piece's surface runs just in front of the vertex (outward ray within 3 cm, depth =
  // that distance) and not just behind it (inward ray misses within 3 cm): the inner layer pokes out over
  // this outer-layer vertex. A knee further in front of the hem (occlusion) does not count.
  const NEAR = 0.03;
  const covered = (list, h) => {
    let worst = 0, n = 0, at = null;
    for (const i of list) {
      const x = S.pos[i * 3], y = S.pos[i * 3 + 1], z = S.pos[i * 3 + 2], nx = S.nrm[i * 3], ny = S.nrm[i * 3 + 1], nz = S.nrm[i * 3 + 2];
      const d = h(x, y, z, nx, ny, nz, NEAR);
      if (d < 0 || h(x, y, z, -nx, -ny, -nz, NEAR) >= 0) continue;
      n++; if (d > worst) { worst = d; at = i; }
    }
    return { worst, n, at };
  };
  put('pantsOut', layerCheck(S, prep.pantsIn, hJ));     // pants drawn in front of the jacket
  put('hemIn', covered(prep.hemOut, hP));               // the jacket hem sunk behind the pants
  put('sleeveIn', covered(prep.sleeveOut, hJ));         // the sleeve sunk behind the jacket body
  put('torsoOut', layerCheck(S, prep.torsoIn, hS));     // the jacket body drawn in front of the sleeve
  return res;
}
