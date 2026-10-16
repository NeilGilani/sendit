// Flow: the SSX-flavoured energy layer on top of the realistic riding (opt-in per map: PHYSICS.flow).
//   • Line chain — every scored move (landed trick, drop, carve, close shave, roof ride…) while the
//     chain is alive adds to it; the multiplier grows ×0.25 per DIFFERENT move (repeats count half),
//     up to ×5. The chain is banked as a "Line" bonus after `chainWindow` s without a new move (the
//     air keeps it alive) and lost on a crash.
//   • Flow meter — filled by landed tricks, drops, perfect landings, close shaves and speed; it drains
//     slowly when nothing happens. Full → "SEND IT" flow state for `state` s (+`extend` per landed trick):
//     a little more top speed, pop and spin, wider landing tolerance, ×`scoreMul` trick points.
//     Its effects are read by physics/edge.js and player.js through player.flowBoost (0..1).
// Headless (no DOM): the HUD (flowhud.js) and audio / camera listen to the events below.
// Events: flowChain {mult, pts, n, items}, flowBanked {bonus, mult, pts}, flowLost {pts},
//         flowMeter {value}, flowState {on}, landingGrade {grade, label, drop, impact}
import { PHYSICS as P } from '../config.js';
import { emit, on, addScore } from '../state.js';

export const FLOW_DEFAULTS = {
  enabled: false,
  chainWindow: 3.2,          // s on the snow without a new move before the chain banks
  multStep: 0.25,            // multiplier per different move
  multMax: 5,
  repeatCredit: 0.5,         // a move repeated within the chain counts this much
  fill: { trick: 0.12, perPoint: 0.0004, perfect: 0.1, dropPerM: 0.008, nearMiss: 0.05, speedPerS: 0.025, carve: 0.03 },
  speedFrom: 24,             // m/s above which speed alone fills the meter
  drain: 0.012,              // per second when idle
  crashLoss: 0.5,            // share of the meter lost on a crash
  state: 9,                  // s of flow state
  extend: 1.6,               // s added per landed trick in flow state
  stateMax: 20,
  scoreMul: 2,
  speedBoost: 0.1,           // +10 % soft-cap speed in flow state
  popBoost: 0.2, spinBoost: 0.15, landBoost: 0.25,
};

export class Flow {
  constructor(player) {
    this.pl = player;
    this.C = { ...FLOW_DEFAULTS, ...(P.flow || {}), fill: { ...FLOW_DEFAULTS.fill, ...(P.flow?.fill || {}) } };
    this.meter = 0; this.stateT = 0; this.boost = 0;
    this.chain = null; this.idle = 0;
    this.offs = [
      on('score', (e) => this.onScore(e)),
      on('landed', (e) => this.onLanded(e)),
      on('crashed', () => this.onCrash()),
      on('nearMiss', () => this.addMeter(this.C.fill.nearMiss)),
      on('respawned', () => this.reset(false)),
      on('rideStarted', () => this.reset(true)),
    ];
  }

  dispose() { for (const o of this.offs) o(); }

  reset(all) {
    this.chain = null;
    if (all) { this.meter = 0; this.stateT = 0; }
    emit('flowChain', null);
    emit('flowMeter', { value: this.meter, state: this.stateT > 0 });
  }

  get inState() { return this.stateT > 0; }

  addMeter(a) {
    if (this.inState || a <= 0) return;
    this.meter = Math.min(1, this.meter + a);
    if (this.meter >= 1) {
      this.stateT = this.C.state;
      this.meter = 1;
      emit('flowState', { on: true });
      this.pl.input?.rumble?.(0.7, 1, 420);
    }
  }

  onScore({ label, points }) {
    if (this._banking || !label || /^\d+ m$/.test(label)) return;   // distance markers are not moves
    const key = moveKey(label);
    if (!this.chain) this.chain = { pts: 0, n: 0, seen: new Map(), items: [] };
    const c = this.chain;
    const seen = c.seen.get(key) || 0;
    c.seen.set(key, seen + 1);
    c.n += seen ? this.C.repeatCredit : 1;
    c.pts += points;
    c.items.push(label);
    if (c.items.length > 6) c.items.shift();
    this.idle = 0;
    emit('flowChain', this.chainState());
  }

  chainState() {
    const c = this.chain;
    if (!c) return null;
    return { mult: Math.min(this.C.multMax, 1 + Math.max(0, c.n - 1) * this.C.multStep), pts: c.pts, n: c.n, items: c.items.slice() };
  }

  bank() {
    const s = this.chainState();
    this.chain = null;
    if (!s) return;
    if (s.mult > 1 && s.pts > 0) {
      const bonus = Math.round(s.pts * (s.mult - 1));
      this._banking = true;
      addScore(`Line ×${trim(s.mult)}`, bonus);
      this._banking = false;
      emit('flowBanked', { bonus, mult: s.mult, pts: s.pts });
    } else emit('flowBanked', { bonus: 0, mult: s.mult, pts: s.pts });
    emit('flowChain', null);
  }

  onCrash() {
    if (this.chain) emit('flowLost', { pts: this.chain.pts });
    this.chain = null;
    emit('flowChain', null);
    this.meter *= 1 - this.C.crashLoss;
    if (this.stateT > 0) { this.stateT = 0; this.meter = 0.2; emit('flowState', { on: false }); }
    emit('flowMeter', { value: this.meter, state: false });
  }

  onLanded(e) {
    const F = this.C.fill;
    if (!e.clean) return;
    if (e.trick || e.air > 0.7) {
      this.addMeter(F.trick + (e.points || 0) * F.perPoint);
      if (this.inState) this.stateT = Math.min(this.C.stateMax, this.stateT + this.C.extend);
    }
    if (e.perfect) this.addMeter(F.perfect);
    if (e.drop > 5) this.addMeter(e.drop * F.dropPerM);
  }

  /** Per physics step. */
  update(dt) {
    const pl = this.pl, C = this.C;
    const air = pl.state === 2;   // State.AIR
    if (this.chain && !air) {
      this.idle += dt;
      if (this.idle > C.chainWindow) this.bank();
    }
    if (this.stateT > 0) {
      this.stateT -= dt;
      if (this.stateT <= 0) { this.stateT = 0; this.meter = 0.2; emit('flowState', { on: false }); }
    } else {
      if (pl.speed > C.speedFrom && pl.state === 1) this.addMeter(C.fill.speedPerS * dt * Math.min(2, (pl.speed - C.speedFrom) / 4));
      if (!this.chain && !air) this.meter = Math.max(0, this.meter - C.drain * dt);
    }
    // Ease the physical boost in / out (no snapping speed caps).
    this.boost += ((this.stateT > 0 ? 1 : 0) - this.boost) * (1 - Math.exp(-3 * dt));
    pl.flowBoost = this.boost;
    // Controller: a low rumble that builds with speed on the snow (the board chattering at 60 mph).
    this._rumbleT = (this._rumbleT || 0) - dt;
    if (this._rumbleT <= 0 && pl.state === 1 && pl.speed > 20) {
      const k = Math.min(1, (pl.speed - 20) / 12);
      pl.input?.rumble?.(0.04 + k * 0.16, 0.06 + k * 0.22, 140);
      this._rumbleT = 0.12;
    }
    this._emitT = (this._emitT || 0) - dt;
    if (this._emitT <= 0) { this._emitT = 0.1; emit('flowMeter', { value: this.meter, state: this.stateT > 0, t: this.stateT }); }
  }

  /** Trick-score multiplier while in flow state. */
  scoreMul() { return this.stateT > 0 ? this.C.scoreMul : 1; }
}

/** Group score labels into "moves" for the variety rule ("Perfect FS 540 Indy" and "FS 540" are the same move). */
export function moveKey(label) {
  return String(label).replace(/^(Perfect|Stomped|Clean|Sketchy)\s+/i, '').replace(/\d+(\.\d+)?\s*(m|s)\b/g, '#').replace(/\s+/g, ' ').trim();
}

const trim = (m) => (Math.round(m * 100) / 100).toString();
