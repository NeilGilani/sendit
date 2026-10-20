// Garment ↔ garment interpenetration (dev only; clipharness.js → scripts/garment-clip.mjs).
//
// CPU-skins every outfit vertex (position + normal) of the posed rider and checks pairs of pieces that
// must stay layered (docs/character.md § Garment clip):
//   pantsOut   pants (legs + bib) that sit inside the jacket in the bind pose but poke out through its
//              shell in the pose: the pants waist / thigh showing through the jacket front hem
//   hemIn      the jacket's hem band that sits outside the pants in the bind pose but sinks into them
//   sleeveIn   sleeve vertices outside the jacket body in the bind pose (beyond the armhole) that end up
//              inside it: "the sleeve goes into the jacket"
//   torsoOut   the jacket body outside the sleeve there: its side / shoulder poking out through the sleeve
// A point's side of a surface = the signed distance to the k nearest vertices of the other piece along
// their (skinned) normals, averaged. Depths in cm (max) plus the count of offending vertices.
import * as THREE from 'three';

const ID = { jacket: 0, sleeve: 1, pants: 2 };
const _m = new THREE.Matrix4(), _acc = new THREE.Matrix4(), _w = new THREE.Matrix4();

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

/** A uniform hash grid over a subset of vertices for k-nearest queries. */
function grid(pos, ids, cell = 0.03) {
  const map = new Map();
  const key = (x, y, z) => `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  for (const i of ids) {
    const k = key(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    let a = map.get(k); if (!a) map.set(k, a = []); a.push(i);
  }
  return {
    near(x, y, z, kN = 5) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      const best = [];
      for (let r = 1; r <= 3 && best.length < kN; r++) {
        best.length = 0;
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) {
          const a = map.get(`${cx + dx},${cy + dy},${cz + dz}`); if (!a) continue;
          for (const i of a) {
            const d = (pos[i * 3] - x) ** 2 + (pos[i * 3 + 1] - y) ** 2 + (pos[i * 3 + 2] - z) ** 2;
            best.push([d, i]);
          }
        }
      }
      best.sort((p, q) => p[0] - q[0]);
      return best.slice(0, kN);
    },
  };
}

/** Signed distance of point i (in `A`) to the surface made of vertices `near` (in `B`): + = outside. */
function side(A, i, gB, B, kN = 5) {
  const x = A.pos[i * 3], y = A.pos[i * 3 + 1], z = A.pos[i * 3 + 2];
  const nb = gB.near(x, y, z, kN);
  if (!nb.length || nb[0][0] > 0.06 * 0.06) return null;   // nothing of the other piece within 6 cm
  let s = 0, ws = 0;
  for (const [d, j] of nb) {
    const w = 1 / (Math.sqrt(d) + 0.004);
    s += w * ((x - B.pos[j * 3]) * B.nrm[j * 3] + (y - B.pos[j * 3 + 1]) * B.nrm[j * 3 + 1] + (z - B.pos[j * 3 + 2]) * B.nrm[j * 3 + 2]);
    ws += w;
  }
  return s / ws;
}

/**
 * Prepare a rider's outfit for measuring: vertex sets per piece and the bind-pose sides (so only pairs
 * that are layered in the bind pose count). Call again after the outfit changes.
 */
export function prepare(rider) {
  const mesh = rider.look.meshes.garments, g = mesh.geometry;
  const G = g.attributes.aG, L = g.attributes.aLin, P = g.attributes.position, n = P.count;
  const sets = { jacket: [], hem: [], sleeve: [], pants: [], torsoArm: [] };
  const jc = rider.look.outfit?.garments?.jacket?.cut || {};
  const hemLow = Math.min(jc.hemFront ?? 0.9, jc.hemBack ?? 0.9);
  for (let i = 0; i < n; i++) {
    if (L.getX(i) > 0.5) continue;   // lining (rolled edges) is inside by design
    const id = Math.round(G.getX(i)), y = P.getY(i), ax = Math.abs(P.getX(i));
    if (id === ID.jacket) {
      sets.jacket.push(i);
      if (y < hemLow + 0.12) sets.hem.push(i);
      if (y > 1.22 && ax > 0.1) sets.torsoArm.push(i);
    } else if (id === ID.sleeve) { if (ax < 0.5) sets.sleeve.push(i); }
    else if (id === ID.pants) { if (y > hemLow + 0.015 && Math.round(G.getW(i)) !== 2) sets.pants.push(i); }
  }
  // Bind pose = the geometry itself (positions / normals as built).
  const bind = { pos: P.array, nrm: g.attributes.normal.array };
  const gJ = grid(bind.pos, sets.jacket), gP = grid(bind.pos, sets.pants), gS = grid(bind.pos, sets.sleeve);
  const keep = (list, gB, want) => list.filter((i) => { const s = side(bind, i, gB, bind); return s !== null && want(s); });
  return {
    mesh,
    pantsIn: keep(sets.pants, gJ, (s) => s < -0.004),          // pants inside the jacket
    hemOut: keep(sets.hem, gP, (s) => s > 0.004),              // jacket hem outside the pants
    sleeveOut: keep(sets.sleeve, gJ, (s) => s > 0.004),        // sleeve outside the jacket body
    torsoIn: keep(sets.torsoArm, gS, (s) => s < -0.004),       // jacket body inside the sleeve (under the sleeve head)
    sets,
  };
}

/** Measure the current pose. Returns depths (cm) and counts, plus the worst vertex of each kind. */
export function measureGarments(prep) {
  const S = skinOutfit(prep.mesh);
  const gJ = grid(S.pos, prep.sets.jacket), gP = grid(S.pos, prep.sets.pants), gS = grid(S.pos, prep.sets.sleeve);
  const out = {};
  const run = (key, list, gB, sign, tol) => {
    let worst = 0, n = 0, at = null;
    for (const i of list) {
      const s = side(S, i, gB, S);
      if (s === null) continue;
      const d = sign * s - tol;   // how far past the surface (beyond the tolerance)
      if (d > 0) { n++; if (d > worst) { worst = d; at = i; } }
    }
    out[key] = +(worst * 100).toFixed(2); out[key + 'N'] = n;
    if (at !== null) out[key + 'At'] = [at, ...[0, 1, 2].map((q) => +S.pos[at * 3 + q].toFixed(3))];
  };
  run('pantsOut', prep.pantsIn, gJ, 1, 0.0);      // pants vertex outside the jacket
  run('hemIn', prep.hemOut, gP, -1, 0.0);         // jacket hem vertex inside the pants
  run('sleeveIn', prep.sleeveOut, gJ, -1, 0.0);   // sleeve vertex inside the jacket body
  run('torsoOut', prep.torsoIn, gS, 1, 0.0);      // jacket body vertex outside the sleeve
  return out;
}
