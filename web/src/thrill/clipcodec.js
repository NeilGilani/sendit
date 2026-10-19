// Saved highlight clips (docs/game-feel.md § 8g): the binary format. Pure code (no DOM, no three.js), shared
// by the game (thrill/highlights.js encodes on save), the loading-screen worker and the lobby (decode).
//
// A clip is the instant-replay recorder's data for one trick, resampled to a fixed rate, not video:
//   meta     JSON: version, trick, score, air, map / mountain / trail, gear + model + stance, outfit, date …
//   keys     one path key per rig node ("Rider/Scene/Armature/root/pelvis…"), so a rig built later (in the
//            loading worker, with the same outfit and gear) can be matched node by node even if the rig
//            gained or lost a node since
//   frames   per frame and node: local position (3), rotation quaternion (4), scale (3)
//   air      one bit per frame (airborne)
//   patch    the real mountain's snow heights around the line (a grid), so the trick can be replayed on
//            the same take-off and landing anywhere (the loading scene builds its slope from it)
//   trees    trees and rocks near the line: [x, z, radius, kind]
//
// Compression: every channel (one float of one node over the clip) is either constant (stored once, f32)
// or quantised to 16 bits over its own range [min, max] (positions over 100 m → 1.5 mm, quaternions →
// 3e-5), delta-coded along time and split into high / low byte planes; then the whole payload is gzipped
// (CompressionStream) when available. A 5.5 s clip of the 93-node rig is ~25–45 KB.
//
// Container: "SCL1" + u8 flags (1 = gzip) + payload. Payload: u32 header length, header JSON, binary body.
export const CLIP_VERSION = 1;
export const CLIP_FPS = 30;
export const NODE_STRIDE = 10;           // pos 3, quat 4, scale 3
const MAGIC = [83, 67, 76, 49];           // "SCL1"
const EPS = 2e-6;
export const TREE_KINDS = ['tree', 'rock', 'fence', 'other'];

const te = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
const td = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;

class Writer {
  constructor(n = 1 << 16) { this.buf = new Uint8Array(n); this.dv = new DataView(this.buf.buffer); this.o = 0; }
  need(k) {
    if (this.o + k <= this.buf.length) return;
    let n = this.buf.length * 2;
    while (n < this.o + k) n *= 2;
    const b = new Uint8Array(n); b.set(this.buf.subarray(0, this.o));
    this.buf = b; this.dv = new DataView(b.buffer);
  }
  u8(v) { this.need(1); this.buf[this.o++] = v; }
  u16(v) { this.need(2); this.dv.setUint16(this.o, v, true); this.o += 2; }
  u32(v) { this.need(4); this.dv.setUint32(this.o, v, true); this.o += 4; }
  f32(v) { this.need(4); this.dv.setFloat32(this.o, v, true); this.o += 4; }
  bytes(b) { this.need(b.length); this.buf.set(b, this.o); this.o += b.length; }
  done() { return this.buf.slice(0, this.o); }
}

class Reader {
  constructor(bytes) { this.b = bytes; this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.o = 0; }
  check(k) { if (this.o + k > this.b.length) throw new Error('clip: truncated'); }
  u8() { this.check(1); return this.b[this.o++]; }
  u16() { this.check(2); const v = this.dv.getUint16(this.o, true); this.o += 2; return v; }
  u32() { this.check(4); const v = this.dv.getUint32(this.o, true); this.o += 4; return v; }
  f32() { this.check(4); const v = this.dv.getFloat32(this.o, true); this.o += 4; return v; }
  bytes(k) { this.check(k); const v = this.b.subarray(this.o, this.o + k); this.o += k; return v; }
}

/** Quantise one channel (n samples at src[off + i*stride]) to u16 deltas in hi/lo planes. */
function writeChannel(w, src, off, stride, n) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < n; i++) { const v = src[off + i * stride]; if (v < mn) mn = v; if (v > mx) mx = v; }
  if (!(mx - mn > EPS) || !Number.isFinite(mn) || !Number.isFinite(mx)) {
    w.u8(0); w.f32(Number.isFinite(mn) ? (mn + mx) / 2 : 0); return;
  }
  w.u8(1); w.f32(mn); w.f32(mx);
  const s = 65535 / (mx - mn);
  const hi = new Uint8Array(n), lo = new Uint8Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const q = Math.max(0, Math.min(65535, Math.round((src[off + i * stride] - mn) * s)));
    const d = (q - prev) & 0xffff;
    prev = q;
    hi[i] = d >> 8; lo[i] = d & 255;
  }
  w.bytes(hi); w.bytes(lo);
}

function readChannel(r, dst, off, stride, n) {
  const flag = r.u8();
  if (flag === 0) { const v = r.f32(); for (let i = 0; i < n; i++) dst[off + i * stride] = v; return; }
  if (flag !== 1) throw new Error('clip: bad channel');
  const mn = r.f32(), mx = r.f32();
  const hi = r.bytes(n), lo = r.bytes(n);
  const s = (mx - mn) / 65535;
  let q = 0;
  for (let i = 0; i < n; i++) { q = (q + ((hi[i] << 8) | lo[i])) & 0xffff; dst[off + i * stride] = mn + q * s; }
}

/**
 * Keep consecutive quaternions in one hemisphere (q and −q are the same rotation): smaller deltas, and the
 * per-channel ranges stay tight. In place. frames: n × (nodes × NODE_STRIDE).
 */
export function hemisphere(frames, n, nodes) {
  const S = nodes * NODE_STRIDE;
  for (let k = 0; k < nodes; k++) {
    const o = k * NODE_STRIDE + 3;
    for (let i = 1; i < n; i++) {
      const a = (i - 1) * S + o, b = i * S + o;
      if (frames[a] * frames[b] + frames[a + 1] * frames[b + 1] + frames[a + 2] * frames[b + 2] + frames[a + 3] * frames[b + 3] < 0) {
        frames[b] = -frames[b]; frames[b + 1] = -frames[b + 1]; frames[b + 2] = -frames[b + 2]; frames[b + 3] = -frames[b + 3];
      }
    }
  }
}

/**
 * clip: { meta, keys: string[], n, frames: Float32Array(n·keys·10), air: Uint8Array(n),
 *         patch?: { x0, z0, step, nx, nz, h: Float32Array(nx·nz) }, trees?: [[x, z, r, kind]] }
 * → Uint8Array (uncompressed payload; see packClip for the container).
 */
export function encodeClip(clip) {
  const { keys, n, frames, air } = clip;
  if (!Array.isArray(keys) || !keys.length || !(n >= 2) || frames.length < n * keys.length * NODE_STRIDE) throw new Error('clip: bad input');
  const patch = clip.patch && clip.patch.nx >= 2 && clip.patch.nz >= 2 ? clip.patch : null;
  const trees = (clip.trees || []).filter((t) => Array.isArray(t) && Number.isFinite(t[0]) && Number.isFinite(t[1])).slice(0, 4000);
  const header = {
    v: CLIP_VERSION, fps: clip.fps || CLIP_FPS, n, keys, meta: clip.meta || {},
    patch: patch ? { x0: patch.x0, z0: patch.z0, step: patch.step, nx: patch.nx, nz: patch.nz } : null, trees: trees.length,
  };
  const hb = te.encode(JSON.stringify(header));
  const w = new Writer(64 + hb.length + n * keys.length * 8);
  w.u32(hb.length); w.bytes(hb);
  const S = keys.length * NODE_STRIDE;
  for (let c = 0; c < S; c++) writeChannel(w, frames, c, S, n);
  const bits = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) if (air?.[i]) bits[i >> 3] |= 1 << (i & 7);
  w.bytes(bits);
  if (patch) writeChannel(w, patch.h, 0, 1, patch.nx * patch.nz);
  for (const t of trees) { w.f32(t[0]); w.f32(t[1]); w.f32(t[2] || 0.4); w.u8(Math.max(0, TREE_KINDS.indexOf(t[3]))); }
  return w.done();
}

/** Inverse of encodeClip. Throws on anything malformed (callers skip such clips). */
export function decodeClip(bytes) {
  const r = new Reader(bytes);
  const hl = r.u32();
  if (hl > bytes.length) throw new Error('clip: bad header');
  const header = JSON.parse(td.decode(r.bytes(hl)));
  if (!header || header.v !== CLIP_VERSION) throw new Error(`clip: unsupported version ${header?.v}`);
  const { n, keys } = header;
  if (!(n >= 2 && n < 100000) || !Array.isArray(keys) || !keys.length || keys.length > 4000) throw new Error('clip: bad sizes');
  const S = keys.length * NODE_STRIDE;
  const frames = new Float32Array(n * S);
  for (let c = 0; c < S; c++) readChannel(r, frames, c, S, n);
  const bits = r.bytes(Math.ceil(n / 8));
  const air = new Uint8Array(n);
  for (let i = 0; i < n; i++) air[i] = (bits[i >> 3] >> (i & 7)) & 1;
  let patch = null;
  if (header.patch) {
    const p = header.patch;
    if (!(p.nx >= 2 && p.nz >= 2 && p.nx * p.nz < 4e6 && p.step > 0)) throw new Error('clip: bad patch');
    const h = new Float32Array(p.nx * p.nz);
    readChannel(r, h, 0, 1, p.nx * p.nz);
    patch = { ...p, h };
  }
  const trees = [];
  for (let i = 0; i < (header.trees | 0); i++) trees.push([r.f32(), r.f32(), r.f32(), TREE_KINDS[r.u8()] || 'other']);
  return { meta: header.meta || {}, keys, n, fps: header.fps || CLIP_FPS, frames, air, patch, trees };
}

async function pipe(bytes, Stream) {
  const s = new Blob([bytes]).stream().pipeThrough(new Stream('gzip'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

/** Container with optional gzip. → Promise<Uint8Array>. */
export async function packClip(clip) {
  const raw = encodeClip(clip);
  let body = raw, flags = 0;
  if (typeof CompressionStream !== 'undefined') {
    try { body = await pipe(raw, CompressionStream); flags = 1; } catch { body = raw; flags = 0; }
  }
  const out = new Uint8Array(5 + body.length);
  out.set(MAGIC, 0); out[4] = flags; out.set(body, 5);
  return out;
}

/** Container → decoded clip. Rejects on a bad magic, version or payload. */
export async function unpackClip(bytes) {
  if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
  if (!(bytes instanceof Uint8Array) || bytes.length < 9) throw new Error('clip: empty');
  for (let i = 0; i < 4; i++) if (bytes[i] !== MAGIC[i]) throw new Error('clip: not a clip');
  let body = bytes.subarray(5);
  if (bytes[4] & 1) {
    if (typeof DecompressionStream === 'undefined') throw new Error('clip: no gzip here');
    body = await pipe(body, DecompressionStream);
  }
  return decodeClip(body);
}

/**
 * One stable key per node under `root`, in traversal order: the path of names (or types, for unnamed
 * nodes) with an index among same-named siblings — "Rider/Group#1/Scene/Armature/root/pelvis". A rig
 * rebuilt elsewhere (the loading worker) with the same outfit and gear produces the same keys.
 */
export function nodeKeys(root) {
  const out = [];
  const walk = (o, path) => {
    out.push(path);
    const seen = new Map();
    for (const c of o.children) {
      const nm = c.name || c.type;
      const i = seen.get(nm) || 0;
      seen.set(nm, i + 1);
      walk(c, `${path}/${nm}${i ? `#${i}` : ''}`);
    }
  };
  walk(root, root.name || root.type);
  return out;
}

// ------------------------------------------------------------------ sampling helpers (used by both sides)
/**
 * Resample timed frames to a fixed rate. getFrame(t, out) fills `out` (Float32Array of one frame's floats)
 * for time t (the caller interpolates its own recording). → Float32Array(n · stride), n.
 */
export function resample(t0, t1, fps, stride, getFrame) {
  const n = Math.max(2, Math.floor((t1 - t0) * fps + 1e-6) + 1);
  const out = new Float32Array(n * stride);
  const tmp = new Float32Array(stride);
  for (let i = 0; i < n; i++) { getFrame(t0 + i / fps, tmp); out.set(tmp, i * stride); }
  return { frames: out, n };
}

/**
 * The trick's airborne run: the one ending nearest `landHint` (frame index of the touchdown, optional),
 * else the longest. Runs of one or two frames inside a longer air (a flicker) are bridged.
 * → { takeoff, land (s from the clip start), i0, i1 (first grounded frame) } or null.
 */
export function airSpan(air, fps, landHint = null) {
  const a = Uint8Array.from(air);
  for (let i = 1; i < a.length - 2; i++) if (!a[i] && a[i - 1] && (a[i + 1] || a[i + 2])) a[i] = 1;   // bridge flickers
  let best = null, bestScore = Infinity;
  for (let i = 0; i < a.length;) {
    if (!a[i]) { i++; continue; }
    let j = i;
    while (j < a.length && a[j]) j++;
    const score = landHint != null ? Math.abs(j - landHint) - (j - i) * 1e-3 : -(j - i);
    if (score < bestScore) { bestScore = score; best = { i0: i, i1: j }; }
    i = j;
  }
  if (!best) return null;
  return { takeoff: best.i0 / fps, land: best.i1 / fps, i0: best.i0, i1: best.i1 };
}

/** Bilinear height from a patch (clamped to its edges). */
export function patchHeight(p, x, z) {
  const fx = Math.min(p.nx - 1.001, Math.max(0, (x - p.x0) / p.step)), fz = Math.min(p.nz - 1.001, Math.max(0, (z - p.z0) / p.step));
  const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * p.nx + i, h = p.h;
  return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + p.nx] * (1 - tx) + h[k + p.nx + 1] * tx) * tz;
}
