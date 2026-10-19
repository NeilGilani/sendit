// In-air look contact sheets: flies spins, corks and grabs with the real Player + Rider
// (src/equipment/spinharness.js) and grabs evenly spaced frames from a chase and a side camera, plus the
// rider ↔ gear penetration over every air frame. Compare builds frame for frame:
//   node scripts/spin-sheet.mjs http://localhost:5211/ --label head --json /tmp/x/head.json [--gear ski] [--tricks 720,cork 720]
//     [--views chase,side,front] [--size 200x220] [--frames 9] [--style (tweaked grabs)]
//   node scripts/spin-sheet.mjs --compose /tmp/x/old.json,/tmp/x/head.json --out /tmp/x/sheets
// Capture writes one JSON per build (images inline); compose lays the builds out in rows, one sheet per
// trick and gear (chase row over side row per build), and prints the penetration table.
import { chromium } from '@playwright/test';
import fs from 'fs';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const GPU = process.platform === 'darwin' ? ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist'] : ['--use-angle=d3d11'];

if (opt('--compose')) {
  const builds = opt('--compose').split(',').map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const out = opt('--out') || '.';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: GPU });
  const page = await browser.newPage({ viewport: { width: 2000, height: 1000 } });
  const keys = [...new Set(builds.flatMap((b) => Object.keys(b.runs)))];
  console.log(`${'trick'.padEnd(26)} ${builds.map((b) => b.label.padEnd(28)).join(' ')}`);
  console.log(`${''.padEnd(26)} ${builds.map(() => 'body  hand  sunk  base (cm)   ').join(' ')}`);
  for (const key of keys) {
    const rows = builds.filter((b) => b.runs[key]).map((b) => ({ label: b.label, r: b.runs[key] }));
    console.log(`${key.padEnd(26)} ${builds.map((b) => { const m = b.runs[key]?.max; return m ? ['body', 'hand', 'sunk', 'base'].map((k) => m[k].toFixed(1).padStart(4)).join('  ').padEnd(28) : '-'.padEnd(28); }).join(' ')}`);
    const html = `<body style="margin:0;background:#15171b;color:#ddd;font:13px system-ui"><div id=s style="display:inline-block;padding:6px">
      <div style="font-size:16px;font-weight:600;margin:2px 0 6px">${key}</div>
      ${rows.map(({ label, r }) => `<div style="margin-bottom:8px"><div style="margin:2px 0">${label} · air ${r.air}s · max body ${r.max.body.toFixed(1)} hand ${r.max.hand.toFixed(1)} sunk ${r.max.sunk.toFixed(1)} base ${r.max.base.toFixed(1)} cm</div>
        ${r.shots[0].imgs.map((_, v) => `<div style="display:flex;gap:2px;margin-bottom:2px">${r.shots.map((s) => `<div style="position:relative"><img src="${s.imgs[v]}" style="display:block"><span style="position:absolute;left:3px;top:2px;font-size:10px;color:#123;text-shadow:0 0 2px #fff">${s.t}s ${s.spin}°/${s.flip}°</span></div>`).join('')}</div>`).join('')}
      </div>`).join('')}</div></body>`;
    await page.setContent(html);
    await page.waitForFunction(() => [...document.images].every((i) => i.complete));
    const f = `${out}/${key.replace(/[^a-z0-9]+/gi, '_')}.png`;
    await page.locator('#s').screenshot({ path: f });
    console.log(`  sheet ${f}`);
  }
  await browser.close();
  process.exit(0);
}

const base = (args.find((a) => /^https?:/.test(a)) || 'http://localhost:5211/').replace(/\/?$/, '/');
const label = opt('--label') || base;
const gears = opt('--gear') ? [opt('--gear')] : ['ski', 'snowboard'];
const browser = await chromium.launch({ args: GPU });
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${base}src/equipment/spinharness.html`);
await page.waitForFunction(() => window.__spin?.ready, null, { timeout: 120000 });
const tricks = opt('--tricks')?.split(',') || await page.evaluate(() => window.__spin.TRICKS);
const runs = {};
for (const gear of gears) for (const trick of tricks) {
  const r = await page.evaluate((o) => window.__spin.run(o), { gear, trick, frames: +(opt('--frames') || 9), style: args.includes('--style'), ...(opt('--views') ? { views: opt('--views').split(',') } : {}), ...(opt('--size') ? { w: +opt('--size').split('x')[0], h: +opt('--size').split('x')[1] } : {}) });
  runs[`${gear} ${trick}`] = r;
  const m = r.max;
  console.log(`${label} ${gear} ${trick}: air ${r.air}s  max body ${m.body.toFixed(2)} hand ${m.hand.toFixed(2)} sunk ${m.sunk.toFixed(2)} base ${m.base.toFixed(2)} cm  (frames ${JSON.stringify(r.at)})`);
}
await browser.close();
if (errors.length) console.log('ERRORS:\n  ' + errors.slice(0, 10).join('\n  '));
if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify({ label, runs }));
process.exit(errors.length ? 1 : 0);
