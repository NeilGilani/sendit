// Compares recordings (references or renders from audio-test.mjs) by octave-band profile, centroid and
// envelope modulation, decoded and analysed in Chromium (src/audio/harness.html → analyzeAudio).
// Usage: node web/scripts/audio-compare.mjs <baseUrl> <file> [file…]   (wav / mp3 / ogg)
// Band profiles are printed relative to their loudest band so recordings at different gains compare.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const base = (process.argv[2] || 'http://localhost:5192/').replace(/\/?$/, '/');
const files = process.argv.slice(3);
const rows = process.env.ROWS === '1';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + 'src/audio/harness.html');
await page.waitForFunction(() => window.harnessReady, null, { timeout: 30000 });
const rel = (b) => { const m = Math.max(...Object.values(b)); return Object.values(b).map((v) => (v - m).toFixed(0).padStart(4)).join(''); };
console.log('file'.padEnd(30) + 'part  ' + [63, 125, 250, 500, '1k', '2k', '4k', '8k', '16k'].map((f) => String(f).padStart(4)).join('') + '   centroid  rms dB   mod% @4 8 12 16 20 25 30 40 60 80 Hz');
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const r = await page.evaluate(([b, o]) => window.analyzeAudio(b, o), [b64, { rows }]);
  const name = basename(f).slice(0, 28).padEnd(30);
  console.log(`${name}top   ${rel(r.top)}   ${r.centroidTop.toFixed(0).padStart(6)}  ${(20 * Math.log10(r.topRms || 1e-9)).toFixed(1).padStart(6)}   ${Object.values(r.mod).map((v) => v.toFixed(1)).join(' ')}`);
  console.log(`${''.padEnd(30)}mid   ${rel(r.mid)}   ${r.centroidMid.toFixed(0).padStart(6)}  ${(20 * Math.log10(r.midRms || 1e-9)).toFixed(1).padStart(6)}   (${r.seconds.toFixed(0)} s)`);
  if (rows) console.log(r.rows.map((x) => `${x.t.toFixed(0)}:${(20 * Math.log10(x.rms + 1e-9)).toFixed(0)}/${x.c}`).join(' '));
}
await browser.close();
