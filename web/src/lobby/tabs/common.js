// Small helpers shared by lobby tabs.
import { ICONS } from '../icons.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** The standard "coming soon" block: icon, title, one line, and what is planned. */
export function comingSoon({ icon = ICONS.sparkle, title, blurb, planned = [] }) {
  return `
    <h2 class="lp-title">${esc(title)} <span class="lp-pill">Coming soon</span></h2>
    <p class="lp-sub">${esc(blurb)}</p>
    <div class="lp-soon">
      <span class="lp-soon-ico">${icon}</span>
      ${planned.length ? `<ul class="lp-plan">${planned.map((p) => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
    </div>`;
}

export const fmtKm = (m) => `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km`;
export function fmtDuration(s) {
  s = Math.round(s);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${m} min` : m ? `${m} min` : `${s} s`;
}
export const fmtDate = (t) => (t ? new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—');
