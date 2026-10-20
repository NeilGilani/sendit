// Production smoke test: boots a built game (dist served by scripts/serve-dist.mjs, any base path) and
// checks the launch paths a first-time player hits. Exits 1 on any failure.
//
//   node web/scripts/serve-dist.mjs /tmp/dist 4173 /sendit/ &
//   ENGINE=chromium node web/scripts/prodsmoke.mjs http://localhost:4173/sendit/ [shotDir] [scenarios]
//
// ENGINE=chromium (Metal on macOS) | webkit | firefox. scenarios (comma list, default all):
//   main       fresh profile → loading still → lobby → Ride → pause → lobby → another mountain (reload) → riding;
//              dev flags in the URL (?casegrant, ?caseforce) must do nothing in a production build
//   nostorage  localStorage + IndexedDB throw (private mode / blocked cookies): lobby + ride still work
//   corrupt    a corrupt saved profile: boots, keeps a backup copy, starts fresh
//   nowebgl    no WebGL: the friendly "can't run here" screen, no blank page
// Fails on console errors, page errors and any HTTP status >= 400 (e.g. a URL that ignores the base path).
import { chromium, webkit, firefox } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:4173/').replace(/\/?$/, '/');
const shotDir = process.argv[3] || '';
const only = (process.argv[4] || 'main,nostorage,corrupt,nowebgl').split(',');
const engine = process.env.ENGINE || 'chromium';
const T = 240000;
const launchers = { chromium, webkit, firefox };
const browser = await launchers[engine].launch(engine === 'chromium' ? {
  args: [...(process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal'] : []), '--enable-gpu', '--ignore-gpu-blocklist'],
} : {});
let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  [${engine}] ${msg}`); if (!cond) failures++; };
const shot = async (page, name) => { if (shotDir) await page.screenshot({ path: `${shotDir}/${engine}-${name}.png` }).catch(() => {}); };

async function open(ctx, url, { init } = {}) {
  const page = await ctx.newPage();
  const errors = [], bad = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  page.on('requestfailed', (r) => { const f = r.failure()?.errorText || ''; if (!/ABORTED|cancelled|NS_BINDING_ABORTED/i.test(f)) bad.push(`failed ${r.url()} ${f}`); });
  if (init) await page.addInitScript(init);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: T });
  return { page, errors, bad };
}
const lobbyReady = (page) => page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: T });
const report = (name, { errors, bad }) => {
  ok(errors.length === 0, `${name}: no console errors${errors.length ? ` — ${errors.slice(0, 4).join(' | ')}` : ''}`);
  ok(bad.length === 0, `${name}: no 404s / failed requests${bad.length ? ` — ${bad.slice(0, 4).join(' | ')}` : ''}`);
};

async function ride(page, label) {
  await page.waitForFunction(() => window.__sendit?.game?.mode === 1, null, { timeout: T });
  await page.mouse.click(640, 360).catch(() => {});
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(3500);
  await page.keyboard.up('ArrowUp');
  const sp = await page.evaluate(() => ({ speed: window.__sendit.player.speed, mode: window.__sendit.game.mode, path: location.pathname }));
  ok(sp.mode === 1 || sp.mode === 2, `${label}: riding (mode ${sp.mode})`);
  ok(sp.speed > 0.5, `${label}: the rider moves (${sp.speed.toFixed(1)} m/s)`);
  return sp;
}

// ---------------------------------------------------------------- main flow
if (only.includes('main')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const t0 = Date.now();
  const s = await open(ctx, base + '?casegrant=5&caseforce=gold&caseseries=x');
  // First paint: the loading screen's still (index.html picks and preloads one before any JS bundle).
  const still = await s.page.waitForFunction(() => window.__ldStillAt || window.__ldStillFailed, null, { timeout: 20000 }).then(() => s.page.evaluate(() => ({ at: window.__ldStillAt, failed: !!window.__ldStillFailed, f: window.__ldStill?.f }))).catch(() => null);
  ok(still && !still.failed, `loading still decoded (${still?.f} at ${still?.at?.toFixed(0)} ms after navigation start)`);
  await s.page.waitForTimeout(1200);
  await shot(s.page, 'loading');
  await lobbyReady(s.page);
  console.log(`      lobby ready after ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await shot(s.page, 'lobby');
  // The cases tab is where ?casegrant would add test cases (lobby/tabs/cases.js debugGrant).
  await s.page.evaluate(() => window.__sendit.lobby.select('cases'));
  await s.page.waitForTimeout(400);
  await shot(s.page, 'cases');
  const prof = await s.page.evaluate(() => ({ unopened: window.__sendit.profile.unopened?.length ?? null, casesApi: !!window.__senditCasesApi, title: document.title, path: location.pathname }));
  await s.page.evaluate(() => window.__sendit.lobby.select('home'));
  ok(prof.title.length > 3, `title "${prof.title}"`);
  ok(!prof.casesApi, 'production: no debug case-opening hook');
  ok(prof.unopened === null || prof.unopened < 5, `production: ?casegrant ignored (unopened cases ${prof.unopened})`);
  // Ride from the lobby, pause, back.
  await s.page.click('.lb-ride');
  await ride(s.page, 'lobby → ride');
  await shot(s.page, 'ride');
  await s.page.keyboard.press('Escape');
  await s.page.waitForFunction(() => window.__sendit.game.mode === 2, null, { timeout: T });
  await s.page.click('#pause [data-act=menu]');
  await lobbyReady(s.page);
  ok(true, 'pause → back to lobby');
  // Credits reachable and loaded from the base path.
  const credits = await s.page.evaluate(async () => { const r = await fetch(new URL('CREDITS.md', location.href)); return r.ok ? (await r.text()).length : 0; });
  ok(credits > 500, `CREDITS.md served (${credits} bytes)`);
  // Another mountain: the lobby saves the choice and reloads into ?map=&trail=&ride.
  const target = await s.page.evaluate(() => {
    const cur = window.__sendit.map.map.id;
    return cur === 'blackspruce' ? 'fjordline' : 'blackspruce';
  });
  await s.page.evaluate((id) => { location.search = `?map=${id}&ride`; }, target);
  await s.page.waitForURL(new RegExp(`map=${target}`), { timeout: T });
  const sp = await ride(s.page, `map load (${target})`);
  ok(sp.path.startsWith(new URL(base).pathname), `stays under the base path (${sp.path})`);
  await shot(s.page, `ride-${target}`);
  report('main', s);
  await ctx.close();
}

// ---------------------------------------------------------------- storage blocked
if (only.includes('nostorage')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const s = await open(ctx, base, {
    init: () => {
      const no = () => { throw new DOMException('blocked', 'SecurityError'); };
      try { Object.defineProperty(window, 'localStorage', { get: no, configurable: true }); } catch { /* */ }
      try { Object.defineProperty(window, 'sessionStorage', { get: no, configurable: true }); } catch { /* */ }
      try { Object.defineProperty(window, 'indexedDB', { get: no, configurable: true }); } catch { /* */ }
    },
  });
  await lobbyReady(s.page);
  ok(true, 'storage blocked: lobby ready');
  await s.page.click('.lb-ride');
  await ride(s.page, 'storage blocked: ride');
  // Expected warnings are fine; errors are not.
  report('nostorage', s);
  await ctx.close();
}

// ---------------------------------------------------------------- corrupt save
if (only.includes('corrupt')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('sendit.profile', '{"version":2,"equipment":"snowb');   // truncated JSON
    localStorage.setItem('sendit.progression', 'not json');
    localStorage.setItem('sendit.settings', '{"quality":');
  });
  const s = await open(ctx, base);
  await lobbyReady(s.page);
  const st = await s.page.evaluate(() => ({ eq: window.__sendit.profile.equipment, keys: Object.keys(localStorage).filter((k) => /backup|corrupt/i.test(k)) }));
  ok(!!st.eq, `corrupt save: boots with a fresh profile (equipment ${st.eq})`);
  ok(st.keys.length > 0, `corrupt save: backup kept (${st.keys.join(', ')})`);
  await s.page.click('.lb-ride');
  await ride(s.page, 'corrupt save: ride');
  report('corrupt', { errors: s.errors.filter((e) => !/corrupt|unreadable|backup/i.test(e)), bad: s.bad });
  await ctx.close();
}

// ---------------------------------------------------------------- no WebGL
if (only.includes('nowebgl')) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const s = await open(ctx, base, {
    init: () => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...a) { return /webgl/i.test(type) ? null : orig.call(this, type, ...a); };
      if (typeof OffscreenCanvas !== 'undefined') {
        const o2 = OffscreenCanvas.prototype.getContext;
        OffscreenCanvas.prototype.getContext = function (type, ...a) { return /webgl/i.test(type) ? null : o2.call(this, type, ...a); };
      }
    },
  });
  const shown = await s.page.waitForSelector('#bootfail:not([hidden])', { timeout: 30000 }).then(() => true).catch(() => false);
  const text = shown ? await s.page.textContent('#bootfail') : '';
  ok(shown && /WebGL|graphics/i.test(text), `no WebGL: friendly screen ("${text.replace(/\s+/g, ' ').trim().slice(0, 80)}…")`);
  await shot(s.page, 'nowebgl');
  report('nowebgl', { errors: s.errors.filter((e) => !/WebGL|webgl/i.test(e)), bad: s.bad });
  await ctx.close();
}

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nALL PASS');
process.exit(failures ? 1 : 0);
