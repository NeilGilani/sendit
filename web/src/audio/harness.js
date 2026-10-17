// Offline render harness: builds the real AudioEngine on an OfflineAudioContext, schedules a scripted ride
// (rider frames + bus events) and returns level statistics and, optionally, a 16-bit WAV (base64).
// Loaded by harness.html; driven headlessly by scripts/audio-test.mjs.
import { AudioEngine } from './engine.js';
import { AUDIO } from './tuning.js';

async function loadBuffer(ctx, name) {
  for (const ext of ['ogg', 'mp3']) {
    try { const r = await fetch(`/audio/${name}.${ext}`); if (r.ok) return await ctx.decodeAudioData(await r.arrayBuffer()); } catch { /* next */ }
  }
  return null;
}

/**
 * spec: { seconds, sr, dt, frames: [rider frame], events: [{ t, name, d }], map, view, solo: bus name | null,
 *         volumes: { master, sfx, music }, wav: bool, window: s (stats window), tweak: (AUDIO) => void as string }
 */
window.renderScenario = async function renderScenario(spec) {
  const sr = spec.sr || 48000, secs = spec.seconds;
  const ctx = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
  const buffers = { grind_loop: await loadBuffer(ctx, 'grind_loop') };
  const eng = await new AudioEngine(ctx, { buffers }).init();
  eng.setMap(spec.map || 'default');
  eng.setView(spec.view || 'chase');
  eng.setVolumes(spec.volumes || { master: 0.8, sfx: 0.8, music: 0.6 }, 0);
  if (spec.solo) for (const b of ['snowBus', 'windBus', 'ambBus', 'fxBus', 'uiBus']) if (b !== spec.solo) eng[b].gain.value = 0;
  // a steady 'music' tone so ducking shows up in the stats
  if (spec.musicTone) {
    const o = ctx.createOscillator(); o.frequency.value = 220; const g = ctx.createGain(); g.gain.value = 0.2; o.connect(g); g.connect(eng.duck); o.start();
  }
  const dt = spec.dt || 1 / 60, frames = spec.frames || [];
  const evs = [...(spec.events || [])].sort((a, b) => a.t - b.t);
  let ei = 0;
  for (let i = 0; i < frames.length; i++) {
    const t = i * dt;
    if (t >= secs) break;
    while (ei < evs.length && evs[ei].t <= t) { eng.event(evs[ei].name, evs[ei].d || {}, Math.max(t, evs[ei].t)); ei++; }
    eng.frame(frames[i], t, dt, spec.opts || {});
  }
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const win = Math.floor(sr * (spec.window || 0.1));
  let peak = 0, nan = 0, sum = 0;
  const rms = [], pk = [];
  for (let w = 0; w < L.length; w += win) {
    let s = 0, p = 0;
    const end = Math.min(L.length, w + win);
    for (let i = w; i < end; i++) {
      const a = L[i], b = R[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) { nan++; continue; }
      s += a * a + b * b; p = Math.max(p, Math.abs(a), Math.abs(b));
    }
    sum += s; peak = Math.max(peak, p);
    rms.push(Math.sqrt(s / (2 * (end - w))));
    pk.push(p);
  }
  const sp = spectrum(L, R, sr, Math.floor((spec.specFrom || 0) * sr), spec.specTo ? Math.floor(spec.specTo * sr) : L.length);
  const out = { peak, nan, rms, pk, rmsAll: Math.sqrt(sum / (2 * L.length)), centroid: sp.centroid, bands: sp.bands, events: eng.stats.events, paramNaN: eng.stats.nan || 0, worklet: eng.worklet };
  if (spec.wav) out.wav = toWavBase64(L, R, sr);
  return out;
};

/** Averaged power spectrum (Hann, 4096-point radix-2 FFT): centroid and octave-band levels (dB). */
function spectrum(L, R, sr, from = 0, to = L.length) {
  const N = 4096, re = new Float64Array(N), im = new Float64Array(N), pow = new Float64Array(N / 2);
  let frames = 0;
  for (let s = from; s + N <= to; s += N) {
    for (let i = 0; i < N; i++) { const h = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N); re[i] = (L[s + i] + R[s + i]) * 0.5 * h; im[i] = 0; }
    fft(re, im);
    for (let k = 0; k < N / 2; k++) pow[k] += re[k] * re[k] + im[k] * im[k];
    frames++;
  }
  let num = 0, den = 0;
  for (let k = 1; k < N / 2; k++) { num += pow[k] * k; den += pow[k]; }
  const bands = {};
  for (const fc of [63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]) {
    const k0 = Math.max(1, Math.floor((fc / Math.SQRT2) * N / sr)), k1 = Math.min(N / 2 - 1, Math.floor(fc * Math.SQRT2 * N / sr));
    let e = 0;
    for (let k = k0; k <= k1; k++) e += pow[k];
    bands[fc] = e > 0 && frames ? +(10 * Math.log10(e / frames / (N * N / 8))).toFixed(1) : -120;
  }
  return { centroid: den ? (num / den) * sr / N : 0, bands };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const a = i + j, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

function toWavBase64(L, R, sr) {
  const n = L.length, b = new ArrayBuffer(44 + n * 4), v = new DataView(b);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 2, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * 4, true); v.setUint16(32, 4, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 4, true);
  for (let i = 0; i < n; i++) {
    v.setInt16(44 + i * 4, Math.max(-1, Math.min(1, L[i])) * 32767, true);
    v.setInt16(46 + i * 4, Math.max(-1, Math.min(1, R[i])) * 32767, true);
  }
  const u8 = new Uint8Array(b);
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}

window.AUDIO = AUDIO;
window.harnessReady = true;
