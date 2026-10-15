// SprayEmitter — equipment-agnostic snow spray.
//
// Each frame, call   spray.emit(contacts, dt, ctx)   with the edges currently touching the snow:
//   contacts: Array<{
//     position:  THREE.Vector3   world position of the contact (edge under the binding / ski centre)
//     direction: THREE.Vector3   unit vector along the edge, pointing where the equipment points (nose)
//     edgeAngle: number          radians the base is rolled off flat; > 0 = rolled onto its RIGHT edge
//                                (turning right), < 0 = left edge. Spray is thrown to the opposite side.
//     load:      number          share of the rider's weight on this contact (≈ 0..1, > 1 under g-load)
//     speed:     number          m/s of the contact over the snow
//     id?:       any             stable key per contact (defaults to its index) — used to measure slip
//   }>
//   ctx (optional): { powder: 0..1 snow softness, normal: THREE.Vector3 ground normal, wind: THREE.Vector2 m/s }
// The emitter measures each contact's real motion between frames, so skidding (moving sideways
// relative to `direction`) throws far more snow than a clean carve. Snow type scales everything:
// powder → big lingering backlit clouds and deep plumes; hardpack → a thin crisp sheet + ice chips.
//
// One-shot bursts: landing(pos, impact, powder), stopFan(pos, dir, speed, powder), puff(pos, n, powder),
// crash(pos, powder). Rendering: instanced camera-facing quads, lit by the sun with a forward-scattering
// phase (backlit spray glows), sky fill, baked mountain shadows, soft fade where they meet the snow.
// Tunables: SPRAY in scene.js. Quality: setQuality(0|1|2) scales particle budget and the mist.
import * as THREE from 'three';
import { SPRAY } from '../scene.js';
import { globals, SUN_COLOR } from '../world.js';
import { skyIrradiance, groundIrradiance } from './atmosphere.js';

export const K_MIST = 0, K_SHEET = 1, K_CHUNK = 2, K_GLINT = 3;
const _v = new THREE.Vector3(), _p = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(0, 1, 0);

export class SprayEmitter {
  constructor(scene, terrain, quality = 2) {
    this.terrain = terrain;
    this.cap = SPRAY.maxParticles;
    const n = this.cap;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.grow = new Float32Array(n);
    this.kind = new Uint8Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.dens = new Float32Array(n);
    this.seed = new Float32Array(n);
    this.slide = new Uint8Array(n);   // 1 = sluff: slides down the slope on the snow surface
    this._n = new THREE.Vector3();
    this.alive = 0;
    this.next = 0;
    this.acc = new Map();
    this.prev = new Map();
    this.budget = 1;
    this.wind = new THREE.Vector2(...SPRAY.wind);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);  // xyz, size
    this.iVel = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage);  // vel xyz, kind
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4).setUsage(THREE.DynamicDrawUsage); // alpha, density, seed, age
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iVel', this.iVel);
    geo.setAttribute('iData', this.iData);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,   // premultiplied
      uniforms: {
        uSunDir: globals.uSunDir, uSunCol: { value: SUN_COLOR.clone() }, uSky: { value: skyIrradiance().multiplyScalar(0.8).add(groundIrradiance().multiplyScalar(0.35)) },   // sky + snow bounce
        sunMaskTex: globals.sunMaskTex, terrainSize: globals.terrainSize,
        hmap: { value: terrain.heightTex }, hres: { value: terrain.res }, hspacing: { value: terrain.spacing },
        puff: { value: makePuffAtlas() }, uTime: globals.uTime,
        uPhase: { value: new THREE.Vector3(SPRAY.forwardG, SPRAY.forwardMix, SPRAY.albedo) },
      },
      vertexShader: /* glsl */`
        attribute vec4 iPos; attribute vec4 iVel; attribute vec4 iData;
        uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uPhase;
        uniform sampler2D sunMaskTex; uniform float terrainSize;
        uniform sampler2D hmap; uniform float hres; uniform float hspacing;
        varying vec2 vQ; varying float vA; varying float vKind; varying vec3 vLit; varying vec3 vAmb; varying float vSeed; varying float vDens; varying float vGlint;
        float hg(float g, float mu) { float g2 = g * g; return (1.0 - g2) / pow(1.0 + g2 - 2.0 * g * mu, 1.5); }
        float groundAt(vec2 xz) {
          vec2 f = (xz + terrainSize * 0.5) / hspacing;
          vec2 uv = (f + 0.5) / hres;
          return texture2D(hmap, uv).r;
        }
        void main() {
          float size = iPos.w; float kind = iVel.w;
          // (never read varyings back in the vertex shader: some ANGLE/SwiftShader paths drop the draw)
          float alpha = iData.x, dens = iData.y, seed = iData.z;
          vDens = dens; vSeed = seed; vKind = kind; vQ = position.xy;
          vec4 c = viewMatrix * vec4(iPos.xyz, 1.0);
          vec3 vv = (viewMatrix * vec4(iVel.xyz, 0.0)).xyz;
          float sp = length(vv.xy);
          vec2 dir = sp > 1e-3 ? vv.xy / sp : vec2(0.0, 1.0);
          // Per-kind quad shape (branch-free): sheets/glints stretch along their motion, mist spins slowly.
          float isSheet = step(0.5, kind) * step(kind, 1.5);
          float isGlint = step(2.5, kind);
          float isMist = step(kind, 0.5);
          float isChunk = step(1.5, kind) * step(kind, 2.5);
          float stretchF = 1.0 + isSheet * min(sp * 0.07, 2.2) + isGlint * min(sp * 0.05, 1.5) + isChunk * min(sp * 0.04, 1.2);
          float thinF = mix(1.0, 0.6, isSheet);
          float ang = seed * 6.28 + iData.w * (seed - 0.5) * 0.8;
          dir = normalize(mix(dir, vec2(cos(ang), sin(ang)), isMist) + vec2(1e-4, 0.0));
          vec2 perp = vec2(dir.y, -dir.x);   // keeps the quad front-facing
          c.xy += dir * (position.y * size * stretchF) + perp * (position.x * size * thinF);
          gl_Position = projectionMatrix * c;
          // Lighting: sun (mountain shadow mask, forward-scattering phase) + sky fill.
          vec2 muv = (iPos.xz + terrainSize * 0.5) / terrainSize;
          float sunVis = (muv.x < 0.0 || muv.y < 0.0 || muv.x > 1.0 || muv.y > 1.0) ? 1.0 : texture2D(sunMaskTex, muv).r;
          vec3 V = normalize(iPos.xyz - cameraPosition);
          float mu = dot(V, uSunDir);
          float phase = min(mix(1.0, hg(uPhase.x, mu) / hg(uPhase.x, 0.0), uPhase.y), 2.6);
          // Dense parts self-shadow; thin mist scatters forward the most.
          float selfSh = mix(1.0, 0.45, dens);
          if (kind > 1.5 && kind < 2.5) { phase = 0.8 + 0.6 * max(-mu, 0.0); selfSh = 1.0; }     // chunks: diffuse clumps
          vLit = uSunCol * sunVis * phase * selfSh * uPhase.z;
          vAmb = uSky * uPhase.z;
          vGlint = sunVis * pow(max(mu, 0.0), 2.0);
          // Soft particles: fade where the quad sinks into the snow.
          float hag = iPos.y - groundAt(iPos.xz);
          vA = alpha * clamp((hag + size * 0.35) / max(size * 0.7, 0.05), 0.0, 1.0);
          vA *= smoothstep(0.6, 2.2, -c.z);   // never smear a puff across the lens
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D puff; uniform float uTime;
        varying vec2 vQ; varying float vA; varying float vKind; varying vec3 vLit; varying vec3 vAmb; varying float vSeed; varying float vDens; varying float vGlint;
        void main() {
          float a; vec3 col;
          float r = length(vQ);
          if (vKind < 0.5) {
            // Mist: noisy puff from the atlas (4 variants), edges eaten by the noise.
            vec2 cell = vec2(step(0.5, fract(vSeed * 7.0)), step(0.5, fract(vSeed * 13.0)));
            vec2 uv = (vQ * 0.5 + 0.5) * 0.5 + cell * 0.5;
            float t = texture2D(puff, uv).r;
            a = t * vA;
            float shade = mix(1.0, 0.7 + 0.3 * t, vDens);
            col = vLit * shade + vAmb;
          } else if (vKind < 1.5) {
            // Sheet: fine powder streak — a noisy puff stretched along its motion.
            vec2 cell = vec2(step(0.5, fract(vSeed * 5.0)), step(0.5, fract(vSeed * 11.0)));
            float t = texture2D(puff, (vQ * 0.5 + 0.5) * 0.5 + cell * 0.5).r;
            a = t * smoothstep(1.0, 0.4, r) * vA;
            col = vLit * (0.85 + 0.25 * t) + vAmb;
          } else if (vKind < 2.5) {
            // Chunk: lumpy lit ball.
            float th = atan(vQ.y, vQ.x);
            float lump = r * (1.0 + 0.16 * sin(th * 3.0 + vSeed * 30.0) + 0.08 * sin(th * 7.0 + vSeed * 11.0));
            a = smoothstep(1.0, 0.6, lump) * vA;
            vec3 n = normalize(vec3(vQ, sqrt(max(0.0, 1.0 - r * r))));
            float l = clamp(dot(n, normalize(vec3(0.4, 0.6, 0.7))) * 0.6 + 0.5, 0.0, 1.0);
            col = vLit * l + vAmb * (0.85 + 0.15 * n.y);
          } else {
            // Glint: tiny crystal catching the sun.
            a = smoothstep(1.0, 0.0, r) * vA;
            float tw = 0.4 + 0.6 * fract(sin(vSeed * 91.7 + uTime * 23.0) * 43758.5);
            col = vLit + vAmb + vec3(1.0, 0.97, 0.9) * vGlint * tw * 12.0;
          }
          if (a < 0.004) discard;
          gl_FragColor = vec4(col * a, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.name = 'SnowSpray';
    scene.add(this.mesh);
    this.setQuality(quality);
  }

  setQuality(q) {
    this.budget = [0.35, 0.65, 1.0][q] ?? 1;
    this.mistScale = [0.6, 0.85, 1.0][q] ?? 1;
  }

  spawn(kind, p, v, size, life, opts = {}) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = v.x; this.vel[k + 1] = v.y; this.vel[k + 2] = v.z;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size; this.kind[i] = kind;
    this.grow[i] = opts.grow ?? (kind === K_MIST ? 2.2 : 0);
    this.drag[i] = opts.drag ?? [1.6, 1.1, 0.35, 1.4][kind];
    this.grav[i] = opts.grav ?? [0.15, 7.0, 9.0, 2.5][kind];
    this.dens[i] = opts.dens ?? 0.5;
    this.seed[i] = Math.random();
    this.slide[i] = opts.slide ? 1 : 0;
  }

  /** Accumulate fractional emission per key; returns the whole number of particles to spawn now. */
  count(key, rate, dt) {
    const a = (this.acc.get(key) || 0) + rate * dt * this.budget;
    const n = Math.floor(a);
    this.acc.set(key, a - n);
    return n;
  }

  /** Continuous spray from the contact points (see the header for the shape). */
  emit(contacts, dt, ctx = {}) {
    if (dt <= 0) return;
    const S = SPRAY;
    const powder = ctx.powder ?? 0.5;
    const nrm = ctx.normal ?? _u;
    const seen = new Set();
    contacts.forEach((c, idx) => {
      const id = c.id ?? idx;
      seen.add(id);
      const prev = this.prev.get(id);
      const vel = prev ? _v.subVectors(c.position, prev).divideScalar(dt) : _v.copy(c.direction).multiplyScalar(c.speed);
      if (prev) prev.copy(c.position); else this.prev.set(id, c.position.clone());
      if (vel.length() > 60) vel.copy(c.direction).multiplyScalar(c.speed);   // teleport guard
      const speed = c.speed;
      if (speed < 0.8) return;
      const dir = c.direction;
      const right = _r.crossVectors(dir, nrm).normalize();        // right-hand side of the edge
      const lat = vel.dot(right);                                  // sideways motion (skid)
      const edge = Math.abs(c.edgeAngle);
      const side = c.edgeAngle >= 0 ? -1 : 1;                      // thrown away from the biting edge
      const load = Math.max(0, c.load);
      const skid = Math.min(1, Math.abs(lat) / Math.max(3, speed) * 1.6);
      const carve = Math.min(1, Math.sin(Math.min(edge, 1.2)) * 1.4) * Math.min(1, speed / 9);
      const soft = 0.25 + 0.75 * powder;
      // Throw: mostly sideways out of the turn, up, and trailing behind the contact.
      const out = _p.copy(right).multiplyScalar(side);
      const throwV = (k, up, back) => {
        const t = new THREE.Vector3().copy(out).multiplyScalar(k)
          .addScaledVector(nrm, up).addScaledVector(dir, -back)
          .addScaledVector(vel, S.inherit);
        t.x += (Math.random() - 0.5) * 1.2; t.y += (Math.random() - 0.5) * 0.8; t.z += (Math.random() - 0.5) * 1.2;
        return t;
      };
      const at = (spread) => new THREE.Vector3().copy(c.position)
        .addScaledVector(dir, (Math.random() - 0.5) * spread).addScaledVector(out, 0.05 + Math.random() * 0.12).addScaledVector(nrm, 0.04);
      const intensity = load * (carve * (0.6 + 0.4 * soft) + skid * 1.6) * Math.min(1.6, speed / 10);
      // Rooster-tail sheet off the edge on hard carves / skids.
      let n = this.count(`${id}s`, S.sheetRate * intensity * (0.5 + 0.5 * soft), dt);
      for (let i = 0; i < n; i++) {
        const k = speed * (0.18 + Math.random() * 0.22) * (0.6 + carve * 0.7 + skid * 0.6);
        const up = speed * (0.12 + Math.random() * 0.2) * (0.5 + carve) + 0.8;
        this.spawn(K_SHEET, at(0.9), throwV(k, up, speed * 0.1), (0.1 + Math.random() * 0.14) * (0.7 + soft * 0.6), S.sheetLife * (0.6 + Math.random() * 0.6), { dens: 0.6 });
      }
      // Clumps / ice chips.
      n = this.count(`${id}c`, S.chunkRate * intensity, dt);
      for (let i = 0; i < n; i++) {
        const k = speed * (0.1 + Math.random() * 0.25) * (0.5 + skid);
        this.spawn(K_CHUNK, at(0.8), throwV(k, speed * (0.08 + Math.random() * 0.18) + 1.0, speed * 0.05), (0.012 + Math.random() * Math.random() * 0.045) * (0.6 + soft * 0.8), 0.5 + Math.random() * 0.5);
      }
      // Glittering crystals.
      n = this.count(`${id}g`, S.glintRate * (0.15 + intensity) * Math.min(1, speed / 6), dt);
      for (let i = 0; i < n; i++) {
        this.spawn(K_GLINT, at(1.0), throwV(speed * 0.15 * Math.random(), 0.6 + Math.random() * 1.6, speed * 0.1), 0.012 + Math.random() * 0.02, 0.5 + Math.random() * 0.7);
      }
      // Powder cloud: lingers behind and drifts with the wind; grows with speed and softness.
      const mistRate = S.mistRate * this.mistScale * (powder * powder * Math.min(1, speed / 7) * (0.35 + 0.65 * load) + intensity * soft * 0.7);
      n = this.count(`${id}m`, mistRate, dt);
      for (let i = 0; i < n; i++) {
        const k = speed * (0.05 + Math.random() * 0.12) * (0.3 + carve + skid);
        const v = throwV(k, 0.4 + Math.random() * (0.6 + carve * 1.2), 0).multiplyScalar(0.8);
        v.x += this.wind.x * 0.3; v.z += this.wind.y * 0.3;
        this.spawn(K_MIST, at(1.2), v, (0.22 + Math.random() * 0.3) * (0.6 + powder * 0.6), S.mistLife * (0.6 + Math.random() * 0.6), { dens: 0.2 + 0.4 * Math.random(), grow: 1.6 + powder * 1.8 });
      }
    });
    // Sluff: on steep soft slopes, turns release loose snow that pours downhill on the surface.
    const steep = 1 - nrm.y;
    if (contacts.length && powder > 0.35 && steep > 0.07) {
      const c0 = contacts[0];
      const turn = contacts.reduce((m, c) => Math.max(m, Math.abs(c.edgeAngle)), 0);
      const rate = SPRAY.sluffRate * powder * Math.min(1, (steep - 0.07) * 7) * (0.3 + Math.min(1, turn * 1.5)) * Math.min(1, c0.speed / 6);
      const n = this.count('sluff', rate, dt);
      const down = new THREE.Vector3(nrm.x, 0, nrm.z).normalize();
      for (let i = 0; i < n; i++) {
        const p = new THREE.Vector3().copy(c0.position).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, 0.1, (Math.random() - 0.5) * 1.6));
        const v = down.clone().multiplyScalar(1.5 + Math.random() * 2.5).addScaledVector(c0.direction, c0.speed * 0.15);
        if (Math.random() < 0.3) this.spawn(K_CHUNK, p, v, 0.03 + Math.random() * 0.05, 2.0 + Math.random() * 1.5, { slide: true, drag: 0.9, grav: 0 });
        else this.spawn(K_MIST, p, v, 0.18 + Math.random() * 0.22, 2.2 + Math.random() * 1.6, { slide: true, drag: 0.9, grav: 0, dens: 0.65, grow: 1.4 });
      }
    }
    for (const id of this.prev.keys()) if (!seen.has(id)) this.prev.delete(id);
  }

  /** Landing: ring of mist + chunks scaled by impact speed (m/s into the slope). */
  landing(pos, impact, powder = 0.5) {
    const n = Math.round(Math.min(90, 10 + impact * 7) * this.budget * (0.5 + powder));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (1.5 + Math.random() * 2.5) * (0.5 + impact * 0.12);
      _v.set(Math.cos(a) * sp, 0.6 + Math.random() * (1.2 + impact * 0.15), Math.sin(a) * sp);
      _p.copy(pos).add(_r.set(Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4));
      if (i % 3 === 0) this.spawn(K_CHUNK, _p, _v.clone().multiplyScalar(1.3), 0.015 + Math.random() * 0.035, 0.6 + Math.random() * 0.4);
      else this.spawn(K_MIST, _p, _v, (0.3 + Math.random() * 0.4) * (0.6 + powder), SPRAY.mistLife * (0.5 + Math.random() * 0.5), { dens: 0.3 + Math.random() * 0.4, grow: 1.6 + powder * 1.5 });
    }
  }

  /** Hard stop: a big fan of snow thrown forward/sideways from the edge. */
  stopFan(pos, dir, speed, powder = 0.5, side = 1) {
    const right = _r.crossVectors(dir, _u).normalize();
    const n = Math.round(SPRAY.stopBurst * this.budget * Math.min(1.5, speed / 10));
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * 1.6;
      const d = new THREE.Vector3().copy(dir).multiplyScalar(Math.cos(a) * 0.8).addScaledVector(right, Math.sin(a) + side * 0.6)
        .add(new THREE.Vector3(0, 0.35 + Math.random() * 0.55, 0)).normalize();
      const v = d.multiplyScalar(speed * (0.3 + Math.random() * 0.45));
      const p = new THREE.Vector3().copy(pos).addScaledVector(dir, 0.3).add(new THREE.Vector3(0, 0.08, 0));
      const r = Math.random();
      if (r < 0.45) this.spawn(K_SHEET, p, v, 0.08 + Math.random() * 0.12, 0.6 + Math.random() * 0.5, { dens: 0.6 });
      else if (r < 0.65) this.spawn(K_CHUNK, p, v, 0.015 + Math.random() * 0.04, 0.7 + Math.random() * 0.5);
      else this.spawn(K_MIST, p, v.multiplyScalar(0.5), (0.25 + Math.random() * 0.35) * (0.6 + powder * 0.6), SPRAY.mistLife * (0.5 + Math.random() * 0.5), { dens: 0.45, grow: 1.2 + powder });
    }
  }

  /** Small takeoff / generic puff. */
  puff(pos, count, powder = 0.5, speed = 2) {
    const n = Math.round(count * this.budget);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      _v.set(Math.cos(a) * speed * Math.random(), 0.5 + Math.random() * speed * 0.6, Math.sin(a) * speed * Math.random());
      this.spawn(K_MIST, _p.copy(pos).add(_r.set(0, 0.15, 0)), _v, (0.25 + Math.random() * 0.35) * (0.6 + powder), SPRAY.mistLife * 0.6 * (0.6 + Math.random() * 0.6), { dens: 0.3, grow: 1.5 + powder });
    }
  }

  crash(pos, powder = 0.6) {
    this.landing(pos, 14, powder);
    this.puff(pos, 40, powder, 4);
  }

  update(dt) {
    let count = 0;
    const ip = this.iPos.array, iv = this.iVel.array, id = this.iData.array;
    const wx = this.wind.x, wz = this.wind.y;
    const T = this.terrain;
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      const kind = this.kind[i];
      const d = Math.exp(-this.drag[i] * dt);
      if (this.slide[i]) {
        // Sluff: gravity along the local slope, hugging the snow surface.
        const nn = T.getNormal(this.pos[k], this.pos[k + 2], 1.5, this._n);
        const gt = 9.81 * 0.55;
        this.vel[k] += nn.x * nn.y * gt * dt; this.vel[k + 2] += nn.z * nn.y * gt * dt;
        this.vel[k] *= d; this.vel[k + 2] *= d;
        this.pos[k] += this.vel[k] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
        this.pos[k + 1] = T.getHeight(this.pos[k], this.pos[k + 2]) + this.size0[i] * (kind === K_MIST ? 0.6 : 1.0);
        this.vel[k + 1] = 0;
      } else {
      this.vel[k + 1] -= this.grav[i] * dt;
      if (kind === K_MIST) {   // mist relaxes toward the wind
        this.vel[k] = wx + (this.vel[k] - wx) * d; this.vel[k + 2] = wz + (this.vel[k + 2] - wz) * d; this.vel[k + 1] *= d;
      } else {
        this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      }
      const t = 1 - this.life[i] / this.max[i];
      // Heavy particles stop at the snow surface (sheet/chunks die a little after touching down).
      if (kind !== K_MIST && !this.slide[i]) {
        const g = T.getHeight(this.pos[k], this.pos[k + 2]);
        if (this.pos[k + 1] < g) {
          this.pos[k + 1] = g;
          this.vel[k] *= 0.3; this.vel[k + 1] = 0; this.vel[k + 2] *= 0.3;
          this.life[i] = Math.min(this.life[i], 0.12);
        }
      }
      let size = this.size0[i], alpha;
      if (kind === K_MIST) {
        size *= 1 + this.grow[i] * Math.sqrt(t);
        alpha = SPRAY.mistAlpha * Math.min(1, t * 8) * (1 - t) * (1 - t * 0.3);
      } else if (kind === K_SHEET) {
        size *= 1 + t * 0.8;
        alpha = SPRAY.sheetAlpha * Math.min(1, t * 12) * (1 - t * t);
      } else if (kind === K_CHUNK) {
        alpha = Math.min(1, (1 - t) * 4);
      } else {
        alpha = (1 - t * t) * 0.9;
      }
      const o = count * 4;
      ip[o] = this.pos[k]; ip[o + 1] = this.pos[k + 1]; ip[o + 2] = this.pos[k + 2]; ip[o + 3] = size;
      iv[o] = this.vel[k]; iv[o + 1] = this.vel[k + 1]; iv[o + 2] = this.vel[k + 2]; iv[o + 3] = kind;
      id[o] = alpha; id[o + 1] = this.dens[i]; id[o + 2] = this.seed[i]; id[o + 3] = t * this.max[i];
      count++;
    }
    this.alive = count;
    this.geo.instanceCount = count;
    for (const a of [this.iPos, this.iVel, this.iData]) { a.clearUpdateRanges(); a.addUpdateRange(0, count * 4); a.needsUpdate = true; }
  }
}

/** 2×2 atlas of soft, lumpy powder puffs (fbm-eroded discs), generated once. */
function makePuffAtlas(size = 256) {
  const data = new Uint8Array(size * size * 4);
  const half = size / 2;
  let s = 1234;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const grid = 16;
  const g = Array.from({ length: 4 * 3 }, () => new Float32Array((grid + 1) * (grid + 1)).map(() => rnd()));
  const vn = (arr, x, y, cells) => {
    const fx = x * cells, fy = y * cells;
    const i = Math.floor(fx), j = Math.floor(fy);
    let tx = fx - i, ty = fy - j; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const W = grid + 1, at = (a, b) => arr[((b % grid) * W) + (a % grid)];
    return (at(i, j) * (1 - tx) + at(i + 1, j) * tx) * (1 - ty) + (at(i, j + 1) * (1 - tx) + at(i + 1, j + 1) * tx) * ty;
  };
  for (let v = 0; v < 4; v++) {
    const ox = (v % 2) * half, oy = Math.floor(v / 2) * half;
    for (let y = 0; y < half; y++) for (let x = 0; x < half; x++) {
      const u = x / half, w = y / half;
      const dx = u - 0.5, dy = w - 0.5;
      const r = Math.hypot(dx, dy) * 2;
      const n = vn(g[v * 3], u, w, 4) * 0.55 + vn(g[v * 3 + 1], u, w, 8) * 0.3 + vn(g[v * 3 + 2], u, w, 16) * 0.15;
      let a = Math.max(0, 1 - r * r) ;
      a = Math.max(0, Math.min(1, (a * 1.1 - (1 - n) * 0.55) * 1.25));
      a = a * a * (3 - 2 * a);
      const i = ((oy + y) * size + ox + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(a * 255); data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
