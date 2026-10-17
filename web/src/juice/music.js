// Music energy: one 0..1 "energy" number from speed, air, the combo chain and big moments, and what it
// does to the soundtrack — all from outside audio.js, through its public surface only:
//   • sound.setMusicEnergy?.(level) / sound.musicDrop?.(kind, strength) when audio.js provides them
//     (optional hooks; duck-typed, nothing breaks without them)
//   • otherwise the existing track choice: `sound.flowOn` lifts the upbeat track (audio.js already
//     does this for the SEND IT flow state), held while energy stays above `liftOn`, released below
//     `liftOff` — the real flow state always wins
//   • stingers through sound.oneShot() on drops (a huge landing, a monster combo, a level-up)
// Bus events for anyone else (audio.js may adopt them): musicEnergy {level} (5 Hz), musicDrop {kind, strength}.
// Tunables: JUICE_MUSIC. Headless-safe.
import { on, emit, game, Mode } from '../state.js';

export const JUICE_MUSIC = {
  speedFrom: 0.55, speedFull: 1.0, speedWeight: 0.45,   // speed ratio → energy
  airWeight: 0.15,                                       // in the air
  comboPerMult: 0.12, comboMax: 0.45,                    // live chain: (mult − 1) × this
  flowBonus: 0.35,                                       // SEND IT state
  burstDecay: 0.35,                                      // 1/s: big moments add a burst that fades
  rise: 1.6, fall: 0.35,                                 // 1/s smoothing up / down
  liftOn: 0.62, liftOff: 0.4, liftMinHold: 8,            // upbeat track hysteresis (s held at least)
  stingerCooldown: 2.5,
};

export class MusicEnergy {
  constructor({ sound, player, combo }) {
    Object.assign(this, { sound, player, combo });
    this.level = 0; this.burst = 0; this.lifted = false; this.liftT = 0;
    this.emitT = 0; this.stingT = 0;
    this.offs = [
      on('landed', (e) => {
        if (!e.clean || e.result === 'crash') return;
        const huge = /720|900|1080|1260|1440|flip|cork|misty|rodeo|wildcat|tamedog/i.test(e.trick || '') || e.air >= 2;
        if (huge) this.drop('bigAir', Math.min(1, 0.6 + e.air * 0.12));
        else if (e.points > 0) this.burst = Math.min(1, this.burst + 0.12);
      }),
      on('juiceComboBanked', ({ mult }) => { if (mult >= 3) this.drop('combo', Math.min(1, mult / 6)); else this.burst = Math.min(1, this.burst + 0.15); }),
      on('juiceLevelUp', () => this.drop('levelUp', 1)),
      on('crashed', () => { this.burst = 0; this.level *= 0.5; }),
      on('mode', (m) => { if (m === Mode.MENU) { this.level = 0; this.burst = 0; this.release(); } }),
    ];
  }

  dispose() { for (const o of this.offs) o(); this.release(); }

  /** The real SEND IT state (polled: a ride restart clears it without a flowState event). */
  get flowReal() { return !!this.player?.flow?.inState; }

  drop(kind, strength) {
    this.burst = Math.min(1, this.burst + 0.5 * strength + 0.2);
    emit('musicDrop', { kind, strength });
    const s = this.sound;
    if (typeof s?.musicDrop === 'function') { s.musicDrop(kind, strength); return; }
    if (this.stingT > 0 || !s?.ctx) return;
    this.stingT = JUICE_MUSIC.stingerCooldown;
    // A riser-and-hit from the existing one-shots: a fast whoosh into the boost thump.
    s.oneShot?.('whoosh_slow', 0.35 + 0.25 * strength, 1.35)?.catch?.(() => {});
    setTimeout(() => s.oneShot?.('boost', 0.3 + 0.3 * strength, kind === 'levelUp' ? 1.2 : 1.05)?.catch?.(() => {}), 90);
  }

  release() {
    if (this.lifted && this.sound && !this.flowReal) this.sound.flowOn = false;
    this.lifted = false;
  }

  /** Target energy from the current ride (0..1). */
  target() {
    const C = JUICE_MUSIC, pl = this.player;
    if (game.mode !== Mode.RIDING) return 0;
    const r = pl.speedRatio ?? 0;
    const sp = Math.max(0, Math.min(1, (r - C.speedFrom) / (C.speedFull - C.speedFrom)));
    const c = this.combo?.state();
    const combo = c ? Math.min(C.comboMax, (c.mult - 1) * C.comboPerMult) : 0;
    return Math.min(1, sp * C.speedWeight + (pl.state === 2 ? C.airWeight : 0) + combo + (this.flowReal ? C.flowBonus : 0) + this.burst);
  }

  update(dt) {
    const C = JUICE_MUSIC;
    this.burst *= Math.exp(-C.burstDecay * dt);
    this.stingT = Math.max(0, this.stingT - dt);
    const t = this.target();
    this.level += (t - this.level) * (1 - Math.exp(-(t > this.level ? C.rise : C.fall) * dt));
    const s = this.sound;
    if (typeof s?.setMusicEnergy === 'function') s.setMusicEnergy(this.level);
    else if (s) {
      // Track choice: lift into the upbeat track at high energy (with hysteresis and a minimum hold).
      this.liftT = Math.max(0, this.liftT - dt);
      if (!this.lifted && this.level > C.liftOn && game.mode === Mode.RIDING) { this.lifted = true; this.liftT = C.liftMinHold; s.flowOn = true; }
      else if (this.lifted && this.liftT <= 0 && this.level < C.liftOff) this.release();
      if (this.lifted && !s.flowOn) s.flowOn = true;   // audio.js reset it on a flowState off: keep the lift until we release
    }
    this.emitT -= dt;
    if (this.emitT <= 0) { this.emitT = 0.2; emit('musicEnergy', { level: this.level }); }
  }
}
