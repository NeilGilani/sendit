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
  spin (only a small hip twist). The in-game hint text (ui.js, not part of this change) should say so.
