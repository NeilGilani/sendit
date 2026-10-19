// Crash ragdoll stick-figure sheets (docs/body.md § Severity → Visual check). Headless: runs aimed crashes from
// ragdoll-fuzz.mjs (tierScenario) or its random set (scenario) and draws the capsule bodies every `every` seconds,
// side view (along the line of travel) above, rear view below, one row per crash. Fast and deterministic: the
// motion itself, without the mesh, camera or lighting.
//
//   node web/scripts/ragdoll-sticks.mjs <out.png> [tier indices, e.g. 0,1,2,9,10] [every=0.1] [seconds=1.6]
//   RAND=1 → indices into the random fuzz set instead.
import fs from 'node:fs';
import { chromium } from '@playwright/test';
process.env.NOFUZZ = '1';
const { THREE } = await import('./ragdoll-lib.mjs');
const F = await import('./ragdoll-fuzz.mjs');

const [out = '/tmp/ragdoll-sticks.png', list = '0,1,2,3,4,5,6,7,8', every = '0.1', secs = '1.6'] = process.argv.slice(2);
const idx = list.split(',').map(Number);
const EVERY = Number(every), SECS = Number(secs);
const COLORS = { pelvis: '#c33', chest: '#c33', head: '#e95', upperarmL: '#36c', forearmL: '#36c', upperarmR: '#69e', forearmR: '#69e',
  thighL: '#393', shinL: '#393', thighR: '#7c7', shinR: '#7c7', board: '#222' };

const rows = [];
for (const i of idx) {
  const sc = process.env.RAND ? F.scenario(i) : F.tierScenario(i);
  const { pl, ctl, T } = F.setup(sc, { dt: 1 / 60 });
  const frames = [];
  let t = 0, k = 0;
  const steps = Math.round(SECS * 60);
  // View frame: travel direction (horizontal) and its side.
  const fwd = new THREE.Vector3(pl.velocity.x, 0, pl.velocity.z).normalize(), side = new THREE.Vector3(-fwd.z, 0, fwd.x);
  for (let s = 0; s <= steps; s++) {
    ctl.stepCrash(pl, 1 / 60); t += 1 / 60;
    if (s % Math.round(EVERY * 60) !== 0) continue;
    const W = ctl.H.world, com = W.com(0, new THREE.Vector3());
    const caps = [];
    for (const b of W.bodies) {
      for (const sh of b.shapes) {
        const a = b.point(sh.a, new THREE.Vector3()), e = sh.kind === 'c' ? b.point(sh.b, new THREE.Vector3()) : a.clone();
        caps.push({ n: b.name, a, e, r: sh.r, gear: b.group !== 0 || sh.r < 0.03 });
      }
    }
    // ground profile under the body (side view)
    const gnd = [];
    for (let d = -1.6; d <= 1.6; d += 0.2) { const x = com.x + fwd.x * d, z = com.z + fwd.z * d; gnd.push([d, T.getHeight(x, z) - com.y]); }
    const gndS = [];
    for (let d = -1.6; d <= 1.6; d += 0.2) { const x = com.x + side.x * d, z = com.z + side.z * d; gndS.push([d, T.getHeight(x, z) - com.y]); }
    frames.push({ t, caps, com, gnd, gndS });
    k++;
  }
  const m = ctl.m;
  rows.push({ i, sc, frames, label: `${process.env.RAND ? '#' : 'T'}${i} ${sc.aim || sc.cause} ${sc.type} ${sc.deg.toFixed(0)}° ${sc.speed.toFixed(1)} m/s → ${m.tier} s ${m.sev.toFixed(2)} [${Object.values(m.sevT).map((x) => x.toFixed(2)).join(' ')}] fall ${m.fall ?? '-'} · tumble ${(m.tumble * 57.3).toFixed(0)}° roll ${(m.roll * 57.3).toFixed(0)}° wMax ${m.wMax.toFixed(1)} hand ${m.armPeak.toFixed(2)} m loose ${m.mean.toFixed(2)}`, fwd, side });
  ctl.uninstall();
}

const CW = 120, CH = 120, S = 42;   // cell px, px per metre
const svgCell = (f, fwd, side, rear) => {
  const P = (v) => { const d = v.clone().sub(f.com); const h = rear ? d.dot(side) : d.dot(fwd); return [CW / 2 + h * S, CH * 0.62 - d.y * S]; };
  let g = '';
  const gl = rear ? f.gndS : f.gnd;
  g += `<polyline fill="none" stroke="#9ab" stroke-width="2" points="${gl.map(([d, y]) => `${CW / 2 + d * S},${CH * 0.62 - y * S}`).join(' ')}"/>`;
  const order = [...f.caps].sort((p, q) => (rear ? p.a.clone().sub(f.com).dot(fwd) - q.a.clone().sub(f.com).dot(fwd) : q.a.clone().sub(f.com).dot(side) - p.a.clone().sub(f.com).dot(side)));
  for (const c of order) {
    const [x1, y1] = P(c.a), [x2, y2] = P(c.e);
    const col = c.gear ? '#555' : COLORS[c.n] || '#888';
    g += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${col}" stroke-width="${Math.max(1.5, c.r * 2 * S).toFixed(1)}" stroke-linecap="round" opacity="0.9"/>`;
  }
  return `<svg width="${CW}" height="${CH}" style="background:#f4f6f8">${g}<text x="3" y="11" font-size="10" fill="#333">${f.t.toFixed(2)}s ${rear ? 'rear' : 'side'}</text></svg>`;
};
const html = `<html><body style="margin:0;background:#fff;font:11px monospace">${rows.map((r) => `<div style="padding:3px 4px;font-weight:bold">${r.label}</div>
  <div style="display:flex;gap:2px">${r.frames.map((f) => svgCell(f, r.fwd, r.side, false)).join('')}</div>
  <div style="display:flex;gap:2px;margin-bottom:6px">${r.frames.map((f) => svgCell(f, r.fwd, r.side, true)).join('')}</div>`).join('')}</body></html>`;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Math.max(800, (CW + 2) * Math.max(...rows.map((r) => r.frames.length)) + 10), height: 400 } });
await page.setContent(html);
const h = await page.evaluate(() => document.body.scrollHeight);
await page.setViewportSize({ width: page.viewportSize().width, height: h });
await page.screenshot({ path: out });
await browser.close();
for (const r of rows) console.log(r.label);
fs.writeFileSync(out.replace(/\.png$/, '.json'), JSON.stringify(rows.map((r) => r.label)));
