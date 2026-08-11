# Luma Haven

A first-person artificial-life game inspired by the spirit of *Creatures* (1996): autonomous Luma with genetics, biochemistry-style needs, heritable temperament, multidimensional relationships, and a compact working settlement. Runs offline in the browser (desktop + mobile).

See `docs/ARCHITECTURE.md` (stack + systems) and `DESIGN.md` (visual direction).

## Systems (pure TypeScript, tested)

- **Mind** — utility scoring + tiny TF.js net + psyche (stress, belonging, values)
- **Social** — asymmetric trust/affection/attraction/resentment edges; households; gossip
- **Dialogue** — semantic intents + offline NL for player talk; compact creature↔creature chatter
- **Genetics / life** — crossover + mutation; aging; abstract reproduction with population caps
- **Economy** — scarcity prices, work, bank, clinic, pharmacy, market, tavern
- **Persistence** — versioned saves (v5), autosave, graceful recovery
- **Performance** — sim LOD, AI time-slicing, quality presets aimed at ~60 FPS on a G14-class laptop
