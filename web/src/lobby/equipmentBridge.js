// Bridge to the snowboard/equipment implementation, which lives in files the lobby does not own
// (rider.js, player.js, src/equipment/). Every call is optional so the lobby works before and after
// that code lands:
//
//   rider.setEquipment?.(type)                 'skis' | 'snowboard'  — swap the rider's gear
//   player.setEquipment?.(type)                                     — swap the physics model
//   createEquipmentModel(type, variant)        from any module in src/equipment/ (auto-discovered)
//
// applyEquipment() returns 'native' when the rider handled it, otherwise 'unsupported' and the
// caller decides on a fallback (the lobby preview shows a labelled placeholder board).

// Optional modules: resolves to {} today; picks up src/equipment/*.js automatically once it exists.
const equipmentModules = import.meta.glob('../equipment/*.js');
let factoryPromise = null;

/** createEquipmentModel(type, variant) from src/equipment/, or null when it does not exist yet. */
export function loadEquipmentFactory() {
  if (!factoryPromise) {
    factoryPromise = (async () => {
      for (const load of Object.values(equipmentModules)) {
        try {
          const m = await load();
          if (typeof m.createEquipmentModel === 'function') return m.createEquipmentModel;
        } catch (e) { console.warn('[equipment] module failed to load', e); }
      }
      return null;
    })();
  }
  return factoryPromise;
}

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
