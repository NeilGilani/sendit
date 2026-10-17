// Rail sparks and box spray (browser only): one additive Points cloud, emitted from the gear while the rider
// grinds (physics/grind.js, State.GRIND) — hot orange-white sparks off metal rails and tubes, a fine snow
// / plastic spray off boxes and ledges — plus a burst on lock-on. Updated in onBeforeRender, no extra pass.
import * as THREE from 'three';
import { on } from '../../state.js';

const MAX = 700;

export function buildSparks(course) {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), age = new Float32Array(MAX), kind = new Uint8Array(MAX);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float size; attribute vec3 color; varying vec3 vC;
      void main() { vC = color; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * 300.0 / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      varying vec3 vC;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vC * (1.0 - r * 3.2), 1.0); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'RailSparks';
  let head = 0, last = performance.now();
  const spawn = (p, v, l, c, s, k) => {
    const i = head; head = (head + 1) % MAX;
    pos.set([p.x, p.y, p.z], i * 3); vel.set([v.x, v.y, v.z], i * 3); col.set(c, i * 3);
    life[i] = l; age[i] = 0; size[i] = s; kind[i] = k;
  };
  const tmp = new THREE.Vector3(), vv = new THREE.Vector3();
  const burst = (n, hot) => {
    const pl = course.player;
    if (!pl) return;
    for (let k = 0; k < n; k++) {
      vv.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4);
      spawn(tmp.copy(pl.renderPos), vv, 0.25 + Math.random() * 0.3, hot ? [1.6, 1.0, 0.45] : [1, 1, 1.05], hot ? 0.05 : 0.08, hot ? 0 : 1);
    }
  };
  on('grindStart', ({ kind: k }) => burst(30, k === 'rail' || k === 'tube'));
  on('grindKink', () => burst(18, true));
  let acc = 0;
  pts.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const pl = course.player;
    // Emit while grinding.
    if (pl && pl.state === 5 && pl.grind?.g && !pl.grind.g.hop) {
      const g = pl.grind.g, hot = g.rail.kind === 'rail' || g.rail.kind === 'tube';
      const rate = (hot ? 160 : 110) * Math.min(1.6, 0.35 + g.v / 9);
      acc += rate * dt;
      const back = vv.copy(pl.velocity).normalize();
      while (acc >= 1) {
        acc -= 1;
        tmp.copy(pl.renderPos).addScaledVector(back, -0.3 + Math.random() * 0.6);
        const sp = hot ? 2 + Math.random() * 4 : 1 + Math.random() * 2;
        const v = new THREE.Vector3(-back.x * sp + (Math.random() - 0.5) * 2.2, Math.random() * (hot ? 2.6 : 1.4), -back.z * sp + (Math.random() - 0.5) * 2.2);
        const heat = 0.7 + Math.random() * 0.6;
        spawn(tmp, v, hot ? 0.18 + Math.random() * 0.35 : 0.35 + Math.random() * 0.4, hot ? [1.8 * heat, 0.95 * heat, 0.35 * heat] : [0.9, 0.95, 1.0], hot ? 0.035 + Math.random() * 0.03 : 0.06 + Math.random() * 0.05, hot ? 0 : 1);
      }
    } else acc = 0;
    // Integrate.
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { size[i] = 0; continue; }
      age[i] += dt;
      if (age[i] >= life[i]) { life[i] = 0; size[i] = 0; continue; }
      const j = i * 3, g = kind[i] === 0 ? 9.8 : 3.5;
      vel[j + 1] -= g * dt;
      const drag = kind[i] === 0 ? 0.6 : 2.5;
      vel[j] *= 1 - drag * dt; vel[j + 2] *= 1 - drag * dt;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const k = 1 - age[i] / life[i];
      if (kind[i] === 0) { col[j] *= 0.985; col[j + 1] *= 0.96; col[j + 2] *= 0.93; }
      else { col[j] = col[j + 1] = col[j + 2] = 0.9 * k; }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  };
  return pts;
}
