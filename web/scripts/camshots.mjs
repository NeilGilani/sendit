// Chase-camera scenario runs: boots the real game in the chase camera, drives scripted jumps / tricks / carves /
// a crash (camscenarios.mjs) on a deterministic 60 Hz clock (requestAnimationFrame is fed virtual time, so the
// camera sees the same frame times as a real 60 fps run however slow the headless renderer is), logs the camera
// every frame and writes one contact sheet per scenario (the frames worth looking at, with the predicted
// landing point ringed in red and the rider's pelvis in cyan).
// Usage: node web/scripts/camshots.mjs <baseUrl> <outDir> [ski|snowboard] [scenario,…|all] [W H]
// macOS: GPU via ANGLE/Metal by default; NOGPU=1 = SwiftShader. Output stays in outDir (keep it out of the repo):
//   <equip>-<scenario>.jpg   contact sheet
//   metrics-<equip>.json     per-scenario summary (also printed)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { SCENARIOS } from './camscenarios.mjs';

const [base = 'http://localhost:5188/', outDir = '/tmp/camshots', equip = 'ski', which = 'all', W = '640', H = '360'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : process.env.GPU ? ['--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'] : null;
const browser = await chromium.launch({
  args: [...(gpu && !process.env.NOGPU ? gpu : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']), '--autoplay-policy=no-user-gesture-required'],
});
const names = which === 'all' ? Object.keys(SCENARIOS) : which.split(',');
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
const summary = {};
const sheets = [];
for (const [query, list] of byMap) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[error]', m.text().slice(0, 300)); } });
  await page.addInitScript(() => {
    try { const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}'); s.view = 'tp'; localStorage.setItem('sendit.settings', JSON.stringify(s)); } catch { /* */ }
    // Virtual 60 Hz clock: every real animation frame is one 1/60 s step for the game.
    const raf = window.requestAnimationFrame.bind(window);
    let vt = 0, lastTs = -1;
    window.__vt = { hook: null };
    window.requestAnimationFrame = (cb) => raf((ts) => {
      if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; Promise.resolve().then(() => window.__vt.hook?.()); }
      cb(vt);
    });
  });
  await page.goto(`${base.replace(/\/?$/, '/')}?${query}&equip=${equip}${process.env.Q ? `&quality=${process.env.Q}` : '&quality=0'}`);
  await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
  await page.click('.lb-ride');
  await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state !== 4, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__cam?.intro >= 1, null, { timeout: 120000 });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const s = window.__sendit, V = s.camera.position.constructor;
    const f = new V(), r = new V(), pv = new V(), lp = new V(), tmp = new V();
    let prevF = null, prevW = 0;
    // Ballistic touchdown point against the real terrain (same march as physics timeToLand).
    const landing = (p) => {
      const T = s.terrain, h = 1 / 30, g = 9.81 * 1;
      let x = p.position.x, y = p.position.y, z = p.position.z, vy = p.velocity.y;
      for (let t = h; t <= 4; t += h) {
        vy -= g * h; x += p.velocity.x * h; y += vy * h; z += p.velocity.z * h;
        const gy = T.getHeight(x, z);
        if (y <= gy) return { t, x, y: gy, z };
      }
      return null;
    };
    window.__camlog = [];
    window.__camInfo = () => {
      const p = s.player, cam = s.camera;
      f.set(0, 0, -1).applyQuaternion(cam.quaternion); r.set(1, 0, 0).applyQuaternion(cam.quaternion);
      const roll = Math.asin(Math.max(-1, Math.min(1, r.y))) * 57.3, pitch = Math.asin(f.y) * 57.3;
      const w = prevF ? prevF.angleTo(f) * 57.3 * 60 : 0;   // deg/s of the view direction (one 60 Hz frame)
      const acc = (w - prevW) * 60; prevW = w; prevF = (prevF || new V()).copy(f);
      const pel = s.rider.bones?.pelvis;
      if (pel) pel.getWorldPosition(pv); else pv.copy(p.renderPos).y += 0.9;
      const pn = pv.clone().project(cam);
      const camYaw = Math.atan2(-f.x, -f.z), velYaw = Math.atan2(-p.velocity.x, -p.velocity.z);
      let yawErr = (camYaw - velYaw) * 57.3; yawErr = ((yawErr + 540) % 360) - 180;
      const o = {
        st: p.state, ph: window.__phase, air: +p.airTime.toFixed(2), spd: +p.speed.toFixed(1),
        roll: +roll.toFixed(1), pitch: +pitch.toFixed(1), w: +w.toFixed(0), acc: +acc.toFixed(0), yawErr: +yawErr.toFixed(1), fov: +cam.fov.toFixed(1),
        rx: +pn.x.toFixed(2), ry: +pn.y.toFixed(2), clear: +(cam.position.y - s.terrain.getHeight(cam.position.x, cam.position.z)).toFixed(2),
        dist: +cam.position.distanceTo(pv).toFixed(2), flip: +((p.flip || 0) * 57.3).toFixed(0), spin: +((p._spinTotal || 0) * 57.3).toFixed(0),
      };
      if (p.state === 2) {
        const L = landing(p);
        if (L) {
          lp.set(L.x, L.y, L.z);
          const ln = tmp.copy(lp).project(cam);
          const front = lp.clone().sub(cam.position).dot(f) > 0;
          Object.assign(o, { tl: +L.t.toFixed(2), lx: +ln.x.toFixed(2), ly: +ln.y.toFixed(2), lvis: front && Math.abs(ln.x) < 0.95 && Math.abs(ln.y) < 0.95 });
        }
      }
      return o;
    };
    window.__vt.hook = () => { if (window.__rec && s.game.mode === 1) window.__camlog.push(window.__camInfo()); };
    window.__shots = [];
    window.__snap = (tag) => { window.__shots.push({ tag, info: window.__camInfo() }); s.game.mode = 2; };
  });
  for (const name of list) {
    const sc = SCENARIOS[name];
    await page.evaluate(() => { const s = window.__sendit; s.game.mode = 1; s.player.script = null; s.player.debugFreeze = false; window.__done = false; window.__shots.length = 0; window.__camlog.length = 0; window.__rec = false; });
    // Respawned / crashed from the previous scenario: wait until riding again.
    await page.waitForFunction(() => window.__sendit.player.state === 1 || window.__sendit.player.state === 2, null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(`(() => { const s = window.__sendit, pl = s.player, snap = window.__snap; ${sc.setup}; window.__cam.snap(); window.__rec = true; })()`);
    const t0 = Date.now();
    const frames = [];
    while (Date.now() - t0 < (sc.timeout ?? 240) * 1000) {
      const q = await page.evaluate(() => window.__shots[0] || (window.__done ? 'done' : null));
      if (q === 'done') break;
      if (!q) { await page.waitForTimeout(30); continue; }
      await page.waitForTimeout(60);
      const buf = await page.screenshot({ type: 'jpeg', quality: 80 });
      frames.push({ tag: q.tag, info: q.info, img: buf.toString('base64') });
      await page.evaluate(() => { window.__shots.shift(); if (!window.__shots.length) window.__sendit.game.mode = 1; });
    }
    const log = await page.evaluate(() => { window.__rec = false; return window.__camlog.slice(); });
    await page.evaluate(() => { const s = window.__sendit; s.player.script = null; s.game.mode = 1; });
    const m = summarize(log);
    summary[name] = m;
    console.log(`${equip} ${name.padEnd(10)} frames ${String(frames.length).padStart(2)}  ${JSON.stringify(m)}`);
    fs.writeFileSync(`${outDir}/log-${equip}-${name}.json`, JSON.stringify(log));
    sheets.push({ name, frames, m });
  }
  await page.close();
}

// Contact sheets: an HTML grid screenshotted in the same browser (no image tools needed).
const sp = await browser.newPage({ viewport: { width: 1920, height: 400 } });
for (const { name, frames, m } of sheets) {
  if (!frames.length) continue;
  const cell = (fr) => {
    const i = fr.info, mk = (x, y, c) => (x == null ? '' : `<div style="position:absolute;left:${(x + 1) * 50}%;top:${(1 - y) * 50}%;width:14px;height:14px;margin:-9px;border:2px solid ${c};border-radius:50%"></div>`);
    return `<div class="c"><div class="im"><img src="data:image/jpeg;base64,${fr.img}">${mk(i.lx, i.ly, '#f33')}${mk(i.rx, i.ry, '#0ff')}</div>
      <div class="t"><b>${fr.tag}</b> roll ${i.roll}° pitch ${i.pitch}° fov ${i.fov} ${i.tl != null ? `tl ${i.tl}s` : ''} flip ${i.flip} spin ${i.spin} w ${i.w}°/s</div></div>`;
  };
  await sp.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:12px monospace">
    <style>.g{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px}.im{position:relative;overflow:hidden}.im img{width:100%;display:block}.t{padding:2px 3px}</style>
    <div style="padding:6px 8px;font-size:15px"><b>${equip} ${name}</b> &nbsp; ${JSON.stringify(m).replace(/"/g, '')}</div>
    <div class="g">${frames.map(cell).join('')}</div></body></html>`);
  const h = await sp.evaluate(() => document.body.scrollHeight);
  await sp.setViewportSize({ width: 1920, height: h });
  await sp.screenshot({ path: `${outDir}/${equip}-${name}.jpg`, type: 'jpeg', quality: 78 });
}
await sp.close();
fs.writeFileSync(`${outDir}/metrics-${equip}.json`, JSON.stringify(summary, null, 1));
console.log('errors:', errors);
await browser.close();

/** Per-scenario numbers: horizon roll, view turn rate / snaps, rider and landing framing, yaw lag, terrain clearance. */
function summarize(log) {
  log = log.slice(20);   // the first frames settle the camera after the teleport (cam.snap)
  const air = log.filter((o) => o.st === 2), gnd = log.filter((o) => o.st === 1);
  const max = (a, k) => a.reduce((m, o) => Math.max(m, Math.abs(o[k] ?? 0)), 0);
  const out = (o) => Math.abs(o.rx) > 0.85 || Math.abs(o.ry) > 0.85;
  const m = { n: log.length, airN: air.length };
  m.rollMax = +max(log, 'roll').toFixed(1);
  m.rollAir = +max(air, 'roll').toFixed(1);
  m.wMax = max(log, 'w');               // fastest view turn (deg/s)
  m.accMax = max(log, 'acc');           // sharpest change of turn rate (deg/s²): snaps
  m.wAir = max(air, 'w');
  m.riderOut = +(log.filter(out).length / Math.max(1, log.length)).toFixed(2);
  m.riderY = air.length ? [+Math.min(...air.map((o) => o.ry)).toFixed(2), +Math.max(...air.map((o) => o.ry)).toFixed(2)] : null;
  const late = air.filter((o) => o.tl != null && o.tl <= 0.6);
  m.landVis06 = late.length ? +(late.filter((o) => o.lvis).length / late.length).toFixed(2) : null;
  const at = (t) => { const o = air.filter((o) => o.tl != null).reduce((b, o) => (b && Math.abs(b.tl - t) < Math.abs(o.tl - t) ? b : o), null); return o ? [o.lx, o.ly] : null; };
  m.land06 = at(0.6); m.land03 = at(0.3);
  // Rider sitting on the landing point (occluding it) in the last 0.4 s: screen distance pelvis → landing.
  const occ = air.filter((o) => o.tl != null && o.tl <= 0.4 && o.lvis).map((o) => Math.hypot(o.lx - o.rx, (o.ly - o.ry) * 0.56));
  m.occMin = occ.length ? +Math.min(...occ).toFixed(2) : null;
  m.yawErrMax = +max(gnd, 'yawErr').toFixed(1);
  m.yawErrMean = gnd.length ? +(gnd.reduce((a, o) => a + Math.abs(o.yawErr), 0) / gnd.length).toFixed(1) : null;
  m.clearMin = log.length ? +Math.min(...log.map((o) => o.clear)).toFixed(2) : null;
  return m;
}
