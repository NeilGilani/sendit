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
#flowHud .rs { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.96); min-width: 360px; padding: 22px 28px 20px; border-radius: 16px;
  background: rgba(12, 16, 30, 0.62); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,0.14); box-shadow: 0 18px 60px rgba(0,0,0,0.35);
  opacity: 0; transition: opacity .45s, transform .45s; font-style: normal; font-family: "Inter", "Segoe UI", sans-serif; color: #fffaf0; }
#flowHud .rs.on { opacity: 1; transform: translate(-50%, -50%) scale(1); }
#flowHud .rs h3 { margin: 0 0 4px; font-family: "Arial Black", Impact, sans-serif; font-style: italic; font-size: 22px; letter-spacing: 0.06em; color: #ffe14d; }
#flowHud .rs .sub { font-size: 12px; letter-spacing: 0.22em; color: rgba(250,248,243,0.6); margin-bottom: 12px; }
#flowHud .rs .row { display: flex; justify-content: space-between; gap: 24px; font-size: 14px; padding: 3px 0; }
#flowHud .rs .row b { font-weight: 800; }
#flowHud .rs .row small { opacity: 0.6; font-weight: 600; }
#flowHud .rs .judge { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.14); }
#flowHud .rs .bar { height: 5px; border-radius: 3px; background: rgba(255,255,255,0.15); margin: 2px 0 6px; overflow: hidden; }
#flowHud .rs .bar i { display: block; height: 100%; background: linear-gradient(90deg, #2ff5d6, #7a5cff); }
#flowHud .rs .tot { display: flex; align-items: baseline; justify-content: space-between; margin-top: 10px; }
#flowHud .rs .tot b { font-family: "Arial Black", Impact, sans-serif; font-style: italic; font-size: 46px; color: #ffe14d; line-height: 1; }
#flowHud .rs .tot span { font-size: 13px; letter-spacing: 0.18em; color: rgba(250,248,243,0.7); }
/* Phones (portrait): the flow meter moves to the top-left corner (it sat under the big speed read-out),
   and the end-of-run card goes compact and low so the achievement toasts above it stay readable. */
@media (max-width: 600px) {
  #flowHud .fm, body.fp #flowHud .fm { left: 16px; top: 22px; bottom: auto; width: min(150px, 34vw); }
  #flowHud .fm .lab { font-size: 11px; margin-bottom: 4px; }
  #flowHud .fm .bar { height: 8px; }
  #flowHud .fm .send { top: 100%; bottom: auto; font-size: 30px; }
  #flowHud .rs { top: auto; bottom: 172px; transform: translate(-50%, 0) scale(.96); min-width: 0; width: calc(100vw - 32px); box-sizing: border-box; padding: 14px 18px 12px; }
  #flowHud .rs.on { transform: translate(-50%, 0) scale(1); }
  #flowHud .rs .row { font-size: 12.5px; padding: 1px 0; }
  #flowHud .rs .sub { margin-bottom: 6px; }
  #flowHud .rs .tot b { font-size: 36px; }
}
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
    <div class="gr"><div class="g"></div><div class="d"></div></div>
    <div class="rs"></div>`;
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
  // Line goals (course.lineGoals): progress ticks in the chain area, completion as a big gold banner.
  on('lineGoalStep', ({ name, step, of }) => {
    bank.textContent = `${name.toUpperCase()}  ${step} / ${of}`;
    bank.style.color = '#2ff5d6';
    restart(bank);
  });
  on('lineGoal', ({ name, bonus }) => {
    bank.textContent = `LINE COMPLETE · ${name.toUpperCase()}  +${fmt(bonus)}`;
    bank.style.color = '#ffe14d';
    restart(bank);
  });
  on('landingGrade', ({ grade, drop, air, feature, roof }) => {
    const [label, color] = GRADES[grade] || GRADES.clean;
    $('.g').textContent = roof && grade !== 'sketchy' ? `${label} · ROOF` : label;
    $('.g').style.color = color;
    $('.d').textContent = [feature ? feature.toUpperCase() : null, drop >= 4 ? `${Math.round(drop)} M DROP` : null, `${air.toFixed(1)} S AIR`].filter(Boolean).join('  ·  ');
    restart(gr);
  });
  // End of run: the numbers and an FWT-style judged score (physics/flow.js finishRun).
  const rs = $('.rs');
  let rsT = 0;
  on('runSummary', (r) => {
    const kmh = (v) => `${Math.round(v * 3.6)} km/h <small>${Math.round(v * 2.237)} mph</small>`;
    const t = `${Math.floor(r.time / 60)}:${String(Math.floor(r.time % 60)).padStart(2, '0')}`;
    const bar = (k, v) => `<div class="row"><span>${k}</span><b>${v.toFixed(1)}</b></div><div class="bar"><i style="width:${v * 4}%"></i></div>`;
    // Personal best per map (judged total), kept in localStorage.
    const key = `sendit.freeride.${player.terrain?.course?.meta?.id ?? 'map'}`;
    let best = null;
    try { best = JSON.parse(localStorage.getItem(key)); } catch { /* private mode */ }
    const isBest = !best || r.total > best.total;
    if (isBest) try { localStorage.setItem(key, JSON.stringify({ total: r.total, score: r.score })); } catch { /* storage full */ }
    const pb = isBest ? (best ? `<b style="color:#ffe14d">NEW BEST! <small>was ${best.total}</small></b>` : '<b style="color:#ffe14d">FIRST RUN LOGGED</b>') : `<b>${best.total}</b>`;
    const rating = r.total >= 85 ? 'LEGENDARY' : r.total >= 70 ? 'PRO LINE' : r.total >= 55 ? 'SOLID' : r.total >= 40 ? 'GETTING THERE' : 'KEEP SENDING';
    rs.innerHTML = `<h3>RUN COMPLETE</h3><div class="sub">FREERIDE · JUDGED LIKE THE FWT</div>
      <div class="row"><span>Time</span><b>${t}</b></div>
      <div class="row"><span>Average speed</span><b>${kmh(r.avg)}</b></div>
      <div class="row"><span>Top speed</span><b>${kmh(r.topSpeed)}</b></div>
      <div class="row"><span>Biggest drop</span><b>${Math.round(r.biggestDrop)} m</b></div>
      <div class="row"><span>Longest air</span><b>${r.longestAir.toFixed(1)} s</b></div>
      <div class="row"><span>Best line bonus</span><b>+${fmt(r.bestLine)}</b></div>
      <div class="row"><span>Score</span><b>${fmt(r.score)}</b></div>
      ${r.featureList?.length ? `<div class="row"><span>Linked</span><b style="text-align:right;max-width:240px">${r.featureList.slice(0, 6).join(' · ')}</b></div>` : ''}
      ${r.goalList?.length ? `<div class="row"><span>Lines</span><b style="text-align:right;max-width:240px;color:#ffe14d">${r.goalList.join(' · ')}</b></div>` : ''}
      <div class="judge">${bar('Line', r.line)}${bar('Fluidity', r.fluidity)}${bar('Control', r.control)}${bar('Air &amp; style', r.style)}</div>
      <div class="tot"><span>${rating}</span><b>${r.total}</b></div>
      <div class="row"><span>Personal best</span>${pb}</div>`;
    rs.classList.add('on');
    rsT = performance.now() + 7000;
  });
  setInterval(() => { if (rsT && performance.now() > rsT) { rs.classList.remove('on'); rsT = 0; } }, 250);
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
