// Fjordline props: the fjord's water surface (a cheap reflective sea: sky reflection by Fresnel, scrolling ripple
// normals, the sun's glitter path, a shoreline shallows tint), sea ice along the shore, the red-cabin village
// (walls painted falu red / ochre / white with white trim, snow-loaded roofs whose snow mesh IS the rideable
// surface from structures.js, rorbuer on stilts), the quay and the pier on piles, boats, stockfish racks (hjell),
// the lighthouse on Kvalneset, the finish arch on the quay, a flag, a cairn on the summit col, and a splash when
// someone rides into the fjord. Browser only; loaded by index.js. Geometry is merged per material across the
// village (few draw calls).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, globals } from '../../world.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from '../../gfx/snow.js';
import { ATMO, SKY_LUT_GLSL } from '../../gfx/atmosphere.js';
import { on } from '../../state.js';
import { START_X, SEA, SHORE_U, QUAY, HARBOUR, HJELL, LIGHTHOUSE, FINISH_ARCH, coastU } from './layout.js';

export function buildFjordlineProps(course, { terrain }) {
  const group = new THREE.Group();
  group.name = 'FjordlineProps';
  const M = materials(terrain);
  const bag = new Bag();
  for (const s of course.structures) buildStructure(s, M, terrain, bag);
  buildHarbour(course, M, terrain, bag);
  buildHjell(course, M, terrain, bag);
  buildLighthouse(course, M, bag);
  buildFinish(M, terrain, bag);
  buildBoats(M, terrain, bag);
  buildCairn(course, M, terrain, bag);
  group.add(...bag.meshes());
  group.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  group.add(buildWater(terrain));
  group.add(buildSeaIce(course, M, terrain));
  group.add(buildSplash());
  return group;
}

/** Geometry collected per material, merged into one mesh each at the end. */
class Bag {
  constructor() { this.map = new Map(); }
  add(mat, geo) { if (!geo) return; let l = this.map.get(mat); if (!l) this.map.set(mat, (l = [])); l.push(geo.index ? geo.toNonIndexed() : geo); }
  meshes() {
    const out = [];
    for (const [mat, geos] of this.map) {
      for (const g of geos) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); if (!g.attributes.normal) g.computeVertexNormals(); }
      const m = new THREE.Mesh(mergeGeometries(geos), mat);
      m.name = `Fjordline:${mat.name}`;
      out.push(m);
    }
    return out;
  }
}

// ------------------------------------------------------------------ textures / materials
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

/** Painted vertical cladding (ståande kledning): boards and battens, weathered; 1 repeat = 2.4 m. */
function claddingTexture(rgb, seed) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; g.fillRect(0, 0, w, h);
    const bw = w / 12;
    for (let i = 0; i < 12; i++) {
      const k = 0.9 + r() * 0.16;
      g.fillStyle = `rgb(${rgb[0] * k | 0},${rgb[1] * k | 0},${rgb[2] * k | 0})`;
      g.fillRect(i * bw, 0, bw, h);
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(i * bw, 0, 2, h);           // batten shadow
      g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(i * bw + 3, 0, 2, h);
    }
    for (let s = 0; s < 40; s++) { g.fillStyle = `rgba(40,30,25,${0.03 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 10 + r() * 60); }
  });
}

function stoneTexture(seed = 9) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = '#3d3a37'; g.fillRect(0, 0, w, h);
    let y = 0;
    while (y < h) {
      const rh = 22 + r() * 22;
      let x = -r() * 30;
      while (x < w) {
        const rw = 30 + r() * 46, l = 70 + r() * 70;
        g.fillStyle = `rgb(${l + 6 | 0},${l + 2 | 0},${l - 4 | 0})`;
        g.beginPath(); g.roundRect(x + 2, y + 2, rw - 4, rh - 4, 7); g.fill();
        x += rw;
      }
      y += rh;
    }
  });
}

function timberTexture(seed = 4) {
  return canvasTex(256, 64, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = '#5a4636'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) { const l = 60 + r() * 40; g.fillStyle = `rgb(${l + 30 | 0},${l + 12 | 0},${l | 0})`; g.fillRect(0, i * 8 + 1, w, 6); }
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(20,14,10,${r() * 0.3})`; g.fillRect(r() * w, r() * h, 10 + r() * 40, 1); }
  });
}

function bannerTexture() {
  return canvasTex(1024, 160, (g, w, h) => {
    g.fillStyle = '#c8302c'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
    // A Nordic cross motif at each end.
    for (const x0 of [24, w - 124]) { g.fillStyle = '#ffffff'; g.fillRect(x0, 30, 100, 100); g.fillStyle = '#c8302c'; g.fillRect(x0 + 6, 36, 88, 88); g.fillStyle = '#ffffff'; g.fillRect(x0 + 30, 36, 16, 88); g.fillRect(x0 + 6, 72, 88, 16); g.fillStyle = '#1d3d7a'; g.fillRect(x0 + 34, 36, 8, 88); g.fillRect(x0 + 6, 76, 88, 8); }
    g.fillStyle = '#ffffff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 84px "Trebuchet MS", sans-serif'; g.fillText('MÅL · FINISH', w / 2, h * 0.47);
    g.font = 'bold 26px "Trebuchet MS", sans-serif'; g.fillText('SKARVVIKA HAVN · FJORDLINE · 0 moh', w / 2, h * 0.86);
  }, false);
}

function materials(terrain) {
  const noise = terrain.terrainUniforms?.noiseTex.value;
  const snow = toonMaterial({
    name: 'roofSnow',
    uniforms: { ...snowUniforms(), noiseTex: { value: noise } },
    fragPars: SNOW_COMMON_PARS + 'vec3 kN;',
    frag: /* glsl */`
      float kn = texture2D(noiseTex, vW.xz * 0.35).g;
      diffuseColor.rgb = uSnowAlbedo * (0.95 + 0.07 * kn);
      tGlaze = 0.25; tGlintMask = 1.0;
      float h0 = texture2D(noiseTex, vW.xz * 0.21).r;
      vec2 g = vec2(texture2D(noiseTex, vW.xz * 0.21 + vec2(0.01, 0.0)).r - h0, texture2D(noiseTex, vW.xz * 0.21 + vec2(0.0, 0.01)).r - h0) * 1.6;
      kN = normalize(normalize(vWN) - vec3(g.x, 0.0, g.y) * 0.5);`,
    band: SNOW_BAND_GLSL,
  });
  const prev = snow.onBeforeCompile;
  snow.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(kN, 0.0)).xyz);');
  };
  return {
    snow,
    red: toonMaterial({ name: 'faluRed', map: claddingTexture([128, 30, 26], 3) }),
    ochre: toonMaterial({ name: 'ochre', map: claddingTexture([196, 146, 60], 5) }),
    white: toonMaterial({ name: 'whitePaint', map: claddingTexture([226, 222, 210], 7) }),
    tar: toonMaterial({ name: 'tarred', map: claddingTexture([54, 42, 36], 9) }),
    trim: toonMaterial({ name: 'trim', color: 0xeeeae0 }),
    glass: toonMaterial({ name: 'glass', color: 0x1b2433, frag: 'toonEmissive = vec3(1.0, 0.62, 0.3) * 0.18;' }),
    roof: toonMaterial({ name: 'roofSlab', color: 0x2c2724, side: THREE.DoubleSide }),
    stone: toonMaterial({ name: 'stone', map: stoneTexture() }),
    timber: toonMaterial({ name: 'timber', map: timberTexture() }),
    pile: toonMaterial({ name: 'pile', color: 0x2e2620 }),
    hullRed: toonMaterial({ name: 'hullRed', color: 0xb02a22 }),
    hullWhite: toonMaterial({ name: 'hullWhite', color: 0xe8e6df }),
    hullBlue: toonMaterial({ name: 'hullBlue', color: 0x1f3f6e }),
    fish: toonMaterial({ name: 'stockfish', color: 0x9a8a70 }),
    lightRed: toonMaterial({ name: 'lighthouseRed', color: 0xc22b26 }),
    lamp: toonMaterial({ name: 'lamp', color: 0xfff1c0, frag: 'toonEmissive = vec3(1.0, 0.85, 0.55) * 1.6;' }),
    banner: toonMaterial({ name: 'finishBanner', map: bannerTexture(), side: THREE.DoubleSide }),
    flag: toonMaterial({ name: 'flag', map: canvasTex(96, 64, (g) => { g.fillStyle = '#ba0c2f'; g.fillRect(0, 0, 96, 64); g.fillStyle = '#fff'; g.fillRect(24, 0, 16, 64); g.fillRect(0, 24, 96, 16); g.fillStyle = '#00205b'; g.fillRect(28, 0, 8, 64); g.fillRect(0, 28, 96, 8); }, false), side: THREE.DoubleSide }),
    ice: toonMaterial({ name: 'seaIce', color: 0xe9f1f6 }),
    sail: toonMaterial({ name: 'sail', color: 0xf3efe6, side: THREE.DoubleSide }),
  };
}

// ------------------------------------------------------------------ buildings
const WALL = { red: 'red', ochre: 'ochre', white: 'white', tar: 'tar' };

function buildStructure(s, M, terrain, bag) {
  const p = [0, 0];
  const W = (a, b) => s.world(a, b, p);
  const wallMat = M[WALL[s.colour] || 'red'];
  const floor = s.stilts ? SEA + s.stilts : null;
  const base = floor ?? s.base;
  const edges = [[-s.hl, -s.hw, s.hl, -s.hw], [s.hl, -s.hw, s.hl, s.hw], [s.hl, s.hw, -s.hl, s.hw], [-s.hl, s.hw, -s.hl, -s.hw]];
  for (const [a0, b0, a1, b1] of edges) bag.add(wallMat, wallStrip(s, a0, b0, a1, b1, W, base));
  bag.add(M.roof, roofSlab(s, W));
  bag.add(M.snow, roofSnow(s, W));
  // Windows (white frames, dark glass with a warm glow) on every wall that stands clear of the snow.
  const sides = [[1, 0, s.hl, s.hw], [-1, 0, s.hl, s.hw], [0, 1, s.hw, s.hl], [0, -1, s.hw, s.hl]];
  for (const [na, nb, off, half] of sides) {
    const count = Math.max(1, Math.floor((half * 2 - 1.5) / 3.2));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count * (half * 2 - 1.5) - (half - 0.75);
      const a = na ? na * (off + 0.06) : t, b = nb ? nb * (off + 0.06) : t;
      const ground = Math.max(terrain.getHeight(...W(a + na * 0.8, b + nb * 0.8)), floor ?? -1e9);
      const top = s.roofY(a, b) - 0.6;
      const y = Math.min(top - 0.9, ground + 1.9);
      if (y - 0.7 < ground + 0.5) continue;
      bag.add(M.trim, boxAt(s, a, b, y, na ? 0.12 : 1.1, 1.35, nb ? 0.12 : 1.1, W));
      bag.add(M.glass, boxAt(s, a + na * 0.04, b + nb * 0.04, y, na ? 0.1 : 0.82, 1.08, nb ? 0.1 : 0.82, W));
      bag.add(M.trim, boxAt(s, a + na * 0.07, b + nb * 0.07, y, na ? 0.06 : 0.07, 1.08, nb ? 0.06 : 0.07, W));   // mullion
    }
  }
  // White corner boards (trim), the classic coastal look; a door downhill on the houses.
  for (const [ca, cb] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const top = s.roofY(ca * s.hl, cb * s.hw);
    bag.add(M.trim, boxAt(s, ca * (s.hl - 0.06), cb * (s.hw - 0.06), (top + base) / 2, 0.22, top - base, 0.22, W));
  }
  if (!s.stilts && s.id !== 'naust') {
    const dg = terrain.getHeight(...W(s.hl + 0.7, s.hw * 0.4));
    if (s.roofY(s.hl, s.hw * 0.4) - dg > 2.8) {
      bag.add(M.trim, boxAt(s, s.hl + 0.05, s.hw * 0.4, dg + 1.05, 0.14, 2.3, 1.25, W));
      bag.add(M.tar, boxAt(s, s.hl + 0.1, s.hw * 0.4, dg + 1.0, 0.1, 2.1, 1.0, W));
    }
  }
  if (s.id === 'naust') {   // the big boathouse doors on the sea side
    const dg = terrain.getHeight(...W(s.hl + 0.7, 0));
    bag.add(M.trim, boxAt(s, s.hl + 0.06, 0, dg + 1.3, 0.12, 2.6, 4.2, W));
    bag.add(M.tar, boxAt(s, s.hl + 0.1, 0, dg + 1.25, 0.1, 2.4, 3.9, W));
  }
  // Stilts (rorbuer): rows of tarred posts from the seabed to the floor, a plank floor edge.
  if (s.stilts) {
    for (let a = -s.hl + 0.3; a <= s.hl - 0.29; a += 2.4) for (const b of [-s.hw + 0.3, 0, s.hw - 0.3]) {
      const [x, z] = W(a, b), g0 = terrain.getHeight(x, z);
      if (g0 > floor - 0.3) continue;
      const lo = Math.min(g0, SEA - 2), h = floor - lo;
      bag.add(M.pile, cyl(x, lo + h / 2, z, 0.16, h, 6));
    }
    bag.add(M.timber, boxAt(s, 0, 0, floor - 0.2, s.L + 0.5, 0.4, s.W + 0.5, W));
  }
  if (s.chim) {
    const c = s.chim, h = c.top - (s.roofY(c.a, c.b) - 1);
    bag.add(M.stone, boxAt(s, c.a, c.b, c.top - h / 2, c.half * 2, h, c.half * 2, W));
    bag.add(M.snow, boxAt(s, c.a, c.b, c.top + 0.12, c.half * 2 + 0.2, 0.28, c.half * 2 + 0.2, W));
  }
}

/** A wall strip between two footprint corners: bottom = foundations (or the floor on stilts), top = under the roof. */
function wallStrip(s, a0, b0, a1, b1, W, base) {
  const n = 12, pos = [], uv = [], idx = [];
  const len = Math.hypot(a1 - a0, b1 - b0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t;
    const top = s.roofY(a, b) - 0.25;
    const [x, z] = W(a, b);
    pos.push(x, base, z, x, Math.max(base + 0.1, top), z);
    uv.push(t * len / 2.4, base / 2.4, t * len / 2.4, top / 2.4);
  }
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const mid = W((a0 + a1) / 2, (b0 + b1) / 2), out = [mid[0] - s.x, mid[1] - s.z];
  if (nrm.getX(0) * out[0] + nrm.getZ(0) * out[1] < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g.toNonIndexed();
}

function roofSlab(s, W) {
  const na = 16, nb = 6, th = 0.3;
  const geos = [];
  const sheet = (off, flip) => {
    const pos = [], uv = [], idx = [];
    for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
      const a = -s.rl + (2 * s.rl) * i / na, b = -s.rw + (2 * s.rw) * j / nb;
      const [x, z] = W(a, b);
      pos.push(x, s.roofY(a, b) + off, z);
      uv.push(a / 2.2, b / 2.2);
    }
    for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
      const k = j * (na + 1) + i;
      if (flip) idx.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1);
      else idx.push(k, k + na + 1, k + 1, k + 1, k + na + 1, k + na + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    if (g.attributes.normal.getY(0) * (flip ? -1 : 1) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
    return g.toNonIndexed();
  };
  geos.push(sheet(0, false), sheet(-th, true));
  const ring = [[-s.rl, -s.rw], [s.rl, -s.rw], [s.rl, s.rw], [-s.rl, s.rw], [-s.rl, -s.rw]];
  for (let e = 0; e < 4; e++) {
    const [a0, b0] = ring[e], [a1, b1] = ring[e + 1];
    const pos = [], n = 8;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t, [x, z] = W(a, b), y = s.roofY(a, b);
      pos.push(x, y - th, z, x, y + 0.02, z);
    }
    const idx = [];
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  }
  for (const g of geos) if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return mergeGeometries(geos);
}

/** Snow on the roof: the rideable surface (roofY + snowAt) on a fine grid, tucking under at the eaves. */
function roofSnow(s, W) {
  const na = Math.ceil(s.rl * 2 / 0.6), nb = Math.ceil(s.rw * 2 / 0.6);
  const pos = [], idx = [];
  for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
    const a = -s.rl + (2 * s.rl) * i / na, b = -s.rw + (2 * s.rw) * j / nb;
    const [x, z] = W(a, b);
    const edge = i === 0 || j === 0 || i === na || j === nb;
    pos.push(x, edge ? s.roofY(a, b) - 0.05 : s.roofY(a, b) + s.snowAt(a, b), z);
  }
  for (let j = 0; j < nb; j++) for (let i = 0; i < na; i++) {
    const k = j * (na + 1) + i;
    idx.push(k, k + na + 1, k + 1, k + 1, k + na + 1, k + na + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(Math.floor(pos.length / 6)) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g;
}

function boxAt(s, a, b, y, da, dy, db, W) {
  const g = new THREE.BoxGeometry(da, dy, db);
  g.rotateY(Math.atan2(-s.az, s.ax));
  const [x, z] = W(a, b);
  g.translate(x, y, z);
  return g.toNonIndexed();
}
function box(x, y, z, sx, sy, sz, yaw = 0) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  if (yaw) g.rotateY(yaw);
  g.translate(x, y, z);
  return g.toNonIndexed();
}
function cyl(x, y, z, r, h, n = 8, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, h, n);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

// ------------------------------------------------------------------ harbour
function buildHarbour(course, M, terrain, bag) {
  const top = SEA + QUAY;
  for (const [key, D] of [['quay', HARBOUR.quay], ['pier', HARBOUR.pier]]) {
    const x0 = START_X + D.u0, x1 = START_X + D.u1, z0 = D.v0, z1 = D.v1;
    // Deck (timber, a thin snow skin on top), piles every 2.5 m where it stands over the water or the ice edge.
    bag.add(M.timber, box((x0 + x1) / 2, top - 0.25, (z0 + z1) / 2, x1 - x0, 0.5, z1 - z0));
    for (let x = x0 + 0.3; x <= x1; x += 2.5) for (let z = z0 + 0.3; z <= z1; z += key === 'pier' ? z1 - z0 - 0.6 : 3.5) {
      const g0 = terrain.getHeight(x, z) - 0.0;
      if (course.natural(x, z) > top - 0.6) continue;
      const lo = Math.min(course.natural(x, z), SEA - 3), h = top - 0.4 - lo;
      bag.add(M.pile, cyl(x, lo + h / 2, z, 0.2, h, 6));
      void g0;
    }
    // A low timber edge (fender) on the water sides; bollards on the pier.
    if (key === 'pier') {
      for (const z of [z0, z1]) bag.add(M.pile, box((x0 + x1) / 2, top + 0.12, z, x1 - x0, 0.24, 0.25));
      for (let x = x0 + 10; x < x1; x += 14) for (const z of [z0 + 0.4, z1 - 0.4]) bag.add(M.stone, cyl(x, top + 0.3, z, 0.18, 0.6, 8));
    } else {
      bag.add(M.pile, box(x1, top + 0.12, (z0 + z1) / 2, 0.25, 0.24, z1 - z0));
    }
  }
  // The flag pole by the quay (Norwegian flag).
  const f = course.flag, fy = terrain.getHeight(f.x, f.z);
  bag.add(M.trim, cyl(f.x, fy + 6, f.z, 0.08, 12, 8, 0.05));
  const fl = new THREE.PlaneGeometry(2.4, 1.6); fl.translate(1.25, fy + 11, 0); fl.rotateY(0.5); fl.translate(f.x, 0, f.z);
  bag.add(M.flag, fl);
}

function buildHjell(course, M, terrain, bag) {
  // A-frames of poles every ~2.5 m with a ridge pole and rows of drying stockfish.
  for (const [u, v, len, yaw] of HJELL) {
    const ax = Math.sin(yaw), az = Math.cos(yaw);
    const cx = START_X + u, cz = v;
    const yaw3 = Math.atan2(ax, az);
    for (let s = -len / 2; s <= len / 2 + 0.01; s += 2.5) {
      const x = cx + ax * s, z = cz + az * s, g = terrain.getHeight(x, z);
      for (const side of [-1, 1]) {
        const pg = new THREE.CylinderGeometry(0.07, 0.09, 4.4, 5);
        pg.rotateX(side * 0.32); pg.rotateY(yaw3); pg.translate(x, g + 2.0, z);
        bag.add(M.pile, pg.toNonIndexed());
      }
    }
    const top = terrain.getHeight(cx, cz) + 4.0;
    const rp = new THREE.CylinderGeometry(0.07, 0.07, len, 5); rp.rotateX(Math.PI / 2); rp.rotateY(yaw3); rp.translate(cx, top, cz);
    bag.add(M.pile, rp.toNonIndexed());
    for (let row = 0; row < 2; row++) {
      const y = top - 0.6 - row * 1.15;
      for (let s = -len / 2 + 0.4; s <= len / 2 - 0.4; s += 0.42) for (const side of [-0.6, 0.6]) {
        const x = cx + ax * s + az * side * (0.6 + row * 0.35) * Math.sign(side), z = cz + az * s - ax * side * (0.6 + row * 0.35) * Math.sign(side);
        const fg = new THREE.BoxGeometry(0.1, 0.9, 0.16); fg.translate(x, y, z);
        bag.add(M.fish, fg.toNonIndexed());
      }
      const pole = new THREE.CylinderGeometry(0.05, 0.05, len, 4); pole.rotateX(Math.PI / 2); pole.rotateY(yaw3); pole.translate(cx, y + 0.5, cz);
      bag.add(M.pile, pole.toNonIndexed());
    }
  }
}

function buildLighthouse(course, M, bag) {
  const L = course.lighthouse, y = L.y;
  // Cast-iron tower, red with a white band, on a stone plinth; a lantern room with a warm lamp.
  bag.add(M.stone, cyl(L.x, y + 0.5, L.z, 3.2, 3, 10, 2.9));
  bag.add(M.lightRed, cyl(L.x, y + 2 + 3.2, L.z, 2.1, 6.4, 12, 1.7));
  bag.add(M.trim, cyl(L.x, y + 2 + 6.4 + 1.1, L.z, 1.7, 2.2, 12, 1.55));
  bag.add(M.lightRed, cyl(L.x, y + 2 + 8.6 + 2, L.z, 1.55, 4, 12, 1.3));
  bag.add(M.pile, cyl(L.x, y + LIGHTHOUSE.h - 0.2, L.z, 2.0, 0.3, 12, 2.0));
  bag.add(M.lamp, cyl(L.x, y + LIGHTHOUSE.h + 0.9, L.z, 1.0, 1.8, 10, 1.0));
  bag.add(M.lightRed, cyl(L.x, y + LIGHTHOUSE.h + 2.3, L.z, 1.3, 1.0, 10, 0.2));
}

function buildFinish(M, terrain, bag) {
  const F = FINISH_ARCH, x = START_X + F.u, z0 = F.v - F.span / 2, z1 = F.v + F.span / 2;
  const h = 8.5;
  for (const z of [z0, z1]) {
    const g = terrain.getHeight(x, z);
    bag.add(M.timber, box(x, g + h / 2 - 1, z, 0.9, h + 2, 0.9));
  }
  const gy = Math.max(terrain.getHeight(x, z0), terrain.getHeight(x, z1)) + h;
  bag.add(M.timber, box(x, gy, (z0 + z1) / 2, 0.7, 0.7, F.span + 1));
  const bn = new THREE.PlaneGeometry(F.span * 0.62, F.span * 0.62 * 160 / 1024);
  bn.rotateY(-Math.PI / 2);
  bn.translate(x - 0.4, gy - 1.6, (z0 + z1) / 2);
  bag.add(M.banner, bn);
}

function buildBoats(M, terrain, bag) {
  // Two sjark (small fishing boats) moored along the pier, færinger pulled up on the Sandvika beach, and a
  // ski-touring sailboat at anchor out in the fjord.
  const P = HARBOUR.pier;
  hull(bag, M.hullWhite, M.hullBlue, START_X + P.u0 + 40, SEA, P.v0 - 3.4, 10, 3.4, 1.6, 0.04, true);
  hull(bag, M.hullRed, M.hullWhite, START_X + P.u0 + 64, SEA, P.v1 + 3.4, 9, 3.2, 1.5, -0.06, true);
  for (const [u, v, yaw] of [[2486, -470, 0.4], [2480, -455, 0.2], [2500, -640, -0.3]]) {
    const x = START_X + u, z = v;
    hull(bag, M.tar, M.hullWhite, x, terrain.getHeight(x, z) + 0.15, z, 5, 1.5, 0.7, yaw, false);
  }
  const sx = START_X + SHORE_U + 420, sz = 260;
  hull(bag, M.hullWhite, M.hullBlue, sx, SEA, sz, 13, 3.8, 1.8, 0.7, true);
  bag.add(M.trim, cyl(sx, SEA + 9.5, sz, 0.12, 17, 6, 0.08));
  const sail = new THREE.BufferGeometry();
  sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 2.5, 0, 0, 17.5, 0, -5.5, 2.8, 0], 3));
  sail.computeVertexNormals();
  sail.rotateY(0.7 + Math.PI / 2); sail.translate(sx, SEA, sz);
  bag.add(M.sail, sail);
}

/** A simple clinker-ish hull: a tapered box with a raised bow, deck strip and (cabin) wheelhouse. */
function hull(bag, mat, trimMat, x, y, z, L, B, D, yaw, cabin) {
  const g = new THREE.BoxGeometry(L, D, B, 6, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = p.getX(i) / (L / 2), yy = p.getY(i);
    const taper = 1 - 0.85 * Math.pow(Math.abs(a), 2.2) * (yy < 0 ? 1 : 0.7);
    p.setZ(i, p.getZ(i) * taper);
    if (yy > 0) p.setY(i, yy + Math.pow(Math.abs(a), 3) * D * 0.5);
    else p.setY(i, yy + Math.abs(a) * D * 0.35);
  }
  g.computeVertexNormals();
  g.rotateY(yaw); g.translate(x, y + D * 0.3, z);
  bag.add(mat, g.toNonIndexed());
  if (cabin) {
    const c = box(0, 0, 0, L * 0.22, D * 1.2, B * 0.6);
    c.rotateY(yaw); c.translate(x - Math.cos(yaw) * L * 0.15, y + D * 1.4, z + Math.sin(yaw) * L * 0.15);
    bag.add(trimMat, c);
  }
}

function buildCairn(course, M, terrain, bag) {
  const c = course.cairn, g = terrain.getHeight(c.x, c.z);
  const r = rand(17);
  for (let i = 0; i < 9; i++) {
    const k = i / 9, rad = 1.0 - k * 0.75;
    const s = new THREE.DodecahedronGeometry(0.42 * (1 - k * 0.4), 0);
    s.translate(c.x + (r() - 0.5) * rad, g + 0.25 + k * 2.1, c.z + (r() - 0.5) * rad);
    bag.add(M.stone, s);   // polyhedra are already non-indexed
  }
}

// ------------------------------------------------------------------ water
const WATER_VERT = /* glsl */`
varying vec3 vWp;
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWp = wp.xyz;
  vec3 transformed = position;
  gl_Position = projectionMatrix * viewMatrix * wp;
  #include <fog_vertex>
}
`;
const WATER_FRAG = /* glsl */`
uniform sampler2D lut; uniform sampler2D noiseTex; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyAmb;
uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform float shoreU; uniform float startX;
varying vec3 vWp;
${SKY_LUT_GLSL}
#include <fog_pars_fragment>
vec2 grad(vec2 p, float e) {
  float a = texture2D(noiseTex, p).r;
  return vec2(texture2D(noiseTex, p + vec2(e, 0.0)).r - a, texture2D(noiseTex, p + vec2(0.0, e)).r - a) / e;
}
void main() {
  vec3 V = cameraPosition - vWp;
  float dist = length(V);
  V /= dist;
  vec2 p = vWp.xz;
  // Calm fjord: two scrolling ripple layers (cat's paws), fading with distance (no shimmer far away).
  float fp = fwidth(dist) + 1e-3;
  float near = 1.0 - smoothstep(200.0, 2600.0, dist);
  vec2 g = grad(p * 0.011 + vec2(time * 0.004, time * 0.0017), 0.004) * 0.011 * 9.0;
  g += grad(p * 0.047 - vec2(time * 0.011, -time * 0.006), 0.004) * 0.047 * 2.4 * near;
  g += grad(p * 0.19 + vec2(time * 0.03, time * 0.021), 0.004) * 0.19 * 0.5 * near * near;
  float calm = 0.35 + 0.65 * smoothstep(0.35, 0.65, texture2D(noiseTex, p * 0.0009 + 0.3).g);   // glassy patches
  vec3 N = normalize(vec3(-g.x * calm, 1.0, -g.y * calm));
  vec3 R = reflect(-V, N);
  R.y = abs(R.y) + 0.002;
  // Reflected sky: a fjord's horizon reflects the far shore's dark mountains, not the bright horizon sky, so
  // the reflection reads higher, bluer sky, dimmed toward the horizon.
  vec3 Rs = normalize(vec3(R.x, max(R.y, 0.0) * 0.8 + 0.22, R.z));
  vec3 sky = skyLUT(lut, Rs) * mix(0.55, 0.9, smoothstep(0.02, 0.3, R.y));
  float ndv = max(dot(N, V), 0.0);
  float fr = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  // Water body: deep blue-green, lit by the sky; the shallows by the shore turn teal over the pale shingle.
  float u = vWp.x - startX;
  float sh = 1.0 - smoothstep(0.0, 45.0, abs(u - shoreU));
  float skyL = dot(skyAmb, vec3(0.2126, 0.7152, 0.0722));
  vec3 body = mix(deep, shallow, sh * 0.6) * (skyL * 2.2 + 0.35);   // lit by the sky's brightness, keeps its own blue (it must survive the warm haze)
  vec3 col = mix(body, sky, fr * 0.8);
  // The sun's glitter path: sharp specular on the ripples, broader warm sheen.
  float sd = max(dot(R, sunDir), 0.0);
  col += sunCol * (pow(sd, 900.0) * 60.0 + pow(sd, 90.0) * 1.2) * (0.6 + 0.4 * calm);
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}
`;

function buildWater(terrain) {
  const noise = terrain.terrainUniforms?.noiseTex.value;
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    lut: { value: ATMO.tex }, noiseTex: { value: noise }, sunDir: { value: globals.uSunDir.value }, sunCol: { value: globals.uSunCol.value },
    skyAmb: { value: globals.uSkyAmb.value }, time: { value: 0 },
    deep: { value: new THREE.Color(0x1b4d78).convertSRGBToLinear() }, shallow: { value: new THREE.Color(0x2f8a8f).convertSRGBToLinear() },
    shoreU: { value: SHORE_U }, startX: { value: START_X },
  }]);
  uniforms.noiseTex.value = noise;
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true, extensions: { derivatives: true } });
  mat.name = 'fjordWater';
  // A big plane covering the fjord to the horizon (the land hides it; the seabed sits ≥ 1.5 m under it).
  const geo = new THREE.PlaneGeometry(60000, 60000, 60, 60);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(0, SEA, 0);
  m.name = 'FjordWater';
  m.frustumCulled = false;
  m.receiveShadow = false;
  m.renderOrder = 5;   // after the terrain: early depth rejects the water the land hides
  m.onBeforeRender = () => {
    uniforms.time.value = globals.uTime.value;
    uniforms.lut.value = ATMO.tex;   // re-baked by the per-map atmosphere hook
    uniforms.sunDir.value = globals.uSunDir.value; uniforms.sunCol.value = globals.uSunCol.value; uniforms.skyAmb.value = globals.uSkyAmb.value;
  };
  return m;
}

/** Sea ice: broken floes along the shore (thicker in the bay corners), one instanced draw. */
function buildSeaIce(course, M, terrain) {
  const r = rand(41);
  const geo = new THREE.CylinderGeometry(1, 1, 0.35, 7);
  const mats = [];
  for (let k = 0; k < 900 && mats.length < 260; k++) {
    const v = -760 + r() * 1300;
    const c = coastU(v);
    const out = 2 + Math.pow(r(), 2.2) * 70;
    const x = START_X + c + out, z = v;
    if (course.natural(x, z) > SEA - 0.5) continue;
    if (Math.abs(z + 48) < 14 && x < START_X + HARBOUR.pier.u1 + 25) continue;   // the pier's channel stays open
    if (Math.abs(z - 100) < 90 && out < 12) continue;                              // under the rorbuer
    const s = 1.2 + r() * 4.5 * (1 - out / 90);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, SEA + 0.06, z), new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - 0.5) * 0.04, r() * 6.28, (r() - 0.5) * 0.04)), new THREE.Vector3(s * (0.7 + r() * 0.6), 1, s));
    mats.push(m);
  }
  const inst = new THREE.InstancedMesh(geo, M.ice, mats.length);
  mats.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.name = 'SeaIce';
  inst.receiveShadow = true;
  return inst;
}

/** The splash when a rider goes into the fjord: a white crown and a spreading ring, then gone. */
function buildSplash() {
  const g = new THREE.Group();
  g.name = 'FjordSplash';
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 1.0, 32), mat);
  ring.rotation.x = -Math.PI / 2;
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.6, 1, 16, 1, true), mat);
  g.add(ring, crown);
  g.visible = false;
  let t = -1;
  on('fjordSplash', (e) => { g.position.set(e.x, SEA + 0.05, e.z); t = 0; g.visible = true; g.userData.s = Math.min(1.6, 0.6 + e.speed / 20); });
  ring.onBeforeRender = () => {
    if (t < 0) return;
    t += 1 / 60;
    const s = g.userData.s;
    ring.scale.setScalar(1 + t * 9 * s);
    crown.scale.set(1 + t * 2 * s, Math.max(0.01, 4 * s * Math.sin(Math.min(Math.PI, t * 2.6))), 1 + t * 2 * s);
    crown.position.y = crown.scale.y / 2;
    mat.opacity = Math.max(0, 0.85 * (1 - t / 1.4));
    if (t > 1.4) { t = -1; g.visible = false; }
  };
  return g;
}

