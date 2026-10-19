// Contact sheet of every item icon (lobby/cases/itemIcons.js), grouped by case series and grade, plus
// the starter kit and the anonymous gold card. Usage:
//   node scripts/iconsheet.mjs <url> <outDir>          (macOS: Metal; elsewhere ANGLE=d3d11 / swiftshader)
//   FLAT=1 …        the old flat SVG art instead (?noicons), for a before / after
//   ONLY=jacket-    only keys containing this text (quick look while tuning)
// Writes <outDir>/icons-<series>.png (and icons-all.png), and fails on console errors.
import { chromium } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:5198/').replace(/\/?$/, '/');
const out = process.argv[3] || '/tmp/sendit-icons';
const flat = !!process.env.FLAT;
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1500, height: 3400 }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); else if (/icons/.test(m.text())) console.log('[page]', m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?quality=0${flat ? '&noicons' : ''}${process.env.REBAKE ? '&iconrebake' : ''}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });
  const t0 = Date.now();
  const groups = await page.evaluate(async ({ flat, only }) => {
    const { listItems, ownKey } = await import('/src/profile/catalog.js');
    const { casePool } = await import('/src/profile/rewards.js');
    const { SERIES, SERIES_ORDER } = await import('/src/profile/items.js');
    const { RARITIES } = await import('/src/profile/rarity.js');
    const { cardHtml } = await import('/src/lobby/cases/opener.js');
    const keep = (k) => !only || (k && only.split(',').some((o) => k.includes(o)));
    const groups = [];
    const starters = [];
    for (const it of listItems()) for (const v of it.variants) if (v.starter) starters.push({ key: ownKey(it.id, v.id), rarity: 'common' });
    groups.push({ title: 'Starter kit', rows: [{ grade: 'Starter', color: '#888', cards: starters.filter((c) => keep(c.key)) }] });
    for (const s of SERIES_ORDER) {
      const pool = casePool(s);
      groups.push({ title: SERIES[s].name, series: s, rows: RARITIES.filter((r) => r.id !== 'gold').map((r) => ({ grade: r.name, color: r.color, cards: pool[r.id].map((e) => ({ key: e.key, rarity: r.id })).filter((c) => keep(c.key)) })) });
    }
    const gold = casePool(SERIES_ORDER[0]).gold.map((e) => ({ key: e.key, rarity: 'gold' }));
    groups.push({ title: '★ Exceedingly rare (every case)', rows: [{ grade: '★ Exceedingly rare', color: '#e4ae39', cards: [{ key: null, rarity: 'gold' }, ...gold].filter((c) => !only || keep(c.key)) }] });
    // Render the sheet into an overlay (cards built by the real cardHtml, so the icons bake on demand).
    const el = document.createElement('div');
    el.id = 'iconsheet';
    el.style.cssText = 'position:fixed;inset:0;overflow:auto;z-index:99999;background:#14161d;color:#eee;font:14px system-ui;padding:16px';
    el.innerHTML = groups.map((g, gi) => `<section data-g="${gi}" style="margin-bottom:22px"><h2 style="margin:0 0 8px;font-size:20px">${g.title}${flat ? ' (flat SVG, before)' : ''}</h2>${g.rows.filter((r) => r.cards.length).map((r) => `
      <div style="display:flex;gap:10px;align-items:flex-start;margin:6px 0"><div style="width:120px;flex:none;color:${r.color};font-weight:700;padding-top:8px">${r.grade}</div>
      <div style="display:flex;flex-wrap:wrap;gap:8px;font-size:13px">${r.cards.map((c) => `<div style="width:9.2em;height:11.5em;display:flex">${cardHtml(c.key, c.rarity)}</div>`).join('')}</div></div>`).join('')}</section>`).join('');
    document.body.appendChild(el);
    el.querySelectorAll('.cr-card').forEach((c) => { c.style.width = '100%'; });
    return groups.map((g) => ({ title: g.title, series: g.series || g.title.split(' ')[0].toLowerCase().replace(/\W/g, ''), n: g.rows.reduce((a, r) => a + r.cards.length, 0) }));
  }, { flat, only: process.env.ONLY || '' });
  if (!flat) {
    await page.waitForFunction(() => window.__senditIcons.pending() === 0, null, { timeout: 600000, polling: 500 });
    console.log(`baked / loaded ${await page.evaluate(() => window.__senditIcons.urls.size)} icons in ${((Date.now() - t0) / 1000).toFixed(1)} s; failed: ${await page.evaluate(() => [...window.__senditIcons.failed].join(', ') || 'none')}`);
  }
  await page.waitForTimeout(600);
  if (process.env.DUMP && !flat) {
    // The raw icons, full size (webp), for a close look.
    const fs = await import('node:fs');
    fs.mkdirSync(`${out}/raw`, { recursive: true });
    const files = await page.evaluate(async () => {
      const res = [];
      for (const [id, url] of window.__senditIcons.urls) {
        const b = await (await fetch(url)).blob();
        const s = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(b); });
        res.push([id, s.split(',')[1], b.size]);
      }
      return res;
    });
    let bytes = 0;
    for (const [id, b64, size] of files) { fs.writeFileSync(`${out}/raw/${id.replace(/[^\w-]+/g, '_')}.webp`, Buffer.from(b64, 'base64')); bytes += size; }
    console.log(`dumped ${files.length} icons, ${(bytes / 1024).toFixed(0)} kB total (${(bytes / 1024 / Math.max(1, files.length)).toFixed(1)} kB each)`);
    // All raw icons at full size on one grey sheet.
    await page.evaluate(() => {
      const el = document.createElement('div');
      el.id = 'rawsheet';
      el.style.cssText = 'position:absolute;left:0;top:0;width:1400px;z-index:100000;background:#2a2d36;display:flex;flex-wrap:wrap;gap:4px;padding:4px';
      el.innerHTML = [...window.__senditIcons.urls].map(([id, u]) => `<div style="position:relative;width:256px;height:256px;background:#1b1d24"><img src="${u}" style="width:256px;height:256px"><span style="position:absolute;left:3px;bottom:2px;font:10px system-ui;color:#999">${id}</span></div>`).join('');
      document.body.appendChild(el);
    });
    await page.waitForTimeout(500);
    await page.locator('#rawsheet').screenshot({ path: `${out}/raw-sheet.png` });
    console.log('wrote', `${out}/raw-sheet.png`);
  }
  for (let i = 0; i < groups.length; i++) {
    if (!groups[i].n) continue;
    const sec = page.locator(`#iconsheet section[data-g="${i}"]`);
    const file = `${out}/icons${flat ? '-flat' : ''}-${i}-${groups[i].series}.png`;
    await sec.screenshot({ path: file });
    console.log('wrote', file);
  }
} finally {
  await browser.close();
}
if (errors.length) { console.log('console errors:\n' + errors.join('\n')); process.exit(1); }
