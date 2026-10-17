// Kitsune Peak end to end in the real game (dev server, real GPU, real scatter / props / HUD / ride tracker): opens
// ?map=kitsune-peak&trail=<id>&ride, a scripted rider follows the trail's line to the finish, and the script reports
// the runCompleted events (exactly one per finished run), crashes, the run summary and console errors, and saves a
// screenshot. Usage: OUT=<dir> node web/scripts/map6-e2e.mjs [trail = senbon] [skis|snowboard] [base = http://localhost:5195]
import { chromium } from '@playwright/test';
const OUT = process.env.OUT || '.', trail = process.argv[2] || 'senbon', equip = process.argv[3] || 'skis', base = process.argv[4] || 'http://localhost:5195';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/AudioContext/.test(m.text())) errs.push(m.text().slice(0, 200)); });
await page.goto(`${base}/?ride&quality=1&map=kitsune-peak&trail=${trail}&equip=${equip}`);
await page.waitForFunction(() => window.__sendit && window.__sendit.player.state === 1, null, { timeout: 300000 });
const start = await page.evaluate(async (trail) => {
  const L = await import('/src/maps/kitsune/layout.js');
  const s = window.__sendit, c = s.course, pl = s.player;
  const pts = c.linePoints(trail), X0 = L.START_X;
  const vAt = (u) => { if (u <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; } return pts[pts.length - 1][1]; };
  window.__ev = { completed: [], crashes: [], summary: null };
  const st = await import('/src/state.js');
  st.on('runCompleted', (e) => window.__ev.completed.push(e));
  st.on('runSummary', (r) => { window.__ev.summary = { total: r.total, goals: r.goalList, features: r.featureList }; });
  st.on('crashed', (k) => window.__ev.crashes.push([k, Math.round(pl.position.x - X0), Math.round(pl.position.z)]));
  pl.script = (ctl, p) => {
    const u = p.position.x - X0, look = Math.max(10, p.speed * 0.8);
    const travel = p.heading + (p.travelSign < 0 ? Math.PI : 0);
    const want = Math.atan2(-look, -(vAt(u + look) - p.position.z));
    const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    if (p.state === 1) ctl.steer = Math.max(-1, Math.min(1, -d * 2.2));
    ctl.tuck = Math.abs(d) < 0.2 ? 1 : 0;
  };
  return { u: Math.round(pl.position.x - X0), v: Math.round(pl.position.z), selected: c.activeTrail };
}, trail);
console.log('start', JSON.stringify(start));
const t0 = Date.now();
while (Date.now() - t0 < 300000) {
  await page.waitForTimeout(3000);
  const n = await page.evaluate(() => window.__ev.completed.length);
  if (n) break;
}
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/e2e_${trail}_${equip}.jpg`, quality: 80 });
const ev = await page.evaluate(() => window.__ev);
console.log('runCompleted', ev.completed.length, JSON.stringify(ev.completed));
console.log('crashes', JSON.stringify(ev.crashes), 'summary', JSON.stringify(ev.summary));
console.log('errors', errs.length, errs.slice(0, 5).join(' | '));
const ok = ev.completed.length === 1 && ev.completed[0].mapId === 'kitsune-peak' && errs.length === 0 && start.selected === trail;
console.log(ok ? 'PASS' : 'FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
