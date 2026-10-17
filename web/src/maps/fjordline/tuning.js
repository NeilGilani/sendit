// Fjordline's per-map tuning, applied over config.js when the map loads (and reset when another map loads):
// applyMapTuning() in config.js (docs/map3.md §3). Built on Ravenspire's big-mountain numbers (a copy, so the two
// maps can drift apart), then pushed faster: maritime spring snow is denser and quicker than continental powder,
// the cruiser should hold 60–70 mph over its rollers, and the lower mountain is a series of jumps to the sea.
// Targets (docs/map7-research.md): 22–31 m/s (50–70 mph) on the big lines; 15–25 m drops landable on the face;
// Naustgapet (the boathouse gap) and the roof hops land clean at village speeds (12–18 m/s).

export const FJORDLINE_PHYSICS = {
  common: {
    trickStyle: true,
    windRoar: 1,
    airSettleAngle: 100,
    microHop: 0.12,
    landRedirect: 30,
    landSpeedCap: 34,
    flow: { enabled: true },      // line chains, flow meter, SEND IT, judged run summary (physics/flow.js)
    slowmo: { minAir: 2.8, minDrop: 10, scale: 0.7, easeIn: 0.2, hold: 0.3, easeOut: 0.3, cooldown: 6 },
    softCapDrag: 0.055,
    airDrag: 0.0028,              // sea-level air is denser than Ravenspire's (ρ ≈ 1.25 vs 0.9), but riders tuck lower
    // Spring snow by the sea: settled powder up high, faster wind-packed and corn snow lower down.
    powderDepth: 0.45,
    frictionPowder: 0.05,
    turnScrub: 0.09,
    smoothFollow: 0.5,
    terrainImpactLoss: 0.22,
    compressionStumble: 11.5,
    compressionCrash: 17.5,
    liftOffGrip: 1.45,
    landPowderAbsorb: 4.5,
    landPowderScrub: 0.011,
    hardLanding: 17,
    crashImpact: 24,
    landYawSpeed: [18, 32, 0.75],
    obstacleHeights: true,
    treeCrashSpeed: 10,
    wallCrashSpeed: 9,
    stumbleTime: 0.8,
  },
  ski: {
    maxVelocity: 27,
    dragUpright: 0.0092, dragTuck: 0.0044,
    speedRadius: 1.2, speedRadiusV: [8, 29],
    latG: 2.05,
    turnRateFast: 1.15,
    popMin: 2.2, popMax: 4.3,
    spinSet: 6.2, flipSet: 3.3, windupSpin: 3.0,
    landClean: 18, landStumble: 32, landCrash: 40,
    powderFloat: 1.1,
  },
  snowboard: {
    maxVelocity: 26.5,
    dragUpright: 0.0095, dragTuck: 0.0061,
    speedRadius: 2.1, speedRadiusV: [6, 27],
    latGToe: 1.8, latGHeel: 1.65,
    turnRateFast: 1.25,
    popMin: 2.5, popMax: 4.7,
    spinSet: 7.0, flipSet: 3.4, windupSpin: 3.4,
    landClean: 18, landStumble: 46,
    powderFloat: 1.8,
  },
};

export const FJORDLINE_CAMERA = {
  maxFovBonus: 15, fovCurve: 1.6,
  distanceAtSpeed: 2.2, heightAtSpeed: 0.3, followSmooth: 0.1,
  steepLift: 0.4, steepPitch: 3,
  speedShake: 0.12, speedShakeFrom: 0.75,
  flowFov: 7,
  airLook: 0.25,
  airFollowY: 0.09,
  landTrauma: 0.045,
};

// Golden hour (the graphics session's per-map atmosphere hook, gfx/atmosphere.js applyAtmosphere; ignored
// until it merges). A low Arctic sun from the south-east (bearing from north, degrees) cross-lights the
// east-facing face from the right, so spines, lips and roofs have a warm lit side and a long blue shadow, and
// throws a glitter path across the fjord to the right of the fall line. Colours are screen sRGB.
export const FJORDLINE_ATMOSPHERE = {
  sunElevation: 11,
  sunBearing: 128,
  skyZenith: '#3e6fa8',
  skyHorizon: '#f4c896',
  fogColor: '#f3d2b0',
  fogDensity: 0.85,
  exposure: 0.66,
  ambientScale: 0.85,
};
