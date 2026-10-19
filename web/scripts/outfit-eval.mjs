// Dev helper: run a JS expression in the lobby page (window.__sendit ready) and print the result as JSON.
// Usage: node web/scripts/outfit-eval.mjs <url> '<expression>'   (an async arrow body is fine: '(async()=>{…})()')
import { chromium } from '@playwright/test';

const [url = 'http://localhost:5203/', expr = '1'] = process.argv.slice(2);
const args = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${url}${url.includes('?') ? '&' : '?'}quality=0`);
await page.waitForFunction(() => window.__sendit?.stage?.ready, null, { timeout: 300000 });
const out = await page.evaluate(expr);
console.log(JSON.stringify(out, null, 1));
if (errors.length) console.log('errors:', errors.slice(0, 5));
await browser.close();
