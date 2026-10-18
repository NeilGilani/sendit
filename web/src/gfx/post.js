// Post stack (HDR): the scene renders linear HDR radiance into a half-float buffer, then
//   RenderPass → N8AO (soft contact AO, medium/high) → bloom (threshold on HDR, only sun / glints /
//   backlit spray really bloom) + Grade (exposure, filmic tone curve, gentle grade, vignette, optional
//   goggle tint, sun glare) → speed wind (only when moving fast) → SMAA.
// Tunables: POST below. Quality tiers: setQuality(q).
import * as THREE from 'three';
import { EffectComposer, RenderPass, EffectPass, BloomEffect, SMAAEffect, SMAAPreset, Effect, EffectAttribute, BlendFunction } from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { SUN_DIR } from '../world.js';
import { PERF, perfQ } from './perf.js';

export const POST = {
  exposure: 0.62,             // linear multiplier before the tone curve (sunlit snow ≈ 0.9 display)
  toneMap: 'neutral',          // 'neutral' (Khronos PBR Neutral: clean whites) | 'agx' (filmic, softer)
  contrast: 1.06,              // gentle S-curve around mid grey after the tone curve
  saturation: 1.04,
  shadowTint: [0.985, 1.0, 1.03],   // cool lift in the shadows (blue shade on snow)
  highlightTint: [1.01, 1.0, 0.985], // faint warmth in the highlights (high-altitude sun)
  vignette: 0.22,
  bloom: { intensity: 0.32, threshold: 3.2, smoothing: 0.8, radius: 0.7 },   // HDR: sun, glints, hot backlit mist
  ao: { radius: 2.0, distanceFalloff: 1.0, intensity: 1.15, color: '#33415c' },
  glare: 0.12,                 // soft veiling glare when looking toward the sun (occlusion-aware)
  flare: 0.035,                // faint lens ghosts when the sun is in view (0 = off)
  goggles: 0.0,                // 0 = off; 1 = full amber goggle-lens tint (set with ?goggles=1)
};

/** Exposure, tone curve, grade, vignette, sun glare and optional goggle tint, in one pass. */
export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */`
      uniform float exposure; uniform float contrast; uniform float saturation; uniform float vignette;
      uniform vec3 shadowTint; uniform vec3 highlightTint; uniform float goggles;
      uniform vec3 sunScreen;      // xy = sun position in uv, z = facing (0..1)
      uniform float glare; uniform float flare;
      // First-person goggle lens (fpview.js → PostStack.setLens): tint colour; x = tint strength,
      // y = colour fringe / edge warp, z = fog on the lens edge, w = snow flecks (0..1 amount).
      uniform vec3 lensTint; uniform vec4 lensFx;
      float lensHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // Snow flecks / melt drops stuck on the lens: one soft dot per grid cell, shown while the cell's
      // random threshold is under the amount, so they appear and melt away one at a time.
      float lensFlecks(vec2 uv, float amt, float scale, float seed) {
        vec2 q = uv * vec2(aspect, 1.0) * scale;
        vec2 id = floor(q), f = fract(q) - 0.5;
        float h = lensHash(id + seed), h2 = lensHash(id + seed + 17.3);
        float show = smoothstep(h, h + 0.12, amt);
        vec2 o = (vec2(h2, lensHash(id + seed + 5.1)) - 0.5) * 0.5;
        float r = (0.12 + 0.2 * h2) * (0.55 + 0.45 * show);
        float d = length(f - o);
        return show * smoothstep(r, r * 0.35, d);
      }
      // How much of the sun disk is actually visible (mountains / trees / rider can hide it).
      float sunVisible() {
        if (sunScreen.z <= 0.0 || sunScreen.x < -0.05 || sunScreen.x > 1.05 || sunScreen.y < -0.05 || sunScreen.y > 1.05) return 0.0;
        float v = 0.0;
        vec2 px = vec2(0.0035 / aspect, 0.0035);
        for (int i = 0; i < 5; i++) {
          vec2 o = i == 0 ? vec2(0.0) : vec2(i == 1 ? 1.0 : (i == 2 ? -1.0 : 0.0), i == 3 ? 1.0 : (i == 4 ? -1.0 : 0.0));
          vec3 c = texture2D(inputBuffer, clamp(sunScreen.xy + o * px, 0.001, 0.999)).rgb;
          v += smoothstep(6.0, 30.0, dot(c, vec3(0.3, 0.6, 0.1)));
        }
        return v / 5.0;
      }
      vec3 gfxNeutral(vec3 color) {
        const float startCompression = 0.8 - 0.04;
        const float desaturation = 0.15;
        float x = min(color.r, min(color.g, color.b));
        float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
        color -= offset;
        float peak = max(color.r, max(color.g, color.b));
        if (peak < startCompression) return color;
        const float d = 1.0 - startCompression;
        float newPeak = 1.0 - d * d / (peak + d - startCompression);
        color *= newPeak / peak;
        float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
        return mix(color, vec3(newPeak), g);
      }
      vec3 gfxAgxContrast(vec3 x) {
        vec3 x2 = x * x; vec3 x4 = x2 * x2;
        return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
      }
      vec3 gfxAgX(vec3 color) {
        const mat3 toRec2020 = mat3(vec3(0.6274, 0.0691, 0.0164), vec3(0.3293, 0.9195, 0.0880), vec3(0.0433, 0.0113, 0.8956));
        const mat3 fromRec2020 = mat3(vec3(1.6605, -0.1246, -0.0182), vec3(-0.5876, 1.1329, -0.1006), vec3(-0.0728, -0.0083, 1.1187));
        const mat3 inset = mat3(vec3(0.856627153315983, 0.137318972929847, 0.11189821299995), vec3(0.0951212405381588, 0.761241990602591, 0.0767994186031903), vec3(0.0482516061458583, 0.101439036467562, 0.811302368396859));
        const mat3 outset = mat3(vec3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826), vec3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294), vec3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405));
        color = inset * (toRec2020 * color);
        color = clamp((log2(max(color, 1e-10)) + 12.47393) / 16.5, 0.0, 1.0);
        color = outset * gfxAgxContrast(color);
        color = pow(max(vec3(0.0), color), vec3(2.2));
        return clamp(fromRec2020 * color, 0.0, 1.0);
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * exposure;
        vec2 ld = uv - 0.5;
        float le = dot(ld * vec2(aspect * 0.75, 1.0), ld * vec2(aspect * 0.75, 1.0));   // 0 centre … ~0.4 corners
        float fl = 0.0;
        if (lensFx.w > 0.001) fl = max(lensFlecks(uv, lensFx.w * (0.55 + 0.9 * le), 9.0, 0.0), lensFlecks(uv, lensFx.w * (0.4 + 1.1 * le), 17.0, 3.7) * 0.8);
        // Lens edge: a little warp and a colour fringe toward the frame, and refraction through the flecks
        // (delta samples so the bloom already in inputColor is kept).
        if (lensFx.y > 0.001 && le > 0.04 || fl > 0.01) {
          vec2 o = ld * smoothstep(0.04, 0.4, le) * lensFx.y * 0.006 + ld * fl * 0.025;
          vec3 base = texture2D(inputBuffer, uv).rgb;
          c.r += (texture2D(inputBuffer, uv - o * 1.6).r - base.r) * exposure;
          c.g += (texture2D(inputBuffer, uv - o).g - base.g) * exposure;
          c.b += (texture2D(inputBuffer, uv - o * 0.4).b - base.b) * exposure;
        }
        // Veiling glare toward the sun (scattering in the eye / lens): lifts and warms the image a touch.
        vec2 sd = (uv - sunScreen.xy) * vec2(aspect, 1.0);
        float vis = sunVisible();
        float sg = sunScreen.z * glare * vis;
        c += vec3(1.0, 0.93, 0.82) * sg * (0.35 * exp(-dot(sd, sd) * 6.0) + 0.06 * exp(-length(sd) * 2.0));
        // Subtle lens ghosts along the line through the centre (goggle / lens feel).
        if (flare > 0.0 && vis > 0.0) {
          vec2 axis = vec2(0.5) - sunScreen.xy;
          for (int i = 0; i < 4; i++) {
            float k = i == 0 ? 0.55 : (i == 1 ? 0.9 : (i == 2 ? 1.35 : 1.75));
            float rad = i == 0 ? 0.035 : (i == 1 ? 0.018 : (i == 2 ? 0.06 : 0.025));
            vec3 tint = i == 0 ? vec3(0.6, 0.8, 1.0) : (i == 1 ? vec3(1.0, 0.75, 0.5) : (i == 2 ? vec3(0.55, 1.0, 0.75) : vec3(0.85, 0.6, 1.0)));
            vec2 gp = sunScreen.xy + axis * k;
            float d = length((uv - gp) * vec2(aspect, 1.0));
            c += tint * flare * vis * sunScreen.z * smoothstep(rad, rad * 0.6, d) * (0.6 + 0.4 * smoothstep(0.0, rad, d));
          }
        }
#ifdef TM_AGX
        c = gfxAgX(c);
#else
        c = gfxNeutral(c);
#endif
        c = clamp(c, 0.0, 1.0);
        // Grade in a perceptual-ish space.
        vec3 g = sqrt(c);
        float l = dot(g, vec3(0.2126, 0.7152, 0.0722));
        g = mix(vec3(l), g, saturation);
        g = (g - 0.5) * contrast + 0.5;
        g *= mix(shadowTint, highlightTint, smoothstep(0.2, 0.85, l));
        // Optional goggle lens: warm amber/rose tint, slightly deeper blues.
        g = mix(g, g * vec3(1.06, 0.98, 0.84) + vec3(0.02, 0.0, -0.01), goggles);
        // First-person lens: the worn goggle's tint (brightness kept, a touch of its darkening), fog
        // creeping in from the frame, snow flecks catching the light.
        if (lensFx.x > 0.001) {
          float l0 = dot(g, vec3(0.2126, 0.7152, 0.0722));
          vec3 t = g * lensTint;
          float l1 = dot(t, vec3(0.2126, 0.7152, 0.0722));
          t *= mix(1.0, l0 / max(l1, 1e-3), 0.85);
          g = mix(g, t, lensFx.x);
        }
        if (lensFx.z > 0.001) {
          float fog = lensFx.z * smoothstep(0.06, 0.38, le + 0.03 * sin(uv.x * 23.0 + uv.y * 17.0));
          g = mix(g, vec3(0.84, 0.87, 0.91) + g * 0.14, fog * 0.8);
        }
        if (fl > 0.0) g = mix(g, g * 0.75 + vec3(0.26, 0.27, 0.29), fl * 0.8);
        vec2 dv = (uv - 0.5) * vec2(aspect * 0.8, 1.0);
        g *= 1.0 - vignette * smoothstep(0.25, 0.95, dot(dv, dv) * 1.6);
        c = max(g, 0.0); c *= c;
        outputColor = vec4(c, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      attributes: EffectAttribute.CONVOLUTION,
      defines: new Map(POST.toneMap === 'agx' ? [['TM_AGX', '1']] : []),
      uniforms: new Map([
        ['exposure', new THREE.Uniform(POST.exposure)], ['contrast', new THREE.Uniform(POST.contrast)],
        ['saturation', new THREE.Uniform(POST.saturation)], ['vignette', new THREE.Uniform(POST.vignette)],
        ['shadowTint', new THREE.Uniform(new THREE.Vector3(...POST.shadowTint))],
        ['highlightTint', new THREE.Uniform(new THREE.Vector3(...POST.highlightTint))],
        ['goggles', new THREE.Uniform(POST.goggles)],
        ['sunScreen', new THREE.Uniform(new THREE.Vector3())], ['glare', new THREE.Uniform(POST.glare)],
        ['flare', new THREE.Uniform(POST.flare)],
        ['lensTint', new THREE.Uniform(new THREE.Color(1, 1, 1))], ['lensFx', new THREE.Uniform(new THREE.Vector4())],
      ]),
    });
  }
}

/**
 * Speed wind: smooth, organic, tapered alpha streaks that live only in the four screen corners and
 * only at extreme speed (no fullscreen radial lines), plus a soft corner-only motion smear.
 */
class WindEffect extends Effect {
  constructor() {
    super('WindEffect', /* glsl */`
      uniform float intensity;
      uniform float windTime;
      float h1(float n) { return fract(sin(n * 91.345) * 47453.21); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 col = inputColor.rgb;
        if (intensity > 0.001) {
          vec2 d = uv - vec2(0.5);
          vec2 ds = d * vec2(aspect, 1.0);
          float r = length(ds);
          vec2 ad = abs(d) * 2.0;
          float corner = smoothstep(0.42, 0.9, ad.x) * smoothstep(0.36, 0.86, ad.y);
          if (corner > 0.001) {
            vec3 acc = vec3(0.0);
            for (int i = 1; i <= 5; i++) acc += texture2D(inputBuffer, uv - d * float(i) * 0.007 * intensity).rgb;
            col = mix(col, acc / 5.0, corner * 0.6 * intensity);
            float ang = atan(ds.y, ds.x);
            float alpha = 0.0;
            for (int k = 0; k < 2; k++) {
              float fk = float(k);
              float lanes = 64.0 + fk * 41.0;
              float a = ang + 0.045 * sin(r * 8.0 + fk * 2.3 + windTime * 0.8);
              float x = a * lanes / 6.2831853;
              float lane = floor(x);
              float seed = h1(lane + fk * 113.0);
              if (seed < 0.55) continue;
              float head = fract(seed * 13.7 + windTime * (0.7 + seed * 1.3));
              float rr = 0.45 + head * 0.7;
              float len = 0.14 + seed * 0.22;
              float t = (rr - r) / len;
              float body = smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.3, 1.0, t));
              float w = (0.06 + 0.1 * (seed - 0.55)) * (1.0 - clamp(t, 0.0, 1.0) * 0.8);
              float across = abs(fract(x) - 0.5) * 2.0;
              float thin = exp(-(across * across) / max(w * w, 1e-4));
              alpha = max(alpha, thin * body * smoothstep(0.0, 0.25, head) * (1.0 - smoothstep(0.75, 1.0, head)));
            }
            col = mix(col, col * 1.08 + 0.04, clamp(alpha * corner * intensity * 0.5, 0.0, 1.0));
            col *= 1.0 - corner * intensity * 0.08;
          }
        }
        outputColor = vec4(col, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map([['intensity', new THREE.Uniform(0)], ['windTime', new THREE.Uniform(0)]]),
    });
  }
}

export class PostStack {
  constructor(renderer, scene, camera, params = new URLSearchParams(location.search)) {
    this.renderer = renderer; this.camera = camera;
    if (params.has('goggles')) POST.goggles = Number(params.get('goggles')) || 0;
    if (params.has('tm')) POST.toneMap = params.get('tm');
    if (params.has('exposure')) POST.exposure = Number(params.get('exposure'));
    // Skip the synchronous shader-log readback (it stalls on first use of every program and prints
    // benign D3D compiler warnings from third-party passes). ?shaderdebug turns the checks back on.
    renderer.debug.checkShaderErrors = params.has('shaderdebug');
    const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
    composer.addPass(new RenderPass(scene, camera));
    const ao = new N8AOPostPass(scene, camera, innerWidth, innerHeight);
    ao.configuration.aoRadius = POST.ao.radius;
    ao.configuration.distanceFalloff = POST.ao.distanceFalloff;
    ao.configuration.intensity = POST.ao.intensity;
    ao.configuration.color = new THREE.Color(POST.ao.color);
    ao.configuration.gammaCorrection = false;
    ao.setQualityMode('Medium');
    composer.addPass(ao);
    const B = POST.bloom;
    this.bloom = new BloomEffect({ intensity: B.intensity, luminanceThreshold: B.threshold, luminanceSmoothing: B.smoothing, mipmapBlur: true, radius: B.radius });
    this.grade = new GradeEffect();
    composer.addPass(new EffectPass(camera, this.bloom, this.grade));
    this.wind = new WindEffect();
    this.windPass = new EffectPass(camera, this.wind);
    this.windPass.enabled = false;
    composer.addPass(this.windPass);
    this.smaaEffect = new SMAAEffect({ preset: SMAAPreset.HIGH });
    this.smaa = new EffectPass(camera, this.smaaEffect);
    composer.addPass(this.smaa);
    this.composer = composer;
    this.ao = ao;
    this._v = new THREE.Vector3();
    if (typeof window !== 'undefined') window.__post = this;   // debug handle
  }

  setQuality(q) {
    // Per-tier costs live in gfx/perf.js (PERF).
    q = perfQ(q);
    const ao = PERF.ao[q];
    this.ao.enabled = !!ao;
    if (ao) { this.ao.setQualityMode(ao.mode); this.ao.configuration.halfRes = !!ao.halfRes; }
    this.bloom.intensity = POST.bloom.intensity * PERF.bloomScale[q];
    this.smaaEffect.applyPreset(SMAAPreset[PERF.smaa[q]]);
    // MSAA on the scene pass (WebGL2 multisampled render target): geometry edges + alpha-to-coverage
    // foliage. SMAA still runs after it for shader / specular aliasing.
    if (this.composer.multisampling !== PERF.msaa[q]) this.composer.multisampling = PERF.msaa[q];
    this.grade.uniforms.get('glare').value = PERF.glare[q] ? POST.glare : 0;
    this.grade.uniforms.get('flare').value = PERF.flare[q] ? POST.flare : 0;
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  /**
   * First-person goggle lens (fpview.js FPView.lens): { tint: Color, amount, fringe, fog, snow }, or null
   * for a clear view (chase camera).
   */
  setLens(L) {
    const fx = this.grade.uniforms.get('lensFx').value;
    if (!L) { fx.set(0, 0, 0, 0); return; }
    this.grade.uniforms.get('lensTint').value.copy(L.tint);
    fx.set(L.amount, L.fringe, L.fog, L.snow);
  }

  /** Per frame: wind streak intensity (0..1 target) and the sun's screen position for the glare. */
  update(dt, time, windTarget) {
    const wu = this.wind.uniforms.get('intensity');
    wu.value += (windTarget - wu.value) * (1 - Math.exp(-3 * dt));
    this.wind.uniforms.get('windTime').value = time;
    this.windPass.enabled = wu.value > 0.002;
    const cam = this.camera;
    const v = this._v.copy(SUN_DIR).multiplyScalar(1000).add(cam.position).project(cam);
    const fwd = cam.getWorldDirection(new THREE.Vector3());
    const facing = Math.max(0, fwd.dot(SUN_DIR));
    this.grade.uniforms.get('sunScreen').value.set(v.x * 0.5 + 0.5, v.y * 0.5 + 0.5, v.z < 1 ? facing * facing : 0);
  }

  render(dt) { this.composer.render(dt); }
}

