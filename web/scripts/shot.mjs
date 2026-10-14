// Dev helper: open the game in headless Chromium (software WebGL), log console errors, save a screenshot.
// Usage: node scripts/shot.mjs <url> <out.png> [waitSeconds] [keys]
import { chromium } from '@playwright/test';
const [url = 'http://localhost:5173/?ride', out = 'shot.png', wait = '20', keys = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 960), height: Number(process.env.H || 540) } });
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log(`[${m.type()}]`, m.text().slice(0, 600)); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__sendit, null, { timeout: 240000 });
console.log('booted');
if (keys) { for (const k of keys.split(',')) await page.keyboard.down(k); }
await page.waitForTimeout(Number(wait) * 1000);
const info = await page.evaluate(() => { const s = window.__sendit; return { mode: s.game.mode, state: s.skier.state, speed: s.skier.speed.toFixed(1), pos: s.skier.position.toArray().map((v) => v.toFixed(1)), calls: s.renderer.info.render.calls, tris: s.renderer.info.render.triangles }; });
console.log(JSON.stringify(info));
await page.screenshot({ path: out, timeout: 300000 });
await browser.close();
