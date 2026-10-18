// Thrill: pure logic (no DOM, no three.js) for the "why games hook" features (docs/game-feel.md § 9).
//   THRILL         tunables for every thrill module
//   SpotBook       named spots and gaps discovered per mountain (THPS gaps × Steep's mountain discovery)
//   judgeLanding   which spot / gap a clean landing counts for
//   RetryTrail     ground samples for "retry from the last take-off" (Trackmania checkpoint respawn)
//   dropAhead, exposureLevel   how exposed the rider is (cliff ahead, height above the snow, speed)
//   heartbeatBpm   exposure → heartbeat tempo
//   FrameRing      fixed-size ring of timed frames (instant replay recorder)
//   encodeVersus / decodeVersus   "beat my run" challenge codes (score, time, medal and a compact ghost)
// Node unit tests: web/scripts/thrill-unit.mjs (run by unittest.mjs).

export const THRILL = {
  restart: {
    fadeIn: 0.08,          // s: quick restart flash to black (the old reset fade was 0.45 + 0.12 + 0.7 s)
    hold: 40,              // ms at black
    fadeOut: 0.22,         // s
    countdown: 2.4,        // s: a Challenge restart counts 2, 1, GO (a fresh start keeps 3, 2, 1)
  },
  retry: {
    lead: 2.6,             // s before the last take-off to put you back (on the approach, with its speed) …
    leadMin: 12, leadMax: 45,   // … measured as distance at the take-off speed, m
    minAir: 0.4,           // s: shorter airs (bumps, rollers) don't move the retry point
    bounceM: 40,           // m after a landing in which a much smaller air (< 60 %) is a bounce, not a new target
    sampleM: 1.5,          // m between ground samples
    keep: 600,             // m of trail kept
  },
  spots: {
    minAir: 0.6,           // s of air for a take-off to count as sending a spot
    minDrop: 3,            // … or this many metres above the snow
    newScore: 250,         // style points for a new spot
    newXp: 60,             // XP for a new spot
    gapAir: 0.8,           // s of air for a transfer gap (take off from A, land on a different named B)
    gapScore: 400, gapXp: 100,
    gapRepeat: 100,        // points for a gap already found (THPS gaps always score)
    railMin: 3,            // m of grind for a rail to count as a spot
  },
  markers: {
    range: 160,            // m: undiscovered spots closer than this get a floating "?" …
    near: 45,              // … ahead of you, or any direction within this
    max: 3,                // markers at once
    lift: 5,               // m above the snow
    size: 2.2,             // sprite size (m) up close …
    angular: 0.055,        // … and m per m of distance beyond that (≈ 3° on screen)
  },
  exposure: {
    look: [6, 10, 15, 22, 30],   // m ahead sampled along the travel direction
    dropFrom: 6, dropFull: 24,   // m of drop ahead beyond the slope's own fall: 0 → 1
    aboveFrom: 6, aboveFull: 24, // m above the snow in the air: 0 → 1
    speedFrom: 0.93, speedFull: 1.05, speedShare: 0.35,   // speed ratio adds at most this much
    rise: 2.5, fall: 0.9,        // 1/s easing of the level
    bpm: [76, 148],              // heartbeat tempo from level 0.15 to 1
    vignette: 0.7,               // vignette opacity at level 1
  },
  medal: {
    closeS: 1.5,           // s: within this (or closeShare of the target time) the results card says SO CLOSE
    closeShare: 0.04,
  },
  replay: {
    seconds: 8,            // s kept in the recorder
    before: 4.0,           // s before touchdown a trick replay starts
    after: 1.5,            // s after touchdown it ends
    slow: 0.4,             // playback rate while airborne
    orbitDeg: 120,         // drone orbit over the replay
    dist: 6.2, rise: 2.4,  // drone arm (m); it flies on the side with fewer trees in the way
    filmerDist: 10, filmerAhead: 4, filmerHeight: 1.4,   // every other replay: a tripod this far beside / ahead of the take-off (m)
    filmerFrame: 3.2,      // m of scene the long lens keeps in frame around the rider
    prompt: 4,             // s the REPLAY prompt stays after a big landing
    bigAir: 1.4,           // s of air (or a huge trick) for the prompt
    window: 14,            // s after a moment that Tab still replays it (else the last `fallback` s)
    fallback: 6,
    minClip: 1,            // s: shorter stretches are not worth a replay
    wipeBefore: 2.5, wipeAfter: 3.2,   // a wipeout replay: from before the crash to the respawn
    wipeSlow: 0.5,         // playback rate around the crash
    wipeTumble: 4, wipeSpeed: 11,      // m tumbled or m/s at the crash for the "REPLAY WIPEOUT" prompt
  },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** 0 at `a`, 1 at `b`, linear and clamped. */
export const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);

// ------------------------------------------------------------------ spots and gaps
function sanitizeSpots(s) {
  const out = { version: 1, maps: {} };
  if (!s || typeof s !== 'object' || typeof s.maps !== 'object' || !s.maps) return out;
  for (const [id, m] of Object.entries(s.maps)) {
    if (!m || typeof m !== 'object') continue;
    const spots = {}, gaps = {};
    for (const [k, v] of Object.entries(m.spots || {})) if (k && v && Number.isFinite(v.n) && v.n > 0) spots[k] = { n: Math.floor(v.n), first: Number(v.first) || 0 };
    for (const [k, v] of Object.entries(m.gaps || {})) if (k && Number.isFinite(v) && v > 0) gaps[k] = Math.floor(v);
    const catalog = Array.isArray(m.catalog?.names) ? { names: m.catalog.names.filter((x) => typeof x === 'string' && x).slice(0, 400), ver: Number(m.catalog.ver) || 0, pts: cleanPts(m.catalog.pts) } : null;
    out.maps[id] = { spots, gaps, catalog };
  }
  return out;
}

/** { name: [[x, z], …] } with finite numbers only, at most 16 points a name. */
function cleanPts(p) {
  const out = {};
  if (!p || typeof p !== 'object' || Array.isArray(p)) return out;
  for (const [k, v] of Object.entries(p)) {
    if (!Array.isArray(v)) continue;
    const ok = v.filter((q) => Array.isArray(q) && Number.isFinite(q[0]) && Number.isFinite(q[1])).slice(0, 16).map((q) => [Math.round(q[0]), Math.round(q[1])]);
    if (ok.length) out[k] = ok;
  }
  return out;
}

export class SpotBook {
  /** storage: { get(key), set(key, value) } (JSON values). */
  constructor(storage, key = 'sendit.spots') {
    this.storage = storage; this.key = key;
    this.state = sanitizeSpots(storage?.get?.(key));
  }
  save() { this.storage?.set?.(this.key, this.state); }
  map(id) { return (this.state.maps[id] ||= { spots: {}, gaps: {}, catalog: null }); }
  /** Every spot name on a map: the catalog (all named features) plus anything found that it missed. */
  names(mapId) {
    const m = this.map(mapId);
    const set = new Set(m.catalog?.names || []);
    for (const k of Object.keys(m.spots)) set.add(k);
    return [...set];
  }
  /** A clean send off a named spot. → { isNew, n, found, total } */
  record(mapId, name, now = Date.now()) {
    const m = this.map(mapId);
    const e = m.spots[name];
    if (e) e.n++; else m.spots[name] = { n: 1, first: now };
    this.save();
    const { found, total } = this.summary(mapId);
    return { isNew: !e, n: m.spots[name].n, found, total };
  }
  /** A transfer from one named spot to another. → { isNew, n, name } */
  recordGap(mapId, from, to) {
    const m = this.map(mapId), name = `${from} → ${to}`;
    const n = (m.gaps[name] || 0) + 1;
    m.gaps[name] = n;
    this.save();
    return { isNew: n === 1, n, name };
  }
  /** The map's full list of named spots (found or not). Kept unless it changes. */
  setCatalog(mapId, names, ver = 1, pts = null) {
    const m = this.map(mapId);
    const clean = [...new Set(names.filter((x) => typeof x === 'string' && x))].sort();
    if (m.catalog && m.catalog.ver === ver && m.catalog.names.length === clean.length && m.catalog.names.every((x, i) => x === clean[i]) && !pts) return false;
    m.catalog = { names: clean, ver, pts: cleanPts(pts) };
    this.save();
    return true;
  }
  /**
   * Undiscovered spots near (x, z): [{ name, x, z, d }] nearest first, at most `max`, within `range` m, and
   * ahead of the travel direction (dx, dz) unless closer than `near` m.
   */
  undiscoveredNear(mapId, x, z, dx, dz, { range = 160, near = 45, max = 3 } = {}) {
    const m = this.map(mapId), pts = m.catalog?.pts || {}, out = [];
    for (const [name, list] of Object.entries(pts)) {
      if (m.spots[name]) continue;
      let best = null;
      for (const [px, pz] of list) {
        const ex = px - x, ez = pz - z, d = Math.hypot(ex, ez);
        if (d > range || (d > near && (ex * dx + ez * dz) / Math.max(d, 1e-6) < 0.35)) continue;
        if (!best || d < best.d) best = { name, x: px, z: pz, d };
      }
      if (best) out.push(best);
    }
    return out.sort((a, b) => a.d - b.d).slice(0, max);
  }
  hasCatalog(mapId, ver = 1) { const c = this.map(mapId).catalog; return !!c && c.ver === ver && c.names.length > 0; }
  /** → { found, total, spots: [{ name, n }] (found first, then unfound as n 0), gaps: [{ name, n }] } */
  summary(mapId) {
    const m = this.map(mapId);
    const spots = this.names(mapId).map((name) => ({ name, n: m.spots[name]?.n || 0 }))
      .sort((a, b) => (b.n > 0) - (a.n > 0) || a.name.localeCompare(b.name));
    const gaps = Object.entries(m.gaps).map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n);
    return { found: spots.filter((s) => s.n > 0).length, total: spots.length, spots, gaps };
  }
}

/**
 * Which spot / gap a landing counts for. e: { clean, air, drop, from (take-off feature name), to (feature under
 * the landing) }. → { spot: name | null, gap: [from, to] | null }
 */
export function judgeLanding(e, C = THRILL.spots) {
  if (!e || !e.clean || !e.from) return { spot: null, gap: null };
  const sent = (e.air || 0) >= C.minAir || (e.drop || 0) >= C.minDrop;
  if (!sent) return { spot: null, gap: null };
  const gap = e.to && e.to !== e.from && (e.air || 0) >= C.gapAir ? [e.from, e.to] : null;
  return { spot: e.from, gap };
}

// ------------------------------------------------------------------ retry from the last take-off
// `t` is any increasing clock: retry.js feeds the distance ridden (m), so the lead is frame-rate proof.
export class RetryTrail {
  constructor(keep = THRILL.retry.keep) { this.keep = keep; this.s = []; this.takeoffT = null; }
  clear() { this.s.length = 0; this.takeoffT = null; }
  /** A grounded sample { x, y, z, h, vx, vy, vz } at time t (s). */
  push(t, sample) {
    this.s.push({ t, ...sample });
    while (this.s.length && this.s[0].t < t - this.keep) this.s.shift();
  }
  markTakeoff(t) { this.takeoffT = t; }
  /** The sample `lead` s before the last take-off (the newest one at or before it), else null. */
  pick(lead = THRILL.retry.lead) {
    if (this.takeoffT === null || !this.s.length) return null;
    const want = this.takeoffT - lead;
    let best = null;
    for (const p of this.s) { if (p.t <= want) best = p; else break; }
    // The take-off came sooner than `lead` after the oldest sample (a spawn): use the oldest before it.
    if (!best && this.s[0].t <= this.takeoffT) best = this.s[0];
    return best;
  }
}

// ------------------------------------------------------------------ exposure (adrenaline)
/**
 * How far the snow falls away ahead beyond the slope's own fall line, in m. heightAt(x, z); (x, y, z) the
 * rider's feet; (dx, dz) the unit travel direction. A cliff band or a big drop reads high, a steep
 * but even slope reads ~0.
 */
export function dropAhead(heightAt, x, y, z, dx, dz, look = THRILL.exposure.look) {
  const h3 = heightAt(x + dx * 3, z + dz * 3);
  const slope = Math.max(0, (y - h3) / 3);
  let best = 0;
  for (const d of look) {
    const h = heightAt(x + dx * d, z + dz * d);
    best = Math.max(best, (y - h) - slope * d);
  }
  return best;
}

/** Exposure 0..1 from the drop ahead, the height above the snow (air) and the speed ratio. */
export function exposureLevel({ drop = 0, above = 0, speedRatio = 0 } = {}, C = THRILL.exposure) {
  return Math.max(ramp(drop, C.dropFrom, C.dropFull), ramp(above, C.aboveFrom, C.aboveFull), ramp(speedRatio, C.speedFrom, C.speedFull) * C.speedShare);
}

/** Heartbeat tempo for an exposure level (0 below 0.15 = no heartbeat). */
export function heartbeatBpm(level, C = THRILL.exposure) {
  if (level < 0.15) return 0;
  return C.bpm[0] + (C.bpm[1] - C.bpm[0]) * ramp(level, 0.15, 1);
}

// ------------------------------------------------------------------ replay ring
export class FrameRing {
  constructor(capacity, stride) {
    this.cap = capacity; this.stride = stride;
    this.data = new Float32Array(capacity * stride);
    this.times = new Float64Array(capacity);
    this.head = 0; this.count = 0;
  }
  clear() { this.head = 0; this.count = 0; }
  /** Physical slot of logical frame j (0 = oldest). */
  slot(j) { return (this.head - this.count + j + this.cap * 2) % this.cap; }
  /** Start a new frame at time t; returns its offset into data. */
  push(t) {
    const i = this.head;
    this.times[i] = t;
    this.head = (this.head + 1) % this.cap;
    this.count = Math.min(this.cap, this.count + 1);
    return i * this.stride;
  }
  time(j) { return this.times[this.slot(j)]; }
  offset(j) { return this.slot(j) * this.stride; }
  get t0() { return this.count ? this.time(0) : 0; }
  get t1() { return this.count ? this.time(this.count - 1) : 0; }
  /** Frames around time t: { a, b, k } logical indices and the blend 0..1 (clamped to the recorded range). */
  at(t) {
    const n = this.count;
    if (!n) return null;
    if (t <= this.time(0)) return { a: 0, b: 0, k: 0 };
    if (t >= this.time(n - 1)) return { a: n - 1, b: n - 1, k: 0 };
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.time(m) <= t) lo = m; else hi = m; }
    const ta = this.time(lo), tb = this.time(hi);
    return { a: lo, b: hi, k: tb > ta ? (t - ta) / (tb - ta) : 0 };
  }
}

/**
 * The stretch of the recording a replay plays: around `moment` ({ t, before, after }) if it is recent, else
 * the last C.fallback s; never across a cut (a teleport: respawn, retry, drop zone). ring: { t0, t1 }.
 * → { a, b } or null when too short.
 */
export function clipRange(ring, cuts, moment, now, C = THRILL.replay) {
  let a, b, T;
  if (moment && now - moment.t < C.window && moment.t >= ring.t0) { T = moment.t; a = T - moment.before; b = T + moment.after; }
  else { T = ring.t1; b = ring.t1; a = b - C.fallback; }
  for (const c of cuts) { if (c <= T) a = Math.max(a, c); else b = Math.min(b, c); }
  a = Math.max(a, ring.t0); b = Math.min(b, ring.t1);
  return b - a >= C.minClip ? { a, b } : null;
}

// ------------------------------------------------------------------ versus codes
const b64url = {
  enc(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  dec(str) {
    const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
  },
};
function pushVar(out, v) {   // zigzag varint
  let z = v < 0 ? -v * 2 - 1 : v * 2;
  while (z >= 128) { out.push((z % 128) | 128); z = Math.floor(z / 128); }
  out.push(z);
}
function readVar(bytes, pos) {
  let z = 0, mul = 1, b;
  do {
    if (pos.i >= bytes.length) throw new Error('truncated');
    b = bytes[pos.i++]; z += (b & 127) * mul; mul *= 128;
  } while (b & 128 && mul < 2 ** 49);
  return z % 2 ? -(z + 1) / 2 : z / 2;
}

export const VERSUS = { version: 1, ghostStep: 0.3, maxGhost: 1200, maxName: 24 };

/**
 * A shareable "beat my run" code: map, trail, name, time (s), score, medal, and the run's ghost
 * (ghost frames as recorded by activities.js: [t, x, y, z, heading, …] at 10 Hz) down-sampled to
 * VERSUS.ghostStep and delta-packed (dm, centi-rad). A 90 s run is about 2 KB.
 */
export function encodeVersus({ map, trail = null, name = 'Rider', time, score = 0, medal = null, ghost = null }) {
  const head = { v: VERSUS.version, m: String(map), tr: trail, n: String(name || 'Rider').slice(0, VERSUS.maxName), t: Math.round(time * 1000), s: Math.round(score) || 0, md: medal || null };
  const headB = b64url.enc(new TextEncoder().encode(JSON.stringify(head)));
  if (!Array.isArray(ghost) || ghost.length < 10) return headB;
  const bytes = [];
  let lt = 0, lx = 0, ly = 0, lz = 0, lh = 0, next = 0, n = 0;
  for (let i = 0; i + 4 < ghost.length && n < VERSUS.maxGhost; i += 5) {
    const t = ghost[i];
    if (t + 1e-6 < next && i + 5 < ghost.length) continue;
    next = t + VERSUS.ghostStep;
    const q = [Math.round(t * 10), Math.round(ghost[i + 1] * 10), Math.round(ghost[i + 2] * 10), Math.round(ghost[i + 3] * 10), Math.round(ghost[i + 4] * 100)];
    pushVar(bytes, q[0] - lt); pushVar(bytes, q[1] - lx); pushVar(bytes, q[2] - ly); pushVar(bytes, q[3] - lz); pushVar(bytes, q[4] - lh);
    [lt, lx, ly, lz, lh] = q;
    n++;
  }
  return `${headB}.${b64url.enc(Uint8Array.from(bytes))}`;
}

/** Inverse of encodeVersus: { map, trail, name, time, score, medal, ghost: [t, x, y, z, h, …] | null }, or null if it isn't a code. */
export function decodeVersus(code) {
  try {
    if (typeof code !== 'string') return null;
    const [h, g] = code.trim().split('.');
    const head = JSON.parse(new TextDecoder().decode(b64url.dec(h)));
    if (!head || head.v !== VERSUS.version || typeof head.m !== 'string' || !Number.isFinite(head.t) || head.t <= 0) return null;
    let ghost = null;
    if (g) {
      const bytes = b64url.dec(g), pos = { i: 0 };
      ghost = [];
      let t = 0, x = 0, y = 0, z = 0, hh = 0;
      while (pos.i < bytes.length && ghost.length < VERSUS.maxGhost * 5) {
        t += readVar(bytes, pos); x += readVar(bytes, pos); y += readVar(bytes, pos); z += readVar(bytes, pos); hh += readVar(bytes, pos);
        ghost.push(t / 10, x / 10, y / 10, z / 10, hh / 100);
      }
      if (ghost.length < 10) ghost = null;
    }
    return { map: head.m, trail: head.tr ?? null, name: String(head.n || 'Rider').slice(0, VERSUS.maxName), time: head.t / 1000, score: Number(head.s) || 0, medal: ['gold', 'silver', 'bronze'].includes(head.md) ? head.md : null, ghost };
  } catch { return null; }
}

/**
 * The next medal up from a Challenge time: { medal, gap (s), close } or null for gold. targets: { gold, silver,
 * bronze } times (s). close = within C.closeS s or C.closeShare of the target (the near miss worth shouting).
 */
export function nextMedalGap(time, targets, C = THRILL.medal) {
  if (!targets || !Number.isFinite(time)) return null;
  const order = ['bronze', 'silver', 'gold'];
  let next = null;
  for (const m of order) if (Number.isFinite(targets[m]) && time > targets[m]) { next = m; break; }
  if (!next) return null;
  const gap = time - targets[next];
  return { medal: next, gap, close: gap <= Math.max(C.closeS, targets[next] * C.closeShare) };
}

/** "1.23 s" style margin between two times. */
export function marginText(a, b) { return `${Math.abs(a - b).toFixed(2)} s`; }
