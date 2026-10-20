// The game's soundscape: the live wrapper around the audio engine (audio/engine.js). Each frame it reads
// the rider (audio/rider.js) and feeds the procedural snow / wind worklets, grinds and ambience; bus
// events become one-shots; the music (calm Zen track / upbeat challenge track, resting between passes)
// is ducked under big moments by the engine. Tunables: audio/tuning.js · docs/audio.md.
// Public API (main.js): new SoundScape(player, terrain) · init() · resume() · oneShot(name, gain, rate) ·
// update(dt, camera) · applyVolumes().
import * as THREE from 'three';
import { game, Mode, on, settings } from './state.js';
import { AudioEngine } from './audio/engine.js';
import { readRider } from './audio/rider.js';
import { assetUrl } from './base.js';
import { urlParams } from './flags.js';

const BUFFERS = ['music_golden_hour', 'music_upbeat', 'bird_1', 'bird_2', 'bird_3', 'bird_4', 'grind_loop', 'jump_pop'];
const _f = new THREE.Vector3();

export class SoundScape {
  constructor(skier, terrain) {
    this.skier = skier; this.terrain = terrain;
    this.ready = false;
    this.musicRest = 0;
    this.birdTimer = 6;
    this.mapId = null;
    on('rideStarted', ({ mapId }) => { this.mapId = mapId; this.engine?.setMap(mapId); });
  }

  async init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    const c = this.ctx;
    window.__senditAudio = this;   // debug handle; also tells the park HUD that grinds are handled here
    const bufs = await Promise.all(BUFFERS.map((n) => this.load(n)));
    this.buf = Object.fromEntries(BUFFERS.map((n, i) => [n, bufs[i]]));
    this.engine = await new AudioEngine(c, { buffers: this.buf, load: (n) => this.load(n) }).init();   // load: the no-worklet fallback's loops
    this.engine.setMap(this.mapId || window.__sendit?.map?.map?.id || 'default');
    this.sfx = this.engine.uiBus;   // game cues (gates, tokens, medals…) and main.js UI clicks
    this.applyVolumes();
    on('settings', () => this.applyVolumes());
    // music: the calm track and the challenge / flow track, crossfaded; the engine's duck sits after both
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.engine.duck);
    const m = c.createBufferSource(); m.buffer = this.buf.music_golden_hour; m.loop = true; m.connect(this.musicGain); m.start();
    this.upbeatGain = c.createGain(); this.upbeatGain.gain.value = 0; this.upbeatGain.connect(this.engine.duck);
    const u = c.createBufferSource(); u.buffer = this.buf.music_upbeat; u.loop = true; u.connect(this.upbeatGain); u.start();
    this.track = 'zen';
    this.upLevel = 0;
    this.musicStart = c.currentTime;
    this.musicLevel = 0;
    this.lastLoop = 0;
    this.birdPanner = c.createPanner();
    this.birdPanner.panningModel = 'HRTF';
    this.birdPanner.distanceModel = 'inverse';
    this.birdPanner.refDistance = 25;
    this.birdPanner.maxDistance = 400;
    const bg = c.createGain(); bg.gain.value = 0.35;
    this.birdPanner.connect(bg); bg.connect(this.engine.ambBus);

    // ---- game cues (UI bus)
    on('activity', ({ type }) => { this.track = type; });
    on('countdown', (n) => this.oneShot(n > 0 ? 'count_beep' : 'count_go', 0.6, 1));
    on('gate', ({ pass }) => (pass ? this.oneShot('gate', 0.5, 0.95 + Math.random() * 0.1) : this.oneShot('combo_lost', 0.5, 0.8)));
    on('flake', () => { this.oneShot('token', 0.7, 1); this.chime(); });
    on('comboBanked', ({ mult }) => this.oneShot('combo_bank', 0.5, 0.9 + Math.min(mult, 5) * 0.06));
    on('comboLost', () => this.oneShot('combo_lost', 0.45, 1));
    on('runFinished', ({ medal }) => { this.oneShot('medal', 0.8, medal === 'gold' ? 1.12 : medal === 'silver' ? 1 : 0.9); });
    on('treePlop', (p) => this.plop(p));
    on('uiMove', () => this.oneShot('ui_click', 0.25, 1.1));
    on('landed', ({ perfect }) => { if (perfect) this.oneShot('perfect', 0.5, 1); });
    on('flowState', ({ on: st }) => { this.flowOn = st; if (st) { this.oneShot('boost', 0.6, 1); this.oneShot('whoosh_slow', 0.45, 1.3); } });
    on('flowBanked', ({ bonus, mult }) => { if (bonus) this.oneShot('combo_bank', 0.55, 0.9 + Math.min(mult, 5) * 0.05); });
    on('flowLost', () => this.oneShot('combo_lost', 0.45, 0.9));
    on('slowmo', ({ scale }) => { this.slow = scale; });   // apex slow motion: wind and snow drop in pitch
    on('heliDrop', () => this.heli());   // a map's heli-drop intro (maps/ravenspire/props.js)
    on('ravenCaw', (p) => this.caw(p));   // ravens around a map's summit
    on('landingGrade', ({ grade }) => { if (grade === 'stomped') this.oneShot('boost', 0.3, 1.25); });   // the stomp boost
    on('lineGoal', () => { this.oneShot('medal', 0.7, 1.05); this.chime(); });
    on('stumble', () => this.oneShot('combo_lost', 0.2, 1.2));   // the game cue, softer: the engine plays the stumble itself
    on('score', ({ points }) => { if (points >= 60) this.oneShot('combo_tick', 0.3, 1 + Math.min(points, 400) / 400); });
    // A board's tail pop sits lower than a skier's hop (sample under the engine's synthesized take-off).
    on('jumped', (d) => this.oneShot('jump_pop', 0.18 + d * 0.25, (this.skier.equipment?.type === 'snowboard' ? 0.78 : 0.95) + Math.random() * 0.15, this.engine.fxBus));
    // ---- the rider's sounds (engine one-shots)
    const E = (name, fn) => on(name, (d) => { if (game.mode !== Mode.MENU) this.engine.event(name, fn ? fn(d) : d, c.currentTime); });
    E('takeoff'); E('landed'); E('crashed'); E('hardBrake'); E('parkLanding'); E('landingGrade');
    E('grindStart'); E('grindKink'); E('grindHop'); E('grindEnd'); E('grindClip');
    E('nearMiss', (d) => ({ ...d, pan: this.sideOf(d.x, d.z) }));
    E('gate'); E('liftBoarded'); E('liftArrived'); E('stumble'); E('fjordSplash'); E('ragdollImpact');   // fjordSplash: the Fjordline map (another branch)
    on('rideStarted', ({ equipment }) => this.engine.event('rideStarted', { board: equipment === 'snowboard' ? 1 : 0 }, c.currentTime));
    on('crashed', () => this.oneShot('crash', 0.3, 1, this.engine.fxBus));
    if (typeof location !== 'undefined' && urlParams().has('audiodebug')) this.mountDebug();
    this.ready = true;
  }

  /** ?audiodebug: a small live read-out of what the engine is being fed (for tuning by ear). */
  mountDebug() {
    const el = document.createElement('pre');
    el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;margin:0;padding:6px 8px;font:11px/1.35 ui-monospace,monospace;color:#cfe;background:rgba(0,10,20,.72);border-radius:6px;pointer-events:none;white-space:pre';
    document.body.appendChild(el);
    this.debugEl = el; this.debugT = 0;
  }

  drawDebug(dt) {
    if (!this.debugEl || (this.debugT -= dt) > 0) return;
    this.debugT = 0.2;
    const e = this.engine, s = e.dbg?.snowParams, w = e.dbg?.windParams;
    if (!s) return;
    const f = (x) => (Number.isFinite(x) ? x.toFixed(2) : String(x));
    const ev = Object.entries(e.stats.events).slice(-8).map(([k, v]) => `${k} ${v}`).join(' · ');
    this.debugEl.textContent = [
      `audio · ${e.mapId} · ${e.view} · ${e.worklet ? 'worklet' : 'loops'}${e.stats.workletError ? ' · DSP ERROR' : ''}`,
      `snow  v ${f(s.speed)} m/s  edge ${f(s.edge)}  load ${f(s.load)}  skid ${f(s.skid)}  stop ${f(s.stop)}  board ${s.board}`,
      `      groomed ${f(s.groomed)}  powder ${f(s.powder)}  ice ${f(s.ice)}  park ${f(s.park)}  sink ${f(s.sink)}  chatter ${f(s.chatter)}`,
      `wind  v ${f(w.v)}  air ${f(w.air)}  spin ${f(w.spin)}  tuck ${f(w.tuck)}  ambient ${f(w.ambient)}`,
      `mix   music duck ${f(e.duckDb)} dB  lp ${Math.round(e.musicLpF ?? 20000)} Hz  camera ×${f(e.distK ?? 1)}  energy ${e.energy === undefined ? '–' : f(e.energy)}`,
      `events ${ev}`,
    ].join('\n');
  }

  /** −1 (obstacle on the rider's left) … 1 (right), from the travel direction. */
  sideOf(x, z) {
    const s = this.skier, v = s.velocity, l = Math.hypot(v.x, v.z) || 1, dx = x - s.position.x, dz = z - s.position.z;
    const d = Math.hypot(dx, dz) || 1;
    return Math.max(-1, Math.min(1, ((-v.z / l) * dx + (v.x / l) * dz) / d));
  }

  /**
   * Trees and rocks passing within a few metres (scatter.nearest, read-only): a soft pass-by whoosh, so riding
   * through the forest sounds like it. Closer, faster shaves are the scored 'nearMiss' (louder).
   */
  treePasses(s, when) {
    const P = this.engine.T.fx.treePass;
    if (!s.scatter?.nearest || s.state !== 1 || s.speed < P.minSpeed) return;
    const n = s.scatter.nearest(s.position, P.radius);
    if (!n || n.o === this.lastTree) return;
    this.lastTree = n.o;
    if (s.speed >= 11 && n.dist < 3.2) return;   // that one is a scored near miss (its own, louder whoosh)
    if (when - (this.lastTreeT ?? -9) < P.minGap) return;   // dense forest: no storm of whooshes
    this.lastTreeT = when;
    this.engine.event('treePass', { pan: this.sideOf(n.o[0], n.o[1]), dist: n.dist, kind: n.o[3], speed: s.speed }, when);
  }

  /** Riding a lift: a sheave-train rattle each time the chair passes a tower (lifts.js supports). */
  liftTowers(s, when) {
    const L = s.state === 4 ? s._lift : null;
    if (!L || L !== this.lastLift) { this.lastLift = L; this.lastLiftD = s._liftD ?? 0; return; }
    const d = s._liftD ?? 0;
    for (const sup of L.supports || []) if (!sup.station && sup.d > this.lastLiftD && sup.d <= d) this.engine.event('liftTower', {}, when);
    this.lastLiftD = d;
  }

  async load(name) {
    for (const ext of name.includes('.') ? [''] : ['.ogg', '.mp3']) {   // a name with an extension loads just that file
      try {
        const r = await fetch(assetUrl(`audio/${name}${ext}`));
        if (!r.ok) continue;
        return await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* try next format */ }
    }
    return this.ctx.createBuffer(2, 4410, 44100);
  }

  /**
   * Optional hooks for the game-feel layer (juice/music.js): music energy 0..1 lifts the upbeat track (with
   * hysteresis and a minimum hold) and opens the music's tone; a drop is a riser, a dip and a hit.
   */
  setMusicEnergy(level) {
    if (!this.engine) return;
    const now = this.ctx.currentTime;
    this.engine.setMusicEnergy(level);
    if (!this.lifted && level > 0.62) { this.lifted = true; this.liftUntil = now + 8; }
    else if (this.lifted && level < 0.4 && now > this.liftUntil) this.lifted = false;
  }

  musicDrop(kind, strength = 1) {
    if (!this.engine) return;
    const now = this.ctx.currentTime, k = Math.min(1.2, Math.max(0.3, strength));
    if (now - (this.lastDrop ?? -9) < 2.5) return;
    this.lastDrop = now;
    this.engine.musicDrop(now, k);
    this.oneShot('boost', this.engine.T.fx.drop.hit * k, kind === 'levelUp' ? 1.2 : 1.05, this.engine.uiBus, now + this.engine.T.duck.dropTime);
  }

  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }

  applyVolumes() {
    if (!this.engine) return;
    this.engine.setVolumes(settings);
    this.engine.setView(settings.view);
  }

  async oneShot(name, gain, rate, out, when = 0) {
    if (!this.ctx) return;
    this.extra = this.extra || {};
    if (!this.extra[name]) this.extra[name] = this.buf?.[name] ? Promise.resolve(this.buf[name]) : this.load(name);
    const buf = await this.extra[name];
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(out || this.sfx || this.ctx.destination); src.start(when);
  }

  /** Soft pentatonic sparkle (snowflake pickup). */
  chime() {
    const c = this.ctx, t = c.currentTime;
    [0, 4, 7, 12].forEach((semi, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = 880 * Math.pow(2, semi / 12);
      g.gain.setValueAtTime(0, t + i * 0.06); g.gain.linearRampToValueAtTime(0.12, t + i * 0.06 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + i * 0.06 + 0.6);
      o.connect(g); g.connect(this.sfx); o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.65);
    });
  }

  /** A raven's call: two or three hoarse 'kraa's (a buzzy saw tone with a falling pitch through a
   *  nasal band-pass), placed in 3D at the bird. */
  caw(p) {
    const c = this.ctx;
    if (!c) return;
    const pan = c.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 40; pan.maxDistance = 900;
    if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
    const out = c.createGain(); out.gain.value = 0.5;
    pan.connect(out); out.connect(this.engine.ambBus);
    const n = 2 + Math.floor(Math.random() * 2), base = 330 + Math.random() * 80;
    for (let i = 0; i < n; i++) {
      const t = c.currentTime + i * (0.32 + Math.random() * 0.08), d = 0.2 + Math.random() * 0.06;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(base * 1.25, t); o.frequency.exponentialRampToValueAtTime(base * 0.8, t + d);
      const am = c.createOscillator(); am.frequency.value = 55 + Math.random() * 20;   // the rasp
      const amG = c.createGain(); amG.gain.value = 0.35; am.connect(amG);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150; bp.Q.value = 2.5;
      const g = c.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + d);
      amG.connect(g.gain);
      o.connect(bp); bp.connect(g); g.connect(pan);
      o.start(t); am.start(t); o.stop(t + d + 0.05); am.stop(t + d + 0.05);
    }
  }

  /** Helicopter leaving after the drop: rotor 'whup' pulses (noise through a low-pass, gated at ~6 Hz)
   * that fade and drop in pitch as it flies away. */
  heli() {
    const c = this.ctx;
    if (!c) return;
    const t = c.currentTime, sr = c.sampleRate;
    const b = c.createBuffer(1, sr * 2, sr), d = b.getChannelData(0);
    let lp = 0;
    for (let i = 0; i < d.length; i++) { lp += (Math.random() * 2 - 1 - lp) * 0.2; d[i] = lp; }
    const src = c.createBufferSource(); src.buffer = b; src.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 520; f.Q.value = 2;
    const gate = c.createGain(); gate.gain.value = 0;
    const lfo = c.createOscillator(); lfo.type = 'square'; lfo.frequency.setValueAtTime(6.4, t); lfo.frequency.linearRampToValueAtTime(5.6, t + 10);
    const lfoAmp = c.createGain(); lfoAmp.gain.value = 0.5;
    lfo.connect(lfoAmp); lfoAmp.connect(gate.gain);
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t); out.gain.linearRampToValueAtTime(0.9, t + 0.2);
    out.gain.setValueAtTime(0.9, t + 1.4); out.gain.exponentialRampToValueAtTime(0.0005, t + 11);
    f.frequency.setValueAtTime(520, t + 1.2); f.frequency.exponentialRampToValueAtTime(180, t + 11);
    src.connect(f); f.connect(gate); gate.connect(out); out.connect(this.engine.ambBus);
    const off = c.createConstantSource ? c.createConstantSource() : null;
    if (off) { off.offset.value = 0.5; off.connect(gate.gain); off.start(t); off.stop(t + 11.5); }
    src.start(t); lfo.start(t); src.stop(t + 11.5); lfo.stop(t + 11.5);
  }

  /** Snow clump sliding off a branch: it sifts down through the needles (a CC0 recording shows a 1–2 s hiss at
   *  2–10 kHz), then lands with a soft low thud — placed toward the tree. */
  plop(p) {
    const c = this.ctx, sr = c.sampleRate, pan = p && this.skier ? this.sideOf(p.x, p.z) * 0.7 : 0;
    this.engine.fx.noise(c.currentTime, { buf: 'pink', type: 'highpass', f: 2200, q: 0.6, gain: 0.07, attack: 0.25, hold: 0.2, decay: 0.9, pan, out: this.engine.ambBus });
    const t = c.currentTime + 0.35 + Math.random() * 0.25;
    const b = c.createBuffer(1, Math.floor(sr * 0.4), sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.07));
    const src = c.createBufferSource(); src.buffer = b;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.55;
    const dst = c.createStereoPanner ? c.createStereoPanner() : null;
    if (dst) { dst.pan.value = pan; dst.connect(this.engine.ambBus); }
    src.connect(lp); lp.connect(g); g.connect(dst || this.engine.ambBus); src.start(t);
  }

  update(dt, camera) {
    if (!this.ready) return;
    const s = this.skier, c = this.ctx;
    const paused = game.mode === Mode.PAUSED, menu = game.mode === Mode.MENU;
    if (settings.view !== this.engine.view && (settings.view === 'fp') !== (this.engine.view === 'fp')) this.engine.setView(settings.view);
    const camDist = camera.position.distanceTo(s.renderPos ?? s.position);
    // exposure: how high the rider is between the lowest and highest points seen (summits are windier)
    if (!menu && s.position) { this.yHi = Math.max(this.yHi ?? -1e9, s.position.y); this.yLo = Math.min(this.yLo ?? 1e9, s.position.y); }
    const exposure = this.yHi - this.yLo > 80 ? (s.position.y - this.yLo) / (this.yHi - this.yLo) : 0.5;
    this.engine.frame(readRider(s, { menu }), c.currentTime, dt, { paused, menu, slow: this.slow ?? 1, camDist, exposure });
    this.liftTowers(s, c.currentTime);
    this.drawDebug(dt);
    if (!menu && !paused) this.treePasses(s, c.currentTime);
    if (!this.engine.amb.lodge) this.engine.amb.setLodge(window.__sendit?.life?.lodge?.position);
    this.engine.others.update(c.currentTime, window.__sendit?.life?.skiers, camera.position, !menu && !paused);   // other skiers swishing by

    // Music: seamless loop that sometimes rests quietly between passes.
    const dur = this.buf.music_golden_hour.duration;
    const loopIdx = Math.floor((c.currentTime - this.musicStart) / dur);
    if (loopIdx !== this.lastLoop) { this.lastLoop = loopIdx; if (Math.random() < 0.35) this.musicRest = 25 + Math.random() * 25; }
    let target = paused ? 0.5 : 0.85;
    if (this.musicRest > 0) { this.musicRest -= dt; target = 0; }
    const rate = target > this.musicLevel ? 0.25 : 0.18;
    this.musicLevel += Math.sign(target - this.musicLevel) * Math.min(Math.abs(target - this.musicLevel), rate * dt);
    const up = (this.track === 'challenge' || this.flowOn || this.lifted) && !menu ? 1 : 0;   // the SEND IT flow state (or high music energy) lifts the music too
    this.upLevel += (up - this.upLevel) * Math.min(1, dt * 0.8);
    this.musicGain.gain.setTargetAtTime(this.musicLevel ** 1.6 * (1 - this.upLevel), c.currentTime, 0.1);
    this.upbeatGain.gain.setTargetAtTime((paused ? 0.45 : 0.75) * this.upLevel, c.currentTime, 0.1);

    // Listener follows the camera.
    const L = c.listener, p = camera.position, f = _f.set(0, 0, -1).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }

    if (!menu && !paused) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        const chance = (s.position.y < 2600 ? 1 : 0.45) * (this.engine.map?.birds ?? 1);
        this.birdTimer = (7 + Math.random() * 15) / Math.max(0.05, chance);
        const a = Math.random() * Math.PI * 2, r = 40 + Math.random() * 100;
        const bx = s.position.x + Math.cos(a) * r, bz = s.position.z + Math.sin(a) * r;
        const by = this.terrain.getHeight(bx, bz) + 4 + Math.random() * 20;
        if (this.birdPanner.positionX) { this.birdPanner.positionX.value = bx; this.birdPanner.positionY.value = by; this.birdPanner.positionZ.value = bz; }
        else this.birdPanner.setPosition(bx, by, bz);
        const src = c.createBufferSource();
        src.buffer = this.buf[`bird_${1 + Math.floor(Math.random() * 4)}`];
        src.playbackRate.value = 0.92 + Math.random() * 0.16;
        src.connect(this.birdPanner); src.start();
      }
    }
  }
}
