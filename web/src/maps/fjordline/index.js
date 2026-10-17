// Fjordline (map 7): registration, mountain + trails (the lobby's mountain browser), thumbnail and lobby spot.
// Imported once from maps/builtin.js.
import { registerMap } from '../registry.js';
import { TRAILS } from './layout.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// Golden hour over the fjord: Skarvtinden's pyramid with the Skaret couloir, the spines on the left, the
// headland running out to its lighthouse, red rorbuer on the shore and the sun's path on the water.
export const FJORDLINE_THUMB = svg(`
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3e6fa8"/><stop offset="0.55" stop-color="#c9a6a8"/><stop offset="0.8" stop-color="#f4c896"/></linearGradient>
    <linearGradient id="m" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a9b6d6"/><stop offset="0.5" stop-color="#fff0dc"/><stop offset="1" stop-color="#ffd9b0"/></linearGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a5b84"/><stop offset="1" stop-color="#163a57"/></linearGradient>
  </defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 52 L14 40 L26 46 L40 34 L52 42 L60 38 L60 70 L0 70 Z" fill="#8f9cc0" opacity="0.8"/>
  <path d="M10 70 L58 18 L66 8 L76 20 L96 38 L124 52 L150 64 L150 70 Z" fill="url(#m)"/>
  <path d="M66 8 L76 20 L96 38 L124 52 L150 64 L150 70 L118 70 L92 44 L72 22 Z" fill="#e8b98f" opacity="0.55"/>
  <path d="M68 14 L71 20 L70 30 L73 40 L70 40 L67 30 L68 20 Z" fill="#4a4552"/>
  <path d="M62 16 L70 13 L70 40 L60 30 Z M72 16 L78 22 L76 36 L72 40 Z" fill="#5d5866" opacity="0.6"/>
  <g stroke="#ffffff" stroke-width="1" fill="none" opacity="0.85"><path d="M30 52 L42 38"/><path d="M26 56 L38 42"/><path d="M22 60 L34 46"/></g>
  <rect y="70" width="160" height="20" fill="url(#w)"/>
  <path d="M104 72 L132 72 L146 80 L160 80 L160 74 Z" fill="#f3e9df" opacity="0.5"/>
  <path d="M112 78 C122 76 138 76 160 79" stroke="#ffd59a" stroke-width="2" fill="none" opacity="0.8"/>
  <path d="M120 82 C130 80 146 80 160 83" stroke="#ffd59a" stroke-width="1.2" fill="none" opacity="0.6"/>
  <path d="M120 64 L150 66 L156 70 L120 70 Z" fill="#6c6a6e"/>
  <rect x="148" y="56" width="3" height="9" fill="#c8302c"/><rect x="148" y="59" width="3" height="2" fill="#ffffff"/>
  <g fill="#9b2420"><rect x="40" y="66" width="7" height="5"/><rect x="50" y="65" width="7" height="6"/><rect x="60" y="66" width="7" height="5"/><rect x="74" y="65" width="8" height="6" fill="#c99a3c"/></g>
  <g fill="#ffffff"><path d="M39 66 L43.5 62.5 L48 66 Z"/><path d="M49 65 L53.5 61.5 L58 65 Z"/><path d="M59 66 L63.5 62.5 L68 66 Z"/><path d="M73 65 L78 61 L83 65 Z"/></g>
  <g stroke="#3a2a22" stroke-width="0.6"><path d="M42 71 L42 73 M45 71 L45 73 M52 71 L52 73 M55 71 L55 73 M62 71 L62 73 M65 71 L65 73"/></g>
  <circle cx="132" cy="58" r="5" fill="#ffd27a" opacity="0.9"/>`);

registerMap({
  id: 'fjordline',
  name: 'Fjordline',
  description: 'Norwegian ski-to-sea at golden hour: a couloir through the summit rock, silver spines, a headland of cliff steps and big rollers, all ending in a red fishing village on the fjord. Ride the roofs, jump the boathouse, finish on the quay.',
  thumbnail: FJORDLINE_THUMB,
  order: 7,
  tags: ['handmade', 'freeride', 'big-mountain', 'ski-to-sea'],
  mountain: {
    id: 'fjordline',
    name: 'Skarvtinden',
    region: 'Lyngen, Troms — Norway',
    blurb: '1,416 m from the summit col to the sea: couloirs, spines and a headland over a deep blue fjord, a red-cabin fishing village and the harbour at the bottom.',
    accent: '#e0703a',
  },
  trails: TRAILS,
  describe: () => 'Ski-to-sea freeride · 1,416 m to the fjord · couloir, spines, headland, village roofs',
  load: async () => {
    const { FjordlineCourse } = await import('./course.js');
    const course = new FjordlineCourse();
    // Props (village, harbour, water, boats) need the renderer-side modules: loaded only in the browser.
    const { buildFjordlineProps } = await import('./props.js');
    course.buildProps = (ctx) => buildFjordlineProps(course, ctx);
    return course;
  },
  lobby: ({ course }) => course.lobbySpot(),
});
