// Reward items: every clothing skin and piece of gear you can pull from a case (docs/rewards.md).
//
// Pure data, read by profile/catalog.js (which registers the items) and profile/rewards.js (which
// builds the case pools). A catalog item is a garment or a gear model; each of its variants is one
// skin, named CS:GO style "Item | Skin". A variant carries:
//   rarity   common | uncommon | rare | epic | legendary | gold   (profile/rarity.js)
//   series   which case it drops from ('first-chair', 'night-park'; gold items drop from every case)
//   starter  true = every rider owns it (the plain Rental kit and the stock skis / board)
//   colors   the slot's colours and look (character/outfits.js COLORWAYS, PATTERNS, FINISHES)
// Variant ids that match a COLORWAYS key reuse that colourway; other ids lay their colours over the
// plain Rental colourway, so a skin only lists what it changes.
import { COLORWAYS } from '../character/outfits.js';

const NW = 'Northwake';
const cw = (id, slot) => ({ ...COLORWAYS[id][slot] });

// ------------------------------------------------------------------ clothing
// [garment item] → { slot, garment, name, variants: [...] }
export const CLOTHING_ITEMS = [
  {
    id: 'jacket-tuff-shell', slot: 'jacket', garment: 'tuff-shell', name: 'Tuff Shell', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'jacket') },
      { id: 'tuff', name: 'Tuff', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'jacket') },
      { id: 'nightshift', name: 'Nightshift', rarity: 'common', series: 'first-chair', colors: cw('nightshift', 'jacket') },
      { id: 'summit', name: 'Summit Crew', rarity: 'uncommon', series: 'first-chair', colors: cw('summit', 'jacket') },
      { id: 'arcade', name: 'Arcade', rarity: 'uncommon', series: 'night-park', colors: cw('arcade', 'jacket') },
      { id: 'woodland', name: 'Woodland', rarity: 'rare', series: 'first-chair',
        colors: { base: '#4d5a36', panel: '#3c4530', accent: '#d8c9a0', gaiter: '#3c4530', style: 0, pat: 'camo', patA: '#2b2a1f', patB: '#8a7650', patScale: 1 } },
      { id: 'heritage', name: 'Heritage', rarity: 'epic', series: 'first-chair',
        colors: { base: '#efe6d2', panel: '#c8392b', accent: '#f2a03a', gaiter: '#7a2a20', style: 1, pat: 'band', patA: '#c8392b', patB: '#f2a03a', finish: 'matte' } },
      { id: 'reflective', name: 'Flashbulb', rarity: 'epic', series: 'night-park',
        colors: { base: '#9aa1a8', panel: '#6f767d', accent: '#ff3d6e', gaiter: '#2a2c30', style: 0, finish: 'reflective' } },
      { id: 'gold-lame', name: 'Gold Lamé', rarity: 'legendary', series: 'first-chair',
        colors: { base: '#c9962e', panel: '#8a6418', accent: '#fff2c4', gaiter: '#3a2a10', style: 1, finish: 'metallic' } },
    ],
  },
  {
    id: 'jacket-tuff-shell-hood', slot: 'jacket', garment: 'storm-shell', name: 'Storm Hood', unlock: 'case',
    variants: [
      { id: 'tuff', name: 'Tuff', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'jacket') },
      { id: 'nightshift', name: 'Nightshift', rarity: 'common', series: 'night-park', colors: cw('nightshift', 'jacket') },
      { id: 'summit', name: 'Summit Crew', rarity: 'uncommon', series: 'first-chair', colors: cw('summit', 'jacket') },
      { id: 'arcade', name: 'Arcade', rarity: 'uncommon', series: 'night-park', colors: cw('arcade', 'jacket') },
      { id: 'blaze', name: 'Blaze', rarity: 'rare', series: 'first-chair',
        colors: { base: '#1d1e22', panel: '#ff5b14', accent: '#ffd23f', gaiter: '#1d1e22', style: 0, pat: 'diagonal', patA: '#ff5b14', patB: '#1d1e22' } },
      { id: 'neon-fade', name: 'Sunset Fade', rarity: 'rare', series: 'night-park',
        colors: { base: '#ff8a3d', panel: '#ff3d9a', accent: '#fff36a', gaiter: '#5a1a4a', style: 0, pat: 'fade', patA: '#ff2f92', patB: '#ffb13d' } },
      { id: 'arctic', name: 'Arctic Camo', rarity: 'epic', series: 'first-chair',
        colors: { base: '#e9eef2', panel: '#b8c3cc', accent: '#3a7bd5', gaiter: '#c9d2d9', style: 0, pat: 'digital', patA: '#9aa8b4', patB: '#5d6c7a', patScale: 1 } },
      { id: 'hologram', name: 'Hologram', rarity: 'legendary', series: 'night-park',
        colors: { base: '#c8d4ff', panel: '#e0c8ff', accent: '#5ffbf1', gaiter: '#3b2a6a', style: 0, finish: 'iridescent' } },
    ],
  },
  {
    id: 'jacket-retro-suit', slot: 'jacket', garment: 'retro-suit', name: 'Retro One-Piece', unlock: 'case',
    description: 'A 90s one-piece: the suit dresses your legs too.',
    variants: [
      { id: 'ice-cream', name: 'Ice Cream', rarity: 'epic', series: 'night-park',
        colors: { base: '#fff1d6', panel: '#ff9ec7', accent: '#7fd6ff', gaiter: '#ff9ec7', style: 1, pat: 'band', patA: '#ff9ec7', patB: '#7fd6ff', onePiece: true } },
      { id: 'miami-92', name: "Miami '92", rarity: 'legendary', series: 'first-chair',
        colors: { base: '#16c2b0', panel: '#7a3cff', accent: '#ff3fa4', gaiter: '#7a3cff', style: 1, pat: 'zigzag', patA: '#ff3fa4', patB: '#7a3cff', onePiece: true } },
      { id: 'hyperwave', name: 'Hyperwave', rarity: 'legendary', series: 'night-park',
        colors: { base: '#1b1240', panel: '#2a1a6a', accent: '#2bf0ff', gaiter: '#1b1240', style: 1, pat: 'zigzag', patA: '#ff2fd2', patB: '#2bf0ff', finish: 'neon', onePiece: true } },
    ],
  },
  {
    id: 'pants-tuff-bib', slot: 'pants', garment: 'tuff-bib', name: 'Tuff Bib', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'pants') },
      { id: 'tuff', name: 'Tuff', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'pants') },
      { id: 'nightshift', name: 'Nightshift', rarity: 'common', series: 'first-chair', colors: cw('nightshift', 'pants') },
      { id: 'summit', name: 'Summit Crew', rarity: 'uncommon', series: 'first-chair', colors: cw('summit', 'pants') },
      { id: 'arcade', name: 'Arcade', rarity: 'uncommon', series: 'night-park', colors: cw('arcade', 'pants') },
      { id: 'woodland', name: 'Woodland', rarity: 'rare', series: 'first-chair',
        colors: { base: '#4d5a36', cuff: '#2b2a1f', pat: 'camo', patA: '#2b2a1f', patB: '#8a7650' } },
    ],
  },
  {
    id: 'pants-cargo', slot: 'pants', garment: 'cargo-pant', name: 'Cargo Pant', unlock: 'case',
    variants: [
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'night-park', colors: { base: '#3a3c40', cuff: '#1f2023' } },
      { id: 'sand', name: 'Sand', rarity: 'common', series: 'night-park', colors: { base: '#c9b48a', cuff: '#8a7650' } },
      { id: 'tiedye', name: 'Tie-Dye', rarity: 'rare', series: 'night-park',
        colors: { base: '#ff6ad5', cuff: '#3b1a75', pat: 'tiedye', patA: '#2bd1ff', patB: '#fff36a' } },
      { id: 'splatter', name: 'Paintball', rarity: 'epic', series: 'night-park',
        colors: { base: '#f1f1ee', cuff: '#1d1d22', pat: 'splatter', patA: '#ff2f6d', patB: '#2bd1ff' } },
    ],
  },
  {
    id: 'helmet-tuff', slot: 'helmet', garment: 'tuff-helmet', name: 'Tuff Helmet', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'helmet') },
      { id: 'tuff', name: 'Tuff', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'helmet') },
      { id: 'nightshift', name: 'Nightshift', rarity: 'uncommon', series: 'first-chair', colors: cw('nightshift', 'helmet') },
      { id: 'summit', name: 'Summit Crew', rarity: 'uncommon', series: 'first-chair', colors: cw('summit', 'helmet') },
      { id: 'arcade', name: 'Arcade', rarity: 'common', series: 'night-park', colors: cw('arcade', 'helmet') },
      { id: 'lime', name: 'Lime Gloss', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#b6ff2e', liner: '#1a1a1a', accent: '#1a1a1a', finish: 'gloss' } },
      { id: 'racing', name: 'Racing Stripe', rarity: 'rare', series: 'first-chair',
        colors: { base: '#f4f2ec', liner: '#1b1e23', accent: '#d8242c', finish: 'gloss', decal: 'stripe', decalCol: '#d8242c' } },
      { id: 'stars', name: 'Starfield', rarity: 'rare', series: 'night-park',
        colors: { base: '#1a1f5a', liner: '#0f1030', accent: '#ffffff', finish: 'gloss', decal: 'stars', decalCol: '#ffe36a' } },
      { id: 'carbon', name: 'Carbon', rarity: 'epic', series: 'first-chair',
        colors: { base: '#1b1c1f', liner: '#0d0d0f', accent: '#e8e8e8', finish: 'carbon' } },
      { id: 'pearl', name: 'Pearl', rarity: 'epic', series: 'night-park',
        colors: { base: '#f3eef8', liner: '#2a2440', accent: '#9b8cff', finish: 'pearl' } },
      { id: 'flames', name: 'Hot Rod', rarity: 'epic', series: 'first-chair',
        colors: { base: '#141416', liner: '#0d0d0f', accent: '#ff6a1a', finish: 'gloss', decal: 'flames', decalCol: '#ff7a1a' } },
      { id: 'chrome', name: 'Chrome', rarity: 'legendary', series: 'first-chair',
        colors: { base: '#d9dde2', liner: '#15161a', accent: '#2a2c30', finish: 'chrome' } },
      { id: 'gold-chrome', name: 'Gold Chrome', rarity: 'legendary', series: 'night-park',
        colors: { base: '#e6b740', liner: '#1a1408', accent: '#fff2c4', finish: 'chrome' } },
    ],
  },
  {
    id: 'goggles-tuff', slot: 'goggles', garment: 'tuff-goggle', name: 'Tuff Goggle', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental Smoke', starter: true, colors: cw('basic', 'goggles') },
      { id: 'tuff', name: 'Amber', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'goggles') },
      { id: 'nightshift', name: 'Acid Mint', rarity: 'uncommon', series: 'first-chair', colors: cw('nightshift', 'goggles') },
      { id: 'summit', name: 'Sapphire', rarity: 'uncommon', series: 'first-chair', colors: cw('summit', 'goggles') },
      { id: 'arcade', name: 'Ultraviolet', rarity: 'common', series: 'night-park', colors: cw('arcade', 'goggles') },
      { id: 'rose-gold', name: 'Rose Gold', rarity: 'rare', series: 'first-chair',
        colors: { lens: '#ffb38a', lensBase: '#a8456a', strap: '#f2e6dc', strapLogo: '#b07a5a', frame: '#d9a38a', iri: 0.5 } },
      { id: 'toxic', name: 'Toxic', rarity: 'rare', series: 'night-park',
        colors: { lens: '#7dff3a', lensBase: '#1f6a10', strap: '#111111', strapLogo: '#7dff3a', frame: '#7dff3a', iri: 0.6 } },
      { id: 'oil-slick', name: 'Oil Slick', rarity: 'epic', series: 'first-chair',
        colors: { lens: '#6a3cff', lensBase: '#0f4f5a', strap: '#0b0b0c', strapLogo: '#9bf0ff', frame: '#1a1a1e', iri: 1 } },
      { id: 'hi-vis', name: 'Hi-Vis', rarity: 'uncommon', series: 'night-park',
        colors: { lens: '#ffd23a', lensBase: '#b9471e', strap: '#d9ff2e', strapLogo: '#111111', frame: '#d9ff2e' } },
    ],
  },
  {
    id: 'face-gaiter', slot: 'face', garment: 'tuff-gaiter', name: 'Neck Gaiter', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'face') },
      { id: 'tuff', name: 'Topo', rarity: 'common', series: 'first-chair', colors: { base: '#4a473f', pat: 'topo' } },
      { id: 'black', name: 'Blackout', rarity: 'common', series: 'night-park', colors: { base: '#18191b', pat: 'none' } },
      { id: 'checker', name: 'Checkerboard', rarity: 'uncommon', series: 'night-park', colors: { base: '#f1f1ee', pat: 'checker', patA: '#141414' } },
      { id: 'woodland', name: 'Woodland', rarity: 'uncommon', series: 'first-chair', colors: { base: '#4d5a36', pat: 'camo', patA: '#2b2a1f', patB: '#8a7650' } },
      { id: 'skull', name: 'Skull Jaw', rarity: 'epic', series: 'first-chair', colors: { base: '#151517', pat: 'skull', patA: '#e9e6dc' } },
    ],
  },
  {
    id: 'face-balaclava', slot: 'face', garment: 'balaclava', name: 'Balaclava', unlock: 'case',
    variants: [
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'night-park', colors: { base: '#2b2c2f', pat: 'none' } },
      { id: 'tiger', name: 'Tiger', rarity: 'rare', series: 'night-park', colors: { base: '#ff8a1a', pat: 'tiger', patA: '#141414' } },
      { id: 'flames', name: 'Inferno', rarity: 'epic', series: 'night-park', colors: { base: '#141416', pat: 'flames', patA: '#ff5b14', patB: '#ffd23a' } },
    ],
  },
  {
    id: 'gloves-tuff-mitt', slot: 'gloves', garment: 'tuff-mitt', name: 'Tuff Mitt', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'gloves') },
      { id: 'tuff', name: 'Tuff', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'gloves') },
      { id: 'nightshift', name: 'Nightshift', rarity: 'uncommon', series: 'first-chair', colors: cw('nightshift', 'gloves') },
      { id: 'summit', name: 'Summit Crew', rarity: 'common', series: 'first-chair', colors: cw('summit', 'gloves') },
      { id: 'arcade', name: 'Arcade', rarity: 'common', series: 'night-park', colors: cw('arcade', 'gloves') },
      { id: 'woodland', name: 'Woodland', rarity: 'rare', series: 'first-chair', colors: { base: '#4d5a36', cuff: '#2b2a1f', pat: 'camo', patA: '#2b2a1f', patB: '#8a7650' } },
    ],
  },
  {
    id: 'gloves-pipe', slot: 'gloves', garment: 'pipe-glove', name: 'Pipe Glove', unlock: 'case',
    variants: [
      { id: 'black', name: 'Black', rarity: 'common', series: 'night-park', colors: { base: '#1b1b1d', cuff: '#2a2a2e' } },
      { id: 'hi-vis', name: 'Hi-Vis', rarity: 'uncommon', series: 'night-park', colors: { base: '#d9ff2e', cuff: '#1b1b1d' } },
      { id: 'neon', name: 'Glowstick', rarity: 'epic', series: 'night-park', colors: { base: '#1b1240', cuff: '#2bf0ff', finish: 'neon', pat: 'stripes', patA: '#ff2fd2' } },
    ],
  },
];

// ------------------------------------------------------------------ gear
// Ski and board models (src/equipment/specs.js): the stock pair is free, the others drop from cases,
// and the gold tier is legendary topsheets on the same shapes (CS:GO's knives).
export const GEAR_ITEMS = [
  { id: 'skis-northwake-carver', slot: 'skis', model: 'allmountain', name: 'Northwake Ridge 172', brand: NW, unlock: 'default', starter: true,
    description: 'Do-everything all-mountain ski with cyan neon edges. Quick edge to edge.',
    stats: { speed: 7, carve: 7, pop: 6, stability: 7 }, variant: { id: 'classic', name: 'Classic', colors: { base: '#141238', accent: '#ff4f8c', trim: '#1affd9' } } },
  { id: 'skis-valcrest-sl', slot: 'skis', model: 'slalom', name: 'Valcrest SL Race 165', brand: 'Valcrest', rarity: 'uncommon', series: 'first-chair',
    description: 'Short-radius race carver: bites hard, hates skidding.', stats: { speed: 8, carve: 9, pop: 5, stability: 7 },
    variant: { id: 'stock', name: 'Race Yellow', colors: { base: '#ffd23a', accent: '#ff2a2a' } } },
  { id: 'skis-driftline-float', slot: 'skis', model: 'powder', name: 'Driftline Float 186', brand: 'Driftline', rarity: 'rare', series: 'first-chair',
    description: 'Wide, rockered powder ski that planes early.', stats: { speed: 7, carve: 5, pop: 6, stability: 8 },
    variant: { id: 'stock', name: 'Lagoon', colors: { base: '#2ff5d6', accent: '#0f3f5f' } } },
  { id: 'skis-jibworks-twin', slot: 'skis', model: 'park', name: 'Jibworks Twin 168', brand: 'Jibworks', rarity: 'uncommon', series: 'night-park',
    description: 'Soft true-twin park ski: lands switch.', stats: { speed: 6, carve: 6, pop: 9, stability: 5 },
    variant: { id: 'stock', name: 'Bubblegum', colors: { base: '#ff6ad5', accent: '#7b2cff' } } },
  { id: 'skis-valcrest-gs', slot: 'skis', model: 'gs', name: 'Valcrest GS Race 188', brand: 'Valcrest', rarity: 'rare', series: 'night-park',
    description: 'Long-radius giant slalom ski: rock-steady at speed, lazy when slow.', stats: { speed: 10, carve: 7, pop: 4, stability: 9 },
    variant: { id: 'stock', name: 'Team White', colors: { base: '#f4f4f4', accent: '#d8242c' } } },
  { id: 'board-northwake-twin', slot: 'board', model: 'allmountain', name: 'Northwake Atlas 156', brand: NW, unlock: 'default', starter: true,
    description: 'Directional-twin camber board for the whole mountain. Lively pop, holds an edge.',
    stats: { speed: 6, carve: 7, pop: 7, stability: 6 }, variant: { id: 'sunset', name: 'Sunset', colors: { base: '#2a2470', accent: '#ff4f8c', trim: '#1affd9' } } },
  { id: 'board-valcrest-steeple', slot: 'board', model: 'freeride', name: 'Valcrest Steeple 161', brand: 'Valcrest', rarity: 'uncommon', series: 'first-chair',
    description: 'Stiff directional freeride carver with a long effective edge.', stats: { speed: 8, carve: 8, pop: 5, stability: 8 },
    variant: { id: 'stock', name: 'Bone', colors: { base: '#f2efe6', accent: '#ff7a1a' } } },
  { id: 'board-northwake-edge', slot: 'board', model: 'carver', name: 'Northwake Edge 163', brand: NW, rarity: 'rare', series: 'first-chair',
    description: 'Stiff carving deck: deep euro-carves, unforgiving skids.', stats: { speed: 8, carve: 10, pop: 4, stability: 8 },
    variant: { id: 'stock', name: 'Ice', colors: { base: '#1b1f3a', accent: '#4fd1ff' } } },
  { id: 'board-jibworks-butter', slot: 'board', model: 'park', name: 'Jibworks Butter 152', brand: 'Jibworks', rarity: 'uncommon', series: 'night-park',
    description: 'Soft true-twin rocker board: butters, presses, spins.', stats: { speed: 5, carve: 5, pop: 8, stability: 4 },
    variant: { id: 'stock', name: 'Lemonade', colors: { base: '#fff36a', accent: '#ff6ad5' } } },
  { id: 'board-driftline-fish', slot: 'board', model: 'powder', name: 'Driftline Fish 158', brand: 'Driftline', rarity: 'rare', series: 'night-park',
    description: 'Tapered floater with a big setback.', stats: { speed: 7, carve: 6, pop: 6, stability: 7 },
    variant: { id: 'stock', name: 'Seafoam', colors: { base: '#e8fffb', accent: '#2ff5d6' } } },
];

// The gold tier: legendary topsheets (specs.js LEGENDARY_SKIS / LEGENDARY_BOARDS hold the graphics).
// [id, slot, spec id, base model (shape + handling), name, skin, colours for the card]
export const GOLD_ITEMS = [
  ['skis-gold-leaf', 'skis', 'gold-leaf', 'allmountain', '★ Ridge 172', 'Gold Leaf', ['#ffd76a', '#8a5a10']],
  ['skis-chrome', 'skis', 'chrome', 'slalom', '★ SL Race 165', 'Mirror Chrome', ['#f2f6fa', '#6a7680']],
  ['skis-holo', 'skis', 'holo', 'park', '★ Twin 168', 'Holographic', ['#9bf0ff', '#ff9df0']],
  ['skis-inferno', 'skis', 'inferno', 'gs', '★ GS Race 188', 'Inferno', ['#ffb13d', '#c41a0a']],
  ['skis-galaxy', 'skis', 'galaxy', 'powder', '★ Float 186', 'Galaxy', ['#7a5cff', '#0b0b30']],
  ['board-gold-leaf', 'board', 'gold-leaf', 'allmountain', '★ Atlas 156', 'Gold Leaf', ['#ffd76a', '#8a5a10']],
  ['board-chrome', 'board', 'chrome', 'carver', '★ Edge 163', 'Mirror Chrome', ['#f2f6fa', '#6a7680']],
  ['board-holo', 'board', 'holo', 'park', '★ Butter 152', 'Holographic', ['#9bf0ff', '#ff9df0']],
  ['board-inferno', 'board', 'inferno', 'freeride', '★ Steeple 161', 'Inferno', ['#ffb13d', '#c41a0a']],
  ['board-aurora', 'board', 'aurora', 'powder', '★ Fish 158', 'Aurora', ['#5dffb0', '#3b2a9a']],
].map(([id, slot, model, base, name, skin, [a, b]]) => ({
  id, slot, model, base, name, brand: 'Northwake Legends', rarity: 'gold', series: '*',
  description: `Exceedingly rare: a legendary ${skin.toLowerCase()} topsheet.`,
  stats: null,   // copied from the base model in catalog.js
  variant: { id: 'legend', name: skin, colors: { base: a, accent: b } },
}));

export const SERIES = {
  'first-chair': { name: 'First Chair Case', blurb: 'Classic outerwear: heritage colourways, camo and chrome.', color: '#3a7bd5', accent: '#ffd23f' },
  'night-park': { name: 'Night Park Case', blurb: 'Neon, reflective and 90s park kit under the lights.', color: '#c43cff', accent: '#2bf0ff' },
};
export const SERIES_ORDER = ['first-chair', 'night-park'];
