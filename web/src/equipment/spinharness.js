// Spin / flip / grab look harness (dev only; driven by scripts/spin-sheet.mjs, opened at
// /src/equipment/spinharness.html). Flies the real Player (physics, off-axis rotation) off flat ground with
// the same scripted stick as scripts/physics-combo.mjs, drives the real Rider rig every frame and grabs
// evenly spaced frames from a chase camera and a side camera (world-fixed, so the rotation reads), plus
// the rider ↔ gear penetration (clipmeasure.js) every frame of the air. Built to compare the in-air look
// of different builds frame for frame (the physics is deterministic, so frame k is the same moment).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Rider } from '../rider.js';
import { Player, State } from '../player.js';
import { game, Mode } from '../state.js';
import { PHYSICS } from '../config.js';
import { patchShaderChunks } from '../world.js';
import { classify, measure } from './clipmeasure.js';

patchShaderChunks();
game.mode = Mode.RIDING;

const DT = 1 / 60, TAU = Math.PI * 2, DEG = 180 / Math.PI;
const terrain = () => {
  const T = { half: 1e7, getHeight: () => 0, getSurface: (x, z, o = new THREE.Vector4()) => o.set(1, 0, 0, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
  T.getNormal = (x, z, r, o = new THREE.Vector3()) => o.set(0, 1, 0);
  return T;
};
const noInput = { strength: () => 0, justPressed: () => false, key: () => false };

// Scripted stick (physics-combo.mjs): hold until the rotation left carries it round, then spot the landing.
const flipTo = (dir, turns) => (p) => {
  const ahead = Math.abs(p.flipRate) * 0.2 + Math.abs(p.dyn.flipH || 0) * Math.max(0, p.dyn.timeToLand() - 0.2);
  return p.airTime < 0.12 || Math.abs(p.flip) + ahead < turns * TAU ? (dir > 0 ? { brake: 1 } : { up: 1 }) : {};
};
const spinTo = (deg, dir = 1) => (p) => (p.airTime < 0.12 || Math.abs(p._spinTotal) + Math.abs(p.spinRate) * 0.15 + Math.abs(p.dyn.spinH || 0) * (p.dyn.C.spinOpen ?? 1) * Math.max(0, p.dyn.timeToLand() - 0.15) < deg / DEG ? { steer: -dir } : {});
const both = (...f) => (p) => Object.assign({}, ...f.map((g) => g(p)));
const grabMid = (f) => (p) => ({ ...f(p), ...(p.airTime > 0.3 && p.dyn.timeToLand() > 0.45 ? { tuck: 1 } : {}) });
const none = () => ({});

/** [vy, vz, set, stick] */
export const TRICKS = {
  '360': [9, 11, { windup: -0.7 }, spinTo(360)],
  '720': [11, 11, { windup: -1 }, spinTo(720)],
  'cork 720': [11, 11, { preload: 1, windup: -1 }, both(flipTo(1, 1), spinTo(720))],
  '540 grab': [11, 11, { windup: -0.8 }, grabMid(spinTo(540))],
  'cork 720 grab': [11, 11, { preload: 1, windup: -1 }, grabMid(both(flipTo(1, 1), spinTo(720)))],
  'straight grab': [10, 11, {}, grabMid(none)],
};

function newPlayer(gear) {
  const p = new Player(terrain(), { findObstacle: () => null, nearest: () => null }, null, noInput);
  p.setEquipment(gear);
  p.place(new THREE.Vector3(), 0);
  return p;
}
/** Ride in, then launch (the physics-combo take-off). Calls each(p) every frame; returns the frame count. */
function fly(p, trick, each) {
  const [vy, vz, set, stick] = TRICKS[trick];
  p.place(new THREE.Vector3(), 0);
  p.state = State.GROUNDED;
  p.velocity.set(0, 0, -vz);
  p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }); };
  for (let i = 0; i < 40; i++) { p.step(DT); p.interpolate(1); each?.(p, -1); }
  p.velocity.set(0, vy, -vz);
  p.position.y = 0.4;
  p.lastPopQ = set.q ?? 1;
  p.dyn.flipLoad = set.preload || 0;
  p.dyn.frontLoad = set.front || 0;
  p.dyn.windup = set.windup || 0;
  p.enterAir(set.popped ?? true);
  let i = 0;
  for (; i < 6 / DT; i++) {
    p.script = (c) => { p.dyn._noInputT = -999; Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }, stick(p)); };
    p.step(DT);
    p.interpolate(1);
    each?.(p, i);
    if (p.state !== State.AIR && i > 2) break;
  }
  // a few frames of the landing
  for (let k = 0; k < 12; k++) { p.script = (c) => Object.assign(c, { steer: 0, brake: 0, up: 0, jump: false, tuck: 0 }); p.step(DT); p.interpolate(1); each?.(p, i + 1 + k); }
  return i;
}

let renderer = null, scene = null;
const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 80);
function setupRender(w, h) {
  if (renderer && renderer.domElement.width === w && renderer.domElement.height === h) return;
  renderer ||= new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(1);
  if (!scene) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fb0c2);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
    const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 5, 3); scene.add(d);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshLambertMaterial({ color: 0xeef3f8 }));
    g.rotation.x = -Math.PI / 2; g.position.y = -0.01; scene.add(g);
    const grid = new THREE.GridHelper(400, 200, 0xb8c4d0, 0xcfd8e2); grid.position.y = 0; scene.add(grid);
  }
}
/** Views: chase (behind the travel direction, a little above) and side (from the rider's right, level). */
function shoot(rider, pl, views, w, h) {
  setupRender(w, h);
  rider.root.updateMatrixWorld(true);
  const look = pl.renderPos.clone().add(new THREE.Vector3(0, 0.85, 0));
  const out = [];
  for (const v of views) {
    if (v === 'chase') cam.position.copy(look).add(new THREE.Vector3(0, 1.1, 4.6));
    else if (v === 'side') cam.position.copy(look).add(new THREE.Vector3(4.8, 0.25, 0));
    else cam.position.copy(look).add(new THREE.Vector3(3.4, 1.4, -3.4));   // front 3/4
    cam.aspect = w / h; cam.updateProjectionMatrix();
    cam.up.set(0, 1, 0); cam.lookAt(look);
    scene.add(rider.root);
    renderer.render(scene, cam);
    scene.remove(rider.root);
    out.push(renderer.domElement.toDataURL('image/jpeg', 0.88));
  }
  return out;
}

/**
 * Pose signature (root frame, m / deg): pelvis height and fore-aft, the gear's centre (board / mean of the
 * skis), the pelvis above the gear, knee bend (180 = straight), hands' height above the gear.
 */
function poseSig(rider) {
  rider.root.updateMatrixWorld(true);
  const B = rider.bones, inv = rider.root.matrixWorld.clone().invert();
  const P = (b) => b.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const parts = rider.board ? [rider.board] : rider.skis;
  const gc = new THREE.Vector3();
  for (const o of parts) gc.add(o.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv));
  gc.multiplyScalar(1 / parts.length);
  const pel = P(B.pelvis);
  const knee = (s) => { const h = P(B['thigh' + s]), k = P(B['calf' + s]), a = P(B['foot' + s]); return h.sub(k).angleTo(a.sub(k)) * DEG; };
  const r = (x) => +x.toFixed(3);
  return { pelY: r(pel.y), pelZ: r(pel.z), gearX: r(gc.x), gearY: r(gc.y), gearZ: r(gc.z), hipAboveGear: r(pel.y - gc.y), kneeL: Math.round(knee('_l')), kneeR: Math.round(knee('_r')),
    handL: r(P(B.hand_l).y - gc.y), handR: r(P(B.hand_r).y - gc.y) };
}

let riders = {};
async function riderFor(gear) {
  if (riders[gear]) return riders[gear];
  const pl = newPlayer(gear);
  const rider = new Rider(pl);
  await rider.load(new GLTFLoader());
  riders[gear] = { pl, rider, meshes: classify(rider) };
  return riders[gear];
}

/**
 * run({ gear, trick, frames: 9, views: ['chase','side'], w, h, style }) →
 * { air (s), n (air frames), shots: [{ t, imgs: [dataURL per view] }], max: {body, hand, sunk, base}, worst: [{f, ...}] }
 */
async function run({ gear = 'ski', trick = '720', frames = 9, views = ['chase', 'side'], w = 200, h = 220, style = false }) {
  PHYSICS.trickStyle = !!style;
  // Dry run (physics only) for the air time: frames are spread evenly over it.
  const n = fly(newPlayer(gear), trick);
  const want = new Set();
  for (let k = 0; k < frames; k++) want.add(Math.round(k * (n - 1) / (frames - 1)));
  const { pl, rider, meshes } = await riderFor(gear);
  const shots = [], max = { body: 0, hand: 0, sunk: 0, base: 0 }, at = {};
  const series = [];
  fly(pl, trick, (p, i) => {
    rider.update(DT, null);
    if (i < 0 || i >= n) return;
    const m = measure(rider, meshes);
    series.push({ i, body: +m.body.toFixed(2), hand: +m.hand.toFixed(2), sunk: +m.sunk.toFixed(2), base: +m.base.toFixed(2), grab: +p.grab.toFixed(2), ...poseSig(rider) });
    for (const k of Object.keys(max)) if (m[k] > max[k]) { max[k] = m[k]; at[k] = i; }
    if (want.has(i)) shots.push({ i, t: +(i * DT).toFixed(2), spin: Math.round((p._spinTotal || 0) * DEG), flip: Math.round((p.flip || 0) * DEG), imgs: shoot(rider, p, views, w, h), m: { body: +m.body.toFixed(1), hand: +m.hand.toFixed(1), sunk: +m.sunk.toFixed(1), base: +m.base.toFixed(1) } });
  });
  PHYSICS.trickStyle = false;
  return { air: +(n * DT).toFixed(2), n, shots, max, at, series };
}

window.__spin = { ready: true, run, TRICKS: Object.keys(TRICKS) };
