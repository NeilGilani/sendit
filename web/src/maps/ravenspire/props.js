// Ravenspire props: the old buildings (weathered plank walls, boarded windows, stone chimneys,
// faded signs, snow-loaded roofs whose snow mesh IS the rideable surface from structures.js) and
// the abandoned gondola (rusty towers leaning a little, sagging haul ropes, two forgotten cabins).
// Browser only (materials / canvas textures); loaded by index.js.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../../world.js';
import { RAVINE, START_X } from './layout.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from '../../gfx/snow.js';
import { on, emit } from '../../state.js';

export function buildRavenspireProps(course, { terrain }) {
  const group = new THREE.Group();
  group.name = 'RavenspireProps';
  const M = materials(terrain);
  for (const s of course.structures) group.add(buildStructure(s, M, terrain));
  group.add(buildGondola(course, M, terrain));
  group.add(buildHeli(course, terrain));
  group.add(buildRavens(course, terrain));
  group.add(buildIceFalls(course, terrain));
  group.add(buildSmoke(course, terrain));
  group.add(buildMast(course, M, terrain));
  group.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
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

/** Sun-bleached, silver-brown vertical boards with dark gaps, knots and streaks (1 repeat ≈ 2 m). */
function woodTexture(tint = [118, 92, 70], seed = 3) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(seed);
    const boards = 8, bw = w / boards;
    for (let i = 0; i < boards; i++) {
      const k = 0.78 + r() * 0.3;
      const grey = r() * 0.35;
      const cr = tint[0] * k * (1 - grey) + 128 * grey, cg = tint[1] * k * (1 - grey) + 124 * grey, cb = tint[2] * k * (1 - grey) + 118 * grey;
      g.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
      g.fillRect(i * bw, 0, bw, h);
      for (let s = 0; s < 40; s++) {               // grain
        g.fillStyle = `rgba(${r() < 0.5 ? '40,28,20' : '200,190,175'},${0.05 + r() * 0.08})`;
        g.fillRect(i * bw + r() * bw, r() * h, 1 + r() * 1.5, 20 + r() * 80);
      }
      if (r() < 0.6) { g.fillStyle = 'rgba(35,22,14,0.55)'; g.beginPath(); g.ellipse(i * bw + r() * bw, r() * h, 2.5, 4, 0, 0, 6.3); g.fill(); }
      g.fillStyle = 'rgba(20,12,8,0.85)';
      g.fillRect(i * bw, 0, 2, h);                  // gap between boards
    }
    // Water streaks from the eaves.
    for (let s = 0; s < 14; s++) { g.fillStyle = `rgba(30,24,20,${0.08 + r() * 0.1})`; g.fillRect(r() * w, 0, 3 + r() * 8, h * (0.3 + r() * 0.6)); }
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
        const rw = 30 + r() * 46;
        const l = 70 + r() * 70;
        g.fillStyle = `rgb(${l + 6 | 0},${l + 2 | 0},${l - 4 | 0})`;
        g.beginPath(); g.roundRect(x + 2, y + 2, rw - 4, rh - 4, 7); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 4, y + 3, rw - 10, 3);
        x += rw;
      }
      y += rh;
    }
  });
}

function rustTexture(seed = 5) {
  return canvasTex(128, 128, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = '#5d4134'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) {
      const c = r() < 0.5 ? `rgba(140,72,38,${0.2 + r() * 0.4})` : `rgba(60,58,58,${0.2 + r() * 0.4})`;
      g.fillStyle = c; g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 7, 0, 6.3); g.fill();
    }
  });
}

function signTexture(lines, seed = 2) {
  return canvasTex(512, 160, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = '#d9cfb8'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(120,100,80,${r() * 0.15})`; g.fillRect(r() * w, r() * h, 2 + r() * 30, 1 + r() * 3); }
    g.strokeStyle = '#7a2a1f'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#7a2a1f'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 64px Georgia, serif'; g.fillText(lines[0], w / 2, lines[1] ? h * 0.4 : h / 2);
    if (lines[1]) { g.font = 'bold 30px Georgia, serif'; g.fillText(lines[1], w / 2, h * 0.76); }
    // Paint flaking off.
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(150,130,100,${0.4 + r() * 0.5})`; g.beginPath(); g.ellipse(r() * w, r() * h, 3 + r() * 14, 2 + r() * 6, r() * 3, 0, 6.3); g.fill(); }
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
    wood: toonMaterial({ name: 'oldWood', map: woodTexture() }),
    woodDark: toonMaterial({ name: 'oldWoodDark', map: woodTexture([82, 62, 48], 7) }),
    roofWood: toonMaterial({ name: 'roofWood', map: woodTexture([70, 54, 44], 8), side: THREE.DoubleSide }),
    woodRed: toonMaterial({ name: 'oldWoodRed', map: woodTexture([120, 52, 40], 11) }),
    stone: toonMaterial({ name: 'oldStone', map: stoneTexture() }),
    rust: toonMaterial({ name: 'rust', map: rustTexture() }),
    steel: toonMaterial({ name: 'steel', color: 0x3a3c40 }),
    glass: toonMaterial({ name: 'oldGlass', color: 0x1a2230, side: THREE.DoubleSide }),
    cabin: toonMaterial({ name: 'cabin', map: rustTexture(8), color: 0xd8a090 }),
    cable: new THREE.MeshLambertMaterial({ color: 0x24221f }),
  };
}

// ------------------------------------------------------------------ buildings
function buildStructure(s, M, terrain) {
  const g = new THREE.Group();
  g.name = `Building:${s.id}`;
  const wall = s.id === 'valley' ? M.woodRed : s.roof === 'aframe' ? M.woodDark : M.wood;
  const p = [0, 0];
  const W = (a, b) => s.world(a, b, p);
  // Walls: four strips from below the snow up to the underside of the roof (follows any roof shape).
  const walls = [];
  const edges = [[-s.hl, -s.hw, s.hl, -s.hw], [s.hl, -s.hw, s.hl, s.hw], [s.hl, s.hw, -s.hl, s.hw], [-s.hl, s.hw, -s.hl, -s.hw]];
  for (const [a0, b0, a1, b1] of edges) walls.push(wallStrip(s, a0, b0, a1, b1, W));
  const wallMesh = new THREE.Mesh(mergeGeometries(walls), wall);
  g.add(wallMesh);
  // Roof slab (structure under the snow) with dark fascia edges.
  g.add(new THREE.Mesh(roofSlab(s, W), M.roofWood));
  // Snow on the roof: sampled from the same surface the physics rides.
  g.add(new THREE.Mesh(roofSnow(s, W), M.snow));
  // Boarded windows wherever a wall stands clear of the snow (every ~4 m), corner posts, a door downhill.
  const deco = [], planks = [];
  const downY = s.roofY(s.hl, 0) - 0.4;
  const winY = Math.min(downY - 1.6, terrainAt(terrain, W(s.hl + 0.05, 0)) + 2.6);
  if (s.roof !== 'aframe') {
    let n = 0;
    const sides = [[1, 0, s.hl, s.hw], [-1, 0, s.hl, s.hw], [0, 1, s.hw, s.hl], [0, -1, s.hw, s.hl]];
    for (const [na, nb, off, half] of sides) {
      const count = Math.floor((half * 2 - 2) / 4);
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count * (half * 2 - 2) - (half - 1);
        const a = na ? na * (off + 0.08) : t, b = nb ? nb * (off + 0.08) : t;
        const ground = terrainAt(terrain, W(a + na * 0.6, b + nb * 0.6));
        const top = s.roofY(a, b) - 0.7;
        const y = Math.min(top - 0.8, ground + 2.3);
        if (y - 0.8 < ground + 0.4 || y + 0.7 > top) continue;
        const da = na ? 0.16 : 1.15, db = nb ? 0.16 : 1.15;
        deco.push(boxAt(s, a, b, y, da, 1.4, db, W, 0));
        // Planks nailed across (a slight random tilt).
        for (let k = 0; k < 2; k++) {
          const pa = a + na * 0.12, pb = b + nb * 0.12;
          const g2 = boxAt(s, pa, pb, y - 0.25 + k * 0.5, na ? 0.06 : 1.45, 0.16, nb ? 0.06 : 1.45, W, 0);
          planks.push(g2);
        }
        n++;
      }
    }
    // A heavy door on the downhill wall.
    const dg = terrainAt(terrain, W(s.hl + 0.6, s.hw * 0.45));
    if (s.roofY(s.hl, s.hw * 0.45) - dg > 3) deco.push(boxAt(s, s.hl + 0.1, s.hw * 0.45, dg + 1.05, 0.18, 2.3, 1.3, W, 0));
    void n;
  }
  for (const [ca, cb] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const top = s.roofY(ca * s.hl, cb * s.hw);
    if (top - s.base < 1) continue;
    deco.push(boxAt(s, ca * (s.hl - 0.12), cb * (s.hw - 0.12), (top + s.base) / 2, 0.36, top - s.base, 0.36, W, 0));
  }
  if (deco.length) g.add(new THREE.Mesh(mergeGeometries(deco), M.woodDark));
  if (planks.length) g.add(new THREE.Mesh(mergeGeometries(planks), M.wood));
  // Glass of the A-frame gable (big triangular window, dark).
  if (s.roof === 'aframe') g.add(new THREE.Mesh(gableGlass(s, W, terrain), M.glass));
  // Chimney: stone, from below the roof to its top, with a snow cap.
  if (s.chim) {
    const c = s.chim, h = c.top - (s.roofY(c.a, c.b) - 1);
    g.add(new THREE.Mesh(boxAt(s, c.a, c.b, c.top - h / 2, c.half * 2, h, c.half * 2, W, 0, true), M.stone));
    g.add(new THREE.Mesh(boxAt(s, c.a, c.b, c.top + 0.12, c.half * 2 + 0.2, 0.28, c.half * 2 + 0.2, W, 0), M.snow));
  }
  // Signs.
  const sign = { station: ['RAVENSPIRE', 'MITTELSTATION · 2190 m'], refuge: ['CORVO', 'REFUGE · 1932 m'], valley: ['TALSTATION', 'RAVENSPIRE BAHN'] }[s.id];
  if (sign) {
    const tex = signTexture(sign, s.id.length);
    const mat = toonMaterial({ name: 'sign', map: tex });
    const sg = new THREE.PlaneGeometry(4.2, 1.3);
    const m = new THREE.Mesh(sg, mat);
    const yy = Math.min(downY - 0.5, winY + 1.7);
    const [x, z] = W(s.hl + 0.22, 0);
    m.position.set(x, yy, z);
    m.lookAt(x + s.ax, yy, z + s.az);
    m.rotateZ(0.03);
    g.add(m);
  }
  // Lift station: the bull wheel on the downhill face, under the roof.
  if (s.id === 'station' || s.id === 'valley') {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 28), M.rust);
    const yy = s.roofY(s.hl, 0) - 1.4;
    const [x, z] = W(s.hl + 0.9, 0);
    wheel.position.set(x, yy, z);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    s.wheelPos = new THREE.Vector3(x, yy, z);
  }
  return g;
}

function terrainAt(terrain, [x, z]) { return terrain.baseHeight(x, z); }

/** A wall strip between two footprint corners: bottom = foundations, top = under the roof. */
function wallStrip(s, a0, b0, a1, b1, W) {
  const n = 12, pos = [], uv = [], idx = [];
  const len = Math.hypot(a1 - a0, b1 - b0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t;
    const top = s.roofY(a, b) - 0.25;
    const [x, z] = W(a, b);
    pos.push(x, s.base, z, x, Math.max(s.base + 0.1, top), z);
    uv.push(t * len / 2.2, s.base / 2.2, t * len / 2.2, top / 2.2);
  }
  for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Outward normals: the edges are listed clockwise in (a, b) → make sure they face out.
  const nrm = g.attributes.normal;
  const mid = W((a0 + a1) / 2, (b0 + b1) / 2), out = [mid[0] - s.x, mid[1] - s.z];
  if (nrm.getX(0) * out[0] + nrm.getZ(0) * out[1] < 0) { g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); g.computeVertexNormals(); }
  return g.toNonIndexed();
}

/** The roof structure: a grid at roof height (top) + underside + fascia, as one closed slab. */
function roofSlab(s, W) {
  const na = 24, nb = 8, th = 0.32;
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
  // Fascia around the edge.
  const ring = [[-s.rl, -s.rw], [s.rl, -s.rw], [s.rl, s.rw], [-s.rl, s.rw], [-s.rl, -s.rw]];
  for (let e = 0; e < 4; e++) {
    const [a0, b0] = ring[e], [a1, b1] = ring[e + 1];
    const pos = [], n = 10;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = a0 + (a1 - a0) * t, b = b0 + (b1 - b0) * t, [x, z] = W(a, b), y = s.roofY(a, b);
      pos.push(x, y - th, z, x, y + 0.02, z);
    }
    const idx = [];
    for (let i = 0; i < n; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }   // one winding (the slab material is double-sided)
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 1 ? v : v * 0.4)).filter((_, i) => i % 3 !== 2), 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g.toNonIndexed());
  }
  return mergeGeometries(geos);
}

/** Snow on the roof: the rideable surface (roofY + snowAt) on a fine grid, curling down at the eaves. */
function roofSnow(s, W) {
  const na = Math.ceil(s.rl * 2 / 0.6), nb = Math.ceil(s.rw * 2 / 0.6);
  const pos = [], idx = [];
  for (let j = 0; j <= nb; j++) for (let i = 0; i <= na; i++) {
    const a = -s.rl + (2 * s.rl) * i / na, b = -s.rw + (2 * s.rw) * j / nb;
    const [x, z] = W(a, b);
    const edge = i === 0 || j === 0 || i === na || j === nb;
    // The outermost ring tucks under the slab edge so the snow reads as a rounded cushion.
    const y = edge ? s.roofY(a, b) - 0.05 : s.roofY(a, b) + s.snowAt(a, b);
    pos.push(x, y, z);
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

function gableGlass(s, W, terrain) {
  // Triangular dark glass on the downhill-facing gable? A-frame gables are the ±b walls; glaze the +b one.
  const pos = [];
  const b = s.hw + 0.06;
  const ridge = s.roofY(0, b) - 0.9;
  const foot = Math.max(terrainAt(terrain, W(0, b)) + 0.4, s.roofY(s.hl * 0.6, b));
  const half = Math.max(0.5, (ridge - foot) / s.tp * 0.8);
  for (const [a, y] of [[-half, foot], [half, foot], [0, ridge]]) { const [x, z] = W(a, b); pos.push(x, y, z); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex([0, 1, 2]);
  g.computeVertexNormals();
  return g;
}

/** Box centred at local (a, b) and height y; sizes along a (da), up (dy), across (db); tilt about the a axis. */
function boxAt(s, a, b, y, da, dy, db, W, tilt = 0, uvWorld = false) {
  const g = new THREE.BoxGeometry(da, dy, db);
  if (uvWorld) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(da, db) / 1.2, uv.getY(i) * dy / 1.2); }
  if (tilt) g.rotateX(tilt);
  const yaw = Math.atan2(-s.az, s.ax);
  g.rotateY(yaw);
  const [x, z] = W(a, b);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

// ------------------------------------------------------------------ the old gondola
function buildGondola(course, M, terrain) {
  const g = new THREE.Group();
  g.name = 'OldGondola';
  const st = course.structures.find((s) => s.id === 'station'), vs = course.structures.find((s) => s.id === 'valley');
  const towerGeo = [], armGeo = [], sheaves = [];
  const tops = [];
  const lineDir = new THREE.Vector2(vs.x - st.x, vs.z - st.z).normalize();
  const across = new THREE.Vector2(-lineDir.y, lineDir.x);
  for (const t of course.towers) {
    const y0 = terrain.baseHeight(t.x, t.z) - 1.5;
    const H = 15;
    // Tapered lattice-like column: four legs + cross braces, then the cross-arm with sheave trains.
    const legs = [];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const leg = new THREE.CylinderGeometry(0.09, 0.13, H, 5);
      leg.translate(0, H / 2, 0);
      const base = new THREE.Vector3(sx * 0.9, 0, sz * 0.9), top = new THREE.Vector3(sx * 0.35, H, sz * 0.35);
      const dir = top.clone().sub(base);
      leg.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize())));
      leg.translate(base.x, 0, base.z);
      legs.push(leg);
    }
    for (let k = 1; k < 6; k++) {
      const yy = k * H / 6, w = 0.9 - (0.55 * yy) / H;
      const br = new THREE.BoxGeometry(w * 2, 0.07, 0.07); br.translate(0, yy, w); legs.push(br);
      const br2 = br.clone(); br2.translate(0, 0, -2 * w); legs.push(br2);
      const br3 = new THREE.BoxGeometry(0.07, 0.07, w * 2); br3.translate(w, yy, 0); legs.push(br3);
      const br4 = br3.clone(); br4.translate(-2 * w, 0, 0); legs.push(br4);
    }
    const col = mergeGeometries(legs.map((x) => x.toNonIndexed()));
    const arm = new THREE.BoxGeometry(0.35, 0.4, 6.2); arm.translate(0, H + 0.2, 0);
    const sh = [];
    for (const sz of [-2.8, 2.8]) { const w = new THREE.CylinderGeometry(0.32, 0.32, 1.6, 10); w.rotateZ(Math.PI / 2); w.translate(0, H - 0.1, sz); sh.push(w.toNonIndexed()); }
    const m = new THREE.Matrix4().compose(new THREE.Vector3(t.x, y0, t.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(t.roll, Math.atan2(lineDir.x, lineDir.y) + Math.PI / 2, t.lean)), new THREE.Vector3(1, 1, 1));
    col.applyMatrix4(m); arm.applyMatrix4(m); towerGeo.push(col); armGeo.push(arm.toNonIndexed());
    for (const w of sh) { w.applyMatrix4(m); sheaves.push(w); }
    const a = new THREE.Vector3(0, H - 0.4, -2.8).applyMatrix4(m), b = new THREE.Vector3(0, H - 0.4, 2.8).applyMatrix4(m);
    tops.push([a, b]);
  }
  g.add(new THREE.Mesh(mergeGeometries(towerGeo), M.rust));
  g.add(new THREE.Mesh(mergeGeometries([...armGeo, ...sheaves]), M.steel));
  // Haul ropes: from the station's bull wheel over every tower to the valley station, sagging.
  const ends = (s) => {
    const c = s.wheelPos || new THREE.Vector3(s.x, s.roofY(s.hl, 0) - 1.4, s.z);
    return [c.clone().add(new THREE.Vector3(across.x * -2.4, 0, across.y * -2.4)), c.clone().add(new THREE.Vector3(across.x * 2.4, 0, across.y * 2.4))];
  };
  const e0 = ends(st), e1 = ends(vs);
  const ropes = [];
  const ropePts = [[], []];
  for (let side = 0; side < 2; side++) {
    const pts = [e0[side], ...tops.map((tp) => {
      // The arm's ends: pick the one on this side of the line.
      const d0 = tp[0].clone().sub(e0[side]).dot(new THREE.Vector3(across.x, 0, across.y));
      return side === 0 ? (d0 < 0 ? tp[0] : tp[1]) : (d0 < 0 ? tp[1] : tp[0]);
    }), e1[side]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], span = a.distanceTo(b);
      const sag = span * 0.035 + (side ? 0.6 : 0) + (i === 2 && side ? 2.5 : 0);   // one rope hangs slack
      const n = Math.max(6, Math.ceil(span / 6));
      const seg = [];
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        seg.push(a.clone().lerp(b, t).add(new THREE.Vector3(0, -4 * sag * t * (1 - t), 0)));
      }
      ropePts[side].push(seg);
      ropes.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg), n * 2, 0.045, 4, false));
    }
  }
  g.add(new THREE.Mesh(mergeGeometries(ropes), M.cable));
  // Two cabins left hanging, rusted, doors shut.
  const cabins = [];
  for (const [span, t] of [[1, 0.42], [3, 0.6]]) {
    const seg = ropePts[span % 2][Math.min(span, ropePts[span % 2].length - 1)];
    const p = seg[Math.round(t * (seg.length - 1))];
    const body = new THREE.BoxGeometry(2.0, 1.9, 1.6);
    body.translate(0, -2.6, 0);
    const roofG = new THREE.BoxGeometry(2.1, 0.25, 1.7); roofG.translate(0, -1.55, 0);
    const hanger = new THREE.CylinderGeometry(0.05, 0.05, 1.5, 4); hanger.translate(0, -0.75, 0);
    const win = new THREE.BoxGeometry(2.04, 0.55, 1.64); win.translate(0, -2.2, 0);
    const yaw = Math.atan2(lineDir.x, lineDir.y);
    for (const part of [body, roofG, hanger]) { part.rotateZ(0.06); part.rotateY(yaw); part.translate(p.x, p.y, p.z); cabins.push(part.toNonIndexed()); }
    win.rotateZ(0.06); win.rotateY(yaw); win.translate(p.x, p.y, p.z);
    g.add(new THREE.Mesh(win, M.glass));
  }
  g.add(new THREE.Mesh(mergeGeometries(cabins), M.cabin));
  return g;
}

// ------------------------------------------------------------------ the heli drop
/**
 * A small mountain helicopter hovering off the summit shoulder (it just dropped you). When the ride
 * starts it holds a moment, then lifts, banks away past the spire and is gone. Animated from wall-clock
 * time in onBeforeRender, so it needs no update hook; emits 'heliDrop' for the rotor sound (audio.js).
 */
function buildHeli(course, terrain) {
  const sp = course.spawnPoint();
  const g = new THREE.Group();
  g.name = 'Heli';
  const red = toonMaterial({ name: 'heliRed', color: 0xc8322a });
  const white = toonMaterial({ name: 'heliWhite', color: 0xe9e6df });
  const dark = toonMaterial({ name: 'heliDark', color: 0x1d2128 });
  const glass = toonMaterial({ name: 'heliGlass', color: 0x2b3a4c });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 12), red);
  body.scale.set(1.0, 0.95, 1.7);
  const cab = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), glass);
  cab.scale.set(1.05, 0.95, 1.1); cab.position.set(0, 0.2, -1.05); cab.rotation.x = -0.9;
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(1.27, 1.27, 0.35, 18, 1, true), white);
  stripe.rotation.x = Math.PI / 2; stripe.scale.set(1, 1.7, 0.95); stripe.position.z = 0.2;
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.16, 5.2, 8), red);
  boom.rotation.x = Math.PI / 2; boom.position.set(0, 0.35, 3.6);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 0.8), red); fin.position.set(0, 0.95, 6.0);
  const skids = [];
  for (const sx of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.4, 6), dark); sk.rotation.x = Math.PI / 2; sk.position.set(sx * 0.95, -1.35, 0); skids.push(sk);
    for (const sz of [-0.8, 0.8]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), dark); st.position.set(sx * 0.8, -1.05, sz); st.rotation.z = sx * 0.4; skids.push(st); }
  }
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.5, 8), dark); mast.position.y = 1.35;
  const rotor = new THREE.Group(); rotor.position.y = 1.6;
  for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.04, 9.5), dark); b.rotation.y = i * Math.PI * 2 / 3; rotor.add(b); }
  const blurMat = new THREE.MeshBasicMaterial({ color: 0x1d2128, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
  const blur = new THREE.Mesh(new THREE.CircleGeometry(4.8, 32), blurMat); blur.rotation.x = -Math.PI / 2; blur.position.y = 1.62;
  const tail = new THREE.Group(); tail.position.set(0.18, 0.95, 6.1);
  for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.4, 0.14), dark); b.rotation.x = i * Math.PI / 2; tail.add(b); }
  g.add(body, cab, stripe, boom, fin, mast, rotor, blur, tail, ...skids);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // Hover spot: just off the rollover, ahead and to the rider's left, where the chase cam sees it.
  const hx = sp.x + 30, hz = sp.z - 42, hy = terrain.getHeight(hx, hz) + 14;
  let start = -1;
  on('rideStarted', () => { start = performance.now() / 1000; emit('heliDrop', { t: 0 }); });
  on('mode', (m) => { if (m === 0) { start = -1; g.visible = true; } });   // back in the lobby: hovering again
  const pos = new THREE.Vector3();
  body.onBeforeRender = () => {
    const now = performance.now() / 1000;
    const t = start < 0 ? 0 : now - start;
    rotor.rotation.y = now * 26; tail.rotation.x = now * 60;
    blur.visible = true;
    // Leave: hold 1.2 s, lift and bank away to the north-west past the spire, accelerating.
    const k = Math.max(0, t - 1.2);
    const climb = k * k * 1.6 + k * 2.5, away = k * k * 3.2;
    pos.set(hx - away * 0.55, hy + climb + Math.sin(now * 1.7) * 0.25, hz - away * 0.85);
    g.position.copy(pos);
    g.rotation.set(-Math.min(0.35, k * 0.12), Math.PI * 0.62 + Math.min(1.1, k * 0.25), Math.min(0.45, k * 0.18), 'YXZ');
    g.visible = t < 22;
  };
  g.position.set(hx, hy, hz);
  g.rotation.y = Math.PI * 0.62;
  return g;
}

// ------------------------------------------------------------------ ravens
/**
 * A few ravens riding the updraft around the spire (the map's namesake). Wings flap now and then,
 * mostly they soar; when the camera is near the summit one of them calls ('ravenCaw', audio.js).
 */
function buildRavens(course, terrain) {
  const g = new THREE.Group();
  g.name = 'Ravens';
  const mat = new THREE.MeshLambertMaterial({ color: 0x101216, side: THREE.DoubleSide });
  const wingG = new THREE.BufferGeometry();
  // One wing: a tapered, slightly swept blade with "fingered" primaries (span 0.65 m).
  wingG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, 0, 0, 0.14, 0.62, 0.02, 0.06, 0.66, 0.02, -0.02, 0.5, 0.02, -0.12], 3));
  wingG.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
  wingG.computeVertexNormals();
  const bodyG = new THREE.ConeGeometry(0.09, 0.62, 6); bodyG.rotateX(Math.PI / 2);
  const tailG = new THREE.BufferGeometry();
  tailG.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, -0.12, 0, 0.5, 0.12, 0, 0.5], 3));
  tailG.setIndex([0, 1, 2]); tailG.computeVertexNormals();
  const sp = course.spawnPoint();
  const cx = sp.x - 300, cz = sp.z + 30, top = terrain.getHeight(cx, cz);
  const birds = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const l = new THREE.Mesh(wingG, mat), r = new THREE.Mesh(wingG, mat);
    r.scale.x = -1;
    b.add(l, r, new THREE.Mesh(bodyG, mat), new THREE.Mesh(tailG, mat));
    b.scale.setScalar(1.6);
    g.add(b);
    birds.push({ b, l, r, a: i * 1.7, rad: 70 + i * 28, h: 30 + i * 22, sp: 0.18 + i * 0.03, ph: i * 2.1 });
  }
  let nextCaw = 0;
  const lead = birds[0].b.children[2];
  lead.onBeforeRender = (_r, _s, cam) => {
    const t = performance.now() / 1000;
    for (const k of birds) {
      const a = k.a + t * k.sp;
      const x = cx + Math.cos(a) * k.rad, z = cz + Math.sin(a) * k.rad * 0.8;
      const y = Math.max(top, terrain.getHeight(x, z)) + k.h + Math.sin(t * 0.4 + k.ph) * 8;
      k.b.position.set(x, y, z);
      k.b.rotation.set(0, -a, 0.35, 'YXZ');   // banked into the circle
      const flapOn = Math.sin(t * 0.5 + k.ph) > 0.55;   // mostly soaring
      const f = flapOn ? Math.sin(t * 9 + k.ph) * 0.55 : 0.08;
      k.l.rotation.z = f; k.r.rotation.z = -f;
    }
    if (t > nextCaw && cam.position.distanceTo(birds[0].b.position) < 650) {
      nextCaw = t + 5 + Math.random() * 9;
      const k = birds[Math.floor(Math.random() * birds.length)].b.position;
      emit('ravenCaw', { x: k.x, y: k.y, z: k.z });
    }
  };
  lead.frustumCulled = false;
  return g;
}

// ------------------------------------------------------------------ frozen falls
/**
 * The named ledges in the ravine floor are frozen waterfalls: a sheet of blue ice over the ledge face and
 * a fringe of icicles hanging off the lip (visual; the ledge itself is terrain).
 */
function buildIceFalls(course, terrain) {
  const g = new THREE.Group();
  g.name = 'IceFalls';
  // Glacial ice: pale blue-white with vertical melt streaks, a touch of inner glow.
  const tex = canvasTex(128, 256, (c, w, h) => {
    const r = rand(21);
    c.fillStyle = '#cfe6f2'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) {
      const x = r() * w, ww = 1 + r() * 6;
      c.fillStyle = r() < 0.55 ? `rgba(120,180,215,${0.15 + r() * 0.3})` : `rgba(255,255,255,${0.2 + r() * 0.4})`;
      c.fillRect(x, r() * h * 0.3, ww, h * (0.4 + r() * 0.7));
    }
  });
  const ice = toonMaterial({ name: 'ice', map: tex, rim: 0.4, frag: 'toonEmissive = vec3(0.02, 0.05, 0.08);' });
  const iceTip = toonMaterial({ name: 'icicle', color: 0xe6f4fb, rim: 0.5 });
  const geos = [], cones = [];
  for (const [ul, h, name] of RAVINE.ledges) {
    if (!name) continue;
    const vc = course.rvAt(course.rv.c, ul), half = course.rvAt(course.rv.f, ul) + 3;
    const x0 = START_X + ul;
    // Ice sheet: a grid over the ledge face (u from just above the lip to the foot), lifted off the rock.
    const nu = 8, nv = 24, pos = [], idx = [], uvs = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const u = ul - 0.6 + (h * 0.12 + 1.6) * i / nu, v = vc - half + 2 * half * j / nv;
      const x = START_X + u, y = terrain.baseHeight(x, v) + 0.12 + 0.08 * Math.sin(j * 1.7 + i);
      pos.push(x + 0.15, y, v);
      uvs.push(j / nv * 4, i / nu);
    }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * (nu + 1) + i;
      idx.push(k, k + 1, k + nu + 1, k + 1, k + nu + 2, k + nu + 1);
    }
    const sheet = new THREE.BufferGeometry();
    sheet.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sheet.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    sheet.setIndex(idx);
    sheet.computeVertexNormals();
    if (sheet.attributes.normal.getY(0) < 0 && sheet.attributes.normal.getX(0) < 0) { sheet.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]])); sheet.computeVertexNormals(); }
    geos.push(sheet);
    // Icicles hanging off the lip, pointing down the face.
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let v = vc - half + 0.5; v < vc + half - 0.5; v += 0.35 + rnd() * 0.6) {
      // Clusters and gaps along the lip (where meltwater ran), long ones in the middle of each cluster.
      const cl = Math.sin(v * 0.55 + ul) * 0.5 + Math.sin(v * 1.7 + ul * 0.3) * 0.3;
      if (cl < -0.25 && rnd() < 0.8) continue;
      const len = (0.5 + rnd() * rnd() * h * 0.5) * (0.6 + Math.max(0, cl) * 1.2), r = (0.1 + rnd() * 0.16) * (0.8 + len * 0.08);
      const c = new THREE.ConeGeometry(r, len, 5);
      c.rotateX(Math.PI);                                   // tip down
      const x = x0 + 0.4 + rnd() * 0.5, top = terrain.baseHeight(x0 - 0.3, v);
      c.translate(x, top - len / 2 + 0.1, v);
      cones.push(c.toNonIndexed());
    }
  }
  if (geos.length) g.add(new THREE.Mesh(mergeGeometries(geos), ice));
  if (cones.length) g.add(new THREE.Mesh(mergeGeometries(cones), iceTip));
  return g;
}

// ------------------------------------------------------------------ chimney smoke + the station mast
// The valley wind: smoke leans and the windsock points this way (x = down the fall line).
const WIND = new THREE.Vector2(0.85, 0.35).normalize();

/**
 * Wood smoke from every chimney: soft camera-facing puffs that rise, grow, lean downwind and fade. It
 * marks the refuge and the A-frames from far up the face (you see the plume long before the roof).
 * One instanced draw for all chimneys; the puffs are visual only.
 */
function buildSmoke(course, terrain) {
  const vents = course.structures.filter((s) => s.chim).map((s) => {
    const [x, z] = s.world(s.chim.a, s.chim.b);
    return new THREE.Vector3(x, s.chim.top + 0.3, z);
  });
  const PER = 26, LIFE = 11, n = vents.length * PER;
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', iPos); geo.setAttribute('iData', iData);
  geo.instanceCount = n;
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { noiseTex: { value: terrain.terrainUniforms?.noiseTex.value ?? null } },
    vertexShader: /* glsl */`
      attribute vec4 iPos; attribute vec2 iData;
      varying vec2 vQ; varying float vA; varying float vSeed; varying float vLit;
      void main() {
        vQ = position.xy; vA = iData.x; vSeed = iData.y;
        vec4 c = viewMatrix * vec4(iPos.xyz, 1.0);
        float a = vSeed * 6.28;
        c.xy += mat2(cos(a), -sin(a), sin(a), cos(a)) * position.xy * iPos.w;
        vLit = 0.75 + 0.25 * vQ.y;
        vA *= smoothstep(1.0, 4.0, -c.z);
        gl_Position = projectionMatrix * c;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D noiseTex;
      varying vec2 vQ; varying float vA; varying float vSeed; varying float vLit;
      void main() {
        float r = length(vQ) * 2.0;
        float n = texture2D(noiseTex, vQ * 0.6 + vSeed * 3.7).r;
        float a = (1.0 - smoothstep(0.2, 1.0, r + (n - 0.5) * 0.7)) * vA;
        if (a < 0.004) discard;
        vec3 col = mix(vec3(0.32, 0.35, 0.41), vec3(0.76, 0.78, 0.83), vLit * (0.55 + 0.5 * n));
        gl_FragColor = vec4(col, a);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'ChimneySmoke';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;   // after the valley mist sheets (the puffs write no depth)
  const hash = (i) => { const x = Math.sin(i * 127.1) * 43758.5453; return x - Math.floor(x); };
  mesh.onBeforeRender = () => {
    const t = performance.now() / 1000;
    for (let v = 0; v < vents.length; v++) {
      const o = vents[v];
      for (let k = 0; k < PER; k++) {
        const i = v * PER + k, sd = hash(i + 1);
        const age = ((t + k * LIFE / PER + sd * 0.4) % LIFE) / LIFE;   // 0 → 1 over a puff's life
        const rise = 26 * Math.sqrt(age) + 6 * age, lean = 30 * age * age + 3 * age;
        const sway = Math.sin(t * 0.35 + age * 4 + v) * 2.5 * age;
        iPos.setXYZW(i, o.x + WIND.x * lean - WIND.y * sway, o.y + rise, o.z + WIND.y * lean + WIND.x * sway, 1.2 + 17 * age);
        iData.setXY(i, 0.75 * Math.min(1, age * 8) * (1 - age) ** 1.6, sd);
      }
    }
    iPos.needsUpdate = true; iData.needsUpdate = true;
  };
  return mesh;
}

/**
 * The old lift station's weather mast: a tall timber pole beside the station with a faded red-and-white
 * windsock and a red beacon. It stands 24 m, so the top shows over the Station Cliff lip and tells you
 * where the roof is before you can see it.
 */
function buildMast(course, M, terrain) {
  const g = new THREE.Group();
  g.name = 'StationMast';
  if (!course.mast) return g;
  const { x, z } = course.mast, y0 = terrain.baseHeight(x, z) - 0.5, H = course.mast.h + 0.5;
  const pole = new THREE.CylinderGeometry(0.13, 0.22, H, 7);
  pole.translate(0, H / 2, 0);
  const bar = new THREE.BoxGeometry(1.6, 0.12, 0.12); bar.translate(0, H - 1.6, 0);
  const cup = new THREE.BoxGeometry(0.1, 0.5, 0.1); cup.translate(0.75, H - 1.3, 0);   // anemometer stub
  const wood = mergeGeometries([pole.toNonIndexed(), bar.toNonIndexed(), cup.toNonIndexed()]);
  wood.translate(x, y0, z);
  g.add(new THREE.Mesh(wood, M.woodDark));
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), toonMaterial({ name: 'beacon', color: 0x902018, frag: 'toonEmissive = vec3(0.9, 0.08, 0.04) * (0.4 + 0.6 * step(0.5, fract(uTime * 0.6)));' }));
  lamp.position.set(x, y0 + H + 0.2, z);
  g.add(lamp);
  // Windsock: an open cone on a swivel, red and white bands faded by the sun.
  const tex = canvasTex(64, 16, (c, w, h) => {
    for (let i = 0; i < 5; i++) { c.fillStyle = i % 2 ? '#e8e2d8' : '#c8402e'; c.fillRect(i * w / 5, 0, w / 5 + 1, h); }
    c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, w, h * 0.4);
  }, false);
  const sockG = new THREE.CylinderGeometry(0.42, 0.16, 2.6, 10, 4, true);
  sockG.rotateZ(-Math.PI / 2); sockG.translate(1.3 + 0.15, 0, 0);   // along +x from the swivel
  { const uv = sockG.attributes.uv, p = sockG.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) - 0.15) / 2.6, uv.getX(i)); }
  const sock = new THREE.Mesh(sockG, toonMaterial({ name: 'windsock', map: tex, side: THREE.DoubleSide }));
  const swivel = new THREE.Group();
  swivel.position.set(x, y0 + H - 0.9, z);
  swivel.rotation.y = Math.atan2(-WIND.y, WIND.x);
  swivel.add(sock);
  g.add(swivel);
  sock.onBeforeRender = () => {
    const t = performance.now() / 1000;
    sock.rotation.z = -0.12 + 0.06 * Math.sin(t * 1.3);            // droops a little in the lulls
    sock.rotation.y = 0.12 * Math.sin(t * 0.7) + 0.05 * Math.sin(t * 3.1);
  };
  return g;
}
