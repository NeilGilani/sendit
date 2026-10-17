// Kitsune Peak's per-map tuning, applied over config.js when the map loads (and reset when another map
// loads) — applyMapTuning() in config.js; see docs/map6.md.
//   physics.common → PHYSICS, physics.ski → PHYSICS.ski, physics.snowboard → PHYSICS.snowboard, camera → CAMERA
// Targets: fast (22–30 m/s on the bowl and the steeps), deep bottomless Japow that floats you up and lets
// a fast rider plane instead of ploughing, soft landings (pillows, cliffs and roof drops into powder),
// whoops on the Kazan Rim you can pop off, and honest jump physics (real gravity, no float in the air).

export const KITSUNE_PHYSICS = {
  common: {
    trickStyle: true,
    windRoar: 1,
    airSettleAngle: 100,
    microHop: 0.12,              // skimming a whoop at 28 m/s is not a landing
    landRedirect: 30,            // land on a gully wall lined up: the skis pivot into the new line
    landSpeedCap: 32,
    flow: { enabled: true },     // line chains, flow meter, SEND IT, line goals, run summary (physics/flow.js)
    slowmo: { minAir: 2.8, minDrop: 10, scale: 0.7, easeIn: 0.2, hold: 0.3, easeOut: 0.3, cooldown: 6 },
    softCapDrag: 0.06,
    airDrag: 0.0026,
    // Japow: deeper than anywhere else (powderDepth), but light (8 % water): low friction once you plane.
    powderDepth: 0.75,
    frictionPowder: 0.05,
    turnScrub: 0.09,
    smoothFollow: 0.55,
    terrainImpactLoss: 0.22,
    compressionStumble: 11.5,
    compressionCrash: 17.5,
    liftOffGrip: 1.5,
    // Bottomless landings: the powder absorbs more of the impact (pillows, cliffs, roof drops).
    landPowderAbsorb: 6,
    landPowderScrub: 0.011,
    hardLanding: 17,
    crashImpact: 25,
    landYawSpeed: [18, 32, 0.75],
    obstacleHeights: true,
    treeCrashSpeed: 9,
    wallCrashSpeed: 9,
    stumbleTime: 0.8,
  },
  ski: {
    maxVelocity: 25,
    dragUpright: 0.0095, dragTuck: 0.0047,
    speedRadius: 1.15, speedRadiusV: [8, 27],
    latG: 2.05,
    turnRateFast: 1.2,
    popMin: 2.3, popMax: 4.3,
    spinSet: 6.0, flipSet: 3.2, windupSpin: 3.0,
    landClean: 18, landStumble: 32, landCrash: 40,
    powderFloat: 1.35,
  },
  snowboard: {
    maxVelocity: 24.5,
    dragUpright: 0.0098, dragTuck: 0.0064,
    speedRadius: 2.0, speedRadiusV: [6, 25],
    latGToe: 1.8, latGHeel: 1.65,
    turnRateFast: 1.3,
    popMin: 2.6, popMax: 4.7,
    spinSet: 6.8, flipSet: 3.3, windupSpin: 3.4,
    landClean: 18, landStumble: 46,
    powderFloat: 2.1,
  },
};

export const KITSUNE_CAMERA = {
  maxFovBonus: 14, fovCurve: 1.6,
  distanceAtSpeed: 2.2, heightAtSpeed: 0.3, followSmooth: 0.1,
  steepLift: 0.35, steepPitch: 2.5,
  speedShake: 0.12, speedShakeFrom: 0.75,
  flowFov: 7,
  airLook: 0.25,
  airFollowY: 0.09,
  landTrauma: 0.045,
};

// The dusk look (gfx/atmosphere.js, course.atmosphere): a low sun in the south-south-west (9° up) behind the
// volcano's shoulder, so the face sits in blue-violet shade under an indigo zenith while the summits and far
// ranges catch peach alpenglow; the lanterns carry the warm light lower down. Bearings are degrees from north
// (−z), like scene.js LIGHTING.sunBearing; colours are sRGB. Tuned on the real GPU with ?atmo={...}.
export const KITSUNE_ATMOSPHERE = {
  sunElevation: 9,
  sunBearing: 215,
  skyZenith: '#2f4f9e',
  skyHorizon: '#e9b394',
  fogColor: '#a7b6dc',
  fogDensity: 1.2,           // × the default aerial extinction (a little thicker: dusk haze)
  exposure: 1.0,
  ambientScale: 1.25,
  sunIntensity: 0.7,
  sunTint: '#ffae7a',
};
