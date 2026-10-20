# Sendit rider look: outfit system

The rider wears modern new-school / freeride kit. Jackets come in six **fits** (slim technical shell,
relaxed freeride shell, baggy anorak, insulated puffer, hoodie over a shell, 90s one-piece). They
sit close at the neck and shoulders and hang straight from the chest and shoulder blades, so the volume
is low (waist, hem) instead of inflated all over, and they **end at the hip** (the baggy cuts just cover
the seat; see § Clothing pass 3). The default is the relaxed shell. Each jacket has
a high collar and a stowed hood or a hoodie hood, plus a fleece gaiter pulled up under the goggle. The
pants are real snow pants from the waist down (waistband, seat, hips, relaxed legs): a relaxed bib, a
tapered cargo pant or a wide pant with a dropped crotch, with a gentle break over the boots. Gloves are leather
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
- pants with a full waist, seat and hips under a hip-length jacket (clothing pass 3; the first pass kept them slim under the jacket);
- materials: a matte hardshell with a soft sheen, ripstop puffer nylon with more spec, cotton fleece
  that is fully matte with a fuzzy sheen;
- new skins in the trend palettes.

## Fits

All lengths are metres in the bind pose (1.8 m rider: hip joint 0.97, crotch about 0.86, knee 0.54).
Bind-pose sizes come from `outfit-measure.mjs`, as width × depth of the shell at the chest (1.4) and
the waist (1.1). The original cut measured 54 × 46 and 51 × 44 with 10–11 cm sleeves. The shoulders
are now narrower than the waist and hem on the long fits (A-line). The sleeve column gives the radius at
|x| 0.35, 0.45 and 0.55.

| fit (`FITS`) | garments | silhouette | chest / waist (cm) | sleeve r (cm) | hem F / B |
|---|---|---|---|---|---|
| `relaxed` | `tuff-shell` (default), `storm-shell` (hood up) | Sabre-style relaxed freeride shell: soft dropped shoulder, straight column, hip length with a slight drop tail over the top of the seat | 46 × 35 / 48 × 34 | 7.7 / 7.2 / 7.1 | 0.905 / 0.88 |
| `shell` | `ridge-shell` | slim technical hardshell: close, straight, vertical chest zips, pit zips, hem at the hip bone | 44 × 34 / 44 × 31 | 6.9 / 6.4 / 6.3 | 0.935 / 0.915 |
| `anorak` | `tall-anorak` | baggy new-school pullover: half zip, kangaroo pocket, side zip, the longest cut, just covering the seat | 47 × 35 / 50 × 36 | 8.1 / 7.6 / 7.6 | 0.855 / 0.835 |
| `puffer` | `cloud-puffer` | the one round cut: 10.5 cm baffles, high quilted collar, hem cinched at the hip | 50 × 37 / 50 × 35 (+1.2 cm loft) | 7.9 / 8.1 / 8.0 | 0.95 / 0.945 |
| `hoodie` | `layer-hoodie` | cotton hoodie over a shell: ribbed hem blousing over the top of the seat, kangaroo pocket, drawcords, the shell collar out the top in the panel colour | 47 × 35 / 50 × 35 | 7.9 / 7.3 / 7.3 | 0.875 / 0.86 |
| `suit` | `retro-suit` | 90s one-piece: a fitted top bloused over the waist belt (1.02), the legs in the suit colour below | 46 × 34 / 44 × 31 | 7.1 / 6.6 / 6.5 | 0.93 / 0.93 |

Below the waist (1.1) every jacket is widened where needed to clear the pants' trunk by `seatClear`
(default 2.8 cm; anorak 3.2, hoodie 3.0, suit 2.2), so the hem always hangs over the hips.

Pants (`PANT_FITS`):

| fit | garment | rise / crotch | seat: hip half width × front × back (cm) | leg r thigh / knee / hem (cm) | look |
|---|---|---|---|---|---|
| `relaxed` | `tuff-bib` (default) | 1.10 / 0.83 + bib to 1.36 front, 1.30 back | 23.6 × 14.8 × 18 | 12.8 / 11.6 / 11.2 | relaxed straight leg, three soft folds over the boot, hem at 0.11; a bib panel and straps |
| `tapered` | `cargo-pant` | 1.08 / 0.835 | 23.2 × 14.6 × 17.6 | 12.4 / 10.4 / 9.4 | roomy seat and thigh, tapering to the boot, two folds, hem at 0.14 |
| `baggy` | `wide-pant` | 1.08 / 0.80 | 24.6 × 15.6 × 18.8 | 13.8 / 13.2 / 13.0 | dropped crotch, wide straight leg, four folds where the long inseam stacks, hem at 0.09 |

**How the pants are built** (garments.js, "pants"; clothing pass 3):
1. **Trunk.** `pantsTrunk(cut)` is one superellipse per height around the body's mid-line: the waist at
   `rise`, the hips at 0.93 (`seat.hip`), then the front curves in to the crotch and the seat rounds
   under. Each leg ring above the crotch is its leg's half of it (a ray cast from the leg's centre to the
   trunk edge, cut at 1.2 cm past the mid-line), so the two legs meet flush at the centre front and back
   and read as one pair of pants with a seat, not two tubes.
2. **Legs.** Below the crotch (blend 0.05 below to 0.07 above it) the ring is a round tube of the fit's
   target radius (`leg.thigh` → `leg.knee` → `leg.hem`, a little deeper than wide at the bent knee). It is
   never closer than 4 mm over the bind-pose leg (the body shader also pulls the pants zone in 2.7 cm),
   and the legs never cross the mid-line. No flare: the hem radius is at most the knee radius; the boot
   break is 2 to 4 soft rolls that fade toward the top of the stack.
3. **Under the jacket.** Above the jacket's hem the pants stay 1.4 cm inside its rings, and the jacket
   below the waist is widened to clear the trunk by `seatClear`, so in the bind pose nothing touches.
4. **Skinning.** Above 1.0 the pants follow the pelvis only (`anchor`), blending to the transferred
   weights by 0.9; at the back the thigh may only take 15 % down to the crotch (`weightLimit`, lower
   under a long hem), so a crouch rounds the seat under the hem instead of swinging it out through the
   jacket. The jacket's hem band is held on the pelvis the same way (`weightFloor`, 90 % below 0.98).
   The body shader pulls the seat and hips (pants zone above 0.8) in as far as the jacket zone.
5. **Bib** (`cut.bib`): a panel from just inside the pants up to `bib.front` (back cut lower, `bib.back`),
   2.2 cm inside the jacket's own rings and skinned like it (24 smoothing passes, pelvis floor). Two
   shoulder straps run from its top over the shoulders to the back panel; they are only drawn when
   `uStraps` is 1 (the icon studio), since in the game they would sit under the jacket's close yoke.
6. **Shader** (pant piece, `uHemY.w` = rise): a waistband seam and a slightly darker band, a slanted
   hand pocket at the front of each hip, the outer seam, thigh vent zip, cargo pocket and knee darts as
   before; the bib (side 0) has side seams with zips and a zipped chest pocket.

Below the jacket hem + 12 cm, covered skin takes the pants colour (`uJHem` in bodyMaterial).

**Parameters of a jacket fit** (`FITS[fit]`; a garment is `jacketCut(fit, overrides)`):

| key | meaning |
|---|---|
| `hemFront`, `hemBack` | hem height at the centre front and back (back lower = drop tail) |
| `seatClear` | how far the jacket below the waist must clear the pants' trunk (default 0.028) |
| `hemFlare` | + flares the last 12 cm out; − pulls the hem in (rib or drawcord) with the fabric blousing above |
| `torso.chest / waist / hem` | `[half width, front depth, back depth]` from the body's centre line at 1.38, 1.12 and the hem; `torso.n` = superellipse exponent (2 = round, 3 = boxy) |
| `shoulder`, `shoulderY` | extra stand-off near the neck; height where the shoulder line starts rounding off to the neck (default 1.43) |
| `sleeve {upper, elbow, forearm, cuff}`, `sleeveEnd` | target sleeve radius at \|x\| 0.30, 0.46, 0.58 and the cuff; cuff position (wrist 0.706) |
| `collarTop`, `collarEase` | collar height and stand-off |
| `hood`, `hoodRoll` | `'down'` (collapsed hood, `[thickness, height above the neckline, drop down the back]`), `'up'` (over the helmet), `'hoodie'`, `'none'` |
| `folds` | drape / fold amplitude (shell 1, slim 0.75, puffer 0.3, cotton 1.3) |
| `quilt {pitch, depth}` | horizontal baffles (null = flat fabric) |
| `kangaroo` | bulge of a front kangaroo pocket (m) |
| `style` | shader layout: 0 shell, 1 anorak, 2 puffer, 3 hoodie, 4 one-piece (`uFit.x`) |
| `gaiter`, `gaiterTop` | fleece gaiter pulled up under the goggle |

**How the torso is built** (garments.js, jacket body). The second pass came out of integration review:
the shoulders and chest were still too broad, and muscles showed on the back.
1. **Every ring is the fit's superellipse, the yoke included.** From `shoulderY` (1.43) to the neckline,
   the half width and both depths round off to the neck `[0.085, 0.076, 0.072]` along a quarter-ellipse.
   This makes a soft, slightly dropped shoulder line: the fabric bridges from the neck to the upper arm
   instead of hugging the deltoids and traps. The chest is no longer sculpted, and the torso is a
   straight to slightly A-line column from the armpit to the hem.
2. **The back may only shrink 12 cm per metre below 1.5**, so it hangs straight from the shoulder blades.
3. **The shell never comes closer than 5.8 cm inside the unshrunk skin** (`MIN`). On the shoulder tops
   the limit is 3.6 cm, because the clavicles lift there in a crouch.
   - The body material pulls covered jacket-zone skin in by about 6.2 cm (`2.8 × uShrink`). It collapses
     the arms toward their axis from |x| 0.12, so the superhero deltoids stay inside the dropped shoulder.
   - The limit is max-filtered around the ring (±5 segments), so the shell bridges the grooves between
     the muscles instead of showing them.
4. **Skinning.** The jacket's weights are smoothed 24 times over the grid (other pieces use 6), so the
   back panel bends as one sheet: no spine groove and no shoulder-blade dents in a crouch.
   `weightFloor` makes the front of the hem below the crotch follow the thighs (up to 80 %), so long
   hems lift and bunch over the legs in crouches and grabs instead of being cut by them.
5. **Folds and hem.**
   - Folds: vertical drape folds growing toward the hem, flutes in the free-hanging bottom, light
     tension folds from the armpit.
   - Hem: a slight blouse 6–15 cm above it, and a rib or drawcord pull for negative `hemFlare`.

Sleeves are relaxed tubes. The target radius barely tapers from the upper arm to the cuff, with a gentle
elbow fold and a stack at the wrist. A sleeve is never thinner than the collapsed arm (`bodyMaterial`
pulls the arm 60 % toward its axis). Near the armhole its top stays under the dropped shoulder line.
Gauntlets open just over the sleeve (`gauntlet[1]` = clearance).

Shell hoods (`hood: 'down'`) are a collapsed helmet hood with volume. `hoodRoll = [thickness, height
above the neckline, drop down the back]`, piled up behind the neck under the helmet and thinning toward
the collar at the sides. The hoodie's hood is a softer, longer lobe lying down the back.
## Clothing pass 3 (October 2026): hip-length jackets, real pants

The user's review: most jackets ended almost at the knee, and the pants icons showed a skinny top over
a wide bottom ("they don't even look like pants"). The jacket should end at the torso: regular shells at
the hip bone / just below the belt line, the baggy new-school look a little longer (upper thigh, just
covering the seat), never near the knee.

**References.** Arc'teryx sells the Sabre / Sabre AR as hip length (CB ~79 cm in M, a slight drop hem);
new-school brands (Beyond Medals, Planks, Dope, Volcom) go longer by cutting relaxed fits a few cm longer
or by riders sizing up, but the hem still sits on the upper thigh, under the seat at most. Snow pant
spec sheets (686 and others) measure rise, hip, thigh and leg opening: relaxed fits keep a full seat
and hip, a roomy thigh and a leg opening close to the knee width (straight), with a short break over
the boot; bibs add a chest panel and straps. On the game's body (bind pose: belt line ~1.05–1.1, hip
joint 0.97, crotch ~0.84, knee 0.54) a real 79 cm back length would land below the crotch, which is
exactly what read as "almost at the knees" in the chase cam's crouched stance, so the hems are set by
eye to the body's landmarks instead of copied from the garment specs:

| fit | before (F / B) | now (F / B) | lands at |
|---|---|---|---|
| shell | 0.83 / 0.80 | 0.935 / 0.915 | hip bone |
| relaxed (default) | 0.765 / 0.725 | 0.905 / 0.88 | hip, a slight drop tail over the top of the seat |
| puffer | 0.88 / 0.875 | 0.95 / 0.945 | hip, cinched |
| hoodie | 0.71 / 0.69 | 0.875 / 0.86 | top of the thigh, rib bloused over the seat |
| anorak | 0.68 / 0.65 | 0.855 / 0.835 | upper thigh, just covering the seat (the longest) |
| suit | 0.84 / 0.84 | 0.93 / 0.93 | top bloused over the waist belt, legs in the suit colour |

With more of the pants showing, last night's "slim lining under the jacket" (which made the pants' top
skinny and was visible in every pants icon) is gone: the pants now have a waistband, seat and hips (§
Pants above). Checked with turntables (front / 3/4 / side / back; stand, crouch, carve, air grab, reach,
tuck) for every jacket fit and pants fit and the in-game sheets (carve, tuck, grab, first person, skis
and snowboard): the hem overlaps the pants by 15–25 cm and no body shows in any of those poses.

## Prototype round (October 2026): ten jacket + pants looks, natural body

The user asked for a full jacket redesign: how men's ski and snowboard jackets really sit on a male
torso, the trending market (Arc'teryx, The North Face, …), a little baggy and new-school, matching
pants, and probably new body proportions. This round builds **ten prototypes for the user to pick
from**. Nothing in the shipped game changes: every prototype lives behind a dev URL flag.

```
http://localhost:5213/?proto=3                 lobby + game dressed in prototype 3, on that prototype's body
http://localhost:5213/?proto=3&ride            straight into a run
http://localhost:5213/?protobody=natural       the natural body with the normal outfit (or =current)
node web/scripts/proto-sheet.mjs http://localhost:5213/ <outDir> [1,2,…]   # P<n>.png, overview.png, bodies.png
node web/scripts/proto-measure.mjs "http://localhost:5213/?protobody=natural"   # bind-pose body numbers
```

Code: `web/src/character/proto.js` (the registry `PROTOTYPES`, `protoSlots(n)`, the body morph
`morphBody()` / `bodyWarp()`). Hooks: `profile.js` returns `protoSlots(PROTO)` when `?proto` is set,
`resolveOutfit()` accepts an inline garment `def` (no catalog items are added), `rider.js` and the icon
baker call `morphBody(gltf.scene)` right after loading the model (a no-op without the flags). New
garment keys (all optional, ignored by the shipped cuts): jacket `fab`, `sleeveLayer {at, r}`,
`hoodSpan`; pants `style`, `fab`, `cargo`. Shader: `PROTO_GLSL` in materials.js (uniforms `uFab`,
`uLayer`), reached only for `uFab > 0` or jacket `style ≥ 5`.

### Research: the market (2024–2026 men's snow outerwear)

Products are described, never copied (no logos or trademarks are used).

| product | fit / length | features and fabric |
|---|---|---|
| Arc'teryx Sabre | regular, "roomy yet articulated", hip length with a slight drop hem; **CB 79 cm (M)** | helmet hood, pit zips, powder skirt, die-cut Velcro cuffs; 3L GORE-TEX with a brushed backer: a matte, quiet face |
| Arc'teryx Rush / Macai | regular, hip length; **CB 77 / 75 cm (M)** | Pro 3L (crisper, sharper creases) / down-insulated 3L |
| TNF Freedom Insulated + Freedom Bib | regular, hip length; **CB 80–81 cm**; bib inseam 30/32/34 in | 2L twill, light fill, powder skirt; bib with cargo pockets, thigh vents, kick patches; classic contrast-yoke colour blocking |
| TNF Summit Verbier / Dragline | regular, articulated; **back length 85 / 86 cm (M / L)** / hip length | 75D 3L plain weave / 3L on a ripstop face |
| Burton Frostner, [ak] Cyclic / Swash | regular, hip length, longer back; **Frostner CB 77.5 cm (M)** | 2L; Swash PrimaLoft 60 g body / 40 g sleeves |
| Volcom L / Longo GORE-TEX | "91 fit": relaxed, bigger chest, **dropped shoulder**, slightly shorter body (~75 cm CB, M); Longo now sold as "baggy", also as a pullover | 2L with ripstop contrast panels; Dark Olive, Desert Taupe |
| 686 Core Shell / Geo / Infinity Cargo / ATV bib | relaxed-regular hip-length shells; 686 rates fits 1–8 | pants measured flat: M hip 21 in, front / back rise 29 / 46 cm, inseam 84 cm, leg opening 10.5 in flat (53 cm around) |
| Picture Naikoon / Object | regular, **longer back** / thigh length (82 cm back) | recycled 2L, stonewash blue, army green |
| Dope / Montec | Regular, **Relaxed** (dropped shoulder, the longest, drop tail; riders size up) and **Boxy** (widest and shortest, drawstring hem); Dope Annok = oversized half-zip anorak with a kangaroo pocket | bonded 2L, matte; walnut camo, olive |
| ThirtyTwo | same chest for every fit (~64 cm pit to pit, ≈ 128 cm around); only the length changes: **Regular 76, Relaxed 86, Loose 95 cm (M)**; pants hip 42 / 45 / 50 in, opening 20 / 22.5 / 29.5 in (Regular / Loose / Wide) | tree camo; pulling back slightly from ultra baggy for 2025/26 |
| Jones, Quiksilver, Oakley, Beyond Medals, Planks, Norrøna | regular hip-length technical shells (Jones Shralpinist CB 82.5 cm M), Jones now also Relaxed and Baggy; Beyond Medals loose / boxy unisex; Norrøna Lofoten long asymmetric back, Tamok anorak relaxed | 3L stretch, 2L ripstop |
| Airblaster | Freedom / Beast one-piece suits, Work Jacket (chore coat look, quilted oxford, regular length), Beast Bib (semi-baggy) | stretch 2L, loud and lavender colours |

**How it sits on a 1.80 m man** (cervicale ≈ 1.55 m; a CB length puts the back hem at ≈ 1.55 − CB +
3 cm for the drape over the seat):

| fit | CB | back hem | lands at |
|---|---|---|---|
| short / boxy | 62–72 cm | 0.86–0.96 | belt to bottom of the seat, cinched (blouson) |
| regular "hip length" ski jacket | 76–80 cm | 0.78–0.82 | lower seat / gluteal fold, 5–10 cm *below* the crotch at the back |
| relaxed / long | 85–89 cm | ~0.70 | mid-thigh |
| loose new-school | 95–98 cm | ~0.62 | lower thigh |

- The **front** hem is 3–6 cm higher than the back (drop tail).
- **Shoulders**: technical shells have a set-in seam at the shoulder point; new-school cuts drop it 4–8 cm down the arm; anoraks are often raglan.
- **Sleeves**: regular ends just past the wrist with the elbow bent; relaxed / oversized covers most of the hand and stacks 4–9 cm at the wrist; cuffs go over or under the glove gauntlet (new-school: sleeve over a short cuff).
- **Hood**: helmet-compatible on most shells (brim at the helmet's front edge, volume round the back).
- **Pants**: inseam 81–84 cm against an 87 cm crotch with a 3–5 cm crotch drop puts the hem at the heel; relaxed legs break 1–3 times over the boot, wide / loose legs nearly swallow the boot. Bibs rise 25–35 cm above the waistband (lower sternum), the back panel lower.
- **New-school** bagginess barely adds chest: it adds length (+19 cm over Regular), dropped shoulders, wide sleeves, and a long rectangle over wide straight legs.
- **Trends 2025–27**: loose / baggy and longer is the dominant snowboard silhouette; earth neutrals (olive, taupe, brown, bone) with one pop colour; camo; 80s / 90s colour blocking; workwear textures (canvas, oxford, chore coats); gorpcore black-out 3L; ripstop contrast panels; bibs under boxy or long tops.

Sources: brand and retailer product pages and size charts (evo, REI, Backcountry, The Outfitters,
ALS, Absolute Snow, Snowleader), the Burton, Dope, Montec and evo fit guides, The Good Ride reviews,
Boardsport SOURCE FW25/26 and FW26/27 buyer's guides, and the ANSUR II public male data set.

### Research: the body

Real men about 1.80 m tall (15 men of 1.78–1.82 m from ANSUR II, mean 1.799 m) against the game's
Quaternius body, measured in its bind pose with `proto-measure.mjs` (1.81 m):

| | real (ANSUR II) | game body (current) | natural prototype |
|---|---|---|---|
| shoulder joints / biacromial | 0.416 m | joints ±0.212 (≈ 0.47 m across the acromia) | joints ±0.174 (≈ 0.40 m) |
| chest breadth × depth (no arms) | 0.281 × 0.248 | 0.45 × 0.337 (at the armpit, 1.40) | 0.367 × 0.27 |
| waist breadth × depth | 0.321 × 0.236 | 0.344 × 0.24 (1.15) | 0.322 × 0.229 |
| hip breadth | 0.343 | ≈ 0.38 (glutes incl.) | unchanged |
| upper-arm thickness | biceps 0.351 m around (≈ 0.11 Ø) | 0.177 | 0.13 |
| shoulder (acromion) height | 1.471 | joint 1.455 | unchanged |
| crotch / knee height | 0.877 / 0.508 | 0.84 / 0.542 | 0.834 / 0.522 |
| upper arm / forearm | 0.341 / 0.272 (bone landmarks) | 0.251 + 0.045 rig / 0.243 + 0.015 | 0.272 + 0.045 / 0.26 + 0.015 |

- **What reads "superhero"** is the width and depth of the chest, lats and shoulders (+30 %), the trapezius slope and the 18 cm upper arms, not the heights: shoulder, hip, crotch and arm span are within a few cm of real.
- Real ratios: biacromial / hip 1.21, leg (crotch) 48.7 % of the height, torso (cervicale to crotch) : leg 0.77.
- The game's knee is 3 cm high (short thigh, long shin) and its crotch 3–4 cm low. The rig's pelvis is deep, so the "short hip-to-crotch" impression is the opposite: the body isn't short-waisted, it is top-heavy.

**The natural body** (`BODIES.natural`) is a smooth warp of the bind pose:
- the trunk scales about the mid-line: × 0.81 wide and × 0.8 deep at the chest and shoulders, × 0.94 / 0.96 at the waist, back to × 1 at the hips and the neck;
- beyond the shoulder joint the arm is stretched (a C1 hinge) so the wrist, hands, mitts and pole grips stay exactly where they were: the shoulder joints come in 3.8 cm a side and the arms get longer;
- the arm girth × 0.78 → 0.88 → 1 from the deltoid to the wrist;
- the trapezius slope is lowered 1.2 cm beside the neck;
- the knee moves 2 cm down (longer thigh, shorter shin; hip and ankle stay).

Neck, head, helmet, hands, hips, ankles and every height the outfit code keys on are unchanged, so all
garment constants still hold. Bones keep their orientation; joints move with the warp; the rest pose
and `boneInverses` are rebuilt before the rider reads its rest pose, so skinning, IK leg lengths, gear
attachment (boots on bindings), poles and gloves follow. Checked in stand, crouch, carve, tuck and air
grab on skis (sheets below). The crash ragdoll and first person read the same rest pose but were not
checked on the natural body this round.

Under relaxed and baggy cuts the body barely shows (the fit's target sections are larger than both
bodies); it matters for slim cuts (P6), the yoke and sleeve heads, and the silhouette in crouches.
`bodies.png` shows both bodies bare and in P6.

### The ten prototypes

Heights are bind-pose metres (crotch ≈ 0.84, hip joint 0.97, belt ≈ 1.05, CB neck seam ≈ 1.56).

| # | name | body | jacket: fit, length (front / back hem) | pants | fabric / texture | colours |
|---|---|---|---|---|---|---|
| P1 | Alpine Hardshell | natural | Sabre-class relaxed 3L shell, articulated, hip length + drop tail, 0.86 / 0.80 (CB ≈ 76) | straight shell pant, clean (taped seams, vent zip, kick patch) | 3L hardshell: dense face, satin sheen | deep spruce teal, black pant, lime accent |
| P2 | Insulated Freedom | current | relaxed insulated jacket, contrast yoke, 0.885 / 0.855 | relaxed insulated cargo pant (bellows) | 2L twill, soft loft | gold body, black yoke and pant |
| P3 | New-School Anorak | natural | oversized long pullover, dropped shoulder, hood up over the helmet, kangaroo pocket, sleeves over the gloves, 0.79 / 0.74 (CB ≈ 82) | baggy pant, dropped crotch, 5-fold stack | peached 2L twill | sage + bone colour block, dark olive pant |
| P4 | Tall Tee Layer | natural | tall tee (mid-thigh, 0.72 / 0.70) over a hoodie (hood on the back, sleeves from the elbow) | baggy camo cargo with raised bellows pockets | cotton jersey + fleece | bone tee with a print, charcoal hoodie, olive camo |
| P5 | Boxy Puffer | natural | cropped oversized puffer, boxy (n 2.7), 12.5 cm baffles, tall collar, 0.965 / 0.96 (ends at the belt) | wide straight pant | ripstop with a grid and sheen | mocha brown, bone pant |
| P6 | Race Shell | natural | slim technical shell, close sleeves, hip bone, 0.94 / 0.905 | tapered shell pant | 3L hardshell | electric blue + black, red accent |
| P7 | Varsity Coach | natural | snap front, rib collar, cuffs and striped rib hem, contrast sleeves, welt pockets, chest patch, 0.90 / 0.885 | relaxed bib | melton wool body, smooth sleeves | forest green, cream sleeves, gold stripes, charcoal bib |
| P8 | 90s Colour Block | current | roomy, diagonal block across chest and back with an accent stripe, 0.895 / 0.875 | relaxed pant with a side stripe | satin nylon | bone / teal / purple |
| P9 | Duck Canvas Work | natural | boxy chore jacket (n 2.75), corduroy collar, flapped chest and patch pockets, brass snaps, triple topstitching, 0.875 / 0.865 | double-knee carpenter pant, hammer loop, rule pocket | duck canvas: slubs, faded fold ridges | brown duck, dark-brown cord, moss pant |
| P10 | Sherpa Flannel | natural | flannel shirt-jacket over a hoodie, button placket, flapped pockets, sherpa collar and lining, 0.86 / 0.85 | baggy pant | brushed flannel buffalo plaid, sherpa | rust / black plaid, cream sherpa, grey hoodie |

Contact sheets (`proto-sheet.mjs`, lobby light, same camera and scale for all): each `P<n>.png` has
standing front, front 3/4, side, back, back 3/4 and an "in motion" row (carve 3/4 and back 3/4, tuck
side, air grab 3/4 and side). `overview.png` puts all ten side by side (front 3/4 and back 3/4).

Iterations (three capture rounds): the hoodie hood under the tee and flannel was cut to the back
(`hoodSpan`) because it read as shoulder pads; the canvas weave was softened (it read as plaid) and
the colour desaturated; plaid overchecks, satin and ripstop speculars were toned down (latex /
leather look); face gaiters moved off cream (a "ghost face" next to cream hoods); the varsity back
panel was turned into an arch; the natural chest went from × 0.84 to × 0.81.

**Known limits of the prototypes.** Shirt and chore collars are stand collars (no fold-down
collar geometry yet). Long front hems ride up on the thighs in the ski stance and open a small V
between the legs. Pockets, plackets and stitching are shader detail, not geometry, except the cargo
bellows and the tee / hoodie sleeve step. Equipment colours (pink poles) are unchanged. Only the
prototype the user picks should be turned into real catalog garments (with first-person and icon checks).

## Prototype round 2 (October 2026): six refined looks, in-between body

The user's verdict on round 1: P10 Sherpa Flannel 10/10 and P2 Insulated Freedom "amazing"; the rest
failed on the same few things: hems that cup the seat or kick out over it (P1, P6, read feminine),
narrow shoulders over a wide waist (P3), boxes and cylinders (P5, P7, P9), cartoon puffers (P5). Round 2
keeps everything behind the dev flags (the shipped look is unchanged):

```
http://localhost:5180/?proto=r1 … ?proto=r6        a round-2 look on its body (the in-between body)
http://localhost:5180/?proto=r3&ride                straight into a run
http://localhost:5180/?proto=10&protobody=mid       any round-1 look on another body (current | mid | natural)
node web/scripts/proto-round2.mjs http://localhost:5214/ <outDir> [r1,…] [--alt=r3:current,1:natural] [--no-bodies]
node web/scripts/proto-measure.mjs "http://localhost:5214/?protobody=mid" --summary [--garment]
```

### Silhouette rules (every round-2 jacket)

a) The shoulders are the widest point; never narrow shoulders over a wider waist; no flare at the hips.
b) The back falls straight from the shoulder blades; the hem never cups the seat or kicks out over it.
c) Length: just covering the seat (back hem ≈ crotch height, 0.85–0.86), never longer.
d) Chest → waist shaping and drape folds (no cylinder / box); sleeves set into a soft shoulder slope.
e) Puffers: normal length, slim, small baffles, on the R2 shape.

How they are built (`proto.js` `R2_SHAPE` / `r2Cut()`, `garments.js`):
- **`cut.straightBack`** (new, optional; no shipped cut sets it). After the seat clearance, the back-most
  point of every jacket ring below the shoulder blades (1.44) is pushed out to the taut line over the
  blades, the pants' seat (+ clearance) and a plumb line from the blades (the lower convex hull of the side
  profile). The shell bridges the small of the back instead of coming in at the waist and flaring over the
  seat. In the bind pose the back now drops 1.4 cm over 55 cm (P2: in 2.4 cm at the waist, out 6 cm over the seat).
- **Trimmed pants seat** under the round-2 jackets (`SEAT` in proto.js: hip half width 0.226–0.232 instead of
  0.236–0.246, back 0.168–0.172 instead of 0.18–0.188) and `seatClear` 0.022: the seat no longer pushes
  the jacket out at the hips.
- A small negative `hemFlare` everywhere (a slight blousing above the hem, the edge tucked, never kicked out).
- Torso targets: chest ≥ waist ≈ hem half width (0.24 / 0.236 / 0.238 on R2), superellipse n 2.15–2.4.

Measured on the standing ski pose by `proto-round2.mjs` (skinned vertices; numbers on each
`R<n>-silhouette.png`): "hem past the back line" = how far the back of the hem zone sticks out past the
straight line down the torso from the shoulder blades; "waist dip" = how far the back dips in under the
line from the blades to the hem (cupping); widths across the back view:

| | hem past back line | waist dip | shoulders | hips (jacket) |
|---|---|---|---|---|
| R1–R6 (in-between body) | −3.0 … −2.8 cm | 0 | 62.8–64.7 cm | 50.0–51.9 cm |
| P2 round 1 (current body) | −3.8 cm | 2.3 cm | 63.9 | 53.3 |
| P1 round 1 (natural body) | −1.8 cm | 2.3 cm | 55.8 | 53.1 |
| P6 round 1 (natural body) | −2.0 cm | 3.5 cm | 54.7 | 52.0 |

### The in-between body (`BODIES.mid`)

The current body's shoulder line (joints ±0.212, broad shoulders read masculine) over a slimmer and
shallower chest and natural arms. New warp parameter `shoulder`: the chest factor eases back to it over
the shoulders (1.36–1.46) and every arm vertex takes it (so a factor ≠ chest doesn't shear the arm);
the natural body leaves it unset and is unchanged. Hands, boots, helmet, hips and heights stay anchored.
Bind-pose numbers (`proto-measure.mjs --summary`, trunk sections without the arms, m):

| | current | in-between (mid) | natural |
|---|---|---|---|
| shoulder joints | ±0.212 | ±0.212 | ±0.174 |
| width × depth at 1.40 (armpit) | 0.450 × 0.337 | 0.448 × 0.290 | 0.367 × 0.270 |
| width × depth at 1.30 (chest) | 0.426 × 0.330 | 0.398 × 0.285 | 0.349 × 0.265 |
| width × depth at 1.15 (waist) | 0.344 × 0.240 | 0.333 × 0.232 | 0.322 × 0.229 |
| width × depth at 0.95 (hips) | 0.404 × 0.286 | same | same |
| upper-arm thickness | 0.177 | 0.146 | 0.130 |
| upper arm / forearm (joints) | 0.251 / 0.243 | 0.251 / 0.243 | 0.269 / 0.263 |
| knee height | 0.542 | 0.522 | 0.522 |

Under P10 and P2 (`bodies.png`) the bodies barely change the jacket's front; they show at the shoulders
and sleeve heads: natural loses the shoulder line (the round-1 complaint), mid keeps it with slimmer arms.

### The six looks (all on the in-between body)

| | look | from | jacket | pants (round 1's liked pants, trimmed seat) |
|---|---|---|---|---|
| R1 | Sherpa Flannel | P10 | unchanged colours / flannel / sherpa / hoodie; straight back, hem 0.865 / 0.852, no hip flare | P10 baggy |
| R2 | Insulated Freedom | P2 | the base shape: relaxed 2L twill, black yoke, hem 0.885 / 0.858 | P2 relaxed cargo |
| R3 | Alpine Hardshell | P1 | 3L hardshell sheen, spruce teal + lime, stowed hood, a little closer than R2 | P3 baggy big stack (black) |
| R4 | Varsity Coach | P7 | wool body, cream sleeves, striped rib hem bloused, chest 0.248 → waist 0.228 (no cylinder) | P7 relaxed bib |
| R5 | Duck Canvas Work | P9 | duck canvas, cord collar, patch pockets, n 2.3 (no box), slight waist | P9 carpenter |
| R6 | Mocha Puffer | P5 | hip length (not cropped), slim, 8.5 cm baffles, matte mocha, cinched hem | P4 camo cargo |

Sheets (`proto-round2.mjs`): `R<n>.png` (standing 5 views, motion row, snowboard front 3/4 + back),
`R<n>-silhouette.png`, `overview.png`, `bodies.png`; `--alt` adds a look on another body (round-1
references `1-natural`, `6-natural`, `2-current` were shot for the numbers above).

Known limits: the snowboard stance shows the jacket only in the lobby idle (no carve on a board);
first person, the crash ragdoll and the icon baker were not checked on the in-between body; the canvas
texture's horizontal fold ridges read a little quilted at a distance.

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

**Jacket length**, clothing pass 3 (current): see § Clothing pass 3 below. Older history (of the first shell; the October 2026 fits are in § Fits; with the slimmer
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
  - In an air grab the knees come up beside and in front of the jacket (the shell doesn't collide with
    the legs); with the hip-length hems this now reads as the knees in front of the jacket.
  - Bib straps are only drawn in the item icon (`uStraps`); in the game the jacket always covers them.
  - Seen from behind in a deep crouch, a little of the background shows between the thighs under the
    long anorak / hoodie hems (it is the gap between the legs, not a hole in the clothes).
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
