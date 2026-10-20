// First-launch quality pick (docs/graphics-perf.md "Auto quality").
//
// A new player gets a quality level from the GPU's name (WEBGL_debug_renderer_info): software renderers,
// phones / tablets and old integrated GPUs start on Low (0), everything else on Medium (1, the default).
// High is never picked automatically (it doubles the pixels on a high-DPI screen). Then, during the first
// ride only, a short frame-time check: if the median frame over ~8 s of steady riding is slower than ~36 fps,
// it steps down one level (and checks once more at the new level). Once a check passes it never runs again.
//
// It never touches a setting the player chose: it only runs when the stored settings have no `quality`
// yet (a first launch) or carry `qualityAuto: true` (set by this module). Clicking a quality button
// clears `qualityAuto` (ui.js), and `?quality=` in the URL turns the whole thing off. Automated browsers
// (navigator.webdriver: the test scripts) are left alone unless the URL has `?autoq`.
import { settings, setSetting, SETTINGS_KEY } from '../state.js';

/** Quality for a GPU name (lower-case match). Pure: unit-tested in scripts/unittest.mjs. */
export function tierQuality(gpu = '', { pixels = 0, mobile = false } = {}) {
  const g = String(gpu).toLowerCase();
  if (!g) return mobile ? 0 : 1;   // unknown (the extension is blocked): the default, but phones go low
  // Software rasterisers: every frame on the CPU.
  if (/swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software|mesa offscreen/.test(g)) return 0;
  // Phone / tablet GPUs (Android, iOS reports "Apple GPU").
  if (mobile || /mali|adreno|powervr|apple gpu|videocore|tegra/.test(g)) return 0;
  // Old Intel iGPUs (HD / UHD Graphics; Iris Xe, Iris Plus and Arc stay on medium).
  if (/intel/.test(g) && /\b(u?hd graphics|gma|hd \d{3,4})\b/.test(g) && !/iris|arc/.test(g)) return 0;
  // Old AMD APUs and entry NVIDIA laptop / desktop parts.
  if (/radeon\(tm\) r[2-7]\b|radeon r[2-7]\b|radeon hd [5-8]\d{3}|geforce (gt \d{3}|9\d{2}m|8\d{2}m|mx1[0-5]0|mx2[0-5]0)\b/.test(g)) return 0;
  // An integrated GPU driving a huge screen (medium renders at CSS size): ~4K at 100 % scaling.
  const integrated = /intel|apple|radeon\(tm\) graphics|radeon graphics|vega \d+ graphics/.test(g) && !/radeon rx|geforce|nvidia/.test(g);
  if (integrated && pixels > 3.7e6) return 0;
  return 1;
}

/** The GPU's name from the renderer (empty when the browser hides it). */
export function gpuName(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String((ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
  } catch { return ''; }
}

function storedSettings() {
  try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { return {}; }
}

// Frame check: ignore the first WARM s of the ride (LOD streaming, shader warm-up), then sample WINDOW s.
const WARM = 4, WINDOW = 8, SLOW_MS = 27.5;

/**
 * Call once at boot, after the renderer exists and before quality is applied. Returns an object whose
 * sample(dt, riding) the frame loop calls every frame (cheap; does nothing once settled).
 */
export function initAutoQuality(renderer, params = new URLSearchParams(globalThis.location?.search || '')) {
  const off = { active: false, gpu: '', sample() {} };
  if (params.has('quality')) return off;
  if (typeof navigator === 'undefined') return off;
  const webdriver = navigator.webdriver;
  if (webdriver && !params.has('autoq')) return off;
  const stored = storedSettings();
  const gpu = gpuName(renderer);
  if ('quality' in stored && !stored.qualityAuto) return { ...off, gpu };   // the player's own choice
  if (!('quality' in stored)) {
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && !/Chrome/.test(ua));   // iPadOS reports a Mac
    const pixels = (globalThis.innerWidth || 0) * (globalThis.innerHeight || 0);
    const q = tierQuality(gpu, { pixels, mobile });
    settings.quality = q;
    settings.qualityAuto = true;
    setSetting('qualityAuto', true);   // saves the whole settings object (quality included)
    console.log(`[gfx] auto quality ${q} (${gpu || 'GPU unknown'})`);
  }
  if (stored.qualityAutoDone || settings.qualityAutoDone) return { active: true, gpu, sample() {} };
  let riding = 0, frames = [];
  const st = {
    active: true, gpu,
    sample(dt, isRiding) {
      if (!settings.qualityAuto || settings.qualityAutoDone) return;
      if (!isRiding) { riding = 0; frames = []; return; }   // only steady riding counts (not lobby, pause, replay)
      riding += dt;
      if (riding < WARM) return;
      frames.push(dt * 1000);
      if (riding < WARM + WINDOW) return;
      const sorted = frames.slice().sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      frames = []; riding = 0;
      if (med > SLOW_MS && settings.quality > 0) {
        console.log(`[gfx] auto quality: median frame ${med.toFixed(1)} ms at quality ${settings.quality} → ${settings.quality - 1}`);
        setSetting('quality', settings.quality - 1);   // main.js applies it; checks again at the new level
      } else {
        setSetting('qualityAutoDone', true);
        console.log(`[gfx] auto quality settled on ${settings.quality} (median frame ${med.toFixed(1)} ms)`);
      }
    },
  };
  return st;
}
