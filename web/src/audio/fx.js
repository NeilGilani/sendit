// One-shot synthesis (main thread, WebAudio node graphs): pole plants, edge changes, take-offs, landings,
// grab rustle, crash tumbles, near-miss pass-bys, hard-brake spray, tree creaks, crowd cheers. Every
// function takes an explicit start time `when` so the offline test can schedule a whole ride up front.
// Each sound is a few noise / sine sources through filters with envelopes; randomised per call so no two
// sound the same.

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  /** @param {BaseAudioContext} ctx  @param {AudioNode} out  @param {object} T  AUDIO.fx */
  constructor(ctx, out, T) {
    this.ctx = ctx; this.out = out; this.T = T;
    const sr = ctx.sampleRate, n = sr * 2;
    this.white = ctx.createBuffer(1, n, sr);
    this.pink = ctx.createBuffer(1, n, sr);
    this.brown = ctx.createBuffer(1, n, sr);
    const w = this.white.getChannelData(0), p = this.pink.getChannelData(0), b = this.brown.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11; b6 = x * 0.115926;
      br = (br + 0.02 * x) / 1.02; b[i] = br * 3.5;
    }
  }

  // ---------------------------------------------------------------- building blocks
  /** Panned output for one sound (−1 left … 1 right). */
  dest(pan = 0, out = this.out) {
    if (!pan || !this.ctx.createStereoPanner) return out;
    const p = this.ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(out);
    return p;
  }

  /**
   * Filtered noise burst. o: { buf: 'white'|'pink'|'brown', type, f, f2 (sweep target), q, gain, attack, hold,
   * decay, pan, out }
   */
  noise(when, o) {
    const c = this.ctx, src = c.createBufferSource();
    src.buffer = this[o.buf || 'white'];
    const dur = (o.attack ?? 0.002) + (o.hold ?? 0) + (o.decay ?? 0.1);
    const f = c.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f ?? 1000, when);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), when + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(o.gain, when + (o.attack ?? 0.002));
    if (o.hold) g.gain.setValueAtTime(o.gain, when + (o.attack ?? 0.002) + o.hold);
    g.gain.setTargetAtTime(0, when + (o.attack ?? 0.002) + (o.hold ?? 0), (o.decay ?? 0.1) / 4);
    let node = f;
    if (o.type2) { const f2 = c.createBiquadFilter(); f2.type = o.type2; f2.frequency.value = o.ff2 ?? 4000; f2.Q.value = o.q2 ?? 0.7; f.connect(f2); node = f2; }
    src.connect(f); node.connect(g); g.connect(this.dest(o.pan, o.out));
    src.start(when, Math.random() * 1.5);
    src.stop(when + dur + 0.05);
    return g;
  }

  /** Pitched thump (sine with a pitch drop). */
  thump(when, o) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.f, when);
    osc.frequency.exponentialRampToValueAtTime(o.f2 ?? o.f * 0.5, when + (o.decay ?? 0.15));
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(o.gain, when + (o.attack ?? 0.003));
    g.gain.setTargetAtTime(0, when + (o.attack ?? 0.003), (o.decay ?? 0.15) / 3.5);
    osc.connect(g); g.connect(this.dest(o.pan, o.out));
    osc.start(when); osc.stop(when + (o.decay ?? 0.15) * 2 + 0.05);
  }

  /** Damped modal ring (metal): partials [f, gain, decay]. */
  modal(when, partials, gain, pan, out) {
    const c = this.ctx, d = this.dest(pan, out);
    for (const [f, a, dec] of partials) {
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = f * rnd(0.985, 1.015);
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain * a, when + 0.002);
      g.gain.setTargetAtTime(0, when + 0.002, dec / 4);
      o.connect(g); g.connect(d); o.start(when); o.stop(when + dec + 0.05);
    }
  }

  // ---------------------------------------------------------------- the sounds
  /** Ski pole tip punching the snow at turn initiation: a crisp tick, a crunch and a soft basket thud. */
  poleplant(when, k = 1, pan = 0) {
    const G = this.T.poleplant.gain * k;
    this.noise(when, { f: rnd(3200, 4200), q: 2.2, gain: G * 0.55, decay: 0.018, pan });
    this.noise(when + 0.004, { f: rnd(1500, 2100), q: 1.1, gain: G * 0.5, decay: 0.07, pan });
    this.thump(when, { f: rnd(150, 180), f2: 90, gain: G * 0.35, decay: 0.05, pan });
  }

  /** Edge-to-edge transition: a short "shff" as the base crosses flat. */
  edgeChange(when, k = 1, board = 0, powder = 0) {
    const G = this.T.edgeChange.gain * k;
    const f = (board ? 900 : 1500) * (1 - 0.5 * powder);
    this.noise(when, { buf: 'pink', f, f2: f * 1.7, q: 0.9, gain: G, attack: 0.03, decay: 0.12 });
  }

  /** Slash: the edge bites in hard while the tail slides — a fan of snow thrown out of the turn. */
  slash(when, k = 1, board = 0, powder = 0, side = 1) {
    const G = this.T.slash.gain * clamp(k, 0.3, 1.5), f = (board ? 1700 : 2400) * (1 - 0.45 * powder);
    this.noise(when, { buf: 'pink', f: f * 1.3, f2: f * 0.45, q: 0.7, gain: G, attack: 0.04, hold: 0.06, decay: 0.35 + 0.25 * powder, pan: -0.25 * side });
    for (let i = 0; i < 5; i++) this.noise(when + 0.03 + i * rnd(0.03, 0.07), { f: rnd(2500, 5000) * (1 - 0.4 * powder), q: 1.2, gain: G * 0.25, decay: 0.04, pan: -0.3 * side });
    this.patter(when, k * 0.8, powder, -0.4 * side);
  }

  /** The thrown snow pattering back down: a soft fizz of tiny landings, starting a beat after the spray. */
  patter(when, k = 1, powder = 0, pan = 0) {
    const G = this.T.patter.gain * clamp(k, 0.3, 1.5), n = Math.round(14 + 20 * k);
    this.noise(when + 0.2, { buf: 'pink', f: 3800 * (1 - 0.4 * powder), q: 0.6, gain: G * 0.5, attack: 0.15, decay: 0.5, pan });
    for (let i = 0; i < n; i++) {
      const t = when + 0.18 + Math.pow(Math.random(), 0.8) * 0.7;
      this.noise(t, { f: rnd(2500, 7000) * (1 - 0.4 * powder), q: 1.5, gain: G * rnd(0.15, 0.5), decay: rnd(0.004, 0.012), pan: pan + rnd(-0.3, 0.3) });
    }
  }

  /** One push stroke on the flat: skis double-pole (both tips, a crunchy shove); a board kicks with the back foot. */
  push(when, board = 0) {
    const G = this.T.push.gain;
    if (board) {
      this.noise(when, { buf: 'pink', f: rnd(1000, 1400), f2: 700, q: 0.8, gain: G, attack: 0.02, decay: 0.12 });
      this.noise(when + 0.01, { f: rnd(2500, 3500), q: 1.2, gain: G * 0.4, decay: 0.03 });
      return;
    }
    this.poleplant(when, 0.8, -0.3); this.poleplant(when + rnd(0.008, 0.025), 0.8, 0.3);
    this.noise(when + 0.06, { buf: 'pink', f: rnd(1300, 1800), q: 0.9, gain: G * 0.7, attack: 0.03, decay: 0.15 });
  }

  /** Absorbing a bump or a roller: a padded whump through the legs and a crunch of compacting snow. */
  bump(when, k = 1, board = 0, powder = 0) {
    const G = this.T.bump.gain * clamp(k, 0.3, 1.4);
    this.thump(when, { f: rnd(95, 125) * (board ? 0.85 : 1), f2: 60, gain: G * 0.7, decay: 0.09 });
    this.noise(when, { buf: 'pink', type: 'lowpass', f: 700 * (1 - 0.4 * powder), q: 0.6, gain: G * 0.6, attack: 0.008, decay: 0.12 });
    for (let i = 0; i < 6; i++) this.noise(when + Math.random() * 0.1, { f: rnd(900, 3000) * (1 - 0.5 * powder), q: 1.3, gain: G * rnd(0.15, 0.35), decay: rnd(0.006, 0.015) });
  }

  /** Landing on a roof: the hollow wooden structure booms under the snow, the timbers creak, snow slides off. */
  roof(when, impact = 6) {
    const G = this.T.roof.gain * clamp(impact / 8, 0.4, 1.3);
    this.modal(when, [[rnd(78, 92), 1, 0.55], [rnd(130, 150), 0.7, 0.4], [rnd(215, 245), 0.45, 0.3], [rnd(350, 390), 0.25, 0.2]], G * 0.6);
    this.noise(when, { buf: 'brown', type: 'lowpass', f: 300, q: 0.8, gain: G * 0.7, attack: 0.004, decay: 0.25 });
    this.creak(when + rnd(0.15, 0.3), G * 0.2, rnd(-0.3, 0.3));
    this.noise(when + 0.3, { buf: 'pink', f: 1600, f2: 900, q: 0.5, gain: G * 0.25, attack: 0.2, hold: 0.3, decay: 0.8 });   // snow sliding off the eaves
  }

  /** A stumble: an edge catches — skis clatter (or the board slaps), a quick scrape and a short spray. */
  stumble(when, board = 0, powder = 0) {
    const G = this.T.stumble.gain;
    if (board) this.noise(when, { f: rnd(800, 1100), q: 0.9, gain: G * 0.6 * (1 - 0.6 * powder), decay: 0.04 });
    else { this.modal(when, [[rnd(1000, 1300), 1, 0.05], [rnd(2600, 3200), 0.5, 0.03]], G * 0.3 * (1 - 0.7 * powder)); this.modal(when + rnd(0.04, 0.09), [[rnd(950, 1250), 1, 0.05]], G * 0.2 * (1 - 0.7 * powder)); }
    this.noise(when + 0.01, { buf: 'pink', f: rnd(1800, 2600) * (1 - 0.4 * powder), f2: 1100, q: 0.7, gain: G * 0.6, attack: 0.02, decay: 0.25 });
    this.noise(when + 0.03, { f: 2000, q: 0.9, gain: G * 0.25, attack: 0.02, decay: 0.08 });   // cloth
  }

  /** Face shot: deep powder flying up over the goggles and jacket — a soft whump and a fizz of flakes. */
  faceShot(when, k = 1) {
    const G = this.T.faceShot.gain * k;
    this.noise(when, { buf: 'brown', type: 'lowpass', f: 700, q: 0.6, gain: G, attack: 0.05, decay: 0.35 });
    this.noise(when + 0.03, { buf: 'pink', f: 3200, q: 0.7, gain: G * 0.45, attack: 0.08, hold: 0.1, decay: 0.5, type2: 'highpass', ff2: 1500 });
    for (let i = 0; i < 6; i++) this.noise(when + 0.05 + Math.random() * 0.4, { f: rnd(4000, 7000), q: 2, gain: G * 0.12, decay: 0.02 });
  }

  /** Slalom gate: a hollow plastic pole knocked aside (two short modes) with a soft flex thud. */
  gateClack(when, pan = 0) {
    const G = this.T.gate.gain;
    this.modal(when, [[rnd(780, 860), 1, 0.07], [rnd(2050, 2300), 0.6, 0.05], [rnd(3900, 4300), 0.3, 0.03]], G * 0.5, pan);
    this.noise(when, { f: 2500, q: 1, gain: G * 0.4, decay: 0.015, pan });
    this.thump(when + 0.01, { f: 140, f2: 80, gain: G * 0.3, decay: 0.08, pan });
  }

  /** Stepping in: two boot-into-binding clacks (skis) or the two ratchet straps cinched (board). */
  bindings(when, board = 0) {
    const G = this.T.bindings.gain;
    if (!board) {
      for (const [dt, pan] of [[0, -0.3], [rnd(0.55, 0.8), 0.3]]) {
        this.modal(when + dt, [[rnd(1400, 1700), 1, 0.06], [rnd(3100, 3600), 0.5, 0.04]], G * 0.5, pan);
        this.noise(when + dt, { f: 2500, q: 0.9, gain: G * 0.6, decay: 0.02, pan });
        this.thump(when + dt + 0.005, { f: 130, f2: 70, gain: G * 0.7, decay: 0.07, pan });
      }
      return;
    }
    let t = when;
    for (const pan of [-0.25, 0.25]) {
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) { this.noise(t, { f: rnd(3200, 4800), q: 2, gain: G * 0.45, decay: 0.012, pan }); t += rnd(0.06, 0.1); }
      t += rnd(0.35, 0.6);
    }
  }

  /** The chair scooping you up (or the drop at the top): a padded bump and a creak of the hanger. */
  chairBump(when, k = 1) {
    const G = this.T.bindings.gain * k;
    this.thump(when, { f: 95, f2: 55, gain: G * 0.8, decay: 0.12 });
    this.noise(when, { buf: 'pink', type: 'lowpass', f: 600, q: 0.7, gain: G * 0.5, attack: 0.005, decay: 0.15 });
    this.creak(when + 0.08, G * 0.25, rnd(-0.3, 0.3));
  }

  /** Take-off: the tail / skis unloading (a woody tock) and the snow they flick off. */
  takeoff(when, k = 1, board = 0, powder = 0, speed = 10) {
    // leaving the snow: the air rushes in — a swell rising in pitch over ~0.3 s, bigger the faster you go
    const W = this.T.takeoff.swell * Math.min(1.4, Math.max(0.2, (speed - 4) / 14));
    if (W > 0) this.noise(when + 0.02, { buf: 'pink', f: 380, f2: 1300, q: 0.7, gain: W, attack: 0.28, decay: 0.55 });
    const G = this.T.takeoff.gain * clamp(k, 0.3, 1.4);
    this.thump(when, { f: board ? 170 : 230, f2: board ? 70 : 110, gain: G * 0.5, decay: 0.07 });
    this.noise(when, { f: board ? 1200 : 1900, q: 1.4, gain: G * 0.35, decay: 0.03 });   // tail / tip tick
    this.noise(when + 0.01, { buf: 'pink', f: 2200 * (1 - 0.5 * powder), f2: 1200, q: 0.7, gain: G * 0.5 * (0.6 + powder), attack: 0.01, decay: 0.22 });
  }

  /**
   * Landing by impact (m/s into the slope, ~1–14): body thump, flat-base slap (board) or a double
   * clack (two skis), and the snow burst — fluffy and long in powder, short and bright on hardpack.
   */
  landing(when, impact, o = {}) {
    // Shaped on CC0 snow-impact recordings: a short broadband crack (100 Hz–10 kHz at once), a body thud
    // around 120–200 Hz (not a sub boom), then a scatter of crunchy debris grains thinning out over ~0.5 s.
    const T = this.T.landing, k = clamp(impact / 8, 0.12, 1.5), powder = clamp(o.powder ?? 0, 0, 1), hard = 1 - powder;
    const G = T.gain;
    this.noise(when, { type: 'highpass', f: 140, q: 0.7, gain: G * T.crack * k * (0.35 + 0.65 * hard), attack: 0.001, decay: 0.02 + 0.015 * k, type2: 'lowpass', ff2: 9000 - 5500 * powder });
    this.noise(when, { buf: 'pink', f: rnd(120, 170), q: 0.9, gain: G * T.thump * k * 1.6, attack: 0.003, decay: 0.1 + 0.08 * k });
    this.thump(when, { f: rnd(95, 115), f2: 55, gain: G * T.thump * k * 0.25 * (0.6 + 0.4 * hard), decay: 0.09 + 0.05 * k });
    if (o.board) {
      this.noise(when, { f: rnd(900, 1300), q: 0.8, gain: G * T.slap * k * hard, attack: 0.001, decay: 0.045 });
    } else {
      const gap = rnd(0.008, 0.028);
      this.noise(when, { f: rnd(2200, 2900), q: 1.6, gain: G * T.slap * k * 0.7 * hard, decay: 0.03 });
      this.noise(when + gap, { f: rnd(2000, 2700), q: 1.6, gain: G * T.slap * k * 0.6 * hard, decay: 0.03 });
    }
    // debris: crunchy grains, denser and longer for harder hits; softer and lower in powder
    const n = Math.round(T.debris * (0.4 + 0.6 * k) * (1 - 0.5 * powder));
    for (let i = 0; i < n; i++) {
      const t = when + 0.01 + Math.pow(Math.random(), 1.8) * (0.25 + 0.3 * k);
      this.noise(t, { f: rnd(700, 4500) * (1 - 0.5 * powder), q: rnd(0.8, 1.6), gain: G * T.crunch * k * rnd(0.25, 1) * Math.exp(-(t - when) / 0.25), decay: rnd(0.005, 0.02) });
    }
    // the snow thrown up
    this.noise(when + 0.006, { buf: 'pink', f: rnd(1700, 2300) * (1 - 0.45 * powder), f2: 700, q: 0.6, gain: G * T.spray * k * (0.4 + 0.2 * hard),
      attack: 0.01, decay: 0.15 + 0.2 * k + 0.35 * powder });
    if (powder > 0.2) this.noise(when, { buf: 'pink', type: 'lowpass', f: 900, f2: 300, q: 0.5, gain: G * T.spray * k * powder * 1.2, attack: 0.025, decay: 0.45 + 0.3 * k });
  }

  /** Jacket nylon swish as the hand goes for the grab (or lets go). */
  grab(when, release = false) {
    const G = this.T.grab.gain * (release ? 0.6 : 1), n = release ? 2 : 3 + Math.floor(Math.random() * 2);
    let t = when;
    for (let i = 0; i < n; i++) {
      this.noise(t, { f: rnd(2000, 3800), q: 0.9, gain: G * rnd(0.5, 1), attack: rnd(0.01, 0.03), decay: rnd(0.04, 0.09), type2: 'highpass', ff2: 900 });
      t += rnd(0.035, 0.08);
    }
  }

  /** A tumbling crash: several impacts decaying over ~1.3 s, each with snow and cloth. */
  crash(when, severity = 1, powder = 0, board = 0) {
    const G = this.T.crash.gain * clamp(severity, 0.4, 1.3);
    // a 'yard sale': skis and poles clattering loose (plastic / aluminium clacks), or the board slapping the snow
    for (let i = 0, n = board ? 2 : 3 + Math.floor(Math.random() * 3); i < n; i++) {
      const t = when + 0.1 + Math.random() * 0.9;
      if (board) this.noise(t, { f: rnd(700, 1100), q: 0.9, gain: G * 0.45 * (1 - 0.6 * powder), decay: 0.05 });
      else this.modal(t, [[rnd(900, 1300), 1, 0.06], [rnd(2400, 3100), 0.6, 0.04], [rnd(4200, 5200), 0.3, 0.03]], G * 0.22 * (1 - 0.7 * powder), rnd(-0.6, 0.6));
    }
    let t = when, k = 1;
    const hits = 4 + Math.floor(Math.random() * 3);
    for (let i = 0; i < hits; i++) {
      this.landing(t, 9 * k, { powder, board: Math.random() < 0.5 });
      this.noise(t + 0.02, { f: rnd(1800, 3200), q: 0.8, gain: G * 0.3 * k, attack: 0.02, decay: 0.12 });   // cloth
      if (i === 0) this.noise(t, { buf: 'pink', f: 1400, f2: 500, q: 0.5, gain: G * 0.6, attack: 0.02, decay: 0.9 });   // long slide
      t += rnd(0.14, 0.32); k *= rnd(0.55, 0.8);
    }
  }

  /**
   * Passing close to a tree / rock: a band of noise sweeping down in pitch (Doppler) with a swell that
   * peaks at the pass, panned to the obstacle's side. Trees add a needle rustle.
   */
  nearMiss(when, o = {}) {
    const G = (o.gain ?? this.T.nearMiss.gain) * clamp((o.speed ?? 12) / 14, 0.4, 1.4) * clamp(2.2 / Math.max(0.6, o.dist ?? 2), 0.3, 1.4);
    const pan = clamp(o.pan ?? 0, -0.9, 0.9), tree = o.kind !== 'rock';
    const g = this.noise(when, { buf: 'pink', f: 2600, f2: 650, q: 1.1, gain: G, attack: 0.16, decay: 0.32, pan });
    // comb: a 4 → 9 → 4 ms swept delay mixed in (the 'jet' flange of air rushing past an object)
    const c = this.ctx, d = c.createDelay(0.02), dg = c.createGain();
    d.delayTime.setValueAtTime(0.004, when); d.delayTime.linearRampToValueAtTime(0.009, when + 0.2); d.delayTime.linearRampToValueAtTime(0.004, when + 0.55);
    dg.gain.value = 0.5; g.connect(d); d.connect(dg); dg.connect(this.dest(pan));
    this.noise(when + 0.1, { buf: 'pink', f: 700, q: 0.8, gain: G * 0.6, attack: 0.08, decay: 0.25, pan: pan * 0.6 });   // body of the pass (the pass-by reference sits 500 Hz–8 kHz)
    if (tree) for (let i = 0; i < 4; i++) this.noise(when + 0.08 + i * rnd(0.03, 0.06), { f: rnd(4000, 6500), q: 1.2, gain: G * 0.25, decay: 0.05, pan });
  }

  /** Hard brake / hockey stop onset: a fan of sprayed snow with a rough scrape. */
  hardBrake(when, speed = 12, board = 0, powder = 0) {
    const G = this.T.hardBrake.gain * clamp(speed / 14, 0.5, 1.3);
    this.noise(when, { buf: 'pink', f: board ? 1500 : 2100, f2: 1100, q: 0.6, gain: G, attack: 0.05, hold: 0.12, decay: 0.45 + powder * 0.3 });
    for (let i = 0; i < 6; i++) this.noise(when + i * rnd(0.04, 0.08), { f: rnd(2500, 4500) * (1 - 0.4 * powder), q: 1.4, gain: G * 0.35, decay: 0.04 });
    this.patter(when + 0.3, clamp(speed / 14, 0.5, 1.3), powder, 0);
  }

  /** A trunk creaking in the wind: stick-slip pulses through woody resonances, placed in the stereo field. */
  creak(when, gain = 0.15, pan = 0, out) {
    const c = this.ctx, sr = c.sampleRate, dur = rnd(0.6, 1.6), n = Math.floor(sr * dur);
    const b = c.createBuffer(1, n, sr), d = b.getChannelData(0);
    let ph = 0, f = rnd(14, 26);
    const f1 = rnd(-6, 10);
    for (let i = 0; i < n; i++) {
      const x = i / n, env = Math.sin(Math.PI * x) ** 1.5;
      ph += (f + f1 * x + (Math.random() - 0.5) * 6) / sr;
      if (ph >= 1) { ph -= 1; d[i] = env * (0.6 + Math.random() * 0.4); }
    }
    const src = c.createBufferSource(); src.buffer = b;
    const g = c.createGain(); g.gain.value = gain * 6;
    const dst = this.dest(pan, out);
    for (const [fr, q, a] of [[rnd(320, 480), 9, 1], [rnd(800, 1100), 12, 0.6], [rnd(1600, 2100), 14, 0.3]]) {
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fr; bp.Q.value = q;
      const ga = c.createGain(); ga.gain.value = a;
      src.connect(bp); bp.connect(ga); ga.connect(g);
    }
    g.connect(dst);
    src.start(when);
  }

  /** Crowd reaction: a noisy roar plus applause (dense random claps), swelling and fading. */
  cheer(when, k = 1, out) {
    const G = k;
    this.noise(when, { buf: 'pink', f: 900, q: 0.5, gain: G * 0.5, attack: 0.25, hold: 0.4, decay: 1.6, out, type2: 'lowpass', ff2: 3200 });
    this.noise(when + 0.05, { buf: 'pink', f: 2200, q: 1.5, gain: G * 0.18, attack: 0.3, hold: 0.2, decay: 1.0, out });   // "whoo"
    const claps = Math.floor(70 * k + 30);
    for (let i = 0; i < claps; i++) {
      const t = when + 0.1 + Math.pow(Math.random(), 1.6) * 2.2;
      this.noise(t, { f: rnd(1200, 2600), q: 1.4, gain: G * rnd(0.05, 0.14) * Math.exp(-(t - when) / 1.6), decay: 0.02, pan: rnd(-0.8, 0.8), out });
    }
  }
}
