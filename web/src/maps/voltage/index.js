// Voltage Park (map 4): registration, lobby spot and thumbnail. Imported once from maps/builtin.js.
import { registerMap } from '../registry.js';
import { VoltageCourse } from './course.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// Night-blue sky, a lit park slope with three stepped kickers, a rail with sparks, a lightning bolt and
// light towers: event-park energy.
export const VOLTAGE_THUMB = svg(`
  <defs>
    <linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#140a3a"/><stop offset="0.65" stop-color="#3b2a8c"/><stop offset="1" stop-color="#ff5fb0"/></linearGradient>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfe2ff"/></linearGradient>
  </defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 40 L28 22 L46 30 L70 12 L96 30 L120 18 L160 36 L160 90 L0 90 Z" fill="#2a2366" opacity="0.8"/>
  <path d="M0 90 L0 46 L160 30 L160 90 Z" fill="url(#g)"/>
  <g fill="#ffffff" stroke="#7fb6ff" stroke-width="0.8">
    <path d="M30 70 L44 60 L48 61 L48 72 Z"/><path d="M72 58 L88 48 L93 49 L93 60 Z"/><path d="M114 47 L132 37 L138 38 L138 50 Z"/>
  </g>
  <path d="M44 60 L48 61" stroke="#2f7bff" stroke-width="1.4"/><path d="M88 48 L93 49" stroke="#2f7bff" stroke-width="1.4"/><path d="M132 37 L138 38" stroke="#2f7bff" stroke-width="1.4"/>
  <path d="M10 82 L40 74" stroke="#2ff5d6" stroke-width="1.6"/><path d="M14 83.5 L14 78 M36 77 L36 75" stroke="#3a3f55" stroke-width="1"/>
  <g fill="#ffe14d"><circle cx="28" cy="76.6" r="0.9"/><circle cx="31" cy="74" r="0.6"/><circle cx="25" cy="74.5" r="0.5"/><circle cx="33" cy="77" r="0.5"/></g>
  <path d="M84 4 L74 26 L82 26 L76 44 L96 18 L87 18 L94 4 Z" fill="#ffe14d" stroke="#ff9a3d" stroke-width="1"/>
  <g stroke="#9aa3c7" stroke-width="1.2"><path d="M8 50 L8 24"/><path d="M152 34 L152 10"/></g>
  <g fill="#fffbe0"><rect x="4" y="21" width="8" height="4" rx="1"/><rect x="148" y="7" width="8" height="4" rx="1"/></g>
  <circle cx="8" cy="23" r="10" fill="#fff6c0" opacity="0.18"/><circle cx="152" cy="9" r="10" fill="#fff6c0" opacity="0.18"/>`);

registerMap({
  id: 'voltage-park',
  name: 'Voltage Park',
  description: 'A fast event terrain park: drop off the start ramp into an Olympic-style slopestyle course that ends on the Megawatt mega kicker and a road gap, rails everywhere, stacked lanes, spines, hips, a 22 ft superpipe and a 33 m big air tower. Grind it, spin it, send it.',
  thumbnail: VOLTAGE_THUMB,
  order: 4,
  tags: ['handmade', 'park', 'slopestyle', 'rails'],
  describe: () => 'Terrain park · slopestyle, mega kicker, gaps, spines, superpipe, big air · 38 jibs, 34 jumps',
  load: async () => {
    const course = new VoltageCourse();
    // Meshes and the HUD need the renderer-side modules: loaded only in the browser.
    const [{ buildVoltageProps }, { mountParkHud }] = await Promise.all([import('./props.js'), import('./hud.js')]);
    course.buildProps = (ctx) => buildVoltageProps(course, ctx);
    mountParkHud(course);
    return course;
  },
  lobby: ({ course }) => course.lobbySpot(),
});
