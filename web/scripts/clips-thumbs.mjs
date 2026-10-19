// Highlight thumbnails side by side (loading/clipview.js renderThumb): one per camera move / freeze point,
// for choosing the thumbnail framing. Writes <outDir>/thumb-<cam>-<freeze>.webp and a sheet thumbs.png.
// Usage: MAC=1 node web/scripts/clips-thumbs.mjs <baseUrl> <outDir> <clip.bin> [cams=hero,close,filmer] [freezes=0.45]
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const [base = 'http://localhost:5205/', out = '/tmp/clips-thumbs', file, camsArg = 'hero,close,filmer', frArg = '0.45'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: process.env.MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : [] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('console', (m) => { if (m.type() === 'error') console.log('ERR', m.text().slice(0, 200)); });
await page.goto(`${base}loading.html?loadclip=0&loadhold`, { waitUntil: 'domcontentloaded' });
const b64 = readFileSync(file).toString('base64');
const meta = JSON.parse(readFileSync(file.replace(/\.bin$/, '.json'), 'utf8'));
const id = await page.evaluate(async ({ b64, meta }) => {
  const { addClip } = await import('/src/thrill/clipstore.js');
  const s = atob(b64), b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return (await addClip(meta, b)).id;
}, { b64, meta });
const imgs = [];
for (const cam of camsArg.split(',')) for (const fr of frArg.split(',')) {
  const t0 = Date.now();
  const r = await page.evaluate(async ({ id, cam, fr }) => {
    const { renderThumb } = await import('/src/loading/clipview.js');
    try {
      const blob = await renderThumb(id, 640, 360, { cam, freeze: Number(fr) });
      const b = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
      return { b64: btoa(s) };
    } catch (e) { return { err: e.message }; }
  }, { id, cam, fr });
  if (r.err) { console.log(cam, fr, 'ERROR', r.err); continue; }
  const f = `${out}/thumb-${cam}-${fr}.webp`;
  writeFileSync(f, Buffer.from(r.b64, 'base64'));
  console.log(`${cam} @${fr}: ${Math.round(r.b64.length * 0.75 / 1024)} KB · ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  imgs.push([`${cam} @${fr}`, r.b64]);
}
await page.setViewportSize({ width: 1280, height: 400 });
await page.setContent(`<style>body{margin:0;background:#111;display:grid;grid-template-columns:repeat(2,1fr)}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:6px;top:4px;color:#ff0;font:14px monospace}</style>${imgs.map(([n, b]) => `<figure><img src="data:image/webp;base64,${b}"><figcaption>${n}</figcaption></figure>`).join('')}`);
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}/thumbs.png`, fullPage: true });
await browser.close();
