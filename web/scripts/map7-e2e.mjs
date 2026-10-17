// Fjordline end to end in the real game (dev server, real GPU): boots ?map=fjordline&trail=brygga&ride, then
//   1. launches the rider off the outer beach into the fjord: a fjordSplash, the real fade, back on dry land;
//   2. rides the last stretch of Brygga into the finish: 'RUN COMPLETE', exactly one runCompleted for fjordline
//      (the ride tracker's and the map's own are deduplicated), with the contract fields;
//   3. no console errors.
// Usage: node web/scripts/map7-e2e.mjs [baseUrl]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5196'] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
await page.goto(`${base}/?map=fjordline&trail=brygga&ride`);
await page.waitForFunction(() => window.__sendit && window.__post && window.__sendit.player.state === 1, null, { timeout: 400000 });
await page.waitForTimeout(1500);
let fails = 0;
const ok = (name, cond, info = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); };

const spawn = await page.evaluate(() => { const p = window.__sendit.player.position; return { x: p.x, z: p.z }; });
ok('the ride starts at the Brygga trail top', Math.hypot(spawn.x - (-1380 + 1570), spawn.z - -70) < 30, JSON.stringify(spawn));

// 1. Off the end of the pier.
const splash = await page.evaluate(async () => {
  const s = window.__sendit, pl = s.player;
  const evs = [];
  const { on } = await import('/src/state.js');
  const off = on('fjordSplash', (e) => evs.push(e));
  // The outer coast right of the headland (before the finish line): a beach, then the fjord.
  const same = (await import('/src/state.js')).game === s.game;
  pl.place({ x: -1380 + 1905, z: 900 }, -Math.PI / 2);
  pl.velocity.set(14, 0, 0); pl.speed = 14;
  pl.script = (c) => { c.tuck = 1; };
  await new Promise((r) => setTimeout(r, 4500));
  off(); pl.script = null;
  const P = pl.position;
  return { n: evs.length, x: P.x, z: P.z, ground: s.course.height(P.x, P.z) - 1850, state: pl.state, same };
});
ok('into the fjord: a splash', splash.n >= 1, `${splash.n} (one bus: ${splash.same})`);
ok('…then back on dry land (after the fade)', splash.ground > 1.0 && splash.state !== 3, `${splash.ground.toFixed(1)} m above the sea, u ${(splash.x + 1380).toFixed(0)}`);

// 2. Into the finish.
const fin = await page.evaluate(async () => {
  const s = window.__sendit, pl = s.player;
  const { on } = await import('/src/state.js');
  const evs = [], done = [];
  const o1 = on('runCompleted', (e) => evs.push(e)), o2 = on('runComplete', () => done.push(1));
  pl.place({ x: -1380 + 2395, z: -150 }, -Math.PI / 2);
  pl.velocity.set(11, 0, 0); pl.speed = 11;
  const trace = [];
  for (let k = 0; k < 14; k++) { await new Promise((r) => setTimeout(r, 500)); trace.push(`${Math.round(s.course.progress(pl.position.x, pl.position.z))}/${pl.speed.toFixed(1)}/${pl.state}/${s.game.mode}`); }
  o1(); o2();
  return { complete: done.length, events: evs.filter((e) => e.mapId === 'fjordline'), trace: trace.join(' ') };
});
ok('crossing the line completes the run', fin.complete === 1, `${fin.complete}; progress/speed/state/mode ${fin.trace}`);
ok('exactly one runCompleted for fjordline, with the contract fields', fin.events.length === 1 && ['distance', 'time', 'score'].every((k) => Number.isFinite(fin.events[0][k])) && typeof fin.events[0].trailId === 'string', JSON.stringify(fin.events));
ok('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
await browser.close();
console.log(fails ? `FAIL (${fails})` : 'all checks passed');
process.exit(fails ? 1 : 0);
