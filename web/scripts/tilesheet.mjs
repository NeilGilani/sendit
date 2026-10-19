// Contact sheets of the item tiles in their real components (docs/rewards.md "Item icons"):
//   reel-<series>.png   the canvas reel of that case drawn at four speeds (blur, mid, crawl, stop + winner pop)
//   contents.png        the case contents grid of each series (the Cases tab's .cs-grid cards)
//   locker-<slot>.png   the Locker tab (grid + detail) with a spread of owned skins, for a few slots
// Usage: node scripts/tilesheet.mjs <url> <outDir>      (macOS: Metal; ANGLE=d3d11 elsewhere)
//   FLAT=1   the old flat SVG art (?noicons)     ONLY=reel,contents,locker   pick sheets
// Fails on console errors.
import { chromium } from '@playwright/test';

const base = (process.argv[2] || 'http://localhost:5206/').replace(/\/?$/, '/');
const out = process.argv[3] || '/tmp/sendit-tiles';
const flat = !!process.env.FLAT;
const only = (process.env.ONLY || 'reel,contents,locker').split(',');
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
const errors = [];
const icons = (page) => page.waitForFunction(() => !window.__senditIcons || window.__senditIcons.pending() === 0, null, { timeout: 300000, polling: 300 });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?quality=0`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${base}?quality=0${flat ? '&noicons' : ''}`);
  await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });

  if (only.includes('reel')) {
    for (const series of ['first-chair', 'night-park', 'backcountry']) {
      await page.evaluate(async ({ series }) => {
        const { CanvasReel, reelMetrics } = await import('/src/lobby/cases/reelCanvas.js');
        const { casePool } = await import('/src/profile/rewards.js');
        const pool = casePool(series);
        // A reel with every grade: grey blue purple pink red ★ red pink purple blue grey…
        const pick = (r, i) => ({ key: r === 'gold' ? null : pool[r][i % pool[r].length].key, rarity: r });
        const order = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'gold', 'legendary', 'epic', 'rare', 'uncommon', 'common', 'uncommon', 'rare'];
        const cards = order.map((r, i) => pick(r, i));
        const I = await import('/src/lobby/cases/itemIcons.js');
        await I.whenIcons(cards.map((c) => c.key ?? I.GOLD_ICON), 120000);   // the Cases tab bakes these before an opening
        document.getElementById('tilesheet')?.remove();
        const el = document.createElement('div');
        el.id = 'tilesheet';
        el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#05060f;color:#ccc;font:13px system-ui;padding:10px;overflow:auto';
        document.body.appendChild(el);
        const em = reelMetrics().em;
        const rows = [['at speed (~70 cards/s)', 70], ['slowing (~12 cards/s)', 12], ['crawl (~2 cards/s)', 2], ['stopped, winner', 0]];
        for (const [label, cps] of rows) {
          const row = document.createElement('div');
          row.innerHTML = `<div style="margin:6px 0 2px">${label}</div>`;
          const reel = new CanvasReel(cards);
          row.appendChild(reel.cv);
          reel.cv.style.position = 'static';
          el.appendChild(row);
          reel.layout(1400, 13 * em, em);
          row._reel = reel; row._cps = cps;
        }
        // Wait for the plates and pictures, then draw.
        await new Promise((r) => { const t = () => ((window.__senditReelPending?.() ?? 0) === 0 ? r() : setTimeout(t, 100)); t(); });
        await new Promise((r) => setTimeout(r, 300));
        let i = 0;
        for (const row of el.children) {
          const reel = row._reel, cps = row._cps;
          const x = 2.3 * reel.pitch;
          if (cps === 0) reel.draw(x + reel.pitch * 2.9, { win: 5 + 0, landK: 0.6, color: '#e4ae39' });
          else reel.draw(x + i * 37, { v: cps * reel.pitch });
          i++;
        }
      }, { series });
      await page.waitForTimeout(400);
      await page.locator('#tilesheet').screenshot({ path: `${out}/reel-${series}${flat ? '-flat' : ''}.png` });
      console.log('wrote', `${out}/reel-${series}${flat ? '-flat' : ''}.png`);
    }
    await page.evaluate(() => document.getElementById('tilesheet')?.remove());
  }

  if (only.includes('contents')) {
    await page.evaluate(async () => {
      const { casePool } = await import('/src/profile/rewards.js');
      const { SERIES, SERIES_ORDER } = await import('/src/profile/items.js');
      const { RARITIES } = await import('/src/profile/rarity.js');
      const { cardHtml } = await import('/src/lobby/cases/opener.js');
      const el = document.createElement('div');
      el.id = 'tilesheet';
      el.className = 'lb-panel';
      el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#0f1a24;color:#ddd;font-size:15px;padding:12px;overflow:auto;display:flex;gap:16px';
      el.innerHTML = SERIES_ORDER.map((s) => {
        const pool = casePool(s);
        return `<div style="width:30em"><h3 style="margin:0 0 6px">${SERIES[s].name}</h3>${RARITIES.map((r) => `<div style="color:${r.color};font-size:.8em;margin:6px 0 3px">${r.name}</div>
          <div class="cs-grid">${r.id === 'gold' ? cardHtml(null, 'gold') : pool[r.id].map((e) => cardHtml(e.key, r.id)).join('')}</div>`).join('')}</div>`;
      }).join('');
      document.body.appendChild(el);
    });
    await page.waitForTimeout(500); await icons(page); await page.waitForTimeout(500);
    await page.locator('#tilesheet').screenshot({ path: `${out}/contents${flat ? '-flat' : ''}.png` });
    console.log('wrote', `${out}/contents${flat ? '-flat' : ''}.png`);
    await page.evaluate(() => document.getElementById('tilesheet')?.remove());
  }

  if (only.includes('locker')) {
    // Own a spread: every skin of a few slots (straight into the inventory), then the Locker per slot.
    await page.evaluate(async () => {
      const { rewardSkins, ownKey } = await import('/src/profile/catalog.js');
      const s = window.__sendit;
      const inv = s.profile.data?.inventory || s.profile.profile?.inventory;
      let n = 0;
      for (const { item, variant } of rewardSkins()) {
        if ((n++ % 2) && variant.rarity !== 'gold') continue;   // about half, every gold
        const k = ownKey(item.id, variant.id);
        if (inv?.items && !inv.items[k]) inv.items[k] = { at: Date.now(), n: 1 + (n % 3 === 0 ? 1 : 0), seen: n % 5 !== 0 };
      }
      s.lobby.select('locker');
    });
    await page.waitForTimeout(800);
    for (const slot of ['jacket', 'helmet', 'goggles', 'skis', 'board', 'gloves']) {
      await page.evaluate((sl) => document.querySelector(`.lk-slot[data-slot="${sl}"]`)?.click(), slot);
      await page.waitForTimeout(400);
      await page.evaluate(() => document.querySelector('.lk-item:not(.on)')?.click());
      await page.waitForTimeout(400); await icons(page); await page.waitForTimeout(700);
      await page.screenshot({ path: `${out}/locker-${slot}${flat ? '-flat' : ''}.png` });
      console.log('wrote', `${out}/locker-${slot}${flat ? '-flat' : ''}.png`);
    }
  }
} finally {
  await browser.close();
}
if (errors.length) { console.log('console errors:\n' + errors.join('\n')); process.exit(1); }
console.log('no console errors');
