// Dump Ravenspire's real trees / rocks / towers ([x, z, radius, kind], from the browser's scatter) to a JSON
// file, so the headless bots can ride the actual forest: OBSTACLES=<file> node scripts/map3-ride.mjs ...
// Usage: node scripts/map3-obstacles.mjs <out.json> [baseUrl = http://localhost:5183]   (needs the dev server)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });
await page.goto(`${process.argv[3] || 'http://localhost:5183'}/?ride&quality=1&map=ravenspire`);
await page.waitForFunction(() => window.__sendit && window.__sendit.player.state === 1, null, { timeout: 300000 });
await page.waitForTimeout(1500);
const obs = await page.evaluate(() => { const out = []; for (const a of window.__sendit.scatter.hash.values()) for (const o of a) out.push(o); return out; });
fs.writeFileSync(process.argv[2], JSON.stringify(obs));
const kinds = {}; for (const o of obs) kinds[o[3]] = (kinds[o[3]] || 0) + 1;
console.log(obs.length, JSON.stringify(kinds));
await browser.close();
