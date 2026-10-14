// Chairlifts and gondolas from OpenStreetMap: towers, stations, sagging cables and moving chairs.
// Provides the ride path that carries the skier back to the top.
import * as THREE from 'three';
import { mergeGeometries as mergeRaw } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Merge primitives safely: non-indexed, position/normal/uv only. */
export function mergeGeometries(list, groups = false) {
  return mergeRaw(list.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k);
    return n;
  }), groups);
}
import { toonMaterial } from './world.js';

const RIDEABLE = ['chair_lift', 'mixed_lift', 'gondola', 'cable_car'];
const CABLE_H = { chair_lift: 9, mixed_lift: 10, gondola: 12, cable_car: 22, drag_lift: 6, 't-bar': 6, 'j-bar': 6, platter: 6 };
const OFFSET = 2.6;
const SPACING = 22;
const BOARD_RADIUS = 22;

export class Lifts {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Lifts';
    this.lifts = [];
  }

  build(raw) {
    const poles = [], arms = [], stations = [], wheels = [];
    const cablePos = [];
    for (const L of raw) {
      const lift = this.buildLift(L);
      if (!lift) continue;
      this.lifts.push(lift);
      for (const s of lift.supports) {
        const yaw = Math.atan2(s.dir.x, s.dir.z);
        if (s.station) {
          stations.push(mat(new THREE.Vector3(s.top.x, s.ground, s.top.z), yaw));
          wheels.push(mat(new THREE.Vector3(s.top.x, s.top.y - 0.6, s.top.z), yaw));
        } else {
          poles.push(mat(new THREE.Vector3(s.top.x, s.ground - 1, s.top.z), yaw, new THREE.Vector3(1, s.top.y - s.ground + 1.5, 1)));
          arms.push(mat(new THREE.Vector3(s.top.x, s.top.y + 0.6, s.top.z), yaw));
        }
      }
      addCable(cablePos, lift.up);
      addCable(cablePos, lift.down);
    }
    const steel = metal(0x9aa3c4, 0.4), dark = metal(0x2a2f45, 0.5);
    this.addInstances(poleGeo(), steel, poles);
    this.addInstances(armGeo(), steel, arms);
    this.addInstances(stationGeo(), [paint(0xd9603b), paint(0x2a2f45), paint(0xffffff)], stations);
    this.addInstances(wheelGeo(), dark, wheels);
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.Float32BufferAttribute(cablePos, 3));
    cg.computeVertexNormals();
    const cable = new THREE.Mesh(cg, metal(0x1a1d30, 0.45, true));
    cable.name = 'Cables';
    this.group.add(cable);
    const chairG = chairGeo(), gondolaG = gondolaGeo();
    for (const lift of this.lifts) this.makeChairs(lift, lift.type === 'gondola' || lift.type === 'cable_car' ? gondolaG : chairG);
  }

  addInstances(geo, material, list) {
    if (!list.length) return;
    const im = new THREE.InstancedMesh(geo, material, list.length);
    list.forEach((m, i) => im.setMatrixAt(i, m));
    im.castShadow = true;
    im.receiveShadow = true;
    this.group.add(im);
  }

  buildLift(L) {
    const T = this.terrain;
    if (L.line.length < 2) return null;
    const pts = L.line.map((p) => new THREE.Vector2(p[0], p[2]));
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = cum[cum.length - 1];
    if (total < 60) return null;
    const at = (d) => {
      for (let i = 0; i < pts.length - 1; i++) {
        if (d <= cum[i + 1] || i === pts.length - 2) {
          const seg = cum[i + 1] - cum[i];
          const t = seg <= 0 ? 0 : Math.min(1, Math.max(0, (d - cum[i]) / seg));
          return pts[i].clone().lerp(pts[i + 1], t);
        }
      }
      return pts[pts.length - 1].clone();
    };
    const project = (p) => {
      let best = Infinity, bd = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], ab = pts[i + 1].clone().sub(a);
        const t = Math.min(1, Math.max(0, p.clone().sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-3)));
        const dd = a.clone().addScaledVector(ab, t).distanceTo(p);
        if (dd < best) { best = dd; bd = cum[i] + ab.length() * t; }
      }
      return bd;
    };
    let dists = [0, total];
    for (const t of L.towers) dists.push(project(new THREE.Vector2(t[0], t[2])));
    if (!L.towers.length) {
      const sp = L.type === 'cable_car' ? 600 : 140;
      const n = Math.floor(total / sp);
      for (let i = 1; i <= n; i++) dists.push((total * i) / (n + 1));
    }
    dists.sort((a, b) => a - b);
    const clean = [];
    for (const d of dists) if (!clean.length || d - clean[clean.length - 1] > 25) clean.push(d);
    clean[clean.length - 1] = total;
    const hgt = CABLE_H[L.type] ?? 8;
    const supports = clean.map((d, i) => {
      const xz = at(d);
      const g = T.getHeight(xz.x, xz.y);
      const station = i === 0 || i === clean.length - 1;
      const d2 = at(Math.min(d + 5, total)).sub(at(Math.max(d - 5, 0))).normalize();
      return { top: new THREE.Vector3(xz.x, g + (station ? 4.5 : hgt), xz.y), ground: g, station, dir: new THREE.Vector3(d2.x, 0, d2.y), d };
    });
    const up = [], down = [];
    for (let s = 0; s < supports.length - 1; s++) {
      const a = supports[s], b = supports[s + 1];
      const span = b.d - a.d;
      const steps = Math.max(2, Math.floor(span / 6));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const d = a.d + span * t;
        const xz = at(d);
        let y = a.top.y + (b.top.y - a.top.y) * t - 4 * span * 0.012 * t * (1 - t);
        y = Math.max(y, T.getHeight(xz.x, xz.y) + 3.2);
        const d2 = at(Math.min(d + 3, total)).sub(at(Math.max(d - 3, 0))).normalize();
        const right = new THREE.Vector3(-d2.y, 0, d2.x);
        up.push(new THREE.Vector3(xz.x, y, xz.y).addScaledVector(right, OFFSET));
        down.push(new THREE.Vector3(xz.x, y, xz.y).addScaledVector(right, -OFFSET));
      }
    }
    const last = supports[supports.length - 1];
    const lr = new THREE.Vector3(-last.dir.z, 0, last.dir.x);
    up.push(last.top.clone().addScaledVector(lr, OFFSET));
    down.push(last.top.clone().addScaledVector(lr, -OFFSET));
    down.reverse();
    const p0 = pts[0], p1 = pts[pts.length - 1];
    return {
      name: L.name, type: L.type, length: total, supports, up, down,
      upCum: cumulative(up), downCum: cumulative(down),
      bottom: new THREE.Vector3(p0.x, T.getHeight(p0.x, p0.y), p0.y),
      top: new THREE.Vector3(p1.x, T.getHeight(p1.x, p1.y), p1.y),
      rideable: RIDEABLE.includes(L.type),
      speed: L.type === 'cable_car' ? 8 : 4,
    };
  }

  makeChairs(lift, geo) {
    const upLen = lift.upCum[lift.upCum.length - 1];
    const loop = upLen + lift.downCum[lift.downCum.length - 1];
    const spacing = lift.type === 'cable_car' ? loop / 2 : SPACING;
    const count = Math.max(2, Math.floor(loop / spacing));
    const mats = Array.isArray(geo.userData.materials) ? geo.userData.materials : paint(0x2e5280);
    const im = new THREE.InstancedMesh(geo, mats, count);
    im.castShadow = true;
    im.frustumCulled = false;
    this.group.add(im);
    lift.chairs = im;
    lift.loop = loop;
    lift.chairSpacing = loop / count;
    lift.center = lift.bottom.clone().add(lift.top).multiplyScalar(0.5);
    this.updateChairs(lift, 0);
  }

  update(time, camPos) {
    for (const lift of this.lifts) {
      if (camPos.distanceTo(lift.center) - lift.length * 0.5 < 1600) this.updateChairs(lift, time);
    }
  }

  updateChairs(lift, time) {
    const m = new THREE.Matrix4();
    const off = (time * lift.speed) % lift.loop;
    for (let i = 0; i < lift.chairs.count; i++) {
      const d = (off + i * lift.chairSpacing) % lift.loop;
      this.chairMatrix(lift, d, m);
      lift.chairs.setMatrixAt(i, m);
    }
    lift.chairs.instanceMatrix.needsUpdate = true;
  }

  chairMatrix(lift, d, out = new THREE.Matrix4()) {
    const upLen = lift.upCum[lift.upCum.length - 1];
    const [p, dir] = d <= upLen ? sampleLine(lift.up, lift.upCum, d) : sampleLine(lift.down, lift.downCum, d - upLen);
    const yaw = Math.atan2(dir.x, dir.z);
    return out.compose(p, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), new THREE.Vector3(1, 1, 1));
  }

  // ---------------------------------------------------------------- riding API
  findBoardable(pos) {
    return this.lifts.find((l) => l.rideable && Math.hypot(pos.x - l.bottom.x, pos.z - l.bottom.z) < BOARD_RADIUS) || null;
  }

  nearestBase(pos) {
    let best = null, bd = Infinity;
    for (const l of this.lifts) {
      if (!l.rideable) continue;
      const d = pos.distanceTo(l.bottom);
      if (d < bd) { bd = d; best = l; }
    }
    return best;
  }

  rideLength(lift) { return lift.upCum[lift.upCum.length - 1]; }

  /** Skier hip position + yaw (facing travel) at distance d along the up line. */
  seat(lift, d) {
    const [p, dir] = sampleLine(lift.up, lift.upCum, d);
    const fwd = new THREE.Vector3(dir.x, 0, dir.z).normalize();
    return { position: p.clone().add(new THREE.Vector3(0, -2.35, 0)).addScaledVector(fwd, 0.15), yaw: Math.atan2(-fwd.x, -fwd.z) };
  }
}

export function sampleLine(line, cum, d) {
  d = Math.min(Math.max(d, 0), cum[cum.length - 1]);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] <= d) lo = mid; else hi = mid; }
  const seg = cum[hi] - cum[lo];
  const t = seg <= 0 ? 0 : (d - cum[lo]) / seg;
  return [line[lo].clone().lerp(line[hi], t), line[hi].clone().sub(line[lo]).normalize()];
}

function cumulative(line) {
  const c = [0];
  for (let i = 1; i < line.length; i++) c.push(c[i - 1] + line[i].distanceTo(line[i - 1]));
  return c;
}

function mat(pos, yaw, scale = new THREE.Vector3(1, 1, 1)) {
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw), scale);
}

function addCable(out, line) {
  const r = 0.05;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1];
    const dir = b.clone().sub(a).normalize();
    const side = dir.clone().cross(new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(r);
    const upv = side.clone().cross(dir).normalize().multiplyScalar(r);
    for (const o of [side, upv]) {
      const q = [a.clone().sub(o), a.clone().add(o), b.clone().add(o), b.clone().sub(o)];
      for (const k of [0, 1, 2, 0, 2, 3]) out.push(q[k].x, q[k].y, q[k].z);
    }
  }
}

function metal(color, _rough, double = false) {
  return toonMaterial({ name: 'liftMetal', color, side: double ? THREE.DoubleSide : THREE.FrontSide, rim: 0.3 });
}

function paint(color) {
  return toonMaterial({ name: 'liftPaint', color });
}

function poleGeo() {
  const g = new THREE.CylinderGeometry(0.28, 0.42, 1, 10);
  g.translate(0, 0.5, 0);
  return g;
}

function armGeo() {
  const bar = new THREE.BoxGeometry(OFFSET * 2 + 1.2, 0.35, 0.45);
  const w1 = new THREE.CylinderGeometry(0.35, 0.35, 0.2, 14);
  w1.rotateZ(Math.PI / 2);
  const w2 = w1.clone();
  w1.translate(OFFSET, -0.45, 0);
  w2.translate(-OFFSET, -0.45, 0);
  return mergeGeometries([bar, w1, w2]);
}

function stationGeo() {
  const body = new THREE.BoxGeometry(9, 4, 12); body.translate(0, 2, 0);
  const roof = prism(10.4, 2.2, 13); roof.translate(0, 5.1, 0);
  const snow = prism(10.6, 0.4, 13.2); snow.translate(0, 6.05, 0);
  const g = mergeGeometries([body, roof, snow], true);
  return g;
}

function prism(w, h, d) {
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, -h / 2), new THREE.Vector2(w / 2, -h / 2), new THREE.Vector2(0, h / 2)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  g.translate(0, 0, -d / 2);
  return g;
}

function wheelGeo() {
  const w = new THREE.CylinderGeometry(OFFSET, OFFSET, 0.25, 28);
  return w;
}

export function chairGeo() {
  const hanger = new THREE.BoxGeometry(0.08, 2.1, 0.08); hanger.translate(0, -1.05, 0);
  const seat = new THREE.BoxGeometry(1.9, 0.12, 0.55); seat.translate(0, -2.4, 0.05);
  const back = new THREE.BoxGeometry(1.9, 0.6, 0.08); back.rotateX(-0.15); back.translate(0, -2.05, -0.22);
  const bar = new THREE.BoxGeometry(1.9, 0.05, 0.05); bar.translate(0, -1.75, 0.55);
  const g = mergeGeometries([mergeGeometries([hanger, bar]), mergeGeometries([seat, back])], true);
  g.userData.materials = [metal(0x2a2f45, 0.4), paint(0xff3d7f)];
  return g;
}

function gondolaGeo() {
  const hanger = new THREE.BoxGeometry(0.08, 1.4, 0.08); hanger.translate(0, -0.7, 0);
  const cabin = new THREE.BoxGeometry(1.9, 2.1, 1.9); cabin.translate(0, -2.5, 0);
  const glass = new THREE.BoxGeometry(1.95, 0.8, 1.95); glass.translate(0, -2.1, 0);
  const g = mergeGeometries([hanger, cabin, glass], true);
  const gm = toonMaterial({ name: 'gondolaGlass', color: 0x6fd8ff, rim: 1.0 });
  g.userData.materials = [metal(0x2a2f45, 0.4), paint(0xffb02e), gm];
  return g;
}
