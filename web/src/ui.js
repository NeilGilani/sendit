// Minimal, elegant HTML UI: menu over the flyover, fading HUD, soft score notes, hints, pause,
// settings, credits (rendered from CREDITS.md) and the fade curtain.
import { game, Mode, on, settings, setSetting } from './state.js';
import { State } from './player.js';
import { HUD } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.screens = ['loading', 'menu', 'pause', 'settings', 'credits', 'mountains'].reduce((o, k) => ((o[k] = $(k)), o), {});
    this.hud = $('hud');
    this.fadeEl = $('fade');
    this.settingsFrom = 'menu';
    this.idle = 0;
    this.hudAlpha = 0;
    document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => this.act(b.dataset.act)));
    this.bindSettings();
    on('score', ({ label, points }) => this.note(label, points));
    on('hint', (t) => this.hint(t));
    on('liftBoarded', (name) => { $('liftlabel').textContent = `${name}  ·  hold W / RT to hurry`; });
    on('mode', () => this.refresh());
    on('landed', ({ perfect }) => { if (perfect) this.pop('PERFECT!', 'gold'); });
    on('stumble', () => this.pop('WOBBLE!', 'pink'));
    on('nearMiss', () => this.pop('CLOSE SHAVE', 'cyan', true));
    on('crashed', (kind) => this.pop(['YARD SALE!', 'SNOW ANGEL!', 'FACEPLANT!', 'TREE HUGGER!'][kind === 'tree' ? 3 : Math.floor(Math.random() * 3)], 'pink'));
  }

  act(a) {
    switch (a) {
      case 'ride': this.h.ride(); break;
      case 'settings': this.settingsFrom = game.mode === Mode.PAUSED ? 'pause' : 'menu'; this.show('settings'); break;
      case 'credits': this.loadCredits(); this.show('credits'); break;
      case 'mountains': this.loadMountains(); this.show('mountains'); break;
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

  /** Controller menu navigation: d-pad / stick moves focus spatially, A selects, B goes back. */
  navigate(input) {
    const name = Object.keys(this.screens).find((k) => k !== 'loading' && !this.screens[k].classList.contains('hidden'));
    if (!name) return;
    const root = this.screens[name];
    const items = [...root.querySelectorAll('button, input[type=range], input[type=checkbox]')].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    let cur = items.includes(document.activeElement) ? document.activeElement : null;
    const step = input.navStep;
    if (step) {
      if (!cur) { this.focusPad(items[0]); return; }
      if (cur.type === 'range' && (step === 'left' || step === 'right')) {
        const min = Number(cur.min || 0), max = Number(cur.max || 1);
        const st = Number(cur.step) || (max - min) / 20;
        cur.value = Math.min(max, Math.max(min, Number(cur.value) + (step === 'right' ? st : -st)));
        cur.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const r = cur.getBoundingClientRect();
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[step];
      let best = null, bs = Infinity;
      for (const el of items) {
        if (el === cur) continue;
        const q = el.getBoundingClientRect();
        const ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy;
        const along = ex * dx + ey * dy;
        if (along <= 4) continue;
        const score = along + Math.abs(ex * dy - ey * dx) * 2.5;
        if (score < bs) { bs = score; best = el; }
      }
      if (best) this.focusPad(best);
    }
    if (input.navConfirm()) {
      const el = cur || items[0];
      input.swallowA();
      if (el.tagName === 'BUTTON' || el.type === 'checkbox') el.click();
    }
    if (input.navBack()) root.querySelector('[data-act="back"], [data-act="resume"]')?.click();
  }

  focusPad(el) {
    document.querySelectorAll('.pad-focus').forEach((e) => e.classList.remove('pad-focus'));
    el.classList.add('pad-focus');
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'nearest' });
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

  /** Menu subtitle for the loaded mountain. */
  setMountain(course) {
    const el = $('mountainName');
    if (!el) return;
    el.textContent = course.meta
      ? `${course.name} · ${course.meta.region} — ${course.run.name} (${course.run.drop} m vertical)`
      : 'Valcrest Gully · hand-built powder run';
  }

  /** Mountain picker: the hand-built gully + real Lake Tahoe mountains (each with up to 3 runs). */
  async loadMountains() {
    const list = $('mountainList');
    if (this._mountains) return;
    this._mountains = true;
    let index = [];
    try { index = await (await fetch('/resorts/index.json')).json(); } catch { /* no data built */ }
    const go = (resort, run) => {
      setSetting('resort', resort); setSetting('run', run);
      const q = new URLSearchParams(location.search);
      q.delete('kicker'); q.delete('at');
      if (resort) { q.set('resort', resort); q.set('run', run); } else { q.delete('resort'); q.delete('run'); }
      location.search = q.toString();
    };
    const card = (title, sub, runs) => {
      const box = document.createElement('div');
      box.className = 'mountain';
      box.innerHTML = `<div class="m-title">${title}</div><div class="m-sub">${sub}</div>`;
      const row = document.createElement('div');
      row.className = 'm-runs';
      for (const r of runs) {
        const b = document.createElement('button');
        b.innerHTML = `${r.label}<small>${r.meta}</small>`;
        b.addEventListener('click', r.go);
        row.appendChild(b);
      }
      box.appendChild(row);
      list.appendChild(box);
    };
    card('Valcrest Gully', 'Hand-built powder gully · jumps, pillows and drops', [{ label: 'Ride the gully', meta: '2.5 km', go: () => go('', 0) }]);
    for (const m of index) {
      card(m.name, m.region, m.runs.map((r, i) => ({ label: r.name, meta: `${r.drop} m vertical · ${(r.length / 1000).toFixed(1)} km`, go: () => go(m.id, i) })));
    }
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
