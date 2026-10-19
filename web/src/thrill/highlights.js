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
import { packClip, CLIP_FPS, CLIP_VERSION, NODE_STRIDE, hemisphere } from './clipcodec.js';
import { addClip, HIGHLIGHTS } from './clipstore.js';
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
  samplesPerSlice: 3500,
};
const PAD_LB = 4;

export function installHighlights({ player, rider, terrain, input, activities, replay, getMap: getSel, getName }) {
  const ui = typeof document !== 'undefined' ? mountUi() : null;
  let pending = null;     // a landed trick waiting for its ride-out to be recorded
  let cand = null;        // the last trick, copied out of the ring: { times, data, count, stride, keys, info, saved }
  let buf = null;         // the copy-out buffer (sized like the ring)
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
    // One reusable buffer: the next trick replaces this one anyway, and a save resamples it synchronously
    // before its first await, so nothing else reads it later.
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

  /** Resample the candidate to CLIP_FPS: per node pos / quat (slerp) / scale, plus the air flags. */
  function resampleCand(c) {
    const fps = CLIP_FPS, S = c.nodes * NODE_STRIDE, RS = c.stride, NS = c.ns;
    const t0 = c.times[0], t1 = c.times[c.count - 1];
    const n = Math.max(2, Math.floor((t1 - t0) * fps) + 1);
    const frames = new Float32Array(n * S), air = new Uint8Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const t = t0 + i / fps;
      while (j < c.count - 2 && c.times[j + 1] <= t) j++;
      const ta = c.times[j], tb = c.times[j + 1] ?? ta;
      const k = tb > ta ? Math.min(1, Math.max(0, (t - ta) / (tb - ta))) : 0;
      const A = j * RS, B = Math.min(j + 1, c.count - 1) * RS, O = i * S;
      for (let nd = 0; nd < c.nodes; nd++) {
        const a = A + nd * NS, b = B + nd * NS, o = O + nd * NODE_STRIDE;
        const D = c.data;
        for (let q = 0; q < 3; q++) frames[o + q] = D[a + q] + (D[b + q] - D[a + q]) * k;
        slerp(D, a + 3, b + 3, k, frames, o + 3);
        for (let q = 7; q < 10; q++) frames[o + q] = D[a + q] + (D[b + q] - D[a + q]) * k;
      }
      air[i] = c.data[(k < 0.5 ? A : B) + c.nodes * NS + 3] > 0.5 ? 1 : 0;
    }
    hemisphere(frames, n, c.nodes);
    return { frames, air, n, t0 };
  }

  /** The snow under and around the line, sampled from the real terrain in slices (yields between). */
  async function samplePatch(frames, n, nodes) {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const S = nodes * NODE_STRIDE;
    for (let i = 0; i < n; i++) { const x = frames[i * S], z = frames[i * S + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    const M = CLIPS.patchMargin;
    x0 -= M; x1 += M; z0 -= M; z1 += M;
    let step = CLIPS.patchStep;
    while (((x1 - x0) / step + 1) * ((z1 - z0) / step + 1) > CLIPS.patchMax) step *= 1.15;
    const nx = Math.ceil((x1 - x0) / step) + 1, nz = Math.ceil((z1 - z0) / step) + 1;
    const h = new Float32Array(nx * nz);
    let k = 0;
    while (k < h.length) {
      const end = Math.min(h.length, k + CLIPS.samplesPerSlice);
      for (; k < end; k++) { const i = k % nx, j = (k / nx) | 0; h[k] = terrain.getHeight(x0 + i * step, z0 + j * step); }
      if (k < h.length) await nextFrame();
    }
    // Trees and rocks near the line (the real ones, so the replay rides past the same trunks).
    const trees = [], seen = new Set(), sc = player.scatter;
    if (sc?.obstaclesNear) {
      for (let i = 0; i < n; i += 6) {
        for (const o of sc.obstaclesNear({ x: frames[i * S], z: frames[i * S + 2] }, M)) {
          const key = `${o[0].toFixed(2)},${o[1].toFixed(2)}`;
          if (seen.has(key) || o[0] < x0 || o[0] > x1 || o[1] < z0 || o[1] > z1) continue;
          seen.add(key);
          trees.push([o[0], o[1], o[2], o[3]]);
        }
      }
    }
    return { patch: { x0, z0, step, nx, nz, h }, trees };
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
      const r = resampleCand(c);
      T.resample = performance.now() - T.start;
      await nextFrame();
      const t1 = performance.now();
      const { patch, trees } = await samplePatch(r.frames, r.n, c.nodes);
      T.patch = performance.now() - t1;
      const fps = CLIP_FPS;
      const meta = {
        v: CLIP_VERSION, ...c.ctx, ...c.info,
        takeoff: Math.max(0, c.takeoff - r.t0), land: Math.max(0, c.land - r.t0), length: (r.n - 1) / fps,
        date: Date.now(), rider: c.ctx.rider,
      };
      const t2 = performance.now();
      const bytes = await packClip({ meta, keys: c.keys, n: r.n, fps, frames: r.frames, air: r.air, patch, trees });
      T.pack = performance.now() - t2;
      const t3 = performance.now();
      const res = await addClip(meta, bytes);
      T.store = performance.now() - t3;
      T.total = performance.now() - T.start;
      stats.saves++;
      stats.lastSave = { id: res.id, bytes: bytes.byteLength, frames: r.n, nodes: c.nodes, patch: `${patch.nx}x${patch.nz}`, trees: trees.length, ms: Object.fromEntries(Object.entries(T).filter(([k]) => k !== 'start').map(([k, v]) => [k, +v.toFixed(1)])) };
      ui?.prompt(true, c.info.trick, 'saved');
      ui?.toast('Highlight saved', `${c.info.trick}${c.info.points ? ` · ${c.info.points.toLocaleString()} pts` : ''} · ${c.ctx.mountain}`, '', res.dropped.length ? 'Oldest highlight replaced · Lobby › Highlights' : 'Lobby › Highlights · plays on your loading screens');
      emit('highlightSaved', { id: res.id, trick: c.info.trick, points: c.info.points, mapId: c.ctx.mapId, bytes: bytes.byteLength });
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
    /** Every frame while riding (also during an instant replay): the save key, and the ride-out timer. */
    input() {
      if (game.mode !== Mode.RIDING) return;
      if (pending && clock() - pending.land >= CLIPS.after) finalize();
      if (input.codePressed('KeyF') || input.btnPressed(PAD_LB)) save();
    },
  };
}

const nextFrame = () => new Promise((res) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => res()) : setTimeout(res, 16)));

/** Slerp between quaternions at D[a..a+3] and D[b..b+3] into out[o..o+3] (shortest path). */
function slerp(D, a, b, t, out, o) {
  let ax = D[a], ay = D[a + 1], az = D[a + 2], aw = D[a + 3];
  let bx = D[b], by = D[b + 1], bz = D[b + 2], bw = D[b + 3];
  let cos = ax * bx + ay * by + az * bz + aw * bw;
  if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
  let ka = 1 - t, kb = t;
  if (cos < 0.9995) { const th = Math.acos(cos), s = Math.sin(th); ka = Math.sin((1 - t) * th) / s; kb = Math.sin(t * th) / s; }
  let x = ax * ka + bx * kb, y = ay * ka + by * kb, z = az * ka + bz * kb, w = aw * ka + bw * kb;
  const l = Math.hypot(x, y, z, w) || 1;
  out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l; out[o + 3] = w / l;
}

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
