// Adrenaline cues: when the rider is exposed — a cliff band or a big drop opening up ahead, a lot of air
// under the board, or flat-out speed — a heartbeat fades in (faster the more exposed) and the screen edges
// close in a little, pulsing with the beat. It is information the player already has (the camera shows the
// drop): it only makes the moment feel like it does on a real mountain. Nothing about the riding changes.
//
// Setting: "Adrenaline cues" (settings.thrillAdrenaline, default on). Reduced motion: no pulse, softer edge.
// Tunables: THRILL.exposure (core.js). Event: thrillExposure {level} at ~4 Hz while > 0.
import { game, Mode, settings, emit } from '../state.js';
import { THRILL, dropAhead, exposureLevel, heartbeatBpm } from './core.js';

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function installAdrenaline({ player, terrain, sound }) {
  const C = THRILL.exposure;
  let level = 0, drop = 0, probeT = 0, nextBeat = 0, emitT = 0, pulse = 0;
  const el = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (el) {
    el.id = 'thrill-vignette';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0;transition:none;'
      + 'background:radial-gradient(ellipse 72% 64% at 50% 52%, rgba(0,0,0,0) 55%, rgba(6,10,24,0.85) 100%);';
    document.body.appendChild(el);
  }

  /** One "lub-dub" on the sfx bus at audio time t. */
  function beat(t, gain) {
    const ctx = sound?.ctx, out = sound?.sfx;
    if (!ctx || !out) return;
    for (const [dt, f, g] of [[0, 62, 1], [0.13, 52, 0.7]]) {
      const o = ctx.createOscillator(), a = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(f * 1.6, t + dt);
      o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.05);
      a.gain.setValueAtTime(0.0001, t + dt);
      a.gain.exponentialRampToValueAtTime(gain * g, t + dt + 0.012);
      a.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.2);
      o.connect(a); a.connect(out);
      o.start(t + dt); o.stop(t + dt + 0.24);
    }
  }

  return {
    get level() { return level; },
    update(dt) {
      const on = settings.thrillAdrenaline !== false && game.mode === Mode.RIDING;
      let want = 0;
      if (on && (player.state === 1 || player.state === 2 || player.state === 5)) {
        const p = player.position;
        probeT -= dt;
        if (probeT <= 0) {
          probeT = 0.1;
          const vx = player.velocity.x, vz = player.velocity.z, hs = Math.hypot(vx, vz);
          drop = player.state === 1 && hs > 6 ? dropAhead((x, z) => terrain.getHeight(x, z), p.x, p.y, p.z, vx / hs, vz / hs, C.look) : 0;
        }
        const above = player.state === 2 ? p.y - terrain.getHeight(p.x, p.z) : 0;
        want = exposureLevel({ drop, above, speedRatio: player.speedRatio || 0 }, C);
      }
      level += (want - level) * Math.min(1, dt * (want > level ? C.rise : C.fall));
      if (level < 0.004) level = 0;
      // Heartbeat.
      const bpm = heartbeatBpm(level, C), ctx = sound?.ctx;
      if (bpm && ctx && ctx.state === 'running') {
        const now = ctx.currentTime;
        if (nextBeat < now) nextBeat = now + 0.05;
        if (nextBeat < now + 0.1) { beat(nextBeat, 0.16 + 0.34 * level); nextBeat += 60 / bpm; pulse = 1; }
      } else nextBeat = 0;
      pulse = Math.max(0, pulse - dt * 5);
      if (el) {
        const rm = reducedMotion();
        const o = level * C.vignette * (rm ? 0.6 : 1) + (rm ? 0 : pulse * level * 0.12);
        el.style.opacity = o.toFixed(3);
      }
      emitT -= dt;
      if (level > 0 && emitT <= 0) { emitT = 0.25; emit('thrillExposure', { level }); }
    },
  };
}
