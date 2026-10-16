// A living mountain: other skiers carving S-turns down the run, people riding the chairlifts,
// a cozy lodge with a smoking chimney at the bottom, and a few birds wheeling overhead.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, mulberry32 } from './world.js';

const JACKETS = ['#ff3d7f', '#2ff5d6', '#ffb02e', '#7a5cff', '#ff6b3d', '#3d8bff', '#ffe14d', '#3dff8b'];
const PANTS = ['#1b1f3a', '#2b2f4a', '#3a2b4a', '#22303a', '#f2f2f2'];
const rgb = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

function paint(g, c) {
  const n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set(c, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
function part(geo, c, pos, rot = [0, 0, 0]) {
  geo.rotateX(rot[0]); geo.rotateY(rot[1]); geo.rotateZ(rot[2]);
  geo.translate(pos[0], pos[1], pos[2]);
  return paint(geo, c);
}

/** Low-poly skier facing −Z (athletic stance, poles, skis). */
export function skierGeometry(jacket, pants, helmet, skis) {
  const J = rgb(jacket), P = rgb(pants), H = rgb(helmet), S = rgb(skis), dark = [0.05, 0.05, 0.09], skin = [0.93, 0.74, 0.62];
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.08, 0.02, 1.6), S, [sx * 0.13, 0.02, -0.05]));
    parts.push(part(new THREE.BoxGeometry(0.12, 0.2, 0.2), dark, [sx * 0.13, 0.12, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.075, 0.065, 0.48, 6), P, [sx * 0.13, 0.38, -0.08], [-0.45, 0, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.09, 0.075, 0.42, 6), P, [sx * 0.12, 0.74, -0.06], [0.55, 0, 0]));
    parts.push(part(new THREE.CylinderGeometry(0.05, 0.045, 0.5, 6), J, [sx * 0.27, 1.12, -0.22], [1.1, 0, -sx * 0.2]));
    parts.push(part(new THREE.SphereGeometry(0.055, 6, 4), dark, [sx * 0.3, 0.98, -0.42]));
    parts.push(part(new THREE.CylinderGeometry(0.008, 0.008, 1.15, 4), dark, [sx * 0.34, 0.5, -0.25], [0.35, 0, 0]));
  }
  parts.push(part(new THREE.BoxGeometry(0.4, 0.5, 0.26), J, [0, 1.12, -0.05], [0.35, 0, 0]));
  parts.push(part(new THREE.SphereGeometry(0.11, 10, 8), skin, [0, 1.47, -0.2]));
  parts.push(part(new THREE.SphereGeometry(0.125, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), H, [0, 1.49, -0.2]));
  parts.push(part(new THREE.BoxGeometry(0.2, 0.06, 0.06), [0.15, 0.85, 0.8], [0, 1.47, -0.3]));
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

/** Seated chairlift passenger (origin at the seat, facing −Z), skis dangling. */
function seatedGeometry(jacket, pants, helmet) {
  const J = rgb(jacket), P = rgb(pants), H = rgb(helmet), dark = [0.05, 0.05, 0.09], skin = [0.93, 0.74, 0.62];
  const parts = [
    part(new THREE.BoxGeometry(0.4, 0.5, 0.26), J, [0, 0.3, 0.05]),
    part(new THREE.SphereGeometry(0.11, 8, 6), skin, [0, 0.68, 0.02]),
    part(new THREE.SphereGeometry(0.125, 8, 5, 0, Math.PI * 2, 0, Math.PI * 0.55), H, [0, 0.7, 0.02]),
  ];
  for (const sx of [-1, 1]) {
    parts.push(part(new THREE.BoxGeometry(0.14, 0.14, 0.45), P, [sx * 0.11, 0.03, -0.2]));
    parts.push(part(new THREE.BoxGeometry(0.12, 0.42, 0.13), P, [sx * 0.11, -0.2, -0.42]));
    parts.push(part(new THREE.BoxGeometry(0.08, 0.02, 1.5), dark, [sx * 0.12, -0.44, -0.6], [0.25, 0, 0]));
  }
  const g = mergeGeometries(parts);
  g.computeVertexNormals();
  return g;
}

export class Life {
  constructor({ scene, terrain, features, lifts, course, fx }) {
    Object.assign(this, { scene, terrain, features, lifts, course, fx });
    this.group = new THREE.Group();
    this.group.name = 'Life';
    scene.add(this.group);
    this.rnd = mulberry32(99);
    this.mat = toonMaterial({ name: 'people', vertexColors: true, rim: 0.4 });
    this.buildSkiers(course?.life?.skiers ?? 10);   // a course can opt out of people (course.life)
    this.buildChairRiders();
    if (course?.life?.lodge !== false) this.buildLodge();
    this.buildBirds();
  }

  // ---------------------------------------------------------------- skiers on the run
  buildSkiers(n = this.course.life?.skiers ?? 10) {   // a map may set how many (course.life)
    const rnd = this.rnd, L = this.course.finishAt;
    this.skiers = [];
    for (let i = 0; i < n; i++) {
      const g = skierGeometry(JACKETS[i % JACKETS.length], PANTS[i % PANTS.length], JACKETS[(i + 3) % JACKETS.length], JACKETS[(i + 5) % JACKETS.length]);
      const mesh = new THREE.Mesh(g, this.mat);
      mesh.castShadow = true;
      this.group.add(mesh);
      this.skiers.push({
        mesh, s: (i / n) * L * 0.9 + rnd() * 40, speed: 6.5 + rnd() * 5,
        amp: 3 + rnd() * 6, wave: 26 + rnd() * 24, phase: rnd() * 6.28, side: (rnd() - 0.5) * 6, roll: 0,
      });
    }
  }

  // ---------------------------------------------------------------- chairlift passengers
  buildChairRiders() {
    this.chairRiders = [];
    if (!this.lifts?.lifts?.length) return;
    const geos = [0, 1, 2].map((k) => seatedGeometry(JACKETS[k * 2 % JACKETS.length], PANTS[k % PANTS.length], JACKETS[(k * 2 + 3) % JACKETS.length]));
    for (const lift of this.lifts.lifts) {
      if (!lift.chairs || lift.type === 'gondola' || lift.type === 'cable_car') continue;
      const seats = [];
      for (let i = 0; i < lift.chairs.count; i++) {
        if (this.rnd() < 0.45) continue;               // empty chair
        const people = 1 + Math.floor(this.rnd() * 3);
        for (let k = 0; k < people; k++) seats.push([i, (k - (people - 1) / 2) * 0.55]);
      }
      if (!seats.length) continue;
      const im = new THREE.InstancedMesh(geos[this.chairRiders.length % 3], this.mat, seats.length);
      im.frustumCulled = false;
      im.castShadow = true;
      this.group.add(im);
      this.chairRiders.push({ lift, im, seats });
    }
  }

  // ---------------------------------------------------------------- lodge at the bottom
  buildLodge() {
    const f = this.features, T = this.terrain;
    if (!f?.at) return;
    const end = f.at(Math.max(0, this.course.finishAt + 35));
    const r = new THREE.Vector2(-end.dir.y, end.dir.x);
    // Pick the flatter side of the run.
    const cand = [-1, 1].map((sd) => {
      const c = end.p.clone().addScaledVector(r, sd * 34);
      return { c, sd, slope: 1 - T.getNormal(c.x, c.y, 8).y };
    }).sort((a, b) => a.slope - b.slope)[0];
    const c = cand.c;
    const y = T.getHeight(c.x, c.y);
    const lodge = new THREE.Group();
    const wood = [0.42, 0.24, 0.13], dark = [0.2, 0.11, 0.06], snow = [0.95, 0.95, 0.95], stone = [0.45, 0.43, 0.47];
    const parts = [
      part(new THREE.BoxGeometry(16, 3.2, 10), stone, [0, -0.2, 0]),
      part(new THREE.BoxGeometry(15.4, 3.6, 9.4), wood, [0, 3.2, 0]),
      part(new THREE.BoxGeometry(0.4, 4, 0.4), dark, [-7.7, 3, 4.7]), part(new THREE.BoxGeometry(0.4, 4, 0.4), dark, [7.7, 3, 4.7]),
      part(new THREE.BoxGeometry(2.2, 2.8, 0.3), dark, [0, 2.6, 4.75]),
      part(new THREE.BoxGeometry(1.4, 4.5, 1.4), stone, [5, 7, -2]),
    ];
    // Gable roof (two slabs) with a thick snow load.
    for (const sd of [-1, 1]) {
      parts.push(part(new THREE.BoxGeometry(17.5, 0.5, 6.6), dark, [0, 6.6, sd * 2.6], [sd * 0.62, 0, 0]));
      parts.push(part(new THREE.BoxGeometry(17.7, 0.45, 6.6), snow, [0, 6.95, sd * 2.62], [sd * 0.62, 0, 0]));
    }
    const body = new THREE.Mesh(mergeGeometries(parts), toonMaterial({ name: 'lodge', vertexColors: true }));
    body.castShadow = true; body.receiveShadow = true;
    lodge.add(body);
    // Warm glowing windows.
    const winMat = toonMaterial({ name: 'lodgeWindow', color: 0xffc46b });
    winMat.userData.uniforms.uEmissiveBoost.value = 1.5;
    const wg = [];
    for (const x of [-5.5, -3, 3, 5.5]) wg.push(part(new THREE.BoxGeometry(1.4, 1.3, 0.1), [1, 0.77, 0.42], [x, 3.4, 4.72]));
    const win = new THREE.Mesh(mergeGeometries(wg), toonMaterial({
      name: 'lodgeGlow', vertexColors: true,
      frag: 'toonEmissive = vec3(1.0, 0.62, 0.25) * 0.9;',
    }));
    lodge.add(win);
    void winMat;
    lodge.position.set(c.x, y + 0.2, c.y);
    lodge.rotation.y = Math.atan2(-end.dir.x, -end.dir.y) + (cand.sd > 0 ? -Math.PI / 2 : Math.PI / 2);
    this.group.add(lodge);
    this.lodge = lodge;
    this.chimney = new THREE.Vector3(5, 9.5, -2).applyEuler(lodge.rotation).add(lodge.position);
    this.smokeT = 0;
    this.terrainObstacles = [[c.x, c.y, 9, 'lodge']];
    this.clearings = [[c.x, c.y, 20]];
  }

  // ---------------------------------------------------------------- birds
  buildBirds(n = 6) {
    this.birds = [];
    const mat = new THREE.MeshBasicMaterial({ color: 0x232838, side: THREE.DoubleSide });
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, 0, 0, 0.15, 0.55, 0.05, 0], 3));
    for (let i = 0; i < n; i++) {
      const b = new THREE.Group();
      const l = new THREE.Mesh(wing, mat), r = new THREE.Mesh(wing, mat);
      r.scale.x = -1;
      b.add(l, r);
      b.scale.setScalar(1.4);
      this.group.add(b);
      this.birds.push({ g: b, l, r, a: (i / n) * Math.PI * 2, rad: 18 + this.rnd() * 22, h: 22 + this.rnd() * 14, speed: 0.25 + this.rnd() * 0.2, flap: this.rnd() * 6 });
    }
    this.flockCenter = new THREE.Vector3();
  }

  update(dt, time, player, camPos) {
    const T = this.terrain, f = this.features;
    // Skiers: S-turns down the run, respawning at the top.
    if (f?.at) {
      for (const k of this.skiers) {
        k.s += k.speed * dt;
        if (k.s > this.course.finishAt + 20) k.s = Math.random() * 40;
        const { p, dir } = f.at(k.s);
        const r = new THREE.Vector2(-dir.y, dir.x);
        const w = (k.s / k.wave) * Math.PI * 2 + k.phase;
        const lat = k.side + Math.sin(w) * k.amp;
        const dlat = Math.cos(w) * k.amp * (Math.PI * 2 / k.wave);
        const x = p.x + r.x * lat, z = p.y + r.y * lat;
        const hx = dir.x + r.x * dlat, hz = dir.y + r.y * dlat;
        const m = k.mesh;
        m.visible = camPos.distanceToSquared(m.position) < 900 * 900;
        m.position.set(x, T.getHeight(x, z), z);
        const roll = -Math.sin(w) * 0.35 * Math.min(1, k.speed / 9);
        k.roll += (roll - k.roll) * Math.min(1, dt * 6);
        m.rotation.set(0, Math.atan2(-hx, -hz), k.roll, 'YXZ');
      }
    }
    // Chair passengers follow their chairs.
    const m = new THREE.Matrix4(), o = new THREE.Matrix4();
    for (const cr of this.chairRiders) {
      const lift = cr.lift;
      if (camPos.distanceTo(lift.center) - lift.length * 0.5 > 1600) continue;
      const off = (time * lift.speed) % lift.loop;
      cr.seats.forEach(([i, x], n) => {
        const d = (off + i * lift.chairSpacing) % lift.loop;
        this.lifts.chairMatrix(lift, d, m);
        o.makeTranslation(x, -2.05, 0.05);
        cr.im.setMatrixAt(n, m.clone().multiply(o));
      });
      cr.im.instanceMatrix.needsUpdate = true;
    }
    // Chimney smoke.
    if (this.lodge && this.fx && camPos.distanceTo(this.chimney) < 700) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = 0.35;
        this.fx.smoke?.(this.chimney.clone());
      }
    }
    // Birds wheel above the rider.
    this.flockCenter.lerp(player.renderPos, 1 - Math.exp(-0.15 * dt));
    for (const b of this.birds) {
      b.a += b.speed * dt;
      b.flap += dt * 9;
      const x = this.flockCenter.x + Math.cos(b.a) * b.rad, z = this.flockCenter.z + Math.sin(b.a) * b.rad;
      const y = Math.max(T.getHeight(x, z), this.flockCenter.y) + b.h + Math.sin(b.a * 3) * 2;
      b.g.position.set(x, y, z);
      b.g.rotation.set(0, -b.a, 0.3);
      const flap = Math.sin(b.flap) * 0.6;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
    }
  }
}
