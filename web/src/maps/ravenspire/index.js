// Ravenspire (map 3): registration, lobby spot and thumbnail. Imported once from maps/builtin.js.
import { registerMap } from '../registry.js';
import { RavenspireCourse } from './course.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// A lone horn above a steep face: stacked cliff bands, spines on the left, the ravine on the right,
// a tiny buried hut, and a raven.
export const RAVENSPIRE_THUMB = svg(`
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d4f9a"/><stop offset="0.7" stop-color="#7fb0e6"/><stop offset="1" stop-color="#dbe9f7"/></linearGradient>
    <linearGradient id="f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c9d7ea"/><stop offset="0.55" stop-color="#ffffff"/><stop offset="1" stop-color="#e9f0f9"/></linearGradient>
  </defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 60 L18 44 L30 50 L44 36 L52 40 L0 90 Z" fill="#9fb6d4" opacity="0.7"/>
  <path d="M112 42 L128 30 L142 40 L160 34 L160 90 L100 90 Z" fill="#a8bedb" opacity="0.7"/>
  <path d="M8 90 L62 22 L74 6 L84 20 L104 40 L150 90 Z" fill="url(#f)"/>
  <path d="M74 6 L84 20 L104 40 L150 90 L118 90 L92 46 L80 24 Z" fill="#b9cbe4"/>
  <g fill="#3b4250">
    <path d="M52 50 L60 49 L66 51 L74 50 L80 52 L80 54 L72 53 L64 54 L58 52 L52 53 Z"/>
    <path d="M44 62 L56 60 L66 62 L78 61 L90 63 L90 66 L78 64 L64 66 L54 64 L44 66 Z"/>
    <path d="M38 73 L50 71 L62 73 L74 72 L86 74 L86 77 L72 75 L58 77 L46 75 L38 77 Z"/>
    <path d="M96 52 L100 60 L104 72 L108 84 L104 84 L99 70 L94 58 Z"/>
  </g>
  <g stroke="#ffffff" stroke-width="1.2" fill="none" opacity="0.85">
    <path d="M40 54 L50 42"/><path d="M36 58 L46 46"/><path d="M32 63 L42 51"/>
  </g>
  <path d="M86 80 L94 76 L102 80 L102 84 L86 84 Z" fill="#6b4a33"/><path d="M85 80 L94 75 L103 80 L94 77 Z" fill="#ffffff"/>
  <path d="M122 18 q4 -3 8 0 q4 -3 8 0 q-4 -1 -8 2 q-4 -3 -8 -2 Z" fill="#141821"/>`);

registerMap({
  id: 'ravenspire',
  name: 'Ravenspire',
  description: 'An isolated big-mountain face: stacked cliffs, spines, pillows, a deep ravine and an abandoned lift station. Send it.',
  thumbnail: RAVENSPIRE_THUMB,
  order: 3,
  tags: ['handmade', 'freeride', 'big-mountain'],
  describe: () => 'Big-mountain freeride · 1,650 m vertical · cliffs, spines, ravine',
  load: async () => {
    const course = new RavenspireCourse();
    // Props (buildings, the old gondola) need the renderer-side modules: loaded only in the browser.
    const { buildRavenspireProps } = await import('./props.js');
    course.buildProps = (ctx) => buildRavenspireProps(course, ctx);
    return course;
  },
  lobby: ({ course }) => course.lobbySpot(),
});
