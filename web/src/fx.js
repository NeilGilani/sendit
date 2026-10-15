// FXManager — snow spray (gfx/spray.js: rooster tails, lingering backlit powder clouds, chunks,
// glints, hard-stop fans, landing puffs), proximity speed lines on close shaves, and a persistent
// top-down track render texture that the terrain shader carves into the snow (deep in powder,
// shallow on hardpack).
//
// Contact points: the spray is equipment-agnostic. Each frame we hand it a list of
// { position, direction, edgeAngle, load, speed } (see gfx/spray.js). If the rider exposes
// `rider.getContactPoints()` (snowboard), pass it via fx.setContactSource(() => rider.getContactPoints());
// otherwise the two skis are derived from PlayerPhysics fields (contactsFromSkis below).
import * as THREE from 'three';
import { FX, PHYSICS } from './config.js';
import { State } from './player.js';
import { globals } from './world.js';
import { on, settings } from './state.js';
import { SprayEmitter } from './gfx/spray.js';

const KIND_LINE = 2;
const UP = new THREE.Vector3(0, 1, 0);

/** Derive two ski contacts from the player (edge roll from the turn's lean angle, wedge/skid from brake). */
export function contactsFromSkis(pl, out = []) {
  const fwd = pl.forward(new THREE.Vector3());
  const n = pl.groundNormal || UP;
  const right = new THREE.Vector3().crossVectors(fwd, n).normalize();
  // Lean angle that balances the turn: tan(φ) = v·ω / g. Right turn → ω < 0 → right edge (> 0).
  const lean = Math.atan(pl.speed * -(pl.turnVelocity || 0) / PHYSICS.gravity);
  const edge = THREE.MathUtils.clamp(lean, -1.15, 1.15);
  const turnSide = Math.sign(edge || pl.turnInput || 0);
  // Skid / brake: the skis swing across the travel direction (that slip is what throws the snow).
  const skidAng = THREE.MathUtils.clamp((pl.skid || 0) * 0.9 + (pl.brake || 0) * 0.5, 0, 1.2) * (turnSide || 1);
  const half = 0.13 + (pl.brake || 0) * 0.08;
  const outside = Math.min(0.3, Math.abs(edge) * 0.35);
  for (let i = 0; i < 2; i++) {
    const s = i === 0 ? -1 : 1;                               // -1 left ski, +1 right ski
    const c = out[i] || (out[i] = { position: new THREE.Vector3(), direction: new THREE.Vector3(), edgeAngle: 0, load: 0.5, speed: 0, id: i ? 'skiR' : 'skiL' });
    c.position.copy(pl.renderPos).addScaledVector(right, s * half);
    // Wedge: each ski toes in a little when braking; skidding rotates both skis toward the turn.
    const toe = -(pl.brake || 0) * 0.28 * s;
    c.direction.copy(fwd).applyAxisAngle(n, -skidAng + toe).normalize();
    c.edgeAngle = (pl.brake || 0) > 0.3 && Math.abs(edge) < 0.2 ? -s * 0.5 * pl.brake : edge;   // snowplough: inside edges
    // The outside ski carries more weight in a turn (outside = left ski in a right turn).
    c.load = 0.5 + (s === -turnSide ? outside : -outside);
    c.speed = pl.speed;
  }
  out.length = 2;
  return out;
}

export class FXManager {
  constructor(player, renderer, scene) {
    this.player = player;
    this.renderer = renderer;
    this.n = 600;
    const n = this.n;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.max = new Float32Array(n);
    this.size0 = new Float32Array(n);
    this.next = 0;
    this.acc = { lines: 0 };
    this.contactSource = null;
    this._contacts = [];

    // Speed lines: instanced camera-facing quads stretched along their screen-space velocity.
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
      vertexShader: /* glsl */`
        attribute vec3 iPos; attribute vec3 iVel; attribute vec3 iData;
        varying vec2 vQ; varying float vA;
        void main() {
          float size = iData.x; vA = iData.y; vQ = position.xy;
          vec4 c = viewMatrix * vec4(iPos, 1.0);
          vec3 vv = (viewMatrix * vec4(iVel, 0.0)).xyz;
          vec2 dir = length(vv.xy) > 1e-3 ? normalize(vv.xy) : vec2(0.0, 1.0);
          vec2 perp = vec2(dir.y, -dir.x);   // keeps the quad front-facing
          float stretch = 1.0 + min(length(vv) * 0.12, 10.0);
          c.xy += dir * position.y * size * stretch + perp * position.x * size * 0.04;
          gl_Position = projectionMatrix * c;
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vQ; varying float vA;
        void main() {
          float a = smoothstep(1.0, 0.0, abs(vQ.x)) * (1.0 - abs(vQ.y)) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(1.4), a);
        }`,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);

    this.spray = new SprayEmitter(scene, player.terrain, settings.quality ?? 2);
    this._q = settings.quality;

    this.track = new TrackMap(renderer);
    globals.uTrackMap.value = this.track.texture;

    const pw = () => this.player.powder ?? 0.5;
    on('jumped', (depth) => this.spray.puff(this.player.renderPos, 8 + depth * 22, pw(), 2 + depth * 2));
    on('landed', ({ impact }) => this.spray.landing(this.player.renderPos, impact, pw()));
    on('hardBrake', (speed) => {
      const pl = this.player;
      this.spray.stopFan(pl.renderPos, pl.forward(), speed || pl.speed, pw(), Math.sign(pl.turnInput || 1));
    });
    on('crashed', () => this.spray.crash(this.player.renderPos, pw()));
    on('nearMiss', () => { this.acc.lines += FX.speedLineCount * 0.25; });
  }

  /** Optional: supply contact points from the equipment (e.g. () => rider.getContactPoints()). */
  setContactSource(fn) { this.contactSource = fn; }

  spawnLine(p, v, size, life) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = life; this.max[i] = life; this.size0[i] = size;
  }

  update(dt, camera) {
    this.time = (this.time || 0) + dt;
    const pl = this.player;
    if (settings.quality !== this._q) { this._q = settings.quality; this.spray.setQuality(this._q); }
    const ground = pl.state === State.GROUNDED;
    const ratio = pl.speedRatio;
    const fwd = pl.forward();
    const side = new THREE.Vector3(-fwd.z, 0, fwd.x);

    // Snow spray from whatever is touching the snow.
    if (ground) {
      const contacts = this.contactSource ? this.contactSource() : contactsFromSkis(pl, this._contacts);
      this.spray.emit(contacts, dt, { powder: pl.powder ?? 0.5, normal: pl.groundNormal });
    } else this.spray.emit([], dt);
    this.spray.update(dt);

    // Proximity speed lines: close shaves (and top speed) stream white lines past the camera.
    const near = pl.nearDist !== undefined && pl.nearDist < FX.nearMissRadius ? 1 - pl.nearDist / FX.nearMissRadius : 0;
    this.acc.lines += near * 90 * dt;   // close shaves only (no top-speed streaks in the realistic look)
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
        this.spawnLine(p, v, 0.9 + Math.random() * 0.6, FX.speedLineLife);
      }
    }
    let count = 0;
    const ip = this.iPos.array, iv = this.iVel.array, id = this.iData.array;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k3 = i * 3;
      this.pos[k3] += this.vel[k3] * dt; this.pos[k3 + 1] += this.vel[k3 + 1] * dt; this.pos[k3 + 2] += this.vel[k3 + 2] * dt;
      const t = 1 - this.life[i] / this.max[i];
      const o = count * 3;
      ip[o] = this.pos[k3]; ip[o + 1] = this.pos[k3 + 1]; ip[o + 2] = this.pos[k3 + 2];
      iv[o] = this.vel[k3]; iv[o + 1] = this.vel[k3 + 1]; iv[o + 2] = this.vel[k3 + 2];
      id[o] = this.size0[i]; id[o + 1] = 0.06 * Math.sin(t * Math.PI); id[o + 2] = KIND_LINE;
      count++;
    }
    this.geo.instanceCount = count;
    for (const a of [this.iPos, this.iVel, this.iData]) { a.clearUpdateRanges(); a.addUpdateRange(0, count * 3); a.needsUpdate = true; }

    // Persistent tracks: two grooves inside a trough pushed through the powder. Strength = depth:
    // deep and soft in powder, a shallow scratch on hardpack.
    if (pl.state === State.CRASH) this.track.stamp('body', pl.renderPos, pl.heading, 1.2, 1);
    else if (ground) {
      const h = pl.heading, pwr = pl.powder ?? 1;
      const wedge = pl.brake;
      const depth = 0.22 + 0.78 * pwr;
      if (pl.equipment?.type === 'snowboard') {
        // One wide groove: the board's waist, smeared wider as it skids across the fall line.
        const waist = pl.equipment.spec?.waist ?? 0.25;
        const w = waist + Math.abs(Math.sin(pl.skidAngle || 0)) * 0.6 + (pl.skid || 0) * 0.15;
        this.track.stamp('L', pl.renderPos, h, w, depth);
      } else {
        for (const sk of [-1, 1]) {
          const at = pl.renderPos.clone().addScaledVector(side, sk * (FX.skiSpacing * 0.5 + wedge * 0.1));
          this.track.stamp(sk < 0 ? 'L' : 'R', at, h + sk * wedge * 0.28, FX.trackWidth + wedge * 0.12 + (pl.skid || 0) * 0.15, depth);
        }
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
      // Capsule stamps (a segment with round caps, in metres): consecutive stamps along a curve union
      // seamlessly under MAX blending, so turns leave smooth trenches instead of ladders / dashes.
      vertexShader: /* glsl */`
        attribute vec4 iStamp; attribute vec2 iStr; uniform vec3 region; varying vec2 vM; varying float vS; varying float vHalf; varying float vR;
        void main() {
          vec2 f = vec2(-sin(iStamp.z), -cos(iStamp.z));
          vec2 r = vec2(-f.y, f.x);
          vR = iStamp.w * 0.5; vHalf = iStr.x * 0.5;
          vM = vec2(position.x * vR, position.y * (vHalf + vR));
          vec2 w = iStamp.xy + r * vM.x + f * vM.y;
          vS = iStr.y;
          gl_Position = vec4((w - region.xy) / (region.z * 0.5), 0.0, 1.0);
        }`,
      fragmentShader: /* glsl */`
        varying vec2 vM; varying float vS; varying float vHalf; varying float vR;
        void main() {
          float d = length(vec2(vM.x, max(abs(vM.y) - vHalf, 0.0))) / vR;
          float a = smoothstep(1.0, 0.3, d);   // rounded trench cross-section
          gl_FragColor = vec4(vec3(a * vS), 1.0);
        }`,
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
    const len = last && last.distanceTo(cur) < 4 ? last.distanceTo(cur) : 0.3;
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

