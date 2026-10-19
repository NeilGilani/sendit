// The loading scene as a highlight player for the lobby (lobby/tabs/highlights.js): the same worker,
// the same hero cameras, the same "replay on its own snow" (loading/clip.js), into any canvas.
//   playClip(canvas, clipId, { onShot, onReady, onError })  → { next(), stop(), stream() }
//   renderThumb(clipId, w, h)                               → Promise<Blob> (WebP of the trick's apex)
const WORKER_URL = new URL('./worker.js', import.meta.url);

export function canPlayClips() {
  try {
    return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && !!new OffscreenCanvas(1, 1).getContext('webgl2')
      && typeof HTMLCanvasElement !== 'undefined' && !!HTMLCanvasElement.prototype.transferControlToOffscreen;
  } catch { return false; }
}

/** Play a saved clip in `canvas` (a fresh <canvas>; it is handed to the worker) until stop(). */
export function playClip(canvas, clipId, { onShot, onReady, onError, quality } = {}) {
  let worker = null, stopped = false;
  const size = () => {
    const r = canvas.getBoundingClientRect();
    return { width: Math.max(2, Math.round(r.width)), height: Math.max(2, Math.round(r.height)), dpr: Math.min(2, devicePixelRatio || 1) };
  };
  try {
    const off = canvas.transferControlToOffscreen();
    worker = new Worker(WORKER_URL, { type: 'module', name: 'sendit-highlight' });
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'shot') { onReady?.(); onShot?.(m.info); }
      else if (m.type === 'error' || m.type === 'clipFailed') onError?.(m.message || 'error');
      else if (m.type === 'shaderError') console.error('[highlights] shader failed to link:', m.message);
    };
    worker.onerror = (e) => { e.preventDefault?.(); onError?.(e.message || 'worker error'); };
    // stageP 1: the game is not loading (the scene's 30 fps "boot" pacing is off).
    worker.postMessage({ type: 'init', canvas: off, ...size(), opts: { clipId, cover: false, player: true, q: quality || undefined } }, [off]);
    worker.postMessage({ type: 'stage', p: 1 });
  } catch (e) {
    onError?.(e.message);
  }
  const onResize = () => worker?.postMessage({ type: 'resize', ...size() });
  addEventListener('resize', onResize);
  return {
    next() { worker?.postMessage({ type: 'next' }); },
    stop() {
      if (stopped) return;
      stopped = true;
      removeEventListener('resize', onResize);
      try { worker?.terminate(); } catch { /* gone */ }
      worker = null;
    },
  };
}

/** Render one frame of a clip (the hero three-quarter at the top of the air) to a WebP Blob. */
export function renderThumb(clipId, w = 640, h = 360, { timeoutMs = 30000, cam = 'close', freeze = 0.35 } = {}) {
  return new Promise((resolve, reject) => {
    let worker;
    const t = setTimeout(() => { try { worker?.terminate(); } catch { /* */ } reject(new Error('thumb timeout')); }, timeoutMs);
    const end = (fn, v) => { clearTimeout(t); try { worker?.terminate(); } catch { /* */ } fn(v); };
    try {
      const off = new OffscreenCanvas(w, h);
      worker = new Worker(WORKER_URL, { type: 'module', name: 'sendit-thumb' });
      worker.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'thumb') end(resolve, m.blob);
        else if (m.type === 'error' || m.type === 'clipFailed') end(reject, new Error(m.message || 'error'));
      };
      worker.onerror = (e) => { e.preventDefault?.(); end(reject, new Error(e.message || 'worker error')); };
      worker.postMessage({ type: 'init', canvas: off, width: w, height: h, dpr: 1, opts: { clipId, thumb: true, q: 'thumb', freeze: String(freeze), cam, cover: false } }, [off]);
      worker.postMessage({ type: 'stage', p: 1 });
    } catch (e) { end(reject, e); }
  });
}
