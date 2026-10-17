// Rail sparks and box snow (browser only). physics/grind.js emits 'railSpark' { kind, v, b, x, y, z, dx, dz } every
// physics step on a rail; this turns it into particles in one Points cloud (normal blending, see the material):
//   • metal (rails, tubes): hot orange-white sparks thrown back and to the sides at foot level, falling fast —
//     bright and short-lived, so they read at a distance but never fog the rider;
//   • boxes and ledges: a light dusting of snow off the edges, low and dim (a few at a time).
// Bursts at kinks (and on lock-on, from the last rail contact). Integrated in onBeforeRender (no extra pass, no per-frame allocation).
import * as THREE from 'three';
import { on } from '../../state.js';

const MAX = 600;

export function buildSparks() {
  const pos = new Float32Array(MAX * 3), col = new Float32Array(MAX * 3), size = new Float32Array(MAX), alpha = new Float32Array(MAX);
  const vel = new Float32Array(MAX * 3), life = new Float32Array(MAX), age = new Float32Array(MAX), hot = new Uint8Array(MAX), c0 = new Float32Array(MAX * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    // Normal blending: additive orange on sunlit snow adds up to white (invisible); a saturated over-bright core
    // shows against the snow and still blooms.
    transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    vertexShader: /* glsl */`
      attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
      void main() { vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * 360.0 / max(1.0, -mv.z), 1.5, 14.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d); if (r > 0.25) discard; gl_FragColor = vec4(vC * (1.15 - r * 1.6), vA * (1.0 - r * 3.4)); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.name = 'RailSparks';
  let head = 0, last = performance.now();
  const spawn = (x, y, z, vx, vy, vz, l, c, s, k) => {
    const i = head; head = (head + 1) % MAX;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    vel[i * 3] = vx; vel[i * 3 + 1] = vy; vel[i * 3 + 2] = vz;
    c0[i * 3] = c[0]; c0[i * 3 + 1] = c[1]; c0[i * 3 + 2] = c[2];
    life[i] = l; age[i] = 0; size[i] = s; hot[i] = k;
  };
  const HOT = [2.4, 0.95, 0.18], SNOW = [0.92, 0.96, 1.0];
  const emit = (e, n) => {
    const metal = e.kind === 'rail' || e.kind === 'tube';
    for (let k = 0; k < n; k++) {
      const back = (metal ? 1.5 + Math.random() * 3.5 : 0.5 + Math.random() * 1.2) * (0.4 + Math.min(1, e.v / 10));
      const side = (Math.random() - 0.5) * (metal ? 4 : 1.6);
      // Back along the rail and out to the sides (dx, dz = travel), from the gear on the rail top.
      const vx = -e.dx * back - e.dz * side, vz = -e.dz * back + e.dx * side;
      const vy = metal ? Math.random() * 2.4 : Math.random() * 0.6;
      const j = (Math.random() - 0.5) * 0.4;
      if (metal) spawn(e.x + e.dx * j, e.y + 0.02, e.z + e.dz * j, vx, vy, vz, 0.2 + Math.random() * 0.3, HOT, 0.07 + Math.random() * 0.06, 1);
      else spawn(e.x + e.dx * j - e.dz * (Math.random() - 0.5) * 0.5, e.y + 0.02, e.z + e.dz * j + e.dx * (Math.random() - 0.5) * 0.5, vx, vy, vz, 0.3 + Math.random() * 0.3, SNOW, 0.05 + Math.random() * 0.04, 0);
    }
  };
  let acc = 0, burst = 0;
  on('railSpark', (e) => {
    if (e.hop) return;
    const metal = e.kind === 'rail' || e.kind === 'tube';
    acc += (metal ? 140 : 40) * Math.min(1.6, 0.3 + e.v / 9) / 60;   // per physics step
    const n = Math.floor(acc);
    acc -= n;
    if (n + burst) emit(e, n + burst);
    burst = 0;
  });
  // A burst where the gear bites: on lock-on and over a kink (sent with the next rail contact).
  on('grindStart', () => { burst = 12; });
  on('grindKink', () => { burst = 10; });
  pts.onBeforeRender = () => {
    const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (let i = 0; i < MAX; i++) {
      if (life[i] <= 0) { size[i] = 0; continue; }
      age[i] += dt;
      if (age[i] >= life[i]) { life[i] = 0; size[i] = 0; continue; }
      const j = i * 3, g = hot[i] ? 9.8 : 4.5, drag = hot[i] ? 0.8 : 3;
      vel[j + 1] -= g * dt;
      vel[j] *= 1 - drag * dt; vel[j + 2] *= 1 - drag * dt;
      pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt;
      const k = 1 - age[i] / life[i];
      // Sparks cool from yellow-white to deep orange and fade out; snow just fades (and stays faint).
      col[j] = c0[j]; col[j + 1] = c0[j + 1] * (hot[i] ? 0.55 + 0.6 * k : 1); col[j + 2] = c0[j + 2] * (hot[i] ? 0.3 + 1.2 * k * k : 1);
      alpha[i] = hot[i] ? Math.min(1, k * 1.6) : 0.55 * k;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  };
  return pts;
}
