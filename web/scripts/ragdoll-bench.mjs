// Crash ragdoll CPU in the real game (browser): forces crashes on a few maps and times ragdoll.stepCrash()
// synchronously over the whole tumble (180 frame steps of 1/60 s each, a coarse browser timer is fine over that
// many). Reports ms per 60 Hz frame while the body is awake, and overall.
//
//   node web/scripts/ragdoll-bench.mjs [baseUrl] [ski|snowboard]
import { chromium } from '@playwright/test';

const [base = 'http://localhost:5196/', equip = 'ski'] = process.argv.slice(2);
const gpu = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11', '--use-gl=angle', '--enable-gpu', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: gpu });
for (const map of ['valcrest-gully', 'blackspruce', 'voltage-park']) {
  const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
  await page.goto(`${base.replace(/\/?$/, '/')}?map=${map}&equip=${equip}&quality=0`);
  await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 300000 });
  await page.click('.lb-ride');
  await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state !== 4 && window.__cam?.intro >= 1, null, { timeout: 120000 });
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const s = window.__sendit, pl = s.player, rg = s.ragdoll;
    const out = [];
    for (const [speed, reason] of [[8, 'compression'], [14, 'pitch'], [20, 'yaw']]) {
      s.game.mode = 2;   // the page's own loop pauses physics; frames are stepped here
      const sp = s.terrain.getSpawn();
      pl.place(sp.position, sp.heading);
      pl.velocity.copy(pl.forward()).multiplyScalar(speed); pl.velocity.y = -3;
      rg.stop(); rg.frames.length = 0;
      rg.track(); pl.simTime += 1 / 60; rg.track();
      pl.lastCrash = { reason }; pl.crash(reason === 'compression' ? 'compression' : 'landing');
      let awake = 0, nAwake = 0, all = 0;
      for (let i = 0; i < 180; i++) {
        const t0 = performance.now();
        pl.step(1 / 60);
        const dt = performance.now() - t0;
        all += dt;
        if (rg.H && !rg.H.world.asleep(0)) { awake += dt; nAwake++; }
      }
      out.push({ speed, reason, awakeFrames: nAwake, msPerFrameAwake: +(awake / Math.max(1, nAwake)).toFixed(3), msPerFrameAll: +(all / 180).toFixed(3), substeps: rg.H?.world.stats.substeps });
      pl.place(sp.position, sp.heading); s.game.mode = 1;
    }
    return out;
  });
  for (const o of r) console.log(`${equip} ${map.padEnd(15)} ${String(o.speed).padStart(2)} m/s ${o.reason.padEnd(11)} awake ${String(o.awakeFrames).padStart(3)} frames: ${o.msPerFrameAwake} ms/frame (all ${o.msPerFrameAll})`);
  await page.close();
}
await browser.close();
