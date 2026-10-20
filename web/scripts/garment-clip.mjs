// Garment ↔ garment clip check (docs/character.md § Garment clip): poses the real rider through every
// riding / air / grab pose (skis and board) plus arm poses (down, forward, up, out, pole plant) and reports,
// per outfit, how far the pants poke out through the jacket, the jacket hem sinks into the pants, the
// sleeves sink into the jacket body and the jacket body pokes out through the sleeves
// (src/equipment/garmentclip.js says exactly what is measured).
//
//   node web/scripts/garment-clip.mjs [baseUrl] [--looks all|jacketId/pantsId,…|proto:r1,…] [--gear ski|snowboard]
//        [--only a,b] [--json file] [--check] [--shots outDir]
//   --check  exit 1 when a limit is exceeded (LIMIT below, cm)
import { chromium } from '@playwright/test';
import fs from 'fs';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:5215/').replace(/\/?$/, '/');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const check = args.includes('--check'), json = opt('--json'), only = opt('--only')?.split(','), shots = opt('--shots'), views = opt('--views')?.split(',');
// Limits (cm): pants through the jacket / hem into the pants must not show at all; the sleeve against the
// jacket body may touch (a few mm where the arm presses on the side).
const LIMIT = { pantsOut: 0.3, hemIn: 0.3, sleeveIn: 1.2, torsoOut: 1.2 };

const browser = await chromium.launch({ args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}src/equipment/clipharness.html${opt("--qs") ? "?" + opt("--qs") : ""}`);
await page.waitForFunction(() => window.__clip?.ready, null, { timeout: 120000 });

let looks = (opt('--looks') || 'all');
if (looks === 'all') {
  looks = await page.evaluate(async () => {
    const { CATALOG_JACKET_LOOKS } = await import('/src/character/outfits.js');
    return CATALOG_JACKET_LOOKS.map(([j, p]) => `${j}/${p}`);
  });
} else looks = looks.split(',');
const gears = opt('--gear') ? [opt('--gear')] : ['ski', 'snowboard'];

const all = [];
let sheetN = 0;
for (const look of looks) {
  const slots = await page.evaluate(async (l) => {
    if (l.startsWith('proto:')) { const { protoSlots } = await import('/src/character/proto.js'); return protoSlots(l.slice(6)); }
    const [j, p] = l.split('/');
    return { jacket: { garment: j }, pants: { garment: p } };
  }, look);
  for (const gear of gears) {
    if (shots) await page.evaluate(() => window.__clip.clearSheet());
    const rows = await page.evaluate((o) => window.__clip.garments(o), { gear, variant: 'allmountain', slots, only, shots: !!shots, ...(views ? { views } : {}) });
    for (const r of rows) all.push({ look, ...r });
    const worst = (k) => rows.reduce((m, r) => (r[k] > m[k] ? r : m), rows[0]);
    const line = Object.keys(LIMIT).map((k) => { const w = worst(k); return `${k} ${w[k].toFixed(2)} (${w.name}, n${w[k + 'N']})`; }).join('  ');
    console.log(`${look.padEnd(34)} ${gear.padEnd(9)} ${line}`);
    if (shots) {
      fs.mkdirSync(shots, { recursive: true });
      const el = await page.$('#sheet');
      await el.screenshot({ path: `${shots}/garment-${String(++sheetN).padStart(2, '0')}-${look.replace(/[/:]/g, '_')}-${gear}.jpg`, quality: 80 });
    }
  }
}
await browser.close();
if (json) fs.writeFileSync(json, JSON.stringify(all, null, 1));
if (errors.length) console.log('page errors:', errors.slice(0, 5));
const bad = all.filter((r) => Object.entries(LIMIT).some(([k, l]) => r[k] > l));
if (bad.length) {
  console.log(`\n${bad.length} pose(s) over the limits (${JSON.stringify(LIMIT)} cm):`);
  for (const r of bad.slice(0, 40)) console.log(`  ${r.look} ${r.gear} ${r.name}: ${Object.keys(LIMIT).filter((k) => r[k] > LIMIT[k]).map((k) => `${k} ${r[k]} n${r[k + 'N']} @${JSON.stringify(r[k + 'At'])}`).join(', ')}`);
}
if (check && (bad.length || errors.length)) process.exit(1);
