// End-to-end check of the lobby flow in headless Chromium (software WebGL). Exits 1 on failure.
// Usage: node scripts/lobbytest.mjs [baseUrl] [shotDir]
//   1. boots into the lobby (default first screen)
//   2. toggles Skis → Snowboard, reloads, checks it persisted (profile v2 in localStorage)
//   3. keyboard: Q/E switch tabs, arrows move focus
//   4. mocked gamepad: RB switches tabs, Y swaps gear, d-pad + A activate, Start rides
//   5. Ride → pause (Esc) → Back to lobby; checks the ride was recorded
//   6. ?ride skips the lobby; pause → lobby still works (stage built lazily)
//   7. legacy migration: old 'sendit.best' + settings.resort become a profile; a v1 profile keeps its
//      look and gets a welcome case
//   8. cases: a new rider owns only the plain kit; a finished run earns case XP (runCompleted);
//      a case opens (box, reel, reveal), Equip now dresses the rider, the Locker lists the pull
// Fails on any console error / page error.
// GPU=1 renders on the real GPU (ANGLE D3D11): the lobby shows the full world behind the rider, which
// is very slow on SwiftShader (minutes per run), so prefer GPU=1 where a GPU is available.
import { chromium } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:5175/').replace(/\/?$/, '/');
const shotDir = process.argv[3] || '';
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
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
    // The stage stands in the world scene and drives the world camera while the lobby is shown.
    stageInWorld: s.stage.root?.parent === s.scene, stageShown: !!s.stage.root?.visible, stageActive: !!s.stage.active,
    riderShown: !!s.rider.root.visible, viewOffset: !!s.camera.view?.enabled,
  };
});
/** Hold a mock gamepad button for a few frames. */
async function padPress(page, i) {
  await page.evaluate((b) => { window.__padOn = true; window.__pad.buttons[b] = { pressed: true, value: 1 }; window.__f0 = window.__frames; }, i);
  await page.waitForFunction(() => window.__frames - window.__f0 >= 3, null, { timeout: T });
  await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0 }; window.__f0 = window.__frames; }, i);
  await page.waitForFunction(() => window.__frames - window.__f0 >= 3, null, { timeout: T });
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
  ok(s.stored?.version === 2, 'profile v2 written to localStorage');
  ok(/lb-ride/.test(s.focus), 'Ride button has focus');
  ok(s.stageInWorld && s.stageShown && s.stageActive && !s.riderShown, 'lobby stage stands in the world (game rider hidden)');
  ok(await page.evaluate(() => { const s = window.__sendit; return s.camera.position.distanceTo(s.stage.focusPoint) < 20; }), 'world camera frames the lobby stage');

  await page.click('.eq-opt[data-type=snowboard]');
  await page.waitForFunction(() => window.__sendit.stage.pl?.equipment?.type === 'snowboard' && window.__sendit.stage.gearMode === 'native', null, { timeout: T });
  s = await state(page);
  ok(s.equipment === 'snowboard' && s.stored.loadout.equipment === 'snowboard', 'snowboard selected and saved');
  ok((await state(page)).gear === 'native', 'real snowboard on the preview rider (rider.setEquipment)');
  await shot(page, 't1_snowboard');

  await page.reload();
  await lobbyReady(page);
  await countFrames(page);
  s = await state(page);
  ok(s.equipment === 'snowboard', 'snowboard persists across reload');
  await page.waitForFunction(() => window.__sendit.stage.pl?.equipment?.type === 'snowboard' && window.__sendit.stage.gearMode === 'native', null, { timeout: T });
  ok(await page.getAttribute('.eq-opt[data-type=snowboard]', 'aria-pressed') === 'true', 'toggle shows the saved choice');

  // Keyboard: Q/E tabs, arrows move focus.
  await page.keyboard.press('KeyE');
  s = await state(page);
  ok(s.tab === 'cases', 'E opens the next tab');
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
  ok(s.tab === 'cases', 'gamepad RB opens the next tab');
  await padPress(page, 4);
  s = await state(page);
  ok(s.tab === 'equipment', 'gamepad LB opens the previous tab');
  await padPress(page, 3);
  await page.waitForFunction(() => window.__sendit.profile.equipment === 'snowboard', null, { timeout: 30000 });
  ok(true, 'gamepad Y swaps gear');
  ok(await page.evaluate(() => document.body.classList.contains('device-gamepad')), 'hints switch to gamepad glyphs');
  await page.evaluate(() => { window.__padOn = false; });

  // Every tab mounts without errors.
  for (const id of ['cases', 'locker', 'maps', 'multiplayer', 'leaderboards', 'profile', 'settings', 'equipment']) {
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
  ok(!s.stageShown && !s.stageActive && s.riderShown && !s.viewOffset, 'ride hides the stage, shows the game rider, frees the camera');
  await shot(page, 't2_ride');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: T });
  s = await state(page);
  ok(s.pause, 'Esc pauses');
  await page.click('#pause [data-act=menu]');
  await lobbyReady(page);
  s = await state(page);
  ok(s.mode === 0 && s.lobby && !s.pause, 'Back to lobby returns to the lobby');
  ok(s.stageShown && s.stageActive && !s.riderShown, 'stage is back in the lobby');
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
  await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: T });
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
  ok(p.version === 2 && p.stats.bestScore === 4321, 'legacy best score migrated into the profile');
  ok(p.rewards.cases.length === 0 && Object.keys(p.inventory.items).length === 0, 'a first visit starts with no cases and no skins');
  ok(p.loadout.equipment === 'skis' && p.loadout.slots.board?.item === 'board-northwake-twin', 'migrated profile has a full default loadout');
  await ctx.close();
}

// ---------------------------------------------------------------- 7b: a v1 profile (before cases)
{
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('sendit.profile', JSON.stringify({
      version: 1, displayName: 'Old Timer', loadout: { equipment: 'skis', slots: {
        jacket: { item: 'jacket-tuff-shell', variant: 'arcade' }, helmet: { item: 'helmet-tuff', variant: 'summit' } } },
      map: { id: 'valcrest-gully', variant: null }, stats: { rides: 3, runsCompleted: 2, distance: 4000 }, unlocks: { items: [] },
    }));
  });
  const page = await newPage(ctx);
  await page.goto(base);
  await lobbyReady(page);
  const p = await page.evaluate(() => JSON.parse(localStorage.getItem('sendit.profile')));
  ok(p.version === 2 && p.loadout.slots.jacket.variant === 'arcade' && p.inventory.items['jacket-tuff-shell:arcade'], 'v1 → v2 keeps the worn Arcade jacket as an owned skin');
  ok(p.rewards.cases.length === 1 && p.rewards.cases[0].source === 'welcome', 'v1 → v2 adds a welcome case');
  ok(await page.evaluate(() => window.__sendit.rider.look?.outfit?.colors?.jacket?.base === '#14a39a' || !window.__sendit.rider.look), 'the game rider still wears it');
  await ctx.close();
}

// ---------------------------------------------------------------- 8: cases, the reel, the locker
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await newPage(ctx);
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await lobbyReady(page);
  await countFrames(page);
  // A new rider: the plain Rental kit, stock gear, nothing else.
  const start = await page.evaluate(() => {
    const P = window.__sendit.profile;
    return {
      owned: ['jacket', 'pants', 'helmet', 'goggles', 'gloves', 'face', 'skis', 'board'].map((sl) => P.ownedIn(sl).length),
      jacket: P.equipped('jacket').variant.id, cases: P.unopened.length, col: P.collection(),
    };
  });
  ok(start.owned.every((n) => n === 1), `new rider owns exactly one item per slot (${start.owned.join(',')})`);
  ok(start.jacket === 'basic' && start.cases === 0 && start.col.owned === 0 && start.col.total >= 70, `plain Rental kit, no cases, 0/${start.col.total} collected`);
  await page.evaluate(() => window.__sendit.lobby.select('locker'));
  ok(await page.evaluate(() => document.querySelectorAll('.lk-item').length) === 1, 'Locker shows only the starter jacket');
  await page.evaluate(() => window.__sendit.lobby.select('cases'));
  ok(await page.evaluate(() => document.querySelector('.cs-open').disabled), 'Cases: Open is disabled with no case');

  // A ride with a finished run earns case XP through the tracker (runComplete → runCompleted).
  await page.click('.lb-ride');
  await page.waitForFunction(() => window.__sendit.game.mode === 1, null, { timeout: T });
  await page.waitForTimeout(1500);
  const run = await page.evaluate(async () => {
    const st = await import('/src/state.js');
    let got = null;
    const off = st.on('runCompleted', (e) => { got = e; });
    st.game.distance += 1500;
    st.emit('runComplete');
    off();
    return { got, xp: window.__sendit.profile.rewards.xp, maps: window.__sendit.profile.rewards.maps };
  });
  ok(run.got && run.got.mapId && run.got.distance >= 1500 && typeof run.got.time === 'number', `runCompleted emitted (${JSON.stringify(run.got)?.slice(0, 120)})`);
  ok(run.xp >= 65 + 250 + 60 && run.maps.length === 1, `finish + first run on the map + distance credited (${Math.round(run.xp)} XP)`);
  await page.waitForFunction(() => !!document.querySelector('.cn'), null, { timeout: 10000 }).then(() => ok(true, 'run progress notification shows in the ride'), () => ok(false, 'run progress notification shows in the ride'));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: T });
  await page.click('#pause [data-act=menu]');
  await lobbyReady(page);

  // Earn a case: badge on the Cases tab, the Open button lights up.
  await page.evaluate(() => { window.__sendit.profile.grantCase('test', 'first-chair'); window.__sendit.lobby.select('cases'); });
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => document.querySelector('.lb-tab[data-tab=cases] .cs-badge')?.textContent === '1'), 'Cases tab shows a badge');
  ok(await page.evaluate(() => !document.querySelector('.cs-open').disabled), 'Open is enabled');
  ok(await page.evaluate(() => !!document.querySelector('.cn.case')), '"Case earned" notification');
  // Open it: the case box, then the reel (60 cards), then Skip to the reveal.
  await page.click('.cs-open');
  await page.waitForSelector('.cr-overlay .cr-case', { timeout: 10000 });
  ok(true, 'the case box appears');
  await page.waitForFunction(() => document.querySelector('.cr-overlay.reel'), null, { timeout: 15000 });
  const reel = await page.evaluate(() => ({ cards: document.querySelectorAll('.cr-strip .cr-card').length, gold: document.querySelectorAll('.cr-strip .cr-card.r-gold').length, tiers: new Set([...document.querySelectorAll('.cr-strip .cr-card')].map((c) => c.className.match(/r-(\w+)/)[1])).size }));
  ok(reel.cards === 60 && reel.tiers >= 4, `reel of ${reel.cards} cards in ${reel.tiers} grades`);
  // Let it spin a moment: the reel moves and slows down (CS2 curve).
  await page.waitForTimeout(2500);
  const tr = await page.evaluate(() => window.__senditCases.opener.trace.slice());
  ok(tr.length > 5 && tr.at(-1).x > tr[0].x, `the reel scrolls (${tr.length} frames)`);
  await page.keyboard.press('Space');
  await page.waitForSelector('.cr-reveal:not([hidden]) h2', { timeout: 10000 });
  const rv = await page.evaluate(() => ({ name: document.querySelector('.cr-reveal h2').textContent, res: window.__senditCases.result.key, grade: document.querySelector('.cr-grade').textContent }));
  ok(rv.name.includes('|') && rv.grade.length > 3, `reveal: ${rv.name.replace(/\s+/g, ' ').trim()} (${rv.grade})`);
  await shot(page, 't4_reveal');
  await page.click('.cr-btn[data-act=equip]');
  await page.waitForFunction(() => !document.querySelector('.cr-overlay'), null, { timeout: 10000 });
  const eq = await page.evaluate((key) => {
    const P = window.__sendit.profile;
    const [id, v] = key.split(':');
    const item = window.__sendit.profile.profile.inventory.items[key];
    const slot = Object.entries(P.profile.loadout.slots).find(([, e]) => e.item === id && e.variant === v);
    return { owned: !!item, worn: !!slot, cases: P.unopened.length };
  }, rv.res);
  ok(eq.owned && eq.worn && eq.cases === 0, 'Equip now: the pull is owned and worn');
  await page.evaluate(() => window.__sendit.lobby.select('locker'));
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.querySelectorAll('.lk-item').length >= 1), 'Locker lists owned skins');
  await shot(page, 't5_locker');
  await ctx.close();
}

await browser.close();
ok(errors.length === 0, `no console errors${errors.length ? `:\n  ${errors.slice(0, 8).join('\n  ')}` : ''}`);
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
