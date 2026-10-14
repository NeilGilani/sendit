// Ski grooves left in the snow, gentle powder spray + landing puffs, and optional light snowfall.
import * as THREE from 'three';
import { State } from './skier.js';
import { on } from './state.js';
import { SUN_DIR, withWorld } from './world.js';

const MAX_PTS = 700;

export class SkiTrails {
  constructor(skier, terrain) {
    this.skier = skier; this.terrain = terrain;
    this.left = []; this.right = [];
    this.last = new THREE.Vector3(1e9, 0, 0);
    this.wasGround = false;
    const maxV = MAX_PTS * 2 * 12;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(maxV * 3);
    this.nor = new Float32Array(maxV * 3);
    this.alpha = new Float32Array(maxV);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setDrawRange(0, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0xaebcd9, roughness: 0.8, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    withWorld(mat, {
      vertPars: 'attribute float aAlpha; varying float vAlpha;', vert: 'vAlpha = aAlpha;',
      fragPars: 'varying float vAlpha;', frag: 'diffuseColor.a *= vAlpha;', skyAO: false,
    });
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.dirty = false;
    on('respawned', () => this.clear());
    on('liftArrived', () => this.clear());
  }

  clear() { this.left = []; this.right = []; this.last.set(1e9, 0, 0); this.dirty = true; }

  update() {
    const s = this.skier;
    if (s.state !== State.GROUNDED) { this.wasGround = false; return; }
    const p = s.position;
    if (p.distanceTo(this.last) < 0.4) return;
    const brk = !this.wasGround;
    this.wasGround = true;
    this.last.copy(p);
    const n = s.groundNormal.clone();
    const fwd = s.forward();
    const side = new THREE.Vector3().crossVectors(fwd, n).normalize();
    const strength = Math.min(1, 0.35 + s.speed * 0.05) * (1 - 0.45 * s.skid);
    const across = s.velocity.length() > 0.5 ? new THREE.Vector3().crossVectors(s.velocity, n).normalize() : side;
    const half = 0.045 * (1 + s.skid * 2);
    for (const [k, arr] of [[-1, this.left], [1, this.right]]) {
      const q = p.clone().addScaledVector(side, 0.12 * k);
      q.y = this.terrain.getHeight(q.x, q.z) + 0.03;
      arr.push({ p: q, x: across.clone().multiplyScalar(half), n, strength, brk });
      if (arr.length > MAX_PTS) arr.shift();
    }
    this.dirty = true;
  }

  rebuild() {
    if (!this.dirty) return;
    this.dirty = false;
    let v = 0;
    const push = (p, n, a) => {
      this.pos[v * 3] = p.x; this.pos[v * 3 + 1] = p.y; this.pos[v * 3 + 2] = p.z;
      this.nor[v * 3] = n.x; this.nor[v * 3 + 1] = n.y; this.nor[v * 3 + 2] = n.z;
      this.alpha[v] = a; v++;
    };
    const tmpN = new THREE.Vector3();
    for (const arr of [this.left, this.right]) {
      const count = arr.length;
      for (let i = 1; i < count; i++) {
        const a = arr[i - 1], b = arr[i];
        if (b.brk) continue;
        const fa = smooth(0, 0.45, i / count) * a.strength * 0.75, fb = smooth(0, 0.45, (i + 1) / count) * b.strength * 0.75;
        // Three columns: wall, floor, wall — walls tilt so the groove catches the low sun.
        const cols = [-1, 0, 1];
        for (let c = 0; c < 2; c++) {
          const c0 = cols[c], c1 = cols[c + 1];
          const A0 = a.p.clone().addScaledVector(a.x, c0), A1 = a.p.clone().addScaledVector(a.x, c1);
          const B0 = b.p.clone().addScaledVector(b.x, c0), B1 = b.p.clone().addScaledVector(b.x, c1);
          const nA0 = tmpN.copy(a.n).addScaledVector(a.x, -c0 * 6).normalize().clone();
          const nA1 = a.n.clone().addScaledVector(a.x, -c1 * 6).normalize();
          const nB0 = b.n.clone().addScaledVector(b.x, -c0 * 6).normalize();
          const nB1 = b.n.clone().addScaledVector(b.x, -c1 * 6).normalize();
          const aa0 = c0 === 0 ? fa : 0, aa1 = c1 === 0 ? fa : 0, ab0 = c0 === 0 ? fb : 0, ab1 = c1 === 0 ? fb : 0;
          push(A0, nA0, aa0); push(B0, nB0, ab0); push(A1, nA1, aa1);
          push(A1, nA1, aa1); push(B0, nB0, ab0); push(B1, nB1, ab1);
        }
      }
    }
    this.geo.setDrawRange(0, v);
    for (const k of ['position', 'normal', 'aAlpha']) {
      const at = this.geo.attributes[k];
      at.clearUpdateRanges(); at.addUpdateRange(0, v * at.itemSize); at.needsUpdate = true;
    }
  }
}

function smooth(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// ---------------------------------------------------------------- particles
const PARTICLE_VERT = /* glsl */`
attribute float aSize; attribute float aAlpha;
varying float vAlpha;
uniform float pixelScale;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * pixelScale / max(-mv.z, 0.1);
  vAlpha = aAlpha;
}`;
const PARTICLE_FRAG = /* glsl */`
varying float vAlpha;
uniform vec3 tint;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(tint, a);
}`;

export class PowderSpray {
  constructor(skier, renderer) {
    this.skier = skier;
    this.n = 500;
    this.p = new Float32Array(this.n * 3); this.v = new Float32Array(this.n * 3);
    this.life = new Float32Array(this.n); this.max = new Float32Array(this.n); this.size0 = new Float32Array(this.n);
    this.size = new Float32Array(this.n); this.alpha = new Float32Array(this.n);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    // Snow lit by the warm sun, with a cool ambient share.
    const tint = new THREE.Color(1.0, 0.86, 0.74).multiplyScalar(2.2).add(new THREE.Color(0.35, 0.45, 0.6));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { pixelScale: { value: 400 }, tint: { value: tint } },
      vertexShader: PARTICLE_VERT, fragmentShader: PARTICLE_FRAG, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.next = 0;
    this.acc = 0;
    on('landed', ({ impact }) => { if (impact > 1.5) this.burst(Math.min(70, impact * 9)); });
  }

  spawn(pos, vel, size, life) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.p.set([pos.x, pos.y, pos.z], i * 3); this.v.set([vel.x, vel.y, vel.z], i * 3);
    this.life[i] = life; this.max[i] = life; this.size0[i] = size;
  }

  burst(count) {
    const s = this.skier;
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (0.8 + Math.random() * 2), 0.6 + Math.random() * 1.8, Math.sin(a) * (0.8 + Math.random() * 2));
      this.spawn(s.renderPos.clone().add(new THREE.Vector3(0, 0.15, 0)), v.add(s.velocity.clone().multiplyScalar(0.3)), 0.5 + Math.random() * 0.5, 1.2 + Math.random() * 0.8);
    }
  }

  update(dt, height) {
    const s = this.skier;
    this.mat.uniforms.pixelScale.value = height * 0.9;
    const ground = s.state === State.GROUNDED || s.state === State.CRASH;
    const powder = s.surface.y + s.surface.x * 0.35;
    let intensity = (s.skid * 1.1 + Math.abs(s.carve) * 0.35) * Math.min(1, s.speed / 12) * powder;
    if (s.state === State.CRASH) intensity = 0.8;
    this.acc += ground ? intensity * 180 * dt : 0;
    if (this.acc > 0) {
      const fwd = s.forward();
      const sideV = new THREE.Vector3(-fwd.z, 0, fwd.x).multiplyScalar(Math.sign(s.carve || 1));
      while (this.acc >= 1) {
        this.acc -= 1;
        const dir = fwd.clone().negate().addScaledVector(sideV, 0.8 * Math.abs(s.carve) + (Math.random() - 0.5) * 0.6)
          .add(new THREE.Vector3(0, 0.45 + Math.random() * 0.5, 0)).normalize();
        const p = s.renderPos.clone().addScaledVector(sideV, 0.15).add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.08, (Math.random() - 0.5) * 0.4));
        this.spawn(p, dir.multiplyScalar(1 + Math.random() * 2.4).addScaledVector(s.velocity, 0.55), 0.25 + Math.random() * 0.35, 0.8 + Math.random() * 0.7);
      }
    }
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      const k = i * 3;
      this.v[k + 1] -= 2.2 * dt;
      const damp = Math.exp(-2.2 * dt);
      this.v[k] *= damp; this.v[k + 1] *= damp; this.v[k + 2] *= damp;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const t = 1 - this.life[i] / this.max[i];
      this.size[i] = this.size0[i] * (0.35 + 0.65 * t) * 1.6;
      this.alpha[i] = 0.5 * (1 - t) * Math.min(1, t * 8);
    }
    for (const k of ['position', 'aSize', 'aAlpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

export class Snowfall {
  constructor() {
    const n = 7000, box = 60;
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = Math.random() * box; pos[i * 3 + 1] = Math.random() * box; pos[i * 3 + 2] = Math.random() * box; seed[i] = Math.random(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    this.uniforms = { time: { value: 0 }, center: { value: new THREE.Vector3() }, box: { value: box }, pixelScale: { value: 400 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        attribute float aSeed; uniform float time; uniform vec3 center; uniform float box; uniform float pixelScale;
        varying float vA;
        void main() {
          vec3 p = position + vec3(sin(time * 0.3 + aSeed * 30.0) * 0.8 + time * 0.25, -time * (0.7 + aSeed * 0.5), cos(time * 0.27 + aSeed * 17.0) * 0.8);
          p = mod(p - center, box) - box * 0.5 + center;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (0.03 + aSeed * 0.03) * pixelScale / max(-mv.z, 0.1);
          vA = smoothstep(box * 0.5, box * 0.25, length(p - center)) * 0.85;
        }`,
      fragmentShader: /* glsl */`
        varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(1.6, 1.5, 1.45), a); }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  update(dt, camera, height) {
    if (!this.points.visible) return;
    this.uniforms.time.value += dt;
    this.uniforms.center.value.copy(camera.position);
    this.uniforms.pixelScale.value = height * 0.9;
  }
}

export { SUN_DIR };
