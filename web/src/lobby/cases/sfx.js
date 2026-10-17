// Case-opening sounds, synthesised with WebAudio (no files): reel ticks, the case latch, the reveal
// stingers that escalate with rarity, a near-miss "whoosh" and the case-earned chime. Own context so
// audio.js stays untouched; the volume follows the game's master × sfx settings.
//   caseSfx.tick(speed)  caseSfx.open()  caseSfx.reveal(rarity)  caseSfx.earned()  caseSfx.land()
import { settings } from '../../state.js';

let ctx = null, out = null;
function ac() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  out = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  out.connect(comp).connect(ctx.destination);
  return ctx;
}
const vol = () => (settings.master ?? 0.8) * (settings.sfx ?? 0.8);

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  return s;
}

function tone(freq, t, { type = 'sine', a = 0.005, d = 0.3, gain = 0.2, detune = 0, glide = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(freq * glide, t + a + d);
  env(g, t, a, gain * vol(), d);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + a + d + 0.05);
}

function burst(t, { f = 3000, q = 1, d = 0.05, gain = 0.2, type = 'bandpass' } = {}) {
  const s = noise(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  flt.type = type; flt.frequency.value = f; flt.Q.value = q;
  env(g, t, 0.002, gain * vol(), d);
  s.connect(flt).connect(g).connect(out);
  s.start(t, Math.random() * 0.3); s.stop(t + d + 0.05);
}

const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);
// Reveal stingers: rising arpeggios; each tier adds notes, brightness and a tail.
const STINGERS = {
  common: { notes: [67, 71], type: 'triangle', gain: 0.16, step: 0.07, tail: 0.35 },
  uncommon: { notes: [67, 71, 74], type: 'triangle', gain: 0.18, step: 0.07, tail: 0.45 },
  rare: { notes: [67, 71, 74, 79], type: 'sawtooth', gain: 0.1, step: 0.065, tail: 0.6 },
  epic: { notes: [64, 68, 71, 76, 80], type: 'sawtooth', gain: 0.11, step: 0.06, tail: 0.8 },
  legendary: { notes: [62, 66, 69, 74, 78, 81], type: 'square', gain: 0.07, step: 0.06, tail: 1.1 },
  gold: { notes: [60, 64, 67, 72, 76, 79, 84, 88], type: 'square', gain: 0.07, step: 0.055, tail: 1.6 },
};

export const caseSfx = {
  /** Unlock on a user gesture (the Open click). */
  unlock() { ac(); },

  /** One reel tick: a short plastic click; `speed` 0..1 brightens it while the reel is fast. */
  tick(speed = 0.5) {
    if (!ac()) return;
    const t = ctx.currentTime;
    burst(t, { f: 2200 + speed * 2600 + Math.random() * 300, q: 6, d: 0.028, gain: 0.32 });
    tone(1400 + speed * 600, t, { type: 'square', a: 0.001, d: 0.018, gain: 0.05 });
  },

  /** The case unlatching: two clunks, a rising air whoosh. */
  open() {
    if (!ac()) return;
    const t = ctx.currentTime;
    tone(110, t, { type: 'square', a: 0.002, d: 0.08, gain: 0.25, glide: 0.6 });
    burst(t, { f: 800, q: 2, d: 0.08, gain: 0.3 });
    tone(150, t + 0.45, { type: 'square', a: 0.002, d: 0.1, gain: 0.3, glide: 0.5 });
    burst(t + 0.45, { f: 600, q: 2, d: 0.12, gain: 0.35 });
    const s = noise(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    flt.type = 'bandpass'; flt.Q.value = 1.2;
    flt.frequency.setValueAtTime(400, t + 0.6); flt.frequency.exponentialRampToValueAtTime(5000, t + 1.9);
    g.gain.setValueAtTime(0.0001, t + 0.6); g.gain.exponentialRampToValueAtTime(0.22 * vol(), t + 1.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.1);
    s.loop = true; s.connect(flt).connect(g).connect(out); s.start(t + 0.6); s.stop(t + 2.2);
  },

  /** The reel stops: a soft thunk. */
  land() {
    if (!ac()) return;
    const t = ctx.currentTime;
    tone(180, t, { type: 'sine', a: 0.003, d: 0.18, gain: 0.3, glide: 0.7 });
  },

  /** Reveal stinger for a rarity (grey → gold escalates). */
  reveal(rarity = 'common') {
    if (!ac()) return;
    const s = STINGERS[rarity] || STINGERS.common;
    const t = ctx.currentTime + 0.02;
    s.notes.forEach((n, i) => {
      const at = t + i * s.step;
      const last = i === s.notes.length - 1;
      tone(NOTE(n), at, { type: s.type, a: 0.006, d: last ? s.tail : 0.22, gain: s.gain });
      tone(NOTE(n + 12), at, { type: 'sine', a: 0.004, d: last ? s.tail * 0.8 : 0.15, gain: s.gain * 0.5, detune: 6 });
    });
    if (rarity === 'epic' || rarity === 'legendary' || rarity === 'gold') {
      // Shimmer: a bed of detuned sines and a cymbal-ish wash.
      const end = t + s.notes.length * s.step;
      for (const [n, dt] of [[s.notes.at(-1) + 12, -8], [s.notes.at(-1) + 19, 7], [s.notes.at(-1) + 24, 0]]) tone(NOTE(n), end, { a: 0.05, d: s.tail * 1.4, gain: 0.05, detune: dt });
      burst(end, { f: 8000, q: 0.7, d: s.tail, gain: 0.12, type: 'highpass' });
    }
    if (rarity === 'gold') {
      const end = t + s.notes.length * s.step;
      tone(NOTE(36), end, { type: 'sawtooth', a: 0.01, d: 1.8, gain: 0.12 });
      for (let i = 0; i < 10; i++) tone(NOTE(96 + (i % 5) * 2), end + 0.12 * i, { a: 0.002, d: 0.25, gain: 0.04 });
    }
  },

  /** The reel crawling past a rare card it will not stop on. */
  tease() {
    if (!ac()) return;
    const t = ctx.currentTime;
    tone(NOTE(84), t, { a: 0.01, d: 0.25, gain: 0.04, glide: 0.94 });
  },

  /** A case was earned: a bright two-note chime. */
  earned() {
    if (!ac()) return;
    const t = ctx.currentTime;
    tone(NOTE(76), t, { type: 'triangle', d: 0.18, gain: 0.16 });
    tone(NOTE(83), t + 0.1, { type: 'triangle', d: 0.4, gain: 0.16 });
    tone(NOTE(88), t + 0.1, { d: 0.5, gain: 0.06 });
  },

  /** UI click for buttons in the cases screens. */
  click() {
    if (!ac()) return;
    burst(ctx.currentTime, { f: 1800, q: 3, d: 0.03, gain: 0.15 });
  },
};
