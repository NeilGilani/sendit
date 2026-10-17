// Boot timing on the real GPU: page open → lobby ready, plus main-thread stalls (long tasks) and,
// when the loading scene is present, its frame pacing while the game loads behind it.
// Usage: node scripts/loadtime.mjs [baseUrl] [runs=3] [extra query, e.g. "loadscene=0"]
// Prints one line per run and the median. Each run uses a fresh context (cold JS module cache but
// a warm HTTP cache is not guaranteed either way; compare medians of back-to-back runs).
import { chromium } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:5191/').replace(/\/?$/, '/');
const runs = Number(process.argv[3] || 3);
const extra = process.argv[4] || '';
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const rows = [];
for (let i = 0; i < runs; i++) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__lt = { long: [], frames: [] };
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.long.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true });
    } catch { /* no longtask API */ }
    let last = 0;
    const f = (t) => { if (last) window.__lt.frames.push([t, t - last]); last = t; if (!window.__lt.stop) requestAnimationFrame(f); };
    requestAnimationFrame(f);
  });
  const t0 = Date.now();
  await page.goto(base + (extra ? `?${extra}` : ''));
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });
  const ready = Date.now() - t0;
  const r = await page.evaluate(() => {
    window.__lt.stop = true;
    const nav = performance.getEntriesByType('navigation')[0];
    const fp = performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1;
    const ls = window.__sendit?.loadingStats || null;
    const long = window.__lt.long;
    const frames = window.__lt.frames.map((x) => x[1]);
    const sorted = [...frames].sort((a, b) => a - b);
    const pct = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] || 0;
    return {
      dcl: nav?.domContentLoadedEventEnd ?? -1, fcp: fp, now: performance.now(),
      longN: long.length, longMs: long.reduce((a, x) => a + x[1], 0), longMax: Math.max(0, ...long.map((x) => x[1])),
      frames: frames.length, p50: pct(0.5), p95: pct(0.95), over50: frames.filter((d) => d > 50).length, ls,
    };
  });
  rows.push({ ready: r.now, ...r });
  console.log(`run ${i + 1}: ready ${(r.now / 1000).toFixed(2)} s (wall ${(ready / 1000).toFixed(2)} s)  fcp ${r.fcp.toFixed(0)} ms  long tasks ${r.longN} (${r.longMs.toFixed(0)} ms, max ${r.longMax.toFixed(0)})  frames ${r.frames} p50 ${r.p50.toFixed(1)} p95 ${r.p95.toFixed(1)} >50ms ${r.over50}${r.ls ? '  scene ' + JSON.stringify(r.ls) : ''}${errors.length ? '  ERRORS ' + errors.join(' | ') : ''}`);
  await ctx.close();
}
const med = (k) => { const v = rows.map((r) => r[k]).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
console.log(`median ready ${(med('ready') / 1000).toFixed(2)} s, min ${(Math.min(...rows.map((r) => r.ready)) / 1000).toFixed(2)} s, long-task ms ${med('longMs').toFixed(0)}`);
await browser.close();
