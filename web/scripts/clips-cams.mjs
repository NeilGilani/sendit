// A saved clip under every loading-scene camera move (no game boot: loading.html). Seeds the clip file
// (written by clips-e2e.mjs) into IndexedDB, then for each move captures a strip of frames across the shot
// and writes one contact sheet per move: <outDir>/cam-<move>.png. Also checks the worker logs no error.
// Usage: MAC=1 node web/scripts/clips-cams.mjs <baseUrl> <outDir> <clip.bin> [moves=hero,close,filmer,…] [frames=6]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const [base = 'http://localhost:5205/', out = '/tmp/clips-cams', file, movesArg, framesArg] = process.argv.slice(2);
const moves = (movesArg || 'hero,close,filmer,dolly,orbit,follow,low,reveal').split(movesArg?.includes('|') ? '|' : ',');   // debug cameras: 'cam:px,py,pz,tx,ty,tz,fov|…'
const N = Number(framesArg || 6);
mkdirSync(out, { recursive: true });
const args = process.env.MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); if (/\[loading\]/.test(m.text())) console.log('   ', m.text().slice(0, 180)); });
const b64 = readFileSync(file).toString('base64');
const meta = JSON.parse(readFileSync(file.replace(/\.bin$/, '.json'), 'utf8'));
await page.goto(`${base}loading.html?loadclip=0&loadhold`, { waitUntil: 'domcontentloaded' });
const id = await page.evaluate(async ({ b64, meta }) => {
  const { addClip } = await import('/src/thrill/clipstore.js');
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return (await addClip(meta, b)).id;
}, { b64, meta });
const shots = [];
for (const cam of moves) {
  await page.goto(`${base}loading.html?loadclip=${id}&${cam.startsWith('cam:') ? `loaddebug=${cam}` : `loadcam=${cam}`}&loadhold&loadseed=7${process.env.EXTRA || ''}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__loading?.stats?.().shot?.highlight, null, { timeout: 90000 }).catch(() => {});
  const info = await page.evaluate(() => window.__loading.stats().shot);
  const t0 = Date.now();
  const imgs = [];
  for (let i = 0; i < N; i++) {
    await page.waitForTimeout(i ? 1100 : 300);
    imgs.push((await page.screenshot({ type: 'jpeg', quality: 70 })).toString('base64'));
  }
  console.log(`${cam}: ${info?.camera} trees ${info?.treeScore} · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  shots.push({ cam, imgs });
}
const sheet = await browser.newPage({ viewport: { width: 1600, height: 300 } });
for (const s of shots) {
  await sheet.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(${Math.min(N, 4)},1fr)}img{width:100%;display:block}h1{position:fixed;left:6px;top:0;margin:0;font:16px monospace;color:#ff0}</style><h1>${s.cam}</h1>${s.imgs.map((b) => `<img src="data:image/jpeg;base64,${b}">`).join('')}`);
  await sheet.waitForTimeout(200);
  await sheet.screenshot({ path: `${out}/cam-${s.cam.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true });
}
await browser.close();
const errs = errors.filter((e) => !/favicon|404/.test(e));
console.log(errs.length ? `errors: ${errs.join(' | ')}` : 'no errors');
