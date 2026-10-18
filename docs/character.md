# Sendit rider look: outfit system

The rider wears a modern, baggy freeride kit: a roomy 3-layer shell with a straight hem at the
upper thigh, a high collar, a stowed hood and a fleece gaiter pulled up under the goggle; a wide straight-leg bib that
stacks over the boots; leather mitts with nylon gauntlets; and a low-profile matte helmet with a big
frameless mirror goggle on a wide strap. Everything is built procedurally around the Quaternius body
when the rider loads, skinned to the same bones the animation drives, and coloured from data. The
research behind the look (cuts, offsets, helmet and goggle dimensions, colourways) is in
[character-research.md](character-research.md).

```
npm --prefix web run dev -- --port 5181 --strictPort
http://localhost:5181/                    lobby → Locker tab: earned colourways + mix and match
http://localhost:5181/?ride               chase cam (C toggles the helmet cam)
http://localhost:5181/?ride&equip=snowboard
```

## Files

```
web/src/character/
  index.js      dressRider(scene, { bones, fp }) → look { apply(outfit), suit, fabric, helmet, lens, meshes }
                HEAD_SCALE, geometry caches (one build per garment cut, shared by game + lobby riders)
  outfits.js    DATA: GARMENTS (cuts per slot), COLORWAYS, DEFAULT_GARMENTS, resolveOutfit(), colorwaySlots()
  profile.js    outfitSlotsFromProfile(): the profile's five clothing slots → slot selections
  body.js       BodyInfo: the body mesh in bind pose: support() outlines, centre(), skinAt() weight transfer
  tube.js       ring-swept shells: bodyRings() → sweep() → skinPiece() → mergePieces(); noise helpers
  garments.js   the pieces: collar, jacket body, sleeves, pant legs, gaiter, stowed hood or hood up, mitts, gauntlets
  helmet.js     helmet shell + liner edge + brim, toric goggle lens + gasket, strap with rear clip
  materials.js  fabricMaterial, bodyMaterial, helmetMaterial, lensMaterial (all on world.js toonMaterial)
web/src/lobby/tabs/locker.js      the Locker tab (replaced the old Character tab)
web/src/profile/catalog.js        clothing items generated from outfits.js (one item per garment)
```

`rider.js` calls `dressRider()` in `load()`, applies the profile's outfit and re-applies it on every
`loadout` event that touches a clothing slot. `rider.setOutfit(slots)` dresses it directly. Nothing in
the pose / animation code changed; the old sphere helmet, capsule goggle and toon `suitMaterial` are gone.

## How a garment is built

All geometry is made in the body's **bind pose** (T-pose, Y up, facing +Z, metres, feet at 0):

1. **Sample the body.** For each ring along an axis (Y for jacket, pants, collar, gaiter; ±X for
   sleeves, mitts, gauntlets), `BodyInfo.support()` takes the vertices of a thin slab whose dominant
   bone belongs to the piece (e.g. thigh/calf/foot for a pant leg) and measures how far the body reaches
   in each of N directions: the convex outline of that slice.
2. **Turn it into fabric.** `bodyRings()` blurs the outline around the ring and along the axis (muscles
   disappear), then adds the **ease** (how far the cloth stands off the skin, per height), never closer
   than `minEase`. Piece rules shape the drape: the jacket "hangs" (below the chest a radius may only
   shrink 5 cm per metre, so it drops straight from the chest and shoulder blades), its shoulders slope
   to the armholes, the pant leg never narrows below the knee, the sleeve cuff cinches to the wrist.
3. **Folds.** Radial offsets from periodic noise and sine stacks: drape folds below the chest, bunching
   above the hips, elbow compression rings, wrist bunching, knee folds, three stacked rolls above the boot,
   a pre-bent knee. Lengths live in the cut (`hemFront/hemBack`, `cuffY`, `stack`, …). The jacket's
   ease ramp, drape fade and hem flare are placed relative to the hem, so any `hemFront/hemBack` works.
4. **Sweep.** `sweep()` turns the rings into a grid (duplicated seam column for UVs), adds rolled edges
   (`lipEnd/lipStart`: the shell turns over and runs back inside, drawn as lining), rounded caps (mitt
   tips) or a gaiter cuff (`gaiterEnd`: an inner elastic gaiter that closes onto the boot).
5. **Skin.** `skinPiece()` copies weights from the 8 nearest body vertices (inverse-distance blend,
   restricted to the piece's bones and an optional `skinMask`), diffuses them over the grid so folds bend
   together, and keeps the top 4. Controls: `rigid` (one bone), `anchor` (below / above a coordinate the
   piece follows one bone, blending to the transferred weights), `skinMask` (which body vertices may
   donate), `weightLimit` (cap a bone's share, re-applied after smoothing). Used for: mitts rigid on the
   hand; the collar's base anchored to `spine_03`; the sleeve head anchored to the clavicle so it never
   swings out through the yoke; the gaiter anchored to the neck; the jacket's shoulder taking at most
   55 % of the upper arm, and only at the outer edge (the chest panel stays flat when the arms reach).
6. **Merge.** All pieces become one `SkinnedMesh` (`Outfit`, one draw + one shadow draw) bound to the
   body's skeleton. Attributes: `aG = (piece id, u around, v along, side)`, `aLin` (lining).

The body under the clothes stays (it gives the head, boots and the silhouette in odd poses), but
`bodyMaterial` pulls covered skin inward in the vertex shader: arms and hands collapse toward their
axis (they are always sleeved / gloved, and the fingers curl into the fist), the trunk and legs shrink
along their normals. The **mitts** are closed fists (a rounded box over the knuckles plus a thumb lobe)
rigid on the hand bone, so they read as gripping the poles even though the rig's fingers are straight. It takes the garment
colours too, so a fold that ever shows skin shows the right colour. Boots render as glossy plastic
shells with metal buckles, a heel panel and a rubber sole.

The **helmet** is fitted to the head's measurements: a superellipse plan (rounded square), a flattish
domed crown 2.6 cm above the scalp, a lower edge that sits on the brow line in front and drops behind the
ears, a brim ridge flush with the goggle top, and a rolled liner edge. Vents, ear pads and logos are drawn
in the shader from the bind-space position. The **goggle** is a toric lens (exact normals) with a dark
gasket; the strap runs from the lens sides around the back of the shell through a rubber clip. Both are
rigid children of the `Head` bone with the head's bind transform, so they behave like vertices skinned
100 % to it, and they collapse with the head in first person. The collar, hood and gaiter are hidden
in first person by `uHide` (set from `rider.fp` in the outfit's `onBeforeRender`).

## Materials

All four materials are `toonMaterial` (linear HDR sun + sky, baked mountain shadows, fog) with extra
hooks, so they sit in the same light as the terrain:

- **fabricMaterial**: panel layout per piece computed from `aG` (yoke, side panels, raglan stripe,
  colour blocks, cuffs, kick patches), zips, seams, pockets, logos; bump-mapped seams + anisotropic
  wrinkles (gradient noise, periodic around each piece, faded with distance), a fine crumple
  (warped sines: no lattice lines) and fold occlusion from each vertex's crease depth (`aCrease`); BRDF = Lambert +
  Charlie sheen (matte nylon fuzz) + a broad GGX lobe + grazing sky sheen (brighter rims). Leather mitts,
  fleece gaiter (heathered knit with a topographic contour print) and nylon gauntlets change
  roughness / sheen / spec per piece.
- **bodyMaterial**: shrink + garment colours + glossy boots.
- **helmetMaterial**: hybrid shell (matte top over a glossier lower band split by a parting groove),
  vent slots with bevels, ear pads, liner, padded strap with wordmarks.
- **lensMaterial**: mirror: a sky → horizon → snow environment (with a procedural mountain skyline and
  the lens's own vertical gradient) tinted by the coating, Fresnel, iridescent shift at grazing angles,
  and an HDR sun glint that blooms.

There is no per-quality switch: the outfit costs about 0.1 ms of GPU at quality 1 (see below), and the
wrinkle detail fades out by itself with distance.

## Data: garments and colourways

`web/src/character/outfits.js` holds two tables.

**GARMENTS[slot][id]** = `{ name, blurb, cut | shape }`:

| slot | default | what the cut / shape controls |
|---|---|---|
| jacket | `tuff-shell`, `storm-shell` | `hemFront`, `hemBack` (hem height above the ground, see below), `hemFlare`, `jacketEase {shoulder, chest, hem}`, `sleeveEase {upper, elbow, forearm}`, `sleeveEnd`, `collarTop`, `hood: 'down' \| 'up'`, `gaiter`, `gaiterTop` |
| pants | `tuff-bib` | `pantsEase {thigh, knee, cuff}`, `cuffY`, `stack {y0, y1, n, amp}` |
| gloves | `tuff-mitt` | `mittLength` (|x| where the fist ends; wrist at 0.706), `gauntlet [start |x|, ease at the open end]` |
| helmet | `tuff-helmet` | `shape {width, front, back, top, brim}` |
| goggles | `tuff-goggle` | `shape {width, height, radius}` |

**COLORWAYS[id]** = `{ name, blurb, jacket {base, panel, accent, gaiter, style}, pants {base, cuff},
helmet {base, liner, accent}, goggles {lens, lensBase, strap, strapLogo}, gloves {base, cuff} }`.
`style` 0 = yoke + side panels + raglan stripe, 1 = colour-blocked yoke and sleeves.

| colourway | look |
|---|---|
| `tuff` (default) | olive shell, tan yoke, carob bib, charcoal helmet, gold mirror, blaze-orange accents |
| `nightshift` | all black, tonal panels, graphite bib, acid-mint lens and accents |
| `arcade` | retro park: teal + magenta, cream pants, white helmet, violet lens, yellow mitts |
| `summit` | pro team: brick red under a black yoke, white helmet, sapphire lens |

**Jacket length.** `hemFront` / `hemBack` are the hem's height above the ground in the bind pose
(1.8 m rider: hip joint 0.97, crotch ≈ 0.86, knee 0.54). `hemBack` below `hemFront` drops the back (a
dropped tail), above it lifts the back; the difference is level across the back third and changes over
the sides. The default shell has a **level hem at 0.84**: the upper thigh in front, the seat behind.
`hemFlare` is how far the last 12 cm flare out (default 0.012; the shell uses 0.006 so it hangs straight
instead of belling out like a skirt).

History: the first cut was 0.68 / 0.64 (mid-thigh on a real body), which over the game's bulky
proportions and pre-bent knees read as a coat reaching almost to the knees. A first pass went to 0.83
front / 0.78 back. From the chase camera the low back still hung like a tail: in a crouch or tuck the
seat drops toward knee height, so a back hem that covers the seat reaches the knee line on screen. A
level hem shows the seat and the bib below it. Front / back lengths tried, in the lobby (standing,
crouch, tuck, carve; front, side, back, plus a chase-cam angle), in the inspect camera (`?ride&cam=back`)
and in the chase cam, on skis and snowboard:

| front / back | read |
|---|---|
| 0.68 / 0.64 (first cut) | dress / parka; the crouch hides most of the thigh |
| 0.76 / 0.72 | still long, a car coat |
| 0.80 / 0.75 | the back still reaches the upper thigh |
| 0.83 / 0.78 (first pass) | good from the front and side, but a tail from behind in the chase cam |
| 0.83 / 0.81 | a smaller tail, same read |
| **0.84 / 0.84** | freeride shell (Sabre / Rush): straight hem, the seat and bib show from behind |
| 0.83 / 0.86, 0.84 / 0.88, 0.84 / 0.90 | short at the back, but from behind the centre back cuts up between two lower side corners (a cutaway look) |
| 0.85 / 0.80, 0.86 / 0.82 | ends at the crotch; starts to read as a short street jacket |
| 0.90 / 0.86 | cropped: the pants take over the silhouette |
| 0.84 / 0.84, hem ease 0.052 | no visible difference from 0.062, so the baggier ease stays |

`storm-shell` ("Tuff Shell, hood up") is the same cut with the helmet-compatible hood pulled up over the
helmet: a shell offset 1.9 cm off the helmet surface (`helmetFit()` in helmet.js), a stiff rolled brim
over the goggle, the face opening running down behind the goggle's sides, rigid on the head above the
jaw and blended into the neck below; it replaces the stowed hood roll.

**Catalog.** `profile/catalog.js` registers one clothing item per garment (`helmet-tuff`,
`goggles-tuff`, `jacket-tuff-shell`, `jacket-tuff-shell-hood`, `gloves-tuff-mitt`, `pants-tuff-bib`) with
`model: { kind: 'outfit', ref: <garment id> }` and one variant per colourway (`variant.id` = colourway id,
`variant.colors` = that slot's colours). The profile stores `{ item, variant }` per slot as before.

**Flow.** Locker tab (a colourway card, a swatch, or the item name to cycle garments in a slot) →
`profile.equip(itemId, colourwayId)` → `loadout` event → `rider.js` →
`outfitSlotsFromProfile()` → `resolveOutfit()` → `look.apply()`: colours are uniform writes; a different
cut rebuilds (and caches) the geometry. Both the lobby preview and the game rider follow the profile.

## How to…

### Add a colourway
Add an entry to `COLORWAYS` in `outfits.js` with all five slot blocks. The catalog picks it up as a new
variant of every clothing item, and the Locker tab shows it as a card and as swatches. Hex colours
are sRGB; keep fabric albedo between about `#141516` and `#efece4` (pure white / black look fake under
the HDR sun).

### Add a garment (a new cut)
```js
// outfits.js
GARMENTS.jacket['long-anorak'] = {
  name: 'Long Anorak', blurb: 'Knee-length pullover, extra roomy.',
  cut: { ...GARMENTS.jacket['tuff-shell'].cut, hemFront: 0.56, hemBack: 0.52,
         jacketEase: { shoulder: 0.02, chest: 0.05, hem: 0.08 } },
};
// profile/catalog.js: add it to CLOTHING (or registerItem it yourself)
registerItem({ id: 'jacket-long-anorak', name: 'Long Anorak', slot: 'jacket', brand: NW,
  variants: Object.entries(COLORWAYS).map(([cw, c]) => ({ id: cw, name: c.name, colors: c.jacket })),
  model: { kind: 'outfit', ref: 'long-anorak' }, unlock: { type: 'distance', value: 50000 } });
```
The rider builds that cut the first time it is worn (about 50–150 ms) and caches it.

### Add a new kind of piece (e.g. a backpack, a hood-up variant)
1. Build it in `garments.js` (with `bodyRings` + `sweep`, or your own rings with `sweepFrames`), give it
   a new piece id in `PIECE`, skin it with `skinBones` / `rigid` / `anchor` / `skinMask`.
2. Give it a branch in `fabricMaterial()`'s panel code (`id` = its piece id) for colours, seams and
   roughness.
3. If it sits around the face, add its id to the first-person hide range in `fabricMaterial` (`uHide`).
4. Put its parameters in the cut so it is data-driven, and document them in the table above.

### Change the helmet
`helmet.js`: plan width / length come from `shape` (and never get closer than ~2.2 cm to the head),
the lower edge per azimuth is `yBotKeys`, the crown profile is `domeF`, brim depth `shape.brim`. Vent
positions are in `helmetMaterial()` (bind-space metres).

## Performance

GPU timer queries per draw (`web/scripts/gfxgpu.mjs`, quality 1, 1600×900, chase cam):

| | before (toon suit + sphere helmet) | after |
|---|---|---|
| rider body | 0.06 ms draw + 0.04 ms shadow | 0.05 + 0.02 |
| outfit (1 skinned mesh, 15.9 k vertices, 30 k triangles) | – | 0.07 + 0.03 |
| helmet + lens (3.1 k + 1.1 k vertices) | < 0.01 | 0.01 |
| rider total | ≈ 0.10 ms (+0.17 ms eyebrow shadow artefact in both) | ≈ 0.20 ms |

Whole-frame `gfxperf.mjs` (quality 0/1/2): 9.1 / 14.2 / 27.1 ms GPU before; after, 8.7 / 14.2–16.2 /
23.4 ms in the quieter runs. Other sessions were sharing the GPU (up to five headless browsers), so
whole-frame numbers swung by 10–20 ms between runs; the per-draw timer numbers above are the reliable
ones (re-measured on the final build: outfit 0.07–0.09 ms + 0.04 ms shadow at every quality). The geometry is built once per page (about 50–150 ms on
first load, shared by both riders) and adds two draw calls (outfit + lens) to the main and shadow passes.

The shorter jacket (October 2026) has the same vertex count (rings per piece are fixed): outfit 0.10 + 0.03 ms
per draw after vs 0.09 + 0.04 ms before, whole frame 13.9 ms GPU at quality 1 before and after (best runs).

No new asset files: everything is generated in code, so CREDITS.md is unchanged.

## Known issues / limits

- Shells are single layers skinned with blended weights, so extreme poses (deep crashes, big grabs) can
  still stretch folds or push one layer into another for a frame.
- In a deep crouch the thighs pass in front of the jacket's front hem instead of lifting it (the shell
  doesn't collide with the legs). The shorter hem makes this much smaller than it was, and it reads as the
  hem tucked behind the thighs. From the front, the back hem shows between the legs as a thin olive edge.
- The hood worn up is rigid on the head; it doesn't sway or crease with fast head turns.
- The goggle reflection is a stylised environment (sky gradient, skyline, snow), not a real reflection
  of the scene.
- Poles and skis / board keep their equipment-catalog colours (pink poles), which can clash with
  earth-tone colourways; equipment colours are the equipment code's business.
- Logos are abstract marks (no text rendering); the strap wordmark is blocky glyphs.
- Helmet cam: sleeves and gauntlets are slimmed 25 % in first person; the poles, gloves and goggle lens
  in the helmet cam are described in `docs/first-person.md`. The hidden face pieces (`uHide`) are also
  discarded in the fragment shader, since the collapsed vertices still skinned into thin strands.
