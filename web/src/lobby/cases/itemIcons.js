// Item icons: one rendered 3D picture per reward skin, the same everywhere an item is shown (Cases tab
// contents, recent / best pulls, the reel, the reveal, the session summary, the Locker grid and detail,
// the Equipment card). iconBaker.js renders them with the game's own models and shaders; this module
// queues the bakes, caches the pictures and swaps them into the page.
//
//   artHtml(id, fallbackSvg)  '<div class="cr-art" data-icon=id>' with the picture, or the flat SVG
//                             card art until the picture is baked (then swapped in place)
//   iconUrl(id)               blob: URL of the baked picture, or null (and queues the bake)
//   iconImage(id)             Promise<HTMLImageElement | null>, decoded (the reel canvas draws it)
//   requestIcons(ids, prio)   queue bakes (higher prio first)    whenIcons(ids, ms) resolves when baked
//   onIcon(fn)                fn(id) after each bake             GOLD_ICON = the anonymous ★ card's id
//   hdId(id)                  the id of the big picture of an item ('hd:' + id)
//
// Two looks (iconBaker.js): the TILE picture for every card (flatter colour, crisp dark outline, no
// bloom, small: 256 / 192 px) and the HD picture (full studio shading, 512 / 384 px), baked only when
// something big asks for it (the Locker detail, the 2D reveal card).
//
// ids are skin keys ('jacket-tuff-shell:woodland') or GOLD_ICON. Cache: in memory (blob URLs of small
// webp files, ~15–40 kB each) and IndexedDB ('sendit-icons', key `${ICON_VERSION}|${px}|${id}`), so after
// the first visit every icon is there at once. Bump ICON_VERSION when the look of the icons changes
// (studio, framing, a model or shader the icons use): old entries are dropped on the next load.
// Bakes run one at a time, one per animation frame, only while the lobby has a WebGL renderer
// (window.__sendit.renderer); without one the SVG art stays.
import { skin } from '../../profile/rewards.js';
import './icons.css';
import { urlParams } from '../../flags.js';

export const ICON_VERSION = 5;   // 5: round-2 jackets on the in-between body, R1–R6 items (4: clothing pass 3)
export const GOLD_ICON = 'gold-star';
const DB = 'sendit-icons', STORE = 'icons';

const HI_DPR = typeof devicePixelRatio !== 'undefined' && devicePixelRatio >= 1.5;
/** Tile icon size in device px (the picture sits in ~65 % of a 6–14 em card). */
export const ICON_PX = HI_DPR ? 256 : 192;
/** The big picture (Locker detail ~11 em, the 2D reveal card 17 em). */
export const HD_PX = HI_DPR ? 512 : 384;
const HD = 'hd:';
export const hdId = (id) => (id == null || String(id).startsWith(HD) ? id : HD + id);
const prefix = `${ICON_VERSION}|${ICON_PX}|`;

const urls = new Map();          // id → blob URL
const images = new Map();        // id → Promise<HTMLImageElement>
const queue = new Map();         // id → prio
const waiters = new Set();       // { ids:Set, resolve }
const listeners = new Set();
const failed = new Set();
let baker = null, bakerP = null, dbP = null, loaded = null, running = false, disabled = false;
const params = urlParams();   // ?noicons / ?iconrebake: dev builds only (flags.js)
if (params.has('noicons')) disabled = true;   // debug: the old flat SVG art

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---------------------------------------------------------------- IndexedDB (best effort)
function db() {
  if (dbP) return dbP;
  dbP = new Promise((res) => {
    try {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(STORE);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => res(null);
      rq.onblocked = () => res(null);
    } catch { res(null); }
  });
  return dbP;
}

/** Load every cached icon of this version and size; drop the stale ones. */
function loadCache() {
  if (loaded) return loaded;
  loaded = db().then((d) => new Promise((res) => {
    if (!d || params.has('iconrebake')) { res(); return; }
    try {
      const tx = d.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      const cur = st.openCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        const k = String(c.key);
        if (k.startsWith(prefix) && c.value instanceof Blob) {
          const id = k.slice(prefix.length);
          if (!urls.has(id)) urls.set(id, URL.createObjectURL(c.value));
        } else if (!k.startsWith(`${ICON_VERSION}|`)) c.delete();
        c.continue();
      };
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    } catch { res(); }
  }));
  return loaded;
}

function store(id, blob) {
  db().then((d) => {
    if (!d) return;
    try { d.transaction(STORE, 'readwrite').objectStore(STORE).put(blob, prefix + id); } catch { /* quota / private mode */ }
  });
}

// ---------------------------------------------------------------- baking
function getBaker() {
  if (bakerP) return bakerP;
  const renderer = globalThis.__sendit?.renderer;
  if (!renderer) return null;
  bakerP = import('./iconBaker.js').then(async (m) => {
    const b = await m.IconBaker.create(renderer);
    await b.warm().catch(() => {});
    baker = b;
    return b;
  }).catch((e) => { console.warn('[icons] baker unavailable, keeping the flat art', e); disabled = true; return null; });
  return bakerP;
}

function describe(id) {
  const hd = id.startsWith(HD);
  const base = hd ? id.slice(HD.length) : id;
  if (base === GOLD_ICON) return { skin: null, rarity: 'gold', hd };
  const s = skin(base);
  return s ? { skin: s, rarity: s.variant.rarity || 'common', hd } : null;
}

function next() {
  let best = null, bp = -Infinity;
  for (const [id, p] of queue) if (p > bp) { best = id; bp = p; }
  return best;
}

async function pump() {
  if (running || disabled) return;
  running = true;
  try {
    await loadCache();
    // Anything the cache already had is done.
    for (const id of [...queue.keys()]) if (urls.has(id)) { queue.delete(id); done(id); }
    while (queue.size && !disabled) {
      const p = getBaker();
      if (!p) { await wait(500); continue; }    // the lobby renderer is not up yet
      const b = await p;
      if (!b) break;
      await frame();
      const id = next();
      if (id == null) break;
      queue.delete(id);
      if (urls.has(id)) { done(id); continue; }
      const d = describe(id);
      if (!d) { failed.add(id); done(id); continue; }
      try {
        const m = await import('./iconBaker.js');
        const blob = await b.bake(m.describeIcon(d.skin, d.rarity), d.hd ? HD_PX : ICON_PX, d.hd ? 'hd' : 'tile');
        if (blob) { urls.set(id, URL.createObjectURL(blob)); store(id, blob); }
      } catch (e) {
        console.warn('[icons] bake failed', id, e);
        failed.add(id);
      }
      done(id);
    }
  } finally { running = false; }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const frame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));

function done(id) {
  if (typeof document !== 'undefined' && urls.has(id)) {
    for (const el of document.querySelectorAll(`.cr-art[data-icon="${CSS.escape(id)}"]`)) el.innerHTML = imgHtml(id, true);
  }
  for (const w of [...waiters]) { w.ids.delete(id); if (!w.ids.size) { waiters.delete(w); w.resolve(true); } }
  for (const fn of listeners) { try { fn(id); } catch (e) { console.warn(e); } }
}

// ---------------------------------------------------------------- public API
/** Queue bakes for these ids (skin keys or GOLD_ICON). */
export function requestIcons(ids, prio = 0) {
  if (disabled) return;
  for (const id of ids) {
    if (id == null || urls.has(id) || failed.has(id)) continue;
    queue.set(id, Math.max(prio, queue.get(id) ?? -Infinity));
  }
  if (queue.size) pump();
}

/** The baked picture's URL, or null (queues it). */
export function iconUrl(id, prio = 1) {
  if (urls.has(id)) return urls.get(id);
  requestIcons([id], prio);
  return null;
}

/** Resolves (true) when every id is baked or failed, or (false) after `ms`. */
export function whenIcons(ids, ms = 20000) {
  const left = new Set(ids.filter((id) => id != null && !urls.has(id) && !failed.has(id)));
  if (!left.size || disabled) return Promise.resolve(true);
  requestIcons([...left], 0);
  return new Promise((resolve) => {
    const w = { ids: left, resolve };
    waiters.add(w);
    setTimeout(() => { if (waiters.delete(w)) resolve(false); }, ms);
  });
}

export function onIcon(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** A decoded <img> of the baked picture (null if there is none yet). */
export function iconImage(id) {
  const url = urls.get(id);
  if (!url) return Promise.resolve(null);
  if (!images.has(id)) {
    const img = new Image();
    img.src = url;
    images.set(id, img.decode().then(() => img, () => null));
  }
  return images.get(id);
}

const imgHtml = (id, fresh = false) => `<img class="ca-img${fresh ? ' fresh' : ''}" src="${esc(urls.get(id))}" alt="" draggable="false">`;

/**
 * The art block of a card: the baked picture, or `fallback` (the flat SVG) until it is ready.
 * `icon: false` keeps the flat art (silhouettes of skins you do not own).
 */
export function artHtml(id, fallback, { icon = true, prio = 1, cls = '', hd = false } = {}) {
  const c = cls ? `cr-art ${cls}` : 'cr-art';
  if (!icon || disabled || id == null) return `<div class="${c}">${fallback}</div>`;
  if (hd) {
    // The big picture; the tile picture (or the flat art) stands in until it is baked.
    const big = hdId(id);
    const url = iconUrl(big, prio + 1);
    const tile = url ? null : iconUrl(id, prio + 2);
    return `<div class="${c}" data-icon="${esc(big)}">${url ? imgHtml(big) : tile ? imgHtml(id) : fallback}</div>`;
  }
  const url = iconUrl(id, prio);
  return `<div class="${c}" data-icon="${esc(id)}">${url ? imgHtml(id) : fallback}</div>`;
}

// Debug / capture hook (scripts/iconsheet.mjs): bake a list and wait, read the URLs.
if (typeof window !== 'undefined') {
  window.__senditIcons = {
    version: ICON_VERSION, px: ICON_PX, hdPx: HD_PX, hdId, urls, failed, GOLD_ICON,
    request: requestIcons, when: whenIcons,
    pending: () => queue.size + (running ? 1 : 0),
    async clear() { for (const u of urls.values()) URL.revokeObjectURL(u); urls.clear(); images.clear(); const d = await db(); if (d) d.transaction(STORE, 'readwrite').objectStore(STORE).clear(); },
    get baker() { return baker; },
  };
}
