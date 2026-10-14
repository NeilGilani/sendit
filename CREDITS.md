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
