// Ravenspire's per-map tuning, applied over config.js when the map loads (and reset when another
// map loads) — see applyMapTuning() in config.js and docs/map3.md.
//   physics.common    → PHYSICS (top level)
//   physics.ski       → PHYSICS.ski
//   physics.snowboard → PHYSICS.snowboard
//   camera            → CAMERA
// Targets (docs/map3-research.md): 22–31 m/s (50–70 mph) on big lines, stable carving at speed, deep
// powder, long hang time off cliffs, landings that let you stomp 15–25 m drops on a steep landing.
// Measured with web/scripts/map3-ride.mjs (numbers in docs/map3.md).

export const RAVENSPIRE_PHYSICS = {
  common: {
    trickStyle: true,             // more grabs, tweaks
    airSettleAngle: 100,          // launched mid-skid: square up in the air
    flow: { enabled: true },      // line chains, flow meter, SEND IT state (physics/flow.js)
    slowmo: { minAir: 2.4, scale: 0.45, easeIn: 0.15, hold: 0.5, easeOut: 0.35, cooldown: 5 },   // apex slow motion on huge airs
    // Speed: the soft cap starts at each gear's maxVelocity (below); terminal speed on the 41° face
    // ≈ 31–32 m/s tucked, ≈ 27 upright; ≈ 27 / 21 on the 27° lower bowl.
    softCapDrag: 0.06,
    airDrag: 0.004,
    // Deep powder everywhere (no pistes): slow skis plough, fast ones plane.
    powderDepth: 0.6,
    frictionPowder: 0.06,
    turnScrub: 0.1,
    // Terrain following at speed: rolls and dips cost little speed, but a flat bottom hit hard
    // still buckles the knees (compression, m/s of normal velocity absorbed within ~0.12 s).
    smoothFollow: 0.5,
    terrainImpactLoss: 0.25,
    compressionStumble: 11,
    compressionCrash: 17,
    // Natural air: legs absorb a bit more before leaving the snow (fewer micro hops at 30 m/s).
    liftOffGrip: 1.5,
    // Big air: slightly floaty, deep-powder landings (absorb), forgiving thresholds; less sideways
    // tolerance the faster you land.
    airGravity: 0.9,
    landPowderAbsorb: 5,
    landPowderScrub: 0.012,
    hardLanding: 16,
    crashImpact: 24,
    landYawSpeed: [18, 32, 0.75],
    obstacleHeights: true,
    treeCrashSpeed: 10,
    wallCrashSpeed: 9,
    stumbleTime: 0.85,
  },
  ski: {
    maxVelocity: 26,
    dragUpright: 0.0095, dragTuck: 0.0046,
    speedRadius: 1.2, speedRadiusV: [8, 28],     // long, stable arcs at speed
    latG: 2.0,
    turnRateFast: 1.15,
    popMin: 2.2, popMax: 4.2,
    spinRateMax: 7.2, flipRateMax: 6.0, windupSpin: 3.0,
    landClean: 18, landStumble: 32, landCrash: 40,
    powderFloat: 1.1,
  },
  snowboard: {
    maxVelocity: 25.5,
    dragUpright: 0.0098, dragTuck: 0.0064,
    speedRadius: 2.1, speedRadiusV: [6, 26],
    latGToe: 1.75, latGHeel: 1.6,
    turnRateFast: 1.25,
    popMin: 2.5, popMax: 4.6,
    spinRateMax: 8.2, flipRateMax: 6.2, windupSpin: 3.4,
    landClean: 18, landStumble: 46,
    powderFloat: 1.8,
  },
};

export const RAVENSPIRE_CAMERA = {
  maxFovBonus: 14, fovCurve: 1.6,      // the lens opens in the top of the speed range (66° → 80°)
  distanceAtSpeed: 2.2, heightAtSpeed: 0.3, followSmooth: 0.1,   // close enough to feel the rider, less lag at 30 m/s
  steepLift: 0.4, steepPitch: 3,       // higher and looking further down on steep faces: read the rollover
  speedShake: 0.12, speedShakeFrom: 0.75,
  flowFov: 7,                          // SEND IT kick
  airLook: 0.25,                       // big air: look toward the landing
  airFollowY: 0.09,                    // …and keep up with the drop
  landTrauma: 0.045,                   // landings here are bigger: a little less shake per m/s
};
