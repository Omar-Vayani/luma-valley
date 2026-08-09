# Luma Valley — Test Lab (V2 Rebuild)

> Authoritative design doc for the full rebuild. Replaces the observer-city game.
> Date: 2026-08-09. Stack: Vite + React 19 + TypeScript + Three.js (kept), vitest, oxlint.
> Old code remains in git history (26e474b). Save format is INCOMPATIBLE — V2 bump.

## The one-sentence vision

A mobile **test lab**: you drop little ball-creatures with eyes into a simple square
world of labeled towers, set circumstances, and *watch* what they do — fight, steal,
fall in love, form gangs, sleep, get addicted, die, have children — all readable
**visually on the creatures themselves**, never through text messages.

## Core principles (user requirements, verbatim-ish)

1. **Graphics from scratch, simple but good.** Few colors. Everything is squares/balls.
2. **Creatures = ball with eyes.** The face (eyes/brows) shows emotion/feeling at a glance.
3. **World = simple.** Towers with labels (food, bank, pharmacy, homes, tools, tavern…).
   A tower is where they interact. No complex buildings.
4. **Complex intelligence.** No 70KB save constraint — bigger is fine. Genetics,
   needs, emotions, memories, bonds, economy, stealing, gangs, territory, fighting,
   love, procreation, sleep, weapons, addiction, attachment.
5. **You see what's happening without a GUI.** Fighting is visible. Stealing is
   visible. Love is visible (hearts). Sleep is visible (Zzz). NO action messages
   ("you fed kiko2" is deleted).
6. **Interactive, not console.** The world is the feedback. Tap to inspect, spawn,
   drop food/money, poke/hit.
7. **Mobile-first, Samsung S24 Ultra** (≈412×915 CSS, DPR 3.5). Comfortable, one
   hand, no small targets. Also fine on desktop.
8. **Use what already exists.** Three.js, standard math, no custom physics engine —
   simple AABB/radius collision is enough. Don't rebuild wheels.
9. **Genetics are heritable** — children inherit susceptibility to certain behaviors.
10. **Emotions dictate actions and preferences.** A frightened creature flees; an
    angry one fights; a lonely one seeks company; a loving one finds a partner.

## What the player does (test-lab controls)

- **Camera**: tilted top-down observer view (not first-person). Drag = pan (non-inverted,
  world follows finger). Pinch = zoom. You can see the whole world at once.
- **Tap a creature** → small info chip: name, mood (emoji + color), hunger/energy/fear,
  wallet, gang, current goal. Chip is compact, dismissible, does NOT spam.
- **Lab actions** (bottom dock, 48px targets):
  - 🍞 drop bread (food) — tap world spot
  - 🪙 drop money — tap world spot
  - 👆 poke — tap a creature (they flinch visibly)
  - ✋ hit — tap a creature (they get hurt, angry/afraid — visible)
  - 🐣 spawn creature — random genes
  - ⏸/▶️ speed: pause · 1× · 2×
- No toasts, no feed log, no "X is Y" messages. If nothing visibly happens, nothing
  happened.

## World

- Flat square ground (say 60×60). Simple grid of colored squares = towers.
- Tower registry (pure data, shared sim+render+QA):
  - `food` — market: buy/eat food. Label "food" 🍞
  - `bank` — deposit/withdraw money. Label "bank" 🏦. SAFER than carrying.
  - `pharmacy` — medicine (heals, addictive). Label "pharmacy" 💊
  - `homes` — sleeping quarters. Label "homes" 🏠
  - `tools` — buy weapons/tools. Label "tools" 🪓
  - `tavern` — social/pleasure + drink (addictive). Label "tavern" 🍺
  - `gang` — gang HQ / territory claim point. Label "gang" ⚔️
  - Tower = a colored square + a floating label. Interaction = walk up to it, use it.
  - No buildings, no interiors, no doors. Simplicity is a feature.

  ### Grief & mourning (social awareness — added 2026-08-09)
  - When a creature dies, its **partner** and any **close bonds** (bond > 0.5)
    enter grief (`chem.grief` starts high, heals slowly ~0.004/tick).
  - A partner who dies frees the survivor's `partnerId` and drops bond — the
    survivor is visibly **sad/depressed** (emotion overrides everything while
    grief > 0.4) and stops socializing/falling in love until grief heals.
  - Grief is a real social consequence: two NPCs in love, one dies → the other
    mourns. Visible: droopy sad face, slow wander (mourn action).

## Creature ("ball with eyes")

Geometry: sphere body + two eyes (white sclera, pupil) + brows. Optional tiny mouth.
All procedural from genes (hue, size, voice). Colors: mood drives body tint
(see Emotions). One mesh per creature; expressions via eye scale/rotation/brow tilt.

### Genetics (heritable, 0..1 per gene, crossover + mutation at procreation)
- `aggression` — fight initiation
- `theft` — steals when opportunity/need
- `greed` — values money, works more, risks for money
- `sociability` — seeks company, bonds faster
- `loyalty` — gang commitment, friendship persistence
- `fearfulness` — flees vs fights; stronger fear reactions
- `energy` — activity level, wakefulness
- `addictionProne` — substance susceptibility
- `learning` — how fast memories/utility update
- `curiosity` — explores new places/people
- `lovePropensity` — romantic interest speed
- `courage` — stands ground in fights/territory

### Needs (chemicals, decay + events)
hunger, thirst, energy (sleep), social, pleasure, fear, health, intoxication
- Satiate: food→hunger, water/fountain→thirst, homes sleep→energy, social→loneliness,
  tavern→pleasure+intoxication, pharmacy→health (with addiction risk).

### Emotions (derived each tick from needs + events + personality)
- `happy` (pleasure high, needs met) — body bright yellow, eyes ^^, hops
- `content` — calm green, neutral eyes
- `angry` (anger from aggression + hunger/pain/threat) — red, brows \, lunges
- `afraid` (fear + fearfulness) — pale blue, wide eyes, trembles, flees
- `sad` (lonely/social need, loss) — muted, droopy brows, slow walk
- `loving` (bond high) — pink, heart particles near partner
- `sleepy` (energy low) — slow, eyes half-closed; sleeps at homes (Zzz)
- Mood drives: body color, eye/brow shape, movement speed/bobbing, action choice.

### Action selection (utility, per tick)
For each candidate action, score = need deficit × personality weight × preference
(from memories) + emotion bias + noise. Highest wins. Actions:
- forage/eat at food tower; drink at park fountain; sleep at homes (or collapse);
  work at bank (earn money); buy food/medicine/tool; deposit/withdraw money;
  socialize (talk, share food, gift) with a friend; pair-bond (love), procreate
  (requires bond + cooldown + home); steal (carry-money target, needs+theft);
  fight (angry/rival/territory/self-defense); join gang / claim territory;
  wander/explore; flee (fear).
- Preferences: creatures remember good experiences (place+item+friend) and bias
  future choices (learning gene scales this).

### Memory & learning
- Episodic memories: {kind, entityId, place, valence, intensity, tick} — capped ~12
  runtime, kept in save (size no longer constrained).
- Learned facts: "bank is safe" (after robbery), "place X has food", "X stole from
  me" → vendetta (fight target), "X is my friend/partner".
- These bias utility + aggression targets.

## Society layer

- **Economy**: wallet (carried) + banked money. Work at bank for wages.
  - Stealing: thief picks a target with carried money; visible chase + grab; victim
    learns "keep money at bank" (banks can't be robbed easily — but carrying a lot
    invites theft; bank has small fees or withdrawal delays = the caveat).
  - Bank is safer but not free: withdrawal takes time (queue), deposits earn tiny
    interest, bank closes at night (can't access), and banked money can't buy street
    food instantly.
- **Gangs**: creatures with loyalty+aggression may form/join gangs (gang tower).
  - Gangs claim territory (areas around towers). Rival gang members entering
    territory → challenge → fight. Gang fights are visible brawls.
- **Fighting**: two creatures lunge, damage health, loser flees/drops money; winner
  gains confidence + maybe loot. Anger/fear drive outcomes; weapons (tool: stick/knife)
  boost damage. Health low → death (body stays, X eyes — visible).
- **Love & procreation**: bonds grow via socializing/kindness; pair-bond when both
  love ≥ threshold (lovePropensity); procreate at home after cooldown; child = gene
  crossover + mutation; child inherits parent susceptibilities; parent cares (social).
- **Addiction**: pharmacy medicine/tavern drink give relief + pleasure but raise
  `addiction[substance]` (scaled by addictionProne). Withdrawal when deprived:
  fear spike, shakes, desperate seeking. Visible: trembling, erratic movement.
- **Sleep**: energy decays; tired creatures seek homes, sleep (Zzz, eyes closed);
  sleep restores. Collapse if exhausted. Sleep matters.

## Visible events (renderer feedback, NO text)

- Fight: both creatures lunge at each other, red flash, loser tumbles/drops coin.
- Steal: thief dashes at target, coin flies from victim to thief, victim exclaims (!)
- Love: hearts float between pair; child spawn = small ball grows.
- Sleep: Zzz above sleeping creature; body tilts flat.
- Death: body flattens, X eyes, fades after a while.
- Fear: tremble + wide eyes; flee = fast erratic hops.
- Money: coin count chip above creature when carrying/banking (tiny, optional).

## Save

- `version: 3`. JSON, plain data. Size OK to be ~100s KB — NO 70KB cap.
- Round floats modestly, cap memory lists, but keep the deep state (brains/memories).
- Old saves (version 2) are rejected with a one-line notice (rebuild).

## Renderer / camera spec (mobile)

- Observer cam: position ≈ (worldCenter.x, 34, worldCenter.z + 30) looking down at
  ~55° tilt; pan = drag (world follows finger, non-inverted), pinch = zoom (5..60),
  inertia optional; clamp pan to world bounds.
- Ball creature: `<sphere>` + eye group (2 sclera + pupils) + brows; animated:
  walk bob, hop when happy, tremble when afraid, lunge on fight, tilt flat on sleep,
  X eyes on death; body tint lerps toward emotion color.
- Towers: colored squares + floating text label (sprite or canvas texture) — simple.
- Ground: single flat plane, subtle grid texture (lines), few colors.
- FPS: target 60 on S24 Ultra; cap DPR at 2; simple materials, no shadows (or one
  blob shadow under each ball — cheap).
- Debug hook: `window.__lab = { sim, view, teleport }` for QA.

## Input (mobile contract)

- Whole screen = camera surface (pan + pinch + tap), `touch-action: none`.
- UI-exclusion is NARROW: only `button, .dock, .chip` block camera drag.
- Tap = inspect creature / use lab action. Double-tap = zoom in? (optional)
- Non-inverted: slide right → world moves right (camera pans left), i.e. you pull
  the world like paper. Verify at camera level with real CDP touches.
- 48px min touch targets; safe-area insets respected.

## Tests (TDD, sim in node, no DOM)

- genetics: crossover/mutation bounds, heritability, child susceptibility
- needs decay, emotion derivation, action selection sanity
- economy: work earns, buy spends, deposit/withdraw, bank-safety learning after robbery
- stealing: thief behavior, victim learning, bank caveats (night closed, fees)
- gangs: formation, territory claim, rival challenge → fight
- fighting: damage, weapons boost, loser flees/drops, death
- love/procreation: bond growth, pair-bond, child genes from parents
- addiction: relief + dependence, withdrawal spike (scaled by addictionProne)
- sleep: energy decay, seek homes, restore, collapse edge
- world: towers registry, walk-to-tower navigation, tower use
- save: round-trip deep state, v2 rejection, size sanity (< ~400KB)
- app tests: no action-message strings; dock controls exist; chip inspect exists
- viewport QA: 320/360/390/412/430/768/1280, no overflow, dock 48px, tap works

## Milestones

1. ✅ Design doc
2. Sim core (TDD, node) — genetics → needs/emotions → actions → world → society
   (economy/steal/gangs/fight/love/addiction/sleep) → save
3. Renderer — ball creatures + eyes/emotions, towers+labels, events
4. App/UI — observer cam, dock, chip, no messages
5. Gates + viewport QA + deploy (rsync/nginx) + verify HTTPS prod
