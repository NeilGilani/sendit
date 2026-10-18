// "Beat my run" (Steep's challenge-a-friend, Trackmania's ghost races, without a server): every finished
// Challenge run gets a "Copy challenge link" button on the results card. The link carries the map, trail,
// your name, time, style score, medal and a compact ghost of the run (core.js encodeVersus, ~2 KB).
// Opening it (?map=…&trail=…&challenge&vs=CODE) starts that Challenge with your friend's ghost in pink,
// labelled with their name, a live "▲ 12 m / ▼ 8 m" gap to them under the timer, and at the finish a
// verdict ("YOU BEAT MIA BY 1.24 s" or "MIA WINS BY 0.80 s · RACE AGAIN") on screen and on the card.
// The target stays for every retry of that run until the page is reloaded without ?vs.
import * as THREE from 'three';
import { on, emit, game, Mode } from '../state.js';
import { encodeVersus, decodeVersus, marginText } from './core.js';
import { skierGeometry } from '../life.js';
import { fmtTime } from '../activities.js';
import { progression } from '../progression/index.js';

export function installVersus({ scene, course, player, activities, hud, getMap, getName, params }) {
  let target = null;
  const code = params?.get?.('vs');
  if (code) {
    const d = decodeVersus(code);
    const mapId = getMap()?.mapId;
    if (!d) setTimeout(() => emit('hint', 'That challenge link is broken or from another version'), 4000);
    else if (d.map !== mapId) setTimeout(() => emit('hint', `That challenge is on another mountain (${d.map})`), 4000);
    else target = d;
  }

  // ---- the friend's ghost
  let ghost = null, label = null, gi = 0;
  if (target?.ghost && scene) {
    ghost = new THREE.Mesh(skierGeometry('#ff5cc8', '#ff5cc8', '#ffffff', '#ff5cc8'), new THREE.MeshBasicMaterial({ color: 0xff6ad5, transparent: true, opacity: 0.42, depthWrite: false }));
    ghost.renderOrder = 4; ghost.visible = false;
    label = nameSprite(target.name);
    label.position.y = 2.5;
    ghost.add(label);
    scene.add(ghost);
  }
  function playGhost(t) {
    const G = target.ghost, n = G.length / 5;
    if (gi >= n - 1 || G[gi * 5] > t) gi = 0;
    while (gi < n - 2 && G[(gi + 1) * 5] < t) gi++;
    if (t > G[(n - 1) * 5]) { ghost.visible = false; return; }
    const a = gi * 5, b = a + 5, k = Math.min(1, Math.max(0, (t - G[a]) / Math.max(1e-3, G[b] - G[a])));
    ghost.position.set(G[a + 1] + (G[b + 1] - G[a + 1]) * k, G[a + 2] + (G[b + 2] - G[a + 2]) * k, G[a + 3] + (G[b + 3] - G[a + 3]) * k);
    let dh = G[b + 4] - G[a + 4];
    if (dh > Math.PI) dh -= Math.PI * 2; if (dh < -Math.PI) dh += Math.PI * 2;
    ghost.rotation.set(0, G[a + 4] + dh * k, 0);
    ghost.visible = ghost.position.distanceToSquared(player.renderPos) > 1.2;
  }

  // ---- HUD line under the Challenge timer
  let line = null;
  if (target && typeof document !== 'undefined') {
    line = document.createElement('div');
    line.id = 'thrill-vs';
    line.style.cssText = 'margin-top:6px;font-size:13px;font-weight:700;letter-spacing:.12em;color:#ffb3ea;text-shadow:0 1px 6px rgba(0,0,0,.45)';
    document.getElementById('chal')?.appendChild(line);
  }
  let hudT = 0;

  // ---- results: verdict row + the share button
  let last = null;
  on('runFinished', (res) => {
    if (!res) return;
    last = { res, ghost: activities?.rec ? activities.rec.slice() : null };
    if (target && !res.judged) {
      const win = res.time < target.time;
      const txt = win ? `YOU BEAT ${target.name.toUpperCase()} BY ${marginText(res.time, target.time)}` : `${target.name.toUpperCase()} WINS BY ${marginText(res.time, target.time)}`;
      hud?.banner?.(txt, win ? '#ffe14d' : '#ff5cc8', !win);
      emit('thrillVersus', { win, time: res.time, target: target.time, name: target.name });
      if (win) progression.core?.recordThrill?.('versusWin');
    }
    setTimeout(() => decorateResults(), 950);
  });

  function link() {
    if (!last) return null;
    const m = getMap();
    const c = encodeVersus({ map: m.mapId, trail: m.trailId, name: getName(), time: last.res.time, score: last.res.score, medal: last.res.medal, ghost: last.ghost });
    const q = new URLSearchParams();
    q.set('map', m.mapId);
    if (m.trailId) q.set('trail', m.trailId);
    q.set('challenge', '');
    q.set('vs', c);
    return `${location.origin}${location.pathname}?${q.toString().replace('challenge=&', 'challenge&')}`;
  }

  function decorateResults() {
    const rows = document.getElementById('resRows'), nav = document.querySelector('#results .res-nav');
    if (!rows || !nav || !last) return;
    if (target && !last.res.judged) {
      const win = last.res.time < target.time;
      rows.insertAdjacentHTML('beforeend', `<div class="k">VS ${esc(target.name)}</div><div class="v${win ? ' new' : ''}">${fmtTime(target.time)} · ${win ? `you win by ${marginText(last.res.time, target.time)}` : `${esc(target.name)} by ${marginText(last.res.time, target.time)}`}</div>`);
    }
    let btn = nav.querySelector('[data-act=thrill-share]');
    if (!btn) {
      btn = document.createElement('button');
      btn.dataset.act = 'thrill-share';
      btn.type = 'button';
      nav.insertBefore(btn, nav.children[1] || null);
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = link();
        if (!url) return;
        let ok = false;
        try { await navigator.clipboard.writeText(url); ok = true; } catch { /* no clipboard permission */ }
        if (!ok) { try { window.prompt('Copy this link and send it to a friend:', url); ok = true; } catch { /* blocked */ } }
        btn.textContent = ok ? 'Link copied · send it to a friend' : 'Copy failed';
        emit('thrillShare', { length: url.length, copied: ok });
      });
    }
    btn.textContent = target ? 'Copy link · challenge back' : 'Copy challenge link';
  }

  return {
    target,
    link,
    update(dt) {
      if (!target) return;
      const A = activities;
      const running = game.mode === Mode.RIDING && A?.mode === 'challenge' && A.state === 'running';
      if (ghost) { if (running) playGhost(A.time); else ghost.visible = false; }
      if (!line) return;
      hudT -= dt;
      if (hudT > 0) return;
      hudT = 0.2;
      let txt = `VS ${target.name.toUpperCase()} · ${fmtTime(target.time)}`;
      if (running && ghost?.visible !== undefined && course?.progress && target.ghost) {
        const me = course.progress(player.position.x, player.position.z), them = course.progress(ghost.position.x, ghost.position.z);
        if (me >= 0 && them >= 0 && A.time > 1) {
          const d = Math.round(me - them);
          txt += d >= 0 ? `  ▲ ${d} m` : `  ▼ ${-d} m`;
          line.style.color = d >= 0 ? '#7ef9ff' : '#ffb3ea';
        }
      }
      if (line.textContent !== txt) line.textContent = txt;
    },
  };
}

function nameSprite(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = 'bold 30px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(40,0,30,0.8)'; g.strokeText(name.toUpperCase(), 128, 32);
  g.fillStyle = '#ffd0f2'; g.fillText(name.toUpperCase(), 128, 32);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(2.4, 0.6, 1);
  return sp;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
