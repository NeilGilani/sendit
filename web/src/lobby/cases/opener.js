// The case opening, CS:GO style (docs/rewards.md "The opening, frame by frame"):
//   0.00 s  the lobby fades into a dark studio; a real 3D crate drops onto the plinth (crate3d.js),
//           the camera pushes in, two latches snap open, light leaks from the seam
//   1.38 s  the lid bursts open: beam, sparks, spilled snow
//   1.95 s  the reel slides in above the glowing crate: a strip of item cards under a gold marker
//   2.25 s  the reel spins for 6.0 s on CS2's own curve, cubic-bezier(0.075, 0.82, 0.165, 1):
//           ~75 % of the distance in the first second, then a long crawl; a tick per card that
//           crosses the marker (≥ 55 ms apart, dropping in pitch as it slows); the crate's light
//           takes the colour of the card under the marker
//   8.25 s  it stops on the winner (often a hair away from a rarer card: the near miss); 0.6 s hold
//   8.85 s  the reveal: the pull rises out of the crate (skis / boards on a turntable) or appears on
//           your rider (clothing); rays, shockwave, particles and a fanfare that grow with the grade
// Skip: the button or Esc at once, or hold Space / Enter / gamepad A. Quick open (toggle) plays the same
// beats in a third of the time; "Open all" chains every case with quick timing.
// Without the lobby stage (no WebGL stage) the old 2D case box plays instead.
import { profileStore } from '../../profile/store.js';
import { rarityOf, RARITIES } from '../../profile/rarity.js';
import { skin, CASE_XP, seeded, rollCase, caseOdds, casePool, PITY } from '../../profile/rewards.js';
import { SERIES } from '../../profile/items.js';
import { SLOTS, STATS } from '../../profile/catalog.js';
import { itemArt, goldArt } from './art.js';
import { caseArt } from './caseArt.js';
import { caseSfx } from './sfx.js';
import { crateSfx } from '../../audio/crate.js';
import { crateShow } from './crate3d.js';
import { CanvasReel, reelMetrics } from './reelCanvas.js';
import './cases.css';

import { TIMING, TIMING_QUICK, REEL_EASE, cubicBezier } from './timing.js';

export { TIMING, TIMING_QUICK, REEL_EASE, cubicBezier };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const HOLD_SKIP = 0.4;   // seconds of Space / Enter / A to skip
const QUICK_KEY = 'sendit.cases.quick';
export const quickOpen = {
  get() { try { return localStorage.getItem(QUICK_KEY) === '1'; } catch { return false; } },
  set(v) { try { localStorage.setItem(QUICK_KEY, v ? '1' : '0'); } catch { /* private mode */ } },
};

/** A reel / grid card for a skin key (or the anonymous gold card). */
export function cardHtml(key, rarity, { big = false, label = true } = {}) {
  const r = rarityOf(rarity);
  const s = key ? skin(key) : null;
  const gold = rarity === 'gold' && !big;
  const art = gold || !s ? goldArt() : itemArt(s.item, s.variant);
  const name = gold || !s ? '★ Rare Special Item' : s.item.name;
  const sub = gold || !s ? 'Exceedingly Rare' : s.variant.name;
  return `<div class="cr-card r-${r.id}${big ? ' big' : ''}" style="--rc:${r.color}">
    <div class="cr-art">${art}</div>
    ${label ? `<div class="cr-name"><small>${esc(name)}</small><b>${esc(sub)}</b></div>` : ''}
  </div>`;
}

/**
 * Debug only: ?caseforce=<grade> (common | uncommon | rare | epic | legendary | gold, or grey, blue,
 * purple, pink, red) picks a seeded RNG whose roll lands in that grade, so every grade's reveal can be
 * checked. The roll itself is the normal one (same odds code, same reel, same save).
 */
const ALIAS = { grey: 'common', gray: 'common', blue: 'uncommon', purple: 'rare', pink: 'epic', red: 'legendary', covert: 'legendary', knife: 'gold' };
export function forcedRng(series) {
  let want = null;
  try { want = new URLSearchParams(location.search).get('caseforce'); } catch { return undefined; }
  if (!want) return undefined;
  want = ALIAS[want] || want;
  if (!RARITIES.some((r) => r.id === want)) return undefined;
  const pity = (profileStore.rewards?.sinceRed ?? 0) >= PITY - 1;
  const salt = (profileStore.rewards?.opened ?? 0) * 7919;
  for (let k = 1; k < 200000; k++) if (rollCase(series, seeded(k + salt), pity).rarity === want) return seeded(k + salt);
  return undefined;
}

let active = null;
// Test / capture hook (scripts/casesshot.mjs, crateshot.mjs): open with a seeded RNG for a reproducible reel.
if (typeof window !== 'undefined') window.__senditCasesApi = { open: (id, seed, o = {}) => openCaseShow(id, { ...o, rng: seed != null ? seeded(seed) : undefined }), seeded, crate: crateShow };

/** Is the opener on screen? */
export const openerActive = () => !!active;

/**
 * Open a case with the full show. `caseId` = an unopened case (first one if omitted).
 * opts: { onClose, rng, quick (default: the Quick open toggle), chain ({ pulls: [] } = "Open all") }.
 * Returns a promise for the result once the overlay closes: { result, equipped }.
 */
export function openCaseShow(caseId, { onClose, rng, quick, chain } = {}) {
  if (active) return active.promise;
  const c = caseId ? profileStore.unopened.find((x) => x.id === caseId) : profileStore.unopened[0];
  if (!c) return Promise.resolve(null);
  caseSfx.unlock();
  crateSfx.unlock();
  const result = profileStore.openCase(c.id, rng ?? forcedRng(c.series), { defer: true });   // announced at the reveal (no spoilers)
  if (!result) return Promise.resolve(null);
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  active = { promise };
  if (chain) chain.pulls.push(result);
  const go = () => {
    const ov = new Opener(result, { quick: quick ?? (!!chain || quickOpen.get()), chain }, () => { active = null; onClose?.(); resolve({ result, equipped: ov.equipped }); });
    ov.userClose = onClose;
    active.opener = ov;
    globalThis.__senditCases = { opener: ov, result };
  };
  // The 3D crate is normally warm (the Cases tab prewarms it); if not yet, wait for it briefly
  // rather than falling back to the 2D case.
  if (!crateShow.ready && crateShow.available()) Promise.race([crateShow.prewarm(), new Promise((r) => setTimeout(r, 5000))]).then(go);
  else go();
  return promise;
}

class Opener {
  constructor(result, { quick = false, chain = null } = {}, done) {
    this.result = result;
    this.done = done;
    this.quick = quick;
    this.chain = chain;
    this.T = quick ? TIMING_QUICK : TIMING;
    this.equipped = false;
    this.trace = [];          // per-frame { t, x, v, card } for frame-by-frame checks (scripts/casesshot.mjs)
    this.ticks = [];
    this.series = SERIES[result.case.series];
    // The 3D crate on the lobby stage; the 2D case box if the stage is not up. The clock starts after
    // begin() (it may dress the rider in the pull, a few hundred ms the first time), so t = 0 is drawn.
    this.cs = { result, timing: this.T, quick, clock: () => this.time(), under: null, tickPulse: 0, landed: false, revealAt: null, onCue: (n) => this.cue(n) };
    this.t0 = performance.now();
    this.d3 = crateShow.begin(this.cs);
    this.t0 = performance.now();
    this.build();
    this.phase = 'case';
    this.raf = requestAnimationFrame((n) => this.frame(n));
    this.onKey = (e) => this.key(e);
    this.onKeyUp = (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      // Held long enough but no frame saw it (a very slow machine): still a skip.
      if (this.holdSince != null && performance.now() - this.holdSince >= HOLD_SKIP * 1000) this.skip();
      this.holdSince = null;
    };
    addEventListener('keydown', this.onKey, true);
    addEventListener('keyup', this.onKeyUp, true);
    // A resize mid-spin re-measures the strip (cards are em-sized), so it still stops on the winner.
    this.onResize = () => { if (this.el && this.phase !== 'reveal') this.measure(); };
    addEventListener('resize', this.onResize);
    this.lobby = globalThis.__sendit?.lobby;
    if (this.lobby) this.lobby.overlay = this;
    this.padHeld = this.padA();   // an A press that opened the case does not count as a hold
    this.holdSince = null;
    if (!this.d3) caseSfx.open();
  }

  /** Show time in seconds since the click (frozen while a capture seeks). */
  time(now = performance.now()) { return this.frozen ?? (now - this.t0) / 1000; }

  build() {
    const { reel } = this.result;
    const el = document.createElement('div');
    el.className = `cr-overlay cv${this.d3 ? ' d3' : ''}${this.quick ? ' quick' : ''}`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `Opening ${this.series.name}`);
    el.style.setProperty('--sc', this.series.color);
    el.style.setProperty('--sa', this.series.accent);
    el.innerHTML = `
      <div class="cr-dim"></div>
      <div class="cr-head"><small>${this.chain ? `Opening all · ${this.chain.pulls.length} of ${this.chain.pulls.length + profileStore.unopened.length}` : 'Unlocking'}</small><b>${esc(this.series.name)}</b></div>
      ${this.d3 ? '' : `<div class="cr-case">${caseArt(this.result.case.series)}<div class="cr-light"></div></div>`}
      <div class="cr-reel" aria-hidden="true">
        <div class="cr-window"><div class="cr-strip">${reel.cards.map((c) => cardHtml(c.key, c.rarity)).join('')}</div></div>
        <div class="cr-streaks"></div>
        <div class="cr-marker"><i></i></div>
      </div>
      <div class="cr-reveal" hidden></div>
      <canvas class="cr-fx"></canvas>
      <label class="cr-quick"><input type="checkbox" ${this.quick ? 'checked' : ''} ${this.chain ? 'disabled' : ''}> Quick open</label>
      <button type="button" class="cr-skip"><span class="cr-hold"></span>Skip <kbd>hold Space</kbd></button>`;
    document.body.appendChild(el);
    if (this.d3) document.body.classList.add('cr-open');
    this.el = el;
    this.strip = el.querySelector('.cr-strip');   // kept for tests / old captures; hidden (the canvas draws the reel)
    this.win = el.querySelector('.cr-window');
    this.cards = [...this.strip.children];
    this.reel = new CanvasReel(reel.cards);
    this.win.appendChild(this.reel.cv);
    this.marker = el.querySelector('.cr-marker');
    this.streaks = el.querySelector('.cr-streaks');
    this.fx = el.querySelector('.cr-fx');
    this.skipBtn = el.querySelector('.cr-skip');
    this.skipBtn.addEventListener('click', () => this.skip());
    el.querySelector('.cr-quick input').addEventListener('change', (e) => { quickOpen.set(e.target.checked); e.target.blur(); });
    requestAnimationFrame(() => el.classList.add('on'));
    this.measure();
  }

  measure() {
    const em = reelMetrics().em;   // = the overlay's font-size clamp (cases.css)
    const box = this.win.getBoundingClientRect();
    // (The reel band may still be scaled by its entry transition: use the layout size.)
    const w = this.win.offsetWidth || box.width, h = this.win.offsetHeight || box.height;
    this.reel.layout(w, h, em);
    this.cw = this.reel.cw;
    this.pitch = this.reel.pitch;
    this.cx = w / 2;
    const { winAt, stop } = this.result.reel;
    this.x0 = 1.5 * this.pitch - this.cx;                  // the marker starts over card ~1
    this.x1 = winAt * this.pitch + stop * this.cw - this.cx;
    this.lastCell = this.cellAt(this.x0);
    this.lastTick = -1;
  }

  cellAt(x) { return Math.floor((x + this.cx) / this.pitch); }

  /** Is gamepad A down on any pad? */
  padA() {
    try { for (const p of navigator.getGamepads?.() || []) if (p?.buttons?.[0]?.pressed) return true; } catch { /* no pads */ }
    return false;
  }

  /** Beats of the 3D crate: rumble / phone haptics. */
  cue(name) {
    if (name === 'land') this.rumble(0.35, 0.3, 120);
    else if (name === 'latchL' || name === 'latchR') { this.rumble(0, 0.5, 45); this.vibrate(15); }
    else if (name === 'lid') { this.rumble(0.6, 0.6, 220); this.vibrate([30, 20, 40]); }
  }

  vibrate(p) { try { if (!reduced()) navigator.vibrate?.(p); } catch { /* unsupported */ } }

  frame(now) {
    if (!this.el) return;
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const t = this.time(now);
    const dt = Math.min(0.1, (now - (this.lastNow ?? now)) / 1000);
    this.lastNow = now;
    const T = this.T;
    // Hold to skip (keyboard or pad A), with a ring filling on the Skip button.
    if (this.phase !== 'reveal' && this.phase !== 'closing' && this.phase !== 'hold') {
      const a = this.padA();
      if (a && !this.padHeld && this.holdSince == null) this.holdSince = now;
      if (!a && this.padHeld) this.padHeld = false;
      if (!a && this.holdPad) { this.holdPad = false; this.holdSince = null; }
      if (a && this.holdSince != null) this.holdPad = true;
      const h = this.holdSince != null ? Math.min(1, (now - this.holdSince) / 1000 / HOLD_SKIP) : 0;
      if (Math.abs(h - (this.holdShown ?? 0)) > 0.01) { this.holdShown = h; this.skipBtn.style.setProperty('--hold', h.toFixed(3)); }
      if (h >= 1) { this.holdSince = null; this.holdPad = false; this.padHeld = a; this.skip(); }
    }
    this.cs.tickPulse *= Math.exp(-dt * 12);
    if ((this.phase === 'case' || this.phase === 'lid') && t > 0.05 && !this.warmed) this.warmed = !this.reel.warmStep(6);
    if (this.phase === 'case' && t >= T.lid) { this.el.classList.add('lid'); this.phase = 'lid'; }
    if (this.phase === 'lid' && t >= T.reelIn) { this.el.classList.add('reel'); this.phase = 'reelIn'; }
    if (this.phase === 'reelIn' && t >= T.spin) this.phase = 'spin';
    if (this.phase === 'spin' || this.phase === 'reelIn') {
      const k = Math.min(1, Math.max(0, (t - T.spin) / T.spinDur));
      const e = cubicBezier(REEL_EASE, k);
      const x = this.x0 + (this.x1 - this.x0) * e;
      const prev = this.trace.at(-1);
      const v = prev ? (x - prev.x) / Math.max(1e-3, t - prev.t) : 0;
      this.reel.draw(x);
      this.x = x;
      // Speed streaks while fast (they fade as the reel slows and the cards sharpen into view).
      const spd = Math.min(1, Math.abs(v) / 5000);
      // (Opacity on a sibling layer: a CSS variable on the window would restyle all 60 cards every frame.)
      if (Math.abs(spd - (this.spd ?? -1)) > 0.02) { this.spd = spd; this.streaks.style.opacity = reduced() ? 0 : spd.toFixed(2); }
      const cell = this.cellAt(x);
      if (cell !== this.lastCell) {
        if (t - this.lastTick >= T.tickGap && !this.frozen) {
          const s = Math.min(1, Math.abs(v) / 6000);
          if (this.d3) crateSfx.tick(s, k); else caseSfx.tick(s);
          if (k > 0.35) this.rumble(0, 0.12, 25);   // a light buzz per card once the reel is readable
          this.lastTick = t;
          this.ticks.push(+t.toFixed(3));
          this.cs.tickPulse = 1;
          this.marker.animate?.([{ filter: 'brightness(1.8)' }, { filter: 'brightness(1)' }], { duration: 90 });   // no reflow per tick
        }
        // A red or ★ card sliding under the marker in the slow part: the marker flashes its colour and
        // a soft shimmer plays (the near-miss teaser next to the winner gets the same treatment).
        const under = this.result.reel.cards[cell];
        if (under && k > 0.25 && cell !== this.result.reel.winAt && (under.rarity === 'legendary' || under.rarity === 'gold')) {
          if (!this.frozen) { if (this.d3) crateSfx.tease(rarityOf(under.rarity).rank); else caseSfx.tease(); }
          const c = rarityOf(under.rarity).color;
          this.cs.tease = { t, col: c };   // the crate's light flares in that colour too
          this.marker.animate?.([{ filter: `drop-shadow(0 0 10px ${c}) drop-shadow(0 0 22px ${c}) brightness(1.6)` }, { filter: 'none' }], { duration: 600, easing: 'ease-out' });
        }
        this.lastCell = cell;
      }
      this.cs.under = this.result.reel.cards[cell]?.rarity ?? null;
      if (k > 0.55 && !this.tense) { this.tense = true; this.el.classList.add('tense'); }
      if (k > 0.3 && k < 0.9 && !this.stopRiser && !this.frozen && !this.skipped) this.stopRiser = caseSfx.riser(T.spinDur * 0.7);
      this.trace.push({ t: +t.toFixed(4), x: +x.toFixed(2), v: +v.toFixed(1), card: cell });
      if (k >= 1 && this.phase === 'spin') { this.phase = 'hold'; this.land(); }
    }
    // The winner's pop on the canvas (until it settles).
    if (this.landT != null && t - this.landT < 0.8) this.reel.draw(this.x1, { win: this.result.reel.winAt, landK: Math.max(0.001, t - this.landT), color: rarityOf(this.result.rarity).color });
    if (this.phase === 'hold' && t >= T.spin + T.spinDur + T.hold) { this.phase = 'reveal'; this.reveal(t); }
    if (this.phase === 'reveal' && this.autoAt != null && t >= this.autoAt && !this.frozen) { this.autoAt = null; this.act('next'); }
    if (this.particles) this.drawFx(now);
  }

  /** Gamepad rumble through the lobby's input (no-op without a pad). */
  rumble(strong, weak, ms) { try { this.lobby?.input?.rumble?.(strong, weak, ms); } catch { /* no pad */ } }

  /** Capture helper: hold the show at time t (seconds since the click); null resumes. */
  seek(t) {
    if (t == null && this.frozen != null) this.t0 = performance.now() - this.frozen * 1000;   // resume from the frozen time
    this.frozen = t;
  }

  land() {
    this.landT = this.time();
    this.stopRiser?.();
    caseSfx.land();
    // Classified and up: a short swell under the hold, into the reveal.
    if (this.d3 && rarityOf(this.result.rarity).rank >= 3 && !this.frozen) crateSfx.charge(rarityOf(this.result.rarity).rank, this.T.hold);
    this.rumble(0.25, 0.4, 120);
    this.vibrate(25);
    this.cs.landed = true;
    this.streaks.style.opacity = 0;
    this.cards[this.result.reel.winAt].classList.add('win');
    this.el.classList.add('landed');
    this.skipBtn.hidden = true;
  }

  skip() {
    if (!['case', 'lid', 'reelIn', 'spin'].includes(this.phase)) return;
    this.skipped = true;
    this.stopRiser?.();
    const to = this.T.spin + this.T.spinDur;
    if (this.frozen != null) this.frozen = to; else this.t0 = performance.now() - to * 1000;
    this.el.classList.add('lid', 'reel');
    this.phase = 'spin';
  }

  /** Grade odds of one item and the details line (CS:GO's float / StatTrak line, our version). */
  details(res) {
    const odds = caseOdds(res.case.series)[res.rarity] ?? 0;
    const n = casePool(res.case.series)[res.rarity]?.length || 1;
    const each = odds / n;
    const fmt = (v) => (v >= 1 ? v.toFixed(1) : v >= 0.1 ? v.toFixed(2) : v.toFixed(3));
    const fin = res.variant.colors?.finish || res.variant.colors?.pat || (res.item.model?.kind === 'equipment' ? res.item.model.ref : '');
    const serial = String(profileStore.rewards?.opened ?? 0).padStart(4, '0');
    return `<p class="cr-meta"><span>${esc(res.item.brand || this.series.name.replace(/ Case$/, ''))}</span>${fin ? `<span>${esc(String(fin).replace(/-/g, ' '))}</span>` : ''}<span>Pull #${serial}</span><span>${fmt(each)} % chance</span></p>`;
  }

  statsHtml(item) {
    if (!item.stats || !Object.keys(item.stats).length) return '';
    return `<div class="cr-stats">${Object.entries(item.stats).map(([k, v]) => `<span>${esc(STATS[k]?.label || k)}</span><i style="--v:${(v / 10).toFixed(2)}"></i>`).join('')}</div>`;
  }

  reveal(t) {
    const res = this.result;
    res.announce?.();
    this.cs.revealAt = t;
    const r = rarityOf(res.rarity);
    const slot = SLOTS[res.item.slot]?.label || '';
    const pct = Math.round((res.dupeXp / CASE_XP) * 100);
    const rv = this.el.querySelector('.cr-reveal');
    const col = profileStore.collection();
    const more = profileStore.unopened.length;
    const eqd = profileStore.equipped(res.item.slot);
    const worn = eqd?.item.id === res.item.id && eqd?.variant.id === res.variant.id;
    this.el.style.setProperty('--rc', r.color);
    this.el.classList.add('revealed', `rv-${r.id}`);
    rv.hidden = false;
    const chainDone = this.chain && !more && this.chain.pulls.length > 1;
    // Classified and up get a big stamp across the screen first (gold after its blackout).
    if (r.rank >= 3) {
      const st = document.createElement('div');
      st.className = 'cr-stamp';
      st.textContent = r.id === 'gold' ? '★ Exceedingly rare ★' : r.name;
      this.el.appendChild(st);
    }
    rv.innerHTML = `
      ${this.d3 ? '' : `<div class="cr-rays"></div>
      <div class="cr-rcard">${cardHtml(res.key, res.rarity, { big: true, label: false })}</div>`}
      <div class="cr-rtext">
        <span class="cr-grade">${res.rarity === 'gold' ? '★ ' : ''}${esc(r.name)} · ${esc(slot)}</span>
        <h2>${esc(res.item.name)} <em>|</em> ${esc(res.variant.name)}</h2>
        ${this.details(res)}
        ${this.statsHtml(res.item)}
        ${res.dupe
          ? `<p class="cr-dupe">Duplicate · converted to <b>+${res.dupeXp} case XP</b> (${pct} % of a case)${res.cases.length ? ' · <b>a new case!</b>' : ''}</p>`
          : '<p class="cr-new">NEW · added to your locker</p>'}
        <p class="cr-col">Collection ${col.owned} / ${col.total} · ${Math.round(col.pct * 100)} %</p>
        ${res.completed ? `<p class="cr-new">${esc(SERIES[res.completed].name.replace(/ Case$/, ''))} collection complete! +${res.cases.length} cases</p>` : ''}
        ${chainDone ? `<div class="cr-summary"><small>This session · ${this.chain.pulls.length} cases</small><div>${this.chain.pulls.slice().sort((a, b) => rarityOf(b.rarity).rank - rarityOf(a.rarity).rank).map((p) => cardHtml(p.key, p.rarity, { label: false })).join('')}</div></div>` : ''}
        <div class="cr-actions">
          ${worn ? '' : `<button type="button" class="cr-btn${res.dupe ? '' : ' primary'}" data-act="equip">Equip now</button>`}
          ${more ? `<button type="button" class="cr-btn${res.dupe || worn ? ' primary' : ''}" data-act="next">Open another <small>${more} left</small></button>` : ''}
          <button type="button" class="cr-btn ghost" data-act="close">Close</button>
        </div>
        ${this.chain && more && r.rank < 3 ? '<p class="cr-auto">Opening the next one… <kbd>Esc</kbd> stops</p>' : ''}
      </div>`;
    rv.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    rv.querySelector('.cr-btn')?.focus({ preventScroll: true });
    this.skipBtn.hidden = true;
    this.el.querySelector('.cr-quick').hidden = true;
    // "Open all": keep going on everything below Classified; stop and celebrate the big ones.
    if (this.chain && more && r.rank < 3) this.autoAt = t + 1.7;
    this.rumble(Math.min(1, 0.15 * r.rank + 0.1), Math.min(1, 0.2 * r.rank + 0.3), 180 + r.rank * 90);
    this.vibrate(r.rank >= 4 ? [60, 40, 120, 40, 200] : r.rank >= 3 ? [50, 30, 90] : 30);
    if (this.d3) return;   // crate3d.js plays the fanfare and draws the reveal in 3D
    caseSfx.reveal(res.rarity);
    if (r.rank >= 3 && !reduced()) this.el.classList.add('shake');
    this.burst(r);
  }

  act(a) {
    caseSfx.click();
    const res = this.result;
    if (a === 'equip') {
      const eq = res.item.equipment;   // skis / snowboard gear: ride it, too
      if (eq && profileStore.equipment !== eq) profileStore.setEquipment(eq);
      this.equipped = profileStore.equip(res.item.id, res.variant.id);
      profileStore.markSeen(res.key);
      this.close();
    } else if (a === 'next') {
      const oc = this.userClose, chain = this.chain, quick = this.quick;
      this.close(() => openCaseShow(null, { onClose: oc, chain, quick: chain ? true : quick }).then((r) => {
        if (r) return;
        crateShow.end();   // no case after all: leave the studio
        document.body.classList.remove('cr-open');
      }));
    } else this.close();
  }

  key(e) {
    if (!this.el) return;
    // No key reaches the lobby (Q/E tabs, A/D spin, Enter = ride) while the overlay is up.
    e.stopPropagation();
    const btns = [...this.el.querySelectorAll('.cr-btn')];
    const onBtn = btns.includes(document.activeElement);
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.autoAt != null) { this.autoAt = null; this.el.querySelector('.cr-auto')?.remove(); return; }
      if (this.phase === 'reveal') this.close(); else this.skip();
      return;
    }
    if (this.phase !== 'reveal') {
      // Hold Space / Enter to skip (a tap does nothing, so mashing Enter on Open never skips the show).
      if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat && this.holdSince == null) this.holdSince = performance.now(); }
      return;
    }
    // Reveal: Tab and arrows cycle the buttons; Enter / Space press the focused one (or the first).
    if (e.code === 'Tab' || e.code.startsWith('Arrow')) {
      e.preventDefault();
      const back = e.shiftKey || e.code === 'ArrowLeft' || e.code === 'ArrowUp';
      const i = btns.indexOf(document.activeElement);
      btns[(i + (back ? -1 : 1) + btns.length) % btns.length]?.focus();
    } else if ((e.code === 'Enter' || e.code === 'Space') && !onBtn) { e.preventDefault(); btns[0]?.click(); }
  }

  /** Gamepad (via Lobby.onAction): hold A skips (polled in frame), B skips at once; in the reveal the d-pad moves, A presses, B closes. */
  onAction(a) {
    if (!this.el || this.phase === 'closing') return true;
    if (this.phase !== 'reveal') { if (a === 'back' || a === 'alt2') this.skip(); return true; }
    const btns = [...this.el.querySelectorAll('.cr-btn')];
    const i = btns.indexOf(document.activeElement);
    if (a === 'left' || a === 'up') btns[Math.max(0, i - 1)]?.focus();
    else if (a === 'right' || a === 'down') btns[Math.min(btns.length - 1, i + 1)]?.focus();
    else if (a === 'accept') (btns[i] || btns[0])?.click();
    else if (a === 'back') { if (this.autoAt != null) this.autoAt = null; else this.close(); }
    return true;
  }

  close(then) {
    if (this.phase === 'closing') return;
    this.phase = 'closing';
    this.result.announce?.();
    removeEventListener('resize', this.onResize);
    if (this.lobby?.overlay === this) this.lobby.overlay = null;
    removeEventListener('keydown', this.onKey, true);
    removeEventListener('keyup', this.onKeyUp, true);
    this.stopRiser?.();
    // Chaining straight into the next case keeps the studio up (the next crate drops in from there).
    if (this.d3 && !then) crateShow.end({ equipped: this.equipped });
    if (!then) document.body.classList.remove('cr-open');
    this.el.classList.add('out');
    const el = this.el;
    setTimeout(() => {
      cancelAnimationFrame(this.raf);
      el.remove();
      this.el = null;
      this.done();
      then?.();
    }, then ? 120 : 260);
  }

  // ------------------------------------------------------------ particles (2D fallback)
  burst(r) {
    const cv = this.fx;
    const dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
    this.fxCtx = cv.getContext('2d');
    this.fxCtx.scale(dpr, dpr);
    const card = this.el.querySelector('.cr-rcard').getBoundingClientRect();
    const cx = card.left + card.width / 2, cy = card.top + card.height / 2;
    const n = [40, 60, 90, 140, 200, 320][r.rank] ?? 60;
    const colors = r.id === 'gold' ? ['#fff6c8', '#ffd24a', '#e4ae39', '#ffffff'] : [r.color, '#ffffff', r.color];
    this.particles = Array.from({ length: n }, (_, i) => {
      const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * (260 + r.rank * 90);
      return { x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.9 + Math.random() * (0.8 + r.rank * 0.25), age: 0,
        size: 1.5 + Math.random() * (2 + r.rank * 0.6), col: colors[i % colors.length], star: r.rank >= 4 && i % 3 === 0 };
    });
    this.fxLast = performance.now();
  }

  drawFx(now) {
    const g = this.fxCtx;
    const dt = Math.min(0.05, (now - this.fxLast) / 1000);
    this.fxLast = now;
    g.clearRect(0, 0, innerWidth, innerHeight);
    let alive = 0;
    for (const p of this.particles) {
      p.age += dt;
      if (p.age > p.life) continue;
      alive++;
      p.vx *= 1 - dt * 1.4; p.vy = p.vy * (1 - dt * 1.4) + 260 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.age / p.life;
      g.globalAlpha = a;
      g.fillStyle = p.col;
      if (p.star) {
        g.save(); g.translate(p.x, p.y); g.rotate(p.age * 6);
        g.beginPath();
        for (let i = 0; i < 10; i++) { const rr = i % 2 ? p.size : p.size * 2.4; g.lineTo(Math.cos(i * Math.PI / 5) * rr, Math.sin(i * Math.PI / 5) * rr); }
        g.fill(); g.restore();
      } else { g.beginPath(); g.arc(p.x, p.y, p.size * a + 0.5, 0, Math.PI * 2); g.fill(); }
    }
    g.globalAlpha = 1;
    if (!alive) this.particles = null;
  }
}
