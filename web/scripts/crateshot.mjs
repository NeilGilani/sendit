// Frame sequences of the 3D case opening (docs/rewards.md "The opening, frame by frame"), per case
// and per grade, plus frame-time stats of a real-time run. Usage:
//   node scripts/crateshot.mjs <url> <outDir> [times]      times: comma list of seconds (default: key beats)
// Env: ITEM=<part of a skin key> (e.g. board-, helmet), SERIES=first-chair|night-park|backcountry (default first-chair), RARITY=common…gold (forced via a
//      seed, like ?caseforce), W, H (viewport, default 1280×720), PERF=1 (also time a live run: fps and
//      the worst frames), QUICK=1 (quick-open timing), EQUIP=1 (press Equip now at the end and shoot),
//      ANGLE=metal|d3d11|swiftshader (default: metal on macOS, d3d11 with GPU=1, else swiftshader).
// Screens are taken with the show frozen at each time (opener.seek), so they are exact frames.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const [url = 'http://localhost:5187/', outDir = '/tmp/claude-501/sendit-cases/shots', timesArg] = process.argv.slice(2);
const series = process.env.SERIES || 'first-chair';
const want = process.env.RARITY || '';
const quick = !!process.env.QUICK;
const T = quick ? [0.1, 0.3, 0.45, 0.6, 1.0, 1.6, 2.6, 3.3, 3.6, 4.4] : [0.15, 0.4, 0.75, 1.2, 1.45, 1.7, 2.1, 2.6, 4.0, 7.0, 8.4, 9.0, 9.4, 10.2, 11.5];
const times = timesArg ? timesArg.split(',').filter(Boolean).map(Number) : T;
fs.mkdirSync(outDir, { recursive: true });
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : process.env.GPU ? 'd3d11' : 'swiftshader');
const browser = await chromium.launch({
  args: angle === 'swiftshader'
    ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', `--use-angle=${angle}`, '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); if (/\[cases\]/.test(m.text())) console.log('page:', m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
try {
  await page.goto(url);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });
  await page.evaluate(() => window.__sendit.lobby.select('cases'));
  await page.waitForFunction(() => window.__senditCrate?.ready, null, { timeout: 60000 });
  await page.waitForFunction(() => window.__senditReelPending?.() === 0, null, { timeout: 60000 }).catch(() => console.log('reel cards still rasterising'));
  console.log("prewarm ms", await page.evaluate(() => Math.round(window.__senditCrate.warmMs) + " " + (window.__senditCrate.warmLog || []).join(", ")));
  const n = (process.env.PERF ? 2 : 1) + (process.env.CHAIN ? 2 : 0);
  const seedFor = () => page.evaluate(async ({ series, want, item }) => {
    const R = await import('/src/profile/rewards.js');
    const P = window.__sendit.profile;
    const pity = P.rewards.sinceRed >= R.PITY - 1;
    for (let k = 1; k < 200000; k++) { const r = R.rollCase(series, R.seeded(k), pity); if ((!want || r.rarity === want) && (!item || r.key.includes(item))) return k; }
    return 1;
  }, { series, want, item: process.env.ITEM || '' });
  await page.evaluate(({ series, n }) => { for (let i = 0; i < n; i++) window.__sendit.profile.grantCase('test', series); }, { series, n });
  await page.waitForTimeout(600);
  const fpsRun = async () => {
    const seed = await seedFor();
    await page.evaluate(({ seed, quick }) => {
      window.__ft = [];
      let last = performance.now();
      const f = (now) => { window.__ft.push(now - last); if (now - last > 50) (window.__long ||= []).push([+(now - last).toFixed(0), +(window.__senditCases?.opener?.time(now) ?? -1).toFixed(2)]); last = now; if (window.__ft.length < 2000 && document.querySelector('.cr-overlay')) requestAnimationFrame(f); };
      requestAnimationFrame(f);
      window.__senditCasesApi.open(null, seed, { quick });
    }, { seed, quick });
    await page.waitForSelector('.cr-reveal:not([hidden])', { timeout: 60000 });
    await page.waitForTimeout(2500);
    const s = await page.evaluate(() => {
      const ft = window.__ft.slice(1);
      const sorted = [...ft].sort((a, b) => b - a);
      return { frames: ft.length, avgFps: +(1000 / (ft.reduce((a, b) => a + b, 0) / ft.length)).toFixed(1), worst: sorted.slice(0, 5).map((v) => +v.toFixed(1)), over33: ft.filter((v) => v > 33.4).length, first: ft.slice(0, 6).map((v) => +v.toFixed(1)), long: window.__long, begin: window.__senditCrate.beginMs };
    });
    console.log('perf', JSON.stringify(s));
    await page.click('.cr-btn[data-act="close"]');
    await page.waitForFunction(() => !document.querySelector('.cr-overlay') && !window.__senditCrate.active, null, { timeout: 10000 });
    await page.waitForTimeout(800);
  };
  if (process.env.PERF) await fpsRun();
  if (process.env.FLOW) {
    // The debug flags as a player would use them: <url>?casegrant=3&caseforce=gold, click Open, hold Space.
    console.log('cases ready', await page.evaluate(() => window.__sendit.profile.unopened.length));
    const got = [];
    for (let i = 0; i < Number(process.env.FLOW); i++) {
      await page.click('.cs-open');
      await page.waitForSelector('.cr-overlay', { timeout: 15000 });
      await page.waitForTimeout(1200);
      await page.keyboard.down('Space'); await page.waitForTimeout(700); await page.keyboard.up('Space');
      await page.waitForSelector('.cr-reveal:not([hidden]) h2', { timeout: 15000 });
      got.push(await page.evaluate(() => `${window.__senditCases.result.rarity} ${window.__senditCases.result.key} (3D: ${!!window.__senditCrate.active})`));
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${outDir}/flow-${i}.png` });
      await page.click('.cr-btn[data-act="close"]');
      await page.waitForFunction(() => !document.querySelector('.cr-overlay') && !window.__senditCrate.active, null, { timeout: 15000 });
      await page.waitForTimeout(500);
    }
    console.log('pulls', got.join(' | '));
    console.log(`errors: ${errors.length}`, errors.slice(0, 6).join('\n')); await browser.close(); process.exit(errors.length ? 1 : 0);
  }
  if (process.env.CHAIN) {
    // "Open all" in real time: screenshots every 1.5 s through the chain (auto-advance, summary).
    await page.evaluate(() => { const P = window.__sendit.profile; while (P.unopened.length) P.unopened.splice(0, 1); for (let i = 0; i < 3; i++) P.grantCase('test', ['first-chair', 'night-park', 'backcountry'][i]); window.__sendit.lobby.select('locker'); });
    await page.waitForTimeout(300);
    await page.evaluate(() => window.__sendit.lobby.select('cases'));
    await page.waitForTimeout(600);
    await page.click('.cs-all');
    for (let i = 1; i <= 16; i++) {
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${outDir}/chain-${String(i).padStart(2, '0')}.png` });
      // A Classified+ pull pauses the chain: press Open another like a player would.
      await page.evaluate(() => { if (!document.querySelector('.cr-auto')) document.querySelector('.cr-btn[data-act="next"]')?.click(); });
    }
    console.log('chain pulls', await page.evaluate(() => window.__senditCases?.opener?.chain?.pulls.map((p) => p.rarity).join(',')));
    console.log(`errors: ${errors.length}`, errors.slice(0, 6).join('\n')); await browser.close(); process.exit(errors.length ? 1 : 0);
  }
  if (process.env.MATRIX) {
    // Every case × every grade in one session: a few key frames each, one contact sheet per case.
    const R = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'gold'];
    const mt = timesArg ? times : [1.0, 1.5, 5.0, 8.5, 9.9];
    for (const s of ['first-chair', 'night-park', 'backcountry']) {
      const files = [];
      for (const r of R) {
        const seed = await page.evaluate(async ({ s, r }) => {
          const Rw = await import('/src/profile/rewards.js');
          const P = window.__sendit.profile;
          const c = P.grantCase('test', s);
          const pity = P.rewards.sinceRed >= Rw.PITY - 1;
          for (let k = 1; k < 200000; k++) if (Rw.rollCase(s, Rw.seeded(k), pity).rarity === r) return [c.id, k];
          return [c.id, 1];
        }, { s, r });
        await page.evaluate(([id, seed]) => { window.__senditCasesApi.open(id, seed); window.__senditCases.opener.seek(0); }, seed);
        for (const t of mt) {
          await page.evaluate((t) => window.__senditCases.opener.seek(t), t);
          await page.waitForTimeout(t > 8 ? 600 : 250);
          const f = `${outDir}/m-${s}-${r}-${t.toFixed(2)}.png`;
          await page.screenshot({ path: f });
          files.push([f, `${r} ${t}s`]);
        }
        const key = await page.evaluate(() => window.__senditCases.result.key);
        console.log(s, r, key);
        await page.evaluate(() => window.__senditCases.opener.seek(null));
        await page.click('.cr-btn[data-act="close"]');
        await page.waitForFunction(() => !document.querySelector('.cr-overlay') && !window.__senditCrate.active, null, { timeout: 15000 });
      }
      const sheet = await browser.newPage({ viewport: { width: 2000, height: 1200 } });
      await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${mt.length},1fr);gap:2px;font:14px sans-serif;color:#fff">${files.map(([f, l]) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><b style="position:absolute;left:4px;top:2px;text-shadow:0 0 3px #000">${l}</b></div>`).join('')}</body>`);
      await sheet.screenshot({ path: `${outDir}/matrix-${s}.png`, fullPage: true });
      await sheet.close();
    }
    console.log(`errors: ${errors.length}`, errors.slice(0, 6).join('\n')); await browser.close(); process.exit(errors.length ? 1 : 0);
  }
  const seed = await seedFor();
  console.log('seed', seed);
  await page.evaluate(({ seed, quick }) => { window.__senditCasesApi.open(null, seed, { quick }); window.__senditCases.opener.seek(0); }, { seed, quick });
  for (const t of times) {
    await page.evaluate((t) => window.__senditCases.opener.seek(t), t);
    await page.waitForTimeout(t > 8 ? 700 : 260);
    const f = `${outDir}/${series}-${want || 'any'}-${t.toFixed(2)}.png`;
    await page.screenshot({ path: f });
  }
  if (process.env.INSPECT) console.log('visible', await page.evaluate(() => {
    const out = [];
    const walk = (o, d) => { if (!o.visible) return; if (d > 0 && (o.isMesh || o.isPoints || o.isSprite || o.isLine)) out.push(`${'  '.repeat(d)}${o.type}:${o.name || o.material?.name || o.material?.type}`); if (d < 4) for (const c of o.children) walk(c, d + 1); };
    walk(window.__sendit.scene, 0);
    return out.slice(0, 120).join('\n');
  }));
  const res = await page.evaluate(() => { const r = window.__senditCases.result; return { key: r.key, rarity: r.rarity, near: r.reel.nearMiss, gear: !!r.item.equipment }; });
  // Contact sheet of the sequence (one image to look at).
  const files = times.map((t) => `${outDir}/${series}-${want || 'any'}-${t.toFixed(2)}.png`);
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await sheet.setContent(`<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(4,1fr);gap:2px;font:12px sans-serif;color:#fff">${files.map((f, i) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(f).toString('base64')}"><b style="position:absolute;left:4px;top:2px;text-shadow:0 0 3px #000">${times[i]} s</b></div>`).join('')}</body>`);
  await sheet.screenshot({ path: `${outDir}/${series}-${want || 'any'}-sheet.png`, fullPage: true });
  await sheet.close();
  console.log('result', JSON.stringify(res));
  await page.evaluate(() => window.__senditCases.opener.seek(null));
  if (process.env.EQUIP) {
    await page.click('.cr-btn[data-act="equip"]').catch(() => page.click('.cr-btn[data-act="close"]'));
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${outDir}/${series}-${want || 'any'}-equipped.png` });
  }
} finally {
  console.log(`errors: ${errors.length}`, errors.slice(0, 6).join('\n'));
  await browser.close();
}
