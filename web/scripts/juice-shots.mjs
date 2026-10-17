// Game-feel screenshots in the real game (real GPU with GPU=1): a scripted spin off a kicker with the
// live air read-out and the combo chain, the announcer + landing grade right after touchdown, the combo
// bank, the speed rush at top speed, a level-up, toasts, and the lobby's Progress tab.
// Usage: GPU=1 node web/scripts/juice-shots.mjs <baseUrl> <outDir> [ski|snowboard] [kickerIndex]
// Screenshots go to outDir (keep them out of the repo).
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [base = 'http://localhost:5198/', outDir = '.', equip = 'ski', kick = '2'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let errors = 0;
page.on('pageerror', (e) => { errors++; console.log('[pageerror]', e.message); });
page.on('console', (m) => { if (m.type() === 'error') { errors++; console.log('[error]', m.text().slice(0, 300)); } });
const shot = async (name) => { const f = `${outDir}/${name}.png`; await page.screenshot({ path: f }); console.log('shot', f); };
const map = process.env.MAP ? `&map=${process.env.MAP}` : '';
await page.goto(`${base.replace(/\/?$/, '/')}?kicker=${kick}&equip=${equip}${map}`);
await page.waitForFunction(() => window.__sendit?.lobby?.visible, null, { timeout: 400000 });
await page.waitForTimeout(1500);
if (!process.env.SKIP_LOBBY) await shot('lobby-badge');
// The Progress tab.
if (!process.env.SKIP_LOBBY) {
  await page.evaluate(() => window.__sendit.lobby.select?.('progress'));
  await page.waitForTimeout(1200);
  await shot('lobby-progress');
}
await page.evaluate(() => document.querySelector('.lb-ride').click());
await page.waitForFunction(() => window.__sendit.game.mode === 1 && window.__sendit.player.state === 1, null, { timeout: 120000 });
await page.waitForTimeout(2500);

// A spin off the kicker (scripted controls: the trick system's own input path, see jumps-shots.mjs).
const ride = async (trick, spinDir = -1) => page.evaluate(({ k: ki, trick, spinDir }) => {
  const s = window.__sendit, pl = s.player, k = s.features.kickers[ki] || s.features.kickers[0];
  pl.place({ x: k.o.x - k.f.x * 25, z: k.o.y - k.f.y * 25 }, Math.atan2(-k.f.x, -k.f.y));
  pl.velocity.copy(pl.forward()).multiplyScalar(14);
  const TAU = Math.PI * 2;
  window.__ph = 'run'; window.__done = false;
  pl.script = (c, p) => {
    if (p.state === 1 && !window.__done) {
      const dx = p.position.x - k.o.x, dz = p.position.z - k.o.y, a = dx * k.f.x + dz * k.f.y;
      const aNext = a + (p.velocity.x * k.f.x + p.velocity.z * k.f.y) * (1 / 60) * 1.5;
      c.jump = a > -10 && aNext < k.L;
      if (trick !== 'spin') c.brake = a > -6 && aNext < k.L ? 1 : 0;
      if (trick !== 'backflip') c.steer = a > k.L - 3 && aNext < k.L ? spinDir : 0;
    } else if (p.state === 2) {
      window.__done = true; window.__ph = 'air';
      const tl = p.dyn.timeToLand();
      if (trick !== 'spin' && (p.airTime < 0.12 || Math.abs(p.flip) + Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH) * Math.max(0, tl - 0.2) < TAU)) c.brake = 1;
      if (trick !== 'backflip' && (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH) * 0.6 * Math.max(0, tl - 0.15) < TAU * 1.5)) c.steer = spinDir;
      if (p.airTime > 0.3) c.tuck = 1;   // grab
    } else if (window.__done) { window.__ph = 'landed'; pl.script = null; }
  };
}, { k: Number(kick), trick, spinDir });

for (const [i, trick] of ['spin', 'backflip'].entries()) {
  await ride(trick, i ? 1 : -1);
  await page.waitForFunction(() => window.__ph === 'air' && window.__sendit.player.airTime > 0.75, null, { timeout: 30000 }).catch(() => {});
  await shot(`${i + 1}-air-${trick}`);
  await page.waitForFunction(() => window.__ph === 'landed' || window.__sendit.player.state === 3, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(220);
  await shot(`${i + 1}-landed-${trick}`);
  const ll = await page.evaluate(() => { const l = window.__sendit.player.lastLanding; return l && { result: l.result, trick: l.trick, air: +l.air.toFixed(2), grade: l.grade, state: window.__sendit.player.state }; });
  console.log(trick, JSON.stringify(ll));
  await page.waitForTimeout(900);
  await shot(`${i + 1}-after-${trick}`);
}
// Let the chain bank (window on the snow).
await page.waitForTimeout(2600);
await shot('3-combo-bank');

// Top speed: the speed rush (edge zoom blur + fringe) and the wind streaks.
await page.evaluate(() => { const s = window.__sendit, pl = s.player; pl.velocity.copy(pl.forward()).multiplyScalar((pl.dyn?.maxVelocity ?? 30) * 1.05); window.__juice.speedfx.pulse('huge'); });
await page.waitForTimeout(250);
await shot('4-speed-rush');

// Progression celebrations: a level-up and the toasts (driven through the public API / bus).
await page.evaluate(async () => {
  const { progression } = await import('/src/progression/index.js');
  const p = progression.getProgress();
  progression.addXP(p.need - p.into + 5, 'screenshot');
});
await page.waitForTimeout(700);
await shot('5-level-up');
await page.evaluate(async () => {
  const { emit } = await import('/src/state.js');
  emit('achievement', { id: 'x', title: 'Seven-Twenty', desc: 'Land a 720', xp: 260, icon: '↻' });
  emit('personalBest', { stat: 'air', text: 'Longest air · 2.9 s', was: '2.1 s' });
  emit('challengeDone', { challenge: { title: 'Ride 3 km', xp: 210 } });
});
await page.waitForTimeout(900);
await shot('6-toasts');
console.log('errors', errors);
await browser.close();
