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

## Society

- **Households** (`household.ts`) — couples claim one of the individual houses; children join; care or neglect has consequences
- **Culture** (`norms.ts`) — property, nonviolence, honesty, generosity, loyalty, sobriety norms shift with witnessed behaviour; influence and leadership are earned; children inherit vocabulary and place knowledge
- **Jobs** (`jobs.ts`) — shopkeeper, healer, bartender, farmer, porter, teacher; a completed shift pays wages and pushes production onto the shelves
- **Economy** (`economy.ts`) — scarcity pricing, subjective value, haggling, refusal of known thieves, debts, inequality
- **Items** (`items.ts` + `inventory.ts`) — data-defined catalog, weight capacity, ownership marks that make theft detectable
- **Interaction** (`interact.ts`) — beds, doors, chests, counters; the player and creatures use the same reach rules

Population is bounded by fertility, needs, housing, lifespan, and a configurable cap. Travellers settle when the town thins, so a small settlement does not dwindle to nothing.

## Performance

- Simulation LOD (`lod.ts`): near / mid / far / sleep bands
- Time-sliced AI batches (`settings.aiBatchSize`)
- Render frame rate independent of `simHz` (default 6 Hz)
- Particle and label toggles; pixel-ratio cap
- Compact structured state; natural language generated only on demand
- Defaults tuned for an RTX 5070 laptop at medium quality (~60 FPS target)

Measured in the browser during development: ~14–16 ms per frame with 10 Luma at medium settings, sim cost 11–22 ms per second of simulation. A profiling pass on the actual target laptop is still outstanding.

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

## Genuine limitations

- Natural language is rule-based and offline; there is no language model per creature
- Buildings are exterior shells with usable fixtures rather than full interiors
- Goods do not yet flow between institutions (each role restocks its own shelf)
- No jump, crouch, or object dragging for the player
- Violence and substances are abstract systems with social consequences, not graphic content
- The optional cloud dialogue provider is implemented and tested but no endpoint is configured
- No profiling run has been recorded on the actual ASUS ROG Zephyrus G14 target
