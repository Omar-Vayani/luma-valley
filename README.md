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
| 🧠 Inspector | Why did they do that? needs, scores, bonds, memories |
| ⚙️ Settings | Quality, population cap, AI batch, gentle mode, save |
| Dock tools | Spawn, drop bread/coins, comfort/heal/gift, poke/hit/scare/rob |
| 💬 Teach | Associate a word with a concept nearby Luma can learn |

Saves autosave to the browser (~every 20s). Use **save now** in settings, or `?fresh=1` to start clean.

## What is alive (not scripted)

- Utility mind + tiny neural net + psyche — decisions from needs, genes, reputation, habits
- Multidimensional relationships (trust, affection, attraction, resentment…)
- Love, jealousy, households, abstract reproduction with inheritance
- Economy with scarcity prices, work, bank, clinic, pharmacy, tavern, market
- Theft, gossip, forgiveness, rivalry — events ripple through memory and reputation
- Typed conversation: creatures evaluate trust before believing or obeying

## Performance (G14 / RTX 5070 laptop class)

Defaults: medium quality, population cap 16, AI batch 4, sim 6 Hz, pixel-ratio cap 1.5. Distant / sleeping Luma update less often. Trade quality, population, and AI batch in settings. Frame-cost readout helps you stay near ~16 ms/frame.

## Docs

- [`docs/VISION.md`](docs/VISION.md) — full product vision prompt
- [`docs/tasks/README.md`](docs/tasks/README.md) — task board (one system per file)
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack choice, systems, limits
- [`DESIGN.md`](DESIGN.md) — visual direction

## License

MIT
