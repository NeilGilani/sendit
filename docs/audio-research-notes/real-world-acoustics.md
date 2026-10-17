# How real skiing / snowboarding / mountain wind sound — research notes for procedural WebAudio

Compiled 2026-10-16 from web research (no logins). Everything below is paraphrased. Each bullet carries its source URL.
Tags: **[measured]** = a number from a paper or measurement. **[descr]** = a qualitative description from a recordist, writer or forum. **[inferred]** = my own engineering estimate built from the sourced facts. Treat the inferred values as starting points to tune by ear.

Units: v = rider speed in m/s; T = snow or air temperature in °C.

---

## 0. Cross-cutting facts used by several topics

- **[measured]** Snow absorbs high frequencies more than low ones. Calculated absorption coefficient is about 0.25 at 100 Hz, rising to about 0.75 at 2 kHz (JASA 1948 calculation, quoted by Acentech). Other measurements give 0.5–0.9. Absorption peaks right after a snowfall and drops once the snow compacts or refreezes. https://www.acentech.com/resources/the-quiet-snow/ ; https://accuweather.com/en/weather-news/why-does-it-become-so-quiet-after-a-fresh-snowfall/352439
- **[measured]** Ishida's tube and field work: attenuation at a fresh snow surface is very different from attenuation inside compact snow, and the absorption maxima sit where the impedance is resistive. https://openpolar.no/Record/ftdtic:ADA032059 ; https://eprints.lib.hokudai.ac.jp/repo/huscap/all/20232/A20_p23-63.pdf
- **[measured]** In a low-density snow layer, highs are insulated more than lows. In compressed snow, insulation is roughly uniform with frequency and exceeds 40 dB. At 1 kHz the loss is 18 dB at 15 cm depth, 35 dB at 30 cm and 78 dB at 60 cm (ISSW 2012, avalanche-burial acoustics). https://arc.lib.montana.edu/snow-science/objects/issw-2012-1011-1016.pdf
- **[measured]** Acoustic emission from snow under brittle fracture falls in roughly 20–7000 Hz. Plastically deforming snow emits nothing (St. Lawrence et al., J. Glaciology 1973). https://www.cambridge.org/core/journals/journal-of-glaciology/article/acoustic-emission-in-snow-at-constant-rates-of-deformation/C097DDA3402ADF3FF24D83B4FFB7B9D9
- **[measured]** Hard-pack snow transmits signals strongest between 1 and 10 kHz, within an analysed band of 500–14 000 Hz (Lang 1976, J. Glaciology). https://www.cambridge.org/core/services/aop-cambridge-core/content/view/004022445D968A6F4A7A1E06F59204DF/S0022143000013587a.pdf/measurements-of-acoustic-properties-of-hard-pack-snow.pdf
- **[measured]** Ski–snow friction physics:
  - A skier generates about 200 W of frictional heat per ski (Colbeck).
  - Meltwater film is probably ≤1 µm thick. In cold snow (around −10 °C and below) a film still forms but is too thin to lubricate, so friction becomes dry, solid-on-solid "ploughing".
  - Cold fresh snow and man-made snow are "aggressive".
  - https://arc.lib.montana.edu/snow-science/objects/issw-1992-018-027.pdf ; https://www.gi.alaska.edu/alaska-science-forum/surfing-snow
- **[measured]** Hasler et al. (Innsbruck) ran a tribometer at 5–25 m/s on −3.5 °C snow. Surface temperature behind the ski rose locally to −0.09 °C, and at 15 and 25 m/s the cooling curve showed refreezing meltwater. So at real skiing speeds the contact patch sits at the melting point even on cold snow. https://www.frontiersin.org/journals/mechanical-engineering/articles/10.3389/fmech.2021.738266/pdf ; https://www.sciopen.com/local/article_pdf/10.26599/FRICT.2025.9441179.pdf
- **[measured]** Gliding skis vibrate because of frictional stick-slip, the same mechanism as brake squeal and a bowed violin string (cross-country ski vibration study). https://lida.sport-iat.de/ta/Record/4025778?lng=de

---

## 1. Snow surface types: corduroy, ice/hardpack, powder, slush/spring, cold squeaky snow

### Facts
- **[measured]** Squeal from walking on dry, cold snow (a few mm of cold snow over a compacted base) has a **dominant frequency of about 1000 Hz**. It is clearest when the snow fell at about −20 °C. Rubbing corks on snow gives higher tones of **1500–3500 Hz** (Laurentian University snow-acoustics paper, quoted in search snippet). https://zone.biblio.laurentian.ca/bitstream/10219/2000/1/snowfeblau.PDF
- **[measured]** A Soviet study (Arabadzhi & Rudik, *Priroda* 1963; DTIC translation 1966) analysed the squeak spectrum against air temperature. I could not obtain the figures. https://openpolar.no/Record/ftdtic:AD0631235
- **[descr / popular science]** Squeak threshold:
  - Snow squeaks below about −10 °C (14 °F). Warmer than that, boot pressure melts a thin film and the snow "flows" quietly or crunches. https://cimss.ssec.wisc.edu/wxwise/squeak.html ; https://www.theweathernetwork.com/en/news/nature/animals/the-sound-of-snow-different-temperatures-winter-weather
  - Montana State's Acoustic Atlas gives the same 14 °F threshold, with a reference recording at 13 °F. https://www.lib.montana.edu/acoustic-atlas/acoustic-atlas-blog/posts/squeaky-snow.html
- **[descr]** In hard frost, high frequencies dominate the squeak. In mild frost, lows dominate. The surface water film is about one molecule thick at −10 °C and hundreds of times thicker at −1 °C, and that film damps the squeak. Crusted snow (strong bonds) gives lower rustle or crunch even near 0 °C (Vokrug Sveta). https://www.vokrugsveta.ru/quiz/745/
- **[descr]** Squeak comes from thousands of crystals snapping at once, many tiny overlapping events (W. Craig Carter, MIT, via Live Science). https://livescience.com/physics-mathematics/why-does-snow-squeak-when-you-walk-on-it
- **[descr]** Wax makers' "green" snow (−12 to −30 °C) is very dry and squeaks distinctly under ski and pole. https://skiwax.ca/fr/collections/green?page=6
- **[descr]** Groomed corduroy:
  - Carving across the ridges gives a vibrating, buzzing "zithhh" you feel through your feet.
  - Morning cord is loudest. A midday re-groom is softer and quieter.
  - https://www.coloradoski.com/blog/virtues-cord-corduroy-skiing-and-riding-colorado-ski-country (via search summary)
- **[descr]** Glide on packed snow is a continuous smooth hiss. Ice and hardpack give a high-pitched scrape. Fresh powder gives a soft, muffled, whisper-like sound. At low speed you hear individual crunches; at higher speed they merge into a steady hum. https://soundcy.com/article/what-does-skiing-sound-like ; https://morphic.com/resources/sounds/snow-sound-effects
- **[descr]** Dry snow has a "light but solid" tone with airy upper mids. Wet snow sounds rich and "meaty" (Frank Bry, The Recordist, interview). https://sonicfield.org/?p=132
- **[descr]** Colder snow sounds louder and crunchier underfoot (Denver Gazette, ski-slope sounds). https://www.denvergazette.com/?p=436825

### Synthesis recipe (per surface; v in m/s, T in °C)

All surfaces share one base chain:

```
base = white noise -> BPF(fc, Q) -> gain(v)
```

The levels below are relative to a groomed-carve reference of 0 dB at v = 10 m/s.

| Surface | Core band | Character / extra layer | Level vs speed | Brightness vs speed |
|---|---|---|---|---|
| **Groomed corduroy** | BPF fc ≈ 2.5 kHz, Q 0.7, plus a gentle HPF at 400 Hz | **Ridge buzz** (see the cord-buzz rule below the table), depth 20–35 %. Fades once the rider is on smoothed snow, or over the day. | 0 dB at 10 m/s; +7 dB per doubling (≈ 23·log10(v/10)) [inferred] | fc = 1.6 kHz · (v/5)^0.45, clamped to 1.2–5 kHz [inferred] |
| **Hardpack / ice** | HPF 1.5 kHz → BPF 3.5 kHz, Q 1.2, plus a **narrow edge-scrape resonance** at 2–6 kHz (2 peaks, Q 6–10, random-walk ±15 %) | **Chatter** amplitude modulation (section 3). Grain layer: sparse clicks 300–1500/s, each 0.3–1 ms. | +3 dB vs groomed at the same speed; +8 dB per doubling | fc 3–6 kHz; little low end (HPF 600 Hz) |
| **Powder** | LPF 900 Hz (2-pole) + BPF 250 Hz, Q 0.6 | "pfff" whoosh; almost no edge hiss; extra LPF on everything else (section 5) | −8 to −12 dB vs groomed; +6 dB per doubling | LPF fc = 600 + 40·v Hz, max 1.6 kHz |
| **Slush / spring (T > −1)** | BPF 700 Hz, Q 0.8 + LPF 2.5 kHz | Wet **slurp / spray** granular layer: 40–120 grains/s, each 8–25 ms, BPF 400–1200 Hz; fewer high clicks | −3 dB vs groomed, but more low-mid; +6 dB per doubling | fc stays low: 1.0–2.0 kHz |
| **Cold dry snow (−10 > T > −30)** | Groomed chain, brighter by +20 % fc | **Squeak/creak layer**, see the formula after the table | +1 dB vs groomed | Highs dominate as T drops |
| **Crunchy cold snow / frozen crust** | Groomed chain + crunch grains: rate 30–200/s at low v (≤ 4 m/s), each 2–10 ms, BPF 1–4 kHz; random amplitude ±6 dB | Above about 6 m/s, grains merge into continuous noise: crossfade the grain layer into the hiss | — | — |

**Cord-buzz rule** [inferred; the ridge spacing is an estimate, not sourced]:
- Ridges run down the fall line at about 2–3 cm spacing.
- Buzz frequency f_cord = v_lateral / 0.025 m. That gives about 80–400 Hz in turns and roughly 0 when running straight.
- Implement as amplitude modulation of the hiss by a sine at f_cord, or as a comb filter.

**Squeak/creak layer formula** [inferred, anchored on the measured ≈1 kHz peak and the 1.5–3.5 kHz harder-friction band]:

```
squeakAmt = clamp((-10 - T) / 10, 0, 1)
excite    = noise bursts at rate R = 40 + 8·v per second, burst length 3–8 ms
excite    -> parallel BPFs: 1.0 kHz (Q 12), 1.6 kHz (Q 10), 2.6 kHz (Q 8)
gain      = squeakAmt · (−12 dB re hiss) · edgePressure
```

- As T drops from −10 to −25, tilt the weight from the 1 kHz peak toward the 2.6 kHz peak (high frequencies dominate in hard frost).
- The squeak belongs mostly to slow speeds, pressure changes and edge sets. At speed the hot contact patch reaches the melting point, so fade squeak down above about 12 m/s.

---

## 2. Skidding, hockey stops and sideslip versus a clean carve

### Facts
- **[descr]** Edge chatter on ice or hardpack works like a knife dragged sideways across a board: the edge catches, releases and catches again (Sports Illustrated ski tip, 1956). https://vault.si.com/vault/1956/01/09/ski-tip
- **[descr]** A carving turn is a rasp that swells toward mid-turn. A hockey stop is a fast sideways skid that throws a burst of spray with a hissing edge and then cuts off abruptly. https://morphic.com/resources/sounds/skiing-sound-effects
- **[descr]** Scraping is the most common sound on a mountain. https://www.denvergazette.com/?p=436825
- **[measured]** The ski is effectively a beam on edge. Resonances while turning: fore-body 22 Hz and 66 Hz, aft-body 37 Hz, coupled in bending and torsion. Lab skidding tests matched the on-snow measurements (Gosselin et al., Sports Engineering 2021). https://lida.sport-iat.de/ta/Record/4074602
- **[descr]** Pro sound designers build carves and swishes from Doppler-processed whooshes, car-bys, ice and heavy drag sounds, with powder or particle effects layered on top (Gearspace thread, via search summary). https://gearspace.com/threads/need-soumd-design-help.525926/

### Synthesis recipe

The skid amount comes from the slip angle: `skid = clamp(|v_lateral| / max(v, 1), 0, 1)`.

- **Clean carve** (skid < 0.15):
  - Mostly the surface hiss (section 1), narrow band, smooth.
  - Level swell follows edge angle and load: gain ∝ (0.4 + 0.6·load), where load ranges 0..1.5 g.
  - Attack and release of the turn swell are slow, 150–400 ms.
- **Skid / sideslip** (skid 0.15–0.6):
  - Widen the band: BPF 300 Hz–8 kHz (two cascaded 1st-order HPF 300 Hz / LPF 8 kHz), +6 dB vs carve at the same speed.
  - Add **rough AM**: low-passed noise (cutoff 18 Hz) as a modulator, depth 40–70 %.
  - Also add a random-rate pulse train at 8–25 Hz with jitter 30 % (stick-slip).
- **Hockey stop** (skid > 0.6 and decelerating):
  - Burst envelope: attack 20–60 ms to +10–12 dB vs carve.
  - Sustain for as long as the lateral slide lasts, with the scrape band at fc ≈ 1.2–3 kHz (lower than ice chatter).
  - **Spray layer**: granular particle noise at 300–1500 grains/s, 0.5–3 ms each, HPF 3 kHz. It starts about 30 ms after onset, peaks at the deceleration maximum and decays 250–500 ms after the stop. It is the "pssshh" tail.
  - **Hard cut**: when |v| < 0.5 m/s, release the scrape in 40–80 ms. Keep the spray tail.
- On ice, the skid gets the chatter AM from section 3, depth 70–100 %.

---

## 3. Speed-dependent edge hiss, chatter on hardpack, ice scrape

### Facts
- **[measured]** Ski bending modes lie at 10–100 Hz and torsional modes at 100–150 Hz (adaptive ski-vibration patent US9020782). https://patents.google.com/patent/US9020782
- **[measured]** Ski on edge: 22 / 37 / 66 Hz (see section 2). https://lida.sport-iat.de/ta/Record/4074602
- **[measured]** Snowboard deck, free-free laser vibrometry: bending modes at 16, 37, 65 Hz; torsion at 30, 54, 86 Hz (about 10 % higher on a second board). https://research-repository.rmit.edu.au/articles/conference_contribution/Vibration_of_snowboard_decks/27376299 ; https://lida.sport-iat.de/twm/Record/4019400?lng=en
- **[measured]** In slalom and GS racing, the most powerful body vibrations were below 30 Hz. https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2018.00204/pdf
- **[descr]** Icy scrape is bright, harsh, rattling chatter as the edges skip. https://morphic.com/resources/sounds/skiing-sound-effects
- **[descr]** Edge chatter on man-made "glacier" rattles the knees and runs up into the teeth (The Ski Journal). https://digital.theskijournal.com/volume-14-issue-4/page-24
- **[descr]** Board chatter appears at high speed, in tight turns and on ice, and is worse on soft boards. Heelside chatter skips "like a stone across water". https://boardworld.com.au/forums/viewreply/253324 ; https://thesnowpros.org/?p=3914
- **[measured / context]** The hot contact patch reaches 0 °C at 5–25 m/s (Hasler). Hiss character therefore changes little with T at high speed. Temperature mainly matters at low speed and for squeak.

### Synthesis recipe
- **Edge hiss level** [inferred]:
  - `hissDb = 23·log10(max(v, 1) / 10)`, i.e. about +7 dB per doubling. That is roughly −16 dB at 2 m/s and +11 dB at 30 m/s re 10 m/s.
  - Clamp the total dynamic range to about 24 dB for the mix.
  - Multiply by edge load (0.4–1.4) and by the surface factor from section 1.
- **Edge hiss brightness** [inferred]:
  - Main BPF centre `fc = 1600·(v/5)^0.45` Hz: about 1.6 kHz at 5 m/s, 2.2 kHz at 10, 3.0 kHz at 20 and 3.6 kHz at 30.
  - High-shelf above 6 kHz: +0.3 dB per m/s, capped at +6 dB.
  - Add a gentle 2nd LPF at `8 + 0.25·v` kHz so it never fizzes.
- **Chatter** (hardpack and ice, triggered when edge load is high and grip is low, i.e. when the requested turn radius is tighter than the grip allows):
  - Modulator: a pulse or saw-ish train at **f_ch = 20–40 Hz for skis** (centre about 28 Hz; you can lock it to 22 / 37 Hz modes) and **15–35 Hz for snowboards** (16 / 30 / 37 Hz modes). Raise f_ch slightly with speed: f_ch = 18 + 0.6·v, clamped 18–40.
  - Jitter: ±10–20 % period jitter, ±3 dB per-pulse amplitude randomisation.
  - Depth: 60–100 % on ice, 30–60 % on hardpack, 0 on groomed or powder.
  - Each "catch" is an impulse: a 1–3 ms noise click through BPF 2–5 kHz plus a low thump at the mode frequency, 66 Hz for skis or 37 Hz for a board (a resonant LPF pinging for 20–40 ms).
- **Ice scrape**:
  - HPF 1.5 kHz → 2–3 peaking filters at 2.2, 3.4 and 5.1 kHz (Q 5–8, +6 dB), each randomly detuned ±10 % with a 0.5–2 Hz random walk. That gives the harsh, almost-tonal "screech".
  - Level +3 to +6 dB over groomed hiss at the same speed.
  - Skis: brighter. Board: shift all peaks down by about 30 % (see section 4).

---

## 4. Skis versus snowboard character

### Facts
- **[descr]** Skis scrape at a higher pitch that "pierces the ears". Snowboards scrape lower, with more of a rumble (Denver Gazette). https://www.denvergazette.com/?p=436825
- **[measured]** Board modes 16 / 37 / 65 Hz bending and 30 / 54 / 86 Hz torsion, versus ski modes 22 / 37 / 66 Hz on edge. https://lida.sport-iat.de/twm/Record/4019400?lng=en ; https://lida.sport-iat.de/ta/Record/4074602
- **[descr]** Under operational load the board's centre barely moves, while the ends behave like clamped beams (Siemens Simcenter test with 12 accelerometers on a board and 8 on a ski). https://blogs.sw.siemens.com/simcenter/ski-or-snowboard-which-ones-scientifically-more-exciting/
- **[descr]** Snowboarders slap the rear binding brace (highback) into place and ratchet the straps; ski boots crunch and clunk. https://www.denvergazette.com/?p=436825
- **[descr]** Pole plant:
  - A small, precise click or double tap as the basket bites into crust. https://morphic.com/resources/sounds/skiing-sound-effects
  - Carbide tips click more sharply on ice. https://soundcy.com/article/what-does-skiing-sound-like
- **[measured]** Pole-into-snow strikes are strongly impulsive and broadband. Above about 3 Hz they carried 10 dB more energy than stomping (ISSW 2012). https://arc.lib.montana.edu/snow-science/objects/issw-2012-1011-1016.pdf
- **[descr]** Poppermost (the game *Snow*) recorded a pro skier with taped-on mics to get airtime "static" and the soft "pfff" of skis landing. https://gameinformer.com/games/snow/b/playstation4/archive/2014/10/09/poppermost-wants-its-skiing-game-snow-to-sound-like-cutting-through-fresh-powder-.aspx

### Synthesis recipe
- **Skis** = two edge voices, decorrelated:
  - Two independent noise sources.
  - Pan the uphill and downhill ski ±20–35 %.
  - Weight the outside (downhill) ski at 0 dB and the inside ski at −4 to −6 dB in carves.
  - Detune their BPF centres by ±4 %.
  - Brightness factor 1.0.
- **Snowboard** = one wide voice:
  - The same chain with all band centres × 0.7 (about 0.5 octave lower).
  - Add a **"growl" layer**: noise → BPF 120–300 Hz (Q 1.5) amplitude-modulated by a 30–37 Hz sine at 25 % depth (torsion / bending modes).
  - Growl level −6 dB re hiss, rising with edge load.
  - Heel-side vs toe-side: heel-side gets about 1.5 dB more growl and a slower chatter rate (the "stone across water" skip).
- **Flat-base board glide** (board flat, not on edge): broadband low "shhh", BPF 500 Hz–2 kHz, smoother than an edge, −4 dB.
- **Pole plant**, triggered on turn initiation:
  - Soft or groomed snow: two layers.
    - Click: 4 ms noise burst, BPF 2.5 kHz, Q 2, attack 0.5 ms, exponential decay τ = 3 ms.
    - Thunk: 40 ms decaying sine or noise at 180–260 Hz, τ = 15 ms, −6 dB re click.
  - Ice: click only, BPF 5 kHz, plus a metallic ring (2 partials at 3.1 and 4.7 kHz, τ = 25 ms, −12 dB).
  - Powder: thunk only (LPF 600 Hz) plus a 60 ms "pff" (LPF 1.2 kHz).
  - Sometimes add a "double tap": a second click 40–90 ms later at −8 dB.
- **Ski clack** (skis touching or crossing) [inferred]:
  - Hard plastic/metal impact, 1–2 ms attack, 3 ringing partials at 900 Hz / 2.3 kHz / 4.1 kHz, τ 20–40 ms, plus a broadband click.
- **Tail slap / ollie pop** (board) [inferred]:
  - A tail tap on snow is an 8–15 ms noise burst, BPF 300–900 Hz, plus a mode thump at 65 Hz, τ 40 ms.
  - On hardpack, add a 2–4 kHz click.
- **Board slap on landing**: section 6.

---

## 5. Powder: muffled whoosh, absorption, face shots, sluff

### Facts
- **[measured]** Fresh snow absorbs highs (α about 0.75 at 2 kHz versus 0.25 at 100 Hz), and absorption is at its maximum right after snowfall (see section 0). https://www.acentech.com/resources/the-quiet-snow/ ; https://accuweather.com/en/weather-news/why-does-it-become-so-quiet-after-a-fresh-snowfall/352439
- **[descr]** Powder sounds like a soft, muffled displacement of deep snow with almost no high end and a weightless feel. https://morphic.com/resources/sounds/skiing-sound-effects
- **[descr]** In deep, untouched powder, skiing can be remarkably quiet; the sound is a soft whoosh. https://soundcy.com/article/what-does-skiing-sound-like
- **[descr]** After storms, snow-covered trees muffle ambience: very quiet, almost no echo (Frank Bry). https://sonicfield.org/?p=132
- **[descr]** In the lightest "cold smoke", displacement lifts crystals well ahead of the skier (CMH heli). https://stories.cmhheli.com/?p=53
- **[descr]** The *Snow* game designed its audio around cutting through fresh powder and the soft "pfff". https://gameinformer.com/games/snow/b/playstation4/archive/2014/10/09/poppermost-wants-its-skiing-game-snow-to-sound-like-cutting-through-fresh-powder-.aspx

### Synthesis recipe
- **Powder glide**: pink-ish noise → LPF 2-pole, fc = 600 + 40·v Hz (max about 1.6 kHz) → BPF bump 200–300 Hz, Q 0.6.
  - Level −10 dB re groomed at the same speed, with +6 dB per doubling.
  - Slow random swell from a low-passed noise modulator at 1.5 Hz, ±3 dB, standing in for turns plowing through deeper pockets.
- **Global "powder muffle"**: when the rider is in powder, put an LPF on the snow buses only (fc about 1.5 kHz, −12 dB/oct) and drop the edge-hiss voice by 12–18 dB. Leave the wind bus alone.
- **Powder turn "whump"**: at each turn apex, send a burst of noise → LPF 500 Hz, attack 60 ms, decay 250 ms, +4 dB.
- **Face shot / snow over the head**:
  - Hiss "pssh": noise HPF 2 kHz + LPF 7 kHz, attack 10 ms, decay 300–600 ms, +2 dB.
  - Simultaneously duck the **wind** by 8–12 dB and LPF it to 800 Hz for 300–800 ms, then restore over 400 ms. Snow packing the helmet and ears muffles everything.
  - Add a few granular ticks (crystals hitting goggles): 50–200/s, 0.3 ms each, HPF 4 kHz, −18 dB.
- **Sluff** (snow sliding behind):
  - Low rumble-hiss, noise → BPF 150–700 Hz, plus HPF'd sparkle 3–6 kHz at −15 dB.
  - Lags the rider by 0.5–1.5 s. Level follows slope steepness × recent turn energy, decaying τ ≈ 2–4 s.
  - Pan behind or uphill; reduce the early-reflection send.
- **Ambience in powder**: lower the mountain-ambience level by 3–6 dB and shorten or remove reverb (fresh snow absorbs reflections).

---

## 6. Landings: thud, powder burst, hardpack slap

### Facts
- **[descr]** Wet, heavy clumps land with a soft, muffled thud; wet slushy snow sounds dull. https://morphic.com/resources/sounds/snow-sound-effects
- **[descr]** Snow sliding off a roof onto dense snowpack gave some of the strongest impacts. Stomping over air pockets also worked well (Frank Bry). https://sonicfield.org/?p=132
- **[descr]** Skis landing make a soft "pfff" (Poppermost). https://gameinformer.com/games/snow/b/playstation4/archive/2014/10/09/poppermost-wants-its-skiing-game-snow-to-sound-like-cutting-through-fresh-powder-.aspx
- **[measured]** Stomping on snow is a broadband impulse. SPL decreases monotonically with frequency (ISSW 2012). https://arc.lib.montana.edu/snow-science/objects/issw-2012-1011-1016.pdf
- **[measured]** Board resonances of 16–65 Hz ring after an impact; see section 3.

### Synthesis recipe

Impact energy E = landing vertical speed (m/s) × mass factor. Scale amplitude ∝ √E and lower the brightness when the vertical speed is small.

- **Powder landing ("pomf")**:
  - Noise → LPF 350 Hz (2-pole), attack 15–30 ms, decay 200–400 ms.
  - Plus a subtle sine drop 90 → 55 Hz over 120 ms.
  - Plus a spray tail: noise HPF 2.5 kHz, starting 40 ms after impact, decaying 400–700 ms, at −10 dB.
  - No click.
- **Groomed landing**:
  - Thud: noise → BPF 120 Hz, Q 1, decay 120 ms.
  - Plus a compression crunch: grains 2–5 kHz, 30 ms long, about 400/s.
  - Plus the edge hiss resuming over 80 ms.
- **Hardpack / ice slap**:
  - Transient: 1–2 ms attack, broadband click (HPF 1 kHz, decay 8 ms).
  - Plus a "slap" body: noise → BPF 400–700 Hz, Q 1.2, decay 60–100 ms.
  - Plus a mode ring: ski at 66 Hz, board at 37 Hz plus 65 Hz, τ 60–120 ms.
  - Plus 100–300 ms of chatter at 30–60 % depth if the landing is off-axis.
- **Board flat-base slap vs skis**: the board gets +3 dB in the 150–500 Hz region and a wider, flatter click. Skis get two slightly offset clicks (5–15 ms apart, one per ski).
- **Tail-first ("tail slap")**: the small tail click lands 30–80 ms before the main slap and is 6 dB quieter.
- **Air / tuck**: when airborne, the snow voices go silent. Raise wind slightly (+1–2 dB), since there is no ground masking.

---

## 7. Wind for a rider at 10–30 m/s

### Facts: level vs speed
- **[measured]** Motorcycle helmets, Southampton ISVR wind tunnel (Lower, Hurst & Thomas, Internoise 96):
  - About 90–109 dB(A) at the ear at 22–32 m/s.
  - On the road: 78–90 dB(A) at 13 m/s, rising to 114–116 dB(A) at 54 m/s.
  - **Average slope 15.5 dB per doubling of speed above about 25 m/s.**
  - Spreads of 7–10 dB between helmets at the same speed.
  - Head position: raising the head a few cm changed level by 4–5 dB; tucking into the lee changed it by 8–9 dB.
  - https://generic.wordpress.soton.ac.uk/isvr-new/wp-content/uploads/sites/422/2022/07/inter96mc.pdf
- **[measured]** Earlier ISVR summary: about 90 dB(A) at 60 km/h, rising linearly with log speed to 110 dB(A) at 160 km/h. The 300–400 Hz region dominates the A-weighted level, and content below about 100 Hz contributes little after A-weighting. https://www.ioa.org.uk/system/files/proceedings/mc_lower_dw_hurst_a_thomas_noise_levels_and_noise_reduction_under_motorcycle_helmets.pdf (via search summary)
- **[measured]** Dutch test of 10 helmets: 100–106 dB at 100 km/h (27.8 m/s), average 103 dB. Phonak gives a typical 95–105 dB at 100 km/h. https://swov.nl/en/publicatie/wind-noise-motorcycle-helmets ; https://www.Phonak.com/content/dam/celum/phonak/master-assets/en/documents/earplugs/ph-flyer-serenity-choice-motorsports-v21.pdf
- **[measured]** Cyclists, wind tunnel, no helmet (Seidman et al. 2017, Otolaryngology–HNS):
  - 84.9 dB at 10 mph (4.5 m/s) up to 120.3 dB at 60 mph (26.8 m/s). That is about 13.7 dB per doubling, unweighted.
  - Loudest at the **downwind ear** with the head 90° to the wind, due to eddies on the lee side.
  - Up to 20 dB difference between the ears at high speed.
  - https://scholarlycommons.henryford.com/otolaryngology_articles/65 ; https://noisyplanet.nidcd.nih.gov/have-you-heard/wind-noise-can-contribute-to-noise-Induced-hearing-loss-in-cyclists
- **[measured]** Cycling, artificial head, 25 / 40 / 60 km/h: the spectrum widens with speed and reaches 0–21 kHz at 60 km/h with RMS above 105 dB. A bicycle helmet *reduced* the level (2020 poster). https://thieme-connect.de/products/ejournals/html/10.1055/s-0040-1711227?lang=de
- **[measured]** Cars (SAE 2015-01-1531): dB(A) at the driver's ear scales as about **U^5.7** (≈17 dB per doubling) and far field as U^6.3. Perceived loudness in sones scales only as about **U^1.7**: 50 % more speed roughly doubles perceived loudness. https://saemobilus.sae.org/articles/automobile-wind-noise-speed-scaling-characteristics-2015-01-1531

### Facts: spectrum
- **[measured]** Helmet acoustics (Kennedy et al., Bath; JASA 2011): the helmet *amplifies* noise below 500 Hz and attenuates it above. The cavity under the chin bar is a key source; the wake and boundary layer contribute little. https://acoustics.org/pressroom/httpdocs/161st/Kennedy.html ; https://sciencedaily.com/releases/2011/07/110729175559.htm
- **[measured]** Hearing-aid and dummy-head wind noise:
  - The 1/3-octave spectrum is roughly flat below about 300 Hz and falls as 1/f above that.
  - Head-generated turbulence lies below about 1 kHz; pinna and tragus effects reach about 3 kHz.
  - Higher wind speed pushes energy to higher frequencies.
  - Levels: 75–100 dB SPL per 1/3 octave at 5 m/s; up to 116 dB at 12 m/s.
  - Sources: Dillon 1999; Chung 2009; https://www.thieme-connect.de/products/ejournals/html/10.3766/jaaa.15135 ; https://www.phonak.com/content/dam/phonak/en/evidence-library/white-paper/technical-paper/PH_Insight_WindBlock2.0_210x280_EN_028-2924-02_V1.00.pdf ; https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/8019103
- **[measured]** A commercial microphone (Wuttke 1991) measured flat below about 100 Hz and falling about 12 dB/oct above it. Turbulence theory gives f^-5/3 in the inertial subrange (via search summary of mic wind-noise literature). https://physics.byu.edu/docs/publication/4676
- **[measured]** Outdoor wind noise lies mostly below a few kHz, with a negative power-law fall above the peak. An eddy of size l lasts about l/Uc, where Uc ≈ 0.7·U (Acoustics Today, Winter 2021). https://acousticstoday.org/issues/2021AT/Winter2021/files/basic-html/page21.html
- **[measured]** Aeolian tones:
  - f = St·U/d with St ≈ 0.2 (0.18–0.21 subcritical). Doubling wind speed raises the tone an octave.
  - https://en.wikipedia.org/wiki/Aeolian_sound ; https://glossary.ametsoc.org/wiki/aeolian-tones/ ; https://thermopedia.com/content/1247/
- **[descr]** Vents cause a high-pitched whistle from air flowing over them. Air through helmet openings produces whistling (patents). https://agvsport.com/blog/news/is-wind-noise-normal-in-a-helmet.html ; https://patents.google.com/patent/US3778844A/en
- **[descr]** Riders hear wind whoosh grow above about 20 mph (9 m/s). A tuck intensifies it, an upright stance softens it, and at high speed wind dominates everything else. https://soundcy.com/article/what-does-skiing-sound-like
- **[measured]** Ski helmets reduce correct sound-direction localisation from about 72.5 % to 61.3 % (Croatian study). Warn-sounds are first noticed later. https://repository.medri.uniri.hr/islandora/object/medri:2992/datastream/FILE0/view

### Facts: gusts and modulation
- **[measured]** Standard gust definitions use a 3 s moving average, and gust factors scatter widely at 1–10 s averaging. The Durst relation implies about 16.5 % turbulence intensity. https://portfolio.jcu.edu.au/publications/JCU150674 ; https://par.nsf.gov//servlets/purl/10378645
- **[measured]** A wind-noise simulator driven by wind speed (Mirabilii et al., IWAENC 2022):
  - Recorded at 2–18 m/s.
  - Spectral shape (LSF filter) and short- and long-term variance are polynomial functions of flow speed.
  - Short-term variance follows GARCH(1,1).
  - Wind-speed profiles are drawn from a **Weibull** distribution.
  - https://www.audiolabs-erlangen.de/resources/2022-IWAENC-SWN
- **[measured]** Nelke & Vary 2014: wind noise modelled as an AR spectral shape plus a Markov chain for temporal on/off behaviour ("strongly rumbling, highly non-stationary"). https://www.iks.rwth-aachen.de/publikationen/publications-detail//nelke14a/
- **[descr / code]** Andy Farnell, *Designing Sound*, Practical 18 (wind):
  - Wind-speed LFO 0.1 Hz.
  - **Gust** = white noise → two 1-pole LPFs at 0.5 Hz.
  - **Squall** = noise → two LPFs at 3 Hz, thresholded at 0.4.
  - Main noise BPF 800 Hz, Q 1.
  - **Howl** resonator 1000 Hz, Q 60, swept 600–1000 Hz.
  - Wire/branch whistles BPF 200 and 400 Hz, Q 40.
  - Output band HPF 200 Hz / LPF 4 kHz.
  - Spatial delay taps at 100–3000 ms.
  - https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical18.html
- **[standard physics]** Doppler: f' = f·c / (c − v·cosθ), with c ≈ 331 + 0.6·T m/s, so about 325 m/s at −10 °C. At 20 m/s the approach/recede ratio is (c+v)/(c−v) ≈ 1.13, about 2.1 semitones total swing. At 30 m/s it is about 3.2 semitones. https://designingsound.org/2014/02/25/whoosh-review/ (and standard formula)

### Synthesis recipe (rider wind)
- **Airspeed**: `U = |v_rider − v_wind|`, where v_wind = mean wind + gust. Wind noise should follow airspeed, not ground speed.
- **Level**:
  - Physical law: L ≈ 85 dB at 5 m/s, slope 15.5–17 dB per doubling (≈ 52–57·log10 U). That gives about 101 dB at 10 m/s, 117 at 20 and 126 at 30 for an unprotected ear.
  - Game mix: use **amplitude ∝ (U/10)^1.6** (about 9.6 dB per doubling), soft-clipped with a tanh, so 5 → 30 m/s spans about 25 dB. That is perceptually closer to the sones law (U^1.7 loudness), keeps the snow audible, and still makes speed scary.
  - Gate wind in below about 2 m/s.
- **Spectrum** (main turbulent body, ear-level):
  - Noise → **2-pole LPF**, fc = 250 + 45·U Hz (≈ 700 Hz at 10 m/s, 1.15 kHz at 20, 1.6 kHz at 30) with Q 0.5. Then an extra 1-pole LPF at fc·4 to get roughly −6 → −12 dB/oct.
  - **HPF 25–35 Hz.**
  - **Low-shelf / peaking +4 to +6 dB at 150–400 Hz** (helmet amplifies <500 Hz; the 300–400 Hz region dominates the A-weighted level).
  - **Buffeting**: an extra low band of noise → BPF centre 0.2·U/d_head with d_head ≈ 0.2 m. That puts it at U Hz (10–30 Hz) — feel more than hear. Run it at −6 dB with 40–80 % random AM.
  - **Pinna/goggle-edge band**: BPF fc = 0.2·U/0.012 m (≈ 170 Hz at 10 m/s, 500 Hz at 30) × 4–8 harmonics region. Practically, BPF 1.5–4 kHz, Q 0.8, level rising +0.4 dB per m/s above 10 m/s, standing in for "higher speed spreads energy upward".
- **Stereo / head yaw**:
  - With yaw angle ψ between head and airflow, the downwind ear gets +k·sin|ψ|, where k = 6 dB in the game (up to 20 dB in reality), plus more <500 Hz content.
  - The upwind ear gets −3 dB and a brighter tilt.
  - Tuck (crouch) = −4 to −8 dB and darker (fc × 0.8). Upright = +3 dB (the head and chest catch the flow).
- **Gusts / unsteadiness**:
  - Speed fluctuation: σ_U = 0.10–0.20 × U_wind (turbulence intensity 10–20 %; Durst ≈ 16.5 %).
  - Build it from noise through two 1-pole LPFs at **0.3–0.6 Hz** (gust, 2–6 s time scale) plus noise through two LPFs at **2–4 Hz** thresholded (squalls / eddy shedding).
  - Because L ∝ ~55·log U, ±15 % airspeed gives about ±3.3 dB physical. In the game mix use ±2 dB plus a ±10 % fc wobble.
  - Add a very slow 0.03–0.1 Hz drift for synoptic changes.
  - Alternative: draw mean wind per area from a Weibull (k ≈ 2) distribution, as in Mirabilii 2022.
- **Helmet vent / strap whistles** (sparse, angle-dependent):
  - 1–3 resonators (BPF or resonant noise), **Q 30–60**, fc = 0.2·U/d with d = 3–8 mm. That is about 250–650 Hz at 10 m/s and 750–2000 Hz at 30 m/s: an octave per speed doubling.
  - Gate each one by a yaw window (on only within ±8–15° of a "magic" angle), fading in over 150–300 ms.
  - Level −20 to −28 dB re broadband.
  - Pitch wobbles ±3 % with the gust signal.
- **Pass-by whooshes** (trees, poles, lift towers, rocks, other skiers):
  - Spawn when an object's closest-approach distance r0 < 6 m.
  - Envelope: intensity ∝ 1/(r0² + (v·t)²). Time to closest approach t ∈ [−T, T]; T = 3·r0/v.
  - Source: noise → BPF 800 Hz–3 kHz (thin objects like poles brighter, about 2–4 kHz; trees broader and lower, 400 Hz–2 kHz, + leaf/needle hiss).
  - Apply Doppler as a pitch or filter-centre shift ratio of c/(c − v·cosθ). This is a small effect: ±3 % at 20 m/s. Exaggerate to ±6–8 % for game feel.
  - Pan from front to the side it passes. Pass-by length: about 2·r0/v, roughly 0.2–0.6 s at 20 m/s and 2–6 m.
  - Lift towers: add a low "wom" (BPF 150–300 Hz) and a short pressure-pulse thump when r0 < 2 m.

---

## 8. Mountain ambience

### Facts
- **[measured]** Natural sound in remote high-mountain snowfields in winter is about **25 dBA**, against 70+ dBA near summer waterfalls. In winter at Aosta Valley ski resorts the background was often below 30 dBA and up to 20 dB lower than in summer or autumn. Snow damps almost all natural sound, and wind is the main winter natural source (Tibone et al., Environments 2020). https://iris.polito.it/bitstream/11583/2803332/1/environments-07-00018-v2.pdf
- **[measured]** Yellowstone winter monitoring: very low natural ambient levels near the passes. Temperature, wind and inversions strongly control how far sounds carry; the quieter the ambient, the farther sounds travel. https://npshistory.com/publications/yell/winter-acoustic-mon-2016-2017.pdf
- **[measured]** L90 is the standard proxy for natural ambient level. Sound-level meters often bottom out near 20 dBA, so lower values are unreliable. https://www.nps.gov/subjects/sound/rm-47-appendix-a-glossary.htm ; https://www.leg.mn.gov/docs/2015/other/150681/PFEISref_2/USFS%202012e.pdf
- **[measured]** Raven defensive calls: mean f0 ≈ **448 Hz** (SD 17), duration about **140 ms** (playback calls about 187 ms), strongly time-frequency modulated, harsh. The NPS calls the common call a "mid-frequency caw". https://pmc.ncbi.nlm.nih.gov/articles/PMC5740903/ ; https://www.nps.gov/subjects/sound/sounds-common-raven.htm
- **[measured]** Creaking analogue: wind-induced creaks in buildings sit in the 500 Hz–5 kHz third-octaves, dominant around 1–2 kHz octaves (Korchev et al., IOA). Branch sway is 0.2–1.1 Hz. Stem sway sends 45–50 Hz elastic waves into the roots. https://www.ioa.org.uk/system/files/publications/A%20KORCHEV%20EH%20CLARKE%20S%20DANCE%20O%20RISPOLI%20WIND%20INDUCED%20CREAKING%20NOISE%20IN%20TALL%20BUILDINGS%20-%20PART%201.pdf ; https://digitalcommons.lib.uconn.edu/gs_theses/253 ; https://www.idpan.poznan.pl/images/stories/dendrobiology/vol64/64_37_42.pdf
- **[descr]** Lifts give a steady low motor hum, a sharp metallic clank as the chair grip engages, and a higher whir from the gears and cable. Snowmaking guns give a loud roar of water through nozzles that carries to the car park. https://soundcy.com/article/what-does-skiing-sound-like ; https://www.denvergazette.com/?p=436825
- **[descr]** Fine snow falling onto leaves at −7 °C sounds like white noise (freesound "fine_snow_falling_at_minus_7c"). https://freesound.org/people/cyclic/sounds/666749/

### Synthesis recipe
- **Bed**: a near-silent floor at −60 dBFS-equivalent (~25 dBA). Pink noise → LPF 1.2 kHz → HPF 60 Hz, at −48 to −54 dB re full-scale wind at 20 m/s. Barely audible; it mostly gives "air".
- **Distant ridge wind**:
  - Noise → BPF 120–450 Hz, Q 0.7, plus a quieter howl resonator at 300–700 Hz (Q 20–40, ±15 % slow sweep).
  - Envelope from noise → 2× LPF 0.05–0.15 Hz (swells 7–20 s long) with a threshold, so it comes and goes.
  - Level −30 to −40 dB. Raise it with altitude and exposure.
- **Tree creaks** (forest areas):
  - Event rate 0.02–0.2/s, scaled by wind.
  - Each creak is a stick-slip pulse train at 20–80 pulses/s for 0.3–1.2 s, gliding ±20 %.
  - Each pulse excites a resonator bank at 700 Hz, 1.4 kHz and 2.1 kHz (Q 15–25).
  - Phase-lock creak onsets to a 0.2–1.1 Hz sway LFO.
- **Snow dropping from branches**:
  - Rate 0.01–0.05/s, higher in sun or thaw.
  - "Whump": noise LPF 300 Hz, 150–300 ms.
  - Then a sprinkle: granular noise HPF 2 kHz, 300–900 ms, 200–600 grains/s, decaying.
- **Ravens**:
  - Sparse: 1 call-group per 30–120 s, 1–4 calls per group, 0.4–0.9 s apart.
  - Each call: f0 380–520 Hz with ±10–20 % downward or arched glide over 120–200 ms.
  - Rich harmonics up to about 4 kHz via a saw or pulse source with formants at about 1.1 kHz and 2.4 kHz.
  - Add jitter or roughness (AM at 30–60 Hz) for the "croak".
  - Distance: LPF 3–5 kHz plus a long, low reverb.
- **Lifts** (near stations or towers):
  - Motor hum 50/100 Hz plus harmonics (or 40–80 Hz) at −30 dB.
  - Cable whir: BPF 600 Hz–1.5 kHz, slightly tonal.
  - Tower passage: 4–8 roller "clack-clack" impacts at about 8–12 per second (wheel spacing / cable speed of about 5 m/s), each 5 ms, BPF 1–3 kHz, metallic partials.
  - Grip clank: 2–3 metallic partials at 800 Hz / 1.9 kHz / 3.6 kHz, τ 150 ms.
- **Reverb**: treat fresh snow as absorbent (RT shortening, HF damping). Keep a long, dark, low-level (−20 dB send) "valley" reverb for distant events, with HF cut above 3 kHz.

---

## 9. CC0 / public-domain reference recordings found (freesound.org)

Licence and duration were checked on each sound page unless marked "(listing only)". The last column says what each file is useful for.

| URL | Licence | Length | What it is | Use |
|---|---|---|---|---|
| https://freesound.org/people/Lydmakeren/sounds/567839/ | CC0 | 3:29 (48 kHz/24-bit stereo) | POV alpine skiing on a prepared (groomed) slope, with slalom tag | **Best groomed-carve reference** |
| https://freesound.org/people/Nox_Sound/sounds/667729/ | CC0 | 4:37 (48 kHz/24-bit mono, Tascam DR-05) | Snowboard sequence; tags glide/ice/slide | **Board glide / ice reference**; there is also a "Snowboard loops" pack |
| https://freesound.org/people/facemusic/sounds/39082/ | CC0 | 1:57 | "Creaky snow" squeaking under a snowboard, skiers passing, lift masts | **Cold squeaky snow under a board** |
| https://freesound.org/people/JoanaP_130315021/sounds/424622/ | CC0 | 1:04 (m4a 64 kbps) | Skiing down a mountain, fast; low-bitrate phone-type recording | Rough speed / wind character |
| https://freesound.org/people/cribbler/sounds/592379/ | CC0 | 0:06 (48 kHz/32-bit) | Ski pass-by | Pass-by envelope |
| https://freesound.org/people/Selector/sounds/680075/ | CC0 | 0:50 | Skiers and snowboarders passing on a hillside (Bashkortostan, March) | Ski vs board pass-bys |
| https://freesound.org/people/xkeril/sounds/720302/ | CC0 | 1:36 (Zoom H5n) | Beside a Zermatt slope, skiers passing, quiet day | Slope ambience + pass-bys |
| https://freesound.org/people/kyles/sounds/454092/ | CC0 | 2:51 (48 kHz/24-bit FLAC) | Heavy, strong mountain gusts, Swiss Alps | **Gust statistics reference** |
| https://freesound.org/people/felix.blume/sounds/447375/ | CC0 | 24:41 (96 kHz/24-bit, Schoeps MS) | Wind "singing" in an old ski-lift tube/cable at Chacaltaya, Bolivia | Aeolian / howl tones |
| https://freesound.org/people/musicbrain/sounds/215690/ | CC0 | 0:50 (Zoom H2n) | Walking in snow, crunch plus boot squeak | Crunch grains |
| https://freesound.org/people/dmartinp/sounds/263134/ | CC0 (listing only) | ? | Binaural chairlift ride, Crystal Mountain WA | Lift ride |
| https://freesound.org/people/schafferdavid/sounds/419318/ | CC0 (listing only) | ? | Platter-lift arrival area, French Alps; cable impacts | Lift mechanics |
| https://freesound.org/people/rthijs/sounds/676548/ | CC0 (listing only) | ? | Top of a Swiss ski lift: lift mechanics, birds, ski and board sounds | Lift + slope |
| https://freesound.org/people/andriiperevodchyk/sounds/519459/ | CC0 (listing only) | ? | Riding past a chairlift tower | Tower roller clatter |
| https://freesound.org/people/kyles/sounds/637566/ | CC0 (listing only) | ? | Light wind through bare winter forest | Forest ambience bed |
| https://freesound.org/people/cyclic/sounds/666749/ | CC0 (listing only) | ? | Fine snow falling at −7 °C onto leaves (white-noise-like) | Snowfall texture |
| https://freesound.org/people/Barbamiz/sounds/116136/ | CC0 (listing only) | ? | Snow falling from trees | Branch drops |
| https://freesound.org/people/traus/sounds/370266/ | CC0 (listing only) | ? | Winter night, icy trees cracking as they sway | Tree creak / crack |
| https://freesound.org/people/Elements-Library/sounds/683789/ | CC0 (listing only) | ? | Hard impact on snow (Rode NT1, 48 kHz) | Landing thud |
| https://freesound.org/people/craigsmith/sounds/675895/ | CC0 (listing only) | ? | Body fall in hard snow | Hard landing |
| https://freesound.org/people/fleurescence/sounds/573133/ | CC0 (listing only) | ~3 s | Snowboard binding straps ratcheting | Board foley |

Not CC0, but useful as descriptions:
- Sonniss / A Sound Effect "SKI RIDE" (Italian Alps 2023, Rode NTG5, 192 kHz; groomed carving, off-piste powder, pass-bys). https://sonniss.com/product/ski-ride
- "Downhill Skiing" (Upstate NY; swishes, crunching carves, stops). https://www.asoundeffect.com/winter-sound-effects-sfx-libraries-that-give-you-great-sounds-of-ice-and-snow
- Acoustic Atlas squeaky-snow recording (item 2344; licence not stated). https://www.lib.montana.edu/acoustic-atlas/acoustic-atlas-blog/posts/squeaky-snow.html
- I found no CC0 recording of a clean "ski carve" or "hockey stop" on Freesound: searching "ski carve" with the CC0 filter returned 0 results.

---

## 10. Gaps and caveats
- I found no peer-reviewed measurement of **ski or snowboard sliding noise spectra vs speed**. The hiss level and brightness laws in sections 1 and 3 are inferred from friction physics and descriptions; tune them against the Lydmakeren and Nox_Sound CC0 recordings.
- Auer, Lechleitner & Lechner (2018, *Lärmbekämpfung* 6:211–214) built an empirical sound-power formula for skiers, depending on slope incline, width and snow condition. The numbers are paywalled. https://orlis.difu.de/handle/difu/253157
- The squeak spectrum vs temperature (Arabadzhi 1963) is not retrievable online. The only hard number is the dominant ≈1 kHz peak (Laurentian), plus 1.5–3.5 kHz for harder friction.
- Corduroy ridge spacing (2–3 cm) is an estimate; I found no groomer comb pitch.
- Ski-helmet-specific wind data do not exist in the literature I found. The numbers above come from motorcycle and cycling studies. Ski helmets are open-face with goggles, closer to the cycling case (13.7 dB per doubling, unweighted).

## Source count
Distinct sources cited above: about 60 URLs. Main acoustic or measurement sources:
- Lower/Hurst/Thomas (ISVR)
- Seidman (Henry Ford)
- Kennedy (Bath)
- SAE 2015-01-1531
- Gosselin 2021
- RMIT snowboard decks
- ISSW 2012
- St. Lawrence 1973
- Lang 1976
- Laurentian
- Arabadzhi
- Tibone 2020
- Szipl 2017
- Mirabilii 2022
- Nelke 2014
- Farnell
- Colbeck
- Hasler
- Ishida / Acentech
- Dillon / Chung hearing-aid work
- Korchev
