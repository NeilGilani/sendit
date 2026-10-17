// Dragonback — ridge-to-ridge scoring (headless; course.onPlayer → attachRidgeScoring). Flow maps already
// score drops, tricks, landing grades, line goals and the line chain (physics/flow.js, player.js); this adds
// the map's own move: a clean landing on a DIFFERENT ridge from the one you took off from is a
// "Ridge hop · A → B" (more for the lateral distance and for landing on a crest), and hops landed one after
// another (each within 4 s of the last on the snow) chain into a "Ridge run ×N".
import { on, emit, addScore } from '../../state.js';
import { START_X } from './layout.js';

export const HOP = { base: 150, perM: 6, crest: 100, chainWindow: 4, chainPts: 120 };

export function attachRidgeScoring(course, pl) {
  if (!pl.flow) return;                      // flow maps only (the real game and the bots); never the lobby
  let chainN = 0, chainT = -99;
  const offs = [
    on('landingGrade', (e) => {
      const from = pl.takeoffPos ? ridgeUnder(course, pl.takeoffPos.x, pl.takeoffPos.z) : null;
      const to = ridgeUnder(course, pl.position.x, pl.position.z);
      if (!from || !to || e.grade === 'sketchy' || e.air < 0.5 || from.ridge === to.ridge) return;
      const lateral = Math.abs(to.v - from.v);
      if (lateral < 12) return;
      const crest = to.d < Math.max(3, to.ridge.topAt(to.u) + 1.5);
      const mul = pl.flow.scoreMul();
      const t = pl.flow.run?.time ?? 0;
      addScore(`Ridge hop · ${from.ridge.name} → ${to.ridge.name}${crest ? ' (crest)' : ''}`, Math.round((HOP.base + HOP.perM * lateral + (crest ? HOP.crest : 0)) * mul));
      chainN = t - chainT < HOP.chainWindow ? chainN + 1 : 1;
      chainT = t;
      if (chainN >= 2) addScore(`Ridge run ×${chainN}`, Math.round(HOP.chainPts * Math.min(6, chainN) * mul));
      pl.flow.addMeter(0.08);
      emit('ridgeHop', { from: from.ridge.name, to: to.ridge.name, lateral, crest, chain: chainN });
    }),
    on('crashed', () => { chainN = 0; }),
  ];
  // The listeners go with the rider's flow layer (bots make many riders in one process).
  const dispose = pl.flow.dispose.bind(pl.flow);
  pl.flow.dispose = () => { dispose(); for (const o of offs) o(); };
}

/** The ridge under world (x, z): { ridge, u, v, d } within the upper part of its flanks, or null. */
export function ridgeUnder(course, x, z) {
  const u = x - START_X, v = z;
  const hit = course.ridgeAt(u, v, 0.65);
  return hit ? { ridge: hit.ridge, u, v, d: hit.d } : null;
}
