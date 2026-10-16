# Map 3 (Ravenspire) — research: Steep, SSX, Riders Republic, Shredders and real big-mountain freeride

Written sources only (reviews, guides, interviews, papers, competition rules), paraphrased. Each number is tagged
**[src]** (a source states it), **[calc]** (physics from sourced formulas) or **[proposal]** (design suggestion).
The last section lists what Ravenspire actually adopted and where it lives in code; docs/map3.md has the details.

## 1. Steep (Ubisoft Annecy, 2016)

### Key findings
- **Hand-built faces inside a procedural mountain.** Game director Arnaud Ragot: overall mountain shape is realistic,
  but each run is authored by designers to be fun, not realistic; landmarks (Mont Blanc) hand-shaped, the rest
  generated procedurally from rules. The same tools build free-rides and challenges, so any ridden trail can become
  a challenge; memorable playtest feats were turned into challenges. Designers scouted "a good challenge on each face".
  (GamesBeat, "How Ubisoft built a virtual mountain…" https://gamesbeat.com/how-ubisoft-built-a-mountain-and-then-created-a-video-game-around-it/)
- **No helicopter, on purpose.** Ubisoft left helicopters out to keep focus on the sports (said it's not that fun).
  Access is via drop zones (fast travel) unlocked by reaching them or spotting them through binoculars; players can
  switch sport mid-run (wingsuit → land → skis). (GamesBeat, above; Easy Allies review https://easyallies.com/review/steep)
- **Scale.** Community guide: base game = two ~25 km² environments (Alps, Alaska), Alps split into named regions
  (Aravis, Tyrol, Aiguilles, Mont Blanc, …). Treat as approximate. (r/Steep "Welcome to Steep" guide)
- **Drops are big; landing forgiving, impacts harsh.** Preview reports vertical drops of 30–50 m+ as normal play;
  an on-screen G-force meter hit ~200 G; hard terrain contact = knockout + respawn. A "60 m Monstrous Jump" is a
  listed freeride goal, alongside "Long Ride No Crash" and "5000 Freeride Points in 1 Ride".
  (TheSixthAxis preview https://www.thesixthaxis.com/2016/11/09/exploring-steeps-snow-covered-mountaintops-and-extreme-vertical-drops/ ; Supercheats guide https://www.supercheats.com/ps4/steep.htm)
- **Mountain Stories** = story-driven challenges with calm voiceover (the mountain "speaking") plus a gruff radio
  director; Bronze/Silver/Gold medals with rising thresholds feed XP and gear unlocks. Event types: point-to-point
  races, "Bone Collector" (crash-for-points), checkpoint and score challenges. (TheSixthAxis; Ubisoft beta news
  https://news.ubisoft.com/en-us/article/5XmklZKVMIAbT95wqJugk9/steep-beta-begins-november-10-open-beta-november-18)
- **Map-as-line-tool.** Seamless pan/zoom 3D map shows your ridden trails coloured with where you scored; from any
  point on a past line you can respawn, replay, or publish it as a challenge. (TheSixthAxis)
- **Tricks/landing rules.** Charge jump (hold trigger), release at lip (blue marker on some kickers); left stick spins
  /flips (hold longer = more rotation); each trigger grabs with one hand. No landing = no points; board must be level
  with the slope; landing on flat usually fails; release the spin well before touchdown; over/under-rotation =
  crash or low score. "Trick Safety" option ON by default blocks tricks you can't land. Variety in one air = big
  multiplier; repeats penalised. (Twinfinite guides https://twinfinite.net/guides/steep-how-to-land/ ; Red Bull tips
  https://www.redbull.com/us-en/steep-tips-and-hints-red-bull-games ; ludo.guide advanced trick system)
- **Speed / powder feel praised.** Reviewers single out a "tunnel vision"-inducing sense of speed and smooth carving in
  powder; GoPro first-person mode with head-cam shake and lens rattle sound called the most intense speed feel —
  but shake caused headaches, players asked for an off switch. (CGMagazine https://www.cgmagonline.com/review/game/steep-ps4-review/ ;
  Fandom hands-on; Steam discussions)
- **Complaints (useful anti-targets).**
  - Camera sits directly behind rider → can't read hostile terrain ahead; re-aiming needs a held button; right stick
    is used for fine body corrections instead of camera. (Easy Allies)
  - Crash thresholds feel arbitrary: tumbling a rocky canyon is survivable, scraping ice knocks you out; even
    well-aligned landings fail when the drop is "too far", which undercuts the big-air fantasy. (Easy Allies)
  - Snagging on chalets/rocks with no control; Ubisoft admitted bad level design in Aravis villages and planned
    physics + behaviour fixes to let you stop and climb out. (Game Informer "The Sports Desk", Jan 2017
    https://gameinformer.com/b/features/archive/2017/01/16/the-sports-desk-how-ubisoft-plans-to-improve-steep)
  - Invisible obstacles, stuttery ragdoll; rewind only in free-roam, not in contests. (TrueAchievements
    https://www.trueachievements.com/n26002/steep-review)
  - "Snow is the same everywhere" — every jump/glade/village is deep powder, so areas look different but ride the same.
    (CogConnected https://cogconnected.com/review/steep-review/)
  - Mountains under-detailed: narrow palette of snow/ice/rock, empty villages. (Easy Allies)

### Design / feel targets for our map
- Author 4–6 **named faces**, each with 2–3 distinct lines (cliff line, spine line, couloir line) inside a
  procedural base terrain — Steep's "hand-made runs, procedural mountain" split. **[proposal]**
- Spawn by **drop-in points** on ridges (no heli). Optional "spot it with binoculars" to unlock a new drop. **[proposal]**
- Make crash rules **legible**: one rule (normal impact speed + board/slope misalignment, see §6), surfaced by a
  landing-grade popup. Never knock out on low-speed scrapes; rock contact above ~10 m/s only. **[proposal]**
- Camera: sit **higher and further back on steep faces** (look-ahead pitch down 10–15°), so the rider sees the
  rollover; avoid Steep's tight behind-the-back framing. **[proposal]**
- Vary snow: wind-packed/ice on ridges (fast, low grip), powder in bowls (slower, forgiving landings), crud below
  cliffs. Fixes the "same snow everywhere" complaint. **[proposal]**
- Ghost-trail of your last run on the map/minimap, coloured by score, with "respawn here". **[proposal]**
- Offer a camera-shake intensity slider (default 50%), per Steep GoPro feedback. **[src-informed]**

---

## 2. SSX (2012) and SSX Tricky (2001)

### Key findings
- **Tricks → boost → speed loop.** Every landed trick fills the boost meter; boost is ground-only. In races, ground is
  faster than air, so tricks are a trade-off. (Wikipedia SSX 2012 https://en.wikipedia.org/wiki/SSX_(2012_video_game) ;
  Speed Demos Archive https://kb.speeddemosarchive.com/SSX_(2012))
- **Tricky / Super Tricky.** Full meter → "Tricky": unlimited boost, tricks become Über tricks. Enough Übers → "Super
  Tricky" (Super Übers, longer unlimited boost, refreshed by continued tricking). Tricky decays if you stop tricking;
  after expiry you keep a small slice of boost to chain into the next. Cap = Super Tricky. Visual cue: HUD word turns
  orange, rider trails orange streaks. (Wikipedia; SDA; TrueAchievements)
- **SSX Tricky (2001):** "TRICKY" letters on the meter — light all 6 letters for infinite max boost unaffected by
  wipeouts; Run-DMC "It's Tricky" kicks in when the meter fills = audio cue that Übers are available; music tempo
  reacts to play and adds scratches after strong trick strings. (GamesRadar/everygamegoing, DVD Fever, NWR reviews)
- **Combo & multiplier.** Tricks accumulate into a combo that is multiplied on cash-in and lost on bail; 2012 guide:
  push the flow multiplier to **x20** and hold it the whole run; grinds raise it fastest (hold ~1 s each). Fan data:
  two-button grabs ≈ **1.5x** basic points, signature tricks ≈ **1.75–2x**, proportionally longer to finish. Repeats =
  duplicates and can drop Tricky. (TrueAchievements walkthrough; SDA)
- **Rewind** costs trick points and time. (Wikipedia)
- **Speed feel:** breakneck pace (Destructoid https://destructoid.com/reviews/review-ssx); a heavy boost screen effect
  (blur/vignette covering ~25% of the screen per one forum reviewer) gives a "rush" but can obscure the line.
  Announcer, crunchy snow audio, and rival taunts add urgency. (Home Theater Forum; NWR)
- **Deadly Descents (2012)**, trial-and-error survival runs (low visibility, wingsuit gaps) were criticised as
  not feeling like SSX. (Game Informer SSX review)

### Design / feel targets for our map
- **Flow meter**: landed trick +8–15% meter; clean landing +5% bonus; full meter = "Flow state" 8–10 s of max boost
  /speed cap +10%, extended +1.5 s per landed trick, decays after 3 s of no tricks. **[proposal, SSX-shaped]**
- Combo multiplier ladder **x1 → x5** (freeride) — cash on clean landing, lose on crash; variety bonus 1.25x, repeat
  penalty 0.5x within 10 s. Grab/hold tricks 1.5x, inverted 1.75x. **[proposal, SSX ratios]**
- Audio cue on meter full (music stem / filter opens) — SSX proved an audio signal beats a HUD flash. **[src-informed]**
- Keep boost VFX modest (vignette ≤ 15% of screen edge) so line reading survives. **[proposal]**

---

## 3. Riders Republic (2021) and Shredders (FoamPunch, 2022)

### Key findings
- **Riders Republic landing modes.** Auto-landing default: game corrects the rider so it's hard to fail, but grants
  no landing bonus. Manual: player aligns board/skis with the landing slope; graded **Bad / Medium / Perfect**, each
  adding points; better alignment = bigger bonus. PvP disables auto. (Digital Trends; Twinfinite
  https://twinfinite.net/guides/riders-republic-auto-manual-landing-assist/ ; Ubisoft FAQ
  https://www.ubisoft.com/en-au/game/riders-republic/news-updates/2HFvoOtBvWRtrlXOF8ZXjo/answering-your-riders-republic-questions)
- RR tricks: two face buttons; rotation amount = how long you hold; under-rotate = bail. Reviewers call snow handling
  "arcadey"; ground collision spotty; manual landing tutorialisation was unclear at preview. (PC Gamer, Wccftech,
  GameRevolution preview)
- **Shredders = momentum sim.** Left stick = lower body, right stick = upper body; spins must be wound up (pre-loaded)
  before the lip and charged together with the jump (RT), then landing prepared (LT). Fresh/soft snow is more
  slippery and easier to wipe out in; momentum management is the core skill; rewind available.
  (Xbox Hub https://www.thexboxhub.com/shredders-review/ ; Windows Central https://windowscentral.com/shredders-xbox-review ;
  Wikipedia https://en.wikipedia.org/wiki/Shredders_(video_game) ; TheGamer)
- Shredders reception: Metacritic 72 (PC) / 66 (XSX); praised controls/physics ("easy to learn, hard to master"),
  criticised for no trick list and steep dexterity demand (simultaneous charge + stick + reposition) that makes casual
  players crash a lot. (Wikipedia; Common Sense Media)

### Design / feel targets for our map
- Landing grade by **misalignment angle** between board long-axis/normal and slope (yaw + pitch + roll combined):
  **Perfect ≤ 12°, Good ≤ 25°, Sloppy ≤ 40°, Crash > 40°** (powder widens each band by +5°). Bonus: Perfect +50%,
  Good +20%, Sloppy 0% & lose combo multiplier. **[proposal, RR-style 3 grades]**
- **Assist ON by default**: auto-rotate the last ≤ 20° in the final 0.25 s before touchdown, cap grade at "Good".
  Manual unlocks Perfect. **[proposal from RR model]**
- **Pop**: charge-and-release on the jump key; release window "perfect pop" = last 0.12 s before lip → +25% pop
  height; charge 0.3–0.6 s for full pop. Allow spin pre-wind while charging (Shredders) but keep it optional.
  **[proposal]**
- Spin rate target: ~360°/0.6–0.8 s at full input so a 1.2 s air allows a 540–720. **[proposal]**

---

## 4. Amped series and Shaun White Snowboarding

### Key findings
- **Amped 1/2 "media points":** photographers/filmers scattered over the mountain; tricks performed in their view
  earn a separate media score per mountain. Amped 2 leaned realism; terrain parks designed by park builder Chris
  Gunnarson. (Wikipedia https://en.wikipedia.org/wiki/Amped_2 ; TweakTown review)
- **Amped 3 (2005):** freeform map, start from any lift point; Game Informer later credited it with much larger maps
  and better challenges than Shaun White. (Pocket-lint; Game Informer SWS review)
- **Shaun White Snowboarding (2009):** ride-anywhere mountains with events to drop in/out of; criticised as "going
  around in circles"; one reviewer: exciting linear courses beat "poorly mapped white expanses". Co-op players drifted
  off to explore unridden sections — exploration itself was the hook. (Game Informer; bit-tech; Co-Optimus)
- Common pop-in complaints in open mountains (Amped 3). (OSFTW)

### Design / feel targets for our map
- **Photographer/filmer spots**: 6–10 camera crews at signature features (big cliff, spine wall, couloir exit); airs
  in their frustum score 1.5x and auto-save a replay clip. Gives open terrain authored "stages". **[proposal]**
- Avoid "white expanses": every 150–250 m of descent along a line should present a decision or feature (cliff band,
  spine field, choke, pillow stack, tree island). **[proposal]**
- Open map but **curated fall-lines**: terrain naturally funnels into 4–6 strong lines rather than a uniform slope.

---

## 5. Real big-mountain freeride

### Key findings — venues
| Venue | Vertical | Steepness | Notes |
|---|---|---|---|
| Bec des Rosses, Verbier (Xtreme Verbier) | ~600 m (FWT 607 m), summit 3,223 m | avg ~43–45°, sections 50–51° (FWT), 55–60° on main lines (Wikipedia) | cliffs, couloirs, exposure; FWT final |
| Wildseeloder, Fieberbrunn | 583 m (FWT) / 610–620 m | avg 48° (FWT), up to 70° locally (tourism) | steep chutes, exposed cliffs; ~40 min hike up |
| Ozone face, Kicking Horse | 324 m | up to 44° (FWT), "50+° fall lines" (TGR) | huge cliffs, trickable features |
| Ordino Arcalís | n/a | steep, "sharky", shallow snowpack | north-facing, rocky |
| Haines, Alaska | 740 m | — | spines, long endurance run |
Sources: Wikipedia Bec des Rosses https://en.wikipedia.org/wiki/Bec_des_Rosses ; FWT event pages
(https://www.freerideworldtour.com/events/2026-yeti-xtreme-verbier/ , https://www.freerideworldtour.com/events/2024-fieberbrunn-pro/ ,
https://freerideworldtour.com/events/2025-kicking-horse-golden-bc-pro); Teton Gravity Research; Mountainwatch; Freeskier.

- **Judging (FWT):** single overall-impression score 0–100 from 5 criteria — **Line** (difficulty, exposure,
  originality), **Fluidity** (no hesitation, no long traverses, speed relative to terrain), **Control** (falls and
  recoveries cost heavily; reckless risk penalised), **Technique**, **Air & Style**. Averaging replaced summing so
  air-spam doesn't beat a technical line. (https://freerideworldtour.com/judging ; Crosscall/Laurent Besse
  https://www.crosscall.com/en_GB/blog/comment-juge-t-on-ligne-freeride-world-tour.html ; TGR
  https://www.tetongravity.com/what-goes-into-a-freeride-world-tour-score)
- **Record drops:** Jamie Pierre 255 ft (~78 m) intentional, Grand Targhee 2006; Fred Syversen ~107 m (351–352 ft)
  accidental, 2008, at ~50 mph. Competition cliffs are typically far smaller (no measured FWT heights found; video
  convention puts most competition airs at roughly 5–20 m — **unverified**). (Wikipedia Jamie Pierre; Unofficial Networks)
- **Speeds:** Jérémie Heitz's steep skiing described at >60 mph (~97 km/h); one report >120 km/h at Verbier. His
  style: few big GS arcs down the fall line instead of hop turns (one turn where others make eight).
  (The Ski Journal https://theskijournal.com/blogs/exclusives/jeremie-heitz ; Le News)
  No published FWT GPS speed data found.
- **Landing technique:** pros prefer **steep** landings ("catches you"); flat landings = injuries. Flatter landing
  needs more forward speed; too much speed into a steep landing = overshoot or unmanageable speed. Riders drop
  further than the cliff face because of forward speed and descending slope. Don't lean back (Terje Haakonsen) /
  slight back-foot weight to avoid nosing under in powder (Whitelines); let the snow compress rather than over-flex.
  Need **≥ ~30 cm (1 ft) of powder** in the landing. Novice skier error: speed-checking before the lip and falling
  straight down. (Whitelines https://whitelines.com/snowboarding-advice/backcountry/powder-basics-james-stentiford-drop-cliffs.html ;
  Red Bull Reine Barkered tips https://www.redbull.com/se-en/Reine-Barkered-tips-for-stomping-cliffs-snow ; SkiTalk)

### Design / feel targets for our map
- **Main face:** 450–650 m vertical, average 40–45°, steepest panels 50–55° (visual "no-fall zone"), runout apron
  25–30°. Secondary faces 30–38° for learning. **[src-derived]**
- **Cliff bands:** 4 m / 8 m / 12 m / 20 m standard sizes, one hero cliff 30–35 m (Steep-style showpiece),
  plus a 60 m+ "legend" huck that is only survivable on a perfectly steep, deep landing. **[proposal]**
- Landing zones below cliffs: **35–45°**, deep powder (render ≥ 30 cm sink), 15–30 m long before a runout. **[src-derived]**
- **Spines:** 4–10 m tall, 30–60 m long, 45–55° flanks, sluff channels between; **couloirs:** 4–12 m wide, 40–50°,
  rock walls, choke at the top; **pillow lines:** 5–9 pillows, 1.5–4 m drops each, 2–4 m spacing. **[proposal]**
- Target rider speeds: cruising 50–70 km/h (14–19 m/s), straight-line max 100–110 km/h (28–31 m/s). **[src-derived]**
- Score a run FWT-style: Line / Fluidity / Control / Air & Style each 0–25 → 0–100; penalise traverses (> 3 s
  moving across the fall-line), stops (> 1.5 s under 3 m/s), and falls. **[proposal from FWT criteria]**

---

## 6. Physics of landing on a slope (EFH)

### Key findings
- **Equivalent Fall Height:** EFH = v⊥² / (2g), where v⊥ is the velocity component perpendicular (normal) to the
  landing surface at touchdown. Injury risk correlates with v⊥/EFH; the tangential component is kept as speed.
  (Petrone, Cognolato, McNeil, Hubbard 2016, arXiv:1611.04448 https://ar5iv.labs.arxiv.org/html/1611.04448 ; Levy,
  Hubbard, McNeil, Swedberg 2015, Sports Engineering "A design rationale for safer terrain park jumps that limit EFH")
- **Numbers from the literature:**
  - Their constant-EFH test jump: designed **EFH 0.5 m**, measured 0.33–0.65 m; 14 m long, 10° takeoff, 17° parent
    slope, landing < 30°. (Petrone et al.)
  - Elite triple-cork example: landing energy ≈ 16 m total, of which only **1.2 m normal** vs 14.8 m tangential. (Petrone et al.)
  - Max normal component legs can absorb ≈ **1.5 m EFH** (≈ 5.4 m/s), attributed to Minetti et al. (Petrone et al.)
  - Swiss Council for Accident Prevention recommends **EFH < 1.5 m** for basic-skill park jumps. (Moore, Cloud,
    Hubbard, Brown 2021 preprint, engrxiv)
  - Olympic ski jump hills: equivalent landing height ≈ **0.5–0.8 m** (normal impact < 4 m/s on a 200 m jump).
  - Severe spinal cord injuries documented at landings with **EFH 3–10 m**. (Petrone et al.)
  - NASA ski-jump model: hitting a 37° slope at 20.5 m/s on a 69° flight path → ~11 m/s normal (absorbed) and
    ~17 m/s (≈63 km/h) carried tangentially. (NASA PUMAS https://pumas.nasa.gov/files/05_10_99_1.doc)
- **Formula for a cliff drop** **[calc]**: with takeoff horizontal speed u, landing slope angle θ, vertical speed at
  touchdown v_y:  **v⊥ = v_y·cosθ − u·sinθ**,  EFH = v⊥²/(2g).  Straight drop (u≈0) of height H landing at the
  base: **EFH = H·cos²θ** → 10 m cliff: flat 10 m, 35° 6.7 m, 45° 5.0 m, 55° 3.3 m.
  Worked example: 10 m cliff, 38° landing slope starting at its base, u = 10 m/s → air 2.43 s, falls ~29 m total,
  v_y 23.9 m/s, v⊥ 12.6 m/s (EFH 8.1 m), tangential ~24 m/s. Pros survive this only because deep powder + legs give
  ~1 m+ of stopping distance (a = v⊥²/2d ≈ 80 m/s² ≈ 8 g for d = 1 m).
- Hang times (straight free-fall, flat): 5 m 1.0 s, 10 m 1.43 s, 20 m 2.0 s, 30 m 2.47 s. On a descending slope
  real air time is longer (example above: 2.4 s off 10 m). **[calc]**

### Design / feel targets for our map
- Use **v⊥ (normal speed)** as the single impact metric, plus misalignment angle (§3). **[src-based]**
  - v⊥ ≤ **6 m/s** (EFH ≤ 1.8 m): clean, no penalty — matches real-world "legs absorb it" limit.
  - 6–10 m/s: compression animation, small speed loss (5–15%), camera dip; still "Good".
  - 10–14 m/s: "Sloppy/heavy" — big compression, 25–40% speed loss, wobble, combo lost; powder only.
  - > 14 m/s (EFH ≈ 10 m) on powder, > 10 m/s on hardpack/ice, > 7 m/s on rock: **crash**.
  - Powder bonus: +3 m/s to each threshold; flat (< 15°) landings: −2 m/s. **[proposal, gamified ×~2 over reality]**
- Keep tangential speed after landing (minus friction), so big airs to steep landings feel **fast, not punishing**.
- Hero landings designed so the expected trajectory meets the slope at ≤ 20–25° → v⊥ ≈ 0.35–0.42·|v|. **[calc]**
- HUD/debug: show v⊥ and EFH on landing in dev mode for tuning. **[proposal]**

---

## 7. Game feel at high speed

### Key findings
- **FOV vs speed.** MotoGP (Shawn Hargreaves): FOV fixed below 100 mph, then widened gradually to nearly **double**
  at top speed; linking FOV to **acceleration** gives a "lurch" ideal for boosts. Base FOV ~90° (horizontal) typical.
  (https://www.shawnhargreaves.com/blog/speed-is-a-matter-of-perspective.html)
- SuperTuxKart implementation: **+8° max**, kicks in above **70%** of max speed, lerp-smoothed; stronger during boost.
  (SuperTuxKart forum https://forum.supertuxkart.net/thread-200.html)
- **Study (Holm, Skovhus, Kraus, Aalborg 2017, ArtsIT):** wider geometric FOV significantly raises perceived speed;
  strong motion blur *lowers* perceived speed; higher camera altitude at high speed raised perceived speed.
  (https://vbn.aau.dk/da/publications/increasing-the-perceived-camera-velocity-in-3d-racing-games-throu)
- **Optic flow / clutter:** speed is sold by things rushing past near the camera — trees, poles, low overhead objects;
  contrast with slow distant objects; coarse, varied ground texture (tree shadows, patches) beats fine repeating
  texture; MotoGP felt faster after adding detail even with slower bikes. (Hargreaves "Vrrroom whoosh"
  https://www.shawnhargreaves.com/blog/vrrroom-whoosh.html)
- Camera distance/scale: closer camera and objects at rider scale feel faster (Katamari example); speedlines at screen
  edge, trails, sparks; tight input→response correlation makes speed feel earned; FOV alone (Minecraft sprint) does
  little without real acceleration. (Critical Points https://critpoints.net/2016/11/24/feeling-of-speed/)
- **Boost layering (Motorstorm):** camera pulls back first (acceleration), then screen shake + depth of field.
  Criterion (Hot Pursuit 2010) uses a subtle dolly-zoom of only a few degrees. (Speed Freeks feedback board; BeamNG forum)
- **Shake:** drive one shake from a continuous speed value via a curve (0 at rest) instead of discrete presets.
  (StraySpark blog https://www.strayspark.studio/blog/data-driven-camera-shake-reacts-to-gameplay)
- **Wind audio:** noise → low-pass (light resonance), sweep cutoff for gusts; map cutoff to wind speed (higher speed
  = higher cutoff). (KVR forum; JSyn wind example; Wwise procedural wind)
- **Slow-mo:** no written source confirmed slow-mo in Steep or Riders Republic; not verified. Steep's replay editor and
  SSX's Tricky audio swap are the documented "big moment" tools.
- Motion sickness: shake and wide FOV both cause complaints (Steep GoPro); offer sliders. (Game Accessibility
  Guidelines https://gameaccessibilityguidelines.com)

### Design / feel targets for our map (Three.js, vertical FOV)
- **FOV:** base 62° vFOV; ramp from 55% → 100% of top speed adds **+10°** (to 72°); boost/flow adds +4° kick over
  0.15 s, eases out 0.6 s; acceleration term ±3°. Hard cap 78°. **[proposal from MotoGP/STK]**
- **Camera rig:** distance 4.5 m at rest → 6.0 m at top speed; height 1.8 m → 2.4 m; look-ahead target 6–12 m down
  the fall line; on slopes > 40° pitch camera down an extra 8–12°. Lag: position spring ~6 Hz, rotation ~4 Hz. **[proposal]**
- **Shake:** Perlin, amplitude 0 below 40 km/h → 0.6° rot / 2 cm at 100 km/h; landing impulse scaled by v⊥
  (0.5° per m/s above 4 m/s, cap 4°, decay 0.25 s). User slider. **[proposal]**
- **Speed lines/snow streaks**: spawn above 60 km/h, density ∝ (v−60)/40; edge-only (outer 30% of screen). Keep
  motion blur light or off (study says strong blur reduces perceived speed). **[src-informed]**
- **Wind audio:** pink/white noise, LPF cutoff 300 Hz at 10 km/h → 6 kHz at 110 km/h (exponential map), Q ≈ 1.5,
  gain −30 dB → −6 dB; pan/gust LFO 0.2–0.5 Hz; airborne: drop board-scrape layer, raise wind 3 dB. Duck music
  −4 dB above 90 km/h. **[proposal]**
- **Slow-mo (optional):** only when predicted air > 1.6 s and a photographer spot or hero cliff: time-scale 0.6 for
  0.35 s at apex, then ramp back over 0.25 s; never on landing (players need real-time control). **[proposal]**
- **Rumble/haptics** (gamepad API): continuous 0.1–0.3 by snow type and speed; landing pulse strength ∝ v⊥. **[proposal]**
- Optic flow dressing: tree islands/rock bands within 5–15 m of main lines; prayer flags/marker poles on ridges;
  coarse snow normal-map variation every 20–40 m. **[src-informed]**

---

## Top takeaways
1. Steep's formula: procedural mountain + hand-authored lines per face; any line can be a challenge.
2. No helicopter — ridge drop-in points (+ binocular unlocks) create freedom and isolation.
3. Make crashes legible: one rule = normal impact speed v⊥ + misalignment angle; Steep was faulted for arbitrariness.
4. EFH = v⊥²/2g; straight drop onto slope θ gives EFH = H·cos²θ — steep landings are the whole trick.
5. Real limits: legs absorb ~1.5 m EFH (~5.4 m/s); injuries at 3–10 m EFH. Game: clean ≤ 6, crash > 14 m/s in powder.
6. Keep tangential speed after big airs so hucking feels fast, not punishing.
7. Main face: 450–650 m vertical, 40–45° average, 50–55° panels, 35–45° landings, deep powder ≥ 30 cm.
8. Cliffs 4/8/12/20 m standard, one 30–35 m hero, one 60 m+ legend huck.
9. Landing grades Perfect ≤ 12° / Good ≤ 25° / Sloppy ≤ 40°; assist ON by default but capped at Good (RR model).
10. SSX loop: tricks fill a meter → flow/boost state, combo multiplier cashed on clean landing, lost on crash.
11. Score runs FWT-style: Line, Fluidity, Control, Air & Style; penalise traverses and stops.
12. Speed feel = optic flow: objects within 5–15 m of lines, coarse varied snow texture; not heavy motion blur.
13. FOV +10° across top 45% of speed range, +4° boost kick; camera pulls back/up with speed and pitches down on steeps.
14. Wind audio LPF 300 Hz → 6 kHz with speed; an audio cue (music swap/filter open) for flow state, like SSX Tricky.
15. Vary snow (ice ridges, powder bowls, crud) and give shake/FOV sliders — Steep's two most fixable complaints.

---

## What Ravenspire adopted (and where)

| Finding | Adopted as | Code |
|---|---|---|
| Steep: hand-authored lines on a big procedural mountain; no helicopter, drop-in points | One authored face (`layout.js`: bands, spines, pillows, ravine, buttresses, hits) over a procedural massif; the run starts on a summit shoulder (heli-drop style intro, but no flying helicopter) | `maps/ravenspire/` |
| Faces 40–48° average, 35–45° landings, cliffs 4–20 m + one 30–35 m hero | Upper face 41°, Stacks 41° landings with 30° benches; bands 11–18 m, the Throne up to ~28 m, the Hammer 36 m | `layout.js`, `course.js cliff()` |
| EFH = v⊥²/2g; straight drop onto θ gives EFH = H·cos²θ; steep landings make big drops survivable | Landing impact = normal speed v⊥; deep powder absorbs part (`landPowderAbsorb`) and scrubs speed (`landPowderScrub`); stumble/crash thresholds per map | `player.js land()`, `tuning.js` |
| Riders snag on chalets in Steep | Walls deflect: glancing hits slide along the wall, only square hits at > 9 m/s knock you down | `player.js hitWall()` |
| Crashes must be legible | One rule set: v⊥ after powder, yaw/pitch misalignment with a speed-scaled tolerance, compression on the ground | `player.js`, `physics/*.js land()` |
| SSX: tricks fill a meter → Tricky state; combo multiplier cashed on landing, lost on bail | Flow meter → "SEND IT" flow state; line combo multiplier (see docs/map3.md) | `physics/flow.js` |
| RR: graded landings (Perfect / Good / Sloppy) | Landing grade from misalignment + impact | `player.js land()` |
| Speed feel: FOV ramp in the top of the speed range, camera higher/further on steeps, shake from speed, wind LPF sweep | Per-map CAMERA overrides + speed-driven shake, wind roar layer | `camera.js`, `audio.js`, `tuning.js` |
| Slow-mo unverified in Steep/RR; proposal 0.6× for 0.35 s at the apex of big airs | Optional apex slow-mo for long predicted airs | `player.js` |
