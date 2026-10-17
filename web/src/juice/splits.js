// Challenge split times (Trackmania): at every gate the run's clock (time + penalties) is compared with
// the same gate on the best run, and the HUD flashes the delta (−0.42 green / +0.31 pink). The best
// run's splits are saved when the activity reports a new best time (runFinished.isBestTime).
// Storage: localStorage 'sendit.splits.<courseKey>' = { s: [seconds at gate 1, gate 2, …], t: finish time }.
// Events: juiceSplit {i, time, best, delta} (delta null on a first run), juiceSplitFinal {time, best, delta}.
import { on, emit } from '../state.js';

const KEY = (k) => `sendit.splits.${k}`;
const store = {
  get(k) { try { const v = JSON.parse(globalThis.localStorage?.getItem(k)); return v && Array.isArray(v.s) ? v : null; } catch { return null; } },
  set(k, v) { try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* quota */ } },
};

export class SplitTracker {
  /** activities: { key, mode, time, penalty } (activities.js) */
  constructor(activities, storage = store) {
    this.a = activities; this.storage = storage;
    this.cur = []; this.best = null;
    this.offs = [
      on('activity', ({ type }) => this.start(type)),
      on('gate', () => this.gate()),
      on('runFinished', (r) => this.finish(r)),
    ];
  }

  dispose() { for (const o of this.offs) o(); }

  start(type) {
    this.cur = [];
    this.active = type === 'challenge';
    this.best = this.active ? this.storage.get(KEY(this.a.key)) : null;
  }

  gate() {
    if (!this.active) return null;
    const t = (this.a.time || 0) + (this.a.penalty || 0);
    const i = this.cur.length;
    this.cur.push(+t.toFixed(3));
    const best = this.best?.s[i];
    const e = { i, time: t, best: best ?? null, delta: best != null ? t - best : null };
    emit('juiceSplit', e);
    return e;
  }

  finish(r) {
    if (!this.active || !r) return;
    const prev = this.best?.t ?? null;
    const e = { time: r.time, best: prev, delta: prev != null ? r.time - prev : null, isBest: !!r.isBestTime };
    emit('juiceSplitFinal', e);
    if (r.isBestTime) this.storage.set(KEY(this.a.key), { s: this.cur, t: r.time });
    this.active = false;
    return e;
  }
}

/** "−0.42" / "+1.07" */
export const fmtDelta = (d) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
