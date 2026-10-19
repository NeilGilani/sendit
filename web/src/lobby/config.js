// Lobby tunables (stage look, camera shots, turntable feel). Kept out of config.js on purpose:
// the lobby owns its own numbers.

export const STAGE = {
  // Snow plinth the rider stands on (at the map's lobby spot, see maps/registry.js lobbySpot()).
  platformRadius: 1.55,           // m
  plinthLift: 0.12,              // m the top sits above the highest snow under it
  plinthBury: 0.6,               // m the skirt reaches below the lowest snow under it

  // Neon rim + ticks (HDR colours: > 1 blooms through the game's post stack).
  neon: '#ff5a1f',               // ski-patrol orange (the lobby accent, --c-signal)
  neon2: '#dfe8f0',              // snow-white ticks
  neonGlow: 2.6,
};

/**
 * Camera shots. A tab picks one by name (tab.shot); the camera eases between them.
 *   target  – look-at height above the plinth (m)        pitch – degrees down
 *   frame   – metres of subject height that should fill ~80 % of the free screen area
 */
export const SHOTS = {
  full: { target: 0.95, pitch: 5, frame: 3.0 },
  gear: { target: 0.8, pitch: 7, frame: 2.75 },
  portrait: { target: 1.3, pitch: 3, frame: 2.0 },
  wide: { target: 2.2, pitch: 4, frame: 7 },       // Maps / Multiplayer: more of the mountain
};

export const CAMERA = {
  fov: 30,
  near: 0.1,
  groundClear: 0.6,              // m the camera keeps above the snow behind it
  minZoom: 0.7,                  // user zoom (wheel / pinch / triggers) multiplies the shot distance
  maxZoom: 1.45,
  shotEase: 3.2,                 // 1/s
};

export const TURNTABLE = {
  // Rest angle per gear: a 3/4 view of the rider's front (a snowboarder faces the toe edge).
  heroYaw: { skis: Math.PI - 0.55, snowboard: Math.PI + 0.85 },
  dragSpeed: 0.0085,             // rad per CSS px
  keySpeed: 2.4,                 // rad/s with A/D or the right stick
  friction: 4.0,                 // inertia decay (1/s)
  returnDelay: 7,                // s idle before easing back to the hero angle
  returnRate: 0.9,
};

/**
 * Navigation (docs/lobby.md → Navigation). Five destinations in the top bar; tabs registered without a
 * `group` / `nav` of their own are placed by NAV.tabs, and anything else becomes a destination of its
 * own (so a new tab always shows up). Every feature is at most two clicks away: destination → sub-tab.
 */
export const NAV = {
  groups: [
    { id: 'home', label: 'Home', icon: 'home', order: 0 },
    { id: 'locker', label: 'Locker', icon: 'character', order: 10 },
    { id: 'cases', label: 'Cases', icon: 'crate', order: 15 },
    { id: 'maps', label: 'Mountains', icon: 'maps', order: 30 },
    { id: 'career', label: 'Career', icon: 'career', order: 45 },
  ],
  tabs: {
    home: { group: 'home' },
    equipment: { group: 'locker', short: 'Gear' },
    locker: { group: 'locker', short: 'Skins' },
    cases: { group: 'cases' },
    maps: { group: 'maps' },
    progress: { group: 'career', short: 'Progress' },
    leaderboards: { group: 'career', short: 'Leaderboards' },
    profile: { group: 'career', short: 'Profile' },
    multiplayer: { nav: 'utility', short: 'Friends' },
    settings: { nav: 'utility' },
  },
  home: 'home',          // where the lobby opens on a fresh profile and after every ride
};
