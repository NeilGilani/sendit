// Maps tab: the mountain browser (docs/maps.md). Two views in one panel:
//   • Mountains — a card per mountain (maps/registry.js listMountains): art, name, region, the
//     difficulty spread of its trails and its featured trails.
//   • Trails    — one mountain's trails with difficulty badges, length / vertical, the best score on
//     this device (the trail's local leaderboard), difficulty filters, and Ride.
// Picking a trail on the loaded map switches in place (no reload); another map (or a Lake Tahoe run
// on another resort) saves the choice and reloads. Everything is static data, so nothing loads.
// Input: mouse; keyboard (arrows move, Enter picks — Enter on the picked trail rides it, Backspace /
// Esc back to the mountains); gamepad (A pick / ride, Y ride the focused trail, B back).
import { registerLobbyTab } from '../tabs.js';
import { ICONS } from '../icons.js';
import { esc } from './common.js';
import { listMountains, getMountain, getTrail, needsReload, trailBoardId, DIFFICULTIES, DIFFICULTY_IDS } from '../../maps/registry.js';
import { difficultyBadge, trailStats } from '../../maps/badges.js';
import { storage } from '../../services/storage.js';
import { pisteMap } from './pistemap.js';
import './maps.css';

const VIEW_KEY = 'sendit.lobby.mountain';
const STAR = '<svg class="tr-star" viewBox="0 0 24 24" width="14" height="14" aria-label="Featured"><path d="M12 2.8l2.7 5.9 6.4.7-4.8 4.3 1.4 6.3L12 16.8 6.3 20l1.4-6.3L2.9 9.4l6.4-.7z" fill="currentColor"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 4.5v15l12-7.5z" fill="currentColor"/></svg>';
const RELOAD = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.6-5.9M20 4v5h-5"/></svg>';

/** The difficulty spread of a mountain: a stacked bar plus badge counts (only difficulties it has). */
function spreadHtml(m, { bar = true } = {}) {
  const total = m.trails.length || 1;
  const segs = DIFFICULTY_IDS.filter((d) => m.spread[d]);
  return `${bar ? `<div class="mt-bar" aria-hidden="true">${segs.map((d) => `<i class="d-${d}" style="flex:${m.spread[d] / total}"></i>`).join('')}</div>` : ''}
    <div class="mt-spread">${segs.map((d) => `<span title="${esc(DIFFICULTIES[d].label)}">${difficultyBadge(d, 15)}<b>${m.spread[d]}</b></span>`).join('')}</div>`;
}

/** CSS custom properties for a mountain: accent + art. `attr` = escaped for an HTML attribute. */
const thumbStyle = (m, attr = true) => {
  const q = attr ? '&quot;' : '"';
  return `--acc:${attr ? esc(m.accent) : m.accent};${m.thumbnail ? `--art:url(${q}${m.thumbnail}${q})` : ''}`;
};

registerLobbyTab({
  id: 'maps',
  label: 'Maps',
  order: 30,
  icon: ICONS.maps,
  shot: 'wide',

  mount(el, ctx) {
    const cur = () => ctx.maps.current();                      // { map, variant, trail (object), course }
    const curMountainId = () => cur()?.map.mountain.id;
    let view = storage.get(VIEW_KEY) || null;                   // null = the mountains grid, else a mountain id
    if (view && !getMountain(view)) view = null;
    let filter = 'all';
    let alive = true;
    const bests = new Map();                                     // board id → best score (null = none)

    const isCurrentTrail = (t) => cur()?.map.id === t.mapId && cur()?.trail?.id === t.id;

    // ------------------------------------------------------------ mountains grid
    const renderMountains = () => {
      const mtns = listMountains();
      el.innerHTML = `
        <h2 class="lp-title">Mountains</h2>
        <p class="lp-sub">${mtns.length} mountains · ${mtns.reduce((n, m) => n + m.trails.length, 0)} trails. Pick a mountain, then a trail.</p>
        <div class="mt-grid" role="list"></div>`;
      const grid = el.querySelector('.mt-grid');
      for (const m of mtns) {
        const here = m.id === curMountainId();
        const featured = m.trails.filter((t) => t.featured).slice(0, 3);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `mt-card${here ? ' here' : ''}`;
        b.setAttribute('role', 'listitem');
        b.dataset.mountain = m.id;
        if (here) b.dataset.autofocus = '';
        b.style.cssText = thumbStyle(m, false);
        b.innerHTML = `
          <span class="mt-art"><span class="mt-region">${esc(m.region)}</span>${here ? '<span class="mt-here">You are here</span>' : ''}${m.experimental ? '<span class="mt-exp">Real data</span>' : ''}</span>
          <span class="mt-body">
            <span class="mt-name">${esc(m.name)}</span>
            <span class="mt-blurb">${esc(m.blurb)}</span>
            ${spreadHtml(m)}
            <span class="mt-feat">${featured.map((t) => `<span>${difficultyBadge(t.difficulty, 12)}${esc(t.name)}</span>`).join('')}</span>
            <span class="mt-go">${m.trails.length} trail${m.trails.length === 1 ? '' : 's'} <span aria-hidden="true">›</span></span>
          </span>`;
        b.addEventListener('click', () => { ctx.sfx?.('ui_click', 0.3, 1.1); open(m.id, { focus: true }); });
        grid.appendChild(b);
      }
    };

    // ------------------------------------------------------------ one mountain's trails
    const renderTrails = (m) => {
      const here = m.id === curMountainId();
      const segs = DIFFICULTY_IDS.filter((d) => m.spread[d]);
      if (filter !== 'all' && !m.spread[filter]) filter = 'all';
      el.innerHTML = `
        <div class="mt-head" style="${thumbStyle(m)}">
          <button type="button" class="mt-back" aria-label="All mountains">${BACK}<span>Mountains</span><span class="g-kb"><kbd>Esc</kbd></span><span class="g-pad"><kbd>B</kbd></span></button>
          <div class="mt-hero">
            <small>${esc(m.region)}</small>
            <h2>${esc(m.name)}${here ? '<span class="mt-here-pill">You are here</span>' : ''}</h2>
            <p>${esc(m.blurb)}</p>
            ${spreadHtml(m, { bar: true })}
          </div>
          <div class="mt-pm"></div>
        </div>
        ${segs.length > 1 ? `<div class="tr-filters" role="radiogroup" aria-label="Difficulty">
          <button type="button" role="radio" data-f="all">All <b>${m.trails.length}</b></button>
          ${segs.map((d) => `<button type="button" role="radio" data-f="${d}" title="${esc(DIFFICULTIES[d].label)}">${difficultyBadge(d, 15)}<b>${m.spread[d]}</b></button>`).join('')}
        </div>` : ''}
        <div class="tr-list" role="list"></div>
        <p class="lp-hint tr-hint"><span class="g-kb"><kbd>Enter</kbd> pick · <kbd>Enter</kbd> again to ride · <kbd>Esc</kbd> mountains</span><span class="g-pad"><kbd>A</kbd> pick · <kbd>A</kbd> again or <kbd>Y</kbd> ride · <kbd>B</kbd> mountains</span><span class="g-touch">Tap a trail to pick it, tap again to ride</span></p>`;
      el.querySelector('.mt-back').addEventListener('click', () => { ctx.sfx?.('ui_click', 0.3, 0.95); open(null, { focus: true }); });
      el.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.f; fillTrails(m); markFilters(); }));
      markFilters();
      mountPisteMap(m);
      fillTrails(m);
    };

    // The piste map: only for the loaded mountain (it needs the course and the terrain).
    let pm = null;
    const mountPisteMap = (m) => {
      pm = null;
      const host = el.querySelector('.mt-pm');
      const c = cur();
      if (!host || m.id !== curMountainId() || !c?.course?.path?.length || !c.heightAt) { host?.remove(); return; }
      try {
        pm = pisteMap({ key: `${c.map.id}:${JSON.stringify(c.variant ?? null)}`, path: c.course.path, finishAt: c.course.finishAt,
          heightAt: c.heightAt, starts: c.starts || [], accent: m.accent });
      } catch (e) { console.warn('[maps] piste map failed', e); host.remove(); return; }
      host.appendChild(pm.el);
      el.querySelector('.mt-head').classList.add('has-pm');
      pm.select(c.trail?.id);
      pm.el.querySelectorAll('.pm-mk').forEach((mk) => mk.addEventListener('click', () => {
        const t = getTrail(c.map.id, mk.dataset.trail);
        if (t) pick(t);
      }));
    };

    const markFilters = () => el.querySelectorAll('[data-f]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.f === filter)));

    const fillTrails = (m) => {
      const list = el.querySelector('.tr-list');
      list.innerHTML = '';
      const trails = m.trails.filter((t) => filter === 'all' || t.difficulty === filter);
      let group = null;
      for (const t of trails) {
        if (t.group && t.group !== group) {
          group = t.group;
          const h = document.createElement('div');
          h.className = 'tr-group';
          h.textContent = group;
          list.appendChild(h);
        }
        list.appendChild(trailRow(t));
      }
      const focusRow = list.querySelector('.tr-row.on .tr-pick') || list.querySelector('.tr-pick');
      if (focusRow) focusRow.dataset.autofocus = '';
      loadBests(trails);
    };

    const trailRow = (t) => {
      const on = isCurrentTrail(t);
      const reload = needsReload(cur(), t.mapId, t.id);
      const row = document.createElement('div');
      row.className = `tr-row${on ? ' on' : ''}`;
      row.setAttribute('role', 'listitem');
      row.dataset.trail = t.id;
      row.dataset.map = t.mapId;
      const stats = trailStats(t);
      const board = trailBoardId(t.mapId, t.id);
      row.innerHTML = `
        <button type="button" class="tr-pick" aria-pressed="${on}" aria-label="${esc(`${t.name}, ${DIFFICULTIES[t.difficulty].label}`)}">
          <span class="tr-sign">${difficultyBadge(t.difficulty, 26)}</span>
          <span class="tr-main">
            <span class="tr-name">${esc(t.name)}${t.featured ? STAR : ''}${t.level ? `<i class="tr-level">${esc(t.level)}</i>` : ''}</span>
            <span class="tr-desc">${esc(t.description)}</span>
            <span class="tr-meta">${stats ? `<span>${esc(stats)}</span>` : ''}<span class="tr-best" data-board="${esc(board)}">${bests.has(board) ? bestText(bests.get(board)) : '&nbsp;'}</span></span>
          </span>
          ${on ? '<span class="tr-cur">Selected</span>' : ''}
        </button>
        <button type="button" class="tr-ride${reload ? ' reload' : ''}" title="${reload ? 'Loads this mountain, then rides' : 'Ride this trail'}">${reload ? RELOAD : PLAY}<span>${reload ? 'Load & ride' : 'Ride'}</span></button>`;
      row.querySelector('.tr-pick').addEventListener('click', () => {
        if (isCurrentTrail(t)) { ride(t); return; }   // picked already: Enter / A / tap again rides
        pick(t);
      });
      row.querySelector('.tr-pick').addEventListener('dblclick', () => ride(t));
      row.querySelector('.tr-ride').addEventListener('click', () => ride(t));
      const hot = (on) => pm?.highlight(on ? t.id : null);
      row.addEventListener('pointerenter', () => hot(true));
      row.addEventListener('pointerleave', () => hot(false));
      row.addEventListener('focusin', () => hot(true));
      row.addEventListener('focusout', () => hot(false));
      return row;
    };

    const bestText = (b) => (b ? `<span class="tr-pb">Best ${b.score.toLocaleString()}</span>` : '<span class="tr-none">No rides yet</span>');

    const loadBests = async (trails) => {
      const lb = ctx.services.leaderboard;
      for (const t of trails) {
        const board = trailBoardId(t.mapId, t.id);
        if (!bests.has(board)) {
          try { bests.set(board, await lb.getPersonalBest(board)); } catch { bests.set(board, null); }
        }
        if (!alive) return;
        const cell = el.querySelector(`.tr-best[data-board="${CSS.escape(board)}"]`);
        if (cell) cell.innerHTML = bestText(bests.get(board));
      }
    };

    // ------------------------------------------------------------ actions
    const pick = async (t) => {
      ctx.sfx?.('ui_click', 0.35, 1.2);
      if (needsReload(cur(), t.mapId, t.id)) {
        ctx.toast(`Loading ${listMountains().find((m) => m.maps.some((x) => x.id === t.mapId))?.name ?? ''} · ${t.name}…`);
        setTimeout(() => ctx.maps.selectTrail(t.mapId, t.id), 300);
        return;
      }
      await ctx.maps.selectTrail(t.mapId, t.id);
      if (!alive) return;
      ctx.toast(`${t.name} selected · Enter to ride`);
      const m = getMountain(view);
      if (m) { const id = t.id; renderTrails(m); el.querySelector(`.tr-row[data-trail="${CSS.escape(id)}"] .tr-pick`)?.focus({ preventScroll: true }); }
    };

    const ride = (t) => {
      if (needsReload(cur(), t.mapId, t.id)) ctx.toast(`Loading ${t.name}…`);
      ctx.maps.selectTrail(t.mapId, t.id, { ride: true });
    };

    const open = (mountainId, { focus = false } = {}) => {
      view = mountainId;
      storage.set(VIEW_KEY, view);
      filter = 'all';
      el.scrollTop = 0;
      if (view) renderTrails(getMountain(view)); else renderMountains();
      el.classList.remove('mt-enter'); void el.offsetWidth; el.classList.add('mt-enter');
      if (focus) {
        const target = view ? el.querySelector('[data-autofocus]') : el.querySelector(`.mt-card[data-mountain="${CSS.escape(this._last || '')}"]`) || el.querySelector('[data-autofocus]') || el.querySelector('.mt-card');
        target?.focus({ preventScroll: true });
        target?.scrollIntoView?.({ block: 'nearest' });
      }
      if (mountainId) this._last = mountainId;
    };
    this._back = () => { if (!view) return false; ctx.sfx?.('ui_click', 0.3, 0.95); open(null, { focus: true }); return true; };
    this._rideFocused = () => {
      const row = document.activeElement?.closest?.('.tr-row');
      if (!row || !el.contains(row)) return false;
      const t = getTrail(row.dataset.map, row.dataset.trail);
      if (t) ride(t);
      return !!t;
    };

    const onKey = (e) => {
      if (e.defaultPrevented || e.target?.matches?.('input, textarea')) return;
      if ((e.key === 'Escape' || e.key === 'Backspace') && view) { e.preventDefault(); e.stopPropagation(); this._back(); }
    };
    el.addEventListener('keydown', onKey);
    // Keep the "Selected" marker right when the trail changes elsewhere (e.g. a reload-free switch from the map card).
    ctx.on('trailSelected', () => { if (alive && view && !el.contains(document.activeElement)) renderTrails(getMountain(view)); });
    ctx.on('rideRecorded', () => { bests.clear(); if (alive && view) loadBests(getMountain(view).trails); });

    el.classList.add('mt-panel');
    open(view);
    return () => { alive = false; el.removeEventListener('keydown', onKey); el.classList.remove('mt-panel', 'mt-enter'); this._back = null; this._rideFocused = null; };
  },

  onAction(action) {
    if (action === 'back') return !!this._back?.();
    if (action === 'alt2') return !!this._rideFocused?.();
    return false;
  },
});
