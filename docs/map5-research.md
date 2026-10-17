# Map 5 (Dragonback): research — riding ridges, ridge to ridge

What makes a face of ridges fun to ride fast, and how that turns into terrain rules for Sendit's honest
jump physics. Three sources: riding Ravenspire's ridge (the user's reference), published material on spine
and ridge riding, and the physics of landings. Everything quoted from elsewhere is paraphrased; numbers I
derived myself are marked *(derived)*. The rules at the end are what [map5.md](map5.md) builds.

---

## 1. The reference: Raven's Beak on Ravenspire

The "small mountain ridge to the right of the central path" on Ravenspire is **Raven's Beak**
(`maps/ravenspire/layout.js BUTTRESSES`): a rock arête along the fall line at v ≈ 120 → 205, u 120–780,
standing 22–31 m above the face. Its cross-section is `H·(1 − |d|/w)²` (w = 58 m): a sharp crest with
concave flanks, steepest just under the crest (≈ 54°) and easing into the face. Along the crest, ridged
noise makes the height step up and down every 25–50 m.

I rode it with the map 3 bot (real Player physics, Ravenspire's tuning), along the crest, across it and off
its right flank, on skis and a board (`node` scratch runs over `map3-ride.mjs`):

| line | what happened |
|---|---|
| along the crest | an air every 25–50 m (u 177, 212, 257, 279, 308, 335…): 1–2 s each, landing on the next crest segment falling away at the face angle; most clean |
| off the crest sideways | 35–60 m drops, 2–3.5 s of air, landing clean (impact 5–9 m/s) on the concave flank |
| across it at u 300 | a 1.8 s air off the crest's far side, a 4–5 s flight from the next roll, clean |
| crest at full tuck | the end of the buttress (u ≈ 578) is where the crashes were: the crest fades into a 90–100 m "drop" at 40 m/s |

**Why it is fun** (what the bot numbers and the shape say):

1. **Rhythm.** An air every 1–2 seconds, always onto a slope that falls away as fast as you do. It's a
   staircase of short flights, not one big jump.
2. **The concave flank is a perfect landing.** A rider who leaves the crest sideways is over a slope that
   steepens under them, so the landing matches the trajectory. Big drops, low impacts: you feel huge and
   you stomp it.
3. **Exposure and choice.** On the crest you're the highest thing around, with drops on both sides; every
   few seconds you choose to stay on top (more airs, more speed) or peel off into the face.
4. **Danger only at the end.** The one place it hurts is where the ridge runs out over nothing at full
   speed. That's a feature to design deliberately (prows), not to stumble into.

So map 5 multiplies Raven's Beak: many such ridges, with the in-between space shrunk, and the transitions
*between* ridges made into the main event.

## 2. Spines, arêtes and ridge riding (published)

- **Alaska spines** form where sluff peels off rock ribs and builds fluted crests. They collect two to three
  times the snow of the slopes around them and stick to 45–60° faces in maritime snowpacks. Thompson Pass
  heli terrain runs 40–60° (Conway & Newcomb, ISSW 1998). The Haines "Mono Spine" is ~610 m of continuous
  spine at 45–55° (TGR, The Ski Journal).
  <https://arc.lib.montana.edu/snow-science/item/1537>, <https://www.theskijournal.com/2025/03/haines-spines-with-parkin-costain/>
- **Sluff channels** are what make spines rideable. Loose snow drains off both sides into the channels,
  away from a rider on the crest. Guides say to keep your speed up, stay high and let the sluff run past.
  The dangerous spot is where a spine ends between two converging channels.
  <https://avalanche.org/avalanche-encyclopedia/human/travel-advice/sluff-management/>
- **Arêtes** are thin rock ridges left between two cirques. **Cols** are the low notches across them,
  **horns** are where three or more arêtes meet, and **cleavers** split a glacier. That's a natural map
  grammar: a summit ridge, arêtes running down from it, notches you can fly.
- **Knife-edge crests** are rock, rime and wind-scoured snow, often corniced on the lee side. Wind lips are
  small rounded lee-side cornices, and FWT judges count them as natural kickers.
  <https://nwac.us/?p=15142>, <https://learning.nzsia.org/?p=14842>
- **Airing ridge to ridge.** No source gives measured gap distances, but the advice is consistent: speed
  carries you further than you think, scout the landing, take the impact in the fall line. The landing is
  what hurts: a flat or gully-bottom landing turns the whole fall into impact.

## 3. Big-mountain venues and judging

| venue | vertical | pitch | character |
|---|---|---|---|
| Verbier, Bec des Rosses (Xtreme) | ~600 m | avg 43–45°, up to ~51° | cliffs, couloirs, exposure |
| Fieberbrunn, Wildseeloder | 583 m | avg 48° | the tour's cut venue |
| Baqueira, Tuc de Baciver | 385–430 m | avg 42° | narrow chutes, rock drops |

The Freeride World Tour judges **Line, Control, Technique, Fluidity, Air & Style** and gives one overall
impression score out of 100. Since 2024 the categories are averaged rather than summed, so big-air spam
can't beat a hard line. Natural features count for more than side hits.
<https://freerideworldtour.com/judging>, <https://www.tetongravity.com/what-goes-into-a-freeride-world-tour-score>
Natural Selection's "Spinal Tap" venue in the Tordrillos is a whole face of spines, scored on creativity,
risk, execution, difficulty and flow.

## 4. Landing physics

- **Equivalent fall height**: EFH = v⊥² / 2g, where v⊥ is the speed into the landing slope. About 0.5 m is
  benign, 1.0 m is a good design target, and 1.5 m is where knees collapse and the absolute limit for built
  jumps. Severe injuries were measured at 3–10 m. That makes v⊥ about 3.1 / 4.4 / 5.4 m/s.
  <https://skijumpdesign.readthedocs.io/en/stable/real-jumps.html>, <https://ar5iv.arxiv.org/html/1611.04448>
- **Mismatch tolerance** *(derived)*: for 1 m EFH, the flight path and landing slope may differ by
  about 22° at 12 m/s, 16° at 16 m/s, 13° at 20 m/s and 10° at 25 m/s. At Dragonback speeds, landings must
  run almost parallel to the flight.
- Expert kicker studies (Böhm & Senner 2008) found impacts climb steeply once the landing is shorter than
  ~15 m or flatter than the flight. Knuckle landings tip riders forward.
- **Sendit's scale.** The game's thresholds are more forgiving than real knees: Ravenspire's `hardLanding`
  is 17 m/s and `crashImpact` 24 m/s, after deep powder soaks up 5 m/s. Wind-packed crests soak up nothing.
  What carries over from the research is *geometry*: a landing that falls away with the trajectory is soft
  at any size; one that doesn't is hard at any size.

## 5. How games use ridgelines

- **Steep**: drop zones (fast travel to the top of a line), Mountain Stories (named, guided descents with
  objectives) and a Freerider score for line quality. Critics complained that areas looked alike.
- **SSX 3 / SSX (2012)**: one continuous mountain with branching shortcuts, where knowing the route matters
  as much as tricks. Deadly Descents are survival runs.
- **Descenders**: risk/reward, because bailing costs progress, so each risky line is a gamble.
- **Grand Mountain Adventure**: challenges built from terrain shape, plus gaps in marked paths that tempt
  you onto side routes.
- **The general pattern**: a high route that's hard to stay on but pays well, beside a low route that's easy
  and pays less. The low route must never be a dead end.

---

## 6. Terrain rules for Dragonback

From the Beak, the research and the hop lab (`web/scripts/map5-hops.mjs`, real physics at 20–32 m/s):

**The face.** 40° under the ridges (38° through the middle band), which gives terminal speeds of 28–31 m/s
tucked (50–70 mph) and the steep landing everything relies on. Gully floors are the base face itself, so
they're never flatter than the face (the research asks for ≥ 15° in channels).

**Ridges** (`ridges.js`): `H · (1 − x)^p` with p = 1.6–2.0 (concave flanks) and x measured from a rounded
crest top.
- Crest heights 10–42 m above the gullies; foot half-widths 22–66 m.
- Flanks 40–55°, with rock exposed above ~46° (the splat), so ridges read as rock walls with snowy crests.
- Crest tops: 2–2.4 m half-width for knife edges (the Blade, the Knife), 3–6 m for fins, 9 m for the broad
  Keel.
- Crests are wind-packed (faster, no powder absorption). Gullies are deep powder.

**Gendarme steps** (crest step-downs, 5–8 m): Ravenspire's cliff shape. The crest flattens over a bench
4 × the step long, then its last 24 m roll over by 0.2 in slope, so the take-off points *down* the landing
and the landing is the next crest segment at the face angle. A step every 120–200 m gives the Beak rhythm:
the bot gets 1.5–3 s airs, almost all stomped.

**Notch gaps** (`gaps`): a short steep wall down N m (12–22), a floor L m (5–10), and a far wall climbing
back over 1.4·N (the first version used 2.6·N, and full-speed riders landed on the rising wall at 19–23 m/s
impact). The crest beyond is S m lower (4–7).
- **Clearing speed** *(derived)*: flight t = (v_n + √(v_n² + 2·g·cos θ·S)) / (g·cos θ), and distance
  ≈ v·t + ½·g·sin θ·t². A gap ~45 m long with S = 6 clears from ~24 m/s.
- Short: you land on the far wall (hard, still rideable). Way short: you drop into the notch and ride it out
  sideways (the recovery line).

**Ridge-to-ridge hops** are the core of the map, and the design went through three versions:

1. *A wind lip on the crest's edge, aimed at the next ridge.* At 26–30 m/s a rider on a fall-line crest
   can't turn 30–35° in the last few metres, so they launched straight ahead and landed back on their own
   ridge.
2. *A spur*: a short side arête running from the crest straight at the target, ending in a kicker. Riding
   the spur makes you fly the right way. But spurs that left the crest at an angle threw fast riders off the
   main crest's convex top (a diagonal crossing of a crest is a kicker), and spurs lower than their parent
   ridge were buried behind a saddle.
3. *Tangent spurs*, the final version. The spur leaves the crest tangentially, curves out (t²) over its
   first 40 %, then runs straight at a point ~5 m past the target crest. It stays as high as the parent
   crest (−8 % by its end), and the kicker rises 2.5 m over ~12 m (≈ 10–12° above the crest, inside the
   research's 5–15° for crest lips).

Measured *(hop lab)*: the target sits 10–25 m below the kicker and 40–60 m across. Flights last 2–3.5 s and
cover 45–80 m, landing within ±5 m of the target crest from 20 to 32 m/s on both gears, at 4–15 m/s impact
(stomped to clean). The lateral reach is ~speed · sin(spur angle) · t ≈ 26 · 0.45 · 2.5 ≈ 30 m, plus the
spur's own offset.

**Ridge spacing.** Hop pairs are 40–60 m apart crest to crest (the research's spine spacing ≈ v · 1.3 s
gives 34–40 m at 26–30 m/s). Big ridges that you *don't* hop are 100–130 m apart, with V-gullies where the
flank feet meet.

**Prows** (ridge ends): the ridge's full height (14–30 m) as a cliff, with the rolled lip, onto the 38–40°
face. That's the Hammer recipe from Ravenspire, landable at full speed.

**Recovery.** Every gully is continuous to the apron, at the face angle, in deep powder (slower than the
packed crests, and no airs, so it scores less). A missed hop lands you on the target's flank or in the gully
between, never on a flat.

**Rhythm.** About 120–200 m of crest, then a feature (step, gap, spur), then the next decision. On the
Spine line that's an air every 2–4 s at 25–30 m/s. The open bowls (the Hollow, the apron) are the breathing
room.
