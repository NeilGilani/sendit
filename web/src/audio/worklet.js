// AudioWorklet DSP for the snow and the wind (loaded with audioWorklet.addModule; no imports allowed here).
// Everything is synthesized per sample from physics parameters, so nothing loops audibly:
//   'sendit-snow'  glide hiss, corduroy zip, crystal grains, edge carve + chatter, skid scrape + spray,
//                  powder whoosh with high-frequency absorption, board base rumble, ice scrape
//   'sendit-wind'  helmet buffeting, airflow rush, vent whistles, gusts, spin / flip whooshes, map wind
// Parameters arrive as k-rate AudioParams (deterministic under OfflineAudioContext automation) and are
// smoothed per 128-sample block; gains ramp linearly inside each block so nothing zippers.
// Tunables come from tuning.js through processorOptions ({ T }).

const TAU = Math.PI * 2;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  u() { let x = this.s; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.s = x >>> 0; return this.s / 4294967296; }
  bi() { return this.u() * 2 - 1; }
}

/** Topology-preserving-transform state variable filter: stable when its cutoff moves every block. */
class SVF {
  constructor() { this.ic1 = 0; this.ic2 = 0; this.k = 1; this.a1 = 1; this.a2 = 0; this.a3 = 0; this.v1 = 0; this.v2 = 0; }
  set(f, q, fs) {
    const g = Math.tan(Math.PI * clamp(f, 10, fs * 0.45) / fs);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  tick(x) {
    const v3 = x - this.ic2;
    const v1 = this.a1 * this.ic1 + this.a2 * v3, v2 = this.ic2 + this.a2 * this.ic1 + this.a3 * v3;
    this.ic1 = 2 * v1 - this.ic1; this.ic2 = 2 * v2 - this.ic2;
    this.v1 = v1; this.v2 = v2;
    return x;
  }
  bp(x) { this.tick(x); return this.v1 * this.k; }   // unity peak gain band-pass
  lp(x) { this.tick(x); return this.v2; }
  hp(x) { this.tick(x); return x - this.k * this.v1 - this.v2; }
}

class Pink {   // Paul Kellet's pink filter on white noise
  constructor() { this.b = new Float64Array(7); }
  next(w) {
    const b = this.b;
    b[0] = 0.99886 * b[0] + w * 0.0555179; b[1] = 0.99332 * b[1] + w * 0.0750759; b[2] = 0.969 * b[2] + w * 0.153852;
    b[3] = 0.8665 * b[3] + w * 0.3104856; b[4] = 0.55 * b[4] + w * 0.5329522; b[5] = -0.7616 * b[5] - w * 0.016898;
    const p = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362; b[6] = w * 0.115926;
    return p * 0.11;
  }
}

/** One-pole parameter smoother across blocks. */
function smoothInto(state, params, names, a) {
  for (const n of names) {
    const v = params[n][0];
    state[n] = state[n] === undefined ? v : state[n] + (v - state[n]) * a;
  }
}

const P = (name, def = 0, min = -1e9, max = 1e9) => ({ name, defaultValue: def, minValue: min, maxValue: max, automationRate: 'k-rate' });

// =====================================================================================================
class SnowProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [P('speed'), P('ground'), P('edge'), P('load', 1), P('skid'), P('stop'), P('groomed', 1), P('powder'), P('ice'), P('park'),
      P('sink'), P('board'), P('chatter'), P('cold'), P('rate', 1), P('low', 1), P('gain', 1)];
  }

  constructor(opts) {
    super();
    this.T = opts.processorOptions.T;
    this.fs = sampleRate;
    this.names = SnowProcessor.parameterDescriptors.map((d) => d.name);
    this.p = {};
    this.ch = [0, 1].map((c) => ({
      rng: new Rng(1234567 + c * 7919), pink: new Pink(), brown: 0,
      hiss: new SVF(), hissLP: new SVF(), powHP: new SVF(), c1: new SVF(), c2: new SVF(), growl: new SVF(), skid: new SVF(), spray: new SVF(), powder: new SVF(),
      lowCut: new SVF(), base: new SVF(), iceH: new SVF(), iceB: new SVF(), scr1: new SVF(), scr2: new SVF(), grain: new SVF(), absorb: 0,
    }));
    this.rng = new Rng(424242);
    // grains
    this.K = 32; this.gEnv = new Float64Array(this.K); this.gDec = new Float64Array(this.K); this.gPan = new Float64Array(this.K); this.gi = 0;
    this.rough = new SVF(); this.roughLvl = 0;
    this.cordPh = 0; this.cordJit = 1;
    this.chPh = 0; this.chF = 24; this.chAmp = 1;
    this.wob1 = 0; this.wob2 = 0; this.wobT1 = 0; this.wobT2 = 0;
    this.scrF1 = 3000; this.scrF2 = 4800;   // the edge's narrow scrape resonances on ice (random walk 2–6 kHz)
    this.prev = null;   // previous block's gains (for ramps)
    this.smoothA = 1 - Math.exp(-128 / (this.fs * 0.03));
    this.active = 0;
  }

  gains() {
    const T = this.T, p = this.p;
    const speed = Math.max(0, p.speed), ground = clamp(p.ground, 0, 1), edge = clamp(p.edge, 0, 1), load = clamp(p.load, 0.5, 3);
    let wG = Math.max(0, p.groomed), wP = Math.max(0, p.powder), wI = Math.max(0, p.ice), wK = Math.max(0, p.park);
    const tot = wG + wP + wI + wK;
    if (tot < 1e-3) { wG = 1; wP = wI = wK = 0; } else { wG /= tot; wP /= tot; wI /= tot; wK /= tot; }
    const sink = clamp(p.sink, 0, 1), board = clamp(p.board, 0, 1), skid = clamp(p.skid, 0, 1.5), stop = clamp(p.stop, 0, 1);
    const mv = sstep(T.vStart, T.vStart + 1.6, speed);
    const s01 = Math.min(1.5, speed / T.vRef);
    const sc = mv * Math.min(1.3, Math.pow(s01, T.hiss.exp));
    const hard = wG + wI + wK;
    const g = {};
    // flat, unweighted skis between turns are much quieter than a loaded edge (the groomed reference dips ~10 dB)
    const weight = lerp(T.hiss.flat, 1, Math.max(sstep(0.05, 0.5, edge), Math.min(1, skid * 2)));
    g.hiss = T.hiss.gain * sc * weight * lerp(1, T.hiss.boardGain, board) * (wG + wK * T.hiss.park + wI * T.hiss.ice + wP * T.hiss.powder) * (1 - 0.5 * sink) * ground;
    g.cord = T.corduroy.depth * (wG + wK * 0.6) * (1 - edge) * ground * mv;
    g.carve = T.carve.gain * Math.pow(edge, T.carve.edgeExp) * Math.pow(load, T.carve.loadExp) * sc * (wG + wK + wI * T.carve.ice + wP * T.carve.powder) * ground * (1 - 0.35 * Math.min(1, skid));
    g.growl = T.carve.growl * board * edge * sc * load * (hard + 0.3 * wP) * ground;
    const sk = mv * Math.pow(Math.min(1, speed / 10), 0.7);
    g.skid = (T.skid.gain * Math.min(1, skid) + T.skid.gain * T.skid.stop * stop) * sk * (hard + 0.6 * wP) * ground;
    g.spray = T.skid.spray * (Math.min(1, skid) + stop) * sk * (wG + wK + wP * 1.3) * ground;
    g.powder = T.powder.gain * wP * sc * (0.5 + T.powder.sinkBoost * sink) * ground;
    g.base = T.base.gain * board * sc * (1 - edge) * hard * ground * p.low;
    g.ice = T.ice.gain * wI * sc * (0.5 + edge + Math.min(1, skid)) * ground;
    g.chatter = clamp(p.chatter, 0, 1) * T.chatter.depth * ground;
    g.grainRate = (T.grains.rate0 + T.grains.ratePerV * speed * (1 + T.grains.rateEdge * edge * load) + 900 * Math.min(1, skid) * mv) * mv * ground;
    g.grainRate = Math.min(T.grains.max, g.grainRate) * clamp(p.rate, 0.2, 1.5) * lerp(1, T.grains.boardRate, board);
    g.grainDecay = lerp(1, T.grains.boardDecay, board);   // a board's wide base: fewer, coarser, choppier grains
    g.grainAmp = T.grains.gain * (wG + wK + wI * 0.8 + wP * 0.6) * (0.55 + 0.45 * Math.min(1, s01)) * (1 - 0.5 * sink) * lerp(1, T.grains.boardAmp, board) * lerp(0.7, 1, weight);
    g.width = lerp(T.width.ski, T.width.board, board);
    g.board = board;
    g.out = T.out * p.gain;
    // filter frequencies (rate = slow-motion pitch)
    const r = clamp(p.rate, 0.25, 2);
    // glide hiss: pink noise between a high-pass and a low-pass that both rise with speed (≈ flat octave
    // bands 500 Hz – 8 kHz like the groomed reference); a board's base keeps it darker
    const hb = Math.pow(Math.max(speed, 1) / 5, T.hiss.fExp) * (1 - 0.4 * wP) * lerp(1, T.hiss.board, board) * r;
    g.fHiss = T.hiss.hp * hb; g.fHissLP = Math.min(T.hiss.lpMax, T.hiss.lp * hb);
    const bf = lerp(1, T.carve.boardF, board);
    g.f1 = T.carve.f1 * (1 + T.carve.fSpeed * Math.min(1, s01)) * bf * (1 + 0.15 * wI) * r;
    g.f2 = T.carve.f2 * (1 + T.carve.fSpeed * Math.min(1, s01)) * bf * (1 + 0.25 * wI) * r;
    g.fGrowl = T.carve.growlF * (1 + 0.5 * Math.min(1, s01)) * r;
    g.fSkid = lerp(T.skid.f, T.skid.fIce, wI) * (1 + 0.3 * Math.min(1, s01)) * r;
    g.fPowder = (T.powder.f0 + T.powder.fPerV * speed) * r;
    let fg = wG * T.grains.fGroomed + wK * T.grains.fGroomed + wI * T.grains.fIce + wP * T.grains.fPowder;
    fg = lerp(fg, T.grains.fCold, clamp(p.cold, 0, 1) * 0.5 * (1 - sstep(4, 12, speed)));   // squeak only when slow (friction melts it)
    g.fGrain = fg * lerp(1, T.grains.board, board) * r;
    g.fAbsorb = lerp(16000, T.powder.absorbF, T.powder.absorbMax * wP * Math.min(1, 0.35 + sink * 3)) * r;
    g.cordF = speed / T.corduroy.spacing * r;
    g.chF = r;
    g.chMin = lerp(T.chatter.fMin, T.chatter.boardMin, board); g.chMax = lerp(T.chatter.fMax, T.chatter.boardMax, board);
    g.r = r;
    return g;
  }

  process(_in, outputs, params) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, fs = this.fs, T = this.T;
    smoothInto(this.p, params, this.names, this.prev ? this.smoothA : 1);
    const g = this.gains();
    const a = this.prev || g;
    this.prev = g;
    const loud = g.hiss + g.carve + g.skid + g.powder + g.ice + g.base + g.growl + g.spray + g.grainAmp * Math.min(1, g.grainRate / 500);
    if (loud < 1e-5 && this.active <= 0) { L.fill(0); if (R !== L) R.fill(0); return true; }
    this.active = loud > 1e-5 ? fs * 0.3 : this.active - n;   // keep running for a tail after it falls silent
    // slow wobble of the carve bands (random walk toward new targets)
    const bt = n / fs;
    if ((this.wobT1 -= bt) <= 0) { this.wobT1 = 0.15 + this.rng.u() * 0.6; this.wobG1 = this.rng.bi(); }
    if ((this.wobT2 -= bt) <= 0) { this.wobT2 = 0.1 + this.rng.u() * 0.5; this.wobG2 = this.rng.bi(); }
    this.wob1 += ((this.wobG1 || 0) - this.wob1) * 0.08; this.wob2 += ((this.wobG2 || 0) - this.wob2) * 0.1;
    const w1 = 1 + T.carve.wobble * this.wob1, w2 = 1 + T.carve.wobble * this.wob2;
    const width = g.width;
    const S = T.ice.scrape;
    this.scrF1 = clamp(this.scrF1 * (1 + (this.rng.u() - 0.5) * S.walk), S.fMin, S.fMax);
    this.scrF2 = clamp(this.scrF2 * (1 + (this.rng.u() - 0.5) * S.walk), S.fMin, S.fMax);
    for (const c of this.ch) {
      c.hiss.set(g.fHiss, 0.6, fs); c.hissLP.set(g.fHissLP, 0.6, fs); c.powHP.set(T.powder.hp * g.r, 0.7, fs);
      c.c1.set(g.f1 * w1, T.carve.q1, fs); c.c2.set(g.f2 * w2, T.carve.q2, fs);
      c.growl.set(g.fGrowl, 0.8, fs);
      c.skid.set(g.fSkid, T.skid.q, fs); c.spray.set(T.skid.sprayF * g.r, 0.6, fs);
      c.powder.set(g.fPowder, T.powder.q, fs);
      c.base.set(T.base.f * g.r, 0.7, fs); c.lowCut.set(T.base.lowCut, 0.7, fs);
      c.iceH.set(T.ice.hp * g.r, 0.7, fs); c.iceB.set(T.ice.bp * g.r, T.ice.q, fs);
      c.scr1.set(this.scrF1 * g.r * lerp(1, 0.7, g.board), S.q, fs); c.scr2.set(this.scrF2 * g.r * lerp(1, 0.7, g.board), S.q, fs);
      c.grain.set(g.fGrain, T.grains.q, fs);
    }
    this.rough.set(T.skid.roughF, 0.7, fs);
    const absA = 1 - Math.exp(-TAU * g.fAbsorb / fs);
    const pGrain = g.grainRate / fs;
    const cordInc = g.cordF / fs;
    const K = this.K, env = this.gEnv, dec = this.gDec, pan = this.gPan;
    const [C0, C1] = this.ch;
    for (let i = 0; i < n; i++) {
      const t = i / n, it = 1 - t;
      const hiss = a.hiss * it + g.hiss * t, carve = a.carve * it + g.carve * t, growl = a.growl * it + g.growl * t;
      const skid = a.skid * it + g.skid * t, spray = a.spray * it + g.spray * t, powder = a.powder * it + g.powder * t;
      const base = a.base * it + g.base * t, ice = a.ice * it + g.ice * t, grainAmp = a.grainAmp * it + g.grainAmp * t;
      const cord = a.cord * it + g.cord * t, chat = a.chatter * it + g.chatter * t, outG = a.out * it + g.out * t;
      // corduroy: zippy AM at ridge rate, jittered
      this.cordPh += cordInc * this.cordJit;
      if (this.cordPh >= 1) { this.cordPh -= 1; this.cordJit = 0.85 + this.rng.u() * 0.3; }
      const cordAM = 1 - cord * (0.5 + 0.5 * Math.sin(TAU * this.cordPh));
      // chatter: irregular AM at 16–34 Hz, each cycle a new depth
      this.chPh += this.chF * g.chF / fs;
      if (this.chPh >= 1) { this.chPh -= 1; this.chF = lerp(g.chMin, g.chMax, this.rng.u()); this.chAmp = 0.4 + 0.6 * this.rng.u(); }
      const chatAM = 1 - chat * this.chAmp * (0.5 + 0.5 * Math.cos(TAU * this.chPh));
      // skid roughness: lumpy envelope from low-passed noise
      const rn = this.rough.lp(this.rng.bi());
      const roughEnv = (1 - T.skid.rough) + T.skid.rough * Math.min(2.5, Math.abs(rn) * 9);
      // grains: spawn (Poisson), then sum their envelopes per channel
      if (this.rng.u() < pGrain) {
        const k = this.gi; this.gi = (this.gi + 1) % K;
        const u = this.rng.u();
        env[k] = grainAmp * (0.12 + 0.88 * u * u * u);
        const tau = lerp(T.grains.decayMin, T.grains.decayMax, this.rng.u()) * g.grainDecay;
        dec[k] = Math.exp(-1 / (tau * fs));
        pan[k] = width > 0.5 ? (this.rng.u() < 0.5 ? 0.15 : 0.85) + this.rng.bi() * 0.12 : 0.5 + this.rng.bi() * 0.2;
      }
      let gl = 0, gr = 0;
      for (let k = 0; k < K; k++) {
        const e = env[k];
        if (e < 1e-5) continue;
        gl += e * (1 - pan[k]); gr += e * pan[k];
        env[k] = e * dec[k];
      }
      for (let ci = 0; ci < 2; ci++) {
        const c = ci === 0 ? C0 : C1;
        const w = c.rng.bi(), pk = c.pink.next(w);
        c.brown = (c.brown + 0.02 * w) / 1.02;
        const br = c.lowCut.hp(c.brown * 3.5);   // no sub-bass rumble under the base (the board reference is quiet below 150 Hz)
        let s = c.hissLP.lp(c.hiss.hp(pk * 0.8 + w * T.hiss.white)) * hiss * 1.8 * cordAM;
        s += (c.c1.bp(w) * 1.3 + c.c2.bp(w)) * carve * chatAM;
        s += c.growl.bp(br) * growl * 1.6;
        s += c.skid.bp(w) * skid * roughEnv * chatAM + c.spray.lp(pk) * spray * roughEnv;
        s += c.powder.lp(c.powHP.hp(br + pk * T.powder.shh)) * powder * 1.5;
        s += c.base.bp(br) * base * 3.0;
        s += (c.iceB.bp(c.iceH.hp(w)) * 2.2 + (c.scr1.bp(w) + c.scr2.bp(w) * 0.7) * S.gain) * ice * chatAM;
        const gsum = ci === 0 ? gl : gr;
        s += c.grain.bp(gsum * w) * 2.4 + gsum * w * T.grains.raw;
        c.absorb += (s - c.absorb) * absA;
        if (ci === 0) this._l = c.absorb; else this._r = c.absorb;
      }
      const m = (this._l + this._r) * 0.5, sd = (this._l - this._r) * 0.5 * width;
      L[i] = clamp((m + sd) * outG, -1, 1);
      if (R !== L) R[i] = clamp((m - sd) * outG, -1, 1);
    }
    return true;
  }
}

// =====================================================================================================
class WindProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [P('v'), P('air'), P('buffet', 1), P('whistle', 1), P('rush', 1), P('spin'), P('tuck'), P('ambient'), P('ambF', 380),
      P('gusty', 1), P('rate', 1), P('gain', 1), P('flap', 1)];
  }

  constructor(opts) {
    super();
    this.T = opts.processorOptions.T;
    this.fs = sampleRate;
    this.names = WindProcessor.parameterDescriptors.map((d) => d.name);
    this.p = {};
    this.rng = new Rng(777);
    this.ch = [0, 1].map((c) => ({ rng: new Rng(99991 + c * 31337), pink: new Pink(), brown: 0, rush: new SVF(), bump: new SVF(), hp: new SVF(), hi: new SVF(), w1: new SVF(), w2: new SVF(), amb: new SVF(), ambH: new SVF() }));
    this.buf = new SVF(); this.flut = new SVF(); this.bBrown = 0; this.flapF = new SVF(); this.flapPh = 0; this.flapA = 1; this.flapPk = new Pink(); this.flapRng = new Rng(4242);
    this.g1 = 0; this.g2 = 0; this.g3 = 0; this.sqPh = 0; this.sqA = 0; this.sqT = 0; this.lock1 = 0; this.lock2 = 0; this.lockT1 = 0; this.lockT2 = 0; this.lt1 = 0; this.lt2 = 0;
    this.ph = 0;
    this.prev = null;
    this.smoothA = 1 - Math.exp(-128 / (this.fs * 0.04));
  }

  ou(x, tau, dt) { return x - (x / tau) * dt + Math.sqrt((2 * dt) / tau) * this.gauss(); }
  gauss() { const u = Math.max(1e-9, this.rng.u()), v = this.rng.u(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); }

  process(_in, outputs, params) {
    const out = outputs[0], L = out[0], R = out[1] || out[0], n = L.length, fs = this.fs, T = this.T;
    smoothInto(this.p, params, this.names, this.prev ? this.smoothA : 1);
    const p = this.p, dt = n / fs;
    // gusts: Ornstein–Uhlenbeck processes (rider-relative and ambient)
    this.g1 = clamp(this.ou(this.g1, T.gust.tau, dt), -2.5, 2.5);
    this.g2 = clamp(this.ou(this.g2, T.gust.tau * 2.2, dt), -2.5, 2.5);
    this.g3 = clamp(this.ou(this.g3, T.ears.tau, dt), -2, 2);   // head yaw against the airflow
    const earL = clamp(1 + T.ears.depth * this.g3, 0.35, 1.8), earR = clamp(1 - T.ears.depth * this.g3, 0.35, 1.8);
    if ((this.sqT -= dt) <= 0) { this.sqT = 0.2 + this.rng.u() * 0.4; this.sqA = this.rng.u(); }
    this.sqPh += T.gust.squallF * dt;
    // whistle lock-in: vortex shedding latches on and off
    if ((this.lockT1 -= dt) <= 0) { this.lockT1 = 0.4 + this.rng.u() * 2.5; this.lt1 = this.rng.u() < 0.55 ? this.rng.u() : 0; }
    if ((this.lockT2 -= dt) <= 0) { this.lockT2 = 0.3 + this.rng.u() * 2; this.lt2 = this.rng.u() < 0.45 ? this.rng.u() : 0; }
    this.lock1 += (this.lt1 - this.lock1) * 0.04; this.lock2 += (this.lt2 - this.lock2) * 0.05;
    const gusty = clamp(p.gusty, 0, 3), r = clamp(p.rate, 0.25, 2);
    const vEff = Math.max(0, p.v + T.gust.relWind * this.g1 * gusty * Math.min(1, p.v / 6));
    const air = clamp(p.air, 0, 1);
    let lvl = T.floor + Math.pow(vEff / T.vMax, T.exp);
    lvl = Math.min(1.4, lvl * lerp(1, T.air.boost, air) * (1 + T.gust.depth * 0.3 * this.g1 * gusty));
    const tuck = clamp(p.tuck, 0, 1);
    const spinAbs = Math.abs(p.spin), spinAmt = Math.min(1, spinAbs / T.spin.full) * T.spin.gain * air;
    const g = {
      buffet: T.buffet.gain * Math.pow(lvl, 1.2) * p.buffet * (1 - 0.3 * tuck),
      rush: T.rush.gain * lvl * p.rush * (1 + spinAmt * 0.4) * (1 - T.tuck.rush * tuck),
      flap: T.flap.gain * sstep(T.flap.from, T.flap.full, vEff) * lvl * p.flap * (1 - T.tuck.flap * tuck) * (1 - 0.6 * air),
      hi: T.rush.hiGain * Math.pow(lvl, 1.3) * p.rush,
      wh1: T.whistle.gain * sstep(T.whistle.from, T.whistle.from + 6, vEff) * p.whistle * this.lock1,
      wh2: T.whistle.gain * sstep(T.whistle.from + 3, T.whistle.from + 10, vEff) * p.whistle * this.lock2 * 0.8,
      amb: T.ambient.gain * clamp(p.ambient, 0, 2) * clamp(0.55 + 0.45 * this.g2 * gusty, 0.08, 1.8),
      out: T.out * p.gain,
      spin: spinAmt,
    };
    g.ambHi = T.ambient.hiss * g.amb * clamp(0.3 + 0.5 * this.g2 * gusty, 0, 1.5);
    const a = this.prev || g;
    this.prev = g;
    const fr = clamp(T.rush.f0 + T.rush.fPerV * vEff * lerp(1, T.air.rushUp, air) * (1 - T.tuck.lp * tuck), 150, 4000) * r;
    const flapInc = (T.flap.f0 + T.flap.fPerV * vEff) * r / fs;
    this.flapF.set(T.flap.f * r, T.flap.q, fs);
    const fh = clamp(T.rush.hiF0 * Math.pow(Math.max(vEff, 1) / 10, T.rush.hiExp), 400, 9000) * r;
    const f1 = clamp((T.whistle.st * vEff) / T.whistle.d1, 200, 6000) * r, f2 = clamp((T.whistle.st * vEff) / T.whistle.d2, 150, 5000) * r;
    for (const c of this.ch) {
      c.hi.set(fh, T.rush.hiQ, fs); c.bump.set(T.rush.bumpF * r, T.rush.bumpQ, fs); c.hp.set(30, 0.7, fs);
      c.w1.set(f1, T.whistle.q, fs); c.w2.set(f2, T.whistle.q, fs);
      c.amb.set(clamp(p.ambF, 80, 4000) * r, T.ambient.q, fs); c.ambH.set(T.ambient.hissF * r, 0.8, fs);
    }
    this.buf.set(T.buffet.f * r, 0.8, fs); this.flut.set(T.buffet.flutterF, 0.7, fs);
    const phInc = (spinAbs / TAU) / fs;   // revolutions per sample
    const squall = 1 + T.gust.squall * this.sqA * Math.sin(TAU * this.sqPh) * clamp(p.gusty, 0, 2);
    for (let i = 0; i < n; i++) {
      const t = i / n, it = 1 - t;
      const buffet = a.buffet * it + g.buffet * t, rush = a.rush * it + g.rush * t, hi = a.hi * it + g.hi * t;
      const wh1 = a.wh1 * it + g.wh1 * t, wh2 = a.wh2 * it + g.wh2 * t, amb = a.amb * it + g.amb * t, ambHi = a.ambHi * it + g.ambHi * t;
      const spin = a.spin * it + g.spin * t, outG = a.out * it + g.out * t, flap = a.flap * it + g.flap * t;
      // jacket flapping: irregular pulses at 8–25 Hz through a 200–600 Hz band
      this.flapPh += flapInc * (0.85 + 0.3 * this.flapA);
      if (this.flapPh >= 1) { this.flapPh -= 1; this.flapA = this.flapRng.u(); }
      const fp = 0.5 + 0.5 * Math.sin(TAU * this.flapPh);
      const flapS = flap > 1e-5 ? this.flapF.bp(this.flapPk.next(this.flapRng.bi())) * flap * fp * fp * fp * (0.4 + this.flapA) * 4 : 0;
      this.ph += phInc; if (this.ph >= 1) this.ph -= 1;
      const cs = Math.cos(TAU * this.ph), sw = Math.sin(TAU * this.ph * 2);
      // buffet: shared low rumble, fluttering
      const wb = this.rng.bi();
      this.bBrown = (this.bBrown + 0.02 * wb) / 1.02;
      const fl = this.flut.lp(this.rng.bi());
      const flutter = (1 - T.buffet.flutterDepth) + T.buffet.flutterDepth * Math.min(2.5, Math.abs(fl) * 14);
      const bfs = this.buf.lp(this.bBrown * 3.5) * buffet * flutter * 2.2;
      for (let ci = 0; ci < 2; ci++) {
        const c = this.ch[ci];
        const w = c.rng.bi(), pk = c.pink.next(w);
        c.brown = (c.brown + 0.02 * w) / 1.02;
        // per-ear spin modulation: one ear faces the airflow, then the other
        const ear = 1 + T.spin.depth * spin * (ci === 0 ? cs : -cs);
        if ((i & 15) === 0) c.rush.set(fr * (1 + T.spin.sweep * spin * sw), T.rush.q, fs);
        let s = bfs + flapS * (ci === 0 ? 1.1 : 0.9);
        const pre = c.hp.hp(pk);
        s += (c.rush.lp(pre) + c.bump.bp(pre) * T.rush.bump) * rush * 1.6 * ear * (ci === 0 ? earL : earR) * squall;
        s += c.hi.bp(w) * hi * ear * (ci === 0 ? earL : earR);
        s += (c.w1.bp(w) * wh1 + c.w2.bp(w) * wh2) * 6;
        s += c.amb.bp(c.brown * 3.5) * amb * 2.2 + c.ambH.bp(pk) * ambHi;
        const o = clamp(s * outG, -1, 1);
        if (ci === 0) L[i] = o; else if (R !== L) R[i] = o;
      }
    }
    return true;
  }
}

registerProcessor('sendit-snow', SnowProcessor);
registerProcessor('sendit-wind', WindProcessor);
