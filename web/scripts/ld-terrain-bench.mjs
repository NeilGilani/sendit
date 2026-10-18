// Bench: the loading scene's terrain build (height function + meshes + baked visibility) in Node.
// Usage: node scripts/ld-terrain-bench.mjs [runs=3]
import * as THREE from 'three';
import { pickVariant } from '../src/loading/variants.js';
import { makeHeight, buildTerrain } from '../src/loading/terrain.js';

const runs = Number(process.argv[2] || 3);
for (let i = 0; i < runs; i++) {
  const v = pickVariant({ seed: 7101 + i });
  const sun = new THREE.Vector3(Math.sin(v.sunAz) * Math.cos(v.sunElev), Math.sin(v.sunElev), -Math.cos(v.sunAz) * Math.cos(v.sunElev));
  const t0 = performance.now();
  const h = makeHeight(v);
  const t = buildTerrain(h, sun, new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial());
  console.log(`seed ${v.seed}: ${Math.round(performance.now() - t0)} ms  ${JSON.stringify(t.stats)}`);
}
