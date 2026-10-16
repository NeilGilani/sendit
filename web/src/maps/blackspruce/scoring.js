// Tree-run scoring for Blackspruce Plunge, layered on the game's close shaves (player.js emits
// 'nearMiss' within FX.nearMissRadius of a hitbox and scores +15):
//   • Threaded — a close shave under THREAD metres from the hitbox is worth a bonus on top.
//   • Tree slalom ×N — close shaves chained less than CHAIN seconds apart; the chain banks at
//     every STEP shaves (bigger each time) and breaks on a crash or a gap.
// Only installed while this map is loaded (maps load once per page). Scores go through addScore,
// so they also feed the challenge combo multiplier.
import { on, addScore, emit, game, Mode } from '../../state.js';

export const TREE_SCORING = { THREAD: 0.9, threadPoints: 30, CHAIN: 1.6, STEP: 5, stepPoints: 40 };

export function installScoring() {
  const S = TREE_SCORING;
  let chain = 0, last = -Infinity;
  const offs = [
    on('nearMiss', ({ dist }) => {
      if (game.mode !== Mode.RIDING) return;
      const now = performance.now() / 1000;
      chain = now - last < S.CHAIN ? chain + 1 : 1;
      last = now;
      if (dist < S.THREAD) addScore('Threaded', S.threadPoints);
      if (chain % S.STEP === 0) {
        addScore(`Tree slalom ×${chain}`, S.stepPoints * (chain / S.STEP));
        emit('hint', chain >= 15 ? 'Untouchable in the trees!' : 'Keep weaving — the chain is building');
      }
    }),
    on('crashed', () => { chain = 0; }),
    on('respawned', () => { chain = 0; }),
  ];
  return () => offs.forEach((f) => f());
}
