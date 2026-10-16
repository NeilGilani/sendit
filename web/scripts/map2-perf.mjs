// GPU cost along a whole run (real GPU, timer queries): place the rider every STEP metres down the
// main line, let it settle, freeze it, render 60 identical frames and keep the FASTEST one. The
// minimum is robust when other processes share the GPU (contention only ever adds time); compare
// against Valcrest measured the same way at the same time.
// Usage: node web/scripts/map2-perf.mjs [baseUrl] [map=blackspruce|valcrest-gully] [t0] [t1] [step] [quality]
//   e.g. node web/scripts/map2-perf.mjs http://localhost:5182 blackspruce 100 1950 75 1
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5182', map = 'blackspruce', t0 = '100', t1 = '1950', step = '75', q = '1'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`${base}/?map=${map}&ride&quality=${q}`);
await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 300000 });
await page.keyboard.down('ArrowUp');
await page.evaluate(() => {
  const s = window.__sendit, gl = s.renderer.getContext(), P = window.__post;
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  window.__gpu = []; const pending = [];
  const orig = P.composer.render.bind(P.composer);
  P.composer.render = (dt) => {
    const qq = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, qq); orig(dt); gl.endQuery(ext.TIME_ELAPSED_EXT); pending.push(qq);
    for (let i = pending.length - 1; i >= 0; i--) {
      if (!gl.getQueryParameter(pending[i], gl.QUERY_RESULT_AVAILABLE)) continue;
      window.__gpu.push(gl.getQueryParameter(pending[i], gl.QUERY_RESULT) / 1e6); gl.deleteQuery(pending[i]); pending.splice(i, 1);
    }
  };
});
const res = [];
for (let t = +t0; t <= +t1; t += +step) {
  await page.evaluate((t) => {
    const s = window.__sendit, c = s.course.centre(t);
    s.player.debugFreeze = false;
    s.player.place({ x: c.x, z: c.z }, c.heading);
    s.player.velocity.set(-Math.sin(c.heading) * 15, 0, -Math.cos(c.heading) * 15);
    setTimeout(() => { s.player.debugFreeze = true; }, 500);
  }, t);
  await page.waitForTimeout(900);
  const ms = await page.evaluate(() => new Promise((r) => {
    window.__gpu.length = 0;
    const chk = () => (window.__gpu.length >= 60 ? r(Math.min(...window.__gpu)) : setTimeout(chk, 30));
    chk();
  }));
  res.push([t, ms]);
}
const all = res.map((r) => r[1]).sort((a, b) => a - b);
console.log(res.map(([t, m]) => `${t}:${m.toFixed(1)}`).join(' '));
console.log(`${map} q${q}: median ${all[all.length >> 1].toFixed(1)} ms, p90 ${all[Math.floor(all.length * 0.9)].toFixed(1)} ms, max ${all[all.length - 1].toFixed(1)} ms`);
await browser.close();
