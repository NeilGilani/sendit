// Trail difficulty badges (inline SVG, North American trail signs): green circle, blue square, black
// diamond, double black diamond, orange terrain-park rectangle. Shared by the lobby and the ride HUD.
import { DIFFICULTIES } from './registry.js';

const SHAPES = {
  green: '<circle cx="12" cy="12" r="8.2" fill="#2fb562" stroke="#fff" stroke-width="1.6"/>',
  blue: '<rect x="4.2" y="4.2" width="15.6" height="15.6" rx="1.4" fill="#2f7cf0" stroke="#fff" stroke-width="1.6"/>',
  black: '<path d="M12 2.6 L21.4 12 L12 21.4 L2.6 12 Z" fill="#0d1117" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>',
  'double-black': '<path d="M7.4 5 L13.4 12 L7.4 19 L1.4 12 Z M16.6 5 L22.6 12 L16.6 19 L10.6 12 Z" fill="#0d1117" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/>',
  park: '<rect x="2.4" y="5.4" width="19.2" height="13.2" rx="6.6" fill="#f2801b" stroke="#fff" stroke-width="1.6"/><path d="M9.6 15.4 V8.6 H12.6 a2.1 2.1 0 0 1 0 4.2 H9.6" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
};

/** `<svg>` badge for a difficulty id (unknown → blue). `size` in px. */
export function difficultyBadge(difficulty, size = 18, cls = 'tr-badge') {
  const d = SHAPES[difficulty] ? difficulty : 'blue';
  const label = DIFFICULTIES[d]?.short ?? d;
  return `<svg class="${cls} ${d}" width="${size}" height="${size}" viewBox="0 0 24 24" role="img" aria-label="${label}"><title>${label}</title>${SHAPES[d]}</svg>`;
}

/** "2.4 km · 1,300 m" from a trail's optional length / vertical (metres). */
export function trailStats(t) {
  const out = [];
  if (t.length) out.push(t.length >= 1000 ? `${(t.length / 1000).toFixed(1)} km` : `${Math.round(t.length / 10) * 10} m`);
  if (t.vertical) out.push(`${Math.round(t.vertical).toLocaleString('en-US')} m vert`);
  return out.join(' · ');
}
