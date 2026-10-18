// Dev helper: boot the game in first person (headless) and evaluate page snippets from a file, printing
// what each returns. Usage: GPU=1 node web/scripts/fpprobe.mjs <baseUrl> <snippets.js> [ski|snowboard] [query]
// The snippets file is a JS array of strings (each an async function body with `s` = window.__sendit).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5191/', file, equip = 'ski', query = 'kicker=2'] = process.argv.slice(2);
const snippets = (0, eval)(fs.readFileSync(file, 'utf8'));
const browser = await chromium.launch({
  args: process.env.GPU ? [process.platform === 'darwin' ? '--use-angle=metal' : '--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[probe]')) console.log(m.text().slice(0, 500)); });
await page.addInitScript(() => { try { const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}'); s.view = 'fp'; localStorage.setItem('sendit.settings', JSON.stringify(s)); } catch { /* */ } });
await page.goto(`${base.replace(/\/?$/, '/')}?${query}&equip=${equip}`);
await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
await page.click('.lb-ride');
await page.waitForFunction(() => window.__cam?.intro >= 1 && window.__sendit.game.mode === 1, null, { timeout: 60000 });
for (const [i, sn] of snippets.entries()) {
  const res = await page.evaluate(`(async () => { const s = window.__sendit; ${sn} })()`);
  console.log(`#${i}`, JSON.stringify(res));
  if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}-${i}.png` });
}
await browser.close();
