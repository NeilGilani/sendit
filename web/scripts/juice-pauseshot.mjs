// Pause screen with the progression line (level, XP to next, open dailies). Real GPU.
// Usage: node web/scripts/juice-pauseshot.mjs <baseUrl> <out.png>
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5198/', out = 'pause.png'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
await page.goto(`${base}?ride`, { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sendit?.game.mode === 1, null, { timeout: 400000 });
await page.waitForTimeout(3000);
await page.keyboard.press('Escape');
await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: 20000 }).catch(() => console.log('no pause'));
await page.waitForTimeout(600);
await page.screenshot({ path: out });
console.log('stats:', await page.evaluate(() => document.getElementById('stats').innerText), 'errors', errors);
await browser.close();
