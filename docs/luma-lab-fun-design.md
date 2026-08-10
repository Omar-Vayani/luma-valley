# Luma Lab — Fun Design Document
### Making an artificial-life web game (Three.js, mobile landscape) genuinely fun
*Based on research into Creatures (1996), The Sims, Spore, Black & White, Tamagotchi, Viva Piñata, Petz, Slime Rancher, Animal Crossing, and sandbox-economy design.*

---

## 0. The one-paragraph thesis

Luma Lab should be **Creatures' caretaker bond + Tamagotchi's care urgency + Slime Rancher's visible market + Spore's creator/legacy loop**, wrapped in a GUI that hides depth behind one tap. The player is a **caretaker, not a ruler**: creatures can refuse commands, and that refusal is the game's charm. Fun comes from four loops, in order of importance: **(1) the care loop** (needs → pet/feed → visible happiness → productivity), **(2) the discovery loop** (new words, new behaviors, rare moods, mutations), **(3) the economy loop** (produce → sell at fluctuating prices → upgrade → produce more), **(4) the legacy loop** (breed generations, inherit genes, fill the journal). Every screen must answer "what happened while I was away, and what should I do next?" in under 3 seconds.

---

## 1. Design principles (the "why it was compelling" findings, operationalized)

1. **Player as caretaker, not ruler.** Creatures' defining charm: you *cannot* force a Norn to do anything — you suggest, and it may ignore you. "The player gets the impression that the norns understand the player, but do not want to follow the player's commands." → Commands are *requests*. Non-compliance (with a cute shrug animation) is a feature, not a bug. It creates stories ("Biscuit refused to eat the pear again").
2. **Emergence beats scripted content.** Creatures' behavior emerged from biochemistry + neural nets; players swapped stories about unexpected evolution. → Build small interacting systems (needs × emotions × memory × language) and *let combinations surprise you*. Ship a lightweight behavior logger so you can see emergent moments and turn the best ones into notifications/milestones.
3. **Death must matter.** Tamagotchi attachment came from real consequences; Creatures' "death has real consequences — individuals do not return." → No respawns. Death is permanent; the *lineage* continues through eggs. (Grief → memorial tombstone → "next generation" is a full emotional arc.)
4. **Visible feedback for invisible systems.** B&W taught creatures with stroke/slap and made the learning visibly change the creature; Sims uses the plumbob and mood colors. → Every internal stat needs a visible proxy: mood ring, bounce speed, produce sparkle, speech bubble, thought icon. Never make the player *read* a number when an animation can say it.
5. **Depth behind a shallow surface.** Creatures' monitoring kits were "terrifying" (Brooker); B&W's design goal was *zero* icons/buttons (gesture-driven). → The HUD shows 3 verbs. Everything else lives behind tap-to-inspect. Players discover depth; they don't get it dumped on them.
6. **Give the player a toy, not a treadmill.** The Sims was described as "more like a toy than a game" — no fixed win condition. Creatures got boring once the population stabilized ("virtual fish tank"). → The sandbox is the product; the economy and events exist to keep generating *new work with meaning* so the tank never goes static.

---

## 2. (a) TOP 10 MECHANICS TO STEAL FROM CREATURES (1996)

**#1 — Drives as reward/punishment learning (the core AI loop).**
Norns' decision-making: internal drives (hunger, tiredness, boredom…) produce *punishment* when high, *reward* when lowered; the brain learns which actions reduce drives. → Luma brain: each need is a drive; every action that reduces a drive fires an internal "reward" signal that strengthens the creature-behavior link. *This is what makes creatures feel alive instead of scripted.* Implement as: `behavior weight += reward × learningRate` where `reward = ΔneedRelief × happinessMultiplier`.

**#2 — Teach words by pointing + repetition.**
C1: repeat the object's name while the creature looks at it; verbs via a "learning computer"; once it understands, you can type instructions it may choose to obey. → In Luma Lab: select a word chip in the speech panel, tap an object the creature is looking at → the creature learns the word-object association (strengthened per repetition). Verbs (roll, dance, fetch) are taught by *demonstrating*: drag the creature through an action while the verb chip is active. Learning formula: `assoc += 0.25 × attention × (0.6 + 0.8·happiness)`; word "known" at assoc ≥ 3.
**Why it's fun:** teaching is the deepest satisfaction in the genre — the creature does something *because you taught it*, and that feels like a real accomplishment.

**#3 — The disembodied hand.** One cursor = the player's body in-world: pick up creatures, tickle (reward), slap (punish), hand objects. → Luma Lab: long-press = grab ("hand"); drag onto creature = pick up/carry; drag onto object = give. All interaction verbs come from this one gesture family. On touch, the **rubber-band gesture** (from cancelled Creatures Online — draw a line from creature to object, release → contextual action list) is the ideal mobile adaptation.

**#4 — Speech bubbles + gibberish that becomes language.** Norns babble, then real words. → Creatures emit colored "luma-lingo" blobs (visual glyphs per word type: food=fruit glyph, object=box glyph) that *gradually resolve into taught words*. The player hears/reads the creature's growing vocabulary. Thought bubbles show icons of remembered things (a peach, a place, another Luma).

**#5 — Life stages with distinct needs.** Childhood → adolescence → adulthood → senescence, each with its own needs (C1; Tamagotchi does the same with appearance changes + jingle). → Babies need feeding/sleep only; children need play and learn fastest; adults can breed and work (produce goods); elders slow down, teach young faster, and eventually die. Stage transition = animation + jingle + toast. Lifespan for a web game: **~4–6 hours of active play** (compressed from Creatures' 40h) so players see a full life in a few sessions.

**#6 — Reproduction + haploid genetics with mutations.** C1: every copy shipped unique genomes; mutations produced real surprises (blind norns, immortal norns). → P2: each Luma has ~12 visible/invisible genes (color, pattern, speed, metabolism, learning rate, lifespan, mood-bias); offspring = crossover + 1–2% mutation per gene. Breeding: two adults with high relationship + "love" → egg → baby. **Legibility rule:** every mutated trait must be *visible* (color/pattern change) so players can selectively breed like they did in Creatures ("breeding norns for pleasure and profit").

**#7 — Permanent death + memorials.** No reload of a dead Norn; C1 let you photograph and record the deceased via kits. → Tombstone appears at death site with the creature's name, age, and "words known". Journal keeps the full obituary. This is what makes generation 3 meaningful.

**#8 — Species contrast (Grendels/Ettins).** Grendels attack, Ettins are hardy — different species make the world tense and give Norns something to react to. → Optional ambient species: "grumbles" (grumpy, steal food, scare Lumae — teaches fear), "wisps" (shy, appear at night, curious). Not mandatory content — they exist to generate *events the player didn't script*.

**#9 — The launcher / agent injection.** Players actively administered worlds by injecting objects (COBs) to help creatures thrive. → Player can *place objects into the world* (toys, food plants, deco) — the world is the inventory. This doubles as the discovery loop: every new object is a new word to teach, a new "what's this?" moment.

**#10 — Alternate play styles.** Wolfling runs (no intervention), selective breeding, even "norn torture" — the community invented these. → Ship a **Wolfling Mode toggle** (watch-only, no interaction, with an auto-observer that logs events) and let dark play exist quietly. A sandbox needs room for the player's own rules. This costs almost nothing and generates enormous emergent narrative.

*Honorable mentions:* naming + photographing (bonding), "loved up" mating dance (long kiss + pop), older norns teaching younger ones (generational culture!), the angel/devil glyph showing whether you're about to reward or punish (C2's UX clarity for teaching).

---

## 3. (b) TOP 10 FROM OTHER LIFE SIMS

**#1 — Tamagotchi: the attention call (the retention hook).** A pet calls for attention with a distinct sound/icon; ignore it too long → consequences. → Lumae emit a soft chirp + "!" when a need is critical *or* when something interesting happens nearby. This is the "one more check" engine. **Throttle it:** max 1 attention call per creature per 10 min, or it becomes Tamagotchi's classroom-disruption problem.

**#2 — Tamagotchi: care-dependent evolution.** Outcome depends on how you cared (better care → smarter, happier, less needy adult). → The adult form/behavior profile (fast learner vs. hardy vs. playful) is determined by childhood care quality. Players *earn* their creature's personality through play. Visible at maturity: "Sprout grew up Curious (+learning)" toast.

**#3 — Tamagotchi: training/obedience meter + scold vs. praise.** → Two social verbs: **praise** (pet/tickle) and **scold** (gentle bump + frown). Scolding for bad behavior (stealing food) raises a "manners" stat; praise for good behavior. Gives the player a tool with visible results (B&W's stroke/slap lesson).

**#4 — The Sims: needs as a time-management puzzle.** Sims have 6+ parallel needs with different decay rates; managing them is the actual gameplay. → Luma needs: **Hunger, Energy, Social, Fun, Clean** (5 max — more is overwhelm for a casual web game). Decay rates: Hunger 2h full→empty, Energy 3h, Social 4h, Fun 5h, Clean 6h. The *differential decay* creates planning decisions (feed now or sleep now?).

**#5 — The Sims: wants/fears + moodlets (goal injection).** TS2/TS3 added per-Sim wants ("eat pizza", "see a friend") with rewards, and moodlets (small timed buffs/debuffs). → Each Luma has **1 current Want** (shown as an icon above its head — "wants to play with the wheel!") and completing it grants a happiness spike + a small XP "bond point". Generated from the creature's own memory/emotion state (not random!). Moodlets → timed states like "Inspired" (+produce) or "Gloomy" (−produce) with visible aura.

**#6 — Spore: creator tools as content.** The Creature Editor + Sporepedia made *making* the game. → P1: a **Luma Pattern Painter** (recolor/repattern your Lumae — cosmetics) and shareable **Egg Codes** (a string encoding a genome; import/export). Community content is the cheapest content.

**#7 — Spore: consequence traits / staged progression.** Each stage's play style carries forward (herbivore/carnivore choices persist). → A Luma's childhood experiences set its adult "temperament" (see #2), and the *species* has a lineage that accumulates traits across generations. Progress = the journal + genetics screen filling up.

**#8 — Black & White: reinforcement learning with unmistakable feedback.** Stroke = approve, slap = disapprove; the creature's whole appearance shifts good/evil. → Petting (praise) and scold-bump must produce *immediate, visible* change: happy bounce, sparkle, color shift of the mood ring. The player should always know "it worked."

**#9 — Slime Rancher: the visible market.** Plort prices fluctuate daily; dumping supply crashes prices; trend arrows + sparklines make the market legible and *fun to watch*. → Luma market: daily price per good with ▲▼ trend + 7-day sparkline, a **"market will absorb N more at fair price"** quota meter, and the satisfaction of selling at a peak. (Full formulas in §5.)

**#10 — Viva Piñata: attract → evolve → sell (the collection economy).** Wild piñatas appear only when you meet habitat requirements; then you romance, evolve, and sell them for coins to buy better stuff. → Wild Lumae wander in when the habitat has specific plants/toys/ambience ("a Luma is curious about your berry patch…"). Tame it (feed + play), then it joins your colony, or sell it to the "collector" for a price that depends on rarity. **Sours** → special "grumpy variant" Lumae that need taming through kindness — a mini-narrative each time.

*Also worth stealing:* **Petz** (item gifting deepens bond — gifting the right *toy type* raises bond faster than generic petting); **Animal Crossing** (a single NPC shopkeeper with personality + interest-free house loans; the museum/collection as a content sink; real-time-ish daily rhythm); **The Sims build/buy** (paused editing mode = zero pressure creation — great for a web game's menu state).

---

## 4. (c) ECONOMY LOOP — design for a small world

### 4.1 The loop (player-facing)
```
Lumae produce goods (rate × happiness) → you collect → sell at market (price fluctuates daily)
→ buy food/toys/upgrades → food & toys maintain happiness → happier Lumae produce faster
                                                          ↘  spend surplus on sinks (upgrades, museum, cosmetics)
```

### 4.2 Goods
Each adult Luma has a **specialty** (visible as its aura color) and produces one good:
| Specialty | Good | Base price B | Notes |
|---|---|---|---|
| Spark | Spark-dust | 10 | common |
| Song | Melody shards | 14 | common |
| Dream | Dream-gems | 25 | uncommon |
| Bloom | Pollen-gold | 20 | uncommon |
| Star | Star-tears | 60 | rare; only when happiness > 0.9 AND creature saw something new today (see 4.5) |

Production rate: `goods/hour = baseRate × (0.5 + 0.75·happiness)` with `baseRate = 3` per adult. *(A miserable Luma produces at half rate; a delighted one at 1.25× — the happiness↔economy positive feedback loop made tangible.)*

### 4.3 Market price dynamics (implement this — it's the fun part)
Each in-game day (recommend **1 day = 15 real minutes**, so a 30-min session sees 2 market ticks), for each good `i`:
```
p_i(t+1) = clamp( p_i(t) · (1 + σ·ε + μ·(B_i − p_i(t))/B_i − γ·max(0, S_i − Q_i)/Q_i),  0.4·B_i,  3.0·B_i )
```
where:
- `σ = 0.12` daily volatility (random walk), `ε ~ N(0,1)`
- `μ = 0.30` mean-reversion toward base price (prices can't stay crazy long)
- `S_i` = units sold yesterday; `Q_i` = **daily quota** (fair-price demand): `Q_i = 8` common, `5` uncommon, `2` rare
- `γ = 0.5` — overselling past quota crashes price up to 60% below base. **Dumping = your own fault, visibly.**

Simpler P1 version (Slime Rancher-lite, 7-day memory):
```
p_i = B_i · clamp( 1.6 − 0.3·ln(1 + avgDailySales_i / Q_i),  0.5,  2.5 )
```
*Both are fine; ship the simple one first, upgrade later. The point is: prices move, trends are visible, and the player develops "sell at the peak" intuition.*

**Market UI feedback (non-negotiable):** trend arrows (▲/▼/—), 7-day sparkline, quota meter ("Demand: 8 at fair price — beyond that, prices drop"), and a one-line tip when price > 1.8×B ("Star-tears are hot today! 🔥").

### 4.4 Sinks (must exist, or inflation kills the loop)
1. **Shop goods** (food, toys, seeds) — base costs 5–40, always purchasable. Prices *also* fluctuate slightly (±20%) to reward planning.
2. **Upgrades** (the real sink): Market stall (sell +2 goods/day), Storage silo (50→100→200), Incubator (hatch 2 eggs at once), Play gym (fun decays 30% slower), Breeding grounds (P2). Each 150–800.
3. **Housing/rent**: a light weekly "lab maintenance" cost (50) — gentle, skippable, gives the economy a heartbeat.
4. **Museum donation**: pay-to-preserve rare produce/first-of-species — collection content sink (Animal Crossing lesson).
5. **Cosmetics**: pattern paints, hats for Lumae (Spore lesson) — pure vanity, cheapest to make, always desirable.

### 4.5 Scarcity & event goods (the excitement valve)
- **Star-tears** require happiness > 0.9 *and* a novelty event (creature saw/learned something new that day) — scarcity by construction, not by fiat.
- **Market days:** randomly 1 good gets "+50% today" (shown at dawn) → player re-plans ("should I hold dream-gems till Thursday?").
- **Traveling collector** (Viva Piñata-ish): every 2–3 days an NPC wants *one specific creature or rare good* at 2× price. A goal, not a grind.

### 4.6 Creature-side mini-economy (P2, optional)
Lumae occasionally find trinkets and *trade them with each other* (gift → relationship up; the receiving creature may offer something in return). This is pure emergent theater for the observation loop — no currency, just barter + memory ("Biscuit gave Tumble a shard; Tumble remembers"). Cost: one behavior + one memory entry. High payoff for the "joy of watching."

### 4.7 Capacity rules (concrete)
- Storage silo: 50 units start, +50 per upgrade (max 200). Overflow produce sits on the ground and *decays* (visible rot → urgency without punishment-spam).
- Market absorbs: `Q_i` per good per day at fair price (see 4.3). Sell-All is a trap; teach that early with a tooltip.
- Player wallet cap: none. Creature carry: 1 (see §7).

---

## 5. (d) GUI LAYOUT — mobile landscape (target ≈ 844×390 logical px, safe areas)

**Philosophy:** 3 verbs always visible, everything else one tap away (B&W's "no icons" + Creatures Online's rubber-band, modernized).

```
┌──────────────────────────────────────────────────────────────┐
│ [💰 1,240] [Day 3 ☀️]      Luma Lab          [🏪][🎒][📖][⚙️] │  ← top bar 44px
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                    3D VIEWPORT (full-bleed)                  │
│              speech bubble 💬  "peach!"                       │
│                    ●(mood ring)  ●(want icon)                │
│                                                              │
│                                                              │
│  [👤 Sprout ●] [👤 Tumble ●] [＋ add]                          │  ← creature chips 64px
├──────────────────────────────────────────────────────────────┤
│ [🍎 Feed] [🤗 Pet] [💬 Talk] [✋ Pick up]  ·  [○○○ more ▸]     │  ← action wheel 56px
└──────────────────────────────────────────────────────────────┘
```

**Zones & rules:**
1. **Top bar (44px):** wallet + day/weather left; menu buttons right. No more than 4 menu buttons — collapse into a `⋮`.
2. **Bottom-left — creature chips:** horizontal scroll; each chip = face avatar + name + the single most-pressed need icon (colored). Tap chip → camera focuses + right-panel inspector slides in. This is the Tamagotchi "check on everyone" surface.
3. **Bottom-right — contextual action wheel:** appears when a creature is selected; exactly **5 verbs: Feed, Pet (praise), Talk (teach), Pick up, Give item**. `more ▸` reveals situational verbs (Scold, Tickle, Put down, Dance-with). **Rubber-band gesture:** drag from creature to an object → radial menu of contextual verbs ("Eat", "Play", "Give to…", "Teach word") appears at finger — this is the primary advanced interaction; teach it in the first tutorial.
4. **In-world indicators (the heart of readability):**
   - **Mood ring** around each Luma: color = valence (green happy / blue sad / red angry / purple scared / yellow excited), thickness/pulse = arousal. Color + motion, never color alone (accessibility).
   - **Want icon** floating above: current Sims-style Want (🎡 wants to play).
   - **Speech bubble:** last utterance, 3–6s fade, colored by emotion; gibberish = glyphs, learned words = real text.
   - **Critical-need pulse:** red rim + soft chirp (Tamagotchi attention call), max 1 per creature per 10 min.
5. **Right slide-in inspector** (tap creature or chip): 5 need bars (Hunger/Energy/Social/Fun/Clean), mood face + emotion words it knows, **learned-words tag cloud** (grows — satisfying to watch), memory thought-bubbles (recent memories as icons), 1 carry-slot, bond-to-player heart, and the Want with a "help it" button. *This panel is where the "terrifying depth" lives — players who want it, find it.*
6. **Notifications:** bottom-center toasts, **max 2 visible, collapse into "…+3 more"**, per-type throttle (same type ≤ 1 per 30s), distinct sounds per category (word-learned = pleasant chime; need-critical = soft chirp; market event = coin jingle). No modal dialogs during play except real choices (e.g., "Sell this Luma to the collector?").
7. **Market screen:** list of goods with price, ▲▼, sparkline, quota meter, Sell buttons (+1 / +10 / All) with a "projected price after sale" hint. Sorting by trend. One glance answers "what do I do today?"
8. **Input map:** one-finger drag = pan camera; pinch = zoom; tap = select/inspect; long-press = hand/grab; rubber-band = contextual verbs. **Thumb-zone friendly:** chips and actions are in the bottom corners; the top bar is for the non-dominant hand. Everything reachable without a second hand.
9. **Pause-safe:** market day tick, need decay, and production *pause when the tab is hidden* (respect the player's life — Tamagotchi's death-by-neglect is fun at 5-min check-ins, hostile at 8-hour workdays). Optionally: "away mode" where needs decay at 25% speed and a notification recap greets you on return.

---

## 6. (e) INVENTORY DESIGN

**Rule 1: the world is the inventory.** The Sims keeps objects in the world, not a bag; Creatures' world was littered with useful objects. Placed items (toys, food bowls, plants) live in the world — they're interactive, teachable, and visible. Bags are for *carrying*, not *storing*.

**Rule 2: creatures carry one thing at a time (Creatures' left/right hand).**
- **1 carry slot per Luma**, shown as a little attached bubble on its body (balls can't hold hands — a visible "held" object is the teachable moment: point at held object = teach word).
- Held items: toys (play → fun ↑), comfort objects (mood ↑), food (eaten on the spot). A creature *can* carry a produce good to the silo if trained (verb: "deliver") — P2: turns creatures into workers and gives the economy a creature-facing side.
- No weight system, no multi-slot creature inventory — one slot is a *design decision*: it forces the "give and take" social choreography (gift-giving, trading trinkets) that generates memory entries and stories.

**Rule 3: the player bag is a small slot grid with stacking.**
- **Bag: 12 slots (3×4).** Consumables (food, seeds) stack to 20; objects (toys, deco, tools) occupy 1 slot each; unique items are unique. Bag upgrades: +4 slots per level (max 24), a sink item.
- **Drag-and-drop** between bag ↔ world (place) and bag ↔ inspector (give to selected creature). Long-press item → context menu (Use / Give to Sprout / Place / Sell / Info).
- **Why slots over weight:** slots are instantly legible ("3 slots left" is a decision; "3.2/10 kg" is arithmetic). Why stacking over pure counts: stacks keep slots meaningful without a scroll-pile.

**Rule 4: separate "catalog" (blueprints) from "carried" (bag).**
- The **Catalog** = everything ever unlocked/purchasable (infinite list, the progression record — Sims buy-mode + Sporepedia). Buying from catalog spawns into bag or world.
- The **Silo** = produce storage (count-based, capacity-limited, see §4.7) with its own UI and bulk-sell.
- The **Museum** = donated first-of-species / rare goods (read-only showcase, completion bar).

**Rule 5: market interactions go straight to silo/bag — no intermediate "staging" inventory.** Fewer surfaces = fewer taps = mobile happiness. Sell from silo; buy into bag (or directly into world as placed object).

---

## 7. (f) WHAT MAKES IT FUN — loops, hooks, session design

### 7.1 The three feedback loops (with the formulas that make them feel good)
1. **The care loop (2-min loop):** pet → `happiness += 0.15` (cooldown 5s/creature; decays `0.05/10min`) → production `× (0.5 + 0.75·H)` and learning `× (0.6 + 0.8·H)` → visible sparkle at H > 0.8 → more income → better food/toys → easier to keep H high. *Petting is never wasted; it visibly compounds.*
2. **The discovery loop (5–15 min):** every new object in the world = new word to teach + a "curious" state (`novelty boost: +0.1 H` once per object). Words learned → speech becomes legible → thought bubbles show memory → teaching verbs unlocks (fetch, deliver). Milestone toasts: "🎉 Sprout learned 'peach'."
3. **The market loop (15 min / day):** produce → sell at the peak (trends make this a mini-game) → buy upgrades → capacity/rate up → bigger peaks. The market tick at dawn is a daily appointment.

### 7.2 The hooks ("one more thing…")
1. **Attention chirp** — a Luma needs you (throttled). 2-minute check-ins are the core session shape.
2. **Word milestone toasts** — small, frequent, joyful. The game's "ding".
3. **Market day event** — "+50% on dream-gems today" → one planning decision per day.
4. **Wild visitor** — "A wild Luma is sniffing your berry patch…" (tame or sell).
5. **Inspired produce** — a Luma hit happy + novelty → Star-tears appear → collector offers 2×.
6. **Breeding season** — two adults with high relationship → "Biscuit & Tumble are in love!" → egg → *what will the baby look like?* (genetics surprise = the Spore/evolution hook).
7. **Wolfling mode** — sometimes just watch; the auto-observer logs events so watching is rewarding.
8. **Daily goals** (3 small, generated): "Teach a new word", "Sell at >1.5× base", "Play with Tumble 3 times" → small currency rewards. Short-term goals + long-term (journal, genetics, museum) progression.
9. **The obituary** — when a Luma dies, the journal entry ("Sprout, 3rd gen, learned 12 words, loved wheels") makes the next egg meaningful.
10. **Egg codes** (P3) — share/import genomes → the Creatures community loop (swapping Norns was the biggest alife community ever).

### 7.3 Session shapes (design the *calendar*, not just the moment)
- **2-minute check-in:** chirps → feed/pet → collect produce → close. (Happens 4–6×/day.)
- **10-minute session:** check-in + teach one word + sell at market + one upgrade decision.
- **30-minute session:** market day planning, breeding, taming a wild visitor, journaling.
- **Long session:** genetics/selective breeding projects, museum completion, world decoration.
- On-return recap (after away mode): "While you were away: 3 words learned, 22 spark-dust produced, Tumble met a wisp." — the "what happened" answer, instantly.

### 7.4 Fun-risk guardrails (from the research, don't skip)
- **Boredom after stability** (Creatures' "virtual fish tank" review): the economy + wild visitors + breeding + events exist *precisely* to keep generating new work. If you ship needs+economy but no events, the tank goes static in week 2. Events are not garnish; they're the anti-stagnation system.
- **Notification spam** (Sims/Tamagotchi fatigue): throttle everything (§5.6). A quiet world is a trusted world.
- **Opaque teaching** (C1's typing was widely disliked): teach via gestures + one-tap word chips; always show the *result* of a teach attempt (assoc progress ring on the word chip).
- **Complexity terror** (Brooker on the monitoring kits): depth is opt-in, behind the inspector; the default screen never shows more than 5 verbs.
- **Death grief spikes**: warn before death (elder stage + "wasting" visual), make lineage the continuity, and *never* let death feel like a punishment for absence — decay pauses when hidden.

---

## 8. PRIORITIZED ROADMAP

**P0 — the fun core (ship this first, it must already be fun):**
1. Needs (5) + mood ring + speech bubbles (glyphs) + thought bubbles.
2. Care verbs: Feed, Pet, Pick up, Give. Petting→happiness→production feedback (formulas in §7.1).
3. One good per creature, market with simple price formula (§4.3 simple version), silo, 5 shop items, 2 upgrades.
4. Creature chips, action wheel, inspector panel, toast system (throttled).
5. Tamagotchi attention chirp + decay-pauses-when-hidden.

**P1 — depth (the "wow, it learns" phase):**
6. Language: word chips, teach-by-pointing, teach-by-demonstrating verbs, obedience-as-request.
7. Wants/moodlets, scold/praise, care-dependent adulthood.
8. Full market: quotas, sparklines, market days, collector NPC, event goods (Star-tears).
9. Storage upgrades, museum, catalog/blueprints split.
10. Rubber-band gesture, wild visitors (tame/sell), away-mode recap.

**P2 — legacy (the long game):**
11. Breeding, genetics + mutations (visible traits), lineage tree, egg incubation.
12. Creature barter/trade + "deliver to silo" training (creature economy).
13. Luma Pattern Painter, species encyclopedia, obituary journal.
14. Wolfling mode + auto-observer log.

**P3 — community (the Creatures community loop):**
15. Egg codes (export/import genomes), photo moments, shareable lineage cards, seasonal events.

---

## 9. One-line source notes (verified during research)
- Creatures (1996/series): drives = reward/punishment; behaviorist learning; ~40h lifespan; 4 life stages; word teaching by repetition + learning computer; commands can be refused; tickle/slap hand; permanent death; haploid genetics with mutations; unique genomes per copy; kits; C3 relationships between norns; Docking Station cross-world travel; rubber-band gesture UI (Creatures Online); "virtual fish tank" boredom critique; "obsessive and entertaining" (Next Generation).
- The Sims: toy-like open-endedness; parallel needs; buy/build modes; wants/fears (TS2), moodlets (TS3); death by neglect → urn; 20,000 simoleons start.
- Tamagotchi: hunger/happy/training meters; care-dependent adult forms; poop/sickness/potty-training; death by neglect or old age; marriage/offspring; skills→careers (later models); 3-button UI.
- Spore: stages with consequence traits; DNA points; editors as content; Sporepedia sharing.
- Black & White: stroke/slap reinforcement learning; gesture-only UI ambition; good/evil feedback through world appearance; belief-desire-intention creature model.
- Viva Piñata: attract-by-requirements → romance → evolve → sell; sours; shops as sinks.
- Petz: petting/training/item-gifting bond; breeding to new breeds.
- Slime Rancher: plort market with daily fluctuation and 7-day price memory; dumping crashes prices.
- Animal Crossing: bells; interest-free loans; museum collection sink; real-time daily rhythm.
