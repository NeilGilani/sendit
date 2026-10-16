// The designed forest of Blackspruce Plunge. planForest() is pure (no scene, no terrain): it plants
// trees by variable-radius dart throwing (Poisson-disk-like) over the face, keeping the lanes,
// clearings, kickers, logs and the rock band clear, then puts pivot obstacles in the lanes, marker
// trees at the lane mouths, stumps and band rocks. The headless bot uses the same plan.
// populateForest() hands it to scatter.js (instanced trees / boulders + collision hash) and builds
// the log and stump meshes.
//
// Hitboxes: a tree collides with its trunk and the dense inner crown (TREE_HIT), well inside the
// branch tips — brushing needles is a close shave, not a crash. Boulders collide at their visible
// footprint, stumps at their radius. Logs are part of the height field (you ride over them).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, mulberry32 } from '../../world.js';
import { SECTIONS, CLEARINGS, BAND, STUMPS, KICKERS, ROLLERS, GATES } from './layout.js';

export const TREE_HIT = { base: 0.2, perWidth: 0.32 };   // hitbox radius = base + perWidth · crown width scale
const ZONE = 150;                   // |d| metres covered by the designed forest (the generic one starts beyond)

const smooth = (t) => { const x = t < 0 ? 0 : t > 1 ? 1 : t; return x * x * (3 - 2 * x); };
function sectionAt(t) { return SECTIONS.find((s) => t >= s.t0 && t < s.t1) || SECTIONS[SECTIONS.length - 1]; }

/** 1 inside a clearing ellipse (with a soft margin `m` metres), else 0. */
function inClearing(t, d, m = 0) {
  for (const [ct, cd, a, b] of CLEARINGS) {
    const q = ((t - ct) / (a + m)) ** 2 + ((d - cd) / (b + m)) ** 2;
    if (q < 1) return true;
  }
  return false;
}

export function planForest(course) {
  // One random stream per phase, so tuning one phase doesn't reshuffle the others.
  let rnd = mulberry32(31337);
  const trees = [], rocks = [], stumps = [], pivots = [];
  // Occupancy hash of everything planted: [x, z, radius]
  const H = 6, occ = new Map();
  const key = (x, z) => Math.floor(x / H) * 100003 + Math.floor(z / H);
  const put = (x, z, r) => { const k = key(x, z); if (!occ.has(k)) occ.set(k, []); occ.get(k).push([x, z, r]); };
  const near = (x, z, R) => {
    const cx = Math.floor(x / H), cz = Math.floor(z / H), n = Math.ceil(R / H);
    for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
      const a = occ.get((cx + i) * 100003 + cz + j);
      if (a) for (const o of a) if (Math.hypot(x - o[0], z - o[1]) < R) return true;
    }
    return false;
  };
  const p = { x: 0, z: 0 };
  const lanes = course.lanes;
  /** Distance from a lane's clear edge (negative = inside the corridor). */
  const laneGap = (t, d) => {
    let g = Infinity;
    for (const L of lanes) {
      const l = course.laneAt(L, t);
      if (l) g = Math.min(g, Math.abs(d - l.d) - l.hw);
    }
    return g;
  };
  // Kicker footprints + run-ins + landings (run coordinates around the main line).
  const kickZones = KICKERS.map((k) => ({ t0: k.t - 30, t1: k.t + k.L + 40, d: course.laneAt(course.mainLane, k.t).d + k.lateral, hw: k.W / 2 + 5 }));
  const logZone = (t, d) => course.logs.some((L) => {
    course.world(t, d, p);
    const dx = p.x - L.x, dz = p.z - L.z;
    return Math.abs(dx * L.ax + dz * L.az) < L.len / 2 + 0.5 && Math.abs(dx * L.nx + dz * L.nz) < 2.6;
  });
  const features = (t, d) => (Math.abs(t - BAND.t) < 5 && course.bandMask(d) > 0.2)
    || kickZones.some((z) => t > z.t0 && t < z.t1 && Math.abs(d - z.d) < z.hw) || logZone(t, d);
  const blocked = (t, d, r) => inClearing(t, d) || laneGap(t, d) < r || features(t, d);
  const noise = (t, d) => hashNoise(t / 23, d / 23);

  rnd = mulberry32(101);
  // ---- marker trees: big trees framing each lane mouth (readable entrances)
  for (const L of lanes) {
    if (L.kind === 'main') continue;
    for (const end of [L.t0 + 34, L.t1 - 22]) {   // where the lane has split off / before it merges
      const l = course.laneAt(L, end);
      for (const side of [-1, 1]) {
        const sc = 1.35 + rnd() * 0.15, sx = sc * 0.82;
        const hit = TREE_HIT.base + TREE_HIT.perWidth * sx;
        const d = l.d + side * (l.hw + hit + 0.4);
        if (inClearing(end, d) || laneGap(end, d) < hit * 0.9) continue;
        course.world(end, d, p);
        if (near(p.x, p.z, 2.5)) continue;
        trees.push([p.x, p.z, sc, sx, sc * 1.05, 0, rnd() * 6.28, hit, 1]);
        put(p.x, p.z, hit);
      }
    }
  }

  rnd = mulberry32(202);
  // ---- pivots: one obstacle in the middle of a main / safe lane every so often (pick a side)
  for (const L of lanes) {
    if (L.kind === 'slot') continue;
    let side = rnd() < 0.5 ? -1 : 1;
    for (let t = L.t0 + 30; t < L.t1 - 20;) {
      const S = sectionAt(t);
      if (!S.pivotEvery) { t += 10; continue; }
      const l = course.laneAt(L, t);
      // Fair pivots: seen ≥ 2 s ahead, never right after a gate, a section start, or anything that
      // throws the rider into the air (rollers, logs, kickers, the band).
      const ok = l.hw >= 3.7 && t > S.t0 + 30 && !inClearing(t, l.d, 22) && !logZone(t, l.d)
        && !course.logs.some((g) => t > g.t - 14 && t < g.t + 26)
        && !ROLLERS.some((r) => t > r[0] - 10 && t < r[0] + 55)
        && !GATES.some((g) => Math.abs(g[0] - t) < 25)
        && !(t > BAND.t - 20 && t < BAND.t + 40)
        && !kickZones.some((z) => t > z.t0 - 20 && t < z.t1 + 10);
      if (ok) {
        const off = side * l.hw * (0.18 + rnd() * 0.17);
        side = -side;
        const d = l.d + off;
        course.world(t, d, p);
        const r = rnd();
        if (r < 0.72 || l.hw < 4.5) {   // rocks only where the lane is wide enough to go round them
          const sc = S.scale[0] + (S.scale[1] - S.scale[0]) * (0.5 + 0.5 * rnd()), sx = Math.min(0.62, sc * S.slim);
          const hit = TREE_HIT.base + TREE_HIT.perWidth * sx;
          trees.push([p.x, p.z, sc, sx, sc * (0.95 + rnd() * 0.2), rnd() < 0.25 ? 1 : 0, rnd() * 6.28, hit, 0]);
          put(p.x, p.z, hit);
          pivots.push([p.x, p.z, hit, 'tree', t, L.id]);
        } else {
          const sc = 0.6 + rnd() * 0.22;   // sunk 0.3·sc into the snow: hitbox ≈ the visible footprint
          rocks.push([p.x, p.z, sc, rnd() * 6.28, Math.floor(rnd() * 3), 1.0 * sc]);
          put(p.x, p.z, 1.0 * sc);
          pivots.push([p.x, p.z, 1.0 * sc, 'rock', t, L.id]);
        }
        t += S.pivotEvery * (0.8 + rnd() * 0.4);
      } else t += 6;
    }
  }

  rnd = mulberry32(303);
  // ---- the rock band: boulders on the cliff edge away from every line, and flanking the chutes
  for (let d = -BAND.reach - 10; d < BAND.reach + 10; d += 3 + rnd() * 3.5) {
    const m = course.bandMask(d);
    if (m < 0.5 || laneGap(BAND.t, d) < 4 || laneGap(BAND.t + 6, d) < 4) continue;
    const t = BAND.t + 0.5 + rnd() * 2.5;
    const sc = 0.8 + rnd() * 0.9;
    course.world(t, d, p);
    rocks.push([p.x, p.z, sc, rnd() * 6.28, Math.floor(rnd() * 3), 1.1 * sc]);
    put(p.x, p.z, 1.1 * sc);
  }
  for (const [c, hw] of BAND.chutes) {
    for (const side of [-1, 1]) {
      const d = c + side * (hw + 2.4);
      if (laneGap(BAND.t, d) < 1.2) continue;
      course.world(BAND.t + 2, d, p);
      const sc = 1.1 + rnd() * 0.4;
      rocks.push([p.x, p.z, sc, rnd() * 6.28, Math.floor(rnd() * 3), 1.1 * sc]);
      put(p.x, p.z, 1.1 * sc);
    }
  }

  rnd = mulberry32(404);
  // ---- the forest: dart throwing on a jittered 2 m grid, in random order
  const cands = [];
  const tEnd = course.P.finishT + 320;
  for (let t = -90; t < tEnd; t += 2) {
    for (let d = -ZONE; d < ZONE; d += 2) cands.push([t + rnd() * 2, d + rnd() * 2, rnd()]);
  }
  cands.sort((a, b) => a[2] - b[2]);
  for (const [t, d] of cands) {
    const S = sectionAt(t);
    const n = noise(t, d);
    // Spacing: section base, clumped by noise, a bit denser toward the walls beyond the face.
    const W = course.at(course.W, t);
    const wall = smooth((Math.abs(d) - W * 0.6) / 40);
    const g0 = laneGap(t, d);
    let spacing = S.spacing * (0.82 + 0.4 * n) * (1 - 0.2 * wall);
    // Perf: the woods far from every line are backdrop (hidden behind the lane-edge trees from the
    // rider's eye), so they thin out with distance from the nearest lane.
    spacing *= 1 + Math.min(0.9, Math.max(0, g0 - 9) * 0.05);
    if (Math.abs(d) > W + 20) spacing = Math.max(spacing, 8.5);   // far side: cheaper, sparser
    // Young spruce fill the understorey of the dense sections (they collide like any other tree).
    const young = S.spacing < 6 && g0 < 9 && rnd() < 0.08;
    const sc = young ? 0.42 + rnd() * 0.2 : S.scale[0] + (S.scale[1] - S.scale[0]) * Math.pow(rnd(), 0.9);
    let sx = sc * S.slim * (0.9 + rnd() * 0.2);
    // Trees lining a lane are narrow spires (a limbed glade): their crowns barely reach into the
    // corridor, so the line stays readable and the chase camera stays out of the needles.
    const g = g0;
    if (g < 4) sx = Math.min(sx, Math.max(0.36, (g + 0.7) / 2.6));
    const hit = TREE_HIT.base + TREE_HIT.perWidth * sx;
    if (blocked(t, d, hit)) continue;
    course.world(t, d, p);
    if (near(p.x, p.z, spacing)) continue;
    trees.push([p.x, p.z, sc, sx, sc * (0.92 + rnd() * 0.22), rnd() < (S.name === 'Old Growth' ? 0.4 : 0.22) ? 1 : 0, rnd() * 6.28, hit, 0]);
    put(p.x, p.z, hit);
  }

  rnd = mulberry32(505);
  // ---- stumps: in the woods and at lane edges (never in a lane's middle half)
  for (const S of SECTIONS) {
    const n = STUMPS.perSection[S.name] || 0;
    for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
      const t = S.t0 + rnd() * (S.t1 - S.t0);
      const d = (rnd() - 0.5) * 70;
      let inLane = false;
      for (const L of lanes) {
        const l = course.laneAt(L, t);
        if (l && Math.abs(d - l.d) < (L.kind === 'slot' ? l.hw + 0.6 : l.hw * 0.75)) inLane = true;
      }
      if (inLane || inClearing(t, d, 4) || features(t, d)) continue;
      course.world(t, d, p);
      if (near(p.x, p.z, 2.2)) continue;
      const r = 0.24 + rnd() * 0.16;
      stumps.push([p.x, p.z, r, 0.45 + rnd() * 0.4, rnd() * 6.28]);
      put(p.x, p.z, r);
      k++;
    }
  }
  return { trees, rocks, stumps, pivots };
}

function hashNoise(x, y) {
  const h = (i, j) => { let v = (i * 374761393 + j * 668265263) | 0; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), j = Math.floor(y);
  let fx = x - i, fy = y - j;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return (h(i, j) * (1 - fx) + h(i + 1, j) * fx) * (1 - fy) + (h(i, j + 1) * (1 - fx) + h(i + 1, j + 1) * fx) * fy;
}

/** Every collision circle of the plan: [x, z, radius, kind] (scatter.js obstacle format). */
export function forestObstacles(course) {
  const F = course.forest;
  return [
    ...F.trees.map(([x, z, , , , , , hit]) => [x, z, hit, 'tree']),
    ...F.rocks.map(([x, z, , , , hit]) => [x, z, hit, 'rock']),
    ...F.stumps.map(([x, z, r]) => [x, z, r + 0.05, 'stump']),
  ];
}

// ------------------------------------------------------------------ into the scene
export function populateForest(course, scatter) {
  const T = scatter.terrain, F = course.forest;
  for (const [x, z, sc, sx, sy, kind, yaw] of F.trees) {
    if (!T.isInside(x, z, 20)) continue;
    scatter.trees.add(x, T.getHeight(x, z) - 0.3, z, yaw, sx, sy, sx, kind);
    (scatter.wells || (scatter.wells = [])).push([x, z, sc]);
  }
  for (const o of forestObstacles(course)) scatter.addObstacle(...o);
  const q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3(), m = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
  for (const [x, z, sc, yaw, variant] of F.rocks) {
    T.getNormal(x, z, 2, n);
    q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, yaw));
    pv.set(x, T.getHeight(x, z) - 0.3 * sc, z);
    s.set(sc * 1.05, sc * 0.95, sc);
    scatter.add('rock', variant, x, z, m.compose(pv, q, s));
  }
  scatter.group.add(buildWood(course, T));
}

/** Logs (bark cylinders sitting in their drifts) and stumps, one InstancedMesh each. */
function buildWood(course, T) {
  const g = new THREE.Group();
  g.name = 'Deadwood';
  const bark = new THREE.Color('#4a3a2c'), barkDark = new THREE.Color('#33281f'), snow = new THREE.Color('#eef3fa'), wood = new THREE.Color('#6e5638');
  const paint = (geo, fn) => {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    const c = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k++) {
      const col = fn(pos.getX(k), pos.getY(k), pos.getZ(k), nor.getX(k), nor.getY(k), nor.getZ(k));
      c[k * 3] = col.r; c[k * 3 + 1] = col.g; c[k * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return geo;
  };
  const mat = toonMaterial({ name: 'deadwood', vertexColors: true });
  // Unit log along +X, radius 1, with a snow crest on top and a few broken branch stubs.
  const logGeo = (() => {
    const body = new THREE.CylinderGeometry(1, 1, 1, 10, 6, false).rotateZ(Math.PI / 2).toNonIndexed();
    const p = body.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
      const a = Math.atan2(z, y);
      const r = 1 + 0.06 * Math.sin(a * 5 + x * 9) + 0.04 * Math.sin(x * 23);
      p.setY(k, y * r); p.setZ(k, z * r);
    }
    body.computeVertexNormals();
    // Bark dominates (a dark line across the snow reads from far away); snow only in patches along the top.
    paint(body, (x, y, z, nx, ny) => (Math.abs(x) > 0.49 ? wood : ny > 0.8 && Math.sin(x * 23) + Math.sin(x * 57 + 1.3) > 0.2 ? snow : (Math.sin(x * 40 + z * 7) > 0.6 ? barkDark : bark)));
    const stub = new THREE.CylinderGeometry(0.08, 0.16, 1.1, 5).toNonIndexed();
    stub.rotateZ(0.9).translate(0.2, 0.8, 0.3);
    stub.computeVertexNormals();
    paint(stub, () => barkDark);
    const stub2 = stub.clone().rotateY(2.4).translate(-0.6, 0, 0);
    return mergeGeometries([body, stub, stub2]);
  })();
  const stumpGeo = (() => {
    const body = new THREE.CylinderGeometry(1, 1.15, 1, 9, 2, false).toNonIndexed();
    body.translate(0, 0.5, 0);
    body.computeVertexNormals();
    paint(body, (x, y, z, nx, ny) => (ny > 0.5 ? snow : Math.sin(Math.atan2(z, x) * 7) > 0.5 ? barkDark : bark));
    const cap = new THREE.SphereGeometry(1.08, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
    cap.scale(1, 0.35, 1).translate(0, 1, 0);
    cap.computeVertexNormals();
    paint(cap, () => snow);
    return mergeGeometries([body, cap]);
  })();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const logs = new THREE.InstancedMesh(logGeo, mat, course.logs.length);
  course.logs.forEach((L, i) => {
    // Sit the log in its drift: crest of the bump ≈ log top.
    const base = T.getHeight(L.x + L.nx * 1.2, L.z + L.nz * 1.2);
    const top = T.getHeight(L.x, L.z);
    p.set(L.x, Math.max(base + L.r * 0.45, top - L.r + 0.22), L.z);   // top ≈ 0.2 m above the drift crest
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(L.az, L.ax));
    s.set(L.len, L.r, L.r);
    logs.setMatrixAt(i, m.compose(p, q, s));
  });
  const st = course.forest.stumps;
  const stumps = new THREE.InstancedMesh(stumpGeo, mat, Math.max(1, st.length));
  st.forEach(([x, z, r, h, yaw], i) => {
    p.set(x, T.getHeight(x, z) - 0.15, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    s.set(r, h, r);
    stumps.setMatrixAt(i, m.compose(p, q, s));
  });
  stumps.count = st.length;
  for (const im of [logs, stumps]) { im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); g.add(im); }
  return g;
}
