// Voltage Park HUD (browser only; mounted from index.js): the grind balance meter and live trick name, timing
// feedback (pop, landing zone, pipe height, switch-ups), the in-run speed gauge for the jump ahead (its
// landing's window and sweet spot), the judged slopestyle card at the finish, the practice key (T: back to
// the last feature you hit), the grind sound (assets/audio/grind_loop.ogg + a clank on lock-on), and the event
// energy: drop-in callouts at the top of the steep in-runs, the launch speed off every big lip, MEGA AIR calls
// with a crowd roar off the biggest airs, and the run's top speed and longest air on the judged card.
import { on, emit, game, Mode, settings } from '../../state.js';
import { predictLipSpeed } from './park.js';
import { START_X, PITCH } from './layout.js';

const CSS = /* css */`
#parkHud { position: absolute; inset: 0; pointer-events: none; font-family: "Arial Black", "Segoe UI Black", Impact, sans-serif; font-style: italic; color: #fffaf0; }
#parkHud .bal { position: absolute; left: 50%; bottom: 168px; width: 340px; transform: translateX(-50%); opacity: 0; transition: opacity .15s; text-align: center; }
#parkHud .bal.on { opacity: 1; }
#parkHud .bal .trick { font-size: 26px; -webkit-text-stroke: 1.2px #1b1446; paint-order: stroke fill; text-shadow: 0 0 16px rgba(47,245,214,0.6); white-space: nowrap; }
#parkHud .bal .len { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 800; font-size: 13px; letter-spacing: .18em; opacity: .85; margin: 2px 0 8px; }
#parkHud .bal .bar { position: relative; height: 14px; border-radius: 8px; overflow: hidden; border: 1px solid rgba(255,255,255,.35);
  background: linear-gradient(90deg, #ff3d6e 0%, #ffb02e 16%, #2ff5d6 34%, #2ff5d6 66%, #ffb02e 84%, #ff3d6e 100%); box-shadow: 0 2px 16px rgba(0,0,0,.35); }
#parkHud .bal .needle { position: absolute; top: -4px; width: 6px; height: 22px; margin-left: -3px; left: 50%; background: #fff; border-radius: 3px; box-shadow: 0 0 10px #fff, 0 0 2px #000; }
#parkHud .bal .keys { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 700; font-size: 11px; letter-spacing: .12em; opacity: .6; margin-top: 6px; }
#parkHud .pop { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; opacity: 0; -webkit-text-stroke: 1.2px #1b1446; paint-order: stroke fill; }
#parkHud .pop.show { animation: pkPop 1.3s ease-out forwards; }
@keyframes pkPop { 0% { opacity: 0; transform: translateX(-50%) translateY(8px) scale(.9); } 12% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1.06); } 22% { transform: translateX(-50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-14px); } }
#parkHud .p1 { bottom: 262px; font-size: 22px; }
#parkHud .p2 { bottom: 294px; font-size: 30px; }
#parkHud .p3 { top: 150px; font-size: 20px; }
#parkHud .p4 { top: 92px; font-size: 44px; letter-spacing: .04em; text-shadow: 0 0 24px rgba(255,61,154,.75), 0 0 6px rgba(0,0,0,.6); }
#parkHud .p4.show { animation: pkBig 1.9s cubic-bezier(.2,.9,.3,1) forwards; }
@keyframes pkBig { 0% { opacity: 0; transform: translateX(-50%) scale(1.6); } 10% { opacity: 1; transform: translateX(-50%) scale(.96); } 18% { transform: translateX(-50%) scale(1.02); } 80% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) scale(1); } }
#parkHud .spd { position: absolute; right: 36px; bottom: 150px; width: 210px; opacity: 0; transition: opacity .25s; text-align: right; }
#parkHud .spd.on { opacity: 1; }
#parkHud .spd .lab { font-size: 12px; letter-spacing: .26em; opacity: .8; }
#parkHud .spd .nm { font-size: 18px; -webkit-text-stroke: 1px #1b1446; paint-order: stroke fill; }
#parkHud .spd .track { position: relative; height: 10px; margin-top: 6px; border-radius: 5px; background: rgba(12,16,30,.5); border: 1px solid rgba(255,255,255,.3); overflow: hidden; }
#parkHud .spd .win { position: absolute; top: 0; bottom: 0; background: rgba(47,245,214,.55); }
#parkHud .spd .sw { position: absolute; top: 0; bottom: 0; width: 4px; margin-left: -2px; background: #ffe14d; }
#parkHud .spd .me { position: absolute; top: -3px; width: 4px; height: 16px; margin-left: -2px; background: #fff; box-shadow: 0 0 8px #fff; }
#parkHud .spd .tip { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 800; font-size: 12px; letter-spacing: .12em; margin-top: 5px; }
#parkHud .card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.96); min-width: 360px; padding: 20px 26px; border-radius: 16px; font-style: normal;
  font-family: "Inter", "Segoe UI", sans-serif; background: rgba(12,16,30,.66); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.14); opacity: 0; transition: opacity .4s, transform .4s; }
#parkHud .card.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#parkHud .card h3 { margin: 0 0 4px; font-family: "Arial Black", Impact, sans-serif; font-style: italic; font-size: 22px; color: #ffe14d; letter-spacing: .06em; }
#parkHud .card .sub { font-size: 11px; letter-spacing: .22em; opacity: .6; margin-bottom: 10px; }
#parkHud .card .row { display: flex; justify-content: space-between; gap: 24px; font-size: 14px; padding: 2px 0; }
#parkHud .card .bar { height: 4px; border-radius: 3px; background: rgba(255,255,255,.15); overflow: hidden; margin: 1px 0 5px; }
#parkHud .card .bar i { display: block; height: 100%; background: linear-gradient(90deg, #2ff5d6, #ff3d9a); }
#parkHud .card .tot { display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; }
#parkHud .card .tot b { font-family: "Arial Black", Impact, sans-serif; font-style: italic; font-size: 44px; color: #ffe14d; }
/* Phones (portrait): compact judged card low on the screen, under the achievement toasts. */
@media (max-width: 600px) {
  #parkHud .card { top: auto; bottom: 172px; transform: translate(-50%, 0) scale(.96); min-width: 0; width: calc(100vw - 32px); box-sizing: border-box; padding: 14px 18px 12px; }
  #parkHud .card.on { transform: translate(-50%, 0) scale(1); }
  #parkHud .card .row { font-size: 12.5px; padding: 0; }
  #parkHud .card .bar { margin: 1px 0 3px; }
  #parkHud .card .sub { margin-bottom: 6px; }
  #parkHud .card .tot { margin-top: 6px; }
  #parkHud .card .tot b { font-size: 36px; }
}
`;

const DROPS = [['plunge', 'DROPPING IN · THE PLUNGE'], ['launch', 'DROPPING IN · THE LAUNCH'], ['mega', 'MEGAWATT · SEND IT']];

const ZONES = {
  sweet: ['SWEET SPOT', '#ffe14d'], deep: ['DEEP · CLEAN', '#2ff5d6'], short: ['SHORT', '#ffb02e'],
  knuckle: ['KNUCKLED', '#ff8a3d'], cased: ['CASED THE DECK', '#ff3d6e'], overshot: ['OVERSHOT', '#ff3d6e'],
};

export function mountParkHud(course) {
  if (typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const root = document.createElement('div');
  root.id = 'parkHud';
  root.innerHTML = `
    <div class="bal"><div class="trick"></div><div class="len"></div><div class="bar"><div class="needle"></div></div><div class="keys">A / D BALANCE · SPACE TAP SWITCH-UP · HOLD + RELEASE POP · W / S PRESS</div></div>
    <div class="pop p1"></div><div class="pop p2"></div><div class="pop p3"></div><div class="pop p4"></div>
    <div class="spd"><div class="lab">IN-RUN SPEED</div><div class="nm"></div><div class="track"><div class="win"></div><div class="sw"></div><div class="me"></div></div><div class="tip"></div></div>
    <div class="card"></div>`;
  const attach = () => (document.getElementById('hud') || document.body).appendChild(root);
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', attach); else attach();
  const $ = (s) => root.querySelector(s);
  const bal = $('.bal'), trick = $('.trick'), len = $('.len'), needle = $('.needle');
  const spd = $('.spd'), card = $('.card');
  const pop = (el, text, color) => { el.textContent = text; el.style.color = color; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); };
  const p1 = $('.p1'), p2 = $('.p2'), p3 = $('.p3'), p4 = $('.p4');
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  on('parkPop', ({ label, q }) => pop(p1, label, q >= 0.95 ? '#ffe14d' : q >= 0.8 ? '#2ff5d6' : '#ffb02e'));
  on('parkLanding', ({ zone, jump, dist }) => { const [t, c] = ZONES[zone] || ['', '#fff']; pop(p2, `${t} · ${Math.round(dist)} M`, c); void jump; });
  on('pipeAir', ({ height }) => pop(p1, `${height.toFixed(1)} M OUT`, height > 4.5 ? '#ffe14d' : '#2ff5d6'));
  on('grindTrick', ({ trick: t }) => pop(p1, `SWITCH-UP · ${t.toUpperCase()}`, '#2ff5d6'));
  on('grindScore', ({ label, points }) => pop(p3, `${label}  +${fmt(points)}`, '#ffe14d'));
  on('grindLost', () => pop(p3, 'GRIND LOST', '#ff6bb0'));
  on('grindClip', () => pop(p1, 'CLIPPED THE RAIL', '#ff6bb0'));
  on('grindEnd', ({ reason }) => { if (reason === 'bail') pop(p2, 'BAILED', '#ff3d6e'); else if (reason === 'stall') pop(p1, 'STALLED', '#ffb02e'); });

  // ---- event energy
  const kmh = (v) => Math.round(v * 3.6);
  const BIG = new Set(['Megawatt', 'The Tower', 'The Gap', 'Voltage', 'Thunder', 'The Canal']);
  const run = { top: 0, air: 0, drops: new Set() };
  on('rideStarted', () => { run.top = 0; run.air = 0; run.drops.clear(); });
  on('resetTop', () => { run.top = 0; run.air = 0; run.drops.clear(); });
  let launch = null;
  on('takeoff', () => {
    const pl = course.player;
    if (!pl) return;
    const nm = course.featureAt(pl.position.x, pl.position.z);
    launch = nm ? { nm, v: pl.speed } : null;
    if (nm && pl.speed > 16 && course.named.some((n) => n.name === nm && n.kind === 'jump')) pop(p1, `${nm.toUpperCase()} · ${kmh(pl.speed)} KM/H`, pl.speed > 21 ? '#ffe14d' : '#2ff5d6');
  });
  on('landed', (e) => {
    run.air = Math.max(run.air, e.air || 0);
    const big = launch && BIG.has(launch.nm);
    if (e.air >= 2.6 && (big || e.air >= 3)) {
      pop(p4, e.clean ? (e.air >= 3.2 ? `MEGA AIR · ${e.air.toFixed(1)} S` : `HUGE · ${e.air.toFixed(1)} S`) : `SKETCHY · ${e.air.toFixed(1)} S`, e.clean ? '#ffe14d' : '#ff6bb0');
      if (e.clean) roar(Math.min(1, (e.air - 2) / 1.6));
    }
    launch = null;
  });
  on('parkLanding', ({ zone, jump }) => { if (zone === 'sweet' && BIG.has(jump)) roar(0.45); });

  // ---- practice: T = back to the approach of the last feature you hit
  let last = null, hinted = false;
  const remember = (x, z, heading) => { last = { x, z, heading }; if (!hinted) { hinted = true; setTimeout(() => emit('hint', 'Practice: press T to go back to the last feature you hit'), 1500); } };
  on('grindStart', ({ rail }) => {
    const p = rail.pts[0], q = rail.pts[1];
    const dx = q[0] - p[0], dz = q[2] - p[2], L = Math.hypot(dx, dz) || 1;
    remember(p[0] - dx / L * 26, p[2] - dz / L * 26, Math.atan2(-dx, -dz));
  });
  on('takeoff', () => {
    const pl = course.player;
    if (!pl) return;
    for (const f of course.features) {
      if (!f.jump) continue;
      const [a, b] = f.local(pl.position.x, pl.position.z);
      if (Math.abs(b) < f.jump.hw + 2 && Math.abs(a - f.jump.lipA) < 4) {
        const back = f.kind === 'bigair' ? f.marks.top.a - 2 : Math.max(f.a0 + 1, f.jump.lipA - 45);
        const [x, z] = f.world(back, 0);
        remember(x, z, Math.atan2(-f.fx, -f.fz));
        return;
      }
    }
  });
  addEventListener('keydown', (e) => {
    if (e.code !== 'KeyT' || game.mode !== Mode.RIDING || !last) return;
    const pl = course.player;
    if (!pl || pl._busy) return;
    emit('hint', 'Practice · back to the last feature');
    pl.fadeThen(() => { pl.place({ x: last.x, y: 0, z: last.z }, last.heading); emit('respawned'); });
  });

  // ---- on the way in: the controls for rails, and a word about non-twin skis (they can't land switch)
  on('rideStarted', () => {
    setTimeout(() => emit('hint', 'Rails: come down onto them lined up · A / D balance · tap Space to switch up · hold + release to pop off'), 9000);
    setTimeout(() => {
      const eq = course.player?.equipment;
      if (eq?.type === 'ski' && !eq.spec?.twin) emit('hint', 'Tip: twin-tip park skis (Jibworks Twin, in the lobby) land switch — straight airs in the pipe and off rails land backwards');
    }, 15000);
  });

  // ---- judged run card (zen runs; challenge runs use the results screen)
  let cardT = 0;
  on('runComplete', () => {
    const j = course.judgeRun?.finish();
    if (!j) return;
    const key = 'sendit.park.voltage';
    let best = null;
    try { best = JSON.parse(localStorage.getItem(key)); } catch { /* private mode */ }
    const isBest = !best || j.total > best.total;
    if (isBest) try { localStorage.setItem(key, JSON.stringify({ total: j.total })); } catch { /* full */ }
    const bar = (k, v, max) => `<div class="row"><span>${k}</span><b>${v.toFixed(1)}</b></div><div class="bar"><i style="width:${Math.min(100, v / max * 100)}%"></i></div>`;
    const rating = j.total >= 88 ? 'OLYMPIC' : j.total >= 80 ? 'PODIUM' : j.total >= 65 ? 'FINALS' : j.total >= 50 ? 'QUALIFIED' : 'KEEP SENDING';
    card.innerHTML = `<h3>SLOPESTYLE · JUDGED</h3><div class="sub">AMPLITUDE · DIFFICULTY · EXECUTION · VARIETY · FLOW</div>
      ${j.sections.map((s) => bar(s.name, s.score, 10)).join('')}
      ${bar('Variety', j.variety, 20)}${bar('Amplitude', j.amplitude, 10)}${bar('Flow', j.flow, 10)}
      <div class="tot"><span>${rating}${j.medal ? ` · ${j.medal.toUpperCase()}` : ''}</span><b>${j.total.toFixed(1)}</b></div>
      <div class="row"><span>Personal best</span><b>${isBest ? 'NEW BEST!' : best.total.toFixed(1)}</b></div>
      <div class="row"><span>Top speed · longest air</span><b>${kmh(run.top)} km/h · ${run.air.toFixed(1)} s</b></div>`;
    card.classList.add('on');
    cardT = performance.now() + 7500;
  });

  // ---- per frame: balance meter, speed gauge
  const tick = () => {
    requestAnimationFrame(tick);
    if (cardT && performance.now() > cardT) { card.classList.remove('on'); cardT = 0; }
    const riding = game.mode === Mode.RIDING;
    root.style.display = riding || game.mode === Mode.LIFT ? '' : 'none';
    const pl = course.player;
    if (!pl || !riding) return;
    const g = pl.state === 5 ? pl.grind?.g : null;
    bal.classList.toggle('on', !!g);
    if (g) {
      trick.textContent = g.tricks[g.tricks.length - 1].toUpperCase() + (Math.abs(g.press) > 0.6 ? (g.press > 0 ? ' · NOSE PRESS' : ' · TAIL PRESS') : '');
      len.textContent = `${g.rail.name.toUpperCase()} · ${g.dist.toFixed(1)} M`;
      needle.style.left = `${50 + Math.max(-1, Math.min(1, g.b)) * 50}%`;
    }
    gauge(pl);
    audio(pl);
    if (pl.state === 1 || pl.state === 5) run.top = Math.max(run.top, pl.speed);
    // Dropping into the steep pitches: a call at the top of each.
    const u = pl.position.x - START_X;
    for (const [k, label] of DROPS) {
      const at = PITCH[k];
      if (u > at - 6 && u < at + 4 && !run.drops.has(k)) { run.drops.add(k); pop(p3, label, '#ff3d9a'); }
    }
  };
  requestAnimationFrame(tick);

  // In-run gauge: the next jump ahead on your line; predicted lip speed against the landing's window.
  const win = $('.win'), sw = $('.sw'), me = $('.me');
  function gauge(pl) {
    let J = null, best = 1e9;
    if (pl.state === 1) {
      const sp = Math.hypot(pl.velocity.x, pl.velocity.z);
      for (const f of course.features) {
        if (!f.jump?.land) continue;
        const [a, b] = f.local(pl.position.x, pl.position.z);
        const ahead = f.jump.lipA - a;
        if (ahead < 2 || ahead > 110 || Math.abs(b) > f.jump.hw + 1.5) continue;   // (≈ 5 s out at 22 m/s)
        // Heading roughly along the jump.
        if (sp > 2 && (pl.velocity.x * f.fx + pl.velocity.z * f.fz) / sp < 0.7) continue;
        if (ahead < best) { best = ahead; J = f; }
      }
    }
    spd.classList.toggle('on', !!J);
    if (!J) return;
    const L = J.jump.land, lo = Math.max(0, L.vMin - 4), hi = L.vMax + 4;
    const x = (v) => `${Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100))}%`;
    const v = predictLipSpeed(pl, J) + 0.35;   // (the 1D in-run model reads ~0.35 m/s under the real lip speed, measured tucked 20–40 m out)
    win.style.left = x(L.vMin); win.style.width = `calc(${x(L.vMax)} - ${x(L.vMin)})`;
    sw.style.left = x(L.sweet?.v ?? (L.vMin + L.vMax) / 2);
    me.style.left = x(v);
    $('.nm').textContent = J.name.toUpperCase();
    const tip = $('.tip');
    if (v < L.vMin) { tip.textContent = 'TOO SLOW · TUCK'; tip.style.color = '#ffb02e'; }
    else if (v > L.vMax) { tip.textContent = 'TOO FAST · CHECK SPEED (S)'; tip.style.color = '#ff3d6e'; }
    else if (Math.abs(v - (L.sweet?.v ?? v)) < 1.2) { tip.textContent = 'SWEET SPOT SPEED'; tip.style.color = '#ffe14d'; }
    else { tip.textContent = 'IN THE WINDOW'; tip.style.color = '#2ff5d6'; }
  }

  // ---- grind audio
  let ctx = null, buf = null, src = null, gain = null, loading = false;
  async function ensure() {
    if (ctx || loading || window.__senditAudio?.engine) return;   // the main audio engine (audio/grind.js) plays grinds when it runs
    loading = true;
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      ctx = new C();
      const r = await fetch('/audio/grind_loop.ogg').catch(() => fetch('/audio/grind_loop.mp3'));
      buf = await ctx.decodeAudioData(await r.arrayBuffer());
      gain = ctx.createGain(); gain.gain.value = 0; gain.connect(ctx.destination);
    } catch (e) { console.warn('[park] grind audio', e); }
    loading = false;
  }
  const vol = () => (settings.master ?? 0.8) * (settings.sfx ?? 0.8);
  on('grindStart', ({ kind }) => {
    ensure().then(() => {
      if (!ctx || !buf) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!src) { src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; src.connect(gain); src.start(); }
      src.playbackRate.value = kind === 'rail' ? 1.15 : kind === 'tube' ? 0.95 : 0.8;
      clank(kind);
    });
  });
  // The crowd: a band-passed noise swell (a roar off the biggest airs, a cheer on a sweet spot).
  let noise = null;
  function roar(k) {
    ensure().then(() => {
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!noise) {
        noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
        const d = noise.getChannelData(0);
        let b = 0;
        for (let i = 0; i < d.length; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 6; }
      }
      const t = ctx.currentTime, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      s.buffer = noise; s.playbackRate.value = 0.9 + Math.random() * 0.2;
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.7;
      const peak = (0.12 + 0.25 * k) * vol();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.2 + 0.8 * k);
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t); s.stop(t + 2.1);
    });
  }
  function clank(kind) {
    if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g2 = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'square'; o.frequency.setValueAtTime(kind === 'rail' ? 420 : kind === 'tube' ? 180 : 120, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    f.type = 'bandpass'; f.frequency.value = kind === 'rail' ? 1800 : 600; f.Q.value = 2;
    g2.gain.setValueAtTime(0.35 * vol(), t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(f); f.connect(g2); g2.connect(ctx.destination); o.start(t); o.stop(t + 0.2);
  }
  function audio(pl) {
    if (!gain || !ctx) return;
    const g = pl.state === 5 ? pl.grind?.g : null;
    const want = g && !g.hop && game.mode === Mode.RIDING ? Math.min(1, 0.35 + g.v / 12) * 0.55 * vol() : 0;
    gain.gain.setTargetAtTime(want, ctx.currentTime, want > 0 ? 0.03 : 0.08);
    if (g && src) src.playbackRate.setTargetAtTime((g.rail.kind === 'rail' ? 1.0 : 0.8) + g.v * 0.02, ctx.currentTime, 0.1);
  }
}
