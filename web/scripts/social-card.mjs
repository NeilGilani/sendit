// Renders the site's share card and app icons into assets/site/ (docs/launch.md):
//   og-image.jpg          1200×630 Open Graph / Twitter card: a loading-screen still + the wordmark
//   apple-touch-icon.png  180×180 from favicon.svg (iOS home screen, some link previews)
//   icon-192.png, icon-512.png  for the web manifest
// Usage: node web/scripts/social-card.mjs [still=golden-method]   (plain HTML render: no GPU needed)
import { chromium } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '../../assets');
const out = path.join(assets, 'site');
const still = process.argv[2] || 'golden-method';
const b64 = (f) => fs.readFileSync(f).toString('base64');
const svg = fs.readFileSync(path.join(out, 'favicon.svg'), 'utf8');

const card = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=IBM+Plex+Mono:wght@600&display=block">
<style>
  html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #0b0e16; }
  .bg { position: absolute; inset: 0; background: url(data:image/webp;base64,${b64(path.join(assets, 'loading', still + '.webp'))}) 50% 62% / cover no-repeat; }
  .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(5,6,10,.62) 0%, rgba(5,6,10,.25) 38%, rgba(5,6,10,0) 60%),
    linear-gradient(0deg, rgba(5,6,10,.55) 0%, rgba(5,6,10,0) 34%); }
  .t { position: absolute; left: 64px; top: 54px; font: 900 112px/0.9 Archivo, "Helvetica Neue", Arial, sans-serif; font-stretch: 125%;
    color: #faf8f3; letter-spacing: -0.01em; text-shadow: 0 4px 30px rgba(0,0,0,.35); }
  .t i { font-style: normal; color: #ff5a1f; }
  .s { position: absolute; left: 68px; bottom: 58px; font: 700 34px/1.15 Archivo, "Helvetica Neue", Arial, sans-serif; font-stretch: 100%; color: #faf8f3;
    text-shadow: 0 2px 18px rgba(0,0,0,.5); max-width: 640px; }
  .k { display: block; margin-bottom: 12px; font: 600 17px "IBM Plex Mono", Menlo, monospace; letter-spacing: .16em; text-transform: uppercase; color: #ff7a45; }
</style></head><body><div class="bg"></div><div class="scrim"></div>
<div class="t">SEND<i>I</i>T</div>
<div class="s"><span class="k">Free · plays in your browser</span>Ski and snowboard eight mountains. Send it.</div>
</body></html>`;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
  await page.setContent(card, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out, 'og-image.jpg'), type: 'jpeg', quality: 86 });
  for (const s of [180, 192, 512]) {
    const p = await browser.newPage({ viewport: { width: s, height: s }, deviceScaleFactor: 1 });
    // Apple applies its own rounded mask: the touch icon is full-bleed (no transparent corners).
    const body = s === 180 ? svg.replace(/rx="26"/, 'rx="0"') : svg;
    await p.setContent(`<html><body style="margin:0;background:transparent">${body.replace('<svg ', `<svg width="${s}" height="${s}" `)}</body></html>`);
    await p.screenshot({ path: path.join(out, s === 180 ? 'apple-touch-icon.png' : `icon-${s}.png`), omitBackground: s !== 180 });
    await p.close();
  }
  console.log('wrote', fs.readdirSync(out).filter((f) => !f.startsWith('.')).map((f) => `${f} ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)} KB`).join(', '));
} finally { await browser.close(); }
