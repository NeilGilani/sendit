// Conifers: snow-loaded Norway / Engelmann spruce and a rounder fir, procedurally built.
//  LOD0 (near): whorls of drooping needle-frond cards (alpha-tested procedural needle texture),
//    volumetric normals, snow sitting on the upper side of every branch, trunk, wind sway.
//  LOD1 (mid): fewer, larger fronds around a dark core.
//  LOD2 (far): lumpy cone stack with the same snow / colour logic (no alpha).
// Near / mid LODs are a dynamic pool rebuilt around the camera every few metres; the far LOD is
// static per 750 m cell and hides (in the vertex shader) any tree inside the pool radius, using the
// same pool centre so the hand-over is exact. Tunables: TREES in scene.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, mulberry32 } from '../world.js';
import { TREES } from '../scene.js';

const CELL = 750;

// ---------------------------------------------------------------- textures
/** Needle frond (RGBA): a twig along u with needles fanning out; alpha cut-out, tapered outline. */
function makeNeedleTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  const rnd = mulberry32(77);
  g.clearRect(0, 0, size, size);
  // Two fronds per texture row band (v 0..0.5 and 0.5..1) for variety.
  for (let band = 0; band < 2; band++) {
    const y0 = band * size / 2, h = size / 2;
    const cy = y0 + h / 2;
    const width = (u) => Math.sin(Math.min(1, u * 1.15) * Math.PI) * 0.42 * h * (1 - u * 0.35);
    // side twigs
    for (let k = 0; k < 9; k++) {
      const u0 = 0.08 + k * 0.1 + rnd() * 0.04;
      const side = k % 2 ? 1 : -1;
      const x0 = u0 * size, x1 = x0 + 0.18 * size;
      const y1 = cy + side * width(u0) * 0.9;
      g.strokeStyle = 'rgba(60,45,30,1)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0, cy); g.quadraticCurveTo((x0 + x1) / 2, cy + side * width(u0) * 0.3, x1, y1); g.stroke();
    }
    // needles
    for (let n = 0; n < 2600; n++) {
      const u = rnd();
      const wv = width(u);
      if (wv < 2) continue;
      const off = (rnd() * 2 - 1) * wv;
      const x = u * size, y = cy + off;
      const ang = (off > 0 ? 1 : -1) * (0.6 + rnd() * 0.7) + (rnd() - 0.5) * 0.4;
      const len = 3 + rnd() * 6;
      const shade = 0.55 + rnd() * 0.45;
      const r = Math.round(26 * shade), gg = Math.round(58 * shade), b = Math.round(36 * shade);
      g.strokeStyle = `rgba(${r},${gg},${b},1)`;
      g.lineWidth = 1.1 + rnd() * 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); g.stroke();
    }
    g.strokeStyle = 'rgba(70,50,32,1)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(0, cy); g.lineTo(size * 0.97, cy); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// ---------------------------------------------------------------- geometry
/**
 * One branch: a drooping frond card along local +x (top side catches snow, aUnder = 0) plus a
 * skirt of hanging needles below it (aUnder = 1) so the crown reads dense from the side.
 * Single-sided geometry, rendered double-sided (back faces get flipped normals → dark undersides).
 */
function branchGeo(len, width, droop, curl, segs, band, skirt) {
  const pos = [], uv = [], under = [], nrm = [], ao = [];
  const idx = [];
  const yAt = (s) => -droop * Math.pow(s, 1.6) * len + curl * Math.pow(s, 3) * len;
  let base = 0;
  for (let i = 0; i <= segs; i++) {
    const s = i / segs;
    for (let j = 0; j < 2; j++) {
      const z = (j - 0.5) * width * (1 - s * 0.35);
      pos.push(s * len, yAt(s) + (j - 0.5) * width * 0.06, z);
      uv.push(s, band * 0.5 + j * 0.5);
      under.push(0);
      const n = new THREE.Vector3(0.9 * s, 1.0, (j - 0.5) * 0.7).normalize();
      nrm.push(n.x, n.y, n.z);
      ao.push(0.35 + 0.65 * Math.pow(s, 0.7));
    }
  }
  for (let i = 0; i < segs; i++) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  if (skirt) {
    base = pos.length / 3;
    for (let i = 0; i <= segs; i++) {
      const s = 0.12 + 0.88 * i / segs;
      const hs = width * 0.55 * (1 - s * 0.45);
      const y = yAt(s);
      pos.push(s * len, y + 0.02, 0, s * len + hs * 0.15, y - hs, 0);
      uv.push(s, band * 0.5 + 0.5, s, band * 0.5 + 0.02);
      under.push(1, 1);
      const n = new THREE.Vector3(0.75, 0.45, 0).normalize();
      nrm.push(n.x, n.y, n.z, n.x, n.y * 0.4, n.z);
      ao.push(0.3 + 0.5 * s, 0.25 + 0.45 * s);
    }
    for (let i = 0; i < segs; i++) { const q = base + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aUnder', new THREE.Float32BufferAttribute(under, 1));
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
  g.setIndex(idx);
  return g;
}

function trunkGeo(h, r0, r1, sides = 6) {
  const g = new THREE.CylinderGeometry(r1, r0, h, sides, 1, true);
  g.translate(0, h / 2 - 0.4, 0);
  const n = g.attributes.position.count;
  g.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n).fill(2), 1));   // 2 = bark
  g.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.6), 1));
  // uv: bark region of the texture is not used; keep any value
  return g;
}

/** Spruce / fir crown built from whorls of frond cards. kind 0 = spruce (narrow, drooping), 1 = fir. */
function crownGeometry(kind, lod, seed) {
  const rnd = mulberry32(seed);
  const H = TREES.height;
  const parts = [trunkGeo(H * 0.92, 0.2, 0.03, lod === 0 ? 7 : 5)];
  const whorls = lod === 0 ? 24 : 10;
  const per = lod === 0 ? 6 : 5;
  const segs = 2;
  const wMul = lod === 0 ? 1 : 1.45;
  for (let w = 0; w < whorls; w++) {
    const t = (w + rnd() * 0.4) / whorls;
    const y = 1.0 + t * (H - 1.6);
    const prof = kind === 0 ? Math.pow(1 - t, 0.95) : Math.pow(1 - t, 0.75) * (0.85 + 0.15 * Math.sin(t * 3.1));
    const L = (kind === 0 ? 2.5 : 2.9) * prof + 0.35;
    for (let b = 0; b < per; b++) {
      const yaw = (b / per) * Math.PI * 2 + w * 0.9 + rnd() * 0.5;
      const droop = (kind === 0 ? 0.42 : 0.18) * (0.7 + 0.6 * (1 - t)) + rnd() * 0.1;
      const card = branchGeo(L * (0.85 + rnd() * 0.3), L * 0.78 * wMul, droop, kind === 0 ? 0.12 : 0.05, segs, (w + b) % 2, lod === 0);
      card.rotateX((rnd() - 0.5) * 0.35);
      // Spruce: lower branches sweep down, the top ones reach up; fir branches stay level.
      card.rotateZ(kind === 0 ? (t > 0.8 ? 0.25 : -(0.12 + 0.3 * (1 - t))) + (rnd() - 0.5) * 0.15 : 0.06 + (rnd() - 0.5) * 0.12);
      card.rotateY(yaw);
      card.translate(0, y, 0);
      parts.push(card);
    }
  }
  {
    // Dark inner core (needle mass deep in the crown): hides the trunk, no see-through gaps.
    const core = new THREE.ConeGeometry((kind === 0 ? 1.7 : 2.0) * (lod === 0 ? 0.8 : 1.0), H * 0.86, lod === 0 ? 9 : 7, 1, true);
    core.translate(0, H * 0.43 + 0.9, 0);
    const n = core.attributes.position.count;
    core.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n).fill(3), 1));   // 3 = core
    core.setAttribute('aAO', new THREE.Float32BufferAttribute(new Float32Array(n).fill(0.3), 1));
    parts.push(core);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripTo));
}

/** Far LOD: a lumpy cone stack, no alpha. aUnder = 4 marks the far shell. */
function farGeometry(kind, seed) {
  const rnd = mulberry32(seed);
  const H = TREES.height;
  const parts = [trunkGeo(2.0, 0.22, 0.15, 3)];
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (kind === 0 ? 2.4 : 2.8) * Math.pow(1 - t, 0.9) + 0.35;
    const h = (H / tiers) * 1.7;
    const y = 1.0 + t * (H - 2.2);
    const cone = new THREE.ConeGeometry(r, h, 6, 1, true);
    const p = cone.attributes.position;
    for (let k = 0; k < p.count; k++) {
      if (p.getY(k) < 0) {
        const a = Math.atan2(p.getZ(k), p.getX(k));
        const j = 1 + 0.16 * Math.sin(a * 5 + i * 2 + rnd());
        p.setX(k, p.getX(k) * j); p.setZ(k, p.getZ(k) * j); p.setY(k, p.getY(k) - 0.3 * Math.abs(Math.sin(a * 3 + i)));
      }
    }
    cone.computeVertexNormals();
    cone.translate(0, y + h / 2, 0);
    const n = p.count;
    cone.setAttribute('aUnder', new THREE.Float32BufferAttribute(new Float32Array(n).fill(4), 1));
    const ao = new Float32Array(n);
    for (let k = 0; k < n; k++) ao[k] = p.getY(k) > y + h * 0.4 ? 0.95 : 0.55;
    cone.setAttribute('aAO', new THREE.Float32BufferAttribute(ao, 1));
    parts.push(cone);
  }
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map(stripTo));
}

function stripTo(g) {
  // Make every part carry the same attribute set.
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'aUnder', 'aAO'].includes(k)) g.deleteAttribute(k);
  return g;
}

// ---------------------------------------------------------------- material
const VERT_PARS = /* glsl */`
attribute float aUnder; attribute float aAO;
uniform vec4 uLodCenter;     // xyz pool centre, w = radius (far LOD hides inside it)
varying float vUnder; varying float vAO; varying float vSeed; varying float vH; varying vec2 vTUv;
`;
const VERT_PRE = /* glsl */`
  #ifdef USE_INSTANCING
    vec3 ip = instanceMatrix[3].xyz;
  #else
    vec3 ip = vec3(0.0);
  #endif
  vUnder = aUnder; vAO = aAO; vH = position.y; vTUv = uv;
  vSeed = fract(sin(dot(ip.xz, vec2(12.9898, 78.233))) * 43758.5453);
  // Wind: slow trunk sway + faster branch-tip flutter.
  float bend = max(position.y - 1.5, 0.0) * 0.08;
  float sway = sin(uTime * uWind.x * 0.7 + ip.x * 0.05 + ip.z * 0.07) * uWind.y * 0.6;
  transformed.x += sway * bend * bend * 6.0;
  transformed.z += cos(uTime * uWind.x * 0.55 + ip.z * 0.05) * uWind.y * 0.4 * bend * bend * 6.0;
  float tip = length(position.xz);
  transformed.y += sin(uTime * 2.3 + ip.x + position.y * 1.7) * 0.03 * tip * step(aUnder, 1.5);
  #ifdef FAR_LOD
    if (uLodCenter.w > 0.0 && distance(ip.xz, uLodCenter.xz) < uLodCenter.w) transformed = vec3(0.0, -1e4, 0.0);
  #endif
`;
const FRAG_PARS = /* glsl */`
varying float vUnder; varying float vAO; varying float vSeed; varying float vH; varying vec2 vTUv;
float th1(float n) { return fract(sin(n) * 43758.5453); }
float tvn(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  return mix(mix(mix(th1(n), th1(n + 1.0), f.x), mix(th1(n + 57.0), th1(n + 58.0), f.x), f.y),
             mix(mix(th1(n + 113.0), th1(n + 114.0), f.x), mix(th1(n + 170.0), th1(n + 171.0), f.x), f.y), f.z);
}
uniform vec3 uNeedle; uniform vec3 uNeedle2; uniform vec3 uBark; uniform vec3 uTreeSnow; uniform float uSnowLoad;
`;
const FRAG = /* glsl */`
{
  float under = vUnder;
  #ifdef USE_MAP
  {
    // Keep foliage coverage at distance: boost alpha with the mip level, then sharpen the edge.
    vec2 tdx = dFdx(vMapUv * 256.0), tdy = dFdy(vMapUv * 256.0);
    float lvl = max(0.0, 0.5 * log2(max(dot(tdx, tdx), dot(tdy, tdy))));
    float a = diffuseColor.a * (1.0 + lvl * 0.38);
    diffuseColor.a = clamp((a - 0.42) / max(fwidth(a), 1e-4) + 0.5, 0.0, 1.0);
  }
  #endif
  vec3 green = mix(uNeedle, uNeedle2, vSeed) * (0.85 + 0.3 * fract(vSeed * 7.31));
  vec3 base = diffuseColor.rgb;           // texture colour (needles) where mapped
  bool bark = under > 1.5 && under < 2.5;
  bool shell = under > 2.5;
  vec3 col = bark ? uBark : (shell ? green * (under < 3.5 ? 0.7 : 1.0) : green * clamp(base.g / 0.03, 0.45, 1.5));
  if (under > 1.5) diffuseColor.a = 1.0;   // trunk / core / far shell are solid
  // Snow: sits on the upper side of each branch (and the top of far shells), heavier per tree.
  float load = uSnowLoad * (0.4 + 0.8 * fract(vSeed * 3.71));
  float n = tvn(vW * 2.3) * 0.65 + tvn(vW * 7.1) * 0.35;
  float snow = 0.0;
  if (!bark) {
    if (shell) {
      float sh = smoothstep(0.05, 0.75, vWN.y + (n - 0.5) * 0.6);
      snow = sh * smoothstep(0.15, 0.8, load) * (under < 3.5 ? 0.7 : 0.9);
    } else if (under < 0.5 && gl_FrontFacing) {
      // Along the branch: a ridge of snow over the twig, thinning toward the tips and the edges.
      float across = abs(fract(vTUv.y * 2.0) - 0.5) * 2.0;
      float along = smoothstep(0.0, 0.25, vTUv.x) * (1.0 - smoothstep(0.65, 1.0, vTUv.x));
      snow = smoothstep(0.42, 0.68, load * (0.55 + 0.45 * along) * (1.15 - across * 0.6) + (n - 0.5) * 0.55);
    }
  }
  col = mix(col, uTreeSnow, snow);
  col *= mix(vAO, 1.0, snow * 0.6);
  diffuseColor.rgb = col;
  toonDeepBias = (1.0 - vAO) * 0.35 * (1.0 - snow);
}
`;

function treeMaterial(opts) {
  const m = toonMaterial({
    name: opts.name, map: opts.map || null, alphaTest: opts.alphaTest ?? 0, side: opts.map ? THREE.DoubleSide : THREE.FrontSide,
    uniforms: {
      uNeedle: { value: new THREE.Color(TREES.needle) }, uNeedle2: { value: new THREE.Color(TREES.needle2) },
      uBark: { value: new THREE.Color(TREES.bark) }, uTreeSnow: { value: new THREE.Color(TREES.snow) },
      uSnowLoad: { value: TREES.snowLoad }, uLodCenter: opts.lodCenter,
    },
    vertPars: VERT_PARS, vertPre: VERT_PRE, fragPars: FRAG_PARS, frag: FRAG,
  });
  if (opts.far) m.defines = { FAR_LOD: 1 };
  m.userData.far = !!opts.far;
  return m;
}

// ---------------------------------------------------------------- system
export class TreeSystem {
  constructor(group) {
    this.group = group;
    this.trees = [];            // [x, y, z, yaw, sx, sy, sz, kind]
    this.lodCenter = { value: new THREE.Vector4(0, 0, 0, 0) };
    this.near = TREES.nearRadius;
    this.mid = TREES.midRadius;
    this.far = 3000;
    this.cells = [];
    this.last = new THREE.Vector3(1e9, 0, 0);
    const tex = makeNeedleTexture();
    this.mats = {
      near: treeMaterial({ name: 'spruceNear', map: tex, alphaTest: 0.5, lodCenter: this.lodCenter }),
      far: treeMaterial({ name: 'spruceFar', far: true, lodCenter: this.lodCenter }),
    };
    this.geos = [0, 1].map((k) => ({
      lod0: crownGeometry(k, 0, 11 + k), lod1: crownGeometry(k, 1, 21 + k), lod2: farGeometry(k, 31 + k),
    }));
  }

  add(x, y, z, yaw, sx, sy, sz, kind) { this.trees.push([x, y, z, yaw, sx, sy, sz, kind]); }

  build() {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    // Static far LOD per cell per kind.
    const buckets = new Map();
    for (const t of this.trees) {
      const key = `${t[7]}|${Math.floor(t[0] / CELL)}|${Math.floor(t[2] / CELL)}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(t);
    }
    for (const [key, list] of buckets) {
      const kind = Number(key.split('|')[0]);
      const im = new THREE.InstancedMesh(this.geos[kind].lod2, this.mats.far, list.length);
      let cx = 0, cz = 0;
      list.forEach((t, i) => {
        im.setMatrixAt(i, m.compose(p.set(t[0], t[1], t[2]), q.setFromAxisAngle(up, t[3]), s.set(t[4], t[5], t[6])));
        cx += t[0]; cz += t[2];
      });
      im.computeBoundingSphere();
      // Far shells only exist beyond the near/mid pools, which always cover the shadow box.
      im.castShadow = false; im.receiveShadow = true;
      im.userData = { center: new THREE.Vector2(cx / list.length, cz / list.length) };
      im.name = 'TreesFar';
      this.group.add(im);
      this.cells.push(im);
    }
    // Dynamic near / mid pools.
    this.pools = [];
    for (const lod of ['lod0', 'lod1']) for (const kind of [0, 1]) {
      const cap = lod === 'lod0' ? TREES.nearMax : TREES.midMax;
      const im = new THREE.InstancedMesh(this.geos[kind][lod], this.mats.near, cap);
      im.count = 0;
      im.frustumCulled = false;
      // Only the near pool (which covers the rider's shadow box) casts shadows.
      im.castShadow = lod === 'lod0'; im.receiveShadow = true;
      im.name = `Trees_${lod}_${kind}`;
      this.group.add(im);
      this.pools.push({ im, lod, kind, cap });
    }
  }

  setQuality(q) {
    this.near = TREES.nearRadius * [0.6, 0.85, 1][q];
    this.mid = TREES.midRadius * [0.55, 0.8, 1][q];
    this.far = [1800, 3000, 4500][q];
    this.last.set(1e9, 0, 0);
  }

  update(cam) {
    for (const im of this.cells) {
      const c = im.userData.center;
      im.visible = Math.hypot(c.x - cam.x, c.y - cam.z) - CELL * 0.7 < this.far;
    }
    if (!this.pools || Math.hypot(cam.x - this.last.x, cam.z - this.last.z) < TREES.rebuildStep) return;
    this.last.copy(cam);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const pool of this.pools) pool.im.count = 0;
    const n2 = this.near * this.near, m2 = this.mid * this.mid;
    for (const t of this.trees) {
      const dx = t[0] - cam.x, dz = t[2] - cam.z, d2 = dx * dx + dz * dz;
      if (d2 > m2) continue;
      const pool = this.pools[(d2 < n2 ? 0 : 2) + t[7]];
      if (pool.im.count >= pool.cap) continue;
      pool.im.setMatrixAt(pool.im.count++, m.compose(p.set(t[0], t[1], t[2]), q.setFromAxisAngle(up, t[3]), s.set(t[4], t[5], t[6])));
    }
    for (const pool of this.pools) pool.im.instanceMatrix.needsUpdate = true;
    this.lodCenter.value.set(cam.x, 0, cam.z, this.mid);
  }
}
