// Case notifications: a "Case earned!" card (with the case rattling) the moment one drops, in a ride
// or in the lobby, a small progress card after each finished run (+XP and the bar to the next case),
// and red badges on the Cases tab (unopened cases) and the Locker tab (new skins).
import { on, game, Mode } from '../../state.js';
import { profileStore } from '../../profile/store.js';
import { SERIES } from '../../profile/items.js';
import { caseArt } from './caseArt.js';
import { caseSfx } from './sfx.js';
import { setLobbyBadge } from '../tabs.js';
import './cases.css';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
let stack = null;
let rideGains = [];     // XP gains of the current / last ride (Cases tab "last ride")

/** XP gains of the current or last ride, merged by label: [{ label, xp }]. */
export function lastGains() {
  const m = new Map();
  for (const g of rideGains) {
    const label = g.label.replace(/[\d.]+ km ridden/, 'Distance ridden');
    m.set(label, (m.get(label) || 0) + g.xp);
  }
  return [...m].map(([label, xp]) => ({ label, xp })).sort((a, b) => b.xp - a.xp);
}

function show(html, cls = '', ms = 4200) {
  if (typeof document === 'undefined') return;
  if (!stack) { stack = document.createElement('div'); stack.className = 'cn-stack'; stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
  // In a ride the top right belongs to the score and the snowflake counter: cards go to the left edge.
  stack.classList.toggle('ride', game.mode !== Mode.MENU);
  const n = document.createElement('div');
  n.className = `cn ${cls}`;
  n.innerHTML = html;
  stack.appendChild(n);
  while (stack.children.length > 3) stack.firstChild.remove();
  setTimeout(() => { n.classList.add('out'); setTimeout(() => n.remove(), 400); }, ms);
}

function badges() {
  // Counts go through the tab registry; the lobby draws them on the tab, its destination and Home.
  setLobbyBadge('cases', profileStore.unopened.length);
  setLobbyBadge('locker', profileStore.newSkins().length);
}
const soon = () => setTimeout(badges, 0);

export function installCaseNotifications() {
  on('rideStarted', () => { rideGains = []; });
  on('caseEarned', ({ cases, source }) => {
    const c = cases[cases.length - 1];
    const S = SERIES[c.series];
    const riding = game.mode !== Mode.MENU;
    caseSfx.earned();
    show(`${caseArt(c.series)}<div class="cn-text"><b>${cases.length > 1 ? `${cases.length} cases earned!` : 'Case earned!'}</b>
      <small>${esc(S.name)}${source === 'duplicate' ? ' · from duplicates' : source === 'rank' ? ' · new rank!' : source === 'collection' ? ' · collection complete!' : ''}</small>
      <small>${riding ? 'Open it in the lobby · Cases' : 'Open it in the Cases tab'}</small></div>`, 'case', 6000);
    soon();
  });
  on('rewards', (e) => {
    soon();
    if (e.reason !== 'run' || !e.gains?.length) return;
    rideGains.push(...e.gains);
    if (!e.run?.finished || e.cases?.length) return;   // a case card is coming anyway
    const top = e.gains.filter((g) => g.milestone).map((g) => g.label);
    show(`<div class="cn-text"><b>${top.length ? esc(top.join(' · ')) : 'Run complete'}</b>
      <small>${Math.floor(e.progress * 100)} % to the next case</small>
      <div class="cs-bar"><i style="--v:${e.progress.toFixed(3)}"></i></div></div><span class="cn-xp">+${Math.round(e.xp)}</span>`, '', 3600);
  });
  on('profile', soon);
  on('lobbyTabs', soon);
  on('mode', (m) => {
    soon();
    // Back in the lobby: a ride's progress cards go (the bar lives on Home / Cases and they would sit over the
    // panels, e.g. Career › Highlights' first play button); a "Case earned!" card stays and moves to the top right.
    if (!stack) return;
    stack.classList.toggle('hold', m === Mode.PAUSED);   // the pause menu's left column ("Back to lobby") sits there
    if (m !== Mode.MENU) return;
    stack.classList.remove('ride');
    for (const n of stack.querySelectorAll('.cn:not(.case)')) n.remove();
  });
  soon();
  // A case that dropped while the page was closed (e.g. the ride ended on pagehide) still shows.
  if (profileStore.unopened.length) setTimeout(badges, 500);
}

