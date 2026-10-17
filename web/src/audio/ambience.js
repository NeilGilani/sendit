// Per-map ambience: forest soughing (wind in the conifers) with creaking trunks, a park crowd (procedural
// voiced babble + cheers on big landings) and distant birds. The distant wind over the ridges lives in the
// wind worklet ('ambient' parameter); this file adds what sits around it. Map profiles: AUDIO.maps.

const rnd = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(ctx, out, fx, T, maps) {
    this.ctx = ctx; this.out = out; this.fx = fx; this.T = T; this.maps = maps;
    this.profile = maps.default;
    this.bed = ctx.createGain(); this.bed.gain.value = 1; this.bed.connect(out);
    // forest sough: pink noise through a broad mid band, swelling with the gusts
    this.sough = ctx.createGain(); this.sough.gain.value = 0; this.sough.connect(this.bed);
    const s = ctx.createBufferSource(); s.buffer = fx.pink; s.loop = true; s.playbackRate.value = 0.93;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 850; bp.Q.value = 0.45;
    const hs = ctx.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = 3500; hs.gain.value = -6;
    s.connect(bp); bp.connect(hs); hs.connect(this.sough); s.start(0, Math.random());
    this.soughBp = bp;
    this.crowd = null;
    this.creakT = rnd(3, 8);
    this.gust = 0;
    this.cheerCool = 0;
  }

  setMap(id) {
    this.profile = { ...this.maps.default, ...(this.maps[id] || {}) };
    if (this.profile.crowd && !this.crowd) this.buildCrowd();
    if (this.profile.pa && !this.paBufs) this.buildPA();
    this.paT = rnd(this.T.pa.every[0], this.T.pa.every[1]) * 0.5;
    if (this.crowd) this.crowd.gain.setTargetAtTime(this.profile.crowd ? this.T.crowd.gain * this.profile.crowd : 0, this.ctx.currentTime, 1);
  }

  /** Voiced babble: two dozen 'voices' (jittered glottal pulses through moving vowel formants), 4 s, stereo. */
  buildCrowd() {
    const c = this.ctx, sr = c.sampleRate, n = sr * 4, b = c.createBuffer(2, n, sr);
    const L = b.getChannelData(0), R = b.getChannelData(1);
    const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [300, 870], [660, 1720], [490, 1350]];
    const res = (f, bw) => { const r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * f / sr; return [2 * r * Math.cos(th), -r * r, 1 - r]; };
    for (let v = 0; v < 24; v++) {
      const f0 = rnd(95, 240), pan = rnd(0.1, 0.9), amp = rnd(0.4, 1);
      let ph = 0, env = 0, on = Math.random() < 0.5, nextSyl = 0, c1 = res(500, 90), c2 = res(1500, 120);
      let y1 = 0, y2 = 0, z1 = 0, z2 = 0, vib = Math.random() * 6;
      for (let i = 0; i < n; i++) {
        if (i >= nextSyl) {   // a new syllable: vowel, length, talking or pausing
          nextSyl = i + Math.floor(sr * rnd(0.12, 0.3));
          on = Math.random() < 0.62;
          const vw = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          c1 = res(vw[0] * rnd(0.9, 1.1), 90); c2 = res(vw[1] * rnd(0.9, 1.1), 130);
        }
        env += ((on ? 1 : 0) - env) * 0.0016;
        ph += (f0 * (1 + 0.03 * Math.sin(vib + i / sr * 5.5)) + (Math.random() - 0.5) * 8) / sr;
        let x = 0;
        if (ph >= 1) { ph -= 1; x = 1; }
        x = x * env + (Math.random() - 0.5) * 0.04 * env;   // a little breath
        const a = c1[2] * x + c1[0] * y1 + c1[1] * y2; y2 = y1; y1 = a;
        const bq = c2[2] * x + c2[0] * z1 + c2[1] * z2; z2 = z1; z1 = bq;
        const o = (a + bq * 0.7) * amp;
        L[i] += o * (1 - pan); R[i] += o * pan;
      }
    }
    // distance: smear and dull it (a few early reflections + a gentle low-pass)
    for (const d of [L, R]) {
      let lp = 0, peak = 0;
      const tmp = Float32Array.from(d);
      for (const [dl, g] of [[0.031, 0.5], [0.057, 0.35], [0.089, 0.25]]) { const k = Math.floor(dl * sr); for (let i = k; i < n; i++) d[i] += tmp[i - k] * g; }
      for (let i = 0; i < n; i++) { lp += (d[i] - lp) * 0.3; d[i] = lp; peak = Math.max(peak, Math.abs(lp)); }
      for (let i = 0; i < n; i++) d[i] /= peak || 1;
      // crossfade the loop seam
      const fade = Math.floor(sr * 0.25);
      for (let i = 0; i < fade; i++) { const t = i / fade; d[i] = d[i] * t + d[n - fade + i] * (1 - t); }
    }
    this.crowd = c.createGain(); this.crowd.gain.value = 0; this.crowd.connect(this.bed);
    for (const [rate, off] of [[1, 0], [0.955, 1.7]]) {
      const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopEnd = 4 - 0.25; src.playbackRate.value = rate;
      const g = c.createGain(); g.gain.value = 0.55; src.connect(g); g.connect(this.crowd); src.start(0, off);
    }
  }

  /**
   * The park's PA announcer, far off: one voiced 'speaker' (glottal pulses through moving vowel formants,
   * syllables at ~4.5 Hz) squeezed through a horn band (400 Hz–3 kHz) with stadium slap echoes. Unintelligible
   * on purpose — it is the sound of an event happening somewhere down the hill. Three phrases, 2–4 s each.
   */
  buildPA() {
    const c = this.ctx, sr = c.sampleRate;
    const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [300, 870], [660, 1720], [490, 1350], [400, 2000]];
    const res = (f, bw) => { const r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * f / sr; return [2 * r * Math.cos(th), -r * r, 1 - r]; };
    this.paBufs = [0, 1, 2].map(() => {
      const dur = rnd(2, 4), n = Math.floor(sr * dur), b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
      const f0 = rnd(100, 135);
      let ph = 0, env = 0, on = true, next = 0, c1 = res(500, 80), c2 = res(1500, 110), y1 = 0, y2 = 0, z1 = 0, z2 = 0, pitch = f0;
      for (let i = 0; i < n; i++) {
        if (i >= next) {
          next = i + Math.floor(sr * rnd(0.14, 0.26));
          on = Math.random() < 0.85 && i < n - sr * 0.3;
          const v = VOWELS[Math.floor(Math.random() * VOWELS.length)];
          c1 = res(v[0], 80); c2 = res(v[1], 110);
          pitch = f0 * (1 + 0.25 * Math.sin(i / n * Math.PI) + rnd(-0.06, 0.1));   // phrase intonation
        }
        env += ((on ? 1 : 0) - env) * 0.004;
        ph += pitch / sr;
        let x = 0;
        if (ph >= 1) { ph -= 1; x = 1; }
        x = x * env + (Math.random() - 0.5) * 0.03 * env;
        const a = c1[2] * x + c1[0] * y1 + c1[1] * y2; y2 = y1; y1 = a;
        const q = c2[2] * x + c2[0] * z1 + c2[1] * z2; z2 = z1; z1 = q;
        d[i] = a + q * 0.8;
      }
      let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
      for (let i = 0; i < n; i++) d[i] /= peak || 1;
      return b;
    });
    // the PA chain: horn band → slap echoes (90 / 190 / 310 ms) → distance low-pass
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 400; hp.Q.value = 0.9;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000; lp.Q.value = 0.9;
    const dist = c.createBiquadFilter(); dist.type = 'lowpass'; dist.frequency.value = 2200;
    this.paIn = c.createGain(); this.paIn.gain.value = 1;
    this.paOut = c.createGain(); this.paOut.gain.value = this.T.pa.gain;
    this.paIn.connect(hp); hp.connect(lp); lp.connect(dist); dist.connect(this.paOut);
    for (const [t, g] of [[0.09, 0.45], [0.19, 0.3], [0.31, 0.18]]) {
      const dl = c.createDelay(0.5); dl.delayTime.value = t; const dg = c.createGain(); dg.gain.value = g;
      dist.connect(dl); dl.connect(dg); dg.connect(this.paOut);
    }
    const pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { pan.pan.value = 0.35; this.paOut.connect(pan); pan.connect(this.bed); } else this.paOut.connect(this.bed);
  }

  /** One PA phrase now (k: excitement → a bit louder / higher). */
  announce(when, k = 1) {
    if (!this.paBufs) return;
    this.paN = (this.paN || 0) + 1;
    const src = this.ctx.createBufferSource();
    src.buffer = this.paBufs[Math.floor(Math.random() * this.paBufs.length)];
    src.playbackRate.value = rnd(0.95, 1.05) * (1 + 0.06 * (k - 1));
    const g = this.ctx.createGain(); g.gain.value = Math.min(1.5, k);
    src.connect(g); g.connect(this.paIn); src.start(when);
  }

  cheer(when, k = 1) {
    if (!this.profile.crowd || this.cheerCool > 0) return;
    this.cheerCool = 2.5;
    this.fx.cheer(when, this.T.crowd.cheer * k * this.profile.crowd, this.bed);
    if (this.profile.pa && k >= 0.8) { this.announce(when + 1.4, 1.3); this.paT = Math.max(this.paT, 15); }
  }

  /** Per frame. o: { riding, speed } */
  update(when, dt, o = {}) {
    const P = this.profile;
    this.cheerCool -= dt;
    // gust follower for the forest (independent of the wind worklet's; same time scale)
    this.gust += (-this.gust / 5) * dt + Math.sqrt(2 * dt / 5) * gauss();
    this.gust = Math.max(-2.5, Math.min(2.5, this.gust));
    const sough = (P.sough ?? 0) * this.T.sough.gain * Math.max(0.05, 0.55 + 0.45 * this.gust);
    this.sough.gain.setTargetAtTime(o.riding === false ? sough * 0.6 : sough, when, 0.4);
    this.soughBp.frequency.setTargetAtTime(700 + 250 * Math.max(0, this.gust), when, 0.5);
    if (P.pa && this.paBufs && o.riding !== false && (this.paT -= dt) <= 0) {   // the announcer, now and then
      this.paT = rnd(this.T.pa.every[0], this.T.pa.every[1]);
      this.announce(when, 1);
      if (Math.random() < 0.4) this.announce(when + rnd(2.5, 4.5), 1);
    }
    if (P.trees > 0 && (this.creakT -= dt) <= 0) {
      const [a, b] = this.T.creak.every;
      this.creakT = rnd(a, b) / P.trees;
      this.fx.creak(when, this.T.creak.gain * P.trees * rnd(0.5, 1), rnd(-0.8, 0.8), this.bed);
    }
  }
}

function gauss() { const u = Math.max(1e-9, Math.random()), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
