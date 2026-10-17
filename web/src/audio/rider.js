// Reads the rider (player.js) into the plain numbers the audio engine runs on. Read-only: nothing here
// touches physics. The same object comes out of the headless trace recorder (scripts/audio-trace.mjs),
// so the audio test can replay real rides through the engine offline.

export const ST = { NONE: 0, GROUND: 1, AIR: 2, CRASH: 3, LIFT: 4, GRIND: 5 };
const G = 9.81;

/**
 * @param {object} p  the Player (player.js)
 * @param {object} [o] { paused, menu }
 * @returns {object} speed m/s, edge rad (|edge angle|), edgeSign, skid rad (|slip angle|), load g, stop 0..1,
 *   surface weights groomed / powder / rock / extra (0..1), deep 0..1, sink m, spin / flip rad/s, grab 0..1,
 *   air s, tuck 0..1, board 0|1, st (ST.*), grindV m/s, grindKind
 */
export function readRider(p, o = {}) {
  const s = p.surface || { x: 1, y: 0, z: 0, w: 0 };
  const st = o.menu ? ST.NONE : p.state === 2 ? ST.AIR : p.state === 1 ? ST.GROUND : p.state === 3 ? ST.CRASH : p.state === 4 ? ST.LIFT : p.state === 5 ? ST.GRIND : ST.NONE;
  const lat = p.latAccel || 0;
  const g = st === ST.GRIND ? p.grind?.g : null;
  return {
    st,
    speed: st === ST.LIFT || st === ST.NONE ? 0 : p.speed || 0,
    vy: p.velocity?.y || 0,
    edge: Math.abs(p.edgeAngle || 0),
    edgeSign: Math.sign(p.edgeAngle || 0),
    skid: Math.min(Math.PI / 2, Math.abs(p.skidAngle || 0)),
    skidAmt: p.skid || 0,
    carve: p.carve || 0,
    cq: p.carveQuality ?? 1,
    load: Math.sqrt(1 + (lat / G) ** 2) + Math.min(2, (p.compression || 0) * 0.15),
    stop: Math.max(p.stop || 0, (p.plow || 0) * 0.5),
    brake: p.brake || 0,
    groomed: s.x, powder: s.y, rock: s.z, extra: s.w,
    deep: p.powder || 0,
    sink: p.sink || 0,
    spin: p.spinRate || 0,
    flip: p.flipRate || 0,
    grab: p.grab || 0,
    air: p.airTime || 0,
    tuck: p.tuck || 0,
    board: p.equipment?.type === 'snowboard' ? 1 : 0,
    butter: Math.abs(p.butter || 0) + Math.abs(p.press || 0),
    grindV: g ? g.v || 0 : 0,
    grindKind: g ? g.rail?.kind || 'rail' : '',
    grindHop: g ? (g.hop ? 1 : 0) : 0,
  };
}
