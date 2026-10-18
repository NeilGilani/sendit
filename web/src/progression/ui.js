// Progression feedback: the level-up celebration (over the ride and the lobby), and toasts for
// achievements, finished dailies, personal bests and daily progress milestones (juice HUD toasts).
// A small XP bar under the speed read-out fills as XP comes in during a ride.
import { on, game, Mode } from '../state.js';
import { progression } from './index.js';

const CSS = /* css */`
#lvlUp { position: fixed; inset: 0; z-index: 40; pointer-events: none; display: grid; place-items: center; opacity: 0; }
#lvlUp.show { animation: luIn 3.2s ease-out forwards; }
#lvlUp.yield .box, #lvlUp.yield .ring { opacity: .18; transition: opacity .15s; }   /* a trick announcement takes the stage */
#lvlUp .ring { position: absolute; left: 50%; top: 32%; width: 140px; height: 140px; margin: -70px 0 0 -70px; border-radius: 50%; border: 6px solid var(--rc, #ffe14d); opacity: 0; }
#lvlUp.show .ring { animation: luRing 1.1s cubic-bezier(.1,.8,.3,1) forwards; }
#lvlUp.show .ring.r2 { animation-delay: .14s; }
#lvlUp .box { position: absolute; left: 50%; top: 32%; transform: translate(-50%, -50%); text-align: center; padding: 22px 64px 20px; border-radius: 50%; background: radial-gradient(ellipse at center, rgba(12,16,40,.62) 0%, rgba(12,16,40,.38) 55%, transparent 72%); font-family: "Arial Black", Impact, sans-serif; font-style: italic; color: #fffaf0; white-space: nowrap; }
#lvlUp .k { font-size: 20px; letter-spacing: .5em; color: var(--rc, #ffe14d); -webkit-text-stroke: 1px #1b1446; paint-order: stroke fill; }
#lvlUp .n { font-size: 120px; line-height: .95; -webkit-text-stroke: 4px #1b1446; paint-order: stroke fill; text-shadow: 0 0 40px var(--rc, #ffe14d), 0 8px 0 rgba(27,20,70,.6); }
#lvlUp.show .n { animation: luNum .6s cubic-bezier(.2,1.8,.4,1); }
#lvlUp .rk { font-size: 24px; letter-spacing: .12em; margin-top: 4px; color: var(--rc, #ffe14d); -webkit-text-stroke: 1px #1b1446; paint-order: stroke fill; }
#lvlUp .sub { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 900; font-size: 13px; letter-spacing: .2em; color: #fffaf0; margin-top: 8px; text-shadow: 0 1px 3px #1b1446, 0 0 10px rgba(12,16,40,.9); }
#lvlUp .bg { position: absolute; inset: 0; background: radial-gradient(circle at 50% 32%, rgba(255,225,77,.22), rgba(122,92,255,.12) 35%, transparent 65%); }
@keyframes luIn { 0% { opacity: 0; } 6% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
@keyframes luRing { 0% { opacity: 1; transform: scale(.3); } 100% { opacity: 0; transform: scale(5); } }
@keyframes luNum { 0% { transform: scale(2.4) rotate(-8deg); } 100% { transform: scale(1) rotate(0); } }
#xpMini { position: absolute; left: 50%; bottom: 22px; width: 150px; transform: translateX(-50%); height: 4px; border-radius: 2px; background: rgba(255,255,255,.18); overflow: hidden; opacity: 0; transition: opacity .6s; }
#xpMini.on { opacity: 1; }
#xpMini i { display: block; height: 100%; width: 0%; background: linear-gradient(90deg, #2ff5d6, #7a5cff); transition: width .35s; }
#xpMini b { position: absolute; }
#xpLv { position: absolute; left: 50%; bottom: 17px; transform: translateX(calc(-50% - 104px)); text-shadow: 0 1px 4px rgba(0,0,0,.6); font: 800 11px "Inter", "Segoe UI", sans-serif; letter-spacing: .14em; color: rgba(250,248,243,.7); opacity: 0; transition: opacity .6s; }
#xpLv.on { opacity: 1; }
body.fp #xpMini, body.fp #xpLv { display: none; }
body.lvlup #juiceHud .cb { opacity: 0 !important; transition: opacity .2s; }
#rideRecap { position: fixed; right: clamp(16px, 3vw, 40px); top: 50%; z-index: 35; width: min(330px, 86vw); padding: 18px 20px 16px; border-radius: 16px;
  background: rgba(12,16,30,.72); backdrop-filter: blur(16px); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 18px 60px rgba(0,0,0,.4);
  font-family: "Inter", "Segoe UI", sans-serif; color: #fffaf0; transform: translate(120%, -50%); opacity: 0; transition: transform .55s cubic-bezier(.2,1.2,.4,1), opacity .35s; pointer-events: auto; cursor: pointer; }
#rideRecap.on { transform: translate(0, -50%); opacity: 1; }
#rideRecap h3 { margin: 0; font: italic 900 13px "Arial Black", Impact, sans-serif; letter-spacing: .3em; color: rgba(250,248,243,.7); }
#rideRecap .xp { font: italic 900 46px/1.05 "Arial Black", Impact, sans-serif; color: #ffe14d; -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; text-shadow: 0 0 22px rgba(255,180,60,.45); margin: 4px 0 2px; }
#rideRecap .lv { display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; letter-spacing: .12em; color: rgba(250,248,243,.75); margin-top: 6px; }
#rideRecap .bar { height: 7px; border-radius: 4px; background: rgba(255,255,255,.14); overflow: hidden; margin: 5px 0 10px; }
#rideRecap .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #2ff5d6, #7a5cff); transition: width 1.1s cubic-bezier(.3,.8,.3,1); }
#rideRecap .row { display: flex; gap: 8px; font-size: 13px; padding: 3px 0; }
#rideRecap .row b { flex: none; width: 18px; text-align: center; }
#rideRecap .row span { color: rgba(250,248,243,.9); }
#rideRecap .go { margin-top: 10px; font-size: 11px; letter-spacing: .2em; color: #2ff5d6; font-weight: 800; }
`;

export function mountProgressionUi({ juice }) {
  if (typeof document === 'undefined') return;
  const st = document.createElement('style');
  st.textContent = CSS;
  document.head.appendChild(st);
  const lv = document.createElement('div');
  lv.id = 'lvlUp';
  lv.innerHTML = '<div class="bg"></div><div class="ring"></div><div class="ring r2"></div><div class="box"><div class="k">LEVEL UP</div><div class="n">2</div><div class="rk"></div><div class="sub"></div></div>';
  document.body.appendChild(lv);
  const hud = document.getElementById('hud');
  const bar = document.createElement('div');
  bar.id = 'xpMini'; bar.innerHTML = '<i></i>';
  const lab = document.createElement('div');
  lab.id = 'xpLv';
  hud?.appendChild(bar); hud?.appendChild(lab);
  const fill = bar.firstChild;

  // One-shots through audio.js's public API (no-op before audio is unlocked).
  const sfx = (name, gain, rate) => { const s = juice?.music?.sound; if (s?.ctx) s.oneShot?.(name, gain, rate)?.catch?.(() => {}); };
  let showT = 0;
  const paint = () => {
    const p = progression.getProgress();
    fill.style.width = `${p.need ? (p.into / p.need) * 100 : 100}%`;
    lab.textContent = progression.dailyBonusLeft() > 0 ? `LV ${p.level} · 2× XP` : `LV ${p.level}`;
  };
  paint();
  on('progressXp', () => { paint(); showT = performance.now() + 2500; bar.classList.add('on'); lab.classList.add('on'); });
  setInterval(() => { if (showT && performance.now() > showT) { bar.classList.remove('on'); lab.classList.remove('on'); showT = 0; } }, 300);

  // Level-ups queue (several at once play one after another).
  const queue = [];
  let playing = false;
  let waited = 0;
  const play = () => {
    if (!queue.length) { playing = false; return; }
    playing = true;
    // A results / settings card is up: wait until it closes (the card shows the level-up row itself).
    if (document.querySelector('.screen.modal:not(.hidden)')) { setTimeout(play, 300); return; }
    // Let a trick announcement (or the air it comes from) finish first, up to 4 s.
    if (juice?.hud?.busy?.() && waited < 4000) { waited += 250; setTimeout(play, 250); return; }
    waited = 0;
    // Several levels at once (a big XP jump) play as one celebration of the highest.
    const batch = queue.splice(0, queue.length);
    const e = { ...batch[batch.length - 1], rankUp: batch.some((x) => x.rankUp), levels: batch.length };
    lv.style.setProperty('--rc', e.rank.color);
    lv.querySelector('.n').textContent = e.level;
    lv.querySelector('.k').textContent = e.levels > 1 ? `LEVEL UP · +${e.levels}` : 'LEVEL UP';
    lv.querySelector('.rk').textContent = e.rankUp ? `NEW RANK · ${e.rank.name.toUpperCase()}` : e.rank.name.toUpperCase();
    lv.querySelector('.sub').textContent = nextUnlockText(e.level);
    lv.classList.remove('show', 'yield'); void lv.offsetWidth; lv.classList.add('show');
    document.body.classList.add('lvlup');
    clearTimeout(play.t); play.t = setTimeout(() => document.body.classList.remove('lvlup'), 2900);
    sfx('medal', 0.8, e.rankUp ? 0.9 : 1.05);
    juice?.hud?.flash(0.3);
    setTimeout(play, 2400);
  };
  on('juiceLevelUp', (e) => { queue.push(e); if (!playing) play(); });
  const yieldTo = () => { if (lv.classList.contains('show') && document.body.classList.contains('lvlup')) lv.classList.add('yield'); };
  on('landed', (e) => { if (e.result !== 'crash' && e.air > 0.5) yieldTo(); });
  // A real next air (still airborne 0.35 s after the take-off, not a bump) needs the landing in view: the card fades back.
  on('takeoff', () => setTimeout(() => { if (juice?.hud?.busy?.()) yieldTo(); }, 350));
  on('grindScore', yieldTo);

  mountRecap();
  const toast = (o) => juice?.toast(o);
  on('achievement', () => sfx('token', 0.6, 1.08));
  on('cleanRun', () => juice?.hud?.callout('CLEAN RUN · NO CRASHES', '#2ff5d6'));
  on('challengeDone', () => sfx('medal', 0.55, 1.25));
  on('personalBest', () => { if (game.mode === Mode.RIDING) sfx('combo_bank', 0.45, 1.3); });
  on('achievement', (a) => toast({ kind: 'Achievement unlocked', title: a.title, sub: `${a.desc}${a.xp ? ` · +${a.xp} XP` : ''}`, icon: a.icon || '★', c1: '#ffe14d', c2: '#ff9a3d', hold: 4.2 }));
  on('challengeDone', ({ challenge: c }) => toast({ kind: 'Daily complete', title: c.title, sub: `+${c.xp} XP`, icon: '✓', c1: '#2ff5d6', c2: '#7a5cff', progress: 1, hold: 4.2 }));
  on('weeklyDone', ({ challenge: c }) => { sfx('medal', 0.8, 0.95); toast({ kind: 'Weekly complete', title: c.title, sub: `+${c.xp} XP`, icon: '★', c1: '#ffe14d', c2: '#ff5fb0', progress: 1, hold: 5 }); });
  on('dailySweep', ({ xp }) => toast({ kind: 'All dailies done', title: 'Clean sweep!', sub: `+${xp} XP · new ones at midnight`, icon: '✦', c1: '#ff9a3d', c2: '#ff3d9a', hold: 4.6 }));
  on('personalBest', (pb) => {
    if (game.mode !== Mode.RIDING) return;
    toast({ kind: 'New personal best', title: pb.text, sub: `was ${pb.was}`, icon: 'PB', c1: '#ff5fb0', c2: '#7a5cff', hold: 3.2 });
    if (pb.stat === 'score') juice?.hud?.callout('NEW BEST SCORE!', '#ffe14d');
  });
  // Daily progress: a quiet nudge at the halfway mark of each one, and one more when a single step is left.
  const half = new Set(), last = new Set();
  on('progressXp', () => {
    for (const c of progression.getChallenges()) {
      if (!c.done && c.goal > 2 && !c.unit && c.value === c.goal - 1 && !last.has(c.id)) {
        last.add(c.id); half.add(c.id);
        toast({ kind: 'Daily · one to go!', title: c.title, sub: `${fmtVal(c, c.value)} / ${fmtVal(c, c.goal)}`, icon: '!', c1: '#ffe14d', c2: '#2ff5d6', progress: c.value / c.goal, hold: 2.6 });
        continue;
      }
      if (c.done || c.goal <= 1 || half.has(c.id) || c.value < c.goal / 2) continue;
      half.add(c.id);
      toast({ kind: 'Daily', title: c.title, sub: `${fmtVal(c, c.value)} / ${fmtVal(c, c.goal)}`, icon: '◔', c1: '#2ff5d6', c2: '#2a7bff', progress: c.value / c.goal, hold: 2.8 });
    }
  });
}

/** End-of-ride recap card over the lobby: XP earned (counting up), the level bar, what was unlocked. */
function mountRecap() {
  const el = document.createElement('div');
  el.id = 'rideRecap';
  document.body.appendChild(el);
  let pending = null, hideT = 0;
  const hide = () => { el.classList.remove('on'); clearTimeout(hideT); };
  el.addEventListener('click', hide);
  on('progressRideSummary', (s) => { pending = { s, t: performance.now() }; });
  on('rideStarted', () => { pending = null; hide(); });
  on('mode', (m) => {
    if (m !== Mode.MENU || !pending || performance.now() - pending.t > 4000) return;
    const { s } = pending;
    pending = null;
    if (s.xp <= 0) return;
    const rows = [
      ...(s.best ? [['🏆', `Best trick: ${s.best.name} +${Math.round(s.best.pts).toLocaleString('en-US')}`]] : []),
      ...s.dailies.map((t) => ['✓', `Daily: ${t}`]),
      ...s.achievements.map((t) => ['★', t]),
      ...s.pbs.map((t) => ['▲', `New best: ${t}`]),
      ['⛷', `${(s.meters / 1000).toFixed(1)} km · ${Math.round(s.score).toLocaleString('en-US')} pts`],
    ].slice(0, 6);
    const lvUp = s.to.level > s.from.level;
    const left = (s.to.need - s.to.into).toLocaleString('en-US');
    el.innerHTML = `<h3>RIDE RECAP</h3><div class="xp">+0 XP</div>
      <div class="lv"><span>${lvUp ? `LEVEL UP · ${s.to.level}` : `LEVEL ${s.to.level}`}</span><span>${left} XP TO ${s.to.level + 1}</span></div>
      <div class="bar"><i></i></div>
      ${rows.map(([i, t]) => `<div class="row"><b>${i}</b><span>${t.replace(/[<>&]/g, '')}</span></div>`).join('')}
      <div class="go">${s.to.need && s.to.need - s.to.into <= s.to.need * 0.3 ? `ONLY ${left} XP TO LEVEL ${s.to.level + 1} · ONE MORE RUN!` : 'ONE MORE RUN? PRESS ENTER'}</div>`;
    const bar = el.querySelector('.bar i'), xp = el.querySelector('.xp');
    bar.style.transition = 'none';
    bar.style.width = `${lvUp ? 0 : (s.from.into / Math.max(1, s.from.need)) * 100}%`;
    setTimeout(() => {
      el.classList.add('on');
      bar.style.transition = '';
      requestAnimationFrame(() => { bar.style.width = `${(s.to.into / Math.max(1, s.to.need)) * 100}%`; });
      const t0 = performance.now();
      const count = () => {
        const k = Math.min(1, (performance.now() - t0) / 1100);
        xp.textContent = `+${Math.round(s.xp * (1 - Math.pow(1 - k, 3))).toLocaleString('en-US')} XP`;
        if (k < 1) requestAnimationFrame(count);
      };
      count();
    }, 700);
    hideT = setTimeout(hide, 9000);
  });
}

export function fmtVal(c, v) {
  if (c.unit === 'km') return `${(v / 1000).toFixed(1)} km`;
  if (c.unit === 's') return `${Math.floor(v)} s`;
  if (c.unit === 'm') return `${Math.floor(v)} m`;
  return Math.floor(v).toLocaleString('en-US');
}

function nextUnlockText(level) {
  const p = progression.getProgress();
  return `${p.xp.toLocaleString('en-US')} XP · ${(p.need - p.into).toLocaleString('en-US')} TO LEVEL ${level + 1}`;
}
