// Gear stats UI shared by the Locker's Gear sub-tab (tabs/equipment.js) and the skis / board slots of the
// Skins sub-tab (tabs/locker.js): rating bars with deltas vs the equipped piece, "best at" badges, the
// ★ pick and the side-by-side compare. The numbers come from gearAdvisor.js (pure); this file only reads
// the profile / progression and builds HTML. Styles: tabs/gear.css (design system v2 tokens).
import './tabs/gear.css';
import { getEquipmentSpec } from '../equipment/registry.js';
import { listMaps } from '../maps/registry.js';
import { progression } from '../progression/index.js';
import { GEAR_STATS, BADGES, gearStats, gearDetails, bestAt, recommend, recommendForMap, statDelta, shortName } from './gearAdvisor.js';
import { esc } from './tabs/common.js';

/** Gear slot → equipment physics type. */
export const SLOT_TYPE = { skis: 'ski', board: 'snowboard' };
export const TYPE_SLOT = { skis: 'skis', snowboard: 'board' };
export const isGearSlot = (slot) => !!SLOT_TYPE[slot];

// One line-icon set (24×24, currentColor, like lobby/icons.js) for the stats and badges.
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
export const GEAR_ICONS = {
  speed: svg('<path d="M4 7h7M2.5 12h8M4 17h7"/><path d="M13 5.5l6.5 6.5-6.5 6.5"/>'),
  carve: svg('<path d="M5 20c0-6 14-6 14-12"/><path d="M15.5 4.5L19 8l-3.5 1"/>'),
  control: svg('<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.6"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/>'),
  park: svg('<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.6 4.2v4.3h-4.3"/><path d="M9 12.5l2 2 4-4.5"/>'),
  powder: svg('<path d="M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6"/><path d="M9.6 4l2.4 2 2.4-2M9.6 20l2.4-2 2.4 2"/>'),
  star: svg('<path d="M12 2.8l2.75 5.8 6.35.75-4.7 4.35 1.25 6.3L12 16.9 6.35 20l1.25-6.3L2.9 9.35l6.35-.75z" fill="currentColor"/>', 'stroke-width="1.4"'),
  compare: svg('<path d="M8 4v16M16 4v16"/><path d="M4 8l4-4 4 4M12 16l4 4 4-4"/>'),
  mountain: svg('<path d="M2.5 19.5l6.5-12 4 7 2.5-4 6 9z"/>'),
};
const BADGE_ICON = { fastest: 'speed', carver: 'carve', control: 'control', park: 'park', powder: 'powder' };

/** Owned pieces of one gear slot as advisor items: [{ key, name, type, spec, item, variant, equipped }]. */
export function ownedGear(P, slot) {
  const type = SLOT_TYPE[slot];
  const cur = P.equipped(slot);
  const curKey = cur ? `${cur.item.id}:${cur.variant.id}` : null;
  return P.ownedIn(slot).filter((o) => o.item.model?.kind === 'equipment').map((o) => {
    const spec = getEquipmentSpec(type, o.item.model.ref);
    return { key: o.key, name: o.item.name, type, spec, item: o.item, variant: o.variant, entry: o.entry, equipped: o.key === curKey, stats: gearStats(type, spec) };
  });
}

const lifeStats = () => { try { return progression.core.state.life; } catch { return {}; } };

/**
 * Everything the gear UI shows for one slot: items (with stats), badges, the overall pick, the pick for
 * the loaded mountain, and the equipped item. `mapInfo` = ctx.maps.current() (may be null).
 */
export function gearAdvice(P, slot, mapInfo = null) {
  const items = ownedGear(P, slot);
  const maps = listMaps();
  const nameOf = (id) => maps.find((m) => m.id === id)?.mountain?.name || id;
  const badges = bestAt(items);
  const rec = recommend(items, { maps, life: lifeStats(), stats: P.profile.stats, mapName: nameOf });
  const map = mapInfo?.map || null;
  const mapRec = map ? recommendForMap(items, map) : null;
  return { slot, type: SLOT_TYPE[slot], items, badges, rec, mapRec, map, equipped: items.find((i) => i.equipped) || null };
}

// ------------------------------------------------------------------------------------- HTML builders
const fmt = (v) => v.toFixed(1);
const fmtDelta = (d) => (d > 0 ? `▲${fmt(d)}` : d < 0 ? `▼${fmt(-d)}` : '=');

/**
 * Rating bars. `ref` = the equipped item's stats: the bar shows the difference as a green / red segment
 * and a ▲ / ▼ number (visible on hover / focus unless `opts.showDelta`). `opts.compact` = no labels.
 */
export function statBars(stats, ref = null, opts = {}) {
  const d = ref ? statDelta(ref, stats) : null;
  return `<div class="gr-bars${opts.compact ? ' compact' : ''}${opts.showDelta ? ' show-d' : ''}">${GEAR_STATS.map((s) => {
    const v = stats[s.id];
    const dv = d ? d[s.id] : 0;
    // Plain: the fill shows the value. With deltas shown: the fill drops to the lower of the two and the
    // difference becomes a green (gain) or red (loss vs what you ride) segment, like Destiny / Diablo.
    const base = d ? Math.min(v, ref[s.id]) : v;
    const seg = d ? Math.abs(dv) : 0;
    return `<div class="gr-row" title="${esc(`${s.label} ${fmt(v)}: ${s.tip}`)}">
      ${opts.compact ? '' : `<span class="gr-lab">${s.short}</span>`}
      <span class="gr-bar" role="meter" aria-label="${s.label}${d && dv ? ` (${dv > 0 ? '+' : '−'}${fmt(Math.abs(dv))} vs riding)` : ''}" aria-valuemin="1" aria-valuemax="10" aria-valuenow="${v}"><i class="gr-fill" style="--v:${(v / 10).toFixed(3)};--b:${(base / 10).toFixed(3)}"></i>${seg >= 0.05 ? `<i class="gr-seg ${dv > 0 ? 'up' : 'down'}" style="--a:${(base / 10).toFixed(3)};--w:${(seg / 10).toFixed(3)}"></i>` : ''}</span>
      ${opts.compact ? '' : `<b class="gr-val">${fmt(v)}</b>`}
      ${d && !opts.compact ? `<em class="gr-d ${dv > 0 ? 'up' : dv < 0 ? 'down' : 'eq'}">${fmtDelta(dv)}</em>` : ''}
    </div>`;
  }).join('')}</div>`;
}

/** "Best at" chips (+ the ★ pick first). `short` = icons only (tiles). */
export function badgeChips(ids = [], { pick = false, short = false } = {}) {
  const chips = [];
  if (pick) chips.push(`<span class="gr-badge pick" title="Recommended for you">${GEAR_ICONS.star}${short ? '' : '<span>Pick</span>'}</span>`);
  for (const id of ids) chips.push(`<span class="gr-badge" title="${esc(BADGES[id].label)}">${GEAR_ICONS[BADGE_ICON[id]]}${short ? '' : `<span>${esc(BADGES[id].label)}</span>`}</span>`);
  return chips.length ? `<span class="gr-badges${short ? ' short' : ''}">${chips.join('')}</span>` : '';
}

/** The ★ recommended block: overall pick + its one-line reason, and the loaded mountain's pick. */
export function pickHtml(adv, { compareable = true } = {}) {
  const noun = adv.type === 'ski' ? 'skis' : 'boards';
  if (!adv.rec) {
    return `<div class="gr-pick none">${GEAR_ICONS.star}<span><b>No pick yet</b><small>Own two different ${noun} and we'll suggest the best for you. More drop from cases.</small></span></div>`;
  }
  const it = adv.rec.item;
  const map = adv.mapRec && adv.map ? `<button type="button" class="gr-mappick" data-gr-focus="${esc(adv.mapRec.key)}">${GEAR_ICONS.mountain}<span>Best for ${esc(adv.map.mountain?.name || adv.map.name)}: <b>${esc(shortName(adv.mapRec.item.name))}</b>${adv.mapRec.terrain.length ? ` <small>· ${esc(adv.mapRec.terrain.join(', '))}</small>` : ''}</span></button>` : '';
  return `<div class="gr-pick">
    <button type="button" class="gr-pick-main" data-gr-focus="${esc(it.key)}" aria-label="Recommended for you: ${esc(it.name)}. ${esc(adv.rec.reason)}">
      <span class="gr-pick-star">${GEAR_ICONS.star}</span>
      <span class="gr-pick-txt"><small>Recommended for you</small><b>${esc(it.name)}</b><em>${esc(adv.rec.reason)}</em></span>
      ${it.equipped ? '<span class="gr-pick-on">Riding</span>' : compareable ? '<span class="gr-pick-go">View</span>' : ''}
    </button>${map}
  </div>`;
}

const DETAIL_ROWS = [
  ['pop', 'Pop height', (v) => `${v} %`],
  ['spin', 'Spin rate', (v) => `${v} %`],
  ['butter', 'Pivot / butter', (v) => `${v} %`],
  ['grip', 'Edge grip', (v) => `${v} %`],
  ['stability', 'Stability', (v) => `${v} %`],
  ['float', 'Float', (v) => `${v} %`],
  ['radius', 'Turn radius', (v) => `${v} m`, true],
  ['length', 'Length', (v) => `${v} cm`, null],
  ['twin', 'Lands switch', (v) => (v ? 'Yes' : 'No')],
];

/**
 * Side-by-side compare of two items (a = left, b = right): mirrored bars per rating, the winner of each
 * row lit, then the physics numbers behind them. Buttons to ride either.
 */
export function compareHtml(a, b) {
  const da = gearDetails(a.type, a.spec), db = gearDetails(b.type, b.spec);
  const side = (it) => `<div class="gr-cmp-side">
      <b>${esc(shortName(it.name))}</b>
      ${it.equipped ? '<span class="gr-tag on">Riding</span>' : `<button type="button" class="lb-btn3 gr-ride" data-gr-wear="${esc(it.key)}">Ride this</button>`}
    </div>`;
  const rows = GEAR_STATS.map((s) => {
    const va = a.stats[s.id], vb = b.stats[s.id];
    const w = va > vb + 0.05 ? 'a' : vb > va + 0.05 ? 'b' : '';
    return `<div class="gr-cmp-row ${w ? `win-${w}` : ''}">
      <b class="gr-cmp-v a">${fmt(va)}</b><span class="gr-cmp-bar a"><i style="--v:${(va / 10).toFixed(3)}"></i></span>
      <span class="gr-cmp-lab">${GEAR_ICONS[s.id]}<span>${s.label}</span></span>
      <span class="gr-cmp-bar b"><i style="--v:${(vb / 10).toFixed(3)}"></i></span><b class="gr-cmp-v b">${fmt(vb)}</b>
    </div>`;
  }).join('');
  const det = DETAIL_ROWS.map(([k, label, f, lowWins]) => {
    const va = da[k], vb = db[k];
    let w = '';
    if (typeof va === 'number' && lowWins !== null && va !== vb) w = (lowWins ? va < vb : va > vb) ? 'a' : 'b';
    if (typeof va === 'boolean' && va !== vb) w = va ? 'a' : 'b';
    return `<div class="gr-det-row ${w ? `win-${w}` : ''}"><span class="a">${f(va)}</span><span class="gr-det-lab">${label}</span><span class="b">${f(vb)}</span></div>`;
  }).join('');
  return `<div class="gr-cmp-head">${side(a)}<span class="gr-cmp-vs">vs</span>${side(b)}</div>
    <div class="gr-cmp-rows">${rows}</div>
    <details class="gr-det"><summary>The numbers behind it</summary><div class="gr-det-rows">${det}</div>
      <p class="gr-det-note">% vs the stock ${a.type === 'ski' ? 'Ridge 172' : 'Atlas 156'}; turn radius: shorter carves tighter.</p></details>`;
}

/** Compare state shared by both tabs ("Compare" in Skins opens Gear with that item picked). */
export const compareState = { picks: [], slot: null };
export function queueCompare(slot, key) { compareState.slot = slot; compareState.picks = [key]; }
