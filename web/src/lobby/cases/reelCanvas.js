// The reel drawn on one canvas. Each card is two layers:
//  · its PLATE (grade field, pattern, name strip, bold grade bar), painted once into a bitmap with
//    canvas 2D (the lobby's own fonts) in idle time from the Cases tab, and
//  · its PICTURE, drawn per frame on top: while the reel is fast, a flat SILHOUETTE of the item in a
//    light tint of its grade (motion-blurred), so at speed you read colour blocks flashing past the
//    marker; as the reel slows the picture cross-fades to the detailed tile icon (itemIcons.js), which
//    is what you read in the crawl and at the stop.
// Each frame blits the ~10 visible cards (plate + picture). The old DOM strip (60 SVG cards on a
// 10 000 px layer) made the compositor raster new tiles while it scrolled (0.2–0.5 s stalls).
// Same look as the .cr-card tiles (icons.css).
import { rarityOf } from '../../profile/rarity.js';
import { skin, casePool } from '../../profile/rewards.js';
import { RARITIES } from '../../profile/rarity.js';
import { itemArt, goldArt } from './art.js';
import { iconUrl, iconImage, requestIcons, whenIcons, onIcon, GOLD_ICON } from './itemIcons.js';

// Card geometry in em (matches cases.css: .cr-strip .cr-card 9.2em wide, gap .45em, strip inset 1.1em).
export const CARD = { w: 9.2, gap: 0.45, inset: 1.1 };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const reduced = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function rgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
const mixHex = (hex, k, to = 255) => `rgb(${rgb(hex).map((v) => Math.round(v * k + to * (1 - k))).join(',')})`;
// Grade colour strength (icons.css --rw / --rg).
const WASH = { common: [0.3, 0.26], uncommon: [0.56, 0.5], rare: [0.58, 0.52], epic: [0.56, 0.52], legendary: [0.6, 0.56], gold: [0.7, 0.62] };

/** The picture's box inside a w × h card (px): ~2/3 of the width, a little above the middle. */
function artBox(w, h, em) {
  const nameH = 2.3 * em;
  const x = w * 0.17, y = h * 0.07, bw = w - 2 * x, bh = h - y - nameH - 0.2 * em;
  const side = Math.min(bw, bh);
  return { x: x + (bw - side) / 2, y: y + (bh - side) / 2, s: side };
}

/** Paint a card's plate (no picture) at w × h device px; em in device px. */
function paintPlate(g, key, rarity, w, h, em) {
  const r = rarityOf(rarity);
  const s = key ? skin(key) : null;
  const gold = rarity === 'gold' || !s;
  const col = gold ? '#e4ae39' : r.color;
  const [wa, ga] = WASH[gold ? 'gold' : r.id] || WASH.common;
  const R = Math.max(2, 0.12 * em);
  g.save();
  g.beginPath(); g.roundRect ? g.roundRect(0, 0, w, h, R) : g.rect(0, 0, w, h); g.clip();
  // Base plate.
  let gr = g.createLinearGradient(0, 0, 0, h);
  if (gold) { gr.addColorStop(0, '#4a3712'); gr.addColorStop(1, '#1d1505'); } else { gr.addColorStop(0, '#172430'); gr.addColorStop(1, '#0b131b'); }
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // Fine diagonal pattern.
  g.strokeStyle = gold ? 'rgba(255,240,190,.06)' : 'rgba(255,255,255,.035)';
  g.lineWidth = Math.max(1, em * 0.05);
  const step = Math.max(5, em * 0.42);
  g.beginPath();
  for (let d = -h; d < w; d += step) { g.moveTo(d, h); g.lineTo(d + h, 0); }
  g.stroke();
  // Grade wash rising from the bottom.
  gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, rgba(col, wa)); gr.addColorStop(0.48, rgba(col, 0.12)); gr.addColorStop(0.74, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  // Glow behind the picture.
  const box = artBox(w, h, em);
  const cx = w / 2, cy = h * 0.42;
  g.save();
  g.translate(cx, cy); g.scale(1, (h * 0.44) / (w * 0.56));
  gr = g.createRadialGradient(0, 0, 0, 0, 0, w * 0.56);
  gr.addColorStop(0, gold ? 'rgba(255,222,120,.62)' : rgba(col, ga)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.fillRect(-w, -w, 2 * w, 2 * w);
  g.restore();
  // Name strip.
  const nameTop = h - 2.3 * em;
  gr = g.createLinearGradient(0, nameTop, 0, h);
  gr.addColorStop(0, 'rgba(6,10,15,0)'); gr.addColorStop(0.4, 'rgba(6,10,15,.58)'); gr.addColorStop(1, 'rgba(6,10,15,.58)');
  g.fillStyle = gr; g.fillRect(0, nameTop, w, h - nameTop);
  const name = gold ? '★ Rare Special Item' : s.item.name;
  const sub = gold ? 'Exceedingly Rare' : s.variant.name;
  const pad = 0.5 * em;
  g.textBaseline = 'alphabetic';
  g.font = `500 ${(0.6 * em).toFixed(1)}px "IBM Plex Mono", ui-monospace, Menlo, monospace`;
  g.fillStyle = 'rgba(222,232,240,.66)';
  g.fillText(clip(name, 26), pad, h - 1.5 * em, w - 2 * pad);
  if ('fontStretch' in g) g.fontStretch = 'semi-condensed';
  g.font = `700 ${(0.82 * em).toFixed(1)}px Archivo, "Helvetica Neue", Helvetica, Arial, sans-serif`;
  g.fillStyle = gold ? '#ffd76a' : '#f2f4f1';
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 0.1 * em; g.shadowOffsetY = 0.05 * em;
  g.fillText(clip(sub.toUpperCase(), 20), pad, h - 0.66 * em, w - 2 * pad);
  g.shadowColor = 'transparent';
  // Bold grade bar, hairline frame, a lit top edge for the top grades.
  g.fillStyle = col; g.fillRect(0, h - 0.42 * em, w, 0.42 * em);
  if (gold || r.rank >= 3) { g.fillStyle = gold ? '#ffe69a' : mixHex(col, 0.7); g.fillRect(0, 0, w, Math.max(1, 0.1 * em)); }
  g.restore();
  g.strokeStyle = gold ? 'rgba(255,215,90,.6)' : rgba(col, r.rank >= 3 ? 0.55 : 0.28);
  g.lineWidth = 1;
  g.beginPath(); g.roundRect ? g.roundRect(0.5, 0.5, w - 1, h - 1, R) : g.rect(0.5, 0.5, w - 1, h - 1); g.stroke();
  return box;
}

// ------------------------------------------------------------------ bitmap caches
// Plates by size + card, shared by every opening. The Cases tab fills it in idle time (prerasterReel),
// so an opening only blits; anything missing is painted a few per frame. Pictures by icon id: the
// decoded tile icon and its silhouette (half size: it is only seen moving).
const cache = new Map();       // `${size}|${rarity}|${key}` → plate bitmap
const pics = new Map();        // icon id → { img, sil } | { flat } (no icon yet)
const queue = [];
let pumping = false;
const cardId = (rarity, key) => `${rarity}|${key ?? ''}`;
const iconIdOf = (rarity, key) => (rarity === 'gold' || !key ? GOLD_ICON : key);

/** The reel's card size for the current window (cases.css: font-size clamp, 13em band, 1.1em inset). */
export function reelMetrics() {
  const em = Math.min(22, Math.max(13, innerWidth * 0.005 + 8));
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = Math.round(CARD.w * em * dpr), h = Math.round((13 - 2 * CARD.inset) * em * dpr);
  return { em, dpr, w, h, size: `${w}x${h}` };
}

// A picture that was the flat SVG because its icon was not baked yet is redone when the icon lands.
onIcon((iconId) => { const p = pics.get(iconId); if (p?.flat) preparePic(p.rarity, p.key, p.side); });

/** The silhouette of an icon: its solid part filled with a light tint of the grade colour. */
function silhouette(img, color, side) {
  const n = Math.max(24, Math.round(side / 2));
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0, n, n);
  const d = g.getImageData(0, 0, n, n);
  const [r, gg, b] = rgb(color).map((v) => Math.round(v * 0.55 + 255 * 0.45));
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3];
    // The outline and body are solid (alpha ≥ ~0.9); the soft contact shadow drops out.
    const k = a < 140 ? 0 : a > 200 ? 255 : Math.round(((a - 140) / 60) * 255);
    p[i] = r; p[i + 1] = gg; p[i + 2] = b; p[i + 3] = k;
  }
  g.putImageData(d, 0, 0);
  return c;
}

/** Make sure the picture of a card is ready (decoded icon + silhouette, or the flat SVG art). */
function preparePic(rarity, key, side) {
  const id = iconIdOf(rarity, key);
  const have = pics.get(id);
  const baked = !!iconUrl(id, 3);
  if (have && have.side >= side * 0.9 && (!have.flat || !baked)) return Promise.resolve();
  const color = rarity === 'gold' || !key ? '#e4ae39' : rarityOf(rarity).color;
  if (baked) {
    return iconImage(id).then((img) => {
      if (!img) return;
      pics.set(id, { img, sil: silhouette(img, color, side), side, rarity, key });
    });
  }
  if (have?.flat) return Promise.resolve();
  // No icon yet: the flat SVG art, rasterised once (the silhouette is the art in grade tint).
  const s = key ? skin(key) : null;
  const svg = (!s || rarity === 'gold' ? goldArt() : itemArt(s.item, s.variant)).replace('<svg ', `<svg width="${Math.round(side)}" height="${Math.round(side)}" `);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return img.decode().then(() => {
    const c = document.createElement('canvas');
    c.width = c.height = Math.round(side);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    if (!pics.get(id)?.img || pics.get(id).flat) pics.set(id, { img: c, sil: silhouette(c, color, side), side, flat: true, rarity, key });
  }, () => {});
}

function paintOne(job) {
  const k = `${job.size}|${job.id}`;
  const [rarity, key] = job.id.split('|');
  const plate = cache.has(k) ? null : (() => {
    const c = document.createElement('canvas');
    c.width = job.w; c.height = job.h;
    const box = paintPlate(c.getContext('2d'), key || null, rarity, job.w, job.h, job.em * job.dpr);
    cache.set(k, c);
    // An ImageBitmap blits faster than a small (software) canvas once it is on the GPU.
    return globalThis.createImageBitmap?.(c).then((b) => { if (cache.get(k) === c) cache.set(k, b); }, () => {}) ?? box;
  })();
  const box = artBox(job.w, job.h, job.em * job.dpr);
  return Promise.all([plate, preparePic(rarity, key || null, box.s)]);
}

/** Work through the queue: in idle time (prewarm) or ~4 ms per frame (an opening needs them now). */
function pump(urgent) {
  if (pumping && !urgent) return;
  pumping = true;
  const step = (deadline) => {
    const t0 = performance.now();
    const budget = urgent ? 4 : Math.max(2, Math.min(8, deadline?.timeRemaining?.() ?? 4));
    const batch = [];
    while (queue.length && performance.now() - t0 < budget && batch.length < (urgent ? 3 : 2)) batch.push(paintOne(queue.shift()));
    Promise.all(batch).then(() => {
      if (!queue.length) { pumping = false; return; }
      if (urgent) requestAnimationFrame(() => step());
      else (globalThis.requestIdleCallback || ((f) => setTimeout(f, 30)))(step, { timeout: 500 });
    });
  };
  if (urgent) requestAnimationFrame(() => step()); else (globalThis.requestIdleCallback || ((f) => setTimeout(f, 30)))(step, { timeout: 500 });
}

function enqueue(ids, m, front = false) {
  const jobs = ids.filter((id) => !queue.some((q) => q.id === id && q.size === m.size)).map((id) => ({ id, size: m.size, w: m.w, h: m.h, em: m.em, dpr: m.dpr }));
  if (front) queue.unshift(...jobs); else queue.push(...jobs);
}

/** Cards still waiting to be painted (captures wait for 0). */
export const reelPending = () => queue.length + (pumping ? 1 : 0);
if (typeof window !== 'undefined') window.__senditReelPending = reelPending;

/** Pre-paint every card of these case series (and the gold card) in idle time, after their icons are baked. */
export function prerasterReel(seriesList) {
  const m = reelMetrics();
  const ids = [cardId('gold', null)];
  for (const s of seriesList) { const pool = casePool(s); for (const r of RARITIES) if (r.id !== 'gold') for (const e of pool[r.id]) ids.push(cardId(r.id, e.key)); }
  const uniq = [...new Set(ids)];
  const icons = uniq.map((id) => { const [r, k] = id.split('|'); return iconIdOf(r, k || null); });
  requestIcons(icons, 0);
  const fonts = globalThis.document?.fonts?.load ? Promise.all([document.fonts.load('700 16px Archivo'), document.fonts.load('500 12px "IBM Plex Mono"')]).catch(() => {}) : null;
  Promise.all([whenIcons(icons, 30000), fonts]).then(() => { enqueue(uniq, m); pump(false); });
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export class CanvasReel {
  /** cards: [{ key, rarity }] in reel order. */
  constructor(cards) {
    this.cards = cards;
    this.cv = document.createElement('canvas');
    this.cv.className = 'cr-reelcv';
    this.g = this.cv.getContext('2d');
    this.ready = false;
  }

  /** Size to the reel window (CSS px) and the overlay's em; paints the cards (async). */
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
    const b = artBox(w, h, em * dpr);
    this.art = { x: b.x / dpr, y: b.y / dpr, s: b.s / dpr };
    // Missing cards go to the front of the queue (the winner and the cards near the start first).
    const order = this.cards.map((c, i) => [cardId(c.rarity, c.key), i]).sort((a, b2) => Math.abs(a[1] - 50) - Math.abs(b2[1] - 50)).map(([id]) => id);
    const need = [...new Set(order)].filter((id) => { const [r, k] = id.split('|'); return !cache.has(`${this.size}|${id}`) || !pics.get(iconIdOf(r, k || null)); });
    enqueue(need, { em, dpr, w, h, size: this.size }, true);
    if (queue.length) pump(true);
  }

  /**
   * Before the reel shows: draw the next few distinct cards once (full size, then cleared; the band is
   * still invisible) so their bitmaps are uploaded to the GPU during the crate's first second, not on
   * the reel's first frames. Returns true while there is more to warm.
   */
  warmStep(n = 6) {
    this.warmIds ||= [...new Set(this.cards.map((c) => cardId(c.rarity, c.key)))];
    this.warmAt ||= 0;
    const g = this.g;
    let done = 0;
    while (this.warmAt < this.warmIds.length && done < n) {
      const id = this.warmIds[this.warmAt];
      const bm = cache.get(`${this.size}|${id}`);
      const [r, k] = id.split('|');
      const pic = pics.get(iconIdOf(r, k || null));
      if (!bm || !pic) break;   // not painted yet: try again next frame
      g.drawImage(bm, 0, this.top, this.cw, this.ch);   // full size: the real texture upload
      g.drawImage(pic.img, 0, 0, this.art.s, this.art.s);
      g.drawImage(pic.sil, 0, 0, this.art.s, this.art.s);
      this.warmAt++; done++;
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.cv.width, this.cv.height);
    return this.warmAt < this.warmIds.length;
  }

  /**
   * Draw the strip scrolled by x CSS px (the marker sits at the canvas centre). o = { v, win, landK }:
   * v = reel speed in px/s (picks silhouette vs. detail and the blur); after the landing the winner
   * pops and glows, the rest dim.
   */
  draw(x, { v = 0, win = -1, landK = 0, color = '#fff' } = {}) {
    const g = this.g, d = this.dpr;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, this.cv.width / d, this.cv.height / d);
    const W = this.cv.width / d;
    const first = Math.max(0, Math.floor(x / this.pitch) - 1);
    const last = Math.min(this.cards.length - 1, Math.ceil((x + W) / this.pitch) + 1);
    const dim = Math.min(1, landK * 1.6);
    // Cards per second → how graphic the pictures are (1 = silhouettes) and the blur length (px).
    const cps = Math.abs(v) / this.pitch;
    const still = reduced();
    this.sil = landK > 0 ? 0 : smooth(7, 20, cps);
    this.blur = landK > 0 || still ? 0 : Math.min(this.cw * 0.5, Math.abs(v) / 60 * 0.55);
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
    const blur = this.blur;
    if (bm) {
      g.drawImage(bm, left, top, w, h);
      if (blur > 2) {
        // Motion blur: two faint copies trailing along the travel direction.
        g.globalAlpha = 0.3; g.drawImage(bm, left + blur * 0.5, top, w, h); g.drawImage(bm, left + blur, top, w, h); g.globalAlpha = 1;
      }
    } else {
      // Not painted yet (very first frames on a slow machine): a plain card in its grade colour.
      g.fillStyle = '#172430'; g.fillRect(left, top, w, h);
      g.fillStyle = rarityOf(c.rarity).color; g.fillRect(left, top + h - 0.42 * this.em, w, 0.42 * this.em);
    }
    const pic = pics.get(iconIdOf(c.rarity, c.key));
    if (pic) {
      const a = this.art, ps = a.s * s, px = left + a.x * s, py = top + a.y * s;
      const sil = this.sil;
      if (sil < 1) { g.globalAlpha = 1 - sil; g.drawImage(pic.img, px, py, ps, ps); }
      if (sil > 0) {
        const n = blur > 2 ? 4 : 1;
        g.globalAlpha = sil * (n > 1 ? 0.42 : 1);
        for (let j = 0; j < n; j++) g.drawImage(pic.sil, px + (blur * j) / Math.max(1, n - 1) - blur * 0.15, py, ps, ps);
      }
      g.globalAlpha = 1;
    }
    if (dim > 0) { g.fillStyle = `rgba(4,5,12,${dim.toFixed(3)})`; g.fillRect(left, top, w, h); }
  }
}
