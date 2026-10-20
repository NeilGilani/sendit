// First-launch quality pick (docs/graphics-perf.md "Auto quality").
//
// A new player gets a quality level from the GPU's name (WEBGL_debug_renderer_info): software renderers,
// phones / tablets and old integrated GPUs start on Low (0), everything else on Medium (1, the default).
// High is never picked automatically (it doubles the pixels on a high-DPI screen). Then, during the first
// ride only, a short frame-time check: if the median frame over ~8 s of steady riding is slower than ~36 fps,
// it steps down one level and checks again; still slow at Low, it lowers the render scale (PERF.lowestScale)
// once. Once a check passes (or nothing is left to lower) it never runs again.
//
// It never touches a setting the player chose: it only runs when the stored settings have no `quality`
// yet (a first launch) or carry `qualityAuto: true` (set by this module). Clicking a quality button
// clears `qualityAuto` (ui.js), and `?quality=` in the URL turns the whole thing off. Automated browsers
// (navigator.webdriver: the test scripts) are left alone unless the URL has `?autoq`.
//
// Heavy-High hint: a player who picks High on a GPU that can't carry it (an M1 Air at 2x) gets one small
// notice, once per device: "High is heavy on this device — Medium recommended", with a one-click switch
// (ui.js qualityHint, event 'qualityHeavy'). Nothing changes on its own. Same rules: steady riding only,
// not with ?quality= or in automated browsers (unless ?autoq).
import { settings, setSetting, SETTINGS_KEY, emit } from '../state.js';
import { urlParams } from '../flags.js';

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
// Heavy-High hint: median frame over HEAVY_WINDOW s of steady riding (after WARM) slower than HEAVY_MS (~30 fps).
const HEAVY_WINDOW = 4, HEAVY_MS = 33;

/**
 * The heavy-High watcher: sample(dt, riding) per frame; emits 'qualityHeavy' (once per device, flag
 * `qualityHeavyHinted`) when the player's own High choice runs slower than ~30 fps. Pure state machine.
 */
export function heavyHighWatch() {
  let riding = 0, frames = [];
  return {
    sample(dt, isRiding) {
      if (settings.quality !== 2 || settings.qualityAuto || settings.qualityHeavyHinted) { riding = 0; frames = []; return; }
      if (!isRiding) { riding = 0; frames = []; return; }
      riding += dt;
      if (riding < WARM) return;
      frames.push(dt * 1000);
      if (riding < WARM + HEAVY_WINDOW) return;
      const sorted = frames.slice().sort((a, b) => a - b);
      const med = sorted[sorted.length >> 1];
      frames = []; riding = WARM;   // keep watching in rolling windows while riding
      if (med > HEAVY_MS) {
        setSetting('qualityHeavyHinted', true);
        console.log(`[gfx] High is heavy here: median frame ${med.toFixed(1)} ms`);
        emit('qualityHeavy', { median: med });
      }
    },
  };
}

/**
 * Call once at boot, after the renderer exists and before quality is applied. Returns an object whose
 * sample(dt, riding) the frame loop calls every frame (cheap; does nothing once settled).
 */
export function initAutoQuality(renderer, params = urlParams()) {
  const off = { active: false, gpu: '', sample() {} };
  if (params.has('quality')) return off;
  if (typeof navigator === 'undefined') return off;
  const webdriver = navigator.webdriver;
  if (webdriver && !params.has('autoq')) return off;
  const stored = storedSettings();
  const gpu = gpuName(renderer);
  const heavy = heavyHighWatch();
  if ('quality' in stored && !stored.qualityAuto) return { ...off, gpu, sample: heavy.sample };   // the player's own choice
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
  if (stored.qualityAutoDone || settings.qualityAutoDone) return { active: true, gpu, sample: heavy.sample };
  let riding = 0, frames = [];
  const st = {
    active: true, gpu,
    sample(dt, isRiding) {
      if (!settings.qualityAuto || settings.qualityAutoDone) { heavy.sample(dt, isRiding); return; }   // the player picked a level since
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
      } else if (med > SLOW_MS && !settings.qualityLowest) {
        // Still slow at Low: one more step, a lower render scale (PERF.lowestScale), then settle.
        console.log(`[gfx] auto quality: median frame ${med.toFixed(1)} ms at Low → lower render scale`);
        setSetting('qualityLowest', true);
      } else {
        setSetting('qualityAutoDone', true);
        console.log(`[gfx] auto quality settled on ${settings.quality} (median frame ${med.toFixed(1)} ms)`);
      }
    },
  };
  return st;
}
