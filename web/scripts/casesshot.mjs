// Capture the case opening on the real GPU: screenshots at chosen moments plus the per-frame reel
// trace (position, speed, card under the marker) and tick times, to check timing and easing frame by
// frame against CS2 (docs/rewards.md). Usage:
//   GPU=1 node scripts/casesshot.mjs <url> <outDir> [seed] [times]   times: comma list of seconds
// Env: W, H viewport (default 1280×720), RARITY=epic (pick the first seed whose pull is that grade),
//      NEAR=1 (only a seed with a near miss), EQUIP=1 (click Equip now and shoot the rider),
//      SEEK=1 (freeze the show at each time before the shot: exact reel frames; screenshots stall
//      the page, so the timing trace comes from a run without SEEK and without times: times='').
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url = 'http://localhost:5193/', outDir = 'cases-shots', seedArg = '', timesArg = '0.3,1.2,1.8,2.15,2.4,2.8,3.5,4.5,6,7.5,8.1,8.75,9.3,10.5'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });
await page.evaluate(() => { window.__sendit.lobby.select('cases'); });
// Pick a seed: as given, or the first one that rolls the wanted grade (and a near miss).
const seed = await page.evaluate(async ({ seedArg, want, near }) => {
  const s = window.__sendit;
  const R = await import('/src/profile/rewards.js');
  s.profile.grantCase('test', 'first-chair');
  s.profile.grantCase('test', 'night-park');
  if (seedArg) return Number(seedArg);
  for (let k = 1; k < 20000; k++) {
    const rng = R.seeded(k);
    const res = R.rollCase('first-chair', rng);
    const reel = R.buildReel(res, 'first-chair', rng);
    if ((!want || res.rarity === want) && (!near || reel.nearMiss)) return k;
  }
  return 1;
}, { seedArg, want: process.env.RARITY || '', near: !!process.env.NEAR });
console.log('seed', seed);
await page.waitForTimeout(800);
const times = timesArg.split(',').filter(Boolean).map(Number);
const t0 = Date.now();
await page.evaluate((seed) => { window.__senditCasesApi.open(null, seed); }, seed);
const shots = [];
for (const t of times) {
  if (process.env.SEEK) {
    await page.evaluate((t) => window.__senditCases.opener.seek(t), t);
    await page.waitForTimeout(t > 8.5 ? 900 : 150);
  } else {
    const wait = t * 1000 - (Date.now() - t0);
    if (wait > 0) await page.waitForTimeout(wait);
  }
  const at = await page.evaluate(() => { const o = window.__senditCases?.opener; return o ? (performance.now() - o.t0) / 1000 : -1; });
  const f = `${outDir}/open-${t.toFixed(2)}.png`;
  await page.screenshot({ path: f });
  shots.push({ want: t, at: +at.toFixed(2), file: f });
}
if (!times.length) await page.waitForTimeout(10000);
await page.evaluate(() => window.__senditCases.opener.seek(null));
await page.waitForTimeout(500);
const data = await page.evaluate(() => {
  const o = window.__senditCases.opener;
  const r = window.__senditCases.result;
  return { trace: o.trace, ticks: o.ticks, x0: o.x0, x1: o.x1, pitch: o.pitch, cw: o.cw, rarity: r.rarity, key: r.key, nearMiss: r.reel.nearMiss, stop: r.reel.stop, dupe: r.dupe };
});
if (process.env.EQUIP) {
  await page.click('.cr-btn[data-act="equip"]').catch(() => page.click('.cr-btn[data-act="close"]'));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/equipped.png` });
}
fs.writeFileSync(`${outDir}/trace.json`, JSON.stringify(data));
console.log(JSON.stringify({ shots, rarity: data.rarity, key: data.key, nearMiss: data.nearMiss, stop: data.stop, frames: data.trace.length, ticks: data.ticks.length }));
console.log(`errors: ${errors.length}`, errors.slice(0, 5).join('\n'));
await browser.close();
