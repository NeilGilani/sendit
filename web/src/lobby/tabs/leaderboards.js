// Leaderboards tab (minimal): best scores for the current map from services.leaderboard
// (LocalLeaderboard today — this browser only).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc, fmtDate, fmtKm } from './common.js';

registerLobbyTab({
  id: 'leaderboards',
  label: 'Rankings',
  order: 50,
  icon: ICONS.leaderboards,
  shot: 'full',

  mount(el, ctx) {
    let alive = true;
    const render = async () => {
      const lb = ctx.services.leaderboard;
      const cur = ctx.maps.current();
      const mapId = cur?.map.id;
      el.innerHTML = `
        <h2 class="lp-title">Rankings</h2>
        <p class="lp-sub">${esc(cur?.map.mountain?.name || cur?.map.name || 'This mountain')} · ${lb.scope === 'local' ? 'best rides in this browser' : 'global'}</p>
        <div class="lb-table"><div class="mp-loading">Loading…</div></div>
        <p class="lp-hint">${lb.scope === 'local' ? 'Want to race someone? Finish a Challenge run and send them the challenge link from the results screen.' : ''}</p>`;
      const rows = mapId ? await lb.getTop(mapId, { limit: 10 }) : [];
      if (!alive) return;
      const table = el.querySelector('.lb-table');
      if (!rows.length) {
        table.innerHTML = '<div class="lp-empty">No rides here yet. Ride this mountain and your best scores land here.</div>';
        return;
      }
      table.innerHTML = rows.map((r) => `
        <div class="lb-row${r.rank === 1 ? ' top' : ''}">
          <span class="lb-rank">${r.rank}</span>
          <span class="lb-who"><b>${esc(r.name)}</b><small>${esc(r.equipment)} · ${fmtKm(r.distance)} · ${fmtDate(r.at)}</small></span>
          <span class="lb-score">${r.score.toLocaleString()}</span>
        </div>`).join('');
    };
    render();
    ctx.on('rideRecorded', render);
    ctx.on('service', ({ name }) => { if (name === 'leaderboard') render(); });
    return () => { alive = false; };
  },
});
