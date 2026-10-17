// Voltage Park — the layout: every feature in one place (metres, degrees). Research: docs/map4-research.md.
// Local frame: u = metres down the fall line from the start gate (world x = START_X + u, the hill falls
// toward +x / east), v = metres across (world z; + = skier's right looking downhill, south). The sun
// comes from the south-south-east, so the park is cross-lit from the right.
//
//   v ≈ −250 … −220   HIP ROW (four hips, the Spine)          v ≈ −20 … +20  the SLOPESTYLE course
//   v ≈ −172          THE TOWER big air (scaffold in-run)     v ≈ +70        Spark Lane (flow: side hits, doubles)
//   v ≈ −95           THE CONDUIT superpipe (22 ft)           v ≈ +125       Current Lane (the Triple Stack)
//                                                             v ≈ +185       High Voltage (pro: the Canal gap)
//                                                             v ≈ +245       The Grid (jib garden) → the Stairway
//
// The pace (docs/map4.md §2): a 30° summit drop off a scaffold start ramp, a 13° rail bench, the 26° Plunge,
// a 14° bench, the 28° Launch into the jump line (20°), the 27° drop into Megawatt, then a road gap to the finish.
// Rails are hit at 9–13 m/s, the big tables at 19–24 m/s (70–85 km/h), Megawatt and the Tower at 23–26.

export const TILE = { size: 2048, res: 2049, farSize: 30000, farRes: 512 };
export const START_X = -520;            // world x of the start gate (u = 0)
export const TOP = 2380;                // m elevation at the start gate
export const FINISH_U = 1140;           // run complete (the finish line across the arena)
export const PARK_HALF = 300;           // the groomed park is flat across |v| < this

// Fall-line profile from the start gate: [length m, degrees], smoothed ±10 m. Benches (13–14°) carry the rails,
// steep pitches (26–30°) are the drop-ins that build the speed for the jumps below them (in-runs 25–30°).
export const PROFILE = [
  [50, 30],     // the summit drop off the start ramp
  [215, 13],    // rail bench: sections 1 and 2, the Grid, the lanes' rails
  [35, 28],     // THE PLUNGE (drop-in to section 3)
  [85, 14],     // bench: section 3, the lanes' last rails
  [70, 28],     // THE LAUNCH (the drop-in to the jump line)
  [305, 18],    // jump line: Lightning, Thunder, Voltage; the stacks, the pipe, the hips
  [50, 30],     // the drop into Megawatt
  [300, 18],    // Megawatt, the gaps, the step line, the quarterpipes
  [60, 9],      // finish run-out
  [9000, 2],
];
export const BEHIND = [[22, 4], [180, -24], [9000, -12]];   // behind the gate: the start deck, then up to the ridge
// Section boundaries along u (the judge's crash zones, the drop zones' in-runs).
export const PITCH = { plunge: 265, bench2: 300, launch: 385, jumps: 455, mega: 760 };

// Scaffold start ramps: a deck `top` m over the snow, rolled into at `inDeg` (the first metres of the run).
export const START_RAMPS = [
  { name: 'Start Ramp', u: -16, v: 0, top: 9, deckLen: 4, inDeg: 36, R: 9, hw: 3.2 },
];

// ------------------------------------------------------------------ the slopestyle course
// Rails / boxes / tubes (jib features). Rail profile: segs = [[length m (along the rail), grade deg (absolute,
// − = down)], …] from a start h0 m above the snow; or shape 'rainbow' (len, hump) / 'c' (len, turn deg, radius).
// ramp: 'flush' (ride-on: the ramp meets the start of the rail), or { gap, drop, deg } (gap-on: a lip `gap` m
// before it, `drop` m under its height (−: above), at `deg` (default: the rail's first grade + 9°, + 14° for gaps ≥ 2 m, at least 3°):
// rolled without a pop you come down onto the start of the rail; pop and you land further along it). kind: rail (round, half 0.04), box (half 0.3), tube (half 0.45).
export const JIBS = [
  // Section 1 — THE CIRCUIT (out of the summit drop: check your speed)
  { name: 'Circuit Flat-Down', sec: 1, u: 100, v: -13, kind: 'rail', segs: [[3.5, 0], [7.5, -24]], h0: 0.75, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.15 },
  { name: 'Circuit Box', sec: 1, u: 98, v: 0, kind: 'box', half: 0.32, segs: [[12, -12]], h0: 0.45, ramp: 'flush', difficulty: 0.9 },
  { name: 'Circuit Down Rail', sec: 1, u: 102, v: 13, kind: 'rail', segs: [[9, -22]], h0: 0.9, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.1 },
  // Section 2 — SURGE
  { name: 'Surge DFD', sec: 2, u: 184, v: -13, kind: 'rail', segs: [[3.5, -24], [3.5, 0], [3.5, -24]], h0: 0.85, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.35 },
  { name: 'Surge Rainbow', sec: 2, u: 186, v: 0, kind: 'box', half: 0.3, shape: 'rainbow', len: 10, hump: 0.7, h0: 0.45, ramp: { gap: 0.8, drop: -0.05 }, difficulty: 1.3 },
  { name: 'Surge Tube', sec: 2, u: 184, v: 13, kind: 'tube', half: 0.45, segs: [[4, -6], [5, -22]], h0: 0.7, ramp: 'flush', difficulty: 1.05 },
  // Section 3 — OVERLOAD, at the bottom of the Plunge (the C-rail, the stair set with its kinked handrail, a gap to a long down box)
  { name: 'Overload C-Rail', sec: 3, u: 322, v: -16, kind: 'rail', shape: 'c', len: 13, turn: 38, h0: 0.75, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.5 },
  { name: 'Overload Handrail', sec: 3, u: 322, v: 2.2, kind: 'rail', segs: [[3, 0], [7, -30], [3, 0]], h0: 1.05, ramp: { gap: 1.3, drop: -0.05 }, difficulty: 1.5, stairs: { side: -1, steps: 9 } },
  { name: 'Overload Gap Box', sec: 3, u: 326, v: 15, kind: 'box', half: 0.35, segs: [[11, -16]], h0: 0.8, ramp: { gap: 2.4, drop: -0.05 }, difficulty: 1.2 },
];

// The jump line: table-tops of growing size (research §8 rule 6: L 18–22 m knuckles, 28–30° lips, 30–38°
// landings; Megawatt is a big-air-size kicker in the course). lip = u of the lip; table = lip → knuckle (m); vMax =
// fastest take-off the landing is built for (EFH ≤ ~0.7 m from the knuckle to there, then straight). kickH = lip
// height over the in-run snow.
export const JUMPS = [
  { name: 'Lightning', short: 'Jump 1', u: 495, v: -3, lipDeg: 29, R: 20, kickH: 4.4, table: 28, vMax: 25, hw: 3.4, deckHw: 11, landHw: 13, deckDeg: 4, maxDeg: 40 },
  { name: 'Thunder', short: 'Jump 2', u: 610, v: -3, lipDeg: 30, R: 20, kickH: 4.5, table: 30, vMax: 27, hw: 3.6, deckHw: 12, landHw: 14, deckDeg: 4, maxDeg: 40 },
  { name: 'Voltage', short: 'Jump 3', u: 720, v: -3, lipDeg: 31, R: 22, kickH: 4.8, table: 32, vMax: 28.5, hw: 3.8, deckHw: 12, landHw: 15, deckDeg: 4, maxDeg: 40 },
  { name: 'Megawatt', short: 'Jump 4', u: 880, v: -3, lipDeg: 32, R: 24, kickH: 5, table: 36, vMax: 31, hw: 4.2, deckHw: 14, landHw: 17, deckDeg: 4, maxDeg: 40 },
];

// Gap jumps: a kicker, then nothing — a channel `gap` m long (the snow, or a road across it) — up to a landing
// mound whose knuckle stands `landH` m over the snow. Too slow and you hit its face.
export const GAPS = [
  { name: 'The Gap', short: 'Jump 5', lane: 'slope', u: 1015, v: -3, lipDeg: 24, R: 18, kickH: 5, gap: 34, landH: 12, vMax: 27, hw: 3.8, landHw: 14, road: true, maxDeg: 40 },
  { name: 'The Canal', lane: 'high', u: 880, v: 186, lipDeg: 25, R: 16, kickH: 4.4, gap: 28, landH: 9, vMax: 26, hw: 3.4, landHw: 11, canal: true, maxDeg: 40 },
];

// Spines: a ridge down the fall line between two lanes, from u0 to u1 at v (H m tall, faces at faceDeg). Ride up
// its face across it, air the crest sideways and land on the far face: a transfer into the next lane at full speed.
export const SPINES = [
  { name: 'The Spine', lane: 'spark', u0: 598, u1: 690, v: 98, H: 3.2, faceDeg: 40 },
  { name: 'Stairway Spine', lane: 'stair', u0: 812, u1: 905, v: 216, H: 3.6, faceDeg: 42 },
];

// ------------------------------------------------------------------ the park lanes
// Lane jumps (smaller tables), quarterpipes, step-ups and hips use the same builders as the main line.
export const LANES = [
  { id: 'spark', name: 'Spark Lane', level: 'small', v: 70, color: '#2ff5d6' },
  { id: 'current', name: 'Current Lane', level: 'medium', v: 125, color: '#3d8bff' },
  { id: 'high', name: 'High Voltage', level: 'pro', v: 185, color: '#ff3d9a' },
];

export const LANE_JUMPS = [
  // Spark — the flow lane: small tables on the bench, a side hit, a stacked double under the Launch, rollers.
  { name: 'Spark 1', lane: 'spark', u: 68, v: 70, lipDeg: 23, R: 8, kickH: 1.5, table: 8, vMax: 17, hw: 2.5, deckHw: 4.5, landHw: 6 },
  { name: 'Spark 2', lane: 'spark', u: 160, v: 70, lipDeg: 25, R: 10, kickH: 1.8, table: 10, vMax: 19, hw: 2.6, deckHw: 5, landHw: 6.5 },
  { name: 'Spark Double 1', lane: 'spark', u: 500, v: 70, lipDeg: 26, R: 12, kickH: 2.5, table: 14, vMax: 22, hw: 2.8, deckHw: 5.5, landHw: 7.5, maxDeg: 40 },
  { name: 'Spark Double 2', lane: 'spark', u: 560, v: 70, lipDeg: 26, R: 12, kickH: 2.6, table: 14, vMax: 22, hw: 2.8, deckHw: 5.5, landHw: 7.5, maxDeg: 40 },
  { name: 'Spark 3', lane: 'spark', u: 690, v: 70, lipDeg: 27, R: 12, kickH: 2.8, table: 16, vMax: 23, hw: 3, deckHw: 6, landHw: 8, maxDeg: 40 },
  { name: 'Spark 4', lane: 'spark', u: 880, v: 70, lipDeg: 27, R: 13, kickH: 3.0, table: 18, vMax: 24, hw: 3, deckHw: 6, landHw: 8, maxDeg: 40 },
  // Current — the Triple Stack: three tables back to back (each landing runs straight into the next in-run).
  { name: 'Current 1', lane: 'current', u: 92, v: 125, lipDeg: 25, R: 10, kickH: 2.2, table: 12, vMax: 19, hw: 2.8, deckHw: 6, landHw: 7 },
  { name: 'Stack 1', lane: 'current', u: 495, v: 125, lipDeg: 29, R: 14, kickH: 3.3, table: 18, vMax: 25, hw: 3.2, deckHw: 7.5, landHw: 9., maxDeg: 40 },
  { name: 'Stack 2', lane: 'current', u: 557, v: 125, lipDeg: 29, R: 14, kickH: 3.3, table: 18, vMax: 25, hw: 3.2, deckHw: 7.5, landHw: 9., maxDeg: 40 },
  { name: 'Stack 3', lane: 'current', u: 619, v: 125, lipDeg: 29, R: 14, kickH: 3.4, table: 19, vMax: 25, hw: 3.2, deckHw: 7.5, landHw: 9., maxDeg: 40 },
  { name: 'Current 3', lane: 'current', u: 1016, v: 125, lipDeg: 30, R: 16, kickH: 3.8, table: 22, vMax: 26, hw: 3.2, deckHw: 8, landHw: 9.5, maxDeg: 40 },
  // High Voltage — pro: big tables under the Launch (then the Canal gap, the step-up, the QP).
  { name: 'High Voltage 1', lane: 'high', u: 500, v: 186, lipDeg: 29, R: 16, kickH: 3.8, table: 22, vMax: 26, hw: 3.3, deckHw: 8, landHw: 10, maxDeg: 40 },
  { name: 'High Voltage 2', lane: 'high', u: 625, v: 186, lipDeg: 31, R: 18, kickH: 4.4, table: 27, vMax: 28, hw: 3.4, deckHw: 9, landHw: 11, maxDeg: 40 },
];

// Step-ups (land uphill on a raised deck: the window is worked out from the flights) and step-downs (the deck
// falls away 14°: land further down than you took off).
export const STEPS = [
  { name: 'Stair Drop 1', lane: 'stair', kind: 'stepdown', u: 495, v: 245, lipDeg: 20, R: 16, kickH: 3.6, table: 20, vMax: 26, hw: 3, deckHw: 7, landHw: 9, deckDeg: -6, maxDeg: 40 },
  { name: 'Stair Up', lane: 'stair', kind: 'stepup', u: 612, v: 245, lipDeg: 32, R: 11, kickH: 2.6, gap: 7, rise: 1.8, deckLen: 12, hw: 3, landHw: 6 },
  { name: 'Stair Drop 2', lane: 'stair', kind: 'stepdown', u: 722, v: 245, lipDeg: 22, R: 16, kickH: 4, table: 24, vMax: 27, hw: 3, deckHw: 7, landHw: 9, deckDeg: -6, maxDeg: 40 },
  { name: 'Step-Up', lane: 'high', kind: 'stepup', u: 1000, v: 186, lipDeg: 32, R: 11, kickH: 2.6, gap: 7, rise: 1.8, deckLen: 12, hw: 3, landHw: 6 },
  { name: 'Step-Down', lane: 'current', kind: 'stepdown', u: 880, v: 125, lipDeg: 20, R: 16, kickH: 3.6, table: 20, vMax: 26, hw: 3, deckHw: 7, landHw: 9, deckDeg: -6, maxDeg: 40 },
];
// Hips, side hits and transfers: the kicker points `turn` deg off the fall line, the whole jump on that axis.
// A transfer's landing is in the next lane (Current → High Voltage); a side hit sits on a lane's edge.
export const HIPS = [
  { name: 'Hip Left', lane: 'hips', u: 520, v: -232, turn: -30, lipDeg: 27, R: 12, kickH: 2.8, table: 13, vMax: 22, hw: 3, deckHw: 6.5, landHw: 8.5, maxDeg: 40 },
  { name: 'Hip Right', lane: 'hips', u: 632, v: -242, turn: 30, lipDeg: 27, R: 12, kickH: 2.9, table: 14, vMax: 22, hw: 3, deckHw: 6.5, landHw: 8.5, maxDeg: 40 },
  { name: 'Hip Three', lane: 'hips', u: 880, v: -228, turn: -28, lipDeg: 28, R: 13, kickH: 3.2, table: 16, vMax: 24, hw: 3.2, deckHw: 7, landHw: 9, maxDeg: 40 },
  { name: 'Hip Four', lane: 'hips', u: 995, v: -242, turn: 28, lipDeg: 28, R: 13, kickH: 3.2, table: 16, vMax: 24, hw: 3.2, deckHw: 7, landHw: 9, maxDeg: 40 },
  { name: 'Current Transfer', lane: 'current', u: 745, v: 148, turn: 26, lipDeg: 27, R: 12, kickH: 2.8, table: 13, vMax: 23, hw: 3, deckHw: 6, landHw: 8, maxDeg: 40 },
  { name: 'Spark Side Hit', lane: 'spark', u: 1012, v: 62, turn: 14, lipDeg: 25, R: 10, kickH: 2.0, table: 10, vMax: 21, hw: 2.4, deckHw: 4, landHw: 5.5, maxDeg: 40 },
  { name: 'Current Side Hit', lane: 'current', u: 962, v: 129, turn: -10, lipDeg: 25, R: 10, kickH: 2.0, table: 10, vMax: 21, hw: 2.4, deckHw: 4, landHw: 5.5, maxDeg: 40 },
  { name: 'High Side Hit', lane: 'high', u: 735, v: 176, turn: 14, lipDeg: 25, R: 10, kickH: 2.0, table: 10, vMax: 21, hw: 2.4, deckHw: 4, landHw: 5.5, maxDeg: 40 },
  { name: 'Stairway Hip', lane: 'stair', u: 995, v: 250, turn: -25, lipDeg: 27, R: 12, kickH: 2.9, table: 14, vMax: 23, hw: 3, deckHw: 6, landHw: 8, maxDeg: 40 },
];
// Quarterpipes: a wall across the fall line at the bottom of a lane (air straight up, land back in it: research
// §5.3, 4–7 m tall, radius ≈ 1.0–1.15 × the height).
export const QUARTERPIPES = [
  { name: 'Spark QP', u: 1085, v: 72, w: 14, H: 3.2, R: 3.6 },
  { name: 'Voltage QP', u: 1090, v: 186, w: 20, H: 5.2, R: 5.8 },
];
// Rollers: [u, v, half-width, height, sigma] — pump rollers on the Spark Lane.
export const ROLLERS = [
  [304, 70, 6, 0.9, 4], [317, 70, 6, 0.9, 4], [330, 70, 6, 1.0, 4],
  [948, 70, 6, 1.1, 4.5], [964, 70, 6, 1.1, 4.5], [980, 70, 6, 1.2, 4.5],
];

// Lane jibs (same format as JIBS): on the benches, where the speed is right for rails.
export const LANE_JIBS = [
  // Spark: beginner boxes and a fat tube, ride-on
  { name: 'Spark Box', lane: 'spark', u: 120, v: 70, kind: 'box', half: 0.4, segs: [[7, -12]], h0: 0.35, ramp: 'flush', difficulty: 0.7 },
  { name: 'Spark Tube', lane: 'spark', u: 212, v: 66, kind: 'tube', half: 0.5, segs: [[6, -12]], h0: 0.45, ramp: 'flush', difficulty: 0.8 },
  { name: 'Spark Ledge', lane: 'spark', u: 212, v: 75, kind: 'ledge', half: 0.35, segs: [[7, -10]], h0: 0.4, ramp: 'flush', difficulty: 0.75 },
  { name: 'Spark Down Box', lane: 'spark', u: 352, v: 72, kind: 'box', half: 0.4, segs: [[8, -17]], h0: 0.4, ramp: 'flush', difficulty: 0.75 },
  { name: 'Spark Butter Box', lane: 'spark', u: 625, v: 70, kind: 'box', half: 0.5, segs: [[9, -22]], h0: 0.35, ramp: 'flush', difficulty: 0.7 },
  // Current: flat-downs, a kink, a wide tube
  { name: 'Current Flat-Down', lane: 'current', u: 158, v: 121, kind: 'rail', segs: [[3, 0], [5, -22]], h0: 0.7, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.1 },
  { name: 'Current Box', lane: 'current', u: 158, v: 131, kind: 'box', half: 0.3, segs: [[9, -12]], h0: 0.45, ramp: 'flush', difficulty: 0.9 },
  { name: 'Current Kink', lane: 'current', u: 222, v: 125, kind: 'rail', segs: [[4, -10], [5, -26]], h0: 0.8, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.2 },
  { name: 'Current Tube', lane: 'current', u: 330, v: 121, kind: 'tube', half: 0.45, segs: [[8, -16]], h0: 0.6, ramp: 'flush', difficulty: 1.0 },
  // High Voltage: big DFD, rainbow rail, a long down rail, a kink at the bottom of the Plunge
  { name: 'High DFD', lane: 'high', u: 110, v: 186, kind: 'rail', segs: [[4, -24], [4, 0], [4, -24]], h0: 1.1, ramp: { gap: 1.4, drop: -0.05 }, difficulty: 1.45 },
  { name: 'High Rainbow', lane: 'high', u: 170, v: 186, kind: 'rail', shape: 'rainbow', len: 11, hump: 1.0, h0: 0.7, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.5 },
  { name: 'High Down Rail', lane: 'high', u: 220, v: 186, kind: 'rail', segs: [[13, -20]], h0: 1.1, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.3 },
  { name: 'High Kink', lane: 'high', u: 322, v: 186, kind: 'rail', segs: [[3, 0], [5, -26], [3, -8]], h0: 1.0, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.45 },
];

// THE GRID — a jib garden: rows of boxes, tubes and rails, all ride-on or small gap-ons, every 30–33 m (on the bench).
export const GRID = { u0: 50, u1: 262, v: 245 };
export const GRID_JIBS = [
  { name: 'Grid Box A', u: 60, v: 236, kind: 'box', half: 0.3, segs: [[8, -12]], h0: 0.4, ramp: 'flush' },
  { name: 'Grid Rail A', u: 62, v: 246, kind: 'rail', segs: [[8, -14]], h0: 0.6, ramp: { gap: 0.9, drop: -0.05 } },
  { name: 'Grid Tube A', u: 60, v: 256, kind: 'tube', half: 0.5, segs: [[7, -12]], h0: 0.5, ramp: 'flush' },
  { name: 'Grid Flat Box', u: 92, v: 241, kind: 'box', half: 0.3, segs: [[6, 0]], h0: 0.45, ramp: 'flush' },
  { name: 'Grid Down Rail', u: 94, v: 252, kind: 'rail', segs: [[7, -22]], h0: 0.9, ramp: { gap: 1.0, drop: -0.05 } },
  { name: 'Grid A-Frame', u: 124, v: 236, kind: 'box', half: 0.3, segs: [[3, 6], [2, 0], [4, -24]], h0: 0.35, ramp: 'flush', difficulty: 1.25 },
  { name: 'Grid Long Rail', u: 122, v: 248, kind: 'rail', segs: [[14, -13]], h0: 0.6, ramp: { gap: 0.9, drop: -0.05 }, difficulty: 1.2 },
  { name: 'Grid Wide Tube', u: 124, v: 258, kind: 'tube', half: 0.55, segs: [[9, -14]], h0: 0.6, ramp: 'flush' },
  { name: 'Grid Kink', u: 157, v: 240, kind: 'rail', segs: [[4.5, -6], [4, -24], [3, -6]], h0: 0.7, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.3 },
  { name: 'Grid S-Rail', u: 161, v: 250, kind: 'rail', shape: 'c', len: 11, turn: -20, h0: 0.65, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.4 },
  { name: 'Grid Rainbow Box', u: 189, v: 236, kind: 'box', half: 0.35, shape: 'rainbow', len: 9, hump: 0.6, h0: 0.4, ramp: 'flush', difficulty: 1.2 },
  { name: 'Grid Down Box', u: 195, v: 247, kind: 'box', half: 0.3, segs: [[10, -20]], h0: 0.6, ramp: { gap: 1.0, drop: -0.05 } },
  { name: 'Grid Ledge', u: 191, v: 258, kind: 'ledge', half: 0.4, segs: [[9, -12]], h0: 0.5, ramp: 'flush' },
  { name: 'Grid Battleship', u: 220, v: 242, kind: 'box', half: 0.3, segs: [[3.5, 10], [3.5, -30]], h0: 0.3, ramp: 'flush', difficulty: 1.3 },
  { name: 'Grid Cannon', u: 222, v: 254, kind: 'tube', half: 0.4, segs: [[10, -14]], h0: 0.7, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.15 },
  { name: 'Grid Finale DFD', u: 250, v: 247, kind: 'rail', segs: [[3.5, -22], [3, -6], [3.5, -22]], h0: 0.85, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.4 },
];

// ------------------------------------------------------------------ left side: pipe, big air, hips
export const PIPE = { name: 'The Conduit', u0: 485, u1: 725, v: -95, F: 3.2, R: 7.2, H: 6.7, vertDeg: 82, D: 7, exit: 22 };   // (the walls fade over the last 22 m: at 20 m/s nobody is left in the air over a vanished wall)
// Big air: a scaffold in-run (top deck `top` m over the snow at u), a 38° in-run, a 33° lip, a 32 m table to
// the knuckle and an EFH landing for take-offs up to vMax (research §2: Shougang 30° in-run, 5 m kicker, 20 m
// to the knoll, 38° landing; a 30 m jump needs ~16 m/s at the lip — the Tower is bigger: 23–26 m/s, 35–45 m).
export const BIG_AIR = { name: 'The Tower', u: 460, v: -172, top: 33, deckLen: 8, inDeg: 38, R: 26, lipDeg: 33, kickH: 5.5, table: 34, vMax: 30, maxDeg: 40, hw: 4, deckHw: 10, landHw: 13 };

// ------------------------------------------------------------------ practice: drop zones (keys 1–9)
// [name, u, v, heading offset deg from the fall line] — each at the top of a steep in-run.
export const DROP_ZONES = [
  ['Start Ramp · Slopestyle', 0, 0, 0],         // placed on the start ramp's deck (course.js)
  ['The Plunge · Section 3', 252, 0, 0],
  ['The Launch · Jump Line', 372, -3, 0],
  ['Megawatt · Mega Kicker', 0, 0, 0],          // dropping in over Voltage's knuckle (17 m up): course.js
  ['The Tower · Big Air', 0, 0, 0],             // placed on the scaffold deck (course.js)
  ['The Conduit · Superpipe', 0, 0, 0],         // at the top of the pipe
  ['Triple Stack · Current Lane', 372, 125, 0],
  ['High Voltage · Pro', 372, 186, 0],
  ['The Stairway · Step Line', 372, 245, 0],
];

// ------------------------------------------------------------------ trails (the mountain / trails contract)
// registerMap({ trails }) + course.trailSpawn(id) → { x, z, heading }. A trail starts at `start` ([u, v], or a
// drop zone index) and is ridden to the finish; `lanes` are the feature lanes that count toward it when a run is
// classified at the finish (runCompleted). Length and vertical are measured from the course (course.js trailInfo).
export const TRAILS = [
  { id: 'slopestyle', name: 'Slopestyle Course', difficulty: 'park', start: 0, lanes: ['slope'], description: 'Start ramp, three rail sections, Lightning, Thunder, Voltage, Megawatt and the road gap: the judged run.' },
  { id: 'spark', name: 'Spark Lane', difficulty: 'green', start: [30, 70], lanes: ['spark'], description: 'The flow lane: small tables, boxes, a stacked double, rollers, a side hit and a quarterpipe.' },
  { id: 'current', name: 'Current Lane', difficulty: 'blue', start: [30, 125], lanes: ['current'], description: 'Rails on the benches, then the Triple Stack, a step-down and the transfer hip into High Voltage.' },
  { id: 'high-voltage', name: 'High Voltage', difficulty: 'black', start: [30, 186], lanes: ['high'], description: 'Pro rails, two big tables, the Canal gap, a step-up and the 5 m quarterpipe.' },
  { id: 'grid', name: 'The Grid', difficulty: 'park', start: [40, 247], lanes: ['grid'], description: 'A jib garden: 16 boxes, tubes and rails in rows.' },
  { id: 'stairway', name: 'The Stairway', difficulty: 'black', start: 8, lanes: ['stair'], description: 'Step-down, step-up, step-down, then over the Stairway Spine.' },
  { id: 'hip-row', name: 'Hip Row', difficulty: 'blue', start: [460, -236], lanes: ['hips'], description: 'Four hips down the left side of the park.' },
  { id: 'superpipe', name: 'The Conduit', difficulty: 'black', start: 5, lanes: ['pipe'], description: 'A 22 ft superpipe, 240 m long.' },
  { id: 'big-air', name: 'The Tower', difficulty: 'double-black', start: 4, lanes: ['bigair'], description: 'A 33 m scaffold big air: 93 km/h on the in-run, 3 s in the air.' },
];

// Line goals (physics/flow.js, course.lineGoals): named features in order, in one clean run.
export const LINE_GOALS = [
  ['Rail Triple', 1500, 'Section 1', 'Section 2', 'Section 3'],
  ['Jump Line', 2600, 'Lightning', 'Thunder', 'Voltage', 'Megawatt'],
  ['Full Slopestyle', 5000, 'Section 1', 'Section 2', 'Section 3', 'Lightning', 'Thunder', 'Voltage', 'Megawatt', 'The Gap'],
  ['Triple Stack', 1800, 'Stack 1', 'Stack 2', 'Stack 3'],
  ['High Voltage', 2800, 'High DFD', 'High Rainbow', 'High Down Rail', 'High Voltage 1', 'High Voltage 2', 'The Canal'],
  ['Stairway', 2400, 'Stair Drop 1', 'Stair Up', 'Stair Drop 2', 'Stairway Spine'],
  ['Hip Row', 2200, 'Hip Left', 'Hip Right', 'The Spine', 'Hip Three', 'Hip Four'],
  ['Grid Runner', 1500, 'Grid Long Rail', 'Grid Kink', 'Grid Down Box', 'Grid Finale DFD'],
];
