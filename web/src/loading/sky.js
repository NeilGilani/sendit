// Loading scene sky + atmosphere: one set of uniforms (from a TIMES preset in variants.js) shared by the
// sky dome, the terrain's aerial perspective, the cloud sea and the powder, so the haze on a distant
// ridge is exactly the horizon colour behind it. Linear HDR, the game's units (post: gfx/post.js grade).
//   ATMO_PARS_GLSL      uniforms + skyColor(dir) + aerial(col, worldPos) for any fragment shader
//   atmoUniforms(v)     the uniform set for a variant
//   SkyDome             big inverted sphere: gradient sky, sun disk + glow, cirrus / cumulus layer,
//                       stars, moon and aurora curtains (night variant)
import * as THREE from 'three';

export function atmoUniforms(v) {
  const T = v.time;
  const c = (a) => new THREE.Vector3(a[0], a[1], a[2]);
  const sunDir = new THREE.Vector3(Math.sin(v.sunAz) * Math.cos(v.sunElev), Math.sin(v.sunElev), -Math.cos(v.sunAz) * Math.cos(v.sunElev));
  return {
    uSunDirA: { value: sunDir },
    uZenith: { value: c(T.zenith) }, uHorizon: { value: c(T.horizon) }, uAwayHorizon: { value: c(T.awayHorizon) },
    uLow: { value: c(T.low) }, uGlow: { value: c(T.glow) }, uSunDisk: { value: T.sunDisk },
    uHazeCol: { value: c(T.haze) }, uHazeDensity: { value: T.hazeDensity },
    uCloudLit: { value: c(T.cloud.lit) }, uCloudShade: { value: c(T.cloud.shade) }, uCloudCover: { value: T.cloud.cover },
    uStars: { value: T.stars }, uAurora: { value: T.aurora }, uMoon: { value: T.moon ? 1 : 0 },
    uSkyTime: { value: 0 },
  };
}

/** Uniform declarations + sky / aerial-perspective functions (needs noiseTex declared elsewhere if used). */
export const ATMO_PARS_GLSL = /* glsl */`
uniform vec3 uSunDirA; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uAwayHorizon; uniform vec3 uLow;
uniform vec3 uGlow; uniform float uSunDisk; uniform vec3 uHazeCol; uniform float uHazeDensity;
// Horizon / haze colour toward dir: warm toward the sun, cooler away, plus the sun's forward glow.
vec3 horizonColor(vec3 dir) {
  vec2 h = normalize(dir.xz + 1e-5), s = normalize(uSunDirA.xz + 1e-5);
  float az = dot(h, s) * 0.5 + 0.5;
  vec3 c = mix(uAwayHorizon, uHorizon, az * az);
  float mu = max(dot(dir, uSunDirA), 0.0);
  return c + uGlow * (0.55 * pow(mu, 8.0) + 0.25 * pow(mu, 2.5));
}
vec3 skyColor(vec3 dir) {
  float y = dir.y;
  vec3 hor = horizonColor(dir);
  // Above: horizon band → zenith (a touch of extra density just above the horizon); below: dim haze.
  float t = pow(clamp(y, 0.0, 1.0), 0.45);
  vec3 c = mix(hor, uZenith, smoothstep(0.0, 1.0, t));
  c = mix(c, hor * 1.08, exp(-max(y, 0.0) * 28.0) * 0.6);
  vec3 below = mix(hor, uLow, smoothstep(0.0, 0.25, -y));
  return y >= 0.0 ? c : below;
}
// Aerial perspective: height-falloff haze along the view ray, bluer extinction for the far ridges,
// inscatter = the horizon colour that way. Returns the fogged colour.
vec3 aerial(vec3 col, vec3 wp) {
  vec3 d = wp - cameraPosition;
  float dist = length(d);
  vec3 dir = d / max(dist, 1e-3);
  float h0 = cameraPosition.y, h1 = wp.y;
  // Optical depth through exp(-(h - base) / H) haze (closed form along the segment).
  float H = 900.0, base = -200.0;
  float a0 = exp(-(h0 - base) / H), a1 = exp(-(h1 - base) / H);
  float od = abs(h1 - h0) > 1.0 ? H * (a0 - a1) / (h1 - h0) : a0;
  od = od * dist * 4.2e-5 * uHazeDensity + dist * 2.5e-6 * uHazeDensity;
  vec3 trans = exp(-od * vec3(0.78, 0.92, 1.18));
  trans = max(trans, vec3(0.03));
  // Inscatter: the horizon colour that way with only a little of the sun's glow (it would wash
  // every ridge toward the sun into the sky).
  vec2 hh = normalize(dir.xz + 1e-5), ss = normalize(uSunDirA.xz + 1e-5);
  float az = dot(hh, ss) * 0.5 + 0.5;
  vec3 ins = mix(uAwayHorizon, uHorizon, az * az) * 0.92 + uGlow * 0.22 * pow(max(dot(dir, uSunDirA), 0.0), 6.0);
  return col * trans + ins * (1.0 - trans);
}
`;

const SKY_FRAG = /* glsl */`
uniform float uCloudCover; uniform vec3 uCloudLit; uniform vec3 uCloudShade;
uniform float uStars; uniform float uAurora; uniform float uMoon; uniform float uSkyTime;
uniform sampler2D noiseTex;
varying vec3 vDir;
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fbm(vec2 p) { float a = 0.0, w = 0.5; for (int i = 0; i < 4; i++) { a += w * texture2D(noiseTex, p).r; p = p * 2.03 + 0.17; w *= 0.5; } return a; }
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyColor(dir);
  float mu = dot(dir, uSunDirA);
  // Sun (or moon) disk with a soft limb + a tight corona.
  float disk = smoothstep(0.99985 - 0.00004 * uMoon, 0.99993, mu);
  col += uGlow * uSunDisk * disk * (uMoon > 0.5 ? 0.25 : 1.0);
  col += uGlow * pow(max(mu, 0.0), 900.0) * 3.0;
  // Clouds: a thin deck projected on a plane ~2.5 km up; lit edges toward the sun, dark bellies.
  if (dir.y > 0.0) {
    vec2 cp = dir.xz / (dir.y + 0.08) * 0.11 + vec2(uSkyTime * 0.0012, 0.0);
    float n = fbm(cp * 0.6);
    float cov = smoothstep(1.0 - uCloudCover - 0.12, 1.0 - uCloudCover + 0.25, n + 0.12);
    float wisp = cov > 0.95 ? 0.0 : smoothstep(0.55, 0.85, fbm(cp * vec2(0.25, 1.6) + 3.1)) * 0.35 * (1.0 - smoothstep(0.35, 0.8, dir.y));   // cirrus streaks (low; overhead they would read as beams)
    float dens = clamp(cov + wisp * (1.0 - cov), 0.0, 1.0) * smoothstep(0.0, 0.12, dir.y);
    float edge = pow(max(mu, 0.0), 6.0);
    float thick = smoothstep(0.2, 1.0, cov);
    vec3 cc = mix(uCloudLit * (0.55 + 0.45 * (1.0 - thick)), uCloudShade, thick * 0.65);
    cc += uGlow * edge * (1.0 - thick) * 1.4;   // silver lining
    col = mix(col, cc, dens * 0.92);
  }
  // Night: stars (twinkle), the moon's halo, aurora curtains.
  if (uStars > 0.0 && dir.y > 0.0) {
    vec2 sp = vec2(atan(dir.z, dir.x) * 220.0, asin(dir.y) * 220.0);
    vec2 cid = floor(sp);
    float s = h12(cid);
    vec2 off = fract(sp) - 0.5 - (vec2(h12(cid + 7.1), h12(cid + 3.3)) - 0.5) * 0.6;
    float star = step(0.985, s) * smoothstep(0.32, 0.0, length(off)) * (0.6 + 0.4 * sin(uSkyTime * (2.0 + s * 5.0) + s * 40.0));
    col += vec3(0.85, 0.9, 1.0) * star * uStars * 1.6 * smoothstep(0.02, 0.2, dir.y);
    col += vec3(0.5, 0.62, 0.85) * uStars * 0.02 * smoothstep(0.5, 0.95, texture2D(noiseTex, sp * 0.0006).g);   // milky band
  }
  if (uAurora > 0.0 && dir.y > 0.02) {
    // Curtains: vertical rays (high frequency along azimuth) under a slowly folding band.
    float az = atan(dir.x, -dir.z);
    float el = asin(dir.y);
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float fold = (texture2D(noiseTex, vec2(az * 0.18 + fi * 0.31 + uSkyTime * 0.004, fi * 0.2)).r - 0.5) * 0.5;
      float base = 0.2 + fi * 0.09 + fold;
      float band = smoothstep(base - 0.02, base + 0.03, el) * exp(-max(el - base, 0.0) * (7.0 - fi));
      float rays = 0.55 + 0.45 * texture2D(noiseTex, vec2(az * 3.0 + fi, uSkyTime * 0.01 + fi * 0.5)).g;
      vec3 c = mix(vec3(0.12, 1.0, 0.45), vec3(0.55, 0.25, 1.0), smoothstep(0.0, 0.25, el - base));
      acc += c * band * rays * (1.0 - fi * 0.25);
    }
    col += acc * uAurora * 0.55 * smoothstep(-0.6, 0.6, cos(atan(dir.x, -dir.z) * 0.7 + 0.4));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export class SkyDome {
  constructor(atmo, noiseTex) {
    this.uniforms = { ...atmo, noiseTex: { value: noiseTex } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */`varying vec3 vDir;
        void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
      fragmentShader: ATMO_PARS_GLSL + SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: true,
    });
    mat.name = 'loadingSky';
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.onBeforeRender = (_r, _s, cam) => { this.mesh.position.copy(cam.position); this.mesh.scale.setScalar(1000); this.mesh.updateMatrixWorld(); };
  }
}
