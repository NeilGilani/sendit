// Saved highlight clips: storage (docs/game-feel.md § 8g).
//   IndexedDB "sendit-highlights": store "meta" { id, meta, fav, at, thumb?: Blob, bytes: n } and store
//   "data" { id, bytes: ArrayBuffer (thrill/clipcodec.js container) }. Listing the gallery reads only "meta".
//   localStorage "sendit.highlights": a tiny mirror { v, clips: [{ id, mapId, trick, fav, at, shown }], last }
//   so the next page load's loading screen can choose a clip synchronously, before any game code runs
//   (loading/index.js), and hand the id to its worker, which reads the bytes from IndexedDB itself.
// Capacity: HIGHLIGHTS.cap clips; saving one more drops the oldest that isn't a favourite (favourites
// are never dropped; when every clip is a favourite the save is refused).
// Works without IndexedDB (private mode, old browsers): every call rejects / returns empty, and the game
// says "can't save highlights in this browser".
export const HIGHLIGHTS = {
  cap: 30,
  db: 'sendit-highlights',
  indexKey: 'sendit.highlights',
};

// ------------------------------------------------------------------ pure logic (unit-tested)
/** Ids to drop so that `list` + one new clip fits `cap` (oldest non-favourites first); null = can't fit. */
export function capPlan(list, cap = HIGHLIGHTS.cap) {
  const over = list.length + 1 - cap;
  if (over <= 0) return [];
  const pool = list.filter((c) => !c.fav).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (pool.length < over) return null;
  return pool.slice(0, over).map((c) => c.id);
}

/**
 * Which saved clip the loading screen plays (or null = a made-up trick), per the user's rules:
 *   0 saved → null · 1–2 saved → a mix (each load a clip with probability 1/2 resp. 2/3) · ≥3 → always a clip.
 * Never the same clip twice in a row; a clip never shown yet goes first, even with 1–2 saved (you just saved
 * it: see it on the next load); then
 * favourites weigh 3×, and clips shown less often a little more. A map load prefers a clip from the
 * destination mountain. index = { clips: [{ id, mapId, fav, at, shown }], last }.
 */
export function pickLoadingClip(index, { mapId = null, rand = Math.random } = {}) {
  const clips = (index?.clips || []).filter((c) => c && typeof c.id === 'string');
  const n = clips.length;
  if (!n) return null;
  const pool = clips.filter((c) => c.id !== index.last);
  if (!pool.length) return null;   // a single clip, just shown: a made-up trick this time
  const fresh = pool.filter((c) => !c.shown).sort((a, b) => (b.at || 0) - (a.at || 0));
  if (fresh.length) return fresh[0].id;
  if (n < 3 && rand() >= n / (n + 1)) return null;
  let cand = pool;
  if (mapId) { const here = pool.filter((c) => c.mapId === mapId); if (here.length) cand = here; }
  const maxShown = Math.max(...cand.map((c) => c.shown || 0));
  const w = cand.map((c) => (c.fav ? 3 : 1) * (1 + 0.5 * (maxShown - (c.shown || 0)) / Math.max(1, maxShown)));
  let x = rand() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) { x -= w[i]; if (x <= 0) return cand[i].id; }
  return cand[cand.length - 1].id;
}

// ------------------------------------------------------------------ localStorage mirror
const ls = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; } };

export function readIndex() {
  try {
    const x = JSON.parse(ls()?.getItem(HIGHLIGHTS.indexKey) || 'null');
    if (!x || typeof x !== 'object' || !Array.isArray(x.clips)) return { v: 1, clips: [], last: null };
    x.clips = x.clips.filter((c) => c && typeof c.id === 'string');
    return x;
  } catch { return { v: 1, clips: [], last: null }; }
}

export function writeIndex(x) {
  try { ls()?.setItem(HIGHLIGHTS.indexKey, JSON.stringify(x)); } catch { /* storage full / off */ }
}

/** The loading screen showed clip `id` (or a made-up trick when id is null). */
export function noteShown(id) {
  const x = readIndex();
  x.last = id || null;
  const c = id && x.clips.find((k) => k.id === id);
  if (c) c.shown = (c.shown || 0) + 1;
  writeIndex(x);
}

/** A clip the loading screen could not play (missing or corrupt): out of the index. */
export function forgetInIndex(id) {
  const x = readIndex();
  x.clips = x.clips.filter((c) => c.id !== id);
  writeIndex(x);
}

// ------------------------------------------------------------------ IndexedDB
let dbP = null;
export function openDb() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    if (typeof indexedDB === 'undefined') { rej(new Error('no IndexedDB')); return; }
    let req;
    try { req = indexedDB.open(HIGHLIGHTS.db, 1); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('data')) db.createObjectStore('data', { keyPath: 'id' });
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => rej(new Error('IndexedDB blocked'));
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}

const done = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); });
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

/** The stored bytes of one clip (works in workers too). → ArrayBuffer or null. */
export async function getClipBytes(id) {
  const db = await openDb();
  const rec = await reqP(db.transaction('data').objectStore('data').get(id));
  return rec?.bytes || null;
}

export async function listClips() {
  const db = await openDb();
  const all = await reqP(db.transaction('meta').objectStore('meta').getAll());
  return all.sort((a, b) => (b.at || 0) - (a.at || 0));
}

export async function getClipMeta(id) {
  const db = await openDb();
  return (await reqP(db.transaction('meta').objectStore('meta').get(id))) || null;
}

function mirror(list, prev = readIndex()) {
  const shown = new Map(prev.clips.map((c) => [c.id, c.shown || 0]));
  writeIndex({ v: 1, last: prev.last ?? null, clips: list.map((c) => ({ id: c.id, mapId: c.meta?.mapId || null, trick: c.meta?.trick || '', fav: !!c.fav, at: c.at || 0, shown: shown.get(c.id) || 0 })) });
}

/** Re-sync the localStorage mirror with IndexedDB (lobby open; clears ids that no longer exist). */
export async function syncIndex() {
  const list = await listClips();
  mirror(list);
  return list;
}

const newId = () => `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

/**
 * Store a clip. bytes: Uint8Array (container). → { id, dropped: [ids] }. Rejects with code 'full' when
 * every stored clip is a favourite.
 */
export async function addClip(meta, bytes) {
  const db = await openDb();
  const list = await listClips();
  const drop = capPlan(list);
  if (!drop) { const e = new Error('Highlights are full of favourites'); e.code = 'full'; throw e; }
  const id = newId(), at = Date.now();
  const tx = db.transaction(['meta', 'data'], 'readwrite');
  const buf = bytes.buffer.byteLength === bytes.byteLength ? bytes.buffer : bytes.slice().buffer;
  tx.objectStore('meta').put({ id, meta, fav: false, at, size: bytes.byteLength });
  tx.objectStore('data').put({ id, bytes: buf });
  for (const d of drop) { tx.objectStore('meta').delete(d); tx.objectStore('data').delete(d); }
  await done(tx);
  mirror(await listClips());
  return { id, dropped: drop, at };
}

export async function removeClip(id) {
  const db = await openDb();
  const tx = db.transaction(['meta', 'data'], 'readwrite');
  tx.objectStore('meta').delete(id); tx.objectStore('data').delete(id);
  await done(tx);
  mirror(await listClips());
}

async function patchMeta(id, fn) {
  const db = await openDb();
  const tx = db.transaction('meta', 'readwrite');
  const st = tx.objectStore('meta');
  const rec = await reqP(st.get(id));
  if (rec) { fn(rec); st.put(rec); }
  await done(tx);
  return rec;
}

export async function setFavourite(id, fav) {
  const rec = await patchMeta(id, (r) => { r.fav = !!fav; });
  mirror(await listClips());
  return rec;
}

/** Thumbnail (a Blob, rendered by the loading scene in thumb mode). */
export const setThumb = (id, blob) => patchMeta(id, (r) => { r.thumb = blob; });
