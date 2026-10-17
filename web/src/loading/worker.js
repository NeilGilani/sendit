// Loading-scene worker: owns the OffscreenCanvas handed over by loading/index.js and renders the scene
// (loading/scene.js) on its own requestAnimationFrame, independent of the main thread (which is busy
// booting the game). Messages in: init {canvas, width, height, dpr, opts}, resize, visible, outro.
// Messages out: frame (first frame shown), shot {info}, stats, log, error.
const T0 = performance.now();
let scene = null, running = false, last = 0, visible = true, sentFrame = false;
const post = (type, payload = {}) => self.postMessage({ type, ...payload });

self.addEventListener('error', (e) => post('error', { message: e.message || 'error' }));
self.addEventListener('unhandledrejection', (e) => post('error', { message: e.reason?.message || String(e.reason) }));

function loop(now) {
  if (!running) return;
  self.requestAnimationFrame(loop);
  if (!visible) { last = now; return; }
  const dt = last ? (now - last) / 1000 : 1 / 60;
  if (last) scene.adapt(now - last);
  last = now;
  try {
    scene.frame(dt);
  } catch (e) {
    running = false;
    post('error', { message: `frame: ${e.message}` });
    return;
  }
  if (!sentFrame) { sentFrame = true; post('frame'); }
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    try {
      const ti = performance.now();
      const { LoadingScene } = await import('./scene.js');
      post('log', { message: `worker up at ${Math.round(ti - T0)} ms (origin +${Math.round(performance.timeOrigin)}), modules ${Math.round(performance.now() - ti)} ms` });
      scene = new LoadingScene(m.canvas, m, post);
      await scene.init();
      running = true;
      self.requestAnimationFrame(loop);
    } catch (err) {
      post('error', { message: `init: ${err.message}` });
    }
  } else if (m.type === 'resize') {
    scene?.resize(m);
  } else if (m.type === 'stage') {
    if (scene) scene.stageP = m.p;
  } else if (m.type === 'visible') {
    visible = m.visible;
  } else if (m.type === 'outro') {
    // Keep rendering through the dissolve, then stop (the main thread terminates us anyway).
    setTimeout(() => { running = false; }, (m.duration || 1) * 1000 + 200);
  }
};
