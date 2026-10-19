// Dev helper: the rider's outfit in the real game (docs/character.md). For each look it dresses the game's
// rider, drives scripted moments (carve, tuck, air grab, crouched landing), freezes the physics and
// photographs them with the inspect camera, then a first-person (helmet cam) frame of the sleeves and
// mitts; one contact sheet per look: <outDir>/ingame-<look>.png.
//   node web/scripts/outfit-ingame.mjs <url> <outDir> '@looks.txt' [ski|snowboard]
// Looks use the same syntax as outfit-turntable.mjs. Env: Q (quality, default 1), W/H frame (480×480).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const [base = 'http://localhost:5203/', outDir = 'ingame', looksArg = 'default=', equip = 'ski'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const looksSrc = looksArg.startsWith('@') ? fs.readFileSync(looksArg.slice(1), 'utf8').replace(/\s+/g, '') : looksArg;
const looks = looksSrc.split(';').filter(Boolean).map((s) => {
  const [label, spec = ''] = s.split('=');
  const slots = {};
  for (const part of spec.split(',').filter(Boolean)) {
    const [slot, rest = ''] = part.split(':');
    const [garment, colorway] = rest.split('@');
    slots[slot] = { ...(garment ? { garment } : {}), ...(colorway ? { colorway } : {}) };
  }
  return { label, slots };
});
const W = Number(process.env.W || 480), H = Number(process.env.H || 480);
const args = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base.replace(/\/?$/, '/')}?map=valcrest-gully&ride&equip=${equip}&quality=${process.env.Q ?? 1}`);
await page.waitForFunction(() => window.__sendit?.player?.state === 1 && window.__cam, null, { timeout: 400000 });
await page.evaluate(() => {
  const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { display: none !important; }'; document.head.appendChild(st);
  const fx = window.__sendit.fx;
  for (const m of [fx?.mesh, fx?.spray?.mesh]) if (m) { m.visible = false; Object.defineProperty(m, 'visible', { get: () => false, set: () => {} }); }
  const S = window.__sendit, pl = S.player;
  window.__simT = 0;
  if (!pl.__wrapped) { pl.__wrapped = pl.step.bind(pl); pl.step = (dt) => { if (!pl.debugFreeze) window.__simT += dt; return pl.__wrapped(dt); }; }
});
await page.waitForTimeout(1500);

const SCEN = {
  carve: { setup: `go(14); pl.script = (c) => { c.steer = T > 0.5 ? 1 : 0; };`, until: `T > 1.4`, views: [0, 90] },
  tuck: { setup: `go(15); pl.script = (c) => { c.tuck = 1; };`, until: `T > 1.2`, views: [90, 200] },
  grab: { setup: `kick(14); pl.script = (c, p) => { if (p.state === 1) c.jump = aheadOfLip(p); else c.tuck = 1; };`, until: `pl.state === 2 && pl.airTime > 0.55`, views: [90, 0, 200] },
  fp: { setup: `go(13); pl.script = (c) => { c.steer = T > 0.6 ? -0.6 : 0; };`, until: `T > 1.3`, views: ['fp'] },
};
const frames = [];
for (const look of looks) {
  await page.evaluate((slots) => window.__sendit.rider.setOutfit(slots), look.slots);
  for (const [name, sc] of Object.entries(SCEN)) {
    await page.evaluate(({ setup }) => {
      const S = window.__sendit, pl = S.player;
      window.__simT = 0; pl.debugFreeze = false;
      const K = S.features.kickers?.[2];
      const at = (d) => S.features.at(d);
      window.go = (v, d = 160) => { const { p, dir } = at(d); pl.place({ x: p.x, z: p.y }, Math.atan2(-dir.x, -dir.y)); pl.velocity.copy(pl.forward()).multiplyScalar(v); };
      window.kick = (v) => { pl.place({ x: K.o.x - K.f.x * 25, z: K.o.y - K.f.y * 25 }, Math.atan2(-K.f.x, -K.f.y)); pl.velocity.copy(pl.forward()).multiplyScalar(v); };
      window.aheadOfLip = (p) => { const dx = p.position.x - K.o.x, dz = p.position.z - K.o.y, a = dx * K.f.x + dz * K.f.y; return a > -10 && a + 0.3 < K.L; };
      if (!Object.getOwnPropertyDescriptor(window, 'T')) Object.defineProperty(window, 'T', { configurable: true, get: () => window.__simT });
      // eslint-disable-next-line no-new-func
      new Function('S', 'pl', 'K', 'at', setup)(S, pl, K, at);
    }, sc);
    if (sc.views[0] === 'fp') await page.keyboard.press('KeyC');
    await page.waitForFunction((u) => { const S = window.__sendit, pl = S.player, T = window.__simT; try { return new Function('S', 'pl', 'T', `return (${u});`)(S, pl, T); } catch { return false; } }, sc.until, { timeout: 120000, polling: 50 }).catch(() => {});
    await page.evaluate(() => { window.__sendit.player.debugFreeze = true; });
    for (const yaw of sc.views) {
      if (yaw !== 'fp') await page.evaluate((y) => { window.__cam.inspect = { yaw: y, dist: 3.6, height: 0.15, fov: 38 }; }, yaw);
      await page.waitForTimeout(900);
      const buf = await page.screenshot();
      frames.push({ look: look.label, name, view: yaw, b64: buf.toString('base64') });
    }
    if (sc.views[0] === 'fp') await page.keyboard.press('KeyC');
    await page.evaluate(() => { window.__cam.inspect = null; const pl = window.__sendit.player; pl.script = null; pl.debugFreeze = false; });
  }
}
const sheet = await browser.newPage({ viewport: { width: 400, height: 300 } });
for (const look of looks) {
  const fr = frames.filter((f) => f.look === look.label);
  const cols = 5, sz = Math.round(W * 0.6);
  await sheet.setContent(`<html><body style="margin:0;background:#16181c;font:13px system-ui;color:#ddd">
    <div style="padding:6px 10px;font-weight:600">${look.label} (${equip}) — ${JSON.stringify(look.slots).replace(/"/g, '')}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols}, ${sz}px);gap:4px;padding:4px">
    ${fr.map((f) => `<div style="position:relative"><img style="width:${sz}px;display:block" src="data:image/png;base64,${f.b64}"><span style="position:absolute;left:4px;top:2px;text-shadow:0 0 3px #000">${f.name} · ${f.view}</span></div>`).join('')}
    </div></body></html>`);
  await sheet.setViewportSize({ width: (sz + 4) * cols + 12, height: 300 });
  await sheet.screenshot({ path: path.join(outDir, `ingame-${look.label}-${equip}.png`), fullPage: true });
}
console.log(JSON.stringify({ frames: frames.length, errors: errors.slice(0, 5) }));
await browser.close();
