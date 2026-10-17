// Screenshot the lobby rider in reward looks (one boot, many shots) to check that prints, finishes,
// decals and legendary topsheets read in game. Usage:
//   GPU=1 node scripts/rewards-looks.mjs <url> <outDir> [set]     set = a key of LOOKS below, or 'all'
// Each look grants its skins to a fresh profile, equips them and waits for the rider to re-dress.
import { chromium } from '@playwright/test';
import fs from 'node:fs';

const LOOKS = {
  camo: ['jacket-tuff-shell:woodland', 'pants-tuff-bib:woodland', 'helmet-tuff:flames', 'goggles-tuff:oil-slick', 'face-gaiter:skull', 'gloves-tuff-mitt:woodland'],
  miami: ['jacket-retro-suit:miami-92', 'helmet-tuff:chrome', 'goggles-tuff:rose-gold', 'face-gaiter:checker'],
  hyperwave: ['jacket-retro-suit:hyperwave', 'helmet-tuff:stars', 'goggles-tuff:toxic', 'gloves-pipe:neon', 'face-balaclava:flames'],
  hologram: ['jacket-tuff-shell-hood:hologram', 'pants-cargo:tiedye', 'helmet-tuff:pearl', 'goggles-tuff:hi-vis', 'gloves-pipe:hi-vis'],
  flash: ['jacket-tuff-shell:reflective', 'pants-cargo:splatter', 'helmet-tuff:carbon', 'face-balaclava:tiger'],
  gold: ['jacket-tuff-shell:gold-lame', 'helmet-tuff:gold-chrome', 'skis-gold-leaf:legend', 'goggles-tuff:oil-slick'],
  arctic: ['jacket-tuff-shell-hood:arctic', 'pants-tuff-bib:summit', 'helmet-tuff:racing', 'skis-chrome:legend'],
  heritage: ['jacket-tuff-shell:heritage', 'pants-cargo:sand', 'helmet-tuff:lime', 'skis-holo:legend'],
  board: ['jacket-tuff-shell-hood:blaze', 'board-inferno:legend', 'helmet-tuff:flames'],
  aurora: ['jacket-retro-suit:ice-cream', 'board-aurora:legend', 'helmet-tuff:pearl'],
  galaxy: ['jacket-tuff-shell:nightshift', 'skis-galaxy:legend', 'skis-inferno:legend'],
  topo: ['jacket-tuff-shell:topo', 'pants-cargo:desert', 'helmet-tuff:copper-chrome', 'goggles-tuff:amber-iridium', 'face-balaclava:skull'],
  lights: ['jacket-tuff-shell-hood:northern-lights', 'pants-tuff-bib:avalanche', 'helmet-tuff:bronze', 'gloves-tuff-mitt:expedition'],
  alpine: ['jacket-retro-suit:alpine-78', 'helmet-tuff:summit-stars', 'goggles-tuff:ice-blue', 'face-gaiter:topo-olive'],
};

const [url = 'http://localhost:5193/', outDir = 'looks', which = 'all'] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({
  args: process.env.GPU
    ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
    : ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: Number(process.env.W || 1280), height: Number(process.env.H || 720) } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => window.__sendit?.stage?.ready && window.__sendit.lobby.visible, null, { timeout: 300000 });
await page.evaluate(() => window.__sendit.lobby.select('locker'));
for (const [name, keys] of Object.entries(LOOKS)) {
  if (which !== 'all' && which !== name) continue;
  const gear = await page.evaluate((keys) => {
    const P = window.__sendit.profile;
    P.reset();
    P.update((p) => { for (const k of keys) p.inventory.items[k] = { at: 1, n: 1, seen: true }; });
    let eq = null;
    for (const k of keys) {
      const [id, v] = k.split(':');
      const item = window.__sendit.profile.profile && P.ownedIn(['jacket', 'pants', 'helmet', 'goggles', 'face', 'gloves', 'skis', 'board'].find((s) => P.ownedIn(s).some((o) => o.key === k))).find((o) => o.key === k)?.item;
      if (item?.equipment) { P.setEquipment(item.equipment); eq = item.slot; }
      P.equip(id, v);
    }
    return eq;
  }, keys);
  if (gear) await page.evaluate(() => window.__sendit.stage.setShot('gear'));
  await page.waitForTimeout(gear ? 3500 : 2200);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  console.log(name, gear || '');
}
console.log(`errors: ${errors.length}`, errors.slice(0, 5).join('\n'));
await browser.close();
