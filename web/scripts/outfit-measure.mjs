// Dev helper: measure the outfit geometry in the bind pose (docs/character.md, "Measuring a fit").
// Prints, per jacket cut, the torso's width / depth at chest, waist, hips and hem, the sleeve's mean
// radius along the arm, the pant leg's at thigh / knee / cuff, and the same for the bare body, plus
// vertex / triangle counts. Usage: node web/scripts/outfit-measure.mjs <url> [jacketId,…] [pantsId]
import { chromium } from '@playwright/test';

const [url = 'http://localhost:5203/', jackets = 'tuff-shell', pants = ''] = process.argv.slice(2);
const args = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
await page.goto(`${url}${url.includes('?') ? '&' : '?'}quality=0`);
await page.waitForFunction(() => window.__sendit?.stage?.ready, null, { timeout: 300000 });
const out = await page.evaluate(({ jackets, pants }) => {
  const rider = window.__sendit.stage.rider;
  const res = {};
  const stat = (pos, sel) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, n = 0;
    for (let i = 0; i < pos.length / 3; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if (!sel(x, y, z, i)) continue;
      n++; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    return n ? `${((x1 - x0) * 100).toFixed(1)}w × ${((z1 - z0) * 100).toFixed(1)}d` : '-';
  };
  const body = rider.look.meshes.body.geometry.attributes.position.array;
  const bodyRows = {};
  for (const y of [1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9]) bodyRows[y] = stat(body, (x, yy) => Math.abs(yy - y) < 0.01 && Math.abs(x) < 0.25);
  const armR = (P, sel) => {
    const out = {};
    for (const ax of [0.25, 0.35, 0.45, 0.55, 0.65]) {
      let s = 0, n = 0, cy = 0, cz = 0, pts = [];
      for (let i = 0; i < P.length / 3; i++) { const x = P[i * 3]; if (Math.abs(x - ax) < 0.006 && sel(i)) { pts.push([P[i * 3 + 1], P[i * 3 + 2]]); } }
      for (const p of pts) { cy += p[0]; cz += p[1]; }
      cy /= pts.length || 1; cz /= pts.length || 1;
      for (const p of pts) { s += Math.hypot(p[0] - cy, p[1] - cz); n++; }
      out[ax] = n ? +(s / n * 100).toFixed(1) : '-';
    }
    return out;
  };
  const bodyArm = armR(body, (i) => body[i * 3 + 1] > 1.3);
  res.body = { torso: bodyRows, arm: bodyArm };
  for (const j of jackets.split(',')) {
    const o = rider.setOutfit({ jacket: { garment: j }, ...(pants ? { pants: { garment: pants } } : {}) });
    const g = rider.look.meshes.garments.geometry;
    const P = g.attributes.position.array, G = g.attributes.aG.array, L = g.attributes.aLin.array;
    const piece = (i) => Math.round(G[i * 4]);
    const rows = {};
    for (const y of [1.5, 1.4, 1.3, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7]) rows[y] = stat(P, (x, yy, z, i) => piece(i) === 0 && L[i] < 0.5 && Math.abs(yy - y) < 0.012);
    let ymin = 9; for (let i = 0; i < P.length / 3; i++) if (piece(i) === 0) ymin = Math.min(ymin, P[i * 3 + 1]);
    const legs = {};
    for (const y of [0.85, 0.7, 0.55, 0.4, 0.25]) legs[y] = stat(P, (x, yy, z, i) => piece(i) === 2 && x > 0 && L[i] < 0.5 && Math.abs(yy - y) < 0.012);
    res[j] = { verts: P.length / 3, tris: g.index.count / 3, hemMin: +ymin.toFixed(3), torso: rows, sleeve: armR(P, (i) => piece(i) === 1 && L[i] < 0.5), leg: legs, garments: Object.keys(o.garments).map((k) => o.garments[k].id).join(' ') };
  }
  return res;
}, { jackets, pants });
console.log(JSON.stringify(out, null, 1));
await browser.close();
