// Settings tab: hosts the game's existing settings controls (the .grid inside #settings, bound by
// ui.js) by moving them into the panel while the tab is open and back when it closes, so the pause
// menu's Settings screen and the lobby share one set of controls.
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { organizeSettings } from '../../ui.js';

registerLobbyTab({
  id: 'settings',
  label: 'Settings',
  order: 70,
  icon: ICONS.settings,
  shot: 'full',

  mount(el, ctx) {
    el.innerHTML = `
      <h2 class="lp-title">Settings</h2>
      <p class="lp-sub">Saved in this browser. Changes apply at once.</p>
      <div class="st-host"></div>
      <div class="st-foot"><button type="button" class="lp-btn ghost" data-controls>Controls</button><button type="button" class="lp-btn ghost" data-credits>Credits</button></div>`;
    organizeSettings();
    const grid = document.querySelector('#settings .grid');
    const home = grid?.parentElement;
    const anchor = grid?.nextSibling;
    if (grid) el.querySelector('.st-host').appendChild(grid);
    el.querySelector('[data-credits]').addEventListener('click', () => ctx.showCredits());
    el.querySelector('[data-controls]').addEventListener('click', () => ctx.showHowTo?.({ sheet: 'controls' }));
    return () => { if (grid && home) home.insertBefore(grid, anchor); };
  },
});
