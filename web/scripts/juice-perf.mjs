// A/B frame cost of the juice speed rush pass (juice/speedfx.js) on the real GPU, uncapped:
// alternating windows with the rush forced full (plus rush lines) and forced off, back to back
// (other sessions share the GPU, so compare medians and minimums of the same run).
// Usage: node web/scripts/juice-perf.mjs [baseUrl] [quality] [W H]
import { chromium } from '@playwright/test';
const [base = 'http://localhost:5198/', q = '1', W = '1600', H = '900'] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: Number(W), height: Number(H) } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`${base}?ride&quality=${q}`, { timeout: 300000, waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__sendit?.game.mode === 1, null, { timeout: 400000 });
await page.waitForTimeout(4000);
await page.keyboard.down('w');
const res = await page.evaluate(async () => {
  const J = window.__juice, S = window.__sendit;
  const win = (on, ms) => new Promise((done) => {
    const t = [];
    let last = performance.now();
    const end = last + ms;
    const tick = (now) => {
      if (on) { J.speedfx.pulse('huge'); S.player.velocity.setLength(Math.max(S.player.speed, 20)); }
      t.push(now - last); last = now;
      if (now < end) requestAnimationFrame(tick); else done(t.slice(5));
    };
    requestAnimationFrame(tick);
  });
  const stats = (a) => { const s = [...a].sort((x, y) => x - y); return { med: +s[Math.floor(s.length / 2)].toFixed(2), p10: +s[Math.floor(s.length * 0.1)].toFixed(2), n: s.length }; };
  const out = { on: [], off: [] };
  const { settings } = S.game ? await import('/src/state.js') : {};
  for (let i = 0; i < 4; i++) {
    settings.juiceSpeedFx = true;
    await win(true, 600);
    out.on.push(...await win(true, 2500));
    settings.juiceSpeedFx = false;
    await new Promise((r) => setTimeout(r, 1800));   // the rush eases out
    out.off.push(...await win(false, 2500));
  }
  settings.juiceSpeedFx = true;
  return { on: stats(out.on), off: stats(out.off), passEnabled: J.speedfx.pass.enabled };
});
console.log(`quality ${q} ${W}x${H}:`, JSON.stringify(res));
await browser.close();
