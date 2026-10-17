# Credits

SENDIT — a peaceful skiing game set at the fictional **Valcrest Alpine Resort**.
All resort, lift, piste, gear and brand names in the game are invented.

## Code & tools
- All game code, shaders and tools (`tools/`) were written for this project.

## Map data
- **Elevation:** Copernicus GLO-30 Digital Elevation Model, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA. Accessed via the AWS Open Data Registry (`copernicus-dem-30m`). Free, open licence for any use with attribution.
- **Pistes, lifts and forests:** © OpenStreetMap contributors. Data available under the Open Database License (ODbL) — https://www.openstreetmap.org/copyright. Retrieved via the Overpass API. Derived files: `assets/terrain/pistes.json`, `assets/terrain/lifts.json`, `assets/terrain/splat_rgb8.bin`, `assets/terrain/scatter.json` (ODbL applies to these derived databases).
- **Lake Tahoe mountains:** the same two sources (Copernicus GLO-30 elevation; OpenStreetMap pistes, lifts and forest, ODbL) processed by `tools/build_resorts.py` into `assets/resorts/` (derived databases under ODbL). Mountains are named by place and peak; no resort logos or branding are used.

## 3D models (CC0)
- **Pine trees and rocks:** "Stylized Nature MegaKit" (Standard) by Quaternius — CC0 1.0 — https://quaternius.itch.io/stylized-nature-megakit (textures downsized to 1K).
- **Skier character:** "Universal Base Characters" (Standard, Superhero_Male) by Quaternius — CC0 1.0 — https://quaternius.itch.io/universal-base-characters. Prepared with `tools/prep_character.py` (clothing zones baked as vertex colours, textures downsized to 1K). Skis, poles, helmet and goggles are procedural meshes made in code.
- **Rocks:** "Rock 07" and "Rock 09" photoscans from Poly Haven — CC0 1.0 — https://polyhaven.com/a/rock_07, https://polyhaven.com/a/rock_09 (1K glTF).

## Textures (CC0)
- **Snow 02** (fresh powder), **Snow 01** (packed snow) and **Rock Face 03** — Poly Haven, CC0 1.0 — https://polyhaven.com/a/snow_02, https://polyhaven.com/a/snow_01, https://polyhaven.com/a/rock_face_03 (2K).
- Sky, clouds, wind ripples and particle sprites are generated procedurally at runtime.

## Sound & music (CC0)
- All sound effects (powder, groomed swish, edge carve, wind, landing, birds) and the ambient piece "Golden Hour" were synthesized for this project with `tools/gen_audio.py` and are released under CC0 1.0.
- The web game's snow, wind, trick, grind, lift, breath and ambience sounds are synthesized live in code (`web/src/audio/`, CC0 1.0).
- Three short field-recording textures, granulated under the synthesis, are excerpts (cut at MP3 frame boundaries, not re-encoded) of CC0 1.0 recordings from Freesound:
  - `assets/audio/tex_snow_ski.mp3` (4.5 s): "Alpine_ski_POV" by Lydmakeren, https://freesound.org/people/Lydmakeren/sounds/567839/
  - `assets/audio/tex_snow_board.mp3` (4.5 s) and `tex_snow_skid.mp3` (3.3 s): "Snowboard_Sequence_Mono" by Nox_Sound, https://freesound.org/people/Nox_Sound/sounds/667729/
- These CC0 1.0 Freesound recordings were also used as measurement references to calibrate the engine (only the three excerpts above are distributed): Lydmakeren (#567839, groomed POV run), Nox_Sound (#667729, snowboard on ice), facemusic (#39082, creaky snow), kyles (#454092, Alpine gusts), cribbler (#592379, ski pass-by), Selector (#680075, skiers passing), musicbrain (#215690, snow crunch), xkeril (#720302, Zermatt slope), 21100495 (#655371, rail grind), andriiperevodchyk (#519459, chairlift tower), dmartinp (#263134, chairlift), craigsmith (#675895, body fall in snow), Elements-Library (#683789, snow impact), bruno.auzet (#558792, resort descent). See `docs/audio-research.md`.

## Fonts
- Godot's built-in default font (part of the engine).
