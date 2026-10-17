// Headless audio test: renders scripted rides through the real audio engine (AudioWorklet DSP + one-shots)
// on an OfflineAudioContext in Chromium and checks levels, clipping and NaNs; optionally writes WAVs.
// Usage: node web/scripts/audio-test.mjs [baseUrl] [wavDir] [traceDir] [only]   (LISTEN=1: no test tone in the WAVs)
//   baseUrl  dev server (default http://localhost:5192/)
//   wavDir   write <scenario>.wav files there (optional)
//   traceDir real-physics traces from scripts/audio-trace.mjs (trace-ski.json, trace-snowboard.json; optional)
//   only     run only scenarios whose name contains this
// Exit 1 on failure.
import { chromium } from '@playwright/test';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const base = (process.argv[2] || 'http://localhost:5192/').replace(/\/?$/, '/');
const wavDir = process.argv[3] && process.argv[3] !== '-' ? process.argv[3] : null;
const traceDir = process.argv[4] && process.argv[4] !== '-' ? process.argv[4] : null;
const only = process.argv[5] || '';
const tune = process.env.TUNE ? JSON.parse(process.env.TUNE) : null;   // e.g. TUNE='{"snow":{"grains":{"gain":0}}}'
if (wavDir) mkdirSync(wavDir, { recursive: true });

// ---------------------------------------------------------------- scenario builders
const DT = 1 / 60;
const F0 = { st: 1, speed: 0, vy: 0, edge: 0, edgeSign: 0, skid: 0, skidAmt: 0, carve: 0, cq: 1, load: 1, stop: 0, brake: 0,
  groomed: 1, powder: 0, rock: 0, extra: 0, deep: 0, sink: 0, spin: 0, flip: 0, grab: 0, air: 0, tuck: 0, board: 0, butter: 0,
  grindV: 0, grindKind: '', grindHop: 0, comp: 0, push: 0 };
function frames(seconds, fn) {
  const out = [];
  for (let i = 0; i < seconds / DT; i++) { const t = i * DT; out.push({ ...F0, ...fn(t, i) }); }
  return out;
}
const ramp = (t, a, b, v0, v1) => v0 + (v1 - v0) * Math.min(1, Math.max(0, (t - a) / (b - a)));
// linked carved turns: edge angle swings with the turn, load peaks mid-turn
const carve = (t, period, edgeMax, speed) => {
  const ph = Math.sin((2 * Math.PI * t) / period), e = Math.abs(ph) * edgeMax;
  return { edge: e, edgeSign: Math.sign(ph) || 1, load: 1 + Math.abs(ph) * (speed / 14) * 0.8, skid: 0.03 + 0.04 * Math.abs(ph), skidAmt: 0.05, carve: ph * 0.8 };
};

const S = [];
const add = (name, s) => { if (!only || name.includes(only)) S.push({ name, ...s }); };

add('idle-alpine', { seconds: 6, frames: frames(6, () => ({ speed: 0 })), map: 'valcrest-gully' });
add('groomed-glide-ski', { seconds: 8, frames: frames(8, (t) => ({ speed: ramp(t, 0, 5, 0, 14) })) });
add('groomed-carve-ski', { seconds: 12, frames: frames(12, (t) => ({ speed: ramp(t, 0, 3, 4, 15), ...carve(t, 2.6, 1.0, 15) })) });
add('groomed-carve-board', { seconds: 12, frames: frames(12, (t) => ({ board: 1, speed: ramp(t, 0, 3, 4, 15), ...carve(t, 3.0, 0.95, 15) })) });
add('ice-carve-ski', { seconds: 10, frames: frames(10, (t) => ({ groomed: 0.2, rock: 0.8, speed: 16, ...carve(t, 2.4, 0.9, 16) })) });
add('powder-ski', { seconds: 10, frames: frames(10, (t) => ({ groomed: 0, powder: 1, deep: 1, sink: 0.18, speed: ramp(t, 0, 3, 3, 11), ...carve(t, 3.2, 0.6, 11) })) });
add('powder-board', { seconds: 10, frames: frames(10, (t) => ({ board: 1, groomed: 0, powder: 1, deep: 1, sink: 0.2, speed: ramp(t, 0, 3, 3, 11), ...carve(t, 3.5, 0.6, 11) })) });
add('hockey-stop-ski', {
  seconds: 6,
  frames: frames(6, (t) => (t < 2 ? { speed: 14, ...carve(t, 2.6, 0.5, 14) } : { speed: Math.max(0, 14 - (t - 2) * 9), skid: 1.35, skidAmt: 1, stop: t < 3.6 ? 1 : 0, edge: 0.8, edgeSign: 1 })),
  events: [{ t: 2, name: 'hardBrake', d: 14 }],
});
add('hockey-stop-board', {
  seconds: 6,
  frames: frames(6, (t) => (t < 2 ? { board: 1, speed: 14, ...carve(t, 3, 0.5, 14) } : { board: 1, speed: Math.max(0, 14 - (t - 2) * 9), skid: 1.4, skidAmt: 1, stop: t < 3.6 ? 1 : 0, edge: 0.8, edgeSign: 1 })),
  events: [{ t: 2, name: 'hardBrake', d: 14 }],
});
// big-mountain speed (Ravenspire): 31 m/s ≈ 70 mph, tucked, a few drifts
for (const view of ['chase', 'fp']) {
  add(`bigmountain-70mph-${view}`, { seconds: 12, map: 'ravenspire', view, musicTone: true,
    frames: frames(12, (t) => ({ groomed: 0.4, powder: 0.3, rock: 0.3, speed: ramp(t, 0, 6, 12, 31), tuck: t > 3 ? 1 : 0, ...carve(t, 5, 0.45, 31) })) });
}
add('wind-sweep', { seconds: 16, solo: 'windBus', map: 'default', frames: frames(16, (t) => ({ speed: ramp(t, 0, 16, 0, 32) })) });
add('jump-spin-grab-ski', {
  seconds: 7, musicTone: true,
  frames: frames(7, (t) => {
    if (t < 2) return { speed: 13, ...carve(t, 2.6, 0.5, 13) };
    if (t < 4.2) return { st: 2, speed: 14, air: t - 2, spin: 7.5, grab: t > 2.4 && t < 3.6 ? 1 : 0 };
    return { speed: 12, ...carve(t, 2.6, 0.3, 12) };
  }),
  events: [{ t: 2, name: 'takeoff' }, { t: 4.2, name: 'landed', d: { impact: 7, rawImpact: 8 } }],
});
add('jump-flip-board-powder', {
  seconds: 7,
  frames: frames(7, (t) => {
    const P = { board: 1, groomed: 0, powder: 1, deep: 1, sink: 0.15 };
    if (t < 2) return { ...P, speed: 11, ...carve(t, 3, 0.4, 11) };
    if (t < 4) return { ...P, st: 2, speed: 12, air: t - 2, flip: 6, spin: 2, grab: t > 2.5 && t < 3.4 ? 1 : 0 };
    return { ...P, speed: 9, sink: 0.25 };
  }),
  events: [{ t: 2, name: 'takeoff' }, { t: 4, name: 'landed', d: { impact: 6, rawImpact: 7 } }],
});
add('crash', { seconds: 5, musicTone: true,
  frames: frames(5, (t) => (t < 1.5 ? { speed: 15, ...carve(t, 2.6, 0.6, 15) } : { st: 3, speed: Math.max(0, 15 - (t - 1.5) * 8) })),
  events: [{ t: 1.5, name: 'crashed' }] });
add('near-miss-trees', { seconds: 6, map: 'blackspruce',
  frames: frames(6, (t) => ({ speed: 15, ...carve(t, 2.4, 0.5, 15) })),
  events: [{ t: 0.6, name: 'treePass', d: { pan: 0.6, dist: 4.5, kind: 'tree', speed: 15 } }, { t: 3.4, name: 'treePass', d: { pan: -0.5, dist: 5.5, kind: 'tree', speed: 15 } }, { t: 1.2, name: 'nearMiss', d: { pan: -0.8, dist: 1.4, kind: 'tree' } }, { t: 2.6, name: 'nearMiss', d: { pan: 0.8, dist: 1.0, kind: 'tree' } }, { t: 4.2, name: 'nearMiss', d: { pan: 0.4, dist: 2, kind: 'rock' } }] });
add('rail-grind-board', { seconds: 6, map: 'voltage-park',
  frames: frames(6, (t) => (t < 1.5 ? { board: 1, speed: 8 } : t < 4 ? { board: 1, st: 5, speed: 8, grindV: 8 - (t - 1.5), grindKind: 'rail' } : { board: 1, speed: 6 })),
  events: [{ t: 1.5, name: 'grindStart', d: { kind: 'rail' } }, { t: 2.6, name: 'grindKink', d: { kink: 14 } }, { t: 4, name: 'grindEnd', d: { reason: 'end' } }, { t: 4.1, name: 'landed', d: { impact: 3 } }] });
add('box-grind-ski', { seconds: 5, map: 'voltage-park',
  frames: frames(5, (t) => (t < 1 ? { speed: 7 } : t < 3.5 ? { st: 5, speed: 7, grindV: 7, grindKind: 'box' } : { speed: 6 })),
  events: [{ t: 1, name: 'grindStart', d: { kind: 'box' } }, { t: 3.5, name: 'grindEnd', d: { reason: 'end' } }] });
add('forest-ambience', { seconds: 12, map: 'blackspruce', frames: frames(12, () => ({ speed: 0 })) });
add('park-pa', { seconds: 8, map: 'voltage-park', tune: { ambience: { pa: { every: [1, 2] } } }, frames: frames(8, () => ({ speed: 0 })) });
add('park-crowd', { seconds: 10, tune: { ambience: { pa: { every: [60, 90] } } }, map: 'voltage-park', frames: frames(10, () => ({ speed: 0 })), events: [{ t: 3, name: 'parkLanding', d: { clean: true, dist: 18 } }] });
add('slowmo-air', { seconds: 5, opts: { slow: 0.35 }, frames: frames(5, (t) => (t < 1 ? { speed: 14 } : { st: 2, speed: 14, air: t - 1, spin: 4 })) });
add('extreme-inputs', { seconds: 4, frames: frames(4, (t) => ({ speed: 80 * (t % 1), edge: 3, load: 9, skid: 9, stop: 1, groomed: 1, powder: 1, rock: 1, sink: 2, spin: 60, flip: 60, st: t % 1 < 0.5 ? 1 : 2, air: 3, board: t > 2 ? 1 : 0 })),
  events: [{ t: 0.5, name: 'landed', d: { impact: 40 } }, { t: 1, name: 'crashed' }, { t: 1.1, name: 'crashed' }, { t: 1.2, name: 'landed', d: { impact: 30 } }] });
add('extreme-full-volume', { seconds: 4, volumes: { master: 1, sfx: 1, music: 1 }, view: 'fp', map: 'ravenspire', music: true,
  frames: frames(4, (t) => ({ speed: 45, edge: 1.2, load: 3, skid: 1.4, stop: 1, rock: 1, groomed: 0, st: t % 1 < 0.6 ? 1 : 2, air: 1, spin: 20, board: 1 })),
  events: [0.3, 0.9, 1.5, 2.1, 2.7, 3.3].map((t, i) => ({ t, name: i % 2 ? 'crashed' : 'landed', d: { impact: 25 } })) });
add('lift-ride', { seconds: 10, frames: frames(10, () => ({ st: 4, speed: 0 })), events: [{ t: 0.2, name: 'liftBoarded' }, { t: 2, name: 'liftTower' }, { t: 7, name: 'liftTower' }, { t: 9.5, name: 'liftArrived' }] });
add('ride-start', { seconds: 4, solo: 'fxBus', frames: frames(4, () => ({ speed: 0 })), events: [{ t: 0.1, name: 'rideStarted', d: { board: 0 } }, { t: 2, name: 'rideStarted', d: { board: 1 } }] });
add('breath-after-run', { seconds: 26, view: 'fp',
  frames: frames(26, (t) => (t < 16 ? { speed: 16, ...carve(t, 2.4, 1.0, 16), load: 1.9 } : { speed: Math.max(0, 16 - (t - 16) * 8), stop: t < 18 ? 1 : 0, skid: t < 18 ? 1.3 : 0 })) });
add('powder-faceshot-fp', { seconds: 8, view: 'fp', frames: frames(8, (t) => ({ groomed: 0, powder: 1, deep: 1, sink: 0.22, speed: 11, ...carve(t, 2.2, 0.7, 11) })) });
add('slalom-gates', { seconds: 6, frames: frames(6, (t) => ({ speed: 14, ...carve(t, 1.6, 0.9, 14) })), events: [0.8, 1.6, 2.4, 3.2, 4.0, 4.8].map((t) => ({ t, name: 'gate', d: { pass: true } })) });
add('skier-passes', { seconds: 8, solo: 'fxBus', frames: frames(8, () => ({ speed: 0 })), others: [{ x: 3, z: -50, vz: 12, speed: 12, wig: 2 }, { x: -6, z: -120, vz: 14, speed: 14, wig: 3 }] });
add('fallback-no-worklet', { seconds: 6, noWorklet: true, frames: frames(6, (t) => ({ speed: ramp(t, 0, 3, 4, 15), ...carve(t, 2.6, 1.0, 15) })) });
// landings only (no ride around them): skis 3 / 7 / 11 m/s on groomed, a board at 8, then powder at 8 — 1.5 s apart
add('landings', { seconds: 9, solo: 'fxBus', frames: frames(9, (t) => (t < 4.5 ? { speed: 0, board: t > 4.4 ? 1 : 0 } : t < 6 ? { speed: 0, board: 1 } : { speed: 0, board: 0, groomed: 0, powder: 1, deep: 1 })),
  events: [[0.5, 3], [2, 7], [3.5, 11], [5, 8], [6.5, 8], [8, 12]].map(([t, impact]) => ({ t, name: 'landed', d: { impact, rawImpact: impact } })) });
add('cold-slow-board', { seconds: 8, map: 'ravenspire', frames: frames(8, (t) => ({ board: 1, speed: ramp(t, 0, 8, 1, 14), ...carve(t, 3, 0.4, 6) })) });
add('music-energy-drop', { seconds: 7, music: true, tune: { mix: { snow: 0, wind: 0, ambience: 0, fx: 0 } }, frames: frames(7, () => ({ speed: 0 })),
  events: [{ t: 0, name: 'musicEnergy', d: { level: 0 } }, { t: 3, name: 'musicDrop', d: { strength: 1 } }, { t: 3, name: 'musicEnergy', d: { level: 1 } }] });
add('fjord-and-bell', { seconds: 12, map: 'fjordline', tune: { ambience: { gulls: { every: [1, 2] } }, maps: { fjordline: { bell: 1 } } }, frames: frames(12, () => ({ speed: 0 })) });
add('ridge-howl', { seconds: 16, map: 'ravenspire', tune: { wind: { gust: { tau: 1.2 } } }, frames: frames(16, () => ({ speed: 0 })) });
add('camera-pulls-away', { seconds: 6, frames: frames(6, (t) => ({ speed: 14, ...carve(t, 2.6, 0.8, 14), camDist: t < 2 ? 5 : 5 + (t - 2) * 30 })) });
add('push-off', { seconds: 4, frames: frames(4, (t) => ({ speed: ramp(t, 0, 4, 0.5, 5), push: 1, board: t > 2 ? 1 : 0 })) });
add('bumps', { seconds: 5, frames: frames(5, (t) => ({ speed: 12, ...carve(t, 2.6, 0.4, 12), comp: (t % 1) < 0.1 ? 0.9 * ((t % 1) / 0.1) : 0.9 * Math.exp(-((t % 1) - 0.1) / 0.12) })) });
if (traceDir) for (const type of ['ski', 'snowboard', 'bigmountain']) {
  const f = join(traceDir, `trace-${type}.json`);
  if (!existsSync(f)) continue;
  const tr = JSON.parse(readFileSync(f, 'utf8'));
  add(`trace-${type}`, { seconds: Math.min(40, tr.frames.length * tr.dt), map: type === 'bigmountain' ? 'ravenspire' : 'valcrest-gully', frames: tr.frames, events: tr.events.map((e) => ({ t: e.t, name: e.name, d: e.d })), musicTone: true });
}

// ---------------------------------------------------------------- run
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(base + 'src/audio/harness.html');
await page.waitForFunction(() => window.harnessReady, null, { timeout: 30000 });
const R = {};
let fails = 0;
const fail = (msg) => { fails++; console.log('  FAIL', msg); };
const db = (x) => (x > 0 ? (20 * Math.log10(x)).toFixed(1) : '-inf');
for (const s of S) {
  const t0 = Date.now();
  // LISTEN=1: renders for listening — no 220 Hz test tone (the ducking checks that use it are skipped)
  const r = await page.evaluate((spec) => window.renderScenario(spec), { ...s, ...(process.env.LISTEN ? { musicTone: false } : {}), wav: !!wavDir, tune: [s.tune, tune].filter(Boolean) });
  R[s.name] = r;
  if (wavDir && r.wav) writeFileSync(join(wavDir, `${s.name}.wav`), Buffer.from(r.wav, 'base64'));
  const loud = [...r.rms].sort((a, b) => a - b)[Math.floor(r.rms.length * 0.9)] || 0;
  console.log(`${s.name.padEnd(26)} peak ${db(r.peak).padStart(6)} dBFS  rms ${db(r.rmsAll).padStart(6)}  p90 ${db(loud).padStart(6)}  centroid ${r.centroid.toFixed(0).padStart(5)} Hz  ${Date.now() - t0} ms  ${JSON.stringify(r.events)}`);
  if (process.env.BANDS) console.log('      bands dB ' + Object.entries(r.bands).map(([f, v]) => `${f}:${v}`).join(' '));
  if (!r.worklet && !s.noWorklet) fail(`${s.name}: worklet did not load`);
  if (s.noWorklet && (r.worklet || r.rmsAll < 0.003)) fail(`${s.name}: the sample-loop fallback is silent or did not engage`);
  if (r.nan) fail(`${s.name}: ${r.nan} non-finite samples`);
  if (r.workletError) fail(`${s.name}: the worklet DSP threw (processorerror)`);
  if (r.paramNaN) fail(`${s.name}: ${r.paramNaN} non-finite parameters`);
  if (r.peak > 0.9) fail(`${s.name}: peak above −1 dBFS (${r.peak.toFixed(3)})`);
}
// ---------------------------------------------------------------- relative checks (sound design sanity)
const lvl = (n, a = 0, b = 1e9) => { const r = R[n]; if (!r) return null; const w = r.rms.slice(Math.floor(a / 0.1), Math.floor(b / 0.1)); return Math.sqrt(w.reduce((s, x) => s + x * x, 0) / Math.max(1, w.length)); };
const expect = (cond, msg) => { if (cond === null) return; if (!cond) fail(msg); else console.log('  ok  ', msg); };
const has = (...n) => n.every((x) => R[x]);
if (has('idle-alpine', 'groomed-carve-ski')) expect(lvl('groomed-carve-ski', 4) > lvl('idle-alpine') * 3, 'carving is clearly louder than standing still');
if (has('groomed-glide-ski')) expect(lvl('groomed-glide-ski', 6, 8) > lvl('groomed-glide-ski', 0.5, 1.5) * 2, 'snow gets louder with speed');
if (has('powder-ski', 'groomed-carve-ski')) expect(lvl('powder-ski', 4) < lvl('groomed-carve-ski', 4), 'powder is quieter than a groomed carve');
if (has('powder-ski', 'groomed-carve-ski')) expect(R['powder-ski'].centroid < R['groomed-carve-ski'].centroid, 'powder is darker than groomed');
if (has('ice-carve-ski', 'groomed-carve-ski')) expect(R['ice-carve-ski'].centroid > R['groomed-carve-ski'].centroid, 'ice is brighter than groomed');
if (has('groomed-carve-board', 'groomed-carve-ski')) expect(R['groomed-carve-board'].centroid < R['groomed-carve-ski'].centroid, 'a board sounds lower than skis');
if (has('hockey-stop-ski')) expect(lvl('hockey-stop-ski', 2, 3.2) > lvl('hockey-stop-ski', 0.5, 1.9) * 1.3, 'a hockey stop is louder than the carve before it');
if (has('wind-sweep')) {
  expect(lvl('wind-sweep', 14, 16) > lvl('wind-sweep', 3, 5) * 3, 'wind at 30 m/s is much louder than at 4 m/s');
  expect(lvl('wind-sweep', 14, 16) < 0.5, 'wind at 30 m/s is not overwhelming');
}
if (has('bigmountain-70mph-fp', 'bigmountain-70mph-chase')) expect(lvl('bigmountain-70mph-fp', 8) > lvl('bigmountain-70mph-chase', 8), 'first person is windier than the chase cam');
if (has('jump-spin-grab-ski')) expect(Math.max(...R['jump-spin-grab-ski'].pk.slice(41, 46)) > Math.max(...R['jump-spin-grab-ski'].pk.slice(30, 38)) * 1.2, 'the landing stands out of the air');
if (has('forest-ambience', 'idle-alpine')) expect(lvl('forest-ambience') > lvl('idle-alpine') * 0.8, 'the forest has its own bed');
if (has('lift-ride')) expect(lvl('lift-ride', 2, 3.5) > lvl('lift-ride', 4, 6.8) * 1.4, 'a lift tower rattles over the rope hum');   // rms: a random chair creak can't fake it
if (has('breath-after-run')) expect((R['breath-after-run'].events.breath || 0) >= 3 && !R['groomed-carve-ski']?.events.breath, 'the rider catches their breath after a hard run');
if (has('powder-faceshot-fp')) expect((R['powder-faceshot-fp'].events.faceShot || 0) >= 2, 'deep powder turns throw face shots');
if (has('park-pa')) expect((R['park-pa'].events.pa || 0) >= 2, 'the park PA speaks up');
if (has('skier-passes')) { const p = R['skier-passes'].rms; expect(Math.max(...p.slice(30, 50)) > Math.max(...p.slice(0, 10)) * 3, 'another skier swishes past and fades'); }
if (has('cold-slow-board')) expect((R['cold-slow-board'].events.squeak || 0) >= 5, 'cold snow squeaks when riding slowly');
if (has('music-energy-drop')) { const r = R['music-energy-drop']; expect(r.centroid > 0 && (r.events.musicDrop || 0) === 1, 'music energy and drops drive the music'); }
if (has('camera-pulls-away')) expect(lvl('camera-pulls-away', 5, 6) < lvl('camera-pulls-away', 0.5, 1.8) * 0.4, 'the rider fades when the camera pulls far away');
if (has('push-off')) expect((R['push-off'].events.push || 0) >= 5, 'pushing off on the flat makes strokes');
if (has('bumps')) expect((R['bumps'].events.bump || 0) >= 4, 'bumps and rollers thump through the legs');
if (has('park-crowd')) expect(lvl('park-crowd', 3.2, 5) > lvl('park-crowd', 0.5, 2.5) * 1.5, 'a clean park landing gets a cheer');
await browser.close();
if (errors.length) { console.log('page errors:', errors.slice(0, 5)); fails++; }
console.log(fails ? `\n${fails} FAILURE(S)` : '\nall audio checks passed');
process.exit(fails ? 1 : 0);
