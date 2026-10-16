// Tree-run scoring and juice for Blackspruce Plunge, layered on the game's close shaves (player.js
// emits 'nearMiss' within FX.nearMissRadius of a hitbox and scores +15):
//   • Threaded — a close shave under THREAD metres from the hitbox is worth a bonus on top.
//   • Tree slalom ×N — close shaves chained less than CHAIN seconds apart; the chain banks at
//     every STEP shaves (bigger each time) and breaks on a crash or a gap.
//   • First rides: a hint explains the fork signs (first three ride starts per session).
//   • Branch dump — thread a spruce closer than DUMP metres and the snow sloughs off its branches
//     on your side (mist, falling clumps, a few glints).
// Only installed while this map is loaded (maps load once per page). Scores go through addScore,
// so they also feed the challenge combo multiplier.
import * as THREE from 'three';
import { on, addScore, emit, game, Mode } from '../../state.js';
import { K_MIST, K_CHUNK, K_GLINT } from '../../gfx/spray.js';

export const TREE_SCORING = { THREAD: 0.9, threadPoints: 30, CHAIN: 1.6, STEP: 5, stepPoints: 40, DUMP: 1.3 };

const _p = new THREE.Vector3(), _v = new THREE.Vector3();

/** Snow sloughing off a spruce's branches on the side the rider brushed past. */
function branchDump(x, z, player) {
  const s = typeof window !== 'undefined' ? window.__sendit : null;   // the game's handles (main.js)
  const spray = s?.fx?.spray, T = s?.terrain;
  if (!spray || !T || !player) return;
  const g = T.getHeight(x, z);
  const dx = player.position.x - x, dz = player.position.z - z, l = Math.hypot(dx, dz) || 1;
  const sx = dx / l, sz = dz / l;   // toward the rider
  const vx = player.velocity.x * 0.25, vz = player.velocity.z * 0.25;
  for (let i = 0; i < 22; i++) {   // a soft cloud shaken off the lower whorls
    const h = 1.6 + Math.random() * 3.2, r = 0.6 + Math.random() * 1.2;
    _p.set(x + sx * r + (Math.random() - 0.5) * 1.2, g + h, z + sz * r + (Math.random() - 0.5) * 1.2);
    _v.set(vx + sx * 0.6 + (Math.random() - 0.5) * 0.8, -0.3 - Math.random() * 0.6, vz + sz * 0.6 + (Math.random() - 0.5) * 0.8);
    spray.spawn(K_MIST, _p, _v, 0.25 + Math.random() * 0.35, 1.6 + Math.random() * 1.2, { dens: 0.35, grow: 1.8, grav: 0.4 });
  }
  for (let i = 0; i < 16; i++) {   // clumps dropping off the branch tips
    _p.set(x + sx * (0.8 + Math.random()) + (Math.random() - 0.5), g + 2 + Math.random() * 3, z + sz * (0.8 + Math.random()) + (Math.random() - 0.5));
    _v.set(vx * 0.5 + (Math.random() - 0.5) * 0.6, -0.5 - Math.random(), vz * 0.5 + (Math.random() - 0.5) * 0.6);
    spray.spawn(K_CHUNK, _p, _v, 0.03 + Math.random() * 0.06, 0.9 + Math.random() * 0.6);
  }
  for (let i = 0; i < 6; i++) {
    _p.set(x + sx * 1.2, g + 2 + Math.random() * 2.5, z + sz * 1.2);
    _v.set((Math.random() - 0.5) * 0.8, -0.2, (Math.random() - 0.5) * 0.8);
    spray.spawn(K_GLINT, _p, _v, 0.015 + Math.random() * 0.02, 0.8 + Math.random() * 0.6);
  }
}

export function installScoring() {
  const S = TREE_SCORING;
  let chain = 0, last = -Infinity, starts = 0;
  const offs = [
    on('nearMiss', ({ dist, kind, x, z }) => {
      if (game.mode !== Mode.RIDING) return;
      const now = performance.now() / 1000;
      chain = now - last < S.CHAIN ? chain + 1 : 1;
      last = now;
      if (dist < S.THREAD) addScore('Threaded', S.threadPoints);
      if (kind === 'tree' && dist < S.DUMP) branchDump(x, z, typeof window !== 'undefined' ? window.__sendit?.player : null);
      if (chain % S.STEP === 0) {
        addScore(`Tree slalom ×${chain}`, S.stepPoints * (chain / S.STEP));
        if (chain === 10) emit('hint', 'Tree slalom ×10 — keep weaving');
        if (chain === 20) emit('hint', 'Untouchable in the trees!');
      }
    }),
    on('rideStarted', () => {
      if (++starts > 3) return;
      setTimeout(() => { if (game.mode === Mode.RIDING) emit('hint', 'Forks:  ◆◆ SLOT fast and tight  ·  ◆ FLOW  ·  ■ LONG WAY wide'); }, 2500);
    }),
    on('crashed', () => { chain = 0; }),
    on('respawned', () => { chain = 0; }),
  ];
  return () => offs.forEach((f) => f());
}
