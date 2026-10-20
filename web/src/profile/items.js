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
      { id: 'forest', name: 'Forest', rarity: 'common', series: 'first-chair',
        colors: { base: '#2f4a3a', panel: '#23382c', accent: '#e8d9a8', gaiter: '#23382c', style: 0 } },
      { id: 'bubblegum', name: 'Bubblegum', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#ff8fc8', panel: '#ffd1e8', accent: '#7a3cff', gaiter: '#ffd1e8', style: 1 } },
      { id: 'checker', name: 'Board Shop', rarity: 'rare', series: 'night-park',
        colors: { base: '#f1f1ee', panel: '#141414', accent: '#ff3d6e', gaiter: '#141414', style: 0, pat: 'checker', patA: '#141414', patScale: 1 } },
      { id: 'expedition', name: 'Expedition Red', rarity: 'common', series: 'backcountry',
        colors: { base: '#b3261e', panel: '#1b1e23', accent: '#f2efe6', gaiter: '#1b1e23', style: 0 } },
      { id: 'topo', name: 'Topo Map', rarity: 'rare', series: 'backcountry',
        colors: { base: '#c9b48a', panel: '#5a4a32', accent: '#ff5b14', gaiter: '#5a4a32', style: 0, pat: 'topo', patA: '#4a3a24', patScale: 1 } },
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
      { id: 'tiger', name: 'Bengal', rarity: 'epic', series: 'night-park',
        colors: { base: '#ff8a1a', panel: '#141414', accent: '#fff3d6', gaiter: '#141414', style: 0, pat: 'tiger', patA: '#141414' } },
      { id: 'molten', name: 'Molten', rarity: 'legendary', series: 'first-chair',
        colors: { base: '#1a0f0c', panel: '#2a1510', accent: '#ffb13d', gaiter: '#1a0f0c', style: 0, pat: 'flames', patA: '#ff4a12', patB: '#ffd23a', finish: 'neon' } },
      { id: 'glacier-blue', name: 'Glacier Blue', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#2f7be0', panel: '#123766', accent: '#f2efe6', gaiter: '#123766', style: 0 } },
      { id: 'whiteout', name: 'Whiteout', rarity: 'rare', series: 'backcountry',
        colors: { base: '#f2f4f6', panel: '#c9d2d9', accent: '#2f7be0', gaiter: '#c9d2d9', style: 0, pat: 'digital', patA: '#d9e0e6', patB: '#aeb9c3' } },
    ],
  },
  {
    id: 'jacket-retro-suit', slot: 'jacket', garment: 'retro-suit', name: 'Retro One-Piece', unlock: 'case',
    description: 'A 90s one-piece: the suit dresses your legs too.',
    variants: [
      { id: 'ice-cream', name: 'Ice Cream', rarity: 'epic', series: 'night-park',
        colors: { base: '#fff1d6', panel: '#ff9ec7', accent: '#7fd6ff', gaiter: '#ff9ec7', style: 1, pat: 'band', patA: '#ff9ec7', patB: '#7fd6ff', onePiece: true } },
      { id: 'alpine-78', name: "Alpine '78", rarity: 'epic', series: 'backcountry',
        colors: { base: '#f2efe6', panel: '#b3261e', accent: '#1f2a44', gaiter: '#b3261e', style: 1, pat: 'band', patA: '#b3261e', patB: '#1f2a44', onePiece: true } },
    ],
  },
  // Modern fits (character/outfits.js FITS, docs/character.md): trend palettes — earth tones, muted
  // pastels, tonal two-tones with one saturated accent.
  {
    id: 'jacket-ridge-shell', slot: 'jacket', garment: 'ridge-shell', name: 'Ridge Shell', unlock: 'case',
    variants: [
      { id: 'stratus', name: 'Stratus', rarity: 'common', series: 'first-chair',
        colors: { base: '#8fa6b8', panel: '#5d6f7e', accent: '#ff6a13', gaiter: '#3e4a55', style: 0 } },
      { id: 'carob', name: 'Carob', rarity: 'common', series: 'backcountry',
        colors: { base: '#4a3328', panel: '#c8b28a', accent: '#e86a2b', gaiter: '#2e211a', style: 0 } },
      { id: 'black-sapphire', name: 'Black Sapphire', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#1c1f26', panel: '#2c3442', accent: '#2bc4e0', gaiter: '#1c1f26', style: 0 } },
      { id: 'forage', name: 'Forage', rarity: 'uncommon', series: 'first-chair',
        colors: { base: '#6b6a3e', panel: '#a9b8a0', accent: '#dfff3a', gaiter: '#4a4a2c', style: 0 } },
      { id: 'dynasty', name: 'Dynasty', rarity: 'rare', series: 'backcountry',
        colors: { base: '#a0492a', panel: '#1c1c1e', accent: '#e8e2d4', gaiter: '#1c1c1e', style: 1 } },
    ],
  },
  {
    id: 'jacket-tall-anorak', slot: 'jacket', garment: 'tall-anorak', name: 'Tall Anorak', unlock: 'case',
    variants: [
      { id: 'bone', name: 'Bone', rarity: 'common', series: 'night-park',
        colors: { base: '#e8e2d4', panel: '#c8b28a', accent: '#4a3328', gaiter: '#c8b28a', style: 0 } },
      { id: 'sage', name: 'Sage', rarity: 'common', series: 'first-chair',
        colors: { base: '#a9b8a0', panel: '#6b7a63', accent: '#e9d9a0', gaiter: '#6b7a63', style: 0 } },
      { id: 'lilac', name: 'Lilac Haze', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#b9a8c6', panel: '#8fa6b8', accent: '#e9d9a0', gaiter: '#8fa6b8', style: 1 } },
      { id: 'forest-lime', name: 'Forest Lime', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#2f4a3a', panel: '#c6e03b', accent: '#c6e03b', gaiter: '#2f4a3a', style: 0 } },
      { id: 'navy-blaze', name: 'Navy Blaze', rarity: 'rare', series: 'first-chair',
        colors: { base: '#1f2a44', panel: '#e86a2b', accent: '#f2efe6', gaiter: '#1f2a44', style: 1 } },
      { id: 'swirl', name: 'Swirl', rarity: 'epic', series: 'night-park',
        colors: { base: '#e9d9a0', panel: '#b9a8c6', accent: '#1f2a44', gaiter: '#b9a8c6', style: 0, pat: 'tiedye', patA: '#d9a9a3', patB: '#8fa6b8' } },
    ],
  },
  {
    id: 'jacket-cloud-puffer', slot: 'jacket', garment: 'cloud-puffer', name: 'Cloud Puffer', unlock: 'case',
    description: 'The one round cut: an insulated puffer with wide baffles.',
    variants: [
      { id: 'butter', name: 'Butter', rarity: 'common', series: 'first-chair',
        colors: { base: '#e9d9a0', panel: '#c8b28a', accent: '#4a3328', gaiter: '#c8b28a', style: 0 } },
      { id: 'cocoa', name: 'Cocoa', rarity: 'common', series: 'backcountry',
        colors: { base: '#4a3328', panel: '#2e211a', accent: '#e8e2d4', gaiter: '#2e211a', style: 0 } },
      { id: 'blush', name: 'Blush', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#d9a9a3', panel: '#e8e2d4', accent: '#7a3cff', gaiter: '#e8e2d4', style: 1 } },
      { id: 'summit-orange', name: 'Summit Orange', rarity: 'rare', series: 'backcountry',
        colors: { base: '#ff6a13', panel: '#1c1c1e', accent: '#f2efe6', gaiter: '#1c1c1e', style: 1 } },
    ],
  },
  {
    id: 'jacket-layer-hoodie', slot: 'jacket', garment: 'layer-hoodie', name: 'Layer Hoodie', unlock: 'case',
    description: 'A tall hoodie worn over a shell: the shell is the panel colour at the collar.',
    variants: [
      { id: 'heather', name: 'Heather', rarity: 'common', series: 'night-park',
        colors: { base: '#8c8a82', panel: '#1c1c1e', accent: '#e8e2d4', gaiter: '#3a3936', style: 0 } },
      { id: 'olive', name: 'Olive Drab', rarity: 'common', series: 'first-chair',
        colors: { base: '#5b5f3a', panel: '#c8b28a', accent: '#e8e2d4', gaiter: '#3a3d25', style: 0 } },
      { id: 'dusty-blue', name: 'Dusty Blue', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#8fa6b8', panel: '#1f2a44', accent: '#e9d9a0', gaiter: '#1f2a44', style: 0 } },
      { id: 'rust', name: 'Rust', rarity: 'uncommon', series: 'first-chair',
        colors: { base: '#a0492a', panel: '#2e211a', accent: '#e8e2d4', gaiter: '#2e211a', style: 0 } },
      { id: 'acid', name: 'Acid', rarity: 'rare', series: 'night-park',
        colors: { base: '#c6e03b', panel: '#1c1c1e', accent: '#1c1c1e', gaiter: '#1c1c1e', style: 0 } },
      { id: 'camo', name: 'Woodland Hoodie', rarity: 'rare', series: 'backcountry',
        colors: { base: '#4d5a36', panel: '#2b2a1f', accent: '#d8c9a0', gaiter: '#2b2a1f', style: 0, pat: 'camo', patA: '#2b2a1f', patB: '#8a7650', patScale: 1 } },
    ],
  },
  // Round 2's six looks as catalogue jackets (character/outfits.js, docs/character.md § Catalogue jackets).
  // All matte: earth tones, plaids, workwear, one colour per look as its Covert (legendary) pull.
  {
    id: 'jacket-sherpa-flannel', slot: 'jacket', garment: 'sherpa-flannel', name: 'Sherpa Flannel', unlock: 'case',
    description: 'A sherpa-lined flannel shirt-jacket over a hoodie: the hoodie colour shows at the hood and collar.',
    variants: [
      { id: 'ash-plaid', name: 'Ash Plaid', rarity: 'common', series: 'night-park',
        colors: { base: '#8f9194', panel: '#2e3034', accent: '#e9e0cc', gaiter: '#2e3034', layer: '#5a4438', style: 0 } },
      { id: 'mustard-plaid', name: 'Mustard Plaid', rarity: 'uncommon', series: 'first-chair',
        colors: { base: '#c4952e', panel: '#2a2420', accent: '#efe6d6', gaiter: '#2a2420', layer: '#3b3e43', style: 0 } },
      { id: 'midnight-plaid', name: 'Midnight Plaid', rarity: 'rare', series: 'night-park',
        colors: { base: '#2b3a5c', panel: '#121418', accent: '#e9e0cc', gaiter: '#121418', layer: '#8f9194', style: 0 } },
      { id: 'forest-plaid', name: 'Forest Plaid', rarity: 'epic', series: 'backcountry',
        colors: { base: '#2f5a3a', panel: '#1a1d1a', accent: '#e9e0cc', gaiter: '#1a1d1a', layer: '#2b2d30', style: 0 } },
      { id: 'buffalo', name: 'Buffalo Rust', rarity: 'legendary', series: 'first-chair',
        colors: { base: '#9e3d26', panel: '#1d1b1a', accent: '#e9e0cc', gaiter: '#8f9194', layer: '#8f9194', style: 0 } },
    ],
  },
  {
    id: 'jacket-insulated-freedom', slot: 'jacket', garment: 'insulated-freedom', name: 'Insulated Freedom', unlock: 'case',
    description: 'Relaxed insulated twill with a contrast yoke and sleeves.',
    variants: [
      { id: 'olive-yoke', name: 'Olive', rarity: 'common', series: 'backcountry',
        colors: { base: '#5e6140', panel: '#1b1c1e', accent: '#e9e0cc', gaiter: '#1b1c1e', style: 0 } },
      { id: 'bone-yoke', name: 'Bone', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#e3dccb', panel: '#2b2c2e', accent: '#c4952e', gaiter: '#2b2c2e', style: 0 } },
      { id: 'teal-yoke', name: 'Glacier Teal', rarity: 'rare', series: 'backcountry',
        colors: { base: '#2f7f86', panel: '#1b1c1e', accent: '#f1ede4', gaiter: '#1b1c1e', style: 0 } },
      { id: 'red-yoke', name: 'Expedition', rarity: 'epic', series: 'first-chair',
        colors: { base: '#b3261e', panel: '#1b1c1e', accent: '#f1ede4', gaiter: '#1b1c1e', style: 0 } },
      { id: 'saffron', name: 'Saffron Yoke', rarity: 'legendary', series: 'night-park',
        colors: { base: '#d9982a', panel: '#1b1c1e', accent: '#f1ede4', gaiter: '#1b1c1e', style: 0 } },
    ],
  },
  {
    id: 'jacket-alpine-hardshell', slot: 'jacket', garment: 'alpine-hardshell', name: 'Alpine Hardshell', unlock: 'case',
    description: 'A 3-layer hardshell with taped seams and a stowed helmet hood.',
    variants: [
      { id: 'stone', name: 'Stone', rarity: 'common', series: 'first-chair',
        colors: { base: '#a59d8c', panel: '#6b6455', accent: '#ff6a13', gaiter: '#4a453b', style: 0 } },
      { id: 'graphite', name: 'Graphite', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#3a3d42', panel: '#26282c', accent: '#c9f25a', gaiter: '#1f2523', style: 0 } },
      { id: 'glacier-shell', name: 'Glacier', rarity: 'rare', series: 'first-chair',
        colors: { base: '#9fc3d9', panel: '#3d5a6e', accent: '#1b2a38', gaiter: '#3d5a6e', style: 0 } },
      { id: 'ember', name: 'Ember', rarity: 'epic', series: 'night-park',
        colors: { base: '#c2461f', panel: '#2a1c17', accent: '#f2d48a', gaiter: '#2a1c17', style: 0 } },
      { id: 'spruce', name: 'Spruce', rarity: 'legendary', series: 'backcountry',
        colors: { base: '#2b4f4c', panel: '#23403e', accent: '#c9f25a', gaiter: '#1f2523', style: 0 } },
    ],
  },
  {
    id: 'jacket-varsity-coach', slot: 'jacket', garment: 'varsity-coach', name: 'Varsity Coach', unlock: 'case',
    description: 'A snow varsity jacket: the panel colour is the sleeves, the accent the rib stripes.',
    variants: [
      { id: 'charcoal-varsity', name: 'Charcoal', rarity: 'common', series: 'first-chair',
        colors: { base: '#2e3034', panel: '#8f9194', accent: '#e9e0cc', gaiter: '#1d1e20', style: 0 } },
      { id: 'maroon-varsity', name: 'Maroon', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#5a1f22', panel: '#e8e1cf', accent: '#c4952e', gaiter: '#3a1416', style: 0 } },
      { id: 'navy-varsity', name: 'Navy', rarity: 'rare', series: 'night-park',
        colors: { base: '#1f2a44', panel: '#e8e1cf', accent: '#c8392b', gaiter: '#141b2e', style: 0 } },
      { id: 'black-varsity', name: 'Black & Bone', rarity: 'epic', series: 'night-park',
        colors: { base: '#1c1c1e', panel: '#e3dccb', accent: '#c9a25a', gaiter: '#1c1c1e', style: 0 } },
      { id: 'letterman', name: 'Letterman', rarity: 'legendary', series: 'first-chair',
        colors: { base: '#24452f', panel: '#e8e1cf', accent: '#d8a63a', gaiter: '#1c3324', style: 0 } },
    ],
  },
  {
    id: 'jacket-duck-canvas', slot: 'jacket', garment: 'duck-canvas', name: 'Duck Canvas Work', unlock: 'case',
    description: 'A duck-canvas chore jacket: the panel colour is the corduroy collar.',
    variants: [
      { id: 'chalk', name: 'Chalk', rarity: 'common', series: 'first-chair',
        colors: { base: '#d9d0bd', panel: '#5a4632', accent: '#8c6a3f', gaiter: '#4a3a2a', style: 0 } },
      { id: 'tan-duck', name: 'Hamilton Tan', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#b08a5a', panel: '#4a3224', accent: '#e3d3a8', gaiter: '#4a3224', style: 0 } },
      { id: 'moss-duck', name: 'Moss', rarity: 'rare', series: 'night-park',
        colors: { base: '#5f6440', panel: '#3a2a1e', accent: '#c8ab72', gaiter: '#3a2a1e', style: 0 } },
      { id: 'black-duck', name: 'Black Duck', rarity: 'epic', series: 'first-chair',
        colors: { base: '#2b2a28', panel: '#4a3a2a', accent: '#c8ab72', gaiter: '#2b2a28', style: 0 } },
      { id: 'brown-duck', name: 'Brown Duck', rarity: 'legendary', series: 'backcountry',
        colors: { base: '#8c6a3f', panel: '#43301f', accent: '#c8ab72', gaiter: '#4a3224', style: 0 } },
    ],
  },
  {
    id: 'jacket-mocha-puffer', slot: 'jacket', garment: 'mocha-puffer', name: 'Mocha Puffer', unlock: 'case',
    description: 'A slim hip-length puffer with small baffles and a matte face.',
    variants: [
      { id: 'rust-puffer', name: 'Rust', rarity: 'common', series: 'backcountry',
        colors: { base: '#9a4a2c', panel: '#7a3a22', accent: '#efe6d6', gaiter: '#3e2c23', style: 0 } },
      { id: 'black-puffer', name: 'Matte Black', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#1f2023', panel: '#2a2b2e', accent: '#c9c2b0', gaiter: '#1f2023', style: 0 } },
      { id: 'cream-puffer', name: 'Cream', rarity: 'rare', series: 'first-chair',
        colors: { base: '#e6ddc8', panel: '#cfc4ad', accent: '#5a4438', gaiter: '#5a4438', style: 0 } },
      { id: 'sage-puffer', name: 'Sage', rarity: 'epic', series: 'backcountry',
        colors: { base: '#8e9c82', panel: '#6f7d64', accent: '#efe6d6', gaiter: '#3e4a37', style: 0 } },
      { id: 'mocha', name: 'Mocha', rarity: 'legendary', series: 'night-park',
        colors: { base: '#6b5244', panel: '#5a4438', accent: '#efe6d6', gaiter: '#3e2c23', style: 0 } },
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
      { id: 'navy', name: 'Navy', rarity: 'common', series: 'first-chair', colors: { base: '#1f2a44', cuff: '#141b2e' } },
      { id: 'arctic', name: 'Arctic Camo', rarity: 'rare', series: 'first-chair',
        colors: { base: '#e9eef2', cuff: '#9aa8b4', pat: 'digital', patA: '#9aa8b4', patB: '#5d6c7a' } },
      { id: 'heritage', name: 'Heritage', rarity: 'epic', series: 'first-chair',
        colors: { base: '#efe6d2', cuff: '#c8392b', pat: 'band', patA: '#c8392b', patB: '#f2a03a' } },
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'backcountry', colors: { base: '#2b2c2f', cuff: '#1a1b1d' } },
      { id: 'avalanche', name: 'Avalanche', rarity: 'uncommon', series: 'backcountry', colors: { base: '#ff6a00', cuff: '#1b1e23' } },
    ],
  },
  {
    id: 'pants-cargo', slot: 'pants', garment: 'cargo-pant', name: 'Cargo Pant', unlock: 'case',
    variants: [
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'night-park', colors: { base: '#3a3c40', cuff: '#1f2023' } },
      { id: 'sand', name: 'Sand', rarity: 'common', series: 'night-park', colors: { base: '#c9b48a', cuff: '#8a7650' } },
      { id: 'olive', name: 'Olive', rarity: 'common', series: 'night-park', colors: { base: '#5a5f3a', cuff: '#3a3d25' } },
      { id: 'camo', name: 'Urban Camo', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#8e9399', cuff: '#3a3d42', pat: 'camo', patA: '#3a3d42', patB: '#c9ccd0' } },
      { id: 'khaki', name: 'Khaki', rarity: 'common', series: 'backcountry', colors: { base: '#a8956a', cuff: '#6e5f40' } },
      { id: 'desert', name: 'Desert Camo', rarity: 'rare', series: 'backcountry',
        colors: { base: '#d2b98c', cuff: '#6e5f40', pat: 'camo', patA: '#8a6a40', patB: '#efe0c0' } },
      { id: 'tiedye', name: 'Tie-Dye', rarity: 'rare', series: 'night-park',
        colors: { base: '#ff6ad5', cuff: '#3b1a75', pat: 'tiedye', patA: '#2bd1ff', patB: '#fff36a' } },
      { id: 'splatter', name: 'Paintball', rarity: 'epic', series: 'night-park',
        colors: { base: '#f1f1ee', cuff: '#1d1d22', pat: 'splatter', patA: '#ff2f6d', patB: '#2bd1ff' } },
    ],
  },
  {
    id: 'pants-wide', slot: 'pants', garment: 'wide-pant', name: 'Wide Pant', unlock: 'case',
    variants: [
      { id: 'bone', name: 'Bone', rarity: 'common', series: 'night-park', colors: { base: '#e8e2d4', cuff: '#c8b28a' } },
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'first-chair', colors: { base: '#3a3936', cuff: '#1f1e1c' } },
      { id: 'olive', name: 'Olive', rarity: 'common', series: 'backcountry', colors: { base: '#5b5f3a', cuff: '#3a3d25' } },
      { id: 'denim', name: 'Washed Denim', rarity: 'uncommon', series: 'night-park', colors: { base: '#4f6d8c', cuff: '#2c3e52' } },
      { id: 'carob', name: 'Carob', rarity: 'uncommon', series: 'backcountry', colors: { base: '#4a3328', cuff: '#2e211a' } },
      { id: 'camo', name: 'Woodland', rarity: 'rare', series: 'first-chair',
        colors: { base: '#4d5a36', cuff: '#2b2a1f', pat: 'camo', patA: '#2b2a1f', patB: '#8a7650' } },
    ],
  },
  // Round 2's pants (the ones worn under R1–R6).
  {
    id: 'pants-baggy', slot: 'pants', garment: 'baggy-pant', name: 'Baggy Pant', unlock: 'case',
    variants: [
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'first-chair', colors: { base: '#2e3034', cuff: '#202226' } },
      { id: 'washed-black', name: 'Washed Black', rarity: 'common', series: 'backcountry', colors: { base: '#26272a', cuff: '#18191b' } },
      { id: 'bone', name: 'Bone', rarity: 'uncommon', series: 'night-park', colors: { base: '#e3d9c4', cuff: '#c9bea6' } },
      { id: 'khaki', name: 'Khaki', rarity: 'rare', series: 'backcountry', colors: { base: '#a8956a', cuff: '#6e5f40' } },
    ],
  },
  {
    id: 'pants-relaxed-cargo', slot: 'pants', garment: 'relaxed-cargo', name: 'Relaxed Cargo', unlock: 'case',
    variants: [
      { id: 'black', name: 'Black', rarity: 'common', series: 'night-park', colors: { base: '#1b1c1e', cuff: '#111113' } },
      { id: 'olive', name: 'Olive', rarity: 'common', series: 'first-chair', colors: { base: '#4f5434', cuff: '#353923' } },
      { id: 'sand', name: 'Sand', rarity: 'uncommon', series: 'backcountry', colors: { base: '#c9b48a', cuff: '#8a7650' } },
      { id: 'rust', name: 'Rust', rarity: 'rare', series: 'first-chair', colors: { base: '#8a3f24', cuff: '#4a2214' } },
    ],
  },
  {
    id: 'pants-stack', slot: 'pants', garment: 'stack-pant', name: 'Big Stack Pant', unlock: 'case',
    variants: [
      { id: 'black', name: 'Black', rarity: 'common', series: 'backcountry', colors: { base: '#1d1f22', cuff: '#131416' } },
      { id: 'dark-olive', name: 'Dark Olive', rarity: 'common', series: 'night-park', colors: { base: '#2f3329', cuff: '#23261f' } },
      { id: 'sage', name: 'Sage', rarity: 'uncommon', series: 'first-chair', colors: { base: '#8e9c82', cuff: '#5f6b55' } },
      { id: 'lilac', name: 'Lilac', rarity: 'rare', series: 'night-park', colors: { base: '#9d8fb0', cuff: '#6a5d7e' } },
    ],
  },
  {
    id: 'pants-coach-bib', slot: 'pants', garment: 'coach-bib', name: 'Coach Bib', unlock: 'case',
    variants: [
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'first-chair', colors: { base: '#2b2c2e', cuff: '#1c1d1f' } },
      { id: 'forest', name: 'Forest', rarity: 'uncommon', series: 'night-park', colors: { base: '#2f4a3a', cuff: '#1f3226' } },
      { id: 'cream', name: 'Cream', rarity: 'rare', series: 'backcountry', colors: { base: '#e8e1cf', cuff: '#bdb39c' } },
      { id: 'brick', name: 'Brick', rarity: 'epic', series: 'first-chair', colors: { base: '#8f3a2a', cuff: '#2b1a16' } },
    ],
  },
  {
    id: 'pants-carpenter', slot: 'pants', garment: 'carpenter-pant', name: 'Carpenter Pant', unlock: 'case',
    variants: [
      { id: 'moss', name: 'Moss', rarity: 'common', series: 'backcountry', colors: { base: '#4a5236', cuff: '#3a4029' } },
      { id: 'chalk', name: 'Chalk', rarity: 'common', series: 'night-park', colors: { base: '#d9d0bd', cuff: '#a89c84' } },
      { id: 'brown-duck', name: 'Brown Duck', rarity: 'uncommon', series: 'first-chair', colors: { base: '#8c6a3f', cuff: '#5a4226' } },
      { id: 'black-duck', name: 'Black Duck', rarity: 'rare', series: 'night-park', colors: { base: '#2b2a28', cuff: '#1a1918' } },
    ],
  },
  {
    id: 'pants-camo-cargo', slot: 'pants', garment: 'camo-cargo', name: 'Camo Cargo', unlock: 'case',
    variants: [
      { id: 'olive', name: 'Olive Drab', rarity: 'common', series: 'first-chair', colors: { base: '#59603f', cuff: '#3f4430' } },
      { id: 'urban', name: 'Urban Camo', rarity: 'uncommon', series: 'night-park',
        colors: { base: '#8e9399', cuff: '#3a3d42', pat: 'camo', patA: '#3a3d42', patB: '#c9ccd0', patScale: 1 } },
      { id: 'woodland', name: 'Woodland Camo', rarity: 'rare', series: 'backcountry',
        colors: { base: '#59603f', cuff: '#3f4430', pat: 'camo', patA: '#3a3f2a', patB: '#7d7656', patScale: 1 } },
      { id: 'desert', name: 'Desert Camo', rarity: 'epic', series: 'first-chair',
        colors: { base: '#d2b98c', cuff: '#6e5f40', pat: 'camo', patA: '#8a6a40', patB: '#efe0c0', patScale: 1 } },
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
      { id: 'navy', name: 'Matte Navy', rarity: 'common', series: 'first-chair', colors: { base: '#1f2a44', liner: '#111522', accent: '#e8d9a8' } },
      { id: 'checker', name: 'Finish Line', rarity: 'rare', series: 'night-park',
        colors: { base: '#f1f1ee', liner: '#141414', accent: '#141414', finish: 'gloss', decal: 'checker', decalCol: '#141414' } },
      { id: 'beacon', name: 'Beacon Orange', rarity: 'common', series: 'backcountry', colors: { base: '#ff6a00', liner: '#1a1a1a', accent: '#f2efe6', finish: 'gloss' } },
      { id: 'summit-stars', name: 'Summit Stars', rarity: 'uncommon', series: 'backcountry',
        colors: { base: '#1f2a44', liner: '#111522', accent: '#f2efe6', decal: 'stars', decalCol: '#f2efe6' } },
      { id: 'bronze', name: 'Bronze', rarity: 'epic', series: 'backcountry', colors: { base: '#a0642e', liner: '#1a1008', accent: '#f2d2a8', finish: 'metallic' } },
      { id: 'copper-chrome', name: 'Copper Chrome', rarity: 'legendary', series: 'backcountry', colors: { base: '#d27a46', liner: '#1a1008', accent: '#ffe2c8', finish: 'chrome' } },
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
      { id: 'clear', name: 'Night Clear', rarity: 'common', series: 'first-chair',
        colors: { lens: '#c9d6e3', lensBase: '#5a6a7a', strap: '#1d1d1b', strapLogo: '#c9d6e3' } },
      { id: 'emerald', name: 'Emerald', rarity: 'rare', series: 'first-chair',
        colors: { lens: '#2fe08a', lensBase: '#0b4a30', strap: '#0b2a1c', strapLogo: '#2fe08a', frame: '#0b2a1c', iri: 0.35 } },
      { id: 'laser', name: 'Laser', rarity: 'epic', series: 'night-park',
        colors: { lens: '#ff2fd2', lensBase: '#1a0f5a', strap: '#141414', strapLogo: '#2bf0ff', frame: '#2bf0ff', iri: 0.8 } },
      { id: 'black-gold', name: 'Black Gold', rarity: 'legendary', series: 'first-chair',
        colors: { lens: '#ffcf4a', lensBase: '#3a2400', strap: '#111111', strapLogo: '#ffcf4a', frame: '#c9962e', iri: 0.6 } },
      { id: 'persimmon', name: 'Persimmon', rarity: 'common', series: 'backcountry',
        colors: { lens: '#ff8a3d', lensBase: '#7a2a10', strap: '#3a3129', strapLogo: '#ff8a3d' } },
      { id: 'ice-blue', name: 'Ice Blue', rarity: 'uncommon', series: 'backcountry',
        colors: { lens: '#7fd6ff', lensBase: '#123766', strap: '#f2efe6', strapLogo: '#2f7be0', frame: '#f2efe6' } },
      { id: 'aurora-lens', name: 'Aurora', rarity: 'legendary', series: 'backcountry',
        colors: { lens: '#5dffb0', lensBase: '#3b2a9a', strap: '#0f2a2a', strapLogo: '#5dffb0', frame: '#3b2a9a', iri: 1 } },
      { id: 'amber-iridium', name: 'Amber Iridium', rarity: 'rare', series: 'backcountry',
        colors: { lens: '#ffb13d', lensBase: '#5a2a10', strap: '#1d1d1b', strapLogo: '#ffb13d', frame: '#3a3129', iri: 0.5 } },
    ],
  },
  {
    id: 'face-gaiter', slot: 'face', garment: 'tuff-gaiter', name: 'Neck Gaiter', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'face') },
      { id: 'tuff', name: 'Topo', rarity: 'common', series: 'first-chair', colors: { base: '#4a473f', pat: 'topo', patA: '#a8a291' } },
      { id: 'black', name: 'Blackout', rarity: 'common', series: 'night-park', colors: { base: '#18191b', pat: 'none' } },
      // The gaiters the old colourways came with (a v1 rider keeps the one matching their jacket).
      { id: 'nightshift', name: 'Nightshift', rarity: 'common', series: 'first-chair', colors: { ...cw('nightshift', 'face'), patA: '#a8a291' } },
      { id: 'arcade', name: 'Arcade', rarity: 'common', series: 'night-park', colors: { ...cw('arcade', 'face'), patA: '#ffd23f' } },
      { id: 'summit', name: 'Summit Crew', rarity: 'uncommon', series: 'first-chair', colors: { ...cw('summit', 'face'), patA: '#a8a291' } },
      { id: 'checker', name: 'Checkerboard', rarity: 'uncommon', series: 'night-park', colors: { base: '#f1f1ee', pat: 'checker', patA: '#141414' } },
      { id: 'woodland', name: 'Woodland', rarity: 'uncommon', series: 'first-chair', colors: { base: '#4d5a36', pat: 'camo', patA: '#2b2a1f', patB: '#8a7650' } },
      { id: 'skull', name: 'Skull Jaw', rarity: 'epic', series: 'first-chair', colors: { base: '#151517', pat: 'skull', patA: '#e9e6dc' } },
      { id: 'heather', name: 'Heather', rarity: 'common', series: 'first-chair', colors: { base: '#7d7f82', pat: 'none' } },
      { id: 'stars', name: 'Night Sky', rarity: 'rare', series: 'night-park', colors: { base: '#141a40', pat: 'stars', patA: '#ffe36a' } },
      { id: 'glow-skull', name: 'Glow Skull', rarity: 'legendary', series: 'night-park', colors: { base: '#0c0c10', pat: 'skull', patA: '#7dff3a' } },
      { id: 'topo-olive', name: 'Topo Olive', rarity: 'common', series: 'backcountry', colors: { base: '#4d5a36', pat: 'topo', patA: '#c9c08a' } },
      { id: 'blaze', name: 'Blaze', rarity: 'uncommon', series: 'backcountry', colors: { base: '#ff6a00', pat: 'none' } },
    ],
  },
  {
    id: 'face-balaclava', slot: 'face', garment: 'balaclava', name: 'Balaclava', unlock: 'case',
    variants: [
      { id: 'charcoal', name: 'Charcoal', rarity: 'common', series: 'night-park', colors: { base: '#2b2c2f', pat: 'none' } },
      { id: 'tiger', name: 'Tiger', rarity: 'rare', series: 'night-park', colors: { base: '#ff8a1a', pat: 'tiger', patA: '#141414' } },
      { id: 'arctic', name: 'Whiteout', rarity: 'uncommon', series: 'first-chair', colors: { base: '#e9eef2', pat: 'digital', patA: '#9aa8b4', patB: '#5d6c7a' } },
      { id: 'stars', name: 'Bivouac', rarity: 'rare', series: 'backcountry', colors: { base: '#1f2a44', pat: 'stars', patA: '#f2efe6' } },
      { id: 'skull', name: 'Yeti Skull', rarity: 'epic', series: 'backcountry', colors: { base: '#f2f4f6', pat: 'skull', patA: '#1f2a44' } },
      { id: 'flames', name: 'Inferno', rarity: 'epic', series: 'night-park', colors: { base: '#141416', pat: 'flames', patA: '#ff5b14', patB: '#ffd23a' } },
    ],
  },
  {
    id: 'gloves-tuff-mitt', slot: 'gloves', garment: 'tuff-mitt', name: 'Tuff Mitt', unlock: 'default',
    variants: [
      { id: 'basic', name: 'Rental', starter: true, colors: cw('basic', 'gloves') },
      { id: 'tuff', name: 'Tuff', rarity: 'common', series: 'first-chair', colors: cw('tuff', 'gloves') },
      { id: 'nightshift', name: 'Nightshift', rarity: 'uncommon', series: 'first-chair', colors: { ...cw('nightshift', 'gloves'), cuff: '#1fb89a' } },
      { id: 'summit', name: 'Summit Crew', rarity: 'common', series: 'first-chair', colors: cw('summit', 'gloves') },
      { id: 'arcade', name: 'Arcade', rarity: 'common', series: 'night-park', colors: cw('arcade', 'gloves') },
      { id: 'woodland', name: 'Woodland', rarity: 'rare', series: 'first-chair', colors: { base: '#4d5a36', cuff: '#2b2a1f', pat: 'camo', patA: '#2b2a1f', patB: '#8a7650' } },
      { id: 'black', name: 'Black Leather', rarity: 'common', series: 'first-chair', colors: { base: '#1e1e1e', cuff: '#111112' } },
      { id: 'sherpa', name: 'Sherpa Cuff', rarity: 'legendary', series: 'first-chair', colors: { base: '#7a5236', cuff: '#e9e0cc' } },
      { id: 'brown', name: 'Saddle', rarity: 'common', series: 'backcountry', colors: { base: '#7a4a28', cuff: '#2a1d14' } },
      { id: 'expedition', name: 'Expedition', rarity: 'uncommon', series: 'backcountry', colors: { base: '#b3261e', cuff: '#1b1e23' } },
    ],
  },
  {
    id: 'gloves-pipe', slot: 'gloves', garment: 'pipe-glove', name: 'Pipe Glove', unlock: 'case',
    variants: [
      { id: 'black', name: 'Black', rarity: 'common', series: 'night-park', colors: { base: '#1b1b1d', cuff: '#2a2a2e' } },
      { id: 'hi-vis', name: 'Hi-Vis', rarity: 'uncommon', series: 'night-park', colors: { base: '#d9ff2e', cuff: '#1b1b1d' } },
      { id: 'white', name: 'White', rarity: 'common', series: 'night-park', colors: { base: '#eeeeea', cuff: '#c9c9c4' } },
      { id: 'checker', name: 'Checker', rarity: 'rare', series: 'night-park', colors: { base: '#f1f1ee', cuff: '#141414', pat: 'checker', patA: '#141414' } },
      { id: 'wool', name: 'Wool Grey', rarity: 'common', series: 'backcountry', colors: { base: '#8e8f8c', cuff: '#5a5b58' } },
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

/**
 * Skins taken out of the game (October 2026: the user removed every shiny / metallic / reflective /
 * iridescent / gloss clothing finish and the zig-zag one-pieces). A rider who owned one gets the mapped
 * skin instead: a new matte skin of the SAME grade from the SAME case series (schema.js sanitize(): the
 * inventory, the equipped loadout and the case history / best pull are all rewritten; owning both just
 * adds the counts). docs/rewards.md § Retired skins.
 */
export const RETIRED_SKINS = {
  'jacket-tuff-shell:reflective': 'jacket-alpine-hardshell:ember',            // Flashbulb (epic, Night Park)
  'jacket-tuff-shell:gold-lame': 'jacket-sherpa-flannel:buffalo',             // Gold Lamé (legendary, First Chair)
  'jacket-tuff-shell:glacier': 'jacket-alpine-hardshell:glacier-shell',       // Glacier gloss (rare, First Chair)
  'jacket-tuff-shell:beacon': 'jacket-mocha-puffer:sage-puffer',              // Beacon reflective (epic, Backcountry)
  'jacket-tuff-shell-hood:hologram': 'jacket-insulated-freedom:saffron',      // Hologram (legendary, Night Park)
  'jacket-tuff-shell-hood:northern-lights': 'jacket-alpine-hardshell:spruce', // Northern Lights (legendary, Backcountry)
  'jacket-retro-suit:miami-92': 'jacket-varsity-coach:letterman',             // zig-zag (legendary, First Chair)
  'jacket-retro-suit:hyperwave': 'jacket-mocha-puffer:mocha',                 // zig-zag + neon (legendary, Night Park)
  'jacket-retro-suit:expedition-86': 'jacket-duck-canvas:brown-duck',         // zig-zag + metallic (legendary, Backcountry)
  'jacket-cloud-puffer:midnight': 'jacket-mocha-puffer:black-puffer',         // Midnight Gloss (uncommon, Night Park)
  'jacket-cloud-puffer:silver': 'jacket-duck-canvas:black-duck',              // Silver Lining metallic (epic, First Chair)
  'gloves-tuff-mitt:gold-lame': 'gloves-tuff-mitt:sherpa',                    // Gold Lamé mitts (legendary, First Chair)
};

export const SERIES = {
  'first-chair': { name: 'First Chair Case', blurb: 'Classic outerwear: heritage plaids, varsity, camo and chrome lids.', color: '#3a7bd5', accent: '#ffd23f' },
  'night-park': { name: 'Night Park Case', blurb: 'Park kit under the lights: puffers, prints and 90s colours.', color: '#c43cff', accent: '#2bf0ff' },
  backcountry: { name: 'Backcountry Case', blurb: 'Expedition colours, topo maps, beacon orange and copper.', color: '#d2691e', accent: '#f2efe6' },
};
export const SERIES_ORDER = ['first-chair', 'night-park', 'backcountry'];
