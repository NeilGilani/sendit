// Small motion helpers for the lobby (docs/lobby.md → Motion). CSS does the heavy lifting
// (transforms + opacity only); JS only counts numbers up and throttles hover ticks.
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Count every `[data-tick="<number>"]` inside `root` up from 0 to its value (ease-out, ~0.7 s).
 * Text keeps its thousands separators. One rAF loop for all of them; stops when done.
 */
export function tickNumbers(root, ms = 700) {
  const els = [...root.querySelectorAll('[data-tick]')].map((el) => ({ el, to: Number(el.dataset.tick) || 0 })).filter((e) => e.to > 0);
  if (!els.length || reduced()) return;
  const fmt = (v) => Math.round(v).toLocaleString('en-US');
  const t0 = performance.now();
  for (const e of els) e.el.textContent = '0';
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms), f = 1 - Math.pow(1 - k, 3);
    for (const e of els) if (e.el.isConnected) e.el.textContent = fmt(e.to * f);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** A hover tick (sound) for `selector` inside `root`, at most once per 70 ms. */
export function hoverTicks(root, selector, play) {
  let last = 0, lastEl = null;
  root.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.(selector);
    if (!el || el === lastEl || el.disabled) return;
    lastEl = el;
    const now = performance.now();
    if (now - last < 70) return;
    last = now;
    play();
  });
  root.addEventListener('pointerout', (e) => { if (e.target.closest?.(selector) === lastEl && !lastEl.contains(e.relatedTarget)) lastEl = null; });
}
