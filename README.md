# Luma Valley

A 3D artificial-life game inspired by the original *Creatures* (1996). Raise tiny creatures with **real brains** — neural networks that learn from pleasure and pain, heritable genetics, biochemistry, and permadeath that makes every little life matter.

**Live demo:** deploy via Netlify — or run locally with `npm run dev`.

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/Omar-Vayani/luma-valley)

## What makes it alive (not scripted)

- **Neural-net brains** — each creature has a small network of neurons (perception → decision → motor) with dendrite weights, thresholds, and leak.
- **Learning** — pleasure/pain chemicals reinforce the connections that caused the behavior (Hebbian + eligibility traces). You can literally *train* a creature: feed it when it comes to you, and it learns to come.
- **Biochemistry** — hunger, thirst, fatigue, boredom, loneliness, fear, pleasure, pain, health. Drives are chemicals feeding the brain.
- **Genetics** — chromosome-style genes control appearance, temperament, brain parameters, lifespan, and fertility. Breeding mixes parents' genomes with mutation; children look and behave like their parents.
- **Language** — teach words ("food", "water", "come") and creatures respond to them.
- **World** — a procedural low-poly valley with a stream, berry bushes, a den, and a day/night cycle. Your world is yours — fixed by seed, saved with you.
- **Persistence** — autosave to your browser, three manual slots, and export/import `.luma.json` save files (a few dozen KB per world).

## Controls

- **Tap/click** a creature to select it and open its care panel
- **Feed / Tickle / Carry** — build a bond; every interaction is reinforcement learning
- **Teach words** — type a word or use the chips; creatures learn and respond
- **Drag** to orbit the camera; scroll to zoom; **☰ menu** for saves, gentle mode, follow, sound
- **Gentle mode** — no permadeath from hunger/thirst (old age still comes for everyone)

## Tech

- Vite + React 19 + TypeScript, Three.js (WebGL), pure-TS TDD simulation core (48 unit tests)
- Works in any modern browser — desktop and mobile
- No backend, no accounts, no assets to download — everything is procedural

## Development

```bash
npm install
npm run dev       # local dev server
npm test          # vitest (sim core)
npm run lint      # oxlint
npm run build     # production build → dist/
```

## License

MIT
