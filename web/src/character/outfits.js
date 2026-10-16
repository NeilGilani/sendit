// Outfit data: garment cuts and colourways. Pure data (no three.js), so the item catalog
// (profile/catalog.js) and node tests can read it.
//
// A rider's outfit is five catalog slots: jacket, pants, helmet, goggles, gloves. Each catalog item
// points at a garment here (item.model = { kind: 'outfit', ref: '<garment id>' }) and each item
// variant is a colourway (variant.colors = the slot's colours below). To add an item: add a garment
// entry (or reuse one) and register a catalog item for it; to add a colourway: add an entry to
// COLORWAYS. docs/character.md walks through both.

/** Garment shapes, per slot. Lengths are metres in the rider's bind pose (1.8 m tall, feet at 0). */
export const GARMENTS = {
  jacket: {
    'tuff-shell': {
      name: 'Tuff Shell',
      blurb: 'Long, roomy 3-layer freeride shell: dropped back hem, high collar, stowed hood.',
      cut: {
        hemFront: 0.68, hemBack: 0.64,            // mid-thigh, the back drops 4 cm
        jacketEase: { shoulder: 0.016, chest: 0.036, hem: 0.062 },   // how far the shell stands off the skin
        sleeveEase: { upper: 0.012, elbow: 0.026, forearm: 0.022 },
        sleeveEnd: 0.69,                           // |x| of the cuff in the T-pose (wrist at 0.706)
        collarTop: 1.628,                          // zipped up under the jaw
        hood: 'down',                              // 'down' = thick roll behind the neck
        gaiter: true, gaiterTop: 1.69,            // fleece gaiter pulled up under the goggle
      },
    },
    'storm-shell': {
      name: 'Tuff Shell, hood up',
      blurb: 'The same long shell with its helmet-compatible hood pulled up over the lid.',
      cut: null,                                   // filled in below: tuff-shell with the hood up
    },
  },
  pants: {
    'tuff-bib': {
      name: 'Tuff Bib',
      blurb: 'Wide straight-leg bib that stacks over the boots, reinforced cuffs.',
      cut: {
        pantsEase: { thigh: 0.036, knee: 0.042, cuff: 0.048 },
        cuffY: 0.15,                               // hem height over the boot (to the lower buckles)
        stack: { y0: 0.17, y1: 0.33, n: 3, amp: 0.016 },   // stacked folds above the boot
      },
    },
  },
  helmet: {
    'tuff-helmet': {
      name: 'Tuff Helmet',
      blurb: 'Low-profile matte shell, brim flush with the goggle, crown slots.',
      shape: { width: 0.238, front: 0.13, back: 0.142, top: 0.026, brim: 0.011, vents: 6 },
    },
  },
  goggles: {
    'tuff-goggle': {
      name: 'Tuff Goggle',
      blurb: 'Big frameless toric lens on a wide silicone strap.',
      shape: { width: 0.19, height: 0.098, radius: 0.112 },
    },
  },
  gloves: {
    'tuff-mitt': {
      name: 'Tuff Mitt',
      blurb: 'Leather mitts with long nylon gauntlets over the cuffs.',
      cut: { mittLength: 0.835, gauntlet: [0.618, 0.032] },   // fist end |x| (wrist 0.706), gauntlet start |x| + ease at its open end
    },
  },
};

GARMENTS.jacket['storm-shell'].cut = { ...GARMENTS.jacket['tuff-shell'].cut, hood: 'up' };

/**
 * Colourways. Each slot's colours are what a catalog variant carries in `colors`:
 *   jacket:  base (body), panel (yoke / side panels / hood), accent (zips, logo, lining), gaiter, style
 *   pants:   base, cuff (reinforced hem band + kick patch)
 *   helmet:  base (shell), liner (lip, ear pads), accent (small logo)
 *   goggles: lens (mirror tint), lensBase (dark tint behind the mirror), strap, strapLogo
 *   gloves:  base (leather), cuff (gauntlet)
 * `style` picks the jacket's panel layout: 0 = yoke + side panels, 1 = colour-blocked sleeves.
 */
export const COLORWAYS = {
  tuff: {
    name: 'Tuff', blurb: 'Olive, tan and carob with one blaze-orange accent.',
    jacket: { base: '#5e5f45', panel: '#b9a27a', accent: '#ff5b14', gaiter: '#4a473f', style: 0 },
    pants: { base: '#3a3129', cuff: '#231d18' },
    helmet: { base: '#3a3c39', liner: '#171819', accent: '#ff5b14' },
    goggles: { lens: '#f2a23a', lensBase: '#b9471e', strap: '#1d1d1b', strapLogo: '#cfc6b2' },
    gloves: { base: '#9c6f45', cuff: '#1c1c1b' },
  },
  nightshift: {
    name: 'Nightshift', blurb: 'All black, tonal panels, an acid-mint lens.',
    jacket: { base: '#25272b', panel: '#3b3f45', accent: '#2bf0c8', gaiter: '#34373c', style: 0 },
    pants: { base: '#1d1f22', cuff: '#0e0f11' },
    helmet: { base: '#24262a', liner: '#0f1012', accent: '#2bf0c8' },
    goggles: { lens: '#2bf0c8', lensBase: '#0e5e52', strap: '#0b0b0c', strapLogo: '#2bf0c8' },
    gloves: { base: '#1e1e1e', cuff: '#111112' },
  },
  arcade: {
    name: 'Arcade', blurb: 'Retro park: teal and magenta over wide cream pants.',
    jacket: { base: '#14a39a', panel: '#e83e8c', accent: '#ffd23f', gaiter: '#e83e8c', style: 1 },
    pants: { base: '#e8e0c8', cuff: '#b9af96' },
    helmet: { base: '#efece4', liner: '#2a2a2c', accent: '#14a39a' },
    goggles: { lens: '#9b4dff', lensBase: '#3b1a75', strap: '#14a39a', strapLogo: '#ffd23f' },
    gloves: { base: '#ffd23f', cuff: '#1f1f22' },
  },
  summit: {
    name: 'Summit Crew', blurb: 'Pro-team two-tone: brick red over black, white helmet.',
    jacket: { base: '#a3261c', panel: '#1b1e23', accent: '#f2efe6', gaiter: '#1b1e23', style: 1 },
    pants: { base: '#1b1e23', cuff: '#0e1013' },
    helmet: { base: '#efece4', liner: '#1b1e23', accent: '#a3261c' },
    goggles: { lens: '#2f7be0', lensBase: '#123766', strap: '#a3261c', strapLogo: '#f2efe6' },
    gloves: { base: '#2a2522', cuff: '#141517' },
  },
};

export const DEFAULT_COLORWAY = 'tuff';

/** The garment each outfit slot uses when nothing is equipped (and for fresh profiles). */
export const DEFAULT_GARMENTS = { jacket: 'tuff-shell', pants: 'tuff-bib', helmet: 'tuff-helmet', goggles: 'tuff-goggle', gloves: 'tuff-mitt' };

export const OUTFIT_SLOTS = ['jacket', 'pants', 'helmet', 'goggles', 'gloves'];

/**
 * Resolve a loadout into what the renderer needs: { garments: {slot: garment}, colors: {slot: colours} }.
 * `slots` = { jacket: { garment, colorway | colors }, … } (missing parts fall back to the defaults).
 */
export function resolveOutfit(slots = {}) {
  const garments = {}, colors = {};
  for (const slot of OUTFIT_SLOTS) {
    const s = slots[slot] || {};
    const gid = GARMENTS[slot][s.garment] ? s.garment : DEFAULT_GARMENTS[slot];
    garments[slot] = { id: gid, ...GARMENTS[slot][gid] };
    const cw = COLORWAYS[s.colorway] || COLORWAYS[DEFAULT_COLORWAY];
    colors[slot] = { ...cw[slot], ...(s.colors || {}) };
  }
  return { garments, colors };
}

/** A whole colourway as slot selections (the lobby's quick picker). */
export const colorwaySlots = (id) => Object.fromEntries(OUTFIT_SLOTS.map((slot) => [slot, { garment: DEFAULT_GARMENTS[slot], colorway: id }]));
