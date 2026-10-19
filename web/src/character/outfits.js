// Outfit data: garment cuts and colourways. Pure data (no three.js), so the item catalog
// (profile/catalog.js) and node tests can read it.
//
// A rider's outfit is six catalog slots: jacket, pants, helmet, goggles, gloves, face (gaiter / mask). Each catalog item
// points at a garment here (item.model = { kind: 'outfit', ref: '<garment id>' }) and each item
// variant is a colourway (variant.colors = the slot's colours below). To add an item: add a garment
// entry (or reuse one) and register a catalog item for it; to add a colourway: add an entry to
// COLORWAYS. docs/character.md walks through both.

/**
 * Jacket fits: the silhouette families every jacket cut starts from (docs/character.md, "Fits").
 * Research and the numbers behind them: docs/character.md § Research. All lengths are metres in the
 * bind pose (1.8 m rider, feet at 0: hip joint 0.97, crotch ~0.86, knee 0.54).
 *
 *   hemFront / hemBack  hem height at the centre front / back (back lower = dropped tail)
 *   hemFlare            outward (+) or inward (−, a rib or drawcord pulling in) shaping of the last 12 cm
 *   torso               target cross-section of the shell below the yoke: [half width, front depth,
 *                       back depth] from the body's centre line at the chest (1.38), the waist (1.12) and
 *                       the hem, plus n = superellipse exponent (2 round … 3 boxy). The shell never comes
 *                       closer to the (shrunk) skin than `minEase`, so a target smaller than the body only
 *                       means "follow the body".
 *   shoulder            how far the shell stands off the shoulders / yoke (close on every modern cut)
 *   sleeve              target sleeve radius at the upper arm (|x| 0.30), elbow (0.46), forearm (0.58)
 *                       and cuff (sleeveEnd − 0.03); sleeveEnd = |x| of the cuff in the T-pose (wrist 0.706)
 *   collarTop/Ease      collar height (zipped to the chin) and stand-off from the neck
 *   hood                'down' (stowed roll, hoodRoll = [thickness, height]) | 'up' (over the helmet) |
 *                       'hoodie' (soft cotton hood lying on the back) | 'none'
 *   folds               drape / fold amplitude (1 = a 3-layer shell; quilted puffers ~0.3, cotton 1.3)
 *   quilt               { pitch, depth } horizontal baffles (puffers), null for flat fabric
 *   kangaroo            bulge of a front kangaroo pocket (anorak, hoodie), 0 for none
 *   style               shader layout of the fit: 0 shell, 1 anorak, 2 puffer, 3 hoodie, 4 one-piece
 */
export const FITS = {
  // Slim technical shell (Rush / lofoten class): close shoulders, follows the taper, hem over the seat.
  shell: {
    style: 0, hemFront: 0.935, hemBack: 0.915, hemFlare: 0.002,
    torso: { chest: [0.222, 0.15, 0.158], waist: [0.218, 0.146, 0.158], hem: [0.226, 0.15, 0.164], n: 2.4 },
    shoulder: 0.004, sleeve: { upper: 0.068, elbow: 0.066, forearm: 0.063, cuff: 0.06 }, sleeveEnd: 0.69,
    collarTop: 1.628, collarEase: 0.016, hood: 'down', hoodRoll: [0.034, 0.05, 0.045], gaiter: true, gaiterTop: 1.69,
    folds: 0.75, quilt: null, kangaroo: 0,
  },
  // Relaxed freeride shell (Sabre class): roomy through chest, waist and hip but hanging straight from the
  // chest and shoulder blades, close at the shoulders, a slight drop tail below the seat.
  relaxed: {
    style: 0, hemFront: 0.905, hemBack: 0.88, hemFlare: 0.0,
    torso: { chest: [0.232, 0.158, 0.164], waist: [0.238, 0.16, 0.168], hem: [0.25, 0.168, 0.178], n: 2.4 },
    shoulder: 0.005, sleeve: { upper: 0.075, elbow: 0.074, forearm: 0.071, cuff: 0.066 }, sleeveEnd: 0.695,
    collarTop: 1.628, collarEase: 0.02, hood: 'down', hoodRoll: [0.044, 0.068, 0.065], gaiter: true, gaiterTop: 1.69,
    folds: 1, quilt: null, kangaroo: 0,
  },
  // New-school anorak (relaxed anorak / long pullover class): long and loose, half zip, kangaroo pocket.
  anorak: {
    style: 1, hemFront: 0.855, hemBack: 0.835, hemFlare: 0.0,
    torso: { chest: [0.236, 0.164, 0.168], waist: [0.246, 0.168, 0.174], hem: [0.262, 0.178, 0.188], n: 2.35 },
    shoulder: 0.006, sleeve: { upper: 0.079, elbow: 0.078, forearm: 0.075, cuff: 0.07 }, sleeveEnd: 0.7,
    collarTop: 1.628, collarEase: 0.02, hood: 'down', hoodRoll: [0.048, 0.072, 0.075], gaiter: true, gaiterTop: 1.69,
    folds: 1.2, quilt: null, kangaroo: 0.012,
  },
  // Insulated puffer: the one cut that is meant to be round. Wide baffles, hem cinched at the hip.
  puffer: {
    style: 2, hemFront: 0.95, hemBack: 0.945, hemFlare: -0.014,
    torso: { chest: [0.25, 0.172, 0.174], waist: [0.248, 0.17, 0.174], hem: [0.238, 0.164, 0.17], n: 2.1 },
    shoulder: 0.012, sleeve: { upper: 0.079, elbow: 0.077, forearm: 0.073, cuff: 0.06 }, sleeveEnd: 0.69,
    collarTop: 1.632, collarEase: 0.028, hood: 'none', hoodRoll: null, gaiter: true, gaiterTop: 1.69,
    folds: 0.3, quilt: { pitch: 0.105, depth: 0.012 }, kangaroo: 0,
  },
  // Tall hoodie worn over a shell: soft cotton, ribbed hem blousing at the hip, the shell's collar out the top.
  hoodie: {
    style: 3, hemFront: 0.875, hemBack: 0.86, hemFlare: -0.016,
    torso: { chest: [0.236, 0.16, 0.164], waist: [0.246, 0.164, 0.17], hem: [0.244, 0.162, 0.17], n: 2.3 },
    shoulder: 0.006, sleeve: { upper: 0.077, elbow: 0.076, forearm: 0.073, cuff: 0.062 }, sleeveEnd: 0.695,
    collarTop: 1.622, collarEase: 0.016, hood: 'hoodie', hoodRoll: null, gaiter: true, gaiterTop: 1.69,
    folds: 1.3, quilt: null, kangaroo: 0.01,
  },
  // 90s one-piece: fitted top over the hem belt (the pants take the suit's colours).
  suit: {
    style: 4, hemFront: 0.93, hemBack: 0.93, hemFlare: 0.0, seatClear: 0.022,
    torso: { chest: [0.23, 0.152, 0.162], waist: [0.22, 0.146, 0.158], hem: [0.226, 0.149, 0.162], n: 2.4 },
    shoulder: 0.004, sleeve: { upper: 0.07, elbow: 0.068, forearm: 0.065, cuff: 0.06 }, sleeveEnd: 0.69,
    collarTop: 1.628, collarEase: 0.018, hood: 'down', hoodRoll: [0.03, 0.045, 0.04], gaiter: true, gaiterTop: 1.69,
    folds: 0.8, quilt: null, kangaroo: 0,
  },
};
export const FIT_STYLE = Object.fromEntries(Object.entries(FITS).map(([k, f]) => [k, f.style]));

/** A jacket cut: a fit plus overrides (deep-merged one level for torso / sleeve). */
export function jacketCut(fit, over = {}) {
  const f = FITS[fit];
  return { ...f, ...over, fit, torso: { ...f.torso, ...over.torso }, sleeve: { ...f.sleeve, ...over.sleeve } };
}

/**
 * Pant fits (docs/character.md, "Pants"). Real snow pants from the waist down (the jackets end at the
 * hip, so the seat and the top of the thighs show):
 *   rise     height of the waistband (the trunk runs from here down to the crotch)
 *   crotch   crotch height (lower = a dropped crotch, the baggy look)
 *   seat     the trunk's superellipse { waist, hip } = [half width, front depth, back depth] at the waist
 *            (rise) and the hips (0.93) around the body's mid-line; each leg is its half of it
 *   leg      target leg radius { thigh, knee, hem } (never closer than a little ease to the leg)
 *   cuffY    hem height over the boot; stack = stacked folds above the boot { y0, y1, n, amp }
 *   bib      a bib's chest piece under the jacket: { front, back } top heights (null = plain pants)
 */
export const PANT_FITS = {
  // Relaxed bib: roomy seat and thigh, straight leg, a gentle break over the boot.
  relaxed: { rise: 1.1, bib: { front: 1.36, back: 1.3 }, crotch: 0.83, seat: { waist: [0.2, 0.15, 0.152], hip: [0.236, 0.148, 0.18] }, leg: { thigh: 0.128, knee: 0.116, hem: 0.112 }, cuffY: 0.11, stack: { y0: 0.12, y1: 0.3, n: 3, amp: 0.014 } },
  // Relaxed tapered pant: roomy seat and thigh, narrowing to the boot.
  tapered: { rise: 1.08, crotch: 0.835, seat: { waist: [0.198, 0.148, 0.15], hip: [0.232, 0.146, 0.176] }, leg: { thigh: 0.124, knee: 0.104, hem: 0.094 }, cuffY: 0.14, stack: { y0: 0.15, y1: 0.28, n: 2, amp: 0.011 } },
  // Wide new-school pant: dropped crotch, wide straight leg, a long inseam stacking over the boot.
  baggy: { rise: 1.08, crotch: 0.8, seat: { waist: [0.204, 0.152, 0.155], hip: [0.246, 0.156, 0.188] }, leg: { thigh: 0.138, knee: 0.132, hem: 0.13 }, cuffY: 0.09, stack: { y0: 0.1, y1: 0.33, n: 4, amp: 0.016 } },
};

/** Garment shapes, per slot. Lengths are metres in the rider's bind pose (1.8 m tall, feet at 0). */
export const GARMENTS = {
  jacket: {
    'tuff-shell': {
      name: 'Tuff Shell',
      blurb: 'Relaxed 3-layer freeride shell: hangs straight from the chest, drop tail below the seat, stowed hood.',
      cut: jacketCut('relaxed'),
    },
    'storm-shell': {
      name: 'Tuff Shell, hood up',
      blurb: 'The same relaxed shell with its helmet-compatible hood pulled up over the lid.',
      cut: jacketCut('relaxed', { hood: 'up' }),
    },
    // Reward cuts (profile/items.js). The one-piece's colours dress the pants too (resolveOutfit).
    'retro-suit': {
      name: 'Retro One-Piece', blurb: 'A 90s one-piece suit with a hem belt and colour-blocked sleeves.',
      cut: jacketCut('suit'),
    },
    'ridge-shell': {
      name: 'Ridge Shell', blurb: 'Slim technical hardshell: close at the shoulders, articulated sleeves, hem over the seat.',
      cut: jacketCut('shell'),
    },
    'tall-anorak': {
      name: 'Tall Anorak', blurb: 'Long new-school pullover: half zip, kangaroo pocket, cut loose to mid-thigh.',
      cut: jacketCut('anorak'),
    },
    'cloud-puffer': {
      name: 'Cloud Puffer', blurb: 'Insulated puffer with wide baffles and a high quilted collar, cinched at the hip.',
      cut: jacketCut('puffer'),
    },
    'layer-hoodie': {
      name: 'Layer Hoodie', blurb: 'Tall cotton hoodie over a shell: ribbed hem, kangaroo pocket, the shell collar out the top.',
      cut: jacketCut('hoodie'),
    },
  },
  pants: {
    'tuff-bib': {
      name: 'Tuff Bib',
      blurb: 'Relaxed straight-leg bib that stacks over the boots, reinforced cuffs.',
      cut: { ...PANT_FITS.relaxed, fit: 'relaxed' },
    },
    'cargo-pant': {
      name: 'Cargo Pant', blurb: 'Relaxed cargo pant tapering to the boot.',
      cut: { ...PANT_FITS.tapered, fit: 'tapered' },
    },
    'wide-pant': {
      name: 'Wide Pant', blurb: 'Wide new-school pant: straight leg, long inseam stacking over the boot.',
      cut: { ...PANT_FITS.baggy, fit: 'baggy' },
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
      cut: { mittLength: 0.835, gauntlet: [0.618, 0.008] },   // fist end |x| (wrist 0.706), gauntlet start |x| + clearance over the sleeve at its open end
    },
    'pipe-glove': {
      name: 'Pipe Glove', blurb: 'Short-cuff park glove.',
      cut: { mittLength: 0.835, gauntlet: [0.64, 0.005] },
    },
  },
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
