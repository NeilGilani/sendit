// Maps tab (minimal): every registered map (maps/registry.js) with its variants. Picking one saves
// it to the profile and reloads the page, because maps are built during boot.
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';

function switchTo(ctx, map, variant) {
  ctx.profile.setMap(map.id, variant ?? null);
  ctx.toast(`Loading ${map.name}…`);
  const q = new URLSearchParams(location.search);
  for (const k of ['map', 'resort', 'run', 'kicker', 'at', 'ride']) q.delete(k);
  setTimeout(() => { location.search = q.toString(); if (!q.toString()) location.reload(); }, 350);
}

registerLobbyTab({
  id: 'maps',
  label: 'Maps',
  order: 30,
  icon: ICONS.maps,
  shot: 'wide',

  mount(el, ctx) {
    const cur = ctx.maps.current();
    const isCurrent = (map, v) => cur?.map.id === map.id && (!v || (cur.variant && JSON.stringify(cur.variant) === JSON.stringify(v)));
    el.innerHTML = `
      <h2 class="lp-title">Maps</h2>
      <p class="lp-sub">Where you ride. More hand-built maps are coming.</p>
      <div class="mp-list"></div>`;
    const list = el.querySelector('.mp-list');
    let alive = true;
    for (const map of ctx.maps.list()) {
      const card = document.createElement('div');
      card.className = 'mp-card';
      card.innerHTML = `
        <div class="mp-thumb" style="${map.thumbnail ? `background-image:url(&quot;${map.thumbnail}&quot;)` : ''}"></div>
        <div class="mp-body">
          <div class="mp-name">${esc(map.name)}${map.experimental ? ' <span class="lp-pill subtle">Experimental</span>' : ''}${isCurrent(map) ? ' <span class="lp-pill on">Current</span>' : ''}</div>
          <div class="mp-desc">${esc(map.description)}</div>
          <div class="mp-actions"></div>
        </div>`;
      const actions = card.querySelector('.mp-actions');
      if (!map.variants) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lp-btn';
        b.textContent = isCurrent(map) ? 'Loaded' : 'Ride here';
        b.disabled = isCurrent(map);
        b.addEventListener('click', () => switchTo(ctx, map, null));
        actions.appendChild(b);
      } else {
        actions.innerHTML = '<span class="mp-loading">Loading runs…</span>';
        map.variants().then((vs) => {
          if (!alive) return;
          actions.innerHTML = '';
          if (!vs.length) { actions.innerHTML = '<span class="mp-loading">No data built for this map.</span>'; return; }
          const groups = new Map();
          for (const v of vs) { if (!groups.has(v.group)) groups.set(v.group, []); groups.get(v.group).push(v); }
          for (const [group, runs] of groups) {
            const g = document.createElement('details');
            g.className = 'mp-group';
            g.innerHTML = `<summary>${esc(group)}</summary>`;
            for (const v of runs) {
              const b = document.createElement('button');
              b.type = 'button';
              b.className = 'lp-btn small';
              const here = isCurrent(map, v.value);
              b.innerHTML = `${esc(v.name)}<small>${esc(v.meta || '')}${here ? ' · current' : ''}</small>`;
              b.addEventListener('click', () => switchTo(ctx, map, v.value));
              g.appendChild(b);
            }
            actions.appendChild(g);
          }
        });
      }
      list.appendChild(card);
    }
    return () => { alive = false; };
  },
});
