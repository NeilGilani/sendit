// Lobby — the first screen after loading: the rider on a turntable (LobbyStage) plus a tab bar,
// one tab panel, the profile chip, the selected map and the Ride button.
//
// The lobby itself knows nothing about specific tabs: they come from the registry (lobby/tabs.js).
// Lifecycle: show() mounts the active tab, hide() unmounts it, select(id) switches tabs.
// Input: mouse/touch (drag, wheel, pinch on the stage), keyboard (Q/E tabs, A/D rotate, R reset
// view, arrows move focus, Enter activates) and gamepad via onAction() from the UI.
import { on, emit } from '../state.js';
import { profileStore } from '../profile/store.js';
import * as catalog from '../profile/catalog.js';
import { listMaps, getMap, listMountains, DIFFICULTIES, mapShot } from '../maps/registry.js';
import { difficultyBadge, trailStats } from '../maps/badges.js';
import { services } from '../services/index.js';
import { storage } from '../services/storage.js';
import { listLobbyTabs, getLobbyTab } from './tabs.js';
import { focusFirst } from './nav.js';
import { courseKey, bestFor, fmtTime } from '../activities.js';
import { ICONS } from './icons.js';
import './lobby.css';

const TAB_KEY = 'sendit.lobby.tab';
/** "Season 26/27": the northern-hemisphere ski season we are in (it turns over in July). */
function seasonLabel(d = new Date()) {
  const y = d.getFullYear() % 100, a = d.getMonth() >= 6 ? y : (y + 99) % 100;
  return `Season ${String(a).padStart(2, '0')}/${String((a + 1) % 100).padStart(2, '0')}`;
}
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

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
    this.activeId = storage.get(TAB_KEY) || 'equipment';
    this.mapInfo = null;
    this.build();
    on('lobbyTabs', () => this.renderTabs());
    on('profile', () => this.renderProfileChip());
    on('inputDevice', (d) => this.setDevice(d));
    on('rideRecorded', (r) => this.onRideRecorded(r));
    stage.onGearMode = (mode) => emit('lobbyGearMode', mode);
    addEventListener('resize', () => this.layout());
    addEventListener('keydown', (e) => this.onKey(e));
    this.setDevice(input.device);
  }

  // ------------------------------------------------------------------ DOM
  build() {
    this.root.innerHTML = `
      <div class="lb-hit" aria-hidden="true"></div>
      <header class="lb-top">
        <div class="lb-brand" aria-label="Sendit"><b>SEND<i>I</i>T</b><small>${seasonLabel()}</small></div>
        <div class="lb-tabbar">
          <span class="lb-key" aria-hidden="true"><span class="g-kb">Q</span><span class="g-pad">LB</span></span>
          <nav class="lb-tabs" role="tablist" aria-label="Lobby sections"></nav>
          <span class="lb-key" aria-hidden="true"><span class="g-kb">E</span><span class="g-pad">RB</span></span>
        </div>
        <button class="lb-chip" type="button" data-goto="profile" aria-label="Profile">
          <span class="lb-avatar"></span>
          <span class="lb-chip-text"><b class="lb-pname"></b><small class="lb-pmeta"></small></span>
        </button>
      </header>
      <section class="lb-panel" id="lb-panel" role="tabpanel" tabindex="-1"></section>
      <footer class="lb-bottom">
        <div class="lb-hints">
          <span class="g-kb">Drag or <kbd>A</kbd><kbd>D</kbd> rotate · Scroll zoom · <kbd>Q</kbd><kbd>E</kbd> tabs · <kbd>R</kbd> reset view</span>
          <span class="g-pad"><kbd>RS</kbd> rotate · <kbd>LT</kbd><kbd>RT</kbd> zoom · <kbd>LB</kbd><kbd>RB</kbd> tabs · <kbd>X</kbd> mode · <kbd>A</kbd> select</span>
          <span class="g-touch">Drag to rotate · Pinch to zoom</span>
        </div>
        <div class="lb-go">
          <button class="lb-map" type="button" data-goto="maps">
            <span class="lb-map-thumb"></span>
            <span class="lb-map-text"><small class="lb-map-mtn">Map</small><b class="lb-map-name">…</b><em class="lb-map-desc"></em></span>
          </button>
          <div class="lb-mode" role="radiogroup" aria-label="Mode">
            <div class="lb-mode-seg">
              <button type="button" role="radio" data-mode="zen">Zen</button>
              <button type="button" role="radio" data-mode="challenge">Challenge</button>
            </div>
            <small class="lb-mode-info"></small>
          </div>
          <button class="lb-ride" type="button" data-autofocus>
            <span class="lb-ride-label">Ride</span>${ICONS.play}
            <span class="lb-ride-key"><span class="g-kb">Enter</span><span class="g-pad">Start</span><span class="g-touch"></span></span>
          </button>
        </div>
      </footer>
      <div class="lb-toast" role="status" aria-live="polite"></div>`;
    const q = (s) => this.root.querySelector(s);
    this.el = {
      hit: q('.lb-hit'), tabs: q('.lb-tabs'), panel: q('.lb-panel'), top: q('.lb-top'), bottom: q('.lb-bottom'),
      ride: q('.lb-ride'), chip: q('.lb-chip'), toast: q('.lb-toast'),
      mapName: q('.lb-map-name'), mapDesc: q('.lb-map-desc'), mapThumb: q('.lb-map-thumb'), mapMtn: q('.lb-map-mtn'), mapBtn: q('.lb-map'),
    };
    this.el.ride.addEventListener('click', () => this.ride());
    this.el.modeInfo = q('.lb-mode-info');
    this.root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => this.setMode(b.dataset.mode)));
    try { this.mode = localStorage.getItem('sendit.mode') === 'challenge' ? 'challenge' : 'zen'; } catch { this.mode = 'zen'; }
    this.renderMode();
    on('runFinished', () => this.renderMode());
    this.root.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => this.select(b.dataset.goto, { focus: true })));
    this.stage.attachPointer(this.el.hit);
    if ('ResizeObserver' in window) new ResizeObserver(() => this.layout()).observe(this.el.panel);
    this.renderTabs();
    this.renderProfileChip();
  }

  renderTabs() {
    const tabs = listLobbyTabs();
    if (!tabs.some((t) => t.id === this.activeId)) this.activeId = tabs[0]?.id ?? null;
    this.el.tabs.innerHTML = '';
    for (const t of tabs) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `lb-tab${t.status === 'soon' ? ' soon' : ''}`;
      b.setAttribute('role', 'tab');
      b.dataset.tab = t.id;
      b.id = `lb-tab-${t.id}`;
      b.setAttribute('aria-controls', 'lb-panel');
      b.innerHTML = `${t.icon || ''}<span>${esc(t.label)}</span>${t.status === 'soon' ? '<i class="lb-soon-dot" title="Coming soon"></i>' : ''}`;
      b.addEventListener('click', () => { if (t.id !== this.activeId) this.sfx('ui_click', 0.3, 1.1); this.select(t.id); });
      this.el.tabs.appendChild(b);
    }
    this.markTabs();
    if (this.visible && this.active?.tab.id !== this.activeId) this.select(this.activeId);
  }

  markTabs() {
    this.el.tabs.querySelectorAll('.lb-tab').forEach((b) => {
      const on = b.dataset.tab === this.activeId;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
      if (on) b.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    });
    this.el.panel.setAttribute('aria-labelledby', `lb-tab-${this.activeId}`);
  }

  renderProfileChip() {
    const p = profileStore.profile;
    const me = services.identity.current();
    this.root.querySelector('.lb-avatar').textContent = (p.displayName || 'R').trim().charAt(0).toUpperCase();
    this.root.querySelector('.lb-pname').textContent = p.displayName;
    this.root.querySelector('.lb-pmeta').textContent = `${me.isGuest ? 'Guest' : me.provider} · ${services.network.statusText} · best ${p.stats.bestScore.toLocaleString()}`;
  }

  /** Mountain + trail shown next to the Ride button. `trail` = the registry trail object. */
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
    let info = 'Free ride · no clock';
    if (this.mode === 'challenge') {
      const best = this.mapInfo?.course ? bestFor(courseKey(this.mapInfo.course)) : null;
      const medal = ['gold', 'silver', 'bronze'].includes(best?.medal) ? `<i class="lb-medal ${best.medal}" title="${best.medal}"></i>` : '';
      info = best ? `Best ${esc(fmtTime(best.time))}${medal}` : 'Gates · ghost · medals';
    }
    this.el.modeInfo.innerHTML = info;
  }

  setDevice(d) {
    for (const k of ['keyboard', 'mouse', 'gamepad', 'touch']) document.body.classList.toggle(`device-${k}`, d === k);
  }

  // ------------------------------------------------------------------ lifecycle
  show() {
    if (this.visible) return;
    this.visible = true;
    this.root.classList.remove('hidden');
    this.select(this.activeId);
    this.layout();
    requestAnimationFrame(() => { this.layout(); this.el.ride.focus({ preventScroll: true }); });
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.unmountActive();
    this.root.classList.add('hidden');
  }

  /** Open a tab. */
  select(id, { focus = false } = {}) {
    const tab = getLobbyTab(id);
    if (!tab) return;
    this.activeId = id;
    storage.set(TAB_KEY, id);
    this.markTabs();
    if (!this.visible) return;
    if (this.active?.tab.id === id) { if (focus) focusFirst(this.el.panel); return; }
    this.unmountActive();
    const panel = this.el.panel;
    panel.innerHTML = '';
    panel.dataset.tab = id;
    panel.scrollTop = 0;
    const subs = [];
    const ctx = this.context(subs);
    let cleanup = null;
    try { cleanup = tab.mount(panel, ctx) || null; } catch (e) {
      console.error(`[lobby] tab "${id}" failed to mount`, e);
      panel.innerHTML = '<div class="lp-soon"><h2 class="lp-title">Oops</h2><p class="lp-sub">This section failed to load.</p></div>';
    }
    this.active = { tab, cleanup, subs, ctx };
    this.stage.setShot(tab.shot || 'full');
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');
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
      select: (id) => this.select(id, { focus: true }),
      showCredits: () => this.ui.showCredits?.(),
    };
  }

  cycleTab(step) {
    const tabs = listLobbyTabs();
    if (!tabs.length) return;
    const i = Math.max(0, tabs.findIndex((t) => t.id === this.activeId));
    const next = tabs[(i + step + tabs.length) % tabs.length];
    this.sfx('ui_click', 0.3, 1.1);
    this.select(next.id);
    this.el.tabs.querySelector(`[data-tab="${next.id}"]`)?.focus({ preventScroll: true });
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
    const pan = this.el.panel.getBoundingClientRect();
    const y0 = top.bottom, y1 = Math.min(H, bot.top + 10);
    // Candidate A: right of the panel (wide screens). Candidate B: above the panel (bottom sheet).
    const a = { x: pan.right, y: y0, w: W - pan.right, h: y1 - y0 };
    const b = { x: 0, y: y0, w: W, h: pan.top - y0 };
    const area = (r) => Math.max(0, r.w) * Math.max(0, r.h);
    const r = area(a) >= area(b) ? a : b;
    if (r.w < 60 || r.h < 60) this.stage.setFocusRect({ x: 0, y: 0, w: W, h: H });
    else this.stage.setFocusRect(r);
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
      case 'back': {   // B: the tab first (Maps: trails → mountains), else back to the Ride button
        const a = this.active;
        if (a?.tab.onAction && a.tab.onAction(action, a.ctx)) return true;
        this.el.ride.focus({ preventScroll: true });
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
    const best = r.isNewBest ? ' · New personal best!' : r.rank ? ` · #${r.rank} on this map` : '';
    // Shown when the lobby comes back.
    setTimeout(() => this.toast(`Ride saved · ${Math.round(r.score).toLocaleString()} pts${best}`, r.isNewBest ? 'gold' : ''), 700);
  }
}
