// Thrill smoke test (real game, ~2–3 min): spots on a real kicker landing, the replay prompt and an
// instant replay (rig frozen and restored), retry from the take-off, the quick restart, the Progress
// tab's spots list, adrenaline on the Ravenspire First Stack cliff, and a versus link (ghost, live gap,
// verdict row, share button). Screenshots of each go to <outDir>. Exit 1 on any failure or console error.
// Usage: node web/scripts/thrill-smoke.mjs <baseUrl> <outDir>     (macOS: MAC=1 uses ANGLE Metal; GPU=1 = Windows D3D11)
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { SCENARIOS } from './camscenarios.mjs';

const [base = 'http://localhost:5191/', out = '/tmp/thrill'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const args = process.env.MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
  : process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
page.on('dialog', (d) => d.dismiss().catch(() => {}));
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) failed++; };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);

async function boot(query) {
  await page.goto(`${base}?${query}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sendit?.game?.mode === 1 && window.__thrill, null, { timeout: 400000 });
  await page.evaluate(async () => {
    const { on } = await import('/src/state.js');
    window.__ev = [];
    for (const n of ['thrillSpot', 'thrillGap', 'thrillReplay', 'thrillRetry', 'thrillRestart', 'resetTop', 'landed', 'thrillVersus', 'takeoff']) on(n, (d) => window.__ev.push([n, performance.now(), d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : d]));
    // Headless drops the pointer lock, which pauses the ride: keep resuming.
    window.__keep = setInterval(() => { if (window.__sendit.game.mode === 2) window.__sendit.ui.h.resume(); }, 50);
  });
  await wait(2500);
}
async function scenario(name) {
  await page.evaluate((src) => { window.__done = false; const s = window.__sendit, pl = s.player, snap = () => {}; new Function('s', 'pl', 'snap', src)(s, pl, snap); }, SCENARIOS[name].setup);
  await page.waitForFunction(() => window.__done, null, { timeout: 60000 }).catch(() => {});
}
const ev = (n) => page.evaluate((n) => window.__ev.filter((e) => e[0] === n), n);

// ---------------------------------------------------------------- Valcrest: spot, replay, retry, restart
await boot('map=valcrest-gully&kicker=2&ride');
await scenario('spin360');
await wait(300);
const landed = (await ev('landed')).at(-1)?.[2];
const spot = (await ev('thrillSpot')).at(-1)?.[2];
check('kicker landing discovers a spot', !!spot && /Kicker/.test(spot.name), JSON.stringify({ spot, air: landed?.air, trick: landed?.trick, clean: landed?.clean }));
const prompt = await page.evaluate(() => document.getElementById('thrill-rp')?.classList.contains('on'));
check('replay prompt after the big landing', prompt, `air ${landed?.air?.toFixed?.(2)}`);
await shot('1-spot-toast-and-replay-prompt');
await page.evaluate(() => { window.__sendit.player.script = (c) => { c.brake = 1; }; });
await wait(600);
const before = await page.evaluate(() => { const p = window.__sendit.player.position; return [p.x, p.y, p.z]; });
await page.keyboard.press('Tab');
await wait(1300);
const mid = await page.evaluate(() => ({ active: window.__thrill.replay.active, bars: document.getElementById('thrill-replay')?.classList.contains('on'), hud: getComputedStyle(document.getElementById('hud')).visibility, cam: window.__sendit.camera.position.toArray() }));
check('Tab plays the replay letterboxed with the HUD hidden', mid.active && mid.bars && mid.hud === 'hidden', JSON.stringify(mid));
await shot('2-replay-drone');
await wait(1200);
await shot('3-replay-drone-later');
await page.waitForFunction(() => !window.__thrill.replay.active, null, { timeout: 20000 }).catch(() => {});
const after = await page.evaluate(() => { const p = window.__sendit.player.position; return [p.x, p.y, p.z]; });
const moved = Math.hypot(after[0] - before[0], after[2] - before[2]);
check('replay ends and the ride was frozen meanwhile', !(await page.evaluate(() => window.__thrill.replay.active)) && moved < 3, `moved ${moved.toFixed(2)} m`);
await wait(500);
await shot('4-after-replay');
// Retry from the take-off.
await page.evaluate(() => { window.__sendit.player.script = null; });
await page.keyboard.press('Backspace');
await wait(700);
const retry = (await ev('thrillRetry')).at(-1)?.[2];
const k = await page.evaluate(() => { const k = window.__sendit.features.kickers[2], p = window.__sendit.player.position; return { a: (p.x - k.o.x) * k.f.x + (p.z - k.o.y) * k.f.y }; });
check('Backspace retries on the approach with speed', !!retry && retry.speed > 5 && k.a < 0 && k.a > -60, JSON.stringify({ retry, a: k.a }));
await shot('5-retry-on-approach');
// Quick restart.
const t0 = await page.evaluate(() => performance.now());
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__ev.some((e) => e[0] === 'resetTop'), null, { timeout: 5000 }).catch(() => {});
const rt = (await ev('resetTop')).at(-1);
check('R restarts in well under half a second', !!rt && rt[1] - t0 < 400, rt ? `${(rt[1] - t0).toFixed(0)} ms` : 'no resetTop');
// Progress tab: spots list.
await page.evaluate(() => { clearInterval(window.__keep); document.exitPointerLock?.(); window.__sendit.ui.h.menu(); });
await page.waitForFunction(() => window.__sendit.game.mode === 0 && window.__sendit.lobby.visible, null, { timeout: 60000 }).catch(() => {});
await wait(1500);
const tab = await page.evaluate(() => new Promise((r) => { window.__sendit.lobby.select('progress'); setTimeout(() => { const el = document.querySelector('.pg-spots'); el?.scrollIntoView(); r({ text: el?.textContent || '', head: el?.previousElementSibling?.textContent || '' }); }, 800); }));
check('Progress tab lists the spot', /Kicker/.test(tab.text), tab.head);
await wait(300);
await shot('6-progress-spots');

// ---------------------------------------------------------------- Ravenspire: adrenaline on the First Stack
await boot('map=ravenspire&ride');
await page.evaluate(() => { window.__maxExp = 0; window.__expT = setInterval(() => { window.__maxExp = Math.max(window.__maxExp, window.__thrill.adrenaline.level); }, 30); });
await page.evaluate((src) => { window.__done = false; const s = window.__sendit, pl = s.player, snap = () => {}; new Function('s', 'pl', 'snap', src)(s, pl, snap); }, SCENARIOS.cliff.setup);
let shotDone = false;
for (let i = 0; i < 200 && !(await page.evaluate(() => window.__done)); i++) {
  if (!shotDone && (await page.evaluate(() => window.__thrill.adrenaline.level)) > 0.45) { await shot('7-adrenaline-cliff'); shotDone = true; }
  await wait(60);
}
const maxExp = await page.evaluate(() => window.__maxExp);
check('adrenaline rises over the cliff', maxExp > 0.4, `max level ${maxExp.toFixed(2)}`);
const rs = (await ev('thrillSpot')).map((e) => e[2].name);
check('cliff send names a Ravenspire spot', rs.length > 0, rs.join(', ') || 'none (crashed?)');
if (!shotDone) await shot('7-adrenaline-cliff');

// ---------------------------------------------------------------- versus link
const code = await page.evaluate(async () => {
  const { encodeVersus } = await import('/src/thrill/core.js');
  return encodeVersus({ map: 'valcrest-gully', name: 'Mia', time: 61.5, score: 4200, medal: 'silver', ghost: [] });
});
const ghostCode = await (async () => {
  await boot('map=valcrest-gully&ride');
  return page.evaluate(async () => {
    const { encodeVersus } = await import('/src/thrill/core.js');
    const f = window.__sendit.features, g = [];
    for (let t = 0; t <= 60; t += 0.1) { const { p } = f.at(40 + t * 12); g.push(+t.toFixed(2), p.x, window.__sendit.terrain.getHeight(p.x, p.y), p.y, 0); }
    return encodeVersus({ map: 'valcrest-gully', name: 'Mia', time: 61.5, score: 4200, medal: 'silver', ghost: g });
  });
})();
check('versus code without a ghost is short', code.length < 200, `${code.length} chars; with ghost ${ghostCode.length}`);
await boot(`map=valcrest-gully&challenge&vs=${ghostCode}`);
await wait(4500);   // countdown
await page.evaluate(() => { window.__sendit.player.script = (c) => { c.up = 1; }; });
await wait(3000);
const vs = await page.evaluate(() => ({ line: document.getElementById('thrill-vs')?.textContent || '', ghost: window.__thrill.versus.target?.name, state: window.__sendit.activities.state }));
check('versus HUD shows the friend and the live gap', /VS MIA/.test(vs.line) && /[▲▼] \d+ m/.test(vs.line), JSON.stringify(vs));
await shot('8-versus-ghost-hud');
await page.evaluate(() => { const s = window.__sendit; s.player.script = null; const res = s.activities.finish(); s.player.state = 0; s.ui.showResults(res); });
await wait(1400);
const card = await page.evaluate(() => ({ rows: document.getElementById('resRows')?.textContent || '', btn: document.querySelector('#results [data-act=thrill-share]')?.textContent || '' }));
check('results card has the verdict row and the share button', /VS Mia/.test(card.rows) && /link/i.test(card.btn), JSON.stringify(card));
await page.evaluate(() => document.querySelector('#results [data-act=thrill-share]')?.click());
await wait(500);
await shot('9-versus-results');

check('no console errors', errors.length === 0, errors.slice(0, 4).join(' | '));
console.log(failed ? `\n${failed} failed` : '\nall thrill smoke checks passed');
await browser.close();
process.exit(failed ? 1 : 0);
