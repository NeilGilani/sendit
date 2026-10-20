// Profile / Stats tab (minimal): rider name, identity (guest) and lifetime stats from the profile.
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc, fmtDuration, fmtKm } from './common.js';

registerLobbyTab({
  id: 'profile',
  label: 'Profile',
  order: 60,
  icon: ICONS.profile,
  shot: 'portrait',

  mount(el, ctx) {
    const render = () => {
      const p = ctx.profile.profile;
      const s = p.stats;
      const me = ctx.services.identity.current();
      el.innerHTML = `
        <h2 class="lp-title">Profile</h2>
        <p class="lp-sub">${me.isGuest ? 'Your rider and stats, saved in this browser.' : `Signed in with ${esc(me.provider)}`}</p>
        <form class="pf-name" autocomplete="off">
          <label for="pf-name">Rider name</label>
          <div class="pf-row"><input id="pf-name" type="text" maxlength="24" aria-describedby="pf-name-hint" value="${esc(p.displayName)}" spellcheck="false" /><button type="submit" class="lp-btn">Save</button></div>
        </form>
        <div class="pf-stats">
          ${[
            ['Best score', s.bestScore.toLocaleString()],
            ['Rides', s.rides],
            ['Runs finished', s.runsCompleted],
            ['Distance', fmtKm(s.distance)],
            ['Air time', `${s.airTime.toFixed(0)} s`],
            ['Smooth turns', s.smoothTurns],
            ['Total score', s.totalScore.toLocaleString()],
            ['Time riding', fmtDuration(s.playTime)],
          ].map(([k, v]) => `<div class="pf-stat"><small>${k}</small><b>${esc(v)}</b></div>`).join('')}
        </div>
        <p class="lp-hint" id="pf-name-hint">Your name shows on your lift ticket, in Rankings and on challenge links you send.</p>`;
      el.querySelector('.pf-name').addEventListener('submit', (e) => {
        e.preventDefault();
        const v = el.querySelector('#pf-name').value.trim();
        if (v) { ctx.profile.setDisplayName(v); ctx.toast('Name saved'); }
      });
    };
    render();
    ctx.on('profile', ({ reason }) => { if (reason !== 'name') render(); });
  },
});
