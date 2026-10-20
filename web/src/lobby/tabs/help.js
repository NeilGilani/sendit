// Help (the ? button top right): the How to ride cards again, the Controls sheet (keyboard + controller
// diagrams), the controls at a glance and what each part of the lobby is for, in a sentence each.
// Content: lobby/help.js (one table of bindings for every screen). docs/lobby.md → "First run and Help".
import { registerLobbyTab } from '../tabs.js';
import { controlsList, CONTROLS } from '../help.js';

const ICON = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.4 9.3a2.7 2.7 0 0 1 5.2 1c0 1.8-2.6 2.3-2.6 3.9"/><circle cx="12" cy="17.2" r=".6" fill="currentColor"/></svg>';

const FAQ = [
  ['Zen or Challenge?', 'Zen is free riding: no clock, explore, land tricks. Challenge is a timed run through gates with medals and a ghost of your best run. Switch next to the Ride button.'],
  ['Where do I pick a run?', 'Mountains: choose a mountain, then a trail. Green and blue trails are the gentlest, black diamonds the steepest, orange is the terrain park.'],
  ['How do I get new gear and outfits?', 'Everything is earned by riding. XP fills your next case; open it in Cases and wear what you find in the Locker. No purchases.'],
  ['What are the daily challenges?', 'Three goals that change every day. Each pays bonus XP; swap one a day in Career → Progress.'],
  ['How do I save a trick?', 'Right after you land it, press F (LB on a controller). Your clips live in Career → Highlights and play on the loading screen.'],
  ['Can I race my friends?', 'Finish a Challenge run, then copy the challenge link on the results screen. Your friend races your ghost.'],
];

registerLobbyTab({
  id: 'help',
  label: 'Help',
  short: 'Help',
  nav: 'utility',
  order: 65,
  icon: ICON,
  shot: 'full',

  mount(el, ctx) {
    const dev = () => (ctx.device?.() === 'gamepad' || ctx.device?.() === 'touch' ? 'gp' : 'kb');
    el.innerHTML = `
      <h2 class="lp-title">Help</h2>
      <p class="lp-sub">New here? Start with How to ride: four quick cards.</p>
      <div class="hp-actions">
        <button type="button" class="lp-btn" data-howto data-autofocus>How to ride<small>Steer, jump, tricks, restart</small></button>
        <button type="button" class="lp-btn" data-controls>Controls<small>Keyboard and controller</small></button>
      </div>
      <div class="hp-quick" data-dev="${dev()}">${controlsList({ groups: CONTROLS.map((g) => ({ ...g, rows: g.rows.slice(0, g.id === 'run' ? 5 : 4) })), notes: false })}</div>
      <h3 class="lp-h3">Questions</h3>
      <div class="hp-faq">${FAQ.map(([q, a], i) => `<div class="hp-q"><button type="button" aria-expanded="false" aria-controls="hp-a${i}">${q}</button><p id="hp-a${i}" hidden>${a}</p></div>`).join('')}</div>
      <p class="lp-hint">Settings has volume, quality and camera options.</p>`;
    el.querySelector('[data-howto]').addEventListener('click', () => ctx.showHowTo?.({ sheet: 'intro' }));
    el.querySelector('[data-controls]').addEventListener('click', () => ctx.showHowTo?.({ sheet: 'controls' }));
    el.querySelectorAll('.hp-q > button').forEach((b) => b.addEventListener('click', () => {
      const open = b.getAttribute('aria-expanded') !== 'true';
      b.setAttribute('aria-expanded', String(open));
      b.nextElementSibling.hidden = !open;
      ctx.sfx?.('ui_click', 0.25, open ? 1.2 : 1);
    }));
    ctx.on('inputDevice', () => { const q = el.querySelector('.hp-quick'); if (q) q.dataset.dev = dev(); });
  },
});
