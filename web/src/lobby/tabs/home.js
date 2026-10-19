// Home: the screen the lobby opens on. The rider stands centre stage (no panel), the Ride cluster sits
// bottom right (Lobby.js), and three tiles on the left surface what is waiting for you: your level,
// today's challenges and your cases. Every tile is one button that jumps to the full screen
// (docs/lobby.md → Home). It renders into the lobby panel, which goes "bare" for this tab.
import { registerLobbyTab, getLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';
import { caseArt } from '../cases/caseArt.js';
import { CASE_XP } from '../../profile/rewards.js';
import { SERIES, SERIES_ORDER } from '../../profile/items.js';
import { progression, rankEmblem } from '../../progression/index.js';
import { tickNumbers } from '../motion.js';

const n = (v) => Math.round(v).toLocaleString('en-US');

function untilMidnight() {
  const d = new Date(), m = new Date(d); m.setHours(24, 0, 0, 0);
  const s = Math.max(0, (m - d) / 1000), h = Math.floor(s / 3600), mi = Math.floor((s % 3600) / 60);
  return h ? `${h} h ${String(mi).padStart(2, '0')}` : `${mi} min`;
}

function levelTile() {
  let p;
  try { p = progression.getProgress(); } catch { return ''; }
  const pct = p.need ? (p.into / p.need) * 100 : 100;
  return `
    <button type="button" class="hm-tile hm-level" data-go="progress" style="--rc:${esc(p.rank.color)};--i:0" aria-label="Level ${p.level}, ${esc(p.rank.name)}. Open Career">
      <span class="hm-emblem">${rankEmblem(p.level, 26)}</span>
      <span class="hm-lv"><small>${esc(p.rank.name)}</small><b>Level <span data-tick="${p.level}">${p.level}</span></b></span>
      <span class="hm-go">${ICONS.arrow}</span>
      <span class="hm-xp"><span class="hm-bar"><i style="--v:${(pct / 100).toFixed(3)}"></i></span>
        <small><span data-tick="${Math.round(p.into)}">${n(p.into)}</span> / ${n(p.need)} XP</small></span>
    </button>`;
}

function dailyTile() {
  let list, bonus = 0;
  try { list = progression.getChallenges(); bonus = progression.dailyBonusLeft(); } catch { return ''; }
  const left = list.filter((c) => !c.done).length;
  return `
    <button type="button" class="hm-tile hm-daily" data-go="progress" style="--i:1" aria-label="Daily challenges: ${left} left. Open Career">
      <span class="hm-head">${ICONS.bolt}<b>${left ? 'Daily challenges' : 'All dailies done'}</b><small>${ICONS.clock}${untilMidnight()}</small></span>
      ${bonus > 0 ? `<span class="hm-bonus"><b>2× XP</b> on your next ${n(bonus)} XP</span>` : ''}
      <span class="hm-quests">${list.map((c) => {
        const v = Math.min(1, c.goal ? c.value / c.goal : 0);
        return `<span class="hm-q${c.done ? ' done' : ''}">
          <span class="hm-q-t">${c.done ? ICONS.check : ''}<span>${esc(c.title)}</span></span>
          <em>${c.done ? 'Done' : `+${n(c.xp)}`}</em>
          <span class="hm-bar thin"><i style="--v:${v.toFixed(3)}"></i></span></span>`;
      }).join('')}</span>
    </button>`;
}

function casesTile(P) {
  const cases = P.unopened;
  const r = P.rewards;
  const series = cases[0]?.series ?? SERIES_ORDER[r.earned % SERIES_ORDER.length];
  const ready = cases.length;
  return `
    <div class="hm-tile hm-cases${ready ? ' ready' : ''}" style="--i:2;--sc:${esc(SERIES[series]?.color || '#888')}">
      <button type="button" class="hm-cases-main" data-go="cases" aria-label="${ready ? `${ready} cases ready` : 'Cases'}. Open Cases">
        <span class="hm-case">${caseArt(series, { count: 0 })}</span>
        <span class="hm-cases-t">
          <small>${ready ? esc(SERIES[series]?.name || 'Case') : 'Next case'}</small>
          ${ready ? `<b><span data-tick="${ready}">${ready}</span> ${ready === 1 ? 'case' : 'cases'} ready</b>`
            : `<b><span data-tick="${Math.floor(r.xp)}">${n(r.xp)}</span><i> / ${n(CASE_XP)} XP</i></b><span class="hm-bar gold"><i style="--v:${(r.xp / CASE_XP).toFixed(3)}"></i></span>`}
        </span>
      </button>
      ${ready ? `<button type="button" class="hm-open lb-btn3 gold" data-open>Open</button>` : ''}
    </div>`;
}

registerLobbyTab({
  id: 'home',
  label: 'Home',
  order: 0,
  icon: ICONS.home,
  shot: 'full',
  bare: true,

  mount(el, ctx) {
    let first = true;
    const render = () => {
      el.innerHTML = `<div class="hm-tiles" role="group" aria-label="What's waiting">${levelTile()}${dailyTile()}${casesTile(ctx.profile)}</div>`;
      el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { ctx.sfx?.('ui_click', 0.3, 1); ctx.select(b.dataset.go); }));
      el.querySelector('[data-open]')?.addEventListener('click', () => {
        ctx.select('cases');
        getLobbyTab('cases')?._open?.();     // straight into the opening show: one click from Home
      });
      if (first) { tickNumbers(el); first = false; }
    };
    render();
    for (const ev of ['progressXp', 'challengeDone', 'rewards', 'caseEarned', 'rideRecorded']) ctx.on(ev, render);
  },
});
