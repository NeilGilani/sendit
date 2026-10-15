// Character / Clothing tab (coming soon): shows the current outfit from the catalog, read-only.
// Customization will equip items with ctx.profile.equip(itemId, variantId).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { comingSoon, esc } from './common.js';

registerLobbyTab({
  id: 'character',
  label: 'Character',
  order: 20,
  icon: ICONS.character,
  status: 'soon',
  shot: 'full',

  mount(el, ctx) {
    const outfit = ctx.profile.outfit();
    el.innerHTML = `
      ${comingSoon({
        icon: ICONS.character,
        title: 'Character',
        blurb: 'Dress your rider: jackets, pants, helmets, goggles and gloves in many colourways.',
        planned: ['Outfit pieces and colourways', 'Unlocks from scores and distance', 'Rider name and look'],
      })}
      <h3 class="lp-h3">Current outfit</h3>
      <ul class="lp-list">
        ${outfit.map((o) => `
          <li><span class="lp-swatch" style="background:${esc(o.variant?.colors?.base || '#888')}"></span>
          <span class="lp-k">${esc(ctx.catalog.SLOTS[o.slot].label)}</span><b>${esc(o.item?.name || '—')}</b></li>`).join('')}
      </ul>`;
  },
});
