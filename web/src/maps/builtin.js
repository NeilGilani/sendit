// The built-in maps. Imported once (main.js) for its side effect of registering them.
//
//  • valcrest-gully — the hand-built powder gully (course.js). The default map.
//  • lake-tahoe     — real Lake Tahoe mountains (realcourse.js); each resort run is a variant.
//                     Kept because the game already supported it (?resort=<id>&run=<n>).
import { registerMap } from './registry.js';
import { Course } from '../course.js';
import { RealCourse } from '../realcourse.js';

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

registerMap({
  id: 'valcrest-gully',
  name: 'Valcrest Gully',
  description: 'Hand-built powder gully with jumps, pillows and drops.',
  thumbnail: GULLY_THUMB,
  order: 1,
  tags: ['handmade', 'park'],
  describe: () => 'Hand-built powder run · 2.5 km',
  load: async () => new Course(),
});

let tahoeIndex = null;
async function fetchTahoeIndex() {
  if (!tahoeIndex) {
    tahoeIndex = fetch('/resorts/index.json').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  }
  return tahoeIndex;
}

registerMap({
  id: 'lake-tahoe',
  name: 'Lake Tahoe',
  description: 'Real mountains around Lake Tahoe from elevation data, with their real lifts.',
  thumbnail: TAHOE_THUMB,
  order: 10,
  experimental: true,
  tags: ['real-world'],
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
