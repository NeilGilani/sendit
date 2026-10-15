// Stylized alpine scatter, all InstancedMesh, bucketed per 750 m cell (frustum + distance culled):
//  - faceted low-poly pines with snow-loaded tiers and organic wind sway
//  - frozen rock formations: chunky cel boulders with snow caps + icy crystal shards
//  - wooden fencing along the opening run and along nearby ridge crests
// The data set (OSM-derived trees/rocks) is topped up around the opening run with dense clusters
// driven by the SPAWN parameters in scene.js. Also an obstacle hash for collisions and close shaves.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, outlineMaterial, mulberry32 } from './world.js';
import { SPAWN, col } from './scene.js';

const HASH = 16;
const CELL = 750;
const DEG = Math.PI / 180;

export class Scatter {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Scatter';
    this.hash = new Map();
    this.cells = [];
    this.buckets = new Map();
    this.treeDistance = 3000;
    this.rockDistance = 1400;
  }

  async load(_loader, data) {
    const T = this.terrain;
    const rnd = mulberry32(5);
    this.rnd = rnd;
    this.geos = {
      tree: [pineGeometry(4, 1.0, rnd), pineGeometry(5, 1.15, rnd), pineGeometry(3, 0.85, rnd), pineGeometry(6, 1.3, rnd)],
      rock: [rockGeometry(1, rnd), rockGeometry(2, rnd), rockGeometry(1, rnd)],
      ice: [iceGeometry(5, rnd), iceGeometry(6, rnd)],
      post: [postGeometry()],
      rail: [railGeometry()],
    };
    const treeMat = toonMaterial({
      name: 'pine', vertexColors: true, rim: 0.25,
      vertPre: /* glsl */`
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float sway = sin(uTime * uWind.x + ip.x * 0.05 + ip.z * 0.07 + position.y * 0.15) * uWind.y;
        float bend = max(position.y - 1.2, 0.0);
        transformed.x += sway * bend;
        transformed.z += cos(uTime * uWind.x * 0.8 + ip.z * 0.05) * uWind.y * 0.6 * bend;`,
    });
    treeMat.flatShading = true;
    const rockMat = toonMaterial({ name: 'rock', vertexColors: true });
    rockMat.flatShading = true;
    const iceMat = toonMaterial({ name: 'ice', color: col(SPAWN.iceTint), rim: 1.0 });
    iceMat.flatShading = true;
    const woodMat = toonMaterial({ name: 'fence', vertexColors: true });
    woodMat.flatShading = true;
    this.mats = { tree: treeMat, rock: rockMat, ice: iceMat, post: woodMat, rail: woodMat };

    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    for (const t of data.trees) {
      const scale = t[4] * 0.95;
      q.setFromAxisAngle(up, t[3]);
      p.set(t[0], T.getHeight(t[0], t[2]) - 0.3, t[2]);
      s.set(scale * (0.9 + rnd() * 0.25), scale, scale * (0.9 + rnd() * 0.25));
      this.add('tree', t[5] % 3, t[0], t[2], m.compose(p, q, s));
      this.addObstacle(t[0], t[2], 0.4 * scale, 'tree');
    }
    for (const r of data.rocks) {
      const scale = r[4] * 0.9;
      T.getNormal(r[0], r[2], 2, n);
      q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, r[3]));
      p.set(r[0], T.getHeight(r[0], r[2]) - 0.3 * scale, r[2]);
      s.set(scale * 1.2, scale * 0.8, scale);
      this.add('rock', r[5] % 2, r[0], r[2], m.compose(p, q, s));
      this.addObstacle(r[0], r[2], 0.95 * scale, 'rock');
    }
  }

  /** Queue one instance (flushed into InstancedMeshes by flush()). */
  add(kind, variant, x, z, matrix) {
    const T = this.terrain;
    const key = `${kind}|${variant}|${Math.floor((x + T.half) / CELL)}|${Math.floor((z + T.half) / CELL)}`;
    let b = this.buckets.get(key);
    if (!b) { b = { kind, variant, list: [], cx: 0, cz: 0 }; this.buckets.set(key, b); }
    b.list.push(matrix.clone());
    b.cx += x; b.cz += z;
  }

  flush() {
    for (const b of this.buckets.values()) {
      const im = new THREE.InstancedMesh(this.geos[b.kind][b.variant], this.mats[b.kind], b.list.length);
      b.list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData = { kind: b.kind, center: new THREE.Vector2(b.cx / b.list.length, b.cz / b.list.length) };
      this.group.add(im);
      this.cells.push(im);
    }
    this.buckets.clear();
  }

  /**
   * Dense hand-placed look around the opening run (`path`: Vector2 x/z polyline from the top):
   * clustered pine stands, frozen rock formations, fencing along the run and the ridge crests.
   */
  addEnvironment(path, course = null) {
    const real = !!(course && course.forestAt);
    const water = course?.water ?? -1e5;
    const treeTop = real ? course.treeline : SPAWN.treeMaxAltitude;
    const thinFrom = real ? course.treeline - 250 : SPAWN.treeThinFrom;
    const T = this.terrain;
    const rnd = mulberry32(911);
    const S = SPAWN;
    // Path samples (every 6 m) in a coarse hash for fast "distance to run" queries.
    const samples = [];
    let run = 0;
    for (let i = 0; i < path.length - 1 && run < S.runLength; i++) {
      const a = path[i], b = path[i + 1], L = a.distanceTo(b);
      for (let d = 0; d < L; d += 6) samples.push([a.x + (b.x - a.x) * d / L, a.y + (b.y - a.y) * d / L, run + d]);
      run += L;
    }
    if (!samples.length) { this.flush(); return; }
    const PH = 48, ph = new Map();
    for (const sp of samples) {
      const k = `${Math.floor(sp[0] / PH)},${Math.floor(sp[1] / PH)}`;
      if (!ph.has(k)) ph.set(k, []);
      ph.get(k).push(sp);
    }
    const runDist = (x, z) => {
      const cx = Math.floor(x / PH), cz = Math.floor(z / PH);
      let best = Infinity;
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        const a = ph.get(`${cx + dx},${cz + dz}`);
        if (a) for (const sp of a) best = Math.min(best, Math.hypot(x - sp[0], z - sp[1]));
      }
      return best;
    };
    let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
    for (const sp of samples) { minX = Math.min(minX, sp[0]); maxX = Math.max(maxX, sp[0]); minZ = Math.min(minZ, sp[1]); maxZ = Math.max(maxZ, sp[1]); }
    minX -= S.region; minZ -= S.region; maxX += S.region; maxZ += S.region;
    const noise = valueNoise2D(4242);
    const surf = new THREE.Vector4(), n = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
    const cosTree = Math.cos(S.treeMaxSlope * DEG);

    // ---- pine stands (candidates first, then an even subsample if over budget)
    const cands = [];
    for (let z = minZ; z < maxZ; z += S.treeStep) {
      for (let x = minX; x < maxX; x += S.treeStep) {
        const tx = x + (rnd() - 0.5) * S.treeStep * 0.9, tz = z + (rnd() - 0.5) * S.treeStep * 0.9;
        if (!T.isInside(tx, tz, 20)) continue;
        const h = T.baseHeight(tx, tz);
        if (h > treeTop || h < water + 3) continue;
        const cluster = noise(tx * S.treeClusterScale, tz * S.treeClusterScale) * 0.75 + noise(tx * S.treeClusterScale * 3.1 + 7, tz * S.treeClusterScale * 3.1) * 0.25;
        const thin = 1 - smooth(thinFrom, treeTop, h);
        if (real) {
          // Real mountains: dense where OpenStreetMap maps forest, scattered elsewhere; runs stay clear.
          const f = course.forestAt(tx, tz);
          if (rnd() > (f > 0.5 ? 0.85 : 0.1 + 0.25 * cluster) * thin) continue;
          if (course.pisteAt(tx, tz) > 0.3) continue;
        } else {
          if (cluster < S.treeClusterThreshold + (1 - thin) * 0.15) continue;
          if (rnd() > S.treeDensity * thin) continue;
        }
        T.getNormal(tx, tz, 3, n);
        if (n.y < cosTree) continue;
        T.getSurface(tx, tz, surf);
        if (surf.x > S.pisteClear || surf.z > 0.35) continue;
        const rd = runDist(tx, tz);
        if (rd < S.runCorridor) continue;
        if (this.findObstacle({ x: tx, z: tz }, 1.2)) continue;
        if ((this.clearings || []).some(([cx, cz, r]) => Math.hypot(tx - cx, tz - cz) < r)) continue;
        cands.push([tx, tz, thin, rd]);
      }
    }
    // Over budget: keep everything close to the run, thin the far stands evenly.
    cands.sort((a, b) => a[3] - b[3]);
    const keepNear = Math.floor(S.treeMax * 0.5);
    const farStep = Math.max(1, (cands.length - keepNear) / Math.max(1, S.treeMax - keepNear));
    const chosen = cands.slice(0, keepNear);
    for (let f = keepNear; f < cands.length && chosen.length < S.treeMax; f += farStep) chosen.push(cands[Math.floor(f)]);
    let trees = 0;
    for (const [tx, tz, thin] of chosen) {
      const sc = S.treeScale[0] + (S.treeScale[1] - S.treeScale[0]) * Math.pow(rnd(), 0.8) * (0.6 + 0.4 * thin);
      q.setFromAxisAngle(up, rnd() * Math.PI * 2);
      p.set(tx, T.getHeight(tx, tz) - 0.3, tz);
      s.set(sc * (0.88 + rnd() * 0.25), sc * (0.9 + rnd() * 0.2), sc * (0.88 + rnd() * 0.25));
      this.add('tree', Math.floor(rnd() * 4), tx, tz, m.compose(p, q, s));
      this.addObstacle(tx, tz, 0.4 * sc, 'tree');
      trees++;
    }

    // ---- rock formations (warm brown boulder clusters with snow caps)
    const cMin = Math.cos(S.rockMinSlope * DEG), cMax = Math.cos(S.rockMaxSlope * DEG);
    let formations = 0;
    for (let z = minZ; z < maxZ; z += S.rockClusterStep) {
      for (let x = minX; x < maxX; x += S.rockClusterStep) {
        if (rnd() > S.rockClusterChance) continue;
        const cx = x + (rnd() - 0.5) * S.rockClusterStep, cz = z + (rnd() - 0.5) * S.rockClusterStep;
        if (!T.isInside(cx, cz, 20)) continue;
        T.getNormal(cx, cz, 4, n);
        T.getSurface(cx, cz, surf);
        const steep = n.y < cMin && n.y > cMax;
        if (!steep && surf.z < 0.3) continue;
        if (surf.x > S.pisteClear) continue;
        if (runDist(cx, cz) < S.runCorridor + 4) continue;
        if ((this.clearings || []).some(([qx, qz, r]) => Math.hypot(cx - qx, cz - qz) < r + 5)) continue;
        formations++;
        const count = S.rockPerCluster[0] + Math.floor(rnd() * (S.rockPerCluster[1] - S.rockPerCluster[0] + 1));
        for (let i = 0; i < count; i++) {
          const a = rnd() * Math.PI * 2, r = rnd() * 4.5;
          const rx = cx + Math.cos(a) * r, rz = cz + Math.sin(a) * r;
          const sc = S.rockScale[0] + (S.rockScale[1] - S.rockScale[0]) * rnd() * rnd() * (i === 0 ? 1.6 : 1);
          T.getNormal(rx, rz, 2, n);
          q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, rnd() * 6.28));
          p.set(rx, T.getHeight(rx, rz) - 0.35 * sc, rz);
          s.set(sc * (1.0 + rnd() * 0.5), sc * (0.6 + rnd() * 0.5), sc * (0.9 + rnd() * 0.4));
          this.add('rock', Math.floor(rnd() * 3), rx, rz, m.compose(p, q, s));
          this.addObstacle(rx, rz, 0.95 * sc, 'rock');
        }
        const shards = S.iceShardsPerCluster[0] + Math.floor(rnd() * (S.iceShardsPerCluster[1] - S.iceShardsPerCluster[0] + 1));
        for (let i = 0; i < shards; i++) {
          const a = rnd() * Math.PI * 2, r = 1 + rnd() * 3.5;
          const ix = cx + Math.cos(a) * r, iz = cz + Math.sin(a) * r;
          const sc = 0.6 + rnd() * 1.1;
          q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.7, rnd() * 6.28, (rnd() - 0.5) * 0.7));
          p.set(ix, T.getHeight(ix, iz) - 0.2, iz);
          s.set(sc, sc * (0.8 + rnd() * 0.7), sc);
          this.add('ice', Math.floor(rnd() * 2), ix, iz, m.compose(p, q, s));
          this.addObstacle(ix, iz, 0.3 * sc, 'rock');
        }
      }
    }

    // ---- wooden fencing along both sides of the opening run
    const posts = [];
    for (const side of [-1, 1]) {
      let line = [];
      for (let i = 0; i < samples.length - 1; i++) {
        const sp = samples[i];
        if (sp[2] < S.fenceFrom || sp[2] > S.fenceTo) continue;
        const nx = samples[i + 1][0] - sp[0], nz = samples[i + 1][1] - sp[1];
        const L = Math.hypot(nx, nz) || 1;
        const fx = sp[0] + (-nz / L) * side * S.fenceOffset, fz = sp[1] + (nx / L) * side * S.fenceOffset;
        const last = line[line.length - 1];
        if (last && Math.hypot(fx - last[0], fz - last[1]) < S.fenceSpacing) continue;
        if (runDist(fx, fz) < S.fenceOffset - 3 || this.findObstacle({ x: fx, z: fz }, 0.6)) {
          if (line.length > 1) posts.push(line);
          line = [];
          continue;
        }
        line.push([fx, fz]);
      }
      if (line.length > 1) posts.push(line);
    }

    // ---- wooden fencing along nearby ridge crests
    const dirs = [[1, 0], [0, 1], [0.7071, 0.7071], [0.7071, -0.7071]];
    let crestSegs = 0;
    const off = 16;
    for (let z = minZ; z < maxZ && crestSegs < (real ? 0 : S.ridgeFenceMax); z += S.ridgeFenceStep) {
      for (let x = minX; x < maxX && crestSegs < S.ridgeFenceMax; x += S.ridgeFenceStep) {
        const cx = x + (rnd() - 0.5) * 10, cz = z + (rnd() - 0.5) * 10;
        if (!T.isInside(cx, cz, 60)) continue;
        const h0 = T.baseHeight(cx, cz);
        if (h0 > 3500) continue;
        let bestD = null, bestP = 0;
        for (const d of dirs) {
          const prom = h0 - Math.max(T.baseHeight(cx + d[0] * off, cz + d[1] * off), T.baseHeight(cx - d[0] * off, cz - d[1] * off));
          if (prom > bestP) { bestP = prom; bestD = d; }
        }
        if (!bestD || bestP < S.ridgeFenceProminence) continue;
        // Crest runs perpendicular to the direction it stands out across.
        const ax = -bestD[1], az = bestD[0];
        const along = Math.abs(T.baseHeight(cx + ax * off, cz + az * off) - T.baseHeight(cx - ax * off, cz - az * off)) / (2 * off);
        if (along > 0.45) continue;
        if (runDist(cx, cz) < S.runCorridor) continue;
        T.getSurface(cx, cz, surf);
        if (surf.z > 0.4) continue;
        const line = [];
        for (let i = 0; i < S.ridgeFencePosts; i++) {
          const t = (i - (S.ridgeFencePosts - 1) / 2) * S.fenceSpacing;
          // Snap each post to the local crest (highest point across the ridge).
          let px = cx + ax * t, pz = cz + az * t, ph = -Infinity, bx = px, bz = pz;
          for (let k = -2; k <= 2; k++) {
            const qx = px + bestD[0] * k * 1.5, qz = pz + bestD[1] * k * 1.5;
            const qh = T.baseHeight(qx, qz);
            if (qh > ph) { ph = qh; bx = qx; bz = qz; }
          }
          line.push([bx, bz]);
        }
        posts.push(line);
        crestSegs++;
      }
    }
    for (const line of posts) this.addFence(line);
    this.flush();
    this.envStats = { trees, formations, fences: posts.length, crestSegs };
  }

  /** Posts + two rails between consecutive posts, snow on top. */
  addFence(line) {
    const T = this.terrain;
    const H = SPAWN.fenceHeight;
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0);
    const tops = line.map(([x, z]) => new THREE.Vector3(x, T.getHeight(x, z), z));
    tops.forEach((t, i) => {
      q.setFromAxisAngle(up, i * 1.3);
      s.set(1, 0.92 + ((i * 7) % 5) * 0.04, 1);
      this.add('post', 0, t.x, t.z, m.compose(p.set(t.x, t.y - 0.25, t.z), q, s));
      this.addObstacle(t.x, t.z, 0.12, 'fence');
    });
    for (let i = 0; i < tops.length - 1; i++) {
      const a = tops[i], b = tops[i + 1];
      const d = b.clone().sub(a);
      const len = d.length();
      if (len > SPAWN.fenceSpacing * 2.2) continue;
      d.normalize();
      q.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
      for (const y of [H * 0.42, H * 0.82]) {
        p.copy(a).add(b).multiplyScalar(0.5);
        p.y += y - 0.25;
        s.set(len + 0.12, 1, 1);
        this.add('rail', 0, p.x, p.z, m.compose(p, q, s));
      }
    }
  }

  addObstacle(x, z, r, kind) {
    const k = `${Math.floor(x / HASH)},${Math.floor(z / HASH)}`;
    let a = this.hash.get(k);
    if (!a) { a = []; this.hash.set(k, a); }
    a.push([x, z, r, kind]);
  }

  /** First obstacle overlapping a circle, or null. Each entry: [x, z, radius, kind]. */
  findObstacle(pos, radius) {
    const cx = Math.floor(pos.x / HASH), cz = Math.floor(pos.z / HASH);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = this.hash.get(`${cx + dx},${cz + dz}`);
      if (!a) continue;
      for (const o of a) if (Math.hypot(pos.x - o[0], pos.z - o[1]) < o[2] + radius) return o;
    }
    return null;
  }

  /** Nearest obstacle surface distance within maxR: { dist, o } or null (for close shaves). */
  nearest(pos, maxR) {
    const cx = Math.floor(pos.x / HASH), cz = Math.floor(pos.z / HASH);
    let best = null;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = this.hash.get(`${cx + dx},${cz + dz}`);
      if (!a) continue;
      for (const o of a) {
        const d = Math.hypot(pos.x - o[0], pos.z - o[1]) - o[2];
        if (d < maxR && (!best || d < best.dist)) best = { dist: d, o };
      }
    }
    return best;
  }

  setQuality(q) {
    this.treeDistance = [1800, 3000, 4500][q];
    this.rockDistance = [800, 1400, 2200][q];
  }

  update(cam) {
    for (const im of this.cells) {
      const c = im.userData.center;
      const d = Math.hypot(c.x - cam.x, c.y - cam.z) - CELL * 0.7;
      const kind = im.userData.kind;
      im.visible = d < (kind === 'tree' ? this.treeDistance : kind === 'rock' ? this.rockDistance : this.rockDistance * 0.7);
    }
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

/** Smooth 2D value noise in [0, 1]. */
function valueNoise2D(seed) {
  const hash = (i, j) => {
    let h = (i * 374761393 + j * 668265263 + seed * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const i = Math.floor(x), j = Math.floor(y);
    let fx = x - i, fy = y - j;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
  };
}

/** Faceted pine: brown trunk + jagged cone tiers, deep teal needles with snow loaded on top. */
function pineGeometry(tiers, stretch, rnd) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  paint(trunk, () => [0.16, 0.08, 0.045]);
  const greens = SPAWN.pineGreens.map((h) => { const c = col(h); return [c.r, c.g, c.b]; });
  parts.push(trunk);
  const H = 8.0 * stretch;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (2.6 - t * 1.9) * (0.9 + rnd() * 0.2);
    const h = (H / tiers) * 1.55;
    const y = 1.6 + t * (H - 2.0);
    const cone = new THREE.ConeGeometry(r, h, 7, 2, false);
    const pos = cone.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const py = pos.getY(k);
      if (py < -h * 0.45) {
        const a = Math.atan2(pos.getZ(k), pos.getX(k));
        const jag = 1.0 + 0.18 * Math.sin(a * 7.0 + i);
        pos.setX(k, pos.getX(k) * jag);
        pos.setZ(k, pos.getZ(k) * jag);
        pos.setY(k, py - 0.25 * Math.abs(Math.sin(a * 3.5 + i)));
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y + h / 2, 0);
    paint(cone, (px, py) => {
      const rel = (py - y) / h;
      const snow = rel > 0.5 - 0.12 * Math.sin(px * 3.0) ? 1 : 0;
      return snow ? [0.93, 0.93, 0.92] : (i % 2 ? greens[0] : greens[1]);
    });
    parts.push(cone);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}

/** Chunky low-poly boulder with a snow cap and a few icy faces. */
function rockGeometry(detail, rnd) {
  const ico = new THREE.IcosahedronGeometry(1.3, detail);
  const g = ico.index ? ico.toNonIndexed() : ico;
  const pos = g.attributes.position;
  const seed = rnd() * 10;
  const map = new Map();
  for (let k = 0; k < pos.count; k++) {
    const key = `${pos.getX(k).toFixed(3)},${pos.getY(k).toFixed(3)},${pos.getZ(k).toFixed(3)}`;
    if (!map.has(key)) {
      const x = pos.getX(k), y = pos.getY(k), z = pos.getZ(k);
      const f = 1.0 + 0.24 * Math.sin(x * 2.1 + seed) * Math.cos(z * 1.7 + seed) + 0.12 * Math.sin(y * 3.3 + seed * 2);
      map.set(key, [x * f, y * f * 0.85, z * f]);
    }
    const v = map.get(key);
    pos.setXYZ(k, v[0], v[1], v[2]);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const browns = SPAWN.rockColors.map((h) => { const c = col(h); return [c.r, c.g, c.b]; });
  const cols = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    const ny = (nor.getY(f) + nor.getY(f + 1) + nor.getY(f + 2)) / 3;
    const r = rnd();
    const c = ny > 0.55 ? [0.93, 0.93, 0.92] : browns[Math.min(browns.length - 1, Math.floor(r * browns.length))];
    for (let j = 0; j < 3; j++) cols.set(c, (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return g;
}

/** Faceted ice crystal: a tapered hexagonal-ish prism with a sharp tip. */
function iceGeometry(sides, rnd) {
  const g = new THREE.CylinderGeometry(0.0, 0.32, 1.0, sides, 3, false);
  const pos = g.attributes.position;
  for (let k = 0; k < pos.count; k++) {
    const y = pos.getY(k);
    const bulge = 1.0 + 0.45 * Math.sin((y + 0.5) * Math.PI) ;
    pos.setX(k, pos.getX(k) * bulge * (0.9 + rnd() * 0.1));
    pos.setZ(k, pos.getZ(k) * bulge * (0.9 + rnd() * 0.1));
  }
  g.translate(0, 0.5, 0);
  g.scale(1, 2.2, 1);
  const ng = g.toNonIndexed();
  ng.computeVertexNormals();
  return ng;
}

/** Fence post (unit height = SPAWN.fenceHeight) with a little snow cap. */
function postGeometry() {
  const H = SPAWN.fenceHeight;
  const wood = col(SPAWN.woodColor);
  const post = new THREE.BoxGeometry(0.14, H, 0.14);
  post.translate(0, H / 2, 0);
  paint(post, () => [wood.r, wood.g, wood.b]);
  const cap = new THREE.CylinderGeometry(0.11, 0.12, 0.08, 6);
  cap.translate(0, H + 0.04, 0);
  paint(cap, () => [0.97, 0.97, 0.95]);
  return mergeGeometries([post.toNonIndexed(), cap.toNonIndexed()]);
}

/** Fence rail along +X (unit length), snow along its top face. */
function railGeometry() {
  const wood = col(SPAWN.woodColor);
  const g = new THREE.BoxGeometry(1, 0.1, 0.06).toNonIndexed();
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  paint(g, (_x, _y, _z, k) => (nor.getY(k) > 0.5 ? [0.97, 0.97, 0.95] : [wood.r * 0.85, wood.g * 0.85, wood.b * 0.85]));
  return g;
}

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const cols = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) cols.set(fn(pos.getX(k), pos.getY(k), pos.getZ(k), k), k * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

export { outlineMaterial };
