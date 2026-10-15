// =====================================================================================
// SENDIT — every tunable in one place. Tweak the feel and the look here.
// Units: metres, seconds, radians (unless noted). All motion uses dt, so 30/60/144 Hz feel the same.
// =====================================================================================

// ------------------------------------------------------------------ PlayerPhysics
export const PHYSICS = {
  gravity: 9.81,
  maxVelocity: 15,            // m/s — default speed ratio reference (each equipment type has its own below)
  softCapDrag: 0.12,          // extra drag above the equipment's maxVelocity keeps things arcade but bounded
  frictionGroomed: 0.028,     // glide μ by surface (the course "powder" blends toward groomed via powderDepth)
  frictionPowder: 0.07,
  frictionRock: 0.12,
  steerResponse: 5.0,         // fallback input smoothing (1/s); see ski / snowboard.steerResponse
  digitalSteerStart: 0.65,    // keys: share of full lock on press …
  digitalSteerRamp: 0.45,     // … reaching full lock after this many seconds held (linking turns skips the ramp)
  holdStillSlope: 0.006,
  normalRadius: 1.4,          // m terrain normal sampling (park features use a fine upstream normal)
  takeoffGap: 0.3,
  terrainImpactLoss: 0.5,     // share of an abrupt impact into the terrain (beyond smoothFollow) lost as speed
  smoothFollow: 0.25,         // m/s per step of normal velocity absorbed loss-free (smooth rolls and dips)
  lipPopBonus: 1.7,           // pop multiplier when popping on a kicker (vs an ollie on the flat)
  airDrag: 0.006,
  landAssistTime: 0.25,       // s before touchdown when a released stick lets the gear settle onto its path …
  landAssistAngle: 14,        // … if it's within this many degrees (SSX-style auto-righting)
  spinCheckAngle: 40,         // deg: stick released within this of an alignment → settle (or check back) onto it
  // Landing / crashes (yaw tolerances are per equipment type below)
  stumbleTime: 1.0,
  stumbleHandling: 0.6,       // handling multiplier while stumbling (−40%)
  crashImpact: 18,            // m/s into the slope
  treeCrashSpeed: 9,
  tumbleTime: 1.4,
  // Aerodynamic auto-tuck
  autoTuckDelay: 2.5,         // seconds without directional input
  autoTuckSpeedRatio: 0.6,
  // Powder: sink depth / bog / plough per equipment type below; these scale the whole course.
  powderDepth: 0.35,          // how deep the course powder is (0 = sugar on a groomer, 1 = bottomless)
  turnScrub: 0.16,            // speed lost turning in powder (1/s per unit of carve)
  liftRideSeconds: 45,
  liftBoardSpeed: 8,
  // Legacy pre-equipment tunables, kept so older code / other branches still resolve them. The physics
  // no longer reads these — tune PHYSICS.ski / PHYSICS.snowboard instead.
  dragUpright: 0.011, dragTuck: 0.0065, turnRateSlow: 2.3, turnRateFast: 1.5, grip: 5.5, powderGrip: 3.6,
  carveEfficiency: 0.94, autoAlign: 1.4, pushAccel: 4.0, pushMaxSpeed: 9, brakeDecel: 9.0, chargeTime: 0.6,
  jumpMin: 3.0, jumpMax: 8.0, spinRateMax: 5.5, spinResponse: 7.0, landAlignRate: 9.0, stumbleAngle: 20,
  crashAngle: 45, powderSink: 0.24, powderSinkFast: 0.07, planeSpeed: [3, 12],

  // ---------------------------------------------------------------- equipment physics
  // Shared carve / skid model (physics/edge.js), numbers from docs/equipment-research.md:
  //   edge angle follows the steer input (edge-switch time), carve radius R = sidecut · cos(edge),
  //   lateral grip capped at latG, beyond it the path widens and the edges skid (decel μ_side·g·sin β).
  //   Per-model multipliers (grip, pop, float, pivot, spin) come from the equipment spec.
  ski: {
    maxVelocity: 15,          // speed ratio reference (HUD / FX / camera); soft cap starts here
    steerResponse: 14,        // 1/s input smoothing (the edge roll rate does the rest)
    maxEdge: 68,              // deg — carving edge angle at full input
    edgeSwitchTime: 0.3,      // s full edge → full edge (short turns 0.25)
    edgeResponse: 14,         // 1/s first-order lean response on top of the rate limit
    engage: [3, 14],          // deg — edge angle range over which the sidecut starts to bend the path
    latG: 1.8,                // sustained lateral g before the edges let go
    speedRadius: 0.6, speedRadiusV: [8, 18],  // effective sidecut ×(1+0.6) from 8 → 18 m/s (long arcs at speed)
    carveAssist: 0.85,        // share of over-demand (beyond grip) that just widens the arc instead of skidding
    gripRate: 11,             // 1/s lateral velocity decay on an engaged edge
    flatGrip: 0.35,           // share of grip with a flat base (sideslips)
    carveEff: 0.985,          // share of redirected lateral energy kept in a clean carve
    skidEff: 0.8,             // … in a skid
    skidMu: 0.36,             // μ_side: steering-skid decel = μ·g·sin β (research 0.55; arcade-softened)
    carvePump: 0.05,          // m/s² gained per m/s² of lateral accel in a clean carve (rewards carving)
    trackBeta: [6, 28],       // deg — skid angle range where the sidecut stops steering the path
    pivotRate: 2.2,           // rad/s turn rate asked for at full input when slow (pivot fills what the carve lacks)
    turnRateFast: 1.25,       // rad/s … at speed (beyond the grip-limited carve → some skid)
    pivotFade: [2, 15],       // m/s blend range
    betaMax: 22,              // deg — pivot fades as the skid angle approaches this
    selfAlign: 2.2,           // 1/s skis track their own path when the rider stops steering
    // Braking: snowplough below plowSpeed, hockey stop above.
    plowSpeed: 6.5,
    plowDecel: 2.2,           // m/s² at full wedge
    plowTurn: 0.75,           // steering share while ploughing
    stopAngle: 82,            // deg the skis pivot across the path
    stopTurnRate: 7,          // rad/s pivot into the stop
    stopMu: 0.5,              // ≈6.5 m/s² at 90° together with drag
    stopEdge: 32,             // deg edge set during the stop
    pushAccel: 4.0, pushMaxSpeed: 8.5,   // poling / skating
    dragUpright: 0.0115, dragTuck: 0.0062,
    // Powder: sink depth slow→fast (m), planing speed, plough drag a = k·depth·v, bog decel below planing.
    powderFloat: 1.0, sinkSlow: 0.22, sinkFast: 0.08, powderBog: 7, powderDrag: 0.3, powderBogDecel: 0.12, powderSteer: 0.7,
    // Air
    popMin: 1.9, popMax: 3.5, chargeTime: 0.4,    // m/s vertical pop (tap → full charge)
    spinRateMax: 6.4, spinResponse: 7, prewind: 0.45,
    windupSpin: 2.6,          // rad/s of spin added at take-off by a full wind-up (steer while charging)
    landClean: 15, landStumble: 30, landCrash: 38, // deg yaw between ski and path
    switchLand: 30,           // deg — backwards landings within this are "switch" (twin tips clean)
  },
  snowboard: {
    maxVelocity: 14.5,
    steerResponse: 11,
    maxEdgeToe: 64, maxEdgeHeel: 55,
    edgeSwitchTime: 0.42, heelToToe: 0.3, toeToHeel: 0.4,   // s full edge to full edge (rate limit; with the lean response ≈0.38 / 0.46 s)
    edgeResponse: 9,
    engage: [3, 13],
    latGToe: 1.6, latGHeel: 1.45,
    sidecutToe: 1.0, sidecutHeel: 0.95,     // × spec sidecut (heel side bends a touch tighter)
    speedRadius: 1.5, speedRadiusV: [6, 16],
    carveAssist: 0.85,
    gripRate: 10, flatGrip: 0.25,
    carveEff: 0.985, skidEff: 0.75, skidMu: 0.34, carvePump: 0.05,
    trackBeta: [7, 30],
    pivotRate: 2.5, turnRateFast: 1.35, pivotFade: [2, 14], betaMax: 26,
    selfAlign: 2.0,
    // Slide stop: rotate the board ~90° across the path on the heel (or toe) edge.
    stopAngle: 86, stopTurnRate: 6, stopMuHeel: 0.42, stopMuToe: 0.33, stopEdgeHeel: 30, stopEdgeToe: 34,
    pushAccel: 2.4, pushMaxSpeed: 4.5,       // one-foot skate
    dragUpright: 0.0125, dragTuck: 0.0088,   // a board rider can only crouch, not tuck
    powderFloat: 1.6, sinkSlow: 0.12, sinkFast: 0.04, powderBog: 4.5, powderDrag: 0.25, powderBogDecel: 0.12, powderSteer: 0.9,
    // Butter: press nose / tail while charging and steer → pivot on the flexed end, base flat.
    butterRate: 3.4, butterMaxSpeed: 13, butterDrag: 0.8,
    // Air
    popMin: 2.2, popMax: 4.0, nollie: 0.88, chargeTime: 0.45,
    spinRateMax: 7.6, spinResponse: 7.5, prewind: 0.55, windupSpin: 3.2,
    landClean: 15, landStumble: 45, landSlide: 82, // deg yaw from the nearest board end to the path (sideways = hard slide)
  },
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
  // Lean = atan(lateral force / g) in the equipment frame (carves, stops), capped for readability;
  // the gear itself rolls to the physics edge angle, the difference is angulation (hips / knees).
  maxLean: 0.8,               // rad body inclination cap
  maxGearEdge: 1.05,          // rad visual edge angle cap
  angulation: 0.75,           // share of (edge − lean) the ski rider takes up in the spine (upright upper body)
  polePlantTime: 0.38,        // s a pole touch lasts (triggered on edge changes)
  board: {
    crouch: 0.16,             // m pelvis drop at rest (riders stand lower than skiers)
    crouchSpeed: 0.08,        // extra drop at speed
    shoulderOpen: 0.42,       // rad shoulders open toward the nose
    hipOpen: 0.16,            // rad hips open toward the nose
    headTurn: 1.3,            // rad total head yaw toward the direction of travel
    turnLead: 0.35,           // rad upper-body rotation leading into the turn
    heelSit: 0.1,             // m hips back/down on the heel edge
    toeDrive: 0.07,           // m knees/hips forward on the toe edge
    pressShift: 0.11,         // m pelvis shift toward the pressed end (ollie / nollie / butter)
    pressPitch: 0.16,         // rad board flex / nose-lift while pressing
    popSnap: 0.38,            // rad the free end snaps up at an ollie / nollie, settling in ~0.3 s
    airTuck: 0.18,            // m board pulled up toward the hips in the air
    grabTuck: 0.3,            // m extra pull-up while grabbing
  },
};

// ------------------------------------------------------------------ CameraController
export const CAMERA = {
  baseFov: 66,
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
