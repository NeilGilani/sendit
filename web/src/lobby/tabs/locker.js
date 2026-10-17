// Locker tab: everything you own, per slot, as rarity cards. Click one to wear it; the lobby rider
// re-dresses at once (profile 'loadout' event → rider.js / stage.js) and so does the game rider, so
// the look carries into rides. New skins wear a NEW tag until you have seen that slot. Skins you do
// not own yet come from cases (Cases tab). Replaces the old free colourway picker (Character tab).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';
import { cardHtml } from '../cases/opener.js';
import { caseSfx } from '../cases/sfx.js';
import { rarityOf } from '../../profile/rarity.js';
import { ownKey, listItems } from '../../profile/catalog.js';

const SLOTS = [
  ['jacket', 'Jacket'], ['pants', 'Pants'], ['helmet', 'Helmet'], ['goggles', 'Goggles'], ['face', 'Face'], ['gloves', 'Gloves'],
  ['skis', 'Skis'], ['board', 'Board'],
];
const SHOT = { skis: 'gear', board: 'gear', helmet: 'portrait', goggles: 'portrait', face: 'portrait' };
let lastSlot = 'jacket';

registerLobbyTab({
  id: 'locker',
  label: 'Locker',
  order: 20,
  icon: ICONS.character,
  status: 'ready',
  shot: 'full',

  mount(el, ctx) {
    let slot = lastSlot;
    let focusKey = null;
    const seenOnLeave = new Set();
    el.innerHTML = '<div class="lk-root"></div>';
    const root = el.firstChild;

    const total = (s) => listItems({ slot: s }).reduce((n, i) => n + i.variants.length, 0);

    const render = () => {
      const P = ctx.profile;
      const owned = P.ownedIn(slot);
      const cur = P.equipped(slot);
      const curKey = cur ? ownKey(cur.item.id, cur.variant.id) : null;
      const col = P.collection();
      const sel = owned.find((o) => o.key === (focusKey || curKey)) || owned[0];
      const r = sel ? rarityOf(sel.variant.rarity || (sel.variant.starter ? 'common' : 'common')) : null;
      const missing = total(slot) - owned.length;
      root.innerHTML = `
        <h2 class="lp-title">Locker <span class="lp-pill" style="background:#ffe36a">${Math.round(col.pct * 100)} % collected</span></h2>
        <p class="lp-sub">Wear anything you own. It shows on your rider here and in every ride.</p>
        <div class="lk-slots" role="tablist" aria-label="Slot">${SLOTS.map(([s, label]) => `
          <button type="button" role="tab" class="lk-slot${s === slot ? ' on' : ''}" data-slot="${s}" aria-selected="${s === slot}">${esc(label)}${P.newSkins(s).length ? '<i class="lk-dot"></i>' : ''}</button>`).join('')}</div>
        <div class="lk-grid" role="listbox" aria-label="${esc(slot)}">${owned.map((o) => {
          const rar = o.variant.rarity || 'common';
          const isNew = o.entry && !o.entry.seen;
          return `<button type="button" role="option" class="lk-item${o.key === curKey ? ' on' : ''}" data-key="${esc(o.key)}" aria-selected="${o.key === curKey}"
              title="${esc(`${o.item.name} | ${o.variant.name}`)}">
            ${isNew ? '<span class="lk-new">NEW</span>' : ''}${o.key === curKey ? `<span class="lk-eq">${ICONS.check}</span>` : o.entry?.n > 1 ? `<span class="lk-n">×${o.entry.n}</span>` : ''}
            ${cardHtml(o.key, rar).replace('class="cr-card', `class="cr-card${o.variant.starter ? ' starter' : ''}`)}
          </button>`;
        }).join('')}</div>
        ${sel ? `<div class="lk-sel" style="--rc:${r.color}">
          <span class="lk-grade">${esc(sel.variant.starter ? 'Starter' : r.name)}</span>
          <b>${esc(sel.item.name)} | ${esc(sel.variant.name)}</b>
          <p>${esc(sel.item.description || '')}</p></div>` : ''}
        <p class="lk-locked">${missing > 0 ? `${missing} more ${esc(SLOTS.find((x) => x[0] === slot)[1].toLowerCase())} skin${missing === 1 ? '' : 's'} to find in cases. <a class="lk-go" data-go="cases">Open cases ›</a>` : 'You have them all.'}</p>
        <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> next slot</span><span class="g-kb">Click a card to wear it</span></p>`;
      root.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => setSlot(b.dataset.slot)));
      root.querySelectorAll('[data-key]').forEach((b) => {
        b.addEventListener('click', () => wear(b.dataset.key));
        b.addEventListener('focus', () => { if (focusKey !== b.dataset.key) { focusKey = b.dataset.key; } });
      });
      root.querySelector('[data-go]')?.addEventListener('click', () => ctx.select('cases'));
      if (P.newSkins(slot).length) seenOnLeave.add(slot);
    };

    const setSlot = (s) => {
      if (s === slot) return;
      if (seenOnLeave.has(slot)) { ctx.profile.markSeen(null, slot); seenOnLeave.delete(slot); }
      slot = lastSlot = s;
      focusKey = null;
      caseSfx.click();
      ctx.stage.setShot(SHOT[slot] || 'full');
      render();
      root.querySelector('.lk-slot.on')?.focus({ preventScroll: true });
    };

    const wear = (key) => {
      const [id, vid] = key.split(':');
      const item = ctx.catalog.getItem(id);
      if (!item) return;
      if (item.equipment && ctx.profile.equipment !== item.equipment) ctx.profile.setEquipment(item.equipment);
      focusKey = key;
      if (ctx.profile.equip(id, vid)) caseSfx.click();
      ctx.profile.markSeen(key);
      render();
      root.querySelector(`[data-key="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    };

    render();
    ctx.stage.setShot(SHOT[slot] || 'full');
    ctx.on('loadout', render);
    ctx.on('rewards', render);
    this._next = () => setSlot(SLOTS[(SLOTS.findIndex((x) => x[0] === slot) + 1) % SLOTS.length][0]);
    return () => { for (const s of seenOnLeave) ctx.profile.markSeen(null, s); };
  },

  onAction(action) {
    if (action !== 'alt2') return false;
    this._next?.();
    return true;
  },
});
