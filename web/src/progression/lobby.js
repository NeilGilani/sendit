// Lobby: a "Progress" tab (level, today's dailies with a reroll, achievements, this map's personal
// bests) through the tab registry, and a level badge + XP bar on the profile chip (a small widget
// added next to the chip's text; the lobby's own markup is not edited).
import { registerLobbyTab } from '../lobby/tabs.js';
import { spotsHtml } from '../thrill/spots.js';
import { on, game, Mode } from '../state.js';
import { progression, PB_STATS, XP_SOURCES, nextRank, rankEmblem } from './index.js';
import { fmtVal } from './ui.js';

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/></svg>';
// Colour emoji in achievement icons (progression/core.js) are drawn as monochrome line icons instead.
const AICON = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ACH_ICONS = {
  '🥇': AICON('<circle cx="12" cy="14" r="5.5"/><path d="M8.5 3.5l2.2 5M15.5 3.5l-2.2 5M12 11.8v4.4"/>'),
  '📚': AICON('<path d="M4.5 4.5h4v15h-4zM9.5 4.5h4v15h-4z"/><path d="M14.6 5.6l3.8-1 3.1 14.5-3.8 1z"/>'),
  '📖': AICON('<path d="M12 6.5c-2-1.6-4.8-2-8-1.6v13.6c3.2-.4 6 0 8 1.6 2-1.6 4.8-2 8-1.6V4.9c-3.2-.4-6 0-8 1.6zM12 6.5v13.6"/>'),
  '🌲': AICON('<path d="M12 3l5 7h-3l4.5 6h-13L10 10H7z"/><path d="M12 16v5"/>'),
};
const achIcon = (g) => ACH_ICONS[g] || `${esc(g)}\uFE0E`;
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const n = (v) => Math.round(v).toLocaleString('en-US');

const CSS = /* css */`
/* Lobby design system (docs/lobby.md → Design system): tokens from src/style.css, 0–4 px corners, hairline rows. */
.pg-lvl { display: grid; grid-template-columns: auto 1fr; gap: 0.35em 1em; align-items: center; padding: 0.85em 1em; border-radius: var(--r1);
  background: var(--c-ink-2); border: 1px solid var(--c-line); box-shadow: inset 4px 0 0 var(--rc); }
.pg-num { grid-row: 1 / 3; width: 2.4em; height: 2.4em; border-radius: var(--r1); display: grid; place-items: center; font-size: 1.5em; font-weight: 900; font-stretch: 72%;
  color: var(--c-paper-ink); background: var(--c-snow); position: relative; }
.pg-num::after { content: ''; position: absolute; left: 0; bottom: 0; height: 0.14em; width: calc(var(--p) * 1%); background: var(--c-signal); }
.pg-num span { position: relative; }
.pg-rank { font-weight: 800; font-stretch: 75%; font-size: 1.2em; color: var(--rc); letter-spacing: 0.04em; display: flex; align-items: center; gap: 0.3em; flex-wrap: wrap; }
.pg-rank svg { flex: none; }
.pg-rank small { flex-basis: 100%; font-size: 0.62em; font-stretch: 100%; letter-spacing: 0.01em; color: var(--c-snow-2); font-weight: 500; }
.pg-badge svg { width: 1.05em; height: 1.05em; vertical-align: -0.15em; margin-right: 0.15em; }
#lobby .lb-ride.pg-bonus { animation: pgRide 1.4s ease-in-out infinite alternate; }
#lobby .lb-ride.pg-bonus:hover, #lobby .lb-ride.pg-bonus:focus-visible, #lobby .lb-ride.pg-bonus:active { animation: none; }
@keyframes pgRide { from { background-color: var(--c-signal); } to { background-color: #ff8a3d; } }
.pg-xp { font: 500 0.74em/1.3 var(--font-mono); color: var(--c-snow-2); }
.pg-bar { height: 4px; background: rgba(255,255,255,0.1); overflow: hidden; margin-top: 0.4em; }
.pg-bar i { display: block; height: 100%; background: var(--c-ice); }
.pg-h { display: flex; align-items: center; gap: 0.7em; margin: 1.5em 0 0.4em; font-weight: 600; font-size: 0.72em; letter-spacing: 0.14em; text-transform: uppercase; color: var(--c-snow-3); }
.pg-h::after { content: ''; flex: 1; height: 1px; background: var(--c-line); order: 1; }
.pg-h small { order: 2; font: 500 1em/1 var(--font-mono); letter-spacing: 0.02em; text-transform: none; color: var(--c-snow-3); }
.pg-ch { display: grid; grid-template-columns: 1fr auto; gap: 0.15em 0.8em; align-items: center; padding: 0.6em 0.2em 0.65em; border-bottom: 1px solid var(--c-line); }
.pg-ch.done b { color: var(--c-snow-2); }
.pg-ch b { font-weight: 700; }
.pg-ch small { grid-column: 1; font-size: 0.78em; color: var(--c-snow-2); }
.pg-ch .xp { grid-row: 1; grid-column: 2; font: 600 0.8em/1 var(--font-mono); color: var(--c-gold); white-space: nowrap; }
.pg-ch .pg-bar { grid-column: 1 / -1; }
.pg-ch.done .pg-bar i { background: var(--c-pine); }
#lobby .pg-ch button.pg-rr { grid-row: 2; grid-column: 2; font-size: 0.68em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 0.3em 0.6em;
  border-radius: var(--r1); color: var(--c-snow-2); box-shadow: inset 0 0 0 1px var(--c-line-2); transform: none; }
#lobby .pg-ch button.pg-rr:hover, #lobby .pg-ch button.pg-rr:focus-visible { color: var(--c-paper-ink); background: var(--c-snow); }
.pg-ch.wk { padding-left: 0.7em; box-shadow: inset 3px 0 0 var(--c-gold); background: linear-gradient(90deg, rgba(243,193,75,0.08), transparent 70%); }
.pg-ach { display: grid; grid-template-columns: repeat(auto-fill, minmax(2.5em, 1fr)); gap: 0.35em; margin-top: 0.4em; }
#lobby .pg-a { aspect-ratio: 1; border-radius: var(--r1); display: grid; place-items: center; font: 600 1.05em/1 var(--font-mono); font-variant-emoji: text;
  color: var(--c-snow-3); border: 1px dashed var(--c-line-2); }
#lobby .pg-a svg { width: 1.05em; height: 1.05em; }
#lobby .pg-a:hover, #lobby .pg-a:focus-visible { border-style: solid; border-color: var(--c-snow); color: var(--c-snow); }
.pg-adet { font-size: 0.78em; color: var(--c-snow-2); margin-top: 0.5em; min-height: 1.3em; }
.pg-adet b { color: var(--c-snow); } .pg-adet i { color: var(--c-gold); font-style: normal; font-weight: 700; }
#lobby button.pg-a { width: 100%; font-size: 1.05em; }
#lobby .pg-a.on { color: var(--c-paper-ink); background: var(--c-snow); border: 0; box-shadow: inset 0 -3px 0 var(--c-signal); }
.pg-book { display: flex; flex-wrap: wrap; gap: 0.3em; font-size: 0.76em; margin-top: 0.4em; }
.pg-book span { padding: 0.3em 0.55em; border-radius: var(--r1); box-shadow: inset 0 0 0 1px var(--c-line-2); font-weight: 600; }
.pg-book small { color: var(--c-snow-2); }
.pg-book .pg-unk { box-shadow: inset 0 0 0 1px var(--c-line); color: var(--c-snow-3); font-weight: 400; letter-spacing: 0.1em; }
.pg-spots span:not(.pg-unk) { background: rgba(143, 208, 238, 0.12); }
.pg-gaps { margin-top: 0.4em; }
.pg-gaps span { background: rgba(143, 208, 238, 0.08); }
.pg-maps { display: grid; gap: 0; font-size: 0.85em; border-top: 1px solid var(--c-line); margin-top: 0.4em; }
.pg-map { display: flex; justify-content: space-between; align-items: center; padding: 0.35em 0.2em; border-bottom: 1px solid var(--c-line); }
.pg-map b i { font-style: normal; color: rgba(255,255,255,0.2); margin-left: 0.15em; }
.pg-map b i.on { color: var(--c-gold); }
.pg-pb { display: grid; grid-template-columns: 1fr auto; gap: 0.35em 1em; font-size: 0.88em; margin-top: 0.4em; }
.pg-pb span { color: var(--c-snow-2); }
.pg-pb b { font-weight: 600; font-family: var(--font-mono); text-align: right; }
/* TODAY: a small departures-board list above the Ride button (click → Progress tab). */
#lobby > .pg-today { position: absolute; right: var(--lb-pad); bottom: calc(var(--lb-pad) + 5.4em); z-index: 2; display: flex; flex-direction: column; align-items: stretch; gap: 0;
  min-width: 15em; max-width: 21em; pointer-events: auto; cursor: pointer; background: rgba(10, 18, 26, 0.9); border: 1px solid var(--c-line); border-radius: var(--r1); }
#lobby > .pg-today:hover { border-color: var(--c-line-2); }
.pg-today > b { display: flex; justify-content: space-between; padding: 0.55em 0.75em 0.45em; font: 600 0.62em/1 var(--font-mono); letter-spacing: 0.14em; color: var(--c-snow-3); border-bottom: 1px solid var(--c-line); }
.pg-today > b::after { content: '\\2192'; color: var(--c-signal-2); }
.pg-today .row { display: flex; align-items: center; gap: 0.55em; padding: 0.4em 0.75em; font-size: 0.78em; font-weight: 600; }
.pg-today .row + .row { border-top: 1px solid rgba(214, 228, 240, 0.07); }
.pg-today .row.done { color: var(--c-snow-3); text-decoration: line-through; text-decoration-color: var(--c-pine); }
.pg-today .ring { flex: none; width: 0.85em; height: 0.85em; border: 1px solid var(--c-line-2); background: linear-gradient(0deg, var(--c-ice) calc(var(--p) * 1%), transparent 0); }
.pg-today .row.done .ring { background: var(--c-pine); border-color: var(--c-pine); }
.pg-today .row span { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pg-today .row.bonus { color: var(--c-gold); }
.pg-today .row.bonus .ring { border-color: var(--c-gold); background: linear-gradient(0deg, var(--c-gold) calc(var(--p) * 1%), transparent 0); }
.pg-today .row em { font: 600 0.88em/1 var(--font-mono); font-style: normal; color: var(--c-gold); }
@media (max-height: 560px), (max-width: 760px), (max-aspect-ratio: 4/5) { #lobby > .pg-today { display: none; } }
.pg-badge { flex: none; margin-left: 0.1em; font: 600 0.66em/1 var(--font-mono); color: var(--c-paper-ink); padding: 0.4em 0.5em; border-radius: var(--r1);
  background: var(--rc, var(--c-ice)); letter-spacing: 0.04em; }
.pg-chipbar { display: block; height: 3px; background: rgba(15, 26, 36, 0.15); overflow: hidden; margin-top: 3px; }
.pg-chipbar i { display: block; height: 100%; background: var(--c-signal); }
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
      const nr = nextRank(p.level);
      const book = progression.getTrickBook();
      const wk = progression.getWeekly();
      const maps = (ctx.maps?.list?.() || []).filter((m) => !m.hidden);
      el.innerHTML = `
        <h2 class="lp-title">Progress</h2>
        <p class="lp-sub">Level up by riding: style points, distance, dailies and achievements all give XP.</p>
        <div class="pg-lvl" style="--rc:${p.rank.color};--p:${pct.toFixed(1)}">
          <div class="pg-num"><span>${p.level}</span></div>
          <div class="pg-rank">${rankEmblem(p.level, 20)} ${esc(p.rank.name.toUpperCase())}${nr ? `<small>Next rank: ${esc(nr.name)} at level ${nr.from}</small>` : ''}</div>
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
        <div class="pg-h">This week <small>new on Monday</small></div>
        <div class="pg-ch wk${wk.done ? ' done' : ''}">
          <b>${wk.done ? '✓ ' : ''}${esc(wk.title)}</b><span class="xp">+${n(wk.xp)} XP</span>
          <small>${esc(wk.desc)} · ${fmtVal(wk, wk.value)} / ${fmtVal(wk, wk.goal)}</small>
          <div class="pg-bar"><i style="width:${Math.min(100, (wk.value / wk.goal) * 100).toFixed(1)}%"></i></div>
        </div>
        <div class="pg-h">Achievements <small>${got} / ${ach.length}</small></div>
        <div class="pg-ach">${ach.map((a, i) => `<button type="button" class="pg-a${a.unlocked ? ' on' : ''}" data-i="${i}" aria-label="${esc(a.title)}: ${esc(a.desc)}">${achIcon(a.icon)}</button>`).join('')}</div>
        <div class="pg-adet">Hover or select a badge to see what it takes.</div>
        <div class="pg-h">Trick book <small>${book.length} landed</small></div>
        <div class="pg-book">${book.length ? book.sort((a, b) => b.n - a.n).slice(0, 14).map((t) => `<span title="landed ${t.n}×">${esc(t.name)}</span>`).join('') : '<small>Land tricks to fill the book: every new one pays XP.</small>'}</div>
        <div class="pg-h">Mountain mastery <small>★ ridden · ★ clean run · ★ ×4 combo</small></div>
        <div class="pg-maps">${maps.map((m) => { const st = progression.getMapStars(m.id); return `<div class="pg-map"><span>${esc(m.name)}</span><b>${st.stars.map((x) => `<i class="${x ? 'on' : ''}">★</i>`).join('')}</b></div>`; }).join('')}</div>
        ${spotsHtml(mapId, ctx.maps?.current?.()?.map?.name)}
        <div class="pg-h">Personal bests <small>${esc(ctx.maps?.current?.()?.map?.name || 'this mountain')}</small></div>
        <div class="pg-pb">${Object.entries(PB_STATS).map(([k, S]) => `<span>${S.label}</span><b>${pb[k] ? S.fmt(pb[k]) : '—'}</b>`).join('')}</div>`;
      const det = el.querySelector('.pg-adet');
      const showAch = (i) => { const a = ach[i]; if (a) det.innerHTML = `<b>${esc(a.title)}</b> · ${esc(a.desc)}${a.xp ? ` · +${n(a.xp)} XP` : ''}${a.unlocked ? ' · <i>unlocked</i>' : ''}`; };
      el.querySelectorAll('.pg-a').forEach((b) => { b.addEventListener('mouseenter', () => showAch(Number(b.dataset.i))); b.addEventListener('focus', () => showAch(Number(b.dataset.i))); });
      el.querySelectorAll('.pg-rr').forEach((b) => b.addEventListener('click', () => {
        const c = progression.rerollChallenge(Number(b.dataset.slot));
        if (c) ctx.toast?.(`New daily: ${c.title}`);
        render();
        todayWidget();
        el.querySelector('.pg-rr, .pg-ch')?.focus?.();
      }));
    };
    render();
    for (const ev of ['progressXp', 'challengeDone', 'weeklyDone', 'achievement', 'rideRecorded', 'thrillSpot', 'thrillGap']) ctx.on(ev, render);
  },
});

/** "TODAY" strip above the Ride button: the three dailies with mini progress rings (click → Progress tab). */
function todayWidget() {
  const lobby = typeof document !== 'undefined' && document.getElementById('lobby');
  if (!lobby || !lobby.querySelector('.lb-go')) return false;
  css();
  let el = lobby.querySelector('.pg-today');
  if (!el) {
    el = document.createElement('div');
    el.className = 'pg-today';
    el.title = 'Daily challenges · open Progress';
    el.addEventListener('click', () => globalThis.__sendit?.lobby?.select?.('progress'));
    lobby.appendChild(el);
  }
  const list = progression.getChallenges();
  const left = list.filter((c) => !c.done).length;
  const bonus = progression.dailyBonusLeft();
  lobby.querySelector('.lb-ride')?.classList.toggle('pg-bonus', bonus > 0);   // the day's 2× XP is waiting
  el.innerHTML = `<b>${left ? 'TODAY' : 'ALL DAILIES DONE'}</b>${bonus > 0 ? `<div class="row bonus"><i class="ring" style="--p:${(100 - (bonus / XP_SOURCES.dailyBonus) * 100).toFixed(0)}"></i><span>2× XP on your next ${n(bonus)} XP</span></div>` : ''}${list.map((c) => `
    <div class="row${c.done ? ' done' : ''}"><i class="ring" style="--p:${Math.min(100, (c.value / c.goal) * 100).toFixed(0)}"></i><span>${esc(c.title)}</span>${c.done ? '' : `<em>+${n(c.xp)}</em>`}</div>`).join('')}`;
  return true;
}

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
  badge.innerHTML = `${rankEmblem(p.level, 14)}LV ${p.level}`;
  badge.style.setProperty('--rc', p.rank.color);
  badge.title = `${p.rank.name} · ${p.into} / ${p.need} XP`;
  const i = chip.querySelector('.pg-chipbar i');
  if (i) i.style.width = `${p.need ? (p.into / p.need) * 100 : 100}%`;
  return true;
}
if (typeof document !== 'undefined') {
  // Only while the lobby is up (score events during a ride would re-render hidden widgets).
  for (const ev of ['mode', 'progressXp', 'profile', 'lobbyTabs', 'challengeDone']) on(ev, () => { if (game.mode === Mode.MENU) { chipWidget(); todayWidget(); } });
  const tryMount = () => { if (!chipWidget() || !todayWidget()) setTimeout(tryMount, 500); };
  tryMount();
}
