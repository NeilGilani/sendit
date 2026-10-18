// The reel drawn on one canvas: every card is rasterised once (an SVG card → a bitmap, during the
// crate's first second) and each frame only blits the ~10 visible cards. The old DOM strip (60 SVG
// cards on a 10 000 px layer) made the compositor raster new tiles while it scrolled, which showed as
// 0.2–0.5 s stalls on integrated GPUs. Same look as the .cr-card CSS (cases.css).
import { rarityOf } from '../../profile/rarity.js';
import { skin, casePool } from '../../profile/rewards.js';
import { RARITIES } from '../../profile/rarity.js';
import { itemArt, goldArt } from './art.js';

// Card geometry in em (matches cases.css: .cr-strip .cr-card 9.2em wide, gap .45em, strip inset 1.1em).
export const CARD = { w: 9.2, gap: 0.45, inset: 1.1 };
const U = 10;   // SVG units per em
const escX = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function mix(hex, k, to = 255) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k + to * (1 - k)));
  return `rgb(${c.join(',')})`;
}

/** One card as a standalone SVG string, `h` em tall. */
function cardSvg(key, rarity, h) {
  const r = rarityOf(rarity);
  const s = key ? skin(key) : null;
  const gold = rarity === 'gold' || !s;
  const W = CARD.w * U, H = h * U;
  const art = (gold ? goldArt() : itemArt(s.item, s.variant)).replace('<svg ', `<svg x="5" y="4" width="${W - 10}" height="${Math.min(70, H - 34)}" preserveAspectRatio="xMidYMid meet" `);
  const name = gold ? '★ Rare Special Item' : s.item.name;
  const sub = gold ? 'Exceedingly Rare' : s.variant.name;
  const bg = gold
    ? `<radialGradient id="g" cx=".5" cy=".45" r=".65"><stop offset="0" stop-color="rgb(255,220,110)" stop-opacity=".55"/><stop offset="1" stop-color="rgb(255,220,110)" stop-opacity="0"/></radialGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a4314"/><stop offset="1" stop-color="#2a1f08"/></linearGradient>`
    : `<radialGradient id="g" cx=".5" cy=".85" r=".7"><stop offset="0" stop-color="${r.color}" stop-opacity=".4"/><stop offset="1" stop-color="${r.color}" stop-opacity="0"/></radialGradient><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b2f3d"/><stop offset="1" stop-color="#1a1c26"/></linearGradient>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
    <defs>${bg}<clipPath id="c"><rect width="${W}" height="${H}" rx="3.5"/></clipPath></defs>
    <g clip-path="url(#c)">
      <rect width="${W}" height="${H}" fill="url(#b)"/><rect width="${W}" height="${H}" fill="url(#g)"/>
      ${art}
      <text x="5" y="${H - 15.5}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="6.4" fill="rgba(255,255,255,.6)">${escX(clip(name, 24))}</text>
      <text x="5" y="${H - 6.5}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="7.8" font-weight="800" fill="${gold ? '#ffd76a' : mix(r.color, 0.45)}">${escX(clip(sub, 19))}</text>
      <rect y="${H - 3.2}" width="${W}" height="3.2" fill="${gold ? '#e4ae39' : r.color}"/>
      <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="3.2" fill="none" stroke="${gold ? 'rgba(255,215,0,.5)' : 'rgba(255,255,255,.08)'}"/>
    </g></svg>`;
}

// ------------------------------------------------------------------ the bitmap cache
// Card bitmaps by size + card, shared by every opening. The Cases tab fills it in idle time
// (prerasterReel), so an opening only blits; anything missing is rasterised a few per frame.
const cache = new Map();
const queue = [];
let pumping = false;
const cardId = (rarity, key) => `${rarity}|${key ?? ''}`;

/** The reel's card size for the current window (cases.css: font-size clamp, 13em band, 1.1em inset). */
export function reelMetrics() {
  const em = Math.min(22, Math.max(13, innerWidth * 0.005 + 8));
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(CARD.w * em * dpr), h = Math.round((13 - 2 * CARD.inset) * em * dpr);
  return { em, dpr, w, h, size: `${w}x${h}` };
}

function rasterOne(job) {
  const k = `${job.size}|${job.id}`;
  if (cache.has(k)) return Promise.resolve();
  const [rarity, key] = job.id.split('|');
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(cardSvg(key || null, rarity, job.hEm))}`;
  return img.decode().then(() => {
    const c = document.createElement('canvas');
    c.width = job.w; c.height = job.h;
    c.getContext('2d').drawImage(img, 0, 0, job.w, job.h);
    cache.set(k, c);
    // An ImageBitmap blits faster than a small (software) canvas once it is on the GPU.
    return globalThis.createImageBitmap?.(c).then((b) => cache.set(k, b), () => {});
  }, () => cache.set(k, null));
}

/** Work through the queue: in idle time (prewarm) or ~4 ms per frame (an opening needs them now). */
function pump(urgent) {
  if (pumping && !urgent) return;
  pumping = true;
  const step = (deadline) => {
    const t0 = performance.now();
    const budget = urgent ? 4 : Math.max(2, Math.min(8, deadline?.timeRemaining?.() ?? 4));
    const batch = [];
    while (queue.length && performance.now() - t0 < budget && batch.length < (urgent ? 3 : 2)) batch.push(rasterOne(queue.shift()));
    Promise.all(batch).then(() => {
      if (!queue.length) { pumping = false; return; }
      if (urgent) requestAnimationFrame(() => step());
      else (globalThis.requestIdleCallback || ((f) => setTimeout(f, 30)))(step, { timeout: 500 });
    });
  };
  if (urgent) requestAnimationFrame(() => step()); else (globalThis.requestIdleCallback || ((f) => setTimeout(f, 30)))(step, { timeout: 500 });
}

function enqueue(ids, m, front = false) {
  const hEm = m.h / m.dpr / m.em;
  const jobs = ids.filter((id) => !cache.has(`${m.size}|${id}`) && !queue.some((q) => q.id === id && q.size === m.size)).map((id) => ({ id, size: m.size, w: m.w, h: m.h, hEm }));
  if (front) queue.unshift(...jobs); else queue.push(...jobs);
}

/** Cards still waiting to be rasterised (captures wait for 0). */
export const reelPending = () => queue.length + (pumping ? 1 : 0);
if (typeof window !== 'undefined') window.__senditReelPending = reelPending;

/** Pre-rasterise every card of these case series (and the gold card) in idle time. */
export function prerasterReel(seriesList) {
  const m = reelMetrics();
  const ids = [cardId('gold', null)];
  for (const s of seriesList) { const pool = casePool(s); for (const r of RARITIES) if (r.id !== 'gold') for (const e of pool[r.id]) ids.push(cardId(r.id, e.key)); }
  enqueue([...new Set(ids)], m);
  pump(false);
}

export class CanvasReel {
  /** cards: [{ key, rarity }] in reel order. */
  constructor(cards) {
    this.cards = cards;
    this.cv = document.createElement('canvas');
    this.cv.className = 'cr-reelcv';
    this.g = this.cv.getContext('2d');
    this.ready = false;
  }

  /** Size to the reel window (CSS px) and the overlay's em; rasterises the cards (async). */
  layout(wCss, hCss, em) {
    const dpr = Math.min(2, devicePixelRatio || 1);
    this.dpr = dpr; this.em = em;
    this.cv.width = Math.round(wCss * dpr); this.cv.height = Math.round(hCss * dpr);
    this.cv.style.width = `${wCss}px`; this.cv.style.height = `${hCss}px`;
    this.cw = CARD.w * em; this.pitch = (CARD.w + CARD.gap) * em;
    const w = Math.round(this.cw * dpr), h = Math.round((13 - 2 * CARD.inset) * em * dpr);   // = reelMetrics()
    this.ch = h / dpr;
    this.top = (hCss - this.ch) / 2;
    this.size = `${w}x${h}`;
    // Missing cards go to the front of the queue (the winner and the cards near the start first).
    const order = this.cards.map((c, i) => [cardId(c.rarity, c.key), i]).sort((a, b) => Math.abs(a[1] - 50) - Math.abs(b[1] - 50)).map(([id]) => id);
    enqueue([...new Set(order)], { em, dpr, w, h, size: this.size }, true);
    if (queue.length) pump(true);
  }

  /**
   * Before the reel shows: draw the next few distinct cards once (tiny, then cleared) so their
   * bitmaps are uploaded to the GPU during the crate's first second, not on the reel's first frames.
   * Returns true while there is more to warm.
   */
  warmStep(n = 6) {
    this.warmIds ||= [...new Set(this.cards.map((c) => cardId(c.rarity, c.key)))];
    this.warmAt ||= 0;
    const g = this.g;
    let done = 0;
    while (this.warmAt < this.warmIds.length && done < n) {
      const bm = cache.get(`${this.size}|${this.warmIds[this.warmAt]}`);
      if (!bm) break;   // not rasterised yet: try again next frame
      g.drawImage(bm, 0, 0, 2, 2);
      this.warmAt++; done++;
    }
    g.clearRect(0, 0, 4, 4);
    return this.warmAt < this.warmIds.length;
  }

  /**
   * Draw the strip scrolled by x CSS px (the marker sits at the canvas centre). o = { win, landK }:
   * after the landing the winner pops and glows, the rest dim.
   */
  draw(x, { win = -1, landK = 0, color = '#fff' } = {}) {
    const g = this.g, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.cv.width / d, this.cv.height / d);
    const W = this.cv.width / d;
    const first = Math.max(0, Math.floor(x / this.pitch) - 1);
    const last = Math.min(this.cards.length - 1, Math.ceil((x + W) / this.pitch) + 1);
    const dim = Math.min(1, landK * 1.6);
    for (let i = first; i <= last; i++) {
      if (i === win && landK > 0) continue;
      this.card(i, i * this.pitch - x, 1, dim * 0.58);
    }
    if (win >= first && win <= last && landK > 0) {
      // The winner: a quick pop to 109 % settling at 105 %, a ring and a glow in its grade colour.
      const k = Math.min(1, landK / 0.6);
      const s = k < 0.4 ? 1 + 0.09 * (k / 0.4) : 1.09 - 0.04 * ((k - 0.4) / 0.6);
      const cx = win * this.pitch - x + this.cw / 2;
      g.save();
      g.shadowColor = color; g.shadowBlur = 26 * k;
      this.card(win, cx - (this.cw * s) / 2, s, 0);
      g.restore();
      g.strokeStyle = color; g.lineWidth = 2; g.globalAlpha = k;
      const cy = this.top + this.ch / 2;
      g.beginPath(); g.roundRect?.(cx - (this.cw * s) / 2, cy - (this.ch * s) / 2, this.cw * s, this.ch * s, 4); g.stroke();
      g.globalAlpha = 1;
    }
  }

  card(i, left, s, dim) {
    const g = this.g;
    const c = this.cards[i];
    const bm = cache.get(`${this.size}|${cardId(c.rarity, c.key)}`);
    const w = this.cw * s, h = this.ch * s;
    const top = this.top + (this.ch - h) / 2;
    if (bm) g.drawImage(bm, left, top, w, h);
    else {
      // Not rasterised yet (very first frames on a slow machine): a plain card in its grade colour.
      g.fillStyle = '#22252f'; g.fillRect(left, top, w, h);
      g.fillStyle = rarityOf(c.rarity).color; g.fillRect(left, top + h - 0.32 * this.em, w, 0.32 * this.em);
    }
    if (dim > 0) { g.fillStyle = `rgba(4,5,12,${dim.toFixed(3)})`; g.fillRect(left, top, w, h); }
  }
}
