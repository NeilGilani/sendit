// Records scripted rides on the real physics (no browser) as audio-parameter traces for the headless audio
// test (web/scripts/audio-test.mjs): every 1/60 s the rider fields audio reads (speed, edge, skid, load,
// surface, sink, spin / flip rates, grab…) plus the bus events (jumped, landed, crashed…).
// Usage: node web/scripts/audio-trace.mjs [outDir] [seconds]   → <outDir>/trace-ski.json, trace-snowboard.json
// Prints per-field ranges so the audio curves (web/src/audio/tuning.js) can be checked against real values.
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
globalThis.addEventListener = () => {};
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const THREE = await import('three');
const { Player, State } = await import('../src/player.js');
const { Course } = await import('../src/course.js');
const { game, Mode, on } = await import('../src/state.js');
const { readRider } = await import('../src/audio/rider.js');
const { RAVENSPIRE_PHYSICS } = await import('../src/maps/ravenspire/tuning.js');
game.mode = Mode.RIDING;

const outDir = process.argv[2] || '.';
const secs = Number(process.argv[3] || 50);
mkdirSync(outDir, { recursive: true });

const course = new Course();
const P = course.P, N = P.tileRes, SP = P.tileSize / (N - 1), HALF = P.tileSize / 2;
const cache = new Map();
const gridH = (i, j) => { const k = j * N + i; let v = cache.get(k); if (v === undefined) { v = course.height(-HALF + i * SP, -HALF + j * SP); cache.set(k, v); } return v; };
const terrain = {
  half: HALF, spacing: SP,
  getHeight(x, z) { const fx = (x + HALF) / SP, fz = (z + HALF) / SP, i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j; return (gridH(i, j) * (1 - tx) + gridH(i + 1, j) * tx) * (1 - tz) + (gridH(i, j + 1) * (1 - tx) + gridH(i + 1, j + 1) * tx) * tz; },
  getNormal(x, z, r = 0, out = new THREE.Vector3()) { const e = Math.max(r, SP); return out.set(this.getHeight(x - e, z) - this.getHeight(x + e, z), 2 * e, this.getHeight(x, z - e) - this.getHeight(x, z + e)).normalize(); },
  // Groomed down the middle, powder off to the sides (so the trace crosses both).
  getSurface: (x, z, out = new THREE.Vector4()) => { const c = course.centre(course.tAt(z)); const g = Math.max(0, Math.min(1, 1 - (Math.abs(x - c.x) - 10) / 14)); return out.set(g, 1 - g, 0, 0); },
  getSpawn() { const s = course.centre(12); return { position: new THREE.Vector3(s.x, s.y, s.z), heading: s.heading }; },
};

const EVENTS = ['jumped', 'takeoff', 'landed', 'crashed', 'nearMiss', 'hardBrake', 'stumble', 'landingGrade', 'grindStart', 'grindEnd', 'respawned'];

function ride(type) {
  const p = new Player(terrain, null, null, { strength: () => 0, justPressed: () => false });
  p.fadeThen = (fn) => fn();
  p.setEquipment(type);
  p.startRiding();
  const frames = [], events = [];
  let t = 0;
  const offs = EVENTS.map((name) => on(name, (d) => events.push({ t, name, d: plain(d) })));
  // Script: carve linked turns, tuck straights, a hockey stop, pops with spins and grabs, a drift to the powder.
  p.script = (c) => {
    const ph = t % 24;
    c.steer = Math.sin((t * 2 * Math.PI) / 2.8) * (ph < 8 ? 1 : 0.55);
    c.tuck = ph >= 8 && ph < 11 ? 1 : 0;
    c.brake = ph >= 11 && ph < 12.4 ? 1 : 0;
    c.jump = (ph > 14 && ph < 14.45) || (ph > 19 && ph < 19.4);
    if (p.state === State.AIR) { c.steer = ph < 17 ? 1 : -1; c.tuck = p.airTime > 0.2 ? 1 : 0; c.up = ph > 19 ? 1 : 0; }
  };
  for (let i = 0; i < secs * 60; i++) {
    p.step(1 / 60);
    t += 1 / 60;
    const ctr = course.centre(course.tAt(p.position.z));
    if (Math.abs(p.position.x - ctr.x) > 45) { p.position.x = ctr.x + Math.sign(p.position.x - ctr.x) * 45; p.position.y = terrain.getHeight(p.position.x, p.position.z); }
    if (course.tAt(p.position.z) > P.finishT) p.startRiding();
    frames.push(readRider(p, {}));
  }
  offs.forEach((f) => f());
  return { type, dt: 1 / 60, frames, events };
}

function plain(d) {
  if (d === null || typeof d !== 'object') return d;
  const o = {};
  for (const [k, v] of Object.entries(d)) if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) o[k] = v;
  return o;
}

// Big-mountain speed: a 32° plane with Ravenspire's physics, mixed snow, long tucked arcs (≈ 25–30 m/s).
function bigMountain(type) {
  const g = Math.tan(38 * Math.PI / 180);
  const T = {
    half: 1e6, spacing: 1, course: { physics: RAVENSPIRE_PHYSICS },
    getHeight: (x) => -g * x, baseHeight: (x) => -g * x,
    getNormal: (x, z, r, out = new THREE.Vector3()) => out.set(g, 1, 0).normalize(),
    getSurface: (x, z, out = new THREE.Vector4()) => { const k = 0.5 + 0.5 * Math.sin(x * 0.01); return out.set(0.5 * k, 0.5 * (1 - k) + 0.2, 0.3 * k, 0); },
    isInside: () => true,
    getSpawn: () => ({ position: new THREE.Vector3(), heading: -Math.PI / 2 }),
  };
  const p = new Player(T, null, null, { strength: () => 0, justPressed: () => false });
  p.setEquipment(type); p.fadeThen = () => {}; p.flow?.dispose(); p.flow = null;
  p.place(new THREE.Vector3(0, 0, 0), -Math.PI / 2);
  const frames = [], events = [];
  let t = 0;
  const offs = EVENTS.map((name) => on(name, (d) => events.push({ t, name, d: plain(d) })));
  p.script = (c) => { c.steer = Math.sin((t * 2 * Math.PI) / 6) * 0.12; c.tuck = t % 25 < 20 ? 1 : 0; c.brake = t % 25 > 24 ? 1 : 0; };
  for (let i = 0; i < secs * 60; i++) { p.step(1 / 60); t += 1 / 60; frames.push(readRider(p, {})); }
  offs.forEach((f) => f());
  return { type, dt: 1 / 60, frames, events };
}

for (const type of ['bigmountain']) {
  const tr = bigMountain('ski');
  writeFileSync(join(outDir, `trace-${type}.json`), JSON.stringify(tr));
  const v = tr.frames.map((f) => f.speed).sort((a, b) => a - b);
  console.log(`
${type}: speed p50 ${v[v.length >> 1].toFixed(1)} max ${v[v.length - 1].toFixed(1)} m/s`);
}

for (const type of ['ski', 'snowboard']) {
  const tr = ride(type);
  writeFileSync(join(outDir, `trace-${type}.json`), JSON.stringify(tr));
  const keys = Object.keys(tr.frames[0]).filter((k) => typeof tr.frames[0][k] === 'number');
  console.log(`\n${type}: ${tr.frames.length} frames, ${tr.events.length} events (${[...new Set(tr.events.map((e) => e.name))].join(', ')})`);
  for (const k of keys) {
    const v = tr.frames.map((f) => f[k]).sort((a, b) => a - b), q = (x) => v[Math.floor(x * (v.length - 1))];
    console.log(`  ${k.padEnd(10)} min ${q(0).toFixed(2).padStart(7)}  p50 ${q(0.5).toFixed(2).padStart(7)}  p90 ${q(0.9).toFixed(2).padStart(7)}  max ${q(1).toFixed(2).padStart(7)}`);
  }
}
