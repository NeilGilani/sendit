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

const $ = (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null);
const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const T0 = performance.now();

// Boot stage weights: ui.loading() reports main.js's own fractions; these map them onto measured wall
// time (median of GPU runs, docs/loading-screen.md) so the line moves at an even pace. [reported, shown]
const PACE = [[0, 0], [0.02, 0.03], [0.45, 0.3], [0.5, 0.36], [0.62, 0.42], [0.75, 0.47], [0.8, 0.52], [0.88, 0.6], [0.92, 0.66], [0.95, 0.72], [1, 1]];
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
    if (!this.root) return;
    this.bar = $('loadbar');
    this.msg = $('loadmsg');
    this.caption = $('loadcap');
    this.buildTips();
    if (params.get('loadscene') !== '0') this.startScene();
    else this.root.classList.add('static');
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
      for (const k of ['loadseed', 'loadtrick', 'loadcam', 'loadtod', 'loadgear', 'loadmtn', 'loaddebug', 'loadq']) if (params.has(k)) opts[k.slice(4)] = params.get(k);
      this.worker.postMessage({ type: 'init', canvas: off, ...this.size(), opts }, [off]);
      addEventListener('resize', () => this.worker?.postMessage({ type: 'resize', ...this.size() }));
      document.addEventListener('visibilitychange', () => this.worker?.postMessage({ type: 'visible', visible: !document.hidden }));
    } catch (e) {
      this.fail(e.message);
    }
  }

  size() { return { width: innerWidth, height: innerHeight, dpr: devicePixelRatio || 1 }; }

  onMessage(m) {
    if (m.type === 'frame') {
      // First real frame of the live scene: dissolve from the painted backdrop.
      if (!this.firstFrameAt) { this.firstFrameAt = performance.now() - T0; this.root.classList.add('live'); }
    } else if (m.type === 'shot') {
      this.sceneInfo = m.info;
      this.setCaption(m.info);
    } else if (m.type === 'stats') {
      this.sceneStats = m.stats;
    } else if (m.type === 'error') {
      this.fail(m.message);
    } else if (m.type === 'log') {
      console.log('[loading]', m.message);
    }
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
    try { this.worker?.terminate(); } catch { /* already gone */ }
    this.worker = null;
  }

  /** Boot progress from main.js (0..1, its own stage fractions) and the stage message. */
  progress(p, msg) {
    if (!this.root || this.done) return;
    this.p = Math.max(this.p, p);
    this.stages.push([Math.round(performance.now() - T0), p, msg || '']);
    if (this.bar) this.bar.style.transform = `scaleX(${pace(this.p).toFixed(4)})`;
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
    if (this.bar) this.bar.style.transform = 'scaleX(1)';
    const quick = !this.firstFrameAt || this.readyAt < 1200;
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
    return { firstFrameMs: Math.round(this.firstFrameAt), readyMs: Math.round(this.readyAt || 0), stages: this.stages, scene: this.sceneStats, shot: this.sceneInfo };
  }
}

export const loadingScreen = new LoadingScreen();
if (typeof window !== 'undefined') window.__loading = loadingScreen;   // debug / test handle
