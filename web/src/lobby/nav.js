// Spatial focus navigation for menus: arrow keys and the gamepad d-pad / stick move focus to the
// nearest control in that direction. Works on any root element (lobby, pause, settings, credits).
import { emit } from '../state.js';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Visible, enabled focusable elements inside `root`. */
export function focusables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.closest('.hidden, [inert], [aria-hidden="true"]')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
}

/** Focus the element marked [data-autofocus], else the first focusable. */
export function focusFirst(root) {
  const els = focusables(root);
  const el = els.find((e) => e.hasAttribute('data-autofocus')) || els[0];
  el?.focus({ preventScroll: true });
  return el || null;
}

/**
 * Move focus from the active element towards `dir` ('up' | 'down' | 'left' | 'right').
 * Picks the candidate with the smallest distance along `dir`, heavily penalising sideways offset.
 * Returns the newly focused element, or null when nothing lies in that direction.
 */
export function moveFocus(root, dir) {
  const els = focusables(root);
  const cur = document.activeElement;
  if (!els.length) return null;
  if (!els.includes(cur)) return focusFirst(root);
  const a = cur.getBoundingClientRect();
  const ac = { x: a.left + a.width / 2, y: a.top + a.height / 2 };
  let best = null, bestScore = Infinity;
  for (const el of els) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bc = { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    let main, side;
    // Distance along the direction (edge to edge) and the sideways gap between the boxes.
    if (dir === 'right') { main = b.left - a.right; side = gap(a.top, a.bottom, b.top, b.bottom); if (bc.x <= ac.x + 1) continue; }
    else if (dir === 'left') { main = a.left - b.right; side = gap(a.top, a.bottom, b.top, b.bottom); if (bc.x >= ac.x - 1) continue; }
    else if (dir === 'down') { main = b.top - a.bottom; side = gap(a.left, a.right, b.left, b.right); if (bc.y <= ac.y + 1) continue; }
    else { main = a.top - b.bottom; side = gap(a.left, a.right, b.left, b.right); if (bc.y >= ac.y - 1) continue; }
    const score = Math.max(0, main) + side * 3 + Math.abs(dir === 'left' || dir === 'right' ? bc.y - ac.y : bc.x - ac.x) * 0.05;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) {
    best.focus({ preventScroll: true });
    best.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    emit('uiMove', { dir });   // audio.js plays a soft tick
  }
  return best;
}

/** 0 when the 1-D ranges overlap, else the distance between them. */
function gap(a0, a1, b0, b1) { return Math.max(0, Math.max(a0, b0) - Math.min(a1, b1)); }

/** Nudge a range input by `steps` of its step (gamepad left/right on a slider). */
export function nudgeRange(el, steps) {
  const min = Number(el.min || 0), max = Number(el.max || 100);
  const step = Number(el.step) > 0 ? Math.max(Number(el.step), (max - min) / 20) : (max - min) / 20;
  el.value = String(Math.min(max, Math.max(min, Number(el.value) + steps * step)));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Arrow-key handler for a menu root. Leaves sliders' left/right and text fields alone. */
export function handleArrowKey(e, root) {
  const dir = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' }[e.key];
  if (!dir || !root) return false;
  const t = e.target;
  if (t instanceof HTMLInputElement && t.type === 'range' && (dir === 'left' || dir === 'right')) return false;
  if (t instanceof HTMLTextAreaElement || (t instanceof HTMLInputElement && t.type === 'text')) return false;
  e.preventDefault();
  moveFocus(root, dir);
  return true;
}
