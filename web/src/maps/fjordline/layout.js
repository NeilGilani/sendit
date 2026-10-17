// Fjordline — the layout: every feature of the mountain in one place (metres, degrees).
// Local frame (as Ravenspire): u = metres down the fall line from the summit col (world x = START_X + u, the
// mountain falls toward +x / east, onto the fjord), v = metres across it (world z; + = skier's right looking
// downhill, south). The fjord runs north–south below the village; the headland (Kvalneset) closes the bay on
// the right, the long shoulder (Fjordryggen) on the left. Low golden-hour sun from the south-east.
//
// Height levels are absolute world metres: the fjord surface is SEA; the summit col is computed so that
// the face profile lands exactly on the beach at the shore (course.js).

export const TILE = { size: 3072, res: 2049, farSize: 30000, farRes: 512 };
export const START_X = -1380;          // world x of the summit col (u = 0)
export const SEA = 1850;               // the fjord surface (world y). Just under the valley-haze top: a thin sea haze
export const BEACH = 1.2;              // metres above the sea: the beach / quay flats
export const SHORE_U = 2470;           // the bay's shoreline at v = 0 (u)
export const FINISH_U = 2430;          // run complete (progress, metres of u, normalised to the bay shore)

// Fall-line gradient profile of the main face from the col: [length m, degrees]. Smoothed ±15 m.
export const PROFILE = [
  [18, 12],     // the summit col (the cairn)
  [42, 30],     // rollover into the cirque
  [480, 42],    // upper cirque: Skaret couloir (right), open face, Sølvryggene spines (left)
  [380, 38],    // mid face: Ørneredet band, Kråkesteget
  [440, 32],    // lower face: Hammaren band, wind lips
  [420, 25],    // the apron: the big rollers (Bølgene)
  [360, 18],    // birch line: Bjørkehoppet
  [180, 11],    // the village slope
  [70, 5],      // down to the beach
  [9000, 0],    // the beach / quay flats (the coast cut takes it under the sea)
];
export const BEHIND = [[22, 4], [200, -34], [9000, -12]];   // behind the col (negative = falling away backward)

// The long shoulder on the left (the blue cruiser): its own, gentler fall-line profile; it lands on the beach too.
export const SHOULDER = {
  profile: [[24, 7], [50, 20], [1420, 29], [480, 23], [300, 14], [180, 5], [9000, 0]],
  behind: [[260, 31], [9000, 14]],   // rising behind its top into the summit massif (a ridge, not a wall)
  crest: (u) => -1080 + 30 * Math.sin(u / 310) * (1 - smoothRange(u, 1500, 1900)) + 440 * smoothRange(u, 1500, 2400),   // crest v(u): swings into the bay
  width: 270,          // m from the crest where the crown has fallen `crown` metres
  crown: 55,
};

// The cirque: a bowl between the left ridge (v ≈ −720, falls to the shoulder) and the headland ridge
// (v ≈ +470). Its cross-section flattens into the bay low down.
export const CIRQUE = {
  left: -720, right: 470,
  ridgeHeight: (u) => (34 + 0.11 * Math.min(Math.max(u, 0), 1250)) * (1 - smoothRange(u, 1500, 2300)),
  power: 2.3,
  wallHeight: (u) => 85 * smoothRange(u, 10, 140) * (1 - smoothRange(u, 380, 760)),   // rock walls ring the upper cirque
};

// Skaret: the hero couloir through the summit rock band (right of centre). Floor half-width hw(u), rock walls
// rising wallH(u) above the face on each side (a rock mass `mass` m wide), a choke and a chokestone ledge.
export const COULOIR = {
  name: 'Skaret', u0: 34, u1: 590,
  centre: (u) => 175 + 22 * Math.sin((u - 40) / 150) + 10 * Math.sin(u / 47),
  halfWidth: (u) => 12 - 7.6 * bump(u, 312, 34) - 2 * bump(u, 190, 60) + 4 * smoothRange(u, 430, 590),   // choke ≈ 4.4 m half-width at u 312
  wallH: (u) => 34 * smoothRange(u, 34, 120) * (1 - smoothRange(u, 470, 590)),
  mass: 85,
  chokestone: [352, 4.2],   // [u, drop m]: an ice-glazed step just below the choke
};

// Cliff bands across the face (Ravenspire's band model). uc = lip (u), [v0, v1] extent, h = height, var = ±,
// bench = approach length above the lip, gaps = [v, halfWidth] ramp-arounds, peak = [v, +h, width].
export const BANDS = [
  { name: 'Ørneredet', uc: 612, v0: -330, v1: 250, h: 10, var: 3, bench: 50, wob: 6, seed: 1, gaps: [[-210, 20], [95, 16]], peak: [175, 6, 40] },
  { name: 'Kråkesteget', uc: 880, v0: -640, v1: -390, h: 8, var: 2.5, bench: 36, wob: 6, seed: 2, gaps: [[-560, 14]] },
  { name: 'Hammaren', uc: 1075, v0: -300, v1: 220, h: 12, var: 3, bench: 52, wob: 5, seed: 3, gaps: [[-245, 18], [150, 16]], peak: [-30, 8, 36] },
  { name: 'Sjøsteget', uc: 1330, v0: 60, v1: 330, h: 7, var: 2, bench: 32, wob: 6, seed: 4, gaps: [[200, 14]] },
  // Off the lines: rock steps that break up the face (and are there for anyone who goes looking).
  { name: 'Ytre Hammaren', uc: 760, v0: 250, v1: 420, h: 11, var: 4, bench: 44, wob: 7, seed: 5, gaps: [] },
  { name: 'Trollveggen', uc: 1240, v0: -700, v1: -540, h: 14, var: 5, bench: 56, wob: 8, seed: 6, gaps: [[-610, 12]] },
  { name: 'Ramnaberget', uc: 470, v0: -330, v1: -120, h: 9, var: 3, bench: 40, wob: 6, seed: 7, gaps: [[-230, 16]] },
];

// Spine field on the left of the upper cirque (Sølvryggene, "the silver spines"): absolute v.
export const SPINES = { u0: 120, u1: 830, v0: -650, v1: -360, spacing: 27, height: 12, wander: 12 };

// Rock buttresses: sharp aretes along the fall line between the lines (they show rock: Lyngen faces are ribbed).
// v0 → v1 = crest position at u0 → u1, w = half-width at the foot, h = height above the face.
export const BUTTRESSES = [
  { name: 'Ramnaryggen', u0: 90, u1: 640, v0: -300, v1: -250, w: 46, h: 30, seed: 1 },
  { name: 'Kvalryggen', u0: 560, u1: 1350, v0: 330, v1: 395, w: 55, h: 30, seed: 2 },
  { name: 'Trollryggen', u0: 880, u1: 1560, v0: -690, v1: -640, w: 55, h: 26, seed: 3 },
  { name: 'Midtryggen', u0: 1180, u1: 1700, v0: 210, v1: 250, w: 42, h: 18, seed: 4 },
];

// Natural hits: [u, v, half-length across (m), height (m), kind, name?] — rollers (symmetric), lips (gentle
// up, abrupt down), kickers (a steeper, shorter lip).
export const HITS = [
  // Bølgene: the big rollers across the apron (the cruiser and the jump line meet here).
  [1440, -120, 300, 4.2, 'roller', 'Bølgene'],
  [1520, -100, 300, 4.6, 'roller', 'Bølgene'],
  [1600, -80, 300, 4.8, 'roller', 'Bølgene'],
  [1680, -80, 280, 4.4, 'roller', 'Bølgene'],
  [1760, -100, 240, 3.8, 'roller', 'Bølgene'],
  // Wind lips on the face.
  [770, -110, 22, 2.4, 'lip'],
  [1215, -160, 28, 3.0, 'lip'],
  [1255, 60, 24, 3.2, 'lip'],
  [1160, -480, 26, 2.8, 'lip'],
  // The birch line: Bjørkehoppet (the birch jump) and a smaller one beside it.
  [1905, -330, 18, 3.6, 'kicker', 'Bjørkehoppet'],
  [1960, -60, 16, 2.8, 'kicker', 'Bjørkehoppet'],
  [1990, 170, 16, 2.6, 'lip'],
  // The boathouse gap: a kicker the village kids shovel up in front of the naust.
];

// Shoulder rollers: along the shoulder's crest (u list), half-length across, height.
export const SHOULDER_ROLLERS = { us: [520, 640, 760, 880, 1000, 1120, 1240, 1360, 1500, 1640, 1780, 1920], half: 170, h: 4.4, width: 16 };

// Kvalneset: the headland ridge closing the bay on the right. Its crest runs from the cirque's right ridge out to
// a lighthouse on the point; crest elevation = a fall-line profile (scaled so the point sits `tipAbove` m above
// the sea) plus cliff steps (Trappa I–III) and a last edge (Neskanten) onto the point's plateau.
export const HEADLAND = {
  u0: 540, u1: 2900, tip: 2812, tipAbove: 30,
  crest: (u) => 468 + 220 * smoothRange(u, 600, 2700) + 18 * Math.sin(u / 230),
  profile: [[440, 32], [600, 25], [600, 21], [400, 15], [400, 3]],   // from u0
  top: 16,              // half-width of the rounded crest (m)
  bayFlank: 36, seaFlank: 46,   // flank angles (deg): steep rock on the sea side
  steps: [
    { name: 'Trappa I', uc: 1210, h: 9 },
    { name: 'Trappa II', uc: 1520, h: 12 },
    { name: 'Trappa III', uc: 1860, h: 13 },
    { name: 'Neskanten', uc: 2290, h: 15 },
  ],
};

// The coast: the shoreline u(v) of the base land (the headland and the shoulder carry their own height).
// Bay (v −430…380) at SHORE_U; a point on the left (Sandvika, the drying racks); the open fjord on the right.
export function coastU(v) {
  const bay = SHORE_U + 8 * Math.sin(v / 37);
  const left = 2530 + 30 * Math.sin(v / 90);
  const right = 2020 - 0.25 * (v - 600);
  let c = bay;
  c += (left - bay) * smoothRange(-v, 430, 600);
  c += (right - bay) * smoothRange(v, 380, 640);
  return c;
}
/** The coast the run is measured to (progress is normalised by it): the bay, Sandvika and the point. */
export function finishCoastU(v) {
  return SHORE_U + (2530 - SHORE_U) * smoothRange(-v, 430, 600) + (2830 - SHORE_U) * smoothRange(v, 420, 560);
}

// The fjord beyond: the far shore, and how deep the water gets.
export const FJORD = { farShore: 6400, depth: 60, shelf: 0.9 };

// Buildings. u, v = centre; yaw = rotation of the long axis away from the fall line (rad); L along it, W across;
// roof: 'gable' (ridge across the long axis), 'mono'; stilts: m of stilts on the water side (rorbuer).
// colour: 'red' | 'ochre' | 'white' | 'tar'. Every roof is rideable (structures.js).
export const BUILDINGS = [
  // The roof-hop row on the jump line (Brygga): long axis down the fall line, ridge across it.
  // Each roof is a kicker: ride the drift up the uphill slab, air off the ridge, land on the downhill slab or past the eave.
  { id: 'hus1', name: 'Kjøpmannshuset', u: 2205, v: -112, L: 13, W: 10, roof: 'gable', pitch: 27, eave: 3.6, drift: 0.62, driftSlope: 0.05, ramp: 3.2, colour: 'white', chimney: [0.25, 0.62] },
  { id: 'hus2', name: 'Bakeriet', u: 2262, v: -108, L: 12, W: 9, roof: 'gable', pitch: 28, eave: 3.4, drift: 0.62, driftSlope: 0.05, ramp: 3.2, colour: 'ochre', chimney: null },
  { id: 'hus3', name: 'Postkontoret', u: 2318, v: -106, L: 12, W: 9.5, roof: 'gable', pitch: 26, eave: 3.4, drift: 0.62, driftSlope: 0.05, ramp: 3.2, colour: 'red', chimney: [-0.3, -0.62] },
  // Naust: the boathouse at the top of the beach (jump it: Naustgapet).
  { id: 'naust', name: 'Naustgapet', u: 2400, v: -110, L: 8, W: 7, roof: 'gable', pitch: 32, eave: 2.4, drift: 0.92, driftSlope: 0.04, ramp: 3, colour: 'tar', chimney: null, yaw: 0 },
  // Village houses off the line.
  { id: 'hus4', name: 'Skolen', u: 2240, v: 40, L: 18, W: 10, roof: 'gable', pitch: 32, eave: 5.2, drift: 0, driftSlope: 0.05, colour: 'white', yaw: Math.PI / 2 },
  { id: 'hus5', name: 'Bedehuset', u: 2300, v: -300, L: 14, W: 9, roof: 'gable', pitch: 40, eave: 4.6, drift: 0, driftSlope: 0.05, colour: 'white', yaw: Math.PI / 2 },
  { id: 'hus6', name: 'Gamle Smia', u: 2335, v: 110, L: 9, W: 7, roof: 'gable', pitch: 36, eave: 3.2, drift: 0, driftSlope: 0.05, colour: 'red', chimney: [0, 0.4] },
  { id: 'hus7', name: 'Fiskarheimen', u: 2195, v: 180, L: 11, W: 9, roof: 'gable', pitch: 34, eave: 4.0, drift: 0, driftSlope: 0.05, colour: 'ochre' },
  // Rorbuer on stilts at the water's edge, right of the pier (gable ends to the sea).
  { id: 'rorbu1', name: 'Rorbu', u: 2462, v: 48, L: 10, W: 7, roof: 'gable', pitch: 38, eave: 3.4, drift: 0, driftSlope: 0.05, colour: 'red', stilts: 2.2 },
  { id: 'rorbu2', name: 'Rorbu', u: 2464, v: 74, L: 10, W: 7, roof: 'gable', pitch: 38, eave: 3.4, drift: 0, driftSlope: 0.05, colour: 'red', stilts: 2.2 },
  { id: 'rorbu3', name: 'Rorbu', u: 2460, v: 100, L: 10, W: 7, roof: 'gable', pitch: 38, eave: 3.4, drift: 0, driftSlope: 0.05, colour: 'ochre', stilts: 2.2 },
  { id: 'rorbu4', name: 'Rorbu', u: 2466, v: 128, L: 11, W: 7.5, roof: 'gable', pitch: 38, eave: 3.4, drift: 0, driftSlope: 0.05, colour: 'red', stilts: 2.2 },
  { id: 'rorbu5', name: 'Rorbu', u: 2461, v: 156, L: 10, W: 7, roof: 'gable', pitch: 38, eave: 3.4, drift: 0, driftSlope: 0.05, colour: 'red', stilts: 2.2 },
  { id: 'sjohus', name: 'Sjøhuset', u: 2452, v: 200, L: 16, W: 10, roof: 'gable', pitch: 36, eave: 4.6, drift: 0, driftSlope: 0.05, colour: 'ochre', stilts: 2.2, yaw: Math.PI / 2 },
];

// The harbour: a timber quay along the shore and a pier into the fjord (rideable decks), all at QUAY m above the sea.
export const QUAY = 2.0;
export const HARBOUR = {
  quay: { u0: SHORE_U - 22, u1: SHORE_U + 6, v0: -240, v1: 30 },       // along the shore, the finish arch on it
  pier: { u0: SHORE_U - 4, u1: SHORE_U + 86, v0: -52, v1: -44 },       // out into the fjord (jump off the end: splash)
};
// The finish arch (visual) across the quay, and the lighthouse on the point.
export const FINISH_ARCH = { u: FINISH_U, v: -100, span: 64 };
export const LIGHTHOUSE = { u: 2772, h: 15 };     // v from the headland crest
// Hjell: stockfish drying racks on the Sandvika beach (left). [u, v, length, yaw]
export const HJELL = [[2440, -520, 22, 0.1], [2468, -560, 20, 0.05], [2420, -600, 24, 0.15], [2495, -610, 18, 0]];

// Drop zones (Steep-style, keys 1–9): every trail's top, then the big features.
export const DROP_ZONES = [
  ['Skaret', 30, 175, 'skaret'],
  ['Sølvryggene', 125, -500, 'solvryggen'],
  ['Kvalneset', 660, 'headland', 'kvalneset'],
  ['Fjordryggen', 30, 'shoulder', 'fjordlopa'],
  ['Brygga', 1570, -70, 'brygga'],
  ['Sjøsiden', 1880, -380, 'sjosiden'],
  ['Ørneredet', 470, -20],
  ['Hammaren', 930, -40],
  ['Bølgene', 1360, -150],
];

// The trails (static data for the lobby in index.js; spawn / finish here). length / vertical are measured
// along RIDE_LINES by scripts/map7-unit.mjs (and checked there).
export const TRAILS = [
  { id: 'skaret', name: 'Skaret', difficulty: 'double-black', length: 3000, vertical: 1445, description: 'The hero couloir: 45° through the summit rock, a 9 m choke and an ice chokestone, spat straight onto Ørneredet, then Hammaren, the rollers and the harbour.' },
  { id: 'kvalneset', name: 'Kvalneset', difficulty: 'double-black', length: 2580, vertical: 975, description: 'The headland: ride the crest above the fjord and drop its stairs (Trappa I–III), off Neskanten onto the point. The lighthouse is the finish; past it is the sea.' },
  { id: 'solvryggen', name: 'Sølvryggene', difficulty: 'black', length: 2830, vertical: 1335, description: 'The silver spines: slash a 45° spine face, Kråkesteget, wind lips, Bjørkehoppet in the birches and the village roofs to the quay.' },
  { id: 'fjordlopa', name: 'Fjordløypa', difficulty: 'blue', length: 3040, vertical: 1105, description: 'Top to sea: the long shoulder, twelve big rollers at 60 mph, a sweep into the bay past the drying racks to the harbour.' },
  { id: 'brygga', name: 'Brygga', difficulty: 'park', length: 975, vertical: 265, description: 'The village jump line: the big rollers, Bjørkehoppet, a roof-hop over three houses and the gap over the boathouse onto the quay.' },
  { id: 'sjosiden', name: 'Sjøsiden', difficulty: 'green', length: 710, vertical: 135, description: 'The easy way down to the sea: through the birches and the village lanes to the harbour.' },
];

// Line goals (Steep "Mountain Stories" style): named features in order in one clean run. [name, bonus, ...features]
export const LINE_GOALS = [
  ['Skarvtind Classic', 2600, 'Skaret', 'Ørneredet', 'Hammaren'],
  ['Stairway to the Sea', 2600, 'Trappa I', 'Trappa II', 'Trappa III', 'Neskanten'],
  ['Silver Lining', 1600, 'Sølvryggene', 'Kråkesteget', 'Bjørkehoppet'],
  ['Rorbu Hopper', 1800, 'Kjøpmannshuset', 'Bakeriet', 'Postkontoret'],
  ['Naustgapet', 1500, 'Naustgapet'],
  ['Wave Rider', 1200, 'Bølgene', 'Bølgene', 'Bølgene'],
  ['Ski to Sea', 3000, 'Skaret', 'Hammaren', 'Bølgene', 'Naustgapet'],
  ['Rollercoaster', 1400, 'Fjordryggen Roller', 'Fjordryggen Roller', 'Fjordryggen Roller', 'Fjordryggen Roller'],
];

// The canonical lines, as (u, v) waypoints ('headland' = the headland crest, 'shoulder' = the shoulder crest):
// the bots ride them, the course keeps glades through the birches and rocks off them, and the trails follow them.
export const RIDE_LINES = {
  skaret: { name: 'Skaret couloir → Ørneredet → Hammaren', trail: 'skaret', pts: [[0, 175], 'couloir', [600, 175], [800, 60], [1000, -30], [1200, -60], [1500, -80], [1800, -60], [2100, -60], [2300, -40], [2480, -48]] },
  kvalneset: { name: 'Kvalneset headland stairs', trail: 'kvalneset', pts: [[640, 'headland'], 'headland', [2800, 'headland']] },
  solvryggen: { name: 'Sølvryggene spines → Bjørkehoppet', trail: 'solvryggen', pts: [[100, -500], [400, -520], [700, -500], [950, -470], [1200, -420], [1500, -380], [1800, -340], [1905, -330], [2050, -250], [2200, -180], [2350, -130], [2480, -150]] },
  fjordlopa: { name: 'Fjordløypa (top to sea)', trail: 'fjordlopa', pts: ['shoulder', [2420, -470], [2500, -470]] },
  brygga: { name: 'Brygga jump line (roofs, Naustgapet)', trail: 'brygga', pts: [[1560, -70], [1800, -80], [1960, -60], [2100, -100], [2205, -112], [2262, -108], [2318, -106], [2404, -110], [2480, -110]] },
  sjosiden: { name: 'Sjøsiden (green)', trail: 'sjosiden', pts: [[1880, -380], [2000, -420], [2150, -380], [2280, -230], [2380, -180], [2480, -180]] },
};

function bump(x, c, w) { const t = (x - c) / w; return Math.exp(-t * t); }
export function smoothRange(x, a, b) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
