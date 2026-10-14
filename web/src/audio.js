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
    const names = [...LOOPS, 'music_golden_hour', 'land_soft', 'bird_1', 'bird_2', 'bird_3', 'bird_4'];
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
    on('jumped', (d) => this.oneShot('jump_pop', 0.4 + d * 0.5, 0.95 + Math.random() * 0.15));
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
    const s01 = Math.min(1, speed / 20);
    const moving = smooth(0.4, 5, speed);
    const onSnow = grounded && !paused ? 1 : 0;
    const level = moving * (0.3 + 0.7 * s01) * onSnow;
    const soft = surf.y + surf.w * 0.8, hard = surf.x + surf.z * 0.5, norm = Math.max(soft + hard, 0.001);
    this.set('snow_powder', level * (soft / norm) * 0.85, 0.2);
    this.set('snow_groomed', level * (hard / norm) * 0.75, 0.2);
    this.set('snow_carve', onSnow * moving * turn * (0.25 + 0.75 * s01) * 0.7, 0.25);
    this.set('wind_speed', paused ? 0 : Math.pow(s01, 1.4) * (air ? 0.95 : 0.75), 0.4);
    this.set('wind_ambient', paused ? 0.18 : 0.32, 1.2);
    this.layers.snow_powder.src.playbackRate.setTargetAtTime(0.92 + 0.2 * s01, c.currentTime, 0.3);
    this.layers.snow_groomed.src.playbackRate.setTargetAtTime(0.9 + 0.25 * s01, c.currentTime, 0.3);
    this.layers.wind_speed.src.playbackRate.setTargetAtTime(0.85 + 0.35 * s01, c.currentTime, 0.5);

    // Music: seamless loop that sometimes rests quietly between passes.
    const dur = this.buf.music_golden_hour.duration;
    const loopIdx = Math.floor((c.currentTime - this.musicStart) / dur);
    if (loopIdx !== this.lastLoop) { this.lastLoop = loopIdx; if (Math.random() < 0.35) this.musicRest = 25 + Math.random() * 25; }
    let target = paused ? 0.5 : 0.85;
    if (this.musicRest > 0) { this.musicRest -= dt; target = 0; }
    const rate = target > this.musicLevel ? 0.25 : 0.18;
    this.musicLevel += Math.sign(target - this.musicLevel) * Math.min(Math.abs(target - this.musicLevel), rate * dt);
    this.musicGain.gain.setTargetAtTime(this.musicLevel ** 1.6, c.currentTime, 0.1);

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
