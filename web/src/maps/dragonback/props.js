// Dragonback props (browser only; loaded by index.js). The range's identity is the high-alpine kind, not the
// ski-resort kind: orange metal bivouac shelters bolted to ridge shoulders, stone cairns marking the gaps and
// the spurs, strings of faded prayer flags snapping in the wind at the Shoulder and the finish, an iron cross
// on the highest tower of the Dragon's Back, a row of old orange marker poles along the edge of the Shoulder.
// Placement is headless (course.props, course.js); everything here is merged per material (a dozen draws).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial } from '../../world.js';

/** Non-indexed copy (three warns when toNonIndexed() is called on a geometry that already is). */
const ni = (g) => (g.index ? g.toNonIndexed() : g);

export function buildDragonbackProps(course, { terrain }) {
  const group = new THREE.Group();
  group.name = 'DragonbackProps';
  const P = course.props, H = (x, z) => terrain.baseHeight(x, z);
  const M = {
    shell: toonMaterial({ name: 'bivouacShell', map: paintTexture('#e0621f', 21) }),
    stone: toonMaterial({ name: 'cairnStone', map: stoneTexture() }),
    iron: toonMaterial({ name: 'iron', color: 0x2c2a28 }),
    wood: toonMaterial({ name: 'markerWood', color: 0x5a4636 }),
    tip: toonMaterial({ name: 'markerTip', color: 0xe06a24 }),
    snow: toonMaterial({ name: 'propSnow', color: 0xf4f7fb }),
    window: toonMaterial({ name: 'bivouacWindow', color: 0x16202c }),
  };
  group.add(buildBivouacs(P.bivouacs, M, H));
  group.add(buildCairns(P.cairns, M, H));
  group.add(buildFlags(P.flags, H));
  group.add(buildPoles(P.poles, M, H));
  if (P.cross) group.add(buildCross(P.cross, M, H));
  group.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return group;
}

// ------------------------------------------------------------------ textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let a = seed; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }

/** Weathered orange paint on riveted sheet metal (vertical panels, rust runs, sun-bleach). */
function paintTexture(base, seed) {
  return canvasTex(256, 256, (g, w, h) => {
    const r = rand(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {                       // panels
      g.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.06})`; g.fillRect(i * w / 8, 0, 2, h);
      for (let k = 0; k < 10; k++) { g.fillStyle = 'rgba(40,20,10,0.45)'; g.beginPath(); g.arc(i * w / 8 + 5, k * h / 10 + 6, 1.4, 0, 6.3); g.fill(); }
    }
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(110,48,20,${0.12 + r() * 0.2})`; g.fillRect(r() * w, r() * h * 0.5, 2 + r() * 4, 20 + r() * 90); }   // rust runs
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,235,200,${r() * 0.12})`; g.fillRect(r() * w, r() * h, 8 + r() * 50, 2 + r() * 8); }   // sun-bleach
  });
}

function stoneTexture() {
  return canvasTex(128, 128, (g, w, h) => {
    const r = rand(5);
    g.fillStyle = '#6d6862'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) { const l = 70 + r() * 80; g.fillStyle = `rgba(${l},${l - 4},${l - 9},0.5)`; g.fillRect(r() * w, r() * h, 2 + r() * 6, 2 + r() * 6); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(150,170,90,${0.15 + r() * 0.15})`; g.beginPath(); g.arc(r() * w, r() * h, 2 + r() * 5, 0, 6.3); g.fill(); }   // lichen
  });
}

// ------------------------------------------------------------------ bivouacs
/**
 * Italian-style "bivacco" shelters: a half-barrel of orange sheet metal on a stone footing, a small door and
 * window at the downhill end, a snow cap on the barrel. Each one collides (course.obstacles).
 */
function buildBivouacs(list, M, H) {
  const g = new THREE.Group();
  g.name = 'Bivouacs';
  const shells = [], footings = [], caps = [], wins = [];
  for (const b of list) {
    const y = Math.min(H(b.x, b.z), H(b.x + 2, b.z), H(b.x - 2, b.z), H(b.x, b.z + 2), H(b.x, b.z - 2)) - 0.2;
    const L = 4.6, R = 1.55;
    const m = new THREE.Matrix4().makeRotationY(b.yaw).setPosition(b.x, y + 0.35, b.z);
    const shell = new THREE.CylinderGeometry(R, R, L, 14, 1, false, -Math.PI / 2, Math.PI);   // a half barrel lying along x
    shell.rotateZ(Math.PI / 2); shell.rotateY(Math.PI / 2);
    const ends = new THREE.CircleGeometry(R, 14, 0, Math.PI);
    const e1 = ends.clone(); e1.translate(0, 0, L / 2); const e2 = ends.clone(); e2.rotateY(Math.PI); e2.translate(0, 0, -L / 2);
    const sg = mergeGeometries([ni(shell), ni(e1), ni(e2)]);
    sg.rotateY(Math.PI / 2);
    sg.applyMatrix4(m); shells.push(sg);
    const f = new THREE.BoxGeometry(L + 0.5, 0.9, R * 2 + 0.3); f.translate(0, -0.3, 0); f.applyMatrix4(m); footings.push(ni(f));
    const cap = new THREE.CylinderGeometry(R + 0.08, R + 0.08, L - 0.6, 14, 1, false, -0.9, 1.8);
    cap.rotateZ(Math.PI / 2); cap.translate(0, 0.02, 0); cap.applyMatrix4(m); caps.push(ni(cap));
    const w = new THREE.PlaneGeometry(0.9, 0.7); w.translate(0, 0.6, 0); w.rotateY(Math.PI / 2); w.translate(L / 2 + 0.01, 0, 0.35); w.applyMatrix4(m); wins.push(ni(w));
    const d = new THREE.PlaneGeometry(0.8, 1.3); d.translate(0, 0.65, 0); d.rotateY(Math.PI / 2); d.translate(L / 2 + 0.01, 0, -0.55); d.applyMatrix4(m); wins.push(ni(d));
  }
  if (!list.length) return g;
  g.add(new THREE.Mesh(mergeGeometries(shells), M.shell));
  g.add(new THREE.Mesh(mergeGeometries(footings), M.stone));
  g.add(new THREE.Mesh(mergeGeometries(caps), M.snow));
  g.add(new THREE.Mesh(mergeGeometries(wins), M.window));
  return g;
}

// ------------------------------------------------------------------ cairns
/** Stacked stones, 0.9–2 m, slightly leaning; some carry a marker stick. Visual only. */
function buildCairns(list, M, H) {
  const g = new THREE.Group();
  g.name = 'Cairns';
  const stones = [], sticks = [];
  const r = rand(91);
  for (const c of list) {
    let y = H(c.x, c.z) - 0.25;
    const n = 3 + Math.floor(r() * 3), lean = (r() - 0.5) * 0.15;
    let s = (0.55 + r() * 0.25) * (c.size ?? 1);
    for (let i = 0; i < n; i++) {
      const st = new THREE.IcosahedronGeometry(s, 0);
      st.scale(1 + r() * 0.3, 0.55 + r() * 0.2, 1 + r() * 0.3);
      st.rotateY(r() * 6.3);
      st.translate(c.x + lean * i, y + s * 0.5, c.z + lean * i * 0.5);
      stones.push(ni(st));
      y += s * 0.85;
      s *= 0.72 + r() * 0.1;
    }
    if (c.stick) { const p = new THREE.CylinderGeometry(0.035, 0.045, 1.6, 5); p.translate(c.x + lean * n, y + 0.7, c.z + lean * n * 0.5); sticks.push(ni(p)); }
  }
  if (stones.length) g.add(new THREE.Mesh(mergeGeometries(stones), M.stone));
  if (sticks.length) g.add(new THREE.Mesh(mergeGeometries(sticks), M.wood));
  return g;
}

// ------------------------------------------------------------------ prayer flags
/**
 * Strings of small cloth flags (blue, white, red, green, yellow) sagging between two posts; each flag flutters
 * in the vertex shader (uTime), more at its free end. One draw for every string on the map, plus the posts.
 */
function buildFlags(list, H) {
  const g = new THREE.Group();
  g.name = 'PrayerFlags';
  const cols = [[0.16, 0.36, 0.78], [0.93, 0.93, 0.9], [0.8, 0.16, 0.14], [0.14, 0.55, 0.3], [0.95, 0.78, 0.15]];
  const pos = [], col = [], fl = [], idx = [];
  const posts = [];
  let v = 0;
  for (const s of list) {
    const ya = H(s.a[0], s.a[1]) + s.h, yb = H(s.b[0], s.b[1]) + s.h;
    for (const [x, z, yy] of [[s.a[0], s.a[1], ya], [s.b[0], s.b[1], yb]]) {
      const p = new THREE.CylinderGeometry(0.06, 0.09, s.h + 0.6, 5); p.translate(x, yy - (s.h + 0.6) / 2 + 0.3, z); posts.push(ni(p));
    }
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], len = Math.hypot(dx, dz);
    const n = Math.floor(len / 0.75);
    for (let i = 0; i < n; i++) {
      const t0 = (i + 0.1) / n, t1 = (i + 0.9) / n;
      const at = (t) => [s.a[0] + dx * t, ya + (yb - ya) * t - s.sag * 4 * t * (1 - t), s.a[1] + dz * t];
      const [x0, y0, z0] = at(t0), [x1, y1, z1] = at(t1);
      const c = cols[i % 5], hgt = 0.62;
      // Quad hanging from the string: top edge on the string, bottom edge free (fl.y = 1 → flutters most).
      pos.push(x0, y0, z0, x1, y1, z1, x1, y1 - hgt, z1, x0, y0 - hgt, z0);
      for (let k = 0; k < 4; k++) col.push(...c);
      fl.push(0, i * 1.7, 0, i * 1.7, 1, i * 1.7, 1, i * 1.7);
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
      v += 4;
    }
  }
  if (!v) return g;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aFlag', new THREE.Float32BufferAttribute(fl, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = toonMaterial({
    name: 'prayerFlags', vertexColors: true, side: THREE.DoubleSide,
    vertPars: 'attribute vec2 aFlag;',
    vertPre: /* glsl */`
      float fy = aFlag.x, ph = aFlag.y;
      transformed.x += fy * (0.22 + 0.12 * sin(uTime * 7.0 + ph)) * 0.8;
      transformed.z += fy * 0.18 * sin(uTime * 9.0 + ph * 1.3);
      transformed.y += fy * 0.12 * sin(uTime * 5.0 + ph);`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  g.add(mesh);
  g.add(new THREE.Mesh(mergeGeometries(posts), toonMaterial({ name: 'flagPost', color: 0x5a4636 })));
  return g;
}

// ------------------------------------------------------------------ marker poles, the summit cross
function buildPoles(list, M, H) {
  const g = new THREE.Group();
  g.name = 'MarkerPoles';
  const a = [], b = [];
  for (const p of list) {
    const y = H(p.x, p.z) - 0.2, h = p.h ?? 2.4;
    const lo = new THREE.CylinderGeometry(0.045, 0.06, h * 0.65, 5); lo.translate(p.x, y + h * 0.325, p.z); a.push(ni(lo));
    const hi = new THREE.CylinderGeometry(0.04, 0.045, h * 0.35, 5); hi.translate(p.x, y + h * 0.825, p.z); b.push(ni(hi));
  }
  if (!list.length) return g;
  g.add(new THREE.Mesh(mergeGeometries(a), M.wood));
  g.add(new THREE.Mesh(mergeGeometries(b), M.tip));
  return g;
}

/** An old iron summit cross with a sunburst, guyed to the rock, on the highest tower of the Dragon's Back. */
function buildCross({ x, z }, M, H) {
  const y = H(x, z) - 0.4;
  const parts = [];
  const post = new THREE.BoxGeometry(0.28, 6.5, 0.28); post.translate(0, 3.25, 0); parts.push(post);
  const arm = new THREE.BoxGeometry(3.4, 0.24, 0.24); arm.translate(0, 4.6, 0); parts.push(arm);
  for (let k = 0; k < 12; k++) { const ray = new THREE.BoxGeometry(0.05, 0.9, 0.05); ray.translate(0, 0.75, 0); ray.rotateZ(k * Math.PI / 6); ray.translate(0, 4.6, 0); parts.push(ray); }
  const geo = mergeGeometries(parts.map(ni));
  geo.rotateY(0.4);
  geo.translate(x, y, z);
  const m = new THREE.Mesh(geo, M.iron);
  m.name = 'SummitCross';
  return m;
}
