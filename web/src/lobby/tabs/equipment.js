// Equipment tab (real): choose Skis or Snowboard. The choice is saved in the profile
// (profileStore.setEquipment → 'loadout' event); the stage and the game rider react to that event.
// Shows the equipped item for the chosen type from the catalog: name, stats, colourway, parts.
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { EQUIPMENT_TYPES, STATS, SLOTS } from '../../profile/catalog.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

function toggle(ctx) {
  const p = ctx.profile;
  p.setEquipment(p.equipment === 'skis' ? 'snowboard' : 'skis');
}

registerLobbyTab({
  id: 'equipment',
  label: 'Equipment',
  order: 10,
  icon: ICONS.equipment,
  shot: 'gear',

  mount(el, ctx) {
    el.innerHTML = `
      <h2 class="lp-title">Equipment</h2>
      <p class="lp-sub">Choose what you ride. Your pick is saved to your profile.</p>
      <div class="eq-choice" role="group" aria-label="Ride with">
        ${Object.values(EQUIPMENT_TYPES).map((t) => `
          <button type="button" class="eq-opt" data-type="${t.id}" aria-pressed="false">
            <span class="eq-ico">${ICONS[t.id] || ''}</span>
            <span class="eq-txt"><b>${esc(t.label)}</b><small>${esc(t.blurb)}</small></span>
            <span class="eq-check">${ICONS.check}</span>
          </button>`).join('')}
      </div>
      <article class="eq-card" aria-live="polite"></article>
      <p class="eq-note" hidden></p>
      <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> quick swap</span><span class="g-kb">Click a card or press <kbd>Enter</kbd></span></p>`;

    el.querySelectorAll('.eq-opt').forEach((b) => b.addEventListener('click', () => {
      if (!ctx.profile.setEquipment(b.dataset.type)) ctx.stage.setEquipment(b.dataset.type);   // re-hop when re-picked
    }));

    const card = el.querySelector('.eq-card');
    const note = el.querySelector('.eq-note');

    const render = () => {
      const type = ctx.profile.equipment;
      el.querySelectorAll('.eq-opt').forEach((b) => {
        const on = b.dataset.type === type;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const gear = ctx.profile.activeGear(type);
      const main = gear[0];
      const item = main?.item;
      if (!item) { card.innerHTML = '<p class="lp-sub">No item equipped.</p>'; return; }
      const colors = Object.values(main.variant?.colors || {});
      card.innerHTML = `
        <div class="eq-card-head">
          <span class="eq-slot">${esc(SLOTS[item.slot].label)}</span>
        </div>
        <div class="eq-name">${esc(item.name)}</div>
        <div class="eq-brand">${esc(item.brand)}${main.variant ? ` · ${esc(main.variant.name)}` : ''}</div>
        <p class="eq-desc">${esc(item.description)}</p>
        <div class="eq-stats">
          ${Object.entries(STATS).map(([k, s]) => {
            const v = item.stats[k] ?? 0;
            return `<span>${esc(s.label)}</span><span class="eq-bar"><i style="--v:${(v / 10).toFixed(2)}"></i></span><b>${v}</b>`;
          }).join('')}
        </div>
        <div class="eq-foot">
          <span class="eq-swatches" title="Colourway">${colors.map((col) => `<i style="background:${esc(col)}"></i>`).join('')}</span>
          <span class="eq-parts">${gear.slice(1).filter((g) => g.item).map((g) => `${esc(SLOTS[g.slot].label)}: <b>${esc(g.item.name)}</b>`).join(' · ')}</span>
        </div>
        <div class="eq-more">${ICONS.sparkle}<span>More ${type === 'skis' ? 'skis' : 'boards'} drop from cases: wear them in the Locker</span></div>`;
      renderMode();
    };

    // Only if the rider cannot swap gear (rider.setEquipment missing): say why the board is not shown.
    const renderMode = () => {
      note.hidden = !(ctx.profile.equipment === 'snowboard' && ctx.stage.gearMode === 'unsupported');
      note.textContent = 'The snowboard preview is unavailable in this build; the rider keeps skis.';
    };

    render();
    ctx.on('loadout', render);
    ctx.on('lobbyGearMode', renderMode);
  },

  onAction(action, ctx) {
    if (action !== 'alt2') return false;
    toggle(ctx);
    return true;
  },
});
