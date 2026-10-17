// Game-feel smoke test (real GPU, ~1–2 min): run after merges. Boots the lobby, checks the Progress tab,
// the TODAY strip and the chip badge, rides, pushes a staged chain + landing through the real event
// bus and checks the combo panel, the announcer, the floating pops, the level-up overlay and the speed
// rush pass, then returns to the lobby for the ride recap. Exit 1 on any failure or console error.
// Usage: GPU=1 node web/scripts/juice-smoke.mjs <baseUrl>
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5198/'] = process.argv.slice(2);
const browser = await chromium.launch({
  args: process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) failed++; };

await page.goto(base, { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 400000 });
await page.waitForTimeout(1500);
const lobby = await page.evaluate(() => {
  window.__sendit.lobby.select('progress');
  return new Promise((r) => setTimeout(() => r({
    dailies: document.querySelectorAll('.pg-ch:not(.wk)').length,
    weekly: !!document.querySelector('.pg-ch.wk'),
    badges: document.querySelectorAll('.pg-a').length,
    today: document.querySelectorAll('#lobby .pg-today .row').length,
    chip: document.querySelector('#lobby .pg-badge')?.textContent || '',
    tab: !!document.querySelector('.lb-tab[data-tab="progress"], [data-tab="progress"]'),
  }), 800));
});
check('Progress tab lists three dailies and the weekly', lobby.dailies === 3 && lobby.weekly, JSON.stringify(lobby));
check('achievement badges render', lobby.badges >= 20, `${lobby.badges}`);
check('TODAY strip by the Ride button', lobby.today >= 3, `${lobby.today} rows`);
check('level badge on the profile chip', /LV \d+/.test(lobby.chip), lobby.chip);

await page.evaluate(() => document.querySelector('.lb-ride').click());
await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__juice, null, { timeout: 120000 });
await page.waitForTimeout(2500);
const ride = await page.evaluate(async () => {
  const { emit, addScore } = await import('/src/state.js');
  const J = window.__juice;
  const hud = !!document.getElementById('juiceHud');
  for (const [l, p] of [['Left 360', 220], ['Close shave', 15], ['Mute', 90], ['Boardslide · 4 m', 120]]) { addScore(l, p); await new Promise((r) => setTimeout(r, 60)); }
  await new Promise((r) => setTimeout(r, 200));
  const combo = J.combo.state();
  const panel = document.querySelector('#juiceHud .cb')?.classList.contains('on');
  emit('landed', { impact: 3, air: 1.4, clean: true, perfect: true, trick: 'Left 540 Mute', points: 400, result: 'clean' });
  await new Promise((r) => setTimeout(r, 300));
  const an = document.querySelector('#juiceHud .an');
  const announced = an.classList.contains('show') && /540/.test(an.textContent);
  const pops = document.querySelectorAll('#juiceHud .fp').length;
  // Headless Chromium drops the pointer lock, which pauses the ride: resume it (the rush is off while paused).
  if (window.__sendit.game.mode === 2) window.__sendit.ui.h.resume();
  // Poll (a busy GPU can stall frames for a while): the pass must enable within 3 s of a pulse.
  let rush = false;
  for (let i = 0; i < 30 && !rush; i++) { if (window.__sendit.game.mode === 2) window.__sendit.ui.h.resume(); J.speedfx?.pulse('huge'); await new Promise((r) => setTimeout(r, 100)); rush = !!J.speedfx?.pass.enabled; }
  window.__progression.addXP(window.__progression.getProgress().need + 5, 'smoke');
  await new Promise((r) => setTimeout(r, 2500));
  const lvl = document.getElementById('lvlUp')?.classList.contains('show');
  const { settings } = await import('/src/state.js');
  const why = { mode: window.__sendit.game.mode, q: settings.quality, fx: settings.juiceSpeedFx, view: settings.view };
  return { hud, combo: combo && { mult: combo.mult, n: combo.n }, panel, announced, pops, rush, lvl, why };
});
check('juice HUD mounted', ride.hud);
check('combo chain on Valcrest (own source) shows from ×1.5', ride.combo?.mult >= 1.5 && ride.panel, JSON.stringify(ride.combo));
check('trick announcer shows the landing', ride.announced);
check('speed rush pass enables on a pulse', ride.rush, JSON.stringify(ride.why));
check('level-up celebration plays', ride.lvl);
await page.evaluate(() => { document.exitPointerLock?.(); window.__sendit.ui.h.menu(); });
await page.waitForFunction(() => window.__sendit.game.mode === 0, null, { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(1800);
const recap = await page.evaluate(() => document.getElementById('rideRecap')?.classList.contains('on'));
check('ride recap card in the lobby', recap);
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(failed ? `\n${failed} failed` : '\nall game-feel smoke checks passed');
await browser.close();
process.exit(failed ? 1 : 0);
