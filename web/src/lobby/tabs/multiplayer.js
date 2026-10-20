// Friends (utility button top right). Live multiplayer needs a server we don't have yet, so this tab
// explains what does work today without one: challenge links ("beat my run", thrill/versus.js). A
// finished Challenge run's results card has "Copy challenge link"; the friend who opens it races your
// ghost on the same trail. When a network service is provided (services/network.js), the status line
// below says so. docs/lobby.md → Navigation.
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';

registerLobbyTab({
  id: 'multiplayer',
  label: 'Friends',
  order: 40,
  icon: ICONS.multiplayer,
  shot: 'wide',

  mount(el, ctx) {
    const render = () => {
      const net = ctx.services.network;
      const cur = ctx.maps.current?.();
      const trail = cur?.trail?.name || cur?.map?.name || 'this trail';
      el.innerHTML = `
        <h2 class="lp-title">Challenge a friend</h2>
        <p class="lp-sub">Race your friends' ghosts. No account needed: a link carries your run.</p>
        <ol class="fr-steps">
          <li><b>Race in Challenge</b><span>Switch to Challenge next to the Ride button and finish a run.</span></li>
          <li><b>Copy the link</b><span>On the results screen, press Copy challenge link.</span></li>
          <li><b>Send it</b><span>Your friend races your ghost on the same trail and sees who won by how much.</span></li>
        </ol>
        <button type="button" class="lp-btn fr-go" data-race data-autofocus>Race ${esc(trail)}<small>Challenge mode, then share your time</small></button>
        ${net.available ? `<div class="lp-status ${esc(net.status)}"><i></i>${esc(net.statusText)}</div>` : '<p class="lp-hint">Live rides with friends on the same mountain are on our list.</p>'}`;
      el.querySelector('[data-race]').addEventListener('click', () => { ctx.setMode?.('challenge'); ctx.ride(); });
    };
    render();
    ctx.on('service', ({ name }) => { if (name === 'network') render(); });
    ctx.on('trailSelected', render);
  },
});
