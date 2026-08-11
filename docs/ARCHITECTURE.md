# Luma Haven — Architecture

**Stack decision:** Keep the browser (Vite + React 19 + TypeScript + Three.js). Profiling and practical constraints for a dense ~8–24 creature settlement favor this stack: zero install friction, offline PWA, WebGL on the target G14 laptop, and a pure-TS simulation core that is easy to test. A desktop engine remains an option if population or ML needs explode later; optional cloud NL is never required.

## Layers

| Layer | Role |
|---|---|
| `src/lab/*` | Pure simulation: needs, mind, genetics, economy, society, dialogue semantics, LOD |
| `src/render/labview.ts` | Three.js presentation; never owns game rules |
| `src/App.tsx` | HUD, controls, settings, talk, inspector, autosave |
| `public/` | PWA shell for offline play |

## Creature mind (hybrid)

- **Instincts / chemistry** (`chem.ts`) — hunger, thirst, energy, fear, health, addiction
- **Utility mind** (`mind.ts`) — scores candidate actions from needs × genes × opportunity × reputation
- **Tiny neural net** (`brain.ts`, TF.js) — learns action preferences from outcomes (batched, async)
- **Psyche** (`psyche.ts`) — stress, confidence, belonging, values, mood
- **Emotions** (`emotions.ts`) — joy, envy, spite, affection, forgiveness, …
- **Social graph** (`socialbond.ts`) — asymmetric multidimensional edges (trust, attraction, resentment, …)
- **Memory** (`memory.ts`) — capped episodic + facts + vendettas; importance via intensity
- **Language** (`language.ts`) — concept↔word maps learned by association
- **Dialogue** (`dialogue.ts`) — semantic intents; NL only when the player talks or listens
- **Reputation / gossip** (`reputation.ts`) — witnessed events + hearsay

Creatures do **not** magically know unvisited places or obey the player. Belief and obedience use trust, evidence, personality, and mood.

## Society

- **Households** (`household.ts`) — couples share a home slot; children join; care/neglect soft effects
- **Economy** (`economy.ts`) — stocked goods, scarcity pricing, work shifts, bank deposits
- **Institutions** (`world.ts` towers) — market, bank, pharmacy, **clinic**, homes, tavern, tools, work, farm, school, park, den, graveyard
- **Jobs** — work / farm / school raise income; shops consume stock

## Performance

- Simulation LOD (`lod.ts`): near / mid / far / sleep bands
- Time-sliced AI batches (`settings.aiBatchSize`)
- Render FPS independent of `simHz` (default 6 Hz)
- Particle / label toggles; pixel-ratio cap
- Compact structured state; dialogue NL generated on demand
- Defaults tuned for RTX 5070 laptop at medium quality (~60 FPS target)

## Persistence

- Save version **5** (`save.ts`) — creatures, social graphs, psyche, households, economy, player
- Autosave to `localStorage` (`creature-storage.ts` world blob)
- Graceful load of v4 saves (new fields defaulted)
- Per-creature storage budget helpers (~3 MB ceiling for learned blobs)

## Transparency

- Mind inspector (`inspect.ts` + HUD): needs, scores, reasoning lines, bonds, memories, recent talk, estimated KB cost
- Settings panel: quality preset, population cap, AI batch, gentle mode, frame-cost readout

## Genuine limitations

- NL is template/rule-based (offline), not a large language model per creature
- Buildings are exterior shells with interaction radii (no full interiors yet)
- Population is intentionally modest; LOD keeps distant minds coarse
- Violence / substances are abstract systems with social consequences, not graphic content
- Optional cloud AI is stubbed as a setting only — core play never depends on it
