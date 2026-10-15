// Dev helper: open the game in headless Chromium (software WebGL), wait for the LOBBY to be ready,
// optionally run some steps, log console errors and save a screenshot.
// Usage: node scripts/lobbyshot.mjs <url> <out.png> [waitSeconds] [steps]
//   steps: '|'-separated list run in order before the screenshot:
//     tab:<id>   open a lobby tab          key:<Code>   press a key
//     click:<css selector>                 wait:<seconds>
//     eval:<js>  run JS in the page
// Env: W, H (viewport, default 1280×720), DPR (device scale factor).
import { chromium } from '@playwright/test';

const [url = 'http://localhost:5175/', out = 'lobby.png', wait = '3', steps = ''] = process.argv.slice(2);
const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({
  viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) },
  deviceScaleFactor: Number(process.env.DPR || 1),
});
let errors = 0;
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) { if (m.type() === 'error') errors++; console.log(`[${m.type()}]`, m.text().slice(0, 600)); } });
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
const t0 = Date.now();
await page.goto(url);
await page.waitForFunction(() => window.__sendit && (window.__sendit.stage?.ready || window.__sendit.game.mode !== 0), null, { timeout: 300000 });
console.log(`booted in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const step of steps.split('|').filter(Boolean)) {
  const i = step.indexOf(':');
  const [kind, arg] = [step.slice(0, i), step.slice(i + 1)];
  if (kind === 'tab') await page.evaluate((id) => window.__sendit.lobby.select(id), arg);
  else if (kind === 'key') await page.keyboard.press(arg);
  else if (kind === 'click') await page.click(arg, { timeout: 20000 });
  else if (kind === 'wait') await page.waitForTimeout(Number(arg) * 1000);
  else if (kind === 'eval') console.log('eval →', JSON.stringify(await page.evaluate(arg)));
}
await page.waitForTimeout(Number(wait) * 1000);
const info = await page.evaluate(() => {
  const s = window.__sendit;
  return { mode: s.game.mode, lobby: s.lobby?.visible, tab: s.lobby?.activeId, equipment: s.profile.equipment, gear: s.stage?.gearMode };
});
console.log(JSON.stringify(info));
await page.screenshot({ path: out, timeout: 300000 });
console.log(`errors: ${errors}`);
await browser.close();
