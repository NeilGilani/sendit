// Mountain / terrain survey: boots each map once (lobby screen, UI hidden) and captures the lobby
// vantage plus fixed cameras derived from the spawn (same pixels before/after a change):
//   lobby      the lobby stage as the player first sees it
//   run        2.5 m above the snow at the spawn, looking down the start heading
//   far0..3    40 m above the spawn, level, looking out in 4 directions (far peaks, ridgelines, horizon)
//   high       150 m above the spawn, looking down the run (terrain at distance, tree line, seams)
// Usage: node scripts/mtnshots.mjs <baseUrl> <outDir> [maps=comma list] [quality=1] [W=1280] [H=720]
// File names: <map>_q<q>_<view><SUF>.png. ONLY=run,far0 limits the views. macOS uses ANGLE Metal.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5194', outDir = '/tmp/claude-501/sendit-mtn', mapsArg = 'valcrest-gully,blackspruce,ravenspire,voltage-park,dragonback,kitsune-peak,fjordline', q = '1', W = '1280', H = '720'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const SUF = process.env.SUF || '';
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const browser = await chromium.launch({
  args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'],
});
let totalErr = 0;
try {
  for (const map of mapsArg.split(',')) {
    const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errs.push(e.message));
    const t0 = Date.now();
    await page.goto(`${base}/?map=${map}&quality=${q}${process.env.EXTRA || ''}`);
    await page.waitForFunction(() => window.__sendit?.terrain, null, { timeout: 300000 });
    await page.waitForTimeout(6000);
    await page.addStyleTag({ content: '#lobby, #hud, .hud, #loading { display: none !important; }' });
    await page.waitForTimeout(1500);
    const shot = async (name) => { if (!ONLY.length || ONLY.includes(name)) await page.screenshot({ path: `${outDir}/${map}_q${q}_${name}${SUF}.png` }); };
    await shot('lobby');
    const views = await page.evaluate(() => {
      const s = window.__sendit, T = s.terrain, sp = T.getSpawn();
      const p = sp.position, h = sp.heading ?? 0, Hh = (x, z) => T.getHeight(x, z);
      const dir = (a) => [-Math.sin(a), -Math.cos(a)];
      const v = {};
      const [dx, dz] = dir(h);
      v.run = [p.x - dx * 3, Hh(p.x - dx * 3, p.z - dz * 3) + 2.5, p.z - dz * 3, p.x + dx * 60, Hh(p.x + dx * 60, p.z + dz * 60) + 1, p.z + dz * 60, 60];
      for (let k = 0; k < 4; k++) {
        const [ax, az] = dir(h + k * Math.PI / 2), y = Hh(p.x, p.z) + 40;
        v['far' + k] = [p.x, y, p.z, p.x + ax * 2000, y - 90, p.z + az * 2000, 55];
      }
      const y = Hh(p.x, p.z) + 150;
      v.high = [p.x - dx * 60, y, p.z - dz * 60, p.x + dx * 900, Hh(p.x + dx * 900, p.z + dz * 900), p.z + dz * 900, 55];
      return v;
    });
    for (const [name, cam] of Object.entries(views)) {
      if (ONLY.length && !ONLY.includes(name)) continue;
      await page.evaluate((c) => { window.__gfxCam = c; }, cam);
      await page.waitForTimeout(2500);
      await shot(name);
    }
    console.log(map, 'q' + q, ((Date.now() - t0) / 1000).toFixed(0) + 's', 'errors', errs.length, errs.slice(0, 3).join(' | '));
    totalErr += errs.length;
    await page.close();
  }
} finally {
  console.log('total errors', totalErr);
  await browser.close();
}
