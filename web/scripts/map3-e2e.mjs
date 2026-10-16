// Ravenspire end to end in the real game (dev server, real GPU, real forest and rocks): a scripted rider
// follows one of the canonical lines (layout.js RIDE_LINES) from the heli drop to the valley at ~20 m/s,
// and the script reports the run summary (judged score, linked features, line goals), crashes (where and
// why) and console errors, and saves a screenshot of the summary card.
// Usage: OUT=<dir> node scripts/map3-e2e.mjs [line = stacks] [skis|snowboard]   (needs the dev server on 5183)
import { chromium } from '@playwright/test';
const OUT = process.env.OUT || '.', line = process.argv[2] || 'stacks', equip = process.argv[3] || 'skis';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:5183/?ride&quality=1&map=ravenspire&equip=${equip}`);
await page.waitForFunction(() => window.__sendit && window.__sendit.player.state === 1, null, { timeout: 300000 });
const info = await page.evaluate(async (line) => {
  const L = await import('/src/maps/ravenspire/layout.js');
  const s = window.__sendit, c = s.course, pl = s.player;
  const raw = L.RIDE_LINES[line].pts, pts = [];
  for (const p of raw) { if (p === 'ravine') for (let u = 420; u <= 2180; u += 20) pts.push([u, c.rvAt(c.rv.c, u)]); else pts.push(p); }
  const vAt = (u) => { if (u <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / (pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; } return pts[pts.length - 1][1]; };
  window.__ev = { summary: null, goals: [], crashes: 0, scores: 0 };
  const st = await import('/src/state.js');
  st.on('runSummary', (r) => { window.__ev.summary = r; });
  st.on('lineGoal', (g) => window.__ev.goals.push(g?.name || JSON.stringify(g)));
  st.on('crashed', (k) => { window.__ev.crashes++; const p = window.__sendit.player; (window.__ev.where ||= []).push([k, Math.round(p.position.x + 1260), Math.round(p.position.z), p.speed.toFixed(1), JSON.stringify(p.lastCrash)]); });
  st.on('score', () => window.__ev.scores++);
  pl.script = (ctl, p) => {
    const uu = p.position.x + 1260, look = Math.max(10, p.speed * 1.1);
    const tx = -1260 + uu + look, tz = vAt(uu + look);
    const travel = p.heading + (p.travelSign < 0 ? Math.PI : 0);
    const want = Math.atan2(-(tx - p.position.x), -(tz - p.position.z));
    const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    if (p.state === 1) ctl.steer = Math.max(-1, Math.min(1, -d * 2.2));
    ctl.tuck = Math.abs(d) < 0.2 ? 1 : 0;
    if (p.state === 1 && p.speed > 22) ctl.brake = 0.6;   // control style: big lines at ~20 m/s
  };
  return Object.keys(L.RIDE_LINES);
}, line);
const t0 = Date.now();
let shot = 0;
while (Date.now() - t0 < 330000) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => { const p = window.__sendit.player; return { u: Math.round(p.position.x + 1260), spd: +p.speed.toFixed(1), state: p.state, summary: !!window.__ev.summary, mode: window.__sendit.game.mode }; });
  if (shot++ % 6 === 0) console.log(((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(st));
  if (st.summary) break;
}
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/e2e_${line}_${equip}.jpg`, quality: 80 });
const ev = await page.evaluate(() => ({ where: window.__ev.where, goals: window.__ev.goals, crashes: window.__ev.crashes, scores: window.__ev.scores, total: window.__ev.summary?.total, linked: window.__ev.summary?.featureList, goalList: window.__ev.summary?.goalList }));
console.log('summary', JSON.stringify(ev));
console.log('errors', errs.length, errs.slice(0, 5).join(' | '));
await browser.close();
