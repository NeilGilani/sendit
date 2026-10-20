// Quality auto-pick for players who never chose one (docs/launch.md § Performance).
//
// 1. At boot, a GPU the default (Medium, tuned on an Intel Arc iGPU, gfx/perf.js) would overload starts on Low:
//    software renderers (SwiftShader / llvmpipe / "Basic Render"), older Intel HD / UHD iGPUs and phone / tablet GPUs.
// 2. In the lobby, if the frame rate still averages under ~24 fps for a few seconds, it steps down once more.
// Nothing happens when the player picked a quality (Settings, saved in sendit.settings), when the URL sets
// ?quality, or under automation (navigator.webdriver: test scripts keep their own quality; DEBUG builds can
// force it with ?autoq). Never picks High on its own.
import { settings, setSetting, SETTINGS_KEY, game, Mode, on } from '../state.js';
import { DEBUG } from '../flags.js';

function chosen() {
  try { const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null'); return !!s && typeof s === 'object' && 'quality' in s; } catch { return false; }
}

function enabled(params) {
  if (params.has('quality')) return false;
  if (DEBUG && params.has('autoq')) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;
  return !chosen();
}

/** The GPU's name ('' when the browser hides it). */
export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  } catch { return ''; }
}

/** 0 for a GPU that should start on Low, otherwise null (keep the default). Exported for tests. */
export function lowTierGpu(name, { touch = false, small = false } = {}) {
  const n = String(name).toLowerCase();
  if (/swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(n)) return 0;
  if (/intel/.test(n) && /(hd|uhd) graphics/.test(n) && !/iris|arc/.test(n)) return 0;
  if (/adreno|mali|powervr|apple a\d|videocore|tegra/.test(n)) return 0;
  if (touch && small) return 0;   // phones: "Apple GPU" names nothing, so go by the device
  return null;
}

/** Boot: maybe start on Low. Changes settings.quality for this session only (not saved). */
export function autoPickQuality(renderer, params) {
  if (!enabled(params)) return null;
  const name = gpuName(renderer.getContext());
  const touch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
  const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 600;
  const q = lowTierGpu(name, { touch, small });
  if (q !== null && q < settings.quality) {
    settings.quality = q;
    console.info(`[gfx] quality auto-set to Low for "${name || 'unknown GPU'}" (Settings › Quality to change)`);
  }
  return q;
}

/**
 * After boot: watch the lobby's frame rate for a few seconds; if it is too slow, step quality down (saved,
 * so the next visit starts there; Settings › Quality changes it back). `onChange(q)` lets the UI tell the player.
 */
export function watchFrameRate(params, onChange = () => {}) {
  if (!enabled(params) || settings.quality <= 0) return;
  let last = 0, n = 0, sum = 0, start = 0, drops = 0, mine = false, stop = false;
  const off = on('settings', ({ key }) => { if (key === 'quality' && !mine) stop = true; });   // the player chose
  const tick = (t) => {
    if (stop) { off?.(); return; }
    if (document.hidden || game.mode !== Mode.MENU) { last = 0; requestAnimationFrame(tick); return; }
    if (!start) start = t;
    if (last && t - start > 2500) {   // skip the first frames (shader warm-up, lobby fade-in)
      const dt = t - last;
      if (dt < 500) { sum += dt; n++; }
    }
    last = t;
    if (n >= 150) {
      const avg = sum / n;
      if (avg > 42 && settings.quality > 0) {
        mine = true; setSetting('quality', settings.quality - 1); mine = false;
        console.info(`[gfx] ${avg.toFixed(0)} ms per frame in the lobby: quality lowered to ${settings.quality}`);
        onChange(settings.quality);
        drops++;
        n = 0; sum = 0; start = t;
        if (drops < 2 && settings.quality > 0) { requestAnimationFrame(tick); return; }
      }
      off?.();
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
