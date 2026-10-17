# Audio research — how the snow, wind and air should sound

Summary of the research behind Sendit's audio engine (`web/src/audio/`, see `docs/audio.md`). The full notes,
with every source URL and a measured / description / inferred tag on each value, are in
`docs/audio-research-notes/real-world-acoustics.md` (≈60 sources: acoustics papers, wind-noise studies, field
recordists, skiers' descriptions) and `docs/audio-research-notes/game-audio-techniques.md` (≈60 sources: game
post-mortems, Farnell's *Designing Sound*, mixing and WebAudio practice). No accounts or logins were used.

## 1. What real skiing and riding sound like

| Situation | What you hear | Numbers we used |
|---|---|---|
| Glide on groomed corduroy | A smooth, broadband hiss; individual crunches merge into a steady sound with speed; carving across the ridges adds a fine "zithhh" buzz you feel in the feet | Level ≈ +7 dB per speed doubling; brightness ≈ 1.6 kHz·(v/5)^0.45 [inferred]. The CC0 groomed POV run (Lydmakeren #567839) is **flat in octave bands from 500 Hz to 8 kHz**, centroid ≈ 4.8 kHz [measured by us] |
| Carving (edge set) | The hiss gets louder and more focused, a tearing "rip" under load; on hardpack a rattle | Ski bending modes 10–100 Hz, resonances at 22 / 37 / 66 Hz → chatter as 20–40 Hz amplitude modulation [measured modes] |
| Ice / scraped hardpack | A thin, harsh, high scrape with chatter | Hardpack transmits most strongly at 1–10 kHz [measured]; scrape peaks 2–6 kHz [inferred]; SNOW (Poppermost) made ice from overlapping fragments + white noise and had to tame "too icey" highs |
| Skid, hockey stop | Rough broadband scrape plus a fan of thrown snow — the loudest snow sound | Rough AM, brighter on ice; Steep exaggerated slash and powder sounds on purpose |
| Powder | Quiet, soft, muffled "pfff"; fresh snow swallows the highs | Absorption ≈ 0.25 at 100 Hz → 0.75 at 2 kHz [measured]; low-pass ≈ 600 + 40·v Hz, edge hiss −12…−18 dB |
| Snowboard vs skis | One wide base: lower, rumbling, a growl on edge, a flat-base slap on landings; two skis: higher, two contacts, a double clack | Board bending 16 / 37 / 65 Hz, torsion 30 / 54 / 86 Hz; the CC0 board-on-ice recording (Nox_Sound #667729) peaks at **250 Hz**, centroid ≈ 930 Hz [measured by us] |
| Cold snow | Squeaks and crunches below about −10 °C (dominant ≈ 1 kHz, harder friction 1.5–3.5 kHz) | At riding speed the contact patch reaches 0 °C even on −3.5 °C snow (tribometer, 5–25 m/s) → squeak only when slow |
| Landing | Body thud (60–90 Hz), the base slapping, a burst of snow; in powder a soft whoomp | Thud 60–90 Hz, ~80–150 ms; powder burst low-passed ≈ 1.5 kHz |
| Pole plant | A tick as the tip punches in, a crunch, a soft basket thud | Short bursts 3–4 kHz / 1.5–2 kHz + ~150 Hz |

## 2. Wind

- **Level vs speed:** motorcycle helmets measure ≈ 15.5 dB per speed doubling (78–90 dB(A) at 13 m/s, 90–109
  dB(A) at 22–32 m/s); car wind tunnels ≈ U^5.7; bare-headed cyclists 85 → 120 dB from 4.5 to 27 m/s. Perceived
  loudness grows only ≈ U^1.7, so the game compresses this to ≈ 10 dB per doubling.
- **Spectrum:** roughly flat below ~300 Hz and falling as 1/f above; a helmet boosts < 500 Hz and cuts above;
  300–400 Hz dominates the A-weighted level. Recipe: 2-pole low-pass at 250 + 45·U Hz with a +5 dB bump at
  150–400 Hz.
- **Ears:** the downwind ear can be up to 20 dB louder; head position alone moves the level 4–9 dB.
- **Whistles:** Aeolian tones at f = 0.2·U/d (helmet vents / goggle edges, d = 3–8 mm → 250 Hz–2 kHz), narrow
  (Q 30–60), latching in and out.
- **Gusts:** turbulence intensity 10–20 %; Farnell's wind uses gust noise ~0.5 Hz plus squalls ~3 Hz (±3–4 dB).
  The CC0 Swiss gust recording (kyles #454092) is flat to ~2 kHz, centroid ≈ 1 kHz — distant wind is brighter than
  helmet wind.
- **Tuck:** the lee of a windscreen measures 8–9 dB quieter → rush −6 dB and darker when tucked.
- **Clothing:** previews of Steep describe wind "whipping through your clothing" at speed; SNOW had a
  clothing-in-wind layer → jacket flap, AM 8–25 Hz rising with speed, 200–600 Hz band, from ~12 m/s.

## 3. How games build it

- **Published detail is thin:** no GDC talk covers snow or board audio for Steep, Riders Republic, SSX sound
  effects, Shredders, Lonely Mountains, Descenders, Infinite Air, Amped or 1080. The best primary source is the
  SNOW (Poppermost) write-up (A Sound Effect):
  - a slightly distant perspective sounded more natural than contact mics;
  - EQ was the main surface cue, softer meaning darker;
  - its FMOD parameters were speed, wind speed and turning speed;
  - rail loops were made with a granular tool.
- **Steep:** contact sound gets the most effort, slash and powder are exaggerated, breath and heartbeat signal
  risk, and the music intensifies while a run goes well.
- **Racing (NFS Unbound):** the engine is pulled back at high speed to make room for wind and pass-bys. We do the
  same with music: −4 dB above 18 m/s.
- **Mixing:**
  - target about −18 LUFS for browser and mobile, true peak ≤ −1 dBTP;
  - duck 3–9 dB, attack 10–250 ms, release 0.35–1.6 s, one priority per target (HDR-style);
  - the WebAudio DynamicsCompressor has no look-ahead and tops out at ratio 20, so a soft clipper goes after it.
- **WebAudio:**
  - dense grains and per-sample noise belong in an AudioWorklet with no allocation in `process()`;
  - k-rate AudioParams keep automation deterministic under OfflineAudioContext;
  - test with offline renders of fixed physics traces.

## 4. Comparison with reference recordings

All references are CC0 previews from Freesound, downloaded without an account and used for analysis only; none
are shipped. `node web/scripts/audio-compare.mjs <url> <files…>` prints these profiles. Values are octave-band
levels in dB relative to the loudest band, for the loudest 15 % of seconds.

| Recording | 63 | 125 | 250 | 500 | 1k | 2k | 4k | 8k | 16k | centroid |
|---|---|---|---|---|---|---|---|---|---|---|
| Groomed POV run (Lydmakeren #567839) | −27 | −16 | −9 | −4 | −3 | −3 | −2 | 0 | −6 | 4.7 kHz |
| Our groomed carve, skis (first build) | −25 | −23 | −20 | −17 | −10 | −6 | 0 | −3 | −10 | 4.9 kHz, a 4 kHz fizz from the grain layer |
| Our groomed carve, skis (tuned) | −23 | −21 | −17 | −10 | −4 | −2 | 0 | −3 | −11 | 3.8 kHz |
| Snowboard on ice (Nox_Sound #667729) | −20 | −9 | 0 | −4 | −6 | −7 | −12 | −14 | −17 | 0.93 kHz |
| Our board carve (first build) | −14 | −14 | −16 | −14 | −11 | −4 | 0 | −3 | −9 | 4.7 kHz |
| Our board carve (tuned) | −10 | −4 | 0 | −2 | −6 | −3 | −5 | −9 | −17 | 1.3 kHz |
| Alpine gusts (kyles #454092) | −7 | −8 | −6 | −4 | 0 | −1 | −9 | −20 | −31 | 1.1 kHz |
| Squeaky snow under a board (facemusic #39082) | 0 | −9 | −4 | 0 | −8 | −15 | −22 | −27 | −34 | 0.16 kHz |
| Ski pass-by (cribbler #592379) | −48 | −25 | −14 | −5 | −1 | 0 | −2 | −2 | −10 | 3.4 kHz |

**What changed because of the comparison:**
- The glide hiss became pink noise between a rising high-pass and low-pass. Pink noise is flat in octave bands,
  like the groomed reference.
- The crystal-grain layer dropped by 9 dB. It had been masking everything with a 4 kHz fizz.
- The board's body moved to a 230 Hz band.
- The ambient wind moved up to ~650 Hz with more hiss.

Envelope modulation in the references is low (0.2–0.6 % for the groomed run, 1–2 % on the icy board), so the
continuous layers stay smooth and the "events" (edges, plants, slashes) carry the rhythm.

Other CC0 recordings listed in the notes for future comparison: lift towers and chairlift rides, a walk in crunchy
snow (#215690), a slope ambience in Zermatt (#720302), skiers passing (#680075), tree creaks (#370266) and snow
falling from trees (#116136).

## 5. Gaps

- No paper measures ski or snowboard sliding-noise spectra against speed. The hiss level and brightness laws are
  inferred and were then checked against the CC0 recordings.
- No ski-helmet wind data exists; the wind numbers come from motorcycle and cycling studies.
- There is no CC0 recording of a clean carve or a hockey stop on Freesound. Those layers are tuned from
  descriptions and from the groomed POV run.
