// Instant restart and retry (Trackmania's one-key restart, its checkpoint respawn, Skate's "back to my
// marker"). Nothing here changes how the rider rides: it only changes how fast you get back to try again.
//   R / Y          back to the top — now a 0.3 s flash instead of a 1.3 s fade. A Challenge restarts with a
//                  short 2, 1, GO countdown (THRILL.restart.countdown).
//   Backspace / d-pad ▼   retry from the last take-off: back on the approach THRILL.retry.lead s before it,
//                  with the speed you had there (also while tumbling after a crash). Zen only; in a
//                  Challenge it restarts the run (a retry mid-run would break the clock).
// The retried run no longer counts as a clean run (progression), as with drop zones.
import { emit, on, game, Mode } from '../state.js';
import { State } from '../player.js';
import { THRILL, RetryTrail } from './core.js';
import { progression } from '../progression/index.js';

export function installRetry({ player, input, activities, ui, cam }) {
  const C = THRILL.retry, R = THRILL.restart;
  const trail = new RetryTrail(C.keep);
  let clock = 0, sampleT = 0;

  /** Black flash, action, back in. Keeps the player's own fade-lock (_busy) so nothing double-fires. */
  async function quick(action) {
    if (player._busy) return;
    player._busy = true;
    try {
      await ui.fade(true, R.fadeIn);
      action();
      cam?.snap?.();
      await new Promise((r) => setTimeout(r, R.hold));
    } finally {
      ui.fade(false, R.fadeOut);
      player._busy = false;
    }
  }

  // R: the player's own reset, made quick (player.js calls this.resetToTop() on the reset key).
  player.resetToTop = function resetToTopQuick() {
    if (this._busy || this.state === State.FROZEN) return;
    quick(() => {
      this.startRiding();
      emit('resetTop');   // activities restarts a Challenge here (its listener was added first)
      if (activities?.mode === 'challenge' && activities.state === 'countdown') activities.count = Math.min(activities.count, R.countdown);
      trail.clear();
      emit('thrillRestart', { mode: activities?.mode || 'zen' });
    });
  };

  function retry() {
    if (game.mode !== Mode.RIDING || player._busy) return;
    if (activities?.mode === 'challenge') {
      if (activities.state === 'running' || activities.state === 'countdown') player.resetToTop();
      return;
    }
    if (player.state === State.FROZEN || player.state === State.LIFT) return;
    const p = trail.pick(C.lead);
    if (!p) { emit('hint', 'Retry needs a jump first · take off, then Backspace (d-pad ▼) puts you back on the approach'); return; }
    quick(() => {
      player.place({ x: p.x, y: 0, z: p.z }, p.h);
      player.velocity.set(p.vx, p.vy, p.vz);
      player.speed = player.velocity.length();
      player.snapRender();
      progression.core?.crashInRun?.();   // a retried run isn't a clean run
      emit('respawned');
      emit('thrillRetry', { x: p.x, z: p.z, speed: player.speed });
      // Keep the take-off so the same retry works again and again.
      trail.s = trail.s.filter((s) => s.t <= p.t);
      clock = p.t; trail.takeoffT = p.t + C.lead;
    });
  }

  on('takeoff', () => { if (game.mode === Mode.RIDING) trail.markTakeoff(clock); });
  on('rideStarted', () => { trail.clear(); clock = 0; });
  on('dropZone', () => trail.clear());

  return {
    trail,
    retry,
    update(dt) {
      if (game.mode !== Mode.RIDING) return;
      if (input.codePressed('Backspace') || input.btnPressed(13)) retry();   // 13 = d-pad down
      if (player.state === State.FROZEN || player._busy) return;
      clock += dt;   // air and tumbles count too, so the lead is real riding time
      if (player.state !== State.GROUNDED) return;
      sampleT -= dt;
      if (sampleT > 0) return;
      sampleT = 1 / C.sampleHz;
      const p = player.position, v = player.velocity;
      trail.push(clock, { x: p.x, y: p.y, z: p.z, h: player.heading, vx: v.x, vy: v.y, vz: v.z });
    },
  };
}
