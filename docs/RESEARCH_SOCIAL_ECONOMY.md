# RESEARCH_SOCIAL_ECONOMY.md

**Project:** Luma Valley — lightweight NPC psychology + economy research (pre-implementation)
**Date:** 2026-08-09
**Author:** DeepSeek implementation/research worker 1
**Status:** Research complete. This document is the input for the next implementation phase. No code was changed.

---

## 0. How to read this document

- **Part A — SOURCED FINDINGS** are facts extracted from the cited URLs. Each subsection lists the URL(s) actually fetched and the findings that came out of them. Where a classic primary paper (Bowlby 1969, Ainsworth et al. 1978, Tajfel et al. 1971) is referenced *inside* a fetched source, it is cited that way rather than claimed as directly read.
- **Part B — DESIGN INFERENCE** is our own engineering distillation: computationally cheap mechanics derived from Part A and from the design precedents of Creatures/RimWorld. Everything there is inference, not sourced fact, and is labeled `[INFERENCE]`.
- **Access notes** (Part C) record which URLs were actually reachable, so nobody mistakes a planned citation for a verified one.

---

## PART A — SOURCED FINDINGS

### A1. Attachment — Bowlby & Ainsworth

**Source (fetched):** https://nobaproject.com/modules/attachment-through-the-life-course (Noba Project, peer-reviewed open textbook module, R. Chris Fraley)

- Bowlby (1969): infants experience intense distress at separation from caregivers; separation behaviors (crying, calling, refusing food/play, waiting at the door) are common across mammals and served an evolutionary function (proximity to an attachment figure → survival).
- The **attachment behavioral system** is a motivational system that "functions much like a thermostat": it continuously monitors the accessibility of the attachment figure. If the figure is nearby/accessible/attentive → the child feels loved and secure and explores; if the figure is inaccessible → anxiety, and attachment behaviors scale from visual searching to active searching, following, and vocal signaling, until proximity is restored or the child exhausts itself.
- **Harlow (1958)** — rhesus monkeys preferred a cloth surrogate over a wire surrogate **even when fed by the wire surrogate**: the bond is rooted in "contact comfort", not just food. (Directly relevant to a game where feeding is not enough to bond.)
- **Ainsworth, Blehar, Waters & Wall (1978)** — the **Strange Situation**: ~20-minute lab procedure of separations/reunions. Approx. **60% secure** (upset at separation, actively seek + easily comforted at reunion), **~20% anxious-resistant** (extreme distress, hard to soothe, conflicting "seek comfort / punish the parent" behavior), **~20% avoidant** (not overtly distressed; actively avoid contact at reunion).
- Antecedents: **sensitive, responsive caregiving** predicts secure attachment; insensitive, inconsistent, or rejecting care predicts insecure (anxious/avoidant) patterns. Intervention studies (Van den Boom 1994) show responsiveness training raises the rate of secure attachment.
- Outcomes: secure children → better peer relationships, favorable teacher ratings, persistence on challenging tasks; insecure-avoidant children → more "bully" behavior and difficulty maintaining friendships.

### A2. In-group trust — Tajfel, social identity, minimal groups

**Sources (fetched):**
- https://openstax.org/books/psychology-2e/pages/12-5-prejudice-and-discrimination (OpenStax Psychology 2e)
- https://en.wikipedia.org/wiki/Minimal_group_paradigm

- **In-group** = a group we identify with / see ourselves as belonging to; **out-group** = a group we view as fundamentally different. Groups are "a powerful source of our identity and self-esteem" (Tajfel & Turner, 1979). We develop **in-group bias: a preference for our own group over other groups** (OpenStax 12.5).
- **Minimal group paradigm** (Tajfel et al., early 1970s): even **arbitrary** distinctions (painting preference, shirt color, coin toss) trigger in-group favoritism when people allocate resources (money/points) between anonymous code-numbered recipients. Crucially, participants showed a tendency to **maximize relative in-group gain ("maximum differentiation" / "Vladimir's choice") — favoring the in-group even when it sacrificed absolute in-group gain**. Fairness was also present, but in-group preference still showed.
- Social identity explanation: in minimal conditions, in-group favoritism is the available route to **positive distinctiveness** (self-esteem).
- **Scapegoating**: blaming an out-group when the in-group experiences frustration or is blocked from a goal (Allport, 1954) (OpenStax 12.5).
- Out-group homogeneity: own group perceived as more positive *and* more varied than the out-group (Wikipedia MGP).

### A3. Scarcity and trade — basics

**Source (fetched):** https://openstax.org/books/principles-economics-3e/pages/1-1-what-is-economics-and-why-is-it-important (OpenStax Principles of Economics 3e)

- "Economics is the study of how humans make decisions in the face of scarcity."
- **Scarcity means human wants for goods, services, and resources exceed what is available**; resources are finite, wants are (practically) infinite.
- "The ultimate scarce resource is **time** — everyone has just 24 expendable hours."
- Scarcity forces **choices**: produce everything yourself, or "produce some of what we want to consume, and **trade** for the rest".
- **Division and specialization of labor** (Adam Smith): 1 worker alone might make ~20 pins/day; a small firm of 10 specialists can make ~48,000. Specialization raises output; people specialize where they have an advantage (later formalized as comparative advantage).

### A4. Money — functions and why barter fails

**Source (fetched):** https://openstax.org/books/principles-economics-3e/pages/27-1-defining-money-by-its-functions (OpenStax Principles of Economics 3e)

- Barter problems: perishable goods can't be saved for future trades; barter doesn't easily support **future contracts**; time spent bartering is time not producing (growth-limiting in larger economies).
- Money's four functions:
  1. **Medium of exchange** — an intermediary between buyer and seller (requires wide acceptance).
  2. **Store of value** — holdable without losing value (shoes go out of style; money holds).
  3. **Unit of account** — the "ruler" by which values are measured; a common denominator that simplifies thinking about trade-offs.
  4. **Standard of deferred payment** — usable today for purchases paid in the future.
- Commodity money (gold, shells, cigarettes, cocoa beans) vs fiat money (no intrinsic value; value from decree/trust).

### A5. Cooperation and defection — prisoner's dilemma

**Source (fetched):** https://openstax.org/books/principles-economics-3e/pages/10-2-oligopoly (OpenStax Principles of Economics 3e)

- Prisoner's dilemma payoff structure: cooperate-cooperate = 2y/2y (best joint); defect against a cooperator = 1y (best individual); cooperate against a defector = 8y (worst); defect-defect = 5y/5y.
- **Defection is the dominant strategy** — each player is better off confessing regardless of the other's choice — yet mutual defection is worse for both than mutual cooperation. "If the two prisoners can work out some way of cooperating… they will both be better off."
- Same structure in oligopoly: hold output (cooperate) vs increase output (defect) — the temptation to defect while others cooperate undermines the cooperative outcome.

### A6. Attraction, reciprocity, love, altruism

**Source (fetched):** https://openstax.org/books/psychology-2e/pages/12-7-prosocial-behavior (OpenStax Psychology 2e)

- **Reciprocity**: "the give and take in relationships… we contribute to relationships, but we expect to receive benefits as well… we are more likely to like and engage with people who like us back." **Self-disclosure** (sharing personal information) deepens intimacy.
- Attraction: proximity and similarity lead to relationship formation; **matching hypothesis** — people pick partners they view as their equal in attractiveness/desirability.
- **Sternberg's triangular theory of love** (1986): love = **intimacy** (sharing details/emotions) + **passion** (physical attraction) + **commitment** ("in sickness and health"); different combinations give different types of love.
- **Prosocial behavior / altruism**: voluntary helping even when costs outweigh benefits; empathy (Batson) is a proposed driver; egoism-vs-altruism debate unresolved.

### A7. Design precedent — Creatures (the direct ancestor of Luma Valley)

**Sources (fetched):**
- https://creatures.wiki/Drive
- https://creatures.wiki/Biochemistry
- (Community-maintained wiki documenting the official game data/manuals; Steve Grand quotes below are from the wiki's citations of him.)

- A **drive is a biological need** modeled as a blood chemical. Drives are shown as bars: green (not needed) → yellow → red (urgent). **The higher the drive chemical, the more urgent the drive, no matter how essential it is to survival.**
- Creatures 1 drives: Pain, Need for Pleasure, Hunger, Coldness, Hotness, Tiredness, Sleepiness, **Loneliness**, Crowdedness, **Fear**, Boredom, Anger, Sex Drive. C2 added Injury, Suffocation, Thirst, Stress. C3/DS added Comfort/Homesickness and split hunger into protein/carbs/fat.
- Drive mechanics (C1/C2): each drive = three chemicals — a **drive-raising chemical** (converts to the drive chemical + **Punishment**), the **drive chemical** itself, and a **drive-lowering chemical** (reacts with the drive chemical to produce **Reward**). Steve Grand described this as "primitively Behaviorist" but noted it gives learned logic for decisions; in 2015: "most drives are bad if they get stronger and good if they get weaker" (the exception being Need for Pleasure — a drive *for* happiness).
- Stress behavior: in frightening/painful situations, some drives convert into **backup drives** so the creature can focus on dealing with the fear/pain. Many drives "in the red" simultaneously is theorized to be very confusing.
- Biochemistry: chemicals are arbitrary; what they do is determined entirely by genetics — reactions (fusion, decay, catalysis), half-lives, initial concentrations, emitters, receptors. E.g., creatures learn to eat when brain-linked hunger (glycogen low) is perceived; a mutation can create positive reinforcement loops (walking into walls).
- Creatures Online planned a community-benefit drive ("Altruism" — watering plants, fixing toys).

### A8. Design precedent — RimWorld (opinion / mood / needs)

**Sources (fetched):**
- https://rimworldwiki.com/wiki/Social
- https://rimworldwiki.com/wiki/Needs
- (Official RimWorld wiki — community-maintained but documents actual shipped mechanics.)

- **Opinion** (per-pair scalar) is affected by: beauty, traits, random social interactions, and player actions. Beauty: each level of beauty above/below 0 adds **±20 opinion, capped at ±40**; disfigurement −15.
- **Base opinions by relation** (selected values): Spouse +30 (and "opinion of killer if killed" −65); Fiancé +30/−65; Lover +35/−50; Exspouse −15; Exlover −15; Stepparent/Stepchild/Parent-in-law/Child-in-law +5. Family: Father/Mother/Son/Daughter/Birthmother +30 (opinion of killer if killed −80, incest −30); Sibling +20/−80/−15; Halfsibling +15/−15/−15; Grandparent +15/−15/0; Nephew/Niece +10/−15/0; Uncle/Aunt +10/−15/−15; Cousin +10/−15/−15; distant kin +5/−15/0.
- **Non-intimate bands**: Rival = opinion −100…−20; Acquaintance = −20…+20; Friend = +20…+100. Asymmetric (one may be friends with someone who considers them a rival).
- Low opinion → insults → **social fights** (damage both, possible permanent injury). Romance requires a minimum opinion of the target. A rebuffed romance: −10 opinion (of target) for the romancer, −15 opinion (of romancer) for the target. Affairs exist as a betrayal-relevant mechanic.
- **Needs → thoughts → mood**: each pawn's needs (Food, Rest, Recreation, Beauty, Comfort, Outdoors/Indoors, Chemical, Learning for children, Play for babies) produce mood thoughts with concrete numbers — e.g., Recreation unfulfilled/deprived/starved = **−5/−10/−20**; low expectations produce a large positive thought (+30). Hunger lowers mood; starvation increases irritability. Exhaustion → collapse. Mood = sum of currently active thoughts.

---

## PART B — DESIGN INFERENCE: lightweight mechanics [INFERENCE — NOT SOURCED]

Derived from Part A, mapped onto Luma Valley's existing pure-TS systems (blood-chemical drives, neural nets, genetics, language-lite, small population n < 30, <300 KB save, TDD core). Cost rule of thumb: **scalars and EMAs, threshold state machines, rolling counters, and an n×n pair matrix — no full event histories, no per-event storage.**

General patterns used below:
- `EMA(x, target, α)` = x += α·(target − x); α in (0,1), ticked per sim step. O(1) per pair.
- Pair state lives in a matrix keyed by creature id pairs (n<30 → ≤ 870 entries, trivial to serialize).
- Events (share, help, harm, theft, promise kept/broken, witnessed event) are one-shot impulses with sign + magnitude; they feed EMAs and counters, then are discarded.

### B1. Trust `[INFERENCE]`
- **State:** per-pair scalar `trust ∈ [−1, 1]`, initialized to genetic baseline `trustingness` (gene).
- **Update:** on each social event `e` (share +0.1, help +0.15, promise kept +0.2, theft −0.4, harm −0.5, promise broken −0.35): `trust += α_e · (sign(e) − trust)`, with event-specific α. Slow positive drift, fast negative drops (asymmetry — losses loom larger; also keeps betrayal impactful).
- **Decay:** tiny decay toward genetic baseline when the pair is out of contact for a long time.
- **Uses (gates):** willingness to share food, accept trade terms, follow the player/another NPC, and (via reputation) how much a witness's testimony is weighted. Ties to RimWorld's opinion-as-gate precedent (romance/insults need opinion thresholds).

### B2. Attachment `[INFERENCE]`
- **State:** per-pair scalar `attachment ∈ [0, 1]` + one `primaryFigure` slot (highest attachment) + an emergent style flag (secure/anxious/avoidant).
- **Update:** EMA of (co-located time, comfort given while distressed, feeding/care events). Bowlby thermostat behavior: if `primaryFigure` is in range AND `attachment > T_secure` → **secure mode**: loneliness suppressed, exploration +curiosity bonus. If figure absent while loneliness/fear are high → **separation anxiety**: loneliness/fear spike, seek/call behavior (already expressible as existing drive chemicals + brain inputs). Prolonged absence (tracked by a counter) → grief impulse (pleasure drops), then attachment decays → avoidant style.
- **Emergent styles from consistency:** track the *variance* of figure responsiveness (response-time to distress calls). Low variance + fast response → secure; high variance → anxious; consistently absent/rejecting → avoidant. This mirrors Ainsworth's antecedents (sensitive vs inconsistent vs rejecting care) and can be purely behavioral — no style gene needed.
- **Why it's cheap:** no history — only EMA, a counter, a variance estimate (exponential moving variance, O(1)).
- **Love/Bond:** Sternberg stack — `intimacy` (cumulative shared language-tags/disclosure interactions), `passion` (pheromone gene × proximity time), `commitment` (pair-bond flag after threshold + co-care of offspring). Love = intimacy+passion+commitment weighted sum; pairing behavior gated on attachment/passion thresholds (RimWorld precedent: romance needs minimum opinion). Rejection event: one-shot −0.1/−0.15 trust drops on both sides (RimWorld rebuff precedent).

### B3. Betrayal `[INFERENCE]`
- Betrayal = high-impact negative event against a high-trust/attachment partner (theft, harm, promise broken, abandonment in danger).
- **Mechanics:** clamp trust down (see B1), spike fear if the betrayer is the primaryFigure (attachment × betrayal → grief: pleasure/fear chemistry impulse), and update **witness** opinions (B6). Keep a single **grudge slot** (worst betrayer id + magnitude) instead of a log; grudge decays slowly. Grudge bias: refusal to trade/share with the grudge target, plus an aggression trigger if they come near offspring.

### B4. Fear `[INFERENCE]`
- Fear already exists as a drive chemical — extend it cheaply:
  - **Safe-place heatmap:** coarse grid cells (e.g., 8×8 over the valley); each cell stores an EMA of fear experienced there; fear drive is damped in remembered-safe cells, amplified in danger cells (predators, night spots, witnessed deaths). O(cells), tiny.
  - **Fear → valuation:** high fear increases the *perceived utility* of food/shelter (scarcity-under-stress), which naturally produces hoarding during crises (connects to B8/B10).
  - Stress conversion (Creatures precedent): when fear/pain exceed a threshold, convert some secondary drives (boredom, sex drive) into "backup" drive for flight/defense — this is already expressible as drive reactions.

### B5. Greed `[INFERENCE]`
- **Item utility function:** `utility(item) = needUrgency(item) × scarcitySignal(item) + geneticGreed × expectedFutureValue(item)`, where `expectedFutureValue` is the store-of-value motive (A4) and `scarcitySignal` is the NPC's perceived scarcity (B8).
- `geneticGreed` is a heritable gene (0..1): greedy NPCs accumulate beyond immediate need when they perceive scarcity (hoarding), nongreedy share surplus. Greed is thus a *trait that shifts the utility curve*, not a new emotion system.

### B6. Witnessing / reputation `[INFERENCE]`
- **State:** per-pair scalar `reputation_A→B` = A's stored opinion of B, updated from witnessed events.
- **Update:** when an event happens at location L, broadcast a compact event record to creatures within radius R. Each witness applies `reputation += α_w · weight · (event sign)`, where `weight` scales with the witness's trust in the *reporter* (direct witness weight 1.0; hearsay via a trusted friend weights higher than hearsay via a stranger). Only a few events per sim step → O(events × witnesses in radius), trivially bounded.
- This is the "opinion of killer" pattern from RimWorld generalized: killing/harming someone near others drops the killer's reputation with everyone who saw it; sharing food in public raises it.
- Reputation feeds trade terms (B9), cooperation thresholds (B10), and scapegoating (B10).

### B7. Scarcity `[INFERENCE]`
- **World side:** berry bush regrowth rates / fertility are finite and per-area; population demand vs supply is tracked by the sim (a single counter per resource type: `stockNow`, `regrowRate`, `consumptionRate`). When demand > supply → world scarcity = 1, else 0. (This is the OpenStax scarcity definition — wants exceed available — made concrete.)
- **Perception side:** each NPC tracks a perceived-scarcity EMA per resource: `perceivedScarcity += α · (wasAttemptFruitful ? 0 : 1) − decay`. Failed attempts to find an item raise perceived scarcity; success lowers it. Perceived scarcity drives: competition for the resource, higher utility valuation (B5), willingness to trade for it (B9), and hoarding (B10). Perception per resource type, not per item — O(resource types).

### B8. Trade `[INFERENCE]`
- **Barter:** trade happens when two NPCs co-locate and each holds what the other values. Acceptance rule: **accept iff both utilities rise** (Pareto-improving exchange — the economic reason to trade, A3). Terms (how much of X for Y) are biased by mutual trust: trusted partner → fair terms; low trust → demand a surplus.
- **Fairness memory:** per pair, `fairnessHistory` EMA of past trade outcomes; repeated unfair terms degrade trust (B1) and reputation (B6).
- **Emergent commodity money:** when barter failures accumulate (perishability, time wasted — A4), the sim can track "double-coincidence failures" counter; if it crosses a threshold, a high-demand durable item (e.g., shells, dried berries) starts functioning as medium of exchange + store of value: NPCs accept it beyond need and quote prices in it. This is emergent from A4's functions, not hard-coded.
- Cost: pair matrix lookup + utility calls on trade events only.

### B9. Cooperation / hoarding `[INFERENCE]`
- **Food-sharing as prisoner's dilemma (A5):** share-share beats hoard-hoard in the long run (group survival), defection wins short-term, mutual defection is the bad equilibrium. NPCs choose `cooperate iff trust(partner) ≥ T_coop OR partner is in-group AND reputation ≥ T_group`. This is tit-for-tat-lite: cooperate with those who cooperated (their trust rose), defect against chronic defectors (their trust fell below threshold).
- **In-group bias (A2):** group tags — family/kin (genetic similarity threshold on the genome) or learned group (shared den/colony). Sharing weight ×1.5 with in-group, ×0.7 with out-group; scapegoating: when a group suffers a recent failure (food shortage, predator attack) AND scarcity is high, blame the nearest out-group NPC (reputation drop, cooperation refusal) — cheap: one counter + one flag.
- **Hoarding:** greedy + scarcity-perceiving NPCs accumulate; they then *become trade partners* when others' scarcity rises (they hold store-of-value items — B8), which makes greed socially useful and creates economic stratification stories.

### B10. Cost summary `[INFERENCE]`
| Mechanic | State | Update cost | Notes |
|---|---|---|---|
| Trust | per-pair scalar | O(events) | EMA + asymmetric α |
| Attachment | per-pair scalar + figure slot | O(events) | EMA, variance, counters |
| Fear safety map | grid cells (~64) | O(cells/tick) | EMA per cell |
| Greed | gene + utility fn | O(1)/item | no new state |
| Reputation | per-pair scalar | O(events×witnesses) | radius-limited |
| Scarcity | per-resource counters | O(types)/tick | world + perceived |
| Trade | none persistent | O(pairs) on events | acceptance rule only |
| In-group | group tag per NPC | O(1) | kin = genetic distance |

Save-file impact: pair matrices are the only new serialized state — for n=30 that's ~900 floats ≈ 8 KB; well within the <300 KB target.

---

## PART C — Access notes & honesty record

**Fetched and used (HTTP 200, text extracted):**
1. https://nobaproject.com/modules/attachment-through-the-life-course
2. https://openstax.org/books/psychology-2e/pages/12-5-prejudice-and-discrimination
3. https://openstax.org/books/psychology-2e/pages/12-7-prosocial-behavior
4. https://openstax.org/books/principles-economics-3e/pages/1-1-what-is-economics-and-why-is-it-important
5. https://openstax.org/books/principles-economics-3e/pages/27-1-defining-money-by-its-functions
6. https://openstax.org/books/principles-economics-3e/pages/10-2-oligopoly
7. https://en.wikipedia.org/wiki/Minimal_group_paradigm
8. https://creatures.wiki/Drive
9. https://creatures.wiki/Biochemistry
10. https://rimworldwiki.com/wiki/Social
11. https://rimworldwiki.com/wiki/Needs

**Verified reachable but NOT extracted (listed as further references only, no findings attributed):**
- https://www.ninds.nih.gov/health-information/public-education/brain-basics/brain-basics-know-your-brain (HTTP 200 — fear/amygdala overview)
- https://openstax.org/books/psychology-2e/pages/6-3-operant-conditioning (HTTP 200 — reinforcement/punishment learning)

**Blocked / unusable, deliberately NOT used:**
- https://www.simplypsychology.org/attachment.html — Cloudflare challenge (403) even via real browser; findings covered by Noba instead.
- https://www.verywellmind.com/what-is-attachment-theory-2795337 — 403.
- https://dictionary.apa.org/attachment — page shell only, no extractable entry.
- https://www.britannica.com/science/in-group-bias — 403.
- https://www.ncbi.nlm.nih.gov/books/NBK532192/ — wrong topic (bipolar treatment), not attachment.
- https://www.stlouisfed.org/education/economic-lowdown-podcast-series/episode-9-functions-of-money — timeout; money functions covered by OpenStax 27.1.
- https://www.gamedeveloper.com/design/the-sims-postmortem — HTTP 200 but article body is JS-rendered (nav shell only). **The Sims mechanics are therefore NOT covered in this document.** If Sims needs/motives are wanted, fetch from an archived/plain-text mirror in a follow-up.

**Primary literature cited *inside* fetched sources (not directly read here):** Bowlby 1969 (Attachment and Loss); Ainsworth, Blehar, Waters & Wall 1978 (Patterns of Attachment); Harlow 1958; Tajfel & Turner 1979; Tajfel et al. 1971 (minimal group experiments, Eur. J. Soc. Psychol.); Allport 1954 (scapegoating); Sternberg 1986.

---

## PART D — Recommended minimal implementation slice

Phase 1 (lowest cost, highest emergent payoff):
1. Per-pair `trust` + `attachment` EMAs with the Bowlby thermostat (secure/seek/avoid modes) — reuses existing loneliness/fear/pleasure chemistry and brain inputs.
2. Group tags (kin via genetic distance, den-mates) with Tajfel in-group sharing weights.
3. Item utility function incl. scarcity signal + greed gene; store-of-value acceptance in trade.
4. Witness/reputation broadcasts (radius-limited).

Defer until barter data exists: commodity-money emergence (needs the double-coincidence-failure counter to matter) and full betrayal/affair state machines.

**Open questions for the design lead:** (a) should attachment styles be exposed to the player in UI (care panel) or stay emergent-invisible? (b) is permadeath grief (B3) wanted as a mood mechanic, and at what severity? (c) trade UI: automatic barter-only, or player-directed?
