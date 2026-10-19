// Loading-scene worker: owns the OffscreenCanvas handed over by loading/index.js and renders the scene
// (loading/scene.js) on its own requestAnimationFrame, independent of the main thread (which is busy
// booting the game). Messages in: init {canvas, width, height, dpr, opts}, resize, visible, outro.
// Messages out: frame (first frame shown), shot {info}, stats, log, error.
let errors = 0;
let scene = null, running = false, last = 0, due = 0, visible = true, sentFrame = false;
// Every message carries the worker's clock as epoch ms (wt): the page's main thread may receive it seconds
// late (long tasks), so timing stats use wt, not the arrival time.
const post = (type, payload = {}) => self.postMessage({ type, wt: performance.timeOrigin + performance.now(), ...payload });

self.addEventListener('error', (e) => post('error', { message: e.message || 'error' }));
self.addEventListener('unhandledrejection', (e) => post('error', { message: e.reason?.message || String(e.reason) }));

function loop(now) {
  if (!running) return;
  self.requestAnimationFrame(loop);
  if (!scene?.ready) return;   // (re)building
  if (!visible) { last = now; return; }
  // ~60 fps cap: a 120 Hz display would otherwise double the GPU load while the game boots. A due-time
  // budget (not a fixed gate) keeps 75 / 90 / 144 Hz displays near 60 too.
  // While the game compiles and warms its shaders (the last stretch of the boot) the GPU is the
  // bottleneck for both: drop to 30 fps there (slow motion hides it) and give the game the time.
  const period = scene && (scene.fps30 || (scene.stageP >= 0.88 && scene.stageP < 1)) ? 1000 / 30 : 1000 / 60;
  if (last && now < due - 4) return;
  due = Math.max(due + period, now);
  const dt = last ? (now - last) / 1000 : 1 / 60;
  if (last) scene.adapt(now - last);
  last = now;
  try {
    scene.frame(dt);
  } catch (e) {
    // One bad frame (e.g. a shot that trips over something): log it and cut to a fresh shot; only a
    // repeat offender gives up (the page then keeps the painted screen).
    post('log', { message: `frame error: ${e.message}` });
    if (++errors > 3) { running = false; post('error', { message: `frame: ${e.message}` }); return; }
    try { scene.recover(); } catch { /* next frame will tell */ }
  }
  if (!sentFrame) { sentFrame = true; post('frame'); }
  // Thumbnail mode (lobby Highlights): the frozen apex frame, encoded right after it was drawn.
  if (thumbCanvas && scene.frozen >= 8 && !thumbSent) {
    thumbSent = true;
    thumbCanvas.convertToBlob({ type: 'image/webp', quality: 0.82 }).then((blob) => post('thumb', { blob, info: scene.lastInfo })).catch((e) => post('error', { message: `thumb: ${e.message}` }));
  }
}

let thumbCanvas = null, thumbSent = false;

/** A saved highlight for this load (clip id from the page): read from IndexedDB and decoded here. */
async function loadClip(id) {
  try {
    const [{ getClipBytes }, { unpackClip }] = await Promise.all([import('../thrill/clipstore.js'), import('../thrill/clipcodec.js')]);
    const bytes = await getClipBytes(id);
    if (!bytes) throw new Error('not found');
    return await unpackClip(bytes);
  } catch (e) {
    post('clipFailed', { id, message: e.message || String(e) });
    return null;
  }
}

// Warm the HTTP cache for the rider (glTF + its buffers / textures) and the rock texture while the
// scene's modules load and the terrain builds: the rider is what the first shot waits for.
function prefetch() {
  const base = new URL('/models/skier/skier.gltf', self.location.href);
  fetch(base).then((r) => r.json()).then((j) => {
    for (const x of [...(j.buffers || []), ...(j.images || [])]) if (x.uri && !x.uri.startsWith('data:')) fetch(new URL(x.uri, base)).then((r) => r.arrayBuffer()).catch(() => {});
  }).catch(() => {});
  fetch(new URL('/textures/web/rock_face_03_packed_1k.jpg', self.location.href)).then((r) => r.arrayBuffer()).catch(() => {});
}

let initMsg = null, SceneClass = null;

/** Build and run the scene. A saved highlight that can't be built falls back to a made-up shot (once). */
async function start(opts) {
  try {
    scene = new SceneClass(initMsg.canvas, { ...initMsg, opts }, post);
    if (opts.clip) scene.onClipFail = (message) => fallback(message);
    await scene.init();
    if (!running) { running = true; self.requestAnimationFrame(loop); }
  } catch (err) {
    if (!opts.clip) throw err;
    await fallback(err.message);
  }
}

async function fallback(message) {
  const opts = initMsg.opts;
  if (!opts.clip) return;
  post('clipFailed', { id: opts.clipId, message: `scene: ${message}` });
  const old = scene;
  scene = null;
  try { old?.dispose?.(); } catch { /* best effort */ }
  delete opts.clip; delete opts.clipId;
  if (opts.thumb) { post('error', { message: `thumb: ${message}` }); return; }
  await start(opts);
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'init') {
    prefetch();
    initMsg = m;
    try {
      const ti = performance.now();
      const clipP = m.opts?.clipId ? loadClip(m.opts.clipId) : null;
      if (m.opts?.thumb) thumbCanvas = m.canvas;
      const { LoadingScene } = await import('./scene.js');
      SceneClass = LoadingScene;
      if (clipP) { const clip = await clipP; if (clip) m.opts.clip = clip; }
      post('modules');   // the page starts the game's own download now (loading/index.js whenStarted)
      m.opts.modulesMs = Math.round(performance.now() - ti);
      await start(m.opts);
    } catch (err) {
      post('error', { message: `init: ${err.message}` });
    }
  } else if (m.type === 'resize') {
    scene?.resize(m);
  } else if (m.type === 'stage') {
    if (scene) scene.stageP = m.p;
  } else if (m.type === 'visible') {
    visible = m.visible;
  } else if (m.type === 'next') {
    // Highlight player: cut to the next camera move now (a short dip).
    if (scene?.mode === 'shot' && !scene.cutting) scene.cutting = 0.35;
  } else if (m.type === 'outro') {
    // Keep rendering through the dissolve, then stop (the main thread terminates us anyway).
    setTimeout(() => { running = false; }, (m.duration || 1) * 1000 + 200);
  }
};
