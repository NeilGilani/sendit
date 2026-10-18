// Load time per build: navigation -> first riding frame (?ride), alternating builds so both see the
// same machine load, with the [gfx] timing lines (tree impostor bake, prewarm) of each boot.
// Usage: node scripts/gfxboot.mjs <baseUrl[,baseUrl2]> [maps] [quality] [runs]
import { chromium } from '@playwright/test';
const [bases = 'http://localhost:5186', maps = 'blackspruce', q = '1', runs = '2'] = process.argv.slice(2);
const angle = process.env.ANGLE || (process.platform === 'darwin' ? 'metal' : 'd3d11');
const browser = await chromium.launch({ args: ['--use-gl=angle', `--use-angle=${angle}`, '--ignore-gpu-blocklist', '--enable-gpu'] });
const res = {};
try {
  for (const map of maps.split(',')) for (let r = 0; r < Number(runs); r++) for (const base of bases.split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const gfx = [];
    page.on('console', (m) => { const t = m.text(); if (t.startsWith('[gfx]')) gfx.push(t.replace('[gfx] ', '')); });
    const t0 = Date.now();
    await page.goto(`${base}/?ride&quality=${q}&map=${map}`);
    await page.waitForFunction(() => window.__sendit && window.__post, null, { timeout: 600000 });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const load = (Date.now() - t0) / 1000;
    const mem = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : -1));
    const key = `${map} ${base}`;
    (res[key] ??= []).push(load);
    console.log(`${key}: ${load.toFixed(1)} s  heap ${mem} MB  | ${gfx.filter((g) => /impostor|prewarm/.test(g)).join(' | ')}`);
    await ctx.close();
  }
  for (const [k, v] of Object.entries(res)) console.log(`${k}: median ${v.sort((a, b) => a - b)[v.length >> 1].toFixed(1)} s, min ${Math.min(...v).toFixed(1)} s`);
} finally {
  await browser.close();
}
