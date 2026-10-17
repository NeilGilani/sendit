// Runs the AudioWorklet DSP (web/src/audio/worklet.js) directly in Node with a tiny AudioWorklet shim — no
// browser — and checks the raw processor output: finite, never pinned at the ±1 safety clamp, sensible levels.
// Fast; catches filter blow-ups and NaNs that the limiter downstream would hide.
// Usage: node web/scripts/audio-dsp.mjs   (exit 1 on failure)
import { readFileSync } from 'node:fs';

const procs = {};
globalThis.sampleRate = 48000;
globalThis.AudioWorkletProcessor = class { constructor() { this.port = { postMessage: () => {}, onmessage: null }; } };
globalThis.registerProcessor = (name, cls) => { procs[name] = cls; };
await import('../src/audio/worklet.js');
const { AUDIO } = await import('../src/audio/tuning.js');

let fails = 0;
const fail = (m) => { fails++; console.log('  FAIL', m); };

/** Render `seconds` with params(t) → { name: value }; returns { peak, rms, pinned, nan }. */
function run(name, T, seconds, params) {
  const Cls = procs[name], p = new Cls({ processorOptions: { T } });
  const desc = Cls.parameterDescriptors;
  const L = new Float32Array(128), R = new Float32Array(128);
  let peak = 0, e = 0, n = 0, pinned = 0, nan = 0;
  for (let b = 0; b < (seconds * 48000) / 128; b++) {
    const t = (b * 128) / 48000, v = params(t);
    const ps = {};
    for (const d of desc) ps[d.name] = new Float32Array([v[d.name] ?? d.defaultValue]);
    p.process([], [[L, R]], ps);
    for (let i = 0; i < 128; i++) for (const x of [L[i], R[i]]) {
      if (!Number.isFinite(x)) { nan++; continue; }
      const a = Math.abs(x);
      peak = Math.max(peak, a); e += x * x; n++;
      if (a >= 0.7) pinned++;   // into the safety knee
    }
  }
  return { peak, rms: Math.sqrt(e / Math.max(1, n)), pinned, nan };
}

const carve = (t, s) => { const ph = Math.sin(t * 2.4); return { speed: s, ground: 1, edge: Math.abs(ph), load: 1 + Math.abs(ph) * 0.8, skid: 0.05 }; };
const snowCases = {
  idle: () => ({ speed: 0, ground: 1 }),
  'groomed carve': (t) => carve(t, 15),
  'board carve': (t) => ({ ...carve(t, 15), board: 1 }),
  'ice carve + chatter': (t) => ({ ...carve(t, 18), groomed: 0, ice: 1, chatter: 1 }),
  powder: (t) => ({ ...carve(t, 10), groomed: 0, powder: 1, sink: 0.8 }),
  'hockey stop': (t) => ({ speed: Math.max(0, 15 - t * 6), ground: 1, edge: 0.9, skid: 1, stop: 1 }),
  'cold slow board': (t) => ({ ...carve(t, 2 + t * 2), board: 1, cold: 1 }),
  'cold slow skis on ice': (t) => ({ ...carve(t, 2 + t * 2), groomed: 0.3, ice: 0.7, cold: 1, skid: 0.6 }),
  'slow motion': (t) => ({ ...carve(t, 15), rate: 0.4 }),
  'extreme params': (t) => ({ speed: 90 * (t % 1), ground: 1, edge: 5, load: 9, skid: 9, stop: 1, groomed: 3, powder: 2, ice: 4, park: 1, sink: 4, board: t > 2 ? 1 : 0, chatter: 3, cold: 3, rate: 3 }),
  'switching on and off': (t) => ({ ...carve(t, 15), ground: Math.floor(t * 4) % 2 }),
};
const windCases = {
  still: () => ({ v: 0, ambient: 0.4 }),
  '30 m/s first person': () => ({ v: 30, ambient: 0.4, buffet: 1, whistle: 1, flap: 1 }),
  'air spin': () => ({ v: 15, air: 1, spin: 12, ambient: 0.3 }),
  'extreme params': (t) => ({ v: 120 * (t % 1), air: 2, spin: 80, tuck: 3, ambient: 4, gusty: 5, rate: 4, buffet: 3, whistle: 3, flap: 3 }),
};

console.log('sendit-snow');
for (const [k, f] of Object.entries(snowCases)) {
  const r = run('sendit-snow', AUDIO.snow, 4, f);
  console.log(`  ${k.padEnd(24)} peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(4)}  pinned ${r.pinned}  nan ${r.nan}`);
  if (r.nan) fail(`snow / ${k}: ${r.nan} non-finite samples`);
  if (r.pinned > (k === 'extreme params' ? 4800 : 0)) fail(`snow / ${k}: ${r.pinned} samples into the output safety knee (blow-up or far too loud)`);
  if (k !== 'idle' && k !== 'extreme params' && r.peak >= 0.7) fail(`snow / ${k}: peak ${r.peak.toFixed(2)} reaches the safety knee`);
}
console.log('sendit-wind');
for (const [k, f] of Object.entries(windCases)) {
  const r = run('sendit-wind', AUDIO.wind, 4, f);
  console.log(`  ${k.padEnd(24)} peak ${r.peak.toFixed(3)}  rms ${r.rms.toFixed(4)}  pinned ${r.pinned}  nan ${r.nan}`);
  if (r.nan) fail(`wind / ${k}: ${r.nan} non-finite samples`);
  if (r.pinned > (k === 'extreme params' ? 4800 : 0)) fail(`wind / ${k}: ${r.pinned} samples into the output safety knee`);
}
// CPU: how much of one core the busiest realistic case needs (both processors run on the audio thread)
for (const [name, T, f] of [['sendit-snow', AUDIO.snow, (t) => ({ ...carve(t, 15), skid: 0.4, cold: 0.5, chatter: 0.5, groomed: 0.6, ice: 0.4 })], ['sendit-wind', AUDIO.wind, () => ({ v: 25, air: 1, spin: 8, ambient: 0.5, buffet: 1, whistle: 1, flap: 1 })]]) {
  const t0 = performance.now();
  run(name, T, 10, f);
  const ms = performance.now() - t0;
  console.log(`  cpu ${name}: ${(ms / 100).toFixed(2)} % of one core (10 s rendered in ${ms.toFixed(0)} ms)`);
}
console.log(fails ? `\n${fails} FAILURE(S)` : '\nworklet DSP ok');
process.exit(fails ? 1 : 0);
