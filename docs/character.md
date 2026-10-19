# Sendit rider look: outfit system

The rider wears modern new-school / freeride kit. Jackets come in six **fits** (slim technical shell,
relaxed freeride shell, long anorak, insulated puffer, tall hoodie over a shell, 90s one-piece). They
sit close at the neck and shoulders and hang straight from the chest and shoulder blades, so the volume
is low (waist, seat, hem) instead of inflated all over. The default is the relaxed shell. Each jacket has
a high collar and a stowed hood or a hoodie hood, plus a fleece gaiter pulled up under the goggle. The
legs are a relaxed bib, a tapered cargo pant or a wide pant, stacking over the boots. Gloves are leather
mitts with nylon gauntlets, and the helmet is a low-profile matte shell with a big frameless mirror goggle.
Everything is built procedurally around the Quaternius body when the rider loads. It is skinned to the
same bones the animation drives and coloured from data. Research: § Research below (October 2026)
and the earlier [character-research.md](character-research.md) (lengths, helmet / goggle, colours).

```
npm --prefix web run dev -- --port 5181 --strictPort
http://localhost:5181/                    lobby → Locker tab: earned colourways + mix and match
http://localhost:5181/?ride               chase cam (C toggles the helmet cam)
http://localhost:5181/?ride&equip=snowboard
```

Dev tools (screenshots go outside the repo):

```
node web/scripts/outfit-turntable.mjs <url> <outDir> '@looks.txt' stand,crouch,carve front,q34,side,back
node web/scripts/outfit-ingame.mjs    <url> <outDir> '@looks.txt' ski|snowboard   # carve, tuck, air grab, first person
node web/scripts/outfit-measure.mjs   <url> tuff-shell,ridge-shell                 # bind-pose widths / depths / sleeve radii
node web/scripts/outfit-compare.mjs   <out.png> "before=a.png" "after=b.png"
node web/scripts/outfit-eval.mjs      <url> '<js expression>'                      # poke the lobby page
```
A looks file holds `label=slot:garment@colorway,…;label2=…`, e.g.
`anorak=jacket:tall-anorak@arcade,pants:wide-pant@arcade,gloves:@arcade,helmet:@arcade,goggles:@arcade`.

## Research (October 2026): what modern ski and snowboard outerwear looks like

The user's brief: jackets "more like regular jackets than winter coats". The old cut made the rider
boxy and round. The target is the Arc'teryx look, baggy but wrapping the body, plus new-school cuts,
keeping a few puffers on purpose. Below are the sources and what I took from them. Brands are described,
never copied: no logos or trademarks are used.

**Why the old cut looked like a coat.** It inflated the body outline along its normals: the jacket was
the body plus 1.6 to 6 cm of ease, and it hung straight down from the chest. Over the Quaternius
"superhero" body this gave a chest ring of 54 × 46 cm and sleeves of 10 to 11 cm radius, against a body
that renders at about 40 × 25 cm under the clothes. Shoulders, arms and belly were all rounded at once.
Real shells do the opposite:
- they sit close at the neck, the shoulder tops and the upper back;
- they hang like a cylinder from the chest and shoulder blades;
- they put the volume at the waist, seat and hem;
- they read as flat panels with seams and a few folds.

**Brands and cuts** (product pages, retailer specs and reviews, 2024–2026):

| piece | fit and silhouette | numbers |
|---|---|---|
| Arc'teryx Sabre | relaxed/regular, articulated, slight drop hem, helmet hood, pit zips, powder skirt, Velcro cuffs over long sleeves | CB 79 cm (M) puts the hem at about 0.76 m on a 1.8 m rider, just over the seat |
| Arc'teryx Sabre SV / Rush | Rush is regular and athletic: two chest pockets plus two hand pockets, big pit zips | SV CB 85 cm, Rush 79.5 cm |
| Arc'teryx Sabre Relaxed Anorak | the "baggy Arc'teryx": loose through chest, waist, hip and thigh; no front zip, a full side zip, a kangaroo pocket, a chest pocket | CB 83 cm |
| Norrøna lofoten | trim, roomier chest and shoulders, tapers at the waist; the lofoten anorak is the long relaxed variant | ~85 / ~91 cm |
| Beyond Medals | unisex, loose, wide and short-ish (boxy) | M chest 122 cm garment, length 72 to 80 cm |
| ThirtyTwo | the same chest for every fit; only the length changes: Regular 76, Relaxed 86, Loose 95 cm | chest ~128 cm around (~28 cm ease) |
| Volcom (Longo, "91 fit") | loose, dropped shoulders, a bit shorter; the Longo pullover is "very baggy"; drop-tail fits | CB 75 cm |
| Dope / Montec (new-school) | Regular / Relaxed ("looser through body and shoulders, slightly longer, drop tail") / Boxy (short and wide, skate). The long look comes from riders sizing up to XL–XXL | — |
| Burton [ak], 686, Jones, Picture, Planks, Black Crows | regular articulated hip-length shells; Picture has a "long back"; 686 rates fit 1 (slim) to 8 (loose) and the Core Shell is a 5 | — |
| Puffers (Moncler Grenoble, Norrøna Lyngen down, Dope Puffer, Rab) | hip length, wide horizontal baffles that bulge like tubes with pinched stitch lines: the one garment that should look round | baffles 10 to 16 cm, loft 1 to 1.5 cm |
| Airblaster Freedom Suit | a retro one-piece, regular volume, waist adjusters, loud colours | — |
| Layering (park) | an oversized DWR hoodie worn alone or over a shell, the shell collar showing at the neck; ribbed cuffs and hem bunching | — |
| Pants and bibs | bibs dominate freeride and new-school; legs relaxed and straight, or wide with 1 to 3 stacked folds over the boot; scuff patches, cargo pockets, thigh vents | thigh ease 20 to 30 cm around |

**Chest ease** (garment minus body, cm around): slim 12–18, regular 18–24, relaxed 24–32, oversized
32–45. Burton's guide places the hem at the waist for slim, the hips for standard and mid-thigh for
long or relaxed, and lets relaxed sleeves cover most of the hand.

**Styling.** The hood goes over the helmet on storm days. A balaclava or gaiter is pulled up to the
goggle. Mitts and leather pipe gloves are both common. Gauntlets go over the sleeve on technical kit;
on new-school kit the sleeve stacks over a short cuff. Colours (2024–2026 buyer guides and brand
ranges):
- earth tones: olive, canvas/tan, carob, rust, bone;
- muted pastels: sage, dusty blue, lilac, butter, blush;
- tonal monochrome;
- two-tone colour blocking (black/bone, navy/orange, forest/lime) with one small saturated accent.

**Games.** In STEEP, Riders Republic and Shredders, modern outerwear reads through a long torso, hood
volume behind the helmet, straight-hanging panels with real hem drape, seams and colour blocks
breaking up the big surfaces, and sleeve and pant stacks. SSX and Fortnite exaggerate the length and
the hood but keep the shoulders narrow, so the volume sits low.

**What I modelled** (the numbers are in `FITS`, outfits.js):
- a close yoke on every fit;
- a target cross-section below the chest (a superellipse per height) that hangs straight;
- drape folds that grow toward the hem, with flutes in the free-hanging bottom;
- tension folds from the armpit;
- elbow compression folds and a wrist stack;
- quilted baffles on the puffer;
- a kangaroo pocket bulge on the anorak and hoodie;
- the hoodie's soft hood lying on the back;
- pants that stay slim under the jacket and open out below it;
- materials: a matte hardshell with a soft sheen, ripstop puffer nylon with more spec, cotton fleece
  that is fully matte with a fuzzy sheen;
- new skins in the trend palettes.

## Fits

All lengths are metres in the bind pose (1.8 m rider: hip joint 0.97, crotch about 0.86, knee 0.54).
Bind-pose sizes come from `outfit-measure.mjs`, as width × depth of the shell at the chest (1.4) and
the waist (1.1). The old cut measured 54 × 46 and 51 × 44, with a sleeve radius of 10–11 cm.

| fit (`FITS`) | garments | silhouette | chest / waist (cm) | sleeve r (cm) | hem F / B |
|---|---|---|---|---|---|
| `relaxed` | `tuff-shell` (default), `storm-shell` (hood up) | Sabre-style relaxed freeride shell: close yoke, straight hang, slight drop tail below the seat | 48 × 35 / 48 × 33 | 7.3 / 7.0 / 6.4 | 0.785 / 0.76 |
| `shell` | `ridge-shell` (new) | slim technical hardshell: follows the taper, vertical chest zips, pit zips | 45 × 31 / 43 × 30 | 6.6 / 6.3 / 5.8 | 0.85 / 0.825 |
| `anorak` | `tall-anorak` (new) | long new-school pullover: half zip, kangaroo pocket, side zip, mid-thigh | 49 × 35 / 49 × 34 | 7.7 / 7.4 / 6.8 | 0.72 / 0.70 |
| `puffer` | `cloud-puffer` (new) | the one round cut: 10.5 cm baffles, high quilted collar, hem cinched at the hip | 50 × 36 / 50 × 35 (+1.2 cm loft) | 7.9 / 7.7 / 7.1 | 0.88 / 0.875 |
| `hoodie` | `layer-hoodie` (new) | tall cotton hoodie over a shell: ribbed hem blousing at the hip, kangaroo pocket, drawcords, the shell collar out the top in the panel colour | 48 × 33 / 49 × 33 | 7.5 / 7.2 / 6.7 | 0.755 / 0.745 |
| `suit` | `retro-suit` | 90s one-piece: fitted, waist belt with a buckle | 46 × 32 / 44 × 30 | 6.9 / 6.6 / 6.1 | 0.84 / 0.84 |

Pants (`PANT_FITS`):

| fit | garment | look |
|---|---|---|
| `relaxed` | `tuff-bib` (default) | roomy, straight below the knee, three folds over the boot |
| `tapered` | `cargo-pant` | roomy thigh, narrowing to the boot, two folds |
| `baggy` | `wide-pant` (new) | wide straight leg, long inseam, four folds piling up over the boot |

Under the jacket the pant legs shrink to a slim lining (`covered()` in garments.js), so the seat never
bulges through a jacket's back hem. Below the jacket hem, covered skin (the crotch between the legs)
takes the pants colour (`uJHem` in bodyMaterial).

**Parameters of a jacket fit** (`FITS[fit]`; a garment is `jacketCut(fit, overrides)`):

| key | meaning |
|---|---|
| `hemFront`, `hemBack` | hem height at the centre front and back (back lower = drop tail) |
| `hemFlare` | + flares the last 12 cm out; − pulls the hem in (rib or drawcord) with the fabric blousing above |
| `torso.chest / waist / hem` | `[half width, front depth, back depth]` from the body's centre line at 1.38, 1.12 and the hem; `torso.n` = superellipse exponent (2 = round, 3 = boxy) |
| `shoulder` | stand-off over the yoke (shoulders, upper back), where the shell follows the body |
| `sleeve {upper, elbow, forearm, cuff}`, `sleeveEnd` | target sleeve radius at \|x\| 0.30, 0.46, 0.58 and the cuff; cuff position (wrist 0.706) |
| `collarTop`, `collarEase` | collar height and stand-off |
| `hood`, `hoodRoll` | `'down'` (roll `[thickness, height]`), `'up'` (over the helmet), `'hoodie'`, `'none'` |
| `folds` | drape / fold amplitude (shell 1, slim 0.75, puffer 0.3, cotton 1.3) |
| `quilt {pitch, depth}` | horizontal baffles (null = flat fabric) |
| `kangaroo` | bulge of a front kangaroo pocket (m) |
| `style` | shader layout: 0 shell, 1 anorak, 2 puffer, 3 hoodie, 4 one-piece (`uFit.x`) |
| `gaiter`, `gaiterTop` | fleece gaiter pulled up under the goggle |

**How the torso is built** (garments.js, jacket body):
1. The yoke (above 1.40–1.50) is the body outline plus `shoulder`, flattened at the chest, sloping to
   the armholes.
2. Below it, each ring is the fit's superellipse.
3. The back may only shrink 12 cm per metre below 1.5, so it hangs straight from the shoulder blades
   and there is no crease where the yoke ends.
4. The shell never comes closer than 2.6 cm inside the unshrunk skin. The body material pulls covered
   skin in by about 4 cm. The limit is max-filtered around the ring, so the shell bridges the grooves
   between the superhero muscles instead of showing them.

Sleeves use the target radius, never thinner than the collapsed arm (`bodyMaterial` pulls the arm 60 %
toward its axis from |x| 0.15). Gauntlets open just over the sleeve (`gauntlet[1]` = clearance).
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
  Per fit (`uFit.x` = the fit's `style`):
  - shell: yoke, side panels, chest and hand pocket zips, pit zips, hem drawcord; 3-layer face = rough 0.7, spec 0.34, sheen 0.26;
  - anorak: half zip, kangaroo pocket with a zip across it, horizontal chest pocket, side zip;
  - puffer: baffle stitch lines matching the geometry, ripstop sheen (rough 0.48, spec 0.6), elastic hem binding;
  - hoodie: cotton fleece (rough 0.95, spec 0.03, fuzzy sheen), kangaroo pocket, rib hem and cuffs,
    drawcords with aglets, a chest print; the collar shows the shell underneath in the panel colour;
  - one-piece: waist belt with a buckle.
- **bodyMaterial**: shrink + garment colours + glossy boots. Below `uJHem` (the jacket hem + 12 cm),
  covered skin takes the pants colour.
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
| jacket | `tuff-shell`, `storm-shell`, `retro-suit`, `ridge-shell`, `tall-anorak`, `cloud-puffer`, `layer-hoodie` | a fit from `FITS` plus overrides: `jacketCut(fit, {…})`; see § Fits for every key |
| pants | `tuff-bib`, `cargo-pant`, `wide-pant` | `PANT_FITS`: `pantsEase {thigh, knee, cuff}`, `straight`, `cuffY`, `stack {y0, y1, n, amp}` |
| gloves | `tuff-mitt`, `pipe-glove` | `mittLength` (|x| where the fist ends; wrist at 0.706), `gauntlet [start |x|, clearance over the sleeve at the open end]` |
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

**Jacket length** (history of the first shell; the October 2026 fits are in § Fits; with the slimmer
cut a longer hem no longer reads as a coat, so the relaxed shell went back to 0.785 / 0.76 and the anorak
to 0.72 / 0.70). `hemFront` / `hemBack` are the hem's height above the ground in the bind pose
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

**Catalog.** `profile/items.js` (CLOTHING_ITEMS) lists one clothing item per garment, and
`profile/catalog.js` registers them: `helmet-tuff`, `goggles-tuff`, `jacket-tuff-shell`,
`jacket-tuff-shell-hood`, `jacket-retro-suit`, `jacket-ridge-shell`, `jacket-tall-anorak`,
`jacket-cloud-puffer`, `jacket-layer-hoodie`, `gloves-tuff-mitt`, `gloves-pipe`, `pants-tuff-bib`,
`pants-cargo`, `pants-wide`, and the face items. Each item has
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
// outfits.js: start from the nearest fit and override what differs
'knee-anorak': {
  name: 'Knee Anorak', blurb: 'Knee-length pullover, extra roomy.',
  cut: jacketCut('anorak', { hemFront: 0.6, hemBack: 0.58,
    torso: { waist: [0.252, 0.17, 0.174], hem: [0.26, 0.176, 0.182] }, sleeve: { upper: 0.08 } }),
},
// profile/items.js: an item in CLOTHING_ITEMS with skins in the case series
{ id: 'jacket-knee-anorak', slot: 'jacket', garment: 'knee-anorak', name: 'Knee Anorak', unlock: 'case',
  variants: [{ id: 'bone', name: 'Bone', rarity: 'common', series: 'night-park',
    colors: { base: '#e8e2d4', panel: '#c8b28a', accent: '#4a3328', gaiter: '#c8b28a', style: 0 } }] },
```
The rider builds that cut the first time it is worn (about 120–160 ms) and caches it. Check it with
`outfit-turntable.mjs` (stand, crouch, carve; front, side, back), `outfit-ingame.mjs` (tuck, air grab,
first person) and `outfit-measure.mjs`, then run `node web/scripts/unittest.mjs` (item data, odds,
reachability). A new silhouette family (not just new numbers) gets an entry in `FITS` with a `style`,
and a branch in `fabricMaterial()` if it needs its own seams, pockets or fabric.

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

The modern fits (October 2026, second pass) keep the same mesh budget: every fit has the same ring counts.
With the default face gaiter and mitts:
- `tuff-shell`, `ridge-shell`, `tall-anorak`, `layer-hoodie` and `retro-suit`: 15 915 vertices / 30 084 triangles;
- `cloud-puffer` (no hood roll): 15 345 / 29 040;
- `storm-shell` (hood up): 17 360 / 32 880.

That is identical to before, still one skinned draw plus one shadow draw. Each cut takes 120–160 ms to
build on first wear, then it is cached. The fabric shader gained a per-fit branch (uniform `uFit`, a
few lines per pixel), and the vertex shader is unchanged. GPU timer queries aren't available in headless
Chrome on the MacBook (Metal), so the per-draw cost was not re-timed. Re-measure on the Surface with
`gfxgpu.mjs` if in doubt.

No new asset files: everything is generated in code, so CREDITS.md is unchanged.

## Known issues / limits

- Shells are single layers skinned with blended weights, so extreme poses (deep crashes, big grabs) can
  still stretch folds or push one layer into another for a frame.
- In a deep crouch the thighs pass in front of the jacket's front hem instead of lifting it (the shell
  doesn't collide with the legs). The shorter hem makes this much smaller than it was, and it reads as the
  hem tucked behind the thighs. From the front, the back hem shows between the legs as a thin olive edge.
- Modern fits:
  - The long cuts (anorak 0.72, hoodie 0.75) ride up over the thighs in a deep crouch or grab, because
    the shell doesn't collide with the legs. Seen from behind in a crouch, the seat rounds the back hem.
  - The bib's top (chest panel, braces) is never modelled, since every jacket covers it.
  - The hoodie's hood is a soft lobe on the back, not a real hood opening.
  - The folds are static bind-pose geometry plus shader wrinkles; there is no cloth simulation.
  - The superhero back can still show faint muscle relief through the slim shell's upper back.
- Item icons for the new garments come from the existing icon baker (pieces by slot); another
  worker rebalances the icon framing.
- The hood worn up is rigid on the head; it doesn't sway or crease with fast head turns.
- The goggle reflection is a stylised environment (sky gradient, skyline, snow), not a real reflection
  of the scene.
- Poles and skis / board keep their equipment-catalog colours (pink poles), which can clash with
  earth-tone colourways; equipment colours are the equipment code's business.
- Logos are abstract marks (no text rendering); the strap wordmark is blocky glyphs.
- Helmet cam: sleeves and gauntlets are slimmed 25 % in first person; the poles, gloves and goggle lens
  in the helmet cam are described in `docs/first-person.md`. The hidden face pieces (`uHide`) are also
  discarded in the fragment shader, since the collapsed vertices still skinned into thin strands.
