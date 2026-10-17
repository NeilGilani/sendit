// Loading scene particles, all animated on the GPU from per-particle launch data (no per-frame CPU work
// beyond a uniform): camera-facing soft quads in instanced geometry.
//   Powder   a ring-buffer pool: emit() writes origin / velocity / birth / life / size / kind. Mist puffs
//            (heavy drag, they hang and drift), clumps (ballistic, they fall), glints (tiny HDR ice
//            sparks that bloom). Lit by the sun with forward scattering, so backlit powder glows.
//   Snowfall flakes wrapped in a box around the camera, with a circle-of-confusion fake: flakes far
//            from the focus distance grow into soft, faint discs (bokeh), in-focus ones stay crisp dots.
import * as THREE from 'three';

const QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]);
const QIDX = [0, 1, 2, 0, 2, 3];

const POWDER_VERT = /* glsl */`
attribute vec2 corner;
attribute vec3 aOrigin; attribute vec3 aVel; attribute vec4 aLife;   // birth, life, kind, seed
attribute vec2 aSize;
uniform float uTime; uniform vec3 uWindP;
varying vec2 vUv; varying float vA; varying float vKind; varying vec3 vWp; varying float vSeed; varying float vT; varying float vUp;
void main() {
  float t = uTime - aLife.x;
  float kind = aLife.z;
  vKind = kind; vSeed = aLife.w;
  if (t < 0.0 || t > aLife.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vA = 0.0; return; }
  float k = kind < 0.5 ? 2.2 : (kind < 1.5 ? 0.35 : 1.2);   // drag: mist, clump, glint
  vec3 g = vec3(0.0, kind < 0.5 ? -1.2 : -9.81, 0.0);
  vec3 term = g / k + uWindP;
  float e = 1.0 - exp(-k * t);
  vec3 p = aOrigin + term * t + (aVel - term) * e / k;
  float life = t / aLife.y;
  vT = life;
  float s = mix(aSize.x, aSize.y, 1.0 - exp(-t * (kind < 0.5 ? 1.3 : 3.0)));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // Slow roll so puffs never look like stamped sprites.
  float ang = aLife.w * 6.283 + t * (aLife.w - 0.5) * 0.8;
  vec2 c = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * corner;
  mv.xy += c * s;
  vWp = p;
  vUv = corner;
  vUp = corner.y;                         // screen-up across the puff (unrotated): lit top, shaded belly
  // Fade in fast, out slow; clumps fade as they break up.
  vA = smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(kind < 0.5 ? 0.35 : 0.6, 1.0, life));
  gl_Position = projectionMatrix * mv;
}`;

const POWDER_FRAG = /* glsl */`
uniform sampler2D noiseTex; uniform vec3 uSunCol; uniform vec3 uSkyAmb; uniform vec3 uSunDirA; uniform float uOpacity;
varying vec2 vUv; varying float vA; varying float vKind; varying vec3 vWp; varying float vSeed; varying float vT; varying float vUp;
void main() {
  float r = length(vUv);
  if (r > 1.0 || vA <= 0.0) discard;
  vec3 V = normalize(vWp - cameraPosition);
  float mu = dot(V, uSunDirA);
  // Henyey-Greenstein forward lobe (g 0.65) + a soft back lobe.
  float g = 0.65, hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5) / 12.566;
  float a;
  vec3 col;
  if (vKind < 0.5) {
    // Mist puff: cauliflower edge from noise, denser core.
    float n = texture2D(noiseTex, vUv * 0.22 + vSeed * 3.7 + vT * 0.05).r * 0.65 + texture2D(noiseTex, vUv * 0.5 + vSeed * 1.3).g * 0.35;
    a = smoothstep(1.0, 0.15, r + (n - 0.5) * 1.1) * 0.36 * smoothstep(0.25, 0.75, n + 0.15);
    // Self-shadowed volume: sunlit cauliflower tops, a cool sky-lit belly (that contrast is what makes
    // powder read against sunlit snow). Backlit mist glows, capped so a cloud never piles into a disc.
    float lit = smoothstep(-0.7, 0.8, vUp + (n - 0.5) * 0.9);
    col = uSkyAmb * (0.55 + 0.35 * lit) + uSunCol * (0.06 + 0.42 * lit + min(hg * 3.2, 0.9) * (0.4 + 0.6 * lit));
  } else if (vKind < 1.5) {
    a = smoothstep(1.0, 0.55, r) * 0.9;
    col = uSkyAmb * 0.8 + uSunCol * (0.5 + min(hg * 2.5, 0.8));
  } else {
    a = smoothstep(1.0, 0.0, r);
    col = uSunCol * (1.5 + min(hg * 25.0, 6.0)) * (0.5 + 0.5 * sin(vSeed * 90.0 + vT * 60.0));
  }
  a *= vA * uOpacity;
  gl_FragColor = vec4(col * a, a);   // premultiplied
}`;

export class Powder {
  constructor(max, uniforms) {
    this.max = max;
    this.head = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.BufferAttribute(QUAD, 2));
    g.setIndex(QIDX);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.a = { aOrigin: mk(3), aVel: mk(3), aLife: mk(4), aSize: mk(2) };
    for (let i = 0; i < max; i++) this.a.aLife.array[i * 4 + 1] = -1;   // dead
    for (const [k, v] of Object.entries(this.a)) g.setAttribute(k, v);
    g.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uWindP: { value: new THREE.Vector3(0.6, 0, 0.2) }, uOpacity: { value: 1 }, ...uniforms };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: POWDER_VERT, fragmentShader: POWDER_FRAG,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    m.name = 'loadingPowder';
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }

  /** One particle. kind 0 mist, 1 clump, 2 glint. */
  emit(t, o, v, life, s0, s1, kind, seed = Math.random()) {
    const i = this.head;
    this.head = (this.head + 1) % this.max;
    const A = this.a;
    A.aOrigin.array.set([o.x, o.y, o.z], i * 3);
    A.aVel.array.set([v.x, v.y, v.z], i * 3);
    A.aLife.array.set([t, life, kind, seed], i * 4);
    A.aSize.array.set([s0, s1], i * 2);
    this.dirtyLo = Math.min(this.dirtyLo, i); this.dirtyHi = Math.max(this.dirtyHi, i);
  }

  /** Upload what emit() wrote since the last frame (one range; the ring wraps rarely). */
  flush() {
    if (this.dirtyHi < 0) return;
    for (const [k, a] of Object.entries(this.a)) {
      const n = a.itemSize;
      a.clearUpdateRanges();
      a.addUpdateRange(this.dirtyLo * n, (this.dirtyHi - this.dirtyLo + 1) * n);
      a.needsUpdate = true;
      void k;
    }
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }

  /** Kill everything (between shots). */
  clear() {
    const L = this.a.aLife.array;
    for (let i = 0; i < this.max; i++) L[i * 4 + 1] = -1;
    this.a.aLife.clearUpdateRanges();
    this.a.aLife.needsUpdate = true;
  }
}

const SNOW_VERT = /* glsl */`
attribute vec2 corner; attribute vec4 aSeed;
uniform float uTime; uniform vec3 uBox; uniform vec3 uWind; uniform float uFocus; uniform float uCoc; uniform float uPx; uniform float uMinPx;
varying vec2 vUv; varying float vA;
void main() {
  vec3 p = aSeed.xyz * uBox;
  // Each flake drifts with the wind and wobbles; the box wraps around the camera.
  p += uWind * uTime * (0.7 + aSeed.w * 0.6);
  p.x += sin(uTime * (0.6 + aSeed.w) + aSeed.w * 30.0) * 0.4;
  p.z += cos(uTime * (0.5 + aSeed.w) + aSeed.y * 20.0) * 0.4;
  vec3 c = cameraPosition - uBox * 0.5;
  p = mod(p - c, uBox) + c;
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float d = -mv.z;
  // Circle of confusion (in px) → quad size; energy spreads so big discs are faint.
  float coc = abs(1.0 / max(d, 0.05) - 1.0 / uFocus) * uCoc;
  float px = max(uMinPx, coc) * (0.8 + aSeed.w * 0.6);
  float world = px / uPx * d;     // px → metres at this depth
  mv.xy += corner * world;
  vUv = corner;
  vA = clamp(2.2 / (px * px * 0.18 + 1.0), 0.015, 1.0) * smoothstep(0.3, 1.2, d) * (1.0 - smoothstep(uBox.x * 0.35, uBox.x * 0.5, d));
  gl_Position = projectionMatrix * mv;
}`;

const SNOW_FRAG = /* glsl */`
uniform vec3 uSnowCol; uniform float uAmount;
varying vec2 vUv; varying float vA;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float a = smoothstep(1.0, 0.6, r) * (0.75 + 0.25 * smoothstep(0.6, 0.9, r)) * vA * uAmount;   // slight bokeh rim
  gl_FragColor = vec4(uSnowCol * a, a);
}`;

export class Snowfall {
  constructor(n, uniforms) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('corner', new THREE.BufferAttribute(QUAD, 2));
    g.setIndex(QIDX);
    const s = new Float32Array(n * 4);
    for (let i = 0; i < s.length; i++) s[i] = Math.random();
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(s, 4));
    g.instanceCount = n;
    this.uniforms = {
      uTime: { value: 0 }, uBox: { value: new THREE.Vector3(36, 24, 36) }, uWind: { value: new THREE.Vector3(0.8, -0.9, 0.3) },
      uFocus: { value: 10 }, uCoc: { value: 60 }, uPx: { value: 1000 }, uMinPx: { value: 1.6 }, uSnowCol: { value: new THREE.Vector3(1.4, 1.45, 1.6) }, uAmount: { value: 1 },
      ...uniforms,
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SNOW_VERT, fragmentShader: SNOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    m.name = 'loadingSnowfall';
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
  }
}
