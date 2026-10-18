// Combo-trick frame sequences in the real game (corks, rodeos, misties, double corks, flips): the rider is
// launched off the snow with a set take-off and a skilled player's inputs (as in physics-combo.mjs), the
// physics freezes every `DT_SHOT` s of the air and the frame is photographed from the side (a camera beside
// the take-off line that tracks the body's centre of mass). Each trick becomes one contact sheet, plus one
// line per frame: the trick rotation, the drawn centre of mass vs the physics path, the centre of mass of the
// posed skeleton (bones, mass-weighted) vs the physics path, and where the head looks vs the landing.
// Usage: node web/scripts/combo-shots.mjs <url> <outDir> [ski|snowboard] [trick,…]
//   tricks: backflip cork720 dc1080 rodeo540 misty720 cork720grab bf360
//   env: GPU=1 (Windows d3d11) | MAC=1 (metal) | default software GL; W/H viewport; DT_SHOT (s, default 0.12)
// Screenshots belong outside the repo.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5185/', outDir = './combo-shots', equip = 'ski', only = ''] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const args = process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
  : process.env.MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const W = Number(process.env.W || 420), H = Number(process.env.H || 420), DT_SHOT = Number(process.env.DT_SHOT || 0.12);
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base.replace(/\/?$/, '/')}?map=valcrest-gully&ride&equip=${equip}&quality=${process.env.Q ?? 0}`);
await page.waitForFunction(() => window.__sendit?.player?.state === 1, null, { timeout: 400000 });
await page.evaluate(() => {
  const st = document.createElement('style'); st.textContent = 'body > *:not(canvas) { display: none !important; }'; document.head.appendChild(st);
  const fx = window.__sendit.fx;
  for (const m of [fx?.mesh, fx?.spray?.mesh]) if (m) { m.visible = false; Object.defineProperty(m, 'visible', { get: () => false, set: () => {} }); }
});
await page.waitForTimeout(1000);
// The physics centre of mass as drawn (player.renderCom; older builds: flipPivot above the feet along the un-flipped gear).
await page.evaluate(() => {
  window.__com = (pl) => {
    if (pl.renderCom) return pl.renderCom(new pl.position.constructor());
    const Q = pl.renderOrient.constructor, V = pl.position.constructor;
    const base = pl.renderOrient.clone().multiply(new Q().setFromAxisAngle(new V(1, 0, 0), -(pl.renderFlip || 0)));
    return new V(0, 0.85, 0).applyQuaternion(base).add(pl.renderPos);
  };
});
if (process.env.SIDE) await page.evaluate((s) => { window.__camSide = s; }, process.env.SIDE);

// [vy, set, inputs (page-side source: (p) => keys)]
const FLIP = `(dir, turns) => (p) => { const ahead = Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH || 0) * Math.max(0, p.dyn.timeToLand() - 0.2); return p.airTime < 0.12 || Math.abs(p.flip) + ahead < turns * Math.PI * 2 ? (dir > 0 ? { brake: 1 } : { up: 1 }) : {}; }`;
const SPIN = `(deg, dir = 1) => (p) => (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH || 0) * p.dyn.C.spinOpen * Math.max(0, p.dyn.timeToLand() - 0.15) < deg * Math.PI / 180 ? { steer: -dir } : {})`;
const TRICKS = {
  backflip: [11, { preload: 0.7 }, 'flipTo(1, 1)'],
  bf360: [11, { preload: 0.7, windup: -0.6 }, 'both(flipTo(1, 1), spinTo(360))'],
  cork720: [11, { preload: 1, windup: -1 }, 'both(flipTo(1, 1), spinTo(720))'],
  cork720grab: [11, { preload: 1, windup: -1 }, 'grab(both(flipTo(1, 1), spinTo(720)))'],
  rodeo540: [11, { preload: 1, windup: -0.8 }, 'both(flipTo(1, 1), spinTo(540))'],
  misty720: [11, { front: 1, windup: -1 }, 'both(flipTo(-1, 1), spinTo(720))'],
  dc1080: [13, { preload: 1, windup: -1 }, 'both(flipTo(1, 2), spinTo(1080))'],
};
const list = only ? only.split(',') : ['backflip', 'cork720', 'rodeo540', 'misty720', 'dc1080'];
const report = {};
for (const name of list) {
  const [vy, set, expr] = TRICKS[name];
  await page.evaluate(({ vy, set, expr, FLIP, SPIN, DT_SHOT }) => {
    const S = window.__sendit, pl = S.player, R = S.rider;
    const flipTo = eval(FLIP), spinTo = eval(SPIN);
    const both = (...f) => (p) => Object.assign({}, ...f.map((g) => g(p)));
    const grab = (f) => (p) => ({ ...f(p), ...(p.airTime > 0.35 && p.dyn.timeToLand() > 0.5 ? { tuck: 1 } : {}) });
    const fn = eval(expr);
    const sp = S.terrain.getSpawn();
    pl.debugFreeze = false;
    pl.place(sp.position, sp.heading);
    const f = pl.forward();
    pl.position.y += 0.4;
    pl.velocity.set(f.x * 11, vy, f.z * 11);
    pl.lastPopQ = 1; pl.dyn.flipLoad = set.preload || 0; pl.dyn.frontLoad = set.front || 0; pl.dyn.windup = set.windup || 0;
    if (set.front) pl._ctrl.up = 1;
    pl.enterAir(true);
    pl.snapRender();
    const right = { x: -f.z, z: f.x };
    // Ideal point-mass flight (no drag) from the take-off, for the path errors.
    const p0 = window.__com(pl), v0 = pl.velocity.clone();
    window.__ideal = { p0, v0 };
    window.__shotT = 0; window.__cap = null; window.__done = false; window.__landT = null;
    let next = 0.06;
    // (the rider's last update is what's on screen: remember the physics centre of mass it was posed for —
    // a frozen player keeps interpolating to its latest step, up to a step ahead of the drawn pose)
    const orig = R.update;
    if (!R.__origUpdate) R.__origUpdate = orig;
    const upd = function (dt, cam) { R.__origUpdate.call(R, dt, cam); window.__rc = window.__com(pl); window.__rq = pl.renderOrient.clone(); };
    R.update = upd;
    window.__resume = () => { R.update = upd; pl.debugFreeze = false; window.__cap = null; };
    pl.script = (c, p) => {
      const t = (window.__shotT += 1 / 60);
      Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 });
      if (p.state === 2) Object.assign(c, fn(p));
      if (p.state !== 2 && window.__landT === null) window.__landT = t;
      if (window.__landT !== null && t > window.__landT + 0.35) { window.__done = true; return; }
      if (t >= next - 1e-6) { next += DT_SHOT; window.__cap = t; pl.debugFreeze = true; R.update = () => {}; }
    };
    window.__gfxCam = () => {
      const c = window.__com(pl);
      const sd = Number(window.__camSide ?? 1), d = 4.6;
      return [c.x + right.x * d * sd, c.y + 0.35, c.z + right.z * d * sd, c.x, c.y, c.z, 42];
    };
  }, { vy, set, expr, FLIP, SPIN, DT_SHOT });
  const frames = [], data = [];
  for (;;) {
    await page.waitForFunction(() => window.__cap != null || window.__done, null, { timeout: 120000 });
    if (await page.evaluate(() => window.__cap == null)) break;
    await page.waitForTimeout(80);
    // Pose the frozen frame once (the rider's update is paused while frozen).
    frames.push(await page.screenshot());
    data.push(await page.evaluate(() => {
      const S = window.__sendit, pl = S.player, R = S.rider, B = R.bones;
      const V3 = pl.position.constructor, wp = (b) => b.getWorldPosition(new V3());
      // Posed skeleton centre of mass (segment midpoints, rough Dempster weights).
      const seg = [['pelvis', 'spine_01', 0.14], ['spine_01', 'spine_03', 0.22], ['spine_03', 'neck_01', 0.14], ['Head', null, 0.08],
        ['thigh_l', 'calf_l', 0.1], ['thigh_r', 'calf_r', 0.1], ['calf_l', 'foot_l', 0.045], ['calf_r', 'foot_r', 0.045], ['foot_l', null, 0.015], ['foot_r', null, 0.015],
        ['upperarm_l', 'lowerarm_l', 0.028], ['upperarm_r', 'lowerarm_r', 0.028], ['lowerarm_l', 'hand_l', 0.022], ['lowerarm_r', 'hand_r', 0.022]];
      const com = new V3(); let wsum = 0;
      for (const [a, b, w] of seg) { if (!B[a]) continue; const pa = wp(B[a]); const pb = b && B[b] ? wp(B[b]) : pa; com.addScaledVector(pa.add(pb).multiplyScalar(0.5), w); wsum += w; }
      com.multiplyScalar(1 / wsum);
      const rc = window.__rc || window.__com(pl);
      const { p0, v0 } = window.__ideal, t = pl.airTime;
      const ideal = new V3(p0.x + v0.x * t, p0.y + v0.y * t - 4.905 * t * t, p0.z + v0.z * t);
      const up = new V3(0, 1, 0).applyQuaternion(window.__rq || pl.renderOrient);
      const tl = pl.state === 2 ? pl.dyn.timeToLand() : 0;
      return { t, st: pl.state, flip: pl.flip * 57.3, spin: pl._spinTotal * 57.3, tilt: Math.acos(Math.max(-1, Math.min(1, up.y))) * 57.3,
        look: [R.p.alYaw || 0, R.p.alPitch || 0, R.p.alW || 0], dev: [com.x - rc.x, com.y - rc.y, com.z - rc.z], air: pl.state === 2, m: pl.offAxis?.m ?? 0, alpha: (pl.offAxis?.alpha ?? 0) * 57.3, comVsPhys: rc.distanceTo(com), drawnVsIdeal: rc.distanceTo(ideal), boneVsIdeal: com.distanceTo(ideal), tl,
        res: pl.lastLanding ? `${pl.lastLanding.result} ${pl.lastLanding.trick}` : '' };
    }));
    await page.evaluate(() => window.__resume());
  }
  const res = await page.evaluate(() => { const pl = window.__sendit.player; return pl.state === 3 ? `CRASH ${pl.lastCrash?.reason}` : `${pl.lastLanding?.result} "${pl.lastLanding?.trick}" yaw ${pl.lastLanding?.dev?.toFixed(0)} pitch ${pl.lastLanding?.flipDev?.toFixed(0)}`; });
  const dir = `${outDir}/${equip}-${name}`;
  fs.mkdirSync(dir, { recursive: true });
  frames.forEach((b, i) => fs.writeFileSync(`${dir}/${String(i).padStart(2, '0')}.png`, b));
  console.log(`\n== ${equip} ${name}: ${res}`);
  for (const d of data) console.log(`  t ${d.t.toFixed(2)} st ${d.st} flip ${d.flip.toFixed(0)} spin ${d.spin.toFixed(0)} tilt ${d.tilt.toFixed(0)} m ${d.m.toFixed(2)} α ${d.alpha.toFixed(0)}  drawnCOM-ideal ${d.drawnVsIdeal.toFixed(2)} m  boneCOM-drawn ${d.comVsPhys.toFixed(2)} m  boneCOM-ideal ${d.boneVsIdeal.toFixed(2)} m  head yaw ${(d.look[0] * 57.3).toFixed(0)}° pitch ${(d.look[1] * 57.3).toFixed(0)}° spot ${d.look[2].toFixed(2)} (t-land ${d.tl.toFixed(2)})`);
  // Body wobble: how far the posed skeleton's centre of mass strays from its average offset to the physics
  // point (a body that orbits its pivot while turning shows here; 0 = it rides the flight path exactly).
  const airD = data.filter((d) => d.air && d.t > 0.1), mean = [0, 1, 2].map((i) => airD.reduce((a, d) => a + d.dev[i], 0) / Math.max(1, airD.length));
  const wob = Math.max(0, ...airD.map((d) => Math.hypot(d.dev[0] - mean[0], d.dev[1] - mean[1], d.dev[2] - mean[2])));
  console.log(`  body COM wobble about the flight path: ${wob.toFixed(2)} m`);
  report[name] = { res, data, wobble: wob };
  // Contact sheet: 6 columns.
  const cols = 6, cw = Math.round(W * 0.55), chh = Math.round(H * 0.55);
  const sheet = await browser.newPage({ viewport: { width: cols * cw, height: Math.ceil(frames.length / cols) * (chh + 16) } });
  await sheet.setContent(`<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;font:11px sans-serif;color:#ddd">${frames.map((b, i) => `<div style="width:${cw}px"><img style="width:${cw}px;height:${chh}px;display:block" src="data:image/png;base64,${b.toString('base64')}"><div>t ${data[i].t.toFixed(2)} flip ${data[i].flip.toFixed(0)} spin ${data[i].spin.toFixed(0)} tilt ${data[i].tilt.toFixed(0)}</div></div>`).join('')}</body>`);
  await sheet.screenshot({ path: `${outDir}/${equip}-${name}.png`, fullPage: true });
  await sheet.close();
}
fs.writeFileSync(`${outDir}/${equip}-report.json`, JSON.stringify(report, null, 1));
await browser.close();
