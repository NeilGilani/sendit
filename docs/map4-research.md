# Map 4 research: terrain parks, slopestyle, big air, superpipe, and how games do rails

Background for Voltage Park ([map4.md](map4.md)). It draws on text sources only: FIS documents, Olympedia course
data, course previews and build articles, jump-safety papers, manufacturer spec sheets, and game reviews and guides.
No video was watched. Numbers carry their source as [n] (list at the end). **[calc]** marks a point-mass physics
calculation of our own. Where sources disagree, the range is given.

## 1. Olympic slopestyle

| | PyeongChang 2018 | Beijing 2022 | Milano-Cortina 2026 (Livigno) |
|---|---|---|---|
| Length / drop | 690 m / 163 m [1] | 600 m / 198 m [2] | 650 m / 165 m [3] |
| Mean pitch [calc] | ~13.7° | ~19.3° | ~14.7° |
| Layout | 3 jib + 3 jump sections | 3 jib + 3 jump | 3 jib + 3 jump |
| Designer | Schneestern (Dirk Scheumann) [4][5] | Schneestern [6] | Scheumann as course designer [3] |

- **The template.** Rails sit at the top and jumps at the bottom. Each section offers several parallel features, so
  riders can choose lines and show variety. The jibs score technique; the jumps score amplitude and progression [7].
- **PyeongChang 2018:**
  - Multifaceted rail, jib and butter combinations.
  - A snow bowl and skewed kickers.
  - Rails "higher and wider than typical park rails".
  - Landings shaped from computed flight curves [5].
- **Beijing 2022:**
  - A Great Wall replica runs down the rider's left. It doubles as a windbreak, and a watchtower on it has a
    slideable roof ridge.
  - The rails are tiered: highest on one side, stepping down across the slope.
  - Sections 1 and 2 have five sliding features each.
  - The jumps:
    - Skew kickers over a **19 m table**.
    - 5 m kickers landing with the **sweet spot about 21 m out**.
    - A **5 m kicker over a 21 m step-over**, the "money booter" [6][7].
- **Livigno 2026: speed was the problem.**
  - Skiers had to stop between features in the rail section [13].
  - In the women's final many riders could not clear the last knuckle: they "couldn't build enough speed between
    the second and third jumps" [14].
  - Lesson: **budget speed between sections**.
- **Speeds through a course [16]:**

  | Phase | Speed |
  |---|---|
  | Rails | 10–30 km/h |
  | In-runs | 55–80 km/h |
  | Take-offs | 50–70 km/h |
  | Landings | 35–60 km/h |

## 2. Big air

- **Big Air Shougang (Beijing 2022).**
  - The structure is 164 m long and 60–64 m high [18][19].
  - Course data: a 30° in-run of 85 m, a **5 m kicker**, **20 m** from take-off to the knoll and a **38° landing** [20].
- **Livigno 2026.**
  - In-run 75 m at 39°, a 5 m kicker, 18 m to the knoll, a 38° landing [24].
  - Speeds of ~55 km/h at take-off, ~30 m jumps and ~2 s of air [16].
- **FIS minimums.** A take-off of at least 25°, a landing of at least 28°, a kicker at least 5 m wide, a drop-in at
  least 30 m long at 20° or more, and a landing area of at least 20 × 20 m [25].
- **Contest jumps.** The Snow Park Technologies rule puts the sweet spot **17–23 m** from the lip and holds the landing
  angle for at least 30 m [26]. Pro take-offs and landings are both about **39°** [27].
- **[calc] Take-off speed for a table** (sweet spot just past the knuckle):

  | Jump | Speed at the lip | Air |
  |---|---|---|
  | 8 m | 7.8 m/s | 1.1 s |
  | 12 m | 9.6 m/s | 1.4 s |
  | 16 m | 11.1 m/s | 1.6 s |
  | 20 m | 12.4 m/s | 1.9 s |
  | 25 m | 14.1 m/s | 2.0 s |
  | 30 m | 15.9 m/s | 2.2 s |

## 3. Superpipe (22 ft)

- **FIS spec [29].**
  - 6.7 m walls at an 18° ± 1° pitch, over 150 m long.
  - 19–21 m from coping to coping.
  - Decks at least 8 m wide.
- **Beijing's pipe.** 220 m long, 22 m wide, 7.2 m walls with an **82° vert** [30].
- **Transition radius.** FIS gives no figure. Mammoth's 22 ft pipe used 7.6 m of transition [33].
  [calc] A 6.5–7.6 m radius leaves a 4–6 m flat bottom in a 20 m pipe.
- **Speed and height.**
  - Measured centre-of-mass speeds are **5–13 m/s** [35].
  - Height records: **7.72 m** above the coping on a snowboard [36] and **8.04 m** on skis [34].
  - [calc] 5 m of air needs 9.9 m/s going up.
  - A frictionless drop from 6.7 m only gives 11.5 m/s, so **riders pump the transitions** [31]. A game has to model
    that.

## 4. Red Bull and comparable events

- **Red Bull PlayStreets (Bad Gastein) [38–40].**
  - A 400 m urban course.
  - A winch tow-in to a quarterpipe, an **8–9 m wallride**, a hip, a trampoline, a road gap, and a final rail section.
  - Every feature is named for a sponsor.
  - Night finals under floodlights, with DJs and about 10,000 spectators.
- **Red Bull Heavy Metal [41][42].**
  - A 30-step stair set with a kinked rail, and an 18 m kinked handrail down the Capitol steps.
  - Winch tow-ins, and finals under lights.
- **Red Bull Rail Yard (Kühtai) [43].** A 400 m rail garden with parallel lines: wallrides, down, flat-down and
  double-kink rails, and bowls.
- **Red Bull Cascade [44][45].**
  - A top-to-bottom run with a rainbow rail, a V-shaped wallride, and a 65 ft finale with two take-offs.
  - Scored on CSCDE: creativity, speed, choice of line, difficulty and energy.
- **Audi Nines [48].** A quarterpipe with four take-offs, and jam sessions where the best two tricks count.
- **The common look.**
  - Sponsor-named features and branded fencing.
  - Start and finish arches.
  - Crowds close to the course.
  - Floodlights, DJs and big screens.

## 5. Feature anatomy

- **Jumps.** A jump runs in-run, transition, lip, table (deck), knuckle, landing, run-out.
  - **Size classes [50]:**

    | Class | Distance | Kicker | Lip |
    |---|---|---|---|
    | Small | 5–8 m | 1–1.5 m | 22–25° |
    | Medium | 10–16 m | 2–3.5 m | 26–28° |
    | Large | 18–22 m | 4–4.5 m | 28–30° |
    | XL | 25–30 m | 5 m | 30–35° |

  - Keep the last ~2 m of the lip straight, to avoid surprise inversions [53].
  - Landings run 30–38°. Contest landings are about 38°, and the deck-to-landing ratio is about 1:2 [52].
- **Equivalent fall height (EFH).** EFH = v⊥²/2g, from the speed into the landing surface [53][56].
  - **0.5 m** is benign, **1 m** is a good compromise, **1.5 m** is the sensible maximum.
  - Measured resort jumps reach 3–13 m [56].
  - A straight tabletop landing gets harsher the further you overshoot the sweet spot; casing the deck at 80 % speed
    is about 6 m of EFH [calc].
  - A **constant-EFH landing** is shaped so that every take-off speed meets the slope at the same small v⊥; a test jump
    built that way measured 0.33–0.65 m [53].
- **Rails [51][58–65]:**
  - **Profiles:**
    - Round bars 5–15 cm (fat bars 15 cm, "tankers" 25 cm).
    - Flat bars 10–15 cm.
    - Boxes 30–60 cm wide, up to 1–2 m.
  - **Heights:**
    - Junior features 0.3–0.4 m.
    - Standard features 0.5–0.8 m.
    - Pro features higher (0.8–1.5 m is an estimate).
  - **Lengths:**
    - Beginner 3–5 m, standard 6–9 m.
    - Down-flat-downs 9–14 m with 10–14° kinks.
    - Urban kinks up to 18 m.
  - **Types:** flat, down, flat-down, down-flat-down, A-frame (battleship), rainbow, C / S-rail, kink, tube, ledge, and
    stair sets with handrails.
  - **Placement:** along the fall line unless they are deliberately curved.
  - **Entry:** ride-on (easier) or gap-on (0.3–0.6 m lip, 1–1.5 m gap).
- **Quarterpipes.** 4–7 m tall, with a radius of 1.0–1.15 × the height [34][48].

## 6. Games: rails and park progression

- **SSX (2012).**
  - Grinding is near-automatic: "get near a rail and you'll pop on". Critics called it magnetic and laughably
    easy [67–69].
  - The board loses speed when it turns across the rail [70].
- **Shredders.**
  - Split controls: the left stick drives the lower body, the right stick the upper body. Spins are pre-loaded by
    holding jump plus a direction.
  - Rails "test balance and entry speed" [74–80].
  - One complaint: a mission asked for a 1260 off a jump that only fits a 720 [78]. Make features fit the tricks you
    ask for.
- **Steep.** A 2017 patch added rotations and nose / tail presses on rails. Reviewers reported falling through rails
  [82–84].
- **Riders Republic.**
  - Auto-grind by default, or a manual mode with better scoring.
  - Gear parallel to the rail = 50-50; held sideways = boardslide.
  - Stick up / down presses the nose or tail.
  - A first-use variety bonus [86–90].
- **EA skate.** There is no grind button: the grind comes from speed, line-up and angle [91].
- **Tony Hawk.**
  - A horizontal balance bar on grinds.
  - Repeated tricks decay to 100 / 75 / 50 / 25 / 10 %.
  - Held grinds keep scoring over time [93][94].
- **OlliOlli World.** Reward correct play instead of punishing sloppy play, to keep players in flow [96–98].
- **Takeaways.**
  - Capture the rail within a tolerance cone, not from afar.
  - Read the grind type from the gear's orientation.
  - A balance mechanic, presses, switch-ups, and spins on and off as separate tags.
  - Variety rewards.
  - Avoid magnetism, sticking and opaque inputs.

## 7. Judging

- **FIS slopestyle.** One overall impression out of 100 for the whole run, built from amplitude, difficulty,
  execution, variety, progression, and the run's composition and flow [99–101]. The weighting is disputed: one paper
  gives overall impression 40 % [99].
- **Winning scores.** Winning runs scored **82–93** in Beijing and Livigno [102–104].
- **Big air.** The best two of three runs count, and they must be different tricks [21].

## 8. What we took from it (design rules → Voltage Park)

| Rule | Voltage Park |
|---|---|
| 3 jib sections then 3 jumps, parallel options per section | The Circuit, Surge, Overload (3 jibs each), then Lightning, Thunder, Voltage |
| 500–700 m, 150–200 m drop, mean 14–19° | The slopestyle is ~720 m to the finish line with ~210 m of drop: a 20° drop-in, a 12° jib zone, a 23° in-run, an 18–19° jump zone |
| Budget speed between sections | Long, steep in-run to Jump 1; tucked or upright arrival speeds measured by bot; an in-run gauge predicts the lip speed |
| Kickers 3–5 m, 27–30° lips, the last 2 m straight; tables 15–22 m | 3.6 / 4.1 / 4.6 m kickers, 27 / 29 / 30°, tables 15.5 / 18.5 / 22 m |
| Landings 30–38°, sweet spot 17–23 m, EFH under 1–1.5 m | Constant-EFH landings (v⊥ 3.4 m/s ≈ 0.6 m) up to 38°; sweet spots 20–26 m from the lip |
| Rails 0.5–1.5 m high, 6–14 m long, down / flat-down / DFD / rainbow / C / kink / tube / box | 38 jibs, 0.35–1.1 m high, 6–14 m: every type, plus a stair set with a handrail |
| Ride-on and gap-on entries | Flush ramps for boxes and tubes; gap-on ramps for rails |
| 22 ft pipe: 6.7 m walls, ~7 m transitions, 82° vert, pumping | The Conduit: 6.7 m walls, R 7.2 m, 82°, 6.4 m flat bottom, pumping modelled |
| Big air: 5 m kicker, 30–35° lip, 20–25 m to the knoll, 38° landing | The Tower: a 26 m scaffold, 34° in-run, 5 m / 32° kicker, 24 m table |
| Grind type from orientation; capture cone; balance; presses; switch-ups; spin on / off tags | physics/grind.js |
| Judge the run out of 100; repeats decay; gold in the 80s–90s | scoring.js: 6 sections + variety + amplitude + flow, gold ≥ 80 |
| Event look: arches, sponsor fences, crowds, floodlights, big screen | props.js |

## Sources

1. FIS PyeongChang 2018 slopestyle data: https://www.fis-ski.com/DB/pdf/2018/SB/7073/2018SB7073SLF.pdf
2. FIS Beijing 2022 slopestyle data: https://www.fis-ski.com/DB/pdf/2022/FS/8086/2022FS8086SLF.pdf
3. Milano Cortina 2026 slopestyle results: https://www.olympics.com/en/milano-cortina-2026/results/frs/je/m/ss----------------/fnl-/--------/result
4. Freeskier, PyeongChang course: https://www.freeskier.com/heres-first-look-olympic-slopestyle-course-pyeongchang
5. Downdays, Understanding the Olympic slopestyle course: https://www.downdays.eu/events/preview/understanding-olympic-slopestyle-course/
6. Snow Sports News, Beijing slopestyle course: https://www.snowsportsnews.com/articles/beijing-2022-slopestyle-course-revealed
7. Freeskier course previews: https://www.freeskier.com/winter-olympics-xxiv-course-previews
13. NBC, 2026 slopestyle reports: https://www.nbcconnecticut.com/olympics/2026-milan-cortina/snowboarding-glossary-winter-olympics/3696324/
14. Summit Daily, Livigno women's slopestyle: https://www.summitdaily.com/news/16-year-old-frisco-snowboarding-phenom-misses-podium-on-sluggish-womens-slopestyle-course-that-proved-difficult/
16. J. Vainio, big air / slopestyle speeds: https://www.lts.fi/media/lts_tapahtumat/ktp26-tiedostot/juhani_vainio_jaettava_esitys_www_ktp26.pdf
18. China Daily, Shougang: https://www.chinadaily.com.cn/a/201911/28/WS5ddf34f9a310cf3e3557a9de.html
19. BIT, Shougang: https://ceep.bit.edu.cn/english/ne/events/c9c273502c284e4b8ecb83be9300a652.htm
20. Olympedia, Beijing big air: https://www.olympedia.org/results/19020805
21. NBC, big air format and results: https://www.nbcsports.com/on-her-turf/news/2022-winter-olympics-womens-freeski-big-air-eileen-gu-gold
24. Olympedia, Livigno big air: https://www.olympedia.org/results/15001308
25. FIS big air criteria: https://assets.fis-ski.com/image/upload/fis-prod/assets/Precisions_SBFSFK_Southern_Hemisphere_2324.pdf
26. FiveThirtyEight, X Games course design: https://fivethirtyeight.com/features/how-the-winter-x-games-designs-its-courses/
27. Defector, How big can big air go: https://defector.com/how-big-can-big-air-go
29. FIS halfpipe venue requirements: https://assets.fis-ski.com/f/252177/83cfe3584c/hp-venue-requirements.pdf
30. Olympedia, Beijing halfpipe: https://www.olympedia.org/results/19020706
31. Inverse, halfpipe physics: https://inverse.com/article/41285-shaun-white-olympics-gold-snowboarding-physics-1440
33. Freeskier, Mammoth super-duper pipe: https://www.freeskier.com/mammoth-unveils-super-duper-pipe
34. Wikipedia, Half-pipe: https://en.wikipedia.org/wiki/Half-pipe
35. ISBS 2024, halfpipe speeds: https://commons.nmu.edu/isbs/vol42/iss1/87/
36. Unofficial Networks, highest snowboard air: https://unofficialnetworks.com/2026/10/05/highest-snowbaord-air-guinness-world-records/
38. InTheSnow, PlayStreets: https://inthesnow.com/playstreets-back-in-austria
39. Gastein, Red Bull PlayStreets: https://www.gastein.com/en/red-bull-playstreets
41. Slush, Red Bull Heavy Metal 2022: https://slushthemagazine.com/blogs/latest/chaos-in-duluth-red-bull-heavy-metal-2022-highlights
42. Visit Saint Paul, Heavy Metal 2025: https://www.visitsaintpaul.com/press-media/press-releases/veda-hallen-and-austin-visintainer-take-honor-at-red-bull-heavy-metal-in-downtown-saint-paul-minnesota/
43. Pleasure, Red Bull Rail Yard: https://pleasuremag.com/feed/red-bull-rail-yard
44. Freeskier, Red Bull Cascade: https://www.freeskier.com/red-bull-cascade-wraps-epic-third-year
48. Teton Gravity, Audi Nines: https://www.tetongravity.com/audi-nines-is-the-weirdest-contest-on-snow
50. Wikipedia, Terrain park: https://en.wikipedia.org/wiki/Terrain_park
51. Roberts, Terrain Park Feature Handbook: http://www.robertsski.com/webpgss/terrain-park-feature-handbook.htm
52. Newschoolers, jump building: https://newschoolers.com/forum/thread/659800/REAL-jump-landing-building
53. Petrone, Cognolato, McNeil, Hubbard, a constant-EFH terrain park jump: https://ar5iv.labs.arxiv.org/html/1611.04448
56. skijumpdesign, EFH and real jumps: https://skijumpdesign.readthedocs.io/en/stable/real-jumps.html
58. Arena Snowparks, rails and boxes: https://www.arenasnowparks.com/rails-boxes
64. Bergfex, Sane Rinn Jib Park: https://www.bergfex.com/snow-parks/sane-rinn-jib-park/
67. Worthplaying, SSX review: https://www.worthplaying.com/article/2012/3/1/reviews/85303-xbox-360-review-ssx/
70. SDA wiki, SSX mechanics: https://kb.speeddemosarchive.com/SSX_(2012)
76. TheGamer, Shredders tips: https://www.thegamer.com/shredders-beginner-tips/
78. PCInvasion, Shredders review: https://pcinvasion.com/?p=314051
83. MP1st, Steep update: https://mp1st.com/news/steep-update-allows-dlc-activities-to-be-bought-with-in-game-currency-improves-gameplay-more
86. Ubisoft, Riders Republic Q&A: https://www.ubisoft.com/en-us/game/riders-republic/news-updates/2HFvoOtBvWRtrlXOF8ZXjo/answering-your-riders-republic-questions
88. Riders Republic tricks list: https://attackofthefanboy.com/guides/riders-republic-all-ski-and-snowboard-tricks-list/
91. GamesRadar, skate hands-on: https://gamesradar.com/skate-hands-on/2
93. Can I Play That, THPS assists: https://caniplaythat.com/2020/09/07/tony-hawks-pro-skater-assist-modes-present-in-game/
94. StrategyWiki, THPS gameplay: https://strategywiki.org/wiki/Tony_Hawk%27s_Pro_Skater/Gameplay
96. Wireframe, Roll7 on OlliOlli World: https://wireframe.raspberrypi.com/articles/olliolli-world-roll7-on-making-a-bigger-better-skateboarding-game
99. JHSE 2023, slopestyle judging: https://rua.ua.es/dspace/bitstream/10045/132281/6/JHSE_18-3_01.pdf
100. InTheSnow, how snowboarding is judged: https://www.inthesnow.com/olympic-snowboarding-judged/
102. ESPN, Beijing 2022 results: https://africa.espn.com/olympics/winter/2022/results/_/view/medalrounds/discipline/33
103. Wikipedia, 2026 men's slopestyle: https://en.wikipedia.org/wiki/Snowboarding_at_the_2026_Winter_Olympics_%E2%80%93_Men%27s_slopestyle
