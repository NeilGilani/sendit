// Dev helper: stack image files into one labelled comparison sheet (before / after turntables).
//   node web/scripts/outfit-compare.mjs <out.png> "<label>=<a.png>" "<label>=<b.png>" …
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [out = 'compare.png', ...items] = process.argv.slice(2);
const rows = items.map((s) => { const i = s.indexOf('='); return { label: s.slice(0, i), b64: fs.readFileSync(s.slice(i + 1)).toString('base64') }; });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 300 } });
await page.setContent(`<html><body style="margin:0;background:#16181c;font:600 18px system-ui;color:#eee">
  ${rows.map((r) => `<div style="padding:8px 10px 2px">${r.label}</div><img style="display:block;max-width:1080px;margin:0 10px" src="data:image/png;base64,${r.b64}">`).join('')}
  </body></html>`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
