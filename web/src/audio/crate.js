// One-shots for the 3D case opening (lobby/cases/crate3d.js, docs/rewards.md): the crate landing in
// snow, latch clacks, lid tension, the burst, reel ticks that drop in pitch as the reel slows, and
// reveal fanfares that grow with the grade (a unique one for ★ gold). All synthesised with WebAudio
// (no files). Own context with a compressor and a short generated room reverb, so audio.js and the
// existing case sounds (lobby/cases/sfx.js) stay untouched; volume follows master × sfx.
import { settings } from '../state.js';

let ctx = null, out = null, wet = null;
const vol = () => (settings.master ?? 0.8) * (settings.sfx ?? 0.8);
const NOTE = (n) => 440 * 2 ** ((n - 69) / 12);

function ac() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2;
  comp.connect(ctx.destination);
  out = ctx.createGain();
  out.connect(comp);
  // Room reverb: 1.8 s of decaying stereo noise.
  const len = Math.floor(ctx.sampleRate * 1.8);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2;
  }
  const conv = ctx.createConvolver();
  conv.buffer = ir;
  wet = ctx.createGain();
  wet.gain.value = 0.32;
  wet.connect(conv).connect(comp);
  return ctx;
}

function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

/** Route a node to the dry bus and (optionally) the reverb. */
function send(node, rev = 0) {
  node.connect(out);
  if (rev > 0) { const s = ctx.createGain(); s.gain.value = rev; node.connect(s).connect(wet); }
}

let noiseBuf = null;
function noise() {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  return s;
}

function tone(freq, t, { type = 'sine', a = 0.005, d = 0.3, gain = 0.2, detune = 0, glide = 0, rev = 0, lp = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t); o.detune.value = detune;
  if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + a + d);
  env(g, t, a, gain * vol(), d);
  let n = o.connect(g);
  if (lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; n = n.connect(f); }
  send(n, rev);
  o.start(t); o.stop(t + a + d + 0.1);
}

function hiss(t, { f = 3000, q = 1, a = 0.002, d = 0.05, gain = 0.2, type = 'bandpass', sweep = 0, rev = 0 } = {}) {
  const s = noise(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
  flt.type = type; flt.frequency.setValueAtTime(f, t); flt.Q.value = q;
  if (sweep) flt.frequency.exponentialRampToValueAtTime(f * sweep, t + a + d);
  env(g, t, a, gain * vol(), d);
  send(s.connect(flt).connect(g), rev);
  s.start(t, Math.random() * 0.5); s.stop(t + a + d + 0.1);
}

/** A brassy chord: detuned saws through a lowpass that opens and closes. */
function brass(notes, t, { d = 1.2, gain = 0.06, open = 2400, rev = 0.5 } = {}) {
  const flt = ctx.createBiquadFilter(), g = ctx.createGain();
  flt.type = 'lowpass'; flt.Q.value = 2;
  flt.frequency.setValueAtTime(300, t); flt.frequency.exponentialRampToValueAtTime(open, t + 0.08); flt.frequency.exponentialRampToValueAtTime(open * 0.35, t + d);
  env(g, t, 0.03, gain * vol(), d);
  for (const n of notes) for (const dt of [-9, 0, 8]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = dt;
    o.connect(flt); o.start(t); o.stop(t + d + 0.2);
  }
  send(flt.connect(g), rev);
}

/** Bell: inharmonic sine partials. */
function bell(n, t, { gain = 0.05, d = 1.2, rev = 0.6 } = {}) {
  for (const [r, gk, dk] of [[1, 1, 1], [2.76, 0.45, 0.6], [5.4, 0.25, 0.35], [8.9, 0.12, 0.2]]) tone(NOTE(n) * r, t, { a: 0.002, d: d * dk, gain: gain * gk, rev });
}

/** Choir 'aah': saws through two vocal formant bands, slow attack. */
function choir(notes, t, { d = 2.4, gain = 0.05, rev = 0.8 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain * vol(), t + 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  const sum = ctx.createGain();
  for (const [f, q] of [[730, 6], [1090, 7], [2440, 9]]) { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; sum.connect(b).connect(g); }
  for (const n of notes) for (const dt of [-12, -4, 5, 13]) {
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = dt;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 5 + Math.random(); lg.gain.value = 6; lfo.connect(lg).connect(o.detune);
    o.connect(sum); o.start(t); o.stop(t + d + 0.2); lfo.start(t); lfo.stop(t + d + 0.2);
  }
  send(g, rev);
}

function boom(t, { f = 70, d = 0.9, gain = 0.35 } = {}) {
  tone(f, t, { a: 0.004, d, gain, glide: 0.45 });
  hiss(t, { f: 180, q: 0.8, d: d * 0.5, gain: gain * 0.6, type: 'lowpass' });
}

export const crateSfx = {
  unlock() { ac(); },

  /** The crate lands on the snow plinth: a soft whump, a crunch and a hollow knock. */
  thud() {
    if (!ac()) return;
    const t = ctx.currentTime;
    tone(95, t, { a: 0.003, d: 0.28, gain: 0.45, glide: 0.5 });
    hiss(t, { f: 900, q: 0.7, d: 0.16, gain: 0.35, type: 'lowpass' });
    hiss(t + 0.01, { f: 2400, q: 1.5, d: 0.07, gain: 0.12 });
    tone(320, t, { type: 'triangle', a: 0.001, d: 0.09, gain: 0.12, glide: 0.8, rev: 0.2 });
  },

  /** A latch snapping open: a bright metal clack with a ring. i = 0 / 1 (second is a little higher). */
  latch(i = 0) {
    if (!ac()) return;
    const t = ctx.currentTime;
    hiss(t, { f: 5200 + i * 600, q: 3, d: 0.018, gain: 0.4, type: 'bandpass' });
    tone(2300 + i * 260, t, { type: 'triangle', a: 0.001, d: 0.12, gain: 0.07, rev: 0.25 });
    tone(3450 + i * 300, t, { a: 0.001, d: 0.08, gain: 0.04 });
    tone(140, t, { type: 'square', a: 0.002, d: 0.05, gain: 0.12, glide: 0.6, lp: 900 });
    hiss(t + 0.045, { f: 3800, q: 4, d: 0.012, gain: 0.18 });
  },

  /** The lid straining: pressure hiss and chatter rising for `dur` seconds. */
  tension(dur = 0.4) {
    if (!ac()) return;
    const t = ctx.currentTime;
    hiss(t, { f: 500, q: 2, a: dur * 0.9, d: 0.06, gain: 0.16, sweep: 6 });
    tone(NOTE(45), t, { a: dur * 0.9, d: 0.05, gain: 0.06, glide: 1.5, type: 'sawtooth', lp: 600 });
    for (let k = 0; k < 6; k++) hiss(t + (k / 6) * dur, { f: 1400 + k * 200, q: 5, d: 0.015, gain: 0.05 + k * 0.02 });
  },

  /** The lid bursts open: air whoosh, a low boom, a shimmer of light. */
  burst() {
    if (!ac()) return;
    const t = ctx.currentTime;
    hiss(t, { f: 280, q: 1.1, a: 0.02, d: 0.55, gain: 0.4, sweep: 18, rev: 0.3 });
    boom(t, { f: 62, d: 0.8, gain: 0.42 });
    tone(220, t, { type: 'triangle', a: 0.002, d: 0.12, gain: 0.15, glide: 0.7 });
    for (let k = 0; k < 9; k++) tone(NOTE(88 + ((k * 5) % 12)), t + 0.06 + k * 0.035, { a: 0.002, d: 0.3, gain: 0.03, rev: 0.6 });
    tone(NOTE(76), t + 0.05, { a: 0.05, d: 1.2, gain: 0.035, rev: 0.7 });
    tone(NOTE(83), t + 0.05, { a: 0.05, d: 1.2, gain: 0.03, rev: 0.7, detune: 6 });
  },

  /**
   * One reel tick (a card passing the marker): a crisp flap click. `speed` 0..1 brightens it while
   * fast; `k` 0..1 (reel progress) drops the pitch and adds body as the reel crawls to a stop.
   */
  tick(speed = 0.5, k = 0) {
    if (!ac()) return;
    const t = ctx.currentTime;
    const p = 1 - 0.28 * k * k;
    hiss(t, { f: (2600 + speed * 2600) * p, q: 7, d: 0.022, gain: 0.3 + 0.12 * k });
    tone((1500 + speed * 700) * p, t, { type: 'square', a: 0.001, d: 0.016, gain: 0.04 + 0.03 * k, lp: 5000 });
    if (k > 0.8) tone(220 * p, t, { a: 0.001, d: 0.05, gain: 0.08 * (k - 0.8) * 5, glide: 0.8 });
  },

  /** Reveal fanfare: grows with the grade (0 grey … 4 red); gold has its own. */
  reveal(id = 'common', rank = 0) {
    if (!ac()) return;
    const t = ctx.currentTime + 0.01;
    if (id === 'gold') return this.gold(t + 0.32);
    const root = [67, 67, 64, 62, 60][rank] ?? 67;
    const arp = [[0, 4], [0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 11, 14], [0, 7, 12, 16, 19, 24]][rank] ?? [0, 4];
    const step = 0.065 - rank * 0.004;
    arp.forEach((iv, i) => {
      const at = t + i * step;
      tone(NOTE(root + iv + 12), at, { type: 'triangle', a: 0.004, d: 0.25 + rank * 0.05, gain: 0.13, rev: 0.25 + rank * 0.08 });
      tone(NOTE(root + iv + 24), at, { a: 0.003, d: 0.18, gain: 0.04, rev: 0.4 });
    });
    const end = t + arp.length * step;
    if (rank === 0) hiss(t, { f: 2500, q: 1, d: 0.08, gain: 0.1 });
    if (rank >= 1) brass([root, root + 4, root + 7].map((n) => n + 12), end - 0.02, { d: 0.5 + rank * 0.3, gain: 0.022 + rank * 0.008, open: 1500 + rank * 600, rev: 0.4 });
    if (rank >= 2) for (let i = 0; i < 3 + rank * 2; i++) bell(root + 24 + [0, 4, 7, 12, 16, 19, 24, 28][i % 8], end + i * 0.07, { gain: 0.025, d: 0.9 });
    if (rank >= 3) {
      boom(t, { f: 55, d: 1.0, gain: 0.32 });
      hiss(end, { f: 7000, q: 0.6, a: 0.01, d: 1.0 + rank * 0.3, gain: 0.08, type: 'highpass', rev: 0.5 });
      brass([root - 12, root - 5, root, root + 4, root + 7], end + 0.05, { d: 1.2 + rank * 0.3, gain: 0.035, open: 2600, rev: 0.6 });
    }
    if (rank >= 4) {
      // Covert: timpani pickup, a second, higher brass swell.
      for (let i = 0; i < 4; i++) tone(NOTE(36 + (i % 2) * 7), t - 0.0 + i * 0.05, { a: 0.003, d: 0.25, gain: 0.12, glide: 0.85 });
      brass([root + 5, root + 9, root + 12, root + 17], end + 0.55, { d: 1.6, gain: 0.03, open: 3200, rev: 0.7 });
      brass([root + 7, root + 12, root + 16, root + 19], end + 0.95, { d: 2.0, gain: 0.035, open: 3600, rev: 0.8 });
    }
  },

  /** Gold: the blackout's reverse swell (played at the reveal start). */
  goldIntro() {
    if (!ac()) return;
    const t = ctx.currentTime;
    hiss(t, { f: 400, q: 1.2, a: 0.3, d: 0.03, gain: 0.3, sweep: 14 });
    tone(NOTE(31), t, { a: 0.3, d: 0.05, gain: 0.25, type: 'sawtooth', lp: 300, glide: 2 });
  },

  /** ★ Exceedingly rare: choir swell, golden bell run, brass sus4 → major, deep boom, glitter. */
  gold(t) {
    boom(t, { f: 48, d: 1.6, gain: 0.5 });
    hiss(t, { f: 6000, q: 0.5, a: 0.01, d: 2.6, gain: 0.12, type: 'highpass', rev: 0.8 });
    choir([60, 67, 72, 76], t, { d: 3.6, gain: 0.05 });
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => bell(n, t + 0.08 + i * 0.075, { gain: 0.05, d: 1.6 }));
    brass([48, 60, 65, 67, 72], t + 0.1, { d: 0.9, gain: 0.04, open: 2600, rev: 0.7 });          // sus4
    brass([48, 60, 64, 67, 72, 76], t + 0.95, { d: 2.6, gain: 0.05, open: 3800, rev: 0.9 });     // resolve
    for (let i = 0; i < 26; i++) tone(NOTE(96 + ((i * 7) % 14)), t + 0.5 + i * 0.09 + Math.random() * 0.03, { a: 0.002, d: 0.3, gain: 0.025, rev: 0.7 });
  },

  /** The hold before a Classified+ reveal: a rising swell and a heartbeat thump (dur seconds). */
  charge(rank = 3, dur = 0.6) {
    if (!ac()) return;
    const t = ctx.currentTime;
    hiss(t, { f: 300, q: 1.4, a: dur * 0.95, d: 0.04, gain: 0.12 + (rank - 3) * 0.05, sweep: 10, rev: 0.3 });
    tone(NOTE(43 + rank), t, { type: 'sawtooth', a: dur * 0.95, d: 0.05, gain: 0.05, glide: 2, lp: 900 });
    tone(55, t + 0.02, { a: 0.004, d: 0.22, gain: 0.25, glide: 0.6 });
    if (dur > 0.4) tone(55, t + dur * 0.55, { a: 0.004, d: 0.2, gain: 0.3, glide: 0.6 });
  },

  /** A rare card sliding past the marker in the crawl: a short shimmer. */
  tease(rank = 4) {
    if (!ac()) return;
    const t = ctx.currentTime;
    tone(NOTE(rank >= 5 ? 88 : 84), t, { a: 0.01, d: 0.35, gain: 0.04, glide: 0.94, rev: 0.6 });
    tone(NOTE(rank >= 5 ? 95 : 91), t + 0.04, { a: 0.01, d: 0.3, gain: 0.025, rev: 0.6 });
  },
};
