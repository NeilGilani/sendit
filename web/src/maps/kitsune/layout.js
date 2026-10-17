// Kitsune Peak (map 6): the layout, every feature of the mountain in one place (metres, degrees).
// Local frame (same as Ravenspire's): u = metres down the fall line from the crater rim (world x =
// START_X + u; the mountain falls toward +x / east), v = metres across it (world z; + = skier's right
// looking downhill, south). The volcano's crater sits behind the start (u < 0).
//
//   skier's left (v < 0)             centre                         skier's right (v > 0)
//   Makura pillows / cliffs  ·  Okama Bowl → Shirakaba birches  ·  Kazan Rim ridge · Kitsunebi gully · gondola
//                       the shrine village bench (u 1510–1910): torii tunnel, hall, pagoda, ryokans, onsen
//                       fir gullies → the base village and the finish torii (u 2440)

export const TILE = { size: 3072, res: 2049, farSize: 30000, farRes: 512 };
export const START_X = -1150;          // world x of the crater-rim saddle (u = 0): the whole crater fits in the tile
export const TOP = 3000;               // m elevation at the start (base ≈ 1850 m: just above the engine's valley mist)
export const FINISH_U = 2440;          // "run complete" (metres down the fall line)

// Fall-line gradient profile from the start: [length m, degrees]. Smoothed ±15 m.
export const PROFILE = [
  [18, 9],      // the rim saddle
  [45, 25],     // rollover off the crater rim
  [480, 33],    // Okama Bowl (the summit bowl)        u 63–543
  [360, 28],    // upper mid-mountain                  u 543–903
  [430, 31],    // Makura pillows / Shirakaba steeps   u 903–1333
  [180, 23],    //                                     u 1333–1513
  [400, 16],    // the shrine village bench            u 1513–1913
  [320, 23],    // the fir gullies                     u 1913–2233
  [260, 11],    // runout to the base village          u 2233–2493
  [500, 5], [9000, 2],
];
export const BEHIND = [[22, 4], [9000, -24]];   // behind the start (the cone's flank; the crater is cut into it)

// The volcano. The crater's centre is behind the start; its rim is lowest on the face side (the saddle
// you drop from) and rises toward the back. Outside the face the cone falls away radially (~33°).
export const CRATER = { u: -178, v: 10, R: 165, floor: 85, rimRise: 175, coneSlope: 0.66 };

// Face width: ridge crest distance from the centre line, and the ridge height above the centre.
export const FACE = {
  halfWidth: (u) => 260 + 0.85 * clamp(u, 0, 650) + 0.15 * Math.max(0, u - 650),
  ridgeHeight: (u) => 26 + 0.07 * clamp(u, 0, 1400),
  bowlPower: 2.4,
};

// Kazan Rim: the volcano-rim rollercoaster. A narrow ridge spine down the skier's right of the face,
// crest at v(u), `h` m above the face, a rounded `top` m wide crest with whoops (rollers you pop off),
// and step-down gaps (the crest breaks `drop` m at u, a short flat bench above each).
export const KAZAN = {
  u0: 25, u1: 1500,
  crest: (u) => interp(u, [[25, 110], [300, 205], [700, 255], [1100, 265], [1500, 225]]),
  height: (u) => 22 * sstep(25, 140, u) * (1 - sstep(1250, 1500, u)) * (0.85 + 0.15 * Math.sin(u / 190)),
  top: 9,                  // half-width of the rounded crest
  flank: 34,               // m from the crest edge to the foot of the ridge
  whoop: { wave: 40, amp: 2.3, from: 140, to: 1280 },
  gaps: [[520, 6], [860, 7], [1150, 6]],   // [u, drop m]
};

// Kitsunebi Gully: a lantern-lined natural half-pipe on the right, from the gondola top station down to
// the village. centre v(u), floor half-width, depth, wall width (the quarter-pipe transition).
export const GULLY = {
  u0: 430, u1: 1560,
  centre: (u) => 420 + 38 * Math.sin((u - 430) / 190) - 25 * sstep(1300, 1560, u),
  floor: (u) => 6 + 3 * sstep(430, 700, u),
  depth: (u) => 13 * sstep(430, 560, u) * (1 - sstep(1420, 1560, u)),
  wall: 15,
  ledges: [[760, 3], [1040, 4], [1290, 6, 'Fox Fire Drop']],   // [u, drop m, name?]: step-downs in the gully floor
};

// Cliff bands. uc = lip position (u), [v0, v1] lateral extent, h = height (m), var = ± variation,
// bench = metres above the lip that flatten into it, gaps = [v, halfWidth] ramp-arounds.
export const BANDS = [
  { name: 'Okama Lip', uc: 600, v0: -170, v1: 60, h: 6, var: 1.5, bench: 30, wob: 6, seed: 1, gaps: [[20, 16]] },
  { name: 'Makura Cliff', uc: 990, v0: -560, v1: -380, h: 9, var: 2.5, bench: 36, wob: 5, seed: 2, gaps: [[-505, 12]] },
  { name: 'Fox Ledge', uc: 1355, v0: -440, v1: -150, h: 8, var: 2, bench: 34, wob: 6, seed: 3, gaps: [[-200, 14]] },
  { name: 'Ash Steps', uc: 760, v0: -660, v1: -560, h: 7, var: 2, bench: 30, wob: 6, seed: 4, gaps: [] },
];

// Pillow fields: terraced stacks (the slope stepped `step` m apart, ~5 m rolling drops, lobed across the
// field so the pillows stagger) and rows of mushroom domes on top.
export const PILLOWS = [
  { name: 'Makura Pillows', u0: 690, u1: 950, v0: -520, v1: -350, rows: 0, size: 0.6, seed: 11, step: 9, terrace: 0.6, top: 0.68, lobe: 9 },
  { name: 'Makura Stacks', u0: 1040, u1: 1310, v0: -500, v1: -330, rows: 0, size: 0.6, seed: 12, step: 10, terrace: 0.65, top: 0.66, lobe: 10 },
  { name: 'Mochi Field', u0: 440, u1: 560, v0: -330, v1: -230, rows: 4, size: 0.75, seed: 13 },
];

// Natural hits: rollers (symmetric) and wind lips (gentle up, abrupt down) across the fall line.
// [u, v, half-length across (m), height (m), kind, name?]
export const HITS = [
  [230, -110, 26, 2.4, 'lip', 'Okama Wind Lip'],
  [360, 40, 30, 2.6, 'lip', 'Okama Wind Lip'],
  [470, -190, 22, 2.2, 'lip', 'Okama Wind Lip'],
  [560, 100, 50, 1.8, 'roller'],
  // Birch hits: small lips on the Shirakaba Weave's apexes (where the line runs down the fall line).
  [865, -97, 7, 1.4, 'lip', 'Birch Hit'],
  [975, -13, 7, 1.4, 'lip', 'Birch Hit'],
  [1195, -13, 7, 1.5, 'lip', 'Birch Hit'],
  [1305, -97, 7, 1.5, 'lip', 'Birch Hit'],
  [1440, -40, 30, 2.8, 'lip', 'Shrine Lip'],
  [1600, -70, 18, 2.4, 'lip', 'Lantern Kicker'],
  [1660, -30, 14, 1.8, 'lip', 'Lantern Kicker'],
  [2010, -60, 26, 2.8, 'lip', 'Fir Lip'],
  [2080, 120, 40, 2.2, 'roller'],
  [2150, 300, 22, 2.6, 'lip', 'Fir Lip'],
  [2290, -20, 60, 1.6, 'roller'],
];

// The shrine village.
// Buildings: u, v = centre; yaw: long axis away from the fall line (rad); L = length along it, W = width
// across; roof 'sori' = a curved Japanese gable (ridge across the fall line, upturned eaves: the downhill
// eave is a natural kicker), pitch at the ridge, eave = wall height; drift = how high the uphill drift
// climbs toward the ridge (≥ 1 rides straight onto the roof). Rideable through features.heightAt.
export const BUILDINGS = [
  { id: 'haiden', name: 'Kitsune Shrine', u: 1765, v: 40, L: 18, W: 24, roof: 'sori', pitch: 30, eave: 4.2, drift: 1.05, colour: 'shrine' },
  { id: 'kiku', name: 'Ryokan Kiku', u: 1852, v: 46, L: 16, W: 20, roof: 'sori', pitch: 27, eave: 4.6, drift: 1.0, colour: 'ryokan' },
  { id: 'tsuki', name: 'Ryokan Tsuki', u: 1918, v: 50, L: 14, W: 18, roof: 'sori', pitch: 27, eave: 4.0, drift: 0.9, colour: 'ryokan' },
  { id: 'yuki', name: 'Ryokan Yuki', u: 1984, v: 56, L: 14, W: 18, roof: 'sori', pitch: 27, eave: 4.0, drift: 0.9, colour: 'ryokan' },
  { id: 'tea', name: 'Tea House', u: 1640, v: -150, L: 10, W: 12, roof: 'sori', pitch: 28, eave: 3.4, drift: 1.0, colour: 'ryokan' },
  { id: 'topstation', name: 'Gondola Top Station', u: 395, v: 575, L: 16, W: 14, roof: 'sori', pitch: 24, eave: 5.0, drift: 1.0, colour: 'station' },
  { id: 'basestation', name: 'Gondola Base Station', u: 2470, v: 520, L: 20, W: 16, roof: 'sori', pitch: 24, eave: 5.5, drift: 0.6, colour: 'station' },
  { id: 'lodge', name: 'Base Lodge', u: 2500, v: 240, L: 18, W: 26, roof: 'sori', pitch: 26, eave: 5, drift: 0.5, colour: 'ryokan' },
];

// The five-storey pagoda: a landmark (solid, not rideable). Square plan, tiers of curved roofs.
export const PAGODA = { name: 'Gojū-no-tō', u: 1825, v: -115, base: 8.5, tiers: 5, height: 31 };

// Torii. The great gate at the village entrance, the finish gate at the base, and the senbon tunnel:
// a corridor of gates along a gentle S through the village (you ride through it).
export const OTORII = [
  { name: 'Ō-torii', u: 1505, v: 40, span: 11, height: 10.5 },
  { name: 'Finish Torii', u: FINISH_U, v: 15, span: 14, height: 11 },
];
export const TUNNEL = {
  name: 'Senbon Torii', u0: 1545, u1: 1705, every: 5, span: 5.4, height: 4.4,
  centre: (u) => 40 + 9 * Math.sin(Math.PI * (u - 1545) / 160),
  trough: 0.9,       // the corridor is a shallow banked trough (m) so the line holds
};

// The onsen: an outdoor hot spring among rocks with steam (rocks collide; ride around it).
export const ONSEN = { name: 'Onsen', u: 1872, v: 362, r: 9 };

// The gondola: base station → top station (cabins move), towers along the line.
export const GONDOLA = { from: [2455, 520], to: [410, 575], towers: 7, height: 16, cabins: 14 };

// Drop zones (keys 1–9 or the d-pad while riding): [name, u, v, trail?].
export const DROP_ZONES = [
  ['Crater Rim', 25, 0],
  ['Kazan Rim', 45, 120],
  ['Mochi Field', 400, -280],
  ['Makura Pillows', 640, -430],
  ['Shirakaba', 650, -110],
  ['Kitsunebi Gully', 445, 470],
  ['Senbon Torii', 1460, 40],
  ['Shrine Village', 1720, -50],
  ['Fir Gullies', 2040, -40],
];

// The canonical lines, as (u, v) waypoints ('gully' = the gully's centre line, 'weave' = the glade weave):
// the trails follow them, the bots ride them, and the forest keeps them clear.
export const WEAVE = { u0: 700, u1: 1460, v: -55, amp: 42, wave: 110 };
export const RIDE_LINES = {
  okama: { name: 'Okama Bowl', pts: [[0, 0], [150, -20], [400, -55], [620, 20], [800, -40], [1100, -20], [1400, -70], [1550, -80], [1700, -60], [1900, -40], [2150, -10], [2500, 20]] },
  kazan: { name: 'Kazan Rim', pts: [[0, 0], [40, 110], 'crest', [1480, 228], [1600, 250], [1750, 270], [2000, 300], [2250, 260], [2500, 240]] },
  makura: { name: 'Makura Pillows', pts: [[0, 0], [200, -130], [500, -300], [640, -430], [960, -440], [1030, -420], [1320, -395], [1460, -380], [1600, -250], [1800, -190], [2100, -120], [2500, -60]] },
  shirakaba: { name: 'Shirakaba Weave', pts: [[0, 0], [300, -60], [560, -90], [650, -100], 'weave', [1520, -30], [1700, -60], [2000, -60], [2500, -20]] },
  kitsunebi: { name: 'Kitsunebi Gully', pts: [[405, 545], [440, 500], 'gully', [1640, 400], [1800, 415], [2000, 420], [2250, 400], [2500, 380]] },
  senbon: { name: 'Senbon Torii', pts: [[1430, 40], [1545, 40], 'tunnel', [1740, 40], [1800, 43], [1852, 46], [1918, 50], [1984, 56], [2100, 60], [2300, 64], [2500, 70]] },
};

// The trails (the mountains-and-trails contract: lobby list, spawn, finish).
export const TRAILS = [
  { id: 'okama', name: 'Okama Bowl', difficulty: 'blue', start: [25, 0], finishV: 20,
    description: 'From the crater rim into the wide summit bowl: wind lips, an optional 6 m lip, then the long fast cruise through the village to the base. The way to learn the mountain.' },
  { id: 'kazan', featured: true, name: 'Kazan Rim', difficulty: 'black', start: [45, 120], finishV: 240,
    description: 'The volcano-rim rollercoaster: a narrow ridge spine of whoops you pop off at speed, three step-down gaps, then a high-speed run past the ryokans.' },
  { id: 'makura', featured: true, name: 'Makura Pillows', difficulty: 'double-black', start: [640, -430], finishV: -60,
    description: 'Pillow lines on the skier\'s left: two terraced pillow stacks, the 9 m Makura Cliff between them and the Fox Ledge below. Bottomless landings, no room for doubt.' },
  { id: 'shirakaba', name: 'Shirakaba Weave', difficulty: 'black', start: [650, -100], finishV: -20,
    description: 'A tight weave through the white birch glade. Firs sit in deep tree wells; brush the trunks for close shaves.' },
  { id: 'kitsunebi', name: 'Kitsunebi Gully', difficulty: 'blue', start: [430, 520], finishV: 380,
    description: 'From the gondola top station into a natural half-pipe lit by fox-fire lanterns. Hit the walls, carve the transitions, then out past the onsen.' },
  { id: 'senbon', featured: true, name: 'Senbon Torii', difficulty: 'park', start: [1430, 40], finishV: 70,
    description: 'The shrine village jump line: through the Ō-torii and a tunnel of 33 vermilion gates, up the drift onto the shrine roof, then roof to roof down the ryokan row.' },
];

// Line goals (physics/flow.js): hit these named features in order in one clean run. [name, bonus, ...features]
export const LINE_GOALS = [
  ['Rim Rider', 2200, 'Kazan Gap 1', 'Kazan Gap 2', 'Kazan Gap 3'],
  ['Pillow Talk', 1800, 'Makura Pillows', 'Makura Cliff', 'Makura Stacks'],
  ['Pilgrimage', 2400, 'Senbon Torii', 'Kitsune Shrine', 'Ryokan Kiku'],
  ['Roof Hopper', 2000, 'Ryokan Kiku', 'Ryokan Tsuki', 'Ryokan Yuki'],
  ['Fox Fire', 1500, 'Kitsunebi Gully', 'Fox Fire Drop'],
  ['Summit to Shrine', 1600, 'Okama Lip', 'Fox Ledge', 'Kitsune Shrine'],
];

export function interp(u, pts) {
  if (u <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (u <= pts[i + 1][0]) { const t = smooth((u - pts[i][0]) / (pts[i + 1][0] - pts[i][0])); return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t; }
  }
  return pts[pts.length - 1][1];
}
function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
function smooth(t) { const x = clamp(t, 0, 1); return x * x * (3 - 2 * x); }
function sstep(a, b, x) { return smooth((x - a) / (b - a)); }
