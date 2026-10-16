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
import { emit, on, addScore, game } from '../state.js';

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
  popBoost: 0.08, spinBoost: 0.08, landBoost: 0.25,   // small: SEND IT is energy, not a cannon (pop / rotation set, landing tolerance)
  stompBoost: 1.5,           // m/s added along the line on a stomped landing
  boostAccel: 1.8,           // m/s² of thrust while tucking in flow state (the SSX boost, kept small)
};

export class Flow {
  constructor(player) {
    this.pl = player;
    this.C = { ...FLOW_DEFAULTS, ...(P.flow || {}), fill: { ...FLOW_DEFAULTS.fill, ...(P.flow?.fill || {}) } };
    this.meter = 0; this.stateT = 0; this.boost = 0;
    this.chain = null; this.idle = 0;
    this.newRun();
    this.offs = [
      on('score', (e) => this.onScore(e)),
      on('landed', (e) => this.onLanded(e)),
      on('crashed', () => this.onCrash()),
      on('nearMiss', () => this.addMeter(this.C.fill.nearMiss)),
      on('respawned', () => this.reset(false)),
      on('rideStarted', () => { this.reset(true); this.newRun(); }),
      on('resetTop', () => this.newRun()),
      on('runComplete', () => this.finishRun()),
      on('stumble', () => { if (this.run) this.run.stumbles++; }),
      on('landingGrade', (e) => { if (this.run && e.grade !== 'sketchy') { if (e.feature) this.run.features.add(e.feature); if (e.roof) this.run.features.add(e.roof); this.goalStep([e.feature, e.roof]); } }),
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
      if (this.run) this.run.bestLine = Math.max(this.run.bestLine, bonus);
    } else emit('flowBanked', { bonus: 0, mult: s.mult, pts: s.pts });
    emit('flowChain', null);
  }

  onCrash() {
    if (this.goalProg) this.goalProg.fill(0);   // line goals must be clean
    if (this.run) this.run.crashes++;
    if (this.chain) emit('flowLost', { pts: this.chain.pts });
    this.chain = null;
    emit('flowChain', null);
    this.meter *= 1 - this.C.crashLoss;
    if (this.stateT > 0) { this.stateT = 0; this.meter = 0.2; emit('flowState', { on: false }); }
    emit('flowMeter', { value: this.meter, state: false });
  }

  onLanded(e) {
    const F = this.C.fill;
    const r = this.run;
    if (r && e.air > 0.35) {
      r.longestAir = Math.max(r.longestAir, e.air);
      if (e.clean) { r.biggestDrop = Math.max(r.biggestDrop, e.drop || 0); r.airs++; if (e.drop >= 10) r.drops++; r.trickPts += e.points || 0; if (e.trick) { r.tricks++; r.trickOnly += e.points || 0; } if (e.grade === 'stomped') r.stomps++; }
    }
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
    const r = this.run;
    if (r) {
      r.time += dt;
      if (pl.state === 1) { r.ground += dt; r.speedSum += pl.speed * dt; r.topSpeed = Math.max(r.topSpeed, pl.speed); if (pl.speed < 3) r.slow += dt; }
    }
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

  // ---------------------------------------------------------------- line goals (course.lineGoals)
  /**
   * Steep "Mountain Stories" style: course.lineGoals = [{ name, bonus, features: [names in order] }].
   * Each clean landing advances every goal whose next feature matches the take-off feature or the roof
   * landed on; finishing one in a run scores its bonus once ('lineGoal' event). A crash resets progress.
   */
  goalStep(names) {
    const G = this.pl.terrain?.course?.lineGoals;
    if (!G?.length || !this.run) return;
    if (!this.goalProg || this.goalProg.length !== G.length) this.goalProg = new Array(G.length).fill(0);
    for (const nm of names) {
      if (!nm) continue;
      G.forEach((g, i) => {
        if (this.run.goals.has(g.name) || g.features[this.goalProg[i]] !== nm) return;
        this.goalProg[i]++;
        if (this.goalProg[i] < g.features.length) { emit('lineGoalStep', { name: g.name, step: this.goalProg[i], of: g.features.length }); return; }
        this.run.goals.add(g.name);
        this._banking = true;
        addScore(`Line: ${g.name}`, Math.round(g.bonus * this.scoreMul()));
        this._banking = false;
        this.addMeter(0.35);
        emit('lineGoal', { name: g.name, bonus: g.bonus });
      });
    }
  }

  // ---------------------------------------------------------------- run summary (FWT-style judging)
  newRun() {
    this.run = { time: 0, ground: 0, speedSum: 0, topSpeed: 0, slow: 0, longestAir: 0, biggestDrop: 0, airs: 0, drops: 0,
      tricks: 0, trickPts: 0, trickOnly: 0, stomps: 0, bestLine: 0, crashes: 0, stumbles: 0, score0: game.score, features: new Set(), goals: new Set() };
    if (this.goalProg) this.goalProg.fill(0);
  }

  /**
   * Freeride World Tour judges one overall impression from Line, Fluidity, Control and Air & Style
   * (docs/map3-research.md). Here each is 0–25 from what the run measured:
   *   Line      — the biggest drop, how many real drops (≥ 10 m) and how many different named features
   *               (course.featureAt: the Throne, the Ravine, a roof…) the line linked
   *   Fluidity  — average speed on the snow, minus time spent crawling (< 3 m/s)
   *   Control   — 25 minus crashes and stumbles; stomped landings earn back a little
   *   Air & Style — points from real tricks (spins, flips, grabs) and how many; plain airs count a little
   */
  finishRun() {
    const r = this.run;
    if (!r || r.time < 5) return;
    const avg = r.speedSum / Math.max(1, r.ground);
    const clamp25 = (x) => Math.max(0, Math.min(25, x));
    const line = clamp25(r.biggestDrop * 0.4 + r.drops * 1.6 + r.features.size * 1.5);   // + linking different named features
    const fluidity = clamp25(avg / 24 * 25 - (r.slow / Math.max(1, r.time)) * 40);
    const control = clamp25(25 - r.crashes * 7 - r.stumbles * 2.5 + r.stomps * 0.8);
    const style = clamp25(r.trickOnly / 120 + r.tricks * 1.2 + r.airs * 0.25);   // real tricks (spins, flips, grabs) count; plain airs a little
    const total = Math.round(line + fluidity + control + style);
    const summary = { ...r, avg, line, fluidity, control, style, total, score: game.score - r.score0, featureList: [...r.features], goalList: [...r.goals] };
    this.lastRun = summary;
    emit('runSummary', summary);
    this.newRun();
  }
}

/** Group score labels into "moves" for the variety rule ("Perfect FS 540 Indy" and "FS 540" are the same move). */
export function moveKey(label) {
  return String(label).replace(/^(Perfect|Stomped|Clean|Sketchy)\s+/i, '').replace(/\d+(\.\d+)?\s*(m|s)\b/g, '#').replace(/\s+/g, ' ').trim();
}

const trim = (m) => (Math.round(m * 100) / 100).toString();
