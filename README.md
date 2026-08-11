# Luma Haven

A first-person artificial-life game — a spiritual successor to the *idea* of *Creatures* (1996), not a copy. You live among **Luma**, autonomous beings with genetics, needs, emotions, memories, relationships, jobs, and a small functioning settlement.

**Offline-first.** Runs in any modern browser. No account, no mandatory cloud AI.

## Play it

```bash
npm install
npm run play        # builds, then serves at http://localhost:4173
```

That is the whole setup. [`PLAY.md`](PLAY.md) covers the other ways in
(hot-reloading dev server, publishing to GitHub Pages, installing it on a
phone) and walks through a first session.

```bash
npm run dev         # same game, hot reload, http://localhost:5173
npm test            # simulation + UI contract tests
npm run bench       # measure simulation cost on your machine
npm run verify:hud  # headless check that the HUD is usable (needs the dev server)
npm run build       # production build → dist/
```

Or open a Netlify deploy of this repo. On first launch you wake in the plaza of **Haven** with a handful of Luma already living their lives.

### Controls

| Input | Action |
|---|---|
| WASD / left touch zone | Move |
| Mouse look / right touch zone | Look |
| Click lock button | Pointer lock (desktop) |
| Tap a Luma | Select + open talk |
| 🗨️ Talk | Type natural language (greet, ask, request, flirt, apologize…) |
| 🧠 Inspector | Why did they do that? needs, scores, beliefs, bonds, family |
| 🏘️ Society | Norms, who is respected, work roles, overheard talk, chronicle |
| ⚙️ Settings | Quality, population cap, AI batch, gentle mode, saves, export/import |
| F3 | Performance overlay (frame time, sim time, population) |
| Furniture buttons | Rest in a bed, open a door, take from or store in a chest |
| Dock tools | Spawn, drop bread/coins, comfort/heal/gift, poke/hit/scare/rob |
| 💬 Teach | Associate a word with a concept nearby Luma can learn |

Saves autosave to the browser (~every 20s) with a one-deep backup, plus three
manual slots and `.luma.json` export/import. Use `?fresh=1` to start clean.

## What is alive (not scripted)

- **Minds** — utility scoring, a tiny neural net, psyche, and habits decide what to do
- **Beliefs** — creatures learn by seeing or being told, can be wrong, and change their minds under evidence
- **Deception** — a desperate or spiteful Luma may lie; a suspicious, familiar listener may catch it
- **Feelings** — pride, shame, guilt, gratitude, hope, envy and grief arise from what happens and shift risk-taking
- **Relationships** — asymmetric trust, affection, attraction, respect, resentment; courtship, rejection, partnership, separation, reconciliation, widowhood
- **Families** — households claim houses, adults feed (or neglect) children, culture passes to the next generation
- **Work** — shopkeepers, healers, bartenders, farmers, porters and teachers staff the institutions; their shifts restock the shelves
- **Economy** — scarcity pricing, subjective value, haggling, refusal of known thieves, debts, inequality
- **Supply chains** — the farmer grows the grain the baker needs, so a death upstream empties a shelf downstream
- **Obligations** — a healer treats someone who cannot pay, and that debt follows both of them
- **Social moves** — mentoring the young, stepping between two fighters, flattery that gets seen through, alliances built from mutual help
- **Consequences** — theft changes ownership, memory, trust, reputation, prices, and the settlement's own norms

## Why did that creature do that?

Open the 🏘️ panel and Haven tells you what people are talking about, each line
with the reason behind it:

> *Ruxster stole 2 coins from NaxVee — starving*
> *AxeGot stole 2 coins from TukEum, who trusted them — takes what they want*
> *NioFen the farmer died, leaving FloPip — failing health*
> *no bread: no shopkeeper in Haven*

Select a Luma and open the 🧠 inspector for the rest: needs, the top action
scores, plain-language reasoning, relationships, family, habits, beliefs (with
how sure they are and where they came from), debts, promises made to them, and
their life so far.

## Performance (G14 / RTX 5070 laptop class)

Defaults: medium quality, population cap 16, AI batch 4, sim 6 Hz, pixel-ratio cap 1.5. Distant and sleeping Luma update less often.

`npm run bench` measures the simulation on your own machine. On the development machine, 16 Luma at medium cost 0.22 ms per tick — under 8% of a 60 FPS frame budget — so rendering, not thinking, is what you tune. F3 shows the live cost in game.

## Honest limitations

Dialogue is rule-based and offline; there is no language model per creature, and you can point the game at your own service if you want richer wording. Buildings are exterior shells with usable furniture rather than interiors. Institutions have no opening hours. There is no verticality, so no jumping or climbing. Benchmarks come from the development machine, not from a G14. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the [task board](docs/tasks/README.md) for what remains.

## Docs

- [`docs/VISION.md`](docs/VISION.md) — full product vision prompt
- [`docs/tasks/README.md`](docs/tasks/README.md) — task board (one system per file)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack choice, systems, limits
- [`DESIGN.md`](DESIGN.md) — visual direction

## License

MIT
