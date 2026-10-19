// Rider ↔ gear penetration measurement (dev only), shared by clipharness.js (scripts/gear-clip.mjs) and
// spinharness.js (scripts/spin-sheet.mjs): CPU-skins every garment and boot vertex of the posed Rider and
// measures how far it sits inside the skis / board (body, hand, sunk, base, gap — see clipharness.js).
import * as THREE from 'three';

// ------------------------------------------------------------------ gear surface tables
const tables = new Map();
/** Rows along the plank (sorted by z): half width (base), top y and base y, from the real geometry. */
function plankTable(geo) {
  if (tables.has(geo.uuid)) return tables.get(geo.uuid);
  const P = geo.attributes.position, A = geo.attributes.aPlank;
  const rows = new Map();
  for (let i = 0; i < P.count; i++) {
    const z = Math.round(P.getZ(i) * 1e4) / 1e4, top = A.getZ(i) > 0.5;
    const r = rows.get(z) || { z, hw: 0, top: -1e9, base: 1e9 };
    if (top) r.top = Math.max(r.top, P.getY(i)); else { r.base = Math.min(r.base, P.getY(i)); r.hw = Math.max(r.hw, Math.abs(P.getX(i))); }
    rows.set(z, r);
  }
  const t = [...rows.values()].filter((r) => r.top > -1e8 && r.base < 1e8).sort((a, b) => a.z - b.z);
  tables.set(geo.uuid, t);
  return t;
}
function rowAt(t, z) {
  if (z < t[0].z || z > t[t.length - 1].z) return null;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m].z <= z) lo = m; else hi = m; }
  const a = t[lo], b = t[hi], f = b.z > a.z ? (z - a.z) / (b.z - a.z) : 0;
  return { hw: a.hw + (b.hw - a.hw) * f, top: a.top + (b.top - a.top) * f, base: a.base + (b.base - a.base) * f };
}

// ------------------------------------------------------------------ vertex classes
export const CLASS = { none: 0, body: 1, hand: 2, boot_l: 3, boot_r: 4, finger: 5 };
export function classify(rider) {
  const { body, garments } = rider.look.meshes;
  const out = [];
  for (const mesh of [body, garments]) {
    const g = mesh.geometry, n = g.attributes.position.count;
    const cls = new Uint8Array(n), bones = mesh.skeleton.bones;
    const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, C = g.attributes.color, P = g.attributes.position;
    for (let i = 0; i < n; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
      const name = bones[best].name;
      if (mesh === body) {
        // The body is under the clothes everywhere but the boots (zone colour b below 0.6 m, materials.js).
        if (C && P.getY(i) < 0.6) {
          const r = C.getX(i), gg = C.getY(i), b = C.getZ(i);
          if (b > (r + gg) && b > 0.2) cls[i] = /_l$/.test(name) ? CLASS.boot_l : CLASS.boot_r;
        }
        continue;
      }
      if (/^(index|middle|ring|pinky)/.test(name)) cls[i] = CLASS.finger;
      else if (/^(hand|thumb)/.test(name)) cls[i] = CLASS.hand;
      else if (/^(Head|neck)/.test(name)) cls[i] = CLASS.none;
      else cls[i] = CLASS.body;
    }
    out.push({ mesh, cls });
  }
  return out;
}

// ------------------------------------------------------------------ measurement
const _v = new THREE.Vector3(), _l = new THREE.Vector3(), _inv = new THREE.Matrix4();
const SEAT = { ski: 0.033, snowboard: 0.026 };   // binding plate top above the base (models.js)
export function measure(rider, meshes) {
  rider.root.updateMatrixWorld(true);
  const type = rider.equip.type;
  const parts = type === 'ski'
    ? rider.skis.map((s, i) => ({ obj: s, geo: s.children[0].geometry, foot: i === 0 ? CLASS.boot_r : CLASS.boot_l }))   // left ski (visual −X) = rider's right? (resolved below)
    : [{ obj: rider.board, geo: rider.board.children[0].geometry, foot: -1 }];
  // Visual −X is the armature +X side = the rider's left (rider.js). Ski 0 sits at −X → the left boot.
  if (type === 'ski') { parts[0].foot = CLASS.boot_l; parts[1].foot = CLASS.boot_r; }
  for (const p of parts) { p.inv = _inv.clone().copy(p.obj.matrixWorld).invert(); p.t = plankTable(p.geo); }
  const r = { body: 0, hand: 0, sunk: 0, base: 0, gap: 0, bodyAt: null };
  const soleMin = new Map();   // own boot: lowest point above its plank (part-foot key)
  for (const { mesh, cls } of meshes) {
    const P = mesh.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const c = cls[i];
      if (!c) continue;
      _v.fromBufferAttribute(P, i);
      mesh.applyBoneTransform(i, _v);
      _v.applyMatrix4(mesh.matrixWorld);
      for (const p of parts) {
        _l.copy(_v).applyMatrix4(p.inv);
        const row = rowAt(p.t, _l.z);
        if (!row) continue;
        const ax = Math.abs(_l.x);
        if (c === CLASS.boot_l || c === CLASS.boot_r) {
          const own = p.foot === -1 || p.foot === c;
          // Below the base anywhere along the plank (a boot wider than a ski hangs below it at the sides too).
          if (own && ax < row.hw + 0.06) r.base = Math.max(r.base, row.base - _l.y);
          if (ax > row.hw) continue;
          if (own) { const sk = Math.min(SEAT[type] - _l.y, 0.2); if (sk > r.sunk) { r.sunk = sk; r.sunkAt = [c === CLASS.boot_l ? 'L' : 'R', ..._l.toArray().map((x) => +x.toFixed(3)), parts.indexOf(p)]; } const key = parts.indexOf(p) * 10 + c; soleMin.set(key, Math.min(soleMin.get(key) ?? 1e9, _l.y)); }
          else if (_l.y < row.top && _l.y > row.top - 0.6) {   // a boot through the other ski
            const d = Math.min(row.top - _l.y, row.hw - ax);
            if (d > r.body) { r.body = d; r.bodyAt = ['boot-vs-other-ski', ..._l.toArray().map((x) => +x.toFixed(3)), parts.indexOf(p)]; }
          }
          continue;
        }
        if (ax > row.hw) continue;
        if (c === CLASS.hand || c === CLASS.finger) {
          // Inside the plank's volume; under the base a grip may wrap 3 cm round the edge (fingers under it).
          if (_l.y < row.top && _l.y > row.base - 0.06) {
            // (fingers curling under the edge from below the slab's middle: a grip, up to 3 cm in)
            const wrap = _l.y < row.base || (c === CLASS.finger && _l.y < (row.base + row.top) / 2);
            const d = Math.min(row.top - _l.y, row.hw - ax) - (wrap ? 0.03 : 0);
            if (d > r.hand) { r.hand = d; r.handAt = [..._l.toArray().map((x) => +x.toFixed(3)), +row.hw.toFixed(3), +row.top.toFixed(3), +row.base.toFixed(3), parts.indexOf(p)]; }
          }
          continue;
        }
        if (_l.y < row.top && _l.y > row.top - 0.6) {
          const d = Math.min(row.top - _l.y, row.hw - ax);
          if (d > r.body) { r.body = d; r.bodyAt = [mesh.name || 'body', i, ..._l.toArray().map((x) => +x.toFixed(3)), +row.top.toFixed(3), parts.indexOf(p)]; }
        }
      }
    }
  }
  for (const y of soleMin.values()) r.gap = Math.max(r.gap, y - SEAT[type]);
  for (const k of ['body', 'hand', 'sunk', 'base', 'gap']) r[k] = Math.max(0, r[k]) * 100;   // cm
  return r;
}

