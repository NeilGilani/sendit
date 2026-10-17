// Juice: in-ride game feel on every map (docs/game-feel.md).
//   combo.js    one combo chain for every map (mirrors the flow line chain / challenge combo)
//   hud.js      trick announcer, landing grades, combo panel, live air, call-outs, banners, toasts
//   impact.js   hit-stop + micro slow-mo (TimeWarp), camera punches, rumble
//   speedfx.js  speed rush post pass (edge zoom blur, chromatic fringe, rush lines)
//   music.js    music energy from speed / air / combo, drops on big moments
// installJuice() is called once by main.js after the systems exist; main.js calls juice.update() per
// frame and multiplies the physics clock by juice.timeScale(dt).
import { ComboTracker } from './combo.js';
import { mountJuiceHud, gradeOf, TIERS } from './hud.js';
import { TimeWarp, installImpact, shakeAmount } from './impact.js';
import { installSpeedFx } from './speedfx.js';
import { MusicEnergy } from './music.js';
import { mountJuiceSettings } from './settings.js';
import { SplitTracker } from './splits.js';
import { HotTrail } from './trail.js';
import { game, Mode, on, emit } from '../state.js';

export function installJuice({ player, cam, sound, input, post, camera, fx, activities, scene }) {
  const combo = new ComboTracker(player);
  const warp = new TimeWarp();
  const hud = typeof document !== 'undefined' ? mountJuiceHud({ player, combo, input, camera }) : null;
  installImpact({ warp, cam, input, player });
  let speedfx = null;
  try { if (post) speedfx = installSpeedFx({ post, camera }); } catch (e) { console.warn('[juice] speed fx off', e); }
  const music = new MusicEnergy({ sound, player, combo });
  mountJuiceSettings();
  const splits = activities ? new SplitTracker(activities) : null;
  let trail = null;
  try { if (scene) trail = new HotTrail(scene, player); } catch (e) { console.warn('[juice] trail off', e); }
  const juice = {
    combo, warp, hud, speedfx, music, splits, trail,
    /** Physics time scale for this frame (hit-stop / micro slow-mo); 1 = real time. */
    timeScale(dt) {
      if (game.mode === Mode.RIDING) return warp.scale(dt);
      warp.cur = null; warp.k = 1;   // leaving the ride (lift, pause, lobby) drops any warp in progress
      return 1;
    },
    update(dt, time) {
      const riding = game.mode === Mode.RIDING;
      if (riding) { combo.update(dt * warp.k); juice.trackWipe?.(); }
      // A hot chain opens the lens a little (+0.75° per ×1 above ×1, at most +3°, scaled by the shake setting).
      const c = riding ? combo.state() : null;
      if (cam) cam.juiceFov = c ? Math.min(3, (c.mult - 1) * 0.75) * shakeAmount() : 0;
      trail?.update(dt, c?.mult ?? 1, !!player.flow?.inState || combo.feverT > 0, riding);
      hud?.update(dt);
      music.update(dt);
      speedfx?.update(dt, time, player.speedRatio ?? 0, riding, !!player.flow?.inState);
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
  on('juiceCombo', (s) => queueMicrotask(() => comboTick(s)));   // after every 'score' listener (lastPts is this move's)
  const comboTick = (s) => {
    const m = s?.mult ?? 1;
    if (s && m > lastMult + 0.01 && lastPts < 60 && sound?.ctx) sound.oneShot?.('combo_tick', 0.3, 0.85 + Math.min(m, 6) * 0.07)?.catch?.(() => {});
    // A new tier word (NICE, SICK, INSANE…): a bright high tick and a short buzz.
    const tier = TIERS.filter((t) => m >= t[0]).length, was = TIERS.filter((t) => lastMult >= t[0]).length;
    if (s && tier > was) {
      input?.rumble?.(0.2 + tier * 0.08, 0.7, 110);
      if (sound?.ctx) sound.oneShot?.('combo_tick', 0.42, 1.3 + tier * 0.08)?.catch?.(() => {});
    }
    lastMult = m;
  };
  on('countdown', (n) => { if (n === 0) speedfx?.pulse('bank'); });   // GO!: a burst of rush lines
  on('juiceFever', ({ on: st }) => { if (st) { speedfx?.pulse('flow'); cam?.kick?.({ fov: 4 * shakeAmount() }); } });
  // Rails: a light buzz on the lock-in and on each kink.
  on('grindStart', () => input?.rumble?.(0.15, 0.45, 90));
  on('grindKink', () => input?.rumble?.(0.3, 0.5, 70));
  // Wipeouts (Hall of Meat lite): measure the tumble from the crash to the respawn; progression pays a little XP.
  let wipe = null;
  on('crashed', (kind) => { if (game.mode === Mode.RIDING) wipe = { kind, x: player.position.x, z: player.position.z, speed: player.speed || 0, far: 0 }; });
  on('respawned', () => {
    if (!wipe) return;
    const w = wipe; wipe = null;
    emit('juiceWipeout', { kind: w.kind, tumble: Math.round(w.far * 10) / 10, speed: w.speed });
  });
  on('rideStarted', () => { wipe = null; });
  juice.trackWipe = () => { if (wipe && player.state === 3) wipe.far = Math.max(wipe.far, Math.hypot(player.position.x - wipe.x, player.position.z - wipe.z)); };
  if (typeof window !== 'undefined') window.__juice = juice;
  return juice;
}
