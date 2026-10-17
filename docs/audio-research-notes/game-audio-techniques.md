# Snow-sports game audio: research notes for a WebAudio engine

Researched 2026-10-16 with web search and fetch only. No accounts were created and no logins were used. Every claim has a source URL. Quotes are kept short. When a value is **my own engineering judgment** and not from a source, it is labelled that way.

**Caveat on coverage.** Snow-sports studios have published very little about their audio. I found no GDC talk on snow or board audio for Steep, Riders Republic, SSX (sound effects), Shredders, Lonely Mountains: Snow Riders, Descenders, Grand Mountain Adventure, Infinite Air, Amped, 1080 or skate. The best primary sources are:

- the SNOW (Poppermost) recording write-up;
- Steep developer Q&As;
- the SSX music-system talk;
- general procedural-audio, racing-audio and mixing literature, which transfers well.

---

## 1. Steep (Ubisoft Annecy, 2016)

| Finding | Source |
|---|---|
| Credits: François Dumas (audio director), Jonathan Wachoru (sound designer), Zikali (composers). A reviewer singles out movement foley, tied to mocap of French freestyle athletes. | https://thesoundarchitect.co.uk/?p=17410 (TLS cert expired at fetch time; content seen via search snippets) |
| The team treats "sliding" as the interaction "between your board and the ground, or between your wings and the air", and says much of the sound design went into that contact. | https://www.gematsu.com/2016/06/ubisoft-announces-open-world-action-sports-game-steep-ps4-xbox-one-pc |
| The big-mountain soundscape is meant to be minimalist and contemplative. Breathing and heartbeat are emphasised to convey risk and adrenaline. | same Gematsu Q&A |
| Music "will also intensify" while the rider keeps a successful performance going. This is performance-driven music intensity, not plain ducking. | same Gematsu Q&A |
| A French UbiBlog interview with Dumas says sound was treated as a main "character", with moods per region. The team listed the key ride actions and put most effort into **slash and powder** sounds, which were **intentionally exaggerated** so players can "feel" the snow by ear. | http://blog.ubi.com/fr-FR/interview-sound-design-steep/ (host no longer resolves; content seen via search-engine summary, so treat as secondary) |
| Previews describe wind "whipping through your clothing" at speed, and wind rushing past the ears while snow caves under the board. Clothing flap is part of the speed cue. | https://gamesbeat.com/?p=130628 ; https://www.shacknews.com/article/98101/steep-review-in-progress-downhill-slope |
| Steep plays in first or third person, with GoPro-style angles. | https://en.wikipedia.org/wiki/Steep_(video_game) |
| Ubisoft Annecy uses Wwise, per its sound-designer job listings. No Steep-specific Wwise details are public. | https://gamejobs.co/Stage-6-mois-Sound-designer-F-H-NB-AAA-Project-at-Ubisoft |
| A reviewer notes some players may prefer wind and spray only over music. This supports a "music optional or low" mix mode. | https://dvd-fever.co.uk/steep-on-xbox-one-the-dvdfever-review |

No public source covers Steep's wind synthesis, surface switching, first-person versus third-person mix differences, or music ducking values.

## 2. Other snow, board and skate games

### SNOW (Poppermost): the best practical snow-audio write-up found
Source: https://asoundeffect.com/recording-and-designing-the-winter-sound-effects-for-snow/

- **Mic choice.** A helmet, ski and boot multi-mic rig sounded "too detailed". A handheld shotgun mic held by someone skiing alongside sounded "much more natural and smooth". **Takeaway:** a slightly distant, smoothed perspective reads better than contact detail.
- **Powder** had no usable recording, so the team squeezed soft plastic foam, which sounds like spraying snow as it expands.
- **Packed ice** was built from short ice fragments placed randomly so they overlap, with **white noise blended in** to smooth them. The same overlap method made the turning sounds. This is granular synthesis by hand.
- **Piste and soft snow** used long steady passages cut into loops. **EQ was the main surface differentiator:** softer surfaces darker, harder surfaces brighter.
- **Early feedback:** the first pass "sounded too icey". Harsh highs were tamed with a linear-phase EQ, and levels were held with a limiter.
- **FMOD parameters:** player speed, wind speed and turning speed.
- **Event layers:** speed wind, clothing in the wind, and surface sounds for straight, turning and stopping. Ambience winds, poles, jump launch and landing were added on top.
- **Rails:** a single contact sound on landing, plus loops made with The Mangler, a granular tool. **Ambience:** recorded without other skiers, because the player is alone.
- Game Informer adds that mics were taped to grind rails. Airtime has a "static" texture, and landing in powder gives a soft "pfff". https://gameinformer.com/games/snow/b/playstation4/archive/2014/10/09/poppermost-wants-its-skiing-game-snow-to-sound-like-cutting-through-fresh-powder-.aspx

### SSX (EA Canada, 2012)
- The RUMR (Realtime User Music Remix) system remixes any track in real time to "accentuate player performance", using runtime parameters, sampling, filters and DSP effects. https://designingsound.org/2012/03/demonstration-of-ssxs-rumr-system/
- GDC 2013 talk by Gordon Durity, "Contextually Driven Interactive Music in SSX": a virtual DJ that rearranges music in sync with gameplay. https://gdcvault.com/play/1017729/Contextually-Driven-Interactive-Music-in
- A Japanese GDC report says the coupling also ran the other way: musical beat could influence gameplay timing, such as landings. https://www.gamebusiness.jp/article/2013/06/24/8167.html
- **Takeaway:** in snow games, music is a gameplay-reactive layer. Filter or stutter it on air and tricks, and push it on landing.

### Riders Republic, Shredders, Lonely Mountains: Snow Riders, Alto, Grand Mountain Adventure, Amped
- **Riders Republic.** A Red Bull behind-the-scenes piece says the aim is the feel of the mountain, including "cracking snow under your snowboard". The page body would not load for detail. https://www.redbull.com/us-en/levels-riders-republic-episode . The game supports Dolby Atmos. https://www.dolby.com/en-gb/experience/riders-republic/
- **Shredders.** One reviewer calls the sound mixing poor and notes that music is the only adjustable audio option. **Lesson:** expose separate SFX, music, ambience and voice sliders. https://www.gamegrin.com/reviews/shredders-review/ . Pro riders voice the characters. https://www.nme.com/reviews/game-reviews/shredders-review-3185454
- **Lonely Mountains: Snow Riders.** No music. The soundscape is skis on snow plus crashes. A reviewer gave sound 6/10. **Lesson:** minimal works only if the surface layer is rich. https://waytoomany.games/2025/01/21/review-lonely-mountains-snow-riders/
- **Alto's Adventure and Odyssey.** Todd Baker composed and designed the sound suite. The score uses randomised sections so it differs per run. No public detail on wind or snow technique. https://www.applesfera.com/juegos-ios/altos-odyssey-la-esencia-no-se-mantiene-en-esta-secuela-sino-que-se-supera-app-de-la-semana ; https://www.cgmagonline.com/interviews/interview-with-the-team-behind-altos-odyssey
- **Grand Mountain Adventure** (Toppluva). A developer interview mentions an audio-software background, but no audio specifics. https://80.lv/articles/developing-a-ski-open-world-game-for-mobile
- **Amped 3.** A reviewer complains that snow-cut and rail-grind sounds "offer nothing for my imagination". **Lesson:** grind and carve need character and variation. https://www.osftw.com/reviews/111/amped-3

### Skate and Tony Hawk (grind audio)
- No public grind-audio talk was found. EA's Viviana Caro gave a talk on skate.'s **ambiance system** (a dynamic system, still in progress). https://www.cirmmt.org/en/events/workshops/research/iam-cirmmt-19
- The THPS 1+2 audio lead says the main remaster change was higher fidelity and less compression. No grind-system detail. https://www.tomsguide.com/news/how-tony-hawks-pro-skater-1-2-got-its-classic-soundtrack-back-and-whats-new

### Racing games (transferable speed and wind practice)
- Racing audio is "many layers of continuously changing sounds" rather than one-shots (Nick Wiswell, Turn 10). https://designingsound.org/2012/04/17/interview-with-nick-wiswell-audio-director-of-turn-10-part-2/
- In Need for Speed Unbound, the engine is pulled right back at high speed to "make more room for aerodynamics and passbys". Pass-by triggers are placed on bridges, tunnels and objects. Music takes over in key moments and fades away to let the car "shine". https://80.lv/articles/a-deep-dive-into-need-for-speed-unbound-s-sound-design
- In a Wwise racing example, engine, tyre and wind each sit in a Blend Container (light and heavy loops) with **separate volume RTPC curves on one Speed parameter**. The engine also has pitch and low-pass curves. https://blog.audiokinetic.com/building-a-car-racing-system-using-wwise/
- Forza Horizon 5 players say cockpit wind and road noise that grows with speed is lacking. Speed-scaled wind is something players notice and want. https://forums.forza.net/t/cockpit-turbulence-and-wind-noise/555367
- DiRT Rally recorded from inside a rally helmet with light post-processing, and captured gravel kick-up as its own layer. https://sennheiser.com/en-ie/stories/customer-stories/codemasters-software ; https://en.wikipedia.org/wiki/Dirt_Rally
- In flight sims, players notice when canopy wind does not scale with airspeed, and it is used as a speed cue. MSFS wind is a Wwise layer with min and max speed bounds. https://forum.dcs.world/profile/49557-ranchgrom/ ; https://devsupport.flightsimulator.com/t/aircraft-wind-sound/4316 ; https://forum.il2sturmovik.com/topic/38720-wind-sounds-after-3005/

### Real-world wind-at-ear data (for curve shapes)
Source: Institute of Acoustics (IOA) papers by Lower, Hurst, Claughton and Thomas. https://www.ioa.org.uk/system/files/proceedings/mc_lower_dw_hurst_ar_claughton_a_thomas_sources_and_levels_of_noise_under_motorcyclists_helmets.pdf (data seen via search summary; direct PDF fetch returned 404)

- **Level versus speed:** about **15.5 dB per doubling of speed** above about 25 m/s.
- **Road figures:** 78–90 dB(A) at 13 m/s, rising to 114–116 dB(A) at 54 m/s.
- **Spectrum:** when A-weighted, the **300–400 Hz** region dominates, and content below 100 Hz contributes little.
- **Posture:** tucking into the lee of the windscreen cut noise by 8–9 dB. **Analogy for us:** a skier's tuck should change wind tone and level.
- Helmet-attenuated wind noise is characterised near 500 Hz. https://ridermagazine.com/?p=4757

---

## 3. Procedural audio techniques

### 3.1 Farnell, *Designing Sound*: wind (Practical 18; Pure Data source)
Source: https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical18.html

- **Wind-speed control signal W (0..1):**
  - base = 0.25·(1 + sin(2π·0.1·t)), a 10 s cycle with range 0..0.5;
  - **gust** = white noise → two 1-pole low-pass filters at **0.5 Hz** → ×50, scaled by (base+0.5)² − 0.125;
  - **squall** = noise → two low-pass filters at **3 Hz** → ×20, gated so it is silent until base > 0.4;
  - W = clip(base + gust + squall, 0, 1).
- **One W, many delayed taps.** W is written to a 3 s delay line. Each element reads it at a different delay: 0, 100, 300, 500, 900 or 3000 ms. **Gusts therefore travel across the scene**, so not every layer moves at once.
- **Basic wind:** white noise → bandpass **800 Hz, Q 1**, with gain (W + 0.2)·0.3.
- **Howls and whistles:** resonant bandpass filters at **Q 60**. One sweeps 1000→2000 Hz with W delayed 1 s and gain W². The other sweeps 600→1000 Hz with W delayed 100 ms and gain (W + 0.12)²·1.2.
- **Doorway or edge tones:** bandpass at 400 Hz and 200 Hz, **Q 40**, amplitude-modulated at roughly 20–230 Hz rising with W.
- **Leaves:** noise high-passed at 200 Hz and low-passed at 4 kHz, following a very slow (3 s delayed) envelope.
- Community advice for realism: 1/f-like intensity variation, a bank of 10–50 bandpass filters, delays between intensity and filter movement, and a little reverb. https://cycling74.com/forums/synthetic-wind

### 3.2 Farnell: footsteps and snow crunch (Practical 26)
Source: https://mitp-content-server.mit.edu/books/content/sectbyfn/books_pres_0/8375/designing_sound.zip/practical26.html

- Each step is a phasor split into **heel (0–0.33), roll (0.125–0.875) and ball (0.67–1)** envelopes. Acceleration shifts weight between heel and ball. The other foot is offset by 0.5 phase.
- **Snow texture:** noise → low-pass filters at 110 Hz and 900 Hz used as a control → bandpass with **centre 700 + 9000·env Hz, Q 3** → high-pass at 300 Hz. A pressure envelope sweeps the band centre, which gives the crunch.
- **Gravel:** a control clipped to 500–10 000 Hz drives a Q 3 bandpass.
- **Applying it to skis:** use edge pressure (load) instead of a gait envelope to sweep a crunchy bandpass.
- Turchet's footstep synthesiser treats snow as an "aggregate" ground, modelled with physical models plus additive synthesis and amplitude modulation. https://vbn.aau.dk/en/publications/footstep-sounds-synthesis-design-implementation-and-evaluation-of
- A procedural snow-footstep preset uses macros for speed, a high-frequency "powder" layer, surface, muffling and weight. Strummed overlapping triggers sound crunchy. https://mhelder.gumroad.com/l/footlocker_snow

### 3.3 Granular synthesis for surfaces
- **Grain length:** usually 10–100 ms. Grains above about 50 ms start to be heard as separate events. Grains need about 13–45 ms to carry pitch. https://vaia.com/en-us/explanations/engineering/audio-engineering/granular-synthesis
- Other sources give grains as 5–100 ms (https://www.perfectcircuit.com/signal/what-is-granular-synthesis) and 10–30 ms (https://www.sfu.ca/~truax/gran.html).
- **Density:** densities run from hundreds to thousands of grains per second. Low density gives clicks and stutter. High density gives a continuous texture. https://www.perfectcircuit.com/signal/microsound ; https://beatkitchen.io/guides/synthesist/11-granular-synthesis/
- **Jitter:** randomise the grain period to avoid periodicity. Overlap appears whenever the period is shorter than the duration. https://documentation.dspconcepts.com/awe-designer/8.D.2.3/granular-synthesis-module
- **Envelopes:** grain attack and decay ramps prevent clicks. https://cmtext.indiana.edu/synthesis/chapter4_granular.php
- **Parameter-driven position:** Wwise SoundSeed Grain offers per-grain filtering and duration, emission and pitch controlled by RTPC. It can also drive the read **position** from a game parameter. https://www.audiokinetic.com/products/plug-ins/soundseed-grain/ ; https://www.audiokinetic.com/temporal-flexibility-with-soundseed-grain
- SNOW's hand-built ice and turn sounds (random overlapping fragments plus white noise) are granular in all but name (section 2).

### 3.4 Parameter (RTPC) curves
- Wwise volume RTPCs come in dB-linear and S-curve shapes. https://audiokinetic.com/qa/2066/wwise-volume-rtpc-built-in-curve-equations
- Racing practice is one Speed parameter feeding separate volume, pitch and low-pass curves per layer. https://blog.audiokinetic.com/building-a-car-racing-system-using-wwise/
- Real wind grows about 15.5 dB per doubling of speed (IOA, above). Theory for dipole aerodynamic sound is steeper. **Engineering judgment:** in a game, compress this to about 9–12 dB per doubling so slow speeds stay audible and fast speeds do not mask everything.

### 3.5 Loudness, HDR and ducking
- **Platform targets:**
  - Sony ASWG: -23 LUFS for PS3 and -18 LUFS for Vita, ±2 LU (2012). https://designingsound.org/2012/07/30/video-games-and-loudness-standards-interview-with-sonys-garry-taylor/
  - IESD consoles: **-24 LUFS ±2, true peak ≤ -1 dBTP**. https://www.audiogang.org/wp-content/uploads/2015/04/IESD-Mix-Ref-Levels-v03.02.pdf
  - Mobile: about -18 LUFS, or -16 in noisy settings. https://designingsound.org/2013/02/20/different-loudness-ranges-for-console-and-mobile-games
  - Meta Quest: -16 LUFS standalone, -18 LUFS PC VR. https://developers.meta.com/horizon/documentation/unity/audio-loudness-meter-overview/
- **HDR audio (DICE Frostbite).** Loudness is measured at the listener, and every source is scaled against a sliding window over a range of about 130 dB. It acts as a **culling and priority system** and is "not compression". https://www.slideshare.net/slideshow/adaptive-mixing-in-frostbite/3128152 ; https://www.ea.com/frostbite/news/how-hdr-audio-makes-battlefield-bad-company-go-boom
- **HDR in Wwise.** Only "a handful of sounds" should trigger HDR. Window speed that is too fast or too slow causes pumping. Envelope tracking avoids a lull after a loud hit. https://designingsound.org/2013/06/21/finding-your-way-with-high-dynamic-range-audio-in-wwise/
- **Typical ducking values:**
  - 6–12 dB depth, 30–80 ms attack, 250–700 ms release (general guidance). https://www.capcut.com/create/audio-ducking-for-clear-dialogue-in-video
  - One tool's defaults: 10 ms attack, 200 ms release, -20 dB maximum. https://composer-docs.vindral.com/operators/operators-sidechain-ducking.html
  - Releases of 50–200 ms pump on continuous music. Releases of 500–1500 ms hold through pauses. https://mubert.com/tools/cast/docs/auto-ducking

### 3.6 Doppler and pass-by whoosh
- **Pass-by recipe:** noise through a swept bandpass or low-pass filter, a level curve that builds, peaks and falls quickly, and pitch movement. A **0.5–1 s** sweep works well; shorter sounds faster. Pink noise is smoother than white. https://violetrecording.com/how-to-make-whoosh-sounds/
- **Comb filtering:** the breathy part of a fly-by comes from interference between the direct sound and a **ground reflection**, not from Doppler. The delay sweeps from about **4 ms to 9 ms and back** as the source passes overhead. It was simulated with noise plus a delayed copy, updated at about 15 Hz. https://www.windytan.com/2025/04/passing-planes-and-other-whoosh-sounds.html
- Commercial whoosh tools default to physical Doppler pitch. https://support.uvi.net/hc/en-us/articles/360001692797-Whoosh-Designer-Tips

### 3.7 Aeolian whistles (poles, helmet, rails)
- Vortex shedding past a cylinder makes Aeolian tones. Real-time physically derived models match wind-tunnel frequencies and were rated as believable as other synthesis methods. The shedding frequency follows the Strouhal relation, f ≈ St·v/d with St ≈ 0.2 (standard fluid dynamics). https://napier-repository.worktribe.com/output/3006170/physically-derived-synthesis-model-of-an-aeolian-tone ; https://qmro.qmul.ac.uk/xmlui/handle/123456789/58445
- **Example (my arithmetic):** an 18 mm pole at 20 m/s gives about 220 Hz.

### 3.8 Crowd and PA ambience
- Stadium crowd systems use continuous **bed loops** plus **triggered reaction cues**, ridden live to follow energy. https://www.athleticbusiness.com/industry-press-room/article/15160265/db-audiotechnik-and-autograph-partner-to-launch-db-fanblock
- A crowd-synthesis patent blends crowd layers by the share of each emotional state, such as "excitement". This amounts to an excitement parameter crossfading layers. https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12706081
- SNOW deliberately recorded ambience without other people when the player is alone (section 2). A park should therefore switch ambience sets by zone.

---

## 4. WebAudio implementation notes

- **Granular approach.** No published benchmark compares per-grain `AudioBufferSourceNode` against `AudioWorklet`.
  - Per-grain nodes scheduled from the main thread are simple, but timing jitters when the UI is busy, and many short-lived nodes cost scheduling and garbage-collection time.
  - An `AudioWorklet` gives sample-accurate grains off the main thread. https://dev.to/hexshift/granular-synthesis-in-the-browser-using-web-audio-api-and-audiobuffer-slicing-2o9h ; https://awesome.ecosyste.ms/projects/github.com%2Fgdamdam%2Fmgrains
- **Scheduling grains from JS.** Use a lookahead scheduler: a **25 ms timer with 100 ms lookahead**, scheduling `start(when)` on the audio clock. https://web.dev/articles/audio-scheduling
- **Render budget.** Each render quantum (128 frames) has about **2.67 ms at 48 kHz**. Glitches appear near 100% render capacity.
  - **Fixes:** use fewer nodes, do less work in the worklet, or raise base latency.
  - **Never allocate inside `process()`:** garbage collection runs on the worklet thread and blocks it.
  - Profile with `about://tracing` (categories `audio-worklet`, `webaudio.audionode`).
  - https://web.dev/articles/profiling-web-audio-apps-in-chrome
- **Noise.** Generate a few seconds of white noise into a looping `AudioBuffer`.
  - **Pink:** Paul Kellet's filter method (equal energy per octave).
  - **Brown:** leaky integration of white noise (-6 dB per octave).
  - Tone.js also loops pre-made noise buffers for performance.
  - https://docs.swmansion.com/react-native-audio-api/docs/guides/noise-generation ; https://unpkg.com/browse/tone@15.1.22/build/esm/source/Noise.d.ts
- **Click-free automation.**
  - Use `cancelAndHoldAtTime` before re-scheduling.
  - `setValueAtTime(current, now)` can land in the past on the audio thread and be ignored, which causes ramp jumps.
  - Use `setTargetAtTime` for smoothing.
  - Exponential ramps cannot reach 0.
  - https://lists.w3.org/Archives/Public/public-audio-dev/2016Mar/0003.html ; https://lists.w3.org/Archives/Public/public-audio/2013JanMar/0058.html ; https://docs.w3cub.com/dom/audioparam
- **DynamicsCompressorNode ranges:**
  - threshold -100..0 (default -24);
  - knee 0..40 (default 30);
  - ratio 1..20 (default 12);
  - attack 0..1 s (default 0.003; the time to reduce gain by 10 dB);
  - release 0..1 s (default 0.25).
  - There is **no user lookahead**. Blink and WebKit have an internal pre-delay buffer (default 256 frames, maximum 1024), so it is a fast compressor, not a true brick-wall limiter. A real lookahead limiter needs an AudioWorklet.
  - https://developer.mozilla.org/en-US/docs/Web/API/DynamicsCompressorNode ; https://chromium.googlesource.com/chromium/blink/+/main/Source/platform/audio/DynamicsCompressorKernel.h
- **OfflineAudioContext.** `new OfflineAudioContext(ch, length, sr)` and `startRendering()` render faster than real time to an `AudioBuffer`, with `suspend(t)` for mid-render changes. Use it for deterministic tests: render 10 s of the graph at fixed speeds, then measure RMS, peak and spectral centroid in CI. https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
- **Autoplay.** Create or resume the context inside a user gesture. Use one context per app. https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices

---

## 5. Permissively licensed audio sources

| Source | Licence and game use | Download without login? |
|---|---|---|
| **Freesound CC0** | CC0 allows copying, modifying and distributing commercially, no attribution needed (stated on sound pages). | **No.** Full-quality download says "Login to download". The API needs a key tied to a login. Search and preview pages are public. https://freesound.org/help/developers ; https://wiki.archiveteam.org/index.php/Freesound |
| **OpenGameArt CC0** | CC0 1.0. | **Yes.** Direct file links on the page (login is only for comments). |
| **Sonniss GDC bundles** (2015–2024 plus 2026) | Royalty-free and commercial, **including games**, no attribution. You **cannot redistribute them as sound effects** (libraries or packs), but shipping inside a finished game is fine. **AI/ML training is prohibited.** https://sonniss.com/gameaudiogdc ; https://licenseorg.com/guide/music-audio/sonniss | Direct links appear on the page. An account is only described as letting you re-download. Bundles are many GB. |
| **BBC Sound Effects (RemArc)** | Personal, educational and research use only. **Commercial use needs a paid licence** (via Pro Sound Effects). Derivatives are allowed only non-commercially, with attribution. **Not suitable for a shipped game** unless it is strictly non-commercial, and even then it is risky. https://cdm.link/bbc-gives-away-16k-wav-sound-effects-disallows-using/ ; https://www.cined.com/bbc-gives-away-16000-sound-effects-for-free/ | Downloads are open on the site, but the licence is the blocker. |
| **Pixabay** | Free commercial use, no attribution. **No standalone redistribution** (content left as-is). Content uploaded before 9 Jan 2019 is CC0. Use inside a game counts as using it in a larger work, but the licence does not name games, so check the full terms. https://pixabay.com/service/license-summary/ ; https://pixabay.com/service/faq/ | Not stated on the licence pages. The site has bot protection, so expect manual download. |

### Candidate CC0 files (IDs from Freesound searches filtered to "Creative Commons 0"; check each page before use)
- **Ski and snowboard:**
  - 592379 "Ski passby" (cribbler, 6.3 s, 48 kHz; CC0 confirmed on the page);
  - 567839 "Alpine_ski_POV";
  - 680075 "skiing and snowboarding";
  - 667729 "Snowboard_Sequence_Mono";
  - 788587/788588/788589 "lofer_ski_00x" (monosfera);
  - 588618 and 394003 (cross-country skiing).
  - https://freesound.org/search/?q=skiing&f=license:%22Creative+Commons+0%22 ; https://freesound.org/search/?q=snowboard&f=license:%22Creative+Commons+0%22
- **Bindings and foley:** 573132–573139 "snowboard straps"; 519453 "Snowboard Binding Strap"; 137701 binding ratchet; 171592 "Winter Sports Jacket Foley" (qubodup; useful as a clothing-flap source).
- **Lifts:** 519459 "Passing Chairlift Tower"; 263134 "chairlift"; 39082 "creaky snow-skilift"; 569088/569092 lift recordings (monosfera).
- **Rails and grind:** 348326 "Skateboard_Grinds"; 655371 "skateboard grinding on metal rail"; 655376 "rail slide mix"; 845524 "Skateboarding Rail Slide". https://freesound.org/search/?q=rail+grind&f=license:%22Creative+Commons+0%22
- **Crowd:** 160493 "Large crowd applause"; 365132 "Crowd Cheering"; 397434 "Crowd Cheer"; 221567/221568 "cheering and clapping crowd"; 182571 "Short Crowd Cheer" (qubodup); 139973 "Crowd.Yay.Applause.25ppl". https://freesound.org/search/?q=crowd+cheer&f=license:%22Creative+Commons+0%22&s=Downloads+(most+first)
- **People in snow:** 500645 "skiers laugh and whoop".
- **OpenGameArt (CC0, direct download):**
  - "42 Snow and Gravel Footsteps" (Corsica_S, 7z of FLAC, about 4 MB) https://opengameart.org/content/42-snow-and-gravel-footsteps
  - "Wind" (IgnasD, about 264 KB zip) https://opengameart.org/content/wind
  - "Park ambiences" (Thimras, 48 kHz WAV, 74–99 MB each, includes an open-field wind recording) https://opengameart.org/content/park-ambiences
  - Also listed as CC0 in search results, unverified per page: "wind whoosh loop", "Mild Wind Background Noise", "Low Rumbling", "Swishes Sound Pack", "4 dry snow steps", "9 wet snow steps". https://opengameart.org/art-search-advanced?keys=wind&field_art_type_tid%5B%5D=13&field_art_licenses_tid%5B%5D=4

**Practical licensing advice.** For fully scripted downloads with no login, use OpenGameArt CC0 and the Sonniss bundle (embedded use only, never re-shared as raw files). A Freesound CC0 sound must be fetched by the user while logged in. Keep a `LICENSES.md` listing each source ID.

---

## 6. Actionable for our engine

Values marked **[S]** come straight from a cited source. Everything else is **engineering judgment** built from the sources above, to be tuned by ear.

### 6.1 Parameters to send from physics (smoothed per frame with a 1-pole filter, τ ≈ 50 ms)
- `speed` v (m/s, 0–35)
- `edge` (edge angle × lateral load, 0–1)
- `turnRate` (yaw rate)
- `grounded` (bool)
- `surface` (powder / groomed / ice / slush / rail / box)
- `tuck` (0–1)
- `airTime` (s)
- `impactSpeed` (m/s along the normal at landing)
- `relWindSpeed` (|v_rider − v_wind|)
- `comboLevel` (0–1, for music)
- `nearObject` (distance and closing speed, for pass-bys)

### 6.2 Layer list
1. **Glide hiss** (always on when grounded).
   - **Source:** a looped noise buffer, or the granulated "Ski passby" or "Alpine POV" sample.
   - **Filter:** bandpass centre set by surface: powder 900 Hz Q 0.7, groomed 2.5 kHz Q 0.8, ice 5 kHz Q 1.2, slush 600 Hz. Add a high-shelf of -6 dB (powder) to +4 dB (ice). Softer means darker [S: SNOW EQ approach].
   - **Level:** -40 dB at 2 m/s, -22 dB at 8 m/s, -14 dB at 25 m/s (about +7 dB per doubling). The low-pass cutoff rises from 1.5 kHz to 8 kHz with speed.
2. **Edge and carve crunch** (granular).
   - **Grains:** 20–60 ms with a Hann window, from snow or crunch recordings or a Farnell-style noise bandpass with centre 700 + 9000·edge Hz, Q 3 [S: Practical 26].
   - **Density:** 15 + 250·edge·(v/20) grains per second. Jitter ±40% on period, ±30% on position, ±2 semitones on pitch.
   - **Level:** -inf at edge 0 up to -12 dB at edge 1 and 20 m/s.
3. **Ice chatter** (surface = ice and edge > 0.3).
   - **Grains:** random short 5–15 ms grains, sparse at 30–80 per second, plus white noise at -18 dB relative, to smooth them [S: SNOW ice technique].
   - **Filter:** high-pass at 1.5 kHz.
4. **Slash and spray one-shots.**
   - **Trigger:** edge rises above 0.6 with v > 6 m/s, or a hockey stop.
   - **Content:** a 300–900 ms noise burst with a bandpass sweep 3 kHz→800 Hz, or the foam-squeeze technique.
   - **Level:** **exaggerated**, peaking at -8 dB [S: Steep exaggerated slash and powder].
   - **Cooldown:** 250 ms. Randomise pitch ±10% and gain ±2 dB.
5. **Speed wind** (Farnell-based).
   - **Base:** pink noise → bandpass, with centre rising from 350 Hz at 5 m/s to 900 Hz at 30 m/s, Q 0.8. The 300–500 Hz helmet band dominates [S: IOA, Rider], plus a low-pass rising from 800 Hz to 5 kHz.
   - **Level:** -45 dB at 3 m/s, -30 dB at 8 m/s, -20 dB at 16 m/s, -11 dB at 32 m/s (about 10 dB per doubling; real-world 15.5 dB per doubling, compressed) [S: IOA].
   - **Gusts:** Farnell's W modulation: 0.1 Hz LFO, gust noise low-passed at 0.5 Hz, squall noise low-passed at 3 Hz above the 0.4 threshold. Use about ±4 dB of level and ±15% of filter centre at full W [S: Practical 18].
   - **Tuck:** -6 dB and low-pass ×0.6 at full tuck [S: IOA lee-of-windscreen effect of 8–9 dB].
6. **Whistle and howl.** Two resonant bandpass filters at Q 40–60:
   - 600–1000 Hz, with W delayed 100 ms;
   - 1000–2000 Hz, with W delayed 1 s;
   - gain W², capped at -26 dB;
   - only above 15 m/s or in high-wind weather [S: Practical 18].
7. **Clothing flap.** Amplitude-modulated noise (AM rate 8–25 Hz rising with speed), bandpass 200–600 Hz, from 12 m/s upward. Peaks at -24 dB. Or use the granulated jacket-foley CC0 sample [S: SNOW "clothing in the wind"; Steep previews].
8. **Air state.**
   - On takeoff, ramp surface layers 1–4 to -inf with `setTargetAtTime`, τ 25 ms.
   - Wind continues. Add a low "air static" layer at -30 dB [S: SNOW airtime static].
   - Music gets a low-pass at 1.2 kHz after 0.4 s of air, released over 150 ms on landing.
9. **Landing.**
   - **Powder:** a soft "pfff" (noise burst, low-pass at 1.5 kHz, 150–300 ms) [S: SNOW].
   - **Groomed or ice:** a thud (sine at 60–90 Hz, 80 ms decay) plus a crunch grain cloud of 120 ms.
   - **Level:** -20 dB + 0.8 dB per m/s of `impactSpeed`, capped at -4 dB.
   - Surface layers fade back in with τ 40 ms.
10. **Rail and box grind.**
    - **Contact:** one-shot on contact [S: SNOW].
    - **Loop:** a granular loop from CC0 grind samples, 30–80 ms grains at 40–120 per second [S: SNOW used a granular tool for rail loops].
    - **Pitch:** playbackRate 0.85 + 0.015·v.
    - **Body:** add a modal bank of 4–6 bandpass filters at Q 60–90, tuned per rail type (e.g., tube 520/1340/2600/4100 Hz; box 180/420/900 Hz), excited by grind noise at -12 dB. Randomise ±3% per rail instance to avoid the "nothing for my imagination" complaint [S: Amped 3 review].
11. **Breathing and heartbeat.** Breath rate rises with sustained speed or exertion. Heartbeat goes under the mix at -28 dB in high-risk moments (big air, near-crash) [S: Steep Q&A].
12. **Pass-by whoosh** for trees, pylons, lift towers and other riders.
    - **Trigger:** closing speed > 8 m/s and distance < 4 m.
    - **Sound:** pink noise, bandpass sweep from 600 Hz up to 2.5 kHz and back down over 0.4–0.9 s scaled by 1/v. Level peaks at -14 dB at closest approach [S: whoosh recipe].
    - **Comb:** mix in a 4→9→4 ms swept delay at 50% for the comb [S: windytan].
    - **Doppler:** a pitch factor c/(c − v_r) on any tonal content.
    - **Cooldown:** per object, 1.5 s.
13. **Ambience beds** by zone: mountain wind bed, lift creak and pylon pass-bys, park PA and crowd.
    - **Crowd:** bed loop plus triggered cheers, with an excitement parameter (0–1) crossfading calm, cheering and roaring beds [S: Fanblock and patent].
    - **Distance:** apply a low-pass from 8 kHz at 10 m down to 1.5 kHz at 150 m.
    - **PA voice:** bandpass 300–3500 Hz plus a 90 ms slap echo at -12 dB.
14. **Music.**
    - **Layers:** stems or layers tied to `comboLevel`; intensity rises with sustained successful performance [S: Steep; SSX RUMR].
    - **Big landing:** a 1-bar "push" (+2 dB for 500 ms).
    - **Bail:** low-pass to 400 Hz over 120 ms, then recover over 1.5 s.

### 6.3 Bus structure and mix levels (peak meter on the pre-limiter master)
- **Target:** about **-18 LUFS integrated**, **true peak ≤ -1 dBTP** [S: mobile -18; IESD -1 dBTP]. Browser use is closer to mobile than to a living-room console.
- **Buses and relative gains** (master at 0 dB, before the limiter):
  - Surface (layers 1–4, 9, 10): 0 dB;
  - Wind (5–7): -3 dB;
  - Tricks and impacts (one-shots): 0 dB;
  - Ambience (13): -10 dB;
  - Music: -8 dB, about 4–6 LU below SFX when riding;
  - UI: -12 dB;
  - Voice/PA: -4 dB.
- **Speed-based re-balance:** above 20 m/s, pull music down 3 dB and ambience down 4 dB. The NFS Unbound principle is to clear room for aerodynamics at high speed [S: 80.lv].

### 6.4 Ducking (side-chain style, computed in JS on a control signal)

| Trigger → target | Depth | Attack | Release |
|---|---|---|---|
| PA or announcer → music | -8 dB | 50 ms | 600 ms |
| PA or announcer → crowd | -4 dB | 50 ms | 600 ms |
| Landing or crash impact → music, ambience | -5 dB | 5 ms | 350 ms |
| Trick-score stinger → music | -4 dB | 20 ms | 400 ms |
| High speed (v > 20 m/s) → music | -3 dB, as a continuous function of speed | n/a | n/a |
| Grind loop → glide hiss | -6 dB while on rail (surface swap) | 20 ms crossfade | 20 ms crossfade |

Sources: [S: 6–12 dB depth, 10–80 ms attack, 200–700 ms release from the ducking guides]. Use `setTargetAtTime`, with τ = attack/3 and τ = release/3. Keep a priority list so only the highest-priority duck applies to each target (HDR-style "every sound matters, just not all at once") [S: DICE HDR].

### 6.5 Master dynamics (WebAudio)
- **Glue compressor on the SFX bus:** threshold -20 dB, knee 12, ratio 3, attack 0.01, release 0.20.
- **Master limiter:** a `DynamicsCompressorNode` with threshold **-2 dB**, knee **0**, ratio **20**, attack **0.002**, release **0.10–0.15**. Precede it with a master gain of -3 dB of headroom.
- **Why it can overshoot:** the node has no user lookahead and a maximum ratio of 20 [S: MDN, Blink source]. Add a soft clipper afterwards, a `WaveShaperNode` with a tanh curve and 4× oversampling, to catch overshoot.
- **Upgrade path:** if CPU allows, replace both with an AudioWorklet lookahead limiter (5 ms lookahead, 50 ms release, ceiling -1 dBFS).

### 6.6 WebAudio engineering rules
- **Granular voices:** an AudioWorklet granulator for layers 2, 3 and 10, with all buffers preallocated and parameters passed as k-rate AudioParams [S: web.dev profiling].
- **Fallback without AudioWorklet:** `AudioBufferSourceNode` grains with a 25 ms timer and 100 ms lookahead [S: web.dev scheduling]. Cap the total at 150 grains per second.
- **Shared noise buffers:** one 4 s white buffer and one 4 s pink buffer, shared by all noise layers through looping sources with random `loopStart` offsets.
- **Smoothing:** apply every physics→audio update with `setTargetAtTime(v, now, 0.03)`. Never write `.value` while automation is running [S: W3C list threads].
- **CPU budget:** aim for under 30% render capacity on a mid-range laptop. Measure with the Web Audio DevTools render-capacity readout [S: web.dev].
- **Tests:** `OfflineAudioContext` renders of fixed physics traces (straight run at 5/15/30 m/s, a carve, a jump, a grind). Assert monotonic RMS versus speed for wind and glide, a ducking depth within ±1 dB, and no sample above -1 dBFS [S: MDN].
- **Licensing:** only CC0, OpenGameArt or Sonniss sources in the repository, recorded in `LICENSES.md` with source IDs. No BBC RemArc material [S: section 5].
