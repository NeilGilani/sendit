// =====================================================================================
// SENDIT — every tunable in one place. Tweak the feel and the look here.
// Units: metres, seconds, radians (unless noted). All motion uses dt, so 30/60/144 Hz feel the same.
// =====================================================================================

// ------------------------------------------------------------------ PlayerPhysics
export const PHYSICS = {
  gravity: 9.81,
  maxVelocity: 15,            // m/s — default speed ratio reference (each equipment type has its own below)
  softCapDrag: 0.06,          // extra drag above the equipment's maxVelocity keeps things arcade but bounded
  frictionGroomed: 0.028,     // glide μ by surface (the course "powder" blends toward groomed via powderDepth)
  frictionPowder: 0.07,
  frictionRock: 0.12,
  steerResponse: 5.0,         // fallback input smoothing (1/s); see ski / snowboard.steerResponse
  digitalSteerStart: 0.65,    // keys: share of full lock on press …
  digitalSteerRamp: 0.45,     // … reaching full lock after this many seconds held (linking turns skips the ramp)
  holdStillSlope: 0.002,      // 1 − n.y below this counts as flat (≈ 3.6°)
  normalRadius: 1.4,          // m terrain normal sampling (park features use a fine upstream normal)
  takeoffGap: 0.3,
  liftOffGrip: 1.25,          // natural air: leave the snow when the crest needs > this × g·cos θ of downward pull
  liftOffAbsorb: 0.8,         // … × (1 + this · charge): crouching (charging a pop) soaks up crests
  liftOffMin: 0.06,
  latePopTime: 0.15,          // s after rolling off a crest while loaded that releasing still pops (coyote time)           // m/s per step of separation below which the rider just stays on (no micro-hops)
  terrainImpactLoss: 0.5,     // share of an abrupt impact into the terrain (beyond smoothFollow) lost as speed
  smoothFollow: 0.25,         // m/s per step of normal velocity absorbed loss-free (smooth rolls and dips)
  followMaxRate: 12,          // rad/s the terrain can turn the path upward on the ground (a height-field step is a bump, not a ramp)
  // Jumps (docs/jumps-research.md). Flights are plain ballistics + drag: no extra lift, no pop bonus.
  lipPopBonus: 0.8,           // pop share on a kicker lip (the legs get less time to push than on the flat)
  popSpeedFade: [10, 26, 0.45],   // [v0, v1, share]: the pop fades to this share from v0 → v1 m/s (a lip at 60 mph is a blink)
  airDrag: 0.0027,            // k = ρ·CdA / 2m (1/m): a = k·v² in the air (CdA 0.4 m², ρ 1.0, 75 kg; terminal ≈ 60 m/s)
  airDragCompact: 0.7,        // drag share tucked / grabbing (CdA ≈ 0.28)
  // Pop timing sets the rotation (spin / flip momentum × this, edge.js): released right at the lip = 1.
  popLipTime: 0.12,           // s before the snow falls away that still counts as "at the lip"
  popEarly: 0.5,              // s ahead of the lip where an early pop is down to …
  popEarlySet: 0.55,          // … this share of the set
  popFlatSet: 0.7,            // a pop with no lip ahead (flat ground): a weaker set
  landAssistTime: 0.25,       // s before touchdown when a released stick lets the gear settle onto its path …
  landAssistAngle: 14,        // … if it's within this many degrees (SSX-style auto-righting)
  spinCheckAngle: 40,         // deg: stick released within this of an alignment → settle (or check back) onto it
  // Landing / crashes (yaw tolerances are per equipment type below)
  stumbleTime: 1.0,
  stumbleHandling: 0.6,       // handling multiplier while stumbling (−40%)
  hardLanding: 12.5,          // m/s into the slope: above this a clean landing becomes a stumble (knees buckle)
  crashImpact: 18,            // m/s into the slope
  treeCrashSpeed: 9,
  tumbleTime: 1.4,
  // Big-mountain landing / terrain model (off by default; maps turn them on through their physics hook).
  landPowderAbsorb: 0,        // m/s of landing impact (into the slope) deep powder soaks up before it counts
  landPowderScrub: 0,         // share of speed lost per m/s of landing impact in deep powder (the snow explodes, you sink)
  landYawSpeed: null,         // [v0, v1, scale]: yaw landing tolerances shrink to `scale` × from v0 → v1 m/s
  compressionStumble: Infinity,   // m/s: abrupt compression on the ground (a flat bottom at speed) that buckles the knees …
  compressionCrash: Infinity,     // … or slams the rider
  airGravity: 1,              // gravity multiplier in the air (< 1 = floatier, longer hang time)
  obstacleHeights: false,     // obstacles have a height: flying well above a tree or rock clears it
  wallCrashSpeed: 9,          // m/s into a building wall that knocks the rider down
  landRedirect: 0,            // deg: landing lined up with the flight, this much of the surface bending the path (a sidewall) is absorbed
  landSpeedCap: 0,            // m/s: after a landing, speed above this is cut to 35 % of the excess (0 = off)
  microHop: 0,                // s: airs shorter than this (a bump skimmed at speed) re-ground quietly instead of being judged as landings
  windRoar: 0,                // 0..1: the low-pass wind roar layer above 16 m/s (audio.js; 0 = off, maps opt in)
  airSettleAngle: 0,          // deg: with no spin going, a released stick squares the gear up to the path from this far out (0 = spinCheckAngle only)
  trickStyle: false,          // big-mountain trick extras: Tail grab / Truck driver on skis, tweaked grabs (labels, +50 % grab points)
  slowmo: null,               // { minAir, minDrop, scale, easeIn, hold, easeOut, cooldown }: apex slow motion on huge airs (player.js)
  flow: null,                 // { enabled, … } turns on the flow layer (physics/flow.js: line chains, flow meter, SEND IT state)
  wallAlign: false,           // steep transitions (pipe walls): the gear self-aligns to its path on the snow, not its horizontal part
  grind: null,                // physics/grind.js GRIND_DEFAULTS overrides (maps with rails)
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
    steerRelease: 22,         // 1/s … back to neutral once the keys / stick are let go (the turn settles sooner)
    maxEdge: 68,              // deg — carving edge angle at full input
    edgeSwitchTime: 0.3,      // s full edge → full edge (short turns 0.25)
    edgeResponse: 14,         // 1/s first-order lean response on top of the rate limit
    edgeRelease: 22,          // 1/s … flattening the edge with the input released
    engage: [3, 22],          // deg — edge angle range over which the gear decambers into its sidecut arc
    angulation: 26,           // deg the knees / hips add beyond the body's lean: max edge ≈ lean + this (slow = low edge)
    latG: 1.8,                // sustained lateral g before the edges let go
    speedRadius: 0.6, speedRadiusV: [8, 18],  // effective sidecut ×(1+0.6) from 8 → 18 m/s (long arcs at speed)
    carveAssist: 0.85,        // share of over-demand (beyond grip) that just widens the arc instead of skidding
    carveInput: 1,            // 0..1: the held share of the max edge picks that share of the grip-limited curvature (even stick feel at speed)
    carveCurve: 0.8,          // … as share^carveCurve (< 1 keeps a little more bite in small inputs)
    carveInputV: [16, 26],    // m/s over which carveInput phases in (tree-slalom speeds keep the snappy response)
    pivotGrip: 1.15,          // at speed the rotary pivot asks at most this × the grip-limited carve rate (full lock carves, not washes out)
    washMax: 0.2,             // over-demand that skids is capped at this × the grip curvature (no wash-out at 50–70 mph)
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
    // Butter: Space (tail) or W+Space (nose) press + steer when slow → pivot on the pressed tips/tails.
    butterRate: 2.6, butterMaxSpeed: 11, butterDrag: 0.9, butterNonTwin: 0.6, nollie: 0.9,
    dragUpright: 0.0135, dragTuck: 0.0055,   // CdA ratio ≈2.5: the tuck is worth ≈+20% top speed (16 → 20 m/s on 25°)
    // Powder: sink depth slow→fast (m), planing speed, plough drag a = k·depth·v, bog decel below planing.
    powderFloat: 1.0, sinkSlow: 0.22, sinkFast: 0.08, powderBog: 7, powderDrag: 0.3, powderBogDecel: 0.12, powderSteer: 0.7,
    // Air
    popMin: 1.9, popMax: 3.5, chargeTime: 0.4,    // m/s vertical pop (tap → full charge)
    // Rotation = angular momentum set at take-off, tuck / open in the air (edge.js, docs/jumps-research.md).
    // Spin: rad/s in the neutral pose; tucked × spinTuckGain (arms in), open × spinOpen.
    spinSet: 6.0,             // full set (wind-up + throw, popped at the lip): 345°/s neutral, 500°/s tucked
    spinTuckGain: 1.45, spinOpen: 0.6, spinResponse: 9, prewind: 0.45,
    windupSpin: 2.6,          // rad/s of spin momentum a full wind-up (steer while charging) sets at the pop
    spinThrow: 0.3,           // s after take-off the shoulders can still throw (add to) the spin …
    spinThrowAir: 0.1,        // … + this many s per s of expected air beyond 1 s (up to +0.2 s on a 3 s air) …
    spinThrowRate: 18,        // … at this rate (rad/s²), fading over the window …
    spinThrowMax: 3.4,        // … up to this without a wind-up (rad/s)
    spinLateMax: 2.2, spinLateRate: 6, spinLateAir: 0.8,   // after the window steering still builds a spin: up to 2.2 rad/s (neutral) at 6 rad/s², with ≥ 0.8 s of air left
    spinMinH: 0.5, spinCheck: 3.2, airTwist: 1.0,   // below spinMinH not spinning; check-back / hip-twist rates (rad/s)
    poseTime: 0.22,           // s to tuck in / open up fully (the rotation speeds up and slows gradually)
    rollSet: 0.6,             // set share rolling off without a pop
    // Flips (W = front, S = back): rad/s in the open (layout) pose, × flipTuckGain tucked.
    flipSet: 3.1,             // full set (preload + throw): 180°/s open, 410°/s tucked (≈ 1.15 rev/s)
    flipTuckGain: 2.3, flipResponse: 8,
    flipTuckHold: 1.6, flipTuckFade: 1.0, flipTuckFloor: 0.2,   // s a full tuck holds, s it fades over, share left (the legs tire: ∝ ω²)
    flipPreload: 0.55,        // share of flipSet a full preload (S while charging) sets at the pop (holding S through the throw finishes it)
    flipThrow: 0.4, flipThrowRate: 11, flipThrowMax: 2.0,   // the in-air throw window (s), rate, cap without a preload
    flipThrowAir: 0.15,       // s of extra throw window per s of expected air beyond 1 s (0.7 s on a 3 s air)
    flipLateMax: 1.8, flipLateRate: 5, flipLateAir: 1.7,   // after the window W / S still start a flip: up to 1.8 rad/s at 5 rad/s², with ≥ 1.7 s of air left
    flipOpen: 0.75,           // a stretched layout (key against the flip, or spotting an over-set flip) slows it to this share
    flipSpotBleed: 2.0,       // rad/s² of flip momentum a spotting rider sheds stretching out of an over-set flip (down to what the landing needs)
    flipCounter: 4.0, flipCounterAngle: 50,   // key against the flip within this many ° of upright: sheds momentum at this rate (rad/s²) — evens out a near miss
    flipMinH: 0.35, flipMinAir: 0.45, flipCheck: 1.2,       // not flipping below flipMinH; no new flip with < flipMinAir s left
    flipSpot: 0.35,           // s: let go and the rider plans to come round early and open up (layout) for the last flipSpot s
    flipLandClean: 22, flipLandStumble: 42,
    grabRate: 7, grabRelease: 9,          // 1/s reaching for / letting go of a grab …
    grabLetGo: 0.22,          // … which the rider does by itself this many s before touchdown
    landClean: 15, landStumble: 30, landCrash: 38, // deg yaw between ski and path
    switchLand: 30,           // deg — backwards landings within this are "switch" (twin tips clean)
  },
  snowboard: {
    maxVelocity: 14.5,
    steerResponse: 11, steerRelease: 18,      // 1/s input smoothing; back to neutral once let go
    maxEdgeToe: 64, maxEdgeHeel: 55,
    edgeSwitchTime: 0.42, heelToToe: 0.3, toeToHeel: 0.4,   // s full edge to full edge (rate limit; with the lean response ≈0.38 / 0.46 s)
    edgeResponse: 9, edgeRelease: 15,         // 1/s lean response; flattening with the input released
    engage: [3, 24],
    angulation: 24,           // deg beyond the lean (ankles / knees); slow riders can't get high on edge
    latGToe: 1.6, latGHeel: 1.45,
    sidecutToe: 1.0, sidecutHeel: 0.95,     // × spec sidecut (heel side bends a touch tighter)
    speedRadius: 1.5, speedRadiusV: [6, 16],
    carveAssist: 0.85, carveInput: 1, carveCurve: 0.8, carveInputV: [16, 26], pivotGrip: 1.15, washMax: 0.2,   // see PHYSICS.ski
    gripRate: 10, flatGrip: 0.25,
    carveEff: 0.985, skidEff: 0.75, skidMu: 0.34, carvePump: 0.05,
    trackBeta: [7, 30],
    pivotRate: 2.5, turnRateFast: 1.35, pivotFade: [2, 14], betaMax: 26,
    selfAlign: 2.0,
    // Slide stop: rotate the board ~90° across the path on the heel (or toe) edge.
    stopAngle: 86, stopTurnRate: 6, stopMuHeel: 0.42, stopMuToe: 0.33, stopEdgeHeel: 30, stopEdgeToe: 34,
    pushAccel: 2.4, pushMaxSpeed: 4.5,       // one-foot skate
    dragUpright: 0.014, dragTuck: 0.0085,    // a board rider can only crouch, not tuck (≈+14%: 16 → 18.5 m/s on 25°)
    powderFloat: 1.6, sinkSlow: 0.12, sinkFast: 0.04, powderBog: 4.5, powderDrag: 0.25, powderBogDecel: 0.12, powderSteer: 0.9,
    // Butter: press nose / tail while charging and steer → pivot on the flexed end, base flat.
    butterRate: 3.4, butterMaxSpeed: 13, butterDrag: 0.8,
    // Air
    popMin: 2.2, popMax: 4.0, nollie: 0.88, chargeTime: 0.45,
    // Rotation (see ski): a board spins a little faster (one platform, arms free): 390°/s neutral, 565°/s tucked.
    spinSet: 6.8, spinTuckGain: 1.45, spinOpen: 0.6, spinResponse: 9, prewind: 0.55, windupSpin: 3.2,
    spinThrow: 0.3, spinThrowAir: 0.1, spinThrowRate: 20, spinThrowMax: 3.8, spinMinH: 0.5, spinCheck: 3.2, airTwist: 1.0,
    spinLateMax: 2.4, spinLateRate: 6.5, spinLateAir: 0.8,
    poseTime: 0.22, rollSet: 0.6,
    // Flips (W = tamedog / front, S = wildcat / back, over the toe-heel axis): 185°/s open, 425°/s tucked.
    flipSet: 3.2, flipTuckGain: 2.3, flipResponse: 8, flipPreload: 0.55,
    flipTuckHold: 1.6, flipTuckFade: 1.0, flipTuckFloor: 0.2,
    flipThrow: 0.4, flipThrowAir: 0.15, flipThrowRate: 11, flipThrowMax: 2.0, flipMinH: 0.35,
    flipLateMax: 1.8, flipLateRate: 5, flipLateAir: 1.7, flipOpen: 0.75, flipMinAir: 0.45, flipCheck: 1.2,
    flipSpotBleed: 2.0, flipCounter: 4.0, flipCounterAngle: 50,
    flipSpot: 0.35,
    flipLandClean: 22, flipLandStumble: 42,
    grabRate: 7, grabRelease: 9, grabLetGo: 0.22,
    landClean: 15, landStumble: 45, landSlide: 82, // deg yaw from the nearest board end to the path (sideways = hard slide)
  },
};

// ------------------------------------------------------------------ Rider animation ("juice")
export const ANIM = {
  maxRollAngle: 0.5,          // legacy: the lean now comes from the contact force (maxLean below)
  skiStance: 0.13,            // metres from centre to each ski
  rollResponse: 10,
  rollRelease: 15,            // 1/s the lean eases back up once the steer is let go (rollResponse tipping in)
  landLeanTime: 0.35, landLeanResponse: 30,   // s after a landing the lean catches up at this rate (1/s): plumb at once on a steep face
  leadRelease: 10,            // 1/s the upper-body turn lead eases back to neutral once the steer is let go (6 leading in)
  squatMax: 0.25,             // legacy (the whole-body squash is gone: squats and landings bend the knees, character/dynamics.js)
  squatXZ: 0.12,              // legacy
  landSquashPerMs: 0.035,     // landing spring per m/s of vertical speed (lobby previews only; riders use DYN.absorb)
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
  maxLean: 0.9,               // rad body inclination cap (52°: high-g carves at speed read aggressive)
  maxGearEdge: 1.05,          // rad visual edge angle cap
  maxAngulation: 0.7,         // rad the drawn edge may differ from the body's lean (40°: how far knees and hips can angulate)
  angulation: 0.75,           // share of (edge − lean) the ski rider takes up in the spine (upright upper body)
  angulationReverse: 0,       // … share kept when the edge is below the lean or already on the other side (cross-slopes, letting go, edge changes)
  crossover: 0.2,             // rad the upper body leads into the new turn while the lean still points into the old one (skis)
  skiCounter: 0.1,            // counter-rotation: hips / shoulders face the outside of a carve by this × the lean (skis)
  skiStanceCarve: 0.035,      // m each ski moves out at full lean (wider stance in deep carves)
  skiTipLead: 0.08,           // m the inside ski runs ahead of the outside one at full lean
  carveCrouch: 0.2,           // extra crouch (0..1 scale) at full lean: lower, more athletic in hard carves (skis and board)
  headLevel: 0.45,            // share of the body's roll the head takes back out (eyes nearer level)
  headLook: 0.2,              // rad of head turn into the carve per rad of lean (looking along the path ahead)
  skiSkidLook: 1.25,          // share of the skid angle the ski rider's head turns toward the path (down the slope in a hockey stop)
  polePlantTime: 0.38,        // s a pole touch lasts (triggered on edge changes)
  skiPressPitch: 0.14,        // rad the skis pitch up while pressing the tails / tips (butters, ollie load)
  skiPressShift: 0.09,        // m hips over the pressed end
  skiPopSnap: 0.3,            // rad the tips snap up at the pop
  flipLoadArch: 0.45,         // rad the upper body arches back while preloading a backflip (S while charging)
  flipPivot: 0.85,
  flipTuckLift: 0.14,         // m the feet pull up toward the hips while flipping            // m above the feet the rider flips about (centre of mass)
  restCrouch: 0.12,           // crouch (0..1) standing still: people stand tall at rest, the athletic stance comes with speed
  skiHipsFwd: 0.035,          // m the hips sit forward of the hip joints' rest spot: centred over the boots, shins pressed into the tongues
  powderBack: 0.03,           // m skiers sit back in deep powder (tips up)
  spotLanding: 0.3,           // rad the head pitches down to spot the landing in the last ~0.8 s of a jump
  gearSinkVisual: 0.15,       // share of the physics powder sink shown (the snow reads as packed, so the gear rides on top)
  board: {
    crouch: 0.17,             // m pelvis drop at rest (riders stand lower than skiers)
    crouchSpeed: 0.08,        // extra drop at speed
    crouchHinge: 0.19,        // rad of hip fold per unit crouch (the spine bends 0.8 × this): a crouch mostly bends the knees
    shoulderOpen: 0.42,       // rad shoulders open toward the nose
    hipOpen: 0.16,            // rad hips open toward the nose
    headTurn: 1.5,            // rad total head yaw toward the direction of travel (down the nose, over the front shoulder)
    turnLead: 0.35,           // rad upper-body rotation leading into the turn
    heelSit: 0.1,             // m hips back/down on the heel edge
    toeDrive: 0.07,           // m knees/hips forward on the toe edge
    toeTall: 0.15,            // rad the hips (and 0.7 × the spine) unfold on a full toe-side carve: knees drive, torso stays tall
    skidLook: 0.85,           // share of the skid angle the head (0.7) and shoulders (0.3) turn back toward the path (slide stops)
    headTilt: 0.1,            // rad head pitch toward the toes that levels the head turned down the nose (riding straight)
    pressShift: 0.11,         // m pelvis shift toward the pressed end (ollie / nollie / butter)
    pressPitch: 0.16,         // rad board flex / nose-lift while pressing
    popSnap: 0.38,            // rad the free end snaps up at an ollie / nollie, settling in ~0.3 s
    airTuck: 0.18,            // m board pulled up toward the hips in the air
    grabTuck: 0.3,            // m extra pull-up while grabbing
    handDragEdge: [0.72, 0.95],   // rad visual edge angle range over which the inside hand reaches the snow
  },
};

// ------------------------------------------------------------------ CameraController
export const CAMERA = {
  baseFov: 66,
  // First person (helmet cam, fpview.js): vertical FoV (deg) of the wide helmet-cam lens, the extra at
  // top speed, and the extra while rotating fast (deg at 2π rad/s). The only source for these values.
  fpFov: 74,
  fpFovBonus: 10,
  fpSpinFov: 5,
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
  // High-speed feel (off by default; big-mountain maps turn them on through course.camera):
  fovCurve: 1,                // FoV bonus = maxFovBonus · speedRatio^fovCurve (> 1 = the lens opens in the top of the range)
  speedShake: 0,              // continuous shake (trauma units) at top speed on the snow …
  speedShakeFrom: 0.7,        // … starting at this speed ratio
  heightAtSpeed: 0,           // extra camera height (m) at top speed
  steepLift: 0,               // extra height (m) per 10° of slope beyond 30° (see the rollover on steep faces)
  steepPitch: 0,              // extra downward pitch (deg) per 10° beyond 30°
  flowFov: 0,                 // FoV kick (deg) entering the flow state (physics/flow.js), half of it held while it lasts
  airLook: 0,                 // in big air, look this share further down toward the landing (0..1)
  airFollowY: null,           // s: vertical follow smoothing in the air (null = followSmooth · 1.8)
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

// ------------------------------------------------------------------ Per-map tuning hook
// A Course-compatible object may carry
//   physics = { common?: {...}, ski?: {...}, snowboard?: {...} }   → PHYSICS / PHYSICS.ski / PHYSICS.snowboard
//   camera  = {...}                                                → CAMERA
// applyMapTuning(course) first restores every value to the defaults above, then applies the map's
// overrides, so loading another map always starts clean. Values are written into the existing
// objects (the physics modules hold references to PHYSICS.ski / .snowboard), nested plain objects
// merge, arrays and scalars replace. Unknown keys are allowed (new map-only tunables).
const DEFAULTS = { PHYSICS: deepClone(PHYSICS), CAMERA: deepClone(CAMERA) };
export let mapTuning = null;     // the overrides currently applied (null = defaults)

export function applyMapTuning(course) {
  restore(PHYSICS, DEFAULTS.PHYSICS);
  restore(CAMERA, DEFAULTS.CAMERA);
  const ph = course?.physics, cam = course?.camera;
  if (ph?.common) merge(PHYSICS, ph.common);
  if (ph?.ski) merge(PHYSICS.ski, ph.ski);
  if (ph?.snowboard) merge(PHYSICS.snowboard, ph.snowboard);
  if (cam) merge(CAMERA, cam);
  mapTuning = ph || cam ? { physics: ph || null, camera: cam || null } : null;
  return mapTuning;
}

function deepClone(o) {
  if (Array.isArray(o)) return o.map(deepClone);
  if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, deepClone(v)]));
  return o;
}
function isPlain(o) { return o && typeof o === 'object' && !Array.isArray(o); }
function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (isPlain(v) && isPlain(dst[k])) merge(dst[k], v);
    else dst[k] = deepClone(v);
  }
}
/** Put `dst` back to `def` in place: same nested objects, default values, map-only keys removed. */
function restore(dst, def) {
  for (const k of Object.keys(dst)) if (!(k in def)) delete dst[k];
  for (const [k, v] of Object.entries(def)) {
    if (isPlain(v) && isPlain(dst[k])) restore(dst[k], v);
    else dst[k] = deepClone(v);
  }
}

// ------------------------------------------------------------------ HUD
export const HUD = {
  speedMilestones: [20, 35, 50],      // km/h — the speed readout bounces when crossing these
  windStreakFrom: 0.92,               // speed ratio where corner wind streaks start
  windStreakFull: 1.0,
};
