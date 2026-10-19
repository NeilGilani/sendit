// Highlight save worker (thrill/highlights.js): resample + pack + store a clip off the main thread, so
// pressing F never costs the ride a frame. One job per worker; it answers once and is terminated.
import { buildClip } from './clipbuild.js';

self.onmessage = async (e) => {
  try { self.postMessage(await buildClip(e.data)); } catch (err) { self.postMessage({ ok: false, message: err?.message || String(err), code: err?.code || null }); }
};
