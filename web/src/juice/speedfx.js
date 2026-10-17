// Speed rush (post): a radial zoom blur and chromatic fringe toward the screen edges at top speed, plus
// bright rush lines on boost moments (stomped landings, big combos, SEND IT). The centre of the frame
// (the rider) stays sharp. One extra EffectPass inserted before SMAA through the composer's public
// addPass(pass, index); the pass is disabled whenever its intensity is ~0, so it costs nothing at
// normal speeds. Quality tiers: low = off, medium = 4 blur taps, high = 8 taps.
// Tunables: JUICE_SPEEDFX. settings.juiceSpeedFx === false turns it off.
import * as THREE from 'three';
import { EffectPass, Effect, BlendFunction } from 'postprocessing';
import { on, settings } from '../state.js';

export const JUICE_SPEEDFX = {
  speedFrom: 0.82,       // speed ratio where the rush starts …
  speedFull: 1.0,        // … and is full
  speedAmount: 0.45,     // rush at full speed (0..1)
  blur: 0.018,           // zoom blur length at full rush (UV units at the edge)
  aberration: 0.0028,    // chromatic fringe at full rush (UV units at the edge)
  clearRadius: 0.22,     // centre radius that stays untouched
  pulse: { stomp: 0.75, huge: 1, bank: 0.55, flow: 0.8, near: 0.3 },
  pulseDecay: 2.4,       // 1/s
  taps: [0, 4, 8],       // blur taps per quality tier (0 = effect off)
};

class SpeedRushEffect extends Effect {
  constructor() {
    super('SpeedRushEffect', /* glsl */`
      uniform float rush;
      uniform float lines;
      uniform float blurLen;
      uniform float aberr;
      uniform float clearR;
      uniform float taps;
      uniform float rtime;
      float hh(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 col = inputColor.rgb;
        vec2 d = uv - vec2(0.5);
        vec2 ds = d * vec2(aspect, 1.0);
        float r = length(ds);
        float edge = smoothstep(clearR, clearR + 0.42, r);
        float k = edge * rush;
        if (k > 0.001) {
          vec3 acc = col;
          float n = 1.0;
          for (int i = 1; i <= 8; i++) {
            if (float(i) > taps) break;
            acc += texture2D(inputBuffer, uv - d * (float(i) / taps) * blurLen * k * 2.0).rgb;
            n += 1.0;
          }
          col = mix(col, acc / n, min(1.0, k * 1.4));
          vec2 off = d * aberr * k * 2.0;
          col.r = mix(col.r, texture2D(inputBuffer, uv + off).r, 0.85);
          col.b = mix(col.b, texture2D(inputBuffer, uv - off).b, 0.85);
        }
        if (lines > 0.001) {
          float ang = atan(ds.y, ds.x);
          float lanes = 150.0;
          float x = ang * lanes / 6.2831853;
          float lane = floor(x);
          float s = hh(lane);
          float on = step(0.72, s);
          float head = fract(s * 9.3 + rtime * (1.6 + s * 2.0));
          float rr = 0.3 + head * 0.75;
          float t = (rr - r) / (0.18 + s * 0.2);
          float body = smoothstep(0.0, 0.15, t) * (1.0 - smoothstep(0.35, 1.0, t));
          float across = abs(fract(x) - 0.5) * 2.0;
          float thin = exp(-(across * across) / 0.02);
          float a = on * body * thin * smoothstep(clearR + 0.05, clearR + 0.3, r) * lines;
          col = mix(col, vec3(1.0, 0.98, 0.94) * 1.4, clamp(a * 0.55, 0.0, 1.0));
        }
        outputColor = vec4(col, inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map(['rush', 'lines', 'blurLen', 'aberr', 'clearR', 'taps', 'rtime'].map((k) => [k, new THREE.Uniform(0)])),
    });
  }
}

/** Insert the speed rush pass into a PostStack. Returns { update(dt, time, speedRatio), pulse(kind), setQuality(q) }. */
export function installSpeedFx({ post, camera }) {
  const S = JUICE_SPEEDFX;
  const fx = new SpeedRushEffect();
  const pass = new EffectPass(camera, fx);
  pass.enabled = false;
  const comp = post.composer;
  const at = comp.passes.indexOf(post.smaa);
  comp.addPass(pass, at >= 0 ? at : undefined);
  const U = (k) => fx.uniforms.get(k);
  U('blurLen').value = S.blur; U('aberr').value = S.aberration; U('clearR').value = S.clearRadius;
  let taps = S.taps[settings.quality ?? 1] ?? 4, boost = 0, rush = 0, lines = 0;
  const setQuality = (q) => { taps = S.taps[Math.max(0, Math.min(2, q))] ?? 4; U('taps').value = taps; };
  setQuality(settings.quality ?? 1);
  const pulse = (kind) => { boost = Math.max(boost, S.pulse[kind] ?? 0.5); };
  const offs = [
    on('settings', ({ key }) => { if (key === 'quality') setQuality(settings.quality); }),
    on('juiceComboBanked', ({ mult }) => { if (mult >= 2.5) pulse('bank'); }),
    on('flowState', ({ on: st }) => { if (st) pulse('flow'); }),
  ];
  let flowHold = false;
  offs.push(on('flowState', ({ on: st }) => { flowHold = !!st; }));
  return {
    pass, pulse, setQuality, dispose: () => offs.forEach((o) => o()),
    update(dt, time, speedRatio, riding) {
      boost *= Math.exp(-S.pulseDecay * dt);
      const want = riding && settings.juiceSpeedFx !== false && taps > 0
        ? Math.max(THREE.MathUtils.smoothstep(speedRatio, S.speedFrom, S.speedFull) * S.speedAmount + (flowHold ? 0.12 : 0), boost)
        : 0;
      rush += (want - rush) * (1 - Math.exp(-(want > rush ? 10 : 3) * dt));
      lines = riding && taps > 0 && settings.juiceSpeedFx !== false ? boost : 0;
      U('rush').value = rush;
      U('lines').value = lines;
      U('rtime').value = time;
      pass.enabled = rush > 0.003 || lines > 0.003;
    },
  };
}
