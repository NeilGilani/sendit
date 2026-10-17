// The audio engine: mix graph, the snow / wind worklets, one-shots, grinds and ambience, all driven by
// plain rider frames (rider.js readRider) and bus events. Works the same on a live AudioContext and on an
// OfflineAudioContext (scripts/audio-test.mjs): every call takes the context time it applies at.
//
//   destination ← limiter ← master ─┬─ sfx ─┬─ snow   (worklet 'sendit-snow')
//                                    │       ├─ wind   (worklet 'sendit-wind')
//                                    │       ├─ amb    (forest, crowd, creaks, birds)
//                                    │       ├─ fx     (landings, whooshes, grinds…)
//                                    │       └─ ui     (game cues; SoundScape.oneShot)
//                                    └─ music ← duck ← tracks
import { AUDIO } from './tuning.js';
import { ST } from './rider.js';
import { FX } from './fx.js';
import { Grind } from './grind.js';
import { Ambience } from './ambience.js';
import { LiftVoice } from './lift.js';
import { BreathVoice } from './breath.js';
import { OtherRiders } from './others.js';

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dbToGain = (db) => Math.pow(10, db / 20);
/** tanh soft clip: linear below `knee`, saturating toward `ceil` (−1 dBFS) above it. Inputs beyond ±1 are
 *  held at the curve's ends by the WaveShaper, so the ceiling holds whatever arrives. */
function softClipCurve(knee = 0.75, ceil = 0.89) {
  const n = 4096, c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x);
    c[i] = a <= knee ? x : Math.sign(x) * (knee + (ceil - knee) * Math.tanh((a - knee) / (ceil - knee)));
  }
  return c;
}

/** Mono, 100 Hz high-passed, RMS-normalised copy of a texture buffer (for the worklet's grains). */
function prepTexture(buf, rms) {
  const n = buf.length, out = new Float32Array(n + 2), chs = buf.numberOfChannels;
  let prev = 0, hp = 0, e = 0;
  const a = Math.exp(-2 * Math.PI * 100 / buf.sampleRate), data = Array.from({ length: chs }, (_, c) => buf.getChannelData(c));
  for (let i = 0; i < n; i++) {
    let x = 0;
    for (let c = 0; c < chs; c++) x += data[c][i];
    x /= chs;
    hp = a * (hp + x - prev); prev = x;
    out[i] = hp; e += hp * hp;
  }
  const k = rms / Math.max(1e-6, Math.sqrt(e / n));
  for (let i = 0; i < n; i++) out[i] *= k;
  return out;
}

const WORKLET_URL = new URL('./worklet.js', import.meta.url);

export class AudioEngine {
  /**
   * @param {BaseAudioContext} ctx
   * @param {object} [o] { buffers: {name: AudioBuffer}, workletUrl }
   */
  constructor(ctx, o = {}) {
    this.ctx = ctx;
    this.T = AUDIO;
    this.buffers = o.buffers || {};
    this.loadBuffer = o.load || null;
    this.workletUrl = o.workletUrl || WORKLET_URL;
    this.mapId = 'default';
    this.view = 'chase';
    this.slow = 1;
    this.last = null;
    this.duckDb = 0;
    this.crashT = 0;
    this.lastPole = -1; this.lastEdgeT = -1; this.edgeSide = 0; this.poleSide = 1;
    this.grabbing = false;
    this.stats = { events: {} };
  }

  async init() {
    const c = this.ctx, M = this.T.mix;
    this.limiter = c.createDynamicsCompressor();
    this.limiter.threshold.value = M.limiterThresholdDb; this.limiter.knee.value = M.limiterKneeDb;
    this.limiter.ratio.value = M.limiterRatio; this.limiter.attack.value = M.limiterAttack; this.limiter.release.value = M.limiterRelease;
    // the compressor has no look-ahead and can overshoot: a tanh soft clipper (4× oversampled) catches it
    this.clip = c.createWaveShaper(); this.clip.curve = softClipCurve(M.clipKnee, M.clipCeil); this.clip.oversample = '4x';
    this.limiter.connect(this.clip); this.clip.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = M.preLimiter; this.master.connect(this.limiter);
    // glue: gentle bus compression so snow, wind and impacts sit together
    this.glue = c.createDynamicsCompressor();
    this.glue.threshold.value = M.glueThresholdDb; this.glue.knee.value = M.glueKneeDb; this.glue.ratio.value = M.glueRatio;
    this.glue.attack.value = M.glueAttack; this.glue.release.value = M.glueRelease;
    this.glue.connect(this.master);
    this.sfx = c.createGain(); this.sfx.connect(this.glue);
    this.music = c.createGain(); this.music.connect(this.master);
    // music: duck gain → low-pass (big air / bails muffle it) → music volume
    this.musicLP = c.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 20000; this.musicLP.Q.value = 0.7;
    this.musicLP.connect(this.music);
    this.duck = c.createGain(); this.duck.gain.value = M.music; this.duck.connect(this.musicLP);
    const bus = (g) => { const n = c.createGain(); n.gain.value = g; n.connect(this.sfx); return n; };
    this.snowBus = bus(M.snow); this.windBus = bus(M.wind); this.ambBus = bus(M.ambience); this.fxBus = bus(M.fx); this.uiBus = bus(M.ui);
    // analysers for the headless test / debug overlay
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 2048; this.clip.connect(this.analyser);

    this.fx = new FX(c, this.fxBus, this.T.fx);
    try {
      await c.audioWorklet.addModule(this.workletUrl);
      const mk = (name, T) => new AudioWorkletNode(c, name, { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { T } });
      this.snow = mk('sendit-snow', this.T.snow); this.snow.connect(this.snowBus);
      this.wind = mk('sendit-wind', this.T.wind); this.wind.connect(this.windBus);
      this.sp = this.snow.parameters; this.wp = this.wind.parameters;
      this.worklet = true;
      // a DSP exception stops a processor for good: count it (the tests fail on it) and switch to the sample loops
      const onErr = (e) => {
        this.stats.workletError = (this.stats.workletError || 0) + 1;
        console.warn('[audio] worklet processor error, falling back to sample loops', e);
        if (this.legacy || !this.worklet) return;
        this.worklet = false;
        try { this.snow.disconnect(); this.wind.disconnect(); } catch { /* already gone */ }
        this.startLegacy();
      };
      this.snow.onprocessorerror = onErr; this.wind.onprocessorerror = onErr;
      this.snow.port.onmessage = (e) => { if (e.data?.squeak) this.count('squeak'); };
      // field textures for the snow worklet's granular layer (mono, high-passed, RMS-normalised)
      if (this.loadBuffer) await Promise.all([['ski', 'tex_snow_ski.mp3'], ['board', 'tex_snow_board.mp3'], ['skid', 'tex_snow_skid.mp3']].map(async ([k, n]) => {
        const b = this.buffers[n] || await this.loadBuffer(n).catch(() => null);
        if (b && b.length > 4096) this.snow.port.postMessage({ tex: k, data: prepTexture(b, this.T.snow.tex.rms) });
      }));
    } catch (e) {
      console.warn('[audio] worklet unavailable, using sample loops', e);
      this.worklet = false;
      await this.startLegacy();
    }
    this.grind = new Grind(c, this.fxBus, this.fx, this.T.fx.grind, this.buffers.grind_loop);
    this.amb = new Ambience(c, this.ambBus, this.fx, this.T.ambience, this.T.maps);
    this.lift = new LiftVoice(c, this.ambBus, this.fx, this.T.fx.lift);
    this.breath = new BreathVoice(c, this.fxBus, this.fx, this.T.fx.breath);
    this.others = new OtherRiders(c, this.fxBus, this.fx, this.T.others);
    this.amb.setMap(this.mapId);
    return this;
  }

  async startLegacy() {
    const names = ['snow_powder', 'snow_groomed', 'snow_carve', 'snow_ice', 'wind_speed', 'wind_ambient'];
    if (this.loadBuffer) await Promise.all(names.map(async (n) => { this.buffers[n] ||= await this.loadBuffer(n); }));
    this.legacy = new LegacyLoops(this.ctx, this.snowBus, this.windBus, this.buffers);
  }

  setMap(id) { this.mapId = id || 'default'; this.map = { ...this.T.maps.default, ...(this.T.maps[this.mapId] || {}) }; this.amb?.setMap(this.mapId); }
  setView(v) {
    this.view = v === 'fp' ? 'fp' : 'chase';
    this.fxBus?.gain.setTargetAtTime(this.T.mix.fx * this.T.perspective[this.view].fx, this.ctx.currentTime, 0.2);
  }

  /** Settings volumes (0..1). */
  setVolumes({ master = 0.8, sfx = 0.8, music = 0.6 } = {}, when = this.ctx.currentTime) {
    this.master.gain.setTargetAtTime(master * this.T.mix.preLimiter, when, 0.1);
    this.sfx.gain.setTargetAtTime(sfx, when, 0.1);
    this.music.gain.setTargetAtTime(music, when, 0.1);
  }

  /**
   * One frame of rider state. r: readRider() output. o: { paused, menu, slow (time scale) }
   */
  frame(r, when, dt, o = {}) {
    const T = this.T, S = T.snow, map = this.map || (this.setMap(this.mapId), this.map);
    const persp = T.perspective[this.view];
    const quiet = o.paused || o.menu;
    const slow = o.slow ?? 1;
    this.slow = slow;
    const rate = 0.55 + 0.45 * slow;
    const ground = !quiet && (r.st === ST.GROUND || (r.st === ST.CRASH && r.speed > 1.5)) ? (r.st === ST.CRASH ? 0.8 : 1) : 0;
    const air = !quiet && r.st === ST.AIR ? sstep(0.04, 0.25, r.air) : 0;
    // ---- snow
    const edge = clamp(r.edge / 1.0, 0, 1);
    const skid = Math.max(sstep(S.skid.from, S.skid.full, r.skid), r.skidAmt * 0.85 * sstep(0.03, 0.2, r.skid));
    const park = map.park ? r.groomed : 0;
    const ice = clamp(r.rock, 0, 1);
    const chatter = clamp((ice * 1.0 + (r.groomed + park) * 0.18) * sstep(0.45, 0.85, edge) * sstep(8, 22, r.speed) + ice * skid * 0.6, 0, 1);
    const sink = clamp(r.sink / 0.25, 0, 1);
    const powder = r.powder * (0.5 + 0.5 * Math.max(r.deep, r.powder));
    const snowParams = {
      speed: r.speed, ground, edge, load: r.load, skid: skid + clamp(r.butter, 0, 1) * 0.15, stop: r.stop, groomed: r.groomed - park, powder, ice, park,
      sink, board: r.board, chatter, cold: map.cold, rate, low: persp.snowLow, gain: persp.snow,
    };
    // ---- wind (relative airspeed ≈ rider speed; the crash tumble keeps some)
    const spin = air ? Math.abs(r.spin) + Math.abs(r.flip) : 0;
    const windParams = {
      v: quiet ? 0 : r.speed, air, buffet: persp.buffet, whistle: persp.whistle, flap: persp.flap, rush: 1, spin, tuck: r.tuck,
      ambient: (o.menu ? 0.6 : 1) * map.wind, ambF: map.windF, gusty: map.gustiness, rate, gain: persp.wind * (o.paused ? 0.5 : 1),
    };
    if (this.worklet) {
      for (const k in snowParams) this.setP(this.sp, 's' + k, k, snowParams[k], when);
      for (const k in windParams) this.setP(this.wp, 'w' + k, k, windParams[k], when);
    } else this.legacy?.update(when, snowParams, windParams);
    // ---- transients from state changes
    if (!quiet) this.transients(r, when, edge, powder);
    // ---- grind
    this.grind.update(when, r.st === ST.GRIND && !quiet ? r.grindV : 0, r.grindKind, r.grindHop, r.board);
    // ---- ambience
    this.amb.update(when, dt, { riding: !o.menu, speed: r.speed });
    this.lift.update(when, dt, r.st === ST.LIFT && !o.menu);
    if (!quiet) this.breath.update(when, dt, r, persp.breath);
    if (this.breath.n) this.stats.events.breath = this.breath.n;
    if (this.amb.paN) this.stats.events.pa = this.amb.paN;
    // ---- music duck
    this.crashT -= dt;
    const D = T.duck;
    let duck = 0;
    if (r.st === ST.AIR && r.air > D.airAfter) duck = Math.min(duck, D.airDb);
    if (this.crashT > 0) duck = Math.min(duck, D.crashDb);
    duck = Math.min(duck, D.speedDb * sstep(D.speedFrom, D.speedFull, r.speed));
    if (r.st === ST.GRIND) duck = Math.min(duck, D.grindDb);
    if (this.landDuckT > 0) { this.landDuckT -= dt; duck = Math.min(duck, D.landDb); }
    if (Math.abs(duck - this.duckDb) > 0.1) {
      this.duck.gain.setTargetAtTime(T.mix.music * dbToGain(duck), when, duck < this.duckDb ? D.attack : D.release);
      this.duckDb = duck;
    }
    // music low-pass: muffled in big air, dark on a bail, opens on landing
    let lp = 20000;
    if (r.st === ST.AIR && r.air > D.airLpAfter) lp = D.airLp;
    if (this.crashT > 0) lp = D.crashLp;
    if (lp !== this.musicLpF) {
      this.musicLP.frequency.setTargetAtTime(lp, when, lp < (this.musicLpF ?? 20000) ? (this.crashT > 0 ? 0.04 : 0.12) : D.lpRelease);
      this.musicLpF = lp;
    }
    this.last = { r, edge, powder };
  }

  transients(r, when, edge, powder) {
    const F = this.T.fx, prev = this.last?.r;
    const grounded = r.st === ST.GROUND;
    // edge change: the edge sign flips with real edge angle on both sides of it
    if (grounded && r.edgeSign !== 0 && edge > 0.18) {
      if (this.edgeSide && r.edgeSign !== this.edgeSide && r.speed > F.edgeChange.minSpeed && when - this.lastEdgeT > F.edgeChange.minGap) {
        this.lastEdgeT = when;
        this.fx.edgeChange(when, clamp(r.speed / 14, 0.4, 1.2) * (0.6 + edge * 0.6), r.board, powder);
        // deep powder: snow flies up into the face / goggles at the turn
        const FS = F.faceShot;
        if (powder > FS.powder && r.sink > FS.sink && r.speed > FS.minSpeed && when - (this.lastFace ?? -9) > FS.minGap) {
          this.lastFace = when;
          this.fx.faceShot(when + 0.08, clamp(r.speed / 12, 0.6, 1.3) * this.T.perspective[this.view].face);
          this.count('faceShot');
        }
        // skis: plant the pole on the inside of the new turn just as it starts
        const P = F.poleplant;
        if (!r.board && r.speed > P.minSpeed && r.speed < P.maxSpeed && r.tuck < 0.4 && when - this.lastPole > P.minGap && Math.random() < P.chance) {
          this.lastPole = when;
          this.fx.poleplant(when - 0.02, clamp(r.speed / 12, 0.5, 1.1), r.edgeSign > 0 ? 0.35 : -0.35);
          this.count('poleplant');
        }
        this.count('edgeChange');
      }
      this.edgeSide = r.edgeSign;
    }
    // grabs
    if (r.st === ST.AIR && r.grab > 0.5 && !this.grabbing) { this.grabbing = true; this.fx.grab(when); this.count('grab'); }
    if (this.grabbing && (r.grab < 0.25 || r.st !== ST.AIR)) { this.grabbing = false; if (r.st === ST.AIR) this.fx.grab(when, true); }
    if (prev && prev.st !== ST.CRASH && r.st === ST.CRASH) this.crashT = this.T.duck.crashHold;
    // slash: the edge bites hard and fast while sliding a little → an exaggerated fan of spray (Steep does this)
    const SL = F.slash;
    if (grounded && prev && r.speed > SL.minSpeed && edge > SL.edge && this.last.edge < SL.edge - 0.02 && r.skid > SL.skid && when - (this.lastSlash ?? -9) > SL.minGap) {
      this.lastSlash = when;
      this.fx.slash(when, clamp(r.speed / 14, 0.5, 1.3) * (0.6 + r.skid), r.board, powder, r.edgeSign);
      this.count('slash');
    }
  }

  /** Bus events (state.js) → one-shots. d: the event payload (+ pan / speed added by the caller). */
  event(name, d = {}, when = this.ctx.currentTime) {
    const r = this.last?.r, powder = this.last?.powder ?? 0, board = r?.board ?? 0;
    this.count(name);
    switch (name) {
      case 'takeoff': this.fx.takeoff(when, 1, board, powder, r?.speed ?? 10); break;
      case 'jumped': if (d.late) this.fx.takeoff(when, 0.6, board, powder); break;
      case 'landed': {
        const imp = d.rawImpact ?? d.impact ?? 3;
        if (imp > 4) this.landDuckT = 0.35;
        if (imp > 9) { this.breath.jolt(0.2); this.breath.huff(when + 0.05, this.T.fx.breath.gain * 0.8 * this.T.perspective[this.view].breath); }
        this.fx.landing(when, imp, { powder, board });
        if (d.perfect || d.grade === 'stomped') this.amb.cheer(when + 0.25, 1);
        break;
      }
      case 'parkLanding': if (d.clean) this.amb.cheer(when + 0.2, clamp((d.dist ?? 15) / 20, 0.6, 1.3)); break;
      case 'crashed': this.fx.crash(when, 1, powder, board); this.crashT = this.T.duck.crashHold; this.breath.jolt(0.35); this.breath.huff(when + 0.03, this.T.fx.breath.gain * this.T.perspective[this.view].breath); break;
      case 'liftTower': this.lift.tower(when, d.k ?? 1); break;
      case 'gate': if (d.pass && !board) this.fx.gateClack(when, d.side ?? 0); break;
      case 'nearMiss': this.fx.nearMiss(when, { pan: d.pan ?? 0, speed: r?.speed ?? 12, dist: d.dist, kind: d.kind }); break;
      case 'treePass': this.fx.nearMiss(when, { pan: d.pan ?? 0, speed: d.speed ?? r?.speed ?? 10, dist: d.dist, kind: d.kind, gain: this.T.fx.treePass.gain }); break;
      case 'hardBrake': this.fx.hardBrake(when, typeof d === 'number' ? d : d.speed ?? 12, board, powder); break;
      case 'grindStart': this.grind.setKind(d.kind, when, true); this.grind.clank(when, d.kind, 1); break;
      case 'grindKink': this.grind.tick(when, clamp((d.kink ?? 10) / 20, 0.3, 1)); break;
      case 'grindHop': this.grind.popOff(when); break;
      case 'grindEnd': if (d.reason !== 'bail') this.grind.popOff(when); break;
      case 'grindClip': this.grind.clank(when, 'rail', 0.6); break;
      default: break;
    }
  }

  count(name) { this.stats.events[name] = (this.stats.events[name] || 0) + 1; }

  /** Worklet params change only when the value moves (the worklet smooths between blocks). */
  setP(params, key, name, v, when) {
    if (!Number.isFinite(v)) { this.stats.nan = (this.stats.nan || 0) + 1; return; }
    const sent = (this.sent ||= {});
    if (sent[key] !== undefined && Math.abs(sent[key] - v) <= 1e-4 * Math.max(1, Math.abs(v))) return;
    sent[key] = v;
    params.get(name).setValueAtTime(v, when);
  }
}

/**
 * Fallback when AudioWorklet is missing: the old sample loops (assets/audio) blended by the same params.
 */
class LegacyLoops {
  constructor(c, snowOut, windOut, buf) {
    this.c = c; this.L = {};
    const mk = (name, out) => {
      if (!buf[name]) return;
      const g = c.createGain(); g.gain.value = 0; g.connect(out);
      const s = c.createBufferSource(); s.buffer = buf[name]; s.loop = true; s.connect(g); s.start(0, Math.random() * 4);
      this.L[name] = { g, s };
    };
    ['snow_powder', 'snow_groomed', 'snow_carve', 'snow_ice'].forEach((n) => mk(n, snowOut));
    ['wind_speed', 'wind_ambient'].forEach((n) => mk(n, windOut));
  }
  // the snow / wind buses carry +11 dB of make-up for the worklets' low internal level; the loops don't need it
  set(n, v, when, tc = 0.2) { this.L[n]?.g.gain.setTargetAtTime(v * (n.startsWith('wind') ? 0.27 : 0.28), when, tc); }
  update(when, s, w) {
    const sc = sstep(0.4, 2, s.speed) * Math.min(1, 0.3 + 0.7 * s.speed / 20) * s.ground;
    const tot = Math.max(1e-3, s.groomed + s.powder + s.ice + s.park);
    this.set('snow_powder', sc * (s.powder / tot) * 0.85, when);
    this.set('snow_groomed', sc * ((s.groomed + s.park) / tot) * 0.75, when);
    this.set('snow_ice', sc * (s.ice / tot) * 0.7, when);
    this.set('snow_carve', sc * Math.min(1, s.edge + s.skid) * 0.7, when);
    this.set('wind_speed', Math.pow(Math.min(1, w.v / 30), 1.4) * (w.air ? 0.95 : 0.75) * w.gain, when, 0.4);
    this.set('wind_ambient', w.ambient, when, 1.2);
  }
}
