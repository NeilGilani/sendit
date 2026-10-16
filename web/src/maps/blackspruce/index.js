// Map 2: Blackspruce Plunge — a steep, fast run through dense spruce forest (registered on import;
// maps/builtin.js imports this file). Course: ./course.js, layout: ./layout.js, forest: ./forest.js.
import { registerMap } from '../registry.js';
import { BlackspruceCourse } from './course.js';

const svg = (body) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90">${body}</svg>`)}`;

// A steep white lane S-curving down between dense spruce spires (bigger toward the viewer), the rock
// band with the lane's notch, and an orange fork sign.
const laneX = (y) => 80 + Math.sin((y - 30) / 11) * (4 + (y - 30) * 0.18);   // lane centre at height y
const laneW = (y) => 3 + (y - 30) * 0.32;                                   // half-width, perspective
const spire = (x, y, s, c) => `<path fill="${c}" d="M${x.toFixed(1)} ${(y - 22 * s).toFixed(1)} L${(x + 4.2 * s).toFixed(1)} ${y.toFixed(1)} L${(x - 4.2 * s).toFixed(1)} ${y.toFixed(1)} Z"/>`
  + `<path fill="#eef3fa" d="M${x.toFixed(1)} ${(y - 22 * s).toFixed(1)} L${(x + 1.3 * s).toFixed(1)} ${(y - 15 * s).toFixed(1)} L${(x - 1.6 * s).toFixed(1)} ${(y - 14 * s).toFixed(1)} Z"/>`;   // snow on the tip
const trees = [];
for (let row = 0; row < 15; row++) {
  const y = 34 + row * 4.3, s = 0.35 + row * 0.085;
  for (let k = 0; k < 17; k++) {
    const x = ((k * 10.4 + row * 5.1) % 177) - 8;
    if (Math.abs(x - laneX(y)) < laneW(y) + 2.5 * s) continue;
    trees.push(spire(x, y, s, row % 2 ? '#183026' : '#1e3a2e'));
  }
}
let lane = '';
for (let y = 30; y <= 90; y += 2) lane += `${y === 30 ? 'M' : 'L'}${(laneX(y) - laneW(y)).toFixed(1)} ${y}`;
for (let y = 90; y >= 30; y -= 2) lane += `L${(laneX(y) + laneW(y)).toFixed(1)} ${y}`;
const bandY = 56, bx = laneX(bandY), bw = laneW(bandY);
export const BLACKSPRUCE_THUMB = svg(`
  <defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4f86cc"/><stop offset="1" stop-color="#e6edf5"/></linearGradient></defs>
  <rect width="160" height="90" fill="url(#s)"/>
  <path d="M0 36 L22 12 L42 26 L68 4 L94 26 L118 10 L160 32 L160 90 L0 90 Z" fill="#dfe6f0"/>
  <path d="M68 4 L76 14 L70 16 L62 12 Z M118 10 L124 18 L114 17 Z" fill="#b6cff6"/>
  <path d="M0 90 L0 30 C40 27 120 27 160 30 L160 90 Z" fill="#eef3f9"/>
  <path d="${lane} Z" fill="#fbfdff"/>
  <path d="M0 ${bandY} L${(bx - bw - 1).toFixed(1)} ${bandY - 1} L${(bx - bw - 1).toFixed(1)} ${bandY + 2.5} L0 ${bandY + 3.5} Z M160 ${bandY} L${(bx + bw + 1).toFixed(1)} ${bandY - 1} L${(bx + bw + 1).toFixed(1)} ${bandY + 2.5} L160 ${bandY + 3.5} Z" fill="#6a645e"/>
  ${trees.join('')}
  <g transform="translate(${(laneX(44) + laneW(44) + 1).toFixed(1)} 40)"><rect x="-0.3" y="0" width="0.6" height="4.5" fill="#3a2c20"/><rect x="-2.6" y="-1.6" width="5.2" height="2.4" fill="#f28a1b"/></g>`);

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
