// A living mountain: other skiers carving S-turns down the run, people riding the chairlifts,
// a cozy lodge with a smoking chimney at the bottom, and a few birds wheeling overhead.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toonMaterial, mulberry32 } from './world.js';
import { COLORWAYS } from './character/outfits.js';

// Lobby: background skiers keep this far to the side of the plinth (m) over the run from
// LOBBY_BEFORE m uphill of it (where the stage camera sits) to LOBBY_AFTER m below, eased in over LOBBY_EASE m.
const LOBBY_CLEAR = 22, LOBBY_BEFORE = 30, LOBBY_AFTER = 30, LOBBY_EASE = 35;
const smooth01 = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
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

// Background people wear simplified versions of the real outfits: whole colourways from the
// character catalog (character/outfits.js), so the mountain looks like the same game as your rider.
const KITS = Object.values(COLORWAYS).filter((c) => c.jacket && c.pants && c.helmet && c.goggles && c.gloves);
const TOPSHEETS = ['#e9e4d8', '#1d1e22', '#ff5b14', '#2f7be0', '#c8392b', '#3a4a3a', '#f2c230'];
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3();

/** A capsule (smooth limb or torso) from point a to point b, radius r (rb at b if given). */
function limb(a, b, r, c, rb = r) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  _d.subVectors(B, A);
  const len = _d.length();
  const g = rb === r ? new THREE.CapsuleGeometry(r, Math.max(0.001, len), 3, 8) : new THREE.CylinderGeometry(rb, r, len, 8, 1);
  g.applyQuaternion(_q.setFromUnitVectors(_up, _d.normalize()));
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return paint(g, c);
}
function ball(r, c, pos, scale = [1, 1, 1], ws = 12, hs = 8) {
  const g = new THREE.SphereGeometry(r, ws, hs);
  g.scale(...scale);
  g.translate(...pos);
  return paint(g, c);
}
/** One ski (or a snowboard when w is wide): a flat plank with an upturned tip at −Z (and tail at +Z if twin). */
function plank(x, w, len, c, twin = false) {
  const out = [part(new THREE.BoxGeometry(w, 0.022, len * 0.86), c, [x, 0.02, 0])];
  out.push(part(new THREE.BoxGeometry(w * 0.92, 0.02, len * 0.09), c, [x, 0.045, -len * 0.47], [0.45, 0, 0]));
  out.push(part(new THREE.BoxGeometry(w * 0.92, 0.02, len * 0.08), c, [x, twin ? 0.04 : 0.028, len * 0.465], [twin ? -0.4 : -0.15, 0, 0]));
  return out;
}
const hexes = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v[0] === '#' ? rgb(v) : v]));

/** Head, helmet, goggles and gaiter around head centre h (facing −Z, or `face` = forward direction). */
function head(K, h, face = [0, 0, -1]) {
  const [fx, , fz] = face;
  const yaw = Math.atan2(-fx, -fz);
  const parts = [
    ball(0.1, K.skin, h, [0.95, 1.05, 1]),
    ball(0.122, K.helmet.base, [h[0], h[1] + 0.035, h[2]], [1, 0.92, 1.08], 14, 9),
  ];
  // Goggles: a curved lens band across the front of the helmet, strap round the back.
  const lens = new THREE.CylinderGeometry(0.128, 0.128, 0.062, 14, 1, true, -0.95, 1.9);
  lens.rotateY(Math.PI + yaw);
  lens.translate(h[0], h[1] - 0.005, h[2]);
  parts.push(paint(lens, K.goggles.lens));
  const strap = new THREE.CylinderGeometry(0.126, 0.126, 0.04, 14, 1, true, 1.0, Math.PI * 2 - 2.0);
  strap.rotateY(Math.PI + yaw);
  strap.translate(h[0], h[1] - 0.005, h[2]);
  parts.push(paint(strap, K.goggles.strap));
  parts.push(ball(0.085, K.jacket.gaiter ?? K.jacket.panel, [h[0] - fx * 0.01, h[1] - 0.115, h[2] - fz * 0.01], [1.05, 0.7, 1.05], 10, 6));
  return parts;
}

function kitColors(jacket, pants, helmet, skis, kit) {
  const K = kit ? hexes(Object.fromEntries(Object.entries(kit).map(([k, v]) => [k, typeof v === 'object' ? hexes(v) : v]))) : null;
  const J = rgb(jacket), P = rgb(pants), H = rgb(helmet);
  return {
    jacket: K?.jacket ?? { base: J, panel: J.map((v) => v * 0.8), accent: H, gaiter: J.map((v) => v * 0.7) },
    pants: K?.pants ?? { base: P },
    helmet: K?.helmet ?? { base: H },
    goggles: K?.goggles ?? { lens: [0.15, 0.85, 0.8], strap: [0.05, 0.05, 0.09] },
    gloves: K?.gloves ?? { base: [0.08, 0.08, 0.1] },
    skis: rgb(skis), skin: [0.86, 0.66, 0.54], boot: [0.07, 0.07, 0.09], pole: [0.12, 0.12, 0.14],
  };
}

/**
 * Skier facing −Z in an athletic stance (knees and hips flexed, hands forward, poles, skis), origin
 * at the snow. Smooth capsules and real kit colours: fine at chase-camera distance, not a close-up.
 * `kit` (optional) = a COLORWAYS entry; without it the four colours tint a plain kit (ghosts).
 */
export function skierGeometry(jacket, pants, helmet, skis, kit = null) {
  const K = kitColors(jacket, pants, helmet, skis, kit), J = K.jacket;
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push(...plank(sx * 0.12, 0.085, 1.68, K.skis));
    parts.push(part(new THREE.BoxGeometry(0.11, 0.17, 0.3), K.boot, [sx * 0.12, 0.12, 0.0]));
    parts.push(limb([sx * 0.12, 0.2, -0.02], [sx * 0.13, 0.5, -0.17], 0.068, K.pants.base));    // shin (pants over the boot)
    parts.push(limb([sx * 0.13, 0.5, -0.17], [sx * 0.11, 0.84, 0.03], 0.082, K.pants.base));    // thigh
    parts.push(limb([sx * 0.2, 1.3, -0.1], [sx * 0.27, 1.1, -0.27], 0.058, J.base));            // upper arm
    parts.push(limb([sx * 0.27, 1.1, -0.27], [sx * 0.27, 1.0, -0.45], 0.052, J.panel));         // forearm
    parts.push(ball(0.05, K.gloves.base, [sx * 0.27, 0.99, -0.49], [1, 1.1, 1.25], 8, 6));    // glove
    parts.push(limb([sx * 0.27, 1.06, -0.49], [sx * 0.36, 0.06, -0.12], 0.009, K.pole));       // pole
    parts.push(part(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 8), K.pole, [sx * 0.355, 0.13, -0.14]));   // basket
  }
  parts.push(ball(0.15, K.pants.base, [0, 0.87, 0.04], [1.1, 0.8, 1]));                          // seat
  parts.push(limb([0, 0.92, 0.02], [0, 1.27, -0.1], 0.165, J.base));                              // torso
  parts.push(limb([-0.17, 1.31, -0.09], [0.17, 1.31, -0.09], 0.07, J.panel));                     // shoulders / yoke
  parts.push(part(new THREE.BoxGeometry(0.03, 0.3, 0.02), J.accent, [0, 1.11, -0.135], [-0.32, 0, 0]));   // zip stripe
  parts.push(...head(K, [0, 1.52, -0.18]));
  const g = mergeGeometries(parts);
  return g;
}

/** Snowboarder (regular, chest towards +X) riding towards −Z: board along Z, open shoulders, bent knees. */
export function boarderGeometry(kit, board) {
  const K = kitColors('#888888', '#333333', '#cccccc', board, kit), J = K.jacket;
  const parts = [...plank(0, 0.27, 1.52, K.skis, true)];
  for (const sz of [-1, 1]) {
    const fz = sz * 0.25;
    parts.push(part(new THREE.BoxGeometry(0.28, 0.06, 0.15), K.boot, [0.0, 0.06, fz], [0, 0, 0]));   // binding
    parts.push(part(new THREE.BoxGeometry(0.12, 0.17, 0.3), K.boot, [0.02, 0.13, fz], [0, Math.PI / 2 - sz * 0.25, 0]));
    parts.push(limb([0.03, 0.2, fz], [0.17, 0.5, fz * 0.9], 0.07, K.pants.base));
    parts.push(limb([0.17, 0.5, fz * 0.9], [0.0, 0.84, fz * 0.5], 0.085, K.pants.base));
    parts.push(limb([0.02, 1.3, sz * 0.18], [0.12, 1.08, sz * 0.32], 0.058, J.base));
    parts.push(limb([0.12, 1.08, sz * 0.32], [0.2, 0.96, sz * 0.4], 0.052, J.panel));
    parts.push(ball(0.05, K.gloves.base, [0.22, 0.94, sz * 0.43], [1.15, 1.1, 1], 8, 6));
  }
  parts.push(ball(0.15, K.pants.base, [-0.04, 0.87, 0], [1, 0.8, 1.15]));
  parts.push(limb([-0.02, 0.92, 0], [0.06, 1.27, -0.02], 0.165, J.base));
  parts.push(limb([0.05, 1.31, -0.18], [0.05, 1.31, 0.17], 0.07, J.panel));
  parts.push(part(new THREE.BoxGeometry(0.02, 0.3, 0.03), J.accent, [0.18, 1.1, -0.01], [0, 0, 0.25]));
  parts.push(...head(K, [0.1, 1.52, -0.05], [0.55, 0, -0.83]));
  return mergeGeometries(parts);
}

/** Seated chairlift passenger (origin at the seat, facing −Z), skis dangling. */
function seatedGeometry(kit, skis) {
  const K = kitColors('#888888', '#333333', '#cccccc', skis, kit), J = K.jacket;
  const parts = [
    ball(0.15, K.pants.base, [0, 0.06, 0.08], [1.15, 0.7, 1]),
    limb([0, 0.08, 0.08], [0, 0.42, 0.06], 0.165, J.base),
    limb([-0.17, 0.46, 0.05], [0.17, 0.46, 0.05], 0.07, J.panel),
    ...head(K, [0, 0.68, 0.0]),
  ];
  for (const sx of [-1, 1]) {
    parts.push(limb([sx * 0.11, 0.05, 0.0], [sx * 0.11, 0.05, -0.38], 0.08, K.pants.base));
    parts.push(limb([sx * 0.11, 0.05, -0.38], [sx * 0.11, -0.36, -0.45], 0.068, K.pants.base));
    parts.push(part(new THREE.BoxGeometry(0.11, 0.17, 0.3), K.boot, [sx * 0.11, -0.44, -0.52]));
    parts.push(...plank(sx * 0.12, 0.085, 1.6, K.skis).map((g) => { g.rotateX(0.25); g.translate(0, -0.5, -0.55); return g; }));
    parts.push(limb([sx * 0.2, 0.42, 0.04], [sx * 0.24, 0.2, -0.1], 0.058, J.base));
    parts.push(limb([sx * 0.24, 0.2, -0.1], [sx * 0.16, 0.14, -0.3], 0.052, J.panel));
    parts.push(ball(0.05, K.gloves.base, [sx * 0.15, 0.13, -0.34], [1, 1, 1.2], 8, 6));
  }
  return mergeGeometries(parts);
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
      const kit = KITS[Math.floor(rnd() * KITS.length)], top = TOPSHEETS[Math.floor(rnd() * TOPSHEETS.length)];
      const boarder = i % 3 === 1;                        // every third one rides a snowboard
      const g = boarder ? boarderGeometry(kit, top) : skierGeometry('#888888', '#333333', '#cccccc', top, kit);
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
    const geos = [0, 1, 2].map((k) => seatedGeometry(KITS[(k * 5 + 2) % KITS.length], TOPSHEETS[(k * 3 + 1) % TOPSHEETS.length]));
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

  /**
   * Where the lobby stage stands ({ x, z } or null outside the lobby). Background skiers swing wide
   * around it (LOBBY_CLEAR m to the side, eased in over the stretch of run around the plinth and the
   * camera behind it) so nobody skis through the close-up framing; the path stays continuous, so no
   * one pops in or out — they just pass by beyond the edge of the shot.
   */
  setStage(spot) {
    this.stageOn = !!spot;                     // eased in update(): leaving the lobby lets them drift back, no snap
    if (!spot) return;
    if (this.stage && this.stage.x === spot.x && this.stage.z === spot.z) return;
    const f = this.features;
    let best = null;
    if (f?.at) {
      // Nearest point of the run to the spot: its distance along (s0) and side offset (lat0).
      for (let s = 0; s <= this.course.finishAt + 20; s += 1) {
        const { p, dir } = f.at(s);
        const dx = spot.x - p.x, dz = spot.z - p.y, d2 = dx * dx + dz * dz;
        if (!best || d2 < best.d2) best = { d2, s0: s, lat0: dx * -dir.y + dz * dir.x };
      }
    }
    this.stage = { x: spot.x, z: spot.z, s0: best?.s0 ?? -1e9, lat0: best?.lat0 ?? 0 };
  }

  /** Lateral offset of a skier at run distance s (with the lobby swing-wide applied). */
  skierLat(k, s) {
    const w = (s / k.wave) * Math.PI * 2 + k.phase;
    let lat = k.side + Math.sin(w) * k.amp;
    const st = this.stage;
    if (st && this.stageK > 0) {
      const u = s - st.s0;
      // 1 from LOBBY_BEFORE m uphill (behind the camera) to LOBBY_AFTER m downhill, eased over LOBBY_EASE m.
      const g = smooth01((u + LOBBY_BEFORE + LOBBY_EASE) / LOBBY_EASE) * smooth01((LOBBY_AFTER + LOBBY_EASE - u) / LOBBY_EASE);
      if (g > 0) {
        const sign = k.side >= st.lat0 ? 1 : -1;   // fixed per skier: pass on their own side
        lat += sign * g * this.stageK * Math.max(0, LOBBY_CLEAR - sign * (lat - st.lat0));
      }
    }
    return lat;
  }

  update(dt, time, player, camPos) {
    const T = this.terrain, f = this.features;
    // Lobby swing-wide weight: on at once when the lobby opens (it starts on a cut), eased off after.
    this.stageK = this.stageOn ? 1 : Math.max(0, (this.stageK ?? 0) - dt / 3);
    // Skiers: S-turns down the run, respawning at the top.
    if (f?.at) {
      for (const k of this.skiers) {
        k.s += k.speed * dt;
        if (k.s > this.course.finishAt + 20) k.s = Math.random() * 40;
        const { p, dir } = f.at(k.s);
        const r = new THREE.Vector2(-dir.y, dir.x);
        const lat = this.skierLat(k, k.s);
        const dlat = this.skierLat(k, k.s + 0.5) - lat;      // heading follows the actual line (incl. the swing-wide)
        const x = p.x + r.x * lat, z = p.y + r.y * lat;
        const hx = dir.x * 0.5 + r.x * dlat, hz = dir.y * 0.5 + r.y * dlat;
        const m = k.mesh;
        m.visible = camPos.distanceToSquared(m.position) < 900 * 900;
        m.position.set(x, T.getHeight(x, z), z);
        const roll = -Math.sin((k.s / k.wave) * Math.PI * 2 + k.phase) * 0.35 * Math.min(1, k.speed / 9);
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
