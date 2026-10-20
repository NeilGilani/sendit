// Lobby — the first screen after loading: the rider on a turntable (LobbyStage) plus the top bar
// (five destinations, utility buttons, the lift-ticket profile chip), one panel, and the Ride
// cluster (trail sign, Zen / Challenge, RIDE) that stays bottom right on every screen.
//
// The lobby itself knows nothing about specific tabs: they come from the registry (lobby/tabs.js)
// and are grouped into destinations by their `group` (or lobby/config.js NAV). A destination with
// several tabs shows them as a sub-tab strip above the panel. Home is a "bare" tab: no panel chrome,
// the rider centre stage. docs/lobby.md → Navigation / Design system v2.
// Lifecycle: show() mounts the active tab, hide() unmounts it, select(id) switches tabs.
// Input: mouse/touch (drag, wheel, pinch on the stage), keyboard (Q/E destinations, A/D rotate,
// R reset view, arrows move focus, Enter activates, Esc back to Home) and gamepad via onAction().
import { on, emit } from '../state.js';
import { profileStore } from '../profile/store.js';
import * as catalog from '../profile/catalog.js';
import { listMaps, getMap, listMountains, DIFFICULTIES, mapShot } from '../maps/registry.js';
import { difficultyBadge, trailStats } from '../maps/badges.js';
import { services } from '../services/index.js';
import { listLobbyTabs, getLobbyTab, listLobbyGroups, registerLobbyGroup, getLobbyGroup, getLobbyBadge } from './tabs.js';
import { focusFirst } from './nav.js';
import { courseKey, bestFor, fmtTime } from '../activities.js';
import { ICONS } from './icons.js';
import { NAV } from './config.js';
import { hoverTicks } from './motion.js';
import './lobby.css';

for (const g of NAV.groups) if (!getLobbyGroup(g.id)) registerLobbyGroup({ ...g, icon: ICONS[g.icon] || g.icon });

/** "Season 26/27": the northern-hemisphere ski season we are in (it turns over in July). */
function seasonLabel(d = new Date()) {
  const y = d.getFullYear() % 100, a = d.getMonth() >= 6 ? y : (y + 99) % 100;
  return `Season ${String(a).padStart(2, '0')}/${String((a + 1) % 100).padStart(2, '0')}`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const badgeHtml = (n) => (n ? `<i class="cs-badge lb-badge">${n > 9 ? '9+' : n}</i>` : '');

/** Where a tab sits in the navigation: { group, short, nav }. The tab's own fields win over NAV.tabs. */
function navOf(t) {
  const d = NAV.tabs[t.id] || {};
  const nav = t.nav || d.nav || 'main';
  return { nav, group: nav === 'utility' ? null : (t.group || d.group || t.id), short: t.short || d.short || t.label };
}

export class Lobby {
  /**
   * @param {object} o
   * @param {HTMLElement} o.root        the #lobby screen element
   * @param {LobbyStage}  o.stage
   * @param {Input}       o.input
   * @param {Function}    o.onRide      start a ride
   * @param {Function}    [o.onTrail]   pick a trail: onTrail(mapId, trailId, { ride }) (main.js selectTrail)
   * @param {object}      [o.ui]        UI helpers: { showCredits() }
   * @param {Function}    [o.sfx]       play a UI sound: sfx(name, gain, rate)
   */
  constructor({ root, stage, input, onRide, onTrail = null, ui = {}, sfx = () => {} }) {
    Object.assign(this, { root, stage, input, onRide, onTrail, ui, sfx });
    this.visible = false;
    this.active = null;            // { tab, cleanup, subs }
    this.activeId = NAV.home;
    this.lastInGroup = new Map();  // destination → last open sub-tab
    this.mapInfo = null;
    this.build();
    on('lobbyTabs', () => this.renderTabs());
    on('lobbyBadge', () => this.renderBadges());
    on('profile', () => { this.renderProfileChip(); this.renderLook(); });
    on('loadout', () => this.renderLook());
    on('inputDevice', (d) => this.setDevice(d));
    on('rideRecorded', (r) => this.onRideRecorded(r));
    stage.onGearMode = (mode) => emit('lobbyGearMode', mode);
    addEventListener('resize', () => this.layout());
    addEventListener('keydown', (e) => this.onKey(e));
    this.setDevice(input.device);
  }

  // ------------------------------------------------------------------ navigation model
  /** Destinations in top-bar order: [{ id, label, icon, order, tabs: [tab…] }] (only those with tabs). */
  destinations() {
    const tabs = listLobbyTabs().filter((t) => navOf(t).nav === 'main');
    const out = new Map(listLobbyGroups().map((g) => [g.id, { ...g, tabs: [] }]));
    for (const t of tabs) {
      const gid = navOf(t).group;
      if (!out.has(gid)) out.set(gid, { id: gid, label: t.label, icon: t.icon, order: t.order, tabs: [] });
      out.get(gid).tabs.push(t);
    }
    return [...out.values()].filter((g) => g.tabs.length).sort((a, b) => a.order - b.order);
  }
  utilities() { return listLobbyTabs().filter((t) => navOf(t).nav === 'utility'); }
  groupOf(id) { const t = getLobbyTab(id); return t ? navOf(t).group : null; }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root.classList.add('lb-v2');
    this.root.innerHTML = `
      <div class="lb-hit" aria-hidden="true"></div>
      <header class="lb-top">
        <div class="lb-brand" aria-label="Sendit"><b>SEND<i>I</i>T</b><small>${seasonLabel()}</small></div>
        <div class="lb-tabbar">
          <span class="lb-key" aria-hidden="true"><span class="g-kb">Q</span><span class="g-pad">LB</span></span>
          <nav class="lb-tabs" role="tablist" aria-label="Lobby"><span class="lb-ink" aria-hidden="true"></span></nav>
          <span class="lb-key" aria-hidden="true"><span class="g-kb">E</span><span class="g-pad">RB</span></span>
        </div>
        <div class="lb-top-r">
          <div class="lb-utils"></div>
          <button class="lb-chip" type="button" data-goto="profile" aria-label="Profile">
            <span class="lb-avatar"></span>
            <span class="lb-chip-text"><b class="lb-pname"></b><small class="lb-pmeta"></small></span>
          </button>
        </div>
      </header>
      <div class="lb-side">
        <div class="lb-subnav" role="tablist" aria-label="Section"></div>
        <section class="lb-panel" id="lb-panel" role="tabpanel" tabindex="-1"></section>
      </div>
      <button class="lb-look" type="button" data-goto="locker">
        <span class="lb-look-ico"></span>
        <span class="lb-look-t"><small class="lb-look-name"></small><b class="lb-look-gear"></b></span>
        <span class="lb-look-cta">Customize</span>
      </button>
      <footer class="lb-bottom">
        <div class="lb-hints">
          <span class="g-kb"><kbd>A</kbd><kbd>D</kbd> rotate · <kbd>Q</kbd><kbd>E</kbd> sections · <kbd>Esc</kbd> home · <kbd>R</kbd> reset view</span>
          <span class="g-pad"><kbd>RS</kbd> rotate · <kbd>LB</kbd><kbd>RB</kbd> sections · <kbd>X</kbd> mode · <kbd>B</kbd> back</span>
          <span class="g-touch">Drag to rotate · Pinch to zoom</span>
        </div>
        <div class="lb-go">
          <button class="lb-map" type="button" data-goto="maps">
            <span class="lb-map-thumb"></span>
            <span class="lb-map-text"><small class="lb-map-mtn">Map</small><b class="lb-map-name">…</b><em class="lb-map-desc"></em></span>
            <span class="lb-map-chg" aria-hidden="true">${ICONS.maps}<span>Change</span></span>
          </button>
          <div class="lb-mode" role="radiogroup" aria-label="Mode">
            <div class="lb-mode-seg">
              <button type="button" role="radio" data-mode="zen"><b>Zen</b><small>Free ride</small></button>
              <button type="button" role="radio" data-mode="challenge"><b>Challenge</b><small class="lb-mode-info"></small></button>
            </div>
          </div>
          <button class="lb-ride" type="button" data-autofocus>
            <span class="lb-ride-face"><span class="lb-ride-label">Ride</span>${ICONS.play}</span>
            <span class="lb-ride-tag" aria-hidden="true">2× XP</span>
            <span class="lb-ride-key"><span class="g-kb">Enter</span><span class="g-pad">Start</span><span class="g-touch"></span></span>
          </button>
        </div>
      </footer>
      <div class="lb-toast" role="status" aria-live="polite"></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      hit: q('.lb-hit'), tabs: q('.lb-tabs'), ink: q('.lb-ink'), utils: q('.lb-utils'), side: q('.lb-side'), sub: q('.lb-subnav'),
      panel: q('.lb-panel'), top: q('.lb-top'), bottom: q('.lb-bottom'), go: q('.lb-go'), look: q('.lb-look'),
      ride: q('.lb-ride'), chip: q('.lb-chip'), toast: q('.lb-toast'),
      mapName: q('.lb-map-name'), mapDesc: q('.lb-map-desc'), mapThumb: q('.lb-map-thumb'), mapMtn: q('.lb-map-mtn'), mapBtn: q('.lb-map'),
    };
    this.el.ride.addEventListener('click', () => this.ride());
    this.el.modeInfo = q('.lb-mode-info');
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    try { this.mode = localStorage.getItem('sendit.mode') === 'challenge' ? 'challenge' : 'zen'; } catch { this.mode = 'zen'; }
    this.renderMode();
    on('runFinished', () => this.renderMode());
    this.root.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => { this.sfx('ui_click', 0.3, 1); this.select(b.dataset.goto, { focus: true }); }));
    // Tactile sound: a soft high tick on hover over the big controls (throttled), as in console menus.
    hoverTicks(this.root, '.lb-tab, .lb-sub, .lb-util, .lb-ride, .lb-map, .lb-look, .hm-tile > button, button.hm-tile, .lb-mode-seg button', () => this.sfx('ui_click', 0.1, 1.7));
    this.stage.attachPointer(this.el.hit);
    if ('ResizeObserver' in window) new ResizeObserver(() => this.layout()).observe(this.el.side);
    this.renderTabs();
    this.renderProfileChip();
    this.renderLook();
  }

  renderTabs() {
    const dests = this.destinations();
    const all = listLobbyTabs();
    if (!all.some((t) => t.id === this.activeId)) this.activeId = all[0]?.id ?? null;
    this.el.tabs.querySelectorAll('.lb-tab').forEach((b) => b.remove());
    for (const g of dests) {
      const b = document.createElement('button');
      b.type = 'button';
      const soon = g.tabs.every((t) => t.status === 'soon');
      b.className = `lb-tab${soon ? ' soon' : ''}`;
      b.setAttribute('role', 'tab');
      b.dataset.tab = g.id;
      b.id = `lb-tab-${g.id}`;
      b.setAttribute('aria-controls', 'lb-panel');
      b.innerHTML = `${g.icon || ''}<span>${esc(g.label)}</span>`;
      b.addEventListener('click', () => { if (this.groupOf(this.activeId) !== g.id) this.sfx('ui_click', 0.3, 1.1); this.openGroup(g.id); });
      this.el.tabs.appendChild(b);
    }
    this.el.utils.innerHTML = '';
    for (const t of this.utilities()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lb-util${t.status === 'soon' ? ' soon' : ''}`;
      b.dataset.tab = t.id;
      const label = navOf(t).short;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = `${t.icon || ''}<span class="lb-util-tip">${esc(label)}</span>`;
      b.addEventListener('click', () => { this.sfx('ui_click', 0.3, 1.1); this.select(this.activeId === t.id ? NAV.home : t.id, { focus: true }); });
      this.el.utils.appendChild(b);
    }
    this.markTabs();
    if (this.visible && this.active?.tab.id !== this.activeId) this.select(this.activeId);
  }

  /** Sub-tab strip for the active destination (only when it has more than one tab). */
  renderSub() {
    const gid = this.groupOf(this.activeId);
    const g = this.destinations().find((d) => d.id === gid);
    const tabs = g?.tabs || [];
    this.el.side.classList.toggle('has-sub', tabs.length > 1);
    if (tabs.length <= 1) { this.el.sub.innerHTML = ''; return; }
    this.el.sub.innerHTML = tabs.map((t) => `
      <button type="button" class="lb-sub${t.id === this.activeId ? ' on' : ''}${t.status === 'soon' ? ' soon' : ''}" role="tab" data-tab="${esc(t.id)}"
        aria-selected="${t.id === this.activeId}" tabindex="${t.id === this.activeId ? 0 : -1}">${t.icon || ''}<span>${esc(navOf(t).short)}</span>${badgeHtml(getLobbyBadge(t.id))}</button>`).join('');
    this.el.sub.querySelectorAll('.lb-sub').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.tab !== this.activeId) this.sfx('ui_click', 0.3, 1.25);
      this.select(b.dataset.tab);
      this.el.sub.querySelector(`[data-tab="${CSS.escape(b.dataset.tab)}"]`)?.focus({ preventScroll: true });
    }));
  }

  markTabs() {
    const gid = this.groupOf(this.activeId);
    let onBtn = null;
    this.el.tabs.querySelectorAll('.lb-tab').forEach((b) => {
      const on = b.dataset.tab === gid;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on || (!gid && b.dataset.tab === NAV.home) ? 0 : -1;
      if (on) onBtn = b;
    });
    this.el.utils.querySelectorAll('.lb-util').forEach((b) => {
      const on = b.dataset.tab === this.activeId;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    this.moveInk(onBtn);
    onBtn?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    this.root.dataset.dest = gid || 'utility';
    this.root.dataset.tab = this.activeId || '';
    this.el.panel.setAttribute('aria-labelledby', `lb-tab-${gid || this.activeId}`);
    this.renderSub();
    this.renderBadges();
  }

  /** The active-destination plate slides between tabs (transform + width only). */
  moveInk(btn) {
    const ink = this.el.ink;
    if (!btn) { ink.style.opacity = '0'; return; }
    const place = () => {
      if (!btn.isConnected || !btn.offsetWidth) return;
      ink.style.opacity = '1';
      ink.style.width = `${btn.offsetWidth}px`;
      ink.style.transform = `translateX(${btn.offsetLeft}px)`;
    };
    place();
    if (!this._inkFonts && document.fonts?.ready) { this._inkFonts = true; document.fonts.ready.then(() => this.moveInk(this.el.tabs.querySelector('.lb-tab.on'))); }
  }

  /** Badges from the registry (setLobbyBadge) on destinations (summed), sub-tabs and utilities. */
  renderBadges() {
    const set = (b, n) => {
      let s = b.querySelector(':scope > .lb-badge');
      if (!n) { s?.remove(); return; }
      const txt = n > 9 ? '9+' : String(n);
      if (!s) { s = document.createElement('i'); s.className = 'cs-badge lb-badge'; b.appendChild(s); }
      if (s.textContent !== txt) { const up = Number(s.textContent || 0) < n; s.textContent = txt; if (up) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); } }
    };
    const dests = this.destinations();
    this.el.tabs.querySelectorAll('.lb-tab').forEach((b) => {
      const g = dests.find((d) => d.id === b.dataset.tab);
      set(b, g ? g.tabs.reduce((n, t) => n + getLobbyBadge(t.id), 0) : 0);
    });
    this.el.sub.querySelectorAll('.lb-sub').forEach((b) => set(b, getLobbyBadge(b.dataset.tab)));
    this.el.utils.querySelectorAll('.lb-util').forEach((b) => set(b, getLobbyBadge(b.dataset.tab)));
    set(this.el.look, getLobbyBadge('locker'));
  }

  renderProfileChip() {
    const p = profileStore.profile;
    const me = services.identity.current();
    this.el.chip.setAttribute('aria-label', `Profile: ${p.displayName}`);
    this.root.querySelector('.lb-avatar').textContent = (p.displayName || 'R').trim().charAt(0).toUpperCase();
    this.root.querySelector('.lb-pname').textContent = p.displayName;
    // Public build: no "Guest · Offline" (accounts and servers aren't a thing yet); signed-in providers still show.
    const best = p.stats.bestScore > 0 ? `Best ${Math.round(p.stats.bestScore).toLocaleString('en-US')}` : 'No runs yet';
    this.root.querySelector('.lb-pmeta').textContent = me.isGuest ? best : `${me.provider} · ${best}`;
  }

  /** The rider plate under the rider on Home: name + the gear you ride, one tap to the Locker. */
  renderLook() {
    if (!this.el?.look) return;
    const type = profileStore.equipment;
    const item = profileStore.activeGear(type)?.[0]?.item;
    this.el.look.querySelector('.lb-look-ico').innerHTML = ICONS[type] || ICONS.skis;
    this.el.look.querySelector('.lb-look-name').textContent = profileStore.profile.displayName || 'Rider';
    this.el.look.querySelector('.lb-look-gear').textContent = item?.name || (type === 'snowboard' ? 'Snowboard' : 'Skis');
    this.el.look.setAttribute('aria-label', `${profileStore.profile.displayName}: ${item?.name || type}. Customize in the Locker`);
  }

  /** Mountain + trail shown on the trail sign in the Ride cluster. `trail` = the registry trail object. */
  setMapInfo({ map, variant, course, description, trail = null, starts = [], heightAt = null }) {
    this.mapInfo = { map, variant, course, trail, starts, heightAt };
    const m = map.mountain;
    this.el.mapMtn.textContent = m?.name || 'Map';
    if (trail) {
      this.el.mapName.innerHTML = `${difficultyBadge(trail.difficulty, 15, 'lb-map-badge')}<span>${esc(trail.name)}</span>`;
      const stats = trailStats(trail);
      this.el.mapDesc.textContent = [trail.group, DIFFICULTIES[trail.difficulty]?.label, stats].filter(Boolean).join(' · ');
    } else {
      this.el.mapName.textContent = map.name;
      this.el.mapDesc.textContent = description || map.description;
    }
    this.el.mapBtn.style.setProperty('--acc', m?.accent || '');
    this.el.mapBtn.setAttribute('aria-label', `Trail: ${trail ? `${trail.name} on ${m?.name}` : map.name}. Change trail`);
    // The rendered picture (assets/maps) over the painted thumbnail, which shows if the file is missing.
    this.el.mapThumb.style.backgroundImage = [`url("${mapShot(map.id)}")`, map.thumbnail && `url("${map.thumbnail}")`].filter(Boolean).join(', ');
    this.renderMode();
  }

  /** Zen (free riding, as it always was) or Challenge (timed run with gates, a ghost and medals). */
  setMode(mode) {
    if (mode !== 'zen' && mode !== 'challenge') return;
    if (mode !== this.mode) this.sfx('ui_click', 0.3, mode === 'challenge' ? 1.2 : 0.95);
    this.mode = mode;
    try { localStorage.setItem('sendit.mode', mode); } catch { /* private mode */ }
    this.renderMode();
  }

  renderMode() {
    if (!this.el?.modeInfo) return;
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === this.mode)));
    this.el.ride.querySelector('.lb-ride-label').textContent = this.mode === 'challenge' ? 'Race' : 'Ride';
    this.el.ride.classList.toggle('race', this.mode === 'challenge');
    const best = this.mapInfo?.course ? bestFor(courseKey(this.mapInfo.course)) : null;
    const medal = ['gold', 'silver', 'bronze'].includes(best?.medal) ? `<i class="lb-medal ${best.medal}" title="${best.medal}"></i>` : '';
    this.el.modeInfo.innerHTML = best ? `Best ${esc(fmtTime(best.time))}${medal}` : 'Gates · medals';
  }

  setDevice(d) {
    for (const k of ['keyboard', 'mouse', 'gamepad', 'touch']) document.body.classList.toggle(`device-${k}`, d === k);
  }

  // ------------------------------------------------------------------ lifecycle
  show() {
    if (this.visible) return;
    this.visible = true;
    this.root.classList.remove('hidden');
    // Every visit starts at Home (like a game's main lobby); the last sub-tab of each destination is remembered.
    if (getLobbyTab(NAV.home)) this.activeId = NAV.home;
    this.markTabs();
    this.select(this.activeId);
    this.layout();
    requestAnimationFrame(() => { this.layout(); this.moveInk(this.el.tabs.querySelector('.lb-tab.on')); this.el.ride.focus({ preventScroll: true }); });
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.unmountActive();
    this.root.classList.add('hidden');
  }

  /** Open a destination at the sub-tab you last had open there. */
  openGroup(gid, opts) {
    const g = this.destinations().find((d) => d.id === gid);
    if (!g) return;
    const last = this.lastInGroup.get(gid);
    this.select(g.tabs.some((t) => t.id === last) ? last : g.tabs[0].id, opts);
  }

  /** Open a tab. */
  select(id, { focus = false } = {}) {
    const tab = getLobbyTab(id);
    if (!tab) return;
    this.activeId = id;
    const gid = this.groupOf(id);
    if (gid) this.lastInGroup.set(gid, id);
    this.markTabs();
    if (!this.visible) return;
    if (this.active?.tab.id === id) { if (focus) focusFirst(this.el.panel); return; }
    this.unmountActive();
    const panel = this.el.panel;
    panel.innerHTML = '';
    panel.dataset.tab = id;
    panel.scrollTop = 0;
    this.el.side.classList.toggle('bare', !!tab.bare);
    this.root.classList.toggle('lb-home', !!tab.bare);
    const subs = [];
    const ctx = this.context(subs);
    let cleanup = null;
    try { cleanup = tab.mount(panel, ctx) || null; } catch (e) {
      console.error(`[lobby] tab "${id}" failed to mount`, e);
      panel.innerHTML = '<div class="lp-soon"><h2 class="lp-title">Oops</h2><p class="lp-sub">This section failed to load.</p></div>';
    }
    this.active = { tab, cleanup, subs, ctx };
    this.stage.setShot(tab.shot || 'full');
    // Staggered entrance (CSS), then drop the class so later re-renders inside the tab don't replay it.
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');
    clearTimeout(this._enterT);
    this._enterT = setTimeout(() => panel.classList.remove('enter'), 700);
    if (focus) focusFirst(panel);
    this.layout();
  }

  unmountActive() {
    const a = this.active;
    if (!a) return;
    this.active = null;
    for (const off of a.subs) off();
    try { if (typeof a.cleanup === 'function') a.cleanup(); a.tab.unmount?.(a.ctx); } catch (e) { console.error('[lobby] unmount failed', e); }
    this.el.panel.innerHTML = '';
  }

  /** What every tab receives. */
  context(subs) {
    return {
      profile: profileStore,
      catalog,
      maps: {
        list: listMaps, get: getMap, mountains: listMountains, current: () => this.mapInfo,
        selectTrail: (mapId, trailId, opts = {}) => this.onTrail?.(mapId, trailId, { mode: this.mode, ...opts }),
      },
      sfx: (...a) => this.sfx(...a),
      services,
      stage: this.stage,
      on: (name, fn) => { const off = on(name, fn); subs.push(off); return off; },
      toast: (msg, tone) => this.toast(msg, tone),
      ride: () => this.ride(),
      setMode: (m) => this.setMode(m),
      select: (id) => this.select(id, { focus: true }),
      showCredits: () => this.ui.showCredits?.(),
      showHowTo: (o) => this.ui.showHowTo?.(o),
      device: () => this.input.device,
    };
  }

  /** Q / E, LB / RB: the previous / next destination. */
  cycleTab(step) {
    const dests = this.destinations();
    if (!dests.length) return;
    const i = dests.findIndex((d) => d.id === this.groupOf(this.activeId));
    const next = dests[i < 0 ? (step > 0 ? 0 : dests.length - 1) : (i + step + dests.length) % dests.length];
    this.sfx('ui_click', 0.3, 1.1);
    this.openGroup(next.id);
    this.el.tabs.querySelector(`[data-tab="${CSS.escape(next.id)}"]`)?.focus({ preventScroll: true });
  }

  /** Back to Home (Esc / B with nothing else to close). Returns false when already there. */
  home() {
    if (this.activeId === NAV.home || !getLobbyTab(NAV.home)) return false;
    this.sfx('ui_click', 0.3, 0.9);
    this.select(NAV.home);
    this.el.ride.focus({ preventScroll: true });
    return true;
  }

  ride() {
    if (!this.visible) return;
    this.onRide?.(this.mode);
  }

  // ------------------------------------------------------------------ layout
  /** Tell the stage which part of the window is free so the rider is framed there. */
  layout() {
    if (!this.visible) return;
    const W = innerWidth, H = innerHeight;
    const top = this.el.top.getBoundingClientRect();
    const bot = this.el.bottom.getBoundingClientRect();
    const side = this.el.side.getBoundingClientRect();
    const go = this.el.go.getBoundingClientRect();
    const y0 = top.bottom;
    const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
    let r;
    if (this.active?.tab.bare && side.top < H * 0.5) {
      // Home on a wide screen: the rider centre stage, between the tiles and the Ride cluster.
      const x1 = go.left > side.right ? go.left + (W - go.left) * 0.2 : W;
      r = { x: side.right, y: y0, w: x1 - side.right, h: H - y0 - Math.min(H * 0.04, 30) };
    } else {
      const y1 = Math.min(H, bot.top + 10);
      // Candidate A: right of the panel (wide screens). Candidate B: above the panel (bottom sheet).
      const a = { x: side.right, y: y0, w: W - side.right, h: y1 - y0 };
      const b = { x: 0, y: y0, w: W, h: Math.min(side.top, bot.top) - y0 };
      r = area(a) >= area(b) ? a : b;
    }
    if (r.w < 60 || r.h < 60) this.stage.setFocusRect({ x: 0, y: 0, w: W, h: H });
    else this.stage.setFocusRect(r);
    this.root.style.setProperty('--stage-cx', `${Math.round(r.w < 60 ? W / 2 : r.x + r.w / 2)}px`);   // the rider plate sits under the rider
  }

  // ------------------------------------------------------------------ input
  /** Per frame while visible: continuous rotation / zoom from keys and sticks, then the stage. */
  update(dt) {
    if (!this.visible) return;
    const I = this.input;
    const typing = document.activeElement?.matches?.('input[type=text], textarea');
    let spin = I.pad.rx;
    if (!typing && !this.modalOpen()) {
      if (I.down.has('KeyA')) spin -= 1;
      if (I.down.has('KeyD')) spin += 1;
    }
    this.stage.spin(spin);
    if (I.pad.lt > 0.05) this.stage.addZoom(1 + dt * I.pad.lt * 0.9);
    if (I.pad.rt > 0.05) this.stage.addZoom(1 / (1 + dt * I.pad.rt * 0.9));
  }

  /** True while another screen (settings, credits) is open on top of the lobby. */
  modalOpen() { return !!document.querySelector('.screen.modal:not(.hidden)'); }

  onKey(e) {
    if (!this.visible || this.modalOpen() || e.defaultPrevented) return;
    if (e.target?.matches?.('input[type=text], textarea')) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    switch (e.code) {
      case 'KeyQ': e.preventDefault(); this.cycleTab(-1); break;
      case 'KeyE': e.preventDefault(); this.cycleTab(1); break;
      case 'KeyR': e.preventDefault(); this.stage.resetView(); break;
      case 'Escape':
        if (!document.querySelector('.cr-overlay') && this.home()) e.preventDefault();
        break;
      case 'Enter':
        // Enter with nothing focused rides; on a focused control it activates that control.
        if (document.activeElement === document.body || !document.activeElement) { e.preventDefault(); this.ride(); }
        break;
      default:
    }
  }

  /** Gamepad actions routed by the UI while the lobby is the active screen. Returns true if used. */
  onAction(action) {
    if (!this.visible) return false;
    if (this.overlay?.onAction(action)) return true;   // a full-screen overlay (the case opener) takes the pad first
    switch (action) {
      case 'prevTab': this.cycleTab(-1); return true;
      case 'nextTab': this.cycleTab(1); return true;
      case 'start': this.ride(); return true;
      case 'select': this.stage.resetView(); return true;
      case 'alt': {   // X: switch Zen / Challenge (unless the tab uses X itself)
        const a = this.active;
        if (a?.tab.onAction && a.tab.onAction(action, a.ctx)) return true;
        this.setMode(this.mode === 'zen' ? 'challenge' : 'zen');
        return true;
      }
      case 'back': {   // B: the tab first (Maps: trails → mountains), then Home, then the Ride button
        const a = this.active;
        if (a?.tab.onAction && a.tab.onAction(action, a.ctx)) return true;
        if (!this.home()) this.el.ride.focus({ preventScroll: true });
        return true;
      }
      default: {
        const a = this.active;
        return !!(a?.tab.onAction && a.tab.onAction(action, a.ctx));
      }
    }
  }

  // ------------------------------------------------------------------ feedback
  toast(msg, tone = '') {
    const t = this.el.toast;
    t.textContent = msg;
    t.className = `lb-toast on ${tone}`;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('on'), 4200);
  }

  onRideRecorded(r) {
    if (!r || r.score <= 0) return;
    const best = r.isNewBest ? ' · New personal best!' : r.rank ? ` · #${r.rank} on this mountain` : '';
    // Shown when the lobby comes back.
    setTimeout(() => this.toast(`Ride saved · ${Math.round(r.score).toLocaleString()} pts${best}`, r.isNewBest ? 'gold' : ''), 700);
  }
}
