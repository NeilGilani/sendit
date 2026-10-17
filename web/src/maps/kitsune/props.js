// Kitsune Peak props (browser only; loaded by index.js): the shrine village (curved snow-loaded roofs whose
// snow mesh IS the rideable surface from structures.js, timber-and-plaster walls, glowing shōji), the torii
// (the senbon tunnel, the Ō-torii, the finish gate), the five-storey pagoda, stone tōrō and paper chōchin
// lanterns with a warm glow, the birch glade (instanced, chunked), snow monsters, the gondola with moving
// cabins, the steaming onsen and the crater's fumaroles, fox statues and rope-line markers.
// Draw-call budget: everything static is merged per material; birches are a few instanced chunks.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../../world.js';
import { START_X, PAGODA, OTORII, ONSEN, GONDOLA, CRATER, TOP } from './layout.js';
import { BIRCH } from './forest.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from '../../gfx/snow.js';

const VERMILION = 0xd8432c, LANTERN = [1.0, 0.62, 0.28];

export function buildKitsuneProps(course, { terrain }) {
  const group = new THREE.Group();
  group.name = 'KitsuneProps';
  const M = materials(terrain);
  const glow = [];   // [x, y, z, size, warmth] light sources for the glow sprites
  for (const s of course.structures) group.add(buildStructure(s, M, terrain, glow));
  group.add(buildTorii(course, M, terrain, glow));
  group.add(buildPagoda(M, terrain, glow));
  group.add(buildLanterns(course, M, terrain, glow));
  group.add(buildBirches(course, M, terrain));
  group.add(buildJuhyo(course, M, terrain));
  group.add(buildGondola(course, M, terrain, glow));
  group.add(buildOnsen(M, terrain, glow));
  group.add(buildSteam(course, terrain));
  group.add(buildGlow(glow));
  group.traverse((o) => { if (o.isMesh && !o.material.transparent && o.userData.shadow !== false) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// ------------------------------------------------------------------ materials
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
function rand(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

/** Timber frame and white plaster (1 repeat ≈ 3 m): dark posts and beams, off-white panels. */
function plasterTexture(post = '#3a2a20', panel = '#e9e2d3', seed = 4) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = panel; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '120,110,95' : '255,250,240'},${0.04 + r() * 0.05})`; g.fillRect(r() * w, r() * h, 2 + r() * 10, 2 + r() * 6); }
    g.fillStyle = post;
    g.fillRect(0, 0, 18, h); g.fillRect(w / 2 - 6, 0, 12, h);
    g.fillRect(0, h * 0.62, w, 12); g.fillRect(0, 0, w, 10); g.fillRect(0, h - 14, w, 14);
    g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(18, h * 0.62 + 12, w, 4);
  });
}
/** Dark weathered vertical boards (lower walls, the stations). */
function boardTexture(tint = [70, 50, 38], seed = 3) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(seed), boards = 10, bw = w / boards;
    for (let i = 0; i < boards; i++) {
      const k = 0.8 + r() * 0.3;
      g.fillStyle = `rgb(${tint[0] * k | 0},${tint[1] * k | 0},${tint[2] * k | 0})`;
      g.fillRect(i * bw, 0, bw, h);
      for (let s = 0; s < 30; s++) { g.fillStyle = `rgba(20,12,8,${0.05 + r() * 0.08})`; g.fillRect(i * bw + r() * bw, r() * h, 1, 20 + r() * 60); }
      g.fillStyle = 'rgba(15,8,5,0.8)'; g.fillRect(i * bw, 0, 2, h);
    }
  });
}
/** Shōji: a paper screen in a wooden lattice; the paper glows (lit from inside). */
function shojiTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffe2b0'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a3020';
    for (let i = 0; i <= 4; i++) g.fillRect(i * w / 4 - 2, 0, 4, h);
    for (let j = 0; j <= 6; j++) g.fillRect(0, j * h / 6 - 2, w, 4);
  });
}
/** Birch bark: chalk white with dark horizontal lenticels and black patches, darker near the base. */
function barkTexture() {
  return canvasTex(64, 256, (g, w, h) => {
    const r = rand(77);
    g.fillStyle = '#ece9e1'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(30,25,22,${0.35 + r() * 0.5})`; g.fillRect(r() * w, r() * h, 3 + r() * 12, 1 + r() * 2); }
    for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(20,16,14,${0.6 + r() * 0.4})`; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 6, 2 + r() * 5, 0, 0, 6.3); g.fill(); }
    const gr = g.createLinearGradient(0, h, 0, h * 0.72);
    gr.addColorStop(0, 'rgba(40,32,28,0.95)'); gr.addColorStop(1, 'rgba(40,32,28,0)');
    g.fillStyle = gr; g.fillRect(0, h * 0.72, w, h * 0.28);
  });
}
/** Leafless birch twigs (alpha-tested card): a fan of fine purple-brown branches. */
function twigTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(91);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = 'rgba(128,112,116,1)';
    g.lineCap = 'round';
    const branch = (x, y, a, len, wdt, depth) => {
      if (depth > 6 || len < 4) return;
      const x2 = x + Math.cos(a) * len, y2 = y - Math.sin(a) * len;
      g.lineWidth = wdt; g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      const n = 2;
      for (let i = 0; i < n; i++) branch(x2, y2, a + (i ? 0.45 : -0.45) + (r() - 0.5) * 0.5, len * (0.66 + r() * 0.12), Math.max(0.8, wdt * 0.6), depth + 1);
    };
    for (let k = 0; k < 4; k++) branch(w / 2 + (r() - 0.5) * 40, h, Math.PI / 2 + (r() - 0.5) * 1.1, 52 + r() * 18, 3, 0);
  }, false);
}

function materials(terrain) {
  const noise = terrain.terrainUniforms?.noiseTex.value;
  const snow = toonMaterial({
    name: 'kitsuneRoofSnow',
    uniforms: { ...snowUniforms(), noiseTex: { value: noise } },
    fragPars: SNOW_COMMON_PARS + 'vec3 kN;',
    frag: /* glsl */`
      float kn = texture2D(noiseTex, vW.xz * 0.35).g;
      diffuseColor.rgb = uSnowAlbedo * (0.95 + 0.07 * kn);
      tGlaze = 0.2; tGlintMask = 1.0;
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
  const glowMat = (name, rgb, k) => toonMaterial({ name, color: new THREE.Color(...rgb), frag: `toonEmissive = vec3(${rgb.map((c) => (c * k).toFixed(3)).join(', ')}) * (0.92 + 0.08 * sin(uTime * 7.0 + vW.x * 1.3 + vW.z));` });
  return {
    snow,
    plaster: toonMaterial({ name: 'kPlaster', map: plasterTexture() }),
    shrineWall: toonMaterial({ name: 'kShrineWall', map: plasterTexture('#a8321f', '#f1e6d4', 5) }),
    boards: toonMaterial({ name: 'kBoards', map: boardTexture() }),
    roof: toonMaterial({ name: 'kRoof', color: 0x2c2f36, side: THREE.DoubleSide }),
    timber: toonMaterial({ name: 'kTimber', color: 0x3b2a20 }),
    red: toonMaterial({ name: 'kVermilion', color: VERMILION }),
    black: toonMaterial({ name: 'kBlack', color: 0x1b1b20 }),
    stone: toonMaterial({ name: 'kStone', color: 0x8d8c88 }),
    rock: toonMaterial({ name: 'kRock', color: 0x4a4744 }),
    steel: toonMaterial({ name: 'kSteel', color: 0x4a4f57 }),
    bronze: toonMaterial({ name: 'kBronze', color: 0x5d4a2a }),
    bamboo: toonMaterial({ name: 'kBamboo', color: 0x9c8a4e }),
    shoji: toonMaterial({ name: 'kShoji', map: shojiTexture(), frag: 'toonEmissive = diffuseColor.rgb * vec3(1.5, 1.05, 0.55);' }),
    flame: glowMat('kFlame', LANTERN, 2.6),
    chochin: glowMat('kChochin', [1.0, 0.35, 0.18], 2.2),
    chochinWhite: glowMat('kChochinW', [1.0, 0.82, 0.55], 2.0),
    cabin: toonMaterial({ name: 'kCabin', color: 0xc23a2a }),
    cabinGlass: glowMat('kCabinGlass', [1.0, 0.78, 0.5], 1.2),
    water: toonMaterial({ name: 'kOnsen', color: 0x1e4a4c, frag: 'toonEmissive = vec3(0.10, 0.16, 0.14) + vec3(0.9, 0.5, 0.2) * 0.18 * (0.5 + 0.5 * sin(uTime * 0.8 + vW.x * 0.7 + vW.z * 0.5));' }),
    bark: toonMaterial({ name: 'kBirchBark', map: barkTexture() }),
    twigs: toonMaterial({ name: 'kBirchTwigs', map: twigTexture(), alphaTest: 0.45, side: THREE.DoubleSide }),
    fox: toonMaterial({ name: 'kFoxStone', color: 0xe8e4dc }),
    rope: toonMaterial({ name: 'kRope', color: 0xc9b27a }),
  };
}

// ------------------------------------------------------------------ geometry helpers
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function place(geo, x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromAxisAngle(_up, yaw); _p.set(x, y, z); _s.set(sx, sy, sz);
  return geo.clone().applyMatrix4(_m.compose(_p, _q, _s));
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);
function merged(list, mat, name) {
  const m = new THREE.Mesh(mergeGeometries(list.map(ni).map(stripAttrs)), mat);
  m.name = name;
  return m;
}
/** Keep position / normal / uv only (merge needs the same attribute set). */
function stripAttrs(g) {
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}
/** A beam with its ends curling up (kasagi): length L along x, height h, depth d, rise at the tips. */
function curvedBeam(L, h, d, rise, segs = 12) {
  const g = new THREE.BoxGeometry(L, h, d, segs, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = p.getX(i) / (L / 2); p.setY(i, p.getY(i) + rise * t * t * t * t); }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ buildings
function buildStructure(s, M, terrain, glow) {
  const g = new THREE.Group();
  g.name = `Building:${s.id}`;
  const W = (a, b) => s.world(a, b, [0, 0]);
  const wallMat = s.colour === 'shrine' ? M.shrineWall : s.colour === 'station' ? M.boards : M.plaster;
  const walls = [];
  const edges = [[-s.hl, -s.hw, s.hl, -s.hw], [s.hl, -s.hw, s.hl, s.hw], [s.hl, s.hw, -s.hl, s.hw], [-s.hl, s.hw, -s.hl, -s.hw]];
  for (const [a0, b0, a1, b1] of edges) walls.push(wallStrip(s, a0, b0, a1, b1, W));
  g.add(merged(walls, wallMat, 'walls'));
  g.add(new THREE.Mesh(roofSlab(s, W), M.roof));
  g.add(new THREE.Mesh(roofSnow(s, W), M.snow));
  // Pillars: vermilion on the shrine (every ~3 m round the walls), dark timber elsewhere (corners).
  const posts = [];
  const pillar = new THREE.CylinderGeometry(s.colour === 'shrine' ? 0.32 : 0.22, s.colour === 'shrine' ? 0.36 : 0.22, 1, 10);
  const along = (a0, b0, a1, b1, every) => {
    const L = Math.hypot(a1 - a0, b1 - b0), n = Math.max(1, Math.round(L / every));
    for (let i = 0; i <= n; i++) {
      const a = a0 + (a1 - a0) * i / n, b = b0 + (b1 - b0) * i / n;
      const top = s.roofY(a, b) - 0.3, bot = s.base;
      const [x, z] = W(a * 1.01, b * 1.01);
      posts.push(place(pillar, x, (top + bot) / 2, z, 0, 1, top - bot, 1));
    }
  };
  for (const [a0, b0, a1, b1] of edges) along(a0, b0, a1, b1, s.colour === 'shrine' ? 3 : 1e9);
  g.add(merged(posts, s.colour === 'shrine' ? M.red : M.timber, 'pillars'));
  // Glowing shōji windows wherever a wall stands clear of the snow (every ~3.2 m), at ground floor height.
  const wins = [];
  const sides = [[1, 0, s.hl, s.hw], [-1, 0, s.hl, s.hw], [0, 1, s.hw, s.hl], [0, -1, s.hw, s.hl]];
  const yaw = Math.atan2(-s.az, s.ax);
  for (const [na, nb, off, half] of sides) {
    const count = Math.floor((half * 2 - 2) / 3.2);
    for (let i = 0; i < count; i++) {
      const t = (i + 0.5) / count * (half * 2 - 2) - (half - 1);
      const a = na ? na * (off + 0.06) : t, b = nb ? nb * (off + 0.06) : t;
      const [x, z] = W(a, b);
      const ground = terrain.getHeight(...W(a + na * 1.2, b + nb * 1.2));
      const top = s.roofY(a, b) - 0.6;
      const y = Math.min(top - 1.0, ground + 1.7);
      if (y - 0.8 < ground + 0.3 || y + 0.8 > top) continue;
      const pg = new THREE.PlaneGeometry(1.9, 1.5);
      const face = na ? (na > 0 ? 0 : Math.PI) : (nb > 0 ? -Math.PI / 2 : Math.PI / 2);
      pg.rotateY(Math.PI / 2 + face);
      wins.push(place(pg, x, y, z, yaw));
      if (i % 2 === 0) glow.push([x + (na * s.ax + nb * s.bx) * 1.2, y, z + (na * s.az + nb * s.bz) * 1.2, 5, 0.6]);
    }
  }
  if (wins.length) g.add(merged(wins, M.shoji, 'shoji'));
  // Chōchin hanging under the downhill eave (red on the shrine and the ryokans, white at the stations).
  const lan = [];
  const lanG = new THREE.SphereGeometry(0.36, 10, 8); lanG.scale(1, 1.35, 1);
  for (const b of [-0.6, -0.2, 0.2, 0.6]) {
    const a = s.hl + 0.8, bb = b * s.hw;
    const y = s.roofY(a, bb) - 1.1;
    const [x, z] = W(a, bb);
    lan.push(place(lanG, x, y, z));
    glow.push([x, y, z, 3.4, 1]);
  }
  g.add(merged(lan, s.colour === 'station' ? M.chochinWhite : M.chochin, 'eaveLanterns'));
  // A ridge ornament (shrine): chigi crossed boards at the gable ends.
  if (s.colour === 'shrine') {
    const ch = [];
    const board = new THREE.BoxGeometry(0.25, 2.6, 0.5);
    for (const b of [-s.rw + 0.4, s.rw - 0.4]) for (const sgn of [-1, 1]) {
      const [x, z] = W(0, b);
      const bg = board.clone(); bg.rotateZ(sgn * 0.6);
      ch.push(place(bg, x, s.ridge + 1.6, z, yaw));
    }
    g.add(merged(ch, M.black, 'chigi'));
  }
  return g;
}

/** A wall strip between two footprint corners: bottom = foundations, top = under the roof. */
function wallStrip(s, a0, b0, a1, b1, W) {
  const n = 12, pos = [], uv = [], idx = [];
  const len = Math.hypot(a1 - a0, b1 - b0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t;
    const top = s.roofY(Math.sign(a) * Math.min(Math.abs(a), s.hl), b) - 0.25;
    const [x, z] = W(a, b);
    pos.push(x, s.base, z, x, Math.max(s.base + 0.1, top), z);
    uv.push(t * len / 3, s.base / 3, t * len / 3, top / 3);
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

/** The roof structure (dark tile slab): top sheet, underside and the fascia, as one closed slab. */
function roofSlab(s, W) {
  const na = 28, nb = 10, th = 0.36;
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
    const pos = [], n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t, [x, z] = W(a, b), y = s.roofY(a, b);
      pos.push(x, y - th, z, x, y + 0.02, z);
    }
    const idx = [];
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n + 1) * 4), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  }
  return mergeGeometries(geos);
}

/** Snow on the roof: the rideable surface (roofY + snowAt) on a fine grid, tucked under at the eaves. */
function roofSnow(s, W) {
  const na = Math.ceil(s.rl * 2 / 0.5), nb = Math.ceil(s.rw * 2 / 0.6);
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

// ------------------------------------------------------------------ torii
/** One torii in its local frame (x across, y up, z along the way through), split by material. */
function toriiParts(span, H) {
  const r = Math.max(0.16, H * 0.038);
  const post = new THREE.CylinderGeometry(r * 0.9, r, H, 12);
  const red = [], black = [], snow = [];
  for (const s of [-1, 1]) red.push(place(post, s * span / 2, H / 2, 0));
  const L = span + H * 0.42;
  red.push(place(new THREE.BoxGeometry(span + H * 0.12, H * 0.07, r * 1.3), 0, H * 0.78, 0));        // nuki (tie beam)
  red.push(place(curvedBeam(L, H * 0.07, r * 2.0, H * 0.035), 0, H * 0.93, 0));                         // shimaki
  black.push(place(curvedBeam(L + H * 0.04, H * 0.06, r * 2.4, H * 0.045), 0, H * 0.99, 0));            // kasagi (black cap)
  snow.push(place(curvedBeam(L + H * 0.02, H * 0.05, r * 2.2, H * 0.045), 0, H * 1.04, 0));             // snow on top
  red.push(place(new THREE.BoxGeometry(r * 1.3, H * 0.15, r * 1.2), 0, H * 0.855, 0));                  // gakuzuka (centre strut)
  for (const s of [-1, 1]) black.push(place(new THREE.CylinderGeometry(r * 1.25, r * 1.3, H * 0.08, 12), s * span / 2, H * 0.04, 0));   // black feet
  return { red, black, snow };
}

function buildTorii(course, M, terrain, glow) {
  const g = new THREE.Group();
  g.name = 'Torii';
  const red = [], black = [], snow = [], lan = [], rope = [];
  const add = (x, z, yaw, span, H, sink = 0.2) => {
    const y = Math.min(terrain.getHeight(x + Math.cos(yaw) * span / 2, z - Math.sin(yaw) * span / 2), terrain.getHeight(x - Math.cos(yaw) * span / 2, z + Math.sin(yaw) * span / 2)) - sink;
    const P = toriiParts(span, H);
    for (const [list, out] of [[P.red, red], [P.black, black], [P.snow, snow]]) for (const geo of list) out.push(place(geo, x, y, z, yaw));
    return y;
  };
  // The tunnel: gates face along the corridor (their crossbeams across it).
  course.gates.forEach((gt, i) => {
    const yaw = Math.atan2(gt.rz, gt.rx) * -1;   // local x → across the corridor (rx, rz)
    const y = add(gt.x, gt.z, yaw, gt.span, gt.height);
    if (i % 3 === 1) {
      const lg = new THREE.SphereGeometry(0.24, 10, 8); lg.scale(1, 1.35, 1);
      for (const sgn of [-1, 1]) {
        const lx = gt.x + gt.rx * sgn * (gt.span / 2 + 0.45), lz = gt.z + gt.rz * sgn * (gt.span / 2 + 0.45);
        lan.push(place(lg, lx, y + gt.height * 0.62, lz));
        glow.push([lx, y + gt.height * 0.62, lz, 3.0, 1]);
      }
    }
  });
  // The great gates (facing down the fall line: crossbeam across it), with a shimenawa rope.
  for (const t of OTORII) {
    const x = START_X + t.u, z = t.v;
    const y = add(x, z, Math.PI / 2, t.span, t.height, 0.4);
    const curve = new THREE.CatmullRomCurve3([-0.5, -0.25, 0, 0.25, 0.5].map((k) => new THREE.Vector3(x, y + t.height * 0.72 - 0.5 * (1 - (2 * k) ** 2), z + k * t.span * 0.9)));
    rope.push(new THREE.TubeGeometry(curve, 24, 0.22, 8, false));
    for (const k of [-0.25, 0, 0.25]) glow.push([x + 1, y + t.height * 0.5, z + k * t.span, 4, 0.8]);
  }
  g.add(merged(red, M.red, 'toriiRed'));
  g.add(merged(black, M.black, 'toriiBlack'));
  g.add(merged(snow, M.snow, 'toriiSnow'));
  if (lan.length) g.add(merged(lan, M.chochin, 'tunnelLanterns'));
  if (rope.length) g.add(merged(rope, M.rope, 'shimenawa'));
  return g;
}

// ------------------------------------------------------------------ the pagoda
function buildPagoda(M, terrain, glow) {
  const g = new THREE.Group();
  g.name = 'Pagoda';
  const x0 = START_X + PAGODA.u, z0 = PAGODA.v;
  let y = Math.min(...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => terrain.getHeight(x0 + a * PAGODA.base / 2, z0 + b * PAGODA.base / 2))) - 0.5;
  const body = [], red = [], roof = [], snow = [], spire = [];
  const tierH = (PAGODA.height - 6) / PAGODA.tiers;
  // Stone plinth.
  body.push(place(new THREE.BoxGeometry(PAGODA.base + 2.4, 1.4, PAGODA.base + 2.4), x0, y + 0.7, z0));
  y += 1.4;
  for (let i = 0; i < PAGODA.tiers; i++) {
    const w = PAGODA.base * (1 - 0.08 * i), h = i === 0 ? tierH * 1.15 : tierH * 0.92;
    body.push(place(new THREE.BoxGeometry(w, h, w), x0, y + h / 2, z0));
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) red.push(place(new THREE.CylinderGeometry(0.22, 0.22, h, 8), x0 + a * w / 2, y + h / 2, z0 + b * w / 2));
    // A band of glowing windows on the first tier.
    if (i === 0) glow.push([x0 + w / 2 + 1, y + 1.8, z0, 6, 0.6]);
    y += h;
    const R = w / 2 + 2.3 - 0.15 * i;
    roof.push(curvedRoof(R, 1.5, 0.7, 0.3, x0, y, z0));
    snow.push(curvedRoof(R - 0.15, 1.5, 0.7, 0.75, x0, y + 0.02, z0, true));
    y += 0.6;
  }
  // Sōrin: the bronze spire with nine rings.
  spire.push(place(new THREE.CylinderGeometry(0.12, 0.22, 7.5, 8), x0, y + 3.75, z0));
  for (let k = 0; k < 9; k++) spire.push(place(new THREE.CylinderGeometry(0.55 - k * 0.03, 0.55 - k * 0.03, 0.12, 12), x0, y + 1.2 + k * 0.55, z0));
  spire.push(place(new THREE.SphereGeometry(0.35, 10, 8), x0, y + 7.7, z0));
  g.add(merged(body, M.plaster, 'pagodaBody'));
  g.add(merged(red, M.red, 'pagodaPosts'));
  g.add(merged(roof, M.roof, 'pagodaRoofs'));
  g.add(merged(snow, M.snow, 'pagodaSnow'));
  g.add(merged(spire, M.bronze, 'pagodaSpire'));
  return g;
}

/**
 * A square pagoda roof of half-width R: sloping down from the centre `drop` m, sagging between the corners and
 * flying up at them (`lift`); `thick` = slab thickness; snow = a soft cap (rounded off at the edges, thinner at
 * the flying corners).
 */
function curvedRoof(R, drop, lift, thick, x, y, z, snow = false) {
  const n = 16, pos = [], idx = [];
  const fy = (a, b) => {
    const r = Math.max(Math.abs(a), Math.abs(b)) / R, c = Math.min(Math.abs(a), Math.abs(b)) / R;
    return -drop * Math.pow(r, 0.8) + lift * Math.pow(r, 6) * (0.4 + 0.6 * c * c);
  };
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const a = -R + 2 * R * i / n, b = -R + 2 * R * j / n;
    const edge = Math.max(Math.abs(a), Math.abs(b)) / R;
    let yy = fy(a, b);
    if (snow) yy += thick * Math.sqrt(Math.max(0, 1 - edge ** 8)) * (1 - 0.5 * Math.min(Math.abs(a), Math.abs(b)) / R);
    pos.push(x + a, y + yy, z + b);
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const k = j * (n + 1) + i; idx.push(k, k + n + 1, k + 1, k + 1, k + n + 1, k + n + 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.attributes.normal.getY(Math.floor(pos.length / 6)) < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g.toNonIndexed();
}

// ------------------------------------------------------------------ lanterns, markers, foxes
function buildLanterns(course, M, terrain, glow) {
  const g = new THREE.Group();
  g.name = 'Lanterns';
  const stone = [], flame = [], snow = [], poles = [], paper = [], marker = [], fox = [];
  // Tōrō geometry (≈ 2.1 m): base, post, platform, firebox, roof, finial.
  const parts = {
    base: new THREE.CylinderGeometry(0.42, 0.5, 0.3, 6),
    post: new THREE.CylinderGeometry(0.16, 0.18, 0.85, 8),
    deck: new THREE.CylinderGeometry(0.46, 0.34, 0.2, 6),
    box: new THREE.BoxGeometry(0.5, 0.42, 0.5),
    roof: new THREE.ConeGeometry(0.72, 0.36, 6),
    ball: new THREE.SphereGeometry(0.1, 8, 6),
    cap: new THREE.ConeGeometry(0.66, 0.22, 6),
  };
  const poleG = new THREE.CylinderGeometry(0.035, 0.045, 3.2, 6);
  const armG = new THREE.BoxGeometry(0.7, 0.04, 0.04);
  const chochinG = new THREE.SphereGeometry(0.3, 10, 8); chochinG.scale(1, 1.4, 1);
  const markerG = new THREE.CylinderGeometry(0.03, 0.04, 1.8, 5);
  const markerTop = new THREE.BoxGeometry(0.08, 0.35, 0.08);
  let n = 0;
  for (const L of course.lanterns) {
    const y = terrain.getHeight(L.x, L.z) - 0.05;
    const yaw = (n++ * 0.7) % 1.0;
    if (L.kind === 'toro') {
      stone.push(place(parts.base, L.x, y + 0.15, L.z, yaw), place(parts.post, L.x, y + 0.72, L.z, yaw), place(parts.deck, L.x, y + 1.24, L.z, yaw),
        place(parts.roof, L.x, y + 1.76, L.z, yaw), place(parts.ball, L.x, y + 2.0, L.z, yaw));
      flame.push(place(parts.box, L.x, y + 1.55, L.z, yaw));
      snow.push(place(parts.cap, L.x, y + 1.93, L.z, yaw));
      glow.push([L.x, y + 1.55, L.z, 4.2, 1]);
    } else if (L.kind === 'pole') {
      poles.push(place(poleG, L.x, y + 1.5, L.z), place(armG, L.x + 0.3, y + 3.0, L.z));
      paper.push(place(chochinG, L.x + 0.62, y + 2.55, L.z));
      glow.push([L.x + 0.62, y + 2.55, L.z, 4.5, 1]);
    } else if (L.kind === 'marker') {
      marker.push(place(markerG, L.x, y + 0.9, L.z));
      poles.push(place(markerTop, L.x, y + 1.85, L.z));
    }
  }
  // Fox statues (white stone kitsune) flanking the Ō-torii and the shrine steps.
  for (const [u, v, yaw] of course.foxes || []) {
    const x = START_X + u, y = terrain.getHeight(x, v);
    const f = foxGeometry();
    fox.push(place(f, x, y, v, yaw));
    stone.push(place(new THREE.BoxGeometry(1.2, 1.1, 1.2), x, y + 0.35, v, yaw));
  }
  if (stone.length) g.add(merged(stone, M.stone, 'toro'));
  if (flame.length) g.add(merged(flame, M.flame, 'toroFlame'));
  if (snow.length) g.add(merged(snow, M.snow, 'toroSnow'));
  if (poles.length) g.add(merged(poles, M.bamboo, 'poles'));
  if (paper.length) g.add(merged(paper, M.chochin, 'chochin'));
  if (marker.length) g.add(merged(marker, M.red, 'markers'));
  if (fox.length) g.add(merged(fox, M.fox, 'foxes'));
  return g;
}

/** A sitting fox (≈ 1.4 m on its plinth): body, chest, head, snout, ears and a big upright tail. */
function foxGeometry() {
  const parts = [];
  const body = new THREE.SphereGeometry(0.42, 12, 10); body.scale(0.8, 1.15, 1.0); parts.push(place(body, 0, 1.25, 0.05));
  const head = new THREE.SphereGeometry(0.24, 12, 10); parts.push(place(head, 0, 1.85, -0.18));
  const snout = new THREE.ConeGeometry(0.11, 0.34, 8); snout.rotateX(-Math.PI / 2); parts.push(place(snout, 0, 1.8, -0.44));
  for (const s of [-1, 1]) { const ear = new THREE.ConeGeometry(0.08, 0.26, 6); parts.push(place(ear, s * 0.12, 2.12, -0.15)); }
  const tail = new THREE.SphereGeometry(0.2, 10, 8); tail.scale(1, 2.6, 1); tail.rotateX(0.35); parts.push(place(tail, 0.25, 1.45, 0.45));
  return mergeGeometries(parts.map((p) => stripAttrs(ni(p))));
}

// ------------------------------------------------------------------ birches (instanced, chunked)
function birchGeometries() {
  // Trunk (height 1 = BIRCH.height at scale 1) with two main limbs; bark texture (v along the trunk).
  const trunk = new THREE.CylinderGeometry(BIRCH.trunk * 0.35, BIRCH.trunk, BIRCH.height * 0.82, 8, 4, true);
  trunk.translate(0, BIRCH.height * 0.41, 0);
  // A slight crook: dakekanba never grows quite straight.
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / BIRCH.height; p.setX(i, p.getX(i) + Math.sin(y * 5) * 0.25 * y); p.setZ(i, p.getZ(i) + Math.sin(y * 3 + 1) * 0.18 * y); }
  trunk.computeVertexNormals();
  const limbs = [];
  for (const [a, h, tilt, len] of [[0.3, 0.5, 0.75, 4.2], [2.4, 0.6, 0.65, 3.6], [4.2, 0.68, 0.7, 3.2], [1.4, 0.74, 0.55, 2.8]]) {
    const l = new THREE.CylinderGeometry(0.035, 0.085, len, 5, 1, true);
    l.translate(0, len / 2, 0); l.rotateZ(tilt); l.rotateY(a);
    l.translate(Math.sin(h * 5) * 0.25 * h, BIRCH.height * h, Math.sin(h * 3 + 1) * 0.18 * h);
    limbs.push(l);
  }
  const wood = mergeGeometries([trunk, ...limbs].map((g) => stripAttrs(ni(g))));
  // Twig cards: three crossed quads around the crown.
  const cards = [];
  for (let k = 0; k < 3; k++) {
    const q = new THREE.PlaneGeometry(6.0, 6.5);
    q.translate(0, BIRCH.height * 0.74, 0);
    q.rotateY(k * Math.PI / 3);
    cards.push(q);
  }
  const twigs = mergeGeometries(cards.map((g) => stripAttrs(ni(g))));
  return { wood, twigs };
}

function buildBirches(course, M, terrain) {
  const g = new THREE.Group();
  g.name = 'Birches';
  const { wood, twigs } = birchGeometries();
  const CH = 260, chunks = new Map();
  for (const b of course.forest.birches) {
    const k = `${Math.floor(b[0] / CH)},${Math.floor(b[1] / CH)}`;
    if (!chunks.has(k)) chunks.set(k, []);
    chunks.get(k).push(b);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  for (const list of chunks.values()) {
    const n = list.reduce((a, b) => a + b[5], 0);
    const W = new THREE.InstancedMesh(wood, M.bark, n), T = new THREE.InstancedMesh(twigs, M.twigs, n);
    T.userData.shadow = false;
    let i = 0;
    for (const [x, z, sc, yaw, lean, stems, r] of list) {
      for (let k = 0; k < stems; k++) {
        const ox = k ? Math.cos(yaw) * 0.7 : 0, oz = k ? Math.sin(yaw) * 0.7 : 0;
        const kk = k ? 0.82 : 1;
        e.set(lean + (k ? 0.1 : 0), yaw + k * 2, lean * 0.5 * (r - 0.5) - (k ? 0.12 : 0));
        q.setFromEuler(e);
        p.set(x + ox, terrain.getHeight(x + ox, z + oz) - 0.5, z + oz);
        s.set(sc * kk, sc * kk * (0.9 + 0.2 * r), sc * kk);
        m.compose(p, q, s);
        W.setMatrixAt(i, m); T.setMatrixAt(i, m);
        i++;
      }
    }
    W.computeBoundingSphere(); T.computeBoundingSphere();
    g.add(W, T);
  }
  return g;
}

// ------------------------------------------------------------------ snow monsters
function buildJuhyo(course, M, terrain) {
  const parts = [];
  const blob = (r, y, sx = 1, sy = 1) => { const b = new THREE.IcosahedronGeometry(r, 2); b.scale(sx, sy, sx); const p = b.attributes.position; for (let i = 0; i < p.count; i++) { const k = 1 + 0.12 * Math.sin(p.getX(i) * 5 + p.getY(i) * 3) * Math.cos(p.getZ(i) * 4); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); } b.translate(0, y, 0); return b; };
  parts.push(blob(1.5, 1.2, 1, 1.0), blob(1.25, 2.9, 0.95, 1.1), blob(0.95, 4.5, 0.9, 1.15), blob(0.6, 5.8, 0.85, 1.2), blob(0.5, 3.4, 1.6, 0.5));
  const geo = mergeGeometries(parts.map((p) => stripAttrs(ni(p))));
  geo.computeVertexNormals();
  const list = course.forest.juhyo;
  const mesh = new THREE.InstancedMesh(geo, M.snow, list.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  list.forEach(([x, z, sc, yaw, r], i) => {
    q.setFromAxisAngle(_up, yaw);
    p.set(x, terrain.getHeight(x, z) - 0.6, z);
    s.set(sc * (0.9 + 0.3 * r), sc * (0.8 + 0.5 * r), sc);
    mesh.setMatrixAt(i, m.compose(p, q, s));
  });
  mesh.computeBoundingSphere();
  mesh.name = 'Juhyo';
  return mesh;
}

// ------------------------------------------------------------------ the gondola
function buildGondola(course, M, terrain, glow) {
  const g = new THREE.Group();
  g.name = 'Gondola';
  const G = GONDOLA;
  const top = course.structures.find((s) => s.id === 'topstation'), base = course.structures.find((s) => s.id === 'basestation');
  const A = new THREE.Vector3(START_X + G.from[0], 0, G.from[1]), B = new THREE.Vector3(START_X + G.to[0], 0, G.to[1]);
  A.y = base.roofY(0, 0) - 2.2; B.y = top.roofY(0, 0) - 2.2;
  // Support points: the stations and each tower's crossarm.
  const sup = [A.clone()];
  const steel = [];
  for (const t of course.towers) {
    const y0 = terrain.getHeight(t.x, t.z);
    const h = G.height;
    steel.push(place(new THREE.BoxGeometry(1.0, h, 1.0), t.x, y0 + h / 2 - 0.5, t.z));
    steel.push(place(new THREE.BoxGeometry(1.4, 0.6, 7.5), t.x, y0 + h, t.z));
    sup.push(new THREE.Vector3(t.x, y0 + h - 0.4, t.z));
  }
  sup.push(B.clone());
  sup.sort((p, q) => p.x - q.x).reverse();   // from the base (high x) up to the top
  // Two cables (up and down, ±2.8 m across), sagging between supports.
  const side = new THREE.Vector3(B.z - A.z, 0, -(B.x - A.x)).normalize().multiplyScalar(2.8);
  const lines = [];
  const paths = [];
  for (const sgn of [-1, 1]) {
    const pts = [];
    for (let i = 0; i < sup.length - 1; i++) {
      const a = sup[i], b = sup[i + 1], span = a.distanceTo(b);
      for (let k = 0; k < 12; k++) {
        const t = k / 12;
        const p = a.clone().lerp(b, t).addScaledVector(side, sgn);
        p.y -= span * 0.025 * 4 * t * (1 - t);
        pts.push(p);
      }
    }
    pts.push(sup[sup.length - 1].clone().addScaledVector(side, sgn));
    paths.push(pts);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    lines.push(new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x1a1a1e })));
  }
  for (const l of lines) g.add(l);
  g.add(merged(steel, M.steel, 'towers'));
  // Cabins: red boxes with warm-lit windows, running up one cable and down the other.
  const cabin = mergeGeometries([new THREE.BoxGeometry(2.2, 2.0, 2.0), place(new THREE.BoxGeometry(0.12, 1.6, 0.12), 0, 1.75, 0)].map((x) => stripAttrs(ni(x))));
  cabin.translate(0, -2.5, 0);
  const glass = new THREE.BoxGeometry(2.25, 0.8, 2.05); glass.translate(0, -2.2, 0);
  const n = G.cabins;
  const body = new THREE.InstancedMesh(cabin, M.cabin, n), win = new THREE.InstancedMesh(glass, M.cabinGlass, n);
  body.frustumCulled = false; win.frustumCulled = false;
  const lens = paths.map((pts) => { const L = [0]; for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + pts[i].distanceTo(pts[i - 1])); return L; });
  const at = (k, d, out) => {
    const pts = paths[k], L = lens[k];
    let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const t = Math.min(1, Math.max(0, (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1])));
    return out.copy(pts[i - 1]).lerp(pts[i], t);
  };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(_up, Math.atan2(-(B.z - A.z), B.x - A.x)), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  body.onBeforeRender = () => {
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const k = i % 2, Ltot = lens[k][lens[k].length - 1];
      let d = ((t * 5 + i / n * Ltot * 2) % Ltot);
      if (k === 1) d = Ltot - d;
      at(k, d, p);
      m.compose(p, q, one);
      body.setMatrixAt(i, m); win.setMatrixAt(i, m);
    }
    body.instanceMatrix.needsUpdate = true; win.instanceMatrix.needsUpdate = true;
  };
  g.add(body, win);
  glow.push([A.x, A.y - 3, A.z, 7, 0.8], [B.x, B.y - 3, B.z, 7, 0.8]);
  return g;
}

// ------------------------------------------------------------------ onsen
function buildOnsen(M, terrain, glow) {
  const g = new THREE.Group();
  g.name = 'Onsen';
  const x = START_X + ONSEN.u, z = ONSEN.v, y = terrain.getHeight(x, z) + 0.15;
  const water = new THREE.Mesh(new THREE.CircleGeometry(ONSEN.r + 0.2, 40), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, y, z);
  g.add(water);
  const rocks = [];
  for (let k = 0; k < 26; k++) {
    const a = k / 26 * Math.PI * 2 + Math.sin(k * 7) * 0.08, r = ONSEN.r + 0.6 + Math.sin(k * 3.1) * 0.3;
    const rg = new THREE.DodecahedronGeometry(0.9 + 0.4 * Math.abs(Math.sin(k * 5.3)), 0);
    rocks.push(place(rg, x + Math.cos(a) * r, terrain.getHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) + 0.1, z + Math.sin(a) * r, k, 1, 0.7, 1));
  }
  g.add(merged(rocks, M.rock, 'onsenRocks'));
  glow.push([x, y + 1, z, 9, 0.35]);
  return g;
}

// ------------------------------------------------------------------ steam (onsen + fumaroles)
function buildSteam(course, terrain) {
  const vents = [];
  // The onsen: several vents across the pool, low and wide.
  for (let k = 0; k < 5; k++) {
    const a = k * 1.3, r = ONSEN.r * 0.5 * (k / 5);
    const x = START_X + ONSEN.u + Math.cos(a) * r, z = ONSEN.v + Math.sin(a) * r;
    vents.push({ p: new THREE.Vector3(x, terrain.getHeight(x, z) + 0.4, z), rise: 9, grow: 9, alpha: 0.4, warm: 1 });
  }
  // Fumaroles on the crater's inner wall (Asahidake): taller sulphur-tinted plumes.
  for (const [a, f] of [[2.2, 0.75], [3.4, 0.6], [4.4, 0.8], [0.9, 0.7]]) {
    const x = START_X + CRATER.u + Math.cos(a) * CRATER.R * f, z = CRATER.v + Math.sin(a) * CRATER.R * f;
    vents.push({ p: new THREE.Vector3(x, terrain.getHeight(x, z) + 1, z), rise: 40, grow: 22, alpha: 0.55, warm: 0 });
  }
  void TOP;
  const PER = 18, LIFE = 9, n = vents.length * PER;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iData', iData);
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { noiseTex: { value: terrain.terrainUniforms?.noiseTex.value ?? null } },
    vertexShader: /* glsl */`
      attribute vec4 iPos; attribute vec3 iData;
      varying vec2 vQ; varying float vA; varying float vSeed; varying float vWarm;
      void main() {
        vQ = position.xy; vA = iData.x; vSeed = iData.y; vWarm = iData.z;
        vec4 c = viewMatrix * vec4(iPos.xyz, 1.0);
        float a = vSeed * 6.28;
        c.xy += mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * iPos.w;
        vA *= smoothstep(1.0, 4.0, -c.z);
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D noiseTex;
      varying vec2 vQ; varying float vA; varying float vSeed; varying float vWarm;
      void main() {
        float r = length(vQ) * 2.0;
        float n = texture2D(noiseTex, vQ * 0.6 + vSeed * 3.7).r;
        float a = (1.0 - smoothstep(0.15, 1.0, r + (n - 0.5) * 0.7)) * vA;
        if (a < 0.004) discard;
        vec3 col = mix(vec3(0.80, 0.80, 0.70), vec3(1.0, 0.86, 0.70), vWarm) * (0.75 + 0.3 * n);
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Steam';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  const hash = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  mesh.onBeforeRender = () => {
    const t = performance.now() / 1000;
    for (let v = 0; v < vents.length; v++) {
      const o = vents[v];
      for (let k = 0; k < PER; k++) {
        const i = v * PER + k, sd = hash(i + 1);
        const age = ((t + k * LIFE / PER + sd * 0.5) % LIFE) / LIFE;
        const rise = o.rise * Math.sqrt(age), lean = 8 * age * age;
        const sway = Math.sin(t * 0.4 + age * 4 + v) * 1.5 * age;
        iPos.setXYZW(i, o.p.x + lean + sway, o.p.y + rise, o.p.z + sway * 0.5 + lean * 0.4, 1.5 + o.grow * age);
        iData.setXYZ(i, o.alpha * Math.min(1, age * 6) * (1 - age) ** 1.5, sd, o.warm);
      }
    }
    iPos.needsUpdate = true; iData.needsUpdate = true;
  };
  return mesh;
}

// ------------------------------------------------------------------ lantern glow (one draw)
/** Soft additive halos round every light source: size-attenuated points, a gentle flicker. */
function buildGlow(list) {
  const pos = new Float32Array(list.length * 3), data = new Float32Array(list.length * 2);
  list.forEach(([x, y, z, size, warm], i) => { pos.set([x, y, z], i * 3); data.set([size, warm], i * 2); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aData', new THREE.BufferAttribute(data, 2));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uScale: { value: 600 } },
    vertexShader: /* glsl */`
      attribute vec2 aData; uniform float uTime; uniform float uScale;
      varying float vWarm; varying float vFade;
      void main() {
        vec4 c = modelViewMatrix * vec4(position, 1.0);
        float flick = 0.9 + 0.1 * sin(uTime * 9.0 + position.x * 3.1 + position.z * 1.7);
        gl_PointSize = clamp(aData.x * flick * uScale / max(1.0, -c.z), 1.5, 220.0);
        vWarm = aData.y;
        vFade = smoothstep(2.0, 6.0, -c.z);
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: /* glsl */`
      varying float vWarm; varying float vFade;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = exp(-r * r * 4.0) * 0.55 * vFade;
        if (a < 0.003) discard;
        vec3 col = mix(vec3(1.0, 0.78, 0.5), vec3(1.0, 0.55, 0.22), vWarm);
        gl_FragColor = vec4(col * a, a);
      }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.name = 'LanternGlow';
  pts.renderOrder = 21;
  pts.onBeforeRender = (r) => {
    mat.uniforms.uTime.value = performance.now() / 1000;
    const h = r.getDrawingBufferSize(new THREE.Vector2()).y;
    mat.uniforms.uScale.value = h * 0.9;
  };
  return pts;
}
