# Rewards research: CS:GO-style cases for Sendit

Research notes for an earned-only cosmetic case system: no real money, no purchases, no keys for sale, no trading. Compiled 2026-10-16. Numbers marked **[verified]** come from a primary source (game files, the paper itself, or an official page). Numbers marked **[estimate]** are community figures or our own measurements and should be treated as approximate.

---

## 1. How CS:GO / CS2 case opening actually works

The best source we found is the CS2 client UI code itself. SteamDB's GameTracking project publishes the game's Panorama UI files (`popup_capability_decodable.js / .css / .xml`). The numbers below are read straight from those files. They describe the current CS2 client. The older CS:GO client may have differed slightly; we could not check that.

### Timeline (from pressing "Unlock") [verified, CS2 files]
- **0.0 s**: the case model drops in (`container_weapon_fall` plays when the popup opens). On unlock, the `container_weapon_open` sound plays and the camera moves to `cam_case_open` over **1.5 s**.
- **0.75 s**: the case lid opens (animgraph `open`).
- **2.0 s**: the reel strip appears. It scales in vertically over 0.25 s with a white radial flash.
- **2.1 s**: the reel starts scrolling.
- **2.1 s + 6.0 s**: the reveal fires (`revealDelay = 6`). In total that is about **8 s from click to reveal**, plus any server delay.

### The reel [verified]
- **Duration and easing:** the scroll is a CSS transition of **6 s** using `cubic-bezier(0.075, 0.82, 0.165, 1)`. That is a very steep ease-out, close to Penner's "easeOutCirc". *(The match to easeOutCirc is from memory; we did not find a page listing the preset's values.)*
- **Shape of that curve** (we evaluated it numerically for a 32-card travel):
  - 0.5 s: 55% of the distance covered
  - 1 s: 75% covered
  - 2 s: 90% covered
  - 3 s: about 1.3 cards left
  - 4 s: about half a card left
  - 5 s onward: effectively still

  So most of the travel happens in the first second, followed by a roughly 3 s crawl over the last card or two. That crawl is the anticipation.
- **Number of cards:** **38 tiles**. The **winner is tile index 3**, three from the end. The start position is index 35, so about **32 cards pass the marker**.
- **Where it stops:** a random point **10–90% across the winning card** (`xOffsetSlackPercent`). The marker can land near either edge, so a stop often looks like it "nearly" landed on the neighbour. This is natural variation, not a targeted near-miss.
- **Outcome is decided first:** the server decides the item. When the `crate_unlock` notification arrives, the client swaps the real item into the winner tile. The reel is presentation only. If no item arrives by reveal time, an "item not given" error appears.
- **Filler cards** are drawn at random from the case's own item list, weighted by rarity. The display weights are `[150000, 30000, 6000, 1250, 250, 50, 10]`, which are **5:1 steps**. In a weapon case that makes the filler mix about 80.6 / 16.1 / 3.2 / 0.6%, roughly matching the real odds.
- **The gold ★ card is excluded from the filler list.** The yellow "★ Rare Special Item ★" card (generic image, wash colour `#ffd700`) appears in the reel **only when you actually won it**. CS2 therefore never shows a fake "the knife went right past" moment. This contradicts a common community belief that the knife is "always one tick away" (csdb.gg).

### Centre marker and look [verified]
- **Marker:** a **4 px × 268 px vertical bar** in the UI "warning" colour `#b1af2d` (olive-yellow).
- **Two stacked strips** create a lens effect:
  - A full-width background strip: cards 320 px wide, brightness 0.5, Gaussian blur.
  - A sharp "magnified" strip: cards 360 px wide, full brightness. It is visible only through a central mask window.
- **Each card** has a 12 px rarity colour bar along the bottom and a rarity-tinted gradient covering the bottom 40%. Cards have 10 px side margins.

### Tick sound [verified]
- The `container_weapon_ticker` sound plays on a **fixed, pre-baked schedule of 42 ticks**. Ticks are **not** triggered by actual card crossings.
  - **0–1.375 s:** every 62.5 ms (16 per second).
  - **After that:** the gaps grow, landing at 1.62, 1.70, 1.79, 1.87, 2.00, 2.15, 2.31, 2.47, 2.62, 2.77, 2.94, 3.10, 3.34, 3.63, 3.95, 4.39 and **5.00 s**.
- **The audio sells a slower slow-down than the picture shows.** Early on, cards actually cross faster than 16 per second. Late on, ticks continue after the reel has nearly stopped. The tick rate is effectively capped at 16 per second, which avoids a noisy buzz.
- One value in the table is out of order (1.351 after 1.483), apparently a typo in Valve's code.

### Pause and reveal [verified]
- There is **no separate hold timer**. The reveal fires at 6.0 s, when the transition ends. Because the curve is nearly flat after about 4.5 s, the card sits almost still for about **1–1.5 s** before the reveal. *[estimate, from the curve]*
- **On reveal**, the popup closes and the item opens in the full **inspect view** (3D model). The item is marked "recent".
- **A per-rarity reveal sound** plays: `ItemRevealRarityCommon`, `…Uncommon`, `…Rare`, `…Mythical`, `…Legendary`, `…Ancient`. The sounds escalate by tier.
- In the case contents list, the gold slot also gets a looping gold video background (`acknowledge540p.webm`).
- **Single-item containers** skip the reel. They show a 5-4-3-2-1 countdown with a 1 s radial timer and a `container_countdown` tick instead.

### For comparison: a web clone
- The open-source "cajas" clone uses **110 items, winner at index 75, and an 8 s** cubic-bezier transition. Hobby clones tend to run longer and use more cards than Valve does.

---

## 2. Rarity tiers, colours, odds

### Colours [verified, `csgostyles.css` in CS2]

| Tier (internal name) | Hex |
|---|---|
| Consumer Grade (common) | `#b0c3d9` (grey-blue) |
| Industrial Grade (uncommon) | `#5e98d9` (light blue) |
| Mil-Spec (rare) | `#4b69ff` (blue) |
| Restricted (mythical) | `#8847ff` (purple) |
| Classified (legendary) | `#d32ce6` (pink/magenta) |
| Covert (ancient) | `#eb4b4b` (red) |
| Contraband (immortal) | `#e4ae39` |
| StatTrak (strange) | `#CF6A32` (orange) |
| ★ Exceedingly Rare (unusual) | `#ffd700` (gold) |

### Odds
- **Official case odds:** Mil-Spec **79.92%**, Restricted **15.98%**, Classified **3.20%**, Covert **0.64%**, ★ knife/gloves **0.26%** (about 1 in 385).
  - Valve published these in 2017 because of China's odds-disclosure rule. We found them only in secondary sources that agree with each other, not in Valve's original notice.
- **StatTrak:** 10% chance on any drop (secondary sources).
- **The 1:5 ladder:** each step from blue to red is exactly 1:5 (79.92 / 15.98 / 3.2 / 0.64). Gold breaks the pattern at about 1:2.5 of red.
  - The game's `items_game.txt` uses the same 5:1 pattern in its rarity weights: 10,000,000 / 2,000,000 / 400,000 / 80,000 [verified].
  - So does the reel's filler weighting [verified].
- **No pity timer:** every open is independent.

---

## 3. Near-misses

- **Reid (1986)** defines a near-miss as a failure that comes close to success. He notes that some slot machines and instant lotteries are *built* to show more near-misses than chance would produce. Reid's own experiments did not reliably reproduce the effect.
- **Clark et al. (2009, *Neuron*):**
  - Near-misses felt *less pleasant* than full misses but *increased the desire to play*.
  - They activated win-related areas (ventral striatum, anterior insula).
  - The effect appeared only when the player had some personal control.
- **Habib & Dixon (2010):** in pathological gamblers, near-misses activated brain areas that respond to wins. In non-pathological gamblers they activated areas that respond to losses. The sample was small (22 people) and later studies are mixed.
- **Dixon et al. (2012)**, reported in the Habib & Dixon summary: jackpot symbols on the first two reels produced larger skin-conductance responses than other losses.
- **Does CS2 show near-misses?** Only *random* ones:
  - The random 10–90% stop can land next to a neighbouring card, and filler can include red cards at their real rate. A red appears somewhere in about 21% of reels; next to the winner in about 1.3% *[our calculation from the weights]*.
  - The jackpot (gold) never appears as filler, so there is no engineered "almost a knife".
- **Ethics:** a near-miss that occurs at the true odds is honest. A *fake* near-miss, where the jackpot is placed next to the marker more often than chance, is the deceptive slot-machine practice Reid describes. It exploits the Clark effect: no reward, but a stronger urge to try again. **We should never do this.**

---

## 4. Anticipation, dopamine, sound and juice

- **Reward prediction error (Schultz, Dayan & Montague 1997):** dopamine neurons signal the gap between the reward you expected and the reward you got. Surprises drive learning.
- **Uncertainty (Fiorillo, Tobler & Schultz 2003):** dopamine also rises *gradually during the wait* before an uncertain reward. That rise is largest when the odds are near 50/50.
  - So the spin itself carries real value, which is the case for the long ease-out tail.
  - It also means the wait is where the hook lives, which is why we keep an opt-out (skip / fast-open).
- **Variable-ratio reinforcement:** rewards after an unpredictable number of actions produce the most persistent behaviour (Hopson 2001, "Behavioral Game Design"). Drummond & Sauer (2018) tie loot boxes to this schedule directly.
- **Sound:**
  - **Losses disguised as wins (Dixon et al. 2010):** slot spins that paid back *less* than the bet, but came with win sounds and lights, produced skin-conductance responses like real wins.
  - A 2013 follow-up found responses were significantly larger with sound than without.
  - Lesson: celebration sounds should match the real value of the result. Grey should sound modest. Do not play a fanfare for a common item.
- **Escalation:** CS2 uses a slowing tick plus a distinct reveal sound per tier. Rising pitch or extra layers per tier, as the reel slows, build the same tension honestly.
- **Visual juice:** "Juice it or lose it" (Jonasson & Purho, 2012) shows how tweening, particles, screen shake, flashes and sound make interactions feel alive. Colour coding by rarity is now a shared language across Fortnite, Apex, CS and Rocket League.

---

## 5. Collection and showcase psychology

- **Endowment effect:** people value what they own more. This has been shown with virtual goods, and lab work found the effect *larger* in games than in lotteries.
  - Let players equip an item on the spot, so it is "theirs" immediately.
- **Completion drive / Zeigarnik:** unfinished sets stay on our minds. An 11-of-12 set motivates more than 0-of-12.
  - Show per-slot and per-tier progress bars.
  - Caveat: Zeigarnik replicates unevenly, so treat it as a design rule of thumb.
- **Set collection:** group items into themed sets (for example a "Night Park" set covering jacket, pants and helmet). Completing a set can unlock a title or badge.
- **Showing off:** CS2 sends every unboxed item straight to the 3D inspect view. Let players inspect their own rider in the lobby, and show the rider's equipped gear to other players in multiplayer.
- **Rarity signalling:** the rarity colour should be visible on the item in the world, for example a subtle trim, glow or particle trail for red and gold. Rarity only signals status if others can see it.
- **Duplicates:**
  - Apex guarantees no duplicate cosmetics (EA).
  - Fortnite's X-Ray Llamas pick items the player does not already own.
  - Rocket League converted old crates into blueprints.
  - Our choice: duplicates turn into case progress, so a duplicate never feels like nothing.

---

## 6. How other games handle reward loops

- **Fortnite**
  - Rarity colours: grey (common), green (uncommon), blue (rare), purple (epic), orange (legendary), gold (mythic).
  - Save the World Llama piñatas are smashed open to reveal cards.
  - In January 2019 (v7.30) Epic made paid llamas **"X-Ray Llamas" that show their contents before purchase**. Earned mini/event llamas stayed opaque.
  - The battle pass is a fixed, earned track. Every reward is known in advance.
- **Rocket League**
  - Crate odds (2018 Psyonix): Rare 55%, Very Rare 28%, Import 12%, Exotic 4%, Black Market 1%.
  - In December 2019 crates were replaced by **blueprints**: post-match drops that show the item up front and cost Credits to build.
  - Free post-game drops remained tradeable.
  - We did not find a description of the drop reveal animation.
- **Apex Legends**
  - **Bad-luck protection:** at least one Legendary every 30 packs. This appears in EA's FAQ as quoted on EA's forum; we did not read the FAQ directly.
  - **Heirloom shards** are guaranteed within **500 packs**. Their per-pack chance is **0.045%** (EA's global drop-rate page) [verified].
  - No duplicates.
- **Valorant**
  - No random paid boxes: skins are bought directly, and the battle pass/contracts are fixed tracks.
  - The **Night Market** is a "flip six face-down cards" reveal. Each card shows a skin at a random 10–49% discount, with no rerolls. The reveal has the drama of a loot box, but you see exactly what you are buying.
- **Pity timers in general:** they cap the worst-case streak (Apex: 30 packs and 500 packs). If we add one, we must disclose it next to the odds.

---

## 7. Ethics and regulation

- **Belgium (April 2018):** the Gaming Commission found paid boxes in FIFA 18, Overwatch and CS:GO to be illegal gambling. The penalty is up to 5 years in prison and €800,000. Valve and Blizzard removed paid boxes in Belgium.
- **Netherlands:**
  - In 2018 the Gaming Authority (KSA) objected to boxes whose items could be traded for money.
  - It fined EA €250,000 per week from October 2019.
  - In **March 2022** the Council of State overturned this: FIFA packs were not a standalone game of chance, mostly because most packs are earned through play.
- **China:** the Ministry of Culture notice of 1 December 2016, effective **1 May 2017**:
  - Games must publish the names and draw probabilities of all random items, and those figures must be "true and effective".
  - Draw results must be kept for 90 days.
  - Virtual items may not be exchanged for real currency.
- **Apple** (Guideline 3.1.1, December 2017) and **Google Play** (May 2019): randomised items sold for money must show their odds **before purchase**.
- **Labels:**
  - **PEGI** adds an **"Includes Paid Random Items"** notice (2020) to its In-Game Purchases descriptor. It applies only when real money, or currency bought with real money, is involved.
  - The wording "In-Game Purchases (Includes Random Items)" is the **ESRB** label (April 2020), not PEGI's.
- **Research:**
  - **Zendle & Cairns (2018, *PLOS ONE*):** among 7,422 gamers, the more they spent on loot boxes, the more severe their problem gambling (η² = 0.054, small-to-moderate). The 2019 replication found the same link.
  - These are cross-sectional studies, so they do not prove cause.
  - **Drummond & Sauer (2018):** 10 of 22 games with loot boxes met all psychological criteria for gambling.

### Why our system avoids the harmful parts
- **No stake:** cases cost no money and no currency bought with money, and cannot be bought. That removes the "exchange of money or valuables" that the gambling tests require (Belgium; Drummond & Sauer).
- **No cash-out and no trading:** items have no market value, which was the Dutch regulator's line.
- **Odds shown up front:** meets the China, Apple and Google standard voluntarily.
- **No spending:** the Zendle & Cairns link is specifically with *spending*. We have no spending to link.
- **Outside the label rules:** with no paid random items, the PEGI notice does not apply.

### Safeguards to keep
1. **Odds table on the case screen, before the Open button,** with exact percentages. Disclose any pity rule there too.
2. **No paid acceleration:** no buying cases, keys, boosts or rerolls, ever.
3. **Skip / fast-open:**
   - A tap skips the reel after about 1 s.
   - A "fast open" setting (about 1.5 s reel).
   - "Open all" shows a results grid.
   - The reel respects `prefers-reduced-motion`.
4. **Honest reel:**
   - Filler drawn at real odds; gold never used as filler (as CS2 does).
   - No engineered near-misses.
   - No "so close!" or "almost!" messaging.
   - The random landing point within the winning card is the only "almost" effect.
5. **Celebration that matches the result:** grey gets a soft chime, never a fanfare (losses disguised as wins).
6. **No time-limited FOMO pressure** on unopened cases (no expiry), and no streak loss for missing a day.
7. **No trading, gifting or market,** so items can never take on real-money value.

---

## 8. What we implement

> **As built** (details and the numbers that ship: [rewards.md](rewards.md)). We follow the research on
> the reel (6.0 s on CS2's `cubic-bezier(0.075, 0.82, 0.165, 1)` after a ~2 s case open, 60 cards with
> the winner at index 50, a 10–90 % stop point, a tick per card crossing at least 55 ms apart, a 0.6 s
> hold), the six grade colours, escalating reveal sounds, particles and shake by grade, and duplicates
> as case progress. Where we deviate, on purpose:
> - **The gold ★ card and near misses are in the reel.** CS2's filler never shows gold; the brief asked
>   for a visible golden "rare special item" slot and near misses. Gold filler cards are anonymous, the
>   result is rolled before the reel is built, and the odds are shown up front.
> - **Bad-luck protection at 60 cases forces a red only**, never gold, so gold stays at 0.3 %.
> - **Duplicates:** grey 10 %, blue 15 %, purple 25 %, pink 40 %, red 70 % of a case, gold two cases.
> - **Pacing:** no lower threshold for case 1; first-run and first-km bonuses make the first case arrive
>   at about 13 minutes for a typical rider, then every ~16 minutes.
> - Sets with badges, an inspect view and multiplayer showcase are not built yet.
>
> The recommendations as researched follow.


### Reel
- **Duration:** 6.0 s scroll with CS2's curve `cubic-bezier(0.075, 0.82, 0.165, 1)`. If testers find the last 3 s too static, a softer fallback is `cubic-bezier(0.12, 0.72, 0.16, 1)`; in our tests its last card crossing lands around 4 s instead of 3.7 s.
- **Pre-roll:** about 1 s case-open animation (CS2 uses 2 s; we can be snappier).
- **Cards:**
  - **56 cards**; the reel starts on index 3 and the **winner sits at index 50**.
  - About 47 cards travel past the marker, with 5 trailing cards so the strip never runs out.
  - This is more travel than CS2's 32, so the first second is a deliberate blur.
- **Stop point:** random **10–90% across the winning card**, as in CS2.
- **Filler:** drawn from the case's item list at the real tier odds. **Gold never appears as filler.**
- **Tick:**
  - One tick each time a card edge crosses the centre marker, with a **minimum gap of 60 ms** (CS2's fastest spacing is 62.5 ms).
  - Pitch rises slightly as the reel slows; the last 3–4 ticks are louder.
- **Marker:** a thin vertical yellow line, with a sharp, brighter "lens" strip at the centre over a dimmed, blurred outer strip.
- **Hold:** **0.6 s** after the reel stops, then the reveal.

### Reveal
- **Steps:**
  1. Full-screen dim.
  2. The card scales up with a **rarity-coloured glow** and a particle burst.
  3. Particle count and screen shake grow by tier (none for grey, light for purple, strong for red and gold).
  4. The item name appears with its tier label.
  5. An **Equip now** button.
- **Sound:** a distinct reveal sound per tier, escalating:
  - grey: soft chime
  - blue: chime with a second note
  - purple: rising arpeggio
  - pink: arpeggio with a shimmer
  - red: brass hit
  - gold: choir/fanfare with a long sparkle tail
- **Gold:** the yellow ★ card is shown in the reel only when won. The reveal adds a gold video-style shimmer background.

### Odds (shown in the UI)

| Tier | Colour | Chance |
|---|---|---|
| Grey | `#b0c3d9` | 50% |
| Blue | `#4b69ff` | 30% |
| Purple | `#8847ff` | 14% |
| Pink | `#d32ce6` | 4.4% |
| Red | `#eb4b4b` | 1.3% |
| Gold ★ skis/boards | `#ffd700` | 0.3% |

- This is a CS:GO-style ladder: CS:GO uses about 1:5 steps, and we add a grey base tier.
- Our steps are flatter than CS:GO's (about 1:2 to 1:4), so players see purple and pink often in a browser-length session.
- Gold at 0.3% is about **1 in 333 cases**, close to CS:GO's 1 in 385. At one case per 20 minutes that is about 110 hours of play on average.
- **Optional bad-luck protection:** guarantee red-or-better within 60 cases. The natural rate is 1.6%, about 1 in 62. If we add it, disclose it.

### Duplicates
- A duplicate converts to progress toward the next case:
  - grey +10%
  - blue +15%
  - purple +25%
  - pink +50%
  - red +100% (a full case)
  - gold duplicate: +2 cases
- **Clothing slots:** jacket, pants, helmet, goggles, gloves, face mask. Prefer items not yet owned within a tier, as Fortnite's X-Ray Llamas and Apex do, only if we disclose it. Otherwise roll uniformly.

### Pacing
- **Case progress** comes from finishing runs plus distance ridden.
- **First case:** tune so a new player earns it in **10–15 minutes**, using a lower threshold for case 1.
- **After that:** a case every **15–25 minutes**.
- **Milestone bonuses** (one-off bonus cases): first run of the day, 10 / 50 / 100 runs finished, distance milestones such as 10 / 50 / 100 km, first finish on each map.
- **No expiry and no daily-streak penalties.**

### Collection
- **Collection percentage:** overall, per slot, and per tier (for example "Jackets 7 / 18", "Gold 0 / 6").
- **Sets** with a cosmetic badge on completion.
- **Inspect view** of the rider in the lobby; equipped gear visible to others in multiplayer.

---

## Sources

**CS2 game files (primary)**
- CS2 client UI script: https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/panorama/scripts/popups/popup_capability_decodable.js
- CS2 reel styles (6 s, cubic-bezier, marker): https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/panorama/styles/popups/popup_capability_decodable.css
- CS2 reel layout: https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/panorama/layout/popups/popup_capability_decodable.xml
- CS2 rarity colours: https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/panorama/styles/csgostyles.css
- CS2 rarity weights and drop sounds: https://github.com/SteamTracking/GameTracking-CS2/blob/master/game/csgo/pak01_dir/scripts/items/items_game.txt

**CS:GO odds, clones and community views**
- CS2 case odds (Esports.net): https://www.esports.net/wiki/guides/counter-strike-case-odds
- Steam community odds post: https://steamcommunity.com/app/730/discussions/0/1474222595307264893
- Community views on predetermined results: https://steamcommunity.com/app/730/discussions/0/364042262889179791 and https://csdb.gg/are-cs2-csgo-cases-predetermined
- "cajas" clone: https://www.mintlify.com/Shermie80/cajas/features/case-opening

**Near-miss, dopamine and sound research**
- Reid 1986: https://link.springer.com/article/10.1007/BF01019932
- Clark et al. 2009: https://pmc.ncbi.nlm.nih.gov/articles/PMC2658737/
- Habib & Dixon 2010: https://pmc.ncbi.nlm.nih.gov/articles/PMC2861872
- Dixon et al. 2010, losses disguised as wins: https://uwaterloo.ca/reasoning-decision-making-lab/sites/default/files/uploads/files/DixFugetal_10c.pdf
- Dixon sound study 2013: https://sciencedaily.com/releases/2013/07/130702100348.htm
- Schultz, Dayan & Montague 1997: https://www.gatsby.ucl.ac.uk/~dayan/papers/sdm97.html
- Fiorillo, Tobler & Schultz 2003: https://pubmed.ncbi.nlm.nih.gov/12649484/
- Hopson 2001: https://www.gamedeveloper.com/design/behavioral-game-design

**Collection and game feel**
- Juice talk summary: https://roblog.co.uk/2024/03/juicy-games/
- Endowment effect in games: https://ideas.repec.org/a/eee/eecrev/v94y2017icp240-262.html
- Collection sets and Zeigarnik: https://yukaichou.com/advanced-gamification/game-design-technique-collection-sets/ and https://psychologyofgames.com/2013/03/the-zeigarnik-effect-and-quest-logs

**Other games**
- Fortnite rarity: https://fortnite-archive.fandom.com/wiki/Rarity
- Fortnite X-Ray Llamas: https://www.fortnite.com/news/loot-unboxing and https://www.pcgamer.com/au/fortnite-save-the-worlds-loot-boxes-will-let-you-see-whats-inside-them-before-you-buy
- Rocket League blueprints: https://www.pcgamesn.com/rocket-league/blueprints
- Rocket League crate odds: https://gonintendo.com/stories/314238-rocket-league-blog-update-drop-rates-explained
- Apex drop rates: https://www.ea.com/games/apex-legends/news/global-drop-rates
- Apex pity (forum quote of EA FAQ): https://forums.ea.com/discussions/apex-legends-general-discussion-en/i-need-clarification-on-which-types-of-apex-packs-account-towards-the-heriloom/5351327/replies/5351334
- Apex pack odds: https://esports.gg/guides/apex-legends/apex-packs-explained
- Valorant Night Market: https://wecoach.gg/blog/article/everything-you-need-to-know-about-the-valorant-night-market

**Regulation**
- Belgium 2018: https://pcgamer.com/belgiums-gambling-commission-rules-against-loot-boxes-in-overwatch-fifa-18-and-csgo/
- Netherlands 2022: https://igamingbusiness.com/dutch-court-loot-boxes-not-gambling/ and https://sbcnews.co.uk/europe/uk/2022/03/10/ea-wins-long-standing-loot-box-drama-against-dutch-ksa/
- China 2016 notice: https://www.chinalawtranslate.com/ministry-of-culture-notice-regarding-strengthening-regulation-online-gaming-operations/
- Apple 2017: https://toucharcade.com/2017/12/21/apple-quietly-updated-the-app-store-review-guidelines-to-require-disclosure-of-loot-box-iap-odds/
- Google Play 2019: https://www.fenwick.com/insights/publications/google-play-now-requires-disclosure-of-loot-box-odds
- PEGI and ESRB 2020: https://pegi.info/bg/node/67 and https://reedsmith.com/en/perspectives/2020/04/esrb-and-pegi-introduce-loot-box-warnings

**Loot box research**
- Zendle & Cairns 2018: https://eprints.whiterose.ac.uk/139116/1/journal.pone.0206767.pdf
- Coverage of follow-ups: https://www.psypost.org/two-large-studies-have-found-a-link-between-loot-box-spending-and-problem-gambling/
- Drummond & Sauer 2018: https://www.massey.ac.nz/about/news/videogame-loot-boxes-similar-to-gambling/
