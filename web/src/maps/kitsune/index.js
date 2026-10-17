// Kitsune Peak (map 6): registration, mountain / trails (the mountains-and-trails contract), lobby spot
// and thumbnail. Imported once from maps/builtin.js.
//   ?map=kitsune-peak&trail=<id> starts on a trail (the lobby's mountain browser does the same).
import { registerMap } from '../registry.js';
import { KitsuneCourse } from './course.js';
import { TRAILS } from './layout.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// The volcano at dusk: indigo sky over a peach horizon, the snowy cone with its crater notch, birch trunks,
// a vermilion torii and a line of lanterns down to the village.
export const KITSUNE_THUMB = svg(`
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1c2550"/><stop offset="0.55" stop-color="#7a5f9a"/><stop offset="0.85" stop-color="#f0a07c"/><stop offset="1" stop-color="#f6c79a"/></linearGradient>
    <linearGradient id="c" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b9c3e6"/><stop offset="0.5" stop-color="#e9ecf8"/><stop offset="1" stop-color="#9aa6d2"/></linearGradient>
    <radialGradient id="g"><stop offset="0" stop-color="#ffd38a"/><stop offset="1" stop-color="#ffd38a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <circle cx="34" cy="14" r="0.8" fill="#fff"/><circle cx="120" cy="9" r="0.6" fill="#fff"/><circle cx="96" cy="20" r="0.5" fill="#fff"/>
  <path d="M0 70 L22 58 L40 62 L60 52 L0 90 Z" fill="#5d5f8e" opacity="0.8"/>
  <path d="M10 90 L64 30 Q72 24 78 27 L84 25 Q90 24 96 30 L152 90 Z" fill="url(#c)"/>
  <path d="M64 30 Q72 24 78 27 L84 25 Q90 24 96 30 L90 31 L80 29 L70 31 Z" fill="#6f7aa8"/>
  <path d="M82 30 L88 44 L84 56 L92 70 L88 90 L100 90 L98 70 L104 52 L96 40 Z" fill="#c7cff0" opacity="0.7"/>
  <g stroke="#f2f0ea" stroke-width="1.6"><path d="M14 90 L17 62"/><path d="M22 90 L24 66"/><path d="M140 90 L137 60"/><path d="M148 90 L150 64"/></g>
  <g stroke="#2b2b35" stroke-width="0.7"><path d="M15.5 80 l2 0"/><path d="M16.3 70 l1.6 0"/><path d="M137.6 72 l1.8 0"/><path d="M138.4 66 l1.6 0"/></g>
  <g fill="url(#g)"><circle cx="60" cy="80" r="6"/><circle cx="70" cy="72" r="5"/><circle cx="78" cy="65" r="4"/><circle cx="104" cy="80" r="6"/><circle cx="96" cy="71" r="5"/></g>
  <g fill="#ffcf7a"><circle cx="60" cy="80" r="1.3"/><circle cx="70" cy="72" r="1.1"/><circle cx="78" cy="65" r="0.9"/><circle cx="104" cy="80" r="1.3"/><circle cx="96" cy="71" r="1.1"/></g>
  <g fill="#d8362b"><rect x="72" y="66" width="2.4" height="24"/><rect x="90" y="66" width="2.4" height="24"/><rect x="69" y="70" width="27" height="2"/>
    <path d="M65 63 Q82 66 99 63 L99 66 Q82 69 65 66 Z"/></g>
  <path d="M65 63 Q82 66 99 63 Q82 64.6 65 63 Z" fill="#ffffff"/>
  <rect x="64" y="65.5" width="36" height="1.4" fill="#1d1d24"/>`);

/** Every trail's numbers (layout.js TRAILS + the measured length / vertical; map6-unit checks they match the course). */
export const TRAIL_STATS = {
  okama: { length: 2730, vertical: 1150 },
  kazan: { length: 2720, vertical: 1140 },
  makura: { length: 2060, vertical: 780 },
  shirakaba: { length: 2180, vertical: 760 },
  kitsunebi: { length: 2300, vertical: 920 },
  senbon: { length: 1070, vertical: 325 },
};

export const KITSUNE_TRAILS = TRAILS.map(({ id, name, difficulty, description, featured }) => ({ id, name, difficulty, description, featured: !!featured, ...TRAIL_STATS[id] }));

registerMap({
  id: 'kitsune-peak',
  name: 'Kitsune Peak',
  description: 'A Japanese powder volcano at dusk: bottomless pillows, birch glades and tree wells, a rollercoaster crater rim, a lantern-lit gully and a shrine village whose snowy roofs you can ride.',
  thumbnail: KITSUNE_THUMB,
  order: 6,
  tags: ['handmade', 'freeride', 'powder', 'night'],
  mountain: { id: 'kitsune-peak', name: 'Kitsune Peak', region: 'Hokkaido, Japan', blurb: 'Bottomless Japow on a volcano at dusk: pillows, birches, torii and lanterns.', accent: '#e8553a' },
  trails: KITSUNE_TRAILS,
  describe: () => 'Japow volcano at dusk · 6 trails · 1,150 m vertical',
  load: async ({ trail } = {}) => {
    const course = new KitsuneCourse();
    if (trail) course.selectTrail(trail);
    // Props (village, torii, birches, lanterns, the gondola) need the renderer-side modules: browser only.
    const { buildKitsuneProps } = await import('./props.js');
    course.buildProps = (ctx) => buildKitsuneProps(course, ctx);
    return course;
  },
  lobby: ({ course }) => course.lobbySpot(),
});
