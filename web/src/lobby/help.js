// How to ride + Controls (docs/lobby.md → "First run and Help").
//
// One source for every place that explains the controls:
//   - the first-run "How to ride" cards: shown once, on the first Ride (main.js startRide → UI.openHowTo),
//     skippable, and again from Help or the pause menu;
//   - the Controls sheet: keyboard and controller diagrams (Help tab, pause → Controls);
//   - the Help tab's quick list (lobby/tabs/help.js).
// Keep it true to input.js, physics/edge.js and thrill/ (the same rules as loading/tips.js).
//
// Glyph markup: `.hw-k` = a keycap, `.hw-b` = a controller button. A block holds both variants as
// `.hw-kb` / `.hw-gp`; the container's data-dev="kb" | "gp" shows one (help.css).

import './help.css';

const HOWTO_KEY = 'sendit.howto';

/** True until the player has seen (or skipped) the How to ride cards once. Automated browsers skip it unless ?howto. */
let seenNow = false;   // seen during this page load (?howto forces the cards only until then)
export function needsHowTo() {
  if (seenNow) return false;
  let q = '';
  try { q = location.search; } catch { /* no location */ }
  if (/[?&]howto=0/.test(q)) return false;
  if (/[?&]howto/.test(q)) return true;
  if (typeof navigator !== 'undefined' && navigator.webdriver) return false;   // test scripts ride straight away
  try { return localStorage.getItem(HOWTO_KEY) !== '1'; } catch { return false; }
}
export function markHowToSeen() { seenNow = true; try { localStorage.setItem(HOWTO_KEY, '1'); } catch { /* private mode */ } }

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// ---------------------------------------------------------------- glyphs
const KEY_NAMES = { Left: '←', Right: '→', Up: '↑', Down: '↓', Backspace: '⌫ Backspace' };
/** A keycap. */
export const k = (key) => `<kbd class="hw-k${key.length > 2 ? ' wide' : ''}">${esc(KEY_NAMES[key] || key)}</kbd>`;
/** A controller button (Xbox names; the shape tells face buttons, bumpers, triggers and sticks apart). */
export function b(btn) {
  const shape = /^(A|B|X|Y)$/.test(btn) ? 'face' : /^(LB|RB)$/.test(btn) ? 'bumper' : /^(LT|RT)$/.test(btn) ? 'trigger' : /^(LS|RS)$/.test(btn) ? 'stick' : /^[▲▼◀▶]$/.test(btn) ? 'dpad' : 'small';
  return `<span class="hw-b ${shape} b-${esc(btn)}" aria-label="${esc(padName(btn))}">${esc(btn)}</span>`;
}
const padName = (btn) => ({ LS: 'left stick', RS: 'right stick', '▲': 'd-pad up', '▼': 'd-pad down', '◀': 'd-pad left', '▶': 'd-pad right' }[btn] || btn);
const glyphs = (list, fn) => list.map((x) => (x === '/' ? '<i class="hw-or">or</i>' : x === '+' ? '<i class="hw-plus">+</i>' : fn(x))).join('');
/** Both variants of a binding: keyboard keys and controller buttons ('/' = or, '+' = together). */
export const bind = (kb, gp) => `<span class="hw-kb">${glyphs(kb, k)}</span><span class="hw-gp">${glyphs(gp, b)}</span>`;

// ---------------------------------------------------------------- the bindings (one table for everything)
// [action, keyboard, controller, note]
export const CONTROLS = [
  { id: 'ride', title: 'Ride', rows: [
    ['Steer', ['A', 'D', '/', 'Left', 'Right'], ['LS'], 'Lean into a turn to carve'],
    ['Skate / speed up', ['W', '/', 'Up'], ['RT', '/', 'LS'], 'Push the stick up'],
    ['Brake', ['S', '/', 'Down'], ['LT', '/', 'B'], 'Hold it hard for a hockey stop'],
    ['Tuck', ['Shift'], ['RB', '/', 'X'], 'On the straights, for top speed'],
  ] },
  { id: 'air', title: 'Jumps and tricks', rows: [
    ['Jump', ['Space'], ['A'], 'Hold to load, let go at the lip'],
    ['Spin', ['Space', '+', 'A', '/', 'D'], ['A', '+', 'LS'], 'Steer while loading, keep steering off the lip'],
    ['Flip', ['Space', '+', 'W', '/', 'S'], ['A', '+', 'LS'], 'S / stick back = backflip, W / stick up = frontflip'],
    ['Grab', ['Shift'], ['RB', '/', 'X'], 'Hold it in the air, let go before you land'],
  ] },
  { id: 'run', title: 'Run', rows: [
    ['Restart from the top', ['R'], ['Y']],
    ['Retry the last jump', ['Backspace'], ['▼']],
    ['Instant replay', ['Tab'], ['▲']],
    ['Save the clip to Highlights', ['F'], ['LB']],
    ['Chase cam / first person', ['C', '/', 'V'], ['View', '/', 'RS']],
    ['Look around', ['Mouse'], ['RS']],
    ['Drop zones (some mountains)', ['1–9'], ['◀', '/', '▶']],
    ['Pause', ['Esc', '/', 'P'], ['Start']],
  ] },
];

/** The quick list: one block per group, rows of "action — glyphs". */
export function controlsList({ groups = CONTROLS, notes = true } = {}) {
  return groups.map((g) => `
    <div class="hw-group">
      <h3 class="hw-h">${esc(g.title)}</h3>
      <dl class="hw-list">${g.rows.map(([a, kb, gp, note]) => `
        <div class="hw-row"><dt>${esc(a)}${notes && note ? `<small>${esc(note)}</small>` : ''}</dt><dd>${bind(kb, gp)}</dd></div>`).join('')}
      </dl>
    </div>`).join('');
}

// ---------------------------------------------------------------- diagrams
/** The left half of a keyboard plus the arrows, with what each key does printed on it. */
export function keyboardDiagram() {
  const key = (cap, label = '', cls = '') => `<span class="kd-key${label ? ' on' : ''}${cls ? ` ${cls}` : ''}"><b>${esc(cap)}</b>${label ? `<small>${esc(label)}</small>` : ''}</span>`;
  const rows = [
    [key('Esc', 'pause'), key('1–9', 'drop zone', 'w15'), key(''), key(''), key('⌫', 'retry jump', 'w15 push')],
    [key('Tab', 'replay', 'w15'), key('Q'), key('W', 'speed'), key('E'), key('R', 'restart'), key('T')],
    [key('Caps', '', 'w18'), key('A', 'steer'), key('S', 'brake'), key('D', 'steer'), key('F', 'save clip'), key('G')],
    [key('Shift', 'tuck · grab', 'w22'), key('Z'), key('X'), key('C', 'camera'), key('V', 'camera'), key('P', 'pause', 'push')],
    [key('Space', 'hold to jump · steer = spin · W / S = flip', 'space')],
  ];
  return `<div class="kd" role="img" aria-label="Keyboard: W speed, A and D steer, S brake, Shift tuck and grab, Space jump, R restart, Backspace retry, Tab replay, F save clip, C or V camera, Esc or P pause, 1 to 9 drop zones. Arrow keys also steer.">
    <div class="kd-main">${rows.map((r) => `<div class="kd-row">${r.join('')}</div>`).join('')}</div>
    <div class="kd-arrows"><small class="kd-cap">or arrows</small>
      <div class="kd-row">${key('↑', 'speed')}</div>
      <div class="kd-row">${key('←', 'steer')}${key('↓', 'brake')}${key('→', 'steer')}</div>
    </div>
  </div>`;
}

/** A controller outline with call-outs (Xbox layout; PlayStation: A = ✕, B = ○, X = □, Y = △). */
export function gamepadDiagram() {
  const X = 170;   // the controller is drawn at x 116–520 and shifted right by X; labels sit in the margins
  const L = [   // [label, y of the text, x, y of the button (unshifted), side]
    ['LT  brake', 34, 146, 52, 'l'], ['LB  save clip', 62, 140, 66, 'l'], ['View  camera', 96, 205, 103, 'l'],
    ['Left stick  steer · lean into tricks', 128, 140, 120, 'l'], ['D-pad  ▲ replay · ▼ retry · ◀▶ drop zone', 186, 202, 162, 'l'],
    ['RT  speed up', 30, 460, 52, 'r'], ['RB  tuck · grab', 58, 466, 66, 'r'], ['Y  restart', 86, 462, 98, 'r'], ['Start  pause', 112, 395, 103, 'r'],
    ['B  brake', 138, 488, 124, 'r'], ['X  tuck · grab', 164, 436, 124, 'r'], ['A  hold to jump', 190, 462, 150, 'r'], ['Right stick  look around', 216, 412, 168, 'r'],
  ];
  const lx = 278, rx = 708;
  return `<svg class="gd" viewBox="0 0 990 284" role="img" aria-label="Controller: left stick steer, RT speed up, LT or B brake, A hold to jump, RB or X tuck and grab, Y restart, d-pad down retry the jump, d-pad up replay, LB save clip, View camera, right stick look, Start pause.">
    <g transform="translate(${X} 0)">
    <path class="gd-body" d="M196 66 h214 c40 0 62 18 76 56 l34 96 c10 30 -6 52 -32 52 c-18 0 -30 -10 -44 -30 l-26 -38 h-196 l-26 38 c-14 20 -26 30 -44 30 c-26 0 -42 -22 -32 -52 l34 -96 c14 -38 36 -56 76 -56 z"/>
    <rect class="gd-bump" x="118" y="44" width="56" height="16" rx="6"/><rect class="gd-bump" x="432" y="44" width="56" height="16" rx="6"/>
    <circle class="gd-stick" cx="160" cy="120" r="24"/><circle class="gd-stick" cx="412" cy="168" r="22"/>
    <path class="gd-dpad" d="M184 156 h12 v-12 h12 v12 h12 v12 h-12 v12 h-12 v-12 h-12 z"/>
    <circle class="gd-face" cx="462" cy="98" r="11"/><circle class="gd-face" cx="488" cy="124" r="11"/><circle class="gd-face" cx="462" cy="150" r="11"/><circle class="gd-face" cx="436" cy="124" r="11"/>
    <text class="gd-btn" x="462" y="102">Y</text><text class="gd-btn" x="488" y="128">B</text><text class="gd-btn" x="462" y="154">A</text><text class="gd-btn" x="436" y="128">X</text>
    <rect class="gd-small" x="198" y="98" width="14" height="10" rx="3"/><rect class="gd-small" x="388" y="98" width="14" height="10" rx="3"/>
    </g>
    ${L.map(([, ty, bx, by, side]) => `<path class="gd-line" d="M${side === 'l' ? lx + 6 : rx - 6} ${ty - 4} L${bx + X} ${by}"/><circle class="gd-dot" cx="${bx + X}" cy="${by}" r="2.4"/>`).join('')}
    ${L.map(([t, ty, , , side]) => {
      const [btn, ...rest] = t.split('  ');
      return `<text class="gd-label" x="${side === 'l' ? lx : rx}" y="${ty}" text-anchor="${side === 'l' ? 'end' : 'start'}"><tspan class="gd-name">${esc(btn)}</tspan> ${esc(rest.join('  '))}</text>`;
    }).join('')}
  </svg>`;
}

// ---------------------------------------------------------------- the first-run cards
// Each card: a "hero" (big glyphs) and up to three lines. `kb` / `gp` give both devices.
export const HOWTO_CARDS = [
  { id: 'ride', title: 'Ride', lead: 'Point downhill and go.',
    hero: { kb: ['W', 'A', 'S', 'D'], gp: ['LS', 'RT', 'LT'] },
    lines: [
      [bind(['A', 'D'], ['LS']), 'Steer. Lean into turns to carve.'],
      [bind(['W'], ['RT']), 'Skate for speed. ' + bind(['Shift'], ['RB']) + ' tucks on the straights.'],
      [bind(['S'], ['LT']), 'Brake. Hold it hard to stop.'],
    ] },
  { id: 'jump', title: 'Jump', lead: 'Load up on the approach, pop at the lip.',
    hero: { kb: ['Space'], gp: ['A'] },
    lines: [
      [bind(['Space'], ['A']), 'Hold to crouch, let go right at the lip for the biggest pop.'],
      ['', 'Land facing down the hill. Let go of every key before touchdown to stomp it.'],
    ] },
  { id: 'tricks', title: 'Tricks', lead: 'Tricks start at the take-off.',
    hero: { kb: ['Space', '+', 'A', 'D'], gp: ['A', '+', 'LS'] },
    lines: [
      [bind(['Space', '+', 'A', '/', 'D'], ['A', '+', 'LS']), 'Spin: steer while you hold jump, keep steering off the lip.'],
      [bind(['Space', '+', 'S', '/', 'W'], ['A', '+', 'LS']), 'Flip: hold back (backflip) or forward (frontflip) while you hold jump.'],
      [bind(['Shift'], ['RB']), 'Grab: hold it in the air, let go just before you land.'],
    ] },
  { id: 'run', title: 'Run it back', lead: 'Crashed? Missed the trick? Go again in a second.',
    hero: { kb: ['R', 'Backspace', 'Tab'], gp: ['Y', '▼', '▲'] },
    lines: [
      [bind(['R'], ['Y']), 'Restart from the top.'],
      [bind(['Backspace'], ['▼']), 'Retry your last jump. ' + bind(['Tab'], ['▲']) + ' replays it, ' + bind(['F'], ['LB']) + ' saves the clip.'],
      [bind(['C'], ['View']), 'Switch to first person. ' + bind(['Esc'], ['Start']) + ' pauses.'],
    ] },
];

function heroHtml(h) {
  return `<div class="hw-hero"><span class="hw-kb">${glyphs(h.kb, k)}</span><span class="hw-gp">${glyphs(h.gp, b)}</span></div>`;
}

/** The How to ride card deck (markup only; UI.openHowTo wires it). */
export function howToHtml({ name = 'Rider', touch = false } = {}) {
  const n = HOWTO_CARDS.length;
  return `
    <div class="hw-card" role="dialog" aria-modal="true" aria-labelledby="hw-title">
      <div class="hw-top">
        <span class="hw-kicker">How to ride</span>
        <div class="hw-dev" role="group" aria-label="Show controls for">
          <button type="button" data-dev="kb">Keyboard</button><button type="button" data-dev="gp">Controller</button>
        </div>
      </div>
      ${touch ? '<p class="hw-touch">Sendit is played with a keyboard or a game controller. Connect a controller to ride on this device.</p>' : ''}
      <div class="hw-pages">
        ${HOWTO_CARDS.map((c, i) => `
          <section class="hw-page" data-i="${i}" ${i ? 'hidden' : ''}>
            <span class="hw-step">${i + 1}<i>/ ${n}</i></span>
            <h2 class="hw-title" ${i ? '' : 'id="hw-title"'}>${esc(c.title)}</h2>
            <p class="hw-lead">${esc(c.lead)}</p>
            ${heroHtml(c.hero)}
            <ul class="hw-lines">${c.lines.map(([g, t]) => `<li>${g ? `<span class="hw-g">${g}</span>` : ''}<span>${t}</span></li>`).join('')}</ul>
            ${i === n - 1 ? `
              <div class="hw-modes"><p><b>Zen</b> free ride, no clock.</p><p><b>Challenge</b> race the gates for a time and a medal.</p></div>
              <label class="hw-name"><span>Rider name</span><input type="text" maxlength="24" value="${esc(name)}" spellcheck="false" autocomplete="off" /></label>` : ''}
          </section>`).join('')}
      </div>
      <div class="hw-foot">
        <button type="button" class="hw-skip" data-hw="skip">Skip</button>
        <div class="hw-dots" aria-hidden="true">${HOWTO_CARDS.map((_, i) => `<i data-i="${i}"></i>`).join('')}</div>
        <button type="button" class="hw-back" data-hw="back">Back</button>
        <button type="button" class="hw-next" data-hw="next" data-autofocus>Next</button>
      </div>
      <p class="hw-again">You can see this again any time in Help (the <b>?</b> button in the lobby).</p>
    </div>`;
}

/** The Controls sheet: both diagrams and the full list. */
export function controlsSheetHtml() {
  return `
    <div class="hw-card wide" role="dialog" aria-modal="true" aria-labelledby="hw-ctitle">
      <div class="hw-top">
        <h2 class="hw-title" id="hw-ctitle">Controls</h2>
        <div class="hw-dev" role="group" aria-label="Show controls for">
          <button type="button" data-dev="kb">Keyboard</button><button type="button" data-dev="gp">Controller</button>
        </div>
      </div>
      <div class="hw-diagram"><div class="hw-kb">${keyboardDiagram()}</div><div class="hw-gp">${gamepadDiagram()}</div></div>
      <div class="hw-cols">${controlsList({ notes: true })}</div>
      <p class="hw-again hw-gp">PlayStation: A = ✕, B = ○, X = □, Y = △, View = Create, Start = Options.</p>
      <div class="hw-foot"><span></span><button type="button" class="hw-next" data-hw="close" data-autofocus>Close</button></div>
    </div>`;
}
