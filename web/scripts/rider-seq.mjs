// Rider pose contact sheet: drive the real game (frozen at each capture, so frames are on time) through a scripted
// input sequence and capture frames at fixed times from a chosen camera, plus per-frame pose numbers.
// Usage: GPU=1 node web/scripts/rider-seq.mjs <url> <out.png> [equip] [cam] [map] [script]
//   cam:   chase (the game camera) | rear | side | front  (rider-relative, ~3.5 m away)
//   script: turns (W 2.5 s, then D 1 s, A 1 s, D 1 s, release 1 s) | straight | <json [[t, steer, up], …]>
// Env AT = x,z[,heading] start (default the spawn), V0 = start speed (m/s, default 12) along the spawn heading. Frames every 0.25 s from t = 2.25 s; the sheet is 5 columns wide, one row per second.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [url = 'http://localhost:5186/', out = 'seq.png', equip = 'ski', cam = 'rear', map = '', scr = 'turns'] = process.argv.slice(2);
const SCRIPTS = {
  turns: [[0, 0, 1], [2.5, 1, 0], [3.5, -1, 0], [4.5, 1, 0], [5.5, 0, 0], [6.5, 0, 0]],
  straight: [[0, 0, 1], [6.5, 0, 1]],
};
const script = SCRIPTS[scr] || JSON.parse(scr);
const end = script.at(-1)[0];
const browser = await chromium.launch({ args: process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : [] });
const page = await browser.newPage({ viewport: { width: 480, height: 480 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${url}?ride&equip=${equip}${map ? '&map=' + map : ''}${process.env.Q ? '&' + process.env.Q : ''}`);   // env Q = extra query (e.g. stance=goofy)
await page.waitForFunction(() => window.__sendit && window.__sendit.player.controllable?.(), null, { timeout: 300000 });
await page.waitForTimeout(500);
await page.evaluate(({ end, script, cam, v0, at }) => {
  const s = window.__sendit, pl = s.player;
  const sp = s.terrain.getSpawn();
  if (at) { sp.position = { x: at[0], z: at[1] }; sp.heading = at[2] ?? sp.heading; }
  pl.place(sp.position, sp.heading);
  pl.velocity.set(-Math.sin(sp.heading), 0, -Math.cos(sp.heading)).multiplyScalar(v0);
  window.__seqT = 0; window.__seqEnd = end;
  // Sim time counts physics steps; at each capture time the physics and the rider pose freeze until
  // the screenshot is taken, so every frame is exactly on time whatever the screenshot costs.
  const R = s.rider, upd = R.update;
  window.__cap = null; let next = 2.25;
  window.__resume = () => { R.update = upd; pl.debugFreeze = false; window.__cap = null; };
  pl.script = (c) => {
    const t = (window.__seqT += 1 / 60);   // called once per physics step
    if (t >= next - 1e-6) { next += 0.25; window.__cap = t; pl.debugFreeze = true; R.update = () => {}; }
    let row = script[0];
    for (const r of script) if (r[0] <= t) row = r;
    c.steer = row[1]; c.up = row[2];
  };
  if (cam !== 'chase') {
    const d = { rear: [0, 1.5, 2.6], side: [2.8, 1.0, 0], front: [0, 1.3, -2.6] }[cam];
    window.__gfxCam = () => {
      const p = pl.renderPos, h = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
      const fx = -Math.sin(h), fz = -Math.cos(h);
      return [p.x - fz * d[0] - fx * d[2], p.y + d[1], p.z + fx * d[0] - fz * d[2], p.x, p.y + 0.8, p.z];
    };
  }
}, { end, script, cam, v0: Number(process.env.V0 ?? 12), at: process.env.AT ? process.env.AT.split(',').map(Number) : null });
const frames = [], data = [];
for (;;) {
  await page.waitForFunction(() => window.__cap != null || window.__seqT >= window.__seqEnd, null, { timeout: 120000 });
  if (await page.evaluate(() => window.__cap == null)) break;
  await page.waitForTimeout(60);   // a couple of rendered frames with the frozen pose (the chase camera settles a touch)
  frames.push(await page.screenshot());
  data.push(await page.evaluate(() => {
    const s = window.__sendit, pl = s.player, R = s.rider, p = R.p;
    const V3 = pl.position.constructor, Q = pl.renderOrient.constructor;
    // World up / forward of a bone's rest frame (armature Y / Z carried through its current rotation).
    const axes = (b) => {
      const qw = new Q(); b.getWorldQuaternion(qw);
      const qr = new Q().setFromRotationMatrix(R.restGlobal.get(b)).invert();
      const q = qw.multiply(qr);
      return { up: new V3(0, 1, 0).applyQuaternion(q), fwd: new V3(0, 0, 1).applyQuaternion(q) };
    };
    const h = pl.heading + (pl.travelSign < 0 ? Math.PI : 0);
    const fx = -Math.sin(h), fz = -Math.cos(h), rx = -fz, rz = fx;
    const roll = (b) => { const u = axes(b).up; return Math.asin(Math.max(-1, Math.min(1, u.x * rx + u.z * rz))) * 57.3; };   // lateral tilt (robust when bent over)
    const yawOf = (v) => Math.atan2(-v.x, -v.z);
    const rel = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b)) * 57.3;
    const pathYaw = pl.speed > 1 ? yawOf(pl.velocity) : h;
    const fy = (b) => yawOf(axes(b).fwd);   // armature +Z = the rider's front (the model is turned π)
    return { t: window.__cap, v: pl.speed, lean: p.lean * 57.3, edge: p.edge * 57.3, lead: p.lead, st: pl.state, x: pl.position.x, z: pl.position.z, h: pl.heading, ts: pl.travelSign,
      headRoll: roll(R.bones.Head), chestRoll: roll(R.bones.spine_03),
      chestVsPelvis: rel(fy(R.bones.spine_03), fy(R.bones.pelvis)), pelvisVsGear: rel(fy(R.bones.pelvis), h) , headVsPath: rel(fy(R.bones.Head), pathYaw) };
  }));
  await page.evaluate(() => window.__resume());
}
await browser.close();
fs.mkdirSync(out + '.d', { recursive: true });
frames.forEach((b, i) => fs.writeFileSync(`${out}.d/${String(i).padStart(2, '0')}.png`, b));
for (const d of data) console.log(`t=${d.t.toFixed(2)} v=${d.v.toFixed(1)} lean=${d.lean.toFixed(0)} edge=${d.edge.toFixed(0)} lead=${d.lead.toFixed(2)} st=${d.st} pos=${d.x.toFixed(0)},${d.z.toFixed(0)} h=${d.h.toFixed(2)} ts=${d.ts} headRoll=${d.headRoll.toFixed(0)} chestRoll=${d.chestRoll.toFixed(0)} chest-pelvis=${d.chestVsPelvis.toFixed(0)} pelvis-gear=${d.pelvisVsGear.toFixed(0)} head-path=${d.headVsPath.toFixed(0)}`);
console.log('frames in', out + '.d');
