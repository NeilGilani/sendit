// The rendered item icons in the real flow: Cases tab, the reel mid-spin, a gold reveal (with the
// session summary after Open all), and the Locker with several gold / red items owned. Usage:
//   node scripts/iconflow.mjs <url> <outDir>        (macOS Metal; ANGLE=… elsewhere)
// Fails on console errors.
import { chromium } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:5198/').replace(/\/?$/, '/');
const out = process.argv[3] || '/tmp/sendit-icons';
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu', '--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const shot = async (page, name) => { await page.screenshot({ path: `${out}/${name}.png` }); console.log('wrote', `${out}/${name}.png`); };
const icons = (page) => page.waitForFunction(() => window.__senditIcons.pending() === 0, null, { timeout: 300000, polling: 300 });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?quality=0`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?quality=0&casegrant=12&caseforce=gold`);
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });
  // Own a spread of gold and red items without the show: open cases straight through the store.
  await page.evaluate(async () => {
    const s = window.__sendit;
    s.lobby.select('cases');
    await new Promise((r) => setTimeout(r, 500));
    const { forcedRng } = await import('/src/lobby/cases/opener.js');
    for (let i = 0; i < 6; i++) { const c = s.profile.unopened[0]; s.profile.openCase(c.id, forcedRng(c.series)); }
    history.replaceState(null, '', location.pathname + '?quality=0&casegrant=0&caseforce=legendary');
    for (let i = 0; i < 4; i++) { const c = s.profile.unopened[0]; s.profile.openCase(c.id, forcedRng(c.series)); }
    history.replaceState(null, '', location.pathname + '?quality=0&caseforce=gold');
    s.lobby.select('locker');
    s.lobby.select('cases');
  });
  await page.waitForTimeout(800);
  await icons(page);
  await page.waitForTimeout(500);
  await shot(page, 'flow-1-cases-tab');
  // Contents panel of the first case.
  const contents = page.locator('[data-show]').first();
  if (await contents.count()) { await contents.click(); await page.waitForTimeout(400); await icons(page); await page.waitForTimeout(400); await shot(page, 'flow-2-contents'); }
  // An opening: the reel mid-spin, then the gold reveal.
  await page.waitForFunction(() => (window.__senditReelPending?.() ?? 0) === 0, null, { timeout: 120000 });
  await page.evaluate(() => { const s = window.__sendit; window.__senditCasesApi.open(s.profile.unopened[0].id); });
  await page.waitForTimeout(5200);
  await shot(page, 'flow-3-reel');
  await page.waitForTimeout(7500);
  await shot(page, 'flow-4-gold-reveal');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  // Locker: skis, then board.
  await page.evaluate(() => window.__sendit.lobby.select('locker'));
  await page.waitForTimeout(500);
  for (const slot of ['skis', 'board', 'jacket']) {
    await page.evaluate((s) => document.querySelector(`.lk-slot[data-slot="${s}"]`)?.click(), slot);
    await page.waitForTimeout(400);
    await icons(page);
    await page.waitForTimeout(600);
    await shot(page, `flow-5-locker-${slot}`);
  }
  await page.evaluate(() => window.__sendit.lobby.select('equipment'));
  await page.waitForTimeout(600); await icons(page); await page.waitForTimeout(400);
  await shot(page, 'flow-6-equipment');
  // Maps tab: the mountain cards with the rendered mountain pictures, then one mountain's header.
  await page.evaluate(() => window.__sendit.lobby.select('maps'));
  await page.waitForTimeout(2500);
  await shot(page, 'flow-7-maps');
  await page.evaluate(() => document.querySelector('.mt-card')?.click());
  await page.waitForTimeout(1500);
  await shot(page, 'flow-8-mountain');
  const broken = await page.evaluate(() => [...document.querySelectorAll('img')].filter((i) => i.complete && !i.naturalWidth).map((i) => i.src));
  if (broken.length) errors.push('broken images: ' + broken.join(', '));
} finally {
  await browser.close();
}
if (errors.length) { console.log('console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('no console errors');
