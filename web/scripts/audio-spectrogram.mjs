// Spectrogram PNGs (log frequency, 50 Hz–16 kHz) of recordings or renders, for eyeballing structure over time.
// Usage: node web/scripts/audio-spectrogram.mjs <baseUrl> <outDir> <file[:from:to]> …
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';

const base = (process.argv[2] || 'http://localhost:5192/').replace(/\/?$/, '/');
const out = process.argv[3];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(base + 'src/audio/harness.html');
await page.waitForFunction(() => window.harnessReady, null, { timeout: 30000 });
for (const arg of process.argv.slice(4)) {
  const m = arg.match(/^(.*?)(?::([\d.]+):([\d.]+))?$/);
  const file = m[1], from = m[2] ? +m[2] : 0, to = m[3] ? +m[3] : 0;
  const url = await page.evaluate(([b, o]) => window.spectrogram(b, o), [readFileSync(file).toString('base64'), { from, to, label: basename(file) }]);
  const dst = join(out, basename(file).replace(/\.\w+$/, '') + (from || to ? `_${from}-${to}` : '') + '.png');
  writeFileSync(dst, Buffer.from(url.split(',')[1], 'base64'));
  console.log(dst);
}
await browser.close();
