// Dragonback (map 5) end to end in the real game (dev server, real GPU, the real scatter, props and HUD): a
// scripted rider follows one of the canonical lines (layout.js RIDE_LINES) from the start to the valley and the
// script reports what the game reported — the judged run summary (zen) or the challenge result (time, medal,
// gates), line goals, ridge hops, crashes (where and why) and console errors — and saves a screenshot of the
// summary / results card.
// Usage: OUT=<dir> node web/scripts/map5-e2e.mjs [line = spine] [skis|snowboard] [zen|challenge] [port = 5189]
import { chromium } from '@playwright/test';
const OUT = process.env.OUT || '.';
const [line = 'spine', equip = 'skis', mode = 'zen', port = '5189'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
await page.goto(`http://localhost:${port}/?${mode === 'challenge' ? 'challenge' : 'ride'}&quality=1&map=dragonback&equip=${equip}`);
await page.waitForFunction(() => window.__sendit && window.__sendit.player && window.__sendit.course?.id === 'dragonback', null, { timeout: 300000 });
await page.evaluate(async ({ line, board }) => {
  const L = await import('/src/maps/dragonback/layout.js');
  const s = window.__sendit, c = s.course, pl = s.player;
  const pts = c.linePoints(L.RIDE_LINES[line]);
  const vAt = (u) => { if (u <= pts[0][0]) return pts[0][1]; for (let i = 0; i < pts.length - 1; i++) if (u <= pts[i + 1][0]) { const t = (u - pts[i][0]) / Math.max(1e-6, pts[i + 1][0] - pts[i][0]); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; } return pts[pts.length - 1][1]; };
  window.__ev = { summary: null, result: null, goals: [], hops: [], crashes: 0, where: [] };
  const st = await import('/src/state.js');
  st.on('runSummary', (r) => { window.__ev.summary = r; });
  st.on('runFinished', (r) => { window.__ev.result = r; });
  st.on('lineGoal', (g) => window.__ev.goals.push(g?.name));
  st.on('ridgeHop', (h) => window.__ev.hops.push(`${h.from}→${h.to}`));
  st.on('crashed', (k) => { window.__ev.crashes++; const p = window.__sendit.player; window.__ev.where.push([k, Math.round(p.position.x - L.START_X), Math.round(p.position.z), p.speed.toFixed(1), JSON.stringify(p.lastCrash)]); });
  // The same skilled-rider steering as map5-ride.mjs: the line's heading a beat ahead + cross-track correction.
  pl.script = (ctl, p) => {
    const u = p.position.x - L.START_X;
    const ahead = Math.max(4, p.speed * 0.35);
    const slope = (vAt(u + ahead + 3) - vAt(u + ahead - 3)) / 6, err = vAt(u) - p.position.z;
    const want = Math.atan2(-1, -(slope + Math.tan(Math.max(-1, Math.min(1, Math.atan((board ? 1.0 : 1.5) * err / Math.max(6, p.speed)))))));
    const travel = p.heading + (p.travelSign < 0 ? Math.PI : 0);
    const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    if (p.state === 1) ctl.steer = Math.max(-1, Math.min(1, -d * (board ? 1.4 : 2.2)));
    ctl.tuck = Math.abs(d) < 0.2 ? 1 : 0;
  };
}, { line, board: equip === 'snowboard' });
const t0 = Date.now();
let k = 0;
while (Date.now() - t0 < 360000) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => { const p = window.__sendit.player; return { u: Math.round(p.position.x + 1180), v: Math.round(p.position.z), spd: +p.speed.toFixed(1), state: p.state, done: !!(window.__ev.summary || window.__ev.result) }; });
  if (k++ % 4 === 0) console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, JSON.stringify(st));
  if (st.done) break;
}
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/map5_e2e_${line}_${equip}_${mode}.jpg`, quality: 80 });
const ev = await page.evaluate(() => {
  const e = window.__ev, s = e.summary, r = e.result;
  return {
    crashes: e.crashes, where: e.where, goals: e.goals, hops: e.hops,
    judged: s ? { total: s.total, line: +s.line.toFixed(1), fluidity: +s.fluidity.toFixed(1), control: +s.control.toFixed(1), style: +s.style.toFixed(1), avg: +s.avg.toFixed(1), top: +s.topSpeed.toFixed(1), drop: +s.biggestDrop.toFixed(1), air: +s.longestAir.toFixed(2), linked: s.featureList, goals: s.goalList } : null,
    challenge: r ? { time: +r.time.toFixed(1), medal: r.medal, gates: `${r.gates}/${r.gateTotal}`, penalty: r.penalty, flakes: `${r.flakes}/${r.flakeTotal}`, targets: Object.fromEntries(Object.entries(r.targets).map(([m, t]) => [m, +t.toFixed(1)])) } : null,
  };
});
console.log('result', JSON.stringify(ev, null, 1));
console.log('errors', errs.length, errs.slice(0, 5).join(' | '));
await browser.close();
process.exit(errs.length ? 1 : 0);
