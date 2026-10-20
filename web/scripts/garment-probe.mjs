// Dev probe for garment-clip: evaluates a JS snippet on the clip harness page after dressing a look.
//   node web/scripts/garment-probe.mjs <baseUrl> <jacket/pants> '<js returning JSON>'
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5215/', look = 'tuff-shell/tuff-bib', code0 = '1'] = process.argv.slice(2);
const code = code0.startsWith('@') ? (await import('node:fs')).readFileSync(code0.slice(1), 'utf8') : code0;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base.replace(/\/?$/, '/')}src/equipment/clipharness.html`);
await page.waitForFunction(() => window.__clip?.ready, null, { timeout: 120000 });
const [j, p] = look.split('/');
await page.evaluate((s) => window.__clip.garments({ gear: 'ski', slots: s, only: ['stand'] }), { jacket: { garment: j }, pants: { garment: p } });
const out = await page.evaluate(`(async () => { ${code} })()`);
console.log(JSON.stringify(out, null, 1));
await browser.close();
