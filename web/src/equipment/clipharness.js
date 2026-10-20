// Rider ↔ gear penetration harness (dev only; driven by scripts/gear-clip.mjs, opened at
// /src/equipment/clipharness.html). Poses the real Rider rig (rider.js + character/ + equipment/)
// through every riding / air / grab pose of the game and through the loading screen's hero-shot
// choreography (loading/choreo.js), CPU-skins every garment and boot vertex and measures how far it sits
// inside the skis / board:
//   body   garment vertices (jacket, pants, hem, thighs, butt, arms) below the gear's top surface inside its
//          footprint: depth = the smaller of (top − y) and the distance to the nearest edge (cm)
//   hand   mitt vertices inside the gear's volume (a hand on the edge is fine, through the deck is not)
//   sunk   boot sole below its seat (ski binding plate / board baseplate) on its own ski or the board
//   base   boot below the gear's base (poking out of the far side, visible from below)
// Results: window.__clip.run(opts) → { rows: [{ name, gear, body, hand, sunk, base, worst }], frames }.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Rider } from '../rider.js';
import { Player, State } from '../player.js';
import { PHYSICS } from '../config.js';
import { makeHeight } from '../loading/terrain.js';
import { pickVariant, rng, tricksFor, TRICKS } from '../loading/variants.js';
import { Shot } from '../loading/choreo.js';
import { patchShaderChunks } from '../world.js';
import { classify, measure, CLASS } from './clipmeasure.js';
import { prepare as prepGarments, measureGarments } from './garmentclip.js';

patchShaderChunks();

const DT = 1 / 60;
const flat = { getHeight: () => 0, getNormal: (_x, _z, _r, o = new THREE.Vector3()) => o.set(0, 1, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
const noInput = { strength: () => 0, justPressed: () => false, key: () => false };
const fxStub = { spray() {}, takeoff() {}, landing() {}, slash() {} };

const _v = new THREE.Vector3();

// ------------------------------------------------------------------ rendering (contact sheet)
let renderer = null, scene = null;
function setupRender(w, h) {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8d99a8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
  const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 5, 3); scene.add(d);
}
const cam = new THREE.PerspectiveCamera(32, 1.2, 0.05, 50);
/** Views in the gear frame (board / left ski): side at deck level, from below, 3/4 front, chase. */
function snap(rider, views, label, w, h) {
  setupRender(w, h);
  rider.root.updateMatrixWorld(true);
  const ref = rider.board || rider.skis[0];
  const gm = rider.board ? rider.board.matrixWorld : rider.visual.matrixWorld;
  const c = rider.bones.pelvis.getWorldPosition(new THREE.Vector3()).lerp(new THREE.Vector3().setFromMatrixPosition(ref.matrixWorld), 0.5);
  const up = new THREE.Vector3(0, 1, 0).transformDirection(gm);
  const fwd = new THREE.Vector3(0, 0, -1).transformDirection(gm);
  const right = new THREE.Vector3(1, 0, 0).transformDirection(gm);
  const imgs = [];
  for (const v of views) {
    const look = c.clone();
    let p;
    // (the board's long axis is fwd; for a board the rider faces `right` side or the other)
    // side: profile (board: along its length → toe / heel and the butt over the heel edge; skis: from the right)
    if (v === 'side') p = look.clone().addScaledVector(rider.board ? fwd : right, 3.4).addScaledVector(up, 0.15);
    else if (v === 'side2') p = look.clone().addScaledVector(rider.board ? right : fwd, rider.board ? -3.4 : 3.4).addScaledVector(up, 0.2);
    else if (v === 'below') p = look.clone().addScaledVector(up, -2.4).addScaledVector(rider.board ? right : fwd, -1.3).addScaledVector(rider.board ? fwd : right, 1.0);
    else if (v === 'front') p = look.clone().addScaledVector(fwd, 2.6).addScaledVector(right, 1.6).addScaledVector(up, 0.7);
    else if ('csh'.includes(v[0]) && v.length > 2) {
      // Close-ups in the rider's own frame: c… torso, s… right shoulder / armpit, h… front hem; then
      // front, q34, side (the rider's right), q34b, back, left. E.g. cfront, sq34, hside.
      const L = rider.bones.thigh_l.getWorldPosition(new THREE.Vector3()).sub(rider.bones.thigh_r.getWorldPosition(new THREE.Vector3()));
      L.y = 0; L.normalize();
      const F = new THREE.Vector3().crossVectors(L, new THREE.Vector3(0, 1, 0));
      const W = (n) => rider.bones[n].getWorldPosition(new THREE.Vector3());
      const k = v[0], dist = { c: 1.55, s: 0.95, h: 1.05 }[k];
      if (k === 'c') look.copy(W('spine_01')).add(new THREE.Vector3(0, 0.02, 0));
      else if (k === 's') look.copy(W('spine_03')).lerp(W('upperarm_r'), 0.75).add(new THREE.Vector3(0, -0.06, 0));
      else look.copy(W('pelvis')).lerp(W('thigh_r'), 0.3).add(new THREE.Vector3(0, -0.05, 0));
      const yaw = { front: 0, q34: -45, side: -90, q34b: -135, back: 180, left: 90 }[v.slice(1)] * Math.PI / 180;
      const d = F.clone().multiplyScalar(Math.cos(yaw)).addScaledVector(L, Math.sin(yaw));
      p = look.clone().addScaledVector(d, dist).add(new THREE.Vector3(0, k === 'c' ? 0.12 : 0.05, 0));
    }
    else p = look.clone().addScaledVector(fwd, -3.6).addScaledVector(up, 1.2);   // chase
    cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.copy(p); cam.up.copy('csh'.includes(v[0]) && v.length > 2 ? new THREE.Vector3(0, 1, 0) : up); cam.lookAt(look);
    scene.add(rider.root);
    renderer.render(scene, cam);
    scene.remove(rider.root);
    imgs.push(renderer.domElement.toDataURL('image/jpeg', 0.85));
  }
  void ref;
  const cell = document.createElement('div');
  cell.style.cssText = 'display:flex;flex-direction:column;background:#000;';
  const t = document.createElement('div'); t.textContent = label; t.style.cssText = 'padding:2px 4px;white-space:nowrap;font-size:11px';
  const row = document.createElement('div'); row.style.display = 'flex';
  for (const s of imgs) { const im = new Image(); im.src = s; im.width = w; im.height = h; row.appendChild(im); }
  cell.appendChild(t); cell.appendChild(row);
  document.getElementById('sheet').appendChild(cell);
}

// ------------------------------------------------------------------ rider + poses
let rider = null, pl = null, meshes = null;
let fitKey = '';
async function ensureRider(gear, variant, stance, fit = null) {
  if (!rider) {
    pl = new Player(flat, { findObstacle: () => null, nearest: () => null }, null, noInput);
    pl.setEquipment(gear, variant);
    pl.place(new THREE.Vector3(0, 0, 0), 0);
    pl.state = State.GROUNDED;
    rider = new Rider(pl);
    await rider.load(new GLTFLoader());
    meshes = classify(rider);
  }
  pl.stance = stance;
  pl.setEquipment(gear, variant);
  if (gear === 'snowboard') pl.setStance(stance);
  rider.buildEquipment(pl.equipment.type, pl.equipment.spec, stance);
  // Outfit fit: [jacket, pants, gloves] garment ids (character/outfits.js), default = the default kit.
  const k = JSON.stringify(fit);
  if (k !== fitKey) {
    fitKey = k;
    rider.setOutfit(fit ? { jacket: { garment: fit[0] }, pants: { garment: fit[1] }, gloves: { garment: fit[2] } } : {});
    meshes = classify(rider);
  }
  return rider;
}

function resetPlayer() {
  Object.assign(pl, {
    state: State.GROUNDED, speed: 10, tuck: 0, squat: 0, brake: 0, grab: 0, grabName: null, windup: 0, stumbleT: 0, plow: 0, stop: 0,
    press: 0, butter: 0, travelSign: 1, gearLatAccel: 0, latAccel: 0, edgeAngle: 0, skidAngle: 0, turnInput: 0, spinRate: 0, flipRate: 0,
    flipTuck: 0, spinTuck: 0, flipLoad: 0, sink: 0, powder: 0, flip: 0, renderFlip: 0, simulated: true, liftT: 0, grindTilt: null,
  });
  pl.velocity.set(0, 0, -10);
  pl.renderPos.set(0, 0, 0); pl.renderOrient.identity(); pl.renderBase.identity(); pl.renderTrick.identity();
  pl._ctrl = { steer: 0, brake: 0, up: 0, jump: false, tuck: 0, active: false, airSteer: 0, airUp: 0, airBrake: 0 };
  pl.dyn.takeoff = null;
  pl.dyn.timeToLand = () => 1.5;
  rider.snapT = 10;
  rider.spring.t = 10; rider.spring.amp = 0;
}

const air = (o = {}) => (p) => { p.state = State.AIR; p.simulated = false; p.velocity.set(0, 0, -10); Object.assign(p, o); };
const grab = (name, o = {}) => (p, t) => {
  air(o)(p);
  p.grab = 1; p.grabName = name;
  p.dyn.takeoff = { grabT: t, grab: name };
};
const carve = (side, o = {}) => (p) => { Object.assign(p, { speed: 15, gearLatAccel: 13 * side, latAccel: 13 * side, edgeAngle: 1.0 * side, turnInput: side, ...o }); p._ctrl.steer = side; };

/** Game poses: [name, set(pl, t), seconds to settle]. */
function gamePoses(type) {
  const L = [
    ['stand', (p) => { p.speed = 0; p.velocity.set(0, 0, 0); }, 2.5],
    ['cruise', (p) => { p.speed = 11; }, 1.5],
    ['carve L', carve(-1), 1.5], ['carve R', carve(1), 1.5],
    ['carve L slow', carve(-1, { speed: 7, gearLatAccel: -8 }), 1.5], ['carve R slow', carve(1, { speed: 7, gearLatAccel: 8 }), 1.5],
    ['pre-jump squat', (p) => { p.squat = 1; }, 1.0],
    ['squat + carve', (p) => { carve(1)(p); p.squat = 1; }, 1.0],
    ['press', (p) => { p.press = 1; }, 1.0],
    ['stop', (p) => { p.stop = 1; p.skidAngle = 1.3; p.gearLatAccel = 9; p.speed = 6; }, 1.0],
    ['air', air(), 1.2],
    ['flip tuck', air({ flipRate: 4, flipTuck: 1, flip: 1 }), 1.2],
    ['spin tuck', air({ spinRate: 6, spinTuck: 1 }), 1.2],
    ['cork combo', air({ spinRate: 6, flipRate: 4, flipTuck: 0.8 }), 1.2],
  ];
  // Landing absorption: a hard landing; sampled over the bounce.
  for (const at of [0.03, 0.08, 0.15, 0.3]) L.push([`landing ${at}s`, (p, t, f) => { if (f === 0) { p.landingEvent = (p.landingEvent || 0) + 1; p.landingVy = 14; } p.squat = 0.7 * Math.exp(-t * 2.4); }, at, true]);
  if (type === 'ski') {
    L.push(['tuck', (p) => { p.tuck = 1; p.speed = 22; }, 2.0]);
    L.push(['plow', (p) => { p.plow = 1; p.speed = 3; }, 1.0]);
    L.push(['push', (p) => { p.speed = 2; p._ctrl.up = 1; }, 1.2]);
    for (const g of ['Safety', 'Mute', 'Japan', 'Tail grab', 'Truck driver']) {
      L.push([`grab ${g}`, grab(g), 0.3]);
      L.push([`grab ${g} tweak`, grab(g), 1.4, false, true]);
      L.push([`grab ${g} + flip`, grab(g, { flipRate: 3.5, flipTuck: 0.6 }), 1.4, false, true]);
    }
  } else {
    L.push(['skate', (p) => { p.speed = 2; p._ctrl.up = 1; }, 1.2]);
    L.push(['heel carve deep', carve(-1, { speed: 16, gearLatAccel: -15 }), 1.5]);
    L.push(['toe carve deep', carve(1, { speed: 16, gearLatAccel: 15 }), 1.5]);
    L.push(['nose press', (p) => { p.press = -1; }, 1.0]);
    for (const g of ['Indy', 'Melon', 'Nose grab', 'Tail grab']) {
      L.push([`grab ${g}`, grab(g), 0.3]);
      L.push([`grab ${g} tweak`, grab(g), 1.4, false, true]);
      L.push([`grab ${g} + spin`, grab(g, { spinRate: 6 }), 1.4, false, true]);
    }
  }
  L.push(['chairlift', (p) => { p.state = State.LIFT; p.liftT = 0.5; p.speed = 0; }, 2.0]);
  L.push(['grind grab', (p) => { p.state = State.GRIND; p.grab = 1; p.grabName = type === 'ski' ? 'Safety' : 'Indy'; p.grindTilt = { pitch: 0.3, roll: 0.3, travel: 0, slide: false }; }, 1.0]);
  return L;
}

async function runGame({ gear, variant, stance = 'regular', fit = null, shots = false, views = ['side', 'below', 'front'], w = 240, h = 200, only = null }) {
  await ensureRider(gear, variant, stance, fit);
  const rows = [];
  for (const [name, set, secs, , style] of gamePoses(gear)) {
    if (only && !only.some((o) => name.includes(o))) continue;
    PHYSICS.trickStyle = !!style;
    resetPlayer();
    // Settle from a neutral cruise first (the smoothing starts from a real riding pose).
    for (let f = 0; f < 30; f++) rider.update(DT, null);
    const n = Math.max(1, Math.round(secs / DT));
    for (let f = 0; f < n; f++) { set(pl, f * DT, f); rider.update(DT, null); }
    const m = measure(rider, meshes);
    rows.push({ name, gear: `${gear}/${variant}${gear === 'snowboard' ? '/' + stance : ''}${fit ? ' ' + fit.join('+') : ''}`, ...m, miss: (rider.reachMiss || 0) * 100, worst: Math.max(m.body, m.hand, m.sunk, m.base, m.gap) });
    if (shots) snap(rider, views, `${gear} ${variant} ${name}  body ${m.body.toFixed(1)} hand ${m.hand.toFixed(1)} sunk ${m.sunk.toFixed(1)} base ${m.base.toFixed(1)} gap ${m.gap.toFixed(1)} cm`, w, h);
  }
  PHYSICS.trickStyle = false;
  return rows;
}

/** The loading screen's hero shots: every trick for the gear, the whole shot, every frame measured. */
async function runLoading({ gear, variant, stance = 'regular', fit = null, seeds = [1, 2], shots = false, views = ['side', 'below', 'front'], w = 240, h = 200, tricks = null }) {
  await ensureRider(gear, variant, stance, fit);
  PHYSICS.trickStyle = true;   // the loading worker turns it on (tweaked grabs)
  const rows = [];
  for (const seed of seeds) {
    const v = pickVariant({ seed: seed * 7919 });
    const H = makeHeight(v);
    for (const trick of tricks || tricksFor(gear)) {
      resetPlayer();
      pl.simulated = false;
      const r = rng(seed * 31 + trick.length);
      const sh = new Shot({ H: H.H, line: H.line, trick, gear, r });
      let t = sh.tStart, worst = { body: 0, hand: 0, sunk: 0, base: 0, gap: 0, iters: 0 }, worstT = { body: 0, hand: 0, sunk: 0, base: 0, gap: 0 }, wt = -9, wv = -1;
      let snapAt = null;
      while (t < sh.tEnd) {
        const dtr = DT * sh.rate(t);
        t += dtr;
        sh.pose(pl, t, dtr, fxStub, t);
        rider.update(dtr, null);
        const m = measure(rider, meshes);
        worst.iters = Math.max(worst.iters || 0, rider.poseIters || 0);
        for (const k of Object.keys(worst)) if (m[k] > worst[k]) { worst[k] = m[k]; worstT[k] = t; if (k === 'body') worst.bodyAt = m.bodyAt; if (k === 'sunk') worst.sunkAt = m.sunkAt; if (k === 'hand') worst.handAt = m.handAt; }
        const mx = Math.max(m.body, m.hand, m.sunk, m.base, m.gap);
        if (mx > wv) { wv = mx; wt = t; }
      }
      // Re-run to the worst moment for the picture.
      if (shots) {
        resetPlayer(); pl.simulated = false;
        const sh2 = new Shot({ H: H.H, line: H.line, trick, gear, r: rng(seed * 31 + trick.length) });
        let t2 = sh2.tStart;
        const target = wv > 0.5 ? wt : sh2.Ta * 0.5;
        while (t2 < target) { const d = DT * sh2.rate(t2); t2 += d; sh2.pose(pl, t2, d, fxStub, t2); rider.update(d, null); }
        snapAt = t2;
        const m = measure(rider, meshes);
        snap(rider, views, `LOAD ${gear} ${variant} ${stance} ${trick} s${seed} t=${snapAt.toFixed(2)}/${sh.Ta.toFixed(2)}  body ${m.body.toFixed(1)} hand ${m.hand.toFixed(1)} sunk ${m.sunk.toFixed(1)} base ${m.base.toFixed(1)} gap ${m.gap.toFixed(1)}`, w, h);
      }
      rows.push({ name: `load ${trick} s${seed}`, gear: `${gear}/${variant}${gear === 'snowboard' ? '/' + stance : ''}${fit ? ' ' + fit.join('+') : ''}`, ...worst, worstT, worst: wv, worstAt: wt, Ta: sh.Ta });
    }
  }
  PHYSICS.trickStyle = false;
  return rows;
}

/** Debug: boot vertex extents in each gear part's frame + the ankle (foot bone) there, for the current pose. */
async function probe({ gear, variant, stance = 'regular', set = null, secs = 1 }) {
  await ensureRider(gear, variant, stance);
  resetPlayer();
  const fn = set ? new Function('p', 'State', set) : () => {};
  for (let f = 0; f < secs * 60; f++) { fn(pl, State); rider.update(DT, null); }
  rider.root.updateMatrixWorld(true);
  const parts = rider.skis || [rider.board];
  const out = [];
  for (const part of parts) {
    const inv = part.matrixWorld.clone().invert();
    const st = {};
    for (const { mesh, cls } of meshes) {
      const P = mesh.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const c = cls[i]; if (c !== CLASS.boot_l && c !== CLASS.boot_r) continue;
        _v.fromBufferAttribute(P, i); mesh.applyBoneTransform(i, _v); _v.applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        const k = c === CLASS.boot_l ? 'L' : 'R';
        const s = st[k] ||= { minY: 1e9, minX: 1e9, maxX: -1e9, minZ: 1e9, maxZ: -1e9, n: 0, restMinY: 1e9 };
        s.minY = Math.min(s.minY, _v.y); s.minX = Math.min(s.minX, _v.x); s.maxX = Math.max(s.maxX, _v.x); s.minZ = Math.min(s.minZ, _v.z); s.maxZ = Math.max(s.maxZ, _v.z); s.n++;
        s.restMinY = Math.min(s.restMinY, P.getY(i));
      }
    }
    for (const [k, b] of [['L', 'foot_l'], ['R', 'foot_r']]) if (st[k]) { const a = rider.bones[b].getWorldPosition(new THREE.Vector3()).applyMatrix4(inv); st[k].ankle = a.toArray().map((x) => +x.toFixed(3)); }
    for (const s of Object.values(st)) for (const q of Object.keys(s)) if (typeof s[q] === 'number') s[q] = +s[q].toFixed(3);
    out.push(st);
  }
  return { ankleH: rider.ankleH, pelvisH: rider.pelvisH, parts: out };
}

// ------------------------------------------------------------------ garment ↔ garment (garment-clip.mjs)
/** Point an arm bone (and so its child chain) along `dir` (armature space: +X the rider's left, +Y up, +Z forward). */
function aimBone(bone, child, dir) {
  rider.root.updateMatrixWorld(true);
  const a = bone.getWorldPosition(new THREE.Vector3()), b = child.getWorldPosition(new THREE.Vector3());
  // The rider's frame in world space: left (from the right hip to the left), world up, forward = left × up.
  const L = rider.bones.thigh_l.getWorldPosition(new THREE.Vector3()).sub(rider.bones.thigh_r.getWorldPosition(new THREE.Vector3()));
  L.y = 0; L.normalize();
  const U = new THREE.Vector3(0, 1, 0), F = new THREE.Vector3().crossVectors(L, U);
  const want = L.multiplyScalar(dir.x).addScaledVector(U, dir.y).addScaledVector(F, dir.z).normalize();
  const dq = new THREE.Quaternion().setFromUnitVectors(b.sub(a).normalize(), want);
  const qw = bone.getWorldQuaternion(new THREE.Quaternion());
  const qp = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(qp.invert().multiply(dq.multiply(qw)));
  rider.root.updateMatrixWorld(true);
}
const ARMS = {
  'arms down': [[0.22, -1, 0.06], [0, -1, 0.25]],
  'arms forward': [[0.15, -0.3, 1], [0.05, -0.2, 1]],
  'arms up': [[0.55, 1, 0.15], [0.35, 1, 0.1]],
  'arms out': [[1, -0.15, 0.1], [1, -0.1, 0.1]],
  'pole plant': [[0.18, -0.7, 0.75], [0.1, -0.9, 0.45]],
};
let gPrep = null, gKey = '';
/** Garment clip over the game poses + arm poses. opts: { gear, variant, stance, slots, only } */
async function runGarments({ gear = 'ski', variant = 'allmountain', stance = 'regular', slots = null, only = null, shots = false, views = ['front', 'side', 'side2'], w = 240, h = 260 }) {
  await ensureRider(gear, variant, stance);
  const k = JSON.stringify(slots);
  if (k !== gKey || !gPrep) { gKey = k; rider.setOutfit(slots || {}); fitKey = 'null'; meshes = classify(rider); gPrep = prepGarments(rider); }
  const rows = [];
  const poses = gamePoses(gear).filter(([name]) => !only || only.some((o) => name.includes(o)));
  for (const [name, set, secs, , style] of poses) {
    PHYSICS.trickStyle = !!style;
    resetPlayer();
    for (let f = 0; f < 30; f++) rider.update(DT, null);
    const n = Math.max(1, Math.round(secs / DT));
    for (let f = 0; f < n; f++) { set(pl, f * DT, f); rider.update(DT, null); }
    rider.root.updateMatrixWorld(true);
    rows.push({ name, gear, ...measureGarments(gPrep) });
    if (shots) snap(rider, views, `${gear} ${name}`, w, h);
  }
  PHYSICS.trickStyle = false;
  // Arm poses on the standing pose (both arms aimed, the rest of the body as the game stands it).
  if (gear === 'ski') {
    for (const [name, [dl, dr]] of Object.entries(ARMS)) {
      if (only && !only.some((o) => name.includes(o))) continue;
      resetPlayer();
      for (let f = 0; f < 90; f++) { pl.speed = 0; pl.velocity.set(0, 0, 0); rider.update(DT, null); }
      for (const [sd, d] of [['l', dl], ['r', dr]]) {
        const v = new THREE.Vector3(...d); if (sd === 'r') v.x *= -1;
        aimBone(rider.bones['upperarm_' + sd], rider.bones['lowerarm_' + sd], v);
        aimBone(rider.bones['lowerarm_' + sd], rider.bones['hand_' + sd], v.clone().add(new THREE.Vector3(0, 0, 0.6)));
      }
      rows.push({ name, gear, ...measureGarments(gPrep) });
      if (shots) snap(rider, views, `${gear} ${name}`, w, h);
    }
  }
  return rows;
}

window.__clip = {
  ready: true,
  garments: (o) => runGarments(o),
  gc: { prepare: prepGarments, measure: measureGarments, get prep() { return gPrep; } },
  probe,
  get rider() { return rider; },
  get pl() { return pl; },
  resetPlayer: () => resetPlayer(),
  State,
  ensureRider,
  THREE,
  async run(o) { return o.mode === 'loading' ? runLoading(o) : runGame(o); },
  clearSheet() { document.getElementById('sheet').innerHTML = ''; },
  TRICKS,
};
