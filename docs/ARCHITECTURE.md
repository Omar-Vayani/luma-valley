# Luma Haven — Architecture

**Stack decision:** Keep the browser (Vite + React 19 + TypeScript + Three.js). Profiling and practical constraints for a dense 8–24 creature settlement favour this stack: zero install friction, offline PWA, WebGL on the target G14 laptop, and a pure-TypeScript simulation core that is easy to test. A desktop engine remains an option if population or ML needs grow; optional cloud NL is never required.

## Layers

| Layer | Role |
|---|---|
| `src/lab/*` | Pure simulation: needs, mind, genetics, economy, society, dialogue semantics, LOD |
| `src/render/labview.ts` | Three.js presentation; never owns game rules |
| `src/App.tsx` | HUD, controls, settings, talk, inspector, society panel, autosave |
| `public/` | PWA shell for offline play |

## Creature mind (hybrid)

Nothing here is a scripted routine; behaviour comes out of these systems interacting.

| Module | Responsibility |
|---|---|
| `chem.ts` | Hunger, thirst, energy, health, fear, comfort, privacy, purpose, addiction |
| `mind.ts` | Utility scoring: needs × genes × opportunity × reputation × norms × risk |
| `brain.ts` | Tiny TF.js net that learns action preferences from outcomes (batched, async) |
| `beliefs.ts` | What a creature thinks is true — confidence, provenance, revision, habits, lying |
| `psyche.ts` | Stress, confidence, belonging, boredom, personal values, mood |
| `emotions.ts` | Joy, pride, shame, guilt, gratitude, hope, envy, resentment… via appraisal |
| `memory.ts` | Episodes with importance, consolidation into semantic patterns, forgetting |
| `socialbond.ts` | Asymmetric edges: trust, affection, attraction, respect, fear, resentment… |
| `courtship.ts` | Interest, rejection, partnership, strain, separation, reconciliation |
| `language.ts` | Concept ↔ word maps learned by association |
| `dialogue.ts` | Player conversation: intent parsing, trust-gated belief and obedience |
| `chatter.ts` | Compact creature↔creature messages, promises, overheard rendering |
| `reputation.ts` | Witnessed events plus hearsay |
| `lifecycle.ts` | Child → adolescent → adult → elder, learning rate, vigor, lifespan |

Creatures do not know places they have never seen (they learn by sight or by being told), do not automatically believe or obey the player, and can hold beliefs that are wrong until evidence accumulates against them.

## Stories

`story.ts` keeps only the moments that changed something socially, records the
reason the actor chose it (read from the state that drove the decision, so it
cannot drift from the behaviour), and ranks them by significance and recency.
The society panel shows what people are talking about and what changed while
the player was away; the inspector shows one creature's life so far.

Shortages are traced the same way: an empty bread shelf names the missing
farmer, because production is a chain (`jobs.ts`) rather than a spawn.

## Society

- **Households** (`household.ts`) — couples claim one of the individual houses; children join; care or neglect has consequences
- **Social acts** (`socialacts.ts`) — mentoring the young, mediating fights at personal risk, flattery that can be seen through, alliances recognised from mutual help
- **Standing** (`status.ts`) — respect, contribution, wealth and disgrace decide prices, who helps you, and who gets an empty house
- **Institutions** (`institutions.ts`) — each building keeps its own hours and its own till, so wages come from what the place actually took
- **Culture** (`norms.ts`) — property, nonviolence, honesty, generosity, loyalty, sobriety norms shift with witnessed behaviour; influence and leadership are earned; children inherit vocabulary and place knowledge
- **Jobs** (`jobs.ts`) — shopkeeper, healer, bartender, farmer, porter, teacher; a completed shift pays wages and pushes production onto the shelves
- **Economy** (`economy.ts`) — scarcity pricing, subjective value, haggling, refusal of known thieves, debts, inequality
- **Items** (`items.ts` + `inventory.ts`) — data-defined catalog, weight capacity, ownership marks that make theft detectable
- **Interaction** (`interact.ts`) — beds, doors, chests, counters; the player and creatures use the same reach rules

Population is bounded by fertility, needs, housing, lifespan, and a configurable cap. Travellers settle when the town thins, so a small settlement does not dwindle to nothing.

## Performance

- Simulation LOD (`lod.ts`): near / mid / far / sleep bands, with per-phase timing (minds, bodies, social, economy, world) shown by F3
- Time-sliced AI batches (`settings.aiBatchSize`)
- Render frame rate independent of `simHz` (default 6 Hz)
- Particle and label toggles; pixel-ratio cap
- Compact structured state; natural language generated only on demand
- Defaults tuned for an RTX 5070 laptop at medium quality (~60 FPS target)

### Measured

`npm run bench` runs the real simulation headlessly at several populations. On
the development machine (Node 22, Xeon vCPU, no GPU):

| Population | Preset | ms per tick | Share of a 60 FPS frame at 6 Hz | Save KB per creature |
|---|---|---|---|---|
| 8 | medium | 0.15 | 5.4% | 13.3 |
| 16 | medium | 0.22 | 7.9% | 15.6 |
| 24 | high | 0.30 | 10.8% | 17.0 |

The simulation is not the bottleneck: even 24 Luma at high settings leaves
roughly 90% of the frame budget for rendering, which is what justifies keeping
the browser stack. Per-creature persistent state is ~13–17 KB, far inside the
1–10 MB budget the brief allows, so memory can grow considerably before it
matters. In-game frame cost is shown live with F3.

Run it yourself: `npm run bench` (add `--pops 8,16,32 --ticks 3000` to widen).
`npm run verify:hud` drives a headless browser and fails if any HUD control is
missing, collapsed, or covered by another element.

## Persistence

- Save version **6** (`save.ts`) — creatures with beliefs, habits, psyche, social graphs; households, culture, jobs, ledger, container contents, player
- Autosave to `localStorage` every ~20 s, plus three manual slots
- One-deep backup: an unreadable autosave falls back to the previous one before starting fresh
- Export / import `.luma.json` from the settings panel
- v4 and v5 saves still load, with new fields defaulted

## Transparency

- Mind inspector (`inspect.ts`): needs, action scores, plain-language reasoning, bonds, family, habits, beliefs with confidence and source, promises, memories, recent talk, estimated memory cost
- Society panel: population, households, inequality, norms, who is respected, staffed and vacant roles, shared words, overheard lines, chronicle
- F3 performance overlay: frame time, sim time, population, AI batch, tick

## Atmosphere

The sky, sun and ambient light follow the settlement's own clock: midday is
bright, dusk and dawn run amber, and night is moonlit blue rather than black —
dark enough to feel late, light enough to keep watching. Because the same
clock closes the shops, the hour is something the player feels before they
read it anywhere.

## Reading the society without a panel

A creature carries the mark of its trade, everyone in a household wears the
same colour band, children are small and elders stoop, and strong feeling
toward whoever is beside them shows above their head. Buildings light a lamp
when open and post `closed`, `sold out`, or `no one here`. This is refreshed
every twelfth frame, not every frame.

## Determinism

A world is reproducible from its seed: creature lifespan, facing, mediation
outcomes and directions-giving all draw from the simulation's own generator
rather than `Math.random`. The same seed grows the same settlement.

## Genuine limitations

- Natural language is rule-based and offline; there is no language model per creature
- Buildings are exterior shells with usable fixtures rather than full interiors
- The player cannot drag heavy objects, and there is no verticality to jump or crouch for
- Violence and substances are abstract systems with social consequences, not graphic content
- The optional dialogue endpoint is implemented and tested, but you must supply the service
- Benchmarks come from the development machine; nothing has been measured on the ASUS ROG Zephyrus G14 itself
