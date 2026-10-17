// In-ride trail toast: when a ride starts on a trail, a sign slides in at the top of the HUD with the
// mountain, the trail's difficulty badge and name, then slides away (docs/maps.md). Self-contained:
// it injects its own element and styles into #hud.
import { DIFFICULTIES } from './registry.js';
import { difficultyBadge, trailStats } from './badges.js';

const CSS = `
#trail-toast { position: absolute; left: 50%; top: 92px; transform: translate(-50%, -14px); opacity: 0; pointer-events: none;
  display: flex; align-items: center; gap: 12px; padding: 10px 18px 10px 12px; border-radius: 14px;
  background: linear-gradient(180deg, rgba(12,18,30,0.78), rgba(12,18,30,0.62)); backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 10px 40px rgba(0,0,0,0.35), inset 0 0 0 1px rgba(255,255,255,0.03);
  color: #f3f7ff; font-family: inherit; transition: opacity .45s ease, transform .55s cubic-bezier(.2,.9,.25,1.2); z-index: 5; }
#trail-toast.on { opacity: 1; transform: translate(-50%, 0); }
#trail-toast::before { content: ''; position: absolute; left: 14px; right: 14px; top: 0; height: 2px; border-radius: 2px; background: var(--tt-accent, #5fa8ff); opacity: .9; }
#trail-toast .tt-badge { width: 34px; height: 34px; flex: none; filter: drop-shadow(0 2px 6px rgba(0,0,0,.4)); }
#trail-toast .tt-text { display: flex; flex-direction: column; line-height: 1.15; }
#trail-toast small { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; opacity: .7; }
#trail-toast b { font-size: 22px; font-weight: 800; letter-spacing: .01em; white-space: nowrap; }
#trail-toast em { font-style: normal; font-size: 12.5px; opacity: .78; }
body.fp #trail-toast { top: 64px; }
`;

let el = null, timer = 0;

function ensure() {
  const hud = document.getElementById('hud');
  if (el?.isConnected || !hud) return el?.isConnected ? el : null;
  if (el) { hud.appendChild(el); return el; }   // re-attach if the HUD was rebuilt
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  el = document.createElement('div');
  el.id = 'trail-toast';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  hud.appendChild(el);
  return el;
}

/** Show the trail sign for `trail` on `map` (registry entries). */
export function showTrailToast(map, trail, { duration = 4200 } = {}) {
  const box = ensure();
  if (!box || !trail) return;
  const diff = DIFFICULTIES[trail.difficulty];
  const stats = trailStats(trail);
  box.style.setProperty('--tt-accent', map?.mountain?.accent || '#5fa8ff');
  box.innerHTML = `${difficultyBadge(trail.difficulty, 34, 'tt-badge')}
    <span class="tt-text"><small>${esc(map?.mountain?.name || map?.name || '')}${trail.group ? ` · ${esc(trail.group)}` : ''}</small>
    <b>${esc(trail.name)}</b><em>${esc(diff?.label || '')}${stats ? ` · ${esc(stats)}` : ''}</em></span>`;
  box.classList.remove('on');
  void box.offsetWidth;
  box.classList.add('on');
  clearTimeout(timer);
  timer = setTimeout(() => box.classList.remove('on'), duration);
}

export function hideTrailToast() { clearTimeout(timer); el?.classList.remove('on'); }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
