// Lobby: a "Progress" tab (level, today's dailies with a reroll, achievements, this map's personal
// bests) through the tab registry, and a level badge + XP bar on the profile chip (a small widget
// added next to the chip's text; the lobby's own markup is not edited).
import { registerLobbyTab } from '../lobby/tabs.js';
import { on } from '../state.js';
import { progression, PB_STATS } from './index.js';
import { fmtVal } from './ui.js';

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/></svg>';
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const n = (v) => Math.round(v).toLocaleString('en-US');

const CSS = /* css */`
.pg-lvl { display: grid; grid-template-columns: auto 1fr; gap: 0.3em 1em; align-items: center; padding: 0.9em 1em; border-radius: 0.9em;
  background: linear-gradient(110deg, color-mix(in srgb, var(--rc) 26%, transparent), rgba(255,255,255,0.04)); border: 1px solid var(--lb-line); }
.pg-num { grid-row: 1 / 3; width: 2.6em; height: 2.6em; border-radius: 50%; display: grid; place-items: center; font-size: 1.5em; font-weight: 900; font-style: italic;
  color: var(--lb-navy); background: conic-gradient(var(--rc) calc(var(--p) * 1%), rgba(255,255,255,0.18) 0); position: relative; }
.pg-num::before { content: ''; position: absolute; inset: 0.22em; border-radius: 50%; background: #fffaf0; }
.pg-num span { position: relative; }
.pg-rank { font-weight: 900; font-style: italic; font-size: 1.15em; color: var(--rc); letter-spacing: 0.04em; }
.pg-xp { font-size: 0.8em; color: var(--lb-dim); }
.pg-bar { height: 0.42em; border-radius: 1em; background: rgba(255,255,255,0.12); overflow: hidden; margin-top: 0.35em; }
.pg-bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--lb-cyan), #7a5cff); border-radius: 1em; }
.pg-h { display: flex; align-items: baseline; justify-content: space-between; margin: 1.1em 0 0.5em; font-weight: 800; font-style: italic; letter-spacing: 0.04em; }
.pg-h small { font-weight: 600; font-style: normal; font-size: 0.75em; color: var(--lb-dim); letter-spacing: 0.02em; }
.pg-ch { display: grid; grid-template-columns: 1fr auto; gap: 0.15em 0.8em; align-items: center; padding: 0.65em 0.85em; border-radius: 0.8em; background: var(--lb-glass-2); margin-bottom: 0.45em; }
.pg-ch.done { background: linear-gradient(100deg, rgba(47,245,214,0.22), rgba(47,245,214,0.04)); }
.pg-ch b { font-weight: 800; }
.pg-ch small { grid-column: 1; font-size: 0.78em; color: var(--lb-dim); }
.pg-ch .xp { grid-row: 1; grid-column: 2; font-weight: 900; font-style: italic; color: var(--lb-gold); font-size: 0.9em; white-space: nowrap; }
.pg-ch .pg-bar { grid-column: 1 / -1; }
.pg-ch.done .pg-bar i { background: var(--lb-cyan); }
#lobby .pg-ch button.pg-rr { grid-row: 2; grid-column: 2; font-size: 0.72em; font-weight: 800; padding: 0.25em 0.7em; border-radius: 999px; color: #fff; background: rgba(255,255,255,0.1); transform: none; }
#lobby .pg-ch button.pg-rr:hover, #lobby .pg-ch button.pg-rr:focus-visible { background: rgba(255,255,255,0.22); }
.pg-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.6em, 1fr)); gap: 0.4em; }
.pg-a { aspect-ratio: 1; border-radius: 0.7em; display: grid; place-items: center; font-size: 1.15em; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.28); filter: grayscale(1); }
.pg-a.on { background: linear-gradient(135deg, rgba(255,211,77,0.45), rgba(255,95,176,0.3)); color: #fff; filter: none; box-shadow: 0 0 0 1px rgba(255,211,77,0.5); }
.pg-pb { display: grid; grid-template-columns: 1fr auto; gap: 0.3em 1em; font-size: 0.9em; }
.pg-pb span { color: var(--lb-dim); }
.pg-pb b { font-weight: 800; text-align: right; }
.pg-badge { flex: none; margin-left: 0.2em; font: 900 italic 0.72em/1 var(--font); color: var(--lb-navy); padding: 0.32em 0.55em; border-radius: 999px; background: var(--rc, var(--lb-cyan)); letter-spacing: 0.04em; }
.pg-chipbar { display: block; height: 3px; border-radius: 2px; background: rgba(255,255,255,0.14); overflow: hidden; margin-top: 3px; }
.pg-chipbar i { display: block; height: 100%; background: linear-gradient(90deg, var(--lb-cyan), #7a5cff); }
`;

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
}

function untilMidnight() {
  const d = new Date(), m = new Date(d); m.setHours(24, 0, 0, 0);
  const s = Math.max(0, (m - d) / 1000), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60);
  return `${h} h ${String(mi).padStart(2, '0')} min`;
}

registerLobbyTab({
  id: 'progress',
  label: 'Progress',
  order: 45,
  icon: ICON,
  shot: 'full',

  mount(el, ctx) {
    css();
    const render = () => {
      const p = progression.getProgress();
      const pct = p.need ? (p.into / p.need) * 100 : 100;
      const ch = progression.getChallenges();
      const ach = progression.getAchievements();
      const got = ach.filter((a) => a.unlocked).length;
      const mapId = ctx.maps?.current?.()?.map?.id;
      const pb = mapId ? progression.getPersonalBests(mapId) : {};
      const rr = progression.rerollsLeft();
      el.innerHTML = `
        <h2 class="lp-title">Progress</h2>
        <p class="lp-sub">Level up by riding: style points, distance, dailies and achievements all give XP.</p>
        <div class="pg-lvl" style="--rc:${p.rank.color};--p:${pct.toFixed(1)}">
          <div class="pg-num"><span>${p.level}</span></div>
          <div class="pg-rank">${esc(p.rank.name.toUpperCase())}</div>
          <div><div class="pg-xp">${n(p.into)} / ${n(p.need)} XP to level ${p.level + 1} · ${n(p.xp)} total</div><div class="pg-bar"><i style="width:${pct.toFixed(1)}%"></i></div></div>
        </div>
        <div class="pg-h">Daily challenges <small>new in ${untilMidnight()}</small></div>
        ${ch.map((c) => `
          <div class="pg-ch${c.done ? ' done' : ''}">
            <b>${c.done ? '✓ ' : ''}${esc(c.title)}</b><span class="xp">+${n(c.xp)} XP</span>
            <small>${esc(c.desc)} · ${fmtVal(c, c.value)} / ${fmtVal(c, c.goal)}</small>
            ${!c.done && rr > 0 ? `<button type="button" class="pg-rr" data-slot="${c.slot}" title="Swap this challenge (one free swap a day)">Swap</button>` : ''}
            <div class="pg-bar"><i style="width:${Math.min(100, (c.value / c.goal) * 100).toFixed(1)}%"></i></div>
          </div>`).join('')}
        <div class="pg-h">Achievements <small>${got} / ${ach.length}</small></div>
        <div class="pg-ach">${ach.map((a) => `<div class="pg-a${a.unlocked ? ' on' : ''}" title="${esc(a.title)}: ${esc(a.desc)}${a.xp ? ` (+${a.xp} XP)` : ''}">${a.icon}</div>`).join('')}</div>
        <div class="pg-h">Personal bests <small>${esc(ctx.maps?.current?.()?.map?.name || 'this map')}</small></div>
        <div class="pg-pb">${Object.entries(PB_STATS).map(([k, S]) => `<span>${S.label}</span><b>${pb[k] ? S.fmt(pb[k]) : '—'}</b>`).join('')}</div>`;
      el.querySelectorAll('.pg-rr').forEach((b) => b.addEventListener('click', () => {
        const c = progression.rerollChallenge(Number(b.dataset.slot));
        if (c) ctx.toast?.(`New daily: ${c.title}`);
        render();
        el.querySelector('.pg-rr, .pg-ch')?.focus?.();
      }));
    };
    render();
    for (const ev of ['progressXp', 'challengeDone', 'achievement', 'rideRecorded']) ctx.on(ev, render);
  },
});

/** Level badge + XP bar on the lobby's profile chip. */
function chipWidget() {
  const chip = typeof document !== 'undefined' && document.querySelector('#lobby .lb-chip');
  if (!chip) return false;
  css();
  let badge = chip.querySelector('.pg-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'pg-badge';
    chip.appendChild(badge);
    const bar = document.createElement('span');
    bar.className = 'pg-chipbar';
    bar.innerHTML = '<i></i>';
    chip.querySelector('.lb-chip-text')?.appendChild(bar);
  }
  const p = progression.getProgress();
  badge.textContent = `LV ${p.level}`;
  badge.style.setProperty('--rc', p.rank.color);
  badge.title = `${p.rank.name} · ${p.into} / ${p.need} XP`;
  const i = chip.querySelector('.pg-chipbar i');
  if (i) i.style.width = `${p.need ? (p.into / p.need) * 100 : 100}%`;
  return true;
}
if (typeof document !== 'undefined') {
  for (const ev of ['mode', 'progressXp', 'profile', 'lobbyTabs']) on(ev, () => chipWidget());
  const tryMount = () => { if (!chipWidget()) setTimeout(tryMount, 500); };
  tryMount();
}
