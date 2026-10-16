// Playtests for map 2 (Blackspruce Plunge) in the REAL game on the GPU: an in-page driver (the same
// lane-following, obstacle-dodging logic as map2-bot.mjs) rides through the renderer, chase camera,
// HUD, activities and scoring.
//   frames    — ride a route from t for N seconds, save a frame every 0.4 s and a contact sheet
//   challenge — a full ?challenge run from the start gate to the results screen (gates, medal, flakes)
// Usage:
//   node web/scripts/map2-play.mjs frames    <baseUrl> <outDir> [route=main|fast|safe] [t0=560] [secs=14] [equip=ski]
//   node web/scripts/map2-play.mjs challenge <baseUrl> <outDir> [route] [equip]
// e.g. node web/scripts/map2-play.mjs challenge http://localhost:5182 ./shots fast snowboard
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [mode = 'frames', base = 'http://localhost:5182', out = '.', route = 'main', a4, a5, a6] = process.argv.slice(2);
const challenge = mode === 'challenge';
const equip = (challenge ? a4 : a6) || 'ski';
const t0 = Number(challenge ? 0 : a4 ?? 560), secs = Number(a5 ?? 14);
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
await page.goto(`${base}/?map=blackspruce&${challenge ? 'challenge' : 'ride'}&equip=${equip}`);
await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 300000 });
if (!challenge) await page.waitForTimeout(2500);

// The driver: look ~1 s ahead along the route's lane, pick the lateral offset with the most room,
// steer for it (heading + cross-track), tuck when the line ahead is straight.
await page.evaluate(({ route, t0, challenge }) => {
  const s = window.__sendit, C = s.course, w = { x: 0, z: 0 };
  if (!challenge) { const c = C.centre(t0); s.player.place({ x: c.x, z: c.z }, c.heading); }
  const laneFor = (t) => {
    const pick = (k) => C.lanes.find((L) => L.kind === k && t >= L.t0 + 4 && t <= L.t1 - 4);
    return (route === 'fast' && pick('slot')) || (route === 'safe' && pick('safe')) || C.mainLane;
  };
  let off = 0;
  s.player.script = (c, p) => {
    p.dyn._noInputT = -999;
    Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
    const tt = C.tAt(p.position.z), L = laneFor(tt + 12), ta = tt + Math.max(9, p.speed * 1.05);
    const l = C.laneAt(L, ta) || C.laneAt(C.mainLane, ta);
    let best = -1e9, bo = 0;
    for (let o = -(l.hw - 0.6); o <= l.hw - 0.6; o += 0.5) {
      C.world(ta, l.d + o, w);
      let clear = 9;
      for (let k = 1; k <= 8; k++) {
        const f = k / 8, n = s.scatter.nearest({ x: p.position.x + (w.x - p.position.x) * f, z: p.position.z + (w.z - p.position.z) * f }, 3);
        if (n) clear = Math.min(clear, n.dist);
      }
      const sc = Math.min(clear, 2.5) - Math.abs(o - off) * 0.12 - Math.abs(o) * 0.04;
      if (sc > best) { best = sc; bo = o; }
    }
    off = bo; C.world(ta, l.d + off, w);
    const travel = p.heading + (p.travelSign < 0 ? Math.PI : 0), want = Math.atan2(-(w.x - p.position.x), -(w.z - p.position.z));
    const d = Math.atan2(Math.sin(want - travel), Math.cos(want - travel));
    const ln = C.laneAt(L, tt) || C.laneAt(C.mainLane, tt), e = C.dAt(p.position.x, tt) - (ln.d + off);
    if (p.state === 1) c.steer = Math.max(-1, Math.min(1, -d * 6 - Math.max(-0.6, Math.min(0.6, e * 0.25))));
    if (p.state === 1 && Math.abs(d) < 0.06 && Math.abs(c.steer) < 0.2) c.tuck = 1;
  };
}, { route, t0, challenge });

if (challenge) {
  const res = await page.evaluate(() => new Promise((r) => {
    const start = performance.now();
    const id = setInterval(() => {
      const A = window.__sendit.activities;
      if (A.state === 'finished' || performance.now() - start > 400000) { clearInterval(id); r(A.hud()); }
    }, 250);
  }));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, `challenge-${route}-${equip}.png`) });
  console.log(`${equip} ${route}: ${res.state} in ${res.time.toFixed(1)} s (penalty ${res.penalty} s), gates ${res.gates}/${res.gateTotal}, style ${res.score}, flakes ${res.flakes}/${res.flakeTotal}, medal ${res.best?.medal ?? '-'}`);
} else {
  const files = [];
  for (let i = 0; i < secs / 0.4; i++) {
    await page.waitForTimeout(400);
    const f = `f${String(i).padStart(3, '0')}.png`;
    await page.screenshot({ path: path.join(out, f) });
    files.push(f);
  }
  console.log(await page.evaluate(() => { const p = window.__sendit.player; return `ended at t=${window.__sendit.course.tAt(p.position.z).toFixed(0)}, ${p.speed.toFixed(1)} m/s, score ${window.__sendit.game.score}`; }));
  // Contact sheet of all frames.
  const url = (f) => 'file:///' + path.resolve(out, f).split(path.sep).join('/');
  const cells = files.map((f) => `<div style="position:relative"><img style="width:100%;display:block" src="${url(f)}"><span style="position:absolute;left:4px;top:2px;color:#fff;font:14px sans-serif;text-shadow:0 0 3px #000">${f}</span></div>`).join('');
  fs.writeFileSync(path.join(out, '_sheet.html'), `<html><body style="margin:0;background:#000;display:grid;grid-template-columns:repeat(6,1fr);gap:2px">${cells}</body></html>`);
  const sheet = await browser.newPage({ viewport: { width: 1800, height: 900 } });
  await sheet.goto(url('_sheet.html'));
  await sheet.waitForTimeout(800);
  await sheet.screenshot({ path: path.join(out, 'sheet.png'), fullPage: true });
}
if (errs.length) console.log('console errors:', errs.slice(0, 3));
await browser.close();
