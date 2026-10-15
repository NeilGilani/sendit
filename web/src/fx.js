// FXManager — snow particles in three tiers (cruising fog trail, carving wedges, braking fan),
// landing rings and jump pops, proximity speed lines on close shaves, and a persistent top-down
// track render-texture that the terrain shader carves into the snow.
import * as THREE from 'three';
import { FX, PHYSICS } from './config.js';
import { State } from './player.js';
import { globals } from './world.js';
import { on, emit } from './state.js';

const KIND_PUFF = 0, KIND_WEDGE = 1, KIND_LINE = 2, KIND_GRAIN = 3;

export class FXManager {
  constructor(player, renderer, scene) {
    this.player = player;
    this.renderer = renderer;
    this.n = FX.maxParticles;
    const n = this.n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.kind = new Float32Array(n);
    this.drag = new Float32Array(n);
    this.grav = new Float32Array(n);
    this.next = 0;
    this.acc = { cruise: 0, carve: 0, brake: 0, lines: 0, grain: 0 };

    // Instanced camera-facing quads; wedges and lines stretch along their screen-space velocity.
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iVel = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iData = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage); // size, alpha, kind
    geo.setAttribute('iPos', this.iPos);
    geo.setAttribute('iVel', this.iVel);
    geo.setAttribute('iData', this.iData);
    geo.instanceCount = 0;
    this.geo = geo;
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uLit: { value: new THREE.Color(1.0, 0.99, 0.97) }, uShade: { value: new THREE.Color(0.7, 0.77, 0.9) }, uSunDir: globals.uSunDir },
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iData;
        varying vec2 vQ; varying float vA; varying float vKind; varying float vShade;
        uniform vec3 uSunDir;
        void main() {
          float size = iData.x; vA = iData.y; vKind = iData.z; vQ = position.xy;
          vec4 c = viewMatrix * vec4(iPos, 1.0);
          vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
          vec2 dir = length(vv.xy) > 1e-3 ? normalize(vv.xy) : vec2(0.0, 1.0);
          vec2 perp = vec2(-dir.y, dir.x);
          bool isLine = abs(vKind - 2.0) < 0.5, isGrain = vKind > 2.5;
          float stretch = vKind < 0.5 ? 1.0 : (isGrain ? 1.0 + min(length(vv) * 0.05, 1.2) : (vKind < 1.5 ? 1.0 + min(length(vv) * 0.09, 2.5) : 1.0 + min(length(vv) * 0.12, 10.0)));
          float thin = isLine ? 0.04 : 1.0;
          vec2 off = dir * position.y * size * stretch + perp * position.x * size * thin * (vKind > 0.5 && vKind < 1.5 ? 0.55 : 1.0);
          c.xy += off;
          vShade = 0.5 + 0.5 * dot(normalize(vec3(position.xy, 0.6)), normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz));
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying float vA; varying float vKind; varying float vShade;
        uniform vec3 uLit; uniform vec3 uShade;
        void main() {
          float a;
          if (vKind > 2.5) a = smoothstep(1.0, 0.15, length(vQ));                      // sugar grain
          else if (vKind < 0.5) a = smoothstep(1.0, 0.3, length(vQ));                  // soft puff
          else if (vKind < 1.5) a = smoothstep(1.0, 0.6, abs(vQ.x) + max(vQ.y, 0.0) * 0.8) * smoothstep(-1.0, -0.6, vQ.y); // wedge
          else a = smoothstep(1.0, 0.0, abs(vQ.x)) * (1.0 - abs(vQ.y));              // speed line
          a *= vA;
          if (a < 0.01) discard;
          // Two-tone cel shading on snow particles; lines are pure white.
          vec3 col = vKind > 2.5 ? mix(uLit, vec3(1.15), vA) : (vKind > 1.5 ? vec3(1.0) : mix(uShade, uLit, smoothstep(0.3, 0.6, vShade)));
          gl_FragColor = vec4(col, a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);

    this.track = new TrackMap(renderer);
    globals.uTrackMap.value = this.track.texture;

    on('jumped', (depth) => this.burst(this.player.renderPos, 18 + depth * 30, 2.5 + depth * 2, 0.9, 0.5));
    on('landed', ({ impact, perfect }) => {
      if (impact > 2) this.ring(this.player.renderPos, Math.min(FX.landBurst, 30 + impact * 9), 3 + impact * 0.5);
      if (perfect) this.ring(this.player.renderPos, 120, 9);
    });
    on('hardBrake', () => this.brakeFan(FX.brakeBurst));
    on('crashed', () => this.burst(this.player.renderPos, 90, 4, 1.4, 0.8));
    on('nearMiss', (e) => {
      this.acc.lines += FX.speedLineCount * 0.25;
      if (e?.kind === 'tree') this.treePlop(e.x, e.z);
    });
  }

  spawn(p, v, size, life, kind, drag = 2.0, grav = 2.5) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size; this.kind[i] = kind;
    this.drag[i] = drag; this.grav[i] = grav;
  }

  burst(at, count, speed, life, size) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      v.set(Math.cos(a) * speed * Math.random(), 1 + Math.random() * speed * 0.8, Math.sin(a) * speed * Math.random());
      this.spawn(at.clone().add(new THREE.Vector3(0, 0.2, 0)), v.clone(), size * (0.6 + Math.random() * 0.8), life * (0.7 + Math.random() * 0.6), KIND_PUFF);
    }
  }

  ring(at, count, speed) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2 + Math.random() * 0.1;
      v.set(Math.cos(a) * speed, 0.6 + Math.random() * 1.2, Math.sin(a) * speed);
      this.spawn(at.clone().add(new THREE.Vector3(Math.cos(a) * 0.4, 0.15, Math.sin(a) * 0.4)), v.clone(), 0.35 + Math.random() * 0.3, 0.7 + Math.random() * 0.4, KIND_WEDGE, 4.5, 3.0);
    }
  }

  /** Snow sliding off a branch you brushed past: a clump of puffs tumbling down. */
  treePlop(x, z) {
    const T = this.player.terrain;
    const y = T.getHeight(x, z) + 2.5 + Math.random() * 3;
    for (let k = 0; k < 26; k++) {
      const p = new THREE.Vector3(x + (Math.random() - 0.5) * 1.6, y + Math.random() * 1.2, z + (Math.random() - 0.5) * 1.6);
      const v = new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.2 - Math.random() * 0.6, (Math.random() - 0.5) * 0.8);
      this.spawn(p, v, k < 8 ? 0.5 + Math.random() * 0.4 : 0.05 + Math.random() * 0.06, 1.2 + Math.random() * 0.8, k < 8 ? KIND_PUFF : KIND_GRAIN, 0.8, 3.5);
    }
    emit('treePlop', { x, y, z });
  }

  brakeFan(count) {
    const pl = this.player;
    const fwd = pl.forward();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    for (let k = 0; k < count; k++) {
      const a = (Math.random() - 0.5) * 2.2;  // wide fan in front of / around the board
      const dir = fwd.clone().multiplyScalar(Math.cos(a)).addScaledVector(side, Math.sin(a)).add(new THREE.Vector3(0, 0.35 + Math.random() * 0.5, 0)).normalize();
      const v = dir.multiplyScalar(3 + Math.random() * 6).addScaledVector(pl.velocity, 0.5);
      this.spawn(pl.renderPos.clone().addScaledVector(fwd, 0.5).add(new THREE.Vector3(0, 0.1, 0)), v, 0.3 + Math.random() * 0.35, FX.brakeLife * (0.6 + Math.random() * 0.6), KIND_WEDGE, 2.5, 3.0);
    }
  }

  update(dt, camera) {
    this.time = (this.time || 0) + dt;
    const pl = this.player;
    const ground = pl.state === State.GROUNDED;
    const ratio = pl.speedRatio;
    const fwd = pl.forward();
    const back = fwd.clone().negate();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const powder = pl.surface.y + pl.surface.w * 0.6 + pl.surface.x * 0.35;

    const pw = pl.powder ?? powder;
    const carve = Math.abs(pl.turnInput) * Math.min(1, pl.speed / 8);
    const out = side.clone().multiplyScalar(-Math.sign(pl.turnInput || 1));
    // Sugar spray: a constant stream of fine glittering grains kicked up off both skis.
    if (ground && pl.speed > 1.2) {
      this.acc.grain += FX.grainRate * (0.2 + ratio) * (0.35 + pw * 0.65) * (1 + carve * 2.2) * dt;
      while (this.acc.grain >= 1) {
        this.acc.grain -= 1;
        const sk = Math.random() < 0.5 ? -1 : 1;
        const p = pl.renderPos.clone().addScaledVector(side, sk * 0.13).addScaledVector(back, 0.3 + Math.random() * 0.6)
          .add(new THREE.Vector3((Math.random() - 0.5) * 0.15, 0.04, (Math.random() - 0.5) * 0.15));
        const v = back.clone().multiplyScalar(0.6 + Math.random() * 1.8).add(new THREE.Vector3((Math.random() - 0.5) * 1.3, 1.2 + Math.random() * 2.2 * (0.4 + pw), (Math.random() - 0.5) * 1.3))
          .addScaledVector(out, carve * (1.5 + Math.random() * 3.5)).addScaledVector(pl.velocity, 0.35);
        this.spawn(p, v, 0.05 + Math.random() * 0.07, FX.grainLife * (0.5 + Math.random() * 0.8), KIND_GRAIN, 1.6, 6.5);
      }
      // Soft powder clouds hanging behind the skis.
      this.acc.cruise += FX.puffRate * pw * (0.25 + ratio) * (1 + carve) * dt;
      while (this.acc.cruise >= 1) {
        this.acc.cruise -= 1;
        const p = pl.renderPos.clone().addScaledVector(back, 0.5 + Math.random() * 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.12, (Math.random() - 0.5) * 0.5));
        const v = pl.velocity.clone().multiplyScalar(0.2).add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.5)).addScaledVector(out, carve * 1.2);
        this.spawn(p, v, 0.6 + Math.random() * 0.7, FX.cruiseLife * (0.6 + Math.random() * 0.6), KIND_PUFF, 1.4, 0.25);
      }
    }
    // Carving: a sheet of snow thrown out of the turn.
    if (ground && carve > 0.3 && pl.speed > 4) {
      this.acc.carve += FX.carveRate * (carve - 0.25) * dt * (0.5 + pw * 0.8);
      while (this.acc.carve >= 1) {
        this.acc.carve -= 1;
        const dir = out.clone().multiplyScalar(0.9).addScaledVector(back, 0.4 + Math.random() * 0.4).add(new THREE.Vector3(0, 0.4 + Math.random() * 0.5, 0)).normalize();
        const v = dir.multiplyScalar(FX.carveSpeed * (0.4 + Math.random() * 0.5)).addScaledVector(pl.velocity, 0.4);
        const p = pl.renderPos.clone().addScaledVector(out, 0.15).addScaledVector(fwd, (Math.random() - 0.5) * 1.0).add(new THREE.Vector3(0, 0.06, 0));
        this.spawn(p, v, 0.12 + Math.random() * 0.14, FX.carveLife * (0.7 + Math.random() * 0.6), KIND_WEDGE, 1.8, 6.0);
      }
    }
    // Tier 3 — braking: continuous fan while scrubbing speed hard.
    if (ground && pl.brake > 0.5 && pl.speed > 6) {
      this.acc.brake += 70 * pl.brake * ratio * dt;
      if (this.acc.brake >= 1) { const c = Math.floor(this.acc.brake); this.acc.brake -= c; this.brakeFan(c); }
    }
    // Proximity speed lines: close shaves (and top speed) stream white lines past the camera.
    const near = pl.nearDist !== undefined && pl.nearDist < FX.nearMissRadius ? 1 - pl.nearDist / FX.nearMissRadius : 0;
    this.acc.lines += (near * 140 + Math.max(0, ratio - 0.85) * 120) * dt;
    if (camera && this.acc.lines >= 1) {
      const cf = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      const cr = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
      const cu = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
      while (this.acc.lines >= 1) {
        this.acc.lines -= 1;
        const a = Math.random() * Math.PI * 2;
        const r = 1.6 + Math.random() * 2.6;
        const p = camera.position.clone().addScaledVector(cf, 8 + Math.random() * 14).addScaledVector(cr, Math.cos(a) * r).addScaledVector(cu, Math.sin(a) * r * 0.7);
        const v = cf.clone().multiplyScalar(-(40 + Math.random() * 30)).addScaledVector(pl.velocity, 0.9);
        this.spawn(p, v, 0.9 + Math.random() * 0.6, FX.speedLineLife, KIND_LINE, 0, 0);
      }
    }

    // Simulate & upload
    let count = 0;
    const ip = this.iPos.array, iv = this.iVel.array, id = this.iData.array;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k3 = i * 3;
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[k3 + 1] -= this.grav[i] * dt;
      this.vel[k3] *= d; this.vel[k3 + 1] *= d; this.vel[k3 + 2] *= d;
      this.pos[k3] += this.vel[k3] * dt; this.pos[k3 + 1] += this.vel[k3 + 1] * dt; this.pos[k3 + 2] += this.vel[k3 + 2] * dt;
      const t = 1 - this.life[i] / this.max[i];
      const kind = this.kind[i];
      const size = kind === KIND_PUFF ? this.size0[i] * (0.5 + t * 1.2) : this.size0[i] * (1 - t * 0.5);
      let alpha = kind === KIND_LINE ? 0.55 * Math.sin(t * Math.PI) : (kind === KIND_PUFF ? 0.42 : 0.85) * (1 - t) * Math.min(1, t * 10);
      if (kind === KIND_GRAIN) alpha = (1 - t * t) * (0.55 + 0.45 * Math.sin(i * 12.9898 + this.time * 31.0));
      const o = count * 3;
      ip[o] = this.pos[k3]; ip[o + 1] = this.pos[k3 + 1]; ip[o + 2] = this.pos[k3 + 2];
      iv[o] = this.vel[k3]; iv[o + 1] = this.vel[k3 + 1]; iv[o + 2] = this.vel[k3 + 2];
      id[o] = size; id[o + 1] = alpha; id[o + 2] = kind;
      count++;
    }
    this.geo.instanceCount = count;
    for (const a of [this.iPos, this.iVel, this.iData]) { a.clearUpdateRanges(); a.addUpdateRange(0, count * 3); a.needsUpdate = true; }

    // Persistent tracks: two crisp ski grooves inside a shallow trough pushed through the powder.
    if (pl.state === State.CRASH) this.track.stamp('body', pl.renderPos, pl.heading, 1.2, 1);
    else if (ground) {
      const h = pl.heading, pwr = pl.powder ?? 1;
      const wedge = pl.brake;
      for (const sk of [-1, 1]) {
        const at = pl.renderPos.clone().addScaledVector(side, sk * (FX.skiSpacing * 0.5 + wedge * 0.1));
        this.track.stamp(sk < 0 ? 'L' : 'R', at, h + sk * wedge * 0.28, FX.trackWidth + wedge * 0.12, 1.0);
      }
      if (pwr > 0.2) this.track.stamp('plow', pl.renderPos, h, FX.plowWidth, FX.plowStrength * pwr);
    }
    this.track.flush(pl.renderPos);
  }
}

/** Top-down render texture of carved tracks around the rider; recentres without losing history. */
class TrackMap {
  constructor(renderer) {
    this.renderer = renderer;
    const opts = { type: THREE.UnsignedByteType, format: THREE.RGBAFormat, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter, depthBuffer: false };
    this.size = FX.trackMapSize;
    this.meters = FX.trackMapMeters;
    this.rt = [new THREE.WebGLRenderTarget(this.size, this.size, opts), new THREE.WebGLRenderTarget(this.size, this.size, opts)];
    this.cur = 0;
    this.center = new THREE.Vector2(1e9, 1e9);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.stamps = [];
    this.last = null;
    // Stamp: an oriented soft-edged board footprint drawn straight into clip space (MAX blending).
    const stampGeo = new THREE.InstancedBufferGeometry();
    stampGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    stampGeo.setIndex([0, 1, 2, 0, 2, 3]);
    this.iStamp = new THREE.InstancedBufferAttribute(new Float32Array(512 * 4), 4).setUsage(THREE.DynamicDrawUsage); // x, z, heading, width
    this.iStr = new THREE.InstancedBufferAttribute(new Float32Array(512 * 2), 2).setUsage(THREE.DynamicDrawUsage);   // length, strength
    stampGeo.setAttribute('iStamp', this.iStamp);
    stampGeo.setAttribute('iStr', this.iStr);
    this.stampGeo = stampGeo;
    this.region = { value: new THREE.Vector3(0, 0, this.meters) };
    const stampMat = new THREE.ShaderMaterial({
      uniforms: { region: this.region },
      depthTest: false, depthWrite: false, transparent: true,
      side: THREE.DoubleSide,   // the world-xz → texture mapping mirrors the quads
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      vertexShader: /* glsl */`
        attribute vec4 iStamp; attribute vec2 iStr; uniform vec3 region; varying vec2 vQ; varying float vS;
        void main() {
          vec2 f = vec2(-sin(iStamp.z), -cos(iStamp.z));
          vec2 r = vec2(-f.y, f.x);
          vec2 w = iStamp.xy + r * position.x * iStamp.w * 0.5 + f * position.y * iStr.x * 0.5;
          vQ = position.xy; vS = iStr.y;
          gl_Position = vec4((w - region.xy) / (region.z * 0.5), 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying float vS;
        void main() { float a = smoothstep(1.0, 0.4, abs(vQ.x)) * smoothstep(1.0, 0.85, abs(vQ.y)); gl_FragColor = vec4(vec3(a * vS), 1.0); }`,
    });
    this.stampMesh = new THREE.Mesh(stampGeo, stampMat);
    this.stampMesh.frustumCulled = false;
    this.stampScene = new THREE.Scene();
    this.stampScene.add(this.stampMesh);
    // Recentre copy pass.
    this.copyMat = new THREE.ShaderMaterial({
      uniforms: { src: { value: null }, shift: { value: new THREE.Vector2() } },
      depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D src; uniform vec2 shift; varying vec2 vUv;
        void main() { vec2 u = vUv + shift; float inside = step(0.0, u.x) * step(0.0, u.y) * step(u.x, 1.0) * step(u.y, 1.0);
          gl_FragColor = vec4(texture2D(src, u).rgb * inside, 1.0); }`,
    });
    this.copyScene = new THREE.Scene();
    this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMat));
    this.clear();
  }

  get texture() { return this.rt[this.cur].texture; }

  clear() {
    const r = this.renderer;
    const prev = r.getRenderTarget();
    for (const t of this.rt) { r.setRenderTarget(t); r.setClearColor(0x000000, 1); r.clear(); }
    r.setRenderTarget(prev);
  }

  stamp(key, p, heading, width, strength) {
    const cur = new THREE.Vector2(p.x, p.z);
    this.lastBy = this.lastBy || {};
    const last = this.lastBy[key];
    if (last && last.distanceTo(cur) < 0.12) return;
    const len = last && last.distanceTo(cur) < 4 ? last.distanceTo(cur) + 0.45 : 0.5;
    const mid = last && last.distanceTo(cur) < 4 ? last.clone().add(cur).multiplyScalar(0.5) : cur;
    // Orient along the path the ski actually travelled (not its heading) so skidded turns stay smooth.
    if (last && last.distanceTo(cur) < 4) heading = Math.atan2(-(cur.x - last.x), -(cur.y - last.y));
    this.lastBy[key] = cur;
    if (this.stamps.length < 512) this.stamps.push([mid.x, mid.y, heading, width, len, strength]);
  }

  flush(p) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevAuto = r.autoClear;
    r.autoClear = false;
    // Recentre when the rider drifts toward the edge: copy history with an offset (ping-pong).
    const c = new THREE.Vector2(p.x, p.z);
    if (this.center.distanceTo(c) > this.meters * 0.25) {
      const old = this.center.clone();
      const next = new THREE.Vector2(Math.round(p.x / 4) * 4, Math.round(p.z / 4) * 4);
      const src = this.rt[this.cur], dst = this.rt[1 - this.cur];
      if (old.x < 1e8) {
        this.copyMat.uniforms.src.value = src.texture;
        this.copyMat.uniforms.shift.value.set((next.x - old.x) / this.meters, (next.y - old.y) / this.meters);
        r.setRenderTarget(dst);
        r.render(this.copyScene, this.cam);
      } else {
        r.setRenderTarget(dst); r.setClearColor(0x000000, 1); r.clear();
      }
      this.cur = 1 - this.cur;
      this.center.copy(next);
      this.region.value.set(next.x, next.y, this.meters);
      globals.uTrackRegion.value.set(next.x, next.y, this.meters);
      globals.uTrackMap.value = this.texture;
    }
    if (this.stamps.length) {
      const a = this.iStamp.array, b = this.iStr.array;
      this.stamps.forEach((s, i) => { a.set([s[0], s[1], s[2], s[3]], i * 4); b.set([s[4], s[5]], i * 2); });
      this.stampGeo.instanceCount = this.stamps.length;
      this.iStamp.needsUpdate = true; this.iStr.needsUpdate = true;
      r.setRenderTarget(this.rt[this.cur]);
      r.render(this.stampScene, this.cam);
      this.stamps.length = 0;
    }
    r.setRenderTarget(prevTarget);
    r.autoClear = prevAuto;
  }
}

void PHYSICS;
