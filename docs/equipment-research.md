# Skis vs Snowboard: Physics, Technique and Game-Feel Research

This document supports tuning a Three.js skiing and snowboarding game that should feel arcade-friendly but grounded. Sources are linked inline. Where no published measurement exists (hockey-stop deceleration and ollie height are the main gaps), the value is marked **(estimate)** and the reasoning is shown so it can be checked.

Conventions: SI units. `g = 9.81 m/s²`. `α` is the slope angle, `φ` the edge angle (ski or board base relative to the snow surface), `θ` the lean or inclination angle of the body's centre of mass (CoM) from vertical, `R_sc` the sidecut radius and `R` the actual turn radius.

---

## 1. Physics

### 1.1 Sidecut geometry and carved turn radius

A carving ski or board is bent into a curve by the edge. With the base tilted at edge angle `φ` and pressed into reverse camber, the edge traces an arc of radius

```
R ≈ R_sc · cos(φ)
```

This is the standard "Howe" relation, also used in Lind and Sanders' *The Physics of Skiing*. It is derived in Jentschura and Fahrbach, "Physics of Skiing: The Ideal-Carving Equation" ([arXiv physics/0310086](https://ar5iv.labs.arxiv.org/html/physics/0310086)), which writes it as `R(Φ) = R_SC cos Φ`. Sidecut depth relates to chord length `C` as `d ≈ C²/(8·R_sc)`.

Worked values for `R = R_sc·cos φ`:

| R_sc | φ = 30° | φ = 45° | φ = 60° | φ = 70° |
|---|---|---|---|---|
| 13 m (SL ski) | 11.3 m | 9.2 m | 6.5 m | 4.4 m |
| 16 m (all-mountain) | 13.9 m | 11.3 m | 8.0 m | 5.5 m |
| 27 m (GS) | 23.4 m | 19.1 m | 13.5 m | 9.2 m |
| 8 m (snowboard) | 6.9 m | 5.7 m | 4.0 m | 2.7 m |

**Typical sidecut radii**
- Slalom skis: about 14.5 m at up to 164 cm long. Carving skis: about 16 m at 170 cm. Longer-radius skis: about 19.5 m at 180 cm. Off-piste: about 25 m ([arXiv 0310086](https://ar5iv.labs.arxiv.org/html/physics/0310086)).
- FIS GS skis: 30 m or more. Spörri et al. tested 30, 35 and 40 m GS skis and found that longer radii lower ground reaction force because the CoM turns on a larger radius ([BJSM](https://bjsm.bmj.com/content/50/1/14)).
- Snowboards: 6 to 8 m at 150 to 160 cm chord ([arXiv 0310086](https://ar5iv.labs.arxiv.org/html/physics/0310086)). A brand guide gives 6 to 10 m ([snowboardingdays](https://www.snowboardingdays.com/?p=30453)), and the Salomon Sight all-mountain board is 6.4 m ([Salomon](https://www.salomon.com/de-de/product/sight-li5362)). Some boards use a tighter sidecut on the heel side to offset weaker heel-side agility ([Whitelines, asymmetric sidecuts](https://whitelines.com/snowboard-gear/buying-guides/asymmetric-sidecuts-explained.html)).

**Edge angles**
- Recreational skiers: about 20 to 45°.
- Expert carvers and snowboarders: 60 to 80° ([arXiv 0310086](https://ar5iv.labs.arxiv.org/html/physics/0310086)).
- A former World Cup athlete measured with insoles and IMUs reached edge angles of about 64 to 68°, with outside-ski forces of about 2000 to 2300 N (Krüger et al., via [Konstanz CPA](https://ojs.ub.uni-konstanz.de/cpa/article/view/1542/1448)).

### 1.2 Lean, speed and lateral g

In a steady turn on flat ground, the CoM lean balances gravity against centripetal force:

```
tan θ = v² / (g · R)        a_lat = v² / R        total load ≈ g · sqrt(1 + (v²/gR)²)
```

Examples:

| v | R | a_lat | Lean θ | Total load |
|---|---|---|---|---|
| 10 m/s | 15 m | 6.7 m/s² (0.68 g) | 34° | 1.21 g |
| 15 m/s | 15 m | 15 m/s² (1.53 g) | 57° | 1.83 g |
| 20 m/s | 25 m | 16 m/s² (1.63 g) | 58° | 1.92 g |

Racer data matches this. In GS, mean total ground reaction force is about 1.95 body weight (outside leg about 1.31 BW, inside about 0.69 BW), and outside-leg peaks reach about 3.15 BW ([Konstanz CPA GRF study](https://ojs.ub.uni-konstanz.de/cpa/article/view/197/157)). That corresponds to roughly **1.7 g lateral sustained and about 2.5 to 3 g at peaks** for racers. Recreational carvers sit around 0.5 to 1.2 g.

**Ideal carving limit (key mechanic).** Combining `R = R_sc cos φ` with `tan θ = v²/(gR)`, and assuming the edge angle roughly equals the lean (`φ ≈ θ`) on flat ground, gives

```
v² = g · R_sc · sin φ     →     v_carve_max ≈ sqrt(g · R_sc)
```

The paper derives the same bound, `v_max = sqrt(g R_SC)`, along with a slope-dependent `v_limit = sqrt(g R_SC cos α)` ([arXiv 0310086](https://ar5iv.labs.arxiv.org/html/physics/0310086)). For `R_sc = 16 m`, `v_carve_max ≈ 12.5 m/s`. For a snowboard with `R_sc = 8 m`, it is about 8.9 m/s. The paper's worked example has `R_sc = 14 m` on a 30° slope, giving `v_max = 11.7 m/s` and `v_limit = 10.9 m/s`. It notes that World Cup speeds are well above this. Above the limit a rider cannot hold a pure sidecut arc, so they either:
- ride a longer-radius ski, or
- let the ski bend further (real skis decamber beyond the geometric radius), or
- skid or drift part of the turn.

This is a good grounded mechanic for a game. Below `v_carve_max` a full edge gives a clean carve. Above it, more edge mostly adds skid and scrubs speed.

### 1.3 Carving vs skidding

- **Carved turn.** The ski or board moves along its own length and the edge cuts a groove, so energy loss is small. Carving's "near-perfect alignment of skis with their trajectory... significantly reduces the energy dissipation" ([arXiv 1812.02539](https://ar5iv.labs.arxiv.org/html/1812.02539)). The track is a thin line. A skidded track is wide ([Leeds/White Rose carving paper](https://eprints.whiterose.ac.uk/168379/1/carving.pdf)).
- **Skidded (steered) turn.** The ski is pivoted to a **skid angle β** between its long axis and the velocity. Energy goes into "snow-ploughing and ice-scraping" ([arXiv 1812.02539](https://ar5iv.labs.arxiv.org/html/1812.02539)). Sensor studies confirm skidded turns decelerate more ([Scitepress 2018](https://scitepress.org/Papers/2018/69593/pdf/index.html)). In cross-country downhill turns, effective skidders brake early in the turn and then hold speed ([lida record](https://lida.sport-iat.de/ibu/Record/4030836)).
- **How skid develops.** Skid angle grows when the turn demands more lateral force than the edge can hold. That happens when:
  - the edge angle is too low for the required centripetal force (beginners pivot flat skis);
  - speed exceeds `v_carve_max`, so the sidecut cannot produce a tight enough arc;
  - the snow is hard or icy and the edge cannot penetrate;
  - weight is too far back, so the tips lose grip and the tails wash out.
- **Energy loss model (estimate).** No published curve of speed loss against skid angle was found. A workable model treats the side-slipping component like a plough: `a_skid ≈ μ_side · g_eff · sin β`, with `μ_side` about 0.4 to 0.7 on groomed snow. At β = 20° that is about 1.5 to 2.5 m/s². At β = 90° (hockey stop) it is about 4 to 7 m/s².

### 1.4 Snow friction

| Condition | μ (kinetic) | Source |
|---|---|---|
| Ski range, field and lab | 0.023 to 0.139 | [KIT study](https://publikationen.bibliothek.kit.edu/1000172164/153587108) |
| Snowboard range | 0.026 to 0.139 | [KIT study](https://publikationen.bibliothek.kit.edu/1000172164/153587108) |
| Dry, coarse-grained snow | about 0.06 | [KIT study](https://publikationen.bibliothek.kit.edu/1000172164/153587108) |
| Wet, fine-grained snow | about 0.10 | [KIT study](https://publikationen.bibliothek.kit.edu/1000172164/153587108) |
| Cross-country, −11 °C | 0.033 | [arXiv 2212.08524](https://www.arxiv.org/pdf/2212.08524) |
| Cross-country, 0 °C | 0.0145 | [arXiv 2212.08524](https://www.arxiv.org/pdf/2212.08524) |

Very cold snow is "sandy" and slow, because there is less meltwater lubrication ([Frontiers, meltwater](https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2021.738266/pdf)). Wet slush is also slow, because of capillary suction and ploughing. Snow near −2 to −5 °C is fastest. Skis and boards have about the same base friction.

Game values:
- Groomed: 0.04
- Cold: 0.06
- Slush: 0.10 to 0.12
- Ice: 0.03 for gliding, but lateral grip should drop sharply.

### 1.5 Air drag and terminal speed

Drag is `F_d = ½ ρ CdA v²`. Air density is about 1.2 kg/m³ at sea level and about 1.0 kg/m³ at 2000 to 2500 m.

Reported drag areas:
- **Upright.** Classic studies give frontal area 0.8 to 1.3 m² with Cd about 1.0 to 1.2. The realistic CdA for a standing recreational skier is about **0.5 to 0.8 m²** ([NTNU drag thesis](https://ntnuopen.ntnu.no/ntnu-xmlui/handle/11250/2454723)).
- **Middle or high tuck.** A wind-tunnel study measured 256 N at 30 m/s, which works out to CdA ≈ 0.45 m² ([search summary of wind-tunnel work](https://uis.brage.unit.no/uis-xmlui/handle/11250/3051286)).
- **Full tuck.** CFD gives 185.8 N at 40 m/s, so CdA ≈ **0.19 m²**. Measured tuck values range from about 0.15 to 0.25 m².
- **Posture sensitivity.** Drag area rises about 0.8% per degree of torso angle and 1.2% per degree of thigh angle. Lower legs contribute 40 to 50% of tuck drag. Open arms add 17 to 21% in a high tuck ([Elfmark, tucked positions](https://uis.brage.unit.no/uis-xmlui/handle/11250/3051286)). Poles add only 2 to 5% of frontal area ([Applied Sciences 2023](https://doaj.org/article/cb59c1d9513544e8b3e011c5fbc75646)).

Terminal speed on a slope of angle α is

```
v_t = sqrt( 2 m g (sin α − μ cos α) / (ρ CdA) )
```

For m = 80 kg, α = 25°, μ = 0.05 and ρ = 1.1:
- Upright (CdA 0.6): **v_t ≈ 30 m/s (108 km/h)**
- Tuck (CdA 0.2): **v_t ≈ 52 m/s (187 km/h)**

Real slopes are never long enough to reach these speeds, and speed skiers on 45° or steeper tracks reach 250 km/h or more. The game's 15 to 20 m/s cap therefore needs either a much larger "arcade CdA" or an explicit speed governor (see section 5).

### 1.6 Typical recreational speeds

| Study | Measured speeds |
|---|---|
| 4,164 observations at 8 US resorts ([JSAMS Plus 2023](https://doaj.org/article/2b935686ece744eca0efec1d27afabe2)) | Mean 34.9 ± 13.6 km/h. Beginners 19.9, intermediates 32.4, advanced **44.5 ± 11.7** km/h. Skiers 35.8 vs snowboarders 33.0 km/h. |
| Blue runs, 16 to 20° ([ASTM, Shealy et al.](https://store.astm.org/stp12212s.html)) | Mean 43.0 km/h. Skiers 44.5 vs snowboarders 38.9 km/h. |
| Radar gun, 1,399 riders ([Springer](https://link.springer.com/chapter/10.1007/978-3-319-52755-0_13)) | Mean 43.4 ± 15.2 km/h. |

Takeaways:
- An advanced recreational cruise is about **12 m/s**, and fast free-skiing reaches 15 to 20 m/s.
- Snowboarders average about **88 to 92% of skier speed**.
- Riders underestimate their own speed more the faster they go. A game can therefore run "realistic" speeds and still feel fast.

### 1.7 Powder float

- **Float is mostly compression, not buoyancy.** Wu et al. model powder as a compressible porous medium. At 20 m/s in wind-packed snow, trapped pore air provides about **50% of lift for a snowboard and 40% for skis**. In fresh powder the air's share falls below 20%, and compressed snow crystals carry most of the load. Contact time per patch of snow is 0.05 to 0.2 s at 10 to 30 m/s ([Lift mechanics of downhill skiing and snowboarding](https://sponet.de/sponet/Record/4011374)).
- **Speed is needed.** Faster travel gives each patch less time to compress, so the rider sinks less. Slow riders bog down.
- **Tip shape matters.** A rising, rockered tip creates an angle of attack and planes. A blunt tip ploughs ([Backcountry Magazine, rocker](https://backcountrymagazine.com/stories/lances-lab-rocker-revelations/)). Rocker shortens the running length so the tip rises ([Burton powder guide](https://www.burton.com/blogs/the-burton-blog/how-to-snowboard-in-powder)).
- **Why boards float better.**
  1. A board is one continuous platform about 25 to 30 cm wide, while each ski is about 8 to 12 cm wide.
  2. A **setback stance** (bindings 2 to 5 cm toward the tail, [Jones](https://www.jonessnowboards.com/pages/a-guide-on-how-to-find-your-snowboard-riding-stance)) and tapered powder shapes keep the nose up without leg strain ([setback guide](https://snowboardingprofiles.com/snowboard-setback-stance-whats-the-best-position-for-you)).
  3. The rider can shift weight onto the tail along the board's length. A skier can only lean back in the boots.
  
  Wide, rockered powder skis narrow this gap considerably ([powder skis](https://publiclands.com/blog/a/how-to-ski-powder)). Deep snow also drags on the legs, not only the base ([NZSIA powder](https://learning.nzsia.org/ski-interactive-manual/powder-skiing)).
- **Game rule:** use a powder drag force that grows with sink depth. Sink depth shrinks with speed and with platform area. Snowboard sink should be about half of ski sink at the same speed.

---

## 2. Snowboard technique

### 2.1 Stance

- **Regular** means the left foot leads. **Goofy** means the right foot leads. Stance does not follow handedness. A common test is to push the rider from behind and see which foot steps forward. Regular riders are often said to be about 70% of riders, but that figure is unsourced ([Wikipedia: Frontside and backside](https://en.wikipedia.org/wiki/Frontside_and_backside), [Burton](https://www.burton.com/blogs/the-burton-blog/goofy-vs-regular-official-guide-snowboard-stances-fr/)).
- **Stance width** (Jones table, [Jones stance guide](https://www.jonessnowboards.com/pages/a-guide-on-how-to-find-your-snowboard-riding-stance)):

  | Rider height | Stance width |
  |---|---|
  | 165 to 170 cm | 52 to 53.5 cm |
  | 175 to 180 cm | 54 to 56 cm |
  | 185 to 190 cm | 57 to 58.5 cm |

  For a typical adult that is about **0.53 to 0.57 m**, roughly shoulder width.
- **Binding angles** (front / back):

  | Style | Front | Back | Source |
  |---|---|---|---|
  | All-mountain | +15 to +18° | 0° | [Jones](https://www.jonessnowboards.com/pages/a-guide-on-how-to-find-your-snowboard-riding-stance) |
  | Park or switch duck | +15 to +18° | −9 to −12° | [Jones](https://www.jonessnowboards.com/pages/a-guide-on-how-to-find-your-snowboard-riding-stance) |
  | Mirrored duck | +15° | −15° | [Red Bull](https://www.redbull.com/us-en/how-to-adjust-snowboard-bindings-and-angles), [evo](https://www.evo.com/guides/how-to-set-up-snowboard-bindings) |
  | Forward (+/+), carving | +24 to +30° | +9 to +15° | [Jones](https://www.jonessnowboards.com/pages/a-guide-on-how-to-find-your-snowboard-riding-stance) |
  | Freeride | +18 to +24° | 0 to +9° | [Jones](https://www.jonessnowboards.com/pages/a-guide-on-how-to-find-your-snowboard-riding-stance) |

  A +/+ stance lines both knees up to drive the toe edge hard ([Burton](https://www.burton.com/blogs/the-burton-blog/goofy-vs-regular-official-guide-snowboard-stances-fr/)). For the character rig, **+15/−6 duck** reads well for an all-round rider.

### 2.2 Toe-side vs heel-side asymmetry

- **Toe side.** Ankles, knees and hips all flex toward the toes, so a high edge angle comes "more quickly and precisely". Toe-side carves reach higher angulation. Coaches describe the toe edge as "dexterous like fingers" ([snowboardingdays, toe vs heel](https://www.snowboardingdays.com/?p=2898), [alpinesnowboarder forum](https://forums.alpinesnowboarder.com/topic/49651-lower-binding-angles-assymetric-power-toeside-vs-heelside-turns/)).
- **Heel side.** It is harder to tip high on edge, because joint flexion works against it and the rider sits back against the highback. It is powerful and stable, but less fine-grained. Riders report the heel edge is the one that skids first on hard snow. Beginners usually learn heel-side first: the "falling leaf" sideslip and the heel-side stop ([Whitelines](https://whitelines.com/snowboard-gear/buying-guides/asymmetric-sidecuts-explained.html), [CASI](https://casi-acms.com/?p=18024)).
- **Game factors.**
  - Heel-side max edge angle about 0.85× toe-side.
  - Heel-side edge-engagement rate about 0.85×.
  - Heel side starts to skid sooner under the same load.
  - Heel side gives the more stable, beginner-friendly braking slide.

### 2.3 Turning: rotation, counter-rotation, carve vs skid

- **Novice turns** are led by the upper body. Shoulders and head turn toward the new direction, and hips and board follow.
- **Advanced riders** steer with the lower body and keep the upper body quieter. Upper-body counter-rotation, twisting against the board, is mainly a toe-side habit at the end of turns. It is treated as a flaw early on and a tool later ([boardworld forum](https://www.boardworld.com.au/forums/viewthread/17400), [Snowboard Addiction, alignment](https://snowboardaddiction.com/blogs/training-education/how-to-ride-in-alignment)).
- **Animation guidance:**
  - Lead each edge change with about 10 to 20° of shoulder yaw, about 0.1 s ahead of the board.
  - Skidded turns: board pivoted about 20 to 45° to the direction of travel, with a fanning snow spray.
  - Carved turns: thin line, body inclined at the lean angle from section 1.2, no spray except at the tail.

### 2.4 Ollie, nollie, butters, switch, stops

- **Ollie.**
  1. Move the hips toward the nose to wind up.
  2. Load the tail so it flexes like a spring.
  3. Extend and spring off the tail. The back foot and tail are "the main spring".
  4. Pull the knees up and land centred.
  
  It is easier while moving than standing still ([NZSIA "The essential ollie"](https://learning.nzsia.org/2016/11/04/the-essential-ollie/), [Snowboard Addiction](https://snowboardaddiction.com/blogs/training-education/how-to-ollie-with-natalie)). A **nollie** mirrors this: load the nose, pop from the nose.
- **Ollie height (estimate).** No reliable published measurement was found. A competent rider's flat-ground ollie lifts the CoM about 0.25 to 0.45 m and clears 0.3 to 0.6 m of board height with the knees tucked. Air time is `t = 2·sqrt(2h/g)`:
  - h = 0.3 m → 0.49 s
  - h = 0.45 m → 0.61 s
  - h = 0.6 m → 0.70 s
  
  Take-off vertical speed is `sqrt(2gh)`, about 2.4 to 3.0 m/s.
- **Butters and presses.**
  - Shift the hips past the front knee for a nose press, or past the back foot for a tail press.
  - Keep the board flat; leaning onto an edge turns it.
  - The lifted end rises only about **5 to 10 cm** ([Ridestore butter guide](https://ridestore.com/mag/how-to-butter-on-a-snowboard), [Snowboard Addiction](https://snowboardaddiction.com/blogs/training-education/82536004-basics-of-buttering-step-1)).
  - A butter spin is a press plus an upper-body wind-up opposite to the spin, then leading with the shoulders.
  - Presses bleed speed. SSX community notes put a board press at about 20 km/h of speed loss ([SDA SSX 2012](https://kb.speeddemosarchive.com/SSX_(2012))).
- **Switch.** Riding with the back foot leading. A true twin board feels the same both ways, and a duck stance makes switch comfortable ([evo](https://www.evo.com/guides/how-to-set-up-snowboard-bindings)). In game terms, switch riding mirrors the controls with a small stability penalty, about 0.9× edge-grip ceiling, for non-park setups.
- **Heel-side slide stop (the snowboard hockey stop).**
  1. Turn the shoulders and hips across the fall line.
  2. Set the heel edge, knees bent and weight centred over the heels.
  3. Let the board skid sideways, adding edge to brake harder.
  
  The ski hockey stop uses the same pivot-then-edge sequence, and leaning back breaks edge grip ([Stio](https://stio.com/blogs/ski-snowboard/how-to-stop-on-skis), [Snowfeet](https://www.snowfeetstore.com/blogs/snowfeet_skiskates_skiboards_snowblades_skiblades_mini_skis_short_skis/hockey-stops-on-snow-can-you-do-them-on-skiskates)). A toe-side stop exists but is less stable.

### 2.5 Frontside vs backside spins (precise)

- **Frontside rotation:** the rider's chest faces forward, down the hill or in the travel direction, during the first 90°.
- **Backside rotation:** the rider's back faces forward during the first 90° ([Wikipedia](https://en.wikipedia.org/wiki/Frontside_and_backside), [Snowboard Addiction terminology](https://snowboardaddiction.com/blogs/training-education/snowboard-terminology)).

Seen from above:

| Rider | Frontside | Backside |
|---|---|---|
| Regular (left foot forward) | Counter-clockwise | Clockwise |
| Goofy (right foot forward) | Clockwise | Counter-clockwise |

Implementation: if `toeDir` is the rider's toe-side horizontal unit vector and `fwd` is the travel direction, a rotation that first swings the chest (`toeDir`) toward `fwd` is frontside.

Carve geometry links spin direction to the take-off edge. A regular rider on the heel edge is turning counter-clockwise, which is the same sense as a frontside spin. So **frontside spins are naturally wound up from a heel-side carve, and backside spins from a toe-side carve**. This is also how they are commonly taught. Note that for jumps and rails, "frontside/backside" can instead describe which side of the feature the rider approaches from.

### 2.6 Spin rates and air times

- Halfpipe and slopestyle studies show that **angular velocity, not airtime, mainly sets total rotation**. Bigger rotations go with somewhat more height and airtime: 720° attempts had more airtime than 360° attempts ([lida, "How to spin to win"](https://lida.sport-iat.de/svd/Record/4057504), [Beijing 2022 halfpipe IMU study](https://https-sage-cnpereading-com-443.webvpn1.xju.edu.cn/doi/10.1177/17479541261439267)). Airtime and degrees of rotation explain most of the variance in halfpipe scores ([Harding et al.](https://www.sponet.de/sponet/Record/4018558?lng=en)).
- **Typical numbers (estimate, from airtime geometry).**
  - A 360° on a small kicker takes about 1.0 s of air, which is about **6.3 rad/s** (360°/s).
  - A 540° in about 1.3 s is about 7.2 rad/s.
  - A 720° in 1.6 to 2.0 s is about 6.3 to 7.9 rad/s.
  - A 1080° on a big-air jump takes about 2.5 to 3 s of air.
  
  Peak spin rates for park riders sit around 6 to 9 rad/s. Flips are slower, about 4 to 6 rad/s.
- **Air times by feature (estimate).** Use `t = 2·sqrt(2h/g)` for a symmetric arc.

  | Feature | Air time |
  |---|---|
  | Small 3 to 5 m kicker | 0.8 to 1.2 s |
  | Medium 10 to 15 m table | 1.5 to 2.2 s |
  | Halfpipe air, 3 to 5 m out | 1.5 to 2.0 s |
  | Big-air competition | 3 s or more |

---

## 3. Ski technique

- **Parallel and carved turns.** Both skis edge together. In a carve, both edges track their own arcs along the sidecut and leave two thin lines. In a parallel skidded turn the skis pivot together with a controlled skid, which is the everyday recreational turn.
- **Inclination vs angulation.**
  - *Inclination* tips the whole body toward the turn centre. It starts the edging and moves the CoM inside.
  - *Angulation* bends laterally at the hips and knees so the upper body stays more upright while the skis tip further. It controls pressure and lets the edge angle exceed the CoM lean.
  
  The sequence is inclination first, then angulation, with peak pressure near the fall line. Leaning in with the whole body ("banking") is a classic error because it loads the inside ski and causes washouts ([SkiRacing, angulation](https://skiracing.com/mastering-angulation-key-ski-racing-technique-from-the-young-skiers-guide/), [youcanski](https://youcanski.com/en/?p=28)).
  
  In game terms, skis may run edge angle about 10 to 15° above body lean through angulation. Snowboards angulate less, especially heel-side.
- **Pole plant timing.** The plant (a touch, really) happens at the end of the old turn, just before extension and edge change. It sets rhythm and helps move the CoM forward and into the new turn. Planting close to the body allows faster edge changes; reaching far forward lengthens the turn ([youcanski](https://youcanski.com/en/?p=28), [CS Monitor](https://proof.csmonitor.com/1983/0216/021636.html)). In game terms, trigger a pole-touch animation about 0.1 to 0.2 s before each edge switch when turns are shorter than about 1.5 s.
- **Snowplough (wedge).** Skis form a "V", tips together and tails apart, on their inside edges. The V shape plus inside-edge pressure creates drag. A wider wedge and more edge pressure brake harder, and narrowing the wedge lets the skier speed up ([Maison Sport](https://maisonsport.com/fr/blog/how-to-stop-on-skis-as-a-beginner]), [Travesia Pirenaica](https://travesiapirenaica.com/en/skiing-technique)). Braking is gentle: **about 1 to 2.5 m/s²** net on easy terrain (estimate).
- **Hockey stop.** Rotate the hips and both skis across the fall line, then set the downhill edges hard so the skis skid sideways to a stop. It is quicker than any snowboard stop because both skis can be angulated independently. Common errors are leaning back and setting the edge too early ([Stio](https://stio.com/blogs/ski-snowboard/how-to-stop-on-skis)).
- **Hockey-stop deceleration (estimate).** No published measurement was found. The stop is limited by lateral ploughing, with an effective friction of about 0.5 to 0.7, giving **5 to 7 m/s²**. That means stopping from 12 m/s in about 10 to 14 m and 2 s.
- **Tuck.** Crouched, back nearly horizontal, hands forward and together, poles under the arms. It cuts CdA by about 60 to 70% compared with upright (0.6 to 0.2 m²), but leg drag stays dominant and steering authority is low ([Elfmark](https://uis.brage.unit.no/uis-xmlui/handle/11250/3051286)). Lonely Mountains: Snow Riders makes this trade explicit: crouching gives speed but reduces turning ([Xbox Tavern](https://www.xboxtavern.com/lonely-mountains-snow-riders-review/)).
- **Fore/aft weight.**
  - Forward pressure at turn initiation engages the tips and tightens the turn.
  - Centred pressure through the fall line holds the carve.
  - Pressure drifting back at the finish releases the tails and makes the ski "shoot".
  - Too far back for too long causes tail washout and loss of steering, which is the classic intermediate error.

---

## 4. How games handle it

| Game | Controls | Physics and feel | Lesson |
|---|---|---|---|
| **Mark McMorris Infinite Air** (HB Studios, 2016) | Left stick: carve, butters, reverts, quick spins and flips. Right stick: flick to ollie or nollie, pre-loaded flip torque, tweaks, grab placement. Triggers: left and right hand grabs ([Wikipedia](https://en.wikipedia.org/wiki/Mark_McMorris_Infinite_Air), [Sports Gamers Online](https://www.sportsgamersonline.com/games/mark-mcmorris-infinite-air-review/amp/)) | "About manipulating your body in space", with no auto-propulsion ([Game Informer preview](https://gameinformer.com/games/infinite_air/b/xboxone/archive/2016/03/10/infinite-air-is-a-new-approach-to-snowboarding.aspx)). Spin comes from pre-load length, and the rotation cannot be slowed mid-air ([Steam discussion](https://steamcommunity.com/app/488300/discussions/0/333656722985089221)). Reviewers: "nice weight" ([TheSixthAxis](https://www.thesixthaxis.com/2016/10/28/mark-mcmorris-infinite-air-review/)), but harsh landings and unpredictable flips ([Push Square](https://www.pushsquare.com/reviews/ps4/mark_mcmorris_infinite_air), [OSFTW 3/10](https://www.osftw.com/reviews/845/mark-mcmorris-infinite-air)). | Pre-load is a great grounded input, but the player needs **mid-air rotation control** (slow or speed up 20 to 40%) and **readable landing windows**. Overloading one stick with carve, butter and revert confuses players. |
| **SSX (2012) / SSX Tricky** | Left stick steers and spins. Right stick jumps and grabs. Landing is automatic: "let go" and the rider rights themselves ([T3](https://www.t3.com/reviews/ssx-review), [PopMatters](https://popmatters.com/review/155657-ssx)) | Tricks fill a boost meter, and Tricky mode gives unlimited boost and Über tricks ([Wikipedia](https://en.wikipedia.org/wiki/SSX_(2012_video_game))). Boost works only on the ground. A board press costs about 20 km/h ([SDA](https://kb.speeddemosarchive.com/SSX_(2012))). | Auto-righting near the ground keeps flow. **Reward style with speed.** A speed cost for presses and butters is a nice grounded touch. |
| **Steep** (Ubisoft, 2016) | Hold RT to "wind up" before the lip, release on take-off, and time stick motions to spin or flip ([TrueAchievements](https://www.trueachievements.com/n26002/steep-review), [CGM](https://www.cgmagonline.com/review/steep-ps4-review/)) | Skis give "a better sense of control". The board allows more complex tricks ([Gamereactor](https://embed.gamereactor.eu/steep-review/)). | A charge-and-release take-off reads clearly. **Differentiate gear:** skis are more stable and precise, boards trickier and more playful. |
| **Shredders** (FoamPunch, 2022) | Left stick steers and carves. Right stick checks speed. RT sets up and pops jumps. LT lands and grinds. Bumpers grab. Hold jump plus a stick direction to pre-load, release to spin or flip. "Re-Shred" rewinds to before the last jump ([TheGamer tips](https://www.thegamer.com/shredders-beginner-tips/), [Stevivor](https://stevivor.com/reviews/shredders-review-carving-out-a-niche-for-itself/), [Thumb Culture](https://www.thumbculture.co.uk/?p=59505)) | Described as a balance of arcade and realism. "You need to put a lot of force into spins, prepping them" ([TheGamer review](https://www.thegamer.com/shredders-review/)). Satisfying once learned, with no trick list. | **A dedicated speed-check input** (skid or brake) separate from steering is very grounded. Pre-load amount sets rotation. A **rewind** makes punishing physics tolerable. |
| **Lonely Mountains: Snow Riders** (2025) | Steer, brake and crouch | Braking to turn costs speed that is hard to regain without a steep hill. Crouching trades turning for speed. Heavy snow slows the rider and ice cuts control ([Xbox Tavern](https://www.xboxtavern.com/lonely-mountains-snow-riders-review/), [Shacknews](https://www.shacknews.com/article/142839/lonely-mountains-snow-riders-review-score), [useapotion](https://www.useapotion.com/2025/01/lonely-mountains-snow-riders-pc-review/)) | Surface types with clear grip and drag signatures make the snow readable. The **tuck-vs-turn trade-off** is a core skill. |
| **Alto's Adventure** | Tap to jump, hold to backflip | Weight and momentum feel right, and a mistimed flip ends on the rider's back ([Hardcore Gaming 101](https://www.hardcoregaming101.net/altos-adventure/), [Vulcan Post](https://vulcanpost.com/188451/loved-tiny-wings-altos-adventure-will-make-fly)) | Even with one-button controls, **rotation stays manual and landing alignment matters**. That is enough depth. |
| **Snowboarding: The Next Phase** | Triggers for grab tweaks | "Tight and fairly forgiving" ([Nintendo Life](https://nintendolife.com/reviews/switch-eshop/snowboarding-the-next-phase)) | Forgiveness beats realism for mass appeal. |

**Design lessons for "arcade but grounded":**
1. **Physics determines the carve, the input picks the edge.** Map stick X to a *target edge angle*. Let the physics turn that into a radius (`R_sc·cos φ`) and decide whether the rider carves or skids (section 1.2 limit). Add a "carve assist" that pulls toward the ideal radius.
2. **Separate the brake or skid input from steering** (Shredders' right stick, Lonely Mountains' brake), so carving stays pure and skidding is a deliberate choice.
3. **Charge-and-release pop** (Steep, Shredders, Infinite Air). Hold to compress, release to ollie. Charge sets pop height and spin pre-wind.
4. **Spin from pre-wind plus in-air adjustment.** Set the base rate at take-off and allow about ±30% mid-air trim, so landings are skill rather than luck (fixes Infinite Air's main complaint).
5. **Generous, graded landings**: clean, sketchy and bail bands, plus auto-righting in the last 0.2 to 0.3 s (SSX).
6. **Gear differentiation**: skis faster, more grip, quicker edge changes and hockey stop. Board floats in powder, butters and spins more freely, has a heel/toe asymmetry, and has a slower edge-to-edge change.
7. **Reward flow with speed**: clean landings and carves keep momentum, and sloppy skids or presses cost it.

---

## 5. Tuning targets

Assumptions: rider mass 80 kg, slope 25° unless stated, ρ = 1.0 kg/m³. The game caps speed at about 15 to 20 m/s, so speeds are scaled to roughly 0.4 to 0.55× the real terminal speed (about 30 m/s upright and 50 m/s tucked). That scaling is done with an "arcade CdA", worked out below.

| Parameter | Skis | Snowboard | Notes / real-world basis |
|---|---|---|---|
| Base friction μ (groomed / cold / slush / ice) | 0.04 / 0.06 / 0.11 / 0.03 | same | KIT 0.023 to 0.139. Ice: low glide friction, lateral grip ×0.5 |
| Real CdA, upright / tuck | 0.55 / 0.20 m² | 0.60 / 0.32 m² (crouch) | A board rider cannot tuck fully |
| **Arcade CdA**, upright / tuck (25° slope, μ 0.04) | 2.4 / 1.5 m² | 2.7 / 1.8 m² | Solves `v_t = sqrt(2·303 N / (ρ·CdA))` for the target speeds |
| Straight-line top speed on 25°, cruise | **16 m/s** | **15 m/s** | Real advanced cruise about 12 m/s; boards about 0.9× skis |
| Straight-line top speed on 25°, tuck | **20 m/s** | **18.5 m/s** | Hard cap 21 m/s |
| Typical carving cruise | 11 to 14 m/s | 10 to 13 m/s | Recreational mean 10 to 12 m/s |
| Effective sidecut R_sc | 16 m (all-mountain) | 9 m (toe), 8.5 m (heel) | Real values: 14.5 to 30 m skis, 6 to 10 m boards |
| Ideal-carve speed limit `sqrt(g·R_sc·sin φ)` at full edge | about 12 m/s | about 9 m/s | Above this, blend toward skid. For arcade feel, scale the effective R_sc ×1.6 at speed (v > 12) to keep carves alive to about 16 m/s |
| Carve radius at 10 m/s | 8 to 16 m | 6 to 11 m | Edge 30 to 65° |
| Carve radius at 15 m/s | 13 to 25 m | 11 to 20 m | 1.0 to 1.8 g |
| Carve radius at 20 m/s | 22 to 40 m | 20 to 35 m | Mostly long arcs, as on GS skis |
| Max edge angle | 70° (body lean max 60°, rest from angulation) | Toe 66°, heel 56° | WC 64 to 68°, carvers up to 80° |
| Lateral g, sustained / peak | 1.8 g / 2.5 g | 1.6 g / 2.2 g | GS GRF about 2 BW mean, 3.15 BW peak |
| Lean response (stick to target edge), time constant | 0.12 s | 0.16 s (heel 0.18, toe 0.14) | |
| Time to switch edges, full edge to full edge | **0.30 s** (0.25 short turns) | **0.42 s** (heel→toe 0.38, toe→heel 0.46) | Board rolls a 25 cm platform through flat |
| Skid decel in skidded turn | `a = μ_side·g·sin β`, μ_side 0.55 | μ_side 0.50 | β = 20° gives about 1.8 m/s² |
| Hockey / slide-stop decel | **6.5 m/s²** | Heel **5.5**, toe **4.5 m/s²** | Estimates: stops 12 m/s in about 1.9 to 2.7 s |
| Snowplough decel | 1.5 to 2.5 m/s² (wedge 0 to 1) | n/a (falling-leaf sideslip about 1.5) | Skis only |
| Ollie / hop height (CoM), full charge | 0.30 m | **0.45 m** (nollie 0.38) | Estimate |
| Ollie take-off vertical speed | 2.4 m/s | 3.0 m/s | `sqrt(2gh)` |
| Air time on flat, full charge | 0.49 s | 0.61 s | `2·sqrt(2h/g)` |
| Charge to full pop | 0.35 s | 0.40 s | Minimum tap gives about 40% pop |
| Spin rate, flat spin | 5.5 to 7 rad/s (max 8) | **6.3 to 8 rad/s** (max 9.5) | 360° per about 1 s of air |
| Flip rate | 4 to 5.5 rad/s | 4.5 to 6 rad/s | |
| Mid-air spin trim | ±30% | ±35% | Lesson from Infinite Air |
| Butter / press speed loss | n/a | about 0.8 m/s² extra drag | SSX: press costs about 20 km/h over time |
| Powder: sink depth at 5 m/s / 15 m/s | 0.30 / 0.15 m | 0.15 / 0.06 m | Board about half of ski sink |
| Powder: extra drag coefficient k (`a = k·depth·v`) | 1.0 | 0.55 | |
| Powder: speed below which rider bogs | 7 m/s | 4.5 m/s | |
| Powder: steady speed on 25° deep snow | 11 to 12 m/s | 13 to 14 m/s | Board floats, ski ploughs |
| Powder: steering authority | ×0.7 | ×0.9 | Setback stance and rocker |
| Landing pitch tolerance (base vs slope normal) | Clean ≤ 12°, sketchy ≤ 25°, crash > 30° | Clean ≤ 15°, sketchy ≤ 30°, crash > 35° | |
| Landing yaw tolerance (board axis vs velocity) | Clean ≤ 10°, sketchy ≤ 25°, crash 35 to 150°. 150 to 180° = switch landing (twin tips) | Clean ≤ 15°, sketchy ≤ 45° (auto-slide or revert), 45 to 120° = hard slide landing with speed loss, 120 to 180° = switch | Boards can land sideways, skis cannot |
| Landing roll tolerance | Clean ≤ 10°, crash > 25° | Clean ≤ 15°, crash > 30° | |
| Sketchy landing penalty | −25% speed, 0.4 s wobble | −20% speed, 0.4 s wobble | |
| Auto-righting window before touchdown | 0.20 s | 0.25 s | SSX-style assist, corrects up to 10° |
| Heel/toe asymmetry factors (board) | n/a | Heel: maxEdge ×0.85, engage rate ×0.85, grip ×0.9, skid onset ×0.85, stop decel ×1.2 vs toe stop. Toe: precision and response ×1.15 | Coaching consensus |
| Switch riding | ×0.9 grip if not twin | ×0.95 grip, mirrored input | |
| Pole-touch animation | 0.15 s before edge switch, turns < 1.5 s | n/a | Cosmetic |

**Implementation sketch of the carve/skid model**
1. Stick X sets the target edge angle `φ_target`. `φ` follows it with the time constant and edge-switch time above. Heel-side boards use the heel factors.
2. Carve radius is `R_c = R_sc_eff · cos φ` (R_sc_eff scaled at high speed as noted in the table). Required lateral acceleration is `a_req = v²/R_c`.
3. Grip limit is `a_grip = g · tan(φ_eff) · gripFactor(surface, heel/toe)`, clamped to the max-g row above.
4. If `a_req ≤ a_grip`, the rider carves: yaw follows the path, skid angle β → 0, and only friction and drag apply.
5. If `a_req > a_grip`, the path radius becomes `v²/a_grip`, skid angle β rises in proportion to the excess, and the rider pays `μ_side·g·sin β` deceleration. Spawn spray particles that scale with β.
6. Lean the body to `atan(a_lat/g)`. Skis may add up to 15° of angulation on top of that. Lead the shoulders by 10 to 20° yaw about 0.1 s before each edge change.

---

## 6. How the research was applied (and where the game deviates)

The implementation is in `web/src/physics/` (see [equipment.md](equipment.md)). This is how each finding was used:

| Finding | In the game | Deviation and why |
|---|---|---|
| `R = R_sc·cos φ`; the ideal carve breaks down above `√(g R_sc)` | `κ = engage(φ)/(R_eff·cos φ)`, capped by `a_max/v²`. `R_eff` grows with speed (`speedRadius`), so carves stay alive at speed. | Follows the "×1.6 at speed" note. `carveAssist` = 0.85 turns most over-demand into a wider arc instead of skid, so keyboard full lock stays fun. |
| Skid costs `μ_side·g·sin β` | Applied as written. | `μ_side` is 0.34–0.36 for steering skids (softer than 0.55), so linked keyboard turns don't kill speed. Below about 8 m/s it fades further, because slow pivots steer rather than scrape. Stops use the full values. |
| Lateral g: 1.8 skis / 1.6 board; heel ×0.9 | `latG` 1.8, and 1.6 toe / 1.45 heel. | none |
| Max edge 70° skis; 66° toe / 56° heel | 68°, and 64° / 55°. | none |
| Edge switch 0.30 s skis; board 0.38 heel→toe / 0.46 toe→heel | Rate-limited lean. The bench measures 0.30 / 0.38 / 0.42 s. | Key presses from neutral ramp from 65% to full lock over 0.45 s, so taps carve gently. |
| Hockey stop 6.5 m/s²; heel 5.5 / toe 4.5 | Bench: 6.5 / 5.6 / 4.9 m/s². | none |
| Snowplough 1.5–2.5 m/s² | 2.4 m/s². | none |
| Friction μ about 0.04 groomed | Groomed 0.028; "powder" 0.07. Both blend by `powderDepth`. | The whole course is classified as powder, so it is treated as shallow sugar (`powderDepth` 0.35). Deep-powder numbers would bog riders down on the 7–10° sections. |
| Arcade drag tuned so top speeds are 16 / 20 m/s skis, 15 / 18.5 board | Bench, cruise / tuck: skis 17.0 / 18.7, board 16.4 / 17.5 m/s. | The tuck is a little slower than the target, to keep the game's "normal pace". |
| Board floats better, bogs later, sinks about half as deep | Per-type sink, bog speed and plough drag, × spec `float` (planform area, rocker, setback). | Scaled by `powderDepth` on this course. |
| Ollie 0.45 m board / 0.30 m ski hop | 0.84 m and 0.65 m at full charge. | Arcade ×2. On kicker lips the pop gets ×1.7 (`lipPopBonus`), so park jumps feel big. |
| Spin 6.3–8 rad/s board, 5.5–7 skis; ±30% trim | 7.6 / 6.4 rad/s × the spec spin factor. The stick trims; a released stick carries on or checks to the next landable alignment. | Spin momentum and auto-complete replace a hard stop, which fixes the "unpredictable rotation" complaint about Infinite Air. |
| Landing yaw: skis clean ≤10°, crash >35°; boards slide out sideways | Skis clean ≤15°, crash >38°. Boards: clean ≤15°, stumble ≤45°, slide ≤82°. Twin tips land switch. | Slightly more forgiving clean window; the auto-righting assist covers 14° in the last 0.25 s. |
| Wind-up and preload (Steep, Shredders) | Steering while charging winds up a spin (+2.6 / +3.2 rad/s at take-off). | none |
| Lean `atan(a_lat/g)` plus up to 15° of ski angulation; shoulders lead turns by about 0.1 s | Rider lean comes from the contact force across the gear. Skis angulate with the spine. Shoulders follow the raw input, ahead of the smoothed edge. | The lean is capped at 0.8 rad for readability. |

---

## 7. Round 2: flips, landings, natural air, butters and edge catches

This section supports the second tuning pass: flips and corks, pitch-aware landings, natural air off convex terrain, crest absorption, ski butters, and the flip preload. Estimates are marked as such.

### 7.1 Flip rotation rates

- **Aerials.** The flight phase of a triple-flip aerial lasts about 2.6 s, with three straight-body somersaults ([Yeadon, CPA](https://ojs.ub.uni-konstanz.de/cpa/article/view/3076/2884)). That gives an average of about 7 rad/s, or about 0.87 s per flip. Take-off speed is about 70 km/h off a kicker about 4.1 m tall ([US Ski & Snowboard](https://usskiandsnowboard.org/news/aerial-skiing-101)).
- **Where the rotation comes from.** It is set on the ramp: leaning forward at the start of the kicker plus ankle torque just before take-off ([Jones, Loughborough](https://dspace.lboro.ac.uk/2134/10784)). Trampoline and kicker models name take-off angular velocity and moment of inertia as the key indicators ([SPONET](https://lida.sport-iat.de/svd/Record/4092443?lng=en)).
- **Single wildcats.** Motion capture of 46 single wildcats found two tuck strategies ([Bacik et al.](https://johk.pl/?p=5458)).
- *Estimate:* a tucked single backflip off a 10–15 m kicker takes about 1.0–1.4 s (4.5–6 rad/s). A double cork 1080 needs about 2–2.5 s of air. Billy Morgan's first quad cork 1800 needed 2.8 s ([Red Bull](https://www.redbull.com/us-en/full-story-behind-billy-morgans-quadruple-cork)).

**Targets used:** flip rate of 5.6 rad/s on skis and 5.9 rad/s on the board, about 1.1 s per flip. Doubles need about 2.3 s of air, so they are only possible off the biggest popped kickers.

### 7.2 Landing impact: equivalent fall height (EFH)

- **Definition.** EFH = v⊥² / 2g, the drop onto flat ground that gives the same impact as the velocity change normal to the landing surface ([Petrone, Cognolato, McNeil & Hubbard](https://ar5iv.labs.arxiv.org/html/1611.04448)).
  - Minetti puts the normal impact a rider's legs can absorb at about 1.5 m EFH, which is about 5.4 m/s.
  - Landings linked to spinal-cord injuries measured 3–10 m EFH.
  - The legs need about 0.25 s to absorb a landing.
- **Safe drop heights.** Minetti's model gives 2.6–3.0 m for athletes ([UNIMI](https://air.unimi.it/handle/2434/19726)).
- **Jump design.** Straight landing slopes give an EFH that grows linearly with distance. Landings can be designed to cap EFH ([Levy, Hubbard, McNeil & Swedberg](https://paperity.org/p/73758286/a-design-rationale-for-safer-terrain-park-jumps-that-limit-equivalent-fall-height)).
- **Real tables.** Medium jumps stay under 1.5 m, but deck landings on big tables reach 2.3–3.4 m ([DOAJ](https://doaj.org/article/fe3f699fc039403e95387582f05fcb57)).
- **Where riders land.** In 704 observed snowboard tabletop jumps, 45% landed on the slope, 35% on the knuckle and 20% on the deck; 21% fell ([SPONET](https://sponet.de/sponet/Record/3042548)).

**Conversion (v⊥ = √(2gh)):** 0.5 m → 3.1 m/s; 1.5 m → 5.4 m/s; 3 m → 7.7 m/s; 10 m → 14 m/s.

**Where the game deviates (deliberately).** The course's kickers are not designed jumps. They land on the natural 15–20° slope, so popped airs hit at 9–11 m/s normal, an EFH of 4–6 m. A realistic rule would crash almost every popped jump, so the game stays arcade:
- Above 12.5 m/s (`hardLanding`) the rider stumbles.
- Above 18 m/s (`crashImpact`) the rider crashes.
- Impact still drives squash, camera shake and sound.

A future "designed landings" feature (landing ramps sized for the kicker) would let these thresholds move toward the real numbers.

### 7.3 Natural air over convex terrain; pre-jump and absorption

- **Physics.** Over a crest of radius R, the normal force reaches zero at v² = g·R·cos θ. Beyond that speed the rider is a projectile ([derivation](https://www.physicsforums.com/threads/at-what-angle-does-a-skier-leave-a-sphere.157008/post-1250060)).
  - *Estimate:* on a 20° slope, an R = 10 m roller launches above about 9.6 m/s, and an R = 5 m roller above about 6.8 m/s.
- **Pre-jump.** Lifting the skis just before the crest keeps the rider low, avoiding being "thrown up and out" ([SI ski tip, 1960](https://vault.si.com/vault/1960/01/11/ski-tip)). Downhillers carried more speed with a pre-jump than without ([Ewha thesis](https://dspace.ewha.ac.kr/handle/2015.oak/197414)).
- **Absorption.** The legs retract over the crest. *Estimate:* the leg stroke is 0.3–0.5 m, which lets a rider stay on the snow up to about 1.3–1.5× the passive lift-off speed.

**Applied:**
- The player leaves the snow when `v·n′/dt > g·n′.y × liftOffGrip`, with `liftOffGrip` = 1.25 for a little passive absorption.
- Crouching while charging multiplies that by (1 + 0.8 × charge), up to about 1.8×. Holding Space soaks up a crest, and releasing on it pops off the roller.
- The hand-built course's natural drops now give about 1 s of air to a rider going straight. Before this change the ground step glued riders to any convex terrain.

### 7.4 Butters and presses

- **Snowboard.** Hips over the nose or tail, base flat, the other end lifted about 10 cm, with the upper body winding the spin ([Snowboard Addiction](https://snowboardaddiction.com/blogs/latest-news/how-to-butter-on-a-snowboard-step-1-basic-buttering-position)). Soft snow makes edge catches more likely ([Red Bull](https://redbull.com/us-en/butter-snowboarding)).
- **Skis.** Butters are easiest on soft, centre-mounted twin tips with rockered tips ([Blister](https://blisterreview.com/gear-reviews/2014-2015-armada-al-dente)). Butters scrub speed, so riders come in faster than they think they need ([Freeskier, Jossi Wells](https://freeskier.com/stories/trick-tip-tuesday-jossi-wells)).

**Applied:**
- Skis butter like the board: Space or W+Space plus steer, below 11 m/s.
- Butter rate is 2.6 rad/s × pivot, against 3.4 for the board. Directional skis get 0.6× that rate.
- Butter drag is 0.9 m/s².

### 7.5 Catching an edge (not implemented)

- **Mechanics.** A flat or sideslipping board lets the downhill edge dig in. It stops almost instantly while the body keeps going, slamming the rider downhill ([alpinesnowboarder forum](https://forums.alpinesnowboarder.com/topic/26631-riding-the-flats/)).
- **Injuries.** Backward falls cause 68% of major snowboard head injuries, typically on gentle slopes ([ASTM STP](https://store.astm.org/stp39647s.html)).
- **In games.** Few games model it. A VR sim advertises bailing on a caught edge ([SideQuest](https://sidequestvr.com/app/41842/realistic-snowboarding)).
- **Possible rule** if it is ever added: a catch only when the downhill edge is set (under 5°), sideways speed is above 2–3 m/s, and forward speed is under 15 m/s, with a 0.15 s grace period. In this game it would mostly punish keyboard edge changes, so it is left out on purpose.

### 7.6 How games handle flips

| Game | Flip input | Mid-air control | Landing |
|---|---|---|---|
| SSX (2012) / Tricky | Left stick in the air; pre-wind by holding jump plus a direction and releasing at the lip ([T3](https://www.t3.com/reviews/ssx-review)) | Free | Riders "automatically right themselves" near the ground ([PopMatters](https://popmatters.com/review/155657-ssx)) |
| Steep | Hold the trigger to prepare and release at the lip. Stick forward or back flips; holding forward before take-off ruins the jump ([Twinfinite](https://twinfinite.net/?p=237797)) | Stick | Alignment matters |
| Shredders | Left stick flips. Holding RT, pushing forward, then snapping back at the lip makes you rotate much faster ([Pure Xbox](https://purexbox.com/guides/shredders-how-to-do-a-triple-backflip)) | Limited | Dedicated landing input |
| Infinite Air | Pre-load about 1 s before take-off ([TGA](https://totalgamingaddicts.com/mark-mcmorris-infinite-air-review/)) | Spin speed adjustable; flips hard to stop | Very narrow window ([TheSixthAxis](https://www.thesixthaxis.com/2016/10/28/mark-mcmorris-infinite-air-review/)) |
| Amped (2001) | Left stick in the air | Free | Bail if not aligned ([GameSpot](https://www.gamespot.com/articles/hands-onamped-freestyle-snowboarding/1100-2814091/)) |

**Applied:**
- In the air, W and S flip forward and back. Keys already held at take-off are ignored until pressed again, so a held tuck or nollie never flips by accident. This addresses Steep's "forward before take-off ruins the jump" trap.
- S held while charging the pop is a **preload**: the take-off already rotates at 4.2–4.4 rad/s and commits to the flip. This mirrors Shredders and Infinite Air, and matches the research: rotation is set on the ramp, and wildcats pop off the tail.
- With the stick released, a flip carries on to the next upright. Inside 50° of upright the rider spots the landing and settles, which is a subtle SSX-style assist.
- Pitch tolerance is 22° for clean and 42° for a stumble. The research suggests ±15 / ±35; the game is a little more forgiving because the camera makes pitch harder to read than yaw.

## 8. Round 3: steering feel at speed and the rider's body

### 8.1 What games and players say about steering feel
- **SSX / SSX Tricky.** Carving is snappy and driven by leaning, and speed reads through sound and spray as much as through motion ([Playpile](https://playpile.gg/games/ssx-tricky), [The Retrograde](https://theretrograde.substack.com/p/retrograde-1-ssx-tricky)).
- **Steep.** The left stick steers, with a separate speed check. Previews faulted imprecise control ("tumble down the mountain rather than swiftly maneuver"); the final game was praised for its sense of speed ([Game Informer preview](https://gameinformer.com/games/steep/b/xboxone/archive/2016/06/19/ubisoft-has-steep-ambitions-but-so-far-it-misses-the-mark), [Worthplaying review](https://www.worthplaying.com/article/2016/12/8/reviews/101606-xbox-one-review-steep/), [Tom's Hardware hands-on](https://www.tomshardware.com/uk/news/steep-hands-on-ubisoft-pax,32654.html)).
- **Racing games, speed-sensitive steering.** Players blame a speed limit that clamps *full* lock for "false understeer": a stick jammed over turns the wheels about 10% at speed. The usual answer is an exponent curve on the stick (fine control near centre) plus a speed-based limit tuned separately from the steering ratio ([GTPlanet](https://www.gtplanet.net/forum/threads/ds3-controller-settings.199716/), [Forza forums](https://forums.forza.net/t/strange-steering-input/10061), [response-curve calculator](https://west-games.com/analog-stick-response-curve-calculator/)).

### 8.2 Applied
- **Keep full lock, shape partial input.** At 30 m/s the grip limit is reached on a light edge, so 30%, 60% and full stick all gave the same turn and the rest became skid. Now the held share of the edge picks a share of the grip-limited curvature (`carveInput`, `carveCurve`). Full lock still gives the whole grip-limited turn, so there is no false understeer; partial input is graded.
- **Phase it in with speed** (`carveInputV` 16 → 26 m/s). The tree slalom (Blackspruce, 15–21 m/s) keeps the snappy response, which a dodge needs. Applying the shaping from 16 m/s cost the slalom bot tree crashes.
- **No wash-out at speed** (`pivotGrip`, `washMax`). Full lock at 50–70 mph is a deep carve with a little drift (about 6–7° of skid) instead of a 15–19° slide.
- The stick curve itself (exponent 1.35 after a radial dead zone) is in input.js.

### 8.3 The rider's body
- **Proportions.** An adult's arm span is about their height, and head breadth is about 8.5% of height. The Quaternius model has a 1.65 m span on a 1.81 m body and a 0.18 m wide head, a superhero cut. Steep and Riders Republic use realistic proportions under baggy clothes. The rig now has longer upper arms and forearms and a smaller head and hands (`character/body.js`).
- **Leaning.** Inclination follows the contact force (atan(a/g)), with angulation from the knees and hips, at most about 40° beyond the lean. Racers carve at 2–3 g with 50–60° of inclination. The upper body counter-rotates toward the outside of the turn, leads into the next turn at the edge change (crossover), and the head stays nearer level, looking along the path.
