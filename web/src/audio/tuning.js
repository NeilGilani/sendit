// Every audio tunable in one place (docs/audio.md explains each block and where the numbers come from).
// Levels are linear gains unless named *Db. Speeds in m/s, frequencies in Hz, times in seconds.
// The worklet DSP (worklet.js) receives SNOW / WIND as processorOptions, so edits here reach it too.

export const AUDIO = {
  // ---------------------------------------------------------------- mix (bus gains before settings volumes)
  mix: {
    snow: 0.9,            // the snow engine (worklet)
    wind: 0.8,            // rider wind (worklet)
    ambience: 0.7,        // map beds, trees, crowd
    fx: 0.85,             // one-shots: landings, whooshes, pole plants, crashes, grinds
    ui: 0.8,              // game / UI cues (gates, medals, tokens, combo)
    music: 0.85,
    glueThresholdDb: -12, glueKneeDb: 8, glueRatio: 1.6, glueAttack: 0.01, glueRelease: 0.2,   // SFX bus glue (gentle: Chrome adds make-up gain, which would lift the quiet bits)
    limiterThresholdDb: -2,   // limiter on the master (DynamicsCompressor, ratio 20, no look-ahead)…
    limiterKneeDb: 0,
    limiterRatio: 20,
    limiterAttack: 0.002,
    limiterRelease: 0.12,
    clipKnee: 0.72, clipCeil: 0.86,   // …then a tanh soft clipper (linear to 0.72, ceiling 0.86 so the 4× oversampling ripple stays under −1 dBFS) catches its overshoot
    preLimiter: 0.8,      // master trim into the limiter (headroom)
  },
  // Music ducking: big moments pull the music down so the mountain carries them (dB, attack / release s).
  duck: {
    airDb: -5, airAfter: 0.5,    // after this much airtime
    crashDb: -9, crashHold: 1.6,
    speedDb: -4, speedFrom: 18, speedFull: 30,   // wind at big-mountain speed
    grindDb: -3,
    landDb: -5,                 // short duck on hard landings (impact > 4 m/s), 0.35 s
    airLp: 1200, airLpAfter: 0.4, crashLp: 400, lpRelease: 0.5,   // music low-pass in big air / on a bail
    attack: 0.25, release: 1.6,
  },
  // First person (helmet cam) vs chase cam. fp: the rider's own ears inside the helmet.
  perspective: {
    fp: { snow: 1.0, snowLow: 1.0, wind: 1.15, buffet: 1.0, whistle: 1.0, flap: 1.0, fx: 1.0 },
    chase: { snow: 0.85, snowLow: 0.6, wind: 0.75, buffet: 0.3, whistle: 0.35, flap: 0.6, fx: 0.9 },
  },

  // ---------------------------------------------------------------- snow engine (worklet 'sendit-snow')
  snow: {
    vRef: 20,             // speed where the speed curves reach 1
    vStart: 0.4,          // below this nothing slides
    // glide hiss: pink noise band, centre rises with speed
    // (+7 dB per speed doubling ≈ v^1.15; centre ≈ 1.6 kHz · (v / 5)^0.45 — research-real.md §3)
    hiss: { gain: 0.5, hp: 300, lp: 7000, lpMax: 15000, fExp: 0.45, white: 0.12, board: 0.45, exp: 1.15, powder: 0.18, ice: 0.8, park: 1.05 },
    // groomer corduroy: fine ridges ~2.2 cm apart → a zippy AM at v / spacing on flat bases
    corduroy: { depth: 0.22, spacing: 0.022 },
    // crystal grains: Poisson clicks (fracturing snow) — the granular crunch that never loops
    grains: { rate0: 60, ratePerV: 160, rateEdge: 2.2, max: 5000, gain: 0.2, decayMin: 0.00025, decayMax: 0.0016,
      fGroomed: 2600, fIce: 4200, fPowder: 900, fCold: 1300, q: 0.55, raw: 0.08, board: 0.65 },
    // the edge "rip" of a carve: two resonant bands + board growl, wobbling slowly
    carve: { gain: 0.75, f1: 520, f2: 1700, fSpeed: 0.7, q1: 1.2, q2: 1.5, wobble: 0.12, edgeExp: 1.3, loadExp: 0.9,
      ice: 1.35, powder: 0.25, boardF: 0.5, growl: 1.2, growlF: 260 },
    // edge chatter on hard snow: irregular AM at 16–34 Hz
    chatter: { fMin: 20, fMax: 40, boardMin: 15, boardMax: 35, depth: 0.85 },   // ski / board bending modes
    // skid / slide / hockey stop: rough scrape + thrown spray
    skid: { gain: 0.95, f: 1700, fIce: 3800, q: 0.8, rough: 0.75, roughF: 45, spray: 0.4, sprayF: 2600, stop: 1.4, from: 0.08, full: 0.7 },
    // deep snow: low muffled whoosh, quieter overall, top end absorbed
    // fresh snow absorbs the highs: low-pass ≈ 600 + 40·v Hz, edge hiss −15 dB
    powder: { gain: 0.42, f0: 600, fPerV: 40, q: 0.55, hp: 110, shh: 0.9, sinkBoost: 1.6, absorbF: 2600, absorbMax: 0.85 },
    // a snowboard's wide flat base: low rumble on hardpack
    base: { gain: 0.75, f: 230 },   // the board reference (snowboard on ice) peaks at 250 Hz
    // ice: thin harsh scrape on top of everything else
    ice: { gain: 0.38, hp: 2200, bp: 3800, q: 1.0 },
    width: { ski: 0.75, board: 0.25 },   // stereo spread (two skis vs one board)
    out: 0.9,
  },

  // ---------------------------------------------------------------- wind (worklet 'sendit-wind')
  wind: {
    vMax: 32,             // airspeed for full level
    exp: 1.6,             // level ∝ (v / vMax)^exp: ~10 dB / doubling (helmets measure ~15.5; loudness grows ~U^1.7)
    floor: 0.03,          // a breath of air even when slow
    // helmet buffeting: < 150 Hz, fluttering
    buffet: { gain: 0.55, f: 110, flutterF: 7, flutterDepth: 0.7 },
    // the rush: two noise bands sweeping up with speed
    // the rush: 2-pole low-pass at 250 + 45·U Hz with a +5 dB bump at 150–400 Hz, a little pinna hiss on top
    rush: { gain: 0.42, f0: 250, fPerV: 45, q: 0.7, bump: 0.8, bumpF: 280, bumpQ: 1.1, hiGain: 0.14, hiF0: 1100, hiExp: 0.7, hiQ: 0.7 },
    // vortex-shedding whistles off helmet vents / goggle frame: f = St · v / d
    whistle: { gain: 0.05, st: 0.2, d1: 0.0042, d2: 0.0071, q: 40, from: 11 },
    // gusts: slow random level / airspeed swells
    gust: { tau: 2.2, depth: 0.35, relWind: 3.5, squall: 0.15, squallF: 3 },
    // head turns: the downwind ear is louder (up to ~±6 dB here)
    ears: { depth: 0.35, tau: 1.8 },
    // airborne: snow stops, the air takes over
    air: { boost: 1.25, rushUp: 1.15 },
    // spins and flips: ears rotate through the airflow → a whoosh per half turn
    spin: { gain: 0.6, depth: 0.75, sweep: 0.45, full: 9 },
    // jacket / pants flapping in the airflow (from ~12 m/s): AM 8–25 Hz rising with speed, 200–600 Hz band
    flap: { gain: 0.3, from: 11, full: 24, f0: 8, fPerV: 0.55, f: 380, q: 0.9 },
    // tucked: the body shields the head (lee of a windscreen measures 8–9 dB): rush −6 dB, darker
    tuck: { rush: 0.5, lp: 0.4, flap: 0.5 },
    // map ambience wind (independent of the rider): distant, over ridges
    ambient: { gain: 0.35, f: 650, q: 0.5, hiss: 0.4, hissF: 1800 },   // alpine gust reference: flat to 2 kHz
    out: 0.85,
  },

  // ---------------------------------------------------------------- one-shots
  fx: {
    poleplant: { gain: 0.32, minSpeed: 3, maxSpeed: 22, chance: 0.85, minGap: 0.55 },
    edgeChange: { gain: 0.35, minSpeed: 4, minGap: 0.35 },
    slash: { gain: 0.55, minSpeed: 6, edge: 0.6, skid: 0.12, minGap: 0.6 },
    takeoff: { gain: 0.45 },
    landing: { gain: 0.9, thump: 0.8, spray: 0.7, slap: 0.6 },
    grab: { gain: 0.28 },
    crash: { gain: 0.8 },
    nearMiss: { gain: 0.55 },
    hardBrake: { gain: 0.5 },
    grind: { gain: 0.5, sample: 0.55, scrape: 0.5, clank: 0.5 },
  },

  // ---------------------------------------------------------------- per-map ambience (by map id)
  maps: {
    default: { wind: 0.35, windF: 650, birds: 1, trees: 0, crowd: 0, cold: 0.2, gustiness: 1 },
    'valcrest-gully': { wind: 0.3, windF: 620, birds: 1, trees: 0.2, crowd: 0, cold: 0.2, gustiness: 1 },
    blackspruce: { wind: 0.28, windF: 820, birds: 0.8, trees: 1, crowd: 0, cold: 0.35, gustiness: 0.8, sough: 0.6 },
    ravenspire: { wind: 0.6, windF: 560, birds: 0.25, trees: 0, crowd: 0, cold: 0.7, gustiness: 1.6 },
    'voltage-park': { wind: 0.22, windF: 700, birds: 0.4, trees: 0, crowd: 1, cold: 0.15, gustiness: 0.7, park: 1 },
    'lake-tahoe': { wind: 0.35, windF: 680, birds: 1, trees: 0.4, crowd: 0, cold: 0.25, gustiness: 1 },
  },
  ambience: {
    creak: { gain: 0.16, every: [6, 16] },       // tree creaks (stick-slip squeal), seconds between
    crowd: { gain: 0.22, cheer: 1.6 },
    sough: { gain: 0.3 },
  },
};
