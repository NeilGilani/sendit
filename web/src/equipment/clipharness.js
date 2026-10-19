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

patchShaderChunks();

const DT = 1 / 60;
const flat = { getHeight: () => 0, getNormal: (_x, _z, _r, o = new THREE.Vector3()) => o.set(0, 1, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
const noInput = { strength: () => 0, justPressed: () => false, key: () => false };
const fxStub = { spray() {}, takeoff() {}, landing() {}, slash() {} };

// ------------------------------------------------------------------ gear surface tables
const tables = new Map();
/** Rows along the plank (sorted by z): half width (base), top y and base y, from the real geometry. */
function plankTable(geo) {
  if (tables.has(geo.uuid)) return tables.get(geo.uuid);
  const P = geo.attributes.position, A = geo.attributes.aPlank;
  const rows = new Map();
  for (let i = 0; i < P.count; i++) {
    const z = Math.round(P.getZ(i) * 1e4) / 1e4, top = A.getZ(i) > 0.5;
    const r = rows.get(z) || { z, hw: 0, top: -1e9, base: 1e9 };
    if (top) r.top = Math.max(r.top, P.getY(i)); else { r.base = Math.min(r.base, P.getY(i)); r.hw = Math.max(r.hw, Math.abs(P.getX(i))); }
    rows.set(z, r);
  }
  const t = [...rows.values()].filter((r) => r.top > -1e8 && r.base < 1e8).sort((a, b) => a.z - b.z);
  tables.set(geo.uuid, t);
  return t;
}
function rowAt(t, z) {
  if (z < t[0].z || z > t[t.length - 1].z) return null;
  let lo = 0, hi = t.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (t[m].z <= z) lo = m; else hi = m; }
  const a = t[lo], b = t[hi], f = b.z > a.z ? (z - a.z) / (b.z - a.z) : 0;
  return { hw: a.hw + (b.hw - a.hw) * f, top: a.top + (b.top - a.top) * f, base: a.base + (b.base - a.base) * f };
}

// ------------------------------------------------------------------ vertex classes
const CLASS = { none: 0, body: 1, hand: 2, boot_l: 3, boot_r: 4, finger: 5 };
function classify(rider) {
  const { body, garments } = rider.look.meshes;
  const out = [];
  for (const mesh of [body, garments]) {
    const g = mesh.geometry, n = g.attributes.position.count;
    const cls = new Uint8Array(n), bones = mesh.skeleton.bones;
    const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, C = g.attributes.color, P = g.attributes.position;
    for (let i = 0; i < n; i++) {
      let best = 0, bw = -1;
      for (let k = 0; k < 4; k++) { const w = SW.getComponent(i, k); if (w > bw) { bw = w; best = SI.getComponent(i, k); } }
      const name = bones[best].name;
      if (mesh === body) {
        // The body is under the clothes everywhere but the boots (zone colour b below 0.6 m, materials.js).
        if (C && P.getY(i) < 0.6) {
          const r = C.getX(i), gg = C.getY(i), b = C.getZ(i);
          if (b > (r + gg) && b > 0.2) cls[i] = /_l$/.test(name) ? CLASS.boot_l : CLASS.boot_r;
        }
        continue;
      }
      if (/^(index|middle|ring|pinky)/.test(name)) cls[i] = CLASS.finger;
      else if (/^(hand|thumb)/.test(name)) cls[i] = CLASS.hand;
      else if (/^(Head|neck)/.test(name)) cls[i] = CLASS.none;
      else cls[i] = CLASS.body;
    }
    out.push({ mesh, cls });
  }
  return out;
}

// ------------------------------------------------------------------ measurement
const _v = new THREE.Vector3(), _l = new THREE.Vector3(), _inv = new THREE.Matrix4();
const SEAT = { ski: 0.033, snowboard: 0.026 };   // binding plate top above the base (models.js)
function measure(rider, meshes) {
  rider.root.updateMatrixWorld(true);
  const type = rider.equip.type;
  const parts = type === 'ski'
    ? rider.skis.map((s, i) => ({ obj: s, geo: s.children[0].geometry, foot: i === 0 ? CLASS.boot_r : CLASS.boot_l }))   // left ski (visual −X) = rider's right? (resolved below)
    : [{ obj: rider.board, geo: rider.board.children[0].geometry, foot: -1 }];
  // Visual −X is the armature +X side = the rider's left (rider.js). Ski 0 sits at −X → the left boot.
  if (type === 'ski') { parts[0].foot = CLASS.boot_l; parts[1].foot = CLASS.boot_r; }
  for (const p of parts) { p.inv = _inv.clone().copy(p.obj.matrixWorld).invert(); p.t = plankTable(p.geo); }
  const r = { body: 0, hand: 0, sunk: 0, base: 0, gap: 0, bodyAt: null };
  const soleMin = new Map();   // own boot: lowest point above its plank (part-foot key)
  for (const { mesh, cls } of meshes) {
    const P = mesh.geometry.attributes.position;
    for (let i = 0; i < P.count; i++) {
      const c = cls[i];
      if (!c) continue;
      _v.fromBufferAttribute(P, i);
      mesh.applyBoneTransform(i, _v);
      _v.applyMatrix4(mesh.matrixWorld);
      for (const p of parts) {
        _l.copy(_v).applyMatrix4(p.inv);
        const row = rowAt(p.t, _l.z);
        if (!row) continue;
        const ax = Math.abs(_l.x);
        if (c === CLASS.boot_l || c === CLASS.boot_r) {
          const own = p.foot === -1 || p.foot === c;
          // Below the base anywhere along the plank (a boot wider than a ski hangs below it at the sides too).
          if (own && ax < row.hw + 0.06) r.base = Math.max(r.base, row.base - _l.y);
          if (ax > row.hw) continue;
          if (own) { const sk = Math.min(SEAT[type] - _l.y, 0.2); if (sk > r.sunk) { r.sunk = sk; r.sunkAt = [c === CLASS.boot_l ? 'L' : 'R', ..._l.toArray().map((x) => +x.toFixed(3)), parts.indexOf(p)]; } const key = parts.indexOf(p) * 10 + c; soleMin.set(key, Math.min(soleMin.get(key) ?? 1e9, _l.y)); }
          else if (_l.y < row.top && _l.y > row.top - 0.6) {   // a boot through the other ski
            const d = Math.min(row.top - _l.y, row.hw - ax);
            if (d > r.body) { r.body = d; r.bodyAt = ['boot-vs-other-ski', ..._l.toArray().map((x) => +x.toFixed(3)), parts.indexOf(p)]; }
          }
          continue;
        }
        if (ax > row.hw) continue;
        if (c === CLASS.hand || c === CLASS.finger) {
          // Inside the plank's volume; under the base a grip may wrap 3 cm round the edge (fingers under it).
          if (_l.y < row.top && _l.y > row.base - 0.06) {
            // (fingers curling under the edge from below the slab's middle: a grip, up to 3 cm in)
            const wrap = _l.y < row.base || (c === CLASS.finger && _l.y < (row.base + row.top) / 2);
            const d = Math.min(row.top - _l.y, row.hw - ax) - (wrap ? 0.03 : 0);
            if (d > r.hand) { r.hand = d; r.handAt = [..._l.toArray().map((x) => +x.toFixed(3)), +row.hw.toFixed(3), +row.top.toFixed(3), +row.base.toFixed(3), parts.indexOf(p)]; }
          }
          continue;
        }
        if (_l.y < row.top && _l.y > row.top - 0.6) {
          const d = Math.min(row.top - _l.y, row.hw - ax);
          if (d > r.body) { r.body = d; r.bodyAt = [mesh.name || 'body', i, ..._l.toArray().map((x) => +x.toFixed(3)), +row.top.toFixed(3), parts.indexOf(p)]; }
        }
      }
    }
  }
  for (const y of soleMin.values()) r.gap = Math.max(r.gap, y - SEAT[type]);
  for (const k of ['body', 'hand', 'sunk', 'base', 'gap']) r[k] = Math.max(0, r[k]) * 100;   // cm
  return r;
}

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
    else p = look.clone().addScaledVector(fwd, -3.6).addScaledVector(up, 1.2);   // chase
    cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.position.copy(p); cam.up.copy(up); cam.lookAt(look);
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
async function ensureRider(gear, variant, stance) {
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
  L.push(['grind grab', (p) => { p.state = State.GRIND; p.grab = 1; p.grabName = type === 'ski' ? 'Safety' : 'Indy'; p.grindTilt = { pitch: 0.3, roll: 0.3, travel: 0, slide: false }; }, 1.0]);
  return L;
}

async function runGame({ gear, variant, stance = 'regular', shots = false, views = ['side', 'below', 'front'], w = 240, h = 200, only = null }) {
  await ensureRider(gear, variant, stance);
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
    rows.push({ name, gear: `${gear}/${variant}${gear === 'snowboard' ? '/' + stance : ''}`, ...m, miss: (rider.reachMiss || 0) * 100, worst: Math.max(m.body, m.hand, m.sunk, m.base, m.gap) });
    if (shots) snap(rider, views, `${gear} ${variant} ${name}  body ${m.body.toFixed(1)} hand ${m.hand.toFixed(1)} sunk ${m.sunk.toFixed(1)} base ${m.base.toFixed(1)} gap ${m.gap.toFixed(1)} cm`, w, h);
  }
  PHYSICS.trickStyle = false;
  return rows;
}

/** The loading screen's hero shots: every trick for the gear, the whole shot, every frame measured. */
async function runLoading({ gear, variant, stance = 'regular', seeds = [1, 2], shots = false, views = ['side', 'below', 'front'], w = 240, h = 200, tricks = null }) {
  await ensureRider(gear, variant, stance);
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
      rows.push({ name: `load ${trick} s${seed}`, gear: `${gear}/${variant}${gear === 'snowboard' ? '/' + stance : ''}`, ...worst, worstT, worst: wv, worstAt: wt, Ta: sh.Ta });
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

window.__clip = {
  ready: true,
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
