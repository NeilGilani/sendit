// Voltage Park — the layout: every feature in one place (metres, degrees). Research: docs/map4-research.md.
// Local frame: u = metres down the fall line from the start gate (world x = START_X + u, the hill falls
// toward +x / east), v = metres across (world z; + = skier's right looking downhill, south). The sun
// comes from the south-south-east, so the park is cross-lit from the right.
//
//   v ≈ −250 … −215   Hip Row (two hips, a spine)             v ≈ −20 … +20  the SLOPESTYLE course
//   v ≈ −175          THE TOWER big air (scaffold in-run)     v ≈ +70        Spark Lane (small)
//   v ≈ −95           THE CONDUIT superpipe (22 ft)           v ≈ +125       Current Lane (medium)
//                                                             v ≈ +185       High Voltage (pro)
//                                                             v ≈ +245       The Grid (jib garden)

export const TILE = { size: 2048, res: 2049, farSize: 30000, farRes: 512 };
export const START_X = -380;            // world x of the start gate (u = 0)
export const TOP = 2310;                // m elevation at the start gate
export const FINISH_U = 795;            // run complete (the finish line across the arena)
export const PARK_HALF = 300;           // the groomed park is flat across |v| < this

// Fall-line profile from the start gate: [length m, degrees], smoothed ±10 m (research §8: jib zone 10–14°,
// in-runs 18–25°, run-outs 10–15°; the big landings are built up on top).
export const PROFILE = [
  [35, 20],     // drop-in from the start gate
  [255, 12],    // jib zone: the three rail sections, the Grid, the top of the lanes
  [70, 23],     // in-run to the jump line (research: in-runs 18–25°, ≥ 30 m)
  [345, 19],    // jump zone (tables built on top): run-outs and in-runs between the jumps
  [60, 9],      // finish run-out
  [9000, 2],
];
export const BEHIND = [[22, 4], [180, -24], [9000, -12]];   // behind the gate: the start deck, then up to the ridge

// ------------------------------------------------------------------ the slopestyle course
// Rails / boxes / tubes (jib features). Rail profile: segs = [[length m (along the rail), grade deg (absolute,
// − = down)], …] from a start h0 m above the snow; or shape 'rainbow' (len, hump) / 'c' (len, turn deg, radius).
// ramp: 'flush' (ride-on: the ramp meets the start of the rail), or { gap, drop, deg } (gap-on: a lip `gap` m
// before it, `drop` m under its height (−: above), at `deg` (default: the rail's first grade + 9°, + 14° for gaps ≥ 2 m, at least 3°):
// rolled without a pop you come down onto the start of the rail; pop and you land further along it). kind: rail (round, half 0.04), box (half 0.3), tube (half 0.45).
export const JIBS = [
  // Section 1 — THE CIRCUIT
  { name: 'Circuit Flat-Down', sec: 1, u: 52, v: -13, kind: 'rail', segs: [[3.5, 0], [7.5, -24]], h0: 0.75, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.15 },
  { name: 'Circuit Box', sec: 1, u: 50, v: 0, kind: 'box', half: 0.32, segs: [[12, -12]], h0: 0.45, ramp: 'flush', difficulty: 0.9 },
  { name: 'Circuit Down Rail', sec: 1, u: 54, v: 13, kind: 'rail', segs: [[9, -22]], h0: 0.9, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.1 },
  // Section 2 — SURGE
  { name: 'Surge DFD', sec: 2, u: 124, v: -13, kind: 'rail', segs: [[3.5, -24], [3.5, 0], [3.5, -24]], h0: 0.85, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.35 },
  { name: 'Surge Rainbow', sec: 2, u: 126, v: 0, kind: 'box', half: 0.3, shape: 'rainbow', len: 10, hump: 0.7, h0: 0.45, ramp: { gap: 0.8, drop: -0.05 }, difficulty: 1.3 },
  { name: 'Surge Tube', sec: 2, u: 124, v: 13, kind: 'tube', half: 0.45, segs: [[4, -6], [5, -22]], h0: 0.7, ramp: 'flush', difficulty: 1.05 },
  // Section 3 — OVERLOAD (the C-rail, the stair set with its kinked handrail, a gap to a long down box)
  { name: 'Overload C-Rail', sec: 3, u: 200, v: -16, kind: 'rail', shape: 'c', len: 13, turn: 38, h0: 0.75, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.5 },
  { name: 'Overload Handrail', sec: 3, u: 200, v: 2.2, kind: 'rail', segs: [[3, 0], [7, -30], [3, 0]], h0: 1.05, ramp: { gap: 1.3, drop: -0.05 }, difficulty: 1.5, stairs: { side: -1, steps: 9 } },
  { name: 'Overload Gap Box', sec: 3, u: 204, v: 15, kind: 'box', half: 0.35, segs: [[11, -16]], h0: 0.8, ramp: { gap: 2.4, drop: -0.05 }, difficulty: 1.2 },
];

// The jump line: three table-tops of growing size (research §8 rule 6: L 18–22 m knuckles, 28–30° lips,
// 30–38° landings). lip = u of the lip; table = lip → knuckle (m); vMax = fastest take-off the landing is built
// for (EFH ≤ ~0.7 m from the knuckle to there, then straight). kickH = lip height over the in-run snow.
export const JUMPS = [
  { name: 'Lightning', short: 'Jump 1', u: 392, v: -3, lipDeg: 27, R: 16, kickH: 3.6, table: 15, vMax: 21, hw: 3.2, deckHw: 11, landHw: 13, deckDeg: 4 },
  { name: 'Thunder', short: 'Jump 2', u: 502, v: -3, lipDeg: 29, R: 18, kickH: 4.1, table: 18, vMax: 23, hw: 3.4, deckHw: 11, landHw: 13, deckDeg: 4 },
  { name: 'Voltage', short: 'Jump 3', u: 616, v: -3, lipDeg: 30, R: 20, kickH: 4.6, table: 21, vMax: 25, hw: 3.6, deckHw: 12, landHw: 14, deckDeg: 4 },
];

// ------------------------------------------------------------------ the park lanes (small / medium / pro)
// Lane jumps (smaller tables), quarterpipes, step-ups and hips use the same builders as the main line.
export const LANES = [
  { id: 'spark', name: 'Spark Lane', level: 'small', v: 70, color: '#2ff5d6' },
  { id: 'current', name: 'Current Lane', level: 'medium', v: 125, color: '#3d8bff' },
  { id: 'high', name: 'High Voltage', level: 'pro', v: 185, color: '#ff3d9a' },
];

export const LANE_JUMPS = [
  // Spark (small: 5–8 m knuckles, 1–1.5 m kickers, 22–25° lips)
  { name: 'Spark 1', lane: 'spark', u: 70, v: 70, lipDeg: 22, R: 7, kickH: 1.2, table: 5, vMax: 13, hw: 2.4, deckHw: 4, landHw: 5 },
  { name: 'Spark 2', lane: 'spark', u: 160, v: 70, lipDeg: 23, R: 7, kickH: 1.3, table: 6, vMax: 14, hw: 2.4, deckHw: 4, landHw: 5 },
  { name: 'Spark 3', lane: 'spark', u: 400, v: 72, lipDeg: 24, R: 8, kickH: 1.4, table: 7, vMax: 16, hw: 2.5, deckHw: 4.5, landHw: 5.5 },
  { name: 'Spark 4', lane: 'spark', u: 520, v: 72, lipDeg: 24, R: 8, kickH: 1.5, table: 8, vMax: 17, hw: 2.5, deckHw: 4.5, landHw: 5.5 },
  // Current (medium: 10–16 m, 2–3.5 m, 26–28°)
  { name: 'Current 1', lane: 'current', u: 90, v: 125, lipDeg: 25, R: 10, kickH: 2.0, table: 10, vMax: 16, hw: 2.8, deckHw: 6, landHw: 7 },
  { name: 'Current 2', lane: 'current', u: 380, v: 125, lipDeg: 27, R: 11, kickH: 2.4, table: 12, vMax: 19, hw: 2.8, deckHw: 6, landHw: 7.5 },
  { name: 'Current 3', lane: 'current', u: 500, v: 125, lipDeg: 27, R: 12, kickH: 2.8, table: 14, vMax: 20, hw: 3, deckHw: 6.5, landHw: 8 },
  // High Voltage (pro: 16–22 m)
  { name: 'High Voltage 1', lane: 'high', u: 360, v: 186, lipDeg: 29, R: 14, kickH: 3.4, table: 17, vMax: 22, hw: 3.2, deckHw: 8, landHw: 9 },
  { name: 'High Voltage 2', lane: 'high', u: 480, v: 186, lipDeg: 31, R: 15, kickH: 3.8, table: 20, vMax: 24, hw: 3.3, deckHw: 8, landHw: 9.5 },
];

// Step-up (land uphill on a raised deck) and step-down, hips (the landing turned off the take-off's line).
export const STEPS = [
  { name: 'Step-Up', lane: 'high', kind: 'stepup', u: 590, v: 186, lipDeg: 30, R: 10, kickH: 2.2, gap: 4, rise: 1.0, deckLen: 10, hw: 3, landHw: 6, vMin: 10.5, vMax: 13.5, vSweet: 12 },
  { name: 'Step-Down', lane: 'current', kind: 'stepdown', u: 600, v: 125, lipDeg: 18, R: 10, kickH: 1.6, table: 6, vMax: 18, hw: 2.8, deckHw: 5, landHw: 7, drop: 0 },
];
export const HIPS = [
  // The kicker points `turn` deg off the fall line; the landing hill faces back down it.
  { name: 'Hip Left', u: 420, v: -232, turn: -32, lipDeg: 26, R: 10, kickH: 2.2, table: 8, vMax: 17, hw: 2.8, deckHw: 6, landHw: 8 },
  { name: 'Hip Right', u: 540, v: -240, turn: 30, lipDeg: 27, R: 10, kickH: 2.4, table: 9, vMax: 18, hw: 2.8, deckHw: 6, landHw: 8 },
];
// Quarterpipes: [u, v, width, height] — a wall across the fall line at the bottom of a lane (air straight up,
// land back in it: research §5.3, 4–7 m tall, radius ≈ 1.0–1.15 × the height).
export const QUARTERPIPES = [
  { name: 'Spark QP', u: 745, v: 72, w: 14, H: 3.2, R: 3.6 },
  { name: 'Voltage QP', u: 752, v: 186, w: 20, H: 5.2, R: 5.8 },
];
// Rollers: [u, v, half-width, height, sigma] — speed bumps / pump rollers on the lanes.
export const ROLLERS = [
  [240, 70, 6, 0.9, 4], [270, 70, 6, 0.9, 4], [300, 70, 6, 1.0, 4], [620, 72, 6, 0.8, 4],
  [270, 125, 6, 1.2, 5], [300, 125, 6, 1.2, 5],
];

// Lane jibs (same format as JIBS).
export const LANE_JIBS = [
  // Spark: beginner boxes and a fat tube, ride-on
  { name: 'Spark Box', lane: 'spark', u: 108, v: 70, kind: 'box', half: 0.4, segs: [[7, -12]], h0: 0.35, ramp: 'flush', difficulty: 0.7 },
  { name: 'Spark Tube', lane: 'spark', u: 205, v: 66, kind: 'tube', half: 0.5, segs: [[6, -12]], h0: 0.45, ramp: 'flush', difficulty: 0.8 },
  { name: 'Spark Ledge', lane: 'spark', u: 205, v: 75, kind: 'ledge', half: 0.35, segs: [[7, -10]], h0: 0.4, ramp: 'flush', difficulty: 0.75 },
  { name: 'Spark Down Box', lane: 'spark', u: 460, v: 72, kind: 'box', half: 0.4, segs: [[8, -17]], h0: 0.4, ramp: 'flush', difficulty: 0.75 },
  { name: 'Spark Butter Box', lane: 'spark', u: 590, v: 70, kind: 'box', half: 0.5, segs: [[9, -15]], h0: 0.35, ramp: 'flush', difficulty: 0.7 },
  // Current: flat-downs, a kink, a wide tube
  { name: 'Current Flat-Down', lane: 'current', u: 168, v: 121, kind: 'rail', segs: [[3, 0], [5, -22]], h0: 0.7, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.1 },
  { name: 'Current Box', lane: 'current', u: 168, v: 131, kind: 'box', half: 0.3, segs: [[9, -12]], h0: 0.45, ramp: 'flush', difficulty: 0.9 },
  { name: 'Current Kink', lane: 'current', u: 232, v: 125, kind: 'rail', segs: [[4, -10], [5, -26]], h0: 0.8, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.2 },
  { name: 'Current Tube', lane: 'current', u: 440, v: 121, kind: 'tube', half: 0.45, segs: [[8, -16]], h0: 0.6, ramp: 'flush', difficulty: 1.0 },
  // High Voltage: big DFD, rainbow rail, a long down rail
  { name: 'High DFD', lane: 'high', u: 110, v: 186, kind: 'rail', segs: [[4, -24], [4, 0], [4, -24]], h0: 1.1, ramp: { gap: 1.4, drop: -0.05 }, difficulty: 1.45 },
  { name: 'High Rainbow', lane: 'high', u: 180, v: 186, kind: 'rail', shape: 'rainbow', len: 11, hump: 1.0, h0: 0.7, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.5 },
  { name: 'High Down Rail', lane: 'high', u: 250, v: 186, kind: 'rail', segs: [[13, -20]], h0: 1.1, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.3 },
  { name: 'High Kink', lane: 'high', u: 290, v: 186, kind: 'rail', segs: [[3, 0], [5, -26], [3, -8]], h0: 1.0, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.45 },
];

// THE GRID — a jib garden: rows of boxes, tubes and rails, all ride-on or small gap-ons, every 8–20 m.
export const GRID = { u0: 60, u1: 300, v: 245 };
export const GRID_JIBS = [
  { name: 'Grid Box A', u: 70, v: 236, kind: 'box', half: 0.3, segs: [[8, -12]], h0: 0.4, ramp: 'flush' },
  { name: 'Grid Rail A', u: 72, v: 246, kind: 'rail', segs: [[8, -14]], h0: 0.6, ramp: { gap: 0.9, drop: -0.05 } },
  { name: 'Grid Tube A', u: 70, v: 256, kind: 'tube', half: 0.5, segs: [[7, -12]], h0: 0.5, ramp: 'flush' },
  { name: 'Grid Flat Box', u: 100, v: 241, kind: 'box', half: 0.3, segs: [[6, 0]], h0: 0.45, ramp: 'flush' },
  { name: 'Grid Down Rail', u: 102, v: 252, kind: 'rail', segs: [[7, -22]], h0: 0.9, ramp: { gap: 1.0, drop: -0.05 } },
  { name: 'Grid A-Frame', u: 132, v: 236, kind: 'box', half: 0.3, segs: [[3, 6], [2, 0], [4, -24]], h0: 0.35, ramp: 'flush', difficulty: 1.25 },
  { name: 'Grid Long Rail', u: 130, v: 248, kind: 'rail', segs: [[14, -13]], h0: 0.6, ramp: { gap: 0.9, drop: -0.05 }, difficulty: 1.2 },
  { name: 'Grid Wide Tube', u: 132, v: 258, kind: 'tube', half: 0.55, segs: [[9, -14]], h0: 0.6, ramp: 'flush' },
  { name: 'Grid Kink', u: 170, v: 240, kind: 'rail', segs: [[4.5, -6], [4, -24], [3, -6]], h0: 0.7, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.3 },
  { name: 'Grid S-Rail', u: 174, v: 250, kind: 'rail', shape: 'c', len: 11, turn: -20, h0: 0.65, ramp: { gap: 1.0, drop: -0.05 }, difficulty: 1.4 },
  { name: 'Grid Rainbow Box', u: 205, v: 236, kind: 'box', half: 0.35, shape: 'rainbow', len: 9, hump: 0.6, h0: 0.4, ramp: 'flush', difficulty: 1.2 },
  { name: 'Grid Down Box', u: 211, v: 247, kind: 'box', half: 0.3, segs: [[10, -20]], h0: 0.6, ramp: { gap: 1.0, drop: -0.05 } },
  { name: 'Grid Ledge', u: 207, v: 258, kind: 'ledge', half: 0.4, segs: [[9, -12]], h0: 0.5, ramp: 'flush' },
  { name: 'Grid Battleship', u: 240, v: 242, kind: 'box', half: 0.3, segs: [[3.5, 10], [3.5, -30]], h0: 0.3, ramp: 'flush', difficulty: 1.3 },
  { name: 'Grid Cannon', u: 242, v: 254, kind: 'tube', half: 0.4, segs: [[10, -14]], h0: 0.7, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.15 },
  { name: 'Grid Finale DFD', u: 272, v: 247, kind: 'rail', segs: [[3.5, -22], [3, -6], [3.5, -22]], h0: 0.85, ramp: { gap: 1.2, drop: -0.05 }, difficulty: 1.4 },
];

// ------------------------------------------------------------------ left side: pipe, big air, hips
export const PIPE = { name: 'The Conduit', u0: 355, u1: 575, v: -95, F: 3.2, R: 7.2, H: 6.7, vertDeg: 82, D: 7 };
// Big air: a scaffold in-run (top deck `top` m over the snow at u0), 34° in-run, a 32° lip, a 22 m table to
// the knuckle and an EFH landing for take-offs up to vMax (research §2: Shougang 30° in-run, 5 m kicker, 20 m
// to the knoll, 38° landing; a 30 m jump needs ~16 m/s at the lip).
export const BIG_AIR = { name: 'The Tower', u: 322, v: -172, top: 31, deckLen: 8, inDeg: 34, R: 22, lipDeg: 32, kickH: 5, table: 24, vMax: 26, hw: 4, deckHw: 9, landHw: 12 };

// ------------------------------------------------------------------ practice: drop zones (keys 1–9)
// [name, u, v, heading offset deg from the fall line]
export const DROP_ZONES = [
  ['Start Gate · Slopestyle', 2, 0, 0],
  ['Rail Section 2 · Surge', 104, 0, 0],
  ['Rail Section 3 · Overload', 180, 0, 0],
  ['Jump Line', 330, -3, 0],
  ['The Tower · Big Air', 0, 0, 0],          // placed on the scaffold deck (course.js)
  ['The Conduit · Superpipe', 0, 0, 0],      // at the top of the pipe
  ['Spark Lane · Small', 40, 70, 0],
  ['High Voltage · Pro', 300, 186, 0],
  ['The Grid · Jib Garden', 45, 247, 0],
];

// Line goals (physics/flow.js, course.lineGoals): named features in order, in one clean run.
export const LINE_GOALS = [
  ['Rail Triple', 1500, 'Section 1', 'Section 2', 'Section 3'],
  ['Jump Line', 2000, 'Lightning', 'Thunder', 'Voltage'],
  ['Full Slopestyle', 3500, 'Section 1', 'Section 2', 'Section 3', 'Lightning', 'Thunder', 'Voltage'],
  ['High Voltage', 2200, 'High DFD', 'High Rainbow', 'High Down Rail', 'High Voltage 1', 'High Voltage 2'],
  ['Grid Runner', 1500, 'Grid Long Rail', 'Grid Kink', 'Grid Down Box', 'Grid Finale DFD'],
];
