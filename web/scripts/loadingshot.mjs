// Frame captures of the loading scene on the real GPU (ANGLE D3D11).
// Usage: node scripts/loadingshot.mjs [baseUrl] [outDir] [variants] [times] [size]
//   variants  ';'-separated query strings without '?', e.g. "loadseed=1;loadseed=2&loadtrick=cork900"
//             (default: 4 random seeds)
//   times     comma list of seconds after the first trick shot starts (default 1,4,8,12,16)
//   size      WxH (default 1600x900)
// Every variant runs with ?loadhold (the overlay stays up after the game has loaded). Prints the
// shot info, scene stats and any console errors; exits 1 on errors.
import { chromium } from '@playwright/test';
import fs from 'fs';

const base0 = process.argv[2] || 'http://localhost:5197/';
const base = /\.html$/.test(base0) ? base0 : base0.replace(/\/?$/, '/');   // index.html (game boots too) or loading.html (preview)
const out = process.argv[3] || 'shots/loading';
const variants = (process.argv[4] || '').split(';').filter(Boolean);
const times = (process.argv[5] || '1,4,8,12,16').split(',').map(Number);
const [W, H] = (process.argv[6] || '1600x900').split('x').map(Number);
if (!variants.length) for (let i = 0; i < 4; i++) variants.push(`loadseed=${Math.floor(Math.random() * 1e6)}`);
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: [...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-angle=d3d11']), '--enable-gpu', '--ignore-gpu-blocklist'] });
let bad = 0;
for (const q of variants) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: Number(process.env.DPR || 1) });   // DPR=2 for high-DPI captures
  const page = await ctx.newPage();
  const errors = [], logs = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (m.text().includes('[loading]')) logs.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?loadhold&${q}`, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__loading?.firstFrameAt > 0 || document.getElementById('loading')?.classList.contains('static'), null, { timeout: 150000 });
  // Time from the first trick shot when there is one (else from the first frame).
  if (!/loaddebug=cam/.test(q)) await page.waitForFunction(() => !!window.__loading?.sceneInfo, null, { timeout: 150000 }).catch(() => {});
  const t0 = Date.now();
  const tag = q.replace(/[^a-z0-9]+/gi, '_');
  for (const t of times) {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
    await page.screenshot({ path: `${out}/${tag}_t${String(t).padStart(2, '0')}.png` });
  }
  const st = await page.evaluate(() => window.__loading?.stats());
  console.log(`${q}: first frame ${st?.firstFrameMs} ms  shot ${JSON.stringify(st?.shot)}  scene ${JSON.stringify(st?.scene)}`);
  for (const l of logs) console.log('   ', l);
  if (errors.length) { bad++; console.log('  ERRORS:', errors.join('\n  ')); }
  await ctx.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
