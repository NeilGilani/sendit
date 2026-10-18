// Renders the loading screen's painted stills with the loading scene itself (the game's engine): each
// spec is a seeded variant frozen mid-trick (?loadq=still → full size, real depth of field, no
// adaptive scaling, ?loadfreeze=<fraction of the air time>), captured from loading.html with the
// overlay hidden, then encoded to WebP in the browser (canvas.toBlob) — no native image tools needed.
// Usage: node scripts/loadingstills.mjs <loading.html url> <outDir> [WxH@dpr=1600x900@1.8 → 2880×1620] [only=<name,…>]
// Writes <outDir>/<name>.webp (+ .png with KEEP_PNG=1); a full run also writes the manifest into index.html.
import { chromium } from '@playwright/test';
import fs from 'fs';

const url = process.argv[2] || 'http://localhost:5184/loading.html';
const out = process.argv[3] || '../assets/loading';
const [W, H, DPR] = (process.argv[4] || '1600x900@1.8').split(/[x@]/).map(Number);
const only = (process.argv[5] || '').replace(/^only=/, '').split(',').filter(Boolean);
const Q = Number(process.env.Q || 0.86);

// name, seed (place, light, rider), trick, camera move, freeze point (fraction of the air), tod, mtn.
// Chosen from contact sheets (docs/loading-screen.md): the 'hero' 3/4 move from below the apex reads
// best as a poster (rider big, grab and face visible, sky / range behind, backlit).
export const STILLS = [
  { name: 'golden-method', seed: 7101, trick: 'method', cam: 'hero', freeze: 0.45, tod: 'golden', mtn: 'spires', gear: 'snowboard' },
  { name: 'golden-backflip', seed: 7101, trick: 'backflip', cam: 'hero', freeze: 0.5, tod: 'golden', mtn: 'spires', gear: 'ski' },
  { name: 'bluebird-japan', seed: 7412, trick: 'japan', cam: 'hero', freeze: 0.45, tod: 'bluebird', mtn: 'ranges', gear: 'ski' },
  { name: 'bluebird-cork', seed: 7533, trick: 'cork900', cam: 'hero', freeze: 0.4, tod: 'bluebird', mtn: 'spires', gear: 'snowboard' },
  { name: 'alpenglow-method', seed: 7377, trick: 'method', cam: 'hero', freeze: 0.45, tod: 'alpenglow', mtn: 'spires', gear: 'snowboard' },
  { name: 'dawn-japan', seed: 7690, trick: 'japan', cam: 'hero', freeze: 0.45, tod: 'dawn', mtn: 'inversion', gear: 'ski' },
  { name: 'storm-japan', seed: 7801, trick: 'japan', cam: 'close', freeze: 0.45, tod: 'storm', mtn: 'ranges', gear: 'ski' },
  { name: 'aurora-backflip', seed: 7955, trick: 'backflip', cam: 'hero', freeze: 0.5, tod: 'aurora', mtn: 'spires', gear: 'ski' },
  { name: 'aurora-method', seed: 7955, trick: 'method', cam: 'hero', freeze: 0.45, tod: 'aurora', mtn: 'spires', gear: 'snowboard' },
  { name: 'dawn-method', seed: 7690, trick: 'method', cam: 'hero', freeze: 0.45, tod: 'dawn', mtn: 'inversion', gear: 'snowboard' },
  { name: 'bluebird-method', seed: 7412, trick: 'method', cam: 'hero', freeze: 0.45, tod: 'bluebird', mtn: 'ranges', gear: 'snowboard' },
  { name: 'alpenglow-backflip', seed: 7377, trick: 'backflip', cam: 'hero', freeze: 0.5, tod: 'alpenglow', mtn: 'spires', gear: 'ski' },
];

// SPECS='[{...}]' replaces the list (contact sheets while choosing shots).
const LIST = process.env.SPECS ? JSON.parse(process.env.SPECS.startsWith('[') ? process.env.SPECS : fs.readFileSync(process.env.SPECS, 'utf8')) : STILLS;   // JSON or a file
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  args: [...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : ['--use-angle=d3d11']), '--enable-gpu', '--ignore-gpu-blocklist'],
});
const manifest = [];
let bad = 0;
try {
  for (const s of LIST) {
    if (only.length && !only.includes(s.name)) continue;
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(e.message));
    const q = `loadseed=${s.seed}&loadtrick=${s.trick}&loadcam=${s.cam}&loadtod=${s.tod}&loadmtn=${s.mtn}&loadgear=${s.gear}&loadq=still&loadfreeze=${s.freeze}&loadhold&nostill`;
    await page.goto(`${url}?${q}`);
    await page.addStyleTag({ content: '#loading .ld-ui, #loading .ld-bars, #loading .ld-static, #loading .ld-still, #loading .ld-snow { display: none !important; } #loadcanvas { opacity: 1 !important; transition: none !important; }' });
    await page.waitForFunction(() => !!window.__loading?.frozen, null, { timeout: 180000 });
    // Belt and braces: hide the overlay inline too (a still once came out with the UI baked in).
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('#loading .ld-ui, #loading .ld-bars, #loading .ld-static, #loading .ld-snow')) el.style.setProperty('display', 'none', 'important');
    });
    await page.waitForTimeout(250);
    const png = await page.screenshot({ type: 'png' });
    if (process.env.KEEP_PNG) fs.writeFileSync(`${out}/${s.name}.png`, png);
    // Encode in the browser: PNG → <img> → canvas → WebP.
    const b64 = await page.evaluate(async ({ data, q }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const c = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
      c.getContext('2d').drawImage(img, 0, 0);
      const blob = await c.convertToBlob({ type: 'image/webp', quality: q });
      const buf = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(s);
    }, { data: png.toString('base64'), q: Q });
    const file = `${out}/${s.name}.webp`;
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    const info = await page.evaluate(() => window.__loading.frozen);
    const kb = Math.round(fs.statSync(file).size / 1024);
    console.log(`${s.name}: ${kb} KB  ${Math.round(W * DPR)}x${Math.round(H * DPR)}  ${JSON.stringify(info)}${errors.length ? '  ERRORS ' + errors.join(' | ') : ''}`);
    if (errors.length) bad++;
    manifest.push({ f: `${s.name}.webp`, seed: s.seed, tod: s.tod, mtn: s.mtn, trick: info?.trick, place: info?.place, time: info?.time });
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log(JSON.stringify(manifest));
// The full set: write the manifest into index.html's still picker (/*STILLS*/…/*END*/).
if (!only.length && !process.env.SPECS && !bad) {
  const idx = new URL('../index.html', import.meta.url);
  const man = JSON.stringify(LIST.map((x) => ({ f: `${x.name}.webp`, seed: x.seed, tod: x.tod, mtn: x.mtn, gear: x.gear })));
  fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/\/\*STILLS\*\/.*?\/\*END\*\//, `/*STILLS*/${man}/*END*/`));
  console.log('index.html still manifest updated');
}
process.exit(bad ? 1 : 0);
