// Rider ↔ gear penetration check: poses the real rider through every riding, air and grab pose (skis and
// board) and through every loading-screen hero shot, and reports how deep garments, mitts and boots sit
// inside the skis / board (src/equipment/clipharness.js says exactly what is measured).
// Usage: node scripts/gear-clip.mjs [baseUrl] [--shots outDir] [--json file] [--check] [--quick]
//   --shots  contact sheets (side / below / 3/4 front) per pose into outDir
//   --json   write all rows to a file (before / after comparisons)
//   --check  exit 1 when any pose goes deeper than LIMIT cm (1.0; boots vs the base 0.3)
//   --quick  fewer variants / seeds
//   --fits   also every outfit fit (jacket / pants / gloves) on the all-mountain gear
//   --views side,below,front,side2,chase  --size WxH (sheet cells)
//   --tricks a,b (loading tricks)
//   --only a,b   game poses whose name contains a or b; --gear ski|snowboard; --mode game|loading
import { chromium } from '@playwright/test';
import fs from 'fs';

const args = process.argv.slice(2);
const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:5202/').replace(/\/?$/, '/');
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const shots = opt('--shots'), json = opt('--json'), check = args.includes('--check'), quick = args.includes('--quick');
const only = opt('--only')?.split(',');
const LIMIT = { body: 1.0, hand: 1.0, sunk: 1.0, base: 0.3, gap: 1.5 };

const browser = await chromium.launch({ args: process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11'] });
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}src/equipment/clipharness.html`);
await page.waitForFunction(() => window.__clip?.ready, null, { timeout: 120000 });

const jobs = [];
const skiVars = quick ? ['allmountain'] : ['allmountain', 'park', 'gs', 'powder'];
const boardVars = quick ? ['allmountain'] : ['allmountain', 'park', 'freeride', 'carver', 'powder'];
for (const v of skiVars) jobs.push({ mode: 'game', gear: 'ski', variant: v });
for (const v of boardVars) for (const st of quick ? ['regular'] : ['regular', 'goofy']) jobs.push({ mode: 'game', gear: 'snowboard', variant: v, stance: st });
for (const v of quick ? ['allmountain'] : ['allmountain', 'park', 'powder']) jobs.push({ mode: 'loading', gear: 'ski', variant: v, seeds: quick ? [1] : [1, 2] });
for (const v of quick ? ['allmountain'] : ['allmountain', 'freeride', 'park', 'powder']) for (const st of ['regular', 'goofy']) jobs.push({ mode: 'loading', gear: 'snowboard', variant: v, stance: st, seeds: quick ? [1] : [1, 2] });

// --fits all: also every outfit fit (jacket + pants + gloves, character/outfits.js) over the quick set.
if (args.includes('--fits')) {
  const FITS = [['storm-shell', 'cargo-pant', 'pipe-glove'], ['retro-suit', 'wide-pant', 'tuff-mitt'], ['ridge-shell', 'tuff-bib', 'pipe-glove'],
    ['tall-anorak', 'wide-pant', 'tuff-mitt'], ['cloud-puffer', 'cargo-pant', 'tuff-mitt'], ['layer-hoodie', 'wide-pant', 'pipe-glove'], ['tall-anorak', 'cargo-pant', 'pipe-glove']];
  for (const fit of FITS) {
    jobs.push({ mode: 'game', gear: 'ski', variant: 'allmountain', fit }, { mode: 'game', gear: 'snowboard', variant: 'allmountain', stance: 'regular', fit });
    jobs.push({ mode: 'loading', gear: 'ski', variant: 'allmountain', seeds: [1], fit }, { mode: 'loading', gear: 'snowboard', variant: 'allmountain', stance: 'goofy', seeds: [1], fit });
  }
}
// --gear ski|snowboard, --mode game|loading: run a subset (iterating on one thing).
const gearF = opt('--gear'), modeF = opt('--mode');
for (let i = jobs.length - 1; i >= 0; i--) if ((gearF && jobs[i].gear !== gearF) || (modeF && jobs[i].mode !== modeF)) jobs.splice(i, 1);
const all = [];
let sheetN = 0;
for (const j of jobs) {
  // Contact sheets only for the first variant of each kind (keeps the sheets readable).
  const pics = !!shots && (j.variant === 'allmountain') && (j.stance !== 'goofy' || j.mode === 'loading') && (!j.fit || args.includes('--fitshots'));
  if (pics) await page.evaluate(() => window.__clip.clearSheet());
  const views = opt('--views')?.split(','), size = opt('--size')?.split('x').map(Number);
  const rows = await page.evaluate((o) => window.__clip.run(o), { ...j, shots: pics, only, ...(views ? { views } : {}), ...(size ? { w: size[0], h: size[1] } : {}), ...(opt('--tricks') ? { tricks: opt('--tricks').split(',') } : {}) });
  all.push(...rows);
  if (pics) {
    fs.mkdirSync(shots, { recursive: true });
    const f = `${shots}/${String(++sheetN).padStart(2, '0')}_${j.mode}_${j.gear}_${j.variant}_${j.stance || ''}${j.fit ? '_' + j.fit[0] : ''}.png`;
    await page.locator('#sheet').screenshot({ path: f });
    console.log(`sheet ${f}`);
  }
}
await browser.close();

const f1 = (x) => (x >= 0.05 ? x.toFixed(1) : '0').padStart(5);
console.log(`\n${'pose'.padEnd(28)} ${'gear'.padEnd(26)}  body  hand  sunk  base   gap  (cm)`);
for (const r of all) console.log(`${r.name.padEnd(28)} ${r.gear.padEnd(40)} ${f1(r.body)} ${f1(r.hand)} ${f1(r.sunk)} ${f1(r.base)} ${f1(r.gap)}${r.miss > 0.5 ? `  (hand ${r.miss.toFixed(0)} cm short of the grab)` : ''}${r.worstAt != null ? `   worst at t=${r.worstAt.toFixed(2)} (land ${r.Ta.toFixed(2)})${r.iters ? `  max ${r.iters} pose passes` : ''}` : ''}`);
const max = { body: 0, hand: 0, sunk: 0, base: 0, gap: 0 };
for (const r of all) for (const k of Object.keys(max)) max[k] = Math.max(max[k], r[k]);
console.log(`\nmax  body ${max.body.toFixed(2)}  hand ${max.hand.toFixed(2)}  sunk ${max.sunk.toFixed(2)}  base ${max.base.toFixed(2)}  gap ${max.gap.toFixed(2)} cm over ${all.length} poses`);
if (args.includes('--where')) for (const r of all) {
  if (r.hand > 0.3) console.log(`  ${r.name} ${r.gear}: worst hand vertex (x,y,z,hw,top,base,part) ${JSON.stringify(r.handAt)}`);
  if (r.body > 0.3) console.log(`  ${r.name} ${r.gear}: worst body vertex ${JSON.stringify(r.bodyAt)} at t=${r.worstT?.body?.toFixed(2)}`);
  if (r.sunk > 0.3) console.log(`  ${r.name} ${r.gear}: worst sunk boot vertex ${JSON.stringify(r.sunkAt)} at t=${r.worstT?.sunk?.toFixed(2)}`);
}
if (json) fs.writeFileSync(json, JSON.stringify(all, null, 1));
if (errors.length) console.log('ERRORS:\n  ' + errors.slice(0, 10).join('\n  '));
const bad = all.filter((r) => Object.keys(LIMIT).some((k) => r[k] > LIMIT[k]));
if (check) console.log(bad.length ? `FAIL: ${bad.length} poses over the limit` : 'PASS: every pose within the clearance limits');
process.exit(errors.length || (check && bad.length) ? 1 : 0);
