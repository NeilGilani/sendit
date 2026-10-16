// Character tab: dress the rider. Pick a whole colourway (all five clothing slots at once) or mix
// colourways per piece. Everything goes through the profile (ctx.profile.equip(itemId, variantId) →
// 'loadout'); the preview rider and the game rider re-dress themselves from that event (rider.js).
// Garments and colourways are data: src/character/outfits.js (see docs/character.md).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';
import { COLORWAYS, OUTFIT_SLOTS } from '../../character/outfits.js';

/** The colourway shared by every clothing slot, or null when the outfit is mixed. */
function currentColorway(ctx) {
  const ids = ctx.profile.outfit().map((o) => o.variant?.id);
  return ids.every((id) => id === ids[0]) ? ids[0] : null;
}

function wearColorway(ctx, id) {
  for (const o of ctx.profile.outfit()) if (o.item && o.item.variants.some((v) => v.id === id)) ctx.profile.equip(o.item.id, id);
}

// The five colours that sum a colourway up: jacket, panel, pants, helmet, lens.
const chips = (cw) => [cw.jacket.base, cw.jacket.panel, cw.pants.base, cw.helmet.base, cw.goggles.lens];

registerLobbyTab({
  id: 'character',
  label: 'Character',
  order: 20,
  icon: ICONS.character,
  status: 'ready',
  shot: 'full',

  mount(el, ctx) {
    el.innerHTML = `
      <h2 class="lp-title">Character</h2>
      <p class="lp-sub">Dress your rider. Your pick is saved to your profile.</p>
      <div class="ch-ways" role="group" aria-label="Colourway">
        ${Object.entries(COLORWAYS).map(([id, cw]) => `
          <button type="button" class="ch-way" data-cw="${esc(id)}" aria-pressed="false" title="${esc(cw.blurb)}">
            <span class="ch-chips">${chips(cw).map((c) => `<i style="background:${esc(c)}"></i>`).join('')}</span>
            <b>${esc(cw.name)}</b>
            <span class="eq-check">${ICONS.check}</span>
          </button>`).join('')}
      </div>
      <h3 class="lp-h3">Mix and match</h3>
      <ul class="ch-slots"></ul>
      <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> next colourway</span><span class="g-kb">Pick a colourway, or one swatch per piece</span></p>`;

    el.querySelectorAll('.ch-way').forEach((b) => b.addEventListener('click', () => wearColorway(ctx, b.dataset.cw)));
    const list = el.querySelector('.ch-slots');
    list.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-item]');
      if (b) ctx.profile.equip(b.dataset.item, b.dataset.variant);
    });

    const render = () => {
      // Keep keyboard / gamepad focus on the same swatch across the re-render.
      const f = document.activeElement?.closest?.('.ch-slots button');
      const keep = f && { item: f.dataset.item, slot: f.closest('li')?.dataset.slot, i: [...f.parentNode.children].indexOf(f) };
      const cur = currentColorway(ctx);
      el.querySelectorAll('.ch-way').forEach((b) => {
        const on = b.dataset.cw === cur;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      list.innerHTML = ctx.profile.outfit().map((o) => {
        if (!o.item) return '';
        return `<li data-slot="${esc(o.slot)}">
          <span class="lp-k">${esc(ctx.catalog.SLOTS[o.slot].label)}</span>
          <span class="ch-item"><b>${esc(o.item.name)}</b><small>${esc(o.variant?.name || '')}</small></span>
          <span class="ch-sw">${o.item.variants.map((v) => `
            <button type="button" class="${v.id === o.variant?.id ? 'on' : ''}" data-item="${esc(o.item.id)}" data-variant="${esc(v.id)}"
              title="${esc(v.name)}" aria-label="${esc(`${o.item.name}: ${v.name}`)}" aria-pressed="${v.id === o.variant?.id}">
              <i style="background:${esc(v.colors?.base || v.colors?.lens || '#888')}"></i></button>`).join('')}</span>
        </li>`;
      }).join('');
      if (keep) list.querySelector(`li[data-slot="${keep.slot}"] .ch-sw`)?.children[keep.i]?.focus();
    };
    render();
    ctx.on('loadout', (e) => { if (!e.slot || OUTFIT_SLOTS.includes(e.slot)) render(); });
  },

  onAction(action, ctx) {
    if (action !== 'alt2') return false;
    const ids = Object.keys(COLORWAYS);
    const cur = currentColorway(ctx);
    wearColorway(ctx, ids[(ids.indexOf(cur) + 1) % ids.length]);
    return true;
  },
});
