// Save your best tricks (docs/game-feel.md § 8g): after a landed trick a "◆ SAVE CLIP · F" pill shows for a
// few seconds; F (gamepad LB, left index finger) saves that trick to the lobby's Highlights, and it joins
// the loading-screen rotation (loading/index.js). The key keeps working for the last trick until the next
// one lands, so there is no rush.
//
// Cost while riding: nothing per frame. The instant-replay recorder (replay.js) already keeps every rig
// node's transform for the last 10 s. When a trick lands, its stretch of the ring (2.4 s before the
// take-off to 2 s after the touchdown) is copied once into a spare buffer (a memcpy, ~0.3 ms), so the
// trick can still be saved after the ring has moved on. Only a save does real work: resample to 30 Hz,
// sample the snow around the line (in slices across frames), quantise + gzip (thrill/clipcodec.js), and
// write to IndexedDB (thrill/clipstore.js) — spread over ~10 frames, measured in highlights.stats.
import { on, emit, game, Mode } from '../state.js';
import { CLIP_VERSION } from './clipcodec.js';
import { buildClip } from './clipbuild.js';
import { syncIndex, HIGHLIGHTS } from './clipstore.js';
import { pillRow } from './replay.js';
import { outfitSlotsFromProfile } from '../character/profile.js';
import { getMap, getTrail } from '../maps/registry.js';

export const CLIPS = {
  before: 2.4,          // s of in-run before the take-off
  after: 2.0,           // s of ride-out after the touchdown
  minAir: 0.5,          // s of air for a landing to be saveable (or any named trick)
  prompt: 4.5,          // s the SAVE CLIP pill shows
  patchMargin: 26,      // m of snow kept around the line
  patchStep: 0.75,      // m between height samples …
  patchMax: 40000,      // … at most this many samples (the step grows for very long lines)
  samplesPerSlice: 1500, // getHeight calls per frame (~1–2 ms)
};
const PAD_LB = 4;

export function installHighlights({ player, rider, terrain, input, activities, replay, getMap: getSel, getName }) {
  const ui = typeof document !== 'undefined' ? mountUi() : null;
  let pending = null;     // a landed trick waiting for its ride-out to be recorded
  let cand = null;        // the last trick, copied out of the ring: { times, data, count, stride, keys, info, saved }
  let buf = null;         // the copy-out buffer (sized like the ring)
  let noWorker = false;
  let saving = null;
  let takeoffAt = null;
  const stats = { copies: 0, copyMs: 0, saves: 0, lastSave: null };

  const rec = () => replay?.recorder?.();
  const clock = () => rec()?.recClock ?? 0;

  on('rideStarted', () => { pending = null; cand = null; takeoffAt = null; ui?.prompt(false); });
  on('takeoff', () => { if (pending) finalize(); takeoffAt = clock(); });
  on('crashed', () => { if (pending) finalize(); takeoffAt = null; });
  on('respawned', () => { if (pending) finalize(); });
  on('landed', (e) => {
    if (game.mode !== Mode.RIDING || !e.clean || e.result === 'crash' || takeoffAt == null) return;
    if (!(e.air >= CLIPS.minAir || (e.trick && e.air > 0.3))) return;
    if (pending) finalize();
    const label = e.trick || `Air ${e.air.toFixed(1)}s`;
    pending = {
      takeoff: takeoffAt, land: clock(),
      info: { trick: e.perfect ? `Perfect ${label}` : label, points: e.points || 0, air: e.air, drop: e.drop || 0, grade: e.grade || null, switch: !!e.switch, perfect: !!e.perfect },
      want: false,
    };
    takeoffAt = null;
    ui?.prompt(true, pending.info.trick);
  });

  /** Copy the trick's stretch of the ring into a candidate buffer (once per trick). */
  function finalize() {
    const p = pending;
    pending = null;
    const R = rec();
    if (!p || !R?.ring?.count) return;
    const t0w = performance.now();
    const ring = R.ring;
    let a = Math.max(ring.t0, p.takeoff - CLIPS.before), b = Math.min(ring.t1, p.land + CLIPS.after);
    for (const c of R.cuts) { if (c <= p.takeoff) a = Math.max(a, c); else b = Math.min(b, c); }   // never across a teleport
    if (b - a < 1) return;
    const fa = ring.at(a), fb = ring.at(b);
    const j0 = fa.a, j1 = fb.b, count = j1 - j0 + 1;
    const stride = ring.stride;
    // One reusable buffer: the next trick replaces this one anyway, and a save copies it out synchronously
    // before its first await.
    if (!buf || buf.data.length < ring.cap * stride) buf = { data: new Float32Array(ring.cap * stride), times: new Float64Array(ring.cap) };
    // Copy logical frames j0..j1: one or two contiguous runs of the ring.
    for (let j = j0; j <= j1;) {
      const s = ring.slot(j);
      const run = Math.min(j1 - j + 1, ring.cap - s);
      buf.data.set(ring.data.subarray(s * stride, (s + run) * stride), (j - j0) * stride);
      buf.times.set(ring.times.subarray(s, s + run), j - j0);
      j += run;
    }
    cand = { data: buf.data, times: buf.times, count, stride, ns: R.stride, keys: R.keys.slice(), nodes: R.keys.length, a, b, takeoff: p.takeoff, land: p.land, info: p.info, saved: false,
      ctx: snapshotContext() };
    stats.copies++; stats.copyMs = +(performance.now() - t0w).toFixed(3);
    if (p.want) save();
  }

  /** What the clip needs to be rebuilt elsewhere: mountain, gear, outfit, rider name. */
  function snapshotContext() {
    const sel = getSel?.() || {};
    const map = getMap(sel.mapId);
    const trail = map && sel.trailId ? getTrail(map, sel.trailId) : null;
    let outfit = {};
    try { outfit = outfitSlotsFromProfile(); } catch { /* defaults */ }
    const eq = player.equipment || {};
    return {
      mapId: sel.mapId || 'unknown', mountain: map?.mountain?.name || map?.name || 'Sendit', region: map?.mountain?.region || '', accent: map?.mountain?.accent || '',
      trailId: sel.trailId || null, trail: trail?.name || '',
      gear: eq.type === 'snowboard' ? 'snowboard' : 'ski', gearModel: eq.variant || null, stance: player.stance || 'regular',
      outfit, fp: !!rider.fp, mode: activities?.mode || 'zen', rider: getName?.() || null,
    };
  }

  /** The snow under and around the line (root positions of the raw frames), sampled from the real terrain in slices. */
  async function samplePatch(c) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < c.count; i++) { const x = c.data[i * c.stride], z = c.data[i * c.stride + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const M = CLIPS.patchMargin;
    x0 -= M; x1 += M; z0 -= M; z1 += M;
    let step = CLIPS.patchStep;
    while (((x1 - x0) / step + 1) * ((z1 - z0) / step + 1) > CLIPS.patchMax) step *= 1.15;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const h = new Float32Array(nx * nz);
    let k = 0;
    let maxSlice = 0;
    while (k < h.length) {
      const ts = performance.now(), end = Math.min(h.length, k + CLIPS.samplesPerSlice);
      for (; k < end; k++) { const i = k % nx, j = (k / nx) | 0; h[k] = terrain.getHeight(x0 + i * step, z0 + j * step); }
      maxSlice = Math.max(maxSlice, performance.now() - ts);
      if (k < h.length) await nextFrame();
    }
    stats.patchSliceMaxMs = +maxSlice.toFixed(2);
    // Trees and rocks near the line (the real ones, so the replay rides past the same trunks).
    const trees = [], seen = new Set(), sc = player.scatter;
    if (sc?.obstaclesNear) {
      for (let i = 0; i < c.count; i += 12) {
        for (const o of sc.obstaclesNear({ x: c.data[i * c.stride], z: c.data[i * c.stride + 2] }, M)) {
          const key = `${o[0].toFixed(2)},${o[1].toFixed(2)}`;
          if (seen.has(key) || o[0] < x0 || o[0] > x1 || o[1] < z0 || o[1] > z1) continue;
          seen.add(key);
          trees.push([o[0], o[1], o[2], o[3]]);
        }
      }
    }
    return { patch: { x0, z0, step, nx, nz, h }, trees };
  }

  /** Resample + quantise + gzip + IndexedDB: in a worker (thrill/clipworker.js), or here if workers are out. */
  function build(job) {
    if (typeof Worker !== 'undefined' && !noWorker) {
      return new Promise((res, rej) => {
        let w;
        try { w = new Worker(new URL('./clipworker.js', import.meta.url), { type: 'module', name: 'sendit-clipsave' }); } catch (e) { noWorker = true; build(job).then(res, rej); return; }
        const t = setTimeout(() => { w.terminate(); rej(new Error('save timeout')); }, 30000);
        w.onmessage = (e) => { clearTimeout(t); w.terminate(); if (e.data.ok) res(e.data); else rej(Object.assign(new Error(e.data.message), { code: e.data.code })); };
        // The buffers went to the worker (transferred): a broken worker means this save is lost; the next
        // one runs on the main thread.
        w.onerror = (e) => { e.preventDefault?.(); clearTimeout(t); w.terminate(); noWorker = true; rej(new Error(e.message || 'save worker failed')); };
        w.postMessage(job, [job.raw.data.buffer, job.raw.times.buffer, job.patch.h.buffer]);
      });
    }
    return buildClip(job);
  }

  async function save() {
    if (!cand) {
      if (pending) { pending.want = true; ui?.prompt(true, pending.info.trick, 'wait'); return; }   // still recording the ride-out
      emit('hint', 'Land a trick first, then press F to save it to your Highlights');
      return;
    }
    if (cand.saved) { ui?.toast('Already in your Highlights', cand.info.trick, 'dim'); return; }
    if (saving) return;
    const c = cand;
    c.saved = true;
    saving = { cand: c };
    ui?.prompt(true, c.info.trick, 'saving');
    const T = { start: performance.now() };
    try {
      // Own copy first (synchronously): the shared candidate buffer is reused by the next landed trick,
      // which can land while the terrain is being sampled below.
      const raw = { data: c.data.slice(0, c.count * c.stride), times: c.times.slice(0, c.count), count: c.count, stride: c.stride, ns: c.ns, nodes: c.nodes };
      T.copy = performance.now() - T.start;
      const t1 = performance.now();
      const { patch, trees } = await samplePatch(raw);
      T.patch = performance.now() - t1;
      const t0 = raw.times[0];
      const meta = { v: CLIP_VERSION, ...c.ctx, ...c.info, takeoff: Math.max(0, c.takeoff - t0), land: Math.max(0, c.land - t0), date: Date.now() };
      T.worstFrame = Math.max(stats.patchSliceMaxMs || 0, T.copy);   // the most save work in any one frame (main thread)
      const res = await build({ raw, keys: c.keys, meta, patch, trees });
      T.build = res.ms;
      await syncIndex().catch(() => {});   // the loading screens' localStorage mirror (workers have no localStorage)
      T.total = performance.now() - T.start;
      stats.saves++;
      stats.lastSave = { id: res.id, bytes: res.bytes, frames: res.frames, nodes: c.nodes, patch: `${patch.nx}x${patch.nz}`, trees: trees.length, ms: Object.fromEntries(Object.entries(T).filter(([k]) => k !== 'start').map(([k, v]) => [k, typeof v === 'number' ? +v.toFixed(1) : v])) };
      ui?.prompt(true, c.info.trick, 'saved');
      ui?.toast('Highlight saved', `${c.info.trick}${c.info.points ? ` · ${c.info.points.toLocaleString()} pts` : ''} · ${c.ctx.mountain}`, '', res.dropped.length ? 'Oldest highlight replaced · Lobby › Highlights' : 'Lobby › Highlights · plays on your loading screens');
      emit('highlightSaved', { id: res.id, trick: c.info.trick, points: c.info.points, mapId: c.ctx.mapId, bytes: res.bytes });
    } catch (e) {
      c.saved = false;
      console.warn('[highlights] save failed', e);
      ui?.prompt(false);
      ui?.toast('Couldn\'t save the clip', e?.code === 'full' ? 'Highlights are full of favourites: unstar one in the lobby' : 'This browser blocks saving (private mode?)', 'bad');
    } finally {
      saving = null;
    }
  }

  return {
    stats,
    /** For tests. */
    debug: () => ({ pending: pending && { ...pending.info }, cand: cand && { trick: cand.info.trick, saved: cand.saved, frames: cand.count, len: cand.b - cand.a }, saving: !!saving }),
    save,
    /** Tests (scripts/clips-perf.mjs): allow saving the same trick again (storage cap, memory). */
    _resaveForTest() { if (cand) cand.saved = false; },
    /** Every frame while riding (also during an instant replay): the save key, and the ride-out timer. */
    input() {
      if (game.mode !== Mode.RIDING) return;
      if (pending && clock() - pending.land >= CLIPS.after) finalize();
      if (input.codePressed('KeyF') || input.btnPressed(PAD_LB)) save();
    },
  };
}

const nextFrame = () => new Promise((res) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => res()) : setTimeout(res, 16)));

function mountUi() {
  const st = document.createElement('style');
  st.textContent = `
  #thrill-save{opacity:0;transform:translateY(10px);transition:opacity .25s,transform .25s;white-space:nowrap;display:flex;align-items:center;gap:8px;
    background:rgba(10,18,26,.86);border:1px solid rgba(242,244,241,.3);border-radius:2px;box-shadow:inset 3px 0 0 #ff5a1f;padding:7px 12px 7px 14px;
    font:700 12px/1 Archivo,Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#f2f4f1}
  #thrill-save:not(.on){position:absolute;visibility:hidden}
  #thrill-save.on{opacity:1;transform:none}
  #thrill-save .ic{width:9px;height:9px;background:#ff5a1f;transform:rotate(45deg)}
  #thrill-save kbd{font:600 11px/1 "IBM Plex Mono",ui-monospace,monospace;background:#f2f4f1;color:#0f1a24;border-radius:2px;padding:3px 6px}
  #thrill-save.saving .ic{animation:thrillSaveSpin .6s linear infinite}
  #thrill-save.saved{box-shadow:inset 3px 0 0 #2f9d5c}#thrill-save.saved .ic{background:#2f9d5c}
  #thrill-save.saved kbd,#thrill-save.saving kbd,#thrill-save.wait kbd{display:none}
  body.pad #thrill-save .k{display:none}body:not(.pad) #thrill-save .p{display:none}
  #thrill-toast{position:fixed;top:86px;right:22px;z-index:7;pointer-events:none;min-width:250px;max-width:360px;opacity:0;transform:translateX(16px);transition:opacity .3s,transform .3s;
    background:rgba(10,18,26,.92);border:1px solid rgba(242,244,241,.14);border-radius:2px;box-shadow:inset 3px 0 0 #ff5a1f,0 6px 24px rgba(0,0,0,.35);padding:11px 14px 11px 16px;color:#f2f4f1;font-family:Archivo,Helvetica,Arial,sans-serif}
  #thrill-toast.on{opacity:1;transform:none}
  #thrill-toast.bad{box-shadow:inset 3px 0 0 #e5382b,0 6px 24px rgba(0,0,0,.35)}#thrill-toast.dim{box-shadow:inset 3px 0 0 #8a97a4,0 6px 24px rgba(0,0,0,.35)}
  #thrill-toast small{display:block;font:600 10px/1.2 Archivo,Helvetica,Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#ff7a45}
  #thrill-toast.bad small{color:#e5382b}#thrill-toast.dim small{color:#8a97a4}
  #thrill-toast b{display:block;margin-top:4px;font:800 18px/1.1 Archivo,Helvetica,Arial,sans-serif;font-stretch:75%;text-transform:uppercase;letter-spacing:.01em}
  #thrill-toast span{display:block;margin-top:6px;font:500 11px/1.3 "IBM Plex Mono",ui-monospace,monospace;color:#b3bfca}
  body.thrill-replay #thrill-save{visibility:hidden}
  @keyframes thrillSaveSpin{to{transform:rotate(405deg)}}`;
  document.head.appendChild(st);
  const pill = document.createElement('div');
  pill.id = 'thrill-save';
  pill.innerHTML = '<i class="ic"></i><span class="t">Save clip</span><kbd class="k">F</kbd><kbd class="p">LB</kbd>';
  pillRow().appendChild(pill);
  const toast = document.createElement('div');
  toast.id = 'thrill-toast';
  toast.setAttribute('role', 'status');
  document.body.appendChild(toast);
  const txt = pill.querySelector('.t');
  let pT = 0, tT = 0;
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  return {
    prompt(v, trick = '', state = '') {
      clearTimeout(pT);
      pill.className = v ? `on ${state}` : '';
      if (!v) return;
      txt.textContent = state === 'saved' ? 'Saved to highlights' : state === 'saving' || state === 'wait' ? 'Saving…' : 'Save clip';
      pT = setTimeout(() => { pill.className = ''; }, (state === 'saved' ? 2.2 : state ? 8 : CLIPS.prompt) * 1000);
    },
    toast(title, line, tone = '', foot = '') {
      clearTimeout(tT);
      toast.className = `on ${tone}`;
      toast.innerHTML = `<small>${esc(title)}</small><b>${esc(line)}</b>${foot ? `<span>${esc(foot)}</span>` : ''}`;
      tT = setTimeout(() => { toast.className = tone; }, 4200);
    },
  };
}

export { HIGHLIGHTS };
