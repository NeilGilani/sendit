// Bridge to the equipment implementation, which lives in files the lobby does not own (rider.js,
// player.js, src/equipment/). The lobby only ever makes these two calls, both optional:
//
//   player.setEquipment?.(type, variant)   swap the physics model
//   rider.setEquipment?.(type, variant)    swap the rider's gear model (keeps the player in sync)
//
// type: 'skis' | 'snowboard' (rider/player normalise it to 'ski' | 'snowboard').
// variant: an equipment model id from src/equipment/specs.js (e.g. 'allmountain', 'park'), taken from
// the equipped catalog item (profileStore.gearModel), or undefined for the type's default model.
//
// applyEquipment() returns 'native' when the rider handled it, else 'unsupported' (the rig keeps its
// built-in skis; the Equipment tab says the board preview is unavailable).

/** True when the rider can swap gear itself. */
export const riderSupportsEquipment = (rider) => typeof rider?.setEquipment === 'function';

/** Tell a rider + player pair what to ride. */
export function applyEquipment({ rider, player }, type, variant) {
  player?.setEquipment?.(type, variant);
  if (riderSupportsEquipment(rider)) {
    rider.setEquipment(type, variant);
    return 'native';
  }
  return 'unsupported';
}
