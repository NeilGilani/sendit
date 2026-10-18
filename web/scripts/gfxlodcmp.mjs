// Impostor vs fronds: looks at trees D metres from a chase-camera spot and renders the same view twice,
// once with every tree as 3D fronds and once with every tree as its baked impostor (plus the normal
// mixed view), so the two representations can be compared side by side.
// Usage: node scripts/gfxlodcmp.mjs <baseUrl> <map> <fraction> <distance> <outDir> [quality] [fov] [W H]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5186', map = 'blackspruce', f = '0.3', D = '45', outDir = '.', q = '1', fov = '62', W = '1280', H = '720'] = process.argv.slice(2);
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
try {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
  await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
  await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 600000 });
  const info = await page.evaluate(({ f, D, fov }) => {
    const s = window.__sendit, T = s.terrain, path = s.course.path, tr = s.scatter.trees;
    const i = Math.min(path.length - 2, Math.floor(f * (path.length - 1)));
    const c = { x: path[i].x, z: path[i].y };
    const dir = { x: path[i + 1].x - path[i].x, z: path[i + 1].y - path[i].y };
    const dl = Math.hypot(dir.x, dir.z); dir.x /= dl; dir.z /= dl;
    let best = null;
    for (const t of tr.trees) {
      const dx = t[0] - c.x, dz = t[2] - c.z, d = Math.hypot(dx, dz);
      const fw = (dx * dir.x + dz * dir.z) / d;
      const score = Math.abs(d - D) - fw * 8;
      if (fw > 0.5 && (!best || score < best.score)) best = { score, t, d };
    }
    const t = best.t;
    window.__gfxCam = [c.x, T.getHeight(c.x, c.z) + 3, c.z, t[0], t[1] + 5 * t[5], t[2], fov];
    s.player.script = (k) => { k.tuck = 0; };
    return { d: best.d };
  }, { f: Number(f), D: Number(D), fov: Number(fov) });
  console.log('tree at', info.d.toFixed(1), 'm');
  const modes = { mixed: null, fronds: [1e4, 1], impostor: [0.02, 0.01] };
  for (const [name, v] of Object.entries(modes)) {
    await page.evaluate((v) => {
      const tr = window.__sendit.scatter.trees, A = tr.lod.uLodA.value;
      if (!window.__lod0) window.__lod0 = { near: tr.near, band: tr.band };
      const n = v ? v[0] : window.__lod0.near, b = v ? v[1] : window.__lod0.band;
      tr.near = n; tr.band = b; A.x = n; A.y = b;
      tr.last.set(1e9, 0, 0);
    }, v);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${outDir}/${map}_q${q}_d${D}_fov${fov}_${name}.png` });
  }
} finally {
  await browser.close();
}
