// Graphics dev helper: boot the game once in headless Chromium (software WebGL) and capture several
// views. Usage: node scripts/gfxshots.mjs <url> <outDir> <views.json | inline JSON> [W H]
// Each view: { name, wait (s), keys: "d,ArrowUp", place: [x, z, heading],
//              cam: [px,py,pz, tx,ty,tz, fov?] (absolute world camera, honoured by sky.js via window.__gfxCam),
//              eval: "js run in the page" }
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [url = 'http://localhost:5174/?ride', outDir = '.', viewsArg = '[]', W = '960', H = '540'] = process.argv.slice(2);
const views = JSON.parse(fs.existsSync(viewsArg) ? fs.readFileSync(viewsArg, 'utf8') : viewsArg);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
let errors = 0;
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) { errors++; console.log(`[${m.type()}]`, m.text().slice(0, 1200)); }
  else if (m.text().startsWith('[gfx]')) console.log(m.text().slice(0, 400));
});
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__sendit, null, { timeout: 400000 });
console.log('booted in', ((Date.now() - t0) / 1000).toFixed(0), 's');
let held = [];
for (const v of views) {
  for (const k of held) await page.keyboard.up(k);
  held = [];
  await page.evaluate((v) => {
    const s = window.__sendit;
    window.__gfxCam = v.cam || null;
    if (v.place) s.player.place({ x: v.place[0], z: v.place[1] }, v.place[2] || 0);
    if (v.eval) (0, eval)(v.eval);
  }, v);
  if (v.keys) for (const k of v.keys.split(',')) { await page.keyboard.down(k); held.push(k); }
  await page.waitForTimeout((v.wait ?? 5) * 1000);
  const info = await page.evaluate(() => {
    const s = window.__sendit;
    return { st: s.player.state, v: s.player.speed.toFixed(1), p: s.player.position.toArray().map((x) => x.toFixed(0)).join(','), h: s.player.heading.toFixed(2) };
  });
  await page.screenshot({ path: `${outDir}/${v.name}.png`, timeout: 300000 });
  console.log(v.name, JSON.stringify(info), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log('errors:', errors);
await browser.close();
