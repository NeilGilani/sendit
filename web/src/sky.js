// Golden-hour sky: physically based single scattering (Rayleigh + Mie + ozone) seen from alpine
// altitude, sun disk, high clouds; baked into an environment map for image-based lighting.
// Also owns the sun light with a texel-snapped shadow box that follows the skier.
import * as THREE from 'three';
import { SUN_DIR, SUN_COLOR, SUN_INTENSITY, makeNoiseTexture } from './world.js';

const SKY_FRAG = /* glsl */`
precision highp float;
varying vec3 vDir;
uniform vec3 sunDir;
uniform sampler2D clouds;
uniform float exposure;
uniform float cubePass;
const float R_E = 6360e3, R_A = 6420e3, H_R = 7994.0, H_M = 1200.0, ALT = 3000.0;
const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const vec3 BO = vec3(0.65e-6, 1.881e-6, 0.085e-6);
const float BM = 21e-6 * 1.4, G = 0.76, SUN_I = 22.0;
vec2 rs(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd), c = dot(ro, ro) - r * r, d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d); return vec2(-b - d, -b + d);
}
vec3 atmo(vec3 dir, vec3 sun, int steps, int lsteps) {
  vec3 ro = vec3(0.0, R_E + ALT, 0.0);
  float tmax = rs(ro, dir, R_A).y;
  vec2 te = rs(ro, dir, R_E);
  if (te.x > 0.0) tmax = min(tmax, te.x);
  float seg = tmax / float(steps);
  float mu = dot(dir, sun);
  float pr = 3.0 / (16.0 * 3.14159) * (1.0 + mu * mu);
  float pm = 3.0 / (8.0 * 3.14159) * ((1.0 - G * G) * (1.0 + mu * mu)) / ((2.0 + G * G) * pow(1.0 + G * G - 2.0 * G * mu, 1.5));
  vec3 sr = vec3(0.0), sm = vec3(0.0);
  float odr = 0.0, odm = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= steps) break;
    vec3 p = ro + dir * (seg * (float(i) + 0.5));
    float h = length(p) - R_E;
    float hr = exp(-h / H_R) * seg, hm = exp(-h / H_M) * seg;
    odr += hr; odm += hm;
    float tl = rs(p, sun, R_A).y;
    float ls = tl / float(lsteps);
    float lr = 0.0, lm = 0.0; bool blocked = false;
    for (int j = 0; j < 8; j++) {
      if (j >= lsteps) break;
      float lh = length(p + sun * (ls * (float(j) + 0.5))) - R_E;
      if (lh < 0.0) { blocked = true; break; }
      lr += exp(-lh / H_R) * ls; lm += exp(-lh / H_M) * ls;
    }
    if (!blocked) {
      vec3 tau = BR * (odr + lr) + BM * 1.1 * (odm + lm) + BO * (odr + lr) * 0.6;
      vec3 att = exp(-tau);
      sr += hr * att; sm += hm * att;
    }
  }
  return SUN_I * (sr * BR * pr + sm * BM * pm);
}
vec3 trans(vec3 dir) {
  vec3 ro = vec3(0.0, R_E + ALT, 0.0);
  float t = rs(ro, dir, R_A).y, seg = t / 8.0, r = 0.0, m = 0.0;
  for (int i = 0; i < 8; i++) {
    float h = length(ro + dir * seg * (float(i) + 0.5)) - R_E;
    r += exp(-h / H_R) * seg; m += exp(-h / H_M) * seg;
  }
  return exp(-(BR * r + BM * 1.1 * m + BO * r * 0.6));
}
void main() {
  vec3 dir = normalize(vDir);
  vec3 sun = normalize(sunDir);
  bool below = dir.y < -0.03;
  vec3 sd = normalize(vec3(dir.x, max(dir.y, -0.03), dir.z));
  int steps = cubePass > 0.5 ? 8 : 14;
  int lsteps = cubePass > 0.5 ? 4 : 6;
  vec3 col = atmo(sd, sun, steps, lsteps);
  float cs = dot(dir, sun);
  if (cubePass < 0.5) {
    float disk = smoothstep(0.99996, 0.999985, cs);
    col += disk * trans(sun) * vec3(1.0, 0.93, 0.85) * 900.0;
  }
  if (dir.y > 0.0) {
    vec2 uv = dir.xz / (dir.y + 0.12) * 0.22;
    float n = texture2D(clouds, uv).r * 0.7 + texture2D(clouds, uv * 3.7 + 0.31).g * 0.3;
    float cov = smoothstep(0.58, 0.9, n) * smoothstep(0.0, 0.18, dir.y);
    float thick = smoothstep(0.58, 1.0, n);
    vec3 st = trans(sun);
    float fwd = pow(max(cs, 0.0), 6.0);
    vec3 lit = st * vec3(1.0, 0.85, 0.7) * (0.6 + 2.2 * fwd);
    vec3 cloud = mix(lit * 1.4, col * 0.9 + vec3(0.05, 0.05, 0.07), thick * 0.55);
    col = mix(col, cloud, cov * 0.85);
  }
  if (below) {
    vec3 haze = atmo(normalize(vec3(dir.x, 0.0, dir.z)), sun, 8, 4) * 0.8;
    // Below the horizon the world is bright snow and distant haze (matters for the env map).
    vec3 ground = vec3(0.55, 0.6, 0.72) * haze.g * 1.6;
    col = mix(haze, ground, smoothstep(-0.03, -0.25, dir.y));
  }
  gl_FragColor = vec4(col * exposure, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    const cloudTex = makeNoiseTexture(512, 21);
    this.uniforms = {
      sunDir: { value: SUN_DIR.clone() },
      clouds: { value: cloudTex },
      exposure: { value: 1.0 },
      cubePass: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.dome.name = 'SkyDome';
    scene.add(this.dome);

    // Sun with a shadow box that follows the skier.
    this.sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.6;
    this.sun.shadow.radius = 3;
    this.sun.shadow.blurSamples = 12;
    this.target = new THREE.Object3D();
    this.sun.target = this.target;
    scene.add(this.sun);
    scene.add(this.target);
    this.setShadowBox(70, 2048);
  }

  setShadowBox(half, mapSize) {
    const c = this.sun.shadow.camera;
    c.left = -half; c.right = half; c.top = half; c.bottom = -half;
    c.near = 1; c.far = 1200;
    c.updateProjectionMatrix();
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
    }
    this.shadowHalf = half;
  }

  /** Render the sky into a PMREM environment map for image-based lighting. */
  bakeEnvironment(renderer) {
    const scene = new THREE.Scene();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), this.material);
    scene.add(dome);
    this.uniforms.cubePass.value = 1;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const rt = pmrem.fromScene(scene, 0, 0.1, 100);
    this.uniforms.cubePass.value = 0;
    pmrem.dispose();
    dome.geometry.dispose();
    this.envMap = rt.texture;
    return rt.texture;
  }

  /** Keep the dome on the camera and the shadow box on the skier (texel-snapped, no shimmer). */
  update(camera, focus) {
    this.dome.position.copy(camera.position);
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
    // Snap the focus in light space.
    const lightDir = SUN_DIR;
    const up = Math.abs(lightDir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(up, lightDir).normalize();
    const lup = new THREE.Vector3().crossVectors(lightDir, right).normalize();
    const fx = Math.round(focus.dot(right) / texel) * texel;
    const fy = Math.round(focus.dot(lup) / texel) * texel;
    const fz = focus.dot(lightDir);
    const snapped = right.multiplyScalar(fx).add(lup.multiplyScalar(fy)).add(lightDir.clone().multiplyScalar(fz));
    this.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(lightDir, 600);
  }
}
