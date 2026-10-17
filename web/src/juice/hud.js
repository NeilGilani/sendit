// Juice HUD: the trick announcer, landing grades, the combo chain panel, the live air read-out, banners
// and toasts. Self-contained DOM inside #hud with its own styles (no edits to style.css / index.html).
//
//   top centre    combo chain: ×mult, points, the last moves, a timer bar; "LAND IT" while the chain
//                 rides on an air or a rail (a crash loses it)
//   upper third   announcer: grade badge (STOMPED / PERFECT / CLEAN / SKETCHY), the trick name, +points
//   centre        live air: rotation degrees ticking up per 180, flips, the grab being held
//   below centre  small call-outs (CLOSE SHAVE ×n, rail names), banners (COMBO ×3 +1,200 / COMBO LOST)
//   right         toasts (achievements, challenges, personal bests, level-ups: juice/toasts via toast())
// Tunables: JUICE_HUD.
import { Vector3 } from 'three';
import { on, game, Mode } from '../state.js';
import { PHYSICS as P } from '../config.js';
import { trim } from './combo.js';
import { fmtDelta } from './splits.js';
import { reducedMotion } from './impact.js';

export const JUICE_HUD = {
  minAirToAnnounce: 0.5,     // s — shorter airs don't get a grade unless they were a named trick
  announceHold: 1.35,        // s the trick name stays up
  liveAirFrom: 0.45,         // s of air before the live rotation read-out appears
  hangFrom: 1.0,             // s of air before a straight air shows its hang time
  riskVignetteFrom: 3,       // combo multiplier from which an airborne chain pulses a pink edge
  nearStreakWindow: 2.6,     // s between close shaves that still count as a streak
  stompedImpact: 0.55,       // × PHYSICS.hardLanding: a perfect landing this soft is STOMPED
};

/** Combo tiers: [from multiplier, word, colour]. */
export const TIERS = [[2, 'NICE', '#2ff5d6'], [3, 'SICK', '#7af0ff'], [4, 'INSANE', '#ffe14d'], [5, 'UNREAL', '#ff9a3d'], [6, 'GODLIKE', '#ff5fb0']];

const GRADES = {
  stomped: { text: 'STOMPED', color: '#ffe14d', glow: 'rgba(255,200,60,.9)' },
  perfect: { text: 'PERFECT', color: '#ffe14d', glow: 'rgba(255,200,60,.8)' },
  clean: { text: 'CLEAN', color: '#2ff5d6', glow: 'rgba(47,245,214,.7)' },
  sketchy: { text: 'SKETCHY', color: '#ff6bb0', glow: 'rgba(255,95,176,.7)' },
};

const CSS = /* css */`
#juiceHud { position: absolute; inset: 0; pointer-events: none; font-family: "Arial Black", "Segoe UI Black", Impact, sans-serif; font-style: italic; color: #fffaf0; }
#juiceHud .stroke { -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; }
/* combo chain */
#juiceHud .cb { position: absolute; left: 50%; top: 96px; transform: translateX(-50%); text-align: center; opacity: 0; transition: opacity .25s; white-space: nowrap; }
#juiceHud .cb.on { opacity: 1; }
#juiceHud .cb .m { font-size: 50px; line-height: 1; display: inline-block; text-shadow: 0 3px 22px rgba(122,92,255,.55); transition: color .2s; }
#juiceHud .cb .m.bump { animation: jhBump .32s cubic-bezier(.2,1.8,.4,1); }
#juiceHud .cb .m.hot { color: #ffe14d; text-shadow: 0 3px 24px rgba(255,150,60,.75); }
#juiceHud .cb .m.blaze { color: #ff9a3d; text-shadow: 0 0 28px rgba(255,90,60,.9), 0 0 6px #fff; }
#juiceHud .cb .p { font-size: 24px; color: #2ff5d6; margin-left: 12px; display: inline-block; }
#juiceHud .cb .it { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 800; font-size: 13px; letter-spacing: .06em; color: rgba(250,248,243,.85); margin-top: 6px; text-shadow: 0 1px 6px rgba(0,0,0,.65); }
#juiceHud .cb .tm { height: 4px; width: 190px; margin: 7px auto 0; background: rgba(255,255,255,.22); border-radius: 2px; overflow: hidden; }
#juiceHud .cb .tm i { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #2ff5d6, #7a5cff); transform-origin: left; }
#juiceHud .cb .rk { font-size: 13px; letter-spacing: .3em; color: #ff6bb0; margin-top: 5px; height: 16px; opacity: 0; transition: opacity .15s; }
#juiceHud .cb.risk .rk { opacity: 1; animation: jhBlink .5s infinite alternate; }
#juiceHud .cb.risk .tm i { background: linear-gradient(90deg, #ff6bb0, #ffe14d); }
@keyframes jhBlink { from { opacity: .45; } to { opacity: 1; } }
@keyframes jhBump { 0% { transform: scale(1); } 35% { transform: scale(1.38) rotate(-5deg); } 100% { transform: scale(1); } }
#juiceHud .cb .tr { display: block; height: 18px; font-size: 16px; letter-spacing: .32em; margin-top: 2px; -webkit-text-stroke: 1px #1b1446; paint-order: stroke fill; }
#juiceHud .cb .tr.pop { animation: jhTier .5s cubic-bezier(.2,1.8,.4,1); }
@keyframes jhTier { 0% { transform: scale(2.2); opacity: 0; } 40% { opacity: 1; } 100% { transform: scale(1); } }
/* challenge split delta (next to the timer) */
#juiceHud .sp { position: absolute; left: calc(50% + 118px); top: 30px; font-size: 26px; -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; opacity: 0; white-space: nowrap; }
#juiceHud .sp.show { animation: jhSplit 2.2s ease-out forwards; }
#juiceHud .sp small { display: block; font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 800; font-size: 10px; letter-spacing: .28em; color: rgba(250,248,243,.75); -webkit-text-stroke: 0; }
@keyframes jhSplit { 0% { opacity: 0; transform: translateX(-12px); } 10% { opacity: 1; transform: none; } 80% { opacity: 1; } 100% { opacity: 0; } }
/* announcer */
#juiceHud .an { position: absolute; left: 50%; top: 37%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap; opacity: 0; }
#juiceHud .an.show { animation: jhSlam var(--hold, 1.6s) cubic-bezier(.2,.9,.3,1) forwards; }
#juiceHud .an .g { display: inline-block; font-size: 22px; letter-spacing: .28em; padding: 3px 14px 3px 18px; border-radius: 3px; transform: skewX(-12deg); color: #1b1446; margin-bottom: 6px; }
#juiceHud .an .g span { display: inline-block; transform: skewX(12deg); }
#juiceHud .an .t { font-size: clamp(34px, 4.6vw, 64px); line-height: 1.05; letter-spacing: .02em; -webkit-text-stroke: 3px #1b1446; paint-order: stroke fill; text-shadow: 0 5px 0 rgba(27,20,70,.55); }
#juiceHud .an .s { font-size: 26px; color: #2ff5d6; margin-top: 2px; -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; }
#juiceHud .an .s small { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 900; font-size: 14px; letter-spacing: .16em; color: #fffaf0; margin-left: 10px; -webkit-text-stroke: 0; text-shadow: 0 1px 2px #1b1446, 0 0 8px rgba(27,20,70,.9); }
#juiceHud .an .nw { display: none; margin: 6px auto 0; width: max-content; font-size: 13px; letter-spacing: .3em; padding: 3px 10px 3px 13px; border-radius: 3px; color: #1b1446;
  background: linear-gradient(90deg, #2ff5d6, #ffe14d); box-shadow: 0 0 18px rgba(47,245,214,.7); animation: jhBlink .35s 4 alternate; }
#juiceHud .an.new .nw { display: block; }
@keyframes jhSlam {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(1.9) rotate(-6deg); filter: blur(4px); }
  9% { opacity: 1; transform: translate(-50%, -50%) scale(.94) rotate(-3deg); filter: blur(0); }
  15% { transform: translate(-50%, -50%) scale(1.04) rotate(-3deg); }
  22% { transform: translate(-50%, -50%) scale(1) rotate(-3deg); }
  82% { opacity: 1; transform: translate(-50%, -52%) scale(1) rotate(-3deg); }
  100% { opacity: 0; transform: translate(-50%, -70%) scale(.92) rotate(-3deg); }
}
/* live air */
#juiceHud .air { position: absolute; left: 50%; top: 33%; transform: translateX(-50%); text-align: center; opacity: 0; transition: opacity .18s; white-space: nowrap; }
#juiceHud .air.on { opacity: 1; }
#juiceHud .air .d { font-size: 46px; line-height: 1; display: inline-block; -webkit-text-stroke: 2px #1b1446; paint-order: stroke fill; text-shadow: 0 0 20px rgba(47,245,214,.5); }
#juiceHud .air .d.tick { animation: jhBump .26s cubic-bezier(.2,1.8,.4,1); }
#juiceHud .air .x { font-size: 18px; letter-spacing: .14em; color: #ffe14d; -webkit-text-stroke: 1px #1b1446; paint-order: stroke fill; margin-top: 2px; }
/* call-outs + banners */
#juiceHud .co { position: absolute; left: 50%; top: 70%; transform: translateX(-50%); white-space: nowrap; font-size: 24px; opacity: 0; }
#juiceHud .co.show { animation: jhPop 1.05s ease-out forwards; }
@keyframes jhPop { 0% { opacity: 0; transform: translateX(-50%) scale(.6); } 14% { opacity: 1; transform: translateX(-50%) scale(1.15); } 26% { transform: translateX(-50%) scale(1); } 75% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-18px); } }
#juiceHud .bn { position: absolute; left: 50%; top: 172px; transform: translateX(-50%); white-space: nowrap; font-size: 38px; opacity: 0; -webkit-text-stroke: 2px #1b1446; paint-order: stroke fill; }
#juiceHud .bn.show { animation: jhBank 1.8s ease-out forwards; }
#juiceHud .bn.lost.show { animation: jhLost 1.4s ease-out forwards; }
@keyframes jhBank { 0% { opacity: 0; transform: translateX(-50%) scale(.5); } 10% { opacity: 1; transform: translateX(-50%) scale(1.2); } 20% { transform: translateX(-50%) scale(1); } 78% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(-30px) scale(.95); } }
@keyframes jhLost { 0% { opacity: 0; transform: translateX(-50%) scale(1.3); } 8% { opacity: 1; transform: translateX(calc(-50% - 10px)); } 14% { transform: translateX(calc(-50% + 10px)); } 20% { transform: translateX(calc(-50% - 6px)); } 26% { transform: translateX(-50%); } 70% { opacity: 1; } 100% { opacity: 0; transform: translateX(-50%) translateY(26px); } }
/* floating score pops (minor scores rise off the rider) */
#juiceHud .fp { position: absolute; left: 0; top: 0; font-size: 20px; white-space: nowrap; -webkit-text-stroke: 1.2px #1b1446; paint-order: stroke fill; color: #2ff5d6; pointer-events: none; animation: jhFloat .95s ease-out forwards; }
#juiceHud .fp small { font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 900; font-size: 11px; letter-spacing: .14em; margin-left: 5px; color: #fffaf0; -webkit-text-stroke: 0; text-shadow: 0 1px 3px #1b1446; }
@keyframes jhFloat { 0% { opacity: 0; transform: translate(var(--x), var(--y)) scale(.6); } 15% { opacity: 1; transform: translate(var(--x), calc(var(--y) - 10px)) scale(1.1); } 100% { opacity: 0; transform: translate(calc(var(--x) + var(--dx)), calc(var(--y) - 70px)) scale(.95); } }
/* at risk: a big chain riding on an air or a rail */
#juiceHud .rv { position: absolute; inset: 0; opacity: 0; transition: opacity .25s; box-shadow: inset 0 0 120px 26px rgba(255,61,154,.32); }
#juiceHud.atrisk .rv { opacity: 1; animation: jhRisk .55s ease-in-out infinite alternate; }
@keyframes jhRisk { from { opacity: .45; } to { opacity: 1; } }
/* FEVER: a hot window (juice/combo.js) */
#juiceHud .fe { position: absolute; inset: 0; opacity: 0; transition: opacity .4s; box-shadow: inset 0 0 150px 34px rgba(255,140,40,.38); }
#juiceHud.fever .fe { opacity: 1; animation: jhRisk .4s ease-in-out infinite alternate; }
#juiceHud .cb .fv { display: none; font-size: 13px; letter-spacing: .3em; color: #ff9a3d; margin-top: 3px; -webkit-text-stroke: 1px #1b1446; paint-order: stroke fill; }
#juiceHud.fever .cb .fv { display: block; }
/* flash + edge glow */
#juiceHud .fl { position: absolute; inset: 0; background: #fff; opacity: 0; }
#juiceHud .fl.show { animation: jhFlash .28s ease-out forwards; }
@keyframes jhFlash { 0% { opacity: var(--a, .22); } 100% { opacity: 0; } }
#juiceHud .eg { position: absolute; inset: 0; opacity: 0; box-shadow: inset 0 0 160px 40px var(--c, rgba(255,200,60,.45)); }
#juiceHud .eg.show { animation: jhEdge .9s ease-out forwards; }
@keyframes jhEdge { 0% { opacity: 1; } 100% { opacity: 0; } }
/* rolling score (top right; the snowflake counter sits under it) */
#juiceHud .sc { position: absolute; right: 26px; top: 18px; text-align: right; transition: opacity .8s; }
#juiceHud .sc b { display: inline-block; font-size: 30px; line-height: 1; -webkit-text-stroke: 1.5px #1b1446; paint-order: stroke fill; text-shadow: 0 2px 12px rgba(0,0,0,.35); transform-origin: right center; }
#juiceHud .sc b.up { animation: jhScore .3s cubic-bezier(.2,1.8,.4,1); color: #ffe14d; }
#juiceHud .sc small { display: block; font-family: "Inter", "Segoe UI", sans-serif; font-style: normal; font-weight: 800; font-size: 10px; letter-spacing: .3em; color: rgba(250,248,243,.65); margin-top: 2px; }
@keyframes jhScore { 0% { transform: scale(1); } 40% { transform: scale(1.22); } 100% { transform: scale(1); } }
#flakesHud { top: 66px !important; }
/* toasts */
/* left side: the reward-cases notifications (lobby/cases/notify.js) stack top right */
#juiceHud .ts { position: absolute; left: 26px; top: 110px; display: flex; flex-direction: column; align-items: flex-start; gap: 10px; }
#juiceHud .tt { display: flex; align-items: center; gap: 12px; min-width: 250px; max-width: 360px; padding: 10px 16px 10px 12px; border-radius: 12px; font-style: normal;
  background: rgba(12,16,30,.72); backdrop-filter: blur(10px); border: 1px solid rgba(255,255,255,.16); box-shadow: 0 10px 34px rgba(0,0,0,.35);
  transform: translateX(-120%); opacity: 0; transition: transform .45s cubic-bezier(.2,1.3,.4,1), opacity .3s; font-family: "Inter", "Segoe UI", sans-serif; }
#juiceHud .tt.on { transform: none; opacity: 1; }
#juiceHud .tt .ic { flex: none; width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; font-size: 20px; background: linear-gradient(135deg, var(--c1, #2ff5d6), var(--c2, #7a5cff)); color: #1b1446; font-family: "Arial Black", Impact, sans-serif; }
#juiceHud .tt b { display: block; font-size: 11px; letter-spacing: .24em; color: var(--c1, #2ff5d6); font-weight: 800; }
#juiceHud .tt span { display: block; font-size: 15px; font-weight: 800; color: #fffaf0; margin-top: 1px; }
#juiceHud .tt small { display: block; font-size: 12px; color: rgba(250,248,243,.65); margin-top: 1px; }
#juiceHud .tt .pb { height: 3px; border-radius: 2px; background: rgba(255,255,255,.15); margin-top: 5px; overflow: hidden; }
#juiceHud .tt .pb i { display: block; height: 100%; background: var(--c1, #2ff5d6); }
/* the other HUDs' versions of these give way to ours */
#flowHud .ch, #flowHud .gr, #flowHud .bank { display: none !important; }
#chal #comboHud { display: none; }
#chal:not(.hidden) ~ #juiceHud .cb { top: 122px; }
#chal:not(.hidden) ~ #juiceHud .bn { top: 196px; }
body.fp #juiceHud .an { top: 42%; }   /* helmet cam: no rider in the middle, keep clear of the combo panel */
body.fp #notes { bottom: 130px; }      /* the helmet cam's speed read-out sits bottom right */
`;

/**
 * Mount the juice HUD. `combo` is a ComboTracker (juice/combo.js), `player` the Player.
 * Returns { root, toast(opts), banner(text, color), update(dt) }.
 */
export function mountJuiceHud({ player, combo, input, camera }) {
  const host = document.getElementById('hud') || document.body;
  const st = document.createElement('style');
  st.id = 'juiceHudCss';
  st.textContent = CSS;
  document.head.appendChild(st);
  const root = document.createElement('div');
  root.id = 'juiceHud';
  root.innerHTML = `
    <div class="rv"></div><div class="fe"></div><div class="eg"></div><div class="fl"></div>
    <div class="cb"><div><span class="m stroke">×1</span><span class="p stroke">0</span></div><div class="tr"></div><div class="fv"></div><div class="it"></div><div class="tm"><i></i></div><div class="rk">LAND IT</div></div>
    <div class="sp"><span></span><small>SPLIT</small></div>
    <div class="an"><div class="g"><span></span></div><div class="t"></div><div class="s"></div><div class="nw">NEW TRICK</div></div>
    <div class="air"><div class="d">0</div><div class="x"></div></div>
    <div class="co stroke"></div>
    <div class="bn"></div>
    <div class="ts"></div>
    <div class="sc"><b class="stroke">0</b><small>SCORE</small></div>`;
  host.appendChild(root);
  const $ = (s) => root.querySelector(s);
  const cbTr = $('.cb .tr'), sp = $('.sp');
  const cb = $('.cb'), cbM = $('.cb .m'), cbP = $('.cb .p'), cbIt = $('.cb .it'), cbTm = $('.cb .tm i');
  const an = $('.an'), anG = $('.an .g'), anT = $('.an .t'), anS = $('.an .s');
  const air = $('.air'), airD = $('.air .d'), airX = $('.air .x');
  const co = $('.co'), bn = $('.bn'), fl = $('.fl'), eg = $('.eg'), ts = $('.ts'), scB = $('.sc b');
  const restart = (el, cls = 'show') => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); };
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const riding = () => game.mode === Mode.RIDING;

  const flash = (a = 0.22) => { if (reducedMotion()) return; fl.style.setProperty('--a', a); restart(fl); };
  const edge = (c) => { eg.style.setProperty('--c', c); restart(eg); };
  const callout = (text, color = '#2ff5d6') => { if (!riding()) return; co.textContent = text; co.style.color = color; restart(co); };
  const banner = (text, color = '#ffe14d', lost = false) => {
    if (!riding()) return;
    bn.textContent = text; bn.style.color = color;
    bn.classList.toggle('lost', lost);
    restart(bn);
    bnT = performance.now();
  };

  // ------------------------------------------------------------------ combo chain
  let lastMult = 1, chainOn = false, bnT = 0;
  on('juiceCombo', (s) => {
    chainOn = !!s;
    cb.classList.toggle('on', chainOn && riding() && s?.mult > 1.01);
    if (!s) { lastMult = 1; return; }
    cbM.textContent = `×${trim(s.mult)}`;
    cbP.textContent = fmt(s.pts);
    cbIt.textContent = s.items.slice(-3).map(shortLabel).join('  ·  ');
    cbM.classList.toggle('hot', s.mult >= 2.5 && s.mult < 4);
    cbM.classList.toggle('blaze', s.mult >= 4);
    if (s.mult > lastMult + 0.01) restart(cbM, 'bump');
    // Tier words as the multiplier climbs (the word pops when a new tier is reached).
    const tier = TIERS.filter((t) => s.mult >= t[0]).pop();
    const word = tier ? tier[1] : '';
    if (cbTr.textContent !== word) { cbTr.textContent = word; cbTr.style.color = tier?.[2] || ''; if (word && s.mult > lastMult) restart(cbTr, 'pop'); }
    lastMult = s.mult;
  });
  on('juiceComboBanked', ({ bonus, mult }) => {
    banner(`${mult >= 4 ? 'MONSTER ' : ''}COMBO ×${trim(mult)}  +${fmt(bonus)}`, mult >= 4 ? '#ff9a3d' : '#ffe14d');
    if (mult >= 2.5) edge('rgba(255,200,60,.5)');
  });
  // FEVER (juice/combo.js): a banner, a pulsing hot edge and a countdown on the combo panel.
  const fv = $('.cb .fv');
  on('juiceFever', ({ on: st }) => {
    root.classList.toggle('fever', !!st && riding());
    if (st) { banner('FEVER!  COMBOS ×2', '#ff9a3d'); edge('rgba(255,140,40,.6)'); input?.rumble?.(0.5, 0.9, 260); }
  });
  // Challenge splits vs the best run (juice/splits.js).
  const split = (d, label) => {
    if (!riding() && label !== 'FINISH') return;
    sp.firstChild.textContent = fmtDelta(d);
    sp.style.color = d <= 0 ? '#2ff5d6' : '#ff6bb0';
    sp.lastChild.textContent = label;
    restart(sp);
  };
  on('juiceSplit', ({ i, delta }) => { if (delta != null) split(delta, `GATE ${i + 1}`); });
  on('juiceSplitFinal', ({ delta }) => { if (delta != null) split(delta, 'FINISH'); });
  on('juiceComboLost', ({ pts }) => { if (pts >= 60) banner(`COMBO LOST  −${fmt(pts)}`, '#ff6bb0', true); });
  // Line goals on flow maps (their own banner is hidden with the rest of the flow chain HUD).
  on('lineGoalStep', ({ name, step, of }) => callout(`${name.toUpperCase()}  ${step} / ${of}`));
  on('lineGoal', ({ name, bonus }) => { banner(`LINE COMPLETE · ${name.toUpperCase()}  +${fmt(bonus)}`); edge('rgba(47,245,214,.45)'); });

  // ------------------------------------------------------------------ announcer
  let annT = 0;
  const announce = (grade, title, sub, hold = JUICE_HUD.announceHold) => {
    if (!riding()) return;
    const G = grade ? GRADES[grade] : null;
    anG.style.display = G ? '' : 'none';
    if (G) { anG.firstChild.textContent = G.text; anG.style.background = G.color; anG.style.boxShadow = `0 0 24px ${G.glow}`; }
    anT.textContent = title || '';
    anT.style.color = G && grade !== 'clean' ? G.color : '#fffaf0';
    anS.innerHTML = sub || '';
    an.style.setProperty('--hold', `${hold + 0.35}s`);
    an.classList.remove('new');
    restart(an);
    annT = performance.now();
  };

  on('landed', (e) => {
    if (e.result === 'crash') return;
    if (!e.clean && e.air < JUICE_HUD.minAirToAnnounce) { callout('WOBBLE!', '#ff6bb0'); return; }   // too short to grade
    const named = !!e.trick;
    if (e.air < JUICE_HUD.minAirToAnnounce && !(named && e.air > 0.35)) return;
    const grade = gradeOf(e);
    if (grade === 'clean' && !named && e.air < 0.9) return;   // a plain hop: no announcement
    const title = (e.trick || (e.air >= 0.9 ? `${e.air.toFixed(1)}s AIR` : '')).toUpperCase();
    const extra = [e.drop >= 4 ? `${Math.round(e.drop)} M DROP` : null, e.switch ? 'SWITCH' : null].filter(Boolean).join(' · ');
    const sub = e.points > 0 ? `+${fmt(e.points)}${extra ? `<small>${extra}</small>` : ''}` : extra ? `<small>${extra}</small>` : '';
    announce(grade, title, sub);
    if (grade === 'stomped' || grade === 'perfect') { flash(grade === 'stomped' ? 0.26 : 0.18); input?.rumble?.(0.35, 0.8, 120); }
  });
  // Streaks: stomped / perfect landings in a row, and named tricks landed without a crash.
  let stompRun = 0, cleanRun = 0;
  on('landed', (e) => {
    if (e.result === 'crash' || e.air < 0.5) return;
    const g = gradeOf(e);
    stompRun = g === 'stomped' || g === 'perfect' ? stompRun + 1 : 0;
    cleanRun = e.clean && e.trick ? cleanRun + 1 : e.clean ? cleanRun : 0;
    if (stompRun >= 3) setTimeout(() => callout(`STOMP STREAK ×${stompRun}`, '#ffe14d'), 450);
    else if (cleanRun >= 5 && cleanRun % 5 === 0) setTimeout(() => callout(`${cleanRun} CLEAN IN A ROW`, '#2ff5d6'), 450);
  });
  on('crashed', () => { stompRun = 0; cleanRun = 0; });
  on('grindScore', ({ label, points }) => announce(/^Sketchy/.test(label) ? 'sketchy' : null, shortLabel(label).toUpperCase(), `+${fmt(points)}`));
  on('grindLost', () => callout('RAIL LOST', '#ff6bb0'));
  // Wipeouts pay a little XP (progression): say so once the rider is back up.
  on('progressWipeout', ({ tumble, xp }) => callout(`WIPEOUT${tumble >= 2 ? ` · ${Math.round(tumble)} M TUMBLE` : ''}  +${xp} XP`, '#ff9a3d'));
  // Trick book (progression): the first clean landing of a trick gets a NEW TRICK ribbon on its announcement.
  on('newTrick', ({ xp }) => {
    if (performance.now() - annT > 400) return;
    an.querySelector('.nw').textContent = `NEW TRICK  +${xp} XP`;
    an.classList.add('new');
  });

  // ------------------------------------------------------------------ close shaves
  let nearN = 0, nearT = -99;
  on('nearMiss', ({ dist }) => {
    const t = performance.now() / 1000;
    nearN = t - nearT < JUICE_HUD.nearStreakWindow ? nearN + 1 : 1;
    nearT = t;
    callout(nearN > 1 ? `CLOSE SHAVE ×${nearN}` : dist < 0.8 ? 'RAZOR CLOSE!' : 'CLOSE SHAVE', nearN >= 3 ? '#ffe14d' : '#2ff5d6');
  });

  // ------------------------------------------------------------------ floating score pops
  // Small scores (close shaves, gates, snowflakes, carves…) rise off the rider; tricks have the announcer
  // and distance markers stay in the notes. At most 4 alive.
  const _v = new Vector3();
  let popT = 0, popLabel = '';
  on('score', ({ label, points }) => {
    if (!riding() || !camera || points <= 0 || points >= 100 || /^\d+ m$/.test(label || '') || /^(Combo|Line) ×/.test(label || '')) return;
    if (root.querySelectorAll('.fp').length >= 4) return;
    // Not spammy: one pop per 0.4 s, and a repeat of the same move within 1 s is left to the call-out (CLOSE SHAVE ×n).
    const now = performance.now();
    if (now - popT < 400 || (label === popLabel && now - popT < 1000)) return;
    popT = now; popLabel = label;
    const p = player.renderPos;
    const v = _v.set(p.x, p.y + 1.6, p.z).project(camera);
    if (v.z > 1) return;
    const el = document.createElement('div');
    el.className = 'fp';
    el.style.setProperty('--x', `${((v.x * 0.5 + 0.5) * innerWidth).toFixed(0)}px`);
    el.style.setProperty('--y', `${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(0)}px`);
    el.style.setProperty('--dx', `${(Math.random() * 40 - 20).toFixed(0)}px`);
    el.innerHTML = `+${points}<small>${esc(String(label).toUpperCase().slice(0, 18))}</small>`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  });

  // ------------------------------------------------------------------ toasts
  const toast = ({ kind = 'Achievement', title, sub = '', icon = '★', c1 = '#ffe14d', c2 = '#ff9a3d', progress = null, hold = 3.6 }) => {
    const el = document.createElement('div');
    el.className = 'tt';
    el.style.setProperty('--c1', c1); el.style.setProperty('--c2', c2);
    el.innerHTML = `<div class="ic">${icon}</div><div><b>${esc(kind.toUpperCase())}</b><span>${esc(title)}</span>${sub ? `<small>${esc(sub)}</small>` : ''}${progress != null ? `<div class="pb"><i style="width:${Math.round(progress * 100)}%"></i></div>` : ''}</div>`;
    ts.appendChild(el);
    while (ts.children.length > 3) ts.removeChild(ts.firstChild);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('on')));
    setTimeout(() => el.classList.remove('on'), hold * 1000);
    setTimeout(() => el.remove(), hold * 1000 + 600);
    return el;
  };

  const show = () => { root.style.display = game.mode === Mode.RIDING || game.mode === Mode.LIFT ? '' : 'none'; };
  on('mode', show);
  show();

  // ------------------------------------------------------------------ per frame
  let lastHalf = 0, airOn = false, shown = 0;
  on('rideStarted', () => { shown = 0; scB.textContent = '0'; });
  const update = (dt) => {
    // Rolling score: counts up toward game.score (fast for big jumps), a bump when a chunk lands.
    const target = game.score || 0;
    if (target < shown) shown = target;
    if (target > shown) {
      const step = Math.max(1, (target - shown) * Math.min(1, (dt || 0.016) * 9));
      const was = shown;
      shown = Math.min(target, shown + step);
      if (target - was >= 100 && !scB.classList.contains('up')) { restart(scB, 'up'); setTimeout(() => scB.classList.remove('up'), 320); }
      scB.textContent = fmt(shown);
    }
    const s = combo.state();
    if (s && riding() && s.mult > 1.01) {
      cbTm.style.transform = `scaleX(${s.left.toFixed(3)})`;
      const atRisk = (player.state === 2 || player.state === 5) && s.mult >= 1.5;
      cb.classList.toggle('risk', atRisk);
      root.classList.toggle('atrisk', atRisk && s.mult >= JUICE_HUD.riskVignetteFrom && !reducedMotion());
      cb.classList.add('on');
    } else { cb.classList.remove('on', 'risk'); root.classList.remove('atrisk'); }
    if (combo.feverT > 0) { const t = `FEVER ${Math.ceil(combo.feverT)}s`; if (fv.textContent !== t) fv.textContent = t; }
    // Live air: rotation in 180s, flips, grab.
    const inAir = player.state === 2 && player.airTime > JUICE_HUD.liveAirFrom && riding();
    const spin = Math.abs(player._spinTotal || 0);
    const halves = Math.floor((spin + 0.35) / Math.PI);
    const flips = Math.floor((Math.abs(player.flip || 0) + 0.6) / (Math.PI * 2));
    const grab = player.grabName && player.grab > 0.6 ? player.grabName : '';
    // Big straight airs show the hang time instead (from 1 s), so drops build anticipation too.
    const hang = inAir && player.airTime > JUICE_HUD.hangFrom;
    const show = inAir && (halves > 0 || flips > 0 || grab || hang);
    if (show !== airOn) { air.classList.toggle('on', show); airOn = show; }
    if (show) {
      const deg = halves * 180;
      const txt = deg ? String(deg) : flips ? 'FLIP' : `${player.airTime.toFixed(1)}s`;
      if (airD.textContent !== txt) {
        airD.textContent = txt;
        if (halves > lastHalf) restart(airD, 'tick');
        // The number heats up with the rotation: white → cyan → gold → orange.
        airD.style.color = deg >= 1080 ? '#ff9a3d' : deg >= 720 ? '#ffe14d' : deg >= 360 ? '#2ff5d6' : '#fffaf0';
      }
      const drop = player._maxAbove || 0;
      const x = [flips ? `${flips > 1 ? `${flips}× ` : ''}FLIP` : '', grab.toUpperCase(), drop >= 4 ? `${Math.round(drop)} M` : ''].filter(Boolean).join(' · ');
      if (airX.textContent !== x) airX.textContent = x;
    }
    lastHalf = inAir ? halves : 0;
  };

  /** True while a trick is being announced or the rider is in the air (big celebrations wait). */
  const busy = () => (riding() && player.state === 2) || performance.now() - annT < (JUICE_HUD.announceHold + 0.3) * 1000 || performance.now() - bnT < 1700;
  return { root, toast, banner, callout, flash, edge, announce, update, busy };
}

/** Landing grade for any map: flow maps grade the landing themselves (e.grade), others from perfect / clean. */
export function gradeOf(e) {
  if (!e.clean) return 'sketchy';
  if (e.grade === 'stomped') return 'stomped';
  if (e.perfect) return e.impact <= (P.hardLanding ?? 12) * JUICE_HUD.stompedImpact ? 'stomped' : 'perfect';
  return 'clean';
}

/** "Perfect Left 540 Mute" → "Left 540 Mute"; rail labels drop the length. */
function shortLabel(l) { return String(l).replace(/^Perfect\s+/, '').replace(/\s*·\s*[\d.]+ m$/, ''); }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
