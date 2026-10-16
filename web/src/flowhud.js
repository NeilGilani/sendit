// Flow HUD (maps that run the flow layer, physics/flow.js): the flow meter and SEND IT state
// (bottom left), the live line chain with its multiplier (top centre), and a landing grade with the
// drop height (lower centre). Self-contained: its own DOM inside #hud and its own styles.
import { on, game, Mode } from './state.js';

const CSS = /* css */`
#flowHud { position: absolute; inset: 0; pointer-events: none; font-family: "Arial Black", "Segoe UI Black", Impact, sans-serif; font-style: italic; }
#flowHud .fm { position: absolute; left: 34px; bottom: 34px; width: 250px; transform: skewX(-12deg); }
#flowHud .fm .lab { font-size: 13px; letter-spacing: 0.32em; color: rgba(250,248,243,0.75); margin-bottom: 6px; transform: skewX(12deg); text-shadow: 0 1px 6px rgba(0,0,0,0.5); }
#flowHud .fm .bar { height: 11px; background: rgba(12,16,30,0.45); border: 1px solid rgba(255,255,255,0.28); border-radius: 2px; overflow: hidden; box-shadow: 0 2px 14px rgba(0,0,0,0.25); }
#flowHud .fm .fill { height: 100%; width: 0%; background: linear-gradient(90deg, #2ff5d6, #7a5cff 60%, #ff3d9a); transition: width .18s; }
#flowHud .fm.full .fill { background: linear-gradient(90deg, #ffe14d, #ff9a3d 50%, #ff3d9a); animation: fhPulse .5s infinite alternate; }
#flowHud .fm .send { position: absolute; left: 0; bottom: 20px; font-size: 40px; color: #ffe14d; letter-spacing: 0.02em; opacity: 0; transform: skewX(12deg) translateY(8px) scale(.9);
  transition: opacity .25s, transform .25s; -webkit-text-stroke: 1.5px #2a0e3a; paint-order: stroke fill; text-shadow: 0 0 22px rgba(255,120,60,0.85), 0 0 4px #fff; white-space: nowrap; }
#flowHud .fm.full .send { opacity: 1; transform: skewX(12deg) translateY(0) scale(1); }
#flowHud .fm.full .lab { opacity: 0; }
@keyframes fhPulse { from { filter: brightness(1); } to { filter: brightness(1.45); } }
#flowHud .ch { position: absolute; left: 50%; top: 92px; transform: translateX(-50%); text-align: center; opacity: 0; transition: opacity .3s; white-space: nowrap; }
#flowHud .ch.on { opacity: 1; }
#flowHud .ch .mult { font-size: 44px; color: #fffaf0; -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; text-shadow: 0 2px 18px rgba(47,245,214,0.55); line-height: 1; }
#flowHud .ch .mult small { font-size: 22px; color: #2ff5d6; margin-left: 10px; }
#flowHud .ch .items { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 700; font-size: 13px; letter-spacing: 0.06em; color: rgba(250,248,243,0.82); margin-top: 6px; text-shadow: 0 1px 6px rgba(0,0,0,0.6); }
#flowHud .ch .tim { height: 3px; width: 160px; margin: 7px auto 0; background: rgba(255,255,255,0.25); border-radius: 2px; overflow: hidden; }
#flowHud .ch .tim i { display: block; height: 100%; width: 100%; background: #2ff5d6; }
#flowHud .bank { position: absolute; left: 50%; top: 96px; transform: translateX(-50%) scale(.8); font-size: 34px; opacity: 0; white-space: nowrap; -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; }
#flowHud .bank.show { animation: fhBank 1.6s ease-out forwards; }
@keyframes fhBank { 0% { opacity: 0; transform: translateX(-50%) scale(.6); } 12% { opacity: 1; transform: translateX(-50%) scale(1.12); } 25% { transform: translateX(-50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-24px); } }
#flowHud .gr { position: absolute; left: 50%; bottom: 150px; transform: translateX(-50%); text-align: center; opacity: 0; white-space: nowrap; }
#flowHud .gr.show { animation: fhGrade 1.5s ease-out forwards; }
#flowHud .gr .g { font-size: 30px; -webkit-text-stroke: 1.2px #1b1446; paint-order: stroke fill; letter-spacing: 0.04em; }
#flowHud .gr .d { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 800; font-size: 15px; letter-spacing: 0.14em; color: #fffaf0; text-shadow: 0 1px 6px rgba(0,0,0,0.6); margin-top: 2px; }
@keyframes fhGrade { 0% { opacity: 0; transform: translateX(-50%) translateY(10px); } 10% { opacity: 1; transform: translateX(-50%) translateY(0); } 80% { opacity: 1; } 100% { opacity: 0; } }
#flowHud .vig { position: absolute; inset: 0; opacity: 0; transition: opacity .6s; box-shadow: inset 0 0 140px 30px rgba(255, 120, 60, 0.28); }
#flowHud .vig.on { opacity: 1; }
body.fp #flowHud .fm { bottom: 46px; }
`;

const GRADES = { stomped: ['STOMPED', '#ffe14d'], clean: ['CLEAN', '#2ff5d6'], sketchy: ['SKETCHY', '#ff6bb0'] };

export function mountFlowHud(player) {
  if (typeof document === 'undefined' || document.getElementById('flowHud')) return null;
  const host = document.getElementById('hud') || document.body;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const root = document.createElement('div');
  root.id = 'flowHud';
  root.innerHTML = `
    <div class="vig"></div>
    <div class="fm"><div class="lab">FLOW</div><div class="bar"><div class="fill"></div></div><div class="send">SEND IT</div></div>
    <div class="ch"><div class="mult">×1<small>0</small></div><div class="items"></div><div class="tim"><i></i></div></div>
    <div class="bank"></div>
    <div class="gr"><div class="g"></div><div class="d"></div></div>`;
  host.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const fm = $('.fm'), fill = $('.fill'), ch = $('.ch'), mult = $('.mult'), items = $('.items'), tim = $('.tim i');
  const bank = $('.bank'), gr = $('.gr'), vig = $('.vig');
  const restart = (el) => { el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  let chainOn = false;
  on('flowMeter', ({ value, state }) => {
    fill.style.width = `${(state ? 1 : value) * 100}%`;
    fm.classList.toggle('full', !!state);
    vig.classList.toggle('on', !!state);
  });
  on('flowChain', (s) => {
    chainOn = !!s;
    ch.classList.toggle('on', chainOn);
    if (!s) return;
    mult.innerHTML = `×${trim(s.mult)}<small>${fmt(s.pts)}</small>`;
    items.textContent = s.items.slice(-4).join('  ·  ');
  });
  on('flowBanked', ({ bonus, mult: m }) => {
    if (!bonus) return;
    bank.textContent = `LINE ×${trim(m)}  +${fmt(bonus)}`;
    bank.style.color = '#ffe14d';
    restart(bank);
  });
  on('flowLost', ({ pts }) => {
    if (pts < 50) return;
    bank.textContent = 'LINE LOST';
    bank.style.color = '#ff6bb0';
    restart(bank);
  });
  on('landingGrade', ({ grade, drop, air }) => {
    const [label, color] = GRADES[grade] || GRADES.clean;
    $('.g').textContent = label;
    $('.g').style.color = color;
    $('.d').textContent = [drop >= 4 ? `${Math.round(drop)} M DROP` : null, `${air.toFixed(1)} S AIR`].filter(Boolean).join('  ·  ');
    restart(gr);
  });
  const show = () => { root.style.display = game.mode === Mode.RIDING || game.mode === Mode.LIFT ? '' : 'none'; };
  on('mode', show);
  show();
  // Chain timer: how long until the line banks (the air keeps it alive).
  const tick = () => {
    requestAnimationFrame(tick);
    const f = player.flow;
    if (!f || !chainOn) return;
    const left = player.state === 2 ? 1 : Math.max(0, 1 - f.idle / f.C.chainWindow);
    tim.style.width = `${left * 100}%`;
  };
  requestAnimationFrame(tick);
  return root;
}

const trim = (m) => (Math.round(m * 100) / 100).toString();
