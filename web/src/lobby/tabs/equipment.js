// Gear tab (Locker → Gear): choose Skis or Snowboard, then see every ski / board you own side by side with
// its ratings on the card (speed, carve, control, park, powder from the real specs: lobby/gearAdvisor.js),
// what each is best at, the ★ pick for your playstyle and the loaded mountain, deltas vs what you ride on
// hover / focus, and a side-by-side compare. Click a card to ride it. The choice is saved in the profile
// (profileStore.setEquipment / equip → 'loadout' event); the stage and the game rider react to that event.
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { EQUIPMENT_TYPES, SLOTS } from '../../profile/catalog.js';
import { artHtml } from '../cases/itemIcons.js';
import { itemArt } from '../cases/art.js';
import { caseSfx } from '../cases/sfx.js';
import { esc } from './common.js';
import { shortName } from '../gearAdvisor.js';
import { gearAdvice, statBars, badgeChips, pickHtml, compareHtml, compareState, TYPE_SLOT, GEAR_ICONS } from '../gearUi.js';

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
      <h2 class="lp-title">Gear</h2>
      <div class="eq-choice" role="group" aria-label="Ride with">
        ${Object.values(EQUIPMENT_TYPES).map((t) => `
          <button type="button" class="eq-opt" data-type="${t.id}" aria-pressed="false">
            <span class="eq-ico">${ICONS[t.id] || ''}</span>
            <span class="eq-txt"><b>${esc(t.label)}</b><small>${esc(t.blurb)}</small></span>
            <span class="eq-check">${ICONS.check}</span>
          </button>`).join('')}
      </div>
      <div class="gr-root" aria-live="polite"></div>
      <p class="eq-note" hidden></p>
      <p class="lp-hint"><span class="g-pad"><kbd>Y</kbd> quick swap</span><span class="g-kb">Click a card to ride it · hover for the difference</span></p>`;

    el.querySelectorAll('.eq-opt').forEach((b) => b.addEventListener('click', () => {
      if (!ctx.profile.setEquipment(b.dataset.type)) ctx.stage.setEquipment(b.dataset.type);   // re-hop when re-picked
    }));

    const root = el.querySelector('.gr-root');
    const note = el.querySelector('.eq-note');
    // Compare picks survive re-renders (and arrive from the Skins tab via compareState).
    let slot = TYPE_SLOT[ctx.profile.equipment];
    if (compareState.slot !== slot) compareState.picks = [];

    const render = () => {
      const type = ctx.profile.equipment;
      el.querySelectorAll('.eq-opt').forEach((b) => {
        const on = b.dataset.type === type;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const s = TYPE_SLOT[type];
      if (s !== slot) { slot = s; compareState.picks = []; }
      compareState.slot = slot;
      const adv = gearAdvice(ctx.profile, slot, ctx.maps?.current?.());
      const eq = adv.equipped;
      const byKey = new Map(adv.items.map((i) => [i.key, i]));
      compareState.picks = compareState.picks.filter((k) => byKey.has(k));
      // Compare: two picks → those two; one pick → it vs what you ride.
      let pair = null;
      if (compareState.picks.length === 2) pair = compareState.picks.map((k) => byKey.get(k));
      else if (compareState.picks.length === 1 && eq && compareState.picks[0] !== eq.key) pair = [eq, byKey.get(compareState.picks[0])];
      const noun = slot === 'skis' ? 'skis' : 'boards';
      const parts = ctx.profile.activeGear(type).slice(1).filter((g) => g.item);
      root.innerHTML = `
        ${pickHtml(adv)}
        ${pair ? `<section class="gr-cmp" aria-label="Compare">
            <div class="gr-cmp-top"><span class="lp-h3">${GEAR_ICONS.compare} Compare</span><button type="button" class="gr-x" data-gr-close aria-label="Close compare">✕</button></div>
            ${compareHtml(pair[0], pair[1])}
          </section>` : compareState.picks.length === 1 ? '<p class="gr-cmp-hint">Pick another one to compare with.</p>' : ''}
        <div class="gr-head"><span class="lp-h3">Your ${noun} · ${adv.items.length}</span><span class="gr-legend">${eq ? 'vs riding: <i class="up">▲</i> better <i class="down">▼</i> worse' : ''}</span></div>
        <div class="gr-list" role="list">${adv.items.map((it) => {
          const pick = adv.rec?.key === it.key;
          const cmpOn = compareState.picks.includes(it.key);
          return `<div class="gr-card${it.equipped ? ' on' : ''}${pick ? ' pick' : ''}${cmpOn ? ' cmp' : ''}" role="listitem" data-key="${esc(it.key)}">
            <button type="button" class="gr-card-main" data-gr-wear="${esc(it.key)}" aria-pressed="${it.equipped}" aria-label="${esc(`${it.name}${it.equipped ? ', riding' : ', ride it'}`)}">
              ${artHtml(it.key, itemArt(it.item, it.variant), { cls: 'gr-art', prio: 2 })}
              <span class="gr-card-body">
                <span class="gr-card-top"><b class="gr-name">${esc(shortName(it.name))}</b>${it.equipped ? '<span class="gr-tag on">Riding</span>' : ''}</span>
                ${badgeChips(adv.badges[it.key], { pick })}
                ${statBars(it.stats, it.equipped ? null : eq?.stats)}
              </span>
            </button>
            <button type="button" class="gr-cmpbtn${cmpOn ? ' on' : ''}" data-gr-cmp="${esc(it.key)}" aria-pressed="${cmpOn}" title="${it.equipped ? 'Compare' : 'Compare with what you ride'}">${GEAR_ICONS.compare}<span>Compare</span></button>
          </div>`;
        }).join('')}</div>
        ${adv.items.length < 2 ? `<div class="eq-more">${ICONS.sparkle}<span>More ${noun} drop from cases: each rides differently</span></div>` : ''}
        ${parts.length ? `<p class="gr-parts">${parts.map((g) => `${esc(SLOTS[g.slot].label)}: <b>${esc(g.item.name)}</b>`).join(' · ')}</p>` : ''}`;
      wire();
      renderMode();
    };

    const wear = (key) => {
      const [id, vid] = key.split(':');
      const item = ctx.catalog.getItem(id);
      if (!item) return;
      if (item.equipment && ctx.profile.equipment !== item.equipment) ctx.profile.setEquipment(item.equipment);
      if (ctx.profile.equip(id, vid)) caseSfx.click();
      compareState.picks = compareState.picks.filter((k) => k !== key || compareState.picks.length === 2);
      render();
      root.querySelector(`[data-gr-wear="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    };
    const toggleCompare = (key) => {
      const p = compareState.picks;
      compareState.picks = p.includes(key) ? p.filter((k) => k !== key) : [...p, key].slice(-2);
      caseSfx.click();
      render();
      const sec = root.querySelector('.gr-cmp');
      if (sec) sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      root.querySelector(`[data-gr-cmp="${CSS.escape(key)}"]`)?.focus({ preventScroll: true });
    };
    const wire = () => {
      root.querySelectorAll('[data-gr-wear]').forEach((b) => b.addEventListener('click', () => wear(b.dataset.grWear)));
      root.querySelectorAll('[data-gr-cmp]').forEach((b) => b.addEventListener('click', () => toggleCompare(b.dataset.grCmp)));
      root.querySelector('[data-gr-close]')?.addEventListener('click', () => { compareState.picks = []; caseSfx.click(); render(); });
      // The pick: compare it with what you ride (or jump to its card when you already ride it).
      root.querySelectorAll('[data-gr-focus]').forEach((b) => b.addEventListener('click', () => {
        const key = b.dataset.grFocus;
        const card = root.querySelector(`.gr-card[data-key="${CSS.escape(key)}"]`);
        if (card?.classList.contains('on')) { card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); card.querySelector('.gr-card-main')?.focus({ preventScroll: true }); return; }
        compareState.picks = [key];
        caseSfx.click();
        render();
        root.querySelector('.gr-cmp')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }));
    };

    // Only if the rider cannot swap gear (rider.setEquipment missing): say why the board is not shown.
    const renderMode = () => {
      note.hidden = !(ctx.profile.equipment === 'snowboard' && ctx.stage.gearMode === 'unsupported');
      note.textContent = 'The snowboard preview is unavailable in this build; the rider keeps skis.';
    };

    render();
    ctx.on('loadout', render);
    ctx.on('rewards', render);
    ctx.on('lobbyGearMode', renderMode);
  },

  onAction(action, ctx) {
    if (action !== 'alt2') return false;
    toggle(ctx);
    return true;
  },
});
