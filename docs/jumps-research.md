# Jumps: research, targets and the rebalance

Why big airs felt like a cannon, what real jumps look like, how the game models them now, and the numbers
before and after. Code: `web/src/player.js` (trajectory, pop, slow-mo), `web/src/physics/edge.js` (rotation),
`web/src/features.js` (kickers), `web/src/maps/ravenspire/` (cliff lips, tuning). Tunables:
docs/equipment.md ("Air and tricks", "Tunables") and docs/map3.md (§3).

Sources: the research below was done from written sources only (physics papers and their abstracts, course
specs, coaching articles, reviews and interviews; no video). [S] = stated by a source, [C] = computed (a
point-mass flight with drag, g = 9.81, ρ = 1.0 kg/m³, m = 75 kg), [E] = estimate.

## 1. Real jumps in numbers

### Trajectories and kicker sizes
- Olympic big air: take-off ≈ 15–18 m/s (55–65 km/h), lip 32–35°, ≈ 5 m high, ≈ 20 m to the knoll, landing
  36–39° [S: olympedia.org Beijing 2022 course data; Milano-Cortina 2026 course deck (lts.fi); X Games course
  design via fivethirtyeight]. Fenway Big Air 2016: ≈ 18 m/s take-off [S: Boston Globe].
- Resort park lips 13–25°, slopestyle 14–19 m/s take-offs; a Swiss study of 23 park jumps found take-off
  speeds of 6–17.6 m/s [S: skijumpdesign.readthedocs.io "real jumps"; DOAJ Swiss park study].
- **Pop on a lip is small**: measured rider pop on a test jump was −2.48 … +1.12 m/s [S: Petrone, McNeil &
  Hubbard, arXiv 1611.04448]. Most of a kicker's air is the ramp, not the legs.
- Air time by size [C, CdA 0.3]: small (15 ft, 9 m/s, 22°) 1.3 s, apex 0.6 m; medium (30 ft, 12 m/s, 26°)
  1.9 s, 1.4 m; large (60 ft, 15 m/s, 30°) 2.3 s, 2.8 m; XL / big air (80–100 ft, 17–19 m/s) 2.7–3.2 s,
  4–5.3 m. Sources quote big air at ≈ 2–3 s.
- Cliff drops [C]: 10 m → 1.4 s, 20 m → 2.0 s, 30 m → 2.5 s, 50 m → 3.3 s. Jamie Pierre's 75–78 m record
  drop had ≈ 4 s of air and left a 1.8 m powder crater [S: Wikipedia, KSL]. Freeride World Tour faces are
  43–51° [S: FWT venue pages]; competition airs are typically ≈ 5–20 m [E].

### Drag
- Wind tunnel, slopestyle / big air athletes: CdA 0.30–0.95 m² for skiers, 0.35–0.55 m² for snowboarders;
  posture dominates, baggy clothes add [S: Wolfsperger et al. 2021, abstract]. A tight tuck is ≈ 0.18 m²,
  upright ≈ 0.65 m² [S: MDPI Proceedings 2(6):313].
- With CdA 0.4 (k = ρ·CdA / 2m ≈ 0.0027 /m) drag cuts the distance of a flight by ≈ 2 % at 10 m/s, 6 % at
  20 m/s and 9–14 % at 25–30 m/s, but the air time by only 1–4 % [C]. Terminal speed ≈ 60 m/s.

### Landings
- What hurts is the speed straight into the slope: equivalent fall height EFH = v⊥² / 2g. 0.5 m is benign,
  1 m the design target, 1.5 m where the knees give (v⊥ = 3.1 / 4.4 / 5.4 m/s) [S: skijumpdesign; McNeil et al.].
- At 20 m/s a 10° mismatch between flight and slope is ≈ 0.6 m EFH, 15° ≈ 1.4 m, 30° ≈ 5 m [C]: knuckles and
  flats hurt; a 40–45° powder landing turns ≈ 25–35 % of a straight drop into impact, and deep powder
  lengthens the stop ≈ 3× [C].

### Rotation
- **Angular momentum is set at take-off** (the lean, the pop and the arm "set" on the lip); in the air riders
  can only change shape: tuck to speed up, extend arms and legs to slow down and spot the landing [S: The
  Conversation (aerials biomechanics), Loughborough thesis 2134/10784].
- Inertia: a diver straight ≈ 14 kg m², tucked ≈ 4 (3.5×) [S: tutorchase]; with skis / a board the usable
  ratio is lower, ≈ 2–2.5× on the flip axis and 1.5–2× on the spin axis [E]. Holding a posture needs joint
  torque ∝ ω² [S: lida.sport-iat.de 4047894].
- Rates: freestyle aerials do 3 layout flips + up to 5 twists in ≈ 2.6 s (flips ≈ 1.15 rev/s, ≈ 415°/s)
  [S: FIS aerials data]; a quad cork 1800 needs ≥ 2.8 s of air [S: Red Bull via WGBH]; a 2340 was done in
  ≈ 2.5 s [S: Defector]. Rotation amount is driven more by angular velocity than by air time [S: Beijing 2022
  halfpipe IMU study]. Corks come out a median 25° short of their name; White's cab double cork 1440
  measured ≈ 1122° [S: Google Cloud / USSA analysis].
- Derived [C]: spins average 500–650°/s for strong riders (≈ 900°/s nominal at record level), flips 1.0–1.4
  rev/s; riders spend ≈ 0.2–0.3 s after the lip before full rotation and open 0.3–0.5 s before touchdown, so
  the tucked peak is ≈ 1.3× the average.
- **Flips per air time**: ≈ 1 flip at 1.0–1.3 s, 2 at 1.9–2.3 s, 3 at 2.6–3.0 s, 4 at ≥ 2.8–3.2 s (record
  level only). Spin ≈ (T − 0.4 s) × 650°/s for a strong rider.

### Games
- **Steep** (Ubisoft 2016): relatively realistic physics; hold to load the jump, release at the lip; the spin
  grows with how long you hold the stick and must be released before the landing [S: Twinfinite, CGMagazine,
  Destructoid].
- **Riders Republic**: an auto mode picks the "safest amplitude" and lands it for you (no landing bonus);
  manual landing scores more; rodeos / corks need ≥ 720 [S: Ubisoft accessibility notes, Twinfinite].
- **Shredders**: "as close to the real thing as possible"; pre-wind the stick before the lip and flick at the
  pop — pop timing speeds the rotation up; a triple needs the timing exactly at the lip [S: Kotaku, Pure Xbox].
- **Mark McMorris Infinite Air**: a physics model, wind-up ≈ 1 s before the lip, torque in the air; flips are
  hard to control once started (over-rotation when the height is misjudged) and the narrow landing window was
  criticised as unforgiving [S: Game Informer, Thumbsticks, Steam forums].
- **SSX**: hang time grossly inflated and big tricks gated behind a meter [S: reviews].
- None of them uses in-air slow motion; if a game does, research-based advice is ≤ 0.6–0.7×, ≤ 1 s, only on
  airs > 2.5 s, never in the last ≈ 0.4 s before touchdown.

## 2. Targets for the game

| | target |
|---|---|
| kicker air | S ≈ 1.1–1.6 s, M 1.4–1.9 s, L 1.8–2.4 s (Valcrest's kickers land on the open slope, so a little more than a built landing) |
| cliff air | 10 m ≈ 1.4 s, 20 m ≈ 2 s, 30 m ≈ 2.5 s, plus what speed adds — but no 100 m flights off a 20 m cliff |
| pop | small on a lip (≲ 1–2 m/s), less at speed; no bonus multipliers |
| drag | k = ρ·CdA/2m with CdA ≈ 0.4 m² (thin air ≈ 0.9 kg/m³ on Ravenspire); compact (tuck / grab) ≈ 0.7× |
| gravity | 9.81 m/s² in the air (hang time from slow-mo, not from float) |
| flips | ≈ 180°/s open, ≈ 410–425°/s (1.15 rev/s) tucked, tuck : open ≈ 2.3; max ≈ 1 at 1.1 s, 2 at 2.1 s, 3 at ≈ 3 s; 4 practically never |
| spins | 345–390°/s neutral, 500–565°/s tucked, open × 0.6; ≈ 720 on a 1.8 s air, 1440 needs ≈ 3 s |
| skill | the set comes from timing (wind-up / preload, pop at the lip) and the release (spot the landing) |
| slow-mo | 0.7×, ≈ 0.3 s held, only on ≥ 2.8 s airs ≥ 10 m above the snow, never near the touchdown |

## 3. What was wrong and what changed

1. **Valcrest launch bug** (the "shot into the sky at the start of the jump"): kickers were built from the
   centre-line ground height; on a cross-slope the downhill half of a ramp started 0.4–1.1 m above the snow —
   a vertical step at the very start of the ramp on 11 of the 17 kickers. The fine one-sided lip normal turned
   that step into a 57–69° launch at 9–13 m/s straight up. Fixed at the root (`kickerY()` fades the levelling
   in), with a guard (`followMaxRate`: the ground follow never turns the path up faster than 12 rad/s) and a
   regression check (`jumps-valcrest.mjs --check`, 2870 take-offs: 461 anomalous before, 0 after).
2. **Cannon flights** (Ravenspire): five things added up —
   - air drag was a fifth of a real rider's (k ≈ 0.0006 / 0.0004 instead of ≈ 0.0027);
   - `airGravity` 0.9: hidden float;
   - a full 4.2–4.6 m/s pop (+20 % in flow) on any lip at any speed: worth +0.75 s and +24 m off a cliff at 30 m/s;
   - the cliff benches ended in a 0.15–0.5 m snow bump, a 10–15° kicker at 30 m/s, so take-offs pointed out
     over the 41° landing instead of down it;
   - rock teeth (1–2.6 m knobs) sat on the lip right on the canonical lines: more kickers.
   Now: k = 0.0027 (0.0025 thin air), g = 9.81, pop × 0.8 on a kicker lip and fading to 45 % at 26 m/s, the last
   24 m of each bench roll over (radius ≥ 120 m, followable at 35 m/s) and the teeth stay clear of the lines.
3. **Slow-mo overkill**: 0.45× for 0.5 s (+0.43 s of wall-clock) on every air over 2.4 s → 0.7×, 0.3 s hold,
   only on ≥ 2.8 s airs ≥ 10 m above the snow (+≈ 0.2 s).
4. **Seven flips**: the flip rate was a motor — hold W / S and it spun at 5.6–6.2 rad/s (+15 % in flow) for as
   long as the air lasted, and the old Ravenspire airs lasted 5–6.5 s. Now rotation is angular momentum
   (docs/equipment.md "Air and tricks"): set at the take-off by the wind-up / preload and the pop timing,
   finished by a short throw, then only tuck / open / spot; a tight tuck tires after 1.6 s. Spins and grabs got
   the same treatment (spin set + throw + arms in / out; grabs take time to reach and are let go before
   touchdown).

## 4. Before and after

### Ravenspire (web/scripts/jumps-bench.mjs ravenspire: every air > 1 s on the line, max over the airs;
"max flips / spin" = each take-off replayed with a frame-perfect trick input: preload or wind-up loaded on the
snow, pop at the lip, the key held to touchdown)

Each cell: longest air (wall-clock with the slow-mo) / farthest flight from the lip / greatest height above
the snow / most flips a frame-perfect set allows. ski · snowboard. "send" = tucked, popping every lip;
"roll" = no pop; "+flow" = the SEND IT state held the whole way.

| line | before | after |
|---|---|---|
| Stacks send | 5.32 s (5.75) / 158 m / 47 m / 4.7 · 5.27 s / 147 m / 47 m / 4.9 | 3.20 s (3.38) / 70 m / 31 m / 3.1 · 3.30 s / 75 m / 32 m / 3.3 |
| Stacks send +flow | 5.37 s / 156 m / 48 m / 5.5 · 5.40 s / 154 m / 48 m / 5.9 | 3.52 s / 85 m / 32 m / 3.6 · 3.30 s / 75 m / 32 m / 3.6 |
| Stacks roll | 4.34 s / 118 m / 38 m / 4.6 · 4.14 s / 98 m / 36 m / 4.8 | 2.95 s / 67 m / 30 m / 3.1 · 2.68 s / 55 m / 30 m / 3.2 |
| Station Cliff send | 4.42 s / 117 m / 30 m / 4.1 · 4.07 s / 100 m / 29 m / 3.9 | 2.38 s / 57 m / 18 m / 2.5 · 2.40 s / 53 m / 18 m / 2.6 |
| Station Cliff send +flow | 5.07 s / 152 m / 35 m / 5.2 · 4.87 s / 137 m / 32 m / 5.3 | 2.48 s / 67 m / 19 m / 2.7 · 2.45 s / 62 m / 18 m / 2.8 |
| Hammer send | 5.14 s / 127 m / 52 m / 5.2 · 5.09 s / 119 m / 51 m / 5.1 | 3.63 s (3.82) / 73 m / 41 m / 3.6 · 3.63 s / 69 m / 41 m / 3.6 |
| Hammer send +flow | 6.05 s (6.48) / 170 m / 64 m / 7.1 · 5.50 s / 148 m / 57 m / 6.4 | 4.12 s (4.30) / 95 m / 44 m / 4.5 · 3.73 s / 79 m / 41 m / 4.1 |
| Ravine send | 2.70 s / 55 m / 5 m / 4.8 · 2.75 s / 66 m / 16 m / 2.4 | 2.27 s / 49 m / 13 m / 2.3 · 2.28 s / 49 m / 13 m / 2.5 |

Take-off speeds are the same (27–33 m/s, the map's 50–70 mph lines). Most spin a perfect set allows: before
up to 1700–2760°, after 1130–1700° (a strong 1440 on a 3 s air). The slow-mo adds ≈ 0.18 s of wall-clock to
the biggest airs (it added 0.43 s to every air over 2.4 s). The only air over 4 s left is the Hammer in a
held SEND IT state (10 % more speed), and it allows 4–4.5 flips only with frame-perfect inputs.

Blackspruce's kickers (entered at 12 / 15 m/s): air ≤ 2.07 / 2.13 s, ≤ 6.7 m above the snow, ≤ 24 m, max
2.1 / 2.2 flips, 770 / 1000° of spin.

Ravenspire line bots (map3-ride.mjs, all 24 line × gear × style runs through the real forest): all reach the
valley; The Classic, Station to Station, Hammer Time, Pillow Talk and Into the Gorge still complete; numbers
in docs/map3.md §6.

### Valcrest kickers (jumps-bench valcrest: the three signature kickers entered at 10 / 13 / 16 m/s, popped at the lip)

| | air | height above the snow | distance | max flips | max spin |
|---|---|---|---|---|---|
| before, ski / board | ≤ 1.83 / 1.92 s | ≤ 6.3 / 6.7 m | ≤ 21 / 23 m | 1.56 / 1.71 | 589 / 750° |
| after, ski / board | ≤ 1.73 / 1.80 s | ≤ 5.9 / 6.2 m | ≤ 19 / 20 m | 1.75 / 1.88 | 676 / 841° |

(The "before" maximum flips on Valcrest were limited by the old input lock; the ceiling is now physical: 1.9
flips on a 1.8 s air, right on the research curve.)

### Synthetic kickers (physics-kicker.mjs, 16° slope, popped at the lip, skis)

S / M / L: 1.70 / 1.85 / 1.97 s → 1.55 / 1.73 / 1.85 s (straight 1.12 / 1.28 / 1.45 s, unchanged).

### Rotation ceiling (physics-tricks.mjs: a perfect set, tucked to touchdown)

| air | 1.1 s | 1.4 s | 1.8 s | 2.2 s | 2.6 s | 3.0 s | 3.4 s | 3.8 s |
|---|---|---|---|---|---|---|---|---|
| flips (ski / board) | 0.95 / 0.98 | 1.41 / 1.46 | 1.85 / 1.91 | 2.26 / 2.33 | 2.61 / 2.69 | 2.92 / 3.01 | 3.19 / 3.30 | 3.4 / 3.6 |
| before (flipRateMax, constant) | ≈ 1.0 | ≈ 1.3 | ≈ 1.6 | ≈ 2.0 | ≈ 2.3 | ≈ 2.7 | ≈ 3.0 | ≈ 3.4 (and 7 on a 6.5 s Ravenspire air) |

The old rate was not too fast; the airs were too long and nothing limited a held key. Now a long air gives a
little more rotation, not proportionally more.

## 5. How it feels (and what to tell players)

- Kickers: honest 1.5–1.9 s airs; a 360 or a backflip comes easily, a double needs the preload and the pop
  right at the lip on the biggest kicker.
- Ravenspire: the cliffs are still big (2.4–3.6 s, 18–41 m above the snow at 50–70 mph), but the flight
  follows the landing instead of sailing over it; 60–75 m from the lip instead of 100–170 m.
- Tricks wind up, rotate steadily and slow into the landing; the rider visibly tucks, opens into a layout and
  spots. Over- and under-rotation happen for physical reasons (too much set for the air, a held tuck, an early
  pop), not because of a cap.
- The control change players will notice: **spins and flips are thrown at the lip** — steer / S while loading
  the pop, release at the lip, keep the stick in for the throw. Steering late in the air no longer starts a
  full spin (since §7: only a slow late 180 / 360 on a big air). The in-game hint text (ui.js, not part of this change) should say so.

## 6. Follow-up: flips on big airs (easier singles, no dead keys)

Players found a single flip nearly impossible on big airs and W / S sometimes did nothing mid-air. Measured
with `node web/scripts/jumps-bench.mjs all both --quiet --ease` (every real take-off on the three maps,
skis and board, with and without SEND IT, replayed with the inputs players actually use):

| input (Ravenspire airs ≥ 2.8 s · 2.2–2.8 s) | before: clean singles | after |
|---|---|---|
| S pressed 0.5 s into the air | 0 % · 0 % | 100 % · 78 % |
| S pressed 1 s into the air | 0 % · 0 % | 94 % · 9 % |
| W held through the take-off (a tuck), re-pressed at 0.6 s | 0 % · 0 % | 100 % · 43 % |
| a grab held + S at 0.3 s | 0 % (flip keys blocked while grabbing) | a flip lands 13 % · 83 % (sketchy: let go to spot) |
| frontflip preload | did not exist | lands a flip 69 % (a double on the biggest airs) · 74 % |
| S / W at the lip | 74–89 % | 88–100 % |
| W held as a tuck all the way | 0 flips (correct) | 0 flips (correct) + a one-time hint |

Kickers (1.4–2.1 s): at the lip or with a preload a single lands 70–100 % (a late press correctly does nothing
there — not enough air left — and a one-time hint says to throw at the lip). The ceiling with perfect inputs is
unchanged (≈ 3.1–3.6 flips on Ravenspire's biggest airs, 1.7–2.2 on the kickers).

What changed (physics/edge.js, config.js): the throw window grows with the air expected at the take-off
(`flipThrowAir` / `spinThrowAir`); a **late throw** after it (`flipLateMax` 1.8 rad/s, `flipLateRate` 4,
needs `flipLateAir` 1.7 s left) so W / S always start a flip when one can still come round; flip keys work while
grabbing (a grab only stops the full layout); a stretched layout (`flipOpen` 0.75) lets an over-set single
slow down; the frontflip preload (Space, then W, still held at the lip); one-time hints for a locked held key
and a too-late press.

## 7. Follow-up: rotation feel (carry-over, counter key, slow starts)

Players found in-air rotation frustrating — but the skill ceiling stays. Three small changes
(physics/edge.js, config.js; ski and board alike), measured with `node web/scripts/physics-rotation.mjs
[ski|snowboard|both] [--check]` (new; the real Player on flat ground, frame-exact inputs):

1. **Carry-over.** Holding W / S through most of a single on a big air and letting go, the stretched
   layout kept 75 % of the momentum for the whole rest of the air (≈ 86°/s for a thrown flip), and with
   ≥ 1.6 s left the spot often decided to tuck for a *second* flip — which the tiring tuck couldn't finish.
   Now stretching out of an over-set flip **sheds momentum** (`flipSpotBleed` 2 rad/s², down to what the
   landing needs) and the spot's "can I reach the next upright" counts the tuck fading (`tuckReach`), so it
   rides out a small over-rotation instead of chasing an extra flip. A rate, so small airs are unchanged.
2. **Counter key.** The key against the flip used to only stretch (× `flipOpen`), so it couldn't even out an
   over-rotation. Now within `flipCounterAngle` (50°) past upright — or half that before it — it sheds
   momentum at `flipCounter` (4 rad/s²); further past it sheds like the spot (never worse than letting go).
   It never stops a flip (floor 1.2 × `flipMinH`) and, outside the window, a stretch mid-flip is unchanged.
3. **Slow starts.** The throw's push fades to zero at the end of its window, so a press there was slower
   than a press after it (the late throw); spins had no late throw at all — steering 0.3 s after a
   thrown-only take-off on a 2.4 s air never reached 180°. Now both throws push at least at the late rate,
   the flip's late rate is 5 (was 4) rad/s², and spins get a **late spin** (`spinLateMax` 2.2 / 2.4 rad/s
   neutral, `spinLateRate` 6 / 6.5 rad/s², needs `spinLateAir` 0.8 s left): a late 180 / 360, never a set.

| tunable (ski / board) | before | after |
|---|---|---|
| `flipSpotBleed` | — (0) | 2.0 rad/s² |
| `flipCounter` / `flipCounterAngle` | — | 4.0 rad/s² / 50° |
| `flipLateRate` | 4 rad/s² | 5 rad/s² |
| `spinLateMax` / `spinLateRate` / `spinLateAir` | — (no late spin) | 2.2 / 2.4 rad/s, 6 / 6.5 rad/s², 0.8 s |
| throw push (flip / spin) | `rate × (1 − (t/win)²)` | never below the late rate |

**A. Let go after R° of a thrown single** (carry = rotation after letting go, then where it lands; ski,
back and front identical, board within a degree):

| air (time left at release) | before | after |
|---|---|---|
| 1.65 s air, any R (0.1–0.5 s left) | lands clean | unchanged |
| 2.4 s, R 240° (1.24 s) | carry 151° → stumble 36° over | 116° → clean |
| 2.4 s, R 270° (1.12 s) | 141° → crash 57° over | 100° → clean 15° |
| 2.4 s, R 300° (1.04 s) | 132° → crash 74° | 97° → stumble 38° |
| 2.4 s, R 330° (0.92 s) | 122° → crash 95° | 93° → crash 65° (held far too long) |
| 3.2 s, R 240° (2.0 s) | 349° (chased a 2nd flip) → crash | 127° → lands (stumble: hard flat landing) |
| 3.2 s, R 270° (1.88 s) | 377° (chased) → crash | 123° → stumble 38° |
| 3.2 s, R 300° (1.8 s) | 384° (chased) → stumble short of a double | 120° → crash 61° |

On the real maps (`jumps-bench.mjs all both --quiet --ease`): a preload held through the throw then let go
on Ravenspire's 2.2–2.8 s airs lands a clean single 3/12 → 11/12 (ski), 5/10 → 9/10 (board); on ≥ 2.8 s
airs 0/10 → 9/10 and 0/11 → 9/11 (it used to over-rotate to 1.5–1.7 flips). The ceiling (most flips a
perfect set allows: physics-tricks table, jumps-bench "max flips") is unchanged; preloaded doubles, the
double cork 1080 and the triple at 3.2 s land as before.

**B. Counter key** (let go at R°, the opposite key from 345° to touchdown; pitch off upright at touchdown):

| air, R | no counter (after #1) | with counter | before: no counter → counter |
|---|---|---|---|
| 1.85 s, 310° | stumble 35° | stumble 29° | crash 48° → crash 48° |
| 2.4 s, 280° | stumble 22° | clean 15° | crash 62° → crash 62° |
| 2.4 s, 310° | crash 50° | stumble 38° | crash 83° → crash 83° |
| 2.4 s, 340° | crash 77° | crash 61° | crash 104° → crash 104° |
| 3.2 s, 280° | crash 46° | stumble 29° | crash 53° → crash 129° (it cut the chased double short) |
| 3.2 s, 310° | crash 73° | crash 52° | stumble 27° (a chased double) → crash 149° |

So the counter recovers ≈ 5–20°: a near miss up to ≈ 50° becomes a landing, while a botched flip (a full
set tucked to 300° on a 1.85 s air) still crashes. A counter held from 180° doesn't kill the flip.

**C. Slowest starts** (key held from the press, time to 180° of rotation; ≥ 1.8 s of air left for flips,
≥ 1.4 s for spins; ski / board):

| | before | after |
|---|---|---|
| flip at the lip (thrown, no preload) | 0.92 s | 0.92 s |
| flip pressed at the end of the throw window (0.45–0.6 s) | 1.15–1.17 s (slowest) | 1.07 s |
| late flip (0.8–1.4 s in) | 1.12 s; at 1.4 s of a 3.2 s air never | 1.07 s |
| spin at the lip, thrown only | 0.90 / 0.83 s | unchanged |
| spin pressed 0.2 s in, thrown only (2.4 s air) | 1.38 s | 1.22 / 1.13 s |
| spin pressed 0.3–1.0 s in: thrown only, rolled off, low pop | never (90° took 1.5–1.8 s: a hip twist) | 1.28 / 1.20 s |
| spin wound up, pressed late | 0.90–0.98 s | 0.85–0.98 s |

Which situations were slow: a press in the last ≈ 40 % of a throw window (the throw's push had faded below
the late throw's), a late flip right at the `flipLateAir` gate (ramping too slowly to stay above
`flipMinH`), and every spin not started within ≈ 0.25 s of the take-off without a wind-up (rolled off,
popped early, or pressed a moment late). Flip start rates don't depend on a spin or a grab. Still by
design: no flip starts with < 1.7 s of air left after the window (it couldn't come round), a key held
through the take-off stays locked until re-pressed, and a wind-up popped with the stick released is
spotted (checked back) from 0.1 s — pressing steer 0.2 s later on a small air rebuilds it at the late rate
(1.1 s to 180° instead of 0.55 s).

Side effect: physics-fuzz (random inputs) sees a few more yaw crashes (28 → 33 in 4 × 120 s), since random
steering in the air now builds a late spin.

## 8. Spin and flip together: corks, rodeos, misties, double corks

Players found combined spins and flips messy: "the air time and trajectory get messed with and the animation
isn't clean". Code: `web/src/physics/offaxis.js` (new), `player.js`, `physics/edge.js`, `rider.js`. Benches:
`node web/scripts/physics-combo.mjs [ski|snowboard|both] [--check]` (headless) and
`node web/scripts/combo-shots.mjs <url> <outDir> [ski|snowboard] [tricks]` (frame sequences in the game).

### Research

**The flight.** In the air the centre of mass flies a parabola set at the lip; twisting, tucking and arm throws
cannot change it, only drag does [S: Yeadon, aerial movement (lboro.ac.uk/microsites/ssehs/biomechanics);
Open University MST209 "rotating bodies"]. Hang time comes from take-off speed, lip angle and the landing
[S/C, §1]. Tuck vs open changes the drag area by up to ≈ 0.35 → 0.55 m² (wind-tunnel postures vary by up to 64 %,
mostly the arms) [S: Elfmark et al. 2022, Sports Engineering; arXiv 2410.02767] — worth ≈ 1–5 % of a 20–25 m
flight [C] and best left out of a game (the user's ask: rotation must not change the arc).

**What a cork is.**
- Corks are off-axis spins (the lead shoulder dropped into the spin); a rodeo is an off-axis backflip with spin,
  a misty the forward (frontflip) one; a double / triple counts the off-axis passes, the number the whole spin
  [S: SkiTalk freestyle glossary; snowboardingdays.com; NBC Olympics glossary; FIS park & pipe tricks list].
- **Axis tilt:** "a cork tilts that axis 45°–60° from vertical" (Google Cloud / US Ski & Snowboard sensor tool,
  which measures the angle between the instantaneous rotation axis and vertical, the "cork ribbon") [S:
  cloud.google.com/blog "measure physics of freestyle snowboarding and skiing"].
- **Geometry [C]:** a body that starts upright and turns about an axis tilted α from vertical has its long axis
  ride a cone round that axis, deepest at 2α half a revolution in: α = 45° lays it flat on its side, 60° leaves
  the feet a little above the head (120°), 90° is a plain flip (180°). So corks ≈ 90–120° at the deepest, rodeos
  / misties ≈ 130–160° (α ≈ 65–80°), a flip 180°.
- **It is not one rigid rotation for the whole trick.** Measured corks come out a median 25° short of their name
  and flatspins 21° long [S: Merz et al. 2025, Sports Biomechanics 24(7), 149 tricks]; Shaun White's cab double
  cork 1440 measured ≈ 1122° [S: Google Cloud]. A cork 720 has "two distinct off-axis spins" with the invert in
  one of them [S: Skiing mag "how to corkscrew 720"]. The physics is a twisting somersault [S: Yeadon 1993; Hiley
  & Yeadon; Mikl & Rye arXiv 1510.08046]: the angular momentum is fixed, the body turns about it with its long
  axis tilted off it and twists about that long axis (faster the more it tilts); equipment raises the long-axis
  inertia, so skiers need much more tilt than gymnasts [S: Yeadon 2013, aerials]. The tilt is set on the lip
  (shoulder drop, pop direction) and changed a little in the air [S: Snowboard Addiction BS cork 540; Yeadon].
- **Rates:** rotation amount is driven 3–5× more by the angular velocity than by the air time [S: Merz et al.
  2025 J Sports Sci 43(3); Beijing 2022 halfpipe IMU study]. A double cork 1440 averages ≈ 400–550°/s [C].
- **Technique:** "lead with your head and let the rest of your body follow as one unit" [S: Fall-Line]; spot the
  landing at ≈ 540° of a 720 [S: Fall-Line, Skiing mag] — the last 25–35 % of the rotation; tuck to spin faster,
  open to stall [S: Skiing mag; Scientific American]; grabs taken after the set and held through the middle,
  let go to spot [E]; open up (let go, extend, reach for the landing) ≈ 0.3–0.5 s before touchdown [E, no source].

**Games.** Steep: left stick spins (longer hold = more) and flips, the right stick shifts the body 90° mid-trick;
corks are undocumented ("rodeos and corks are yours to master"); reviewers found its tricks clumsy to aim [S:
Twinfinite, Steam discussions, Game Informer]. Riders Republic encodes the order: flip first then spin = rodeo /
misty, spin first then tip = cork [S: Attack of the Fanboy trick list]. Shredders pre-loads flips and spins
before the lip [S: TheGamer]. Infinite Air: hard to control, narrow landing window [S: Push Square].

### What was wrong

1. **The flight did change a little** — the flip tuck lowered the air drag (compact × 0.7): +0.75 % air time,
   +0.9–1.7 % distance for every flip or cork vs a straight air (physics-combo, flat and 32° landing). Nothing
   else in the physics depended on rotation (gravity, landing detection and the ground probes use the point
   mass; rotation is drawn on top).
2. **The rotation path was two independent rotations** — `renderOrient = base(heading) · Rx(flip)`: the flip
   turned about the gear's own sideways axis while the heading spun, so the flip axis turned with the rider.
   Every combo went fully upside down (179–180° at the deepest, even a cork 720), and the body's up axis drew a
   spiral instead of a clean loop (16–26° off the best cone fit).
3. **The body orbited the path**: flips pivoted 0.85 m above the feet and spins about the feet, not about the
   posed body's own centre of mass — the drawn body strayed 0.21–0.24 m round the flight path in a cork.
4. **Poses fought each other**: a flip's stretched layout (arms flung up above the head, legs long) came on in
   the middle of corks while the spin wanted the arms in.
5. **The spot parked the spin mid-flip**: letting go of the stick while the spin passed an alignment checked it
   there even with half a flip to go — the cork turned into a plain flip half-way (a double cork with the stick
   let go at 540° landed as a "Double Cork 720" with the spin frozen for ≈ 0.9 s upside down).

### What changed

1. Drag no longer depends on the flip tuck (a grab still compacts the body).
2. `physics/offaxis.js`: the flip axis is fixed in the world when the flip starts; each flip is one revolution
   about an axis tilted α from vertical toward it, and the spin beyond that revolution's 360° is a twist about
   the long axis (cork 720 = one off-axis revolution + 360° of twist; double cork 1080 = two + 360°). α from the
   spin : flip rate ratio r (`alphaTable`): 72° at r ≈ 1 (backflip 360 / rodeo 360), 64° at 1.5 (rodeo 540,
   double cork), 58° at 2 (cork 720), 52° at 3, 50° floor; +6° for frontflips (misties invert early, like
   rodeos). Little spin per flip (r under 0.45–0.75) keeps a plain flip about the fixed axis with an aerials-style
   twist. The shape changes only within 16° of upright, where both forms coincide; whole flips are exactly the
   plain heading, so take-offs, landings, the trick names, the scoring and every rate are unchanged. The landing
   pitch check reads the drawn attitude (the body's tilt off upright: the flip angle for a plain flip, a little
   less in a cork — the window is the same 22° / 42° of real tilt).
3. rider.js: the body pivots about its own posed centre of mass (measured from the bones each frame) for the
   spin and the flip, held on the flight path; the head leads (into the spin, back for a backflip, chin in for a
   frontflip) then spots the landing over the last 0.8 → 0.35 s; a spin + flip holds a compact shape (knees up,
   arms wrapped in) and opens over the last 0.55 → 0.3 s; arms "out wide" sit at shoulder height.
4. physics/edge.js: with more than 120° of a flip to come (`flipBusy`), the spot keeps the spin going (open if the
   next alignment is out of reach) and checks only as the flip comes out.

### Before and after (physics-combo.mjs, take-off 11 m/s forward + 11 m/s up, 13 up for the double cork; ski · board)

| | before | after |
|---|---|---|
| air time / landing point vs straight air, flat | +0.75 % / +0.8–1.0 % (every flip) | 0.00 % / 0.00 % |
| same, 32° landing (double cork) | +0.4–0.9 % / +1.2–1.7 % | 0.00 % / 0.00 % |
| deepest body tilt: backflip | 180° | 180° |
| backflip 360 / rodeo 360 | 180° · 180° | 144° · 143° |
| cork 720 (board: FS rodeo 720) | 179° · 179° | 104° · 111° |
| misty 720 | 179° · 179° | 117° · 124° |
| rodeo 540 (board) | 179° | 130° |
| double cork 1080 (two passes) | 180° · 179° | 140° · 135° |
| up-axis path off a clean cone (corks) | 16–26° | 0.3–5° |
| double cork, stick let go at 540° of spin | spin parked upside down, "Double Cork 720" · "720" | spins on: "Double Cork 1080" · "900" |
| drawn body's centre of mass round the flight path (combo-shots, ski cork 720 · double cork) | 0.24 · 0.21 m | ≈ 0.03–0.06 m |
| landings (flat): cork 720, misty, rodeo 540, bf 360 | clean | clean (pitch ≤ 2°) |

Unchanged: physics-tricks (the most flips per air time 0.92 / 1.41 / 1.85 / 2.25 / 2.61 / 2.91 at 1.1–3.0 s on
skis; double cork 1080 lands at 2.6 s, triple at 3.2 s), physics-rotation `--check`, the names and points.

Frame sequences (combo-shots, side camera tracking the centre of mass, every 0.12 s): a cork 720 now drops the
head to the side and rolls through with the skis passing above at ≈ 105–125°, body balled up, arms in, then
opens and reaches for the landing; before it went straight upside down with the skis vertical overhead, the body
stretched long and an arm flung above the head. The double cork shows two clean off-axis loops with a near-upright
moment between them; the snowboard rodeo 540 goes over the heel side with the board overhead at ≈ 130°.

## 9. Polish pass: rotation that takes too long "for no reason", air input, landings

Players still met "weird scenarios where spinning or flipping takes way too long for seemingly no reason". The rule
for this pass: the game stays exactly as skilful (no rate, cap or set changed; the most flips / spins a perfect set
allows is unchanged), and every change is backed by a bot. Benches (headless, the real Player):

- `node web/scripts/physics-sweep.mjs [--quick] [--csv f]` — **the scenario sweep**: 21 930 airs off flat ground ×
  equipment (ski, board; all-mountain, GS, park) × map physics (default, Ravenspire, Dragonback, Voltage) × stance /
  switch × take-off (air 1.2–3 s) × pop timing (at the lip, early, flat, rolled off) × what was held through the
  take-off (nothing, a carve's pre-wind with / against the spin, the key itself, W, S, carving the other way, the
  other axis under way) × press time (0–1.4 s) × grab × physics step (1/30, 1/60, 1/144 s). It measures the time
  from the key press to 180° *the way it was asked for* and lists the outliers (slow or never with ≥ 1.5 s of air
  left for a spin, ≥ 1.9 s for a flip) grouped by cause.
- `node web/scripts/physics-polish.mjs [--check]` — the regression for everything fixed below.
- Scratch probes (in the notes below): a release sweep (a spin set, steer held to R°, let go with ≥ 0.6 s left —
  where does the spot land it?), a gamepad stick probe (input.js on a fake controller) and a frame-rate probe.

### What was found

| scenario (sweep) | cause | verdict |
|---|---|---|
| late spin while grabbing: 1.42 / 1.32 s to 180° (1.22 / 1.18 s without the grab) | the grab pose (0.6) replaced the tuck the late spin uses | **fixed** |
| carve pre-wind the other way + grab, stick against it after the throw window: never (board) | against a spin the stick only opens up (× 0.6) and momentum never turns round; the grab also switched off the spot that would have bled it | **fixed** |
| a throw reversed late in its window (vy 15, 0.25 s in) | left at 1.3 rad/s the old way, the stick against it opened up: 45°/s the wrong way for 2.4 s | **fixed** |
| full set let go early (board, 45° on a 2.4 s air): crash at 266° | the spot's check passing 180° shed most of the momentum, overshot its 12° window (the rate lags) and let go below `spinMinH`: no plan left, a slow drift sideways into the snow | **fixed** |
| check-backs ending 20–40° short at touchdown | the check aimed to arrive exactly at touchdown, but the spin rate follows with a 1/`spinResponse` lag | **fixed** |
| gamepad: diagonal stick (cork) flip 1.18–1.30 s vs 0.92 s on keys; stick-up flip 0.97 s | a round stick gate gives 0.71 per axis on a diagonal, stick-up is scaled to 0.8 (the ground tuck) and the flip input has a 0.4 dead zone | **fixed** |
| gamepad: < 45 % stick tilt never spins in the air | the carving curve (exponent 1.35) makes half a push 0.27, under the 0.2 spin threshold until ~45 % | **fixed** |
| a key held through the take-off (W tuck, S brake, a carve off a roller) does nothing until re-pressed | deliberate: a tuck / brake / carve isn't a trick; one-time hint for the flip keys | kept |
| a flip pressed after the throw window with < 1.7 s left: nothing | the late-throw gate. On flat ground a press 0.05 s inside the window and one 0.05 s after it land identically for every air left (1.0–1.8 s: crash below 1.7 s, stumble at 1.7, clean at 1.8) — the gate is where a flip stops coming round | kept |
| spin pressed late in its throw window: 1.23–1.25 s vs 0.90 s at the lip | the throw fades over its window into the late spin (no cliff: 0.93 → 1.25 → 1.28 s for 0.1 / 0.25 / 0.4 s) | kept (the set is made at the lip) |
| popped carving one way, steered the other way after the whole window | a real thrown set (up to 3.4 rad/s): the stick against it stalls | kept (by design) |
| GS skis 10 % slower late spins | gear `spin` 0.9 | kept (equipment) |
| maps (Ravenspire, Dragonback, Voltage), switch, goofy | no outliers of their own (same medians ± 0.02 s) | — |
| physics step 1/30 vs 1/60 vs 1/144 s | ± 0.04 s to 180°; the game steps physics at a fixed 60 Hz anyway (main.js), so display rate never changes the rotation; slow-mo only scales the step | — |
| Ravenspire slow-mo (huge airs) | rotation in real seconds × 1/0.7 around the apex | kept (visible, intended) |

Two frame-rate dependences outside the physics turned up and were fixed: the rider's force-driven body reactions
(character/dynamics.js) differentiated the physics velocity by the render frame time — at 144 / 165 Hz frames
alternate between zero and one physics step, a 14 % frame-to-frame ripple in a steady carve (0 % at 30 / 60 Hz) —
and the first-person terrain chatter (fpview.js) kicked per frame from the ground normal's change rate (2.4× as
strong at 144 Hz, half at 30 Hz). Both now use the physics clock (`player.simTime`).

### What changed (physics/edge.js unless noted)

1. **Slow spins the other way turn round.** With the stick against a spin no bigger than the late throw makes
   (`spinDrift` × `spinLateMax`, 2.2 / 2.4 rad/s) and ≥ `spinLateAir` of air left, the late spin turns it round
   instead of opening it up. Bigger sets still only stall, and so does everything in the last 0.8 s.
2. **Grabbed late spins tuck.** Building a late spin (or one no bigger) with the stick into it while grabbing uses
   the full tuck, as without the grab. Thrown / wound-up sets keep the grab's 0.6 (the cork 720 + grab is unchanged).
3. **The spot finishes the checks it starts**, even once the momentum it sheds drops below `spinMinH`, and checks
   aim one 1/`spinResponse` before touchdown. A rider who was never spinning still settles only within
   `spinCheckAngle` (or `airSettleAngle`).
4. **Gamepad in the air** (input.js `airStrength`, player.js, edge.js `air()`): the rotation reads the left stick
   linearly past its dead zone, mapped from its round gate onto a square, and takes the stronger of that and the
   plain controls. Keyboards read exactly as before; the stick on the snow keeps its carving curve.
5. **Landings say why** (player.js `landingWhy`, juice/hud.js): a stumble's announcement carries "OVER-ROTATED 31°",
   "FLIP UNDER-ROTATED 35°", "40° SIDEWAYS" or "HARD LANDING"; a landing crash shows it as a call-out under the
   rider. A crash with a grab held to the end (the spot only works once the hand is off) gives a one-time hint.
6. **HUD keeps the landing clear** (juice/hud.js, progression/ui.js): the chase camera frames the landing near the
   middle of the screen, where the live rotation read-out (33 %), the trick announcer (37 %) and the level-up card
   (42 %, 3.2 s) sat. The read-out moved to 24 % and is gone for the last 0.5 s before touchdown, the announcer to
   30 %, the level-up card to 32 % and it fades on the next take-off.

### Before and after

| | before | after |
|---|---|---|
| sweep: outliers / never (7 891 airs with enough air left, by-design locks excluded) | 486 / 120 | 221 / 48 (all left: short-air reversals, see above) |
| sweep: spins, median · 90th percentile to 180° | 1.20 · 1.42 s | 1.20 · 1.33 s |
| sweep: spins while grabbing, median · 90th pct · never | 1.32 · 1.52 s · 90 | 1.18 · 1.37 s · 24 |
| sweep: flips, median · 90th pct · worst | 1.03 · 1.08 · 1.13 s | unchanged |
| late spin pressed 0.5 s in while grabbing (vy 12), ski / board | 1.42 / 1.32 s | 1.27 / 1.18 s |
| pre-wind the other way + grab, stick against it at 0.5 / 0.9 s | ski 1.52 s, board never | 1.37 / 1.30 s |
| throw reversed 0.25 s in (vy 15) | never (wrong way all air) | 180° the asked way in 2.1 s |
| board, full set let go at 45° (2.4 s air) | crash at 266° | clean 180 |
| gamepad diagonal stick: flip to 180° | 1.18–1.30 s | 0.92 s (keys 0.92 s) |
| gamepad 40 / 50 / 60 % stick push: spin to 180° | never / 1.32 s at 60 % | 1.45 / 1.32 / 1.17 s |
| body reactions at 144 Hz (steady carve) | 14 % ripple | 0 % |
| keyboard spin / flip thrown at the lip | 0.90 · 0.83 / 0.92 s | unchanged |
| physics-tricks (most flips per air), physics-rotation `--check`, jumps-bench max flips / spins | — | unchanged (jumps-bench: 0 crashes; the send bot's line differs a little where its spins now land) |
