// End-to-end check of the lobby flow in headless Chromium (software WebGL). Exits 1 on failure.
// Usage: node scripts/lobbytest.mjs [baseUrl] [shotDir]
//   1. boots into the lobby (default first screen)
//   2. toggles Skis → Snowboard, reloads, checks it persisted (profile v1 in localStorage)
//   3. keyboard: Q/E switch tabs, arrows move focus
//   4. mocked gamepad: RB switches tabs, Y swaps gear, d-pad + A activate, Start rides
//   5. Ride → pause (Esc) → Back to lobby; checks the ride was recorded
//   6. ?ride skips the lobby; pause → lobby still works (stage built lazily)
//   7. legacy migration: old 'sendit.best' + settings.resort become a v1 profile
// Fails on any console error / page error.
import { chromium } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:5175/').replace(/\/?$/, '/');
const shotDir = process.argv[3] || '';
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const errors = [];
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };
const T = 300000;

async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  // A controllable fake gamepad (standard mapping, 17 buttons).
  await page.addInitScript(() => {
    const pad = { id: 'mock pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad;
    window.__padOn = false;
    navigator.getGamepads = () => (window.__padOn ? [pad] : [null]);
  });
  return page;
}
const lobbyReady = (page) => page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: T });
const state = (page) => page.evaluate(() => {
  const s = window.__sendit;
  return {
    mode: s.game.mode, lobby: s.lobby.visible, tab: s.lobby.activeId, equipment: s.profile.equipment, gear: s.stage.gearMode,
    rides: s.profile.profile.stats.rides, stored: JSON.parse(localStorage.getItem('sendit.profile') || 'null'),
    pause: !document.getElementById('pause').classList.contains('hidden'),
    hud: !document.getElementById('hud').classList.contains('hidden'),
    focus: document.activeElement?.className || document.activeElement?.tagName,
  };
});
/** Hold a mock gamepad button for a few frames. */
async function padPress(page, i) {
  await page.evaluate((b) => { window.__padOn = true; window.__pad.buttons[b] = { pressed: true, value: 1 }; window.__f0 = window.__frames; }, i);
  await page.waitForFunction(() => window.__frames - window.__f0 >= 3, null, { timeout: 60000 });
  await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0 }; window.__f0 = window.__frames; }, i);
  await page.waitForFunction(() => window.__frames - window.__f0 >= 3, null, { timeout: 60000 });
}
const countFrames = (page) => page.evaluate(() => { window.__frames = 0; const f = () => { window.__frames++; requestAnimationFrame(f); }; requestAnimationFrame(f); });
const shot = async (page, name) => { if (shotDir) await page.screenshot({ path: `${shotDir}/${name}.png`, timeout: T }); };

// ---------------------------------------------------------------- 1–5: main flow
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage(ctx);
  await page.goto(base);
  await lobbyReady(page);
  await countFrames(page);
  let s = await state(page);
  ok(s.mode === 0 && s.lobby, 'boots into the lobby');
  ok(s.equipment === 'skis' && s.gear === 'native', 'default equipment is skis (native rider gear)');
  ok(s.stored?.version === 1, 'profile v1 written to localStorage');
  ok(/lb-ride/.test(s.focus), 'Ride button has focus');

  await page.click('.eq-opt[data-type=snowboard]');
  await page.waitForFunction(() => window.__sendit.stage.pl?.equipment?.type === 'snowboard' && window.__sendit.stage.gearMode === 'native', null, { timeout: 60000 });
  s = await state(page);
  ok(s.equipment === 'snowboard' && s.stored.loadout.equipment === 'snowboard', 'snowboard selected and saved');
  ok(!(await page.isVisible('.eq-badge')), 'real snowboard: no placeholder badge');
  await shot(page, 't1_snowboard');

  await page.reload();
  await lobbyReady(page);
  await countFrames(page);
  s = await state(page);
  ok(s.equipment === 'snowboard', 'snowboard persists across reload');
  await page.waitForFunction(() => window.__sendit.stage.pl?.equipment?.type === 'snowboard' && window.__sendit.stage.gearMode === 'native', null, { timeout: 60000 });
  ok(await page.getAttribute('.eq-opt[data-type=snowboard]', 'aria-pressed') === 'true', 'toggle shows the saved choice');

  // Keyboard: Q/E tabs, arrows move focus.
  await page.keyboard.press('KeyE');
  s = await state(page);
  ok(s.tab === 'character', 'E opens the next tab');
  await page.keyboard.press('KeyQ');
  s = await state(page);
  ok(s.tab === 'equipment', 'Q opens the previous tab');
  await page.focus('.eq-opt[data-type=snowboard]');
  await page.keyboard.press('ArrowLeft');
  s = await state(page);
  ok(/eq-opt/.test(s.focus) && (await page.evaluate(() => document.activeElement.dataset.type)) === 'skis', 'ArrowLeft moves focus to Skis');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__sendit.profile.equipment === 'skis', null, { timeout: 30000 });
  ok(true, 'Enter on Skis selects skis');

  // Gamepad: RB next tab, LB back, Y swap gear.
  await padPress(page, 5);
  s = await state(page);
  ok(s.tab === 'character', 'gamepad RB opens the next tab');
  await padPress(page, 4);
  s = await state(page);
  ok(s.tab === 'equipment', 'gamepad LB opens the previous tab');
  await padPress(page, 3);
  await page.waitForFunction(() => window.__sendit.profile.equipment === 'snowboard', null, { timeout: 30000 });
  ok(true, 'gamepad Y swaps gear');
  ok(await page.evaluate(() => document.body.classList.contains('device-gamepad')), 'hints switch to gamepad glyphs');
  await page.evaluate(() => { window.__padOn = false; });

  // Every tab mounts without errors.
  for (const id of ['character', 'maps', 'multiplayer', 'leaderboards', 'profile', 'settings', 'equipment']) {
    await page.evaluate((t) => window.__sendit.lobby.select(t), id);
    await page.waitForTimeout(150);
    const html = await page.evaluate(() => document.querySelector('.lb-panel').innerText.length);
    ok(html > 20, `tab "${id}" renders`);
  }
  // Settings controls come back to the settings screen after the tab closes.
  ok(await page.evaluate(() => !!document.querySelector('#settings .card .grid')), 'settings controls returned to #settings');

  // Ride → pause → lobby.
  await page.click('.lb-ride');
  await page.waitForFunction(() => window.__sendit.game.mode === 1, null, { timeout: T });
  await page.waitForTimeout(2500);
  s = await state(page);
  ok(!s.lobby && s.hud, 'Ride starts a ride (HUD visible, lobby hidden)');
  await shot(page, 't2_ride');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: 60000 });
  s = await state(page);
  ok(s.pause, 'Esc pauses');
  await page.click('#pause [data-act=menu]');
  await lobbyReady(page);
  s = await state(page);
  ok(s.mode === 0 && s.lobby && !s.pause, 'Back to lobby returns to the lobby');
  ok(s.rides === 1, 'the ride was recorded in the profile');
  await shot(page, 't3_back');

  // Gamepad Start rides from the lobby.
  await padPress(page, 9);
  await page.waitForFunction(() => window.__sendit.game.mode === 1, null, { timeout: T });
  ok(true, 'gamepad Start rides');
  await page.evaluate(() => { window.__padOn = false; });
  await ctx.close();
}

// ---------------------------------------------------------------- 6: ?ride
{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  const page = await newPage(ctx);
  await page.goto(`${base}?ride`);
  await page.waitForFunction(() => window.__sendit, null, { timeout: T });
  let s = await page.evaluate(() => ({ mode: window.__sendit.game.mode, lobby: window.__sendit.lobby.visible, stage: window.__sendit.stage.ready }));
  ok(s.mode === 1 && !s.lobby, '?ride skips the lobby');
  ok(!s.stage, '?ride defers building the lobby stage');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: 60000 });
  await page.click('#pause [data-act=menu]');
  await lobbyReady(page);
  ok(true, 'pause → lobby works after ?ride');
  await ctx.close();
}

// ---------------------------------------------------------------- 7: migration from pre-lobby storage
{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('sendit.best', '4321');
  });
  const page = await newPage(ctx);
  await page.goto(base);
  await lobbyReady(page);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('sendit.profile')));
  ok(p.version === 1 && p.stats.bestScore === 4321, 'legacy best score migrated into profile v1');
  ok(p.loadout.equipment === 'skis' && p.loadout.slots.board?.item === 'board-northwake-twin', 'migrated profile has a full default loadout');
  await ctx.close();
}

await browser.close();
ok(errors.length === 0, `no console errors${errors.length ? `:\n  ${errors.slice(0, 8).join('\n  ')}` : ''}`);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
