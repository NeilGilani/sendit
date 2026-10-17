// Mountains + trails for maps whose registerMap call is owned by another module (docs/maps.md).
// adaptMap() only fills what the map's own registration left out, so once a map declares its own
// `mountain` / `trails`, its data wins and the entry here is ignored.
import { adaptMap } from './registry.js';

// ---------------------------------------------------------------- Voltage Park (maps/voltage/)
// Trails start at the park's drop zones (course.dropZones, matched by name prefix). Current Lane has
// no drop zone yet: it falls back to `at` (world: START_X + 40 along the fall line, v = 125 across).
adaptMap('voltage-park', {
  mountain: {
    id: 'voltage-park', name: 'Voltage Park', region: 'Event terrain park · night session',
    blurb: 'Floodlit park built for contests: a slopestyle course, three lanes, a jib garden, a superpipe and a big air tower.',
    accent: '#ff3d9a',
  },
  trails: [
    { id: 'slopestyle', name: 'Slopestyle Course', difficulty: 'park', featured: true, dropZone: 'Start Gate', length: 790, vertical: 230,
      description: 'Three rail sections, then Lightning, Thunder and Voltage. The judges are watching.' },
    { id: 'rail-surge', name: 'Rail Section 2 · Surge', difficulty: 'park', dropZone: 'Rail Section 2', length: 690, vertical: 200,
      description: 'Drop in at the second rail section and keep the combo alive.' },
    { id: 'rail-overload', name: 'Rail Section 3 · Overload', difficulty: 'park', dropZone: 'Rail Section 3', length: 620, vertical: 180,
      description: 'The last and biggest rail section, then the jump line.' },
    { id: 'jump-line', name: 'Jump Line', difficulty: 'park', featured: true, dropZone: 'Jump Line', length: 470, vertical: 140,
      description: 'Lightning, Thunder, Voltage: three big tables back to back.' },
    { id: 'big-air', name: 'The Tower · Big Air', difficulty: 'park', featured: true, dropZone: 'The Tower', length: 470, vertical: 150,
      description: 'Drop off the scaffold deck into the biggest kicker in the park. One hit, make it count.' },
    { id: 'superpipe', name: 'The Conduit · Superpipe', difficulty: 'park', dropZone: 'The Conduit', length: 440, vertical: 130,
      description: 'A 22 ft pipe: pump the walls and go above the deck.' },
    { id: 'spark-lane', name: 'Spark Lane', difficulty: 'park', dropZone: 'Spark Lane', level: 'small', length: 760, vertical: 210,
      description: 'Small lane: little jumps and friendly boxes to learn on.' },
    { id: 'current-lane', name: 'Current Lane', difficulty: 'park', dropZone: 'Current Lane', at: { x: -340, z: 125, heading: -Math.PI / 2 }, level: 'medium', length: 760, vertical: 210,
      description: 'Medium lane: mid-size tables, step-ups and a hip.' },
    { id: 'high-voltage', name: 'High Voltage', difficulty: 'park', dropZone: 'High Voltage', level: 'pro', length: 500, vertical: 150,
      description: 'Pro lane: the big tables and the biggest rails outside the course.' },
    { id: 'the-grid', name: 'The Grid · Jib Garden', difficulty: 'park', dropZone: 'The Grid', level: 'small', length: 750, vertical: 210,
      description: 'A garden of rails, kinks and boxes. Link them.' },
  ],
});
