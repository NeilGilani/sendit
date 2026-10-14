// Stylized alpine scatter: faceted low-poly pines with snow-capped tiers and organic wind sway, and
// chunky cel-shaded boulders with snow tops. Instanced per 750 m cell (frustum culled, distance cut).
// Also an obstacle hash for collisions and close-shave (near-miss) detection.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, outlineMaterial, mulberry32 } from './world.js';

const HASH = 16;
const CELL = 750;

export class Scatter {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Scatter';
    this.hash = new Map();
    this.cells = [];
    this.treeDistance = 3000;
    this.rockDistance = 1400;
  }

  async load(_loader, data) {
    const T = this.terrain;
    const rnd = mulberry32(5);
    const treeGeos = [pineGeometry(4, 1.0, rnd), pineGeometry(5, 1.15, rnd), pineGeometry(3, 0.85, rnd)];
    const rockGeos = [rockGeometry(1, rnd), rockGeometry(2, rnd)];
    const treeMat = toonMaterial({
      name: 'pine', vertexColors: true,
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

    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    const buckets = new Map();
    const add = (kind, variant, x, z, matrix) => {
      const key = `${kind}|${variant}|${Math.floor((x + T.half) / CELL)}|${Math.floor((z + T.half) / CELL)}`;
      if (!buckets.has(key)) buckets.set(key, { kind, variant, list: [], cx: 0, cz: 0 });
      const b = buckets.get(key);
      b.list.push(matrix);
      b.cx += x; b.cz += z;
    };
    for (const t of data.trees) {
      const v = t[5] % treeGeos.length;
      const scale = t[4] * 0.95;
      q.setFromAxisAngle(up, t[3]);
      p.set(t[0], T.getHeight(t[0], t[2]) - 0.3, t[2]);
      s.set(scale * (0.9 + rnd() * 0.25), scale, scale * (0.9 + rnd() * 0.25));
      add('tree', v, t[0], t[2], m.compose(p, q, s).clone());
      this.addObstacle(t[0], t[2], 0.4 * scale, 'tree');
    }
    for (const r of data.rocks) {
      const v = r[5] % rockGeos.length;
      const scale = r[4] * 0.9;
      T.getNormal(r[0], r[2], 2, n);
      q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, r[3]));
      p.set(r[0], T.getHeight(r[0], r[2]) - 0.3 * scale, r[2]);
      s.set(scale * 1.2, scale * 0.8, scale);
      add('rock', v, r[0], r[2], m.compose(p, q, s).clone());
      this.addObstacle(r[0], r[2], 0.95 * scale, 'rock');
    }
    for (const b of buckets.values()) {
      const geo = b.kind === 'tree' ? treeGeos[b.variant] : rockGeos[b.variant];
      const im = new THREE.InstancedMesh(geo, b.kind === 'tree' ? treeMat : rockMat, b.list.length);
      b.list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      im.userData = { kind: b.kind, center: new THREE.Vector2(b.cx / b.list.length, b.cz / b.list.length) };
      this.group.add(im);
      this.cells.push(im);
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
      im.visible = d < (im.userData.kind === 'tree' ? this.treeDistance : this.rockDistance);
    }
  }
}

/** Faceted pine: brown trunk + jagged cone tiers, dark teal needles with snow loaded on top. */
function pineGeometry(tiers, stretch, rnd) {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.26, 2.2, 6);
  trunk.translate(0, 1.1, 0);
  paint(trunk, () => [0.36, 0.24, 0.18]);
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
        // jagged bottom rim
        const a = Math.atan2(pos.getZ(k), pos.getX(k));
        const jag = 1.0 + 0.18 * Math.sin(a * 7.0 + i);
        pos.setX(k, pos.getX(k) * jag);
        pos.setZ(k, pos.getZ(k) * jag);
        pos.setY(k, py - 0.25 * Math.abs(Math.sin(a * 3.5 + i)));
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y + h / 2, 0);
    const top = y + h;
    paint(cone, (px, py) => {
      const rel = (py - y) / h;
      const snow = rel > 0.42 - 0.12 * Math.sin(px * 3.0) ? 1 : 0;
      return snow ? [0.97, 0.98, 1.0] : [0.1, 0.27, 0.25];
    });
    parts.push(cone);
    void top;
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/** Chunky low-poly boulder with a snow cap. */
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
      const f = 1.0 + 0.22 * Math.sin(x * 2.1 + seed) * Math.cos(z * 1.7 + seed) + 0.12 * Math.sin(y * 3.3 + seed * 2);
      map.set(key, [x * f, y * f * 0.85, z * f]);
    }
    const v = map.get(key);
    pos.setXYZ(k, v[0], v[1], v[2]);
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let f = 0; f < pos.count; f += 3) {
    // per-face colour from the face normal: snow on top faces
    const ny = (nor.getY(f) + nor.getY(f + 1) + nor.getY(f + 2)) / 3;
    const c = ny > 0.55 ? [0.97, 0.98, 1.0] : (rnd() < 0.5 ? [0.46, 0.48, 0.6] : [0.4, 0.42, 0.54]);
    for (let j = 0; j < 3; j++) col.set(c, (f + j) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let k = 0; k < pos.count; k++) col.set(fn(pos.getX(k), pos.getY(k), pos.getZ(k)), k * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

export { outlineMaterial };
