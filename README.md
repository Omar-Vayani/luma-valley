# Luma Haven

A first-person artificial-life game — a spiritual successor to the *idea* of *Creatures* (1996), not a copy. You live among **Luma**, autonomous beings with genetics, needs, emotions, memories, relationships, jobs, and a small functioning settlement.

**Offline-first.** Runs in any modern browser. No account, no mandatory cloud AI.

## Quick start

```bash
npm install
npm run dev       # open the local URL (Vite)
npm test          # simulation + UI contract tests
npm run build     # production build → dist/
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
- **Consequences** — theft changes ownership, memory, trust, reputation, prices, and the settlement's own norms

## Why did that creature do that?

Select a Luma and open the 🧠 inspector: it shows current needs, the top action
scores, plain-language reasoning, relationships, family, habits, beliefs (with
how sure they are and where they came from), promises made to them, and recent
conversation. The 🏘️ panel does the same for the settlement.

## Performance (G14 / RTX 5070 laptop class)

Defaults: medium quality, population cap 16, AI batch 4, sim 6 Hz, pixel-ratio cap 1.5. Distant and sleeping Luma update less often. Trade quality, population, and AI batch in settings; F3 shows the live frame and simulation cost so you can tune toward ~16 ms/frame.

## Honest limitations

Dialogue is rule-based and offline (no language model per creature). Buildings are exterior shells with usable furniture rather than full interiors. Goods do not yet flow between institutions. The player cannot jump, crouch, or drag objects. The optional cloud dialogue provider is implemented and tested but not wired to an endpoint. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and the [task board](docs/tasks/README.md) for what remains.

## Docs

- [`docs/VISION.md`](docs/VISION.md) — full product vision prompt
- [`docs/tasks/README.md`](docs/tasks/README.md) — task board (one system per file)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack choice, systems, limits
- [`DESIGN.md`](DESIGN.md) — visual direction

## License

MIT
