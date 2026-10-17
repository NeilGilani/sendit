// Dragonback (map 5): registration, lobby spot and thumbnail. Imported once from maps/builtin.js.
import { registerMap } from '../registry.js';
import { DragonbackCourse } from './course.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// A serrated summit ridge (the dragon's back) over a face combed into parallel ridges, lit on one side
// and shaded on the other; a rider in the air between two crests; an orange bivouac box on a ridge.
export const DRAGONBACK_THUMB = svg(`
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#27477f"/><stop offset="0.65" stop-color="#8fb3de"/><stop offset="1" stop-color="#e3ecf6"/></linearGradient>
    <linearGradient id="r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e8eef7"/></linearGradient>
  </defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 40 L14 30 L20 34 L30 18 L36 26 L44 14 L50 22 L58 10 L64 20 L72 12 L80 22 L90 8 L98 20 L108 14 L116 24 L126 16 L134 26 L146 20 L160 30 L160 90 L0 90 Z" fill="#4a4f5c"/>
  <path d="M0 44 L30 24 L44 20 L58 16 L72 18 L90 14 L108 20 L126 22 L160 34 L160 90 L0 90 Z" fill="#f4f7fb"/>
  <g fill="url(#r)" stroke="#9fb3cf" stroke-width="0.6">
    <path d="M8 90 L36 30 L42 32 L24 90 Z"/><path d="M34 90 L56 26 L62 28 L50 90 Z"/><path d="M62 90 L76 24 L82 26 L78 90 Z"/>
    <path d="M92 90 L96 26 L102 26 L108 90 Z"/><path d="M120 90 L112 28 L118 28 L138 90 Z"/><path d="M146 90 L128 32 L134 32 L160 82 Z"/>
  </g>
  <g fill="#b9c9e0" opacity="0.9">
    <path d="M24 90 L42 32 L44 34 L30 90 Z"/><path d="M50 90 L62 28 L64 30 L56 90 Z"/><path d="M78 90 L82 26 L84 28 L84 90 Z"/>
    <path d="M108 90 L102 26 L104 28 L114 90 Z"/><path d="M138 90 L118 28 L120 30 L144 90 Z"/>
  </g>
  <path d="M70 48 q8 -10 18 -4" stroke="#ffffff" stroke-width="1" fill="none" stroke-dasharray="2 2"/>
  <g transform="translate(88 44) rotate(-18)"><rect x="-3" y="-1" width="7" height="1.2" fill="#22324f"/><circle cx="0.5" cy="-3" r="1.4" fill="#ff6a3d"/></g>
  <rect x="98" y="34" width="5" height="3.2" rx="1.2" fill="#ff7a1a"/>`);

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
    // Props (bivouacs, cairns, prayer flags, the helicopter) need the renderer: loaded only in the browser.
    const { buildDragonbackProps } = await import('./props.js');
    course.buildProps = (ctx) => buildDragonbackProps(course, ctx);
    return course;
  },
  lobby: ({ course }) => course.lobbySpot(),
});
