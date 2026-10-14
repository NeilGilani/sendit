// Twilight sky dome (deep indigo → purple → golden sunrise band, cel clouds, layered low-poly
// ranges on the horizon — all from scene.js) plus the scene lighting rig with a texel-snapped
// shadow box that follows the rider.
import * as THREE from 'three';
import { SUN_DIR, makeNoiseTexture } from './world.js';
import { setupLighting, skyUniforms, SKY_VERT_GLSL, SKY_FRAG_GLSL } from './scene.js';

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = skyUniforms(SUN_DIR, makeNoiseTexture(512, 21));
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT_GLSL,
      fragmentShader: SKY_FRAG_GLSL,
      side: THREE.BackSide, depthWrite: false, depthTest: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1000, 64, 32), this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.dome.name = 'SkyDome';
    scene.add(this.dome);

    const rig = setupLighting(scene);
    this.sun = rig.sun;
    this.hemi = rig.hemi;
    this.target = rig.target;
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
