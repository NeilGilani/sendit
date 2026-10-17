// The case opening, CS:GO style (docs/rewards.md "The opening, frame by frame"):
//   0.00 s  the overlay dims the lobby, the case box drops in and rattles (two latch clunks)
//   1.00 s  the lid flips open, light pours out, the case lifts away
//   1.90 s  the reel slides in: a strip of item cards under a gold centre marker
//   2.00 s  the reel spins for 6.0 s on CS2's own curve, cubic-bezier(0.075, 0.82, 0.165, 1):
//           ~75 % of the distance in the first second, then a long crawl; a tick per card that
//           crosses the marker (≥ 55 ms apart), the ticks slowing with the reel
//   8.00 s  it stops on the winner (often a hair away from a rarer card: the near miss); 0.6 s hold
//   8.60 s  the reveal: rarity-coloured flash, rays, particles, stinger, then Equip now / Open next
// Skip (Space / the button) jumps to the reveal. The overlay lives on document.body above the lobby.
import { profileStore } from '../../profile/store.js';
import { rarityOf } from '../../profile/rarity.js';
import { skin } from '../../profile/rewards.js';
import { SERIES } from '../../profile/items.js';
import { SLOTS } from '../../profile/catalog.js';
import { CASE_XP, seeded } from '../../profile/rewards.js';
import { itemArt, goldArt } from './art.js';
import { caseArt } from './caseArt.js';
import { caseSfx } from './sfx.js';
import './cases.css';

import { TIMING, REEL_EASE, cubicBezier } from './timing.js';

export { TIMING, REEL_EASE, cubicBezier };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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

let active = null;
// Test / capture hook (scripts/casesshot.mjs): open with a seeded RNG for a reproducible reel.
if (typeof window !== 'undefined') window.__senditCasesApi = { open: (id, seed) => openCaseShow(id, { rng: seed != null ? seeded(seed) : undefined }), seeded };

/** Is the opener on screen? */
export const openerActive = () => !!active;

/**
 * Open a case with the full show. `caseId` = an unopened case (first one if omitted).
 * Returns a promise for the result once the overlay closes: { result, equipped }.
 */
export function openCaseShow(caseId, { onClose, rng } = {}) {
  if (active) return active.promise;
  const c = caseId ? profileStore.unopened.find((x) => x.id === caseId) : profileStore.unopened[0];
  if (!c) return Promise.resolve(null);
  caseSfx.unlock();
  const result = profileStore.openCase(c.id, rng);
  if (!result) return Promise.resolve(null);
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  active = { promise };
  const ov = new Opener(result, () => { active = null; onClose?.(); resolve({ result, equipped: ov.equipped }); });
  ov.userClose = onClose;
  active.opener = ov;
  globalThis.__senditCases = { opener: ov, result };
  return promise;
}

class Opener {
  constructor(result, done) {
    this.result = result;
    this.done = done;
    this.equipped = false;
    this.trace = [];          // per-frame { t, x, v, card } for frame-by-frame checks (scripts/casesshot.mjs)
    this.ticks = [];
    this.series = SERIES[result.case.series];
    this.build();
    this.t0 = performance.now();
    this.phase = 'case';
    this.raf = requestAnimationFrame((n) => this.frame(n));
    this.onKey = (e) => this.key(e);
    addEventListener('keydown', this.onKey, true);
    this.lobby = globalThis.__sendit?.lobby;
    if (this.lobby) this.lobby.overlay = this;
    caseSfx.open();
  }

  build() {
    const { reel } = this.result;
    const el = document.createElement('div');
    el.className = 'cr-overlay';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', `Opening ${this.series.name}`);
    el.style.setProperty('--sc', this.series.color);
    el.style.setProperty('--sa', this.series.accent);
    el.innerHTML = `
      <div class="cr-dim"></div>
      <div class="cr-head"><small>Unlocking</small><b>${esc(this.series.name)}</b></div>
      <div class="cr-case">${caseArt(this.result.case.series)}<div class="cr-light"></div></div>
      <div class="cr-reel" aria-hidden="true">
        <div class="cr-window"><div class="cr-strip">${reel.cards.map((c) => cardHtml(c.key, c.rarity)).join('')}</div></div>
        <div class="cr-marker"><i></i></div>
      </div>
      <div class="cr-reveal" hidden></div>
      <canvas class="cr-fx"></canvas>
      <button type="button" class="cr-skip">Skip <kbd>Space</kbd></button>`;
    document.body.appendChild(el);
    this.el = el;
    this.strip = el.querySelector('.cr-strip');
    this.win = el.querySelector('.cr-window');
    this.cards = [...this.strip.children];
    this.fx = el.querySelector('.cr-fx');
    el.querySelector('.cr-skip').addEventListener('click', () => this.skip());
    requestAnimationFrame(() => el.classList.add('on'));
    this.measure();
  }

  measure() {
    const card = this.cards[0].getBoundingClientRect();
    const second = this.cards[1].getBoundingClientRect();
    this.cw = card.width;
    this.pitch = second.left - card.left || card.width + 8;
    this.cx = this.win.getBoundingClientRect().width / 2;
    const { winAt, stop } = this.result.reel;
    this.x0 = 1.5 * this.pitch - this.cx;                  // the marker starts over card ~1
    this.x1 = winAt * this.pitch + stop * this.cw - this.cx;
    this.lastCell = this.cellAt(this.x0);
    this.lastTick = -1;
  }

  cellAt(x) { return Math.floor((x + this.cx) / this.pitch); }

  frame(now) {
    if (!this.el) return;
    this.raf = requestAnimationFrame((n) => this.frame(n));
    const t = this.frozen ?? (now - this.t0) / 1000;
    const T = TIMING;
    if (this.phase === 'case' && t >= T.lid) { this.el.classList.add('lid'); this.phase = 'lid'; }
    if (this.phase === 'lid' && t >= T.reelIn) { this.el.classList.add('reel'); this.phase = 'reelIn'; }
    if (this.phase === 'reelIn' && t >= T.spin) this.phase = 'spin';
    if (this.phase === 'spin' || this.phase === 'reelIn') {
      const k = Math.min(1, Math.max(0, (t - T.spin) / T.spinDur));
      const e = cubicBezier(REEL_EASE, k);
      const x = this.x0 + (this.x1 - this.x0) * e;
      const prev = this.trace.at(-1);
      const v = prev ? (x - prev.x) / Math.max(1e-3, t - prev.t) : 0;
      this.strip.style.transform = `translate3d(${-x.toFixed(2)}px,0,0)`;
      // Speed streaks while fast (they fade as the reel slows and the cards sharpen into view).
      const spd = Math.min(1, Math.abs(v) / 5000);
      if (Math.abs(spd - (this.spd ?? -1)) > 0.02) { this.spd = spd; this.win.style.setProperty('--spd', reduced() ? 0 : spd.toFixed(2)); }
      const cell = this.cellAt(x);
      if (cell !== this.lastCell) {
        if (t - this.lastTick >= T.tickGap) {
          caseSfx.tick(Math.min(1, Math.abs(v) / 6000));
          this.lastTick = t;
          this.ticks.push(+t.toFixed(3));
          this.el.querySelector('.cr-marker').classList.remove('tk'); void this.el.offsetWidth; this.el.querySelector('.cr-marker').classList.add('tk');
        }
        // The near miss: the rare card crawling past (or toward) the marker.
        const nm = this.result.reel.nearMiss;
        if (nm && k > 0.6 && Math.abs(cell - (this.result.reel.winAt + nm.side)) <= 0) caseSfx.tease();
        this.lastCell = cell;
      }
      if (k > 0.55 && !this.tense) { this.tense = true; this.el.classList.add('tense'); }
      if (k > 0.3 && !this.stopRiser && !this.frozen) this.stopRiser = caseSfx.riser(T.spinDur * 0.7);
      this.trace.push({ t: +t.toFixed(4), x: +x.toFixed(2), v: +v.toFixed(1), card: cell });
      if (k >= 1 && this.phase === 'spin') { this.phase = 'hold'; this.holdAt = t; this.land(); }
    }
    if (this.phase === 'hold' && t - this.holdAt >= T.hold) { this.phase = 'reveal'; this.reveal(); }
    if (this.particles) this.drawFx(now);
  }

  /** Capture helper: hold the show at time t (seconds since the click); null resumes. */
  seek(t) { this.frozen = t; }

  land() {
    this.stopRiser?.();
    caseSfx.land();
    this.win.style.setProperty('--spd', 0);
    this.cards[this.result.reel.winAt].classList.add('win');
    this.el.classList.add('landed');
    this.el.querySelector('.cr-skip').hidden = true;
  }

  skip() {
    if (this.phase === 'reveal' || this.phase === 'closing') return;
    this.t0 = performance.now() - (TIMING.spin + TIMING.spinDur) * 1000;
    this.el.classList.add('lid', 'reel');
    this.phase = 'spin';
  }

  reveal() {
    const res = this.result;
    const r = rarityOf(res.rarity);
    const slot = SLOTS[res.item.slot]?.label || '';
    const pct = Math.round((res.dupeXp / CASE_XP) * 100);
    const rv = this.el.querySelector('.cr-reveal');
    const col = profileStore.collection();
    const more = profileStore.unopened.length;
    this.el.style.setProperty('--rc', r.color);
    this.el.classList.add('revealed', `rv-${r.id}`);
    rv.hidden = false;
    rv.innerHTML = `
      <div class="cr-rays"></div>
      <div class="cr-rcard">${cardHtml(res.key, res.rarity, { big: true, label: false })}</div>
      <div class="cr-rtext">
        <span class="cr-grade">${esc(r.name)}${res.rarity === 'gold' ? ' ★' : ''} · ${esc(slot)}</span>
        <h2>${esc(res.item.name)} <em>|</em> ${esc(res.variant.name)}</h2>
        ${res.dupe
          ? `<p class="cr-dupe">Duplicate · converted to <b>+${res.dupeXp} case XP</b> (${pct} % of a case)${res.cases.length ? ' · <b>a new case!</b>' : ''}</p>`
          : '<p class="cr-new">NEW · added to your locker</p>'}
        <p class="cr-col">Collection ${col.owned} / ${col.total} · ${Math.round(col.pct * 100)} %</p>
        <div class="cr-actions">
          ${res.dupe ? '' : '<button type="button" class="cr-btn primary" data-act="equip">Equip now</button>'}
          ${more ? `<button type="button" class="cr-btn${res.dupe ? ' primary' : ''}" data-act="next">Open next <small>${more} left</small></button>` : ''}
          <button type="button" class="cr-btn ghost" data-act="close">Close</button>
        </div>
      </div>`;
    rv.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    rv.querySelector('.cr-btn')?.focus({ preventScroll: true });
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
      const oc = this.userClose;
      this.close(() => openCaseShow(null, { onClose: oc }));
    } else this.close();
  }

  key(e) {
    if (!this.el) return;
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (this.phase === 'reveal') this.close(); else this.skip(); return; }
    if (e.code === 'Space' && this.phase !== 'reveal') { e.preventDefault(); e.stopPropagation(); this.skip(); return; }
    // Keep the lobby's own keys (Q/E tabs, Enter = ride) from firing under the overlay.
    if (['KeyQ', 'KeyE', 'KeyA', 'KeyD', 'KeyR'].includes(e.code)) { e.stopPropagation(); e.preventDefault(); }
    if (e.code === 'Enter' && this.phase !== 'reveal') { e.stopPropagation(); e.preventDefault(); }
  }

  /** Gamepad (via Lobby.onAction): A skips / presses, d-pad moves between buttons, B closes. Eats the rest. */
  onAction(a) {
    if (!this.el || this.phase === 'closing') return true;
    if (this.phase !== 'reveal') { if (a === 'accept' || a === 'back' || a === 'alt2') this.skip(); return true; }
    const btns = [...this.el.querySelectorAll('.cr-btn')];
    const i = btns.indexOf(document.activeElement);
    if (a === 'left' || a === 'up') btns[Math.max(0, i - 1)]?.focus();
    else if (a === 'right' || a === 'down') btns[Math.min(btns.length - 1, i + 1)]?.focus();
    else if (a === 'accept') (btns[i] || btns[0])?.click();
    else if (a === 'back') this.close();
    return true;
  }

  close(then) {
    if (this.phase === 'closing') return;
    this.phase = 'closing';
    if (this.lobby?.overlay === this) this.lobby.overlay = null;
    removeEventListener('keydown', this.onKey, true);
    this.stopRiser?.();
    this.el.classList.add('out');
    const el = this.el;
    setTimeout(() => {
      cancelAnimationFrame(this.raf);
      el.remove();
      this.el = null;
      this.done();
      then?.();
    }, 260);
  }

  // ------------------------------------------------------------ particles
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
