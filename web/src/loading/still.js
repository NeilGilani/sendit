// The painted still, drawn by the worker itself. index.html shows the still (an <img>-backed CSS layer
// with a Ken Burns drift) from first paint; the worker's canvas sits on top of it. If the page had to
// reveal the live scene with a CSS class, the reveal would wait for the main thread — which is busy
// building the game in multi-second long tasks, so messages from the worker arrive seconds late. So the
// worker's first frames draw the same still, with the same drift, pixel-aligned with the CSS layer
// under it (the hand-over is invisible), and the worker cross-fades from it into the live shot itself
// the moment the rider's first shot starts.
import * as THREE from 'three';

/** CSS `cubic-bezier(x1, y1, x2, y2)` timing function (Newton + bisection on x). */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (t) => ((ax * t + bx) * t + cx) * t, Y = (t) => ((ay * t + by) * t + cy) * t, dX = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) { const e = X(t) - x, d = dX(t); if (Math.abs(e) < 1e-5) return Y(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
    let lo = 0, hi = 1; t = x;
    for (let i = 0; i < 30; i++) { const v = X(t); if (Math.abs(v - x) < 1e-5) break; if (v < x) lo = t; else hi = t; t = (lo + hi) / 2; }
    return Y(t);
  };
}

// Must match index.html's #loading .ld-still: inset −2 %, background cover, transform-origin 50 % 55 %,
// animation ld-kb 30 s cubic-bezier(.25,.1,.25,1): scale 1.03 → 1.13, translate 0 → (--kbx, --kby).
const KB = { inset: 0.02, origin: [0.5, 0.55], dur: 30, s0: 1.03, s1: 1.13, ease: cubicBezier(0.25, 0.1, 0.25, 1) };

export class StillOverlay {
  /** info: { url, kbx, kby (percent), start (epoch ms of the CSS animation's start) } */
  constructor(info) {
    this.info = info;
    this.alpha = 1;
    this.ready = false;
    this.u = {
      uTex: { value: null }, uAlpha: { value: 1 },
      uView: { value: new THREE.Vector2(1, 1) }, uImg: { value: new THREE.Vector2(16, 9) },
      uKB: { value: new THREE.Vector3(1, 0, 0) },   // scale, translate x, y (fraction of the element)
    };
    const m = new THREE.ShaderMaterial({
      uniforms: this.u, depthTest: false, depthWrite: false, transparent: true,
      vertexShader: 'varying vec2 vUv; void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform float uAlpha; uniform vec2 uView, uImg; uniform vec3 uKB;
        varying vec2 vUv;
        void main() {
          // Screen px (CSS layout units, y down) → the element's own coords before its transform.
          vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uView;
          vec2 E0 = -${KB.inset.toFixed(3)} * uView, Es = uView * ${(1 + 2 * KB.inset).toFixed(3)};
          vec2 O = E0 + Es * vec2(${KB.origin[0]}, ${KB.origin[1]});
          vec2 q = (p - O) / uKB.x + O - uKB.yz * Es;
          // background-size: cover, centred.
          float k = max(Es.x / uImg.x, Es.y / uImg.y);
          vec2 D = uImg * k;
          vec2 uv = (q - E0 - (Es - D) * 0.5) / D;
          gl_FragColor = vec4(texture2D(uTex, uv).rgb, uAlpha);   // ImageBitmap rows top-down, flipY off: v = 0 is the top
        }`,
    });
    m.name = 'loadingStill';
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.mesh);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  /** Fetch + decode (the page already has it in the HTTP cache). Resolves false on failure. */
  async load() {
    try {
      const res = await fetch(this.info.url);
      if (!res.ok) throw new Error(res.status);
      const bmp = await createImageBitmap(await res.blob());
      const t = new THREE.Texture(bmp);
      t.colorSpace = THREE.NoColorSpace;      // raw sRGB in, raw out: the same pixels as the CSS layer
      t.flipY = false;
      t.minFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
      t.needsUpdate = true;
      this.u.uTex.value = t;
      this.u.uImg.value.set(bmp.width, bmp.height);
      this.ready = true;
    } catch { this.ready = false; }
    return this.ready;
  }

  /** Ken Burns state now (synchronised with the CSS animation through the epoch clock). */
  update(width, height) {
    const nowEpoch = performance.timeOrigin + performance.now();
    const x = Math.max(0, (nowEpoch - (this.info.start || nowEpoch)) / 1000 / KB.dur);
    const e = KB.ease(Math.min(1, x));
    this.u.uKB.value.set(KB.s0 + (KB.s1 - KB.s0) * e, (this.info.kbx / 100) * e, (this.info.kby / 100) * e);
    this.u.uView.value.set(width, height);
    this.u.uAlpha.value = this.alpha;
  }

  render(renderer, width, height) {
    if (!this.ready || this.alpha <= 0) return;
    this.update(width, height);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
    renderer.autoClear = ac;
  }
}
