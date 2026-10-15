// Cornices and wind lips: wind-built snow overhangs on the lee side of crests and wall tops.
// Crests are found from the height field (sharp drop downwind, no rise upwind); each gets a smooth,
// tapered overhang (instanced) shaded with the snow optics. Visual only (no collision).
// Tunables: CORNICES in scene.js; wind direction = SNOW.windAngle.
import * as THREE from 'three';
import { toonMaterial, mulberry32 } from '../world.js';
import { SNOW, CORNICES } from '../scene.js';
import { snowUniforms, SNOW_COMMON_PARS, SNOW_BAND_GLSL } from './snow.js';

/** Unit cornice: crest along local z (-0.5..0.5), overhang toward +x, top at y≈0. */
function corniceGeometry() {
  // Cross-section (x = toward the lee, y = up), from the buried windward foot over the lip and back under.
  const prof = [
    [-1.6, -0.55], [-1.0, -0.12], [-0.4, 0.04], [0.15, 0.08], [0.55, 0.04], [0.85, -0.08], [1.0, -0.26],
    [0.98, -0.45], [0.86, -0.56], [0.62, -0.58], [0.35, -0.66], [0.05, -0.9], [-0.3, -1.2],
  ];
  const nz = 14;
  const pos = [], idx = [];
  for (let k = 0; k <= nz; k++) {
    const z = k / nz - 0.5;
    const env = Math.pow(Math.sin((k / nz) * Math.PI), 0.6);          // tapered ends
    const wob = 1 + 0.12 * Math.sin(k * 1.7) + 0.06 * Math.sin(k * 4.3);
    for (const [x, y] of prof) pos.push(x * env * wob + (1 - env) * -0.8, y * (0.35 + 0.65 * env), z);
  }
  const np = prof.length;
  for (let k = 0; k < nz; k++) for (let i = 0; i < np - 1; i++) {
    const a = k * np + i, b = a + 1, c = a + np, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const FRAG = /* glsl */`
{
  vec3 N = normalize(vWN);
  float n = texture2D(noiseTex, vW.xz * 0.11 + vW.y * 0.05).g;
  diffuseColor.rgb = uSnowAlbedo * (0.95 + 0.07 * n);
  // Underside of the lip: denser, older snow (bluer, a touch darker) with icy streaks.
  float under = smoothstep(0.1, -0.5, N.y);
  diffuseColor.rgb *= mix(vec3(1.0), vec3(0.86, 0.92, 1.0), under);
  tCavity = 1.0 - under * 0.25;
  tGlaze = 0.6;
}
`;

/**
 * Find crests around the run and build instanced cornices.
 * @param terrain Terrain; @param bounds {minX, maxX, minZ, maxZ}; @param keepOut (x, z) => metres to the run
 */
export function buildCornices(terrain, bounds, keepOut, noiseTex) {
  const C = CORNICES;
  const T = terrain;
  const wd = new THREE.Vector2(Math.cos(SNOW.windAngle), Math.sin(SNOW.windAngle));
  const rnd = mulberry32(4711);
  const picks = [];
  const grid = new Map();
  const near = (x, z, r) => {
    const cx = Math.floor(x / 20), cz = Math.floor(z / 20);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = grid.get(`${cx + dx},${cz + dz}`);
      if (a) for (const p of a) if (Math.hypot(p[0] - x, p[1] - z) < r) return true;
    }
    return false;
  };
  for (let z = bounds.minZ; z < bounds.maxZ; z += C.step) {
    for (let x = bounds.minX; x < bounds.maxX; x += C.step) {
      if (picks.length >= C.max) break;
      const px = x + (rnd() - 0.5) * C.step, pz = z + (rnd() - 0.5) * C.step;
      if (!T.isInside(px, pz, 40)) continue;
      // Wind direction varies a little across the mountain (eddies around ridges).
      const a = SNOW.windAngle + (rnd() - 0.5) * 0.5;
      const ux = Math.cos(a), uz = Math.sin(a);
      const h0 = T.baseHeight(px, pz);
      // A convex break: gentle snow upwind, a steep drop downwind, and we are right at the edge.
      const lee = h0 - T.baseHeight(px + ux * 7, pz + uz * 7);
      const wind = Math.abs(T.baseHeight(px - ux * 7, pz - uz * 7) - h0);
      const edge = h0 - T.baseHeight(px + ux * 2, pz + uz * 2);
      if (lee < C.minDrop || wind > 2.2 || edge > 1.4 || edge < -0.3) continue;
      // Crest should run roughly across the wind: the lee edge, not a spur end.
      if (keepOut(px, pz) < C.runClear) continue;
      if (near(px, pz, C.spacing)) continue;
      const big = Math.min(1, (lee - C.minDrop) / 6);
      const len = C.length[0] + (C.length[1] - C.length[0]) * rnd();
      const over = (C.overhang[0] + (C.overhang[1] - C.overhang[0]) * big) * (0.7 + rnd() * 0.5);
      const thick = (C.thickness[0] + (C.thickness[1] - C.thickness[0]) * big) * (0.8 + rnd() * 0.4);
      picks.push([px, h0, pz, a, len, over, thick]);
      const key = `${Math.floor(px / 20)},${Math.floor(pz / 20)}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([px, pz]);
    }
  }
  if (!picks.length) return null;
  const mat = toonMaterial({
    name: 'cornice', uniforms: { ...snowUniforms(), noiseTex: { value: noiseTex } },
    fragPars: SNOW_COMMON_PARS, frag: FRAG, band: SNOW_BAND_GLSL,
  });
  const im = new THREE.InstancedMesh(corniceGeometry(), mat, picks.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  picks.forEach((c, i) => {
    // Local +x → lee direction (angle a in xz); rotation about y by -a maps +x onto (cos a, sin a).
    q.setFromAxisAngle(up, -c[3]);
    p.set(c[0], c[1] + 0.05, c[2]);
    s.set(c[5], c[6], c[4]);
    im.setMatrixAt(i, m.compose(p, q, s));
  });
  im.computeBoundingSphere();
  im.castShadow = true; im.receiveShadow = true;
  im.name = 'Cornices';
  im.userData.count = picks.length;
  return im;
}
