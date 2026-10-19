// Crash ragdoll frame sequences in the real game (docs/body.md § Crash ragdoll → Visual check). Boots a map,
// drives a scripted crash on a deterministic 60 Hz clock (requestAnimationFrame gets virtual time), photographs
// it every few frames in the chase camera or the helmet cam, and writes one contact sheet per scenario. The
// "replay" scenario crashes, waits for the respawn and photographs the wipeout replay.
//
//   node web/scripts/ragdoll-shots.mjs <baseUrl> <outDir> [ski|snowboard] [scenario,…|all] [tp|fp]
//
// Scenarios: overflip (Valcrest kicker 2, backflip held round past the landing), sideways (Valcrest, touch down
// 80° across the line), cliff (Ravenspire First Stack rolled off, flipping), steep (Ravenspire, a fall on a 35–45°
// face at speed), tree (Blackspruce, straight into a trunk), kicker (Voltage Park 'Voltage', over-rotated),
// rail (Voltage Park, slammed down onto a rail), replay (Valcrest over-flip → wipeout replay).
// macOS: ANGLE / Metal. Output stays in outDir (keep it out of the repo). Prints a metrics line per scenario:
// ragdoll ms per frame step, body in frame, camera clearance, the rig's per-frame pelvis jump.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [base = 'http://localhost:5196/', outDir = '/tmp/ragdoll-shots', equip = 'ski', which = 'all', view = 'tp', W = '640', H = '360'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });

const VAL = 'const k = s.features.kickers[2], ox = k.o.x, oz = k.o.y, fx = k.f.x, fz = k.f.y, L = k.L;';
const VOLT = `const f = s.course.features.find((f) => f.name === 'Voltage'), la = f.jump.lipA;
  const [x0, z0] = f.world(la - 12), [x1, z1] = f.world(la), ll = Math.hypot(x1 - x0, z1 - z0);
  const ox = x0, oz = z0, fx = (x1 - x0) / ll, fz = (z1 - z0) / ll, L = ll;`;
const RAVEN = 'const ox = -1260 + 960, oz = 40, fx = 1, fz = 0, L = 30;';

// A take-off along (fx, fz), the lip L m past (ox, oz), run-in held at v. air(c, p, tl) steers the air.
const jump = (where, v, air, { pop = true, back = 25 } = {}) => `
  ${where}
  pl.place({ x: ox - fx * ${back}, z: oz - fz * ${back} }, Math.atan2(-fx, -fz));
  pl.velocity.copy(pl.forward()).multiplyScalar(${v});
  let wasAir = false, done1 = false;
  pl.script = (c, p) => {
    tick(p);
    if (p.state === 1 && !wasAir) {
      const dx = p.position.x - ox, dz = p.position.z - oz, a = dx * fx + dz * fz;
      const aNext = a + (p.velocity.x * fx + p.velocity.z * fz) * (1 / 60) * 1.5;
      if (a < L - 1.5) { const sp = Math.hypot(p.velocity.x, p.velocity.z); if (sp > 1) { p.velocity.x *= ${v} / sp; p.velocity.z *= ${v} / sp; } }
      if (${pop}) c.jump = a > -10 && aNext < L;
      if (a > L - 4 && !done1) { done1 = true; snap('in'); }
    } else if (p.state === 2) {
      wasAir = true;
      const tl = p.dyn.timeToLand ? p.dyn.timeToLand() : 1;
      ${air}
    }
  };`;

// Shared page-side ticker: snapshots before the crash, then every `every` frames for `after` s after it.
const TICK = (every = 6, after = 2.4) => `
  let fr = 0, crashF = -1;
  const tick = (p) => {
    fr++;
    if (p.state === 3 && crashF < 0) { crashF = fr; window.__crashAt = performance.now(); }
    if (crashF >= 0) {
      const k = fr - crashF;
      if (k % ${every} === 0 && k <= ${after} * 60) snap('+' + (k / 60).toFixed(2) + 's');
      if (k > ${after} * 60) window.__done = true;
    } else if (fr % 30 === 0) snap('t' + (fr / 60).toFixed(1));
    if (fr > 60 * 20) window.__done = true;
  };`;

const SC = {
  overflip: { q: 'map=valcrest-gully&kicker=2', setup: TICK() + jump(VAL, 13, 'c.brake = 1;') },
  sideways: { q: 'map=valcrest-gully&kicker=2', setup: TICK() + jump(VAL, 13, 'if (tl < 0.12 && !p._sw) { p._sw = 1; p.heading += 1.4; p.orient.multiply(new p.orient.constructor().setFromAxisAngle({ x: 0, y: 1, z: 0 }, 1.4)); }') },
  cliff: { q: 'map=ravenspire', setup: TICK(6, 2.8) + jump(RAVEN, 18, 'c.brake = 1;', { pop: false, back: 30 }) },
  steep: {
    q: 'map=ravenspire',
    setup: TICK(6, 3.0) + `
    // A clear 35–45° stretch of face near the First Stack, heading straight down it.
    const T = s.terrain, n = new s.camera.position.constructor();
    let best = null;
    for (let i = 0; i < 4000 && !best; i++) {
      const x = -1260 + 900 + (i % 80) * 4 - 160, z = 40 + Math.floor(i / 80) * 4 - 100;
      T.getNormal(x, z, 3, n);
      const deg = Math.acos(n.y) * 57.3;
      if (deg > 35 && deg < 45 && !s.scatter.obstaclesNear({ x, z }, 14).length) {
        const dx = n.x / Math.hypot(n.x, n.z), dz = n.z / Math.hypot(n.x, n.z);
        let ok = true;
        for (let d = 0; d < 30; d += 3) { T.getNormal(x + dx * d, z + dz * d, 3, n); if (Math.acos(n.y) * 57.3 < 28) ok = false; }
        if (ok) best = { x, z, yaw: Math.atan2(-dx, -dz) };
      }
    }
    if (!best) { window.__done = true; } else {
      pl.place({ x: best.x, z: best.z }, best.yaw);
      pl.velocity.copy(pl.forward()).multiplyScalar(14);
      pl.script = (c, p) => { tick(p); if (fr === 30 && p.state !== 3) { p.lastCrash = { reason: 'compression' }; p.crash('compression'); } };
    }`,
  },
  tree: {
    q: 'map=blackspruce',
    setup: TICK(5, 2.4) + `
    const T = s.terrain, sp = T.getSpawn().position, n = new s.camera.position.constructor();
    let pick = null;
    for (let r = 20; r < 400 && !pick; r += 20) {
      for (const o of s.scatter.obstaclesNear(sp, r)) {
        if (o[3] !== 'tree' || o[2] > 0.7) continue;
        T.getNormal(o[0], o[1], 3, n);
        const deg = Math.acos(n.y) * 57.3;
        if (deg < 8 || deg > 26) continue;
        const hx = Math.hypot(n.x, n.z), dx = n.x / hx, dz = n.z / hx;
        const sx = o[0] - dx * 16, sz = o[1] - dz * 16;
        let clear = true;
        for (let d = 0; d < 15.5 - o[2]; d += 0.5) { const q = s.scatter.findObstacle({ x: sx + dx * d, z: sz + dz * d }, 0.6); if (q && q !== o) clear = false; }
        if (clear) { pick = { o, sx, sz, yaw: Math.atan2(-dx, -dz) }; break; }
      }
    }
    if (!pick) window.__done = true; else {
      pl.place({ x: pick.sx, z: pick.sz }, pick.yaw);
      pl.velocity.copy(pl.forward()).multiplyScalar(12);
      pl.script = (c, p) => {
        tick(p);
        if (p.state === 1) { const sp2 = Math.hypot(p.velocity.x, p.velocity.z), want = 12.5; p.heading = pick.yaw; if (sp2 > 1) { p.velocity.x = -Math.sin(pick.yaw) * want; p.velocity.z = -Math.cos(pick.yaw) * want; } }
      };
    }`,
  },
  kicker: { q: 'map=voltage-park', setup: TICK(6, 2.6) + jump(VOLT, 20.5, 'c.brake = 1;', { back: 30 }) },
  rail: {
    q: 'map=voltage-park',
    setup: TICK(5, 2.4) + `
    const rails = s.course.rails || [];
    const rl = rails.find((r) => r.kind === 'rail' && r.pts.length >= 2) || rails[0];
    if (!rl) window.__done = true; else {
      const a = rl.pts[0], b = rl.pts[rl.pts.length - 1];
      const mx = (a[0] + b[0]) / 2, mz = (a[2] + b[2]) / 2, my = (a[1] + b[1]) / 2;
      const ux = b[0] - a[0], uz = b[2] - a[2], ul = Math.hypot(ux, uz);
      pl.place({ x: mx - ux / ul * 2, z: mz - uz / ul * 2 }, Math.atan2(-ux / ul, -uz / ul));
      pl.state = 2; pl.position.y = my + 2.6; pl.velocity.set(ux / ul * 5, -11.5, uz / ul * 5); pl.snapRender();
      pl.script = (c, p) => { tick(p); };
    }`,
  },
  replay: {
    q: 'map=valcrest-gully&kicker=2', replay: true,
    setup: `
    let fr = 0, crashF = -1;
    const tick = (p) => { fr++; if (p.state === 3 && crashF < 0) crashF = fr; if (crashF >= 0 && fr - crashF > 60 * 6) window.__done = true; if (fr > 60 * 20) window.__done = true; };
    ` + jump(VAL, 13, 'c.brake = 1;'),
  },
};

const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: [...gpu, '--autoplay-policy=no-user-gesture-required'] });
const names = which === 'all' ? Object.keys(SC) : which.split(',');
let errors = 0;
const sheets = [];
for (const name of names) {
  const sc = SC[name];
  if (!sc) { console.log('unknown scenario', name); continue; }
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
  page.on('console', (m) => { if (m.type() === 'error' || /ragdoll/.test(m.text())) console.log(`[${m.type()}]`, m.text().slice(0, 300)); });
  await page.addInitScript((v) => {
    try { const s = JSON.parse(localStorage.getItem('sendit.settings') || '{}'); s.view = v; localStorage.setItem('sendit.settings', JSON.stringify(s)); } catch { /* */ }
    const raf = window.requestAnimationFrame.bind(window);
    let vt = 0, lastTs = -1;
    window.__vt = { hook: null };
    window.requestAnimationFrame = (cb) => raf((ts) => { if (ts !== lastTs) { lastTs = ts; vt += 1000 / 60; Promise.resolve().then(() => window.__vt.hook?.()); } cb(vt); });
  }, view);
  await page.goto(`${base.replace(/\/?$/, '/')}?${sc.q}&equip=${equip}&quality=${process.env.Q ?? 1}`);
  await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
  await page.click('.lb-ride');
  await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state !== 4, null, { timeout: 120000 });
  await page.waitForFunction(() => window.__cam?.intro >= 1, null, { timeout: 120000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const s = window.__sendit, V = s.camera.position.constructor;
    const st = document.createElement('style'); st.textContent = 'body *:not(canvas) { visibility: hidden !important; } canvas { visibility: visible !important; }'; document.head.appendChild(st);
    window.__shots = []; window.__log = [];
    const pv = new V(), prev = new V(), dprev = new V(), d = new V();
    let has = 0;
    window.__info = () => {
      const p = s.player, cam = s.camera, b = s.rider.bones.pelvis;
      b.getWorldPosition(pv);
      const pn = pv.clone().project(cam);
      // Δv of the drawn pelvis between frames (m/s): a pop shows as a spike (respawn teleports > 5 m skipped).
      d.subVectors(pv, prev);
      const jump = has >= 2 && d.length() < 5 && dprev.length() < 5 ? d.clone().sub(dprev).length() * 60 : 0;
      dprev.copy(d); prev.copy(pv); has++;
      return { st: p.state, spd: +p.speed.toFixed(1), rx: +pn.x.toFixed(2), ry: +pn.y.toFixed(2), clear: +(cam.position.y - s.terrain.getHeight(cam.position.x, cam.position.z)).toFixed(2),
        dist: +cam.position.distanceTo(pv).toFixed(2), jump: +jump.toFixed(3), ms: +(s.ragdoll?.stats.lastMs || 0).toFixed(3), active: !!s.ragdoll?.active, sleep: !!s.ragdoll?.H?.world.asleep(0) };
    };
    window.__vt.hook = () => { if (window.__rec && s.game.mode === 1) window.__log.push(window.__info()); };
    // Ghost marks: every track stamp is checked against what really touches the snow there — a crash stamp needs a
    // ragdoll sample within 5 cm of the snow within 0.5 m of it, a riding stamp a grounded player on the snow; no
    // stamp on a raised mesh (kicker, roof, deck: getHeight above baseHeight).
    window.__ghost = { stamps: 0, crash: 0, bad: 0, worst: 0, at: [] };
    const sp = new V();
    s.fx.track.onStamp = (key, p) => {
      const g = window.__ghost, T = s.terrain;
      g.stamps++;
      let gap = 0;
      if (key.startsWith('rd:')) {
        g.crash++;
        const W = s.ragdoll?.H?.world;
        gap = Infinity;
        if (W) for (const b of W.bodies) for (const smp of b.samples) {
          b.point(smp.p, sp);
          if (Math.hypot(sp.x - p.x, sp.z - p.z) > 0.5) continue;
          gap = Math.min(gap, sp.y - smp.r - T.getHeight(sp.x, sp.z));
        }
      } else {
        const pl = s.player;
        gap = pl.state !== 1 ? Infinity : Math.abs(pl.position.y - T.getHeight(pl.position.x, pl.position.z));
      }
      if (T.getHeight(p.x, p.z) - T.baseHeight(p.x, p.z) > 0.02) gap = Math.max(gap, 9);
      if (gap > 0.05) { g.bad++; g.worst = Math.max(g.worst, Math.min(gap, 99)); if (g.at.length < 5) g.at.push(key + '@' + gap.toFixed(2)); }
    };
    window.__snap = (tag) => {
      window.__shots.push({ tag, info: window.__info() }); s.game.mode = 2;
      // CLOSE=1: a close side view of the body (the inspect camera) for the crash frames.
      if (window.__close && s.player.state === 3) {
        // (a side with no trunk between the camera and the body)
        const p = s.player, travel = p.heading;
        const yaw = [window.__close, -window.__close, 0, 180, 45, -45, 135, -135].find((y) => {
          for (let d = 1; d <= 3.6; d += 0.5) { const a = travel + y * Math.PI / 180; if (s.scatter.findObstacle({ x: p.renderPos.x + Math.sin(a) * d, z: p.renderPos.z + Math.cos(a) * d }, 0.8)) return false; }
          return true;
        }) ?? window.__close;
        window.__cam.inspect = { yaw, dist: 3.6, height: 0.5, fov: 48 };
      }
    };
  });
  await page.evaluate((c) => { window.__close = c; }, Number(process.env.CLOSE || 0));
  await page.evaluate(`(() => { const s = window.__sendit, pl = s.player, snap = window.__snap; window.__done = false; ${sc.setup}; window.__cam.snap(); window.__rec = true; })()`);
  const frames = [];
  const t0 = Date.now();
  while (Date.now() - t0 < 240000) {
    const q = await page.evaluate(() => window.__shots[0] || (window.__done ? 'done' : null));
    if (q === 'done') break;
    if (!q) { await page.waitForTimeout(25); continue; }
    await page.waitForTimeout(50);
    frames.push({ tag: q.tag, info: q.info, img: (await page.screenshot({ type: 'jpeg', quality: 78 })).toString('base64') });
    await page.evaluate(() => { window.__shots.shift(); window.__cam.inspect = null; if (!window.__shots.length) window.__sendit.game.mode = 1; });
  }
  const log = await page.evaluate(() => { window.__rec = false; return window.__log.slice(); });
  if (sc.replay) {
    // The wipeout replay: wait for the respawn, then play it and photograph it as it runs.
    await page.waitForFunction(() => window.__sendit.player.state === 1 && !window.__sendit.player._busy, null, { timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(300);
    const ok = await page.evaluate(() => window.__thrill.replay.start());
    console.log('replay started:', ok, JSON.stringify(await page.evaluate(() => window.__thrill.replay.debug().moment)));
    let n = 0;
    while (n < 40 && await page.evaluate(() => window.__thrill.replay.active)) {
      frames.push({ tag: `replay ${n}`, info: await page.evaluate(() => window.__info()), img: (await page.screenshot({ type: 'jpeg', quality: 78 })).toString('base64') });
      n++;
      await page.waitForTimeout(120);
    }
  }
  const act = log.filter((o) => o.active);
  const m = {
    frames: frames.length, crashFrames: act.length,
    msMax: +Math.max(0, ...act.map((o) => o.ms)).toFixed(3), msAvg: act.length ? +(act.reduce((a, o) => a + o.ms, 0) / act.length).toFixed(3) : 0,
    outOfFrame: act.filter((o) => Math.abs(o.rx) > 0.95 || Math.abs(o.ry) > 0.95).length,
    camClearMin: act.length ? Math.min(...act.map((o) => o.clear)) : null, camDistMin: act.length ? Math.min(...act.map((o) => o.dist)) : null,
    pelvisDvMax: +Math.max(0, ...log.slice(3).map((o) => o.jump)).toFixed(1),   // m/s per frame
    dvAt: (() => { let bi = -1, bv = 0; log.forEach((o, i) => { if (i > 2 && o.jump > bv) { bv = o.jump; bi = i; } }); const c0 = log.findIndex((o) => o.active); return bi < 0 ? null : bi - c0; })(),   // frames after the crash
    dvStart: (() => { const c0 = log.findIndex((o) => o.active); return c0 < 0 ? null : +Math.max(...log.slice(c0, c0 + 3).map((o) => o.jump)).toFixed(1); })(),
    asleepAt: (() => { const i = act.findIndex((o) => o.sleep); return i < 0 ? null : +(i / 60).toFixed(2); })(),
  };
  m.seed = await page.evaluate(() => window.__sendit.ragdoll?.stats.seed);
  // Flappiness (limb spin relative to the trunk), the slide (centre of mass travel) and the fade of this crash.
  m.flap = await page.evaluate(() => { const q = window.__sendit.ragdoll?.m; return q ? { peak: +q.peak.toFixed(1), mean: +q.mean.toFixed(2), swings: q.swings, dist: +q.dist.toFixed(1), fadeAt: q.fadeAt ?? null } : null; });
  m.ghost = await page.evaluate(() => window.__ghost);
  console.log(`${equip} ${view} ${name.padEnd(9)} ${JSON.stringify(m)}`);
  sheets.push({ name, frames, m });
  await page.close();
}
const sp = await browser.newPage({ viewport: { width: 1920, height: 400 } });
for (const { name, frames, m } of sheets) {
  if (!frames.length) continue;
  const cell = (fr) => `<div class="c"><img src="data:image/jpeg;base64,${fr.img}"><div class="t"><b>${fr.tag}</b> st ${fr.info.st} v ${fr.info.spd} ${fr.info.sleep ? 'asleep' : ''}</div></div>`;
  await sp.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:12px monospace">
    <style>.g{display:grid;grid-template-columns:repeat(6,1fr);gap:4px;padding:4px}.c img{width:100%;display:block}.t{padding:2px 3px}</style>
    <div style="padding:6px 8px;font-size:15px"><b>${equip} ${view} ${name}</b> &nbsp; ${JSON.stringify(m).replace(/"/g, '')}</div>
    <div class="g">${frames.map(cell).join('')}</div></body></html>`);
  const h = await sp.evaluate(() => document.body.scrollHeight);
  await sp.setViewportSize({ width: 1920, height: h });
  await sp.screenshot({ path: `${outDir}/${equip}-${view}${process.env.CLOSE ? "-close" : ""}-${name}.jpg`, type: "jpeg", quality: 76 });
}
await sp.close();
console.log('errors:', errors);
await browser.close();
