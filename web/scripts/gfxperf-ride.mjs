// Graphics perf check: ride with the throttle held on the real GPU (ANGLE/D3D11 on Windows), uncapped
// frame rate, and report CPU-side frame intervals plus renderer stats for each quality level.
// Usage: node scripts/gfxperf-ride.mjs [baseUrl] [seconds] [W H]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174/', secs = '12', W = '1600', H = '900'] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit',
    '--autoplay-policy=no-user-gesture-required'],
});
for (const q of (process.env.Q ? process.env.Q.split(',').map(Number) : [0, 1, 2])) {
  const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
  let errors = 0;
  page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[error]', m.text().slice(0, 300)); } });
  page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
  const tb = Date.now();
  await page.goto(`${base}?ride&quality=${q}`);
  await page.waitForFunction(() => window.__sendit, null, { timeout: 300000 });
  console.log(`quality ${q}: booted in ${((Date.now() - tb) / 1000).toFixed(1)} s`);
  await page.waitForTimeout(3000);
  await page.keyboard.down('w');
  const r = await page.evaluate((secs) => new Promise((res) => {
    const t = [], long = [];
    let last = performance.now();
    const t0 = last, end = last + secs * 1000;
    const tick = (now) => {
      t.push(now - last);
      if (now - last > 250) long.push(`${((last - t0) / 1000).toFixed(1)}s:${(now - last).toFixed(0)}ms(p${window.__sendit.renderer.info.programs.length})`);
      last = now;
      if (now < end) requestAnimationFrame(tick);
      else {
        t.sort((a, b) => a - b);
        const info = window.__sendit.renderer.info.render;
        res({ long: long.join(' '), n: t.length, median: t[t.length >> 1], p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1], calls: info.calls, tris: info.triangles });
      }
    };
    requestAnimationFrame(tick);
  }), Number(secs));
  console.log(`quality ${q}: frames ${r.n}  median ${r.median.toFixed(2)} ms  p95 ${r.p95.toFixed(2)} ms  max ${r.max.toFixed(1)} ms  draw calls ${r.calls}  triangles ${(r.tris / 1e6).toFixed(2)} M  errors ${errors}  hitches [${r.long}]`);
  await page.close();
}
await browser.close();
