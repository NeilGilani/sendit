// HTML UI: screens (loading, lobby, pause) with modal overlays (settings, credits), the fading
// HUD, soft score notes, big popups, hints and the fade curtain. Menu navigation works with mouse,
// keyboard (arrows / Enter / Esc) and gamepad (d-pad / stick, A, B, LB/RB, Start).
//
// The lobby (lobby/Lobby.js) is the "lobby" screen; UI only shows/hides it and routes input to it.
import { game, Mode, on, settings, setSetting } from './state.js';
import { State } from './player.js';
import { HUD } from './config.js';
import { moveFocus, focusFirst, handleArrowKey, nudgeRange } from './lobby/nav.js';
import { fmtTime } from './activities.js';

const $ = (id) => document.getElementById(id);
const BASES = ['loading', 'lobby', 'pause'];
const MODALS = ['settings', 'credits', 'results'];

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = [...BASES, ...MODALS].reduce((o, k) => ((o[k] = $(k)), o), {});
    this.hud = $('hud');
    this.fadeEl = $('fade');
    this.base = 'loading';
    this.modal = null;
    this.modalReturnFocus = null;
    this.lobby = null;
    this.input = null;
    this.idle = 0;
    this.hudAlpha = 0;
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    this.bindSettings();
    addEventListener('keydown', (e) => {
      const root = this.activeRoot();
      if (root) handleArrowKey(e, root);
    });
    on('score', ({ label, points }) => this.note(label, points));
    on('hint', (t) => this.hint(t));
    on('liftBoarded', (name) => { $('liftlabel').textContent = `${name}  ·  hold W / RT to hurry`; });
    on('mode', () => this.refresh());
    on('landed', ({ perfect }) => { if (perfect) this.pop('PERFECT!', 'gold'); });
    on('stumble', () => this.pop('WOBBLE!', 'pink'));
    on('nearMiss', () => this.pop('CLOSE SHAVE', 'cyan', true));
    on('countdown', (n) => this.pop(n > 0 ? String(n) : 'GO!', n > 0 ? 'cyan' : 'gold'));
    on('gate', ({ pass }) => { if (!pass) this.pop('MISSED GATE  +2s', 'pink', true); });
    on('flake', ({ found, total }) => this.pop(`❄ ${found} / ${total}`, 'gold', true));
    on('comboBanked', ({ banked, mult }) => { if (mult > 1) this.pop(`+${banked}  ×${trimNum(mult)}`, 'cyan', true); });
    on('combo', () => { const c = $('comboHud'); c.classList.remove('pulse'); void c.offsetWidth; c.classList.add('pulse'); setTimeout(() => c.classList.remove('pulse'), 150); });
    on('crashed', (kind) => this.pop(['YARD SALE!', 'SNOW ANGEL!', 'FACEPLANT!', 'TREE HUGGER!'][kind === 'tree' ? 3 : Math.floor(Math.random() * 3)], 'pink'));
  }

  /** Connect the lobby and the input controller (after both exist). */
  attach({ lobby, input }) {
    this.lobby = lobby;
    this.input = input;
  }

  act(a) {
    switch (a) {
      case 'ride': this.h.ride(); break;
      case 'retry': this.closeModal(false); this.h.retry(); break;
      case 'zen': this.closeModal(false); this.h.zen(); break;
      case 'restart': this.h.restart(); break;
      case 'settings': this.openModal('settings'); break;
      case 'credits': this.showCredits(); break;
      case 'resume': this.h.resume(); break;
      case 'top': this.h.resume(); this.h.top(); break;
      case 'menu': this.h.menu(); break;
      case 'back': this.closeModal(); break;
    }
  }

  // ------------------------------------------------------------------ screens
  /** Base screen: 'loading' | 'lobby' | 'pause' | null (riding → HUD). Closes any modal. */
  showBase(name) {
    this.closeModal(false);
    this.base = name;
    this.screens.pause.classList.toggle('hidden', name !== 'pause');   // 'loading' fades itself out (doneLoading)
    if (name === 'lobby') this.lobby?.show(); else this.lobby?.hide();
    this.hud.classList.toggle('hidden', name !== null);
    if (name === 'pause') focusFirst(this.screens.pause);
    if (name === null) document.activeElement?.blur?.();
  }

  openModal(name) {
    if (!this.screens[name]) return;
    this.modalReturnFocus = document.activeElement;
    if (this.modal) this.screens[this.modal].classList.add('hidden');
    this.modal = name;
    this.screens[name].classList.remove('hidden');
    focusFirst(this.screens[name]);
  }

  closeModal(restoreFocus = true) {
    if (!this.modal) return false;
    this.screens[this.modal].classList.add('hidden');
    this.modal = null;
    if (restoreFocus && this.modalReturnFocus?.isConnected) this.modalReturnFocus.focus({ preventScroll: true });
    this.modalReturnFocus = null;
    return true;
  }

  /** Esc / B: close the top-most overlay. Returns true when something was closed. */
  back() {
    if (this.modal === 'results') { this.closeModal(false); this.h.menu(); return true; }
    return this.closeModal();
  }

  /** Element that keyboard/gamepad navigation acts on, or null while riding. */
  activeRoot() {
    if (this.modal) return this.screens[this.modal];
    if (this.base === 'lobby') return this.screens.lobby;
    if (this.base === 'pause') return this.screens.pause;
    return null;
  }

  showCredits() { this.loadCredits(); this.openModal('credits'); }

  /** Challenge HUD (timer, gates, best, combo) + snowflake counter, every frame. */
  updateActivity(a) {
    const riding = game.mode === Mode.RIDING || game.mode === Mode.LIFT;
    const chal = a.mode === 'challenge' && riding && a.state !== 'idle';
    $('chal').classList.toggle('hidden', !chal);
    $('flakesHud').textContent = riding ? `❄ ${a.flakes}/${a.flakeTotal}` : '';
    if (!chal) return;
    $('timer').textContent = a.state === 'countdown' ? '0:00.00' : fmtTime(a.time);
    $('gatesHud').textContent = `GATES ${a.gates}/${a.gateTotal}${a.penalty ? `  +${a.penalty}s` : ''}`;
    $('bestHud').textContent = a.best ? `BEST ${fmtTime(a.best.time)}` : '';
    const c = a.combo;
    const txt = c ? `x${trimNum(c.mult)}  +${c.pts}` : (a.score ? `${a.score} PTS` : '');
    if ($('comboHud').textContent !== txt) $('comboHud').textContent = txt;
  }

  /** Finish screen for a challenge run (a modal over the frozen finish). */
  showResults(r) {
    const el = $('resMedal');
    el.className = `medal ${r.medal || ''}`;
    el.textContent = r.medal ? r.medal[0].toUpperCase() : '';
    $('resTitle').textContent = r.medal ? `${r.medal.toUpperCase()} MEDAL` : 'FINISH';
    $('resTime').textContent = fmtTime(r.time);
    const T = r.targets;
    const rows = [
      ['Best time', fmtTime(r.best.time), r.isBestTime],
      ['Gates', `${r.gates}/${r.gateTotal}${r.penalty ? `  (+${r.penalty}s)` : ''}`],
      ['Style score', `${r.score}`, r.isBestScore],
      ['Snowflakes', `${r.flakes}/${r.flakeTotal}`],
      ['Gold · Silver · Bronze', `${fmtTime(T.gold)} · ${fmtTime(T.silver)} · ${fmtTime(T.bronze)}`],
    ];
    $('resRows').innerHTML = rows.map(([k, v, n]) => `<div class="k">${k}</div><div class="v${n ? ' new' : ''}">${v}${n ? '  NEW!' : ''}</div>`).join('');
    this.openModal('results');
  }

  refresh() {
    if (game.mode === Mode.MENU) this.showBase('lobby');
    else if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) this.showBase(null);
    else if (game.mode === Mode.PAUSED) {
      $('stats').textContent = `${(game.distance / 1000).toFixed(1)} km ridden · ${game.smoothTurns} smooth turns · ${game.airTotal.toFixed(0)} s of air · score ${game.score}`;
      this.showBase('pause');
    }
  }

  // ------------------------------------------------------------------ gamepad menu navigation
  navigate(dt) {
    const root = this.activeRoot();
    if (!root || !this.input) return;
    for (const a of this.input.menuActions(dt)) {
      if (!this.modal && this.base === 'lobby' && this.lobby?.onAction(a)) continue;
      const el = document.activeElement;
      const range = el instanceof HTMLInputElement && el.type === 'range' && root.contains(el);
      switch (a) {
        case 'up': case 'down': moveFocus(root, a); break;
        case 'left': case 'right':
          if (range) nudgeRange(el, a === 'left' ? -1 : 1);
          else moveFocus(root, a);
          break;
        case 'accept':
          if (root.contains(el) && el !== document.body && !range) el.click();
          else if (!root.contains(el)) focusFirst(root);
          break;
        case 'back':
          if (!this.back() && this.base === 'pause') this.h.resume();
          break;
        default:
      }
    }
  }

  loading(p, msg) {
    $('loadbar').style.width = `${Math.round(p * 100)}%`;
    if (msg) $('loadmsg').textContent = msg;
  }

  doneLoading() {
    const el = this.screens.loading;
    el.style.opacity = 0;
    setTimeout(() => el.classList.add('hidden'), 1200);
  }

  fade(toBlack, duration) {
    return new Promise((res) => {
      this.fadeEl.style.transitionDuration = `${duration}s`;
      this.fadeEl.style.opacity = toBlack ? 1 : 0;
      setTimeout(res, duration * 1000);
    });
  }

  // ------------------------------------------------------------------ HUD
  note(label, points) {
    if (game.mode !== Mode.RIDING && game.mode !== Mode.LIFT) return;
    const box = $('notes');
    const el = document.createElement('div');
    el.className = 'note';
    el.innerHTML = `${escapeHtml(label)}<b>+${points}</b>`;
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => el.classList.remove('on'), 2900);
    setTimeout(() => el.remove(), 3700);
  }

  pop(text, tone = 'gold', small = false) {
    if (game.mode !== Mode.RIDING) return;
    const el = document.createElement('div');
    el.className = `bigpop ${tone}${small ? ' small' : ''}`;
    el.textContent = text;
    document.getElementById('hud').appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    setTimeout(() => el.classList.add('out'), small ? 650 : 1000);
    setTimeout(() => el.remove(), small ? 1100 : 1500);
  }

  hint(text) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => el.classList.remove('on'), 4300);
  }

  update(dt, skier) {
    this.navigate(dt);
    const riding = game.mode === Mode.RIDING || game.mode === Mode.LIFT;
    if (skier.speed > 1 && skier.state !== State.LIFT) this.idle = 0; else this.idle += dt;
    const want = riding && this.idle < 3 ? 1 : 0;
    this.hudAlpha += (want - this.hudAlpha) * (1 - Math.exp(-(want > this.hudAlpha ? 2.5 : 1.2) * dt));
    $('speed').style.opacity = this.hudAlpha.toFixed(3);
    this.updateSpeed(Math.round(skier.speed * 3.6));
    $('liftlabel').classList.toggle('on', game.mode === Mode.LIFT);
  }

  /** Arcade speed readout: tier colour + a scale bounce whenever a milestone (50/100/150) is crossed. */
  updateSpeed(kmh) {
    if (kmh !== this._kmh) { $('kmh').textContent = kmh; this._kmh = kmh; }
    const M = HUD.speedMilestones;
    const up = M.filter((m) => kmh >= m).length;
    const down = M.filter((m) => kmh >= m - 4).length;   // a little hysteresis on the way down
    const cur = this.speedTier || 0;
    let next = cur;
    if (up > cur) next = up; else if (down < cur) next = down;
    if (next === cur) return;
    const el = $('speed');
    el.classList.remove(`tier${cur}`);
    el.classList.add(`tier${next}`);
    if (next > cur) {
      el.classList.remove('bump');
      void el.offsetWidth;   // restart the animation
      el.classList.add('bump');
    }
    this.speedTier = next;
  }

  // ------------------------------------------------------------------ settings + credits
  bindSettings() {
    const root = this.screens.settings;
    root.querySelectorAll('input[type=range]').forEach((el) => {
      el.value = settings[el.dataset.key];
      el.addEventListener('input', () => setSetting(el.dataset.key, Number(el.value)));
    });
    root.querySelectorAll('input[type=checkbox]').forEach((el) => {
      const k = el.dataset.key;
      el.checked = k === 'fullscreen' ? !!document.fullscreenElement : !!settings[k];
      el.addEventListener('change', () => {
        if (k === 'fullscreen') {
          if (el.checked) document.documentElement.requestFullscreen?.().catch(() => (el.checked = false));
          else document.exitFullscreen?.();
        } else setSetting(k, el.checked);
      });
    });
    document.addEventListener('fullscreenchange', () => {
      const fs = root.querySelector('input[data-key=fullscreen]');
      if (fs) fs.checked = !!document.fullscreenElement;
    });
    const seg = root.querySelector('.seg');
    const mark = () => seg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === settings.quality));
    seg.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { setSetting('quality', Number(b.dataset.v)); mark(); }));
    mark();
  }

  async loadCredits() {
    if (this._credits) return;
    try {
      const md = await (await fetch('/CREDITS.md')).text();
      $('creditsText').innerHTML = markdown(md);
      this._credits = true;
    } catch { $('creditsText').textContent = 'Credits unavailable.'; }
  }
}

function escapeHtml(s) { return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function markdown(md) {
  const out = [];
  let list = false;
  for (const raw of md.split('\n')) {
    let l = escapeHtml(raw.trim());
    l = l.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)(https?:\/\/[^\s,<]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    if (l.startsWith('- ')) { if (!list) { out.push('<ul>'); list = true; } out.push(`<li>${l.slice(2)}</li>`); continue; }
    if (list) { out.push('</ul>'); list = false; }
    if (l.startsWith('## ')) out.push(`<h2>${l.slice(3)}</h2>`);
    else if (l.startsWith('# ')) out.push(`<h1>${l.slice(2)}</h1>`);
    else if (l) out.push(`<p>${l}</p>`);
  }
  if (list) out.push('</ul>');
  return out.join('\n');
}

function trimNum(x) { return x.toFixed(2).replace(/\.?0+$/, ''); }
