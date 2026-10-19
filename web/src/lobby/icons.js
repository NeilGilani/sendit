// Inline SVG icons (24×24, stroke = currentColor, 1.9 px line) for the lobby UI. One line style for
// everything: no emoji, no filled glyph sets (docs/lobby.md → Iconography).
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  home: svg('<path d="M3 20.5h18"/><path d="M4.5 20.5l5.5-10 3.2 5.2 2.3-3.4 4 8.2"/><path d="M8.6 13.6l1.4-1.1 1.5 1.3"/><circle cx="17.5" cy="5.5" r="1.8"/>'),
  equipment: svg('<path d="M6 3.5l2.2 15.2a2 2 0 0 0 2 1.8"/><path d="M11 3.5l2.2 15.2a2 2 0 0 0 2 1.8"/><path d="M5.6 9.5h4.2M10.6 9.5h4.2"/><path d="M18 4v12M18 16l-1.6 4M18 16l1.6 4"/>'),
  character: svg('<path d="M9 3.5h6l1 2.5 3.5 1.8-1.4 4.2-2.1-.8V20.5h-8V11.2l-2.1.8L4.5 7.8 8 6z"/><path d="M12 6.2v14.3"/>'),
  crate: svg('<rect x="3" y="8" width="18" height="12" rx="1.5"/><path d="M3 12h18M9 8V6a3 3 0 0 1 6 0v2M10 12v2h4v-2"/>'),
  career: svg('<path d="M5 15l7-4 7 4"/><path d="M5 10.5l7-4 7 4"/><path d="M8 19.5h8"/>'),
  maps: svg('<path d="M2.5 19.5l6.5-12 4 7 2.5-4 6 9z"/><path d="M7.4 10.5l1.6 1.4 1.6-1.4"/>'),
  multiplayer: svg('<circle cx="8.5" cy="8" r="2.8"/><circle cx="16.5" cy="9" r="2.3"/><path d="M3.5 19.5v-1.5a5 5 0 0 1 10 0v1.5"/><path d="M14.8 14.3a4.2 4.2 0 0 1 5.7 3.9v1.3"/>'),
  leaderboards: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5"/><path d="M12 13v3.5M8.5 20h7M9.5 20l.8-3.5h3.4l.8 3.5"/>'),
  profile: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0M14.5 10h3.5M14.5 13.5h3.5"/>'),
  settings: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>'),
  skis: svg('<path d="M7 2.5l3.2 17.3a2.2 2.2 0 0 0 2.2 1.7"/><path d="M12.5 2.5l3.2 17.3a2.2 2.2 0 0 0 2.2 1.7"/><rect x="7.2" y="9.5" width="4" height="3" rx="1" transform="rotate(-10 9.2 11)"/><rect x="12.7" y="9.5" width="4" height="3" rx="1" transform="rotate(-10 14.7 11)"/>', 'stroke-width="1.6"'),
  snowboard: svg('<rect x="3" y="8.6" width="18" height="6.8" rx="3.4" transform="rotate(-24 12 12)"/><path d="M8.6 10.6l1.6 3.6M13.8 8.3l1.6 3.6"/>', 'stroke-width="1.6"'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  bolt: svg('<path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z"/>'),
  arrow: svg('<path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5"/>'),
  rotate: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/>'),
  clock: svg('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>'),
  flag: svg('<path d="M5.5 21V4"/><path d="M5.5 4.5h11l-2 3.5 2 3.5h-11"/>'),
};
