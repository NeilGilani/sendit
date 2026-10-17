// The case itself: a hard-shell gear case in the series colours (HTML + CSS 3D, cases.css). The lid is
// its own face so the opener can flip it open; the same markup, smaller, is the case in the Cases tab.
import { SERIES } from '../../profile/items.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export function caseArt(series, { count = 0 } = {}) {
  const s = SERIES[series] || Object.values(SERIES)[0];
  return `<div class="cb" style="--sc:${s.color};--sa:${s.accent}">
    <div class="cb-shadow"></div>
    <div class="cb-body">
      <i class="cb-rib a"></i><i class="cb-rib b"></i>
      <span class="cb-logo"><svg viewBox="0 0 24 24"><path d="M2.5 19.5l6.5-12 4 7 2.5-4 6 9z" fill="currentColor"/></svg></span>
      <span class="cb-name">${esc(s.name.replace(/ Case$/, ''))}</span>
      <i class="cb-latch l"></i><i class="cb-latch r"></i>
    </div>
    <div class="cb-lid"><i class="cb-handle"></i><i class="cb-stripe"></i></div>
    ${count > 1 ? `<span class="cb-count">×${count}</span>` : ''}
  </div>`;
}
