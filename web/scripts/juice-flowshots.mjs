// Layout check of the juice HUD next to a map's own HUD (flow maps: Ravenspire, Voltage Park):
// rides from the spawn, then pushes a staged chain of moves through the real event bus (score →
// flow line chain → juice combo panel, a graded landing → announcer, a bank) and screenshots each.
// Usage: GPU=1 node web/scripts/juice-flowshots.mjs <baseUrl> <outDir> <mapId> [ski|snowboard]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5198/', outDir = '.', map = 'voltage-park', equip = 'snowboard'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[error]', m.text().slice(0, 300)); } });
const shot = async (n) => { await page.screenshot({ path: `${outDir}/${map}${process.env.FP ? '-fp' : ''}-${n}.png` }); console.log('shot', n); };
await page.goto(`${base.replace(/\/?$/, '/')}?ride&map=${map}&equip=${equip}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sendit?.game.mode === 1, null, { timeout: 400000 });
if (process.env.FP) await page.evaluate(async () => { const { setSetting } = await import('/src/state.js'); setSetting('view', 'fp'); });   // FP=1: helmet cam
await page.waitForTimeout(6000);
const stage = (steps) => page.evaluate(async (steps) => {
  const { emit, addScore } = await import('/src/state.js');
  for (const [kind, a, b] of steps) {
    if (kind === 'score') addScore(a, b);
    else emit(kind, a);
    await new Promise((r) => setTimeout(r, 120));
  }
}, steps);
if (process.env.SENDIT) await page.evaluate(() => { const f = window.__sendit.player.flow; if (f) { f.stateT = 12; f.meter = 1; } });   // SENDIT=1: force the flow state
await page.keyboard.down('w');
if (process.env.FEVER) await page.evaluate(() => window.__juice.combo.startFever());   // FEVER=1: open a FEVER window
await stage([['score', 'FS 540 Indy', 420], ['score', 'Boardslide · 6.2 m', 180], ['nearMiss', { dist: 0.6 }], ['score', 'Close shave', 15]]);
await page.waitForTimeout(400);
await shot('1-chain');
await stage([['landed', { impact: 3, air: 1.6, clean: true, perfect: true, trick: 'Cab 720 Mute', grade: 'stomped', points: 610, drop: 5, result: 'clean' }], ['score', 'Cab 720 Mute', 610]]);
await page.waitForTimeout(350);
await shot('2-announce');
await page.waitForTimeout(4500);
await shot('3-bank');
console.log('flow', JSON.stringify(await page.evaluate(() => ({ src: window.__juice.combo.source, hasFlow: !!window.__sendit.player.flow }))));
console.log('errors', errors);
await browser.close();
