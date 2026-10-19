// Saving a highlight, the heavy half (thrill/highlights.js does the cheap half on the main thread: the ring
// copy and the terrain samples). Runs in thrill/clipworker.js, or on the main thread if workers are out:
// resample the raw recorder frames to CLIP_FPS (slerped rotations), pack (clipcodec.js) and store
// (clipstore.js). job = { raw: { data, times, count, stride, ns, nodes }, keys, meta, patch, trees }.
import { CLIP_FPS, NODE_STRIDE, hemisphere, packClip } from './clipcodec.js';
import { addClip } from './clipstore.js';

/** Raw recorder frames (ns floats per node: pos, quat, scale, visible; then rider extras: x, y, z, air). */
export function resampleRaw(c, fps = CLIP_FPS) {
  const S = c.nodes * NODE_STRIDE, RS = c.stride, NS = c.ns, D = c.data;
  const t0 = c.times[0], t1 = c.times[c.count - 1];
  const n = Math.max(2, Math.floor((t1 - t0) * fps) + 1);
  const frames = new Float32Array(n * S), air = new Uint8Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + i / fps;
    while (j < c.count - 2 && c.times[j + 1] <= t) j++;
    const ta = c.times[j], tb = c.times[Math.min(j + 1, c.count - 1)];
    const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
    const A = j * RS, B = Math.min(j + 1, c.count - 1) * RS, O = i * S;
    for (let nd = 0; nd < c.nodes; nd++) {
      const a = A + nd * NS, b = B + nd * NS, o = O + nd * NODE_STRIDE;
      for (let q = 0; q < 3; q++) frames[o + q] = D[a + q] + (D[b + q] - D[a + q]) * k;
      slerp(D, a + 3, b + 3, k, frames, o + 3);
      for (let q = 7; q < 10; q++) frames[o + q] = D[a + q] + (D[b + q] - D[a + q]) * k;
    }
    air[i] = D[(k < 0.5 ? A : B) + c.nodes * NS + 3] > 0.5 ? 1 : 0;
  }
  hemisphere(frames, n, c.nodes);
  return { frames, air, n };
}

/** Slerp between quaternions at D[a..a+3] and D[b..b+3] into out[o..o+3] (shortest path). */
export function slerp(D, a, b, t, out, o) {
  const ax = D[a], ay = D[a + 1], az = D[a + 2], aw = D[a + 3];
  let bx = D[b], by = D[b + 1], bz = D[b + 2], bw = D[b + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
  let ka = 1 - t, kb = t;
  if (cos < 0.9995) { const th = Math.acos(Math.min(1, cos)), s = Math.sin(th); ka = Math.sin((1 - t) * th) / s; kb = Math.sin(t * th) / s; }
  const x = ax * ka + bx * kb, y = ay * ka + by * kb, z = az * ka + bz * kb, w = aw * ka + bw * kb;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
}

/** → { ok, id, bytes, dropped, frames, ms: { resample, pack, store } } (rejects on a storage error). */
export async function buildClip(job) {
  const T0 = performance.now();
  const r = resampleRaw(job.raw);
  const t1 = performance.now();
  const meta = { ...job.meta, length: (r.n - 1) / CLIP_FPS };
  const bytes = await packClip({ meta, keys: job.keys, n: r.n, fps: CLIP_FPS, frames: r.frames, air: r.air, patch: job.patch, trees: job.trees });
  const t2 = performance.now();
  const res = await addClip(meta, bytes);
  const t3 = performance.now();
  return { ok: true, id: res.id, at: res.at, bytes: bytes.byteLength, dropped: res.dropped, frames: r.n, ms: { resample: +(t1 - T0).toFixed(1), pack: +(t2 - t1).toFixed(1), store: +(t3 - t2).toFixed(1) } };
}
