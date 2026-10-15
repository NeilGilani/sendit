// Multiplayer tab (coming soon): shows the network service status (services.network).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { comingSoon, esc } from './common.js';

registerLobbyTab({
  id: 'multiplayer',
  label: 'Multiplayer',
  order: 40,
  icon: ICONS.multiplayer,
  status: 'soon',
  shot: 'wide',

  mount(el, ctx) {
    const render = () => {
      const net = ctx.services.network;
      el.innerHTML = `
        ${comingSoon({
          icon: ICONS.multiplayer,
          title: 'Multiplayer',
          blurb: 'Ride the same mountain with friends and see their lines in real time.',
          planned: ['Join or host a session', 'See other riders and their tracks', 'Race to the bottom'],
        })}
        <div class="lp-status ${net.status}"><i></i>${esc(net.statusText)}${net.available ? '' : ' · no server yet'}</div>`;
    };
    render();
    ctx.on('service', ({ name }) => { if (name === 'network') render(); });
  },
});
