// Garment ↔ garment clip check (docs/character.md § Garment clip): poses the real rider through every
// riding / air / grab pose (skis and board) plus arm poses (down, forward, up, out, pole plant) and reports,
// per outfit, how far the pants poke out through the jacket, the jacket hem sinks into the pants, the
// sleeves sink into the jacket body and the jacket body pokes out through the sleeves
// (src/equipment/garmentclip.js says exactly what is measured).
//
//   node web/scripts/garment-clip.mjs [baseUrl] [--looks all|jacketId/pantsId,…|proto:r1,…] [--gear ski|snowboard]
//        [--only a,b] [--json file] [--check] [--shots outDir]
//   --check  exit 1 when a pose goes over a limit (LIMIT below: offending vertices per pose)
//   --legacy the same cuts without this pass's fixes (before / after numbers)
import { chromium } from '@playwright/test';
import fs from 'fs';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:5215/').replace(/\/?$/, '/');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const legacy = args.includes('--legacy');
const check = args.includes('--check'), json = opt('--json'), only = opt('--only')?.split(','), shots = opt('--shots'), views = opt('--views')?.split(',');
// Limits, in offending vertices per pose (the outfit has ~16 k; a vertex is ~1.5 × 1.5 cm of cloth):
// a few specks where two layers graze in the deepest grabs pass, a visible patch does not.
const LIMIT = { pantsOut: 20, hemIn: 35, sleeveIn: 45, torsoOut: 12 };

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
  const slots = await page.evaluate(async ([l, legacy]) => {
    if (l.startsWith('proto:')) { const { protoSlots } = await import('/src/character/proto.js'); return protoSlots(l.slice(6)); }
    const [j, p] = l.split('/');
    if (!legacy) return { jacket: { garment: j }, pants: { garment: p } };
    // --legacy: the same cut without this pass's clip fixes (torso profile, layered skinning, one-piece armhole)
    const { GARMENTS } = await import('/src/character/outfits.js');
    const cut = { ...GARMENTS.jacket[j].cut, smoothProfile: null, layerPants: null, hemThigh: 0, armBlend: 0, pelvisRamp: null };
    return { jacket: { garment: j, def: { id: `${j}-legacy`, cut } }, pants: { garment: p } };
  }, [look, legacy]);
  for (const gear of gears) {
    if (shots) await page.evaluate(() => window.__clip.clearSheet());
    const rows = await page.evaluate((o) => window.__clip.garments(o), { gear, variant: 'allmountain', slots, only, shots: !!shots, ...(views ? { views } : {}) });
    for (const r of rows) all.push({ look, ...r });
    const worst = (k) => rows.reduce((m, r) => (r[k + 'N'] > m[k + 'N'] ? r : m), rows[0]);
    const sum = (k) => rows.reduce((a, r) => a + r[k + 'N'], 0);
    const line = Object.keys(LIMIT).map((k) => { const w = worst(k); return `${k} max ${String(w[k + 'N']).padStart(3)} (${w.name.slice(0, 18)}) Σ${String(sum(k)).padStart(4)}`; }).join(' | ');
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
const bad = all.filter((r) => Object.entries(LIMIT).some(([k, l]) => r[k + 'N'] > l));
if (bad.length) {
  console.log(`\n${bad.length} pose(s) over the limits (${JSON.stringify(LIMIT)} vertices):`);
  for (const r of bad.slice(0, 40)) console.log(`  ${r.look} ${r.gear} ${r.name}: ${Object.keys(LIMIT).filter((k) => r[k + 'N'] > LIMIT[k]).map((k) => `${k} ${r[k]} n${r[k + 'N']} @${JSON.stringify(r[k + 'At'])}`).join(', ')}`);
}
if (check && (bad.length || errors.length)) process.exit(1);
