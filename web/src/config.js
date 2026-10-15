// =====================================================================================
// SENDIT — every tunable in one place. Tweak the feel and the look here.
// Units: metres, seconds, radians (unless noted). All motion uses dt, so 30/60/144 Hz feel the same.
// =====================================================================================

// ------------------------------------------------------------------ PlayerPhysics
export const PHYSICS = {
  gravity: 9.81,
  maxVelocity: 15,            // m/s — "max" used by all speed ratios (~54 km/h): a normal skiing pace
  softCapDrag: 0.12,          // extra drag above maxVelocity keeps things arcade but bounded
  frictionGroomed: 0.028,
  frictionPowder: 0.07,
  frictionRock: 0.12,
  dragUpright: 0.011,        // quadratic air drag
  dragTuck: 0.0065,
  turnRateSlow: 2.3,          // rad/s carving at low speed
  turnRateFast: 1.5,          // rad/s at max speed — wide fast arcs
  steerResponse: 5.0,         // how fast steering input eases in (1/s) — snappy & arcade
  grip: 5.5,                  // lateral velocity decay (1/s)
  powderGrip: 3.6,
  carveEfficiency: 0.94,      // share of lateral speed redirected forward when carving
  autoAlign: 1.4,
  pushAccel: 4.0,             // skating when W is held at low speed
  pushMaxSpeed: 9,
  brakeDecel: 9.0,
  holdStillSlope: 0.002,      // 1 − n.y below this counts as flat (≈ 3.6°)
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
  treeCrashSpeed: 9,
  tumbleTime: 1.4,
  // Aerodynamic auto-tuck
  autoTuckDelay: 2.5,         // seconds without directional input
  autoTuckSpeedRatio: 0.6,
  normalRadius: 1.4,
  // Powder feel: sink in when slow, plane up with speed; turning in deep snow scrubs speed.
  powderSink: 0.24,           // metres the rider sinks into powder when slow
  powderSinkFast: 0.07,       // … and when planing at speed
  planeSpeed: [3, 12],        // m/s range over which the skis rise to the surface
  turnScrub: 0.16,            // speed lost turning in powder (1/s per unit of carve)
  liftRideSeconds: 45,
  liftBoardSpeed: 8,
};

// ------------------------------------------------------------------ Rider animation ("juice")
export const ANIM = {
  maxRollAngle: 0.5,          // rad — carve lean at full turn & speed
  skiStance: 0.13,            // metres from centre to each ski
  rollResponse: 10,
  squatMax: 0.25,             // pre-jump Y compression (25%)
  squatXZ: 0.12,              // X/Z expansion while squatting (volume preservation)
  landSquashPerMs: 0.035,     // squash per m/s of vertical landing speed
  landSquashMax: 0.45,
  springFreq: 13,             // rad/s of the damped squash & stretch oscillation
  springDamping: 4.5,         // 1/s decay — settles in ~2-3 bounces
  chatterSpeedRatio: 0.92,    // board chatter above 80% of max velocity
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
  fpFov: 80,                  // first person: wide helmet-cam lens
  fpFovBonus: 14,
  maxFovBonus: 8,             // currentFoV = baseFoV + velocityRatio * maxFovBonus
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
  maxParticles: 4500,
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
  trackMapMeters: 100,        // world metres covered by the track map (≈5 cm per texel)
  trackWidth: 0.16,           // metres — one ski groove
  skiSpacing: 0.26,           // metres between the two grooves
  plowWidth: 0.8,             // the shallow trough the boots + skis push through powder
  plowStrength: 0.42,
  grainRate: 320,             // sugar grains / s from the skis (scaled by speed + powder)
  grainLife: 0.9,
  puffRate: 22,               // soft powder clouds / s
};

// ------------------------------------------------------------------ Art style (materials)
// Lighting, the snow palette, sky, fog and environment spawning live in scene.js (the scene file).
export const ART = {
  rimLightColor: [1.0, 0.78, 0.5],
  rimPower: 3.0,
  rimStrength: 0.45,
  neonColor: [0.1, 1.0, 0.85],        // cyan neon trim
  neonColor2: [1.0, 0.2, 0.75],       // pink neon trim
  windSpeed: 1.3,
  windIntensity: 0.05,
};

// ------------------------------------------------------------------ HUD
export const HUD = {
  speedMilestones: [20, 35, 50],      // km/h — the speed readout bounces when crossing these
  windStreakFrom: 0.92,               // speed ratio where corner wind streaks start
  windStreakFull: 1.0,
};
