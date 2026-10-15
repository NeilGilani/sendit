// Lobby tunables (stage look, camera shots, turntable feel). Kept out of config.js on purpose:
// the lobby owns its own numbers.

export const STAGE = {
  // Sky + horizon (matches the daylight palette in scene.js ATMOSPHERE).
  skyZenith: '#5f94d6',
  skyMid: '#a9c4e6',
  skyHorizon: '#eef2f6',
  sunGlow: '#fff3df',
  ridgeColors: ['#e3e9f2', '#d3dcea', '#c3d0e3', '#b3c3db'],   // far → near
  groundFadeNear: 16,            // m — snow fades into the horizon haze between these radii
  groundFadeFar: 70,

  // Key light (direction TOWARDS the light, world space; camera looks down −Z from +Z).
  keyDir: [-0.55, 0.62, 0.56],
  shadowHalf: 2.6,               // m — shadow box around the turntable
  shadowMap: 2048,

  // Turntable.
  platformRadius: 1.9,
  neon: '#2ff5d6',
  neon2: '#ff5fb0',

  // Snowfall.
  flakes: 700,
  flakeBox: 14,                  // m
};

/**
 * Camera shots. A tab picks one by name (tab.shot); the camera eases between them.
 *   target  – look-at height (m)        pitch – degrees down
 *   frame   – metres of subject height that should fill ~80 % of the free screen area
 */
export const SHOTS = {
  full: { target: 0.95, pitch: 4, frame: 3.0 },
  gear: { target: 0.75, pitch: 9, frame: 2.75 },
  portrait: { target: 1.35, pitch: 2, frame: 1.5 },
  wide: { target: 1.1, pitch: 3, frame: 4.6 },
};

export const CAMERA = {
  fov: 30,
  minZoom: 0.7,                  // user zoom (wheel / pinch / triggers) multiplies the shot distance
  maxZoom: 1.45,
  shotEase: 3.2,                 // 1/s
};

export const TURNTABLE = {
  heroYaw: Math.PI - 0.55,       // rest angle: a 3/4 view of the rider
  dragSpeed: 0.0085,             // rad per CSS px
  keySpeed: 2.4,                 // rad/s with A/D or the right stick
  friction: 4.0,                 // inertia decay (1/s)
  returnDelay: 7,                // s idle before easing back to the hero angle
  returnRate: 0.9,
};
