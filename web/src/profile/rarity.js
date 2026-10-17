// Rarity tiers for reward items, modelled on CS:GO's grades (docs/rewards.md, docs/rewards-research.md).
//
// `weight` is the chance (in %) that one case roll lands in the tier. CS:GO's cases step about 1:5
// between tiers (79.92 / 15.98 / 3.2 / 0.64 / 0.26 %); ours add a grey Consumer tier at the bottom so
// the commonest items are the plain colourways. The gold tier is the "rare special item" (CS:GO's
// knives): legendary skis and snowboards, shown in the reel as one golden ★ card.
export const RARITIES = [
  { id: 'common', name: 'Consumer', short: 'Common', color: '#b0c3d9', weight: 50.0, dupeXp: 100 },
  { id: 'uncommon', name: 'Mil-Spec', short: 'Uncommon', color: '#4b69ff', weight: 30.0, dupeXp: 150 },
  { id: 'rare', name: 'Restricted', short: 'Rare', color: '#8847ff', weight: 14.0, dupeXp: 250 },
  { id: 'epic', name: 'Classified', short: 'Epic', color: '#d32ce6', weight: 4.4, dupeXp: 400 },
  { id: 'legendary', name: 'Covert', short: 'Legendary', color: '#eb4b4b', weight: 1.3, dupeXp: 700 },
  { id: 'gold', name: 'Exceedingly Rare', short: 'Gold', color: '#e4ae39', weight: 0.3, dupeXp: 1000 },
];

export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.id, { ...r, rank: i }]));
export const rarityOf = (id) => RARITY[id] ?? RARITY.common;
/** Higher = rarer. */
export const rarityRank = (id) => rarityOf(id).rank;
