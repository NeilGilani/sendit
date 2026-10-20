// Locker tab: everything you own, per slot, as rarity cards. Click one to wear it; the lobby rider
// re-dresses at once (profile 'loadout' event → rider.js / stage.js) and so does the game rider, so
// the look carries into rides. New skins wear a NEW tag until you have seen that slot. Skins you do
// not own yet come from cases (Cases tab). Replaces the old free colourway picker (Character tab).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';
import { cardHtml } from '../cases/opener.js';
import { artHtml } from '../cases/itemIcons.js';
import { itemArt } from '../cases/art.js';
import { caseSfx } from '../cases/sfx.js';
import { rarityOf } from '../../profile/rarity.js';
import { ownKey, listItems, rewardSkins } from '../../profile/catalog.js';
import { caseOdds, casePool } from '../../profile/rewards.js';
import { SERIES } from '../../profile/items.js';
import { getEquipmentSpec } from '../../equipment/registry.js';
import { gearStats } from '../gearAdvisor.js';
import { isGearSlot, SLOT_TYPE, gearAdvice, statBars, badgeChips, queueCompare, GEAR_ICONS } from '../gearUi.js';

/** Where an unowned skin drops and its chance per case: "First Chair Case · 1.75 % per case". */
function dropInfo(variant, key) {
  const series = variant.series === '*' ? Object.keys(SERIES) : [variant.series];
  const s = series[0];
  const pool = casePool(s)[variant.rarity];
  const each = caseOdds(s)[variant.rarity] / Math.max(1, pool.length);
  const where = variant.series === '*' ? 'every case' : SERIES[s].name;
  const pct = each >= 1 ? each.toFixed(1) : each >= 0.1 ? each.toFixed(2) : each.toFixed(3);
  return pool.some((e) => e.key === key) ? `Drops from ${where} · ${pct} % per case` : `Drops from ${where}`;
}

const SLOTS = [
  ['jacket', 'Jacket'], ['pants', 'Pants'], ['helmet', 'Helmet'], ['goggles', 'Goggles'], ['face', 'Face'], ['gloves', 'Gloves'],
  ['skis', 'Skis'], ['board', 'Board'],
];
/** Ratings of a skin's ski / board model (gear slots), or null. */
function statsOf(slot, item) {
  if (!isGearSlot(slot) || item.model?.kind !== 'equipment') return null;
  return gearStats(SLOT_TYPE[slot], getEquipmentSpec(SLOT_TYPE[slot], item.model.ref));
}

const SHOT = { skis: 'gear', board: 'gear', helmet: 'portrait', goggles: 'portrait', face: 'portrait' };
let lastSlot = 'jacket';

registerLobbyTab({
  id: 'locker',
  label: 'Skins',
  order: 20,
  icon: ICONS.character,
  status: 'ready',
  shot: 'full',

  mount(el, ctx) {
    let slot = lastSlot;
    let focusKey = null;
    let missingOn = false;     // show the skins you do not own yet as silhouettes
    const seenOnLeave = new Set();
    el.innerHTML = '<div class="lk-root"></div>';
    const root = el.firstChild;

    const total = (s) => listItems({ slot: s }).reduce((n, i) => n + i.variants.length, 0);

    const render = () => {
      const P = ctx.profile;
      // New first, then the rarest, starters last.
      const owned = P.ownedIn(slot).sort((a, b) => (!!(b.entry && !b.entry.seen) - !!(a.entry && !a.entry.seen))
        || (rarityOf(b.variant.rarity).rank - rarityOf(a.variant.rarity).rank) || (!!a.variant.starter - !!b.variant.starter));
      const cur = P.equipped(slot);
      const curKey = cur ? ownKey(cur.item.id, cur.variant.id) : null;
      const col = P.collection();
      const ownedKeys = new Set(owned.map((o) => o.key));
      const missingSkins = rewardSkins().filter(({ item, variant }) => item.slot === slot && !ownedKeys.has(ownKey(item.id, variant.id)))
        .map(({ item, variant }) => ({ item, variant, key: ownKey(item.id, variant.id), missing: true }))
        .sort((a, b) => rarityOf(b.variant.rarity).rank - rarityOf(a.variant.rarity).rank);
      // Skis / board: ratings on every tile, badges, the pick and deltas vs what you ride (gearUi.js).
      selByKey = new Map();
      previewKey = null;
      gear = isGearSlot(slot) ? gearAdvice(P, slot, ctx.maps?.current?.()) : null;
      const sel = owned.find((o) => o.key === (focusKey || curKey)) || (missingOn && missingSkins.find((o) => o.key === focusKey)) || owned[0];
      const missing = total(slot) - owned.length;
      root.innerHTML = `
        <h2 class="lp-title">Skins <span class="lp-pill gold">${Math.round(col.pct * 100)} % collected</span></h2>
        <p class="lp-sub">Wear anything you own. It shows on your rider here and in every ride.</p>
        <div class="lk-slots" role="tablist" aria-label="Slot">${SLOTS.map(([s, label]) => `
          <button type="button" role="tab" class="lk-slot${s === slot ? ' on' : ''}" data-slot="${s}" aria-selected="${s === slot}">${esc(label)}${P.newSkins(s).length ? '<i class="lk-dot"></i>' : ''}</button>`).join('')}</div>
        <div class="lk-grid${gear ? ' gear' : ''}" role="listbox" aria-label="${esc(slot)}">${owned.map((o) => {
          const rar = o.variant.rarity || 'common';
          const isNew = o.entry && !o.entry.seen;
          return `<button type="button" role="option" class="lk-item${o.key === curKey ? ' on' : ''}" data-key="${esc(o.key)}" aria-selected="${o.key === curKey}"
              title="${esc(`${o.item.name} | ${o.variant.name}`)}">
            ${isNew ? '<span class="lk-new">NEW</span>' : ''}${o.key === curKey ? `<span class="lk-eq">${ICONS.check}</span>` : o.entry?.n > 1 ? `<span class="lk-n">×${o.entry.n}</span>` : ''}
            ${cardHtml(o.key, rar).replace('class="cr-card', `class="cr-card${o.variant.starter ? ' starter' : ''}`)}
            ${gear ? tileStats(o) : ''}
          </button>`;
        }).join('')}${missingOn ? missingSkins.map((o) => `
          <button type="button" role="option" class="lk-item missing" data-miss="${esc(o.key)}" aria-selected="false" title="${esc(`${o.item.name} | ${o.variant.name} (not owned)`)}">
            ${cardHtml(o.variant.rarity === 'gold' ? null : o.key, o.variant.rarity, { icon: false }).replace('class="cr-card', 'class="cr-card missing')}
            ${gear && o.variant.rarity !== 'gold' ? tileStats(o) : ''}
          </button>`).join('') : ''}</div>
        ${sel ? selHtml(sel) : ''}
        <p class="lk-locked">${missing > 0 ? `${missing} more ${esc(SLOTS.find((x) => x[0] === slot)[1].toLowerCase())} skin${missing === 1 ? '' : 's'} to find in cases.
          <button type="button" class="lk-go" data-missing aria-pressed="${missingOn}">${missingOn ? 'Hide missing' : 'Show missing'}</button> · <button type="button" class="lk-go" data-go="cases">Open cases ›</button>` : 'You have them all.'}</p>
        <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> next slot</span><span class="g-kb">Click a card to wear it</span></p>`;
      root.querySelectorAll('[data-slot]').forEach((b) => b.addEventListener('click', () => setSlot(b.dataset.slot)));
      root.querySelectorAll('[data-key]').forEach((b) => {
        b.addEventListener('click', () => wear(b.dataset.key));
        b.addEventListener('focus', () => { if (focusKey !== b.dataset.key) { focusKey = b.dataset.key; } preview(b.dataset.key); });
        if (gear) b.addEventListener('pointerenter', () => preview(b.dataset.key));
      });
      if (gear) {
        root.querySelectorAll('[data-miss]').forEach((b) => b.addEventListener('pointerenter', () => preview(b.dataset.miss)));
        root.querySelector('.lk-grid')?.addEventListener('pointerleave', () => preview(null));
      }
      wireSel();
      root.querySelector('[data-go]')?.addEventListener('click', () => ctx.select('cases'));
      root.querySelector('[data-missing]')?.addEventListener('click', () => { missingOn = !missingOn; caseSfx.click(); render(); });
      root.querySelectorAll('[data-miss]').forEach((b) => b.addEventListener('click', () => { focusKey = b.dataset.miss; render(); root.querySelector(`[data-miss="${CSS.escape(focusKey)}"]`)?.focus({ preventScroll: true }); }));
      if (P.newSkins(slot).length) seenOnLeave.add(slot);
    };

    let gear = null;          // gearAdvice() for the skis / board slots, else null
    let selByKey = new Map(); // key → { item, variant, key, missing? } of everything on the grid
    const tileStats = (o) => {
      selByKey.set(o.key, o);
      const st = gear.items.find((i) => i.key === o.key)?.stats || statsOf(slot, o.item);
      if (!st) return '';
      return `<span class="gr-tile">${o.missing ? '<span class="gr-badges"></span>' : badgeChips(gear.badges[o.key], { pick: gear.rec?.key === o.key, short: true })}${statBars(st, null, { compact: true })}</span>`;
    };
    /** The selected / previewed skin under the grid; for gear also its ratings vs what you ride. */
    const selHtml = (sel) => {
      const r = rarityOf(sel.variant.rarity || 'common');
      let extra = '';
      const st = gear && statsOf(slot, sel.item);
      if (st) {
        const eq = gear.equipped;
        const isEq = eq && eq.key === sel.key;
        const pick = gear.rec?.key === sel.key;
        extra = `<div class="gr-sel-gear">
          ${sel.missing ? '' : badgeChips(gear.badges[sel.key], { pick })}
          ${pick ? `<p class="gr-sel-why">${esc(gear.rec.reason)}</p>` : ''}
          ${statBars(st, isEq ? null : eq?.stats, { showDelta: true })}
          <div class="gr-sel-foot">${isEq ? '<span>You ride this</span>' : `<span>vs ${esc(eq ? eq.name : 'riding')}</span>${sel.missing ? '' : `<button type="button" class="gr-sel-cmp" data-gr-cmp-go="${esc(sel.key)}">${GEAR_ICONS.compare}Compare</button>`}`}</div>
        </div>`;
      }
      return `<div class="lk-sel" style="--rc:${r.color}">${sel.missing ? '' : artHtml(sel.key, itemArt(sel.item, sel.variant), { cls: 'lk-sel-icon', prio: 2, hd: true })}
          <span class="lk-grade">${esc(sel.variant.starter ? 'Starter' : r.name)}${sel.missing ? ' · not owned yet' : ''}</span>
          <b>${esc(sel.variant.rarity === 'gold' && sel.missing ? '★ ??? ' : `${sel.item.name} | ${sel.variant.name}`)}</b>
          <p>${esc(sel.missing ? dropInfo(sel.variant, sel.key) : sel.item.description || '')}</p>${sel.variant.rarity === 'gold' && sel.missing ? '' : extra}</div>`;
    };
    const wireSel = () => {
      root.querySelector('[data-gr-cmp-go]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        queueCompare(slot, e.currentTarget.dataset.grCmpGo);
        caseSfx.click();
        ctx.select('equipment');
      });
    };
    /** Hover / focus preview: show a tile's details (gear: its ratings vs riding) without equipping it. */
    let previewKey = null;
    const preview = (key) => {
      if (!gear || key === previewKey) return;
      previewKey = key;
      const cur = root.querySelector('.lk-sel');
      const P = ctx.profile;
      const curKey = P.equipped(slot) ? ownKey(P.equipped(slot).item.id, P.equipped(slot).variant.id) : null;
      const o = selByKey.get(key ?? focusKey ?? curKey) || selByKey.get(curKey);
      if (!cur || !o) return;
      cur.outerHTML = selHtml(o);
      wireSel();
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
