// Minimal, elegant HTML UI: menu over the flyover, fading HUD, soft score notes, hints, pause,
// settings, credits (rendered from CREDITS.md) and the fade curtain.
import { game, Mode, on, settings, setSetting } from './state.js';
import { State } from './skier.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = ['loading', 'menu', 'pause', 'settings', 'credits'].reduce((o, k) => ((o[k] = $(k)), o), {});
    this.hud = $('hud');
    this.fadeEl = $('fade');
    this.settingsFrom = 'menu';
    this.idle = 0;
    this.hudAlpha = 0;
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    this.bindSettings();
    on('score', ({ label, points }) => this.note(label, points));
    on('hint', (t) => this.hint(t));
    on('liftBoarded', (name) => { $('liftlabel').textContent = `${name}  ·  hold W to hurry`; });
    on('mode', () => this.refresh());
  }

  act(a) {
    switch (a) {
      case 'ride': this.h.ride(); break;
      case 'settings': this.settingsFrom = game.mode === Mode.PAUSED ? 'pause' : 'menu'; this.show('settings'); break;
      case 'credits': this.loadCredits(); this.show('credits'); break;
      case 'resume': this.h.resume(); break;
      case 'top': this.h.resume(); this.h.top(); break;
      case 'menu': this.h.menu(); break;
      case 'back': this.show(game.mode === Mode.PAUSED ? 'pause' : 'menu'); break;
    }
  }

  show(name) {
    for (const [k, el] of Object.entries(this.screens)) el.classList.toggle('hidden', k !== name);
    const riding = name === null;
    this.hud.classList.toggle('hidden', !riding);
    if (name && this.screens[name]) this.screens[name].querySelector('button')?.focus({ preventScroll: true });
  }

  refresh() {
    if (game.mode === Mode.MENU) this.show('menu');
    else if (game.mode === Mode.RIDING || game.mode === Mode.LIFT) this.show(null);
    else if (game.mode === Mode.PAUSED) {
      $('stats').textContent = `${(game.distance / 1000).toFixed(1)} km skied · ${game.smoothTurns} smooth turns · ${game.airTotal.toFixed(0)} s of air · score ${game.score}`;
      this.show('pause');
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

  hint(text) {
    const el = $('hint');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this._hintT);
    this._hintT = setTimeout(() => el.classList.remove('on'), 4300);
  }

  update(dt, skier) {
    const riding = game.mode === Mode.RIDING || game.mode === Mode.LIFT;
    if (skier.speed > 1 && skier.state !== State.LIFT) this.idle = 0; else this.idle += dt;
    const want = riding && this.idle < 3 ? 1 : 0;
    this.hudAlpha += (want - this.hudAlpha) * (1 - Math.exp(-(want > this.hudAlpha ? 2.5 : 1.2) * dt));
    $('speed').style.opacity = this.hudAlpha.toFixed(3);
    $('kmh').textContent = Math.round(skier.speed * 3.6);
    $('liftlabel').classList.toggle('on', game.mode === Mode.LIFT);
  }

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
