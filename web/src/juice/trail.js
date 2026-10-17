// "On fire" trail (SSX): a neon ribbon streams from the rider's feet while the combo is hot (×2 and up)
// or the SEND IT flow state is on, coloured by the combo tier (HDR, so it blooms through the post
// stack). One alpha-blended draw call, its own mesh in the scene (no gfx internals). Off on the low
// quality tier and in the helmet cam. Tunables: JUICE_TRAIL.
import * as THREE from 'three';
import { settings } from '../state.js';

export const JUICE_TRAIL = {
  segments: 48,          // ribbon points kept
  spacing: 0.45,         // m between points
  width: 0.55,           // m
  lift: 0.12,            // m above the snow at the feet
  fromMult: 2,           // combo multiplier where the trail starts
  fullMult: 4,           // … and is full
  glow: 1.0,             // colour multiplier (alpha-blended, saturated: bright HDR washes out to white on snow)
  colors: [[2, '#00c8b4'], [3, '#2f8cff'], [4, '#ffb800'], [5, '#ff6a00'], [6, '#ff1f8e']],
  base: 0.6,             // intensity at fromMult (rises to 1 at fullMult)
};

export class HotTrail {
  constructor(scene, player) {
    const T = JUICE_TRAIL;
    this.pl = player;
    this.n = T.segments;
    this.pts = [];            // [{x,y,z, sx, sz}] newest first
    this.k = 0;               // current intensity 0..1
    this.warm = 20;           // frames drawn (invisibly) during loading so the shader compiles there
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    this.fade = new Float32Array(this.n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('fade', new THREE.BufferAttribute(this.fade, 1).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color('#2ff5d6') }, uK: { value: 0 } },
      vertexShader: /* glsl */`
        attribute float fade; varying float vF;
        void main() { vF = fade; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        uniform vec3 uColor; uniform float uK; varying float vF;
        void main() { float a = vF * uK * 0.9; if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }`,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending, side: THREE.DoubleSide, fog: false,   // additive vanishes on white snow
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 5;
    scene.add(this.mesh);
  }

  /** dt real seconds; mult = live combo multiplier (1 when none); flow = SEND IT on. */
  update(dt, mult, flow, riding) {
    const T = JUICE_TRAIL, pl = this.pl;
    if (this.warm > 0) { this.warm--; this.mat.uniforms.uK.value = 0; this.mesh.visible = true; return; }
    const allowed = riding && (settings.quality ?? 1) > 0 && settings.view !== 'fp' && settings.juiceSpeedFx !== false;
    const hot = mult >= T.fromMult ? T.base + (1 - T.base) * Math.min(1, (mult - T.fromMult) / (T.fullMult - T.fromMult)) : 0;
    const want = allowed ? Math.max(flow ? 1 : 0, hot) : 0;
    this.k += (want - this.k) * (1 - Math.exp(-(want > this.k ? 4 : 1.6) * dt));
    if (this.k < 0.01 && want === 0) { this.mesh.visible = false; this.pts.length = 0; this.k = 0; return; }
    // Colour by tier (SEND IT is gold).
    let c = T.colors[0][1];
    for (const [m, col] of T.colors) if (mult >= m) c = col;
    if (flow && mult < 4) c = '#ffb800';
    this.mat.uniforms.uColor.value.set(c).multiplyScalar(T.glow);
    this.mat.uniforms.uK.value = this.k;
    // Sample the feet.
    const p = pl.renderPos;
    const head = this.pts[0];
    if (head && (Math.hypot(p.x - head.x, p.z - head.z) > 8 || Math.abs(p.y - head.y) > 8)) this.pts.length = 0;   // a respawn / teleport
    const v = pl.velocity;
    const sp = Math.hypot(v.x, v.z);
    if (!head || Math.hypot(p.x - head.x, p.z - head.z) >= T.spacing || pl.state === 2) {
      const sx = sp > 0.5 ? -v.z / sp : 1, sz = sp > 0.5 ? v.x / sp : 0;   // across the path
      this.pts.unshift({ x: p.x, y: p.y + T.lift, z: p.z, sx, sz });
      if (this.pts.length > this.n) this.pts.length = this.n;
    } else { head.x = p.x; head.y = p.y + T.lift; head.z = p.z; }
    // Rebuild the ribbon (newest bright and wide, tail thin and faded).
    const P = this.pos, F = this.fade, m = this.pts.length;
    for (let i = 0; i < this.n; i++) {
      const q = this.pts[Math.min(i, m - 1)] || { x: p.x, y: p.y, z: p.z, sx: 1, sz: 0 };
      const u = m > 1 ? Math.min(i, m - 1) / (this.n - 1) : 1;
      const w = T.width * 0.5 * (1 - u * 0.85);
      P.set([q.x + q.sx * w, q.y, q.z + q.sz * w, q.x - q.sx * w, q.y, q.z - q.sz * w], i * 6);
      const f = i < m ? Math.pow(1 - u, 1.6) : 0;
      F[i * 2] = f; F[i * 2 + 1] = f;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.fade.needsUpdate = true;
    this.mesh.visible = m > 1;
  }
}
