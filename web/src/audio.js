// Soft layered soundscape with WebAudio: powder hiss, groomed swish and edge carve blended by
// surface, speed and turning; ambient + speed wind; landing thumps; distant birds; and calm music
// that loops seamlessly and breathes in and out. Nothing pops — every gain glides.
import * as THREE from 'three';
import { State } from './player.js';
import { game, Mode, on, settings } from './state.js';

const LOOPS = ['snow_powder', 'snow_groomed', 'snow_carve', 'wind_speed', 'wind_ambient'];

export class SoundScape {
  constructor(skier, terrain) {
    this.skier = skier; this.terrain = terrain;
    this.ready = false;
    this.layers = {};
    this.musicRest = 0;
    this.birdTimer = 6;
  }

  async init() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    const c = this.ctx;
    this.master = c.createGain(); this.master.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.connect(this.master);
    this.musicBus = c.createGain(); this.musicBus.connect(this.master);
    this.applyVolumes();
    on('settings', () => this.applyVolumes());
    const names = [...LOOPS, 'music_golden_hour', 'music_upbeat', 'land_soft', 'bird_1', 'bird_2', 'bird_3', 'bird_4'];
    const bufs = await Promise.all(names.map((n) => this.load(n)));
    this.buf = Object.fromEntries(names.map((n, i) => [n, bufs[i]]));
    for (const n of LOOPS) {
      const g = c.createGain(); g.gain.value = 0; g.connect(this.sfx);
      const src = c.createBufferSource(); src.buffer = this.buf[n]; src.loop = true; src.connect(g);
      src.start(0, Math.random() * 4);
      this.layers[n] = { gain: g, src, level: 0 };
    }
    this.musicGain = c.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.musicBus);
    const m = c.createBufferSource(); m.buffer = this.buf.music_golden_hour; m.loop = true; m.connect(this.musicGain); m.start();
    // Challenge runs get the upbeat track; Zen keeps the calm one.
    this.upbeatGain = c.createGain(); this.upbeatGain.gain.value = 0; this.upbeatGain.connect(this.musicBus);
    const u = c.createBufferSource(); u.buffer = this.buf.music_upbeat; u.loop = true; u.connect(this.upbeatGain); u.start();
    this.track = 'zen';
    this.upLevel = 0;
    // Sugar crunch: a procedural granular layer — fine crystalline grains under the powder hiss.
    const sr = c.sampleRate, len = sr * 2, sugar = c.createBuffer(1, len, sr), d = sugar.getChannelData(0);
    let lp = 0, env = 0, next = 0;
    for (let i = 0; i < len; i++) {
      if (i >= next) { env = 0.5 + Math.random() * 0.5; next = i + Math.floor(sr * (0.004 + Math.random() * 0.018)); }
      env *= 0.9965;
      lp += (Math.random() * 2 - 1 - lp) * 0.55;
      d[i] = lp * env;
    }
    const sg = c.createGain(); sg.gain.value = 0;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 0.7;
    const ss = c.createBufferSource(); ss.buffer = sugar; ss.loop = true; ss.connect(bp); bp.connect(sg); sg.connect(this.sfx); ss.start();
    this.layers.sugar = { gain: sg, src: ss, level: 0 };
    this.sugarFilter = bp;
    on('activity', ({ type }) => { this.track = type; });
    on('countdown', (n) => this.oneShot(n > 0 ? 'count_beep' : 'count_go', 0.6, 1));
    on('gate', ({ pass }) => (pass ? this.oneShot('gate', 0.5, 0.95 + Math.random() * 0.1) : this.oneShot('combo_lost', 0.5, 0.8)));
    on('flake', () => { this.oneShot('token', 0.7, 1); this.chime(); });
    on('comboBanked', ({ mult }) => this.oneShot('combo_bank', 0.5, 0.9 + Math.min(mult, 5) * 0.06));
    on('comboLost', () => this.oneShot('combo_lost', 0.45, 1));
    on('runFinished', ({ medal }) => { this.oneShot('medal', 0.8, medal === 'gold' ? 1.12 : medal === 'silver' ? 1 : 0.9); });
    on('treePlop', () => this.plop());
    on('uiMove', () => this.oneShot('ui_click', 0.25, 1.1));
    this.musicStart = c.currentTime;
    this.musicLevel = 0;
    this.lastLoop = 0;
    this.birdPanner = c.createPanner();
    this.birdPanner.panningModel = 'HRTF';
    this.birdPanner.distanceModel = 'inverse';
    this.birdPanner.refDistance = 25;
    this.birdPanner.maxDistance = 400;
    const bg = c.createGain(); bg.gain.value = 0.35;
    this.birdPanner.connect(bg); bg.connect(this.sfx);
    on('landed', ({ impact, perfect }) => {
      if (impact > 0.8) this.oneShot(impact > 7 ? 'land_hard' : 'land_soft', Math.min(0.9, Math.max(0.2, impact / 10)), 0.92 + Math.random() * 0.16);
      if (perfect) this.oneShot('perfect', 0.6, 1);
    });
    on('crashed', () => this.oneShot('crash', 0.8, 1));
    // A board's tail slap pops lower than a skier's hop.
    on('jumped', (d) => this.oneShot('jump_pop', 0.4 + d * 0.5, (this.skier.equipment?.type === 'snowboard' ? 0.78 : 0.95) + Math.random() * 0.15));
    on('nearMiss', () => this.oneShot('near_miss', 0.55, 0.95 + Math.random() * 0.2));
    on('stumble', () => this.oneShot('combo_lost', 0.4, 1.2));
    on('hardBrake', () => this.oneShot('boost', 0.25, 0.7));
    on('score', ({ points }) => { if (points >= 60) this.oneShot('combo_tick', 0.35, 1 + Math.min(points, 400) / 400); });
    this.ready = true;
  }

  async load(name) {
    for (const ext of ['ogg', 'mp3']) {
      try {
        const r = await fetch(`/audio/${name}.${ext}`);
        if (!r.ok) continue;
        return await this.ctx.decodeAudioData(await r.arrayBuffer());
      } catch { /* try next format */ }
    }
    return this.ctx.createBuffer(2, 4410, 44100);
  }

  resume() { this.ctx?.state === 'suspended' && this.ctx.resume(); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(settings.master, t, 0.1);
    this.sfx.gain.setTargetAtTime(settings.sfx, t, 0.1);
    this.musicBus.gain.setTargetAtTime(settings.music, t, 0.1);
  }

  set(name, target, tc = 0.25) {
    const L = this.layers[name];
    if (Math.abs(L.level - target) < 0.002) return;
    L.level = target;
    L.gain.gain.setTargetAtTime(target, this.ctx.currentTime, tc);
  }

  async oneShot(name, gain, rate) {
    if (!this.ctx) return;
    this.extra = this.extra || {};
    if (!this.extra[name]) this.extra[name] = this.load(name);
    const buf = await this.extra[name];
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.sfx); src.start();
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

  /** Snow clump sliding off a branch: a soft low thud. */
  plop() {
    const c = this.ctx, t = c.currentTime, sr = c.sampleRate;
    const b = c.createBuffer(1, Math.floor(sr * 0.4), sr), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (sr * 0.07));
    const src = c.createBufferSource(); src.buffer = b;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = c.createGain(); g.gain.value = 0.55;
    src.connect(lp); lp.connect(g); g.connect(this.sfx); src.start(t);
  }

  thump(gain, rate) {
    const c = this.ctx;
    const src = c.createBufferSource(); src.buffer = this.buf.land_soft; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(this.sfx); src.start();
  }

  update(dt, camera) {
    if (!this.ready) return;
    const s = this.skier, c = this.ctx;
    const paused = game.mode === Mode.PAUSED, menu = game.mode === Mode.MENU;
    let speed = 0, grounded = false, turn = 0, air = false;
    const surf = s.surface;
    if (!menu) {
      speed = s.state === State.LIFT ? 0 : s.speed;
      grounded = s.state === State.GROUNDED || s.state === State.CRASH;
      turn = Math.min(1, Math.abs(s.carve) * 0.7 + s.skid * 0.6);
      air = s.state === State.AIR;
    }
    const s01 = Math.min(1, speed / 15);
    const moving = smooth(0.4, 5, speed);
    const onSnow = grounded && !paused ? 1 : 0;
    const level = moving * (0.3 + 0.7 * s01) * onSnow;
    const soft = surf.y + surf.w * 0.8, hard = surf.x + surf.z * 0.5, norm = Math.max(soft + hard, 0.001);
    this.set('snow_powder', level * (soft / norm) * 0.85, 0.2);
    this.set('snow_groomed', level * (hard / norm) * 0.75, 0.2);
    this.set('snow_carve', onSnow * moving * turn * (0.25 + 0.75 * s01) * 0.7, 0.25);
    this.set('wind_speed', paused ? 0 : Math.pow(s01, 1.4) * (air ? 0.95 : 0.75), 0.4);
    this.set('wind_ambient', paused ? 0.18 : 0.32, 1.2);
    // Sugar crunch: louder in deep, soft snow and when sinking in; brighter with speed and carving.
    const deep = menu ? 0 : Math.min(1, (s.powder ?? soft) * (0.5 + (s.sink || 0) * 3));
    this.set('sugar', level * deep * (0.35 + turn * 0.6) * 0.9, 0.15);
    this.sugarFilter.frequency.setTargetAtTime(1800 + 2200 * s01 + turn * 1200, c.currentTime, 0.2);
    this.layers.snow_powder.src.playbackRate.setTargetAtTime(0.92 + 0.2 * s01, c.currentTime, 0.3);
    this.layers.snow_groomed.src.playbackRate.setTargetAtTime(0.9 + 0.25 * s01, c.currentTime, 0.3);
    this.layers.wind_speed.src.playbackRate.setTargetAtTime(0.85 + 0.35 * s01, c.currentTime, 0.5);
    // Edge sound: a board's single wide edge growls lower; slide / hockey stops scrape brighter.
    const board = s.equipment?.type === 'snowboard';
    this.layers.snow_carve.src.playbackRate.setTargetAtTime((board ? 0.8 : 1.0) + 0.15 * s01 + (s.stop || 0) * 0.18, c.currentTime, 0.2);

    // Music: seamless loop that sometimes rests quietly between passes.
    const dur = this.buf.music_golden_hour.duration;
    const loopIdx = Math.floor((c.currentTime - this.musicStart) / dur);
    if (loopIdx !== this.lastLoop) { this.lastLoop = loopIdx; if (Math.random() < 0.35) this.musicRest = 25 + Math.random() * 25; }
    let target = paused ? 0.5 : 0.85;
    if (this.musicRest > 0) { this.musicRest -= dt; target = 0; }
    const rate = target > this.musicLevel ? 0.25 : 0.18;
    this.musicLevel += Math.sign(target - this.musicLevel) * Math.min(Math.abs(target - this.musicLevel), rate * dt);
    const up = this.track === 'challenge' && !menu ? 1 : 0;
    this.upLevel += (up - this.upLevel) * Math.min(1, dt * 0.8);
    this.musicGain.gain.setTargetAtTime(this.musicLevel ** 1.6 * (1 - this.upLevel), c.currentTime, 0.1);
    this.upbeatGain.gain.setTargetAtTime((paused ? 0.45 : 0.75) * this.upLevel, c.currentTime, 0.1);

    // Listener follows the camera.
    const L = c.listener, p = camera.position, f = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    if (L.positionX) {
      L.positionX.value = p.x; L.positionY.value = p.y; L.positionZ.value = p.z;
      L.forwardX.value = f.x; L.forwardY.value = f.y; L.forwardZ.value = f.z;
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, 0, 1, 0); }

    if (!menu && !paused) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        const chance = s.position.y < 2600 ? 1 : 0.45;
        this.birdTimer = (7 + Math.random() * 15) / chance;
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

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
