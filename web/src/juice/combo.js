// Combo chain on every map: one live "chain" the HUD shows (juice/hud.js), whichever system owns it.
//   • flow maps (player.flow, physics/flow.js): mirrors the line chain (flowChain / flowBanked / flowLost)
//   • Challenge mode (activities.js): mirrors the style combo (combo / comboBanked / comboLost)
//   • everywhere else: its own chain — every scored move adds to it, the multiplier grows by
//     JUICE_COMBO.step per DIFFERENT move (repeats count `repeatCredit`), the chain banks as a
//     "Combo ×N" bonus after `window` s on the snow without a new move (air and rails keep it alive),
//     and a crash loses it.
// Events (all sources): juiceCombo {mult, pts, n, items, source} | null, juiceComboBanked {bonus, mult, pts, source},
// juiceComboLost {pts, mult, source}. Headless-safe (no DOM).
import { on, emit, addScore, game, Mode } from '../state.js';

export const JUICE_COMBO = {
  window: 3.4,          // s on the snow without a new move before the chain banks
  step: 0.5,            // multiplier per different move
  max: 6,
  repeatCredit: 0.35,   // a repeated move counts this much towards the multiplier
  minBankMult: 1.5,     // below this the chain just ends (no bonus line)
};

const AIR = 2, GRIND = 5;
const CHALLENGE_WINDOW = 2.6;   // activities.js CHALLENGE.comboWindow   // player State values (player.js) without importing three.js

export class ComboTracker {
  constructor(player, opts = {}) {
    this.pl = player;
    this.C = { ...JUICE_COMBO, ...opts };
    this.source = player.flow ? 'flow' : 'own';
    this.chain = null;       // own chain { pts, n, seen, items }
    this.mirror = null;      // flow / challenge state { mult, pts, n, items }
    this.idle = 0;
    this.best = 0;           // best banked bonus this ride
    this.offs = [
      // A Challenge run is scored on the activity's style combo, so it wins over the flow line chain.
      on('activity', ({ type }) => { this.source = type === 'challenge' ? 'challenge' : this.pl.flow ? 'flow' : 'own'; this.clear(); }),
      on('rideStarted', () => { this.clear(); this.best = 0; }),
      on('respawned', () => this.clear()),
      on('score', (e) => this.onScore(e)),
      on('crashed', () => this.lose()),
      // flow maps
      on('flowChain', (s) => { if (this.source === 'flow') this.setMirror(s); }),
      on('flowBanked', ({ bonus, mult, pts }) => { if (this.source === 'flow') this.banked(bonus, mult, pts); }),
      on('flowLost', ({ pts }) => { if (this.source === 'flow') this.lost(pts, this.mirror?.mult ?? 1); }),
      // challenge
      on('combo', (s) => { if (this.source === 'challenge') this.setMirror({ ...s, items: this.mirror?.items || [] }); }),
      on('comboBanked', ({ banked, mult }) => {
        if (this.source !== 'challenge') return;
        const pts = this.mirror?.pts ?? 0;
        if (mult < this.C.minBankMult) { this.mirror = null; emit('juiceCombo', null); return; }   // a lone move is not a combo
        this.banked(Math.max(0, banked - pts), mult, pts);   // activities banks pts × mult: the bonus is the extra
      }),
      on('comboLost', () => { if (this.source === 'challenge') this.lost(this.mirror?.pts ?? 0, this.mirror?.mult ?? 1); }),
    ];
  }

  dispose() { for (const o of this.offs) o(); }

  clear() { this.chain = null; this.mirror = null; this.idle = 0; emit('juiceCombo', null); }

  /** The live chain for the HUD: {mult, pts, n, items, left (0..1 of the window), source} or null. */
  state() {
    const s = this.source === 'own' ? this.ownState() : this.mirror;
    if (!s) return null;
    return { ...s, left: this.left(), source: this.source };
  }

  /** True while the source's own rules keep the chain from timing out (own: air + rails; flow: air; challenge: never). */
  live() {
    const st = this.pl.state;
    if (this.source === 'own') return st === AIR || st === GRIND;
    if (this.source === 'flow') return st === AIR;
    return false;
  }

  left() {
    const pl = this.pl;
    if (this.live()) return 1;
    if (this.source === 'flow' && pl.flow) return Math.max(0, 1 - pl.flow.idle / pl.flow.C.chainWindow);
    if (this.source === 'challenge') return this.mirror ? Math.max(0, 1 - this.idle / CHALLENGE_WINDOW) : 0;
    return Math.max(0, 1 - this.idle / this.C.window);
  }

  ownState() {
    const c = this.chain;
    if (!c) return null;
    return { mult: Math.min(this.C.max, 1 + Math.max(0, c.n - 1) * this.C.step), pts: c.pts, n: c.n, items: c.items.slice() };
  }

  setMirror(s) {
    this.mirror = s ? { mult: s.mult, pts: s.pts, n: s.n, items: s.items || [] } : null;
    this.idle = 0;
    emit('juiceCombo', this.state());
  }

  onScore({ label, points }) {
    if (this.source === 'challenge' && this.mirror && label) { this.mirror.items = [...this.mirror.items, label].slice(-6); emit('juiceCombo', this.state()); }
    if (this.source !== 'own' || this._banking || !label || /^\d+ m$/.test(label)) return;
    if (game.mode !== Mode.RIDING && game.mode !== Mode.LIFT && typeof document !== 'undefined') return;
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
    emit('juiceCombo', this.state());
  }

  /** Per frame (real seconds). Banks the own chain once it has been idle on the snow for the window. */
  update(dt) {
    if (!this.live()) this.idle += dt;
    if (this.source === 'own' && this.chain && this.idle >= this.C.window) this.bank();
    if (this.source === 'challenge' && this.mirror && this.idle > CHALLENGE_WINDOW + 0.3) this.mirror = null;   // the activity banks on its own clock
  }

  bank() {
    const s = this.ownState();
    this.chain = null;
    if (!s) return;
    if (s.mult >= this.C.minBankMult && s.pts > 0) {
      const bonus = Math.round(s.pts * (s.mult - 1));
      this._banking = true;
      addScore(`Combo ×${trim(s.mult)}`, bonus);
      this._banking = false;
      this.banked(bonus, s.mult, s.pts);
    } else emit('juiceCombo', null);
  }

  banked(bonus, mult, pts) {
    this.mirror = null;
    this.best = Math.max(this.best, bonus);
    if (bonus > 0) emit('juiceComboBanked', { bonus, mult, pts, source: this.source });
    emit('juiceCombo', null);
  }

  lose() {
    if (this.source !== 'own') return;   // flow / challenge report their own loss
    const s = this.ownState();
    this.chain = null;
    if (s) this.lost(s.pts, s.mult);
  }

  lost(pts, mult) {
    this.mirror = null;
    if (pts > 0) emit('juiceComboLost', { pts, mult, source: this.source });
    emit('juiceCombo', null);
  }
}

/** Same move = same trick family: "Perfect Left 540 Mute" and "Left 540 Mute" are one move; numbers vary. */
export function moveKey(label) {
  return String(label).replace(/^(Perfect|Sketchy|Locked-in)\s+/i, '').replace(/\s*·.*$/, '').replace(/\d+(\.\d+)?\s*(s|m)\b/g, '').trim().toLowerCase();
}

export const trim = (m) => (Math.round(m * 100) / 100).toString();
