// Procedural 3D models for skis and snowboards, generated from the spec (outline from the sidecut,
// camber / rocker profile, kicks, bindings) with a cel-shaded topsheet whose graphic comes from
// spec.graphic. Used by the rider and by any preview (lobby / shop).
//
//   createEquipmentModel(type, variant, opts?) → THREE.Group
//     type     'ski' | 'snowboard'
//     variant  variant id, or a (partial) spec object, e.g. { id: 'park', graphic: { top: 0xff0000 } }
//     opts     { outline = true, stance = 'regular', pair = true, poles = false, neon = 1 }
//   Coordinates: origin = where the rider stands (boot centre / stance centre), nose / tips toward −Z,
//   base at y = 0, Y up. 1 unit = 1 m.
//   group.userData = { type, spec, parts, setNeon(v) }
//     parts (ski):       { skis: [left, right], poles?: [left, right] }   (left ski at −X)
//     parts (snowboard): { board, bindings: [front, back] }
import * as THREE from 'three';
import { toonMaterial, outlineMaterial } from '../world.js';
import { getEquipmentSpec, normalizeType } from './registry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const PATTERNS = { solid: 0, stripe: 1, fade: 2, chevron: 3, split: 4 };
const SKI_SPACING = 0.13;   // boot centre → ski centre line (m)

export function createEquipmentModel(type, variant, opts = {}) {
  const t = normalizeType(type);
  const spec = getEquipmentSpec(t, variant);
  const o = { outline: true, stance: 'regular', pair: true, poles: false, neon: 1, ...opts };
  const group = new THREE.Group();
  group.name = `${t}:${spec.id}`;
  const mats = [];
  const parts = {};
  if (t === 'ski') {
    const geo = plankGeometry(spec, 'ski');
    const mat = plankMaterial(spec);
    mats.push(mat);
    const mk = (x) => {
      const ski = new THREE.Group();
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      ski.add(m);
      if (o.outline) ski.add(new THREE.Mesh(geo, outlineMaterial(1.0)));
      ski.add(skiBinding());
      ski.position.x = x;
      group.add(ski);
      return ski;
    };
    parts.skis = o.pair ? [mk(-SKI_SPACING), mk(SKI_SPACING)] : [mk(0)];
    if (o.poles) {
      const pg = poleGeometry();
      const pm = toonMaterial({ name: 'pole', vertexColors: true, rim: 0.4 });
      parts.poles = [-1, 1].map((sx) => {
        const p = new THREE.Mesh(pg, pm);
        p.castShadow = true;
        p.position.set(sx * 0.32, 1.08, 0.1);
        p.rotation.z = sx * 0.12;
        group.add(p);
        return p;
      });
    }
  } else {
    const geo = plankGeometry(spec, 'board');
    const mat = plankMaterial(spec);
    mats.push(mat);
    const board = new THREE.Group();
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    board.add(m);
    if (o.outline) board.add(new THREE.Mesh(geo, outlineMaterial(1.0)));
    group.add(board);
    parts.board = board;
    // Bindings: regular = left foot toward the nose, toes face the board's right (+X) side.
    const st = spec.stance;
    const toe = o.stance === 'goofy' ? -1 : 1;
    const bm = toonMaterial({ name: 'binding', color: 0x17162a, rim: 0.5 });
    parts.bindings = [[-st.width / 2, st.front], [st.width / 2, st.back]].map(([z, ang]) => {
      const b = snowboardBinding(bm, o.outline);
      b.position.set(0, 0.012, z);
      // Binding angle: + rotates the toes toward the nose. Toes point +X·toe at 0°.
      b.rotation.y = toe > 0 ? THREE.MathUtils.degToRad(ang) : Math.PI - THREE.MathUtils.degToRad(ang);
      board.add(b);
      return b;
    });
  }
  group.userData = {
    type: t, spec, parts,
    setNeon(v) { for (const m of mats) m.userData.uniforms.uEmissiveBoost.value = v; },
  };
  group.userData.setNeon(o.neon);
  return group;
}

export function disposeEquipmentModel(group) {
  group?.traverse((o) => { if (o.isMesh) { o.geometry?.dispose(); } });
}

// ------------------------------------------------------------------ geometry
/**
 * A ski or board as a deformed box: outline from the sidecut (parabolic arc between the contact
 * points, rounded nose/tail), camber arch between the contact points, rocker / kick rising to the ends.
 * Attribute aPlank = (along 0 tip → 1 tail, across −1..1, top 1 / base 0) for the topsheet shader.
 */
function plankGeometry(spec, kind) {
  const L = spec.length;
  const board = kind === 'board';
  const T = board ? 0.013 : 0.017;
  const segL = 72, segW = board ? 10 : 4;
  const g = new THREE.BoxGeometry(1, 1, 1, segW, 1, segL);
  const pos = g.attributes.position;
  const plank = new Float32Array(pos.count * 3);
  // Normalised stations (s = −0.5 nose … +0.5 tail).
  const noseZone = board ? 0.1 : 0.13, tailZone = board ? 0.1 : 0.06;
  const sTip = -0.5 + noseZone, sTail = 0.5 - tailZone;
  const sWaist = board ? (spec.setback || 0) / L * 0.5 : 0.02;
  // Rocker: early rise begins this far from the end (share of length).
  const noseRise = Math.max(noseZone, spec.profile.noseRocker + noseZone * 0.4);
  const tailRise = Math.max(tailZone, spec.profile.tailRocker + tailZone * 0.4);
  const camber = (spec.profile.camber || 0) * 2.0;   // exaggerated ×2 so it reads at game scale
  // Mount: rider stands this far behind the geometric centre (+Z = toward the tail).
  const mount = board ? (spec.setback || 0) : L * (spec.twin ? 0.02 : 0.06);
  const width = (s) => {
    if (s < sTip) {                      // nose: round off
      const k = (sTip - s) / (sTip + 0.5);
      return spec.tip * Math.sqrt(Math.max(0, 1 - k * k)) * (board ? 1 : 1 - 0.25 * k);
    }
    if (s > sTail) {
      const k = (s - sTail) / (0.5 - sTail);
      return spec.tail * Math.sqrt(Math.max(0, 1 - k * k * (board ? 1 : 0.6)));
    }
    if (s < sWaist) { const k = (s - sWaist) / (sTip - sWaist); return spec.waist + (spec.tip - spec.waist) * k * k; }
    const k = (s - sWaist) / (sTail - sWaist);
    return spec.waist + (spec.tail - spec.waist) * k * k;
  };
  const height = (s) => {
    let y = 0;
    const startN = -0.5 + noseRise, startT = 0.5 - tailRise;
    if (s < startN) { const k = (startN - s) / noseRise; y += spec.kick.nose * Math.pow(k, 1.8); }
    if (s > startT) { const k = (s - startT) / tailRise; y += spec.kick.tail * Math.pow(k, 1.8); }
    if (s > startN && s < startT && camber > 0) {
      const mid = (startN + startT) / 2, half = (startT - startN) / 2;
      const k = (s - mid) / half;
      y += camber * (1 - k * k);
    }
    return y;
  };
  for (let i = 0; i < pos.count; i++) {
    const s = pos.getZ(i), a = pos.getX(i) * 2, top = pos.getY(i) > 0 ? 1 : 0;
    const w = width(s);
    // Slightly bevelled sidewalls: the top is 6% narrower than the base.
    pos.setX(i, a * w * 0.5 * (top ? 0.94 : 1));
    pos.setY(i, height(s) + (top ? T : 0));
    pos.setZ(i, s * L - mount);
    plank.set([s + 0.5, a, top], i * 3);
  }
  g.setAttribute('aPlank', new THREE.BufferAttribute(plank, 3));
  g.computeVertexNormals();
  return g;
}

function plankMaterial(spec) {
  const gr = spec.graphic;
  const c = (h) => new THREE.Color(h);
  return toonMaterial({
    name: 'plank', rim: 0.6,
    vertPars: 'attribute vec3 aPlank; varying vec3 vP;', vert: 'vP = aPlank;',
    fragPars: 'varying vec3 vP; uniform vec3 uBase, uTop, uTop2, uAccent, uEdgeCol; uniform float uPattern;',
    frag: /* glsl */`
      {
        float along = vP.x, across = vP.y, top = step(0.5, vP.z);
        vec3 t = uTop;
        if (uPattern > 0.5 && uPattern < 1.5) {            // stripe: centre stripe + pin lines
          t = mix(uTop, uTop2, smoothstep(0.2, 0.17, abs(across)));
          t = mix(t, uAccent, smoothstep(0.06, 0.03, abs(abs(across) - 0.32)));
        } else if (uPattern > 1.5 && uPattern < 2.5) {     // fade nose → tail
          t = mix(uTop2, uTop, smoothstep(0.1, 0.9, along));
          t = mix(t, uAccent, smoothstep(0.012, 0.0, abs(along - 0.5 - across * 0.08)) );
        } else if (uPattern > 2.5 && uPattern < 3.5) {     // chevrons
          float ch = fract(along * 7.0 + abs(across) * 0.6);
          t = mix(uTop, uTop2, step(0.5, ch));
          t = mix(t, uAccent, smoothstep(0.05, 0.0, abs(along - 0.5)));
        } else if (uPattern > 3.5) {                       // split colourway with accent seam
          t = mix(uTop, uTop2, step(0.0, across + 0.15 * sin(along * 12.0)));
          t = mix(t, uAccent, smoothstep(0.08, 0.0, abs(across + 0.15 * sin(along * 12.0))));
        }
        vec3 col = mix(uBase, t, top);
        float side = smoothstep(0.86, 0.97, abs(across));
        col = mix(col, uEdgeCol * 0.6 + 0.3, side * top * 0.5);
        diffuseColor.rgb = col;
        toonEmissive = uEdgeCol * side * 1.1 + uAccent * top * smoothstep(0.03, 0.0, abs(abs(across) - 0.92)) * 0.4;
      }`,
    uniforms: {
      uBase: { value: c(gr.base) }, uTop: { value: c(gr.top) }, uTop2: { value: c(gr.top2) },
      uAccent: { value: c(gr.accent) }, uEdgeCol: { value: c(gr.edge) },
      uPattern: { value: PATTERNS[gr.pattern] ?? 0 },
    },
  });
}

let _skiBindingGeo = null;
function skiBinding() {
  if (!_skiBindingGeo) {
    const toe = new THREE.BoxGeometry(0.07, 0.045, 0.1); toe.translate(0, 0.04, -0.14);
    const heel = new THREE.BoxGeometry(0.075, 0.055, 0.11); heel.translate(0, 0.045, 0.16);
    const plate = new THREE.BoxGeometry(0.07, 0.016, 0.42); plate.translate(0, 0.025, 0.01);
    _skiBindingGeo = mergeGeometries([toe, heel, plate].map((g) => g.toNonIndexed()));
  }
  const m = new THREE.Mesh(_skiBindingGeo, toonMaterial({ name: 'skiBinding', color: 0x1a1830, rim: 0.4 }));
  m.castShadow = true;
  return m;
}

/** Snowboard binding with toes toward +X: base plate, heel cup + highback on −X, two straps. */
function snowboardBinding(mat, outline) {
  const parts = [];
  const plate = new THREE.BoxGeometry(0.27, 0.014, 0.13); plate.translate(0, 0.007, 0); parts.push(plate);
  const cup = new THREE.CylinderGeometry(0.075, 0.075, 0.06, 12, 1, true, Math.PI * 0.5, Math.PI); cup.translate(-0.06, 0.04, 0); parts.push(cup);
  const hb = new THREE.BoxGeometry(0.018, 0.2, 0.12); hb.rotateZ(-0.25); hb.translate(-0.14, 0.12, 0); parts.push(hb);
  const ankle = new THREE.BoxGeometry(0.05, 0.03, 0.15); ankle.translate(-0.02, 0.1, 0); parts.push(ankle);
  const toeS = new THREE.BoxGeometry(0.04, 0.025, 0.14); toeS.translate(0.1, 0.055, 0); parts.push(toeS);
  const geo = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; }));
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  const grp = new THREE.Group();
  grp.add(m);
  if (outline) grp.add(new THREE.Mesh(geo, outlineMaterial(1.0)));
  return grp;
}

/** Ski pole hanging from the grip (origin) along −Y: grip, shaft, basket. */
export function poleGeometry() {
  const paint = (g, c) => { const n = g.attributes.position.count; const a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const grip = new THREE.CylinderGeometry(0.018, 0.016, 0.14, 8); grip.translate(0, -0.03, 0);
  const shaft = new THREE.CylinderGeometry(0.008, 0.007, 1.12, 6); shaft.translate(0, -0.6, 0);
  const basket = new THREE.CylinderGeometry(0.045, 0.045, 0.012, 10); basket.translate(0, -1.06, 0);
  const parts = [paint(grip, [0.04, 0.04, 0.08]), paint(shaft, [1.0, 0.24, 0.5]), paint(basket, [0.04, 0.04, 0.08])];
  return mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
}
