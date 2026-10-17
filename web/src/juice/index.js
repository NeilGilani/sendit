// Juice: in-ride game feel on every map (docs/game-feel.md).
//   combo.js    one combo chain for every map (mirrors the flow line chain / challenge combo)
//   hud.js      trick announcer, landing grades, combo panel, live air, call-outs, banners, toasts
//   impact.js   hit-stop + micro slow-mo (TimeWarp), camera punches, rumble
//   speedfx.js  speed rush post pass (edge zoom blur, chromatic fringe, rush lines)
//   music.js    music energy from speed / air / combo, drops on big moments
// installJuice() is called once by main.js after the systems exist; main.js calls juice.update() per
// frame and multiplies the physics clock by juice.timeScale(dt).
import { ComboTracker } from './combo.js';
import { mountJuiceHud, gradeOf } from './hud.js';
import { TimeWarp, installImpact } from './impact.js';
import { installSpeedFx } from './speedfx.js';
import { MusicEnergy } from './music.js';
import { mountJuiceSettings } from './settings.js';
import { SplitTracker } from './splits.js';
import { game, Mode, on } from '../state.js';

export function installJuice({ player, cam, sound, input, post, camera, fx, activities }) {
  const combo = new ComboTracker(player);
  const warp = new TimeWarp();
  const hud = typeof document !== 'undefined' ? mountJuiceHud({ player, combo, input }) : null;
  installImpact({ warp, cam, input, player });
  let speedfx = null;
  try { if (post) speedfx = installSpeedFx({ post, camera }); } catch (e) { console.warn('[juice] speed fx off', e); }
  const music = new MusicEnergy({ sound, player, combo });
  mountJuiceSettings();
  const splits = activities ? new SplitTracker(activities) : null;
  const juice = {
    combo, warp, hud, speedfx, music, splits,
    /** Physics time scale for this frame (hit-stop / micro slow-mo); 1 = real time. */
    timeScale(dt) { return game.mode === Mode.RIDING ? warp.scale(dt) : 1; },
    update(dt, time) {
      const riding = game.mode === Mode.RIDING;
      if (riding) combo.update(dt * warp.k);
      hud?.update(dt);
      music.update(dt);
      speedfx?.update(dt, time, player.speedRatio ?? 0, riding);
    },
    toast: (o) => hud?.toast(o),
  };
  // Boost pulses for the rush lines.
  on('landed', (e) => {
    if (!e.clean || e.result === 'crash') return;
    // A stomp throws an extra ring of snow (the landing spray itself is fx.js's).
    const g = gradeOf(e);
    if ((g === 'stomped' || g === 'perfect') && (e.trick || e.air > 1)) fx?.burst?.(player.renderPos, g === 'stomped' ? 46 : 30, g === 'stomped' ? 5.5 : 4);
    if (!speedfx) return;
    const huge = /720|900|1080|flip|cork|misty|rodeo|wildcat|tamedog/i.test(e.trick || '') || e.air >= 2;
    if (huge) speedfx.pulse('huge');
    else if (e.perfect && (e.trick || e.air > 1)) speedfx.pulse('stomp');
  });
  // Combo ticks: each multiplier step plays the tick a little higher (THPS). audio.js already ticks
  // scores of 60+ points, so only the small moves (close shaves, short rails) tick here.
  let lastPts = 0, lastMult = 1;
  on('score', ({ points }) => { lastPts = points; });
  on('juiceCombo', (s) => {
    const m = s?.mult ?? 1;
    if (s && m > lastMult + 0.01 && lastPts < 60 && sound?.ctx) sound.oneShot?.('combo_tick', 0.3, 0.85 + Math.min(m, 6) * 0.07)?.catch?.(() => {});
    lastMult = m;
  });
  // Rails: a light buzz on the lock-in and on each kink.
  on('grindStart', () => input?.rumble?.(0.15, 0.45, 90));
  on('grindKink', () => input?.rumble?.(0.3, 0.5, 70));
  if (typeof window !== 'undefined') window.__juice = juice;
  return juice;
}
