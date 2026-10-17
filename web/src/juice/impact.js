// Impact: hit-stop and micro slow motion on big moments, camera punches and rumble.
//   • TimeWarp.scale(dt) → the factor main.js multiplies the physics clock by (1 = real time).
//     A hit-stop freezes the simulation for `freeze` s (the camera, HUD, audio and particles keep
//     running), then eases from `slow` back to 1 over `recover` s. Rate-limited by `cooldown`.
//   • Camera punches go through CameraController.kick({ fov, dip, roll }) (camera.js), springs that
//     settle on their own.
// Tunables: JUICE_IMPACT. Settings: settings.juiceShake (0..1, default 1) scales every punch;
// settings.juiceHitstop === false turns the time warp off.
import { on, settings } from '../state.js';
import { gradeOf } from './hud.js';

export const JUICE_IMPACT = {
  // hit-stop presets: freeze (s), slow (time scale right after), recover (s back to 1)
  stomp: { freeze: 0.05, slow: 0.45, recover: 0.22 },       // a stomped / perfect landing of a real trick
  huge: { freeze: 0.085, slow: 0.3, recover: 0.38 },        // ≥ 720, a flip, or ≥ 2 s air, landed clean
  crash: { freeze: 0.07, slow: 0.5, recover: 0.25 },
  bank: { freeze: 0, slow: 0.6, recover: 0.3 },              // a big combo banks
  cooldown: 0.9,             // s between two warps
  // camera punches (fov in degrees: negative = the lens snaps tighter; dip in metres; roll in degrees)
  landFov: -0.5,             // per m/s of landing impact …
  landFovMax: -6,
  landDip: 0.035,            // … and a vertical dip per m/s
  landDipMax: 0.45,
  stompFov: 4.5,             // a stomp punches the lens open (speed rush out of the landing)
  nearFov: 3.2, nearRoll: 2.2,
  bankFov: 3,
  takeoffFov: 1.6,
};

export class TimeWarp {
  constructor() { this.t = 0; this.cur = null; this.cool = 0; this.k = 1; this.lastFreeze = 0; }

  /** Start a warp preset ({freeze, slow, recover}); ignored during the cooldown unless it is stronger. */
  hit(p) {
    if (settings.juiceHitstop === false || !p) return false;
    if (this.cool > 0 && p.freeze <= this.lastFreeze) return false;
    this.cur = p; this.t = 0; this.cool = JUICE_IMPACT.cooldown; this.lastFreeze = p.freeze;
    return true;
  }

  /** Advance by real dt and return the physics time scale for this frame. */
  scale(dt) {
    this.cool = Math.max(0, this.cool - dt);
    const p = this.cur;
    if (!p) return (this.k = 1);
    this.t += dt;
    if (this.t < p.freeze) return (this.k = 0);
    const u = Math.min(1, (this.t - p.freeze) / Math.max(1e-3, p.recover));
    if (u >= 1) { this.cur = null; return (this.k = 1); }
    return (this.k = p.slow + (1 - p.slow) * u * u * (3 - 2 * u));
  }
}

/** Wire impact feedback: warp (TimeWarp), cam (CameraController), input (rumble). */
export function installImpact({ warp, cam, input, player }) {
  const kick = (o) => { const s = settings.juiceShake ?? 1; if (s > 0) cam?.kick?.({ fov: (o.fov || 0) * s, dip: (o.dip || 0) * s, roll: (o.roll || 0) * s }); };
  const I = JUICE_IMPACT;
  const offs = [
    on('landed', (e) => {
      if (e.result === 'crash') return;
      const imp = e.impact || 0;
      kick({ fov: Math.max(I.landFovMax, I.landFov * imp), dip: Math.min(I.landDipMax, I.landDip * imp) });
      const grade = gradeOf(e);
      const big = e.clean && (/720|900|1080|1260|1440|flip|cork|misty|rodeo|wildcat|tamedog/i.test(e.trick || '') || e.air >= 2);
      if (big) { warp.hit(I.huge); input?.rumble?.(0.8, 1, 260); }
      else if ((grade === 'stomped' || grade === 'perfect') && (e.trick || e.air > 1)) warp.hit(I.stomp);
      if (grade === 'stomped' || (big && e.clean)) setTimeout(() => kick({ fov: I.stompFov }), (big ? I.huge.freeze : I.stomp.freeze) * 1000 + 30);
    }),
    on('crashed', () => warp.hit(I.crash)),
    on('nearMiss', ({ x, z }) => {
      // Roll away from the obstacle: which side of the rider it was on.
      let side = 1;
      if (player && x !== undefined) {
        const h = player.heading, dx = x - player.position.x, dz = z - player.position.z;
        side = Math.sign(-Math.cos(h) * dx + Math.sin(h) * dz) || 1;
      }
      kick({ fov: I.nearFov, roll: I.nearRoll * side });
    }),
    on('juiceComboBanked', ({ mult }) => { kick({ fov: I.bankFov * Math.min(2, mult / 2) }); if (mult >= 3) warp.hit(I.bank); input?.rumble?.(0.25, 0.6, 140); }),
    on('takeoff', ({ popped }) => { if (popped) kick({ fov: I.takeoffFov }); }),
    on('juiceLevelUp', () => input?.rumble?.(0.6, 1, 420)),
  ];
  return () => offs.forEach((o) => o());
}
