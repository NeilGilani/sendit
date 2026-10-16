// Map 2: Blackspruce Plunge — a steep, fast run through dense spruce forest (registered on import;
// maps/builtin.js imports this file). Course: ./course.js, layout: ./layout.js, forest: ./forest.js.
import { registerMap } from '../registry.js';
import { BlackspruceCourse } from './course.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// A steep white lane plunging between dark spruce, a rock band and a lone rider-sized gap.
const pine = (x, y, s) => `<path d="M${x} ${y - 16 * s} l${7 * s} ${16 * s} h${-14 * s}z M${x} ${y - 24 * s} l${5 * s} ${11 * s} h${-10 * s}z" />`;
const forest = [];
for (let i = 0; i < 46; i++) {
  const x = (i * 37.3) % 160, y = 30 + ((i * 53.7) % 62);
  const lane = Math.abs(x - (80 + (y - 60) * 0.45 + Math.sin(y / 9) * 7)) < 11 + (y - 30) * 0.12;
  if (!lane) forest.push(pine(x, y, 0.55 + (y - 30) / 70));
}
export const BLACKSPRUCE_THUMB = svg(`
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f86cc"/><stop offset="1" stop-color="#e6edf5"/></linearGradient></defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 40 L24 14 L44 30 L70 6 L96 28 L120 12 L160 36 L160 90 L0 90 Z" fill="#dfe6f0"/>
  <path d="M70 6 L78 16 L72 18 L64 14 Z M120 12 L126 20 L116 19 Z" fill="#b6cff6"/>
  <path d="M0 90 L0 34 C40 30 120 30 160 34 L160 90 Z" fill="#f6f9fd"/>
  <path d="M30 58 L130 56 L130 60 L30 62 Z" fill="#6c6660"/>
  <g fill="#1b3127">${forest.join('')}</g>`);

registerMap({
  id: 'blackspruce',
  name: 'Blackspruce Plunge',
  description: 'Steep and fast through dense spruce: weave the lanes, thread the slots, drop the rock band.',
  thumbnail: BLACKSPRUCE_THUMB,
  order: 2,
  tags: ['handmade', 'trees', 'steep'],
  describe: () => 'Steep tree run · 2 km · 1,100 m vertical',
  load: async () => new BlackspruceCourse(),
  // The lobby stands at the top of Kicker Meadow, looking down at the kicker, the crowd and the forest.
  lobby: ({ course }) => { const c = course.centre(424); return { x: c.x, z: c.z, heading: c.heading }; },
});
