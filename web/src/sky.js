// Stylized alpine sky: painterly zenith→horizon gradient, a big glowing sunrise/golden-hour sun,
// cel-shaded drifting clouds with crisp lit edges, and the sun light with a texel-snapped shadow box.
import * as THREE from 'three';
import { ART } from './config.js';
import { SUN_DIR, SUN_COLOR, SUN_INTENSITY, makeNoiseTexture } from './world.js';

const SKY_FRAG = /* glsl */`
varying vec3 vDir;
uniform vec3 sunDir;
uniform vec3 zenith;
uniform vec3 horizon;
uniform sampler2D clouds;
uniform float time;
void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float cs = dot(dir, sunDir);
  // Gradient: deep blue overhead, warm peach at the horizon, brighter toward the sun.
  float t = pow(clamp(h, 0.0, 1.0), 0.45);
  vec3 col = mix(horizon, zenith, t);
  float sunSide = pow(max(cs, 0.0), 3.0);
  col = mix(col, vec3(1.0, 0.85, 0.65), sunSide * 0.45 * (1.0 - t * 0.6));
  // Below horizon: soft haze matching the fog.
  col = mix(col, vec3(0.8, 0.84, 1.0), smoothstep(0.0, -0.08, h));
  // Sun: crisp disk + layered halo (blooms in post).
  float disk = smoothstep(0.9993, 0.9996, cs);
  float halo = pow(max(cs, 0.0), 220.0) * 1.2 + pow(max(cs, 0.0), 24.0) * 0.35;
  col += vec3(1.0, 0.92, 0.75) * (disk * 6.0 + halo);
  // Cel-shaded clouds: two-tone, lit rim toward the sun.
  if (h > 0.0) {
    vec2 uv = dir.xz / (h + 0.18) * 0.16 + vec2(time * 0.0012, time * 0.0004);
    float n = texture2D(clouds, uv).r * 0.65 + texture2D(clouds, uv * 2.7 + 0.31).g * 0.35;
    float edge = smoothstep(0.0, 0.25, h);
    float c1 = smoothstep(0.6, 0.62, n) * edge;
    float c2 = smoothstep(0.7, 0.72, n) * edge;
    vec3 shade = mix(vec3(0.72, 0.74, 0.95), vec3(1.0, 0.9, 0.85), sunSide);
    vec3 lit = mix(vec3(1.0, 0.97, 0.94), vec3(1.0, 0.85, 0.7), sunSide);
    col = mix(col, shade, c1 * 0.9);
    col = mix(col, lit, c2 * 0.95);
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      sunDir: { value: SUN_DIR.clone() },
      zenith: { value: new THREE.Color(...ART.skyZenith) },
      horizon: { value: new THREE.Color(...ART.skyHorizon) },
      clouds: { value: makeNoiseTexture(512, 21) },
      time: { value: 0 },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }',
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.dome.name = 'SkyDome';
    scene.add(this.dome);

    // Fill light for the few non-toon materials (metal, glass).
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.65, 0.72, 1.0), new THREE.Color(1.0, 0.95, 0.9), 0.9));

    this.sun = new THREE.DirectionalLight(SUN_COLOR, SUN_INTENSITY);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.5;
    this.sun.shadow.radius = 2;
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

  update(camera, focus, time) {
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
