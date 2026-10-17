// Mountains + trails for maps whose registerMap call is owned by another module (docs/maps.md).
// adaptMap() only fills what the map's own registration left out, so once a map declares its own
// `mountain` / `trails`, its data wins and the entry here is ignored.
import { adaptMap } from './registry.js';

// ---------------------------------------------------------------- Voltage Park (maps/voltage/)
// Voltage Park declares its own trails (maps/voltage/layout.js TRAILS + course.trailSpawn), so registry adaptMap()
// keeps those and only takes the mountain card from here. The list below mirrors them for reference (same ids).
adaptMap('voltage-park', {
  mountain: {
    id: 'voltage-park', name: 'Voltage Park', region: 'Event terrain park · night session',
    blurb: 'A fast floodlit contest park: a slopestyle course to the Megawatt mega kicker and a road gap, stacked lanes, spines, a superpipe and a big air tower.',
    accent: '#ff3d9a',
  },
  trails: [
    { id: 'slopestyle', name: 'Slopestyle Course', difficulty: 'park', featured: true, dropZone: 'Start Ramp', length: 1145, vertical: 385,
      description: 'Start ramp, three rail sections, Lightning, Thunder, Voltage, Megawatt and the road gap: the judged run.' },
    { id: 'spark', name: 'Spark Lane', difficulty: 'green', length: 1110, vertical: 368, description: 'The flow lane: small tables, boxes, a stacked double, rollers, a side hit and a quarterpipe.' },
    { id: 'current', name: 'Current Lane', difficulty: 'blue', dropZone: 'Triple Stack', length: 1110, vertical: 368, description: 'Rails on the benches, then the Triple Stack, a step-down and the transfer hip into High Voltage.' },
    { id: 'high-voltage', name: 'High Voltage', difficulty: 'black', featured: true, dropZone: 'High Voltage', length: 1110, vertical: 368, description: 'Pro rails, two big tables, the Canal gap, a step-up and the 5 m quarterpipe.' },
    { id: 'grid', name: 'The Grid', difficulty: 'park', length: 1100, vertical: 362, description: 'A jib garden: 16 boxes, tubes and rails in rows.' },
    { id: 'stairway', name: 'The Stairway', difficulty: 'black', dropZone: 'The Stairway', length: 768, vertical: 271, description: 'Step-down, step-up, step-down, then over the Stairway Spine.' },
    { id: 'hip-row', name: 'Hip Row', difficulty: 'blue', length: 680, vertical: 229, description: 'Four hips down the left side of the park.' },
    { id: 'superpipe', name: 'The Conduit', difficulty: 'black', dropZone: 'The Conduit', length: 651, vertical: 219, description: 'A 22 ft superpipe, 240 m long.' },
    { id: 'big-air', name: 'The Tower', difficulty: 'double-black', featured: true, dropZone: 'The Tower', length: 679, vertical: 228, description: 'A 33 m scaffold big air: 93 km/h on the in-run, 3 s in the air.' },
  ],
});
