// Saved highlights end to end, in the real game (~3–4 min): land a real trick off a Valcrest kicker, see the
// SAVE CLIP pill, press F, check the clip is stored (size, save time); reload and check the loading screen
// plays it (caption, rider on its own snow: frame sequence); open the lobby's Highlights tab (card,
// thumbnail rendered) and play it in the player. Screenshots of each step go to <outDir>. Exit 1 on failure.
// Usage: MAC=1 node web/scripts/clips-e2e.mjs <baseUrl> <outDir> [scenario=spin360]   (GPU=1 on Windows)
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { SCENARIOS } from './camscenarios.mjs';

const [base = 'http://localhost:5205/', out = '/tmp/clips-e2e', scen = 'spin360'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const args = process.env.MAC ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist']
  : process.env.GPU ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error') errors.push(t.slice(0, 240)); if (/\[loading\]|\[highlights\]/.test(t)) console.log('   ', t.slice(0, 200)); });
let failed = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? `  (${info})` : ''}`); if (!ok) failed++; };
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
const wait = (ms) => page.waitForTimeout(ms);
const url = (q) => `${base}${base.includes('?') ? '&' : '?'}${q}`;

async function boot(query) {
  await page.goto(url(query), { timeout: 300000, waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__sendit?.game?.mode >= 0 && window.__thrill, null, { timeout: 400000 });
}

// ---------------------------------------------------------------- clean slate
const Q = SCENARIOS[scen].query || 'map=valcrest-gully&kicker=2';
await boot(`${Q}&ride`);
await page.evaluate(() => new Promise((res) => { localStorage.removeItem('sendit.highlights'); localStorage.removeItem('sendit.highlights.seen'); const r = indexedDB.deleteDatabase('sendit-highlights'); r.onsuccess = r.onerror = r.onblocked = () => res(); }));
await boot(`${Q}&ride`);
await page.waitForFunction(() => window.__sendit.game.mode === 1, null, { timeout: 400000 });
await page.evaluate(() => { window.__keep = setInterval(() => { if (window.__sendit.game.mode === 2) window.__sendit.ui.h.resume(); }, 50); });
await wait(2500);

// ---------------------------------------------------------------- land a trick, save it
await page.evaluate((src) => { window.__done = false; const s = window.__sendit, pl = s.player, snap = () => {}; new Function('s', 'pl', 'snap', src)(s, pl, snap); }, SCENARIOS[scen].setup);
await page.waitForFunction(() => window.__done, null, { timeout: 60000 }).catch(() => {});
await page.waitForFunction(() => window.__thrill.highlights.debug().pending || window.__thrill.highlights.debug().cand, null, { timeout: 20000 }).catch(() => {});
const dbg = await page.evaluate(() => window.__thrill.highlights.debug());
const pill = await page.evaluate(() => document.getElementById('thrill-save')?.classList.contains('on'));
check('a landed trick shows the SAVE CLIP pill', pill && !!(dbg.pending || dbg.cand), JSON.stringify(dbg));
await shot('1-save-pill');
await page.evaluate(() => { window.__sendit.player.script = (c) => { c.brake = 1; }; });   // stop: no more airs
await page.keyboard.press('KeyF');
await page.waitForFunction(() => window.__thrill.highlights.stats.lastSave, null, { timeout: 20000 }).catch(() => {});
const st = await page.evaluate(() => window.__thrill.highlights.stats);
check('F saves the clip to IndexedDB', !!st.lastSave?.id, JSON.stringify(st));
await wait(400);
await shot('2-saved-toast');
const toast = await page.evaluate(() => {
  const t = document.getElementById('thrill-toast'), r = t?.getBoundingClientRect();
  const top = r && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
  return { text: t?.textContent || '', on: t?.classList.contains('on'), opacity: t && getComputedStyle(t).opacity, visible: !!top && (top === t || t.contains(top)), top: top?.id || top?.className };
});
check('confirmation toast names the trick', /saved/i.test(toast.text) && toast.on && toast.opacity === '1', JSON.stringify(toast));
const idx = await page.evaluate(() => JSON.parse(localStorage.getItem('sendit.highlights') || 'null'));
check('the loading-screen index lists it', idx?.clips?.length === 1 && idx.clips[0].id === st.lastSave?.id, JSON.stringify(idx));
await page.keyboard.press('KeyF');
await wait(300);
const again = await page.evaluate(() => document.getElementById('thrill-toast')?.textContent || '');
check('pressing F again does not save a duplicate', /Already/.test(again), again);
const id = st.lastSave?.id;
// Keep the clip (scripts/clips-cams.mjs replays it under every camera move).
const dump = await page.evaluate(async (id) => {
  const { getClipBytes, getClipMeta } = await import('/src/thrill/clipstore.js');
  const b = new Uint8Array(await getClipBytes(id)); let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return { b64: btoa(s), meta: (await getClipMeta(id)).meta };
}, id).catch(() => null);
if (dump) { writeFileSync(`${out}/clip-${scen}.bin`, Buffer.from(dump.b64, 'base64')); writeFileSync(`${out}/clip-${scen}.json`, JSON.stringify(dump.meta, null, 1)); }

// ---------------------------------------------------------------- the loading screen plays it
await page.goto(url(`loadclip=${id}&loadhold&loadnohold`), { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__loading?.stats?.().shot?.highlight, null, { timeout: 120000 }).catch(() => {});
const ls = await page.evaluate(() => window.__loading?.stats?.());
check('the loading screen plays the saved clip', !!ls?.shot?.highlight && ls.clipId === id, JSON.stringify({ shot: ls?.shot, clipFailed: ls?.clipFailed }));
for (let i = 0; i < 8; i++) { await wait(900); await shot(`3-loading-${i}`); }
const cap = await page.evaluate(() => document.getElementById('loadcap')?.textContent || '');
check('caption says "Your highlight"', /Your highlight/.test(cap), cap);

// ---------------------------------------------------------------- lobby Highlights tab
await boot('map=valcrest-gully&loadclip=0');
await page.waitForFunction(() => window.__sendit?.lobby?.visible && document.querySelector('[data-tab=highlights]'), null, { timeout: 400000 }).catch(() => {});
await wait(1500);
await page.click('[data-tab=highlights]').catch(() => {});
await page.waitForSelector('.hl-card', { timeout: 20000 }).catch(() => {});
const cards = await page.evaluate(() => document.querySelectorAll('.hl-card').length);
check('the Highlights tab lists the clip', cards === 1, String(cards));
await page.waitForFunction(() => document.querySelector('.hl-card .hl-thumb img.on'), null, { timeout: 60000 }).catch(() => {});
const thumb = await page.evaluate(() => !!document.querySelector('.hl-card .hl-thumb img.on'));
check('a thumbnail was rendered', thumb);
await shot('4-lobby-highlights');
await page.click('.hl-card .hl-thumb');
await page.waitForFunction(() => document.querySelector('#hl-player .wait.off'), null, { timeout: 60000 }).catch(() => {});
await wait(2500);
await shot('5-player');
const playing = await page.evaluate(() => !!document.querySelector('#hl-player .wait.off'));
check('the player plays it', playing);
await page.keyboard.press('ArrowRight');
await wait(3000);
await shot('6-player-next');
await page.keyboard.press('Escape');
await wait(500);
check('Esc closes the player', !(await page.evaluate(() => !!document.getElementById('hl-player'))));

const errs = errors.filter((e) => !/favicon|404|Failed to load resource/.test(e));
check('no console errors', errs.length === 0, errs.slice(0, 5).join(' | '));
await browser.close();
console.log(failed ? `${failed} FAILED` : 'all passed');
process.exit(failed ? 1 : 0);
