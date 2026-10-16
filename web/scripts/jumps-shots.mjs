// Dev helper: a scripted trick in the real game, frozen at a few points of the rotation for screenshots
// (checks the trick poses: the tuck, the layout as the flip opens up, arms in / out on spins).
// Usage: GPU=1 node web/scripts/jumps-shots.mjs <baseUrl> <outDir> [ski|snowboard] [backflip|cork|spin]
// Screenshots go to outDir (keep them out of the repo).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5187/', outDir = '.', equip = 'ski', trick = 'backflip'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[error]', m.text().slice(0, 300)); });
await page.goto(`${base.replace(/\/?$/, '/')}?kicker=2&equip=${equip}&cam=${process.env.CAM || 'side'}`);
await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
await page.click('.lb-ride');
await page.waitForFunction(() => window.__sendit.game.mode === 2 || window.__sendit.player.state === 1, null, { timeout: 120000 });
await page.waitForTimeout(1500);
// Freeze points: flip angles (rad) for flips, spin angles for spins.
await page.evaluate((trick) => {
  const s = window.__sendit, pl = s.player, k = s.features.kickers[2];
  // 25 m before the ramp at 13 m/s along its axis (further out the run-in has rollers you'd fly off).
  pl.place({ x: k.o.x - k.f.x * 25, z: k.o.y - k.f.y * 25 }, Math.atan2(-k.f.x, -k.f.y));
  pl.velocity.copy(pl.forward()).multiplyScalar(13);
  const TAU = Math.PI * 2;
  window.__freezeAt = trick === 'spin' ? [1.5, 3.5, 5.5] : [1.2, 2.6, 4.2, 5.6];
  window.__frozen = 0;
  pl.script = (c, p) => {
    if (p.state === 1 && !window.__done) {
      const dx = p.position.x - k.o.x, dz = p.position.z - k.o.y, a = dx * k.f.x + dz * k.f.y;
      const aNext = a + (p.velocity.x * k.f.x + p.velocity.z * k.f.y) * (1 / 60) * 1.5;
      c.jump = a > -10 && aNext < k.L;
      if (trick !== 'spin') c.brake = a > -6 && aNext < k.L ? 1 : 0;   // flip preload
      if (trick !== 'backflip') c.steer = a > k.L - 3 && aNext < k.L ? -1 : 0;   // wind-up (late: steering also carves)
    } else if (p.state === 2) {
      window.__done = true;
      const tl = p.dyn.timeToLand();
      if (trick !== 'spin' && (p.airTime < 0.12 || Math.abs(p.flip) + Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH) * Math.max(0, tl - 0.2) < TAU)) c.brake = 1;
      if (trick !== 'backflip' && (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH) * 0.6 * Math.max(0, tl - 0.15) < TAU)) c.steer = -1;
      const ang = trick === 'spin' ? Math.abs(p._spinTotal) : Math.abs(p.flip);
      if (window.__freezeAt.length && ang > window.__freezeAt[0]) { window.__freezeAt.shift(); p.debugFreeze = true; window.__frozen++; }
    }
  };
}, trick);
for (let i = 0; i < 4; i++) {
  const n = i + 1;
  const got = await page.waitForFunction((n) => window.__frozen >= n || window.__sendit.player.state === 3, n, { timeout: 60000 }).then(() => true).catch(() => false);
  if (!got) break;
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => { const p = window.__sendit.player; return { flip: +(p.flip * 57.3).toFixed(0), spin: +(p._spinTotal * 57.3).toFixed(0), tuck: +(p.flipTuck || 0).toFixed(2), spinPose: +(p.spinTuck || 0).toFixed(2), air: +p.airTime.toFixed(2), state: p.state }; });
  const f = `${outDir}/${equip}-${trick}-${n}.png`;
  await page.screenshot({ path: f });
  console.log(f, JSON.stringify(info));
  if (info.state === 3) break;
  await page.evaluate(() => { window.__sendit.player.debugFreeze = false; });
}
await page.waitForTimeout(2500);
console.log('landing', JSON.stringify(await page.evaluate(() => { const p = window.__sendit.player; return { state: p.state, last: p.lastLanding && { result: p.lastLanding.result, trick: p.lastLanding.trick, air: +p.lastLanding.air.toFixed(2), flipDev: +(p.lastLanding.flipDev ?? 0).toFixed(0) } }; })));
await browser.close();
