// Voltage Park props (browser only): the shaped park snow (every profile feature and the superpipe, drawn from
// the same functions the physics uses, with blue dye lines on lips, knuckles and the coping), the rails /
// boxes / tubes on their legs, the big air's scaffold, and the event dressing: start gate, section arches,
// crowd fences and spectators, the finish arena with grandstands and a big screen, light towers, flags,
// banners and lane signs. Geometry is merged per material (a handful of draw calls); animation (flags,
// crowds, LED screens, light pulses, rail sparks) lives in the shaders / one onBeforeRender.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, globals } from '../../world.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from '../../gfx/snow.js';
import { STEP } from './shapes.js';
import { START_X, FINISH_U, LANES, PIPE, JIBS, GRID } from './layout.js';
import { buildSparks } from './sparks.js';

const DEG = Math.PI / 180;

export function buildVoltageProps(course, { terrain }) {
  const group = new THREE.Group();
  group.name = 'VoltageProps';
  const M = materials(terrain);
  const T = terrain;
  const snow = new GeoBuf();
  for (const f of course.features) {
    if (f.kind === 'pipe') pipeMesh(f, T, snow);
    else if (f.kind === 'spine') spineMesh(f, T, snow);
    else profileMesh(f, T, snow);
  }
  const snowMesh = new THREE.Mesh(snow.build(true), M.snow);
  snowMesh.name = 'ParkSnow';
  snowMesh.receiveShadow = true; snowMesh.castShadow = true;
  group.add(snowMesh);
  group.add(buildRails(course, T, M));
  for (const f of course.scaffolds || []) group.add(buildScaffold(f, T, M));
  group.add(buildGaps(course, T));
  group.add(buildDressing(course, T, M));
  group.add(buildSparks(course));
  group.traverse((o) => { if (o.isMesh && !o.material.transparent && o.castShadow === undefined) o.castShadow = true; });
  return group;
}

// ------------------------------------------------------------------ geometry buffers
class GeoBuf {
  constructor() { this.pos = []; this.col = []; this.idx = []; this.uv = []; }
  get n() { return this.pos.length / 3; }
  /** A grid of rows × cols vertices from fn(i, j) → [x, y, z, r, g, b]. */
  grid(rows, cols, fn) {
    const o = this.n;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const v = fn(i, j);
      this.pos.push(v[0], v[1], v[2]); this.col.push(v[3] ?? 1, v[4] ?? 1, v[5] ?? 1); this.uv.push(j / (cols - 1), i / (rows - 1));
    }
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = o + i * cols + j;
      this.idx.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  }
  build(colors = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    if (colors) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

const DYE = [0.25, 0.55, 1.0];     // blue dye lines (real parks spray them on lips and knuckles)

function profileMesh(f, T, buf) {
  // Rows along the axis: 0.5 m, 0.125 m around the marks (lips, knuckles, the coping) so edges stay crisp.
  const marks = Object.values(f.marks || {}).map((m) => m.a);
  if (f.jump?.lipA) marks.push(f.jump.lipA);
  const rows = [];
  const end = f.a0 + f.len;
  for (let a = f.a0; a <= end + 1e-6;) {
    rows.push(a);
    const near = marks.some((m) => Math.abs(m - a) < 1.6);
    // (the big jumps' long, gently curved landings: 0.75 m rows sag < 1 cm on their curves; lips and knuckles stay fine)
    a += near ? 0.125 : f.kind === 'roller' || f.kind === 'jump' || f.kind === 'bigair' || f.kind === 'start' ? 0.75 : 0.5;
  }
  if (rows[rows.length - 1] < end) rows.push(end);
  // Columns across: deck (dense where a side profile blends), then the sidewalls.
  const hw = f.maxHw, outer = f.reach - 0.5;
  const cs = new Set();
  const deckN = Math.max(4, Math.ceil(hw / 1.6));   // (level across: the deck needs few columns)
  for (let k = 0; k <= deckN; k++) cs.add(+(hw * k / deckN).toFixed(3));
  if (f.side) for (const d of [0, 0.35, 0.7, 1.05, 1.4]) cs.add(+(f.side.hwc + d * f.side.blend / 1.4).toFixed(3));
  if (f.jump?.hw && f.jump.hw < hw) for (const d of [0, 0.4, 1]) cs.add(+(f.jump.hw + d).toFixed(3));   // the kicker's edge
  const sideN = 9;
  for (let k = 1; k <= sideN; k++) cs.add(+(hw + (outer - hw) * Math.pow(k / sideN, 1.6)).toFixed(3));
  const half = [...cs].sort((a, b) => a - b);
  const cols = [...half.slice(1).reverse().map((b) => -b), ...half];
  const lipA = f.jump?.lipA, kn = f.marks?.knuckle?.a, cop = f.marks?.coping?.a, lipM = f.marks?.lip?.a;
  buf.grid(rows.length, cols.length, (i, j) => {
    const a = rows[i], b = cols[j];
    const [x, z] = f.world(a, b);
    const base = T.baseHeight(x, z);
    const y = f.at(x, z, base);
    let r = 1, g = 1, bl = 1;
    const dye = (lipA !== undefined && a > lipA - 0.45 && a <= lipA + 0.05) || (lipM !== undefined && a > lipM - 0.4 && a <= lipM + 0.05)
      || (kn !== undefined && Math.abs(a - kn) < 0.3) || (cop !== undefined && a > cop - 0.35 && a <= cop + 0.1);
    if (dye && Math.abs(b) <= f.hwAt(a) + 0.2) [r, g, bl] = DYE;
    else if (f.kind === 'ramp' || f.kind === 'mound') { r = 0.97; g = 0.98; bl = 1.0; }
    return [x, y === null ? base - 0.35 : y + 0.025, z, r, g, bl];
  });
}

function pipeMesh(p, T, buf) {
  const rows = [];
  for (let a = 0; a <= p.length; a += 0.75) rows.push(a);
  const cs = [];
  const cop = p.F + p.wallRun;
  for (let t = 0; t <= p.outer + 0.5;) { cs.push(t); t += t < p.F ? p.F / 3 : t < cop - 0.4 ? 0.2 : t < cop + 0.4 ? 0.1 : 0.6; }
  const cols = [...cs.slice(1).reverse().map((t) => -t), ...cs].filter((b) => p.sides.includes(b >= 0 ? 1 : -1) || Math.abs(b) < p.F);
  buf.grid(rows.length, cols.length, (i, j) => {
    const a = rows[i], b = cols[j];
    const [x, z] = p.world(a, b);
    const base = T.baseHeight(x, z);
    const y = p.at(x, z, base);
    const t = Math.abs(b);
    const dye = Math.abs(t - cop) < 0.12 && p.scale(a) > 0.5;
    const c = dye ? DYE : [1, 1, 1];
    return [x, y === null ? base - 0.3 : y + 0.02, z, c[0], c[1], c[2]];
  });
}

function spineMesh(p, T, buf) {
  const rows = [];
  for (let a = 0; a <= p.length; a += 0.75) rows.push(a);
  const cs = [];
  for (let t = 0; t <= p.W + 0.3;) { cs.push(t); t += t < p.t1 + 0.3 ? 0.2 : 0.45; }
  const cols = [...cs.slice(1).reverse().map((t) => -t), ...cs];
  buf.grid(rows.length, cols.length, (i, j) => {
    const a = rows[i], b = cols[j];
    const [x, z] = p.world(a, b);
    const base = T.baseHeight(x, z);
    const y = p.at(x, z, base);
    const c = Math.abs(b) < 0.15 && p.scale(a) > 0.5 ? DYE : [1, 1, 1];   // a dye line along the crest
    return [x, y === null ? base - 0.3 : y + 0.02, z, c[0], c[1], c[2]];
  });
}

// ------------------------------------------------------------------ materials
function canvasTex(w, h, draw, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function materials(terrain) {
  const noise = terrain.terrainUniforms?.noiseTex.value;
  const snow = toonMaterial({
    name: 'parkSnow', vertexColors: true,
    uniforms: { ...snowUniforms(), noiseTex: { value: noise } },
    fragPars: SNOW_COMMON_PARS + 'vec3 kN;',
    // Cat-groomed, shovel-shaped park snow: fine corduroy along the fall line, a little glaze.
    frag: /* glsl */`
      float kn = texture2D(noiseTex, vW.xz * 0.5).g;
      float cord = 0.5 + 0.5 * sin(vW.z * 9.0 + kn * 2.0);
      diffuseColor.rgb = uSnowOld * (0.965 + 0.05 * kn + 0.012 * cord) * vColor.rgb;
      tGlaze = 0.7; tGlintMask = 0.7;
      float h0 = texture2D(noiseTex, vW.xz * 0.23).r;
      vec2 g = vec2(texture2D(noiseTex, vW.xz * 0.23 + vec2(0.01, 0.0)).r - h0, texture2D(noiseTex, vW.xz * 0.23 + vec2(0.0, 0.01)).r - h0) * 1.2;
      kN = normalize(normalize(vWN) - vec3(g.x, 0.0, g.y) * 0.35);
      if (vColor.b > vColor.r + 0.3) toonEmissive = vec3(0.02, 0.08, 0.2);`,
    band: SNOW_BAND_GLSL,
  });
  const prev = snow.onBeforeCompile;
  snow.onBeforeCompile = (shader, r) => {
    prev(shader, r);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(kN, 0.0)).xyz);');
  };
  const neon = (name, c, k = 1) => toonMaterial({ name, color: c, frag: `toonEmissive = vec3(${new THREE.Color(c).toArray().map((v) => (v * k).toFixed(3)).join(', ')});` });
  return {
    snow,
    chrome: toonMaterial({ name: 'railChrome', color: 0xc9d2e0, rim: 0.6 }),
    steel: toonMaterial({ name: 'parkSteel', color: 0x2b2f3a }),
    boxTop: toonMaterial({ name: 'boxTop', map: boxTopTexture(), color: 0xffffff }),
    boxSide: toonMaterial({ name: 'boxSide', map: boxSideTexture(), color: 0xffffff }),
    tube: toonMaterial({ name: 'parkTube', map: tubeTexture(), color: 0xffffff }),
    ledge: toonMaterial({ name: 'parkLedge', color: 0x9aa3b5 }),
    scaffold: toonMaterial({ name: 'scaffold', color: 0x8d96a8 }),
    wood: toonMaterial({ name: 'parkWood', color: 0x5c4634 }),
    dark: toonMaterial({ name: 'parkDark', color: 0x161a2a }),
    white: toonMaterial({ name: 'parkWhite', color: 0xf2f4f8 }),
    cyan: neon('neonCyan', 0x2ff5d6, 0.9),
    pink: neon('neonPink', 0xff3d9a, 0.9),
    yellow: neon('neonYellow', 0xffe14d, 1.0),
    blue: neon('neonBlue', 0x3d8bff, 0.9),
    lamp: toonMaterial({ name: 'lampHead', color: 0xfff6dc, frag: 'toonEmissive = vec3(3.2, 3.0, 2.6) * (0.85 + 0.15 * sin(uTime * 2.0 + vW.x * 0.1));' }),
  };
}

// ------------------------------------------------------------------ rails, boxes, tubes
/** Box (w × h × len) from a to b (top centre line), rotated so its top faces up along the segment. */
function segBox(a, b, w, h, drop = 0) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.BoxGeometry(w, h, len);
  g.translate(0, -h / 2 - drop, -len / 2);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  // lookAt points −z from a toward b.
  m.setPosition(a);
  g.applyMatrix4(m);
  return g;
}
function segCyl(a, b, r, drop = 0, radial = 10) {
  const d = b.clone().sub(a), len = d.length();
  const g = new THREE.CylinderGeometry(r, r, len, radial, 1, true);
  g.rotateX(Math.PI / 2);                                // along z
  g.translate(0, -drop, -len / 2);
  const m = new THREE.Matrix4().lookAt(a, b, new THREE.Vector3(0, 1, 0));
  m.setPosition(a);
  g.applyMatrix4(m);
  return g;
}

function buildRails(course, T, M) {
  const g = new THREE.Group();
  g.name = 'Rails';
  const parts = { chrome: [], steel: [], boxTop: [], boxSide: [], tube: [], ledge: [], cyan: [], pink: [], blue: [] };
  const laneColor = (r) => (r.lane === 'spark' ? 'cyan' : r.lane === 'current' ? 'blue' : r.lane === 'high' ? 'pink' : r.section ? 'pink' : 'cyan');
  for (const r of course.rails) {
    const P = r.pts.map((p) => new THREE.Vector3(p[0], p[1], p[2]));
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1];
      if (r.kind === 'rail') {
        parts.chrome.push(segCyl(a, b, 0.045, 0.045, 12));
        // A neon strip under the bar (lane colour).
        parts[laneColor(r)].push(segBox(a, b, 0.03, 0.03, 0.1));
      } else if (r.kind === 'box') {
        parts.boxTop.push(segBox(a, b, r.half * 2, 0.04));
        parts.boxSide.push(segBox(a, b, r.half * 2 - 0.04, 0.26, 0.04));
        parts[laneColor(r)].push(segBox(a, b, r.half * 2 + 0.02, 0.025, 0.3));
      } else if (r.kind === 'tube') {
        parts.tube.push(segCyl(a, b, r.half, r.half, 18));
      } else {
        parts.ledge.push(segBox(a, b, r.half * 2, 0.35));
      }
      // Joints: a little sleeve over kinks so the bar reads continuous.
      if (r.kind === 'rail' && i > 0) { const s = new THREE.SphereGeometry(0.05, 10, 6); s.translate(a.x, a.y - 0.045, a.z); parts.chrome.push(s); }
    }
    // End caps (round rails and tubes).
    if (r.kind === 'tube') for (const e of [P[0], P[P.length - 1]]) { const c = new THREE.CircleGeometry(r.half, 18); const dir = (e === P[0] ? P[1].clone().sub(P[0]) : P[P.length - 1].clone().sub(P[P.length - 2])).normalize(); c.lookAt(dir.multiplyScalar(e === P[0] ? -1 : 1)); c.translate(e.x, e.y - r.half, e.z); parts.steel.push(c); }
    // Legs down to the snow every ~2.2 m and at each joint.
    const legs = [];
    for (let i = 0; i < P.length - 1; i++) {
      const a = P[i], b = P[i + 1], len = a.distanceTo(b), n = Math.max(1, Math.round(len / 2.2));
      for (let k = 0; k <= n; k++) { if (i > 0 && k === 0) continue; legs.push(a.clone().lerp(b, k / n)); }
    }
    const under = r.kind === 'tube' ? r.half * 2 : r.kind === 'box' ? 0.3 : r.kind === 'ledge' ? 0.35 : 0.09;
    for (const p of legs) {
      const top = p.y - under, ground = T.getHeight(p.x, p.z) - 0.2;
      const h = top - ground;
      if (h < 0.05) continue;
      const leg = new THREE.BoxGeometry(r.kind === 'rail' ? 0.06 : 0.1, h, r.kind === 'rail' ? 0.06 : 0.1);
      leg.translate(p.x, ground + h / 2, p.z);
      parts.steel.push(leg);
      if (r.kind !== 'rail' && h > 0.15) { const foot = new THREE.BoxGeometry(r.half * 2 + 0.1, 0.06, 0.25); foot.translate(p.x, ground + 0.2, p.z); parts.steel.push(foot); }
    }
  }
  for (const [k, list] of Object.entries(parts)) {
    if (!list.length) continue;
    const geo = mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n); return q; }));
    const mesh = new THREE.Mesh(geo, M[k]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh);
  }
  return g;
}

// ------------------------------------------------------------------ big air scaffold
function buildScaffold(f, T, M) {
  const g = new THREE.Group();
  g.name = `Scaffold:${f.name}`;
  const poles = [], braces = [], panels = [];
  const end = f.thinUntil;
  for (let a = f.a0; a <= end; a += 2.5) {
    const hwA = f.hwAt(a);
    for (const s of [-1, 1]) {
      const [x, z] = f.world(a, s * (hwA + 0.15));
      const y = f.yAt(a), gy = T.getHeight(x, z);
      if (y - gy < 0.6) continue;
      const p = new THREE.BoxGeometry(0.16, y - gy, 0.16); p.translate(x, gy + (y - gy) / 2, z); poles.push(p);
      // Railings along the in-run edge.
      const rl = new THREE.BoxGeometry(0.06, 1.1, 0.06); rl.translate(x, y + 0.55, z); braces.push(rl);
    }
    // Cross braces every 4 m of height.
    const [cx, cz] = f.world(a, 0), y = f.yAt(a), gy = T.getHeight(cx, cz);
    for (let h = gy + 2; h < y - 0.5; h += 4) {
      const b = new THREE.BoxGeometry(0.1, 0.1, hwA * 2 + 0.3);
      b.rotateY(-Math.atan2(f.fz, f.fx));
      b.translate(cx, h, cz);
      braces.push(b);
    }
    // Branding panels on the outside of the tower.
    if (y - gy > 6) for (const s of [-1, 1]) {
      const [px, pz] = f.world(a + 1.25, s * (hwA + 0.5));
      const pn = new THREE.PlaneGeometry(2.5, Math.min(5, y - gy - 2));
      pn.rotateY(-Math.atan2(f.fz, f.fx) + (s > 0 ? 0 : Math.PI));
      pn.translate(px, gy + 1 + Math.min(5, y - gy - 2) / 2, pz);
      panels.push(pn);
    }
  }
  // Along-the-ramp handrails.
  const rail = [];
  for (const s of [-1, 1]) for (let a = f.a0; a < end - 1; a += 1) {
    const [x0, z0] = f.world(a, s * (f.hwAt(a) + 0.15)), [x1, z1] = f.world(a + 1, s * (f.hwAt(a + 1) + 0.15));
    rail.push(segBox(new THREE.Vector3(x0, f.yAt(a) + 1.1, z0), new THREE.Vector3(x1, f.yAt(a + 1) + 1.1, z1), 0.06, 0.06));
  }
  const strip = (list) => mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n); return q; }));
  if (poles.length) g.add(new THREE.Mesh(strip([...poles, ...braces]), M.scaffold));
  if (rail.length) g.add(new THREE.Mesh(strip(rail), M.yellow));
  if (panels.length) {
    const big = f.kind === 'bigair';
    const mat = toonMaterial({ name: `towerPanel:${f.name}`, map: bannerTexture(big ? 'THE TOWER' : 'VOLTAGE', big ? '#ff3d9a' : '#ffe14d', '#140a3a', 512, 1024, true), side: THREE.DoubleSide, frag: 'toonEmissive = diffuseColor.rgb * 0.25;' });
    g.add(new THREE.Mesh(strip(panels), mat));
  }
  return g;
}

// ------------------------------------------------------------------ gap channels: the road, the canal
function buildGaps(course, T) {
  const g = new THREE.Group();
  g.name = 'GapChannels';
  for (const f of course.features) {
    if (!f.gap) continue;
    const { a0, a1, road } = f.gap;
    const w = road ? 26 : 16;                      // across the course (the road runs on past the jump)
    const buf = new GeoBuf();
    const rows = [], cols = [];
    for (let a = a0 + 0.6; a <= a1 - 0.6 + 1e-6; a += 0.75) rows.push(a);
    for (let b = -w; b <= w + 1e-6; b += 1) cols.push(b);
    buf.grid(rows.length, cols.length, (i, j) => {
      const [x, z] = f.world(rows[i], cols[j]);
      return [x, T.baseHeight(x, z) + 0.04, z];
    });
    const geo = buf.build();
    const tex = road ? roadTexture() : canalTexture();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, (2 * w) / 8);
    const mat = road
      ? toonMaterial({ name: 'gapRoad', map: tex, color: 0xffffff })
      : toonMaterial({ name: 'gapCanal', map: tex, color: 0xffffff, rim: 0.5, frag: 'toonEmissive = diffuseColor.rgb * 0.12;' });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = road ? 'Road' : 'Canal';
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ event dressing
function buildDressing(course, T, M) {
  const g = new THREE.Group();
  g.name = 'EventDressing';
  const X = (u) => START_X + u;
  const H = (x, z) => T.getHeight(x, z);
  const poles = [], lamps = [], darks = [], whites = [];
  // --- arches: two posts and a banner across (start gate, rail sections, finish)
  const arch = (u, v0, v1, text, c1, c2, height = 6.5) => {
    const w = Math.abs(v1 - v0), y = Math.max(H(X(u), v0), H(X(u), v1), H(X(u), (v0 + v1) / 2)) + height;
    for (const v of [v0, v1]) {
      const x = X(u), y0 = H(x, v), ph = y - y0 + 0.8;
      const p = new THREE.BoxGeometry(0.5, ph, 0.5); p.translate(x, y0 + ph / 2 - 0.2, v); darks.push(p);
      course.obstaclesExtra.push([x, v, 0.4, 'tower']);
    }
    const mat = toonMaterial({ name: `arch:${text}`, map: bannerTexture(text, c1, c2, 1024, 128), side: THREE.DoubleSide, frag: 'toonEmissive = diffuseColor.rgb * 0.35;' });
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.6), mat);
    pl.position.set(X(u), y, (v0 + v1) / 2);
    pl.rotation.y = -Math.PI / 2;            // readable from uphill (the way you ride in)
    g.add(pl);
    // LED strip under it.
    const led = new THREE.BoxGeometry(0.12, 0.12, w); led.translate(X(u), y - 0.9, (v0 + v1) / 2);
    lamps.push(led);
  };
  course.obstaclesExtra = [];
  arch(-14, -11, 11, 'VOLTAGE PARK  ·  SLOPESTYLE  ·  START', '#ffe14d', '#140a3a', 4.5);
  arch(76, -22, 22, 'SECTION 1  ·  THE CIRCUIT', '#2ff5d6', '#1b1550');
  arch(160, -22, 22, 'SECTION 2  ·  SURGE', '#3d8bff', '#1b1550');
  arch(258, -24, 24, 'THE PLUNGE  ·  SECTION 3  ·  OVERLOAD', '#ff3d9a', '#1b1550', 7);
  arch(378, -26, 26, 'THE LAUNCH  ·  JUMP LINE', '#ffe14d', '#1b1550', 8);
  arch(752, -26, 26, 'MEGAWATT', '#ffe14d', '#140a3a', 8);
  arch(470, 230, 260, 'THE STAIRWAY', '#ff8a1f', '#1b1550');
  arch(470, -252, -214, 'HIP ROW', '#2ff5d6', '#1b1550');
  arch(FINISH_U, -48, 48, 'FINISH  ·  VOLTAGE PARK  ·  FINISH', '#ffe14d', '#140a3a', 8);
  arch(32, 52, 92, 'SPARK LANE  ·  SMALL', '#2ff5d6', '#0e2a33');
  arch(32, 106, 144, 'CURRENT LANE  ·  MEDIUM', '#3d8bff', '#0e1a3a');
  arch(32, 166, 206, 'HIGH VOLTAGE  ·  PRO', '#ff3d9a', '#2a0e2a');
  arch(GRID.u0 - 18, 226, 268, 'THE GRID  ·  JIB GARDEN', '#ffe14d', '#1b1550');
  arch(PIPE.u0 + 2, PIPE.v - 26, PIPE.v + 26, 'THE CONDUIT  ·  22 FT SUPERPIPE', '#2ff5d6', '#140a3a', 9);
  // --- start hut: a dark box with an LED band, the gate wand.
  { const x = X(-21), y = H(x, 0); const hut = new THREE.BoxGeometry(6, 3.2, 9); hut.translate(x, y + 1.6, 0); darks.push(hut); const band = new THREE.BoxGeometry(6.1, 0.25, 9.1); band.translate(x, y + 2.9, 0); lamps.push(band); }
  // --- light towers along both sides of the course and the park
  const towers = [];
  for (let u = 20; u <= FINISH_U + 40; u += 75) for (const v of [-46, 46, 100, 160, 220, -140, -205]) towers.push([u + (v % 3) * 7, v]);
  for (const [u, v] of towers) {
    const x = X(u), y = H(x, v);
    if (course.heightAt(x, v, T.baseHeight(x, v)) !== null) continue;   // never on a feature
    const p = new THREE.CylinderGeometry(0.18, 0.28, 16, 8); p.translate(x, y + 8, v); poles.push(p);
    const head = new THREE.BoxGeometry(1.6, 0.9, 2.6); head.translate(x, y + 16.3, v); darks.push(head);
    for (let k = -1; k <= 1; k++) { const l = new THREE.BoxGeometry(0.25, 0.55, 0.65); l.translate(x - 0.82, y + 16.3, v + k * 0.8); lamps.push(l); }
    course.obstaclesExtra.push([x, v, 0.35, 'tower']);
  }
  // --- crowd fences along the jump line and the finish (barriers with sponsor panels) + spectators
  const crowd = [];
  const fence = (u0, u1, v, side) => {
    for (let u = u0; u < u1; u += 2.4) {
      const x = X(u), y = H(x, v);
      if (course.heightAt(x, v, T.baseHeight(x, v)) !== null) continue;
      const pnl = new THREE.BoxGeometry(2.3, 1.0, 0.06); pnl.translate(x, y + 0.6, v); whites.push(pnl);
      for (let k = 0; k < 3; k++) crowd.push([x + (k - 1) * 0.75 + (Math.sin(u * 3.1 + k) * 0.2), y, v + side * (1.1 + (k % 2) * 0.9 + Math.random() * 0.6)]);
    }
  };
  for (const [a, b] of [[440, 1100]]) { fence(a, b, -36, -1); fence(a, b, 30, 1); }
  fence(FINISH_U - 60, FINISH_U + 60, -60, -1); fence(FINISH_U - 60, FINISH_U + 60, 56, 1);
  // --- finish arena: grandstands (stepped), a big screen, the DJ booth
  for (const side of [-1, 1]) {
    const v = side * 72, x = X(FINISH_U - 10), y = H(x, v);
    for (let r = 0; r < 6; r++) {
      const st = new THREE.BoxGeometry(40, 0.6, 1.4); st.translate(x, y + 0.3 + r * 0.6, v + side * (r * 1.4)); darks.push(st);
      for (let k = 0; k < 26; k++) crowd.push([x - 19 + k * 1.5 + Math.random() * 0.4, y + 0.6 + r * 0.6, v + side * (r * 1.4)]);
    }
  }
  { const x = X(FINISH_U + 40), y = H(x, 0); const fr = new THREE.BoxGeometry(1.2, 9, 17); fr.translate(x, y + 4.5 + 3, 0); darks.push(fr); }
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), screenMaterial());
  { const x = X(FINISH_U + 39.3), y = H(x, 0); screen.position.set(x, y + 7.5, 0); screen.rotation.y = -Math.PI / 2; g.add(screen); }
  // --- flags along the course
  const flags = [];
  for (let u = 40; u < FINISH_U; u += 18) for (const v of [-26, 24]) { const x = X(u), y = H(x, v); if (course.heightAt(x, v, T.baseHeight(x, v)) === null) flags.push([x, y, v]); }
  g.add(buildFlags(flags));
  g.add(buildCrowd(crowd));
  // --- jump names on the deck sidewalls (big banners), sweet-spot marker poles beside the landings
  const sweet = [];
  for (const f of course.features) {
    if (!f.jump?.land) continue;
    const big = f.lane === 'slope' || f.kind === 'bigair';
    const sw = f.jump.land.sweet;
    if (sw) for (const s of [-1, 1]) { const [x, z] = f.world(sw.a, s * (f.hwAt(sw.a) + 0.8)); sweet.push([x, f.yAt(sw.a), z]); }
    if (!big) continue;
    const k = f.marks.knuckle;
    for (const s of [-1, 1]) {
      const b = s * (f.hwAt(k.a - 2) + 0.4);
      const [x, z] = f.world(k.a - 6, b);
      const y = f.yAt(k.a - 6) - 2.2;
      const mat = toonMaterial({ name: `jump:${f.name}`, map: bannerTexture(f.name.toUpperCase(), f.name === 'Voltage' || f.name === 'Megawatt' || f.kind === 'bigair' ? '#ffe14d' : '#2ff5d6', '#140a3a', 1024, 160), side: THREE.DoubleSide, frag: 'toonEmissive = diffuseColor.rgb * 0.3;' });
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.6), mat);
      pl.position.set(x, y, z);
      pl.rotation.y = -Math.atan2(f.fz, f.fx);
      g.add(pl);
    }
  }
  const mk = [];
  for (const [x, y, z] of sweet) { const p = new THREE.CylinderGeometry(0.05, 0.05, 1.3, 6); p.translate(x, y + 0.6, z); mk.push(p); }
  // Neon strips along the deck edges of the big jumps (lip → end of the landing): the line reads at night-club
  // brightness from the top of the course, and frames the sweet zone.
  const neonC = [], neonP = [];
  for (const f of course.features) {
    if (!f.jump?.land || !(f.lane === 'slope' || f.kind === 'bigair' || f.lane === 'high')) continue;
    const end = f.marks.landingEnd?.a ?? f.jump.lipA + 30;
    for (const side of [-1, 1]) for (let a = f.jump.lipA + 0.6; a < end; a += 1) {
      const p0 = f.world(a, side * (f.hwAt(a) + 0.05)), p1 = f.world(a + 1, side * (f.hwAt(a + 1) + 0.05));
      const y0 = f.yAt(a), y1 = f.yAt(a + 1);
      if (y0 === null || y1 === null) continue;
      (f.lane === 'high' ? neonP : neonC).push(segBox(new THREE.Vector3(p0[0], y0 + 0.08, p0[1]), new THREE.Vector3(p1[0], y1 + 0.08, p1[1]), 0.12, 0.08));
    }
  }
  // Park signage: a coloured shape on a post at every lane feature (green circle small, blue square medium,
  // black diamond pro, orange oval for the jib garden), as resorts mark their parks.
  const signs = { spark: [], current: [], high: [], grid: [] };
  const signAt = (lane, x, z) => { if (!signs[lane]) return; const y = T.getHeight(x, z); const post = new THREE.CylinderGeometry(0.04, 0.04, 1.8, 6); post.translate(x, y + 0.9, z); poles.push(post); signs[lane].push([x, y + 1.9, z]); };
  for (const f of course.features) {
    if (f.kind === 'jump' && f.lane && signs[f.lane]) { const [x, z] = f.world(f.jump.lipA - 14, f.jump.hw + 2.5); signAt(f.lane, x, z); }
  }
  for (const r of course.rails) {
    const lane = r.lane === 'grid' || r.section === 'The Grid' ? 'grid' : r.lane;
    if (!signs[lane]) continue;
    const p0 = r.pts[0], p1 = r.pts[1], dx = p1[0] - p0[0], dz = p1[2] - p0[2], l = Math.hypot(dx, dz) || 1;
    signAt(lane, p0[0] - dx / l * 6 - dz / l * 2.2, p0[2] - dz / l * 6 + dx / l * 2.2);
  }
  const signGeo = {
    spark: new THREE.CircleGeometry(0.35, 20), current: new THREE.PlaneGeometry(0.6, 0.6),
    high: new THREE.PlaneGeometry(0.55, 0.55).rotateZ(Math.PI / 4), grid: new THREE.CircleGeometry(0.35, 20).scale(1.4, 0.8, 1),
  };
  const signMat = {
    spark: toonMaterial({ name: 'signGreen', color: 0x1fbf5a, side: THREE.DoubleSide, frag: 'toonEmissive = vec3(0.05, 0.35, 0.12);' }),
    current: toonMaterial({ name: 'signBlue', color: 0x2b6bff, side: THREE.DoubleSide, frag: 'toonEmissive = vec3(0.05, 0.12, 0.45);' }),
    high: toonMaterial({ name: 'signBlack', color: 0x0b0d14, side: THREE.DoubleSide }),
    grid: toonMaterial({ name: 'signOrange', color: 0xff8a1f, side: THREE.DoubleSide, frag: 'toonEmissive = vec3(0.45, 0.18, 0.02);' }),
  };
  for (const [lane, list] of Object.entries(signs)) {
    if (!list.length) continue;
    const im = new THREE.InstancedMesh(signGeo[lane], signMat[lane], list.length);
    const m = new THREE.Matrix4();
    list.forEach(([x, y, z], i) => { m.makeRotationY(-Math.PI / 2); m.setPosition(x, y, z); im.setMatrixAt(i, m); });
    im.computeBoundingSphere();
    g.add(im);
  }
  // DJ booth and speaker stacks in the finish arena.
  { const x = X(FINISH_U + 25), v = -34, y = H(x, v);
    const booth = new THREE.BoxGeometry(3, 1.2, 5); booth.translate(x, y + 0.6, v); darks.push(booth);
    const deck = new THREE.BoxGeometry(2.6, 0.08, 4.2); deck.translate(x, y + 1.24, v); lamps.push(deck);
    for (const dz of [-4, 4]) for (let k = 0; k < 3; k++) { const spk = new THREE.BoxGeometry(1.1, 1.0, 1.1); spk.translate(x, y + 0.5 + k * 1.02, v + dz); darks.push(spk); }
    course.obstaclesExtra.push([x, v, 2.6, 'tower']); }
  const strip = (list) => mergeGeometries(list.map((q) => (q.index ? q.toNonIndexed() : q)).map((q) => { for (const n of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(n)) q.deleteAttribute(n); return q; }));
  if (mk.length) g.add(new THREE.Mesh(strip(mk), M.yellow));
  if (neonC.length) g.add(new THREE.Mesh(strip(neonC), M.cyan));
  if (neonP.length) g.add(new THREE.Mesh(strip(neonP), M.pink));
  if (poles.length) g.add(new THREE.Mesh(strip(poles), M.steel));
  if (darks.length) g.add(new THREE.Mesh(strip(darks), M.dark));
  if (whites.length) g.add(new THREE.Mesh(strip(whites), toonMaterial({ name: 'fencePanels', map: fenceTexture(), color: 0xffffff })));
  if (lamps.length) g.add(new THREE.Mesh(strip(lamps), M.lamp));
  for (const o of course.obstaclesExtra) course.obstacles?.push(o);
  return g;
}

// ------------------------------------------------------------------ flags & crowd (instanced, animated in the shader)
function buildFlags(list) {
  const g = new THREE.Group();
  if (!list.length) return g;
  const poleG = new THREE.CylinderGeometry(0.04, 0.05, 4.2, 6); poleG.translate(0, 2.1, 0);
  const flagG = new THREE.PlaneGeometry(1.0, 2.4, 6, 12); flagG.translate(0.5, 2.8, 0);
  const poles = new THREE.InstancedMesh(poleG, toonMaterial({ name: 'flagPole', color: 0x22263a }), list.length);
  const flagMat = toonMaterial({
    name: 'parkFlag', map: flagTexture(), side: THREE.DoubleSide, frag: 'toonEmissive = diffuseColor.rgb * 0.2;',
    vertPre: /* glsl */`
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float along = max(position.x, 0.0);
      transformed.z += sin(position.x * 3.0 - uTime * 6.5 + ip.x * 0.3) * 0.18 * along;`,
  });
  const flags = new THREE.InstancedMesh(flagG, flagMat, list.length);
  const m = new THREE.Matrix4();
  list.forEach(([x, y, z], i) => { m.makeRotationY(0.6 + i * 0.7); m.setPosition(x, y - 0.1, z); poles.setMatrixAt(i, m); flags.setMatrixAt(i, m); });
  for (const im of [poles, flags]) { im.castShadow = true; im.computeBoundingSphere(); g.add(im); }
  return g;
}

function buildCrowd(list) {
  if (!list.length) return new THREE.Group();
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(list.length * 3), data = new Float32Array(list.length * 3);
  list.forEach(([x, y, z], i) => { off.set([x, y - 0.05, z], i * 3); data.set([i % 6, (i * 2.399) % 6.28, 3 + ((i * 7) % 5) * 0.6], i * 3); });
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
  geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 3));
  geo.instanceCount = list.length;
  const mat = new THREE.ShaderMaterial({
    uniforms: { atlas: { value: crowdAtlas() }, uTime: globals.uTime },
    vertexShader: /* glsl */`
      attribute vec3 aOffset; attribute vec3 aData;
      uniform float uTime;
      varying vec2 vUv; varying float vVar;
      void main() {
        float bob = abs(sin(uTime * aData.z + aData.y)) * 0.25;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 p = aOffset + right * position.x * 1.1 + vec3(0.0, position.y * 1.85 + bob, 0.0);
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        vUv = uv; vVar = aData.x;
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D atlas; varying vec2 vUv; varying float vVar;
      void main() {
        vec4 c = texture2D(atlas, vec2((vVar + vUv.x) / 6.0, vUv.y));
        if (c.a < 0.5) discard;
        gl_FragColor = vec4(c.rgb * 1.6, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.name = 'Crowd';
  return mesh;
}

// ------------------------------------------------------------------ textures (fictional brands)
function bannerTexture(text, fg = '#ffe14d', bg = '#140a3a', w = 1024, h = 128, vertical = false) {
  return canvasTex(w, h, (g) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, bg); grad.addColorStop(0.5, '#3b2a8c'); grad.addColorStop(1, bg);
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.fillRect(0, 0, w, h * 0.06); g.fillRect(0, h * 0.94, w, h * 0.06);
    g.save();
    if (vertical) { g.translate(w / 2, h / 2); g.rotate(-Math.PI / 2); g.translate(-h / 2, -w / 2); }
    const W = vertical ? h : w, Hh = vertical ? w : h;
    g.fillStyle = '#ffffff'; g.font = `bold italic ${Math.floor(Hh * 0.55)}px "Arial Black", Impact, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = fg; g.shadowBlur = Hh * 0.12;
    g.fillText(text, W / 2, Hh / 2 + Hh * 0.03, W * 0.94);
    // A lightning bolt either side.
    g.fillStyle = fg; g.shadowBlur = 0;
    for (const sx of [0.04, 0.96]) {
      const cx = W * sx, s = Hh * 0.35;
      g.beginPath(); g.moveTo(cx + s * 0.2, Hh / 2 - s); g.lineTo(cx - s * 0.35, Hh / 2 + s * 0.1); g.lineTo(cx, Hh / 2 + s * 0.1); g.lineTo(cx - s * 0.2, Hh / 2 + s); g.lineTo(cx + s * 0.35, Hh / 2 - s * 0.1); g.lineTo(cx, Hh / 2 - s * 0.1); g.closePath(); g.fill();
    }
    g.restore();
  });
}

function roadTexture() {
  // Across the channel (u) = the road's width; along it (v) the dashes repeat.
  return canvasTex(256, 256, (c, w, h) => {
    c.fillStyle = '#5a5e68'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { c.fillStyle = `rgba(${150 + Math.random() * 60},${150 + Math.random() * 60},${160 + Math.random() * 60},0.12)`; c.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    c.fillStyle = '#f2f2ee'; c.fillRect(8, 0, 6, h); c.fillRect(w - 14, 0, 6, h);
    c.fillStyle = '#ffd23a'; c.fillRect(w / 2 - 4, 0, 8, h * 0.55);
  }, true);
}

function canalTexture() {
  return canvasTex(256, 256, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#cfe9ff'); g.addColorStop(0.12, '#5fb2e6'); g.addColorStop(0.5, '#2b7fc4'); g.addColorStop(0.88, '#5fb2e6'); g.addColorStop(1, '#cfe9ff');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
    for (let i = 0; i < 14; i++) { const y = Math.random() * h; c.beginPath(); c.moveTo(w * 0.2, y); c.bezierCurveTo(w * 0.4, y - 8, w * 0.6, y + 8, w * 0.8, y); c.stroke(); }
  }, true);
}

function fenceTexture() {
  const brands = [['KILOWATT', '#ffe14d', '#140a3a'], ['NORTHWAKE', '#ffffff', '#ff3d9a'], ['AMPERE', '#140a3a', '#2ff5d6'], ['VOLTAGE PARK', '#ffffff', '#3b2a8c']];
  return canvasTex(512, 128, (g, w, h) => {
    const [t, fg, bg] = brands[0];
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    void t;
    for (let i = 0; i < brands.length; i++) {
      const [tt, f2, b2] = brands[i];
      g.fillStyle = b2; g.fillRect(i * w / 4, 0, w / 4, h);
      g.fillStyle = f2; g.font = 'bold italic 26px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tt, i * w / 4 + w / 8, h / 2, w / 4 - 8);
    }
    void fg;
  });
}

function flagTexture() {
  return canvasTex(128, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#ff3d9a'); grad.addColorStop(0.5, '#7a5cff'); grad.addColorStop(1, '#2ff5d6');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe14d';
    g.beginPath(); g.moveTo(74, 30); g.lineTo(40, 130); g.lineTo(64, 130); g.lineTo(48, 226); g.lineTo(92, 110); g.lineTo(68, 110); g.lineTo(88, 30); g.closePath(); g.fill();
  });
}

function boxTopTexture() {
  return canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#1b1446'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2ff5d6'; g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    g.fillStyle = '#ffe14d'; for (let y = 10; y < h; y += 40) { g.fillRect(w / 2 - 6, y, 12, 18); }
  });
}
function boxSideTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ff3d9a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.font = 'bold italic 36px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('VOLTAGE', w / 2, h / 2 + 2);
  });
}
function tubeTexture() {
  return canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#20253a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe14d'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 28, h);
  });
}

function screenMaterial() {
  const tex = canvasTex(1024, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#140a3a'); grad.addColorStop(1, '#3b2a8c');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffe14d'; g.font = 'bold italic 120px "Arial Black", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('VOLTAGE', w / 2, h * 0.38);
    g.fillStyle = '#2ff5d6'; g.font = 'bold 64px "Arial Black", Impact, sans-serif';
    g.fillText('PARK  ·  SLOPESTYLE FINAL', w / 2, h * 0.68);
  });
  return toonMaterial({ name: 'bigScreen', map: tex, frag: 'toonEmissive = diffuseColor.rgb * (0.9 + 0.2 * sin(uTime * 3.0)) * (0.7 + 0.3 * step(0.5, fract(vW.y * 9.0)));' });
}

function crowdAtlas() {
  return canvasTex(768, 256, (g) => {
    const jackets = ['#ff3d7f', '#2ff5d6', '#ffb02e', '#7a5cff', '#ffe14d', '#3d8bff'];
    for (let i = 0; i < 6; i++) {
      const cx = i * 128 + 64;
      g.lineCap = 'round';
      g.strokeStyle = '#151a33'; g.lineWidth = 22;
      g.beginPath(); g.moveTo(cx - 20, 130); g.lineTo(cx - 44, 64 + i * 4); g.stroke();
      g.beginPath(); g.moveTo(cx + 20, 130); g.lineTo(cx + 46, 60 + i * 5); g.stroke();
      g.strokeStyle = jackets[i]; g.lineWidth = 14;
      g.beginPath(); g.moveTo(cx - 20, 130); g.lineTo(cx - 44, 64 + i * 4); g.stroke();
      g.beginPath(); g.moveTo(cx + 20, 130); g.lineTo(cx + 46, 60 + i * 5); g.stroke();
      g.fillStyle = '#151a33'; g.fillRect(cx - 24, 190, 20, 60); g.fillRect(cx + 4, 190, 20, 60);
      g.fillStyle = '#151a33'; g.beginPath(); g.roundRect(cx - 32, 112, 64, 88, 18); g.fill();
      g.fillStyle = jackets[i]; g.beginPath(); g.roundRect(cx - 27, 117, 54, 78, 14); g.fill();
      g.fillStyle = '#151a33'; g.beginPath(); g.arc(cx, 90, 27, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2c7a5'; g.beginPath(); g.arc(cx, 92, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = jackets[(i + 3) % 6]; g.beginPath(); g.arc(cx, 84, 23, Math.PI, 0); g.fill();
      if (i % 2) { g.fillStyle = '#ffe14d'; g.fillRect(cx + 40, 30, 8, 40); g.fillRect(cx + 30, 20, 30, 18); }   // a flag / sign held up
    }
  });
}

export { DEG, STEP, LANES, JIBS };
