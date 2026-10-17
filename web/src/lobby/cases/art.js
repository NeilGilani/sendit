// Item card art: a small SVG per skin, drawn from the same colour data the rider wears
// (profile/items.js → character/outfits.js), so a card reads like the look you get: slot silhouette,
// colourway, print (camo, flames, skull jaw…) and finish (metallic, chrome, iridescent, neon).
//   itemArt(item, variant) → '<svg…>'      goldArt() → the anonymous ★ card of the gold tier
import { COLORWAYS } from '../../character/outfits.js';
import { getEquipmentSpec } from '../../equipment/registry.js';

let uid = 0;
const hex = (n) => (typeof n === 'number' ? `#${n.toString(16).padStart(6, '0')}` : n);

// Silhouettes in a 100 × 100 box.
const SHAPES = {
  jacket: 'M30 22 L42 16 Q50 22 58 16 L70 22 L86 34 L92 62 L80 66 L74 46 L74 84 Q50 89 26 84 L26 46 L20 66 L8 62 L14 34 Z',
  pants: 'M28 14 L72 14 L76 52 L74 88 L56 88 L51 40 L49 40 L44 88 L26 88 L24 52 Z',
  helmet: 'M16 62 Q14 22 50 18 Q86 22 84 62 Q84 70 76 72 L24 72 Q16 70 16 62 Z',
  gloves: 'M30 86 L30 48 Q30 26 48 24 Q66 22 68 44 L70 54 Q80 46 84 54 Q86 60 78 68 L70 76 L70 86 Z',
  face: 'M24 30 Q50 22 76 30 L80 80 Q50 90 20 80 Z',
};

function pattern(id, c, kind, scale = 1) {
  const s = 18 / (scale || 1);
  const A = c.patA || '#222', B = c.patB || '#888';
  switch (kind) {
    case 'camo': return `<pattern id="${id}" width="${s * 2}" height="${s * 2}" patternUnits="userSpaceOnUse"><rect width="${s * 2}" height="${s * 2}" fill="${c.base}"/>
      <path d="M2 6 q8 -6 14 2 q4 8 -4 10 q-10 2 -10 -12z" fill="${A}"/><path d="M20 20 q10 -4 12 6 q-2 8 -10 4 q-8 -2 -2 -10z" fill="${B}"/><path d="M22 2 q6 0 8 6 q-6 4 -10 -2z" fill="${B}"/><path d="M4 26 q6 -2 8 4 q-4 6 -8 2z" fill="${A}"/></pattern>`;
    case 'digital': return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${c.base}"/>
      <rect x="0" y="0" width="4" height="4" fill="${A}"/><rect x="4" y="4" width="4" height="4" fill="${B}"/><rect x="8" y="0" width="4" height="4" fill="${A}"/><rect x="8" y="8" width="4" height="4" fill="${B}"/><rect x="0" y="8" width="4" height="4" fill="${A}"/></pattern>`;
    case 'stripes': return `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="${c.base}"/><rect width="3" height="8" fill="${A}"/></pattern>`;
    case 'checker': return `<pattern id="${id}" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="${c.base}"/><rect width="6" height="6" fill="${A}"/><rect x="6" y="6" width="6" height="6" fill="${A}"/></pattern>`;
    case 'zigzag': return `<pattern id="${id}" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="${c.base}"/><path d="M0 8 L4 3 L8 8 L12 3 L16 8" stroke="${A}" stroke-width="2.6" fill="none"/><path d="M0 12 L4 7 L8 12 L12 7 L16 12" stroke="${B}" stroke-width="1.4" fill="none"/></pattern>`;
    case 'tiger': return `<pattern id="${id}" width="20" height="20" patternUnits="userSpaceOnUse"><rect width="20" height="20" fill="${c.base}"/><path d="M0 4 q10 4 20 -2 M0 12 q8 6 14 2 M6 20 q8 -6 14 -2" stroke="${A}" stroke-width="2.4" fill="none"/></pattern>`;
    case 'stars': return `<pattern id="${id}" width="18" height="18" patternUnits="userSpaceOnUse"><rect width="18" height="18" fill="${c.base}"/><path d="M5 2 l1 3 3 0 -2.4 2 1 3 -2.6 -2 -2.6 2 1 -3 -2.4 -2 3 0z" fill="${c.decalCol || A}"/><circle cx="14" cy="13" r="1" fill="${c.decalCol || A}"/></pattern>`;
    case 'splatter': return `<pattern id="${id}" width="30" height="30" patternUnits="userSpaceOnUse"><rect width="30" height="30" fill="${c.base}"/><circle cx="7" cy="8" r="4" fill="${A}"/><circle cx="12" cy="11" r="1.5" fill="${A}"/><circle cx="22" cy="20" r="5" fill="${B}"/><circle cx="16" cy="26" r="1.6" fill="${B}"/><circle cx="25" cy="6" r="2" fill="${A}"/></pattern>`;
    case 'topo': return `<pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse"><rect width="24" height="24" fill="${c.base}"/><path d="M0 6 q6 -4 12 0 t12 0 M0 14 q6 -5 12 0 t12 0 M0 21 q6 -3 12 0 t12 0" stroke="rgba(255,255,255,.28)" stroke-width="1" fill="none"/></pattern>`;
    default: return '';
  }
}

/** Fill for a garment piece: flat, patterned or a gradient print, plus defs. */
function fillFor(c, prefix) {
  const id = `${prefix}p`;
  const kind = c.pat || 'none';
  if (kind === 'fade') return { defs: `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.patA}"/><stop offset="1" stop-color="${c.patB}"/></linearGradient>`, fill: `url(#${id})` };
  if (kind === 'tiedye') return { defs: `<radialGradient id="${id}" cx=".4" cy=".45" r=".7"><stop offset="0" stop-color="${c.patB}"/><stop offset=".35" stop-color="${c.base}"/><stop offset=".65" stop-color="${c.patA}"/><stop offset="1" stop-color="${c.base}"/></radialGradient>`, fill: `url(#${id})` };
  if (kind === 'diagonal') return { defs: `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset=".48" stop-color="${c.patA}"/><stop offset=".48" stop-color="${c.patB}"/></linearGradient>`, fill: `url(#${id})` };
  if (kind === 'flames') return { defs: `<linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${c.patB}"/><stop offset=".35" stop-color="${c.patA}"/><stop offset=".6" stop-color="${c.base}"/></linearGradient>`, fill: `url(#${id})` };
  const p = pattern(id, c, kind, c.patScale);
  return p ? { defs: p, fill: `url(#${id})` } : { defs: '', fill: c.base };
}

/** Sheen overlay for a finish (metallic, chrome, reflective, iridescent, pearl, gloss, carbon). */
function finishOverlay(finish, shape, prefix) {
  const id = `${prefix}f`;
  const grads = {
    metallic: [['0', '#fff', 0.55], ['.35', '#fff', 0], ['.6', '#000', 0.25], ['.8', '#fff', 0.35], ['1', '#000', 0.2]],
    chrome: [['0', '#fff', 0.85], ['.3', '#fff', 0.05], ['.45', '#000', 0.55], ['.55', '#fff', 0.7], ['.8', '#000', 0.2], ['1', '#fff', 0.5]],
    reflective: [['0', '#fff', 0.75], ['.5', '#fff', 0.2], ['1', '#fff', 0.6]],
    gloss: [['0', '#fff', 0.45], ['.3', '#fff', 0], ['1', '#000', 0.15]],
    pearl: [['0', '#ffd6f5', 0.5], ['.5', '#c8f4ff', 0.35], ['1', '#fff3c4', 0.45]],
    iridescent: [['0', '#ff6ad5', 0.55], ['.25', '#ffe96a', 0.45], ['.5', '#5dffb0', 0.45], ['.75', '#5ab8ff', 0.55], ['1', '#c86aff', 0.55]],
  };
  if (finish === 'carbon') return { defs: `<pattern id="${id}" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="3" height="3" fill="rgba(255,255,255,.12)"/><rect x="3" y="3" width="3" height="3" fill="rgba(255,255,255,.12)"/></pattern>`, el: `<path d="${shape}" fill="url(#${id})"/>` };
  const g = grads[finish];
  if (!g) return { defs: '', el: '' };
  return {
    defs: `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">${g.map(([o, c, a]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('')}</linearGradient>`,
    el: `<path d="${shape}" fill="url(#${id})"${finish === 'iridescent' ? ' style="mix-blend-mode:screen"' : ''}/>`,
  };
}

const wrap = (body, defs = '', extra = '') => `<svg viewBox="0 0 100 100" class="ca-svg" aria-hidden="true"${extra}><defs>${defs}</defs>${body}</svg>`;

function clothing(item, variant) {
  const slot = item.slot;
  const P = `ca${++uid}`;
  const base = COLORWAYS[variant.id]?.[slot] || COLORWAYS.basic[slot];
  const c = { ...base, ...(variant.colors || {}) };
  const shape = SHAPES[slot];
  const outline = 'stroke="rgba(0,0,0,.45)" stroke-width="1.4" stroke-linejoin="round"';
  const neon = c.finish === 'neon';
  const glow = neon ? `<filter id="${P}g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2"/></filter>` : '';
  let defs = glow, body = '';
  if (slot === 'jacket') {
    const f = fillFor(c, P);
    const fin = finishOverlay(c.finish, shape, P);
    defs += f.defs + fin.defs;
    const panel = c.style === 1
      ? '<path d="M14 34 L30 22 L26 46 L20 66 L8 62 Z M86 34 L70 22 L74 46 L80 66 L92 62 Z" fill="PANEL"/>'
      : '<path d="M30 22 L42 16 Q50 22 58 16 L70 22 L74 38 Q50 44 26 38 Z" fill="PANEL"/>';
    const band = c.pat === 'band' ? `<rect x="26" y="48" width="48" height="9" fill="${c.patA}"/><rect x="26" y="57" width="48" height="4" fill="${c.patB}"/>` : '';
    body = `<path d="${shape}" fill="${f.fill}" ${outline}/>${c.pat && c.pat !== 'none' && c.pat !== 'band' ? '' : panel.replace(/PANEL/g, c.panel)}${band}
      ${fin.el}<path d="M50 22 L50 86" stroke="${neon ? c.accent : 'rgba(0,0,0,.55)'}" stroke-width="2"/>
      ${item.model?.ref === 'storm-shell' ? `<path d="M34 22 Q30 2 50 1 Q70 2 66 22 Q58 14 50 14 Q42 14 34 22 Z" fill="${c.panel}" ${outline}/>` : `<path d="M42 16 Q50 26 58 16 L56 11 Q50 14 44 11 Z" fill="${c.gaiter || c.panel}" ${outline}/>`}
      ${neon ? `<path d="${shape}" fill="none" stroke="${c.accent}" stroke-width="2.4" filter="url(#${P}g)"/><path d="${shape}" fill="none" stroke="${c.accent}" stroke-width="1"/>` : `<path d="M34 46 L44 44" stroke="${c.accent}" stroke-width="2.2"/>`}`;
    if (c.onePiece) body += `<path d="M30 84 L32 98 L46 98 L49 88 L51 88 L54 98 L68 98 L70 84" fill="${f.fill}" ${outline}/><rect x="26" y="80" width="48" height="4" fill="${c.panel}"/>`;
  } else if (slot === 'pants') {
    const f = fillFor(c, P);
    const fin = finishOverlay(c.finish, shape, P);
    defs += f.defs + fin.defs;
    body = `<path d="${shape}" fill="${f.fill}" ${outline}/>${fin.el}<path d="M26 78 L44 78 L44 88 L26 88 Z M56 78 L74 78 L74 88 L56 88 Z" fill="${c.cuff}"/>
      <rect x="28" y="14" width="44" height="6" fill="rgba(0,0,0,.25)"/>`;
  } else if (slot === 'helmet') {
    const fin = finishOverlay(c.finish, shape, P);
    defs += fin.defs;
    let decal = '';
    const dc = c.decalCol || c.accent;
    if (c.decal === 'stripe') decal = `<path d="M44 19 Q50 18 56 19 L58 72 L42 72 Z" fill="${dc}"/>`;
    else if (c.decal === 'flames') decal = `<path d="M18 66 Q24 52 30 60 Q32 44 40 56 Q44 40 52 54 Q58 42 62 58 Q70 48 74 62 Q80 56 82 66 Z" fill="${dc}"/><path d="M22 66 Q28 58 32 63 Q36 52 42 61 Q48 50 54 62 Q60 54 66 64 Q72 60 78 67 Z" fill="#ffd23a"/>`;
    else if (c.decal === 'stars') decal = [[30, 36], [56, 30], [70, 48], [40, 54], [62, 60]].map(([x, y]) => `<path d="M${x} ${y - 5} l1.6 3.4 3.8 .4 -2.8 2.6 .8 3.8 -3.4 -2 -3.4 2 .8 -3.8 -2.8 -2.6 3.8 -.4z" fill="${dc}"/>`).join('');
    body = `<path d="${shape}" fill="${c.base}" ${outline}/>${decal}${fin.el}
      <path d="M24 72 L76 72 L74 64 L26 64 Z" fill="${c.liner}"/><rect x="62" y="56" width="10" height="3" fill="${c.accent}"/>
      <path d="M24 48 Q50 40 76 48" stroke="rgba(0,0,0,.35)" stroke-width="2" fill="none"/>`;
  } else if (slot === 'goggles') {
    const id = `${P}l`;
    const iri = c.iri || 0;
    defs += `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.lens}"/>${iri > 0 ? `<stop offset=".45" stop-color="${c.lensBase}"/><stop offset=".7" stop-color="#5dffb0" stop-opacity="${iri}"/>` : ''}<stop offset="1" stop-color="${c.lensBase}"/></linearGradient>`;
    body = `<path d="M6 50 L18 44 L18 62 L6 58 Z M94 50 L82 44 L82 62 L94 58 Z" fill="${c.strap}"/>
      <path d="M14 38 Q50 28 86 38 Q90 56 80 68 Q66 72 58 64 Q50 58 42 64 Q34 72 20 68 Q10 56 14 38 Z" fill="${c.frame || '#151517'}" ${outline}/>
      <path d="M19 41 Q50 32 81 41 Q84 54 77 63 Q66 66 59 59 Q50 53 41 59 Q34 66 23 63 Q16 54 19 41 Z" fill="url(#${id})"/>
      <path d="M24 44 Q40 38 54 40" stroke="rgba(255,255,255,.7)" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
  } else if (slot === 'gloves') {
    const fin = finishOverlay(c.finish === 'neon' ? '' : c.finish, shape, P);
    const f = fillFor({ ...c, base: c.base }, P);
    defs += fin.defs + f.defs;
    const short = item.model?.ref === 'pipe-glove';
    body = `<path d="${shape}" fill="${f.fill}" ${outline}/>${fin.el}<path d="M30 ${short ? 76 : 66} L70 ${short ? 76 : 66} L70 86 L30 86 Z" fill="${c.cuff}" ${outline}/>
      <path d="M32 50 Q48 46 64 50" stroke="rgba(0,0,0,.3)" stroke-width="1.6" fill="none"/>
      ${neon ? `<path d="${shape}" fill="none" stroke="${c.cuff}" stroke-width="2.4" filter="url(#${P}g)"/>` : ''}`;
  } else if (slot === 'face') {
    const f = fillFor(c, P);
    defs += f.defs;
    let print = '';
    if (c.pat === 'skull') {
      print = `<path d="M32 46 Q50 40 68 46 L66 60 Q50 66 34 60 Z" fill="none" stroke="${c.patA}" stroke-width="2"/>`
        + Array.from({ length: 7 }, (_, i) => `<rect x="${35 + i * 4.4}" y="${50 + Math.abs(i - 3) * 0.6}" width="3.2" height="7" rx="1" fill="${c.patA}"/>`).join('')
        + `<path d="M28 68 Q50 76 72 68" stroke="${c.patA}" stroke-width="2" fill="none"/><path d="M36 72 L38 80 M44 74 L45 82 M56 74 L55 82 M64 72 L62 80" stroke="${c.patA}" stroke-width="2"/>`;
    }
    const balaclava = item.model?.ref === 'balaclava';
    body = `${balaclava ? `<path d="M22 34 Q20 6 50 6 Q80 6 78 34 Z" fill="${f.fill}" ${outline}/>` : ''}<path d="${shape}" fill="${f.fill}" ${outline}/>${print}
      <path d="M24 30 Q50 22 76 30 L76 36 Q50 28 24 36 Z" fill="rgba(0,0,0,.25)"/>`;
  }
  return wrap(body, defs);
}

function gear(item) {
  const type = item.slot === 'board' ? 'snowboard' : 'ski';
  const spec = getEquipmentSpec(type, item.model?.ref);
  const g = spec.graphic;
  const P = `ca${++uid}`;
  const top = hex(g.top), top2 = hex(g.top2), acc = hex(g.accent), edge = hex(g.edge), base = hex(g.base);
  const special = { gold: 'metallic', chrome: 'chrome', holo: 'iridescent' }[g.pattern];
  const fills = {
    stripe: `<linearGradient id="${P}t" x1="0" y1="0" x2="1" y2="0"><stop offset=".3" stop-color="${top}"/><stop offset=".3" stop-color="${top2}"/><stop offset=".7" stop-color="${top2}"/><stop offset=".7" stop-color="${top}"/></linearGradient>`,
    fade: `<linearGradient id="${P}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top2}"/><stop offset="1" stop-color="${top}"/></linearGradient>`,
    chevron: `<pattern id="${P}t" width="20" height="14" patternUnits="userSpaceOnUse"><rect width="20" height="14" fill="${top}"/><path d="M0 14 L10 4 L20 14" stroke="${top2}" stroke-width="4" fill="none"/></pattern>`,
    split: `<linearGradient id="${P}t" x1="0" y1="0" x2="1" y2="0"><stop offset=".5" stop-color="${top}"/><stop offset=".5" stop-color="${top2}"/></linearGradient>`,
    gold: `<linearGradient id="${P}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c4"/><stop offset=".3" stop-color="${top}"/><stop offset=".55" stop-color="${top2}"/><stop offset=".8" stop-color="#ffe9a0"/><stop offset="1" stop-color="${top2}"/></linearGradient>`,
    chrome: `<linearGradient id="${P}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="${top2}"/><stop offset=".5" stop-color="#2a2f36"/><stop offset=".62" stop-color="#e8f2ff"/><stop offset="1" stop-color="${top2}"/></linearGradient>`,
    holo: `<linearGradient id="${P}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff9df0"/><stop offset=".25" stop-color="#fff36a"/><stop offset=".5" stop-color="#7dffc8"/><stop offset=".75" stop-color="#7ab8ff"/><stop offset="1" stop-color="#c79bff"/></linearGradient>`,
    inferno: `<linearGradient id="${P}t" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffe36a"/><stop offset=".25" stop-color="${top2}"/><stop offset=".55" stop-color="#7a1606"/><stop offset="1" stop-color="${top}"/></linearGradient>`,
    galaxy: `<radialGradient id="${P}t" cx=".5" cy=".4" r=".8"><stop offset="0" stop-color="${top2}"/><stop offset=".5" stop-color="${top}"/><stop offset="1" stop-color="#000010"/></radialGradient>`,
    aurora: `<linearGradient id="${P}t" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${top}"/><stop offset=".35" stop-color="${top2}"/><stop offset=".6" stop-color="${acc}"/><stop offset="1" stop-color="${top}"/></linearGradient>`,
  };
  const defs = fills[g.pattern] || `<linearGradient id="${P}t"><stop offset="0" stop-color="${top}"/></linearGradient>`;
  const sparkle = g.pattern === 'galaxy' ? [[46, 30], [54, 52], [48, 70], [52, 20]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.1" fill="#fff"/>`).join('') : '';
  const flame = g.pattern === 'inferno' ? '<path d="M44 92 Q42 74 48 66 Q46 78 52 70 Q50 82 56 76 Q58 86 56 92 Z" fill="#ffd23a" opacity=".9"/>' : '';
  const plank = (x, rot, w) => `<g transform="rotate(${rot} 50 50) translate(${x} 0)">
      <rect x="${50 - w / 2}" y="8" width="${w}" height="84" rx="${w / 2}" fill="${base}" stroke="${edge}" stroke-width="1.6"/>
      <rect x="${50 - w / 2 + 2}" y="10" width="${w - 4}" height="80" rx="${w / 2 - 2}" fill="url(#${P}t)"/>
      ${sparkle}${flame}<rect x="${50 - w / 2 + 2}" y="47" width="${w - 4}" height="3" fill="${acc}" opacity=".8"/></g>`;
  const body = type === 'ski' ? plank(-9, -14, 13) + plank(9, -14, 13) : plank(0, -32, 26);
  return wrap(body, defs, special ? ' data-finish="1"' : '');
}

export function itemArt(item, variant) {
  if (!item) return goldArt();
  if (item.slot === 'skis' || item.slot === 'board') return gear(item);
  if (SHAPES[item.slot] || item.slot === 'goggles') return clothing(item, variant);
  return wrap('<circle cx="50" cy="50" r="30" fill="#888"/>');
}

/** The anonymous gold card: a ★ on gold, CS:GO's "Rare Special Item". */
export function goldArt() {
  const P = `ca${++uid}`;
  return wrap(`<circle cx="50" cy="50" r="34" fill="url(#${P}g)" opacity=".55"/>
    <path d="M50 16 L59 39 L84 40 L64 55 L71 80 L50 66 L29 80 L36 55 L16 40 L41 39 Z" fill="url(#${P}s)" stroke="#7a5410" stroke-width="2" stroke-linejoin="round"/>`,
  `<radialGradient id="${P}g"><stop offset="0" stop-color="#fff2b0"/><stop offset="1" stop-color="#e4ae39" stop-opacity="0"/></radialGradient>
   <linearGradient id="${P}s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6c8"/><stop offset=".5" stop-color="#ffd24a"/><stop offset="1" stop-color="#b8801a"/></linearGradient>`);
}
