// Dev helper: ride for a while, then render a reverse-angle view (no post) to inspect tracks/spray.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const [url, out, wait = '40', keys = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(url);
await page.waitForFunction(() => window.__sendit, null, { timeout: 240000 });
if (keys) for (const k of keys.split(',')) await page.keyboard.down(k);
await page.waitForTimeout(Number(wait) * 1000);
const data = await page.evaluate(() => {
  const s = window.__sendit, p = s.player;
  const cam = s.camera.clone();
  const f = p.forward();
  cam.position.copy(p.renderPos).addScaledVector(f, 5).add({ x: 1.2, y: 2.4, z: 0 });
  cam.lookAt(p.renderPos.x - f.x * 4, p.renderPos.y, p.renderPos.z - f.z * 4);
  cam.fov = 60; cam.updateProjectionMatrix();
  s.renderer.render(s.scene, cam);
  return { url: s.renderer.domElement.toDataURL('image/png'), speed: p.speed };
});
writeFileSync(out, Buffer.from(data.url.split(',')[1], 'base64'));
console.log('speed', data.speed.toFixed(1));
await browser.close();
