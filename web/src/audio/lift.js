// Riding the chairlift: the haul rope's low hum and hiss, the chair creaking as it sways, and the grip
// rattling over each tower's sheave train ("ka-thunk ka-thunk…"), plus the bull wheel at the stations.

const rnd = (a, b) => a + Math.random() * (b - a);

export class LiftVoice {
  constructor(ctx, out, fx, T) {
    this.ctx = ctx; this.fx = fx; this.T = T;
    const c = ctx;
    this.out = c.createGain(); this.out.gain.value = 0; this.out.connect(out);
    // rope hum: brown rumble + a faint tonal 'sing' of the cable
    const b = c.createBufferSource(); b.buffer = fx.brown; b.loop = true;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const bg = c.createGain(); bg.gain.value = 0.9;
    b.connect(lp); lp.connect(bg); bg.connect(this.out);
    const w = c.createBufferSource(); w.buffer = fx.white; w.loop = true;
    const sing = c.createBiquadFilter(); sing.type = 'bandpass'; sing.frequency.value = 640; sing.Q.value = 22;
    const sg = c.createGain(); sg.gain.value = 0.35;
    w.connect(sing); sing.connect(sg); sg.connect(this.out);
    b.start(0, Math.random()); w.start(0, Math.random());
    this.on = false; this.creakT = rnd(2, 5);
  }

  /** Per frame: on = riding the lift. */
  update(when, dt, on) {
    if (on !== this.on) { this.out.gain.setTargetAtTime(on ? this.T.gain : 0, when, on ? 0.6 : 0.3); this.on = on; }
    if (!on) return;
    if ((this.creakT -= dt) <= 0) {   // the chair swaying on its hanger
      this.creakT = rnd(3, 8);
      this.fx.creak(when, this.T.creak * rnd(0.5, 1), rnd(-0.3, 0.3));
    }
  }

  /** The grip running over a tower's sheave train: a quick run of roller thunks. */
  tower(when, k = 1) {
    const n = 6 + Math.floor(Math.random() * 4), G = this.T.tower * k;
    let t = when;
    for (let i = 0; i < n; i++) {
      const a = G * (0.6 + 0.4 * Math.sin((i / (n - 1)) * Math.PI));   // louder in the middle of the train
      this.fx.thump(t, { f: rnd(95, 125), f2: 60, gain: a * 0.8, decay: 0.06 });
      this.fx.noise(t, { f: rnd(1300, 1900), q: 1.5, gain: a * 0.35, decay: 0.025 });
      t += rnd(0.07, 0.1);
    }
    this.fx.modal(when + 0.05, [[180, 0.5, 0.5], [455, 0.35, 0.35], [910, 0.2, 0.2]], G * 0.15);
  }
}
