// Loading screen controller (main thread). Starts the moment index.html runs it — before main.js has
// even been fetched — and owns the #loading overlay:
//   • a static painted backdrop (index.html: sky gradient, SVG ridges, CSS snow) — instant first paint
//     and the fallback when the live scene can't run
//   • the live scene: a slow-motion hero shot of a rider sending a trick off a peak, rendered by a
//     Worker into an OffscreenCanvas (loading/worker.js → loading/scene.js), so it stays at 60 fps while
//     the game's boot blocks the main thread for seconds at a time (terrain, scatter, shader compiles)
//   • the overlay: SENDIT logo, a slim progress line tied to the real boot stages (ui.loading), rotating
//     tips (pure CSS keyframes, so they rotate even while the main thread is busy) and the shot caption
//   • the hand-off: finish() cross-dissolves (with a slight push-in) into the lobby, then stops the
//     worker and frees its GPU context. Instant loads skip straight to a short fade.
// Public API (ui.js): loadingScreen.progress(p, msg), loadingScreen.finish() → Promise, .stats()
// Debug URL flags: ?loadscene=0 (static screen only) · ?loadhold (never hand off; frame capture)
//                  ?loadseed=<n> (pick the variant) · ?loadtrick=<id> · ?loadcam=<id> · ?loadtod=<id>
import { TIPS } from './tips.js';
import { readLoadHint, consumeTransition } from './hint.js';

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const T0 = performance.now();

// Boot stage weights: ui.loading() reports main.js's own fractions; these map them onto measured wall
// time (docs/loading-screen.md: terrain ≈ 55–65 % of a warm boot, the final compile + prewarm ≈ 15 % warm
// but ≈ 55 % on a cold shader cache) so the line moves at a fairly even pace. [reported, shown]. Between
// reports the line creeps toward the next knot on the compositor (it keeps moving through long tasks).
const PACE = [[0, 0], [0.02, 0.05], [0.45, 0.55], [0.5, 0.58], [0.62, 0.63], [0.75, 0.66], [0.8, 0.68], [0.88, 0.72], [0.92, 0.76], [1, 1]];
const nextKnot = (p) => (PACE.find(([a]) => a > p + 1e-6) || PACE[PACE.length - 1])[1];
const pace = (p) => {
  for (let i = 1; i < PACE.length; i++) {
    const [a, A] = PACE[i - 1], [b, B] = PACE[i];
    if (p <= b) return A + (B - A) * ((p - a) / Math.max(1e-6, b - a));
  }
  return 1;
};

class LoadingScreen {
  constructor() {
    this.root = $('loading');
    this.p = 0;
    this.stages = [];
    this.done = false;
    this.firstFrameAt = 0;
    this.sceneInfo = null;
    this.sceneStats = null;
    this.worker = null;
    // Resolves once the worker has its code (or can't run): index.html only then starts fetching the game
    // (main.js), so the loading scene's modules aren't queued behind the game's hundreds of requests.
    this._started = new Promise((res) => { this._start = res; });
    if (!this.root) { this._start(); return; }
    this.bar = $('loadbar');
    this.msg = $('loadmsg');
    this.caption = $('loadcap');
    this.hint = readLoadHint();
    if (this.hint?.transition) { consumeTransition(); this.showDestination(this.hint); }
    this.buildTips();
    // Reduced motion: no flips and swooping cameras, just the painted screen (its snow is CSS and
    // stops too). ?loadscene=1 forces the live scene anyway.
    const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (params.get('loadscene') === '1' || (params.get('loadscene') !== '0' && !reduce)) this.startScene();
    else { this.root.classList.add('static'); this._start(); }
  }

  /** See _started. Never waits longer than `maxMs`. */
  whenStarted(maxMs = 2500) {
    return Promise.race([this._started, new Promise((res) => setTimeout(res, maxMs))]);
  }

  /** Tips: shuffled into the CSS rotation (each tip owns a slot of the keyframe cycle). */
  buildTips() {
    const box = $('loadtips');
    if (!box) return;
    const order = TIPS.map((t) => [Math.random(), t]).sort((a, b) => a[0] - b[0]).slice(0, 8).map((x) => x[1]);
    const per = 6.5;
    box.style.setProperty('--tip-cycle', `${order.length * per}s`);
    box.innerHTML = order.map((t, i) => `<div class="tip" style="animation-delay:${(i * per - 0.6).toFixed(2)}s">${t}</div>`).join('');
    box.style.setProperty('--tip-n', order.length);
  }

  startScene() {
    const canvas = $('loadcanvas');
    try {
      if (!canvas || !canvas.transferControlToOffscreen || typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
      // Probe WebGL2 on an OffscreenCanvas (Safari < 17 has the API but not WebGL in it).
      if (!new OffscreenCanvas(1, 1).getContext('webgl2')) throw new Error('no WebGL2 in OffscreenCanvas');
      const off = canvas.transferControlToOffscreen();
      this.worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module', name: 'sendit-loading' });
      this.worker.onmessage = (e) => this.onMessage(e.data);
      this.workerAt = performance.now();
      this.worker.onerror = (e) => { e.preventDefault?.(); this.fail(e.message || 'worker error'); };
      const opts = {};
      // The painted still (index.html picks one) and the live scene share a variant: same seed (place,
      // light, rider), so the cross-fade lands on the same mountain. A lobby -> mountain load keeps the
      // still's light but rides the player's own kit on the picked mountain (loading/hint.js).
      const still = typeof window !== 'undefined' ? window.__ldStill : null;
      if (this.hint?.transition) {
        opts.hint = this.hint;
        if (still) { opts.tod = still.tod; opts.mtn = still.mtn; }
      } else if (still) Object.assign(opts, { seed: still.seed, tod: still.tod, mtn: still.mtn, gear: still.gear });
      opts.cover = this.hasStill();
      // The worker redraws the still (loading/still.js) in step with the CSS drift, then dissolves it.
      if (opts.cover) opts.still = this.stillInfo(still);
      for (const k of ['loadseed', 'loadtrick', 'loadcam', 'loadtod', 'loadgear', 'loadmtn', 'loaddebug', 'loadq', 'loadfreeze']) if (params.has(k)) opts[k.slice(4)] = params.get(k);
      this.worker.postMessage({ type: 'init', canvas: off, ...this.size(), opts }, [off]);
      addEventListener('resize', () => this.worker?.postMessage({ type: 'resize', ...this.size() }));
      document.addEventListener('visibilitychange', () => this.worker?.postMessage({ type: 'visible', visible: !document.hidden }));
    } catch (e) {
      this.fail(e.message);
    }
  }

  /** URL + Ken Burns parameters + the CSS animation's start (epoch ms) of the painted still. */
  stillInfo(still) {
    const css = getComputedStyle(document.documentElement);
    const el = this.root.querySelector('.ld-still');
    const anim = el?.getAnimations?.()[0];
    const t = anim?.startTime ?? document.timeline?.currentTime ?? performance.now();
    return { url: new URL(`/loading/${still.f}`, location.href).href, kbx: parseFloat(css.getPropertyValue('--kbx')) || 0, kby: parseFloat(css.getPropertyValue('--kby')) || 0, start: performance.timeOrigin + Number(t) };
  }

  /** index.html's painted still is up (or about to be): the live scene waits for the rider before showing. */
  hasStill() { return typeof window !== 'undefined' && !!window.__ldStill && !window.__ldStillFailed; }

  /** Lobby -> mountain load: name the mountain being loaded (big, bottom-left, like a game's map card). */
  showDestination(h) {
    const box = $('loaddest');
    if (!box || !h.mountain) return;
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const diff = h.difficulty ? `<i class="dot ${esc(h.difficulty)}"></i>` : '';
    box.innerHTML = `<small>Dropping in</small><b>${esc(h.mountain)}</b><span>${diff}${esc(h.trail || '')}${h.region ? `<em>${esc(h.region)}</em>` : ''}</span>`;
    if (h.accent) box.style.setProperty('--accent', h.accent);
    box.classList.add('on');
    this.root.classList.add('dest');
  }

  size() { return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 }; }

  onMessage(m) {
    const at = m.wt ? m.wt - performance.timeOrigin - T0 : performance.now() - T0;   // when the worker sent it
    if (m.type === 'modules') {
      this.modulesAt = performance.now() - T0;
      this._start();
    } else if (m.type === 'frame') {
      // First real frame of the live scene: dissolve from the painted backdrop, unless a painted still
      // of the rider is up; then the live scene shows from its first rider shot (never an empty slope).
      if (!this.firstFrameAt) { this.firstFrameAt = at; this.frameMsgLag = performance.now() - T0 - at; }
      if (!this.hasStill()) this.goLive();
    } else if (m.type === 'shot') {
      this.sceneInfo = m.info;
      if (!this.firstShotAt) this.firstShotAt = at;
      this.goLive();
      this.setCaption(m.info);
    } else if (m.type === 'frozen') {
      this.frozen = m.info || true;
    } else if (m.type === 'stats') {
      this.sceneStats = m.stats;
      // Stall start times relative to this page's T0 (same clock as `stages`).
      if (m.stats.stalls) m.stats.stalls = m.stats.stalls.map(([t, ms]) => [Math.round(t - performance.timeOrigin - T0), ms]);
    } else if (m.type === 'error') {
      this.fail(m.message);
    } else if (m.type === 'shaderError') {
      console.error('[loading] shader failed to link:', m.message);
    } else if (m.type === 'log') {
      console.log('[loading]', m.message);
    }
  }

  goLive() {
    if (this.liveAt) return;
    this.liveAt = performance.now() - T0;
    this.root.classList.add('live');
  }

  setCaption(info) {
    if (!this.caption || !info) return;
    this.caption.classList.remove('on');
    clearTimeout(this._capT);
    this._capT = setTimeout(() => {
      this.caption.innerHTML = `<b>${info.trick}</b><span>${info.place} · ${info.time}</span>`;
      this.caption.classList.add('on');
    }, 600);
  }

  /** The live scene could not run: keep the painted backdrop (it is already showing). */
  fail(reason) {
    console.warn('[loading] live scene unavailable, showing the static screen:', reason);
    this.root?.classList.remove('live');
    this.root?.classList.add('static');
    this._start?.();
    try { this.worker?.terminate(); } catch { /* already gone */ }
    this.worker = null;
  }

  /** Boot progress from main.js (0..1, its own stage fractions) and the stage message. */
  progress(p, msg) {
    if (!this.root || this.done) return;
    this.p = Math.max(this.p, p);
    this.stages.push([Math.round(performance.now() - T0), p, msg || '']);
    if (this.bar) {
      // Never backwards: a report can land below where the creep has already carried the line.
      const m = /matrix\(([^,]+)/.exec(getComputedStyle(this.bar).transform || '');
      const shown = Math.max(pace(this.p), m ? Number(m[1]) || 0 : 0);
      this.bar.style.transition = 'transform .9s cubic-bezier(.2,.7,.2,1)';
      this.bar.style.transform = `scaleX(${shown.toFixed(4)})`;
      clearTimeout(this._creep);
      if (this.p < 1) {
        const target = shown + (nextKnot(this.p) - shown) * 0.85;
        this._creep = setTimeout(() => {
          if (this.done) return;
          this.bar.style.transition = 'transform 16s cubic-bezier(.1,.5,.3,1)';
          this.bar.style.transform = `scaleX(${target.toFixed(4)})`;
        }, 950);
      }
    }
    this.worker?.postMessage({ type: 'stage', p: this.p });   // the scene leans out while the game compiles
    if (msg && this.msg) this.msg.textContent = msg;
  }

  /**
   * Loading finished: dissolve into the lobby. Resolves when the overlay is gone. A load that beat
   * the live scene's first frame (or finished within ~1.2 s) just fades the painted screen quickly.
   */
  finish() {
    if (!this.root || this.done) return Promise.resolve();
    if (params.has('loadhold')) { this.progress(1, 'Ready (held by ?loadhold)'); return Promise.resolve(); }
    this.done = true;
    this.readyAt = performance.now() - T0;
    clearTimeout(this._creep);
    if (this.bar) { this.bar.style.transition = 'transform .5s ease-out'; this.bar.style.transform = 'scaleX(1)'; }
    const quick = (!this.liveAt && !this.hasStill()) || this.readyAt < 1200;
    const dur = quick ? 450 : 1300;
    // The game's fade curtain would add a black dip: the lobby is revealed straight through the dissolve.
    const curtain = $('fade');
    if (curtain) { curtain.style.transitionDuration = '0s'; curtain.style.opacity = '0'; void curtain.offsetWidth; }   // flush: ui.fade() right after must not animate it
    this.worker?.postMessage({ type: 'outro', duration: dur / 1000 });
    return new Promise((res) => {
      // Two frames so the lobby has rendered under us before it shows through.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        this.root.style.setProperty('--out', `${dur}ms`);
        this.root.classList.add(quick ? 'out-quick' : 'out');
        setTimeout(() => {
          this.root.classList.add('hidden');
          try { this.worker?.terminate(); } catch { /* gone */ }
          this.worker = null;
          $('loadcanvas')?.remove();
          res();
        }, dur + 60);
      }));
    });
  }

  stats() {
    return { firstFrameMs: Math.round(this.firstFrameAt), liveMs: Math.round(this.liveAt || 0), firstShotMs: Math.round(this.firstShotAt || 0), msgLagMs: Math.round(this.frameMsgLag || 0), modulesMs: Math.round(this.modulesAt || 0), stillMs: Math.round(window.__ldStillAt || 0), readyMs: Math.round(this.readyAt || 0), stages: this.stages, scene: this.sceneStats, shot: this.sceneInfo };
  }
}

export const loadingScreen = new LoadingScreen();
if (typeof window !== 'undefined') window.__loading = loadingScreen;   // debug / test handle
