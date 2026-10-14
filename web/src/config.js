// =====================================================================================
// SENDIT — every tunable in one place. Tweak the feel and the look here.
// Units: metres, seconds, radians (unless noted). All motion uses dt, so 30/60/144 Hz feel the same.
// =====================================================================================

// ------------------------------------------------------------------ PlayerPhysics
export const PHYSICS = {
  gravity: 9.81,
  maxVelocity: 34,            // m/s — "max" used by all speed ratios (~122 km/h)
  softCapDrag: 0.05,          // extra drag above maxVelocity keeps things arcade but bounded
  frictionGroomed: 0.028,
  frictionPowder: 0.06,
  frictionRock: 0.12,
  dragUpright: 0.0030,        // quadratic air drag
  dragTuck: 0.0011,
  turnRateSlow: 2.6,          // rad/s carving at low speed
  turnRateFast: 1.55,         // rad/s at max speed — wide fast arcs
  steerResponse: 9.0,         // how fast steering input eases in (1/s) — snappy & arcade
  grip: 6.0,                  // lateral velocity decay (1/s)
  powderGrip: 4.2,
  carveEfficiency: 0.94,      // share of lateral speed redirected forward when carving
  autoAlign: 1.4,
  pushAccel: 4.0,             // skating when W is held at low speed
  pushMaxSpeed: 9,
  brakeDecel: 9.0,
  holdStillSlope: 0.006,
  takeoffGap: 0.3,
  // Jump: hold to squat, release to pop. Impulse scales with squat depth.
  chargeTime: 0.6,
  jumpMin: 3.0,
  jumpMax: 8.0,
  airDrag: 0.006,
  spinRateMax: 5.5,           // rad/s
  spinResponse: 7.0,
  landAlignRate: 9.0,
  // Landing tolerance (degrees between board and travel / slope)
  stumbleAngle: 20,
  crashAngle: 45,
  stumbleTime: 1.0,
  stumbleHandling: 0.6,       // handling multiplier while stumbling (−40%)
  crashImpact: 18,            // m/s into the slope
  treeCrashSpeed: 12,
  tumbleTime: 1.4,
  // Aerodynamic auto-tuck
  autoTuckDelay: 1.5,         // seconds without directional input
  autoTuckSpeedRatio: 0.6,
  normalRadius: 1.4,
  liftRideSeconds: 45,
  liftBoardSpeed: 8,
};

// ------------------------------------------------------------------ Rider animation ("juice")
export const ANIM = {
  maxRollAngle: 0.62,         // rad — edge-dig roll at full turn & speed
  rollResponse: 10,
  squatMax: 0.25,             // pre-jump Y compression (25%)
  squatXZ: 0.12,              // X/Z expansion while squatting (volume preservation)
  landSquashPerMs: 0.035,     // squash per m/s of vertical landing speed
  landSquashMax: 0.45,
  springFreq: 13,             // rad/s of the damped squash & stretch oscillation
  springDamping: 4.5,         // 1/s decay — settles in ~2-3 bounces
  chatterSpeedRatio: 0.8,     // board chatter above 80% of max velocity
  chatterAmp: 0.012,          // metres
  chatterRotAmp: 0.025,       // rad
  chatterFreq: 47,            // Hz-ish noise speed
  hipLean: 0.35,              // rad of mid-air hip lean toward travel/camera
  tuckResponse: 3.5,
  flailSpeed: 14,             // arm flail oscillation speed
};

// ------------------------------------------------------------------ CameraController
export const CAMERA = {
  baseFov: 66,
  maxFovBonus: 22,            // currentFoV = baseFoV + velocityRatio * maxFovBonus
  fovRiseRate: 2.2,           // 1/s easing up
  fovSnapRate: 14,            // 1/s snapping back on crash / hard brake
  distance: 4.7,
  distanceAtSpeed: 2.2,       // extra pull-back at max speed
  height: 1.75,
  pitch: -15,                 // degrees
  followSmooth: 0.14,         // smooth-damp time (s)
  traumaDecay: 1.4,           // per second, linear
  shakeOffset: 0.45,          // metres at trauma 1
  shakeAngle: 3.5,            // degrees at trauma 1
  shakeFreq: 22,
  landTrauma: 0.06,           // trauma per m/s of landing impact above 4 m/s
  crashTrauma: 0.8,
  obstacleTrauma: 0.35,
};

// ------------------------------------------------------------------ FXManager
export const FX = {
  maxParticles: 2400,
  cruiseRate: 26,             // fog particles / s while cruising
  cruiseLife: 2.6,
  carveRate: 170,             // wedge particles / s on hard carves
  carveLife: 0.75,
  carveSpeed: 9,
  brakeBurst: 90,             // particles in the braking fan
  brakeLife: 1.0,
  landBurst: 110,
  nearMissRadius: 3.2,        // proximity speed lines when this close to a tree/rock/flag
  speedLineCount: 160,
  speedLineLife: 0.45,
  trackMapSize: 2048,         // persistent track render texture (px)
  trackMapMeters: 140,        // world metres covered by the track map
  trackWidth: 0.34,           // metres (board)
};

// ------------------------------------------------------------------ Art style (materials)
// Lighting, the snow palette, sky, fog and environment spawning live in scene.js (the scene file).
export const ART = {
  toonSoftness: 0.02,                 // band edge softness for objects (pines, rider, lifts)
  rimLightColor: [1.0, 0.78, 0.5],
  rimPower: 3.0,
  rimStrength: 0.9,
  neonColor: [0.1, 1.0, 0.85],        // cyan neon trim
  neonColor2: [1.0, 0.2, 0.75],       // pink neon trim
  windSpeed: 1.3,
  windIntensity: 0.05,
};

// ------------------------------------------------------------------ HUD
export const HUD = {
  speedMilestones: [50, 100, 150],    // km/h — the speed readout bounces when crossing these
  windStreakFrom: 0.8,                // speed ratio where corner wind streaks start
  windStreakFull: 1.0,
};
