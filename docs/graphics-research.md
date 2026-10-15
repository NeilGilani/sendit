# Graphics research: realistic snow and alpine rendering

Goal: make a WebGL2 ski/snowboard game read like Steep (Ubisoft Annecy, 2016) and real alpine footage.
Everything below is paraphrased. Items marked **[GK]** come from general graphics/physics knowledge rather
than a source fetched for this note; treat them as starting values to tune by eye.

---

## 1. Steep / Riders Republic (Ubisoft Annecy)

There is **no public GDC/SIGGRAPH talk or Digital Foundry teardown** on Steep's snow or terrain tech.
What exists is press and interview material.

- Steep reused the **Ghost Recon Wildlands engine** (AnvilNext family) for its terrain. Big landmarks like
  Mont Blanc were hand-shaped first, then rule-based **procedural generation** filled in the rest of the
  mountain. The team studied geological layering for credibility but bent it for fun rather than matching
  real elevation data exactly.
  https://gamesbeat.com/how-ubisoft-built-a-mountain-and-then-created-a-video-game-around-it/
- The team gathered visual, audio and topological reference in the Alps over two winters. Hands-on
  previews singled out the **long sun shadows across the massif, fog, rocks and trees**, plus **lens flare
  when looking toward the sun**. That is the "look": long cast shadows, strong sun, haze layering, flare.
  https://gamesbeat.com/?p=130628 , https://www.redbull.com/al-sq/steep-snowbaord-game-ubisoft-interview
- A PC review said the shipped lighting, draw distance and snow deformation fell short of the reveal
  screenshots. Takeaway: the marketing look depended on **draw distance + aerial perspective + lighting**
  more than on micro detail. https://www.dsogaming.com/?p=93827
- Riders Republic: reviewers praised its **draw distance, persistent snow tracks and weather**. There is no
  public write-up of how they were done. https://www.notebookcheck.net/Riders-Republic-Performance-Analysis.576508.0.html
- A Polycount thread asking how Steep deforms snow points to the Batman: Arkham Origins approach as the
  likely family of technique (heightmap + displacement). https://polycount.com/discussion/comment/2574890

## 2. Other games' snow tech

**Batman: Arkham Origins (GDC 2014, Barré-Brisebois)**: the reference implementation for deformable snow.
https://www.slideshare.net/colinbb/gdc2014-deformable-snow-rendering-in-batman-arkham-origins ,
https://gdcvault.com/play/1020379/Deformable-Snow-Rendering-in-Batman
- An **orthographic camera looks up from under the snow** through an ankle-high frustum. It clears to black,
  draws snow-affecting actors in white, then blurs the result (4-tap Poisson) and accumulates it into a
  heightmap by ping-pong.
- Heightmap resolution is min(512, a quarter of the surface size), with square texels. Low resolution was
  acceptable. Memory was about 2 MB per platform and the update cost under 1 ms on PS3/360.
- **Refill**: subtract a small constant every update so tracks fill back in, as if it were still snowing.
- Consoles used relief mapping (virtual displacement). PC used DX11 tessellation, with a min-height field
  that allows raised banks.
- **Shading trick**: deformed snow lerps toward a "compressed" material. Diffuse is **tinted toward the sky
  colour in the transition** to fake subsurface scattering. Detail and macro normals are combined with RNM
  (Reoriented Normal Mapping), not a lerp.

**Rise of the Tomb Raider (GPU Pro 7, Michels & Sikachev; SIGGRAPH 2015)**: "deferred deformation". The
snow mesh supplies base height. The deformation is reconstructed in the snow pass from a compact buffer of
trail data, about 4 MB. Trails are **pushed down in the centre and raised on the sides (berms)**, refill
over time during storms, and use compute plus hardware tessellation.
https://history.siggraph.org/learning/labs-rd-rendering-techniques-in-rise-of-the-tomb-raider ,
https://www.taylorfrancis.com/books/9780203705179/chapters/10.1201/b22483-18

**God of War Ragnarök (GDC 2023, "Reinventing the Wheel for Snow Rendering")**: replaced screen-space
parallax with **tessellated geometry displacement** near the camera only. Compute culling picks which
chunks go through the tessellated draw. Every terrain chunk has two draws: tessellated, and plain. Characters
and physics capsules carve every frame. **VFX particles read the displacement data** so debris rolls and
settles on the deformed surface. A top-down mask written by VFX drives a secondary detail normal. A GPU
system spawns meshes along the edges of the displacement.
https://80.lv/articles/santa-monica-s-senior-programmer-on-how-god-of-war-ragnar-k-s-snow-system-was-made/

**Horizon Zero Dawn: The Frozen Wilds**: deep-snow deformation that **persists a long time**. Pushing snow
aside **reveals the grass/ground layer underneath**, and feet kick up snow particles.
https://gamebanshee.com/k4ah6 , https://gamingbolt.com/horizon-zero-dawn-pc-1-03-patch-is-live-now-has-fixes-for-crashing-snow-deformation-and-more

**SSX (2012, EA Canada)**: mountains were built from **NASA topography** in the in-house "Mountain Man"
toolchain. Previews describe snow thrown off the board cascading downhill. No rendering detail is public.
https://gameinformer.com/games/ssx/b/ps3/archive/2011/04/13/climbing-to-the-summit

**Shredders (FoamPunch, 2022)**: built in **Unity**, with snow types that behave differently (fresh snow
is slippier). No public spray or snow tech write-up. https://en.wikipedia.org/wiki/Shredders_(video_game)

**Indie web ski game**: for HTML5 it moved **falling snow to cheap CPU particles** and kept GPU particles
for ski trails, with no particle shadows. That is a useful budget precedent for WebGL.
https://itch.io/post/11655629

**Journey sand (GDC 2013, John Edwards; Zucconi reimplementation)**: the closest analogue to stylised but
believable granular snow. It uses three specular terms:
- "Ocean" Blinn-Phong sheen.
- Fresnel-like **rim light** on dune edges (pow(1 - N·V)) so distant forms separate.
- Per-grain **glitter** that also appears in shadow.

Combining terms with `max()` instead of `+` keeps the surface from looking over-shiny. Wind ripples come
from slope- and orientation-blended normal maps.
https://www.alanzucconi.com/2019/10/08/journey-sand-shader-4/ , https://gdcvault.com/play/1017742/Sand-Rendering-in

## 3. Snow material: BRDF, SSS and sparkle

**Albedo and spectrum**
- Fresh snow reflects about **90% in the visible band**, falling off into the near-infrared. Visible albedo
  is set mainly by **impurities** (dust or soot at about 1 ppm can cut it 5-15%). Grain size and age mostly
  affect the NIR. For RGB rendering, old snow is only slightly darker but should be **dirtier/yellower**,
  not greyer. https://westernsnowconference.org/node/893 ,
  https://www.cambridge.org/core/journals/annals-of-glaciology/article/hyperspectral-analysis-of-snow-reflectance-to-understand-the-effects-of-contamination-and-grain-size/87E84501B5B19BDF36CA73A7683DA1D9
- Artist recipe (UE5): base colour **never pure white**; start near sRGB (200, 214, 230), which is slightly
  blue. Cavities and AO are tinted bluer. Grazing-angle brightening uses a Fresnel lerp, and a Fresnel-
  driven **roughness lerp** gives more sheen at grazing angles.
  https://80.lv/articles/setting-up-a-detailed-snow-shader-in-unreal-engine-5

**BRDF shape**
- Measured snow BRDF is **strongly forward-scattering at grazing light**: a bright sheen when looking toward
  the sun, and roughly Lambertian elsewhere in the visible band, darkening slightly at grazing view.
  **Sastrugi make it azimuth-dependent**: the forward peak reached about 5x the mean when the sun ran along
  the sastrugi direction. https://acp.copernicus.org/articles/10/2507/2010/ ,
  https://www.cambridge.org/core/journals/annals-of-glaciology/article/effect-of-surface-roughness-on-remote-sensing-of-snow-albedo/329B068F136E8FA00D9550CAF3162990
- Practical model: Lambert (or wrap) diffuse, plus a broad, low-intensity GGX lobe (roughness about
  0.5-0.7), plus a **forward-scatter sheen term** such as pow(saturate(dot(-L, V)), n) × grazing factor. **[GK]**

**Subsurface / translucency**
- Jimenez's advice for snow and ice: **backscattering and translucency matter more than screen-space blur**.
  Use a cheap "back diffuse" transmittance term rather than full SSSS.
  https://www.iryoku.com/screen-space-subsurface-scattering/
- SSS mainly **softens shadow terminators and lets light bleed** past shadow edges. On snow it shows up as a
  slightly blue, soft penumbra and glowing thin edges such as cornice lips and wind-lip crests.
  https://www.advances.realtimerendering.com/s2025/content/sss-siggraph-2025-advances-published.pdf
- A cheap mobile-grade option modulates reflectance by a "translucency magnitude" instead of doing true SSS.
  https://omilab.naist.jp/project/tmsss/index.html

**Why shadows are blue**: shadowed snow loses direct sun and is **lit only by the blue sky dome**, so the
shadow takes the sky's colour. A camera white-balanced for sun exaggerates this. Holes dug in the snow
show the same blue, which indicates sky light rather than ice absorption is the main cause at the surface.
https://www.storyofsnow.com/blog1.php/blues-and-whites-of-snow ,
https://cr4.globalspec.com/blogentry/7741/Winter-Shadow-Newsletter-Challenge-01-06-09

**Glints / sparkle**
- Zirr & Kaplanyan (I3D 2016): procedural multiscale glints. The NDF is the success probability of
  coin-toss "facets" counted inside the pixel footprint, which keeps it stable at distance. A Shadertoy and
  code are available. https://research.nvidia.com/publication/2016-02_real-time-rendering-procedural-multiscale-materials
- Wang & Bowles (EGSR 2016), "A Robust and Flexible Real-Time Sparkle Effect": shipped in a game, designed
  **for snow**. A **jittered 3D grid of seed points is intersected with the surface**, and its main
  contribution is anti-aliasing so sparkles can be about **1 px without flicker**. This is the best fit for
  a terrain shader. https://diglib.eg.org/bitstream/handle/10.2312/sre20161209/049-054.pdf
- Chermain et al. 2020/2021 give a physically based glint BRDF that converges to the standard microfacet
  BRDF, plus glint anti-aliasing on curved or normal-mapped surfaces.
  https://publis.icube.unistra.fr/docs/15022/Chermain2021RealTime.pdf
- Deliot & Belcour (CGF 2023, Intel): binomial counting over anisotropic grids. Lists **snow** as a target,
  and is 1.5-5x faster than earlier work. https://arxiv.org/pdf/2306.05051 ,
  https://intel.com/content/www/us/en/developer/articles/technical/real-time-rendering-of-glinty-appearances.html
- 2025 multi-grid procedural snow sparkle: **three microflake grids at different scales** avoid tiling and
  popping, with sparkle size and brightness scaled by distance.
  https://reference-global.com/article/10.2478/jamsi-2025-0009
- Cheap game tricks:
  - World-space hashed cells, each with a random flake normal; light the flake only when its
    reflection is near the view direction.
  - **Disable mips** on sparkle noise, or the sparkles blur away with distance.
  - Let **bloom make the star shape**; the shader only needs bright points.
  - Mask sparkles by the sun shadow.

  https://discussions.unity.com/t/work-in-progress-snow-shader/493566 ,
  https://discussions.unity.com/t/sparkle-shader/492850 , https://www.patreon.com/posts/25641162

## 4. Real-world look reference

**Spray and powder**
- Pro ski photographers **put the sun behind the rider** so the spray lights up. A backlit powder cloud
  glows bright against a deep blue sky, and the rider becomes a rim-lit near-silhouette. Exposure for
  bright snow action is about **1/2000 s, f/8, ISO 200**, or +1 to +3 EV compensation on auto metering.
  https://www.canon-europe.com/get-inspired/tips-and-techniques/winter-holiday-photography-tips/ ,
  https://www.skiutah.com/blog/authors/paula/5-tips-from-the-photographer-who-s
- Dramatic spray depends on the turn shape and the snow type: the rider "throws" snow on the turn exit.
  https://www.aphotoeditor.com/2018/01/16/the-daily-edit-powder-magazine-tal-roberts/
- **Diamond dust**: tiny ice crystals that seem to hang in clear, cold, calm air and **glint individually
  as they tumble**. They are often seen near the sun, sometimes with 22-degree halos or sun pillars. Good
  ambient "air sparkle" VFX for cold sunny days. https://www.atoptics.co.uk/blog/opod-diamond-dust-poland/ ,
  https://cloudappreciationsociety.org/?p=1546

**Surface textures**
- **Sastrugi**: sharp, wind-carved ridges **parallel to the prevailing wind**, steep on the windward end and
  tapering to leeward. They range from about 1 cm ripples up to metre-scale forms, and show a firm, textured
  surface. https://avalanche.ca/glossary/terms/sastrugi , https://en.wikipedia.org/wiki/Sastrugi ,
  https://avalanche.ca/glossary/terms/wind-effect
- Wind redistribution: **windward slopes are scoured** (thin snow, exposed rocks and vegetation, crusts,
  sastrugi). **Lee slopes are loaded** and look smooth and pillowy. In one Swiss study, lee slopes held
  about **2x the snow of the adjacent windward slope**.
  https://www.alpineinstitute.com/windward-and-leeward-side-of-a-slope-and-avalanche-hazard/ ,
  https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/36FCDF2DA3CEDD8A782ACC7E91B7727D/S0260305500005231a.pdf/distribution-of-snow-drifts-on-ridge-slopes-measurements-and-theoretical-approximations.pdf
- **Cornices and wind lips**: overhangs on the **lee side of sharp ridges**, from small soft lips to hard
  overhangs **10 m or more**. They build in moderate wind (about 15-25 mph); stronger wind sends the snow
  further downslope instead. Typical above treeline and at couloir tops. https://avalanche.state.co.us/cornice-fall ,
  https://slf.ch/en/news/beautiful-but-dangerous-how-cornices-are-formed
- **Corduroy**: a snowcat blade flattens the snow and a rear tiller lays **straight parallel ridges running
  downhill**. Ski tracks cut across it and knock the ridge tops into the grooves. Wet snow leaves streaks.
  No source gave the groove pitch; it is roughly 2-3 cm by eye **[GK]**.
  https://santafe.com/enjoy-the-roy-credo-of-a-taos-ski-valley-snow-groomer/ ,
  https://www.popsci.com/environment/the-science-of-ski-grooming/

**Slope angle and snow cover**
- Slab avalanches cluster at **30-45 degrees**. **50-60 degrees** gives frequent loose-snow sluffing.
  **Above about 60 degrees** snow generally cannot accumulate (it keeps sluffing off). Steep slopes hold
  less snow and are wind-stripped, and **snow collects in hollows and gullies**.
  https://avalanche.ca/glossary/terms/slope-angle , https://utahavalanchecenter.org/node?page=3430 ,
  https://www.voile.com/blog/the-science-of-slope-angles/

**Trees**
- **Tree wells**: hollows of loose, unconsolidated snow around conifer trunks, because the canopy
  intercepts snowfall. They can be several metres deep and are not easy to spot visually.
  https://en.wikipedia.org/wiki/Tree_well , https://deepsnowsafety.org/?p=10
- **Snow ghosts** (rime-encased conifers): supercooled cloud and fog droplets freeze on contact, building
  opaque white rime that **points into the wind**. They form near treeline in foggy, cold, breezy places
  (Whitefish MT, Mount Zao in Japan). https://www.ktvh.com/news/2019/02/13/how-are-snow-ghosts-made/ ,
  https://www.airspacemag.com/travel/arboreal-snow-monsters-overrun-northern-japan-every-winter-180971323/
- Spruce and fir branches **flex down under load and shed snow**. Down-sloping branches shed more, so
  loaded conifers look like narrow cones with drooping tiers. Snow sticks more near 0 to -3 °C, which
  produces heavier "marshmallow" loads. https://ourwinterworld.org/snow-and-living-things/plants/ ,
  https://authorea.com/doi/full/10.22541/au.161443094.42414018
- Alpine treeline: **larch and Swiss stone pine**, at about 2000-2300 m in the outer Alps and up to about
  2450-2550 m in the inner western Alps (Zermatt). Larch is deciduous, so it is **bare and grey-orange in
  winter**. https://pmc.ncbi.nlm.nih.gov/articles/PMC3357808 , https://www.mdpi.com/1999-4907/10/9/744

**Atmosphere and sky at altitude**
- The zenith sky is **bluer and more saturated at altitude**: thinner air brings less whitening haze and
  less blue-poor ground-reflected light. It can also look darker overall. The horizon is brighter and paler
  than the zenith. https://stevealbers.net/albers/allsky/skycolor.html ,
  https://astro-geo-gis.com/light-scattering-in-the-earths-atmosphere-part-2-why-is-the-sky-blue-and-how-the-sky-color-changes/
- Aerial perspective: each receding ridge gets **lighter, cooler and lower in contrast**. **Darks shift the
  most**, and the farthest ridges approach the horizon sky value. Do not warm distant planes at sunset.
  https://drawpaintacademy.com/atmospheric-perspective/ , https://eclecticlight.co/2015/04/23/making-space-4-aerial-perspective/
- Goggle tints: S3 (sunny) lenses transmit about **8-18%** of visible light and are grey, green or mirrored
  red. Rose, copper and amber are S1/S2 (about 18-80%) for flat light and boost contrast. A subtle,
  optional "goggle" LUT is a stylistic hook (warm/rose for contrast).
  https://www.giro.com/news/what-does-vlt-mean.html , https://skis.com/blog/32/what-ski-goggle-lens-should-you-use-a-simple-guide-to-lens-options

## 5. Atmosphere, aerial perspective and tone mapping

- **Hillaire 2020** (used in UE's SkyAtmosphere): small LUTs (transmittance, multi-scattering, a 2D
  sky-view, and a **3D aerial-perspective froxel volume**). A port reports the 64×64 sky-view at about
  0.036 ms and the 64×64×32 AP volume at about 0.03 ms on a GTX 1060, which is very WebGL-friendly.
  https://diglib.eg.org/handle/10.1111/cgf14050 , https://github.com/AirGuanZ/AtmosphereRenderer ,
  https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf
- **Bruneton** precomputed scattering has a ready Three.js port, `@takram/three-atmosphere`, which applies
  aerial perspective as a post-process. It has no light shafts.
  https://unpkg.com/@takram/three-atmosphere@0.13.2/README.md
- **Cheapest option (Quilez)**:
  - Exponential fog with **separate per-channel extinction and in-scatter** coefficients, so distance turns
    things blue and then pale.
  - **Fog colour biased toward the sun**: lerp blue-grey (0.5, 0.6, 0.7) to warm (1.0, 0.9, 0.7) by
    pow(max(dot(V, L), 0), 8).
  - **Analytic height fog**: density a·exp(-b·y), integrated in closed form along the ray.

  https://iquilezles.org/articles/fog/
- **Exposure**: the EV100 tables list **snow or light sand in full sun at EV16** and a typical sunlit scene
  at **EV15**. "Sunny 16" becomes **f/22 on snow**, one stop more light from reflection. Back-lit scenes
  are about 2 EV darker. https://en.wikipedia.org/wiki/Sunny_16_rule ,
  https://www.liquisearch.com/exposure_value/tabulated_exposure_values
- **Tone mappers**:
  - **ACES (fitted)** hue-shifts: bright blues go toward magenta, and reds and greens toward orange. On
    snow this can push blue shadows purple and clip white.
  - **AgX** has little hue shift but desaturates.
  - **Khronos PBR Neutral** is a 1:1 colour match up to a knee, with K_s = 0.8 - 0.04 (start of
    compression) and K_d = 0.15 (desaturation speed). It assumes normal exposure.

  For snow, AgX or Neutral keeps whites white and shadow blues blue.
  https://doc.qu1x.dev/bevy_trackball/bevy/core_pipeline/tonemapping/enum.Tonemapping.html ,
  https://modelviewer.dev/examples/tone-mapping , https://github.com/KhronosGroup/ToneMapping ,
  https://discourse.threejs.org/t/tone-mapping-overview/75204
- Paper-white diffuse must map **below 1.0 display** so highlights (sparkle, sun sheen) still read brighter
  than lit snow. https://modelviewer.dev/examples/tone-mapping
- Terrain slope blending best practice:
  - Compare |N.y| against cos(threshold).
  - Use a **smoothstep band, not a step**, and perturb the threshold with noise or height so the edges
    break up.
  - Use **triplanar** sampling on cliffs.
  - Let snow settle into rock crevices with a height-map compare.

  https://docs.planetside.co.uk/wiki/Texturing_with_Surface_Layers ,
  https://blenderartists.org/t/procedural-snow-and-terrain-blending-with-shader-displacement/1651378 ,
  https://godotshaders.com/shader/triplanar-stochastic-terrain-shader

---

## Concrete visual targets

Values are starting points in **linear** space unless noted. Tune against reference photos.

### Snow material
1. **Albedo**: linear 0.80-0.90 for fresh snow, about 0.70-0.80 for old or groomed snow, with a faint cool
   tint (sRGB around 200/214/230 → linear ≈ 0.58/0.67/0.79, scaled so the brightest channel is about 0.85-0.9).
   Never 1.0. Dirty old snow is slightly warm, not grey.
2. **Diffuse**: wrap lighting, `(N·L + w)/(1 + w)` with w ≈ 0.2-0.3, to fake SSS-softened terminators.
   Tint the wrap region slightly cyan, around (0.85, 0.95, 1.0).
3. **Specular**: GGX with roughness 0.55-0.7 and F0 0.02-0.03 (ice). Add a **forward-scatter sheen** when
   the camera faces the sun: `pow(saturate(dot(V, -L)), 4-8) * (1 - N·V)^2 * 0.3-0.6`. This gives the
   bright slope glare seen toward the sun.
4. **Shadowed snow** is lit only by the sky. Target a shadow/sunlit luminance ratio of about **1:4 to 1:6**
   on clear days. The shadow hue should read as **clear sky blue**, around sRGB (150, 175, 215) when
   sunlit snow sits at about (245, 245, 245). Get it from sky irradiance (SH or hemisphere: zenith blue
   above, bounce white below), not from a flat ambient colour.
5. **Sky-tinted AO/cavity**: multiply cavities toward blue (for example, lerp to (0.7, 0.8, 1.0) by AO),
   not toward black.
6. **Sparkle**:
   - Use a world-space jittered grid (Wang & Bowles style) of about **1500-4000 flakes per m²** near the
     camera, with flakes about **1-2 px** on screen.
   - Light a flake only when its random normal reflects the sun into the view within about 1-3 degrees,
     so roughly 0.5-2% of flakes are lit at once.
   - Intensity 5-30× lit-snow luminance (HDR) so bloom forms the star. Mask by sun shadow.
   - Fade density by pixel footprint (distance) to avoid shimmer. Add a second, coarser grid for the
     mid-distance.
7. **Detail normals**: a three-scale stack: metre-scale wind waves (amplitude 2-5 cm), 10-20 cm drift
   ripples, and 1 cm grain. Blend with RNM or a UDN-style blend, not a lerp. Rotate ripple and sastrugi
   orientation to a **global wind direction**.
8. **Grazing Fresnel**: brighten snow by about 5-10% at grazing view and drop roughness slightly (0.1), so
   distant slopes get a soft sheen.
9. **Tracks / deformation**: a heightmap around the player of about **512² over 32-64 m**, scrolling with
   the player. Use a ~4-tap blur when writing. Trail profile is a **groove 5-20 cm deep in powder (1-3 cm
   on groomers) with 2-5 cm raised berms** on each side. Refill rate is near zero on sunny days and
   faster in snowfall. Tint compressed snow slightly darker and bluer, with less sparkle.
10. **Corduroy on pistes**: a straight sinusoid ridge pattern running down the fall line, pitch about
    2-3 cm and depth about 0.5-1 cm, as a normal map only. Fade it to flat at 30-50 m, and erase it under
    player tracks.

### Spray & particles
11. **Carve spray (rooster tail)**: emit from the downhill edge at contact. Rate scales with speed ×
    edge angle. Use 2 layers:
    - (a) Clumps of 2-8 cm, lifetime 0.4-0.9 s, with gravity and ballistic arcs.
    - (b) Powder mist sprites of 0.3-1.5 m growing to 2-3 m, lifetime 1.0-2.5 s, with high drag (velocity
      halves in about 0.3 s) and slow fall.
12. **Spray launch velocity**: inherit about 30-60% of rider velocity, plus an up and outward kick of
    2-6 m/s (deep powder up to 8 m/s). It peaks on turn exits.
13. **Particle shading**:
    - Use Henyey-Greenstein phase g ≈ 0.6-0.8, so spray between camera and sun glows **3-8× brighter**
      than side-lit spray. Backlit powder must be the brightest thing on screen after the sun.
    - Soft-particle depth fade 0.3-0.5 m.
    - Self-shadowing is optional; darken the bottom of dense clouds by about 20-30%.
14. **Powder cloud / sluff**: large billboards (2-6 m) that linger 3-6 s and drift with the wind. Opacity is
    low (0.1-0.3 each) and they stack.
15. **Diamond dust**: on cold sunny days, a 10-30 m volume around the camera with tiny point sprites (1 px)
    that twinkle only within about 20-30 degrees of the sun direction. Density is very sparse.
16. **Falling snow (weather)**: cheap CPU or vertex-shader-animated quads in a camera-wrapped box. Flakes
    are 3-10 mm, fall at 0.5-1.5 m/s, with sinusoidal sway. Fade near the camera to avoid big blurry flakes.
17. **Kick-up from deformation**: when the player cuts a fresh groove, spawn a few clumps that **collide
    with the heightmap** (as in GoW) and roll briefly before dying.

### Mountains & rock
18. **Slope thresholds**:
    - Full snow below **35 degrees**.
    - Snow thinning to rock between **35-50 degrees**; use a smoothstep band about 8-12 degrees wide,
      perturbed by noise of about ±5 degrees.
    - Bare rock above **50-55 degrees**, with only streaks and ledges.
    - Essentially nothing sticks above **60 degrees**.
19. **Ledges and cliff bands**: on rock, place snow wherever the **local** normal (use a higher-frequency
    normal or the rock heightmap) is near-horizontal. This gives white stripes on ledges and dark vertical
    rock walls, the classic alpine banded look. Snow also collects in gullies and hollows (use concavity or
    curvature as a boost).
20. **Wind asymmetry**: choose a prevailing wind vector. Windward faces get **less snow and more exposed
    rock, plus sastrugi normals**. Lee faces get **smooth, pillowy snow, about 2× depth**. Add cornice or
    lip geometry, or a bright rim, on lee ridge crests.
21. **Rock colour**: dark grey-brown granite or gneiss, linear albedo 0.10-0.25, so sunlit snow is roughly
    **4-8× brighter** than sunlit rock. Contrast between dark rock bands and snow is what reads as "alpine".
22. **Cornice and ridge rim light**: thin snow lips facing the sun get a translucency boost, for example
    `saturate(dot(V, -L)) * thickness term * 0.5`, so crests glow when backlit.
23. **Distance LOD**: rock and snow detail normals fade by about 500 m. Beyond that, the silhouette plus
    aerial perspective do the work, so spend the budget on the horizon-line silhouette.

### Trees
24. **Treeline**: conifers stop at about 2000-2300 m, with isolated stunted trees about 100-200 m above.
    Bare grey-orange larches mix in near treeline. Below that, use dense spruce and fir.
25. **Snow-loaded conifers**: on the canopy, mask snow by the upward normal (N.y > 0.5) with fluffy clumped
    edges. Branches droop on heavily loaded trees. Clean dark-green trees should appear too (they shed
    snow), at about 30-50% mix.
26. **Snow ghosts**: near treeline, add rime-encased variants that are fully white and lumpy, with growth
    biased toward the windward side.
27. **Tree wells**: a 0.5-1.5 m deep depression, radius about 0.7-1.0× canopy radius, around each trunk,
    with a darker blue-shadowed interior. Use a cheap heightmap stamp plus AO.
28. **Tree albedo**: very dark (linear about 0.03-0.06 green-black) so forest patches read as near-black
    against snow up close. They fade to blue-grey with distance via aerial perspective.

### Lighting / sky / post
29. **Sun**: illuminance about 100-120 klux equivalent at noon at altitude. Use a disk of about 0.53
    degrees angular diameter with limb darkening. Sun disk luminance should sit far above everything else
    (≥ 1000× snow) so bloom and flare fire only on it and on sparkles.
30. **Sky at altitude**: the zenith is a deep saturated blue, roughly sRGB (40, 90, 180) to (60, 110, 200)
    at 3000 m, at about 30-40% of the horizon's brightness. The horizon is pale cyan-white, around
    (185, 210, 235). Use Hillaire LUTs (or a Preetham fit) with Rayleigh density scaled down by
    exp(-altitude/8 km) so the sky deepens as you climb.
31. **Aerial perspective**:
    - Per-channel extinction, with blue scattering about 2-3× red.
    - Contrast roughly halves by 10-15 km. Distant ridges (30-60 km) fade to within 10-20% of the horizon
      sky value.
    - Near the sun direction, in-scatter tints warm (Quilez sun-biased fog, exponent about 8).
    - Use height-falloff fog (scale height about 1-2 km) so valleys are hazier than peaks.
    - Darks shift the most: distant forest goes blue-grey, distant snow barely changes.
32. **Exposure**: lock an EV100 of about **15-16** for sunlit snow scenes (Sunny 16, one stop down for
    snow). Lit snow should land at about 0.75-0.85 display after tone mapping, never clipped. Use slow
    auto-exposure (about 1-2 s adaptation) for forest-to-open transitions.
33. **Tone mapping**: prefer **AgX or Khronos PBR Neutral** over ACES so blue shadows stay blue (not purple)
    and white stays neutral. Add a mild S-curve or contrast grade afterwards if it looks flat.
34. **Bloom**: low intensity (about 0.02-0.05 mix) with a high threshold (only HDR > 1.5-2× paper white), so
    only the sun, sparkles and backlit spray bloom. Optional: lens flare and ghosting when the sun is in
    view (a Steep signature), and a subtle vignette.
35. **Grade / "goggle" look**: a slight cool shadow grade and a neutral-to-warm highlight grade. An
    optional rose or copper goggle filter (+contrast, warm highlights, about 10-15% tint) for flat-light
    weather. In overcast or flat light, **remove the sun term and kill shadow contrast** so terrain
    readability drops, as in real flat light. Sparkle off, sky near-white.

---

## Addendum: second-pass targets (branch `claude/gfx-snow-0dfc5c`)

No new sources were fetched for this pass. The items below are **[GK]** observations from general
knowledge of alpine terrain and photography. Each was turned into a target and compared against
screenshots of the game.

- **Sluff flutes and spines.** Steep snow faces (about 35–55°) in big mountains are covered in parallel
  runnels down the fall line: sharp crests (spines), rounded troughs, spacing from a few metres to tens of
  metres, merging and splitting as they descend. They read from kilometres away as fine vertical
  hatching on every steep snow face. Target: two octaves (about 15 m and 4 m), always aligned with the
  local fall line, never crossing each other, fading out below about 5 px per runnel.
- **Rock structure beats rock texture.** At distance, cliffs read through their structure: slabs along
  the bedding, vertical joint sets, buttresses and gullies. The grain of the surface hardly shows. Up
  close a photographic grain helps, but large uniform blotches read as dirt. Target: blocky facets at
  2–50 m scales, sparse dark joints, albedo about 0.1–0.3 linear (grey, slightly warm), with mild
  variation between blocks.
- **Snow on rock.** Snow sits on whatever faces up: ledges, facet tops, broken strata, the backs of
  blocks. It leaves the risers bare, so a cliff reads as grey rock flecked and banded with white, never
  with uniform stripes.
- **Rock in shade.** Shaded cliffs still show relief, because up-facing parts see more open sky and
  cracks see less. Target: directional sky light plus crack occlusion, a cool blue-grey overall.
- **Mid-distance relief.** In real valleys the walls 0.5–5 km away carry most of the drama: spurs,
  gullies, rock ribs and avalanche paths. Smooth slabs at that distance are the biggest "this is a game"
  tell. Target: about 10 m terrain detail out to ±6 km, with real cast shadows from the surrounding
  peaks.
- **Branch snow.** Snow on conifers sits as solid rounded pads and pillows (thick at the trunk, thinner
  toward the tips). It hides the needles under it and casts a dark contact shadow on the foliage below.
  It is never a thin white edge along each branch.
- **Carve spray.** A hard carve throws a dense, short-lived wave right at the edge that frays into
  granular streaks, clumps and a lingering cloud. Over sunlit snow, white spray is visible mainly through
  its **shadow** on the snow and its slightly darker, self-shadowed underside, and it is brilliant when
  backlit. It starts at the snow surface, not at the buried edge.
- **Track rendering.** Tracks have rounded, soft-walled trenches. Distant tracks are thin continuous
  grooves, never dashed.
