// Rail / box grinds: a continuous metal scrape (noise through the inharmonic modes of a steel tube plus a
// hiss of steel on edge / base, with stick-slip roughness) layered with the grind_loop sample, a modal
// clang on lock-on, ticks over kinks and a pop-off. Boxes (plastic / wood tops) sound duller and lower.

const MODES = { rail: [540, 1490, 2870, 4710], tube: [380, 1050, 2030, 3350], box: [210, 560, 1150, 2100] };

export class Grind {
  constructor(ctx, out, fx, T, sample) {
    this.ctx = ctx; this.fx = fx; this.T = T;
    const c = ctx;
    // the contact is under the rider: little above ~5 kHz reaches the ears (the reference falls 15 dB by 8 kHz)
    this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 4500; this.tone.Q.value = 0.6;
    this.tone.connect(out);
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(this.tone);
    this.src = c.createBufferSource(); this.src.buffer = fx.white; this.src.loop = true;
    // stick-slip roughness: the scrape level wobbles fast and irregularly
    this.rough = c.createGain(); this.rough.gain.value = 0.6;
    const lfoSrc = c.createBufferSource(); lfoSrc.buffer = fx.brown; lfoSrc.loop = true; lfoSrc.playbackRate.value = 0.5;
    const lfoF = c.createBiquadFilter(); lfoF.type = 'lowpass'; lfoF.frequency.value = 60;
    const lfoG = c.createGain(); lfoG.gain.value = 1.6;   // deep stick-slip
    lfoSrc.connect(lfoF); lfoF.connect(lfoG); lfoG.connect(this.rough.gain);
    this.src.connect(this.rough);
    this.bands = MODES.rail.map((f, i) => {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 22 + i * 6;   // the rail's modes, smeared by the moving contact (the skate-grind reference shows fuzzy ridges)
      const g = c.createGain(); g.gain.value = [1.0, 0.7, 0.45, 0.3][i] * 3;
      this.rough.connect(bp); bp.connect(g); g.connect(this.out);
      return bp;
    });
    // scrape body: broadband 150 Hz–3 kHz (where the reference grind carries its energy)
    this.body = c.createBiquadFilter(); this.body.type = 'bandpass'; this.body.frequency.value = 450; this.body.Q.value = 0.4;
    this.bodyG = c.createGain(); this.bodyG.gain.value = T.scrape * 1.4;
    this.rough.connect(this.body); this.body.connect(this.bodyG); this.bodyG.connect(this.out);
    this.hiss = c.createBiquadFilter(); this.hiss.type = 'bandpass'; this.hiss.frequency.value = 3200; this.hiss.Q.value = 0.7;
    this.hissG = c.createGain(); this.hissG.gain.value = T.scrape * 0.2;
    this.rough.connect(this.hiss); this.hiss.connect(this.hissG); this.hissG.connect(this.out);
    this.dull = c.createBiquadFilter(); this.dull.type = 'lowpass'; this.dull.frequency.value = 900;
    this.dullG = c.createGain(); this.dullG.gain.value = 0;
    this.rough.connect(this.dull); this.dull.connect(this.dullG); this.dullG.connect(this.out);
    this.sampleG = c.createGain(); this.sampleG.gain.value = 0; this.sampleG.connect(this.out);
    if (sample) { this.smp = c.createBufferSource(); this.smp.buffer = sample; this.smp.loop = true; this.smp.connect(this.sampleG); this.smp.start(0, Math.random() * sample.duration); }
    this.src.start(); lfoSrc.start();
    this.kind = 'rail'; this.on = false;
  }

  /** jitter: retune the modes ±3 % so every rail rings a little differently. */
  setKind(kind, when, jitter = false) {
    const k = MODES[kind] ? kind : 'rail';
    if (k === this.kind && !jitter) return;
    this.kind = k;
    this.tune = jitter ? 0.97 + Math.random() * 0.06 : this.tune || 1;
    MODES[k].forEach((f, i) => this.bands[i].frequency.setValueAtTime(f * this.tune, when));
    this.dullG.gain.setValueAtTime(k === 'box' ? this.T.scrape * 1.2 : 0, when);
    this.hissG.gain.setValueAtTime(this.T.scrape * (k === 'box' ? 0.08 : 0.2), when);
    this.bodyG.gain.setValueAtTime(this.T.scrape * (k === 'box' ? 0.6 : 1.4), when);
  }

  /** Per frame: v = grind speed m/s (0 = off), hop = popped up mid-rail. */
  update(when, v, kind, hop, board) {
    const on = v > 0.2 && !hop;
    if (!on && !this.on) return;
    if (kind) this.setKind(kind, when);
    const lvl = on ? this.T.gain * Math.min(1, 0.35 + v / 12) : 0;
    this.out.gain.setTargetAtTime(lvl, when, on ? 0.02 : 0.06);
    this.sampleG.gain.setTargetAtTime(on ? this.T.sample * (this.kind === 'box' ? 0.5 : 1) : 0, when, 0.03);
    // the modes glide with speed: faster contact excites them a little higher
    MODES[this.kind].forEach((f, i) => this.bands[i].frequency.setTargetAtTime(f * (this.tune || 1) * (0.88 + 0.016 * Math.min(v, 15)), when, 0.15));
    if (this.smp) this.smp.playbackRate.setTargetAtTime((this.kind === 'rail' ? 1 : 0.8) * (board ? 0.92 : 1.05) + v * 0.02, when, 0.1);
    this.on = on;
  }

  /** Lock-on: the gear lands on the metal. */
  clank(when, kind = 'rail', k = 1) {
    const T = this.T, m = MODES[MODES[kind] ? kind : 'rail'].map((f) => f * (this.tune || 1));
    if (kind === 'box') {
      this.fx.thump(when, { f: 150, f2: 70, gain: T.clank * 0.9 * k, decay: 0.12 });
      this.fx.noise(when, { f: 700, q: 1, gain: T.clank * 0.6 * k, decay: 0.08 });
      return;
    }
    this.fx.modal(when, [[m[0], 0.8, 0.5], [m[1], 0.6, 0.35], [m[2], 0.4, 0.22], [m[3], 0.25, 0.12]], T.clank * 0.35 * k);
    this.fx.noise(when, { f: 3000, q: 0.8, gain: T.clank * 0.5 * k, decay: 0.03 });
    this.fx.thump(when, { f: 120, f2: 60, gain: T.clank * 0.5 * k, decay: 0.08 });
  }

  tick(when, k = 0.5) { const m = MODES[this.kind]; this.fx.modal(when, [[m[1], 0.6, 0.15], [m[2], 0.4, 0.1]], this.T.clank * 0.25 * k); }

  popOff(when) { this.fx.noise(when, { f: 1800, q: 1.2, gain: this.T.clank * 0.3, decay: 0.05 }); }
}
