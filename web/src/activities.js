// Things to do on every run:
//   • Golden snowflakes (both modes) — 12 per run, some on the line, some hidden in the trees, some
//     floating above jumps. Found ones stay found (saved per run).
//   • Challenge mode — countdown, run timer, slalom gates (+2 s per missed gate), a style combo
//     (air, spins, landings, carves, close shaves, gates, snowflakes chain into a multiplier),
//     bronze / silver / gold medals by time, and a ghost of your best run to race.
//   • Zen mode — no clock, no gates, no pressure: just the mountain (and the snowflakes).
import * as THREE from 'three';
import { emit, on, game, Mode, addScore } from './state.js';
import { State } from './player.js';
import { toonMaterial, mulberry32 } from './world.js';
import { skierGeometry } from './life.js';

export const CHALLENGE = {
  flakes: 12,
  gateSpacing: [52, 70],         // metres between gates
  gateLateral: [2.5, 6.5],       // metres either side of the line
  gateWidth: 7,
  missPenalty: 2,                // seconds per missed gate
  comboWindow: 2.6,              // seconds to keep a combo alive
  comboStep: 0.25,               // multiplier gained per trick in the chain
  comboMax: 5,
  medalSpeeds: { gold: 11.5, silver: 10, bronze: 8.5 },   // average m/s over the run (incl. penalties)
  ghostHz: 10,
};

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full / private */ } },
};

export function courseKey(course) { return course.meta ? `${course.meta.id}.${course.runIndex ?? 0}` : 'gully'; }
export function bestFor(key) { return store.get(`sendit.best.${key}`, null); }
export function flakesFound(key) { return store.get(`sendit.flakes.${key}`, []).length; }
export function medalFor(time, length) {
  const v = length / Math.max(time, 1);
  const M = CHALLENGE.medalSpeeds;
  return v >= M.gold ? 'gold' : v >= M.silver ? 'silver' : v >= M.bronze ? 'bronze' : null;
}
export function fmtTime(t) {
  if (!isFinite(t)) return '--:--.--';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

// ------------------------------------------------------------------ snowflakes
function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = i % 2 ? 0.2 : 0.5;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1 });
  g.center();
  return g;
}

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,230,140,0.9)'); grad.addColorStop(0.35, 'rgba(255,200,80,0.35)'); grad.addColorStop(1, 'rgba(255,200,80,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// ------------------------------------------------------------------ main
export class Activities {
  constructor({ scene, course, features, terrain, player, fx }) {
    Object.assign(this, { scene, course, features, terrain, player, fx });
    this.key = courseKey(course);
    this.group = new THREE.Group();
    this.group.name = 'Activities';
    scene.add(this.group);
    this.mode = 'zen';
    this.state = 'idle';            // challenge: idle | countdown | running | finished
    this.buildFlakes();
    this.buildGates();
    this.buildGhost();
    on('score', (e) => this.onScore(e));
    on('crashed', () => this.loseCombo());
    on('resetTop', () => { if (this.mode === 'challenge') this.start('challenge'); });
  }

  // ---------------------------------------------------------------- snowflakes
  buildFlakes() {
    const rnd = mulberry32(hashStr(this.key));
    const f = this.features, T = this.terrain, N = CHALLENGE.flakes;
    this.found = new Set(store.get(`sendit.flakes.${this.key}`, []));
    const geo = starGeometry();
    const mat = toonMaterial({ name: 'flake', color: 0xffcf4a, rim: 1.0, frag: 'toonEmissive = vec3(1.0, 0.72, 0.2) * 0.55;' });
    const halo = new THREE.SpriteMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    this.flakes = [];
    for (let i = 0; i < N; i++) {
      const s = ((i + 0.3 + rnd() * 0.4) / N) * this.course.finishAt * 0.96;
      const { p, dir } = f.at(s);
      const r = new THREE.Vector2(-dir.y, dir.x);
      const kind = i % 3;   // 0 on the line, 1 hidden off the line, 2 in the air over a jump
      let x, z, y;
      const kick = kind === 2 ? f.kickers.find((k) => Math.hypot(k.o.x - p.x, k.o.y - p.y) < 90) : null;
      if (kick) {
        const q = kick.o.clone().addScaledVector(kick.f, kick.L + 6);
        x = q.x; z = q.y; y = T.getHeight(x, z) + kick.H + 2.4;
      } else {
        const lat = kind === 1 ? (rnd() < 0.5 ? -1 : 1) * (16 + rnd() * 22) : (rnd() - 0.5) * 8;
        x = p.x + r.x * lat; z = p.y + r.y * lat; y = T.getHeight(x, z) + 1.2;
      }
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      const glow = new THREE.Sprite(halo);
      glow.scale.setScalar(2.4);
      m.add(glow);
      m.visible = !this.found.has(i);
      this.group.add(m);
      this.flakes.push({ i, m, base: y, phase: rnd() * 6 });
    }
    this.runFlakes = 0;
  }

  // ---------------------------------------------------------------- gates (challenge only)
  buildGates() {
    const rnd = mulberry32(hashStr(this.key) + 7);
    const f = this.features, T = this.terrain, C = CHALLENGE;
    this.gates = [];
    const avoid = [...(this.course.dropsAt || []), ...f.kickers.map((k) => this.course.progress ? -1 : -1)];
    let side = 1;
    for (let s = 80; s < this.course.finishAt - 50; s += C.gateSpacing[0] + rnd() * (C.gateSpacing[1] - C.gateSpacing[0])) {
      if (avoid.some((d) => d > 0 && Math.abs(d - s) < 25)) continue;
      const { p, dir } = f.at(s);
      if (f.kickers.some((k) => Math.hypot(k.o.x - p.x, k.o.y - p.y) < 22)) continue;
      const r = new THREE.Vector2(-dir.y, dir.x);
      const lat = side * (C.gateLateral[0] + rnd() * (C.gateLateral[1] - C.gateLateral[0]));
      side = -side;
      const c = p.clone().addScaledVector(r, lat);
      this.gates.push({ s, c, r, color: this.gates.length % 2 ? 'blue' : 'red' });
    }
    // Two poles with panels per gate, instanced.
    const poleG = new THREE.CylinderGeometry(0.035, 0.04, 1.9, 6); poleG.translate(0, 0.95, 0);
    const panelG = new THREE.PlaneGeometry(0.75, 0.55); panelG.translate(0.375, 1.5, 0);
    const poleM = toonMaterial({ name: 'gatePole', color: 0xf2f2f2 });
    const red = toonMaterial({ name: 'gateRed', color: 0xff3b5c, side: THREE.DoubleSide, frag: 'toonEmissive = vec3(0.35, 0.03, 0.08);' });
    const blue = toonMaterial({ name: 'gateBlue', color: 0x2b7bff, side: THREE.DoubleSide, frag: 'toonEmissive = vec3(0.03, 0.12, 0.4);' });
    const n = this.gates.length * 2;
    this.gatePoles = new THREE.InstancedMesh(poleG, poleM, Math.max(1, n));
    this.gateRed = new THREE.InstancedMesh(panelG, red, Math.max(1, n));
    this.gateBlue = new THREE.InstancedMesh(panelG, blue, Math.max(1, n));
    let nr = 0, nb = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
    this.gates.forEach((g, i) => {
      const yaw = Math.atan2(-g.r.y, g.r.x);
      for (const sd of [-1, 1]) {
        const x = g.c.x + g.r.x * sd * C.gateWidth / 2, z = g.c.y + g.r.y * sd * C.gateWidth / 2;
        const y = T.getHeight(x, z) - 0.1;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + (sd > 0 ? Math.PI : 0));
        m.compose(new THREE.Vector3(x, y, z), q, one);
        this.gatePoles.setMatrixAt(i * 2 + (sd > 0 ? 1 : 0), m);
        if (g.color === 'red') this.gateRed.setMatrixAt(nr++, m); else this.gateBlue.setMatrixAt(nb++, m);
      }
    });
    this.gatePoles.count = n; this.gateRed.count = nr; this.gateBlue.count = nb;
    for (const im of [this.gatePoles, this.gateRed, this.gateBlue]) { im.castShadow = true; im.computeBoundingSphere(); this.group.add(im); }
    this.setGatesVisible(false);
  }

  setGatesVisible(v) { for (const im of [this.gatePoles, this.gateRed, this.gateBlue]) im.visible = v; }

  // ---------------------------------------------------------------- ghost
  buildGhost() {
    const g = skierGeometry('#9ff6ff', '#9ff6ff', '#ffffff', '#9ff6ff');
    const mat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghost = new THREE.Mesh(g, mat);
    this.ghost.visible = false;
    this.ghost.renderOrder = 4;
    this.group.add(this.ghost);
    this.bestGhost = store.get(`sendit.ghost.${this.key}`, null);
  }

  // ---------------------------------------------------------------- run lifecycle
  start(mode) {
    this.mode = mode;
    this.setGatesVisible(mode === 'challenge');
    this.ghost.visible = false;
    this.runFlakes = 0;
    if (mode !== 'challenge') { this.state = 'idle'; emit('activity', { type: 'zen' }); return; }
    this.state = 'countdown';
    this.count = 3.6;
    this.lastCount = 4;
    this.time = 0;
    this.penalty = 0;
    this.nextGate = 0;
    this.gatesPassed = 0;
    this.lastProg = 0;
    this.runScore = 0;
    this.combo = { pts: 0, n: 0, t: 0 };
    this.rec = [];
    this.recT = 0;
    this.bestGhost = store.get(`sendit.ghost.${this.key}`, null);
    this.player.state = State.FROZEN;
    emit('activity', { type: 'challenge', gates: this.gates.length });
  }

  update(dt) {
    const pl = this.player;
    // Snowflakes: spin, bob, collect.
    const t = performance.now() / 1000;
    for (const fl of this.flakes) {
      if (!fl.m.visible && !fl.taken) continue;
      if (fl.taken) {
        fl.taken -= dt;
        fl.m.scale.setScalar(Math.max(0.01, fl.taken * 3));
        fl.m.position.y += dt * 3;
        if (fl.taken <= 0) { fl.taken = 0; fl.m.visible = false; }
        continue;
      }
      fl.m.rotation.y = t * 1.6 + fl.phase;
      fl.m.position.y = fl.base + Math.sin(t * 2 + fl.phase) * 0.15;
      const dx = pl.renderPos.x - fl.m.position.x, dz = pl.renderPos.z - fl.m.position.z, dy = pl.renderPos.y + 0.9 - fl.m.position.y;
      if (dx * dx + dz * dz < 2.6 && Math.abs(dy) < 1.9 && pl.state !== State.FROZEN && pl.state !== State.CRASH) this.collect(fl);
    }
    // Carve chains: a committed carve held at speed scores when you release or switch edges.
    if (pl.state === State.GROUNDED) {
      const dirNow = Math.abs(pl.turnInput) > 0.55 && pl.speed > 6 ? Math.sign(pl.turnInput) : 0;
      if (dirNow && dirNow === this._carveDir) this._carveT = (this._carveT || 0) + dt;
      else {
        if ((this._carveT || 0) > 0.7) addScore(dirNow ? 'Linked carve' : 'Carve', 15 + Math.round(this._carveT * 12));
        this._carveT = 0;
        this._carveDir = dirNow;
      }
    } else this._carveT = 0;
    if (this.mode !== 'challenge') return;
    if (this.state === 'countdown') {
      this.count -= dt;
      const n = Math.ceil(this.count - 0.6);
      if (n !== this.lastCount && n >= 0) { this.lastCount = n; emit('countdown', n); }
      if (this.count <= 0.6) { this.state = 'running'; pl.state = State.GROUNDED; }
      return;
    }
    if (this.state !== 'running') return;
    if (game.mode === Mode.RIDING) this.time += dt;
    // Gates: judged when the rider passes each gate's spot on the line.
    const prog = this.course.progress(pl.position.x, pl.position.z);
    if (prog >= 0) {
      while (this.nextGate < this.gates.length && prog >= this.gates[this.nextGate].s) {
        const g = this.gates[this.nextGate++];
        const off = Math.abs((pl.position.x - g.c.x) * g.r.x + (pl.position.z - g.c.y) * g.r.y);
        if (off <= CHALLENGE.gateWidth / 2 + 0.6) { this.gatesPassed++; emit('gate', { pass: true, color: g.color }); addScore('Gate', 20); }
        else { this.penalty += CHALLENGE.missPenalty; emit('gate', { pass: false }); }
      }
      this.lastProg = prog;
    }
    // Combo timeout → bank.
    if (this.combo.n > 0) { this.combo.t -= dt; if (this.combo.t <= 0) this.bankCombo(); }
    // Ghost: record ours, replay the best.
    this.recT -= dt;
    if (this.recT <= 0) {
      this.recT += 1 / CHALLENGE.ghostHz;
      const p = pl.renderPos;
      this.rec.push(+this.time.toFixed(2), +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +pl.heading.toFixed(3));
    }
    this.playGhost(this.time);
  }

  playGhost(t) {
    const G = this.bestGhost?.frames;
    if (!G || G.length < 10) { this.ghost.visible = false; return; }
    const n = G.length / 5;
    let i = this._gi || 0;
    if (i >= n - 1 || G[i * 5] > t) i = 0;
    while (i < n - 2 && G[(i + 1) * 5] < t) i++;
    this._gi = i;
    if (t > G[(n - 1) * 5]) { this.ghost.visible = false; return; }
    const a = i * 5, b = (i + 1) * 5;
    const k = Math.min(1, Math.max(0, (t - G[a]) / Math.max(1e-3, G[b] - G[a])));
    this.ghost.position.set(G[a + 1] + (G[b + 1] - G[a + 1]) * k, G[a + 2] + (G[b + 2] - G[a + 2]) * k, G[a + 3] + (G[b + 3] - G[a + 3]) * k);
    let dh = G[b + 4] - G[a + 4];
    if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    this.ghost.rotation.set(0, G[a + 4] + dh * k, 0);
    this.ghost.visible = this.ghost.position.distanceToSquared(this.player.renderPos) > 1.2;
  }

  collect(fl) {
    this.found.add(fl.i);
    store.set(`sendit.flakes.${this.key}`, [...this.found]);
    fl.taken = 0.35;
    this.runFlakes++;
    this.fx?.burst(fl.m.position, 30, 3, 0.8, 0.25);
    emit('flake', { found: this.found.size, total: this.flakes.length });
    addScore('Snowflake', 100);
  }

  // ---------------------------------------------------------------- style combo
  onScore({ points }) {
    if (this.mode !== 'challenge' || this.state !== 'running') return;
    this.combo.pts += points;
    this.combo.n += 1;
    this.combo.t = CHALLENGE.comboWindow;
    emit('combo', this.comboState());
  }
  comboState() { return { mult: Math.min(CHALLENGE.comboMax, 1 + (this.combo.n - 1) * CHALLENGE.comboStep), pts: this.combo.pts, n: this.combo.n }; }
  bankCombo() {
    if (!this.combo.n) return;
    const { mult, pts } = this.comboState();
    const banked = Math.round(pts * mult);
    this.runScore += banked;
    this.combo = { pts: 0, n: 0, t: 0 };
    emit('comboBanked', { banked, mult, total: this.runScore });
  }
  loseCombo() {
    if (this.mode !== 'challenge' || !this.combo?.n) return;
    this.combo = { pts: 0, n: 0, t: 0 };
    emit('comboLost');
  }

  // ---------------------------------------------------------------- finish
  finish() {
    if (this.state !== 'running') return null;
    this.bankCombo();
    this.state = 'finished';
    const total = this.time + this.penalty;
    const length = this.course.finishAt;
    const medal = medalFor(total, length);
    const prev = bestFor(this.key);
    const isBestTime = !prev || total < prev.time;
    const best = {
      time: isBestTime ? total : prev.time,
      score: Math.max(prev?.score || 0, this.runScore),
      medal: [prev?.medal, medal].sort((a, b) => rank(b) - rank(a))[0] || null,
    };
    store.set(`sendit.best.${this.key}`, best);
    if (isBestTime) store.set(`sendit.ghost.${this.key}`, { time: total, frames: this.rec });
    const res = {
      time: total, raw: this.time, penalty: this.penalty, medal, best, isBestTime, isBestScore: this.runScore >= best.score && this.runScore > 0,
      score: this.runScore, gates: this.gatesPassed, gateTotal: this.gates.length, flakes: this.found.size, flakeTotal: this.flakes.length,
      targets: Object.fromEntries(Object.entries(CHALLENGE.medalSpeeds).map(([k, v]) => [k, length / v])),
    };
    emit('runFinished', res);
    return res;
  }

  /** HUD numbers. */
  hud() {
    return {
      mode: this.mode, state: this.state, time: (this.time || 0) + (this.penalty || 0), penalty: this.penalty || 0,
      gates: this.gatesPassed || 0, gateTotal: this.gates.length, nextGate: this.nextGate || 0,
      flakes: this.found.size, flakeTotal: this.flakes.length, combo: this.combo?.n ? this.comboState() : null, score: this.runScore || 0,
      best: bestFor(this.key),
    };
  }
}

function rank(m) { return { gold: 3, silver: 2, bronze: 1 }[m] || 0; }
