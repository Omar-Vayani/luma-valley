# Luma Haven

A first-person artificial-life game inspired by the spirit of *Creatures*
(1996): autonomous Luma with genetics, biochemistry-style needs, heritable
temperament, multidimensional relationships and a working settlement — in a
valley you can walk out of, with two centuries of history attached to it.

Runs offline in the browser. See [`README.md`](README.md) to play,
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how it is put together and
[`DESIGN.md`](DESIGN.md) for the visual direction.

## The simulation (pure TypeScript, tested)

- **Mind** — utility scoring, a small TF.js net, and a psyche of stress,
  belonging and values
- **Social** — asymmetric trust, affection, attraction and resentment;
  households, courtship, gossip, mediation
- **Dialogue** — semantic intents plus offline natural language for the player;
  compact chatter between Luma
- **Genetics and life** — crossover and mutation, aging, life stages,
  reproduction under population caps
- **Economy** — scarcity pricing, wages, tills per institution, debt, theft with
  consequences, supply chains between trades
- **Persistence** — versioned saves with migrations, autosave, graceful recovery
- **Performance** — simulation level-of-detail and AI time-slicing, independent
  of frame rate

## The game on top of it

- A half-kilometre valley: woods, a river, a lake, mountains that close it in,
  and twelve landmarks that are the evidence of its history
- First-person movement with the controls everyone already has: sprint, jump,
  crouch, swim, hold to work
- Gathering, crafting that needs a workshop, and small-scale building
- Requests read off live need rather than a quest script
- A journal, a map, a chronicle, and an inspector that shows the state any
  decision came out of
