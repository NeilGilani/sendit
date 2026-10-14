// Snowy pines and photoscanned boulders. Near instances use the full models; distant pines fall
// back to light cone trees so thousands stay cheap. Also a tiny obstacle hash for collisions.
import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { withWorld } from './world.js';

const HASH = 16;

const SNOW_GLSL = /* glsl */`
float hash31(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

export class Scatter {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Scatter';
    this.hash = new Map();
    this.nearTrees = 420;
    this.nearRocks = 650;
    this.farTrees = 3200;
    this._last = new THREE.Vector3(1e9, 0, 0);
  }

  async load(loader, data) {
    await MeshoptSimplifier.ready;
    const pines = await Promise.all([1, 2, 3, 4, 5].map((i) => loader.loadAsync(`/models/nature/Pine_${i}.gltf`)));
    const rocks = await Promise.all(['rock_07', 'rock_09'].map((r) => loader.loadAsync(`/models/rocks/${r}/${r}_1k.gltf`)));
    this.treeParts = pines.map((g) => this.extractParts(g.scene, 'tree'));
    this.rockParts = rocks.map((g) => this.extractParts(g.scene, 'rock', 1800));
    this.rockScale = [0.55, 1.1];

    // Instances
    const T = this.terrain;
    const q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), m = new THREE.Matrix4();
    const up = new THREE.Vector3(0, 1, 0), n = new THREE.Vector3();
    this.trees = data.trees.map((t) => {
      const variant = t[5] % 5;
      const scale = t[4];
      q.setFromAxisAngle(up, t[3]);
      p.set(t[0], T.getHeight(t[0], t[2]) - 0.25, t[2]);
      s.setScalar(scale);
      m.compose(p, q, s);
      this.addObstacle(t[0], t[2], 0.35 * scale);
      return { x: t[0], z: t[2], variant, matrix: m.clone() };
    });
    this.rocks = data.rocks.map((r) => {
      const variant = r[5] % 2;
      const scale = r[4] * this.rockScale[variant];
      T.getNormal(r[0], r[2], 2, n);
      q.setFromUnitVectors(up, n).multiply(new THREE.Quaternion().setFromAxisAngle(up, r[3]));
      p.set(r[0], T.getHeight(r[0], r[2]) - 0.35 * r[4], r[2]);
      s.setScalar(scale);
      m.compose(p, q, s);
      this.addObstacle(r[0], r[2], 0.95 * scale);
      return { x: r[0], z: r[2], variant, matrix: m.clone() };
    });

    // Instanced meshes
    this.treeMeshes = this.treeParts.map((parts, v) => parts.map((part) => this.instanced(part, this.trees.filter((t) => t.variant === v).length)));
    this.rockMeshes = this.rockParts.map((parts, v) => parts.map((part) => this.instanced(part, this.rocks.filter((r) => r.variant === v).length)));
    this.farTreeMesh = this.instanced({ geometry: farTreeGeometry(), material: farTreeMaterial() }, this.trees.length);
    this.farTreeMesh.castShadow = false;
  }

  extractParts(root, kind, simplifyTo = 0) {
    const parts = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      let geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      if (simplifyTo > 0) geo = simplify(geo, simplifyTo);
      const src = o.material;
      parts.push({ geometry: geo, material: kind === 'tree' ? treeMaterial(src) : rockMaterial(src) });
    });
    return parts;
  }

  instanced(part, count) {
    const im = new THREE.InstancedMesh(part.geometry, part.material, Math.max(1, count));
    im.count = 0;
    im.castShadow = true;
    im.receiveShadow = true;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(im);
    return im;
  }

  addObstacle(x, z, r) {
    const k = `${Math.floor(x / HASH)},${Math.floor(z / HASH)}`;
    let a = this.hash.get(k);
    if (!a) { a = []; this.hash.set(k, a); }
    a.push([x, z, r]);
  }

  findObstacle(pos, radius) {
    const cx = Math.floor(pos.x / HASH), cz = Math.floor(pos.z / HASH);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = this.hash.get(`${cx + dx},${cz + dz}`);
      if (!a) continue;
      for (const o of a) if (Math.hypot(pos.x - o[0], pos.z - o[1]) < o[2] + radius) return o;
    }
    return null;
  }

  setQuality(q) {
    this.nearTrees = [220, 420, 700][q];
    this.nearRocks = [350, 650, 1100][q];
    this.farTrees = [2000, 3200, 4500][q];
    this._last.set(1e9, 0, 0);
  }

  update(cam) {
    if (cam.distanceToSquared(this._last) < 15 * 15) return;
    this._last.copy(cam);
    const nt2 = this.nearTrees ** 2, ft2 = this.farTrees ** 2, nr2 = this.nearRocks ** 2;
    const counts = this.treeMeshes.map(() => 0);
    let far = 0;
    for (const t of this.trees) {
      const d2 = (t.x - cam.x) ** 2 + (t.z - cam.z) ** 2;
      if (d2 < nt2) {
        const i = counts[t.variant]++;
        for (const im of this.treeMeshes[t.variant]) im.setMatrixAt(i, t.matrix);
      } else if (d2 < ft2) {
        this.farTreeMesh.setMatrixAt(far++, t.matrix);
      }
    }
    this.treeMeshes.forEach((parts, v) => parts.forEach((im) => { im.count = counts[v]; im.instanceMatrix.needsUpdate = true; }));
    this.farTreeMesh.count = far;
    this.farTreeMesh.instanceMatrix.needsUpdate = true;
    const rc = this.rockMeshes.map(() => 0);
    for (const r of this.rocks) {
      const d2 = (r.x - cam.x) ** 2 + (r.z - cam.z) ** 2;
      if (d2 < nr2) {
        const i = rc[r.variant]++;
        for (const im of this.rockMeshes[r.variant]) im.setMatrixAt(i, r.matrix);
      }
    }
    this.rockMeshes.forEach((parts, v) => parts.forEach((im) => { im.count = rc[v]; im.instanceMatrix.needsUpdate = true; }));
  }
}

function simplify(geo, targetTris) {
  const g = geo.index ? geo : geo;
  const pos = g.attributes.position.array;
  const idx = g.index ? new Uint32Array(g.index.array) : new Uint32Array([...Array(pos.length / 3).keys()]);
  if (idx.length / 3 <= targetTris) return g;
  const [out] = MeshoptSimplifier.simplify(idx, new Float32Array(pos), 3, targetTris * 3, 0.02, ['LockBorder']);
  const ng = g.clone();
  ng.setIndex(new THREE.BufferAttribute(out, 1));
  return ng;
}

function treeMaterial(src) {
  const leaf = (src.name || '').toLowerCase().includes('lea');
  const m = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: leaf ? null : src.normalMap, roughness: 0.85, metalness: 0,
    alphaTest: leaf ? 0.45 : 0, side: leaf ? THREE.DoubleSide : THREE.FrontSide,
  });
  m.name = leaf ? 'pineLeaves' : 'pineBark';
  withWorld(m, {
    fragPars: SNOW_GLSL,
    frag: leaf ? /* glsl */`
      {
        float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
        vec3 nw = normalize(vWN) * (gl_FrontFacing ? 1.0 : -1.0);
        float clump = vnoise(vW * 2.2) * 0.6 + vnoise(vW * 7.0) * 0.4;
        float snow = smoothstep(0.55, 0.85, nw.y * 0.5 + 0.5 + (clump - 0.5) * 0.55) * 0.8;
        vec3 needles = vec3(0.075, 0.12, 0.09) * (0.55 + lum * 1.1);
        diffuseColor.rgb = mix(needles, vec3(0.9, 0.93, 0.98), snow);
      }` : /* glsl */`
      {
        float n = vnoise(vW * 1.3) * 0.5 + vnoise(vW * 5.0) * 0.25;
        float snow = smoothstep(0.45, 0.65, normalize(vWN).y + n * 0.6 - 0.25) * 0.8;
        diffuseColor.rgb = mix(diffuseColor.rgb * 0.8, vec3(0.9, 0.93, 0.98), snow);
      }`,
  });
  return m;
}

function rockMaterial(src) {
  const m = new THREE.MeshStandardMaterial({
    map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, roughness: 1.0, metalness: 0,
  });
  m.name = 'rock';
  withWorld(m, {
    fragPars: SNOW_GLSL,
    frag: /* glsl */`
      {
        vec3 base = diffuseColor.rgb;
        base = mix(base, vec3(dot(base, vec3(0.3, 0.59, 0.11))), 0.4);
        float n = vnoise(vW * 1.3) * 0.5 + vnoise(vW * 5.0) * 0.25;
        float snow = smoothstep(0.42, 0.62, normalize(vWN).y + n * 0.6 - 0.25) * 0.85;
        diffuseColor.rgb = mix(base, vec3(0.9, 0.93, 0.98), snow);
      }`,
  });
  return m;
}

function farTreeGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.15, 0.25, 2.0, 6);
  trunk.translate(0, 1.0, 0);
  parts.push([trunk, 0]);
  const tiers = [[2.4, 3.2, 1.8], [1.9, 2.8, 3.6], [1.3, 2.4, 5.2], [0.7, 2.0, 6.6]];
  for (const [r, h, y] of tiers) {
    const c = new THREE.ConeGeometry(r, h, 7, 1, true);
    c.translate(0, y + h / 2, 0);
    parts.push([c, 1]);
  }
  const merged = new THREE.BufferGeometry();
  const pos = [], nor = [];
  for (const [g] of parts) {
    const gi = g.toNonIndexed();
    pos.push(...gi.attributes.position.array);
    nor.push(...gi.attributes.normal.array);
  }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return merged;
}

function farTreeMaterial() {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide });
  m.name = 'farTree';
  withWorld(m, {
    fragPars: SNOW_GLSL,
    frag: /* glsl */`
      {
        float leaf = step(0.2, abs(normalize(vWN).y));
        float n = vnoise(vW * 0.9);
        float snow = smoothstep(0.5, 0.8, normalize(vWN).y * 0.5 + 0.5 + (n - 0.5) * 0.5) * 0.75 * leaf;
        vec3 needles = mix(vec3(0.16, 0.12, 0.09), vec3(0.06, 0.1, 0.075) * (0.8 + n * 0.4), leaf);
        diffuseColor.rgb = mix(needles, vec3(0.9, 0.93, 0.98), snow);
      }`,
  });
  return m;
}
