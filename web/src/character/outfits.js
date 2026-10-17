// Outfit data: garment cuts and colourways. Pure data (no three.js), so the item catalog
// (profile/catalog.js) and node tests can read it.
//
// A rider's outfit is six catalog slots: jacket, pants, helmet, goggles, gloves, face (gaiter / mask). Each catalog item
// points at a garment here (item.model = { kind: 'outfit', ref: '<garment id>' }) and each item
// variant is a colourway (variant.colors = the slot's colours below). To add an item: add a garment
// entry (or reuse one) and register a catalog item for it; to add a colourway: add an entry to
// COLORWAYS. docs/character.md walks through both.

/** Garment shapes, per slot. Lengths are metres in the rider's bind pose (1.8 m tall, feet at 0). */
export const GARMENTS = {
  jacket: {
    'tuff-shell': {
      name: 'Tuff Shell',
      blurb: 'Roomy 3-layer freeride shell to the upper thigh: straight hem, high collar, stowed hood.',
      cut: {
        // Length: the hem's height above the ground (hip joint 0.97, crotch ~0.86, knee 0.54). A level
        // hem at the upper thigh and seat: a lower back (dropped tail) read as a dress from the chase cam.
        // hemBack < hemFront drops the back, > lifts it. hemFlare = outward flare over the last 12 cm.
        hemFront: 0.84, hemBack: 0.84, hemFlare: 0.006,
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
      blurb: 'The same roomy shell with its helmet-compatible hood pulled up over the lid.',
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
  face: {
    // The face piece is the tube pulled up under the goggle (built with the jacket, garments.js). A face
    // item only changes its look: colours and print (skull jaw, camo, flames…), see FACE colours below.
    'tuff-gaiter': { name: 'Neck Gaiter', blurb: 'Fleece tube pulled up to the goggle.' },
    'balaclava': { name: 'Balaclava', blurb: 'Full knit hood under the helmet, only the goggle shows.' },
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

// Reward cuts (profile/items.js). The one-piece is the shell cut a little closer; its colours dress
// the pants too (resolveOutfit). The cargo pant and pipe glove are slimmer versions of the defaults.
GARMENTS.jacket['retro-suit'] = {
  name: 'Retro One-Piece', blurb: 'A 90s one-piece suit with a hem belt and colour-blocked sleeves.',
  cut: { ...GARMENTS.jacket['tuff-shell'].cut, jacketEase: { shoulder: 0.014, chest: 0.03, hem: 0.05 } },
};
GARMENTS.pants['cargo-pant'] = {
  name: 'Cargo Pant', blurb: 'Relaxed cargo pant with a slimmer leg.',
  cut: { ...GARMENTS.pants['tuff-bib'].cut, pantsEase: { thigh: 0.03, knee: 0.034, cuff: 0.04 } },
};
GARMENTS.gloves['pipe-glove'] = {
  name: 'Pipe Glove', blurb: 'Short-cuff park glove.',
  cut: { ...GARMENTS.gloves['tuff-mitt'].cut, gauntlet: [0.64, 0.024] },
};

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
  // The plain starter skin every new rider owns: rental-shop grey, no accents, a smoke lens.
  basic: {
    name: 'Rental', blurb: 'Plain grey rental kit. Earn cases to get something better.',
    jacket: { base: '#5d6266', panel: '#55595d', accent: '#6c7175', gaiter: '#3b3e41', style: 0 },
    pants: { base: '#2f3134', cuff: '#26282a' },
    helmet: { base: '#c9c9c4', liner: '#2a2b2d', accent: '#9a9b98' },
    goggles: { lens: '#8a8f96', lensBase: '#3a3d42', strap: '#2a2b2d', strapLogo: '#5a5c5f' },
    gloves: { base: '#2c2d2f', cuff: '#202122' },
    face: { base: '#3b3e41', pat: 'none' },
  },
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
    pants: { base: '#33363b', cuff: '#141517' },
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

// Every colourway also dresses the face slot in its gaiter colour.
for (const cw of Object.values(COLORWAYS)) cw.face ??= { base: cw.jacket.gaiter, pat: 'topo' };

export const DEFAULT_COLORWAY = 'basic';

/** The garment each outfit slot uses when nothing is equipped (and for fresh profiles). */
export const DEFAULT_GARMENTS = { jacket: 'tuff-shell', pants: 'tuff-bib', helmet: 'tuff-helmet', goggles: 'tuff-goggle', gloves: 'tuff-mitt', face: 'tuff-gaiter' };

export const OUTFIT_SLOTS = ['jacket', 'pants', 'helmet', 'goggles', 'gloves', 'face'];

/**
 * Prints and finishes a colour set may carry (reward skins, profile/items.js). The shaders
 * (materials.js) read them as numbers:
 *   pat     print on the piece: jacket + sleeves + hood, pants, gaiter (face) or mitts
 *   patA/B  the print's two colours, patScale its size (1 = default)
 *   finish  fabric: matte | metallic | reflective | iridescent | neon (accent glows) | gloss
 *           helmet: matte | gloss | metallic | chrome | carbon | pearl
 *   decal   helmet decal: stripe | flames | stars | checker | bolt | tiger, decalCol its colour
 *   frame   goggle frame (gasket) colour, iri 0..1 lens rainbow shift
 *   onePiece (jacket) the pants take the suit's colours and print: a retro one-piece
 */
export const PATTERNS = {
  none: 0, camo: 1, digital: 2, stripes: 3, band: 4, diagonal: 5, zigzag: 6, checker: 7, fade: 8,
  flames: 9, tiedye: 10, topo: 11, skull: 12, stars: 13, tiger: 14, splatter: 15,
};
export const FINISHES = { matte: 0, metallic: 1, reflective: 2, iridescent: 3, neon: 4, gloss: 5, chrome: 6, carbon: 7, pearl: 8 };
export const DECALS = { none: 0, stripe: 1, flames: 2, stars: 3, checker: 4, bolt: 5, tiger: 6 };

/**
 * Resolve a loadout into what the renderer needs: { garments: {slot: garment}, colors: {slot: colours} }.
 * `slots` = { jacket: { garment, colorway | colors }, … } (missing parts fall back to the defaults).
 */
export function resolveOutfit(slots = {}) {
  const garments = {}, colors = {};
  for (const slot of OUTFIT_SLOTS) {
    // No face piece given (an outfit from before the face slot): it follows the jacket's colourway.
    const s = slots[slot] || (slot === 'face' && slots.jacket?.colorway ? { colorway: slots.jacket.colorway } : {});
    const gid = GARMENTS[slot][s.garment] ? s.garment : DEFAULT_GARMENTS[slot];
    garments[slot] = { id: gid, ...GARMENTS[slot][gid] };
    const cw = COLORWAYS[s.colorway] || COLORWAYS[DEFAULT_COLORWAY];
    colors[slot] = { ...cw[slot], ...(s.colors || {}) };
  }
  // A one-piece suit dresses the legs too: the pants take its colours and print.
  const j = colors.jacket;
  if (j.onePiece) colors.pants = { ...colors.pants, base: j.base, cuff: j.panel, pat: j.pat, patA: j.patA, patB: j.patB, patScale: j.patScale, finish: j.finish };
  return { garments, colors };
}

/** A whole colourway as slot selections (the lobby's quick picker). */
export const colorwaySlots = (id) => Object.fromEntries(OUTFIT_SLOTS.map((slot) => [slot, { garment: DEFAULT_GARMENTS[slot], colorway: id }]));
