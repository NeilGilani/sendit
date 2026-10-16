// Ravenspire — the layout: every feature of the face in one place (metres, degrees).
// Local frame: u = metres down the fall line from the start (world x = START_X + u, the face falls
// toward +x / east), v = metres across it (world z; + = skier's right when looking downhill, south).
// Sun from the south-south-east: the face is cross-lit from the right, so spines, pillows and cliff
// lips read with a lit and a shaded side.

export const TILE = { size: 3072, res: 2049, farSize: 30000, farRes: 512 };
export const START_X = -1260;           // world x of the heli drop (u = 0)
export const TOP = 3340;                // m elevation at the start
export const FINISH_U = 2540;           // "run complete" (metres down the fall line)

// Fall-line gradient profile from the start: [length m, degrees]. Smoothed ±15 m.
export const PROFILE = [
  [16, 11],     // heli shoulder on the summit ridge (steep enough to get going in deep powder)
  [40, 26],     // the rollover into the face
  [470, 41],    // upper face: spines left, open face centre, couloir right → band A
  [400, 38],    // mid face: pillow field left, the Hammer buttress right
  [380, 41],    // the Stacks: bands B, C, D add their benches on top of this
  [300, 34],    // apron, the station cliff and the old lift station
  [430, 27],    // lower bowl: wind lips, rollers, the refuge
  [330, 19],    // the larches
  [320, 10],    // runout: A-frames and the valley station
  [500, 5], [9000, 2],
];
export const BEHIND = [[22, 3], [260, -31], [9000, -9]];   // behind the start (negative = falling away backward)

// Face width: ridge crest distance from the centre line, and the ridge height above the centre.
export const FACE = {
  halfWidth: (u) => 380 + 0.47 * Math.min(Math.max(u, 0), 1350) + 0.25 * Math.max(0, u - 1800),
  ridgeHeight: (u) => 22 + 0.13 * Math.min(Math.max(u, 0), 1300) + 0.12 * Math.max(0, u - 1700),
  bowlPower: 2.3,
};

// Cliff bands. uc = lip position (u), [v0, v1] lateral extent, h = height (m), var = ± variation,
// bench = metres above the lip that flatten into it (the approach), gaps = [v, halfWidth] ramp-arounds.
export const BANDS = [
  { name: 'Band A', uc: 548, v0: -250, v1: 105, h: 11, var: 4, bench: 55, wob: 7, seed: 1, gaps: [[-95, 22], [120, 18]] },
  { name: 'The First Stack', uc: 990, v0: -215, v1: 170, h: 15, var: 4, bench: 50, wob: 6, seed: 2, gaps: [[60, 16]] },
  { name: 'The Throne', uc: 1160, v0: -250, v1: 185, h: 18, var: 5, bench: 55, wob: 5, seed: 3, gaps: [[-200, 18], [150, 16]], peak: [-40, 10, 38] },
  { name: 'The Last Stack', uc: 1330, v0: -190, v1: 150, h: 14, var: 5, bench: 48, wob: 6, seed: 4, gaps: [[-150, 16]] },
  { name: 'Station Cliff', uc: 1418, v0: 205, v1: 362, h: 17, var: 2, bench: 46, wob: 3, seed: 5, gaps: [] },
  { name: 'The Hammer', uc: 905, v0: 630, v1: 775, h: 36, var: 6, bench: 70, wob: 6, seed: 6, gaps: [] },
  { name: 'Left Ledges', uc: 1150, v0: -490, v1: -265, h: 10, var: 4, bench: 40, wob: 8, seed: 7, gaps: [[-420, 15], [-330, 12]] },
  { name: 'Beak Steps', uc: 765, v0: 215, v1: 350, h: 8, var: 3, bench: 35, wob: 6, seed: 8, gaps: [[300, 12]] },
  { name: 'East Ledges', uc: 1185, v0: 470, v1: 700, h: 9, var: 4, bench: 40, wob: 8, seed: 9, gaps: [[560, 14]] },
  { name: 'West Ledges', uc: 870, v0: -700, v1: -520, h: 8, var: 3, bench: 35, wob: 7, seed: 10, gaps: [[-610, 14]] },
  { name: 'Lower Steps', uc: 1705, v0: 330, v1: 470, h: 7, var: 2, bench: 32, wob: 6, seed: 11, gaps: [] },
];

// Spine field (skier's left of the upper face).
export const SPINES = { u0: 110, u1: 800, v0: -0.92, v1: -0.46, spacing: 30, height: 13, wander: 14 };

// Pillow fields: extent, rows of rounded domes (size scale), and optional terraces: the slope is
// turned into stacked steps `step` m apart with flat-ish tops and ~5 m drops (terrace = share of the
// slope taken out of each top), wavy across the field so the pillows stagger.
export const PILLOWS = [
  { u0: 1560, u1: 1800, v0: -470, v1: -250, rows: 0, size: 0.6, seed: 11, step: 8, terrace: 0.55, lobe: 8 },
  { u0: 2030, u1: 2290, v0: -560, v1: -360, rows: 0, size: 0.6, seed: 12, step: 7, terrace: 0.55, lobe: 7 },
  { u0: 610, u1: 780, v0: 520, v1: 610, rows: 6, size: 0.8, seed: 13 },
];

// The ravine: centre line v(u), floor half-width, depth, natural ledges in the floor.
export const RAVINE = {
  u0: 400, u1: 2260,
  centre: (u) => 405 + 62 * Math.sin((u - 400) / 230) + 22 * Math.sin(u / 83 + 1) + 70 * bump(u, 1495, 120),
  floor: (u) => 7 + 10 * smoothRange(u, 560, 900) + 5 * smoothRange(u, 1800, 2100),
  depth: (u) => 54 * smoothRange(u, 400, 760) * (1 - smoothRange(u, 1700, 2260)),
  wall: (u) => 9 + 26 * (0.5 + 0.5 * Math.sin(u / 170 + 2.1)),
  ledges: [[880, 5], [1135, 4], [1330, 6], [1690, 4.5]],   // [u, drop m]
};

// Natural hits: rollers (symmetric) and wind lips (gentle up, abrupt down) across the fall line.
// [u, v, half-length across (m), height (m), kind]
export const HITS = [
  [1610, -110, 120, 2.6, 'roller'],
  [1690, -150, 26, 3.2, 'lip'],
  [1735, 70, 22, 2.6, 'lip'],
  [1835, -40, 30, 3.8, 'lip'],
  [1990, 170, 26, 3.0, 'lip'],
  [2045, -260, 34, 2.8, 'lip'],
  [2130, 40, 140, 2.2, 'roller'],
  [700, -60, 20, 2.0, 'lip'],
  [340, 60, 26, 2.4, 'lip'],
];

// Old buildings. u, v = centre; yaw: rotation of the long axis away from the fall line (rad);
// L = length along it, W = width, roof: 'mono' (falls downhill), 'gable' (ridge across), 'aframe'.
export const BUILDINGS = [
  { id: 'station', name: 'Old Lift Station', u: 1497, v: 288, L: 36, W: 17, roof: 'mono', pitch: 30, eave: 5.5, drift: 1.0, chimney: null },
  { id: 'refuge', name: 'Corvo Refuge', u: 1880, v: -175, L: 15, W: 12, roof: 'gable', pitch: 33, eave: 4.6, drift: 0.85, chimney: [0.2, 0.62] },
  { id: 'aframe1', name: 'A-frame', u: 2290, v: 120, L: 10, W: 9, roof: 'aframe', pitch: 56, eave: 0, drift: 0.6, chimney: null },
  { id: 'aframe2', name: 'A-frame', u: 2318, v: 162, L: 9, W: 8.5, roof: 'aframe', pitch: 56, eave: 0, drift: 0.55, chimney: [0.0, -0.6], yaw: 0.25 },
  { id: 'aframe3', name: 'A-frame', u: 2272, v: 205, L: 9, W: 8, roof: 'aframe', pitch: 56, eave: 0, drift: 0.6, chimney: null, yaw: -0.2 },
  { id: 'valley', name: 'Valley Station', u: 2400, v: 300, L: 22, W: 13, roof: 'gable', pitch: 26, eave: 5, drift: 0.4, chimney: null },
];

// The abandoned gondola: from the old station down to the valley station.
export const GONDOLA = { from: [1528, 288], to: [2392, 300], towers: 6, height: 14, cabins: [0.38, 0.71] };

function bump(x, c, w) { const t = (x - c) / w; return Math.exp(-t * t); }
function smoothRange(x, a, b) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Rock buttresses: sharp aretes along the fall line that split the face into separate lines.
// v0 → v1 = crest position at u0 → u1, w = half-width at the foot, h = height above the face.
export const BUTTRESSES = [
  { name: "Raven's Beak", u0: 120, u1: 780, v0: 120, v1: 205, w: 58, h: 40, seed: 1 },
  { name: 'Spine Rib', u0: 70, u1: 560, v0: -290, v1: -345, w: 42, h: 24, seed: 2 },
  { name: 'West Spur', u0: 1280, u1: 1760, v0: -640, v1: -575, w: 62, h: 30, seed: 3 },
];
