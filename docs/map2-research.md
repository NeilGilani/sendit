# Map 2 research: tree runs at speed

Research behind **Blackspruce Plunge** (docs/map2.md): how games and real glades make a forest
descent readable, tense and fair, turned into numbers the layout (web/src/maps/blackspruce/layout.js)
follows. Rules marked *(rec)* are derived for this game, not quoted.

## 1. Games

- **Lonely Mountains: Downhill** ([80.lv production article](https://80.lv/articles/level-game-production-lonely-mountains-downhill)):
  - The low-poly style was chosen so the trail reads "at first glance".
  - One main route through all checkpoints is the easiest and the longest.
  - Shortcuts come in tiers: official ones marked with muddy paths, semi-official ones that look natural, and unofficial ones that emerged from the physics.
  - Checkpoints are placed at blockout, before decoration.
  - The camera aims at a predicted future position, so more of the trail ahead is visible.
- **Descenders** ([Red Bull interview](https://www.redbull.com/us-en/descenders-interview), [Game Chronicles](https://gamechronicles.com/descenders-review-playstation-4)):
  - Procedural tracks are rated on steepness, curvature and stunts.
  - Checkpoints sit only on the laid-out path.
  - Criticism: the tracks blur together after many hours, so hand-placed landmarks matter.
- **Riders Republic** ([Ubisoft News](https://news.ubisoft.com/en-us/article/7Jdttfpxq3rykQWpGsVFDa/using-algorithms-to-create-riders-republics-trail-network)):
  - Trails were chosen by scoring slope and curvature, with curvature converted to turn radius.
  - Ramps go only where slope, curvature and width allow.
  - Slopes are deliberately much steeper than real ones.
- **SSX** ([Game Informer](https://gameinformer.com/games/ssx/b/ps3/archive/2011/04/13/climbing-to-the-summit), [GameSpot, Tricky](https://gamespot.com/reviews/ssx-tricky-review/1900-2833295/)):
  - Overlapping routes show the same features from different vantage points.
  - Many hidden shortcuts per course.
  - The terrain itself channels the rider, so no artificial walls are needed.
- **Steep, the anti-pattern** ([God is a Geek](https://godisageek.com/reviews/steep-review/), [Easy Allies](https://easyallies.com/review/steep), [PC Gamer](https://www.pcgamer.com/steep-review/)):
  - Some trees let you pass through while others wreck you.
  - It is hard to judge what will cause a crash.
  - Objectives are hidden behind trees.
  - Lesson: **consistency beats leniency**.
- **Hitboxes:** a hurtbox smaller than the art, so near misses read as misses, is standard ([Bugnet](https://bugnet.io/blog/how-to-build-a-hitbox-and-hurtbox-system)). Faster games can afford more forgiving hitboxes ([Critpoints](https://critpoints.net/page/57)).
- **Racing-track design:**
  - Sight lines must show where the course goes ([MTM2 sightlines](https://mtm2.com/~mtmg/traxx/sightlines.shtml)).
  - Difficulty is roughly the distance between clipping points and how much correction the vehicle needs between them ([A Rational Approach to Racing Game Track Design](https://gamedeveloper.com/design/a-rational-approach-to-racing-game-track-design)).
  - Width is margin for error ([McMillan](https://www.gamedeveloper.com/design/feature-the-fundamentals-of-arcade-style-racing-track-design)).

## 2. Real gladed terrain

- **Spacing bands** ([avalanche.org](https://avalanche.org/?p=3328)):
  - Dense: under ~3 m between trees.
  - Gladed: ~3–10 m.
  - Open: over 10 m.
- **Cut glade lines** are 6–12 m wide ([Seven Days, Vermont glades](https://www.sevendaysvt.com/news/into-the-wilds-backcountry-skiers-push-for-state-help-in-carving-new-glades-2296256/)).
- **Heli-ski glading** thins trees for "smooth, flowing lines", pairs mellow and aggressive sections, and exits into open ground ([Last Frontier](https://www.lastfrontierheli.com/news/gladed-tree-skiing-last-frontier-heliskiing-behind-the-scenes/)).
- **Technique:** riders treat the trees "as a slalom course" and avoid blind roll-overs ([Last Frontier tips](https://www.lastfrontierheli.com/news/tips-for-safer-tree-skiing/)).
- **Hazards:** tree wells, logs, stumps, pillows hiding them, rock bands and chutes ([Ski Utah](https://www.skiutah.com/blog/tips-on-tree-well-safety-for-skiers)).
- **Real speeds are far lower than ours.** Advanced skiers average ~15.6 m/s on open slopes ([Schweitzer, after Stepan 2023](https://www.schweitzer.com/discover-schweitzer/blog/safety-month)). At 18–28 m/s, our lanes must sit at the top of the glade band.

## 3. Human factors

- **Reaction time:** expert riders take 0.86 s (skiers) and 1.06 s (snowboarders) to react to an obstacle appearing over a crest ([ASTM STP](https://store.astm.org/stp49266s.html)).
- **Giant slalom is our rhythm** ([Frontiers in Sports 2020](https://www.frontiersin.org/articles/10.3389/fspor.2020.00107/full)):
  - 15–18 m/s.
  - Turns of 1.4–1.7 s.
  - Gates ~26 m apart with a 6–7 m lateral offset.
- **Carving physics:** R = R_sidecut · cos(edge angle); lateral acceleration a = v²/R. In this game the ski grip limit is `latG` 1.8 and the board's 1.45–1.6 (config.js), so the tightest sustainable radius at 20 m/s is ~23 m on skis.

## 4. Rules used for Blackspruce Plunge

Units: v = speed (m/s). "Hitbox gap" means trunk hitbox to trunk hitbox. The rider is a 0.35 m circle.

1. **Main lanes:** a free corridor for the rider's centre of ≥ 0.3·v, i.e. a lane half-width `hw` of 4–5 m (≈ 7 m free). Fast slots: ≥ 0.12·v, `hw` 2.1–2.6 m (≈ 3.5–4.5 m free). Never below 1.5 m free.
2. **Curvature:** every lane's centre line keeps R ≥ v²/(2.2 g)·1.2. That is ≥ 22 m at 20 m/s for main and safe lanes and ≥ 33 m for slots ridden at 25–28 m/s. Checked by script (min R per lane is in docs/map2.md).
3. **Rhythm:** about one turn every 1.5–2.5 s. The lane weave (2.6 m amplitude over an 84 m wavelength on the main line) plus pivot obstacles every 34–48 m on alternating sides.
4. **Pivots** (one tree or rock in a lane's middle):
   - Only where `hw` ≥ 3.7 m.
   - Offset 18–35 % of `hw` to one side, so one side is clearly wider.
   - Never within 25 m of a gate, in a section's first 30 m, or within 55 m after a roller (where you are airborne).
   - Never near a log, a kicker or the rock band.
5. **Sight lines:** decisions visible ≥ 2 s ahead (40–55 m). Lanes branch and merge gradually (≤ 0.5 m of drift per m), and their mouths are framed by large "marker" spruce.
6. **Rest beats:**
   - A clearing every 12–18 s of riding, each holding a challenge gate.
   - Small glade pockets inside the long sections.
   - Air only where it is meant: kickers, the cliff band, logs, pillows, a few rollers in open ground. The trees need snow under your feet to steer, so the general lumps were cut to 1 m.
7. **Jump clearings:**
   - Straight, tree-free run-in of ≥ 30 m.
   - Landing ≥ 30 m long and ≥ 28 m wide.
   - No pivot within 2 s after it.
8. **Route split:**
   - The safe line is wider and wanders more, and takes the chute instead of the cliff.
   - The fast line is narrower and straighter, and rewards a tuck: it is ~1–1.5 s faster per section in the bot, at 25–28 m/s.
   - Every split rejoins before a gate.
9. **Near-miss economy:** the slots put the rider ~2 m from the trunks, so close shaves (≤ 3.2 m) fire constantly. The bot logs ~100 per run on the fast line versus ~45–60 on the main line. Risk pays in score as well as time.
10. **Fair collisions:**
    - Every trunk, rock and stump collides the same way, and nothing that looks solid lets you through.
    - Tree hitbox = trunk + dense core: 0.2 m + 0.32 × crown width scale (0.32–0.45 m), well inside the needles. Brushing branches is a close shave, not a crash.
    - Rocks collide at their visible (sunk) footprint.
    - Logs are not hitboxes: they are part of the height field, so you ride over them as you see them.
11. **Readability:**
    - Lanes are bright, clean snow. The forest floor under trees is darker (needle litter, shade; splat B).
    - Lane-edge trees are narrow spires, like subalpine fir or a limbed glade, so the corridor stays visible and the chase camera stays out of the needles.

## 5. What playtesting added (bots, sightline checks, in-game playtests)

12. **Sightline thinning.** A pivot hidden behind a lane-edge crown on a curve is invisible until about 1 s before you reach it. After planting, any crown that blocks the view from the lane 25–50 m before a pivot is removed, as real glade crews do. Lane-mouth landmark trees are tall but narrow.
13. **No pivot mid-traverse or right after air.** Pivots are skipped:
    - where the lane drifts faster than 0.35 m/m;
    - within 55 m after a roller, or 45 m after a pillow on the lane (at 25 m/s you fly 30–40 m);
    - in a side lane's first 60 m.
14. **Third-person camera.** The chase camera trails ~6.5 m behind on the rider's path, so whatever the rider threads at 1–2 m, the camera threads too. Pivots and lane-edge trees are slim spires (crown ≤ ~1.2 m), so near misses don't bury the view in needles.
15. **Air budget.** In the trees the rider needs snow underfoot to steer. Background lumps of 1.6 m threw the bot into 1–1.5 s airs every few seconds and into trees; 1 m lumps and 0.3 m ribs fixed it. Air belongs to features: kickers, the cliff, logs, pillows and rollers in the open.
16. **Rest beats measured.** Close shaves per second (bot) are 0.2–0.55 on the flow line, 0.8–1.5 in the slots and 0 in every clearing (6–9 s). This confirms the rhythm of tight sections broken by rest beats with checkpoints.
