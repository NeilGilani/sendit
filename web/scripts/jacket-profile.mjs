// Torso profile plots (docs/character.md § Torso profile): the jacket's side silhouette (front and back
// edges) and front silhouette (half width) per height, before (--legacy cut: no smoothProfile) and after,
// in the bind pose and the standing ski pose, with the curvature of each edge and the deepest inward kink.
//
//   node web/scripts/jacket-profile.mjs <baseUrl> <out.png> [jacket/pants,…|all]
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [base = 'http://localhost:5215/', out = '/tmp/claude-501/ship-jackets/profile.png', listArg = 'all'] = process.argv.slice(2);
const browser = await chromium.launch({ args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base.replace(/\/?$/, '/')}src/equipment/clipharness.html`);
await page.waitForFunction(() => window.__clip?.ready, null, { timeout: 120000 });

const looks = listArg === 'all'
  ? await page.evaluate(async () => (await import('/src/character/outfits.js')).CATALOG_JACKET_LOOKS.map(([j, p]) => `${j}/${p}`))
  : listArg.split(',');

const data = await page.evaluate(async (looks) => {
  const { GARMENTS } = await import('/src/character/outfits.js');
  const { skinOutfit } = await import('/src/equipment/garmentclip.js');
  const c = window.__clip, T = c.THREE;
  // Silhouette of the jacket body (piece 0, no lining) in a frame (origin, L, U, F): per 1 cm band of U,
  // the front-most / back-most F within |L| < 6 cm, and the widest |L|.
  // Each edge from its own strip of the shell (picked in the bind pose, so a tilted torso doesn't mix
  // them): front = centre-front strip, back = centre-back strip, half = the widest of the whole shell;
  // 2 cm bands, gaps interpolated. `core` = the band lies between the hem band and the shoulder blades
  // (where cut.smoothProfile works; the collar round-off and the hem rib are left out of the numbers).
  const sil = (pos, G, Lin, BP, o, L, U, F, lo, hi) => {
    const bands = new Map(), BW = 0.02;
    for (let i = 0; i < G.count; i++) {
      if (Math.round(G.getX(i)) !== 0 || Lin.getX(i) > 0.5) continue;
      const bx = BP.getX(i), by = BP.getY(i), bz = BP.getZ(i);
      if (by > 1.52) continue;
      const d = [pos[i * 3] - o.x, pos[i * 3 + 1] - o.y, pos[i * 3 + 2] - o.z];
      const l = d[0] * L.x + d[1] * L.y + d[2] * L.z, u = d[0] * U.x + d[1] * U.y + d[2] * U.z, f = d[0] * F.x + d[1] * F.y + d[2] * F.z;
      const k = Math.round(u / BW);
      const b = bands.get(k) || { u: k * BW, front: null, back: null, half: 0, by: [] };
      if (Math.abs(bx) < 0.06 && bz > 0) b.front = Math.max(b.front ?? -9, f);
      if (Math.abs(bx) < 0.06 && bz < 0) b.back = Math.min(b.back ?? 9, f);
      b.half = Math.max(b.half, Math.abs(l));
      b.by.push(by);
      bands.set(k, b);
    }
    const arr = [...bands.values()].sort((a, b) => b.u - a.u);
    for (const key of ['front', 'back']) {
      for (let i = 0; i < arr.length; i++) {
        if (arr[i][key] !== null) continue;
        let a = i - 1, b = i + 1;
        while (a >= 0 && arr[a][key] === null) a--;
        while (b < arr.length && arr[b][key] === null) b++;
        arr[i][key + 'Fill'] = true;
        arr[i][key] = a < 0 ? arr[b]?.[key] ?? 0 : b >= arr.length ? arr[a][key] : arr[a][key] + (arr[b][key] - arr[a][key]) * (i - a) / (b - a);
      }
    }
    for (const b of arr) { b.by.sort((x, y) => x - y); const m = b.by[b.by.length >> 1]; b.core = m > lo && m < hi; delete b.by; }
    return arr;
  };
  const res = [];
  for (const look of looks) {
    const [j, p] = look.split('/');
    const row = { look, name: GARMENTS.jacket[j].name };
    for (const mode of ['before', 'after']) {
      const cut = mode === 'before' ? { ...GARMENTS.jacket[j].cut, smoothProfile: null, layerPants: null, hemThigh: 0, armBlend: 0, pelvisRamp: null } : GARMENTS.jacket[j].cut;
      await c.garments({ gear: 'ski', slots: { jacket: { garment: j, def: { id: `${j}-${mode}`, cut } }, pants: { garment: p } }, only: ['stand'] });
      const mesh = c.rider.look.meshes.garments, g = mesh.geometry;
      // bind pose: the geometry (L = +X, U = +Y, F = +Z)
      const BP = g.attributes.position, lo = Math.max(cut.hemFront, cut.hemBack) + 0.1, hi = 1.32;   // the waist zone (the armpit above it is the arm's)
      row[mode + 'Bind'] = sil(BP.array, g.attributes.aG, g.attributes.aLin, BP, new T.Vector3(), new T.Vector3(1, 0, 0), new T.Vector3(0, 1, 0), new T.Vector3(0, 0, 1), lo, hi);
      // standing ski pose ('stand' was the last pose run): the rider's frame, origin at the pelvis
      const S = skinOutfit(mesh);
      const W = (n) => c.rider.bones[n].getWorldPosition(new T.Vector3());
      const L = W('thigh_l').sub(W('thigh_r')); L.y = 0; L.normalize();
      const U = new T.Vector3(0, 1, 0), F = new T.Vector3().crossVectors(L, U);
      const o = W('pelvis');
      row[mode + 'Stand'] = sil(S.pos, g.attributes.aG, g.attributes.aLin, BP, o, L, U, F, lo, hi);
      row.cut = { hemFront: cut.hemFront };
    }
    res.push(row);
  }
  return res;
}, looks);
await page.close();

// Kink = the deepest inward dip of an edge below the chord over ±8 cm (cm); curvature from a 4 cm stencil.
// (2 cm bands: ±4 bands = ±8 cm; only bands in the core zone count)
function stats(bands, key, sign) {
  const v = bands.map((b) => sign * b[key]);
  let kink = 0, curv = 0;
  for (let i = 4; i < v.length - 4; i++) {
    if (!bands[i].core) continue;
    const chord = (v[i - 4] + v[i + 4]) / 2;
    kink = Math.max(kink, chord - v[i]);
    curv = Math.max(curv, Math.abs(v[i - 2] - 2 * v[i] + v[i + 2]) / (0.04 * 0.04));
  }
  return { kink: kink * 100, curv };
}
const W = 400, H = 640;
const plot = (row, pose) => {
  const before = row['before' + pose], after = row['after' + pose];
  const all = [...before, ...after];
  const uMin = Math.min(...all.map((b) => b.u)), uMax = Math.max(...all.map((b) => b.u));
  const sxs = (f) => 100 + (f / 0.3) * 95;                 // side view (F, metres) around x 100
  const sy = (u) => 20 + (uMax - u) / (uMax - uMin) * (H - 60);
  const path = (bands, key, map) => bands.map((b, i) => `${i ? 'L' : 'M'}${map(b[key]).toFixed(1)},${sy(b.u).toFixed(1)}`).join(' ');
  const wx = (h) => 235 + h / 0.3 * 150;                  // front view: half width right of the axis
  let s = `<svg width="${W}" height="${H}" style="background:#1d2026;border-radius:6px">`;
  s += `<text x="10" y="14" fill="#9a968e" font-size="12">side (front / back edge) and front (half width), ${pose === 'Bind' ? 'bind pose' : 'standing on skis'}</text>`;
  for (const [bands, col, dash] of [[before, '#ff6b5a', '5,4'], [after, '#5ee08a', '']]) {
    s += `<path d="${path(bands, 'front', sxs)}" stroke="${col}" fill="none" stroke-width="2" stroke-dasharray="${dash}"/>`;
    s += `<path d="${path(bands, 'back', sxs)}" stroke="${col}" fill="none" stroke-width="2" stroke-dasharray="${dash}"/>`;
    s += `<path d="${path(bands, 'half', wx)}" stroke="${col}" fill="none" stroke-width="2" stroke-dasharray="${dash}"/>`;
  }
  s += `<line x1="235" y1="20" x2="235" y2="${H - 40}" stroke="#444"/>`;
  const sb = { f: stats(before, 'front', 1), b: stats(before, 'back', -1), w: stats(before, 'half', 1) };
  const sa = { f: stats(after, 'front', 1), b: stats(after, 'back', -1), w: stats(after, 'half', 1) };
  s += `<text x="10" y="${H - 22}" fill="#ff6b5a" font-size="12">before: kink front ${sb.f.kink.toFixed(1)} · back ${sb.b.kink.toFixed(1)} · side ${sb.w.kink.toFixed(1)} cm</text>`;
  s += `<text x="10" y="${H - 6}" fill="#5ee08a" font-size="12">after:  kink front ${sa.f.kink.toFixed(1)} · back ${sa.b.kink.toFixed(1)} · side ${sa.w.kink.toFixed(1)} cm</text>`;
  return { svg: s + '</svg>', sb, sa };
};
let html = `<div style="font:28px system-ui;font-weight:800;color:#eee;padding:16px 20px 4px">Torso profile: before (dashed red) / after (green)</div>
<div style="font:15px system-ui;color:#aaa;padding:0 20px 10px">Kink = deepest inward dip of the edge below the line over ±8 cm (a waist "hole" in the silhouette).</div><div style="display:flex;flex-wrap:wrap;gap:10px;padding:10px 20px">`;
const table = [];
for (const row of data) {
  const a = plot(row, 'Bind'), b = plot(row, 'Stand');
  html += `<div style="color:#eee;font:16px system-ui"><div style="padding:4px 0;font-weight:700">${row.name}</div><div style="display:flex;gap:6px">${a.svg}${b.svg}</div></div>`;
  table.push({ look: row.look, bind: { before: a.sb, after: a.sa }, stand: { before: b.sb, after: b.sa } });
}
html += '</div>';
const p2 = await browser.newPage({ viewport: { width: 1560, height: 800 } });
await p2.setContent(`<body style="margin:0;background:#15171b">${html}</body>`);
await p2.screenshot({ path: out, fullPage: true });
await browser.close();
fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(table, null, 1));
for (const t of table) console.log(t.look.padEnd(34), ['bind', 'stand'].map((k) => `${k}: front ${t[k].before.f.kink.toFixed(1)}→${t[k].after.f.kink.toFixed(1)} back ${t[k].before.b.kink.toFixed(1)}→${t[k].after.b.kink.toFixed(1)} side ${t[k].before.w.kink.toFixed(1)}→${t[k].after.w.kink.toFixed(1)}`).join(' | '));
