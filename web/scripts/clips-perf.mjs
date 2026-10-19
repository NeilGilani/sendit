// Highlights cost in the real game: (1) the recorder's per-frame time (it already existed for the instant
// replay; measured anyway), (2) frame intervals around a save (before / during), (3) the save's own numbers
// (bytes, worst main-thread slice, worker time), (4) 34 saves in a row: the storage cap holds at 30 and the
// JS heap stays flat. Usage: MAC=1 node web/scripts/clips-perf.mjs <baseUrl> [saves=34]
import { chromium } from '@playwright/test';
import { SCENARIOS } from './camscenarios.mjs';

const [base = 'http://localhost:5205/', savesArg = '34', scen = 'cliff360'] = process.argv.slice(2);
const args = process.env.MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-precise-memory-info'] : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-precise-memory-info'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) failed++; };
const boot = async () => {
  await page.goto(`${base}?${SCENARIOS[scen].query || 'map=valcrest-gully&kicker=2'}&ride`, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sendit?.game?.mode === 1 && window.__thrill, null, { timeout: 400000 });
};
await boot();
await page.evaluate(() => new Promise((res) => { localStorage.removeItem('sendit.highlights'); const r = indexedDB.deleteDatabase('sendit-highlights'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
await boot();
await page.evaluate(() => { window.__keep = setInterval(() => { if (window.__sendit.game.mode === 2) window.__sendit.ui.h.resume(); }, 50); });
await page.waitForTimeout(3000);

// (1) recorder cost per frame.
const rec = await page.evaluate(() => new Promise((res) => {
  const r = window.__thrill.replay, orig = r.record.bind(r), t = [];
  r.record = (dt) => { const a = performance.now(); orig(dt); t.push(performance.now() - a); };
  setTimeout(() => { r.record = orig; t.sort((a, b) => a - b); res({ n: t.length, mean: t.reduce((a, b) => a + b, 0) / t.length, p95: t[Math.floor(t.length * 0.95)], max: t[t.length - 1] }); }, 4000);
}));
check('recorder costs well under a millisecond per frame', rec.mean < 0.5, JSON.stringify(Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, +v.toFixed(3)]))));

// A trick to save.
await page.evaluate((src) => { window.__done = false; const s = window.__sendit, pl = s.player, snap = () => {}; new Function('s', 'pl', 'snap', src)(s, pl, snap); }, SCENARIOS[scen].setup);
await page.waitForFunction(() => window.__done, null, { timeout: 60000 }).catch(() => {});
await page.evaluate(() => { window.__sendit.player.script = (c) => { c.brake = 0.3; }; });
await page.waitForFunction(() => window.__thrill.highlights.debug().cand, null, { timeout: 20000 }).catch(() => {});
check('a trick to save', await page.evaluate(() => !!window.__thrill.highlights.debug().cand), JSON.stringify(await page.evaluate(() => window.__thrill.highlights.debug())));

// (2) frame intervals: 2 s windows alternating "just riding" and "from the save key" (three each), so a
// hitch from the world (terrain streaming, GC) shows up in both groups and one from saving only in one.
const frames = await page.evaluate(() => new Promise((res) => {
  const iv = [], windows = [];
  let last = performance.now();
  const start = last;
  const loop = (now) => { iv.push([now - start, now - last]); last = now; if (now - start < 12000) requestAnimationFrame(loop); else res({ iv, windows }); };
  requestAnimationFrame(loop);
  for (let k = 0; k < 6; k++) setTimeout(() => {
    const save = k % 2 === 1;
    windows.push([performance.now() - start, save]);
    if (save) { const h = window.__thrill.highlights; h._resaveForTest(); h.save(); }
  }, k * 2000);
}));
const stat = (a) => { const s = a.map((x) => x[1]).sort((x, y) => x - y); return { n: s.length, med: +s[Math.floor(s.length / 2)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) }; };
const groupOf = (t) => { let g = null; for (const [w, save] of frames.windows) if (t >= w) g = save; return g; };
const ride = stat(frames.iv.filter(([t]) => groupOf(t) === false)), saving = stat(frames.iv.filter(([t]) => groupOf(t) === true));
console.log('frame ms, just riding', JSON.stringify(ride), '· from the save key', JSON.stringify(saving));
console.log('frames > 40 ms [ms into the run, frame ms, during a save?]', JSON.stringify(frames.iv.filter(([, d]) => d > 40).map(([t, d]) => [Math.round(t), Math.round(d), groupOf(t)])));
check('saving adds no long frame (p95 within 2 ms of just riding, max within 1.5× + 8 ms)', saving.p95 <= ride.p95 + 2 && saving.max <= ride.max * 1.5 + 8, `p95 ${saving.p95} vs ${ride.p95}, max ${saving.max} vs ${ride.max}`);
await page.waitForFunction(() => window.__thrill.highlights.stats.lastSave, null, { timeout: 20000 }).catch(() => {});
const st = await page.evaluate(() => window.__thrill.highlights.stats);
console.log('save', JSON.stringify(st.lastSave), 'patch slice max', st.patchSliceMaxMs, 'ms · ring copy', st.copyMs, 'ms');
check('a clip is small (< 80 KB)', st.lastSave?.bytes < 80000, `${st.lastSave?.bytes} bytes`);

// (4) many saves: cap and memory.
const N = Number(savesArg);
const mem0 = await page.evaluate(() => performance.memory?.usedJSHeapSize || 0);
for (let i = 0; i < N; i++) {
  await page.evaluate(async () => { const h = window.__thrill.highlights, n = h.stats.saves; h._resaveForTest(); h.save(); const t = performance.now(); while (h.stats.saves === n && performance.now() - t < 15000) await new Promise((r) => setTimeout(r, 50)); });
}
await page.evaluate(() => (window.gc ? window.gc() : 0));
await page.waitForTimeout(1500);
const after = await page.evaluate(async () => {
  const { listClips } = await import('/src/thrill/clipstore.js');
  const l = await listClips();
  return { count: l.length, idx: JSON.parse(localStorage.getItem('sendit.highlights')).clips.length, mem: performance.memory?.usedJSHeapSize || 0, saves: window.__thrill.highlights.stats.saves };
});
if (N + 4 >= 30) check(`${N} more saves keep 30 clips (oldest dropped), index in step`, after.count === 30 && after.idx === 30, JSON.stringify(after));
check('heap stays flat over the saves (< +25 MB)', after.mem - mem0 < 25e6, `${((after.mem - mem0) / 1e6).toFixed(1)} MB`);
const errs = errors.filter((e) => !/favicon|404/.test(e));
check('no console errors', !errs.length, errs.slice(0, 3).join(' | '));
await browser.close();
process.exit(failed ? 1 : 0);
