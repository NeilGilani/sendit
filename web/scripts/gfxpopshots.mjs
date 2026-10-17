// Screenshot sequence for pop-in comparisons: steps a chase camera down a map's run in fixed metre
// increments (no time dependence) and saves one frame per step, so consecutive frames from two builds
// can be compared (a pop is a tree / rock / patch that changes abruptly between two frames).
// Usage: node scripts/gfxpopshots.mjs <baseUrl> <map> <startFraction> <steps> <stepMetres> <outDir> [quality] [suffix]
//   e.g. node web/scripts/gfxpopshots.mjs http://localhost:5174 blackspruce 0.3 8 1.5 out 1 _new
import { chromium } from '@playwright/test';
const [base, map = 'blackspruce', f0 = '0.3', steps = '8', stepM = '1.5', outDir = '.', q = '1', suf = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 960), height: Number(process.env.H || 540) } });
await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 300000 });
await page.evaluate((f0) => {
  const s = window.__sendit, T = s.terrain, path = s.course.path;
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + path[i].distanceTo(path[i - 1]));
  const L = cum[cum.length - 1];
  const at = (d) => {
    d = Math.max(0, Math.min(L - 1, d));
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= d) lo = m; else hi = m; }
    const f = (d - cum[lo]) / Math.max(1e-6, cum[hi] - cum[lo]);
    return { x: path[lo].x + (path[hi].x - path[lo].x) * f, z: path[lo].y + (path[hi].y - path[lo].y) * f };
  };
  window.__flyD = f0 * L;
  window.__gfxCam = () => {
    const c = at(window.__flyD - 7), f = at(window.__flyD + 25);
    return [c.x, T.getHeight(c.x, c.z) + 3, c.z, f.x, T.getHeight(f.x, f.z) + 1, f.z, 62];
  };
  s.player.script = (c) => { c.tuck = 1; };
}, Number(f0));
// Walk up to the start so the pools / LOD around it are as they'd be while riding.
for (let i = 0; i < 40; i++) { await page.evaluate(() => { window.__flyD -= 0; }); await page.waitForTimeout(25); }
for (let i = 0; i < Number(steps); i++) {
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${outDir}/${map}_q${q}_${String(i).padStart(2, '0')}${suf}.png` });
  await page.evaluate((m) => { window.__flyD += m; }, Number(stepM));
}
await browser.close();
