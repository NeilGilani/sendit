// Kitsune Peak (map 6) screenshots on the real GPU: drops the rider at named viewpoints (u, v, heading) on the
// dev server and saves one JPEG per view. Keep the output out of the repo (OUT=<scratch dir>).
// Usage: OUT=<dir> node web/scripts/map6-shots.mjs [base = http://localhost:5195] [view,view,…|all] [equip]
import { chromium } from '@playwright/test';
const OUT = process.env.OUT || '.';
const [base = 'http://localhost:5195', which = 'all', equip = 'skis'] = process.argv.slice(2);
// [name, u, v, heading offset from the fall line (rad, + = look left), ride seconds before the shot]
const VIEWS = [
  ['rim', 25, 0, 0, 0], ['bowl', 300, -40, 0, 0], ['kazan', 400, 228, 0, 0], ['makura', 700, -430, 0, 0],
  ['glade', 900, -40, 0, 0], ['gully', 700, 440, 0, 0], ['otorii', 1470, 40, 0, 0], ['tunnel', 1600, 49, 0, 0],
  ['shrine', 1700, 40, 0, 0], ['ryokan', 1840, 120, 0.3, 0], ['pagoda', 1760, -60, -0.4, 0], ['onsen', 1830, 330, 0, 0],
  ['base', 2300, 60, 0, 0], ['lookback', 1500, -80, Math.PI, 0], ['lookback2', 2350, 100, Math.PI, 0],
];
const pick = which === 'all' ? VIEWS : VIEWS.filter((v) => which.split(',').includes(v[0]));
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1600), height: Number(process.env.H || 900) } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto(`${base}/?ride&quality=${process.env.Q || 1}&map=kitsune-peak&equip=${equip}${process.env.EXTRA || ''}`);
await page.waitForFunction(() => window.__sendit && window.__sendit.player.state === 1, null, { timeout: 300000 });
await page.waitForTimeout(3000);
for (const [name, u, v, look, ride] of pick) {
  await page.evaluate(([u, v, look, ride]) => {
    const s = window.__sendit, pl = s.player;
    pl.place({ x: -1250 + u, z: v }, -Math.PI / 2 + look);
    pl.state = ride ? 1 : 0;
  }, [u, v, look, ride]);
  await page.waitForTimeout(2500 + ride * 1000);
  await page.screenshot({ path: `${OUT}/k_${name}.jpg`, quality: 82 });
  console.log('shot', name);
}
console.log('errors', errs.length, errs.slice(0, 5).join(' | '));
await browser.close();
