// Graphics dev helper: boot the game once in headless Chromium (software WebGL) and capture several
// views. Usage: node scripts/gfxshots.mjs <url> <outDir> <views.json | inline JSON> [W H]
// Each view: { name, wait (s), keys: "d,ArrowUp", place: [x, z, heading],
//              cam: [px,py,pz, tx,ty,tz, fov?] (absolute world camera, honoured by sky.js via window.__gfxCam),
//              gcam: same but y values are metres above the ground,
//              eval: "js run in the page" }
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [url = 'http://localhost:5174/?ride', outDir = '.', viewsArg = '[]', W = '960', H = '540'] = process.argv.slice(2);
const views = JSON.parse(fs.existsSync(viewsArg) ? fs.readFileSync(viewsArg, 'utf8') : viewsArg);
const browser = await chromium.launch({
  // GPU=1 renders on the real GPU (ANGLE D3D11 on Windows) — much faster than SwiftShader.
  args: process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
let errors = 0;
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type())) { errors++; console.log(`[${m.type()}]`, m.text().slice(0, 1200)); }
  else if (m.text().startsWith('[gfx]')) console.log(m.text().slice(0, 400));
});
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
const t0 = Date.now();
let bootFail = null;
const failed = new Promise((_, rej) => { bootFail = rej; });
page.on('pageerror', (e) => bootFail(e));
page.on('console', (m) => { if (m.type() === 'error' && /TypeError|ReferenceError|SyntaxError|Shader/.test(m.text())) bootFail(new Error(m.text().slice(0, 300))); });
await page.goto(url);
await Promise.race([page.waitForFunction(() => window.__sendit, null, { timeout: 400000 }), failed]);
console.log('booted in', ((Date.now() - t0) / 1000).toFixed(0), 's');
let held = [];
for (const v of views) {
  for (const k of held) await page.keyboard.up(k);
  held = [];
  await page.evaluate((v) => {
    const s = window.__sendit;
    window.__gfxCam = v.cam || null;
    if (v.gcam) {
      // Ground-relative camera: [px, metres above ground, pz, tx, metres above ground, tz, fov?].
      const g = v.gcam, H = (x, z) => s.terrain.getHeight(x, z);
      window.__gfxCam = [g[0], H(g[0], g[2]) + g[1], g[2], g[3], H(g[3], g[5]) + g[4], g[5], g[6]];
    }
    if (v.side) {
      // Chase-side camera: [right, up, back] metres relative to the rider, looking a bit ahead.
      const [r, u, b] = v.side;
      window.__gfxCam = () => { const p = s.player.renderPos, h = s.player.heading; const fx = -Math.sin(h), fz = -Math.cos(h);
        return [p.x - fz * r - fx * b, p.y + u, p.z + fx * r - fz * b, p.x + fx * 2, p.y + 0.6, p.z + fz * 2]; };
    }
    if (v.place) s.player.place({ x: v.place[0], z: v.place[1] }, v.place[2] || 0);
    if (v.eval) (0, eval)(v.eval);
  }, v);
  if (v.keys) for (const k of v.keys.split(',')) { await page.keyboard.down(k); held.push(k); }
  await page.waitForTimeout((v.wait ?? 5) * 1000);
  const info = await page.evaluate(() => {
    const s = window.__sendit;
    return { st: s.player.state, v: s.player.speed.toFixed(1), p: s.player.position.toArray().map((x) => x.toFixed(0)).join(','), h: s.player.heading.toFixed(2) };
  });
  await page.screenshot({ path: `${outDir}/${v.name}${process.env.SUF || ''}.png`, timeout: 300000, ...(v.clip ? { clip: { x: v.clip[0], y: v.clip[1], width: v.clip[2], height: v.clip[3] } } : {}) });
  console.log(v.name, JSON.stringify(info), ((Date.now() - t0) / 1000).toFixed(0) + 's');
}
console.log('errors:', errors);
await browser.close();
