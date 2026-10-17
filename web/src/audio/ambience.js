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
    // the sea (a fjord map): waves rolling in and washing out, far below
    this.sea = ctx.createGain(); this.sea.gain.value = 0; this.sea.connect(this.bed);
    const sw = ctx.createBufferSource(); sw.buffer = fx.pink; sw.loop = true; sw.playbackRate.value = 0.8;
    this.seaLp = ctx.createBiquadFilter(); this.seaLp.type = 'lowpass'; this.seaLp.frequency.value = 700; this.seaLp.Q.value = 0.5;
    sw.connect(this.seaLp); this.seaLp.connect(this.sea); sw.start(0, Math.random());
    this.waveT = 1; this.bellT = rnd(8, 20); this.gullT = rnd(5, 15);
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
    const b = this.babble(24);
    this.crowd = this.ctx.createGain(); this.crowd.gain.value = 0; this.crowd.connect(this.bed);
    for (const [rate, off] of [[1, 0], [0.955, 1.7]]) {
      const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true; src.loopEnd = 4 - 0.25; src.playbackRate.value = rate;
      const g = this.ctx.createGain(); g.gain.value = 0.55; src.connect(g); g.connect(this.crowd); src.start(0, off);
    }
  }

  /** Voiced babble buffer (4 s, stereo, seamless): `voices` jittered glottal pulse trains through moving vowels. */
  babble(voices) {
    const c = this.ctx, sr = c.sampleRate, n = sr * 4, b = c.createBuffer(2, n, sr);
    const L = b.getChannelData(0), R = b.getChannelData(1);
    const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [300, 870], [660, 1720], [490, 1350]];
    const res = (f, bw) => { const r = Math.exp(-Math.PI * bw / sr), th = 2 * Math.PI * f / sr; return [2 * r * Math.cos(th), -r * r, 1 - r]; };
    for (let v = 0; v < voices; v++) {
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
    return b;
  }

  /**
   * The lodge at the bottom of the run (life.js): après-ski chatter heard through the walls (babble low-passed
   * at ~700 Hz) and the odd clink of glasses, placed in 3D at the lodge, fading with distance.
   */
  setLodge(pos) {
    if (!pos || this.lodge || !this.T.lodge.gain) return;
    const c = this.ctx, b = this.babble(10);
    const pan = c.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 10; pan.maxDistance = 200; pan.rolloffFactor = 1.4;
    if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y + 2; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y + 2, pos.z);
    const g = c.createGain(); g.gain.value = this.T.lodge.gain;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.6;
    const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.loopEnd = 3.75;
    src.connect(lp); lp.connect(g); g.connect(pan); pan.connect(this.bed); src.start(0, Math.random() * 3);
    this.lodge = { pan, clinkT: rnd(2, 6) };
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

  /** A large bronze bell far off: the hum, the strike and inharmonic partials with long decays. */
  bell(when, gain) {
    const f0 = rnd(105, 125), pan = rnd(-0.5, 0.5);
    this.fx.modal(when, [[f0 * 0.5, 0.6, 9], [f0, 1, 7], [f0 * 1.19, 0.5, 5], [f0 * 1.56, 0.45, 4], [f0 * 2.0, 0.35, 3.5], [f0 * 2.66, 0.25, 2.5], [f0 * 3.33, 0.15, 1.8]], gain, pan, this.bed);
    this.fx.noise(when, { buf: 'brown', type: 'lowpass', f: 300, q: 0.7, gain: gain * 0.4, decay: 0.15, pan, out: this.bed });
  }

  /** A gull's cry over the water: two or three falling 'kee-ow's (a sine glide with a nasal band). */
  gull(when, gain) {
    const c = this.ctx, n = 2 + Math.floor(Math.random() * 2), pan = c.createStereoPanner ? c.createStereoPanner() : null;
    if (pan) { pan.pan.value = rnd(-0.8, 0.8); pan.connect(this.bed); }
    for (let i = 0; i < n; i++) {
      const t = when + i * rnd(0.32, 0.45), d = rnd(0.22, 0.32), f = rnd(1900, 2400);
      const o = c.createOscillator(), g = c.createGain(), bp = c.createBiquadFilter();
      o.type = 'triangle'; o.frequency.setValueAtTime(f * 0.85, t); o.frequency.linearRampToValueAtTime(f, t + 0.04); o.frequency.exponentialRampToValueAtTime(f * 0.62, t + d);
      bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.03); g.gain.setTargetAtTime(0, t + d * 0.6, d * 0.2);
      o.connect(bp); bp.connect(g); g.connect(pan || this.bed); o.start(t); o.stop(t + d + 0.2);
    }
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
    // distant temple bell (a dusk powder volcano): one slow strike now and then
    if (P.bell > 0 && o.riding !== false && (this.bellT -= dt) <= 0) {
      this.bellT = rnd(this.T.bell.every[0], this.T.bell.every[1]);
      this.bell(when, this.T.bell.gain * P.bell);
    }
    // the sea: each wave swells for ~2.5 s, breaks, and washes out over ~4 s (the next one 7–11 s later)
    if (P.sea > 0 && (this.waveT -= dt) <= 0) {
      this.waveT = rnd(7, 11);
      const g = this.sea.gain, G = this.T.sea.gain * P.sea * rnd(0.6, 1);
      g.cancelScheduledValues(when); g.setValueAtTime(g.value, when);
      g.linearRampToValueAtTime(G * 0.5, when + 2.2); g.linearRampToValueAtTime(G, when + 2.6); g.setTargetAtTime(G * 0.15, when + 2.7, 1.6);
      this.seaLp.frequency.cancelScheduledValues(when); this.seaLp.frequency.setValueAtTime(500, when);
      this.seaLp.frequency.linearRampToValueAtTime(1600, when + 2.6); this.seaLp.frequency.setTargetAtTime(450, when + 2.7, 1.8);
    }
    if (P.gulls > 0 && o.riding !== false && (this.gullT -= dt) <= 0) {
      this.gullT = rnd(this.T.gulls.every[0], this.T.gulls.every[1]) / P.gulls;
      this.gull(when, this.T.gulls.gain * P.gulls);
    }
    if (this.lodge && (this.lodge.clinkT -= dt) <= 0) {   // glasses and cutlery inside
      this.lodge.clinkT = rnd(2, 7);
      const n = 1 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.fx.modal(when + i * rnd(0.08, 0.2), [[rnd(2400, 3400), 1, 0.25], [rnd(5200, 6400), 0.5, 0.15]], this.T.lodge.clink, 0, this.lodge.pan);
    }
    if (P.trees > 0 && (this.creakT -= dt) <= 0) {
      const [a, b] = this.T.creak.every;
      this.creakT = rnd(a, b) / P.trees;
      this.fx.creak(when, this.T.creak.gain * P.trees * rnd(0.5, 1), rnd(-0.8, 0.8), this.bed);
    }
  }
}

function gauss() { const u = Math.max(1e-9, Math.random()), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
