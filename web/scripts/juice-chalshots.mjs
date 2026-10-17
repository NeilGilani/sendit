// Challenge-mode juice screenshots on the real GPU: a seeded "best run" (sendit.splits.<course>) so the
// first gates show split deltas next to the timer, plus the combo panel with its tier word.
// Usage: GPU=1 node web/scripts/juice-chalshots.mjs <baseUrl> <outDir> [mapId]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5198/', outDir = '.', map = 'valcrest-gully'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[error]', m.text().slice(0, 300)); } });
const shot = async (n) => { await page.screenshot({ path: `${outDir}/chal-${n}.png` }); console.log('shot', n); };
await page.goto(`${base.replace(/\/?$/, '/')}?ride&map=${map}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sendit?.game.mode === 1, null, { timeout: 400000 });
// Seed a best run whose gates were all 1 s apart, then restart as a Challenge.
await page.evaluate(() => {
  const a = window.__sendit.activities;
  localStorage.setItem(`sendit.splits.${a.key}`, JSON.stringify({ s: Array.from({ length: 40 }, (_, i) => 3 + i * 2.2), t: 95 }));
  window.__splits = [];
  window.__sendit.ui.h.retry();
});
await page.waitForFunction(() => window.__sendit.activities.state === 'running', null, { timeout: 60000 });
const { emitOk } = await page.evaluate(async () => {
  const { on } = await import('/src/state.js');
  on('juiceSplit', (e) => window.__splits.push(e));
  return { emitOk: true };
});
void emitOk;
await page.keyboard.down('w');
const got = await page.waitForFunction(() => window.__splits.length > 0, null, { timeout: 90000 }).then(() => true).catch(() => false);
await page.waitForTimeout(250);
await shot('1-split');
console.log('splits', JSON.stringify(await page.evaluate(() => window.__splits.map((s) => [s.i, +s.time.toFixed(2), s.delta && +s.delta.toFixed(2)]))), got);
// The style combo (challenge source) with a tier word.
await page.evaluate(async () => {
  const { addScore } = await import('/src/state.js');
  for (const [l, p] of [['Left 360', 220], ['Close shave', 15], ['Mute', 90], ['Gate', 20], ['Right 540', 330]]) { addScore(l, p); await new Promise((r) => setTimeout(r, 90)); }
});
await page.waitForTimeout(300);
await shot('2-combo-tier');
console.log('combo', JSON.stringify(await page.evaluate(() => window.__juice.combo.state())));
console.log('errors', errors);
await browser.close();
