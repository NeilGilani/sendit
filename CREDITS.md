# Credits

SENDIT — a ski and snowboard game in the browser. The mountains, resorts, lifts, pistes, gear and brand
names in the game are invented (the Lake Tahoe mountains are real terrain, named by place and peak only;
no resort logos or branding are used).

## Code
- All game code, shaders and tools were written for this project.
- **three.js** r170 — © 2010–2024 three.js authors — MIT License — https://github.com/mrdoob/three.js
- **postprocessing** 6.36 — © 2015 Raoul van Rüschen — Zlib License — https://github.com/pmndrs/postprocessing
- **N8AO** 1.9 — © N8python — ISC License — https://github.com/N8python/n8ao
- Built with **Vite** (MIT). Tests use **Playwright** (Apache 2.0); neither ships in the game.

## Fonts
- **Archivo** by Omnibus-Type — SIL Open Font License 1.1 — https://fonts.google.com/specimen/Archivo
- **IBM Plex Mono** by IBM — SIL Open Font License 1.1 — https://fonts.google.com/specimen/IBM+Plex+Mono
- Both are loaded from Google Fonts at runtime (not redistributed in this repository).

## Map data
- **Lake Tahoe mountains — elevation:** Copernicus GLO-30 Digital Elevation Model, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA. Accessed via the AWS Open Data Registry (`copernicus-dem-30m`). Free, open licence for any use with attribution.
- **Lake Tahoe mountains — pistes, lifts and forest:** © OpenStreetMap contributors. Data available under the Open Database License (ODbL) — https://www.openstreetmap.org/copyright. Retrieved via the Overpass API and processed by `tools/build_resorts.py` into `assets/resorts/` (derived databases under ODbL).
- Every other mountain (Valcrest, Blackspruce, Ravenspire, Voltage Park, Dragonback, Kitsune Peak, Fjordline) is generated in code.

## 3D models and textures (CC0)
- **Rider:** "Universal Base Characters" (Standard, Superhero_Male) by Quaternius — CC0 1.0 — https://quaternius.itch.io/universal-base-characters. Prepared with `tools/prep_character.py` (textures downsized to 1K). Clothing, helmets, goggles, skis, boards and poles are procedural meshes made in code.
- **Rock Face 03** — Poly Haven — CC0 1.0 — https://polyhaven.com/a/rock_face_03 (packed into `textures/web/rock_face_03_packed_1k.jpg`).
- Trees, rocks, buildings, rails, sky, clouds, snow, spray and particles are generated in code at runtime.
- The loading-screen stills, map cards and the share image are renders of the game itself.

## Sound & music
- The music ("Golden Hour", the upbeat track) and the sound effects in `assets/audio/` were synthesized for this project with `tools/gen_audio.py` and `tools/gen_audio_fx.py` and are released under CC0 1.0.
- The snow, wind, trick, grind, lift, breath and ambience sounds are synthesized live in code (`web/src/audio/`, CC0 1.0).
- Four short field-recording textures, granulated under the synthesis, are excerpts (cut at MP3 frame boundaries, not re-encoded) of CC0 1.0 recordings from Freesound:
  - `assets/audio/tex_snow_ski.mp3` (4.5 s): "Alpine_ski_POV" by Lydmakeren, https://freesound.org/people/Lydmakeren/sounds/567839/
  - `assets/audio/tex_snow_board.mp3` (4.5 s) and `tex_snow_skid.mp3` (3.3 s): "Snowboard_Sequence_Mono" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/667729/
  - `assets/audio/tex_wind.mp3` (6 s): "Heavy, strong mountain gusts, Swiss Alps" by kyles, https://freesound.org/people/kyles/sounds/454092/
- These CC0 1.0 Freesound recordings were also used as measurement references to calibrate the engine (only the four excerpts above are distributed): Lydmakeren (#567839, groomed POV run), Nox_Sound (#667729, snowboard on ice), facemusic (#39082, creaky snow), kyles (#454092, Alpine gusts), cribbler (#592379, ski pass-by), Selector (#680075, skiers passing), musicbrain (#215690, snow crunch), xkeril (#720302, Zermatt slope), 21100495 (#655371, rail grind), andriiperevodchyk (#519459, chairlift tower), dmartinp (#263134, chairlift), craigsmith (#675895, body fall in snow), Elements-Library (#683789, snow impact), bruno.auzet (#558792, resort descent), C-V (#845524, rail slide), DangerLaef (#811077, skydive freefall), Mydo1 (#169913, skydive), ChemiCatz (#267899, air rush). See `docs/audio-research.md`.

## Legacy Godot prototype (in the repository, not part of the web game)
- The original Godot 4 prototype in the repository root also uses: the Matterhorn terrain from Copernicus GLO-30 (as above) with OpenStreetMap pistes, lifts and forests (ODbL; derived files `assets/terrain/pistes.json`, `lifts.json`, `splat_rgb8.bin`, `scatter.json`); pine trees and rocks from Quaternius' "Stylized Nature MegaKit" (CC0 1.0, https://quaternius.itch.io/stylized-nature-megakit); the "Rock 07" and "Rock 09" photoscans (https://polyhaven.com/a/rock_07, https://polyhaven.com/a/rock_09) and the 2K **Snow 02**, **Snow 01** and **Rock Face 03** textures from Poly Haven (CC0 1.0); and Godot's built-in default font. The web build leaves these files out (`web/vite.config.js`).
