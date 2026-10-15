// Inline SVG icons (24×24, stroke = currentColor) for the lobby UI.
const svg = (body, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;

export const ICONS = {
  equipment: svg('<path d="M6 3.5l2.2 15.2a2 2 0 0 0 2 1.8"/><path d="M11 3.5l2.2 15.2a2 2 0 0 0 2 1.8"/><path d="M5.6 9.5h4.2M10.6 9.5h4.2"/><path d="M18 4v12M18 16l-1.6 4M18 16l1.6 4"/>'),
  character: svg('<circle cx="12" cy="6.5" r="3"/><path d="M6.5 21v-4.5a5.5 5.5 0 0 1 11 0V21"/><path d="M9 13l3 3 3-3"/>'),
  maps: svg('<path d="M2.5 19.5l6.5-12 4 7 2.5-4 6 9z"/><path d="M7.4 10.5l1.6 1.4 1.6-1.4"/>'),
  multiplayer: svg('<circle cx="8.5" cy="8" r="2.8"/><circle cx="16.5" cy="9" r="2.3"/><path d="M3.5 19.5v-1.5a5 5 0 0 1 10 0v1.5"/><path d="M14.8 14.3a4.2 4.2 0 0 1 5.7 3.9v1.3"/>'),
  leaderboards: svg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 3.5M16 6h3a3 3 0 0 1-3 3.5"/><path d="M12 13v3.5M8.5 20h7M9.5 20l.8-3.5h3.4l.8 3.5"/>'),
  profile: svg('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.2a3.4 3.4 0 0 1 6.4 0M14.5 10h3.5M14.5 13.5h3.5"/>'),
  settings: svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/><path d="M4 12h2M10 12h10"/><circle cx="8" cy="12" r="2"/>'),
  skis: svg('<path d="M7 2.5l3.2 17.3a2.2 2.2 0 0 0 2.2 1.7"/><path d="M12.5 2.5l3.2 17.3a2.2 2.2 0 0 0 2.2 1.7"/><rect x="7.2" y="9.5" width="4" height="3" rx="1" transform="rotate(-10 9.2 11)"/><rect x="12.7" y="9.5" width="4" height="3" rx="1" transform="rotate(-10 14.7 11)"/>', 'stroke-width="1.6"'),
  snowboard: svg('<rect x="3" y="8.6" width="18" height="6.8" rx="3.4" transform="rotate(-24 12 12)"/><path d="M8.6 10.6l1.6 3.6M13.8 8.3l1.6 3.6"/>', 'stroke-width="1.6"'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
};
