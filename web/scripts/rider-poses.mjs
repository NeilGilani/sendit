// Dev helper: a pose sheet of the rider in the real game. Drives scripted situations (standing, cruising,
// carving, tuck, snowplough, hockey stop, pop, air, landing, crash), freezes the physics
// at a chosen moment and photographs the rider from the side / front / behind with the inspect camera.
// Usage: [GPU=1] node web/scripts/rider-poses.mjs <baseUrl> <outDir> [ski|snowboard] [scenario,…]
// Screenshots go to outDir (keep them out of the repo). Prints one JSON line per shot.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5173/', outDir = '.', equip = 'ski', only = ''] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const W = Number(process.env.W || 560), H = Number(process.env.H || 560);
const page = await browser.newPage({ viewport: { width: W, height: H } });
const errors = [];
page.on('pageerror', (e) => { errors.push(e.message); console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.log('[error]', m.text().slice(0, 300)); } });
await page.goto(`${base.replace(/\/?$/, '/')}?map=valcrest-gully&ride&equip=${equip}&quality=${process.env.Q ?? 0}`);
await page.waitForFunction(() => window.__sendit?.player?.state === 1 && window.__cam, null, { timeout: 400000 });
// No HUD, no snow spray in the way (the scripted teleports would otherwise kick up mist around the rider).
await page.evaluate(() => {
  const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { display: none !important; }'; document.head.appendChild(st);
  const fx = window.__sendit.fx;
  for (const m of [fx?.mesh, fx?.spray?.mesh]) if (m) { m.visible = false; Object.defineProperty(m, 'visible', { get: () => false, set: () => {} }); }
});
await page.waitForTimeout(1500);

// Each scenario: setup (in page) → wait until `until` holds → freeze → shots from `views`.
// Helpers available in the page: S (window.__sendit), pl (player), K (kicker 2), at(d) course point.
const SCEN = {
  stand: { setup: `go(0.5, S.course.finishAt + 12); pl.script = (c) => { c.brake = 1; };`, until: `T > 3`, views: [90, 0, 200] },
  cruise: { setup: `go(13); pl.script = () => {};`, until: `T > 1.2`, views: [90, 0] },
  carve: { setup: `go(14); pl.script = (c) => { c.steer = T > 0.5 ? 1 : 0; };`, until: `T > 1.4`, views: [0, 90, 200] },
  carveHard: { setup: `go(17); pl.script = (c) => { c.steer = T > 0.4 ? -1 : 0; c.tuck = 0; };`, until: `T > 1.5`, views: [0, 270] },
  edgeChange: { setup: `go(14); pl.script = (c) => { c.steer = T < 1.1 ? 1 : -1; };`, until: `T > 1.28`, views: [0, 90] },
  tuck: { setup: `go(15); pl.script = (c) => { c.tuck = 1; };`, until: `T > 1.2`, views: [90, 0] },
  plow: { setup: `go(4); pl.script = (c) => { c.brake = 0.5; };`, until: `T > 1.0`, views: [180, 90] },
  hockey: { setup: `go(15); pl.script = (c) => { c.brake = 1; };`, until: `T > 0.35`, views: [180, 90, 0] },
  squat: { setup: `go(11); pl.script = (c) => { c.jump = true; };`, until: `T > 0.4`, views: [90] },
  air: { setup: `kick(13); pl.script = (c, p) => { if (p.state === 1) c.jump = aheadOfLip(p) ; };`, until: `pl.state === 2 && pl.airTime > 0.35`, views: [90, 0] },
  landing: { setup: `kick(13); window.__l0 = pl.landingEvent; pl.script = (c, p) => { if (p.state === 1) c.jump = aheadOfLip(p); };`, until: `pl.landingEvent !== window.__l0 && (window.__lt = (window.__lt ?? T)) && T - window.__lt > 0.07`, views: [90, 0] },
  crash: { setup: `go(14); pl.script = () => { if (T > 0.3 && pl.state === 1) pl.crash('tree'); };`, until: `pl.state === 3 && pl.crashT > 0.45`, views: [90, 0] },
  crashLate: { setup: `go(14); pl.script = () => { if (T > 0.3 && pl.state === 1) pl.crash('landing'); };`, until: `pl.state === 3 && pl.crashT > 1.2`, views: [90, 30] },
};
const list = only ? only.split(',') : Object.keys(SCEN);
for (const name of list) {
  const sc = SCEN[name];
  await page.evaluate(({ setup }) => {
    const S = window.__sendit, pl = S.player;
    window.__T0 = performance.now(); window.__lt = undefined;
    pl.debugFreeze = false; S.rider && (S.rider.fp = false);
    const K = S.features.kickers?.[2];
    const at = (d) => S.features.at(d);
    // Straight down the course from 120 m in at speed v.
    window.go = (v, d = 160) => { const { p, dir } = at(d); pl.place({ x: p.x, z: p.y }, Math.atan2(-dir.x, -dir.y)); pl.velocity.copy(pl.forward()).multiplyScalar(v); };
    window.kick = (v) => { pl.place({ x: K.o.x - K.f.x * 25, z: K.o.y - K.f.y * 25 }, Math.atan2(-K.f.x, -K.f.y)); pl.velocity.copy(pl.forward()).multiplyScalar(v); };
    // The game's own event bus (the exact URL it loaded: vite adds ?t= after edits, a bare path would be a second copy).
    window.stateUrl = () => performance.getEntriesByType('resource').map((e) => e.name).filter((n) => /\/src\/state\.js/.test(n)).pop() || '/src/state.js';
    window.aheadOfLip = (p) => { const dx = p.position.x - K.o.x, dz = p.position.z - K.o.y, a = dx * K.f.x + dz * K.f.y; return a > -10 && a + 0.3 < K.L; };
    // T = simulated seconds since the setup (SwiftShader frames are slow: count physics time, not wall time).
    window.__simT = 0;
    if (!pl.__wrapped) { pl.__wrapped = pl.step.bind(pl); pl.step = (dt) => { if (!pl.debugFreeze) window.__simT += dt; return pl.__wrapped(dt); }; }
    if (!Object.getOwnPropertyDescriptor(window, 'T')) Object.defineProperty(window, 'T', { configurable: true, get: () => window.__simT });
    // eslint-disable-next-line no-new-func
    new Function('S', 'pl', 'K', 'at', setup)(S, pl, K, at);
  }, sc);
  const ok = await page.waitForFunction((u) => { const S = window.__sendit, pl = S.player; const T = window.__simT; try { return new Function('S', 'pl', 'T', `return (${u});`)(S, pl, T); } catch { return false; } }, sc.until, { timeout: 240000, polling: 50 }).then(() => true).catch(() => false);
  await page.evaluate(() => { window.__sendit.player.debugFreeze = true; });
  const info = await page.evaluate(() => { const p = window.__sendit.player; return { crouch: +(window.__sendit.rider?.p.crouch || 0).toFixed(2), state: p.state, speed: +p.speed.toFixed(1), edge: +(p.edgeAngle * 57.3).toFixed(0), lean: +(window.__sendit.rider?.p.lean * 57.3 || 0).toFixed(0), air: +p.airTime.toFixed(2), crashT: +(p.crashT || 0).toFixed(2) }; });
  for (const yaw of sc.views) {
    await page.evaluate(([yaw, dist]) => { window.__cam.inspect = { yaw, dist, height: 0.15, fov: 38 }; }, [yaw, Number(process.env.DIST || 4.2)]);
    await page.waitForTimeout(Number(process.env.SETTLE || 900));
    const f = `${outDir}/${equip}-${name}-${yaw}.png`;
    await page.screenshot({ path: f, timeout: 240000 });
    console.log(JSON.stringify({ shot: f, ok, ...info }));
  }
  await page.evaluate(() => { window.__cam.inspect = null; const pl = window.__sendit.player; pl.script = null; pl.debugFreeze = false; if (pl.state === 3) pl.place(pl.position.clone(), pl.heading); });
}
console.log(JSON.stringify({ errors: errors.length }));
await browser.close();
