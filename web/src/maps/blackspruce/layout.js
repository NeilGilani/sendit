// Blackspruce Plunge — the hand-designed layout. Everything here is in run coordinates:
//   t = metres down the fall line from the start gate (world z = startZ − t),
//   d = metres across it from the run's centre line (+ = skier's right = world +x).
// The course (course.js) turns this into a height field; the forest (forest.js) plants around it.
// Layout rules (from docs/map2-research.md): main lanes leave ≥ 0.3·v of free corridor, slots
// ≥ 0.12·v, a turn every ~1.5 s, a rest beat (clearing + gate) every 12–18 s, jumps only in
// clearings with a straight run-in and a tree-free landing.

export const BLACKSPRUCE = {
  tileSize: 2560,                // metres — high-res playable tile (1.25 m grid)
  tileRes: 2049,
  farSize: 30000,                // metres — low-res backdrop
  farRes: 512,
  startZ: 1160,                  // world z of the start gate
  topElevation: 2780,
  finishT: 1975,                 // run complete here (metres down the fall line)
  // Fall-line gradient profile [length m, degrees]. Steep tree sections broken by flatter
  // clearings (rest beats, kickers, gates).
  profile: [
    [40, 10],    //    0  start gate
    [30, 21],    //   40  roll-in
    [110, 29],   //   70  The Drop-in (open, scattered old trees)
    [250, 32],   //  180  Spruce Gate glade
    [50, 15],    //  430  Kicker Meadow (clearing 1)
    [70, 30],    //  480  landing pitch
    [260, 34],   //  550  The Needles (dense)
    [30, 31],    //  810  rock band (cliff at BAND.t)
    [90, 14],    //  840  Pillow Garden (clearing 2)
    [300, 30],   //  930  Deadfall (logs)
    [245, 36],   // 1230  The Gauntlet (steepest)
    [55, 16],    // 1475  Big Air clearing (clearing 3)
    [70, 30],    // 1530  landing pitch
    [300, 28],   // 1600  Old Growth
    [100, 15],   // 1900  finish slope
    [220, 8],    // 2000  runout
    [3000, 4],
    [20000, 1],
  ],
  gradeSmooth: 14,               // ± metres of smoothing between profile segments
  behindGradient: 32,            // the bowl rising behind the start
  meander: [[30, 210, 0.4], [10, 80, 1.3]],   // [amplitude m, wavelength/2π m, phase] of the centre line
  faceHalfWidth: [100, 18],      // forested face: base ± variation (metres either side of the centre)
  dish: 6,                       // metres the face rises toward its edges (keeps riders in the middle)
  ribs: 0.3,                     // metres of fall-line ribs across the face (gentle side hits)
  ribWave: 34,                   // metres between ribs
  lumps: 1.0,                    // soft rolling lumps (kept low: in the trees you need the snow to steer)
  fineLumps: 0.15,
  wallHeight: [34, 22],          // wooded spines bounding the face: base, variation
  wallWidth: [40, 70],
  valleySideSlope: 0.42,
  mountainHeight: 1150,
  sideRibs: 70,
  horn: { x: 900, z: -9800, peak: 4300, slope: 1.1, twist: 0.3 },
};

// The rock band: a cliff across the face with chutes through it. Riders drop the cliff (fast, ~1 s
// of air) or take a chute (steep ramp, no air).
export const BAND = {
  t: 812,                        // cliff edge
  drop: 4.5,                     // metres
  ramp: [-8, 24],                // chute ramp (t relative to the cliff) that carries the same drop
  reach: 72,                     // |d| where the cliff fades into steep rocky forest
  chutes: [[1.5, 3.4], [24, 6]],   // [d centre, half-width]: the Notch (main) and the Ramp (safe)
};

// Clearings: [t, d, halfLength (along t), halfWidth (along d)] ellipses kept tree-free. They are
// the rest beats; every one holds a challenge gate.
export const CLEARINGS = [
  [10, 0, 55, 34],               // start
  [452, 0, 44, 32],              // Kicker Meadow
  [505, 0, 34, 15],              //   … its landing
  [878, 0, 52, 40],              // Pillow Garden
  [1500, 0, 36, 32],             // Big Air clearing
  [1560, 0, 42, 15],             //   … its landing
  [1955, 0, 70, 46],             // finish
  // small breathers inside the long tree sections (glade pockets, no gate)
  [300, -4, 16, 16],
  [680, 2, 14, 14],
  [1080, 0, 15, 15],
  [1350, 2, 12, 12],
  [1750, 0, 16, 18],
];

// Sections: tree spacing (Poisson min distance, m), size range, crown slenderness and pivots.
//   spacing: trunk-to-trunk minimum in the open forest between lanes
//   scale:   tree scale range (11 m tall at 1)       slim: crown width / height factor
//   pivotEvery: metres between pivot obstacles placed in the middle of main / safe lanes
export const SECTIONS = [
  { name: 'Start', t0: -80, t1: 70, spacing: 12, scale: [1.0, 1.4], slim: 0.85, pivotEvery: 0 },
  { name: 'The Drop-in', t0: 70, t1: 180, spacing: 9, scale: [1.0, 1.45], slim: 0.85, pivotEvery: 0 },
  { name: 'Spruce Gate', t0: 180, t1: 430, spacing: 5.4, scale: [0.8, 1.25], slim: 0.75, pivotEvery: 42 },
  { name: 'Kicker Meadow', t0: 430, t1: 550, spacing: 7, scale: [0.9, 1.3], slim: 0.8, pivotEvery: 0 },
  { name: 'The Needles', t0: 550, t1: 812, spacing: 4.6, scale: [0.7, 1.1], slim: 0.68, pivotEvery: 36 },
  { name: 'Rock Band', t0: 812, t1: 840, spacing: 7, scale: [0.8, 1.2], slim: 0.72, pivotEvery: 0 },
  { name: 'Pillow Garden', t0: 840, t1: 930, spacing: 7, scale: [0.9, 1.3], slim: 0.8, pivotEvery: 0 },
  { name: 'Deadfall', t0: 930, t1: 1230, spacing: 5.0, scale: [0.75, 1.2], slim: 0.72, pivotEvery: 48 },
  { name: 'The Gauntlet', t0: 1230, t1: 1475, spacing: 4.3, scale: [0.7, 1.05], slim: 0.66, pivotEvery: 40 },
  { name: 'Big Air', t0: 1475, t1: 1600, spacing: 7, scale: [0.9, 1.3], slim: 0.8, pivotEvery: 0 },
  { name: 'Old Growth', t0: 1600, t1: 1900, spacing: 7.2, scale: [1.15, 1.55], slim: 0.82, pivotEvery: 34 },
  { name: 'Finish', t0: 1900, t1: 2300, spacing: 11, scale: [1.0, 1.4], slim: 0.85, pivotEvery: 0 },
];

// Lanes: clear corridors through the forest. Control points [t, d, half-width]; `hw` is the clear
// half-width between the lane centre and the nearest tree's hitbox. On top of the control points a
// lane weaves (`weave` = [amplitude m, wavelength m]) so the line asks for a turn every ~1.5 s.
//   main — the flow line (the course path: gates, progress, kickers follow it). hw ≈ 4 → ~7 m free
//   slot — tight and fast: nearly straight, hw ≈ 2.2 → ~3.7 m free for the rider's centre
//   safe — wide and slower: hw ≈ 5.5, longer wander, takes the chute instead of the cliff
export const LANES = [
  {
    id: 'main', kind: 'main', weave: [2.6, 84],
    pts: [[-80, 0, 10], [60, 0, 10], [120, -3, 8], [180, 0, 5], [240, 7, 4.2], [300, 0, 4.4], [370, -7, 4.2], [430, -2, 6],
      [470, 0, 10], [540, 0, 8], [582, 4, 4.2], [640, -3, 4], [700, 5, 4], [770, -2, 4.2], [800, 1.5, 4], [818, 1.5, 4],
      [845, 0, 10], [920, 0, 9], [960, 6, 4.4], [1030, -5, 4.4], [1100, 5, 4.4], [1170, -5, 4.4], [1225, 0, 5],
      [1270, 6, 4], [1330, -4, 3.8], [1400, 5, 3.8], [1450, -1, 4], [1478, 0, 8], [1530, 0, 10], [1600, 0, 6],
      [1660, 8, 5.2], [1730, -7, 5.2], [1800, 7, 5.2], [1860, -3, 5.2], [1905, 0, 9], [2300, 0, 14]],
  },
  // Spruce Gate (side lanes branch off the main line ('m') and merge back into it)
  { id: 'gate-slot', kind: 'slot', weave: [1.2, 90], pts: [[178, 'm', 4.5], [215, -12, 2.6], [250, -16, 2.4], [300, -17, 2.3], [380, -15, 2.4], [420, -9, 3], [436, 'm', 5]] },
  { id: 'gate-safe', kind: 'safe', weave: [2.4, 96], pts: [[178, 'm', 5.5], [225, 20, 5.5], [310, 18, 5.5], [380, 28, 5.5], [420, 14, 6], [436, 'm', 7]] },
  // The Needles: the slot runs straight at the cliff; the safe line wanders to the Ramp chute.
  { id: 'needles-slot', kind: 'slot', weave: [1.0, 100], pts: [[540, 'm', 5], [580, -14, 2.4], [660, -17, 2.2], [740, -15, 2.2], [790, -12, 2.4], [815, -12, 3], [842, -8, 5]] },
  { id: 'needles-safe', kind: 'safe', weave: [2.4, 96], pts: [[540, 'm', 5.5], [590, 20, 5.2], [660, 18, 5.2], [730, 30, 5.2], [790, 24, 6], [842, 22, 6.5]] },
  // Deadfall: logs lie across both the main line and the high line; the low line goes around them.
  { id: 'deadfall-slot', kind: 'slot', weave: [1.2, 100], pts: [[928, 'm', 5], [965, 16, 2.5], [1060, 20, 2.3], [1160, 17, 2.3], [1210, 9, 3], [1234, 'm', 5]] },
  { id: 'deadfall-safe', kind: 'safe', weave: [2.4, 96], pts: [[926, 'm', 5.5], [970, -20, 5.3], [1050, -16, 5.2], [1130, -27, 5.2], [1200, -16, 5.5], [1234, 'm', 6]] },
  // The Gauntlet: tight chute line vs the zig.
  { id: 'gauntlet-slot', kind: 'slot', weave: [0.8, 110], pts: [[1232, 'm', 4.5], [1265, -14, 2.3], [1340, -18, 2.1], [1420, -16, 2.1], [1450, -12.5, 3.0], [1474, -6, 4.4], [1492, 'm', 6]] },
  { id: 'gauntlet-safe', kind: 'safe', weave: [2.2, 96], pts: [[1232, 'm', 5], [1275, 20, 4.8], [1340, 16, 4.8], [1400, 26, 4.8], [1455, 13, 5.5], [1482, 'm', 7]] },
  // Old Growth: a second flowing line on the left.
  { id: 'oldgrowth-left', kind: 'safe', weave: [2.4, 90], pts: [[1598, 'm', 5.5], [1640, -18, 5], [1720, -27, 5], [1800, -20, 5], [1880, -12, 5.5], [1910, 'm', 7]] },
];

// Pillows (smooth snow mounds over buried boulders / stumps): [t, d, radius m, height m].
export const PILLOWS = [
  // Pillow Garden: a staggered field either side of the line, a stack on the right to send.
  [850, -14, 4.2, 1.6], [858, -24, 3.6, 1.3], [866, 12, 4.8, 1.9], [874, -9, 3.4, 1.2], [884, 20, 4, 1.6],
  [890, -18, 4.4, 1.8], [898, 9, 3.6, 1.4], [906, 26, 4.2, 1.7], [912, -26, 3.8, 1.4],
  [862, 27, 3.6, 1.5], [872, 32, 3.2, 1.2],
  // pillows tucked into the Old Growth between the big trees
  [1640, 12, 3.4, 1.2], [1695, -15, 3.6, 1.3], [1770, 14, 3.2, 1.1], [1830, -14, 3.4, 1.2], [1870, 16, 3.0, 1.0],
  // a couple in the Drop-in
  [110, 14, 4, 1.4], [140, -16, 4.2, 1.5],
];

// Rollers across the line (natural air at speed): [t, d centre, half-width, height, sigma along t].
export const ROLLERS = [
  [95, 0, 22, 1.5, 6],
  [160, 0, 20, 1.3, 5.5],
  [1925, 0, 22, 1.4, 6],
];

// Fallen logs: [t, d, angle (rad from straight across the slope), length m, radius m]. Snow drifts
// against the uphill side, so each log is a small natural kicker (ollie it or roll it).
export const LOGS = [
  [952, 6, 0.18, 10, 0.52], [994, -4, -0.22, 10.5, 0.56], [1040, 2, 0.12, 11, 0.55], [1088, 3, -0.15, 9.5, 0.5],
  [1128, -6, 0.2, 10.5, 0.56], [1190, 2, -0.1, 10, 0.52],
  // on the high line
  [985, 19, 0.1, 8, 0.46], [1072, 20, -0.12, 8.5, 0.48], [1140, 17, 0.14, 8, 0.46],
  // a few in the Old Growth
  [1685, 5, 0.25, 9.5, 0.6], [1790, -6, -0.2, 10, 0.6],
];

// Kickers (features.js): at = t of the kicker's take-off (converted to path length), shaped ramps.
export const KICKERS = [
  { t: 446, lateral: 0, L: 8.5, H: 2.2, W: 6, name: 'M', signature: true },
  { t: 452, lateral: -16, L: 6, H: 1.3, W: 5, name: 'S', signature: false },
  { t: 1497, lateral: 0, L: 11, H: 3.2, W: 7, name: 'L', signature: true },
  { t: 1503, lateral: 15, L: 7.5, H: 1.8, W: 5.5, name: 'M', signature: false },
];

// Challenge checkpoints: [t, width m]. All lines converge through them (clearings / band exits).
export const GATES = [[176, 16], [428, 20], [532, 16], [848, 24], [928, 22], [1228, 18], [1476, 20], [1590, 16], [1902, 22]];

// Golden snowflakes: [t, d, height above the snow]. Risk pays: most sit on the slots, over the
// cliff and the kickers.
export const FLAKES = [
  [130, -16, 1.2], [300, -17, 1.2], [470, 0, 5.4], [700, -16, 1.2], [818, -12, 3.2], [880, 12, 3.4],
  [1100, 20, 1.2], [1180, -27, 1.2], [1380, -17, 1.2], [1525, 0, 6.5], [1725, -27, 1.2], [1840, 7, 1.2],
];

// Stumps (snow-capped, they collide): scattered off the lines, a few at lane edges.
export const STUMPS = { perSection: { Deadfall: 26, 'The Gauntlet': 10, 'Old Growth': 18, 'Spruce Gate': 10, 'The Needles': 10 } };
