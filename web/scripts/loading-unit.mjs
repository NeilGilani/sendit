// Node checks for the loading scene's choreography (no browser): for many variants and every trick,
// the hit lands (on the apron, past the rock band, after a sane air time), the rider lands upright and
// at the expected heading (forward or switch), the speed ramp is continuous, and every planned camera
// move clears the snow. Usage: node scripts/loading-unit.mjs  (exit 1 on failure)
import * as THREE from 'three';
import { makeHeight } from '../src/loading/terrain.js';
import { pickVariant, rng, tricksFor, TRICKS, CAMERAS } from '../src/loading/variants.js';
import { Shot } from '../src/loading/choreo.js';
import { planMove } from '../src/loading/shots.js';
import { Player } from '../src/player.js';

let failed = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { failed++; console.log(`FAIL  ${msg}`); } };
const fx = { spray() {}, takeoff() {}, landing() {}, slash() {} };
const flat = { getHeight: () => 0, getNormal: (_x, _z, _r, o = new THREE.Vector3()) => o.set(0, 1, 0), getSpawn: () => ({ position: new THREE.Vector3(), heading: 0 }) };
const noInput = { strength: () => 0, justPressed: () => false, key: () => false };
const UP = new THREE.Vector3(0, 1, 0), NOSE = new THREE.Vector3(0, 0, -1);

for (let seed = 1; seed <= 24; seed++) {
  const v = pickVariant({ seed: seed * 7919 });
  const h = makeHeight(v);
  ok(Math.abs(h.H(0, 0)) < 0.6, `seed ${v.seed}: lip at y≈0 (${h.H(0, 0).toFixed(2)})`);
  for (const gear of ['ski', 'snowboard']) {
    const pl = new Player(flat, { findObstacle: () => null, nearest: () => null }, null, noInput);
    pl.setEquipment(gear);
    for (const trick of tricksFor(gear)) {
      const r = rng(seed * 31 + trick.length);
      const sh = new Shot({ H: h.H, line: h.line, trick, gear, r });
      const tag = `seed ${v.seed} ${gear} ${trick}`;
      ok(sh.Ta > 1.8 && sh.Ta < 3.6, `${tag}: air time ${sh.Ta.toFixed(2)} s`);
      ok(sh.pLand.z < -h.line.cliffLen - 2, `${tag}: lands past the rock band (z ${sh.pLand.z.toFixed(1)})`);
      // Upright and heading at touchdown (just before) and on the ride-out.
      sh.pose(pl, sh.Ta - 0.002, 0.016, fx, 0);
      const up = UP.clone().applyQuaternion(pl.renderOrient);
      ok(up.y > 0.8, `${tag}: upright at touchdown (up.y ${up.y.toFixed(2)})`);
      const nose = NOSE.clone().applyQuaternion(pl.renderOrient).setY(0).normalize();
      const fwd = nose.z < 0;   // nose still down the line (−Z)?
      ok(fwd === !sh.landSwitch, `${tag}: lands ${sh.landSwitch ? 'switch' : 'forward'} (nose z ${nose.z.toFixed(2)})`);
      // Mid-air the trick actually rotates (flips go inverted).
      if (TRICKS[trick].flip) {
        let minUp = 1;
        for (let t = 0.1; t < sh.Ta; t += 0.05) { sh.pose(pl, t, 0.016, fx, 0); minUp = Math.min(minUp, UP.clone().applyQuaternion(pl.renderOrient).y); }
        ok(minUp < -0.3, `${tag}: goes inverted (min up.y ${minUp.toFixed(2)})`);
      }
      // Feet never below the snow before touchdown.
      let under = 0;
      for (let t = -1.5; t < sh.Ta - 0.05; t += 0.05) { sh.pose(pl, t, 0.016, fx, 0); under = Math.max(under, h.H(pl.renderPos.x, pl.renderPos.z) - pl.renderPos.y); }
      ok(under < 0.35, `${tag}: rider stays on / above the snow (max ${under.toFixed(2)} m under)`);
      // Speed ramp: continuous, slow in the air, real speed before and after.
      ok(Math.abs(sh.rate(-1.5) - 1) < 1e-3 && sh.rate(sh.Ta * 0.5) < 0.4 && Math.abs(sh.rate(sh.Ta + 2) - 1) < 1e-3, `${tag}: speed ramp`);
      for (const cam of Object.keys(CAMERAS)) {
        const m = planMove(cam, sh, new THREE.Vector3(0.4, 0.3, -0.8).normalize(), rng(seed + cam.length), h.H);
        for (const s of [0, 0.5, 1]) {
          const p = m.pos(s, sh.apex, 0);
          ok(p.y > h.H(p.x, p.z) + 0.5, `${tag} ${cam}: camera above the snow at s=${s} (${(p.y - h.H(p.x, p.z)).toFixed(1)} m)`);
        }
      }
    }
  }
}
console.log(failed ? `${failed} of ${checks} checks failed` : `all ${checks} checks passed`);
process.exit(failed ? 1 : 0);
