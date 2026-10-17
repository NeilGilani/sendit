# Audio — the procedural snow, wind and air engine

Everything the rider hears is synthesized live from the physics. The snow under the skis or board, the wind,
spins, landings, grinds and the mountain ambience are not looped samples, so nothing repeats. The only
recordings are three short CC0 snow textures, granulated under the synthesis. The research behind
the numbers and the comparisons with real recordings are in `docs/audio-research.md`. Every tunable lives in
`web/src/audio/tuning.js`.

## Files

| File | Role |
|---|---|
| `web/src/audio.js` | `SoundScape`, the live wrapper used by `main.js` (unchanged API: `init`, `resume`, `oneShot`, `update(dt, camera)`, `applyVolumes`). Reads the rider every frame, forwards bus events, plays music and UI cues, birds, ravens and the heli. |
| `web/src/audio/engine.js` | `AudioEngine`, which owns the mix graph, the two worklets, the one-shots, grinds and ambience. It is driven by plain rider frames plus events, and every call takes the context time it applies at, so it works the same live and in an `OfflineAudioContext`. |
| `web/src/audio/worklet.js` | AudioWorklet DSP: the `sendit-snow` and `sendit-wind` processors (per-sample noise, filters, grains and modulation). It has no imports. Its tunables arrive as `processorOptions`. |
| `web/src/audio/rider.js` | `readRider(player)` turns `player.js` state into the numbers the engine uses. Read-only. |
| `web/src/audio/fx.js` | One-shot synthesis: pole plant, edge change, slash, take-off, landing, grab rustle, crash tumble, near-miss pass-by, hard brake, tree creak, crowd cheer. |
| `web/src/audio/grind.js` | Rail and box grind: a modal metal scrape plus the `grind_loop` sample, lock-on clang, kink ticks and pop-off. |
| `web/src/audio/ambience.js` | Per-map beds: forest soughing and creaks, park crowd babble, cheers and a distant PA announcer. The distant wind lives in the wind worklet. |
| `web/src/audio/lift.js` | Chairlift: rope hum and cable sing, chair creaks, and the grip rattling over each tower's sheaves. |
| `web/src/audio/others.js` | The other skiers on the run (`life.js`): the nearest three each get a positional (HRTF) snow voice that follows their speed and edge, Doppler-shifted by their radial speed. |
| `web/src/audio/breath.js` | The rider's breathing: an exertion meter, catching breath after hard runs, and huffs on crashes. |
| `web/src/audio/tuning.js` | Every parameter, in one place. |
| `web/src/audio/harness.{html,js}` | Offline render and analysis harness for the tests. Dev only; nothing imports it. |
| `web/scripts/audio-test.mjs` | Headless test that renders ~35 scripted rides and checks levels, clipping, NaNs and sound-design relations, optionally writing WAVs. |
| `web/scripts/audio-dsp.mjs` | Runs the worklet DSP directly in Node (AudioWorklet shim): checks raw processor output for NaNs, blow-ups and headroom (peaks must stay under the 0.7 safety knee). Takes seconds. |
| `web/scripts/audio-trace.mjs` | Records real-physics rides (skis and board) as rider-frame traces for the test. |
| `web/scripts/audio-compare.mjs` | Octave-band, centroid and modulation comparison of recordings and renders. |
| `web/scripts/audio-spectrogram.mjs` | Log-frequency spectrogram PNGs of recordings and renders, for comparing time structure. |

## Signal flow

```
destination ← soft clip (tanh, ceiling 0.86) ← limiter (−2 dB, 20:1) ← master (settings.master × 0.8)
   master ← glue (−12 dB, 1.6:1) ← sfx (settings.sfx) ← snow  · wind · ambience · fx · ui
   master ← music (settings.music) ← low-pass (air / bail) ← duck ← Zen track + challenge track
```

- The bus gains are `AUDIO.mix`. The settings sliders (master, sfx, music) scale the matching nodes, so they work
  exactly as before.
- The music crossfade and its rests between passes are unchanged. The engine only adds the duck and the low-pass
  after them.

## The snow engine (`sendit-snow`)

Inputs come from `readRider`: speed, edge angle, load (in g, from the lateral acceleration and compression), skid
angle and skid amount, stop (hockey stop or plow), surface weights from `terrain.getSurface` (groomed, powder,
rock / scraped as "ice", and park on maps flagged `park`), deep-snow sink, and snowboard versus skis.

| Layer | What it is | Driven by |
|---|---|---|
| Glide hiss | Pink noise between a high-pass (300 Hz) and a low-pass (7 kHz, at most 11 kHz) that both rise as (v/5)^0.45. Gives flat octave bands like the groomed reference. | Level ∝ v^1.15 (+7 dB per doubling), capped at ~23 m/s where the wind takes over. 60 % quieter on flat, unweighted skis between turns. Quieter in powder (−15 dB) and when sunk. |
| Corduroy | Zippy amplitude modulation at v / 2.2 cm, jittered | Groomed snow, flat base (fades with edge angle) |
| Crystal grains | Poisson clicks (0.25–1.6 ms bursts) through a surface band: groomed 2.6 kHz, ice 4.2 kHz, powder 0.9 kHz, cold snow 1.3 kHz | Rate 60 + 160·v·(1 + 2.2·edge·load), plus a burst rate while skidding. This is the never-looping texture |
| Carve | Two broad resonant bands (520 Hz and 1.7 kHz, rising with speed, slowly wobbling) | edge^1.3 × load^0.9 × speed; louder on ice, quiet in powder |
| Chatter | Irregular amplitude modulation, each cycle with a new depth: skis 20–40 Hz, board 15–35 Hz (their bending modes) | Hard or icy snow, high edge angle, speed > 8 m/s; ice while skidding |
| Skid / stop | Rough band-passed scrape (1.7 kHz, or 3.8 kHz on ice) with a lumpy envelope, plus thrown spray | Skid angle or amount; hockey stop ×1.4 |
| Powder | Pink-and-brown whoosh, high-passed at 110 Hz, low-passed at 600 + 40·v Hz; the whole snow output also gets a low-pass that closes in deep snow | Powder weight × (0.5 + 1.6·sink) |
| Board base / growl | Band-passed rumble at 260 Hz (flat base, nothing below ~130 Hz) and a 320 Hz growl on edge. Coarser, choppier grains. | Snowboard only |
| Ice | High-passed, band-passed scrape at 3.8 kHz with chatter, plus two narrow edge-scrape resonances (Q 8) wandering 2–6 kHz | Rock / scraped surface weight |
| Edge squeal | Stick-slip: a jittered sawtooth at 330–520 Hz (rising with speed), band-passed at 1.8 kHz and latching on and off. The resulting harmonic ladder is visible in a CC0 resort descent. | Hard skids on hard or icy snow with the edge set |
| Cold squeak | Creaks of 40–160 ms: noise jerked at 40–90 Hz (stick-slip) through two band-passes gliding in 350 Hz–1.3 kHz. Shaped on a CC0 creaky-snow recording. | Map `cold` (snow below about −10 °C), slow riding only (gone by 12 m/s, when friction melts the contact) |

**Field textures.** Grains of three short CC0 recordings are mixed under the synthesis for the organic
detail that noise models lack:
- `tex_snow_ski.mp3`: a groomed carve run;
- `tex_snow_board.mp3`: board glide;
- `tex_snow_skid.mp3`: a board skid.

They are granular: Hann grains of 50–90 ms from random positions, about four overlapping, detuned ±3 %. Their
playback rate follows speed (0.85–1.15), and their level follows the same speed and edge-weight curves as the
hiss. The skid texture follows skid and stop. The engine posts them to the worklet mono, high-passed at 100 Hz and
RMS-normalised. Set them with `snow.tex`; 0 turns them off.

Stereo width is 0.75 for skis (two contacts, two independent noise streams) and 0.25 for a board.

## The wind (`sendit-wind`)

| Layer | What it is |
|---|---|
| Level | floor + (v / 28)^1.6 (up to ×1.4 beyond), about 10 dB per speed doubling. That is enough to feel at 50–70 mph without becoming harsh. Real helmets measure about 15.5 dB per doubling. Airborne ×1.25. |
| Rush | Pink noise → 2-pole low-pass at 250 + 45·U Hz, plus a +5 dB bump at 280 Hz (the helmet band), plus a little pinna hiss. Each ear is independent, and a slow head-yaw process makes one ear louder than the other (±6 dB). Gust squalls at ~3 Hz. |
| Buffet | Brown rumble below 110 Hz with flutter. Strong in first person, ×0.3 in the chase cam. |
| Whistles | Two vortex-shedding tones at f = 0.2·U/d for d = 4.2 mm and 7.1 mm (Q 40), latching in and out above ~11 m/s |
| Clothing flap | Irregular pulses at 8 + 0.55·U Hz through a 380 Hz band, from 11 m/s. Quieter in the air and when tucked. |
| Tuck | Rush −6 dB and a darker low-pass (the lee of the body) |
| Spin / flip whoosh | In the air, by rotation rate: the ears alternate facing the airflow, so each half turn pans and swells the rush and sweeps its filter, with a whoosh pulse (up to about +7 dB and brighter) as the face swings through the wind |
| Gusts | Ornstein–Uhlenbeck processes (2.2 s rider-relative, ~5 s ambient) modulate level and relative airspeed |
| Map wind | Distant wind over the ridges: band-passed brown noise at the map's `windF`, plus hiss, swelling with the gusts. Level and tone are set per map. |
| Ridge howl | On exposed maps (`maps[id].howl`: Ravenspire, Dragonback) the strongest ambient gusts moan through rock edges: two narrow resonances (Q 14, a fifth apart) gliding in 220–420 Hz, rising with the gust |

Slow motion (the apex slow-mo event) scales every filter and modulation rate by 0.55 + 0.45·scale, so the
mountain drops in pitch with time.

## One-shots and transients

| Sound | Trigger |
|---|---|
| Edge change "shff" | The edge sign flips with real edge angle on both sides of it, above 4 m/s |
| Pole plant (skis) | The same moment (85 % chance, 3–22 m/s, not tucked, ≥ 0.55 s apart), panned to the inside of the new turn |
| Slash | Edge angle crosses 0.6 rad quickly while skidding, above 6 m/s: an exaggerated fan of spray, as Steep does |
| Take-off | `takeoff` event: tail or tip tock, the snow flicked off, and a wind swell rising over ~0.3 s (bigger when faster). The old `jump_pop` sample sits underneath. |
| Grab rustle | `player.grab` rises past 0.5 in the air (on release, a shorter rustle) |
| Landing | `landed` (rawImpact), shaped on CC0 snow-impact recordings: a broadband crack, a body thud at 120–200 Hz, a flat-base slap (board) or double clack (skis), crunchy debris grains thinning out over ~0.5 s, and the snow burst (short and bright on hardpack, long and fluffy in powder) |
| Crash tumble | `crashed`: 4–6 decaying impacts, cloth, a long slide, and a 'yard sale': skis and poles clattering, or the board slapping |
| Tree / rock pass | Any tree or rock passing within 6 m above 6 m/s (`player.scatter.nearest`, read-only): the near-miss sound at a softer level |
| Near miss | `nearMiss`: pink band sweeping 2.6 kHz → 650 Hz (Doppler) with a 4 → 9 → 4 ms comb sweep, panned to the obstacle's side from the travel direction; trees add needle rustle |
| Hard brake | `hardBrake`: spray fan and rough scrape onset (the worklet carries the sustained stop) |
| Grinds | `grindStart` (modal clang, modes retuned ±3 % per rail), the frame's grind speed (continuous scrape and sample), `grindKink` (tick), `grindHop` / `grindEnd` (pop-off). Boxes are duller and lower. |
| Crowd cheer | Park map: `parkLanding` (clean) or a perfect / stomped `landed`; the PA announcer reacts ~1.4 s later |
| Face shot | Deep powder (sunk in) at a turn above 7 m/s: a soft whump and a fizz of flakes over the goggles. Full in first person, ×0.4 in the chase cam. |
| Gate clack (skis) | `gate` (pass): a hollow plastic pole knocked aside, as two short modes and a flex thud. The old `gate` cue still plays on the UI bus. |
| Bindings | `rideStarted`: two boot-into-binding clacks (skis) or two ratchet straps (board) |
| Chair bump | `liftBoarded` / `liftArrived`: a padded thump and a hanger creak |
| Lift tower | Each tower the chair passes (`player._lift.supports`): a 2–3 s sheave-train rattle (18–27 clicks, a thunk every third, loudest mid-train) with a low metal ring, shaped on a CC0 tower recording |
| Breathing | Exertion fills with speed, turn load and stops, and drains at rest. When the rider slows below 3.5 m/s after a hard run: exhales and inhales (formant-filtered noise) that slow and fade. Huffs on crashes and very hard landings. Full in first person, ×0.35 in the chase cam. |

## Ambience per map (`AUDIO.maps`)

| Map | Character |
|---|---|
| Valcrest | Gentle alpine air, birds, an occasional creak |
| Blackspruce | Wind soughing in the conifers (gusty mid band), trunks creaking (stick-slip pulses through woody resonances), birds, tree plops |
| Ravenspire | Strong, gusty high-altitude wind, ravens, cold snow (squeakier grains when slow), the heli |
| Voltage Park | Calmer wind, a crowd (procedural voiced babble of 24 "voices", looped on two decorrelated players), cheers on clean landings, and a far-off PA announcer every 25–50 s. The announcer is unintelligible on purpose: one formant voice through a 400 Hz–3 kHz horn band with 90 / 190 / 310 ms stadium slaps. |
| Dragonback (map 5 branch) | Exposed ridges: strong, very gusty wind, cold snow, a long open reverb tail |
| Kitsune Peak (map 6 branch) | A powder volcano at dusk: calm air, cold dry snow, birch creaks, and a distant temple bell every 40–80 s (bronze modal partials with 2–9 s decays) |
| Fjordline (map 7 branch) | Ski to sea: waves rolling in and washing out far below (swell, break, recede, every 7–11 s) and gull cries over the water |
| Every map | Riding a chairlift: rope hum and tower rattles |

**The place (reverb):** a per-map convolution send on the one-shots, the ambience and a little of the snow. Its
impulse response is generated in code: decorrelated noise with an exponential decay and a tail that darkens as it
falls.

| Map | Reverb |
|---|---|
| Blackspruce | Close forest reflections: 1.1 s, 12 ms pre-delay, send 0.22 |
| Ravenspire | A faint long bowl tail: 2.4 s, 90 ms pre-delay, send 0.1 |
| Voltage Park | Structures: 1.0 s |
| Others | 0.9 s at 0.08 |

Tune it with `maps[id].verb`, `verbTime`, `verbPre` and `verbDark`.

## Mix and perspective

- **Balance at the default volumes:**
  - riding (carving at 14 m/s) is about −18 dBFS RMS;
  - the Zen music is about −24 dBFS, sitting ~6 dB under the riding sound (the research suggests music 4–6 LU
    under SFX);
  - standing still is about −45 dBFS, the quiet alpine air.

  `mix.music` (2.4) sets the music. The old audio had music ~4 dB under its quieter snow loops.
- **Ducking (`AUDIO.duck`):** music −5 dB after 0.5 s of air, −9 dB on a crash (1.6 s), −4 dB toward 30 m/s, −3 dB
  on rails, −5 dB for 0.35 s on hard landings, and −6 dB under a music drop's riser then +2 dB. Attack 0.25 s,
  release 1.6 s.
- **Music low-pass:** 1.2 kHz in big air after 0.4 s, 400 Hz on a bail, opening over ~0.5 s.
- **First person versus chase (`AUDIO.perspective`):** `settings.view === 'fp'` gives the full helmet wind
  (buffet, whistles, flap) and the full low end of the snow. The chase cam hears the snow from a little further
  away (×0.85, less low end), and the wind ×0.75 with little buffeting.
- **Headroom inside the worklets:** the processors run at a low internal level (`snow.out` 0.25, `wind.out`
  0.227) with matching bus gains (`mix.snow` 3.24, `mix.wind` 3.0). Their output passes a soft safety knee
  (linear to ±0.7, tanh above), never a hard clamp. `audio-dsp.mjs` checks that ordinary riding never reaches the
  knee. An earlier build hard-clipped at ±1 inside the worklet in hockey stops, ice and 30 m/s wind; the downstream
  gains hid it, and this test caught it.
- **No clipping:**
  - the glue compressor is gentle on purpose, because Chrome's compressor adds make-up gain that would lift the
    quiet moments;
  - a limiter, then a tanh soft clipper with a 0.86 ceiling, keep even the extreme full-volume test under −1 dBFS.

## Music hooks for the game-feel layer

`juice/music.js` (game-feel branch) calls these optional SoundScape methods when they exist:
- **`sound.setMusicEnergy(level 0..1)`:**
  - lifts the upbeat track above 0.62 energy and releases it below 0.4, with a minimum 8 s hold;
  - makes the music mellow (low-passed at 5 kHz) when calm, fully open by 0.6.
- **`sound.musicDrop(kind, strength)`:** a pink-noise riser over 0.33 s while the music dips 6 dB, the `boost`
  hit when it lands, then a +2 dB push for 0.6 s. There is a 2.5 s cooldown.

## Events the audio listens to

The audio reads these events (read-only): `takeoff`, `jumped`, `landed`, `crashed`, `nearMiss`, `hardBrake`,
`stumble`, `landingGrade`, `parkLanding`, `grindStart`, `grindKink`, `grindHop`, `grindEnd`, `grindClip`,
`slowmo`, `rideStarted` (map id), `settings`, plus the existing game-cue events.

- **No new events were added.**
- **One guarded line in `maps/voltage/hud.js`:** the park HUD used to play its own grind loop on a second
  AudioContext. Its `ensure()` now returns early when `window.__senditAudio.engine` exists, so grinds play once,
  through the main mix and settings.

`PHYSICS.windRoar` (used by the old audio for Ravenspire) is no longer read. The wind worklet covers big-mountain
speed on every map, and Ravenspire's gustier, louder map wind comes from `AUDIO.maps.ravenspire`.

## CPU

Measured by `audio-dsp.mjs` in Node (same V8 as Chrome's audio thread), on a loaded machine:
- the snow worklet costs about 4 % of one core;
- the wind worklet about 2 %;
- the main-thread `frame()` about 0.08 ms per frame.

One-shots are short-lived node graphs: a landing is about 30 nodes and a crowd cheer about 400, released when
they end.

## Fallback

If a worklet processor throws (`processorerror`), the engine counts it (the test fails on it) and switches live
to the sample loops, so a DSP bug can never silence the mountain.

If AudioWorklet is unavailable, the engine falls back to the old sample loops (`snow_*`, `wind_*`), blended by the
same parameters. The one-shots, grinds and ambience still work.

## Testing

```
npm --prefix web run dev -- --port 5192 --strictPort
node web/scripts/audio-dsp.mjs                             # the worklet DSP alone, in Node (fast)
node web/scripts/audio-trace.mjs <dir>                     # real-physics traces (optional)
node web/scripts/audio-test.mjs http://localhost:5192/ [wavDir|-] [traceDir|-] [filter]
BANDS=1 …                                                  # print octave bands per scenario
TUNE='{"snow":{"grains":{"gain":0}}}' …                    # A/B a tunable without editing
node web/scripts/audio-compare.mjs http://localhost:5192/ ref.mp3 render.wav …
```

The test fails on:
- a worklet that does not load;
- non-finite samples or parameters;
- any peak above −1 dBFS (including all volumes at 1 and extreme inputs);
- a page error;
- or a broken relation, such as: carving louder than standing, snow rising with speed, powder quieter and
  darker than groomed, ice brighter than groomed, a board lower than skis, a hockey stop louder than the carve
  before it, wind at 30 m/s much louder than at 4 m/s but not overwhelming, first person windier than the chase
  cam, landings standing out, a forest bed, and a park cheer.

## Tuning tips

- **Too much or too little snow:** `mix.snow`, then the per-layer `gain`s in `snow`.
- **Brightness:** `snow.hiss.hp` / `lp` and `grains.fGroomed`.
- **Wind at top speed:** `wind.exp` (steeper means quieter when slow and louder when fast) and `wind.vMax`.
- **Harshness at 70 mph:** `wind.rush.hiGain`, `wind.whistle.gain`.
- **Per-map mood:** `maps[id]`. The fields are:
  - `wind`, `windF`, `gustiness`;
  - `trees`, `sough`, `birds`;
  - `crowd`, `pa`;
  - `cold`;
  - `bell`, `sea`, `gulls`;
  - `verb`, `verbTime`, `verbPre`, `verbDark`.
- **Real-snow texture versus synthesis:** `snow.tex` (`ski`, `board`, `skid`).
