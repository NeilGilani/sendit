// Voltage Park's per-map tuning, applied over config.js when the map loads (reset when another map loads):
// applyMapTuning() in config.js, docs/map4.md §5. Targets (docs/map4-research.md §8): rails at 6–10 m/s,
// take-offs at 19–24 m/s on the big tables (70–85 km/h; 23–26 off Megawatt and the Tower), hard groomed snow, landings judged on the hit into the
// slope (EFH = v⊥² / 2g: under ~1 m clean, ~4 m a stumble, ~10 m a crash).
export const VOLTAGE_PHYSICS = {
  common: {
    trickStyle: true,             // tweaked grabs, Tail grab / Truck driver on skis
    flow: { enabled: true, summary: false, speedFrom: 22, chainWindow: 3.6, fill: { trick: 0.14, perPoint: 0.0005, perfect: 0.12, dropPerM: 0.004, nearMiss: 0.03, speedPerS: 0.02, carve: 0.02 } },
    airSettleAngle: 100,          // out of a boardslide / a skid: the gear squares up to the path in the air
    microHop: 0.1,                // skimming a roller is not a landing
    obstacleHeights: true,        // fly over the crowd fences, not into them
    // Shaped transitions (kickers, quarterpipes, the pipe) are smooth curves, not bumps: following them costs
    // no speed up to ~1.4 m/s of turn per step (R ≥ 6 m at 22 m/s); only real steps in the snow do.
    smoothFollow: 1.4,
    terrainImpactLoss: 0.3,
    // Hard pack: no powder to soak up a bad landing. Clean ≤ 9 m/s into the slope (EFH ≈ 4 m), crash > 14 (≈ 10 m).
    powderDepth: 0.05,
    hardLanding: 9,
    crashImpact: 14,
    landYawSpeed: [16, 26, 0.85],
    stumbleTime: 0.8,
    // A touch of apex slow motion off the biggest airs only (Megawatt, the Tower, the Gap: 3 s and more, high
    // over the snow); the tables run in real time.
    slowmo: { minAir: 3.0, minDrop: 8, scale: 0.72, easeIn: 0.2, hold: 0.3, easeOut: 0.35, cooldown: 4 },
    windRoar: 1,
    grind: {},                    // physics/grind.js GRIND_DEFAULTS overrides (none: the defaults are tuned here)
    wallAlign: true,              // pipe / quarterpipe walls: the gear tracks its path up the wall (physics/edge.js)
    landRedirect: 30,             // a spine transfer / hip landed lined up with the flight: the gear pivots into the face's line
  },
  ski: {
    maxVelocity: 27,              // soft cap: the jump line is ridden at 19–26 m/s
    popMin: 2.1, popMax: 3.9,
    landClean: 17, landStumble: 32, landCrash: 40,
  },
  snowboard: {
    maxVelocity: 26,
    dragUpright: 0.0128, dragTuck: 0.0060,   // a low, compact park crouch: boards carry speed into the big take-offs like skis do
    popMin: 2.4, popMax: 4.3,
    landClean: 17, landStumble: 46,
  },
};

export const VOLTAGE_CAMERA = {
  maxFovBonus: 16, fovCurve: 1.7,              // the lens opens hard in the top of the speed range (60–90 km/h)
  airLook: 0.2, airFollowY: 0.1,
  flowFov: 8,
  landTrauma: 0.05,
};
