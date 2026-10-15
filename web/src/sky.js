// High-altitude sky dome (physically based single-scattering LUT from gfx/atmosphere.js: deep blue
// zenith, pale horizon, warm forward glow), an HDR sun disk with limb darkening that blooms, soft
// lit cumulus banks + high cirrus, plus the scene lighting rig (sun with a texel-snapped shadow box
// that follows the rider, hemisphere fill in the same HDR units).
import * as THREE from 'three';
import { SUN_DIR, SUN_COLOR, makeNoiseTexture } from './world.js';
import { ATMOSPHERE, LIGHTING } from './scene.js';
import { ATMO, SKY_LUT_GLSL, skyIrradiance, groundIrradiance } from './gfx/atmosphere.js';

const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform sampler2D lut; uniform sampler2D clouds; uniform vec3 sunDir; uniform vec3 sunCol; uniform vec3 skyAmb;
uniform float time; uniform float cover; uniform float cirrus;
${SKY_LUT_GLSL}
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = skyLUT(lut, dir);
  float cs = dot(dir, sunDir);
  // Sun disk (≈0.55° wide, game-sized) with limb darkening, very bright so it blooms.
  float disk = smoothstep(0.99995, 0.99999, cs);
  float limb = sqrt(max(0.0, 1.0 - (1.0 - cs) / (1.0 - 0.99995)));
  col += sunCol * disk * (0.6 + 0.4 * limb) * 900.0;
  col += sunCol * (pow(max(cs, 0.0), 2000.0) * 3.0 + pow(max(cs, 0.0), 220.0) * 0.35);   // aureole
  float h = dir.y;
  if (h > 0.0) {
    // High cirrus: thin wispy streaks (sheared noise), brighter toward the sun.
    vec2 cu = dir.xz / (h + 0.06);
    vec2 uv = cu * 0.05 + vec2(time * 0.0006, 0.0);
    float ci = texture2D(clouds, uv * vec2(1.0, 4.0)).g * 0.6 + texture2D(clouds, uv * vec2(2.3, 9.0) + 0.3).g * 0.4;
    float cm = smoothstep(0.55, 0.85, ci) * smoothstep(0.35, 0.65, texture2D(clouds, uv * 0.3 + 0.7).r) * cirrus;
    float fwdC = 0.4 + 2.4 * pow(max(cs, 0.0), 8.0);
    col = mix(col, skyAmb * 1.25 + sunCol * 0.32 * fwdC, cm * smoothstep(0.02, 0.2, h) * 0.55);
    // Fair-weather cumulus banks low over the ranges: lit tops, blue-grey bases, silver lining.
    vec2 cu2 = dir.xz / (h + 0.03) * 0.09 + vec2(time * 0.0012, time * 0.0004);
    float n = texture2D(clouds, cu2).r * 0.62 + texture2D(clouds, cu2 * 2.7 + 0.31).g * 0.28 + texture2D(clouds, cu2 * 6.3 + 0.7).g * 0.1;
    float band = smoothstep(0.0, 0.05, h) * (1.0 - smoothstep(0.12, 0.32, h));
    float dens = smoothstep(1.0 - cover, 1.0 - cover + 0.18, n) * band;
    if (dens > 0.001) {
      vec2 sd = normalize(sunDir.xz + 1e-5) * 0.012;
      float nl = texture2D(clouds, cu2 - sd).r * 0.62 + texture2D(clouds, (cu2 - sd) * 2.7 + 0.31).g * 0.28;
      float lit = clamp(0.55 + (n - nl) * 6.0, 0.0, 1.0);                 // toward the sun = lit
      float thick = smoothstep(1.0 - cover, 1.0 - cover + 0.45, n);
      vec3 base = skyAmb * mix(1.15, 0.75, thick);
      vec3 cc = base + sunCol * 0.9 * lit * mix(1.0, 0.55, thick);
      cc += sunCol * pow(max(cs, 0.0), 12.0) * (1.0 - thick) * 1.5;     // silver lining
      // Distance haze: the far banks melt into the horizon.
      cc = mix(cc, col, 0.35 * (1.0 - smoothstep(0.02, 0.12, h)));
      col = mix(col, cc, dens * 0.92);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      lut: { value: ATMO.tex }, clouds: { value: makeNoiseTexture(512, 21) },
      sunDir: { value: SUN_DIR.clone() }, sunCol: { value: SUN_COLOR.clone() }, skyAmb: { value: skyIrradiance() },
      time: { value: 0 }, cover: { value: ATMOSPHERE.cloudCover }, cirrus: { value: ATMOSPHERE.cirrus },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.dome.name = 'SkyDome';
    scene.add(this.dome);
    if (scene.fog) scene.fog.color.set(ATMOSPHERE.aerialColor);

    const hemi = new THREE.HemisphereLight(skyIrradiance(), groundIrradiance(), 1.0);
    hemi.name = 'AmbientFill';
    scene.add(hemi);
    // The three.js sun has exactly the shader sun colour so the soft-light model can recover the
    // shadow ratio (world.js) and stock materials get the same HDR light.
    const sun = new THREE.DirectionalLight(SUN_COLOR.clone(), 1.0);
    sun.name = 'Sun';
    sun.castShadow = true;
    sun.shadow.bias = LIGHTING.shadowBias;
    sun.shadow.normalBias = LIGHTING.shadowNormalBias;
    sun.shadow.radius = LIGHTING.shadowRadius;
    const target = new THREE.Object3D();
    sun.target = target;
    scene.add(sun, target);
    this.sun = sun;
    this.hemi = hemi;
    this.target = target;
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

  update(camera, focus, time) {
    // Debug / screenshot hook: window.__gfxCam = [px, py, pz, tx, ty, tz, fov?] overrides the camera.
    const o = typeof window !== 'undefined' ? window.__gfxCam : null;
    if (o) {
      camera.position.set(o[0], o[1], o[2]);
      camera.up.set(0, 1, 0);
      camera.lookAt(o[3], o[4], o[5]);
      if (o[6] && camera.fov !== o[6]) { camera.fov = o[6]; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
      focus = new THREE.Vector3(o[3], o[4], o[5]);
    }
    this.uniforms.time.value = time;
    this.dome.position.copy(camera.position);
    const texel = (this.shadowHalf * 2) / this.sun.shadow.mapSize.x;
    const L = SUN_DIR;
    const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), L).normalize();
    const lup = new THREE.Vector3().crossVectors(L, right).normalize();
    const fx = Math.round(focus.dot(right) / texel) * texel;
    const fy = Math.round(focus.dot(lup) / texel) * texel;
    const snapped = right.multiplyScalar(fx).add(lup.multiplyScalar(fy)).add(L.clone().multiplyScalar(focus.dot(L)));
    this.target.position.copy(snapped);
    this.sun.position.copy(snapped).addScaledVector(L, 600);
  }
}
