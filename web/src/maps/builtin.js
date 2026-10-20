// The built-in maps. Imported once (main.js) for its side effect of registering them.
//
//  • valcrest-gully — the hand-built powder gully (course.js). The default map.
//  • lake-tahoe     — real Lake Tahoe mountains (realcourse.js); each resort run is a variant and a trail.
//                     Kept because the game already supported it (?resort=<id>&run=<n>).
// Mountains and trails: docs/maps.md. Adapters for maps registered elsewhere: ./adapters.js.
import { registerMap } from './registry.js';
import { Course } from '../course.js';
import { RealCourse } from '../realcourse.js';
import { assetUrl } from '../base.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

const GULLY_THUMB = svg(`
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f94d6"/><stop offset="1" stop-color="#eef2f6"/></linearGradient></defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 62 L30 26 L52 44 L80 14 L108 44 L130 24 L160 58 L160 90 L0 90 Z" fill="#dfe6f0"/>
  <path d="M0 90 L0 58 L40 40 L70 70 L80 64 L90 70 L120 40 L160 56 L160 90 Z" fill="#fafcff"/>
  <path d="M70 70 L80 64 L90 70 L84 90 L76 90 Z" fill="#b6cff6"/>
  <g fill="#22413a"><path d="M24 70 l5 -12 l5 12z"/><path d="M34 74 l4 -10 l4 10z"/><path d="M122 70 l5 -12 l5 12z"/><path d="M132 75 l4 -10 l4 10z"/></g>`);

const TAHOE_THUMB = svg(`
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5f94d6"/><stop offset="1" stop-color="#eef2f6"/></linearGradient></defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 58 L26 30 L46 44 L72 18 L98 46 L122 28 L160 54 L160 90 L0 90 Z" fill="#eef3fa"/>
  <path d="M72 18 L80 28 L74 30 L66 26 Z M26 30 L32 38 L22 36 Z" fill="#b6cff6"/>
  <path d="M0 72 C40 64 120 64 160 72 L160 90 L0 90 Z" fill="#3f7fc4"/>
  <path d="M10 76 C50 70 110 70 150 76" stroke="#9cc7f2" stroke-width="1.5" fill="none"/>`);

// Valcrest trails start on the gully's centre line at fall-line position t (course.centre(t)); the
// first is the normal spawn. Lengths / verticals: start → finish (finishT 2330), measured on the course.
const VALCREST_STARTS = { 'middle-drops': 690, 'the-steep': 1085, 'lower-gully': 1450, 'big-drop': 1925 };

registerMap({
  id: 'valcrest-gully',
  name: 'Valcrest Gully',
  description: 'Hand-built powder gully with jumps, pillows and drops.',
  thumbnail: GULLY_THUMB,
  order: 1,
  tags: ['handmade', 'park'],
  mountain: {
    id: 'valcrest', name: 'Valcrest', region: 'Coastal Alps · hand-built',
    blurb: 'A winding powder gully between rock walls: berms, side hits, pillows and five natural drops.',
    accent: '#7fb6ff',
  },
  trails: [
    { id: 'gully', name: 'Valcrest Gully', difficulty: 'blue', featured: true, length: 2450, vertical: 650,
      description: 'The whole gully, gate to finish: berms, side hits and all five drops.' },
    { id: 'middle-drops', name: 'The Middle Drops', difficulty: 'blue', length: 1760, vertical: 470,
      description: 'Skip the warm-up: drop in above the second lip and link four drops.' },
    { id: 'the-steep', name: 'The Steep', difficulty: 'black', length: 1330, vertical: 360,
      description: 'Straight onto the 4 m drop that opens the steepest pitch of the gully.' },
    { id: 'lower-gully', name: 'Lower Gully', difficulty: 'blue', length: 940, vertical: 240,
      description: 'The last two drops and the long, fast finish.' },
    { id: 'big-drop', name: 'The Big Drop', difficulty: 'black', length: 430, vertical: 110,
      description: 'One job: line up the 4.5 m lip at the bottom and stomp it.' },
  ],
  describe: () => 'Hand-built powder run · 2.5 km',
  load: async () => {
    const course = new Course();
    course.trailSpawn = (id) => {
      const t = VALCREST_STARTS[id];
      if (t == null) return null;
      const c = course.centre(t);
      return { x: c.x, z: c.z, heading: c.heading };
    };
    return course;
  },
});

let tahoeIndex = null;
async function fetchTahoeIndex() {
  if (!tahoeIndex) {
    tahoeIndex = fetch(assetUrl('resorts/index.json')).then((r) => (r.ok ? r.json() : [])).catch(() => []);
  }
  return tahoeIndex;
}

// Lake Tahoe's trails = the real resorts' runs (static copy of /resorts/index.json, built by
// tools/build_resorts.py): [resort id, resort, run index, run, difficulty, length m, vertical m].
// OSM difficulty → ours: easy green, intermediate blue, advanced black, expert double black.
const TAHOE_RUNS = [
  ["olympic_valley", "Olympic Valley", 0, "Main Chute → Newport → Sunnyside", 'double-black', 4136, 785],
  ["olympic_valley", "Olympic Valley", 1, "Kitchen Wall → Sun Bowl → Bullet", 'double-black', 3832, 775],
  ["olympic_valley", "Olympic Valley", 2, "Monument Ridge → Emigrant Face → Bailey's", 'blue', 5609, 760],
  ["alpine_meadows", "Alpine Meadows", 0, "D5 → Wolverine → The Face", 'blue', 2063, 473],
  ["alpine_meadows", "Alpine Meadows", 1, "Alpine Bowl → Rock Garden → Upper Loop Road", 'blue', 2616, 468],
  ["alpine_meadows", "Alpine Meadows", 2, "Keyhole 2 → Keyhole 1 → East Palisades", 'double-black', 2062, 458],
  ["mt_pluto", "Mt. Pluto", 0, "Sierra Grande → Challenger → Lower Burnout", 'black', 2780, 566],
  ["mt_pluto", "Mt. Pluto", 1, "Polaris → Lower Burnout", 'black', 1877, 564],
  ["mt_pluto", "Mt. Pluto", 2, "West Ridge → Upper Jibboom → Goldmine", 'blue', 3800, 550],
  ["monument_peak", "Monument Peak", 0, "Ellie's → California Trail → High Five", 'black', 7214, 1004],
  ["monument_peak", "Monument Peak", 1, "Aries → Orion's Belt → Big Dipper", 'blue', 5148, 689],
  ["monument_peak", "Monument Peak", 2, "Cloud 9 → Olympic Downhill → Lower Stagecoach", 'blue', 2860, 594],
  ["kirkwood", "Kirkwood Valley", 0, "Headwaters → Wagon Trail → Short Spoke", 'black', 1823, 489],
  ["kirkwood", "Kirkwood Valley", 1, "The Wall → Buckboard", 'double-black', 1714, 483],
  ["kirkwood", "Kirkwood Valley", 2, "Notch chute → all the way → The Drain", 'double-black', 1719, 432],
  ["huckleberry", "Huckleberry Ridge", 0, "Sugar n' Spice", 'green', 3834, 477],
  ["huckleberry", "Huckleberry Ridge", 1, "Eastabout → Castle → Lower Castle", 'black', 2206, 475],
  ["huckleberry", "Huckleberry Ridge", 2, "Chair Line (unofficial) → Lower Dynamite → Sugar n' Spice", 'double-black', 1506, 470],
  ["mt_rose", "Mt. Rose", 0, "El Cap → Tailings", 'double-black', 1081, 404],
  ["mt_rose", "Mt. Rose", 1, "Main Lodge Return → Kit Carson Traverse → Around The World", 'blue', 3582, 402],
  ["mt_rose", "Mt. Rose", 2, "Upper Northwest → Express → Northwest Passage", 'blue', 1418, 384],
  ["mt_lincoln", "Mt. Lincoln", 0, "Rhalves' Run → Shortcut → California Street", 'blue', 2633, 424],
  ["mt_lincoln", "Mt. Lincoln", 1, "Century Club → Sherpa Creek → Sidewinder", 'double-black', 2375, 381],
  ["mt_lincoln", "Mt. Lincoln", 2, "Tunnel → Sunset Boulevard Upper → Sunset Boulevard Lower", 'double-black', 1380, 345],
  ["homewood", "Homewood", 0, "Quail Peak → Rainbow Ridge → Upper Homeward Bound", 'blue', 3247, 498],
  ["homewood", "Homewood", 1, "Rainbow Ridge → Bonanza → Pot O' Gold", 'green', 3050, 498],
  ["homewood", "Homewood", 2, "Noonchester Traverse → Hobbit Land → Second Creek", 'blue', 3031, 483],
  ["diamond_peak", "Diamond Peak", 0, "Crystal Ridge → Lakeview → Penguin", 'blue', 2820, 536],
  ["diamond_peak", "Diamond Peak", 1, "The Great Flume → Spillway → Lodgepole", 'blue', 2531, 535],
  ["diamond_peak", "Diamond Peak", 2, "G. S. → School Yard", 'black', 634, 216],
];

registerMap({
  id: 'lake-tahoe',
  name: 'Lake Tahoe',
  description: 'Real mountains around Lake Tahoe from elevation data, with their real lifts.',
  thumbnail: TAHOE_THUMB,
  order: 10,
  experimental: true,
  tags: ['real-world'],
  mountain: {
    id: 'lake-tahoe', name: 'Lake Tahoe', region: 'Sierra Nevada · California / Nevada',
    blurb: 'Ten real resorts around the lake, from elevation data and OpenStreetMap, with their real lifts.',
    accent: '#4aa3ff',
  },
  trails: TAHOE_RUNS.map(([resort, group, run, name, difficulty, length, vertical], i) => ({
    id: `${resort}:${run}`, name, difficulty, length, vertical, group, featured: i === 0,
    description: `${group} · real run from OpenStreetMap`, variant: { resort, run },
  })),
  variants: async () => (await fetchTahoeIndex()).flatMap((m) => m.runs.map((r, i) => ({
    id: `${m.id}:${i}`,
    group: m.name,
    name: r.name,
    meta: `${r.drop} m vertical · ${(r.length / 1000).toFixed(1)} km`,
    value: { resort: m.id, run: i },
  }))),
  describe: (variant, course) => (course?.meta
    ? `${course.name} · ${course.run.name} · ${course.run.drop} m vertical`
    : `Real mountain${variant?.resort ? ` · ${variant.resort.replace(/_/g, ' ')}` : ''}`),
  load: async ({ variant }) => {
    if (!variant?.resort) throw new Error('lake-tahoe needs a { resort, run } variant');
    return RealCourse.load(variant.resort, Number(variant.run) || 0);
  },
});
import './ravenspire/index.js';
import './blackspruce/index.js';   // map 2: Blackspruce Plunge (steep tree run)
import './voltage/index.js';      // map 4: Voltage Park (terrain park, rails)
import './dragonback/index.js';   // map 5: Dragonback (ridges)
import './kitsune/index.js';      // map 6: Kitsune Peak (Japanese powder volcano at dusk)
import './fjordline/index.js';    // map 7: Fjordline (Norwegian ski-to-sea)
import './adapters.js';           // mountains + trails for maps whose registration lives elsewhere (docs/maps.md)
