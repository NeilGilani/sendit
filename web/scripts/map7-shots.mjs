// Fjordline (map 7) screenshots on the real GPU: boots the map, freezes the rider and flies the camera to fixed
// views (layout u / v metres, height above the snow), saving one PNG per view. Also logs console errors.
// Usage: node scripts/map7-shots.mjs <baseUrl> <outDir> [views=all] [W H] [extra query]
//   e.g. node web/scripts/map7-shots.mjs http://localhost:5196 %TEMP%/fj col,village 1600 900
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5196', out = 'shots', which = 'all', W = '1600', H = '900', extra = ''] = process.argv.slice(2);
// [name, eye u, eye v, eye height above the snow, target u, target v, target height, fov]
const VIEWS = [
  ['col', -30, 140, 6, 400, 120, -120, 70],
  ['couloir', 160, 192, 4, 330, 200, -60, 72],
  ['face', 300, -900, 260, 900, -100, -200, 60],
  ['spines', 200, -380, 20, 500, -540, -150, 66],
  ['headland', 900, 480, 12, 1600, 600, -150, 66],
  ['rollers', 1380, -150, 5, 1700, -90, -40, 70],
  ['village', 2140, -110, 9, 2420, -80, -12, 68],
  ['harbour', 2380, -220, 14, 2520, 20, -12, 66],
  ['fjord', 2300, 380, 60, 3400, 600, -60, 66],
  ['overview', 3400, -900, 700, 1200, -60, 0, 55],
  ['lighthouse', 2600, 560, 30, 2790, 690, -10, 64],
  ['naust', 2340, -125, 4, 2420, -105, -4, 70],
];
const pick = which === 'all' ? VIEWS : VIEWS.filter((v) => which.split(',').includes(v[0]));
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
const t0 = Date.now();
await page.goto(`${base}/?ride&map=fjordline${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__sendit && window.__post && window.__sendit.player.state === 1, null, { timeout: 300000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
await page.waitForTimeout(1500);
for (const [name, eu, ev, eh, tu, tv, th, fov] of pick) {
  await page.evaluate(({ eu, ev, eh, tu, tv, th, fov }) => {
    const s = window.__sendit, T = s.terrain, X0 = -1380;
    const ex = X0 + eu, tx = X0 + tu;
    const hh = (x, z) => Math.max(T.isInside?.(x, z, 2) ? T.getHeight(x, z) : s.course.height(x, z), 1850);
    const ey = hh(ex, ev) + eh, ty = hh(tx, tv) + th;
    if (T.isInside(ex + 30, ev, 50)) s.player.place({ x: ex + 30, z: ev }, -Math.PI / 2);
    s.player.script = (c) => { c.brake = 1; };
    window.__gfxCam = () => [ex, ey, ev, tx, ty, tv, fov];
  }, { eu, ev, eh, tu, tv, th, fov });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${name}.png` });
  console.log('shot', name);
}
console.log('errors:', errs.length);
for (const e of errs.slice(0, 12)) console.log('  ', e);
await browser.close();
