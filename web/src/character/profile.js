// Profile → outfit: turns the five clothing slots of the player's loadout (catalog items) into the
// slot selections resolveOutfit() understands. item.model.ref = garment id, variant id = colourway,
// variant.colors = the colours (so a catalog variant may also carry custom colours).
import { profileStore } from '../profile/store.js';
import { OUTFIT_SLOTS } from './outfits.js';
import { PROTO, protoSlots } from './proto.js';

export function outfitSlotsFromProfile(store = profileStore) {
  if (PROTO) return protoSlots(PROTO);   // dev: ?proto=N (jacket prototype round, character/proto.js)
  const slots = {};
  for (const slot of OUTFIT_SLOTS) {
    const e = store.equipped(slot);
    if (!e?.item) continue;
    slots[slot] = {
      garment: e.item.model?.kind === 'outfit' ? e.item.model.ref : undefined,
      colorway: e.variant?.id,
      colors: e.variant?.colors,
    };
  }
  return slots;
}
