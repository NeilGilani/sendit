// Dragonback (map 5) — the layout: every ridge, gap, hop, lip and line in one place (metres, degrees).
// Local frame (same as Ravenspire): u = metres down the fall line from the start (world x = START_X + u,
// the face falls toward +x / east), v = metres across it (world z; + = skier's right looking downhill).
// The face is packed with fall-line ridges (arêtes, fins, spines), so the flanks face north and south:
// the sun (SSE) lights every south flank and leaves the north flanks in blue shade — the ridges read as
// stripes from above and as lit / shaded walls from the gullies.

export const TILE = { size: 3072, res: 2049, farSize: 30000, farRes: 512 };
export const START_X = -1180;           // world x of the start (u = 0)
export const TOP = 3260;                // m elevation at the start
export const FINISH_U = 2290;           // "run complete" (metres down the fall line)

// Fall-line gradient profile from the start: [length m, degrees]. Smoothed ±15 m.
export const PROFILE = [
  [12, 10],     // the start, on the Shoulder under the summit ridge
  [70, 22],     // the Shoulder: steep enough to traverse to any fin at speed
  [30, 31],     // the rollover: the fins grow out of it
  [560, 40],    // the Comb: fins, the Spine, the Twins, the Keel; gullies between
  [420, 38],    // the Fork, the Staircase, the Hollow (open bowl, left)
  [470, 40],    // the Organ Pipes (spine field), the Knife, the Slot
  [220, 34],    // the prows: ridge ends drop onto the apron
  [250, 26],    // the apron, pillow tongues, wind lips
  [290, 15],    // the runout, cairns, the finish
  [500, 5], [9000, 2],
];
export const BEHIND = [[24, 4], [240, -33], [9000, -9]];   // behind the start (negative = falling away backward)

// The face: half-width (crest of the framing walls), how far the bowl rises toward them, wall height.
export const FACE = {
  halfWidth: (u) => 450 + 0.1 * Math.min(Math.max(u, 0), 1800),
  ridgeHeight: (u) => 30 + 0.05 * Math.min(Math.max(u, 0), 1600),
  bowlPower: 2.6,
  wallHeight: (u) => 85 * smoothRange(u, 10, 160) * (1 - smoothRange(u, 1500, 1900)),
};

// ------------------------------------------------------------------ ridges
// Every ridge follows the fall line (u increases along it). Knots: [u, v (crest), H (crest height above
// the face, m), W (flank half-width at the foot, m)], interpolated smoothly. Options:
//   top      crest-top half-width (m): 2 = a knife edge, 6 = a cat-walk, 10 = a broad back
//   p        flank shape exponent (≥ 1.4 concave: steep near the crest, easing into the gully)
//   asym     right-flank / left-flank width ratio (a lee side is steeper)
//   rise     metres over which the ridge grows out of the slope at its top
//   end      'prow' (the ridge ends in a cliff of its full height: a ridge-end drop) or 'fade'
//   steps    [[u, D]]: gendarme step-downs on the crest — the crest flattens into a rounded lip and drops D m
//            (Ravenspire's cliff shape: bench L = max(4·D, 30), a lip that rolls over so the take-off
//            points down the landing)
//   gaps     [[u, N, L, S, name, kick]]: a notch across the ridge at u: the take-off is a bench with a small
//            wind-lip kick (1.4 m by default), the crest drops N m into the notch over a short wall, the floor is
//            L m long, the far wall climbs back to a crest S m lower than the take-off side.
//            Fly it at speed and you land on the crest beyond, falling away at the face angle; come up short
//            and you land on the far wall; miss it and you ride the notch out sideways into the gully
//   lips     [[u, side, h]]: a wind lip on the crest's edge (side −1 left / +1 right), aimed 30° off the fall
//            line (the hop lips below are aimed at their landing instead)
// Names are what the scoring calls them (course.featureAt), so line goals can use them.
export const RIDGES = [
  // ---- the Comb (upper face): the fins grow out of the rollover under the Shoulder
  { id: 'westfin', name: 'West Fin', top: 4, p: 1.8, asym: 0.8, rise: 70, end: 'prow', seed: 1,
    knots: [[90, -290, 24, 46], [300, -360, 32, 52], [480, -372, 34, 52], [640, -378, 28, 48]],
    steps: [[330, 6], [500, 7]] },
  { id: 'blade', name: 'The Blade', top: 2.4, p: 1.7, asym: 1.15, rise: 70, end: 'fade', seed: 2,
    knots: [[90, -206, 26, 40], [300, -244, 34, 44], [480, -240, 38, 46], [640, -232, 32, 44], [790, -224, 18, 40]],
    steps: [[250, 6], [330, 7]], gaps: [[620, 14, 6, 5]] },
  { id: 'shard', name: 'The Shard', top: 3, p: 1.6, rise: 50, end: 'prow', seed: 8,
    knots: [[470, -200, 8, 22], [560, -197, 12, 24], [660, -193, 14, 24], [730, -190, 12, 22]] },
  { id: 'spine', name: "Dragon's Spine", top: 5, p: 1.9, rise: 70, end: 'fade', seed: 3,
    knots: [[86, -96, 28, 52], [300, -84, 38, 58], [500, -70, 42, 62], [700, -58, 38, 60], [880, -50, 31, 56], [970, -47, 24, 50]],
    steps: [[170, 6], [430, 7]], gaps: [[560, 16, 6, 5, 'The Little Gap', 0.6], [750, 24, 16, 8, "The Spine's Gap"]] },
  { id: 'scale', name: 'The Scales', top: 3, p: 1.6, rise: 60, end: 'prow', seed: 9,
    knots: [[300, -40, 8, 22], [390, -36, 12, 24], [520, -30, 16, 26], [600, -26, 14, 24]] },
  { id: 'twinL', name: 'Left Twin', top: 3, p: 1.6, rise: 50, end: 'prow', seed: 4,
    knots: [[140, 36, 16, 26], [300, 42, 24, 28], [460, 46, 22, 28], [560, 48, 12, 26], [680, 52, 12, 24]] },
  { id: 'twinR', name: 'Right Twin', top: 3, p: 1.6, rise: 50, end: 'prow', seed: 5,
    knots: [[150, 82, 10, 24], [330, 86, 11, 24], [430, 90, 18, 26], [530, 94, 23, 26], [700, 98, 18, 24]] },
  { id: 'splinter', name: 'The Splinter', top: 3, p: 1.6, rise: 60, end: 'prow', seed: 10,
    knots: [[420, 164, 8, 22], [500, 166, 12, 24], [600, 168, 14, 24], [680, 170, 12, 22]] },
  { id: 'keel', name: 'The Keel', top: 9, p: 2.0, asym: 0.85, rise: 70, end: 'prow', seed: 6,
    knots: [[90, 180, 24, 60], [300, 212, 32, 64], [520, 220, 36, 66], [730, 228, 30, 62]],
    steps: [[280, 7], [610, 8]], lips: [[200, -1, 2.4], [530, 1, 2.6]] },
  { id: 'eastfin', name: 'East Fin', top: 4, p: 1.8, asym: 1.2, rise: 70, end: 'prow', seed: 7,
    knots: [[90, 286, 24, 46], [320, 358, 32, 50], [500, 366, 30, 50], [600, 370, 26, 46]],
    steps: [[360, 6]] },

  // ---- the Fork: the Spine splits in two at u ≈ 900 — both branches leave its crest at its full height (no
  // rollover at the junction): the Fork bends left round the Hollow, the Dragon's Tail right
  { id: 'forkL', name: 'The Fork', top: 5, p: 1.9, asym: 0.9, rise: 0, end: 'prow', seed: 15, wander: 1,
    knots: [[880, -50, 31, 50], [920, -56, 30, 50], [990, -100, 27, 50], [1090, -156, 24, 48], [1170, -182, 20, 44]],
    steps: [[1040, 6]] },
  { id: 'tail', name: "Dragon's Tail", top: 4, p: 1.8, rise: 0, end: 'prow', seed: 16, wander: 1,
    knots: [[880, -50, 31, 44], [920, -44, 29, 44], [1010, -14, 24, 44], [1130, 8, 22, 40]] },

  // ---- the Sentinel: a tall lone ridge down the right side, a notch in its middle
  { id: 'sentinel', name: 'The Sentinel', top: 4, p: 1.9, asym: 1.1, rise: 60, end: 'prow', seed: 17,
    knots: [[640, 352, 18, 46], [760, 356, 32, 52], [900, 362, 36, 54], [1040, 368, 30, 50], [1120, 372, 26, 46]],
    steps: [[800, 6]], gaps: [[960, 18, 10, 6, 'The Sentinel Notch']], lips: [[880, -1, 2.4]] },
  // ---- the Wishbone: two ridges in the lower Hollow that converge and merge into one
  { id: 'wishL', name: 'The Wishbone', top: 4, p: 1.8, rise: 60, end: 'fade', seed: 18,
    knots: [[900, -440, 12, 34], [1000, -420, 20, 38], [1080, -392, 22, 40], [1130, -382, 18, 40]] },
  { id: 'wishR', name: 'The Wishbone', top: 4, p: 1.8, rise: 60, end: 'fade', seed: 19,
    knots: [[900, -320, 12, 34], [1000, -344, 20, 38], [1080, -372, 24, 40], [1130, -380, 20, 40]] },

  // ---- the Staircase: four ridges en échelon, each lower and further right than the last; each one's lip
  // throws you across the gully onto the next one's crest (see HOPS)
  { id: 'stair1', name: 'Stair 1', top: 5, p: 1.8, asym: 1.3, rise: 40, end: 'prow', seed: 11,
    knots: [[760, 112, 10, 30], [830, 115, 14, 32], [900, 118, 26, 36], [970, 121, 22, 34]] },
  { id: 'stair2', name: 'Stair 2', top: 5, p: 1.8, asym: 1.3, rise: 40, end: 'prow', seed: 12,
    knots: [[890, 158, 8, 30], [960, 161, 12, 32], [1030, 164, 26, 36], [1100, 167, 22, 34]] },
  { id: 'stair3', name: 'Stair 3', top: 5, p: 1.8, asym: 1.3, rise: 40, end: 'prow', seed: 13,
    knots: [[1020, 204, 8, 30], [1090, 207, 12, 32], [1160, 210, 26, 36], [1230, 213, 22, 34]] },
  { id: 'stair4', name: 'Stair 4', top: 6, p: 1.8, asym: 1.3, rise: 40, end: 'prow', seed: 14,
    knots: [[1150, 250, 8, 32], [1220, 253, 12, 34], [1290, 256, 26, 38], [1370, 260, 22, 36]] },

  // ---- the lower face: the Organ Pipes (a tight spine field, Alaska-style), the Knife (a long knife-edge
  // arête), the Slot (a deep couloir between the Knife and the East Wall)
  { id: 'knife', name: 'The Knife', top: 2.2, p: 1.6, rise: 70, end: 'prow', seed: 21,
    knots: [[1230, 138, 16, 34], [1340, 146, 26, 40], [1470, 154, 30, 42], [1600, 164, 24, 40]],
    steps: [[1320, 5], [1470, 6], [1550, 5]], gaps: [[1390, 12, 5, 4, null, 0.5]] },
  { id: 'wyrm', name: 'The Wyrm', top: 4, p: 1.8, rise: 70, end: 'prow', seed: 24,
    knots: [[1160, 62, 14, 40], [1260, 72, 30, 46], [1380, 80, 34, 48], [1500, 76, 30, 46], [1610, 84, 24, 42]],
    steps: [[1440, 6]] },
  // The East Wall ends in the map's biggest cliff, the Dragon's Tooth: 38 m onto the 34° apron (Ravenspire's
  // Hammer recipe: land it straight at any speed and it's clean, ~16 m/s; a few metres taller tips it to sketchy).
  { id: 'eastwall', name: 'East Wall', prowName: "The Dragon's Tooth", top: 6, p: 2.0, asym: 1.2, rise: 60, end: 'prow', seed: 22,
    knots: [[1380, 262, 22, 52], [1480, 266, 34, 58], [1580, 272, 36, 60], [1640, 276, 40, 60]],
    steps: [[1540, 7]], lips: [[1480, -1, 2.4]] },
  { id: 'westwall', name: 'West Buttress', top: 6, p: 1.9, asym: 0.8, rise: 50, end: 'prow', seed: 23,
    knots: [[1150, -430, 22, 50], [1350, -436, 32, 56], [1560, -440, 30, 54], [1660, -444, 24, 50]],
    steps: [[1450, 8]], lips: [[1300, 1, 2.4]] },
];

// Ridge-to-ridge hops: a spur (a short side arête) peels off the crest of `from` `len` (90) m above u and runs
// straight at the crest of `to` at `land`, ending at u in a wind-lip kicker over the gully (course.buildHops).
// The target is laid out lower than the kicker, so the 2–3 s flight comes down on its crest or upper flanks.
// The spur takes the hop's name, so line goals can ask for it. Options: len, h (kick m), H (spur end height).
export const HOPS = [
  { name: 'Scale Jump', from: 'spine', to: 'scale', u: 330, land: 395, over: -3, len: 75 },
  { name: 'Twin Hop', from: 'twinL', to: 'twinR', u: 300, land: 365 },
  { name: 'Twin Hop Back', from: 'twinR', to: 'twinL', u: 560, land: 625 },
  { name: 'Blade Leap', from: 'blade', to: 'shard', u: 500, land: 575 },
  { name: 'Keel Leap', from: 'keel', to: 'splinter', u: 460, land: 530 },
  { name: 'Stair Hop 1', from: 'stair1', to: 'stair2', u: 950, land: 1005, len: 60, over: 8 },
  { name: 'Stair Hop 2', from: 'stair2', to: 'stair3', u: 1080, land: 1135, len: 60, over: 8 },
  { name: 'Stair Hop 3', from: 'stair3', to: 'stair4', u: 1210, land: 1265, len: 60, over: 8 },
  { name: 'Wyrm Leap', from: 'wyrm', to: 'knife', u: 1320, land: 1385, over: 14 },
];

// The Organ Pipes: a field of tight, sharp spines (Alaska-style) separated by sluff channels.
// [u0, u1] × [v0, v1], spine spacing, height, crest top; spines wander a little and end in short drops.
export const SPINE_FIELD = { u0: 1160, u1: 1620, v0: -330, v1: -40, spacing: 30, height: 11, top: 1.6, wander: 8, seed: 31 };

// Wind lips and rollers off the ridges (open ground). [u, v, half-length across (m), height, kind]
export const HITS = [
  [880, -340, 40, 2.6, 'lip'],      // the Hollow
  [960, -270, 30, 3.0, 'lip'],
  [1040, -390, 26, 2.4, 'lip'],
  [1760, -120, 34, 3.2, 'lip'],     // the apron
  [1820, 120, 30, 3.0, 'lip'],
  [1900, -20, 60, 2.2, 'roller'],
  [2000, 200, 26, 2.8, 'lip'],
  [2060, -240, 30, 2.6, 'lip'],
];

// Pillow stacks (Ravenspire's terraced pillows: a rolling top, a ~4 m rounded drop every `step` m, lobes across):
// below the Organ Pipes, under West Fin's prow, under the Sentinel's prow. All are "Pillow Stacks" to the scoring
// (a clean landing off pillow after pillow chains a "Pillow line ×N", player.js).
export const PILLOWS = [
  { name: 'Pillow Stacks', u0: 1660, u1: 1860, v0: -330, v1: -150, step: 9, terrace: 0.6, top: 0.7, lobe: 9, seed: 41 },
  { name: 'Pillow Stacks', u0: 700, u1: 840, v0: -440, v1: -320, step: 8, terrace: 0.6, top: 0.7, lobe: 8, seed: 42 },
  { name: 'Pillow Stacks', u0: 1190, u1: 1330, v0: 330, v1: 440, step: 8, terrace: 0.6, top: 0.7, lobe: 8, seed: 43 },
];

// Drop zones (Steep-style): keys 1–9 or the d-pad ◀ ▶. [name, u, v]; everyone faces down the fall line.
export const DROP_ZONES = [
  ['The Shoulder', 14, -30],
  ['The Blade', 100, -206],
  ["Dragon's Spine", 96, -96],
  ['The Twins', 140, 36],
  ['The Keel', 100, 182],
  ['The Fork', 860, -52],
  ['The Staircase', 740, 112],
  ['The Organ Pipes', 1130, -230],
  ['The Knife', 1210, 138],
];

// Line goals (Steep "Mountain Stories" style): take off from these features in this order, cleanly.
// Names are course.featureAt() names (ridges, gaps, hop lips, prows). [name, bonus, ...features]
export const LINE_GOALS = [
  ['Ride the Dragon', 3000, "Dragon's Spine", 'The Little Gap', "The Spine's Gap", 'The Fork'],
  ['Stairway', 2800, 'Stair Hop 1', 'Stair Hop 2', 'Stair Hop 3', 'Stair 4 Prow'],
  ['Fin Hopper', 2200, 'Twin Hop', 'Twin Hop Back'],
  ['Wyrm Rider', 2400, 'Wyrm Leap', "The Knife's Notch", 'The Knife Prow'],
  ['Knife Fight', 2200, 'The Knife', "The Knife's Notch", 'The Knife Prow'],
  ['Scaling the Dragon', 2000, 'Scale Jump', 'The Scales Prow'],
  ['Bladerunner', 2000, 'The Blade', 'Blade Leap', 'The Shard Prow'],
  ['Keel Over', 1800, 'Keel Leap', 'The Splinter Prow'],
  ['Sentinel', 1800, 'The Sentinel', 'The Sentinel Notch', 'The Sentinel Prow'],
  ['Pulling Teeth', 2000, "The Dragon's Tooth"],
  ['Organ Grinder', 1800, 'The Organ Pipes', 'The Organ Pipes', 'The Organ Pipes', 'The Organ Pipes'],
  ['Fin and Pillows', 1600, 'West Fin Prow', 'Pillow Stacks', 'Pillow Stacks', 'The Wishbone'],
];

// The canonical lines as (u, v) waypoints: the bots ride them (scripts/map5-ride.mjs), and the course keeps
// trees and rocks off them. '@id' = that ridge's crest at u (consecutive '@id' waypoints follow the crest);
// '>Hop name' = that hop's lip (the next waypoint is its landing).
export const RIDE_LINES = {
  spine: { name: "Dragon's Spine (crest, two gaps, the Fork)", pts: [[0, -30], [60, -70], [100, '@spine'], [890, '@spine'], [900, '@forkL'], [1170, '@forkL'], [1300, -200], [1700, -60], [2400, 0]] },
  scales: { name: 'Scale Jump → the Tail → Wyrm Leap → the Knife', pts: [[0, -30], [60, -70], [100, '@spine'], '>Scale Jump', [400, '@scale'], [600, '@scale'], [820, -10], [880, -48], [900, '@tail'], [1130, '@tail'], [1170, 64], [1200, '@wyrm'], '>Wyrm Leap', [1395, '@knife'], [1600, '@knife'], [1700, 170], [2000, 120], [2400, 60]] },
  blade: { name: 'The Blade → Blade Leap → the Shard', pts: [[0, -30], [60, -150], [100, '@blade'], '>Blade Leap', [580, '@shard'], [730, '@shard'], [900, -260], [1140, -200], [1650, -200], [1800, -230], [2400, -100]] },
  bladecrest: { name: 'The Blade end to end (knife edge, the notch)', pts: [[0, -30], [60, -150], [100, '@blade'], [770, '@blade'], [900, -250], [1140, -200], [1650, -200], [1800, -230], [2400, -100]] },
  twins: { name: 'Twin Hop, back again → the Staircase', pts: [[0, -30], [60, 10], [140, '@twinL'], '>Twin Hop', [370, '@twinR'], '>Twin Hop Back', [630, '@twinL'], [680, '@twinL'], [720, 62], [750, 90], [790, '@stair1'], '>Stair Hop 1', [1010, '@stair2'], '>Stair Hop 2', [1140, '@stair3'], '>Stair Hop 3', [1270, '@stair4'], [1370, '@stair4'], [1500, 220], [1800, 140], [2400, 60]] },
  keel: { name: 'The Keel → Keel Leap → the Sentinel', pts: [[0, -30], [60, 120], [100, '@keel'], '>Keel Leap', [535, '@splinter'], [680, '@splinter'], [720, 300], [780, '@sentinel'], [1120, '@sentinel'], [1200, 374], [1330, 330], [1440, '@eastwall'], [1630, '@eastwall'], [1720, 282], [1850, 210], [2400, 80]] },
  wishbone: { name: 'West Fin → the Wishbone → West Buttress', pts: [[0, -30], [60, -200], [100, '@westfin'], [640, '@westfin'], [760, -360], [920, '@wishR'], [1130, '@wishR'], [1180, '@westwall'], [1660, '@westwall'], [1730, -446], [1820, -380], [2400, -150]] },
  gully: { name: 'The gullies (the low line)', pts: [[0, -30], [60, -130], [130, -150], [600, -150], [800, -140], [1000, -50], [1150, -30], [1300, -10], [1600, 0], [1700, 0], [2400, 20]] },
  slot: { name: 'The Slot (couloir)', pts: [[0, -30], [60, 200], [140, 275], [700, 290], [1000, 300], [1300, 305], [1420, 215], [1600, 213], [1800, 180], [2400, 80]] },
};

function smoothRange(x, a, b) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
