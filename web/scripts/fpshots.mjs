// First-person (helmet cam) scenario runs: boots the real game in first person, drives scripted
// scenarios (standing, gliding, carving, stops, tuck, pops, airs, grabs, spins, flips, corks, landings,
// switch, powder, crash, grinds, view switching) and captures screenshot sequences at exact frames
// (the game pauses while each shot is taken, so a mid-flip frame is the frame you asked for).
// Usage: GPU=1 node web/scripts/fpshots.mjs <baseUrl> <outDir> [ski|snowboard] [scenario,…|all] [W H]
// Shots go to outDir (keep them out of the repo). A per-shot log (flip / spin angles, camera pitch,
// roll, pole and hand positions in view) goes to <outDir>/fplog.json.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { SCENARIOS } from './fpscenarios.mjs';

const [base = 'http://localhost:5191/', outDir = 'fpshots', equip = 'ski', which = 'all', W = '960', H = '540'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const names = which === 'all' ? Object.keys(SCENARIOS) : which.split(',');
const log = [];
const byMap = new Map();
for (const n of names) {
  const sc = SCENARIOS[n];
  if (!sc) { console.log('unknown scenario', n); continue; }
  if (sc.equip && sc.equip !== equip) continue;
  const q = sc.query || 'kicker=2';
  if (!byMap.has(q)) byMap.set(q, []);
  byMap.get(q).push(n);
}
let errors = 0;
for (const [query, list] of byMap) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[error]', m.text().slice(0, 300)); } });
  await page.addInitScript(() => {
    try { const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}'); s.view = 'fp'; localStorage.setItem('sendit.settings', JSON.stringify(s)); } catch { /* */ }
  });
  await page.goto(`${base.replace(/\/?$/, '/')}?${query}&equip=${equip}${process.env.Q ? `&quality=${process.env.Q}` : ''}`);
  await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
  await page.click('.lb-ride');
  await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state !== 4, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__cam?.intro >= 1, null, { timeout: 60000 });   // the camera intro sweep
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const s = window.__sendit;
    // Shot protocol: snap(tag) pauses the game at this exact frame and queues a screenshot.
    window.__fpq = [];
    window.__fpInfo = () => {
      const p = s.player, cam = s.camera, r = s.rider;
      const e = new s.camera.rotation.constructor().setFromQuaternion(cam.quaternion, 'YXZ');
      const v = (o) => { const w = o.getWorldPosition(cam.position.clone()); const n = w.clone().project(cam); return [+n.x.toFixed(2), +n.y.toFixed(2), +(w.distanceTo(cam.position)).toFixed(2)]; };
      return {
        state: p.state, speed: +p.speed.toFixed(1), air: +p.airTime.toFixed(2), flip: +((p.flip || 0) * 57.3).toFixed(0), spin: +((p._spinTotal || 0) * 57.3).toFixed(0),
        camPitch: +(e.x * 57.3).toFixed(0), camYaw: +(e.y * 57.3).toFixed(0), camRoll: +(e.z * 57.3).toFixed(0), fov: +cam.fov.toFixed(0),
        handL: r.bones && v(r.bones.hand_l), handR: r.bones && v(r.bones.hand_r), grab: p.grabName, result: p.lastLanding?.result, trick: p.lastLanding?.trick,
      };
    };
    window.__snap = (tag) => { window.__fpq.push({ tag, info: window.__fpInfo() }); s.game.mode = 2; };
  });
  for (const name of list) {
    const sc = SCENARIOS[name];
    await page.evaluate(() => { const s = window.__sendit; s.game.mode = 1; s.player.script = null; s.player.debugFreeze = false; window.__done = false; if (window.__cam) window.__cam.fpLook = null; window.__fpq.length = 0; });
    await page.evaluate(`(() => { const s = window.__sendit, pl = s.player, snap = window.__snap; ${sc.setup} })()`);
    const t0 = Date.now();
    let shots = 0;
    while (Date.now() - t0 < (sc.timeout ?? 150) * 1000) {
      const q = await page.evaluate(() => window.__fpq[0] || (window.__done ? 'done' : null));
      if (q === 'done') break;
      if (!q) { await page.waitForTimeout(40); continue; }
      await page.waitForTimeout(80);
      const f = `${outDir}/${equip}-${name}-${String(++shots).padStart(2, '0')}-${q.tag}.png`;
      await page.screenshot({ path: f });
      log.push({ equip, name, tag: q.tag, ...q.info });
      console.log(f.split('/').pop(), JSON.stringify(q.info));
      await page.evaluate(() => { window.__fpq.shift(); if (!window.__fpq.length) window.__sendit.game.mode = 1; });
    }
    if (!shots) console.log(name, 'no shots (timeout)');
  }
  await page.close();
}
fs.writeFileSync(`${outDir}/fplog-${equip}.json`, JSON.stringify(log, null, 1));
console.log('errors:', errors);
await browser.close();
