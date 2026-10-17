// Dragonback (map 5): registration, lobby spot and thumbnail. Imported once from maps/builtin.js.
import { registerMap } from '../registry.js';
import { DragonbackCourse } from './course.js';
import { TRAILS } from './layout.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// A serrated summit ridge (the dragon's back, snow on its towers) over a face combed into ridges, lit on one
// side and shaded on the other; a rider mid-hop between two crests; an orange bivouac; a string of prayer flags.
export const DRAGONBACK_THUMB = svg(`
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1f3d74"/><stop offset="0.6" stop-color="#7ea6d8"/><stop offset="1" stop-color="#dbe7f5"/></linearGradient>
    <linearGradient id="lit" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef3fa"/></linearGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fa6c6"/><stop offset="1" stop-color="#b7c8de"/></linearGradient>
  </defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 34 L8 26 L13 30 L20 12 L26 24 L33 18 L40 6 L47 22 L54 16 L62 2 L70 20 L78 13 L86 4 L94 21 L101 15 L109 7 L116 23 L123 17 L131 9 L138 25 L146 19 L154 27 L160 24 L160 44 L0 44 Z" fill="#363b47"/>
  <path d="M20 12 L23 18 L18 20 Z M62 2 L66 10 L60 12 Z M86 4 L90 12 L84 13 Z M109 7 L112 14 L106 15 Z M40 6 L43 13 L38 14 Z" fill="#f2f5fa" opacity="0.9"/>
  <path d="M0 46 L40 34 L80 31 L120 34 L160 44 L160 90 L0 90 Z" fill="#f4f7fb"/>
  <path d="M2 90 L34 38 L40 40 L22 90 Z" fill="url(#lit)"/><path d="M22 90 L40 40 L43 42 L32 90 Z" fill="url(#shade)"/>
  <path d="M34 90 L56 36 L62 37 L52 90 Z" fill="url(#lit)"/><path d="M52 90 L62 37 L65 39 L62 90 Z" fill="url(#shade)"/>
  <path d="M66 90 L76 34 L82 34 L80 90 Z" fill="url(#lit)"/><path d="M80 90 L82 34 L85 36 L90 90 Z" fill="url(#shade)"/>
  <path d="M96 90 L98 35 L104 35 L110 90 Z" fill="url(#lit)"/><path d="M110 90 L104 35 L107 37 L120 90 Z" fill="url(#shade)"/>
  <path d="M124 90 L118 37 L124 38 L140 90 Z" fill="url(#lit)"/><path d="M140 90 L124 38 L127 40 L150 90 Z" fill="url(#shade)"/>
  <g fill="#4a4f5c" opacity="0.55"><path d="M41 58 L45 57 L44 62 Z"/><path d="M63 55 L66 55 L65 60 Z"/><path d="M85 60 L88 59 L88 64 Z"/><path d="M107 57 L110 58 L108 62 Z"/></g>
  <path d="M78 52 q11 -14 24 -4" stroke="#ffffff" stroke-width="1.1" fill="none" stroke-dasharray="2.2 2"/>
  <g transform="translate(103 46) rotate(-20)"><rect x="-4" y="-1" width="9" height="1.5" rx="0.6" fill="#1d2a44"/><path d="M-1 -1 L1 -5 L3 -1 Z" fill="#2a3a5a"/><circle cx="1.2" cy="-6.2" r="1.6" fill="#ff6a3d"/></g>
  <rect x="113" y="40.5" width="6" height="3.4" rx="1.4" fill="#ff7a1a"/>
  <path d="M10 44 Q30 49 52 44" stroke="#3b3b3b" stroke-width="0.4" fill="none"/>
  <g><circle cx="16" cy="45.6" r="0.9" fill="#2f63c8"/><circle cx="22" cy="46.6" r="0.9" fill="#f4f4f0"/><circle cx="28" cy="47.1" r="0.9" fill="#cc2b24"/><circle cx="34" cy="47.1" r="0.9" fill="#258c4d"/><circle cx="40" cy="46.6" r="0.9" fill="#f2c526"/><circle cx="46" cy="45.6" r="0.9" fill="#2f63c8"/></g>`);

// Trail lengths / verticals (m, start → the finish line along the line): measured by scripts/map5-trails.mjs.
const TRAIL_STATS = {
  'ride-the-dragon': [2910, 1580],
  'twin-hop': [2760, 1500],
  'scale-jump': [2720, 1490],
  'bladerunner': [2760, 1540],
  'the-blade': [2740, 1540],
  'dragons-tooth': [2950, 1540],
  'wishbone': [2820, 1540],
  'the-staircase': [1890, 980],
  'the-knife': [1280, 610],
  'organ-pipes': [1420, 710],
  'the-gullies': [2690, 1520],
  'the-slot': [2760, 1550],
};

registerMap({
  id: 'dragonback',
  name: 'Dragonback',
  description: 'A face combed into ridges: ride the crests, fly the gaps, hop ridge to ridge, drop the prows. Fast, exposed, relentless.',
  thumbnail: DRAGONBACK_THUMB,
  order: 5,
  tags: ['handmade', 'freeride', 'big-mountain', 'ridges'],
  describe: () => 'Ridge-to-ridge freeride · 1,600 m vertical · arêtes, gaps, spines',
  load: async () => {
    const course = new DragonbackCourse();
    // Props (bivouacs, cairns, prayer flags, marker poles, the summit cross) need the renderer: browser only.
    const { buildDragonbackProps } = await import('./props.js');
    course.buildProps = (ctx) => buildDragonbackProps(course, ctx);
    return course;
  },
  lobby: ({ course }) => course.lobbySpot(),   // on the Keel's crest, looking across the Comb
  // Mountains + trails (docs/maps.md): one trail per signature line; the first is the default start.
  mountain: {
    id: 'dragonback',
    name: 'Dragonback',
    region: 'Serrated range · wild',
    blurb: 'A face combed into arêtes under a serrated summit ridge: ride the crests, fly the gaps, hop ridge to ridge.',
    accent: '#ff7a1a',
  },
  trails: TRAILS.map(([id, name, difficulty, , , description, featured]) => ({
    id, name, difficulty, description, length: TRAIL_STATS[id]?.[0], vertical: TRAIL_STATS[id]?.[1], ...(featured ? { featured: true } : {}),
  })),
});
