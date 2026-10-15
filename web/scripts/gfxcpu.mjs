// CPU profile of the main thread while riding: Chrome's sampling profiler over a few seconds, then
// (1) the average main-thread busy time per frame, (2) self time per function and (3) inclusive time
// of the per-frame subsystems called from main.js frame().
// Usage: node scripts/gfxcpu.mjs [baseUrl] [quality] [W H] [seconds]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5174', q = '2', W = '1600', H = '900', secs = '5'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
await page.goto(`${base}/?ride&quality=${q}`);
await page.waitForFunction(() => window.__sendit, null, { timeout: 300000 });
await page.keyboard.down('ArrowUp');
await page.waitForTimeout(5000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await page.evaluate(() => { window.__fc = 0; const f = () => { window.__fc++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const f0 = await page.evaluate(() => window.__fc);
await cdp.send('Profiler.start');
// Carve back and forth so spray / tracks are live.
for (let t = 0; t < Number(secs); t += 1) { const k = t % 2 ? 'a' : 'd'; await page.keyboard.down(k); await page.waitForTimeout(1000); await page.keyboard.up(k); }
const { profile } = await cdp.send('Profiler.stop');
const frames = (await page.evaluate(() => window.__fc)) - f0;
const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const c of n.children || []) parent.set(c, n.id);
const dts = profile.timeDeltas;
const selfT = new Map();
const nameOf = (n) => { const c = n.callFrame; return `${c.functionName || '(anon)'} ${c.url.split('/').pop().split('?')[0]}:${c.lineNumber + 1}`; };
const incl = new Map();
let busy = 0, total = 0;
const watch = ['step', 'update', 'render', 'interpolate', 'emit', 'flush', 'poll'];
profile.samples.forEach((id, i) => {
  const dt = (dts[i] || 0) / 1000;
  total += dt;
  const n = nodes.get(id);
  const nm = n.callFrame.functionName;
  if (nm !== '(idle)' && nm !== '(program)' && nm !== '(garbage collector)') busy += dt;
  if (nm === '(garbage collector)') { selfT.set('(gc)', (selfT.get('(gc)') || 0) + dt); return; }
  selfT.set(nameOf(n), (selfT.get(nameOf(n)) || 0) + dt);
  // Inclusive time of functions directly called from frame() in main.js.
  let cur = id, child = null;
  while (cur !== undefined) {
    const cn = nodes.get(cur);
    if (cn.callFrame.functionName === 'frame' && cn.callFrame.url.includes('main.js') && child !== null) {
      const k = nameOf(nodes.get(child));
      incl.set(k, (incl.get(k) || 0) + dt);
      break;
    }
    child = cur; cur = parent.get(cur);
  }
});
console.log(`quality ${q}: ${frames} frames in ${total.toFixed(0)} ms profiled → ${(total / frames).toFixed(2)} ms/frame wall, main thread busy ${(busy / frames).toFixed(2)} ms/frame`);
console.log('  per-frame subsystems (inclusive, ms/frame):');
for (const [k, v] of [...incl.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`    ${(v / frames).toFixed(3).padStart(7)}  ${k}`);
console.log('  top self time (ms/frame):');
for (const [k, v] of [...selfT.entries()].filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)')).sort((a, b) => b[1] - a[1]).slice(0, 22)) console.log(`    ${(v / frames).toFixed(3).padStart(7)}  ${k}`);
await browser.close();
