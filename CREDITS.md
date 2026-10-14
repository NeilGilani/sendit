# Credits

SENDIT — a peaceful skiing game set at the fictional **Valcrest Alpine Resort**.
All resort, lift, piste, gear and brand names in the game are invented.

## Code & tools
- All game code, shaders and tools (`tools/`) were written for this project.

## Map data
- **Elevation:** Copernicus GLO-30 Digital Elevation Model, © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA. Accessed via the AWS Open Data Registry (`copernicus-dem-30m`). Free, open licence for any use with attribution.
- **Pistes, lifts and forests:** © OpenStreetMap contributors. Data available under the Open Database License (ODbL) — https://www.openstreetmap.org/copyright. Retrieved via the Overpass API. Derived files: `assets/terrain/pistes.json`, `assets/terrain/lifts.json`, `assets/terrain/splat_rgb8.bin`, `assets/terrain/scatter.json` (ODbL applies to these derived databases).

## 3D models (CC0)
- **Pine trees and rocks:** "Stylized Nature MegaKit" (Standard) by Quaternius — CC0 1.0 — https://quaternius.itch.io/stylized-nature-megakit (textures downsized to 1K).
- **Skier character:** "Universal Base Characters" (Standard, Superhero_Male) by Quaternius — CC0 1.0 — https://quaternius.itch.io/universal-base-characters. Prepared with `tools/prep_character.py` (clothing zones baked as vertex colours, textures downsized to 1K). Skis, poles, helmet and goggles are procedural meshes made in code.
- **Rocks:** "Rock 07" and "Rock 09" photoscans from Poly Haven — CC0 1.0 — https://polyhaven.com/a/rock_07, https://polyhaven.com/a/rock_09 (1K glTF).

## Textures (CC0)
- **Snow 02** (fresh powder), **Snow 01** (packed snow) and **Rock Face 03** — Poly Haven, CC0 1.0 — https://polyhaven.com/a/snow_02, https://polyhaven.com/a/snow_01, https://polyhaven.com/a/rock_face_03 (2K).
- Sky, clouds, wind ripples and particle sprites are generated procedurally at runtime.

## Sound & music (CC0)
- All sound effects (powder, groomed swish, edge carve, wind, landing, birds) and the ambient piece "Golden Hour" were synthesized for this project with `tools/gen_audio.py` and are released under CC0 1.0.

## Fonts
- Godot's built-in default font (part of the engine).
