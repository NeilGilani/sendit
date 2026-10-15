// Liveliness and things to hit: snow kickers (small/medium/large) along the opening run, wind-
// rippling branded flags and a start banner, cheering billboard spectators that bob out of sync,
// and soft animated teal/indigo mist pockets in the valleys. Kickers add to the terrain height field so the
// rider's physics launches off them naturally.
import * as THREE from 'three';
import { toonMaterial, outlineMaterial, globals, mulberry32 } from './world.js';
import { ATMOSPHERE, JUMPS, col } from './scene.js';
import { ATMO } from './gfx/atmosphere.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from './gfx/snow.js';

// Signature kickers near the top (with crowds); the rest of the run is laid out from JUMPS.
const KICKERS = [
  { at: 110, L: 6, H: 1.4, W: 5, name: 'S' },
  { at: 210, L: 9, H: 2.4, W: 6, name: 'M' },
  { at: 330, L: 12, H: 3.6, W: 7, name: 'L' },
];

const smooth01 = (t) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };
// Shaped sidewalls: real kickers are cut with ~40° raked walls, rounded into the table and the ground.
const sideRun = (k) => Math.max(1.0, k.H * 1.1);
const sideFactor = (k, b) => { const hw = k.W / 2; return b <= hw ? 1 : 1 - smooth01((b - hw) / sideRun(k)); };

export class Features {
  constructor(terrain) {
    this.terrain = terrain;
    this.group = new THREE.Group();
    this.group.name = 'Features';
    this.kickers = [];
    this.flagPoles = [];
  }

  /**
   * Plan the opening run before the terrain is built: find the run, lay out kickers, and bake
   * rollers + snow pillows straight into the height field (so physics, normals, shadows and the
   * rendered snow all agree). Layout parameters: JUMPS in scene.js.
   */
  plan(course) {
    const T = this.terrain;
    this.course = course;
    const path = course.path;
    this.path = path;
    // Keep man-made features clear of the course's natural drops.
    const dropsAt = course.dropsAt;
    let len = 0;
    for (let i = 0; i < path.length - 1; i++) len += path[i].distanceTo(path[i + 1]);
    this.runLength = len;
    const at = (d) => {
      let acc = 0;
      for (let i = 0; i < path.length - 1; i++) {
        const seg = path[i].distanceTo(path[i + 1]);
        if (acc + seg >= d || i === path.length - 2) {
          const t = Math.min(1, (d - acc) / seg);
          return { p: path[i].clone().lerp(path[i + 1], t), dir: path[i + 1].clone().sub(path[i]).normalize() };
        }
        acc += seg;
      }
      return { p: path[0].clone(), dir: new THREE.Vector2(0, -1) };
    };
    this.at = at;

    const J = JUMPS;
    const rnd = mulberry32(2024);
    const rr = (a) => a[0] + (a[1] - a[0]) * rnd();
    const ri = (a) => a[0] + Math.floor(rnd() * (a[1] - a[0] + 1));
    const bumps = [];   // { x, z, kind: 'roller'|'pillow', ... }
    // Signature park kickers (with crowds) near the top.
    for (const k of KICKERS) this.planKicker(at(k.at), 0, k, true);
    // Then a stream of features all the way down.
    const end = Math.min(J.endAt, course.finishAt - 60);
    for (let d = J.startAt; d < end; d += rr(J.spacing)) {
      if (KICKERS.some((k) => Math.abs(k.at - d) < 28)) continue;
      if (dropsAt.some((q) => d > q - 45 && d < q + 30)) continue;
      const { p, dir } = at(d);
      const r = new THREE.Vector2(-dir.y, dir.x);
      const w = rnd();
      if (w < J.weights.kicker) {
        const k = J.kickers[Math.floor(rnd() * J.kickers.length)];
        this.planKicker({ p, dir }, (rnd() * 2 - 1) * J.kickerLateral, k, false);
      } else if (w < J.weights.kicker + J.weights.roller) {
        bumps.push({ kind: 'roller', x: p.x, z: p.y, f: dir, r, H: rr(J.rollerHeight), sig: rr(J.rollerSigma), hw: J.rollerHalfWidth });
      } else {
        const n = ri(J.pillowsPerGroup);
        const side = rnd() < 0.5 ? -1 : 1;
        for (let i = 0; i < n; i++) {
          const off = side * rr(J.pillowOffset) * (i % 2 ? -1 : 1);
          const c = p.clone().addScaledVector(dir, (i - n / 2) * 7 + (rnd() - 0.5) * 4).addScaledVector(r, off);
          bumps.push({ kind: 'pillow', x: c.x, z: c.y, R: rr(J.pillowRadius), H: rr(J.pillowHeight) });
        }
      }
    }
    // Off-piste pillow fields around the run.
    const samples = [];
    for (let d = 0; d < Math.min(len, J.endAt); d += 25) samples.push(at(d));
    for (let i = 0; i < J.freePillows && samples.length; i++) {
      const s0 = samples[Math.floor(rnd() * samples.length)];
      const r = new THREE.Vector2(-s0.dir.y, s0.dir.x);
      const off = (rnd() < 0.5 ? -1 : 1) * (28 + rnd() * J.freePillowRegion);
      const c = s0.p.clone().addScaledVector(r, off).addScaledVector(s0.dir, (rnd() - 0.5) * 30);
      if (!T.isInside(c.x, c.y, 60)) continue;
      bumps.push({ kind: 'pillow', x: c.x, z: c.y, R: rr(J.pillowRadius) * 1.2, H: rr(J.pillowHeight) * 1.1 });
    }
    this.bakeBumps(bumps);
    this.bumps = bumps;
    T.features = { heightAt: (x, z, base) => this.heightAt(x, z, base) };
  }

  planKicker({ p, dir }, lateral, k, signature) {
    const r = new THREE.Vector2(-dir.y, dir.x);
    const o = p.clone().addScaledVector(r, lateral);
    const kick = { o, f: dir.clone(), r, L: k.L, H: k.H, W: k.W, name: k.name, signature };
    const m = k.W / 2 + sideRun(k) + 2;
    kick.box = [Math.min(o.x, o.x + dir.x * k.L) - m, Math.max(o.x, o.x + dir.x * k.L) + m,
      Math.min(o.y, o.y + dir.y * k.L) - m, Math.max(o.y, o.y + dir.y * k.L) + m];
    this.kickers.push(kick);
  }

  /** Add rollers / pillows to the terrain height grid, then refresh normals + GPU textures. */
  bakeBumps(bumps) {
    const T = this.terrain;
    const N = T.res, sp = T.spacing, half = T.half, H = T.heights;
    let x0 = N, x1 = 0, z0 = N, z1 = 0;
    const grid = (v) => Math.round((v + half) / sp);
    for (const b of bumps) {
      const reach = b.kind === 'roller' ? Math.max(b.hw + 6, b.sig * 3) : b.R + 1;
      const gi0 = Math.max(1, grid(b.x - reach)), gi1 = Math.min(N - 2, grid(b.x + reach));
      const gj0 = Math.max(1, grid(b.z - reach)), gj1 = Math.min(N - 2, grid(b.z + reach));
      for (let j = gj0; j <= gj1; j++) for (let i = gi0; i <= gi1; i++) {
        const x = -half + i * sp, z = -half + j * sp;
        const dx = x - b.x, dz = z - b.z;
        let dh = 0;
        if (b.kind === 'roller') {
          const a = dx * b.f.x + dz * b.f.y, l = Math.abs(dx * b.r.x + dz * b.r.y);
          const edge = 1 - smooth01((l - b.hw) / 6);
          dh = b.H * Math.exp(-(a * a) / (b.sig * b.sig)) * edge;
        } else {
          const d = Math.hypot(dx, dz) / b.R;
          if (d < 1) dh = b.H * Math.pow(1 - d * d, 1.6);
        }
        if (dh > 0) H[j * N + i] += dh;
      }
      x0 = Math.min(x0, gi0); x1 = Math.max(x1, gi1); z0 = Math.min(z0, gj0); z1 = Math.max(z1, gj1);
    }
    if (x1 < x0) return;
    // Recompute the stored normals over the touched area (same convention as getNormal).
    const nrm = T.normals;
    for (let j = Math.max(1, z0 - 1); j <= Math.min(N - 2, z1 + 1); j++) for (let i = Math.max(1, x0 - 1); i <= Math.min(N - 2, x1 + 1); i++) {
      const nx = H[j * N + i - 1] - H[j * N + i + 1], ny = 2 * sp, nz = H[(j - 1) * N + i] - H[(j + 1) * N + i];
      const l = Math.hypot(nx, ny, nz);
      nrm[(j * N + i) * 2] = Math.round((nx / l) * 127.5 + 127.5);
      nrm[(j * N + i) * 2 + 1] = Math.round((nz / l) * 127.5 + 127.5);
    }
    T.normalTex.needsUpdate = true;
    T.heightTex.needsUpdate = true;
  }

  /** Meshes for the planned features (after the terrain is built). */
  build() {
    // Shaped park snow: packed, shovel-smoothed, glazed lip (same optics as the terrain snow).
    const snowMat = toonMaterial({
      name: 'kicker', vertexColors: true,
      uniforms: { ...snowUniforms(), noiseTex: { value: this.terrain.terrainUniforms?.noiseTex.value } },
      fragPars: SNOW_COMMON_PARS + 'vec3 kN;',
      // Shovel-shaped packed snow: soft half-metre lumps, spade facets and a little grain.
      frag: /* glsl */`
        float kn = texture2D(noiseTex, vW.xz * 0.6).g;
        diffuseColor.rgb = uSnowOld * (0.97 + 0.06 * kn) * mix(vec3(0.92, 0.96, 1.02), vec3(1.0), vColor.r);
        tGlaze = 0.8; tGlintMask = 0.6;
        vec3 q = vW * 1.9;
        float h0 = texture2D(noiseTex, q.xz * 0.11 + q.y * 0.03).r;
        vec2 g = vec2(texture2D(noiseTex, (q.xz + vec2(0.3, 0.0)) * 0.11 + q.y * 0.03).r - h0,
                      texture2D(noiseTex, (q.xz + vec2(0.0, 0.3)) * 0.11 + q.y * 0.03).r - h0) / 0.3 * 0.9;
        float h1 = texture2D(noiseTex, vW.xz * 0.9 + 0.4).g;
        g += vec2(texture2D(noiseTex, vW.xz * 0.9 + vec2(0.404, 0.4)).g - h1, texture2D(noiseTex, vW.xz * 0.9 + vec2(0.4, 0.404)).g - h1) / 0.004 * 0.0025;
        kN = normalize(normalize(vWN) - vec3(g.x, 0.0, g.y) * 0.12);`,
      band: SNOW_BAND_GLSL,
    });
    const kPrev = snowMat.onBeforeCompile;
    snowMat.onBeforeCompile = (shader, r) => {
      kPrev(shader, r);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(kN, 0.0)).xyz);');
    };
    for (const kick of this.kickers) {
      const mesh = new THREE.Mesh(this.kickerGeometry(kick), snowMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      for (const side of [-1, 1]) {
        const c = kick.o.clone().addScaledVector(kick.f, kick.L).addScaledVector(kick.r, side * (kick.W / 2 + sideRun(kick) + 0.6));
        this.addFlag(c.x, c.y, side > 0 ? 0 : 1);
        if (kick.signature && kick.name !== 'S') this.addCrowd(kick.o.clone().addScaledVector(kick.f, kick.L + 10), kick.f, kick.r, side, kick.name === 'L' ? 14 : 8);
      }
    }
    const s0 = this.at(18);
    const label = (this.course?.name || 'Valcrest Gully').toUpperCase();
    this.addBanner(s0.p, s0.dir, `${label}  ·  SEND IT`);
    const s1 = this.at(this.course.finishAt);
    this.addBanner(s1.p, s1.dir, 'FINISH  ·  FINISH  ·  FINISH');
    this.addFogPockets();
    this.buildSpectators();
    this.buildFlags();
  }

  /** Height of park features at x/z (null if none). */
  heightAt(x, z, base) {
    for (const k of this.kickers) {
      if (x < k.box[0] || x > k.box[1] || z < k.box[2] || z > k.box[3]) continue;
      const dx = x - k.o.x, dz = z - k.o.y;
      const a = dx * k.f.x + dz * k.f.y;
      if (a < 0 || a > k.L) continue;
      const b = Math.abs(dx * k.r.x + dz * k.r.y);
      if (b > k.W / 2 + sideRun(k)) continue;
      const side = sideFactor(k, b);
      const shape = k.H * Math.pow(a / k.L, 1.7) * side;
      const g = this.terrain.baseHeight(k.o.x + k.f.x * a, k.o.y + k.f.y * a);
      return Math.max(base, g + shape);
    }
    return null;
  }

  kickerGeometry(k) {
    const T = this.terrain;
    const nA = 16, nB = 20;
    const pos = [], col = [], idx = [];
    const hw = k.W / 2, sr = sideRun(k);
    // Across-ramp samples: denser on the rounded sidewalls.
    const across = (j) => {
      const t = j / nB * 2 - 1, s = Math.sign(t), u = Math.abs(t);
      return s * (u < 0.4 ? (u / 0.4) * hw : hw + ((u - 0.4) / 0.6) * (sr + 0.1));
    };
    const vert = (a, b, lift, aG = a) => {
      const x = k.o.x + k.f.x * aG + k.r.x * b, z = k.o.y + k.f.y * aG + k.r.y * b;
      const side = Math.max(0, sideFactor(k, Math.abs(b)));
      const g = T.baseHeight(k.o.x + k.f.x * a, k.o.y + k.f.y * a);
      const y = (lift ? g + k.H * Math.pow(a / k.L, 1.7) * side : T.baseHeight(x, z) - 0.3) + 0.03;
      pos.push(x, y, z);
      const lip = a > k.L - 0.35 && lift ? 1 : 0;
      col.push(lip ? 0.86 : 1.0, lip ? 0.92 : 1.0, lip ? 1.0 : 1.0);   // icy, blue-ish lip
    };
    for (let i = 0; i <= nA; i++) for (let j = 0; j <= nB; j++) vert((i / nA) * k.L, across(j), true);
    for (let i = 0; i < nA; i++) for (let j = 0; j < nB; j++) {
      const a = i * (nB + 1) + j;
      idx.push(a, a + 1, a + nB + 1, a + 1, a + nB + 2, a + nB + 1);
    }
    // Front wall under the lip.
    const base = pos.length / 3;
    // Knuckle face under the lip: steep but not vertical (shovelled back at ~70°).
    for (let j = 0; j <= nB; j++) {
      const b = across(j);
      vert(k.L, b, true);
      vert(k.L, b, false, k.L + k.H * 0.35);
    }
    for (let j = 0; j < nB; j++) {
      const a = base + j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // ---------------------------------------------------------------- flags & banners
  addFlag(x, z, variant) {
    this.flagPoles.push({ x, z, variant });
  }

  buildFlags() {
    const T = this.terrain;
    const poleG = new THREE.CylinderGeometry(0.05, 0.06, 4.2, 6);
    poleG.translate(0, 2.1, 0);
    const poleMat = toonMaterial({ name: 'pole', color: 0x2a2f45 });
    const poles = new THREE.InstancedMesh(poleG, poleMat, this.flagPoles.length);
    const flagG = new THREE.PlaneGeometry(1.4, 0.95, 12, 6);
    flagG.translate(0.7, 3.6, 0);
    const tex = brandTexture();
    const flagMat = toonMaterial({
      name: 'flag', map: tex, side: THREE.DoubleSide,
      vertPre: /* glsl */`
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
        #else
          vec3 ip = vec3(0.0);
        #endif
        float along = max(position.x, 0.0);
        transformed.z += sin(position.x * 3.2 - uTime * 7.0 + ip.x) * 0.16 * along;
        transformed.y += sin(position.x * 2.1 - uTime * 5.0 + ip.z) * 0.04 * along;`,
    });
    const flags = new THREE.InstancedMesh(flagG, flagMat, this.flagPoles.length);
    const m = new THREE.Matrix4();
    this.flagPoles.forEach((f, i) => {
      const y = T.getHeight(f.x, f.z);
      m.makeRotationY(0.9 + i);
      m.setPosition(f.x, y - 0.1, f.z);
      poles.setMatrixAt(i, m);
      flags.setMatrixAt(i, m);
    });
    for (const im of [poles, flags]) { im.castShadow = true; im.computeBoundingSphere(); this.group.add(im); }
    this.obstaclePoints = this.flagPoles.map((f) => [f.x, f.z, 0.15, 'flag']);
  }

  addBanner(p, dir, text) {
    const T = this.terrain;
    const r = new THREE.Vector2(-dir.y, dir.x);
    const width = 16;
    const yaw = Math.atan2(-r.y, r.x);
    const poleG = new THREE.CylinderGeometry(0.12, 0.14, 7, 8);
    poleG.translate(0, 3.5, 0);
    const poleMat = toonMaterial({ name: 'bannerPole', color: 0x2a2f45 });
    for (const s of [-1, 1]) {
      const c = p.clone().addScaledVector(r, s * width / 2);
      const pole = new THREE.Mesh(poleG, poleMat);
      pole.position.set(c.x, T.getHeight(c.x, c.y) - 0.2, c.y);
      pole.castShadow = true;
      this.group.add(pole);
      this.flagPoles.push({ x: c.x, z: c.y, variant: 0, skip: true });
    }
    const g = new THREE.PlaneGeometry(width, 1.6, 24, 4);
    const mat = toonMaterial({
      name: 'banner', map: bannerTexture(text), side: THREE.DoubleSide,
      vertPre: 'float edge = 1.0 - pow(abs(position.x) / 8.0, 2.0);\ntransformed.z += sin(position.x * 0.9 - uTime * 3.0) * 0.18 * edge;',
    });
    const banner = new THREE.Mesh(g, mat);
    banner.position.set(p.x, T.getHeight(p.x, p.y) + 6.0, p.y);
    banner.rotation.y = yaw;
    banner.castShadow = true;
    this.group.add(banner);
    this.flagPoles = this.flagPoles.filter((f) => !f.skip);
  }

  // ---------------------------------------------------------------- spectators
  addCrowd(center, dir, r, side, count) {
    this.crowd = this.crowd || [];
    const rnd = mulberry32(this.crowd.length + 17);
    for (let i = 0; i < count; i++) {
      const along = (i / count - 0.5) * 22 + (rnd() - 0.5) * 2;
      const out = 7 + rnd() * 4;
      const c = center.clone().addScaledVector(dir, along).addScaledVector(r, side * out);
      this.crowd.push({ x: c.x, z: c.y, v: Math.floor(rnd() * 4), phase: rnd() * 6.28, speed: 3 + rnd() * 3 });
    }
  }

  buildSpectators() {
    const list = this.crowd || [];
    if (!list.length) return;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(list.length * 3), data = new Float32Array(list.length * 3);
    list.forEach((s, i) => {
      off.set([s.x, this.terrain.getHeight(s.x, s.z) - 0.05, s.z], i * 3);
      data.set([s.v, s.phase, s.speed], i * 3);
    });
    geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('aData', new THREE.InstancedBufferAttribute(data, 3));
    geo.instanceCount = list.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: crowdAtlas() }, uTime: globals.uTime },
      vertexShader: /* glsl */`
        attribute vec3 aOffset; attribute vec3 aData;
        uniform float uTime;
        varying vec2 vUv; varying float vVar;
        void main() {
          float bob = abs(sin(uTime * aData.z + aData.y)) * 0.22;
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 p = aOffset + right * position.x * 1.15 + vec3(0.0, position.y * 1.9 + bob, 0.0);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          vUv = uv; vVar = aData.x;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D atlas; varying vec2 vUv; varying float vVar;
        void main() {
          vec4 c = texture2D(atlas, vec2((vVar + vUv.x) / 4.0, vUv.y));
          if (c.a < 0.5) discard;
          gl_FragColor = vec4(c.rgb * 1.7, c.a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    this.group.add(mesh);
  }

  // ---------------------------------------------------------------- valley fog
  addFogPockets() {
    const T = this.terrain;
    const rnd = mulberry32(77);
    const pts = [];
    for (let k = 0; k < 400 && pts.length < 26; k++) {
      const x = (rnd() - 0.5) * T.size * 0.9, z = (rnd() - 0.5) * T.size * 0.9;
      const h = T.baseHeight(x, z);
      if (h < ATMOSPHERE.mistTop - 150) pts.push([x, h + 25 + rnd() * 30, z, 140 + rnd() * 160]);
    }
    if (!pts.length) return;
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    geo.setAttribute('aFog', new THREE.InstancedBufferAttribute(new Float32Array(pts.flat()), 4));
    geo.instanceCount = pts.length;
    const mat = new THREE.ShaderMaterial({
      uniforms: { noise: { value: null }, uTime: globals.uTime, uMistTeal: { value: new THREE.Color(...ATMO.hor.side) }, uMistDeep: { value: new THREE.Color(...ATMO.hor.away).multiplyScalar(0.85) } },
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute vec4 aFog; uniform float uTime; varying vec2 vP; varying float vFade; varying float vSeed;
        void main() {
          vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
          vec3 up = vec3(0.0, 1.0, 0.0);
          vec3 p = aFog.xyz + right * position.x * aFog.w + up * position.y * aFog.w * 0.32;
          vP = position.xy; vSeed = aFog.x * 0.01;
          float d = length(cameraPosition - aFog.xyz);
          vFade = smoothstep(aFog.w * 0.4, aFog.w * 1.4, d);
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime; uniform vec3 uMistTeal; uniform vec3 uMistDeep; varying vec2 vP; varying float vFade; varying float vSeed;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
        void main() {
          float r = length(vP * vec2(1.0, 1.6));
          float n = n2(vP * 2.5 + vec2(uTime * 0.03 + vSeed, vSeed)) * 0.6 + n2(vP * 5.0 - uTime * 0.05) * 0.4;
          float a = smoothstep(1.0, 0.2, r + (n - 0.5) * 0.5) * 0.5 * vFade;
          vec3 c = mix(uMistDeep, uMistTeal, smoothstep(-0.6, 0.7, vP.y + (n - 0.5) * 0.4));
          gl_FragColor = vec4(c, a);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.renderOrder = 2;
    this.group.add(mesh);
  }
}

// ---------------------------------------------------------------- canvas art (fictional brands)
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function brandTexture() {
  return canvasTex(256, 176, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#ff2fa8'); grad.addColorStop(1, '#ff8a3d');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#1a1446'; g.fillRect(0, h * 0.62, w, h * 0.38);
    g.fillStyle = '#fff'; g.font = 'bold italic 54px sans-serif'; g.textAlign = 'center';
    g.fillText('NORTH', w / 2, h * 0.5);
    g.fillStyle = '#2ff5d6'; g.font = 'bold 40px sans-serif';
    g.fillText('WAKE', w / 2, h * 0.92);
  });
}

function bannerTexture(text = 'SEND IT') {
  return canvasTex(1024, 104, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#1b1550'); grad.addColorStop(0.5, '#3b2a8c'); grad.addColorStop(1, '#1b1550');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = '#2ff5d6'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
    g.fillStyle = '#ffffff'; g.font = 'bold italic 62px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

function crowdAtlas() {
  return canvasTex(512, 256, (g) => {
    const jackets = ['#ff3d7f', '#2ff5d6', '#ffb02e', '#7a5cff'];
    for (let i = 0; i < 4; i++) {
      const x0 = i * 128;
      const cx = x0 + 64;
      g.lineCap = 'round';
      g.strokeStyle = '#151a33'; g.lineWidth = 22;
      // arms up, cheering
      g.beginPath(); g.moveTo(cx - 20, 130); g.lineTo(cx - 44, 70 + i * 6); g.stroke();
      g.beginPath(); g.moveTo(cx + 20, 130); g.lineTo(cx + 46, 66 + i * 5); g.stroke();
      g.strokeStyle = jackets[i]; g.lineWidth = 14;
      g.beginPath(); g.moveTo(cx - 20, 130); g.lineTo(cx - 44, 70 + i * 6); g.stroke();
      g.beginPath(); g.moveTo(cx + 20, 130); g.lineTo(cx + 46, 66 + i * 5); g.stroke();
      // legs
      g.fillStyle = '#151a33';
      g.fillRect(cx - 24, 190, 20, 60); g.fillRect(cx + 4, 190, 20, 60);
      g.fillStyle = '#2b3150';
      g.fillRect(cx - 21, 192, 14, 56); g.fillRect(cx + 7, 192, 14, 56);
      // body
      g.fillStyle = '#151a33'; roundRect(g, cx - 32, 112, 64, 88, 18); g.fill();
      g.fillStyle = jackets[i]; roundRect(g, cx - 27, 117, 54, 78, 14); g.fill();
      g.fillStyle = '#ffffff'; g.fillRect(cx - 27, 150, 54, 6);
      // head + beanie
      g.fillStyle = '#151a33'; g.beginPath(); g.arc(cx, 90, 27, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f2c7a5'; g.beginPath(); g.arc(cx, 92, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = jackets[(i + 2) % 4]; g.beginPath(); g.arc(cx, 84, 23, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, 58, 8, 0, Math.PI * 2); g.fill();
    }
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export { outlineMaterial };
