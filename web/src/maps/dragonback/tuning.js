// Dragonback's per-map tuning, applied over config.js when the map loads (applyMapTuning, docs/map3.md §3).
// It starts from Ravenspire's big-mountain physics (same gear, same snow, same honest jumps) and changes
// only what riding ridges needs; every difference is listed and explained in docs/map5.md.
import { RAVENSPIRE_PHYSICS, RAVENSPIRE_CAMERA } from '../ravenspire/tuning.js';

const clone = (o) => JSON.parse(JSON.stringify(o));
const R = clone(RAVENSPIRE_PHYSICS);

export const DRAGONBACK_PHYSICS = {
  common: {
    ...R.common,
    // Ridge-hopping: airs every few seconds, so the apex slow-mo only ever touches the very biggest ones.
    slowmo: { ...R.common.slowmo, minAir: 3.0, minDrop: 14 },
    // Sluffed powder in the gully floors (sluff.js): × speed per second, so the low line is slower than the crests.
    sluffDrag: 0.05,
    // Respawning on a knife-edge crest (respawn.js): set on the crest, already rolling down it at this m/s.
    respawnRoll: 8,
  },
  ski: { ...R.ski },
  snowboard: { ...R.snowboard },
};

export const DRAGONBACK_CAMERA = { ...RAVENSPIRE_CAMERA };
