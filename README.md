# Luma Haven

A first-person artificial-life game. You live in a valley with the **Luma** —
autonomous beings with genetics, needs, emotions, memories, families, jobs and
grudges — in a settlement that keeps going whether or not you are watching.

It is a spiritual successor to the *idea* of *Creatures* (1996): the depth is in
the minds, not the scripts. Nothing here is on rails, and nothing waits for you.

**Runs in any modern browser, offline, with no account.**

```bash
npm install
npm run play          # builds, then serves at http://localhost:4173
```

[`PLAY.md`](PLAY.md) walks through a first session. [`HOSTING.md`](HOSTING.md)
covers putting it on the web.

---

## What it is to play

You arrive on the South Road with a loaf, a flask and something worth giving
away. Ahead is Haven: a plaza around a well, shops along Market Row, cottages
on their own lane, a smithy and a workyard downwind, fields to the west and a
resting ground east of the green.

Around it is a valley of about half a kilometre across — woods, a river, a lake,
a burned watchtower, standing stones — with two centuries of history attached to
it, most of which the Luma will tell you about if you ask.

- **Walk, sprint, jump, crouch, swim.** The controls are the ones you already
  know. The crosshair tells you what you are pointing at and what pressing E
  would do to it. Walls, trunks, boulders and market stalls are all solid.
- **Go inside.** Buildings have interiors: a hearth and a bed in a cottage, a
  long table in the Commons Hall, shelves and a counter in a shop.
- **Take things out of the valley.** Hold E to pick berries, cut grain, chop
  fallen wood, break stone, gather herbs, fish the shallows. Everything grows
  back on its own clock.
- **Make things.** Bake at a hearth, mix remedies at the apothecary, forge a
  lantern at the smithy. Most recipes need a workshop, which means standing in
  a building while somebody works in it.
- **Trade.** Every shop has a counter. Buy at the prices the Luma pay, out of
  the stock they empty, and sell into a till that can be too empty to pay you.
- **Be asked for things.** The notice board in the plaza carries what Haven
  actually needs right now, read off the live simulation: somebody hungry and
  broke, a fever with the infirmary a walk away, an empty shelf because the
  farmer died, two neighbours who have stopped speaking. Ignore them and the
  underlying problem goes on being a problem.
- **Teach them words.** Say a word for a thing and everyone in earshot starts
  using it. Enough of them agreeing makes it the settlement's word.
- **Build a little.** Set lanterns, fence posts and stone markers down anywhere,
  and pick them back up.
- **Find the twelve places.** Each one enters your journal with what it means.

## What is alive, and not scripted

The simulation is the part that was already good, and it is untouched by the
rebuild:

- **Minds** — utility scoring, psyche and habits decide what each Luma does
  next, and every one of them has a small neural network of its own that
  learns from how its choices turn out. It fades in behind instinct as they
  live, so two Luma with the same genome and the same needs end up different
- **Habits** — beer, a smoked leaf, a hard stimulant and a bought focus, each
  with tolerance that makes use escalate, intoxication that makes people brave
  and careless, withdrawal that outbids ordinary needs, and a settlement that
  minds about the hard stuff far more than about beer
- **Beliefs** — they learn by seeing or being told, can be wrong, and change
  their minds under evidence
- **Deception** — a desperate or spiteful Luma may lie; a suspicious, familiar
  listener may catch it
- **Feelings** — pride, shame, guilt, gratitude, hope, envy and grief arise from
  what happens, and shift how much risk they will take
- **Relationships** — asymmetric trust, affection, attraction, respect,
  resentment; courtship, rejection, partnership, separation, reconciliation
- **Families** — households claim houses, adults feed or neglect children,
  culture passes down
- **Work** — shopkeepers, healers, bartenders, farmers, porters and teachers
  staff the institutions and keep their own tills
- **Economy** — scarcity pricing, subjective value, haggling, refusal of known
  thieves, debts, inequality
- **Supply chains** — the farmer grows the grain the baker needs, so a death
  upstream empties a shelf downstream
- **Consequences** — theft changes ownership, memory, trust, reputation, prices,
  and the settlement's own norms

## Why did they do that?

Look at a Luma and press **I**. You get the actual state the decision came out
of: current needs, the top action scores, the reasoning in plain language,
beliefs with how sure they are and where they came from, relationships
dimension by dimension, family, debts, promises made to them, and their life
so far.

Press **H** for the settlement's own chronicle, where every line carries its
cause:

> *Ruxster stole 2 coins from NaxVee — starving*
> *NioFen the farmer died, leaving FloPip — failing health*
> *no bread: no shopkeeper in Haven*

## Controls

| Input | Action |
|---|---|
| W A S D | Move |
| Mouse | Look |
| Shift / Ctrl / Space | Sprint / crouch / jump |
| E | Interact — hold for the slow jobs |
| Left click | Give what you hold to whoever you are looking at — or, empty-handed, a hand on their shoulder |
| Right click | Set it down in the world |
| Q | Drop it |
| 1–9, scroll | Hotbar |
| Tab | Pack and crafting |
| R | Notice board |
| J | Journal — places, history, what you have done |
| H | Haven — chronicle, norms, work, trade |
| I | Mind of whoever you are looking at |
| M | Map |
| O | Settings |
| P | Pause · `,` `.` speed |
| F3 | Performance overlay |
| Esc | Close anything |

## Performance

Built for a gaming laptop; the default preset is **high**. Four presets trade
shadow resolution, draw distance, ground cover and anti-aliasing. The world is
one flat-shaded terrain mesh, a few thousand instanced plants in chunks that
cull, and eighteen buildings merged down to one mesh per material — roughly
500–1000 draw calls and 1.5–2.5M triangles at high, well inside a modern GPU.

The simulation runs at 6 Hz independently of the frame rate, with level-of-detail
and time-slicing so distant and sleeping Luma cost almost nothing.

## Development

```bash
npm run dev        # hot-reloading dev server
npm test           # 500+ unit tests over the simulation, world and gameplay
npm run playtest   # drives a real browser: walks, gathers, crafts, talks, gives
npm run gallery    # screenshots of the valley at three times of day
npm run perf       # draw calls and triangles per quality preset
npm run bench      # simulation cost
npm run balance    # simulated hours across seeds: survival, pacing, variety
npm run lint
npm run build
```

`npm run playtest`, `gallery` and `perf` need `npm run dev` running in another
terminal.

## Layout

| Path | What lives there |
|---|---|
| `src/lab/` | The simulation. Minds, bodies, society, economy, saves. No rendering. |
| `src/world/` | The valley: one deterministic height function, its history, and what grows where. |
| `src/game/` | Being a player in it: movement, input, targeting, gathering, crafting, requests, progress. |
| `src/render/` | Three.js. Terrain, water, sky, architecture, creature rigs, effects, the loop. |
| `src/ui/` | React. The HUD and nine panels. Never touches the scene. |

Documentation: [vision](docs/VISION.md) · [architecture](docs/ARCHITECTURE.md) ·
[task board](docs/tasks/README.md)

## Honest limitations

- The valley is hand-designed and always the same one. Only the Luma vary.
- Buildings have exteriors, not interiors. You interact at doors and counters.
- There is no combat system worth the name, on purpose.
- Sound is synthesised from a few oscillators. There is no music.
- Nothing is voice-acted, and the optional cloud dialogue service is exactly
  that — optional, off by default, and never required.

## Credits

Nature and prop models from the low-poly packs listed in
[`ASSET_CREDITS.md`](ASSET_CREDITS.md). Everything man-made in the valley —
buildings, fences, lanterns, the bridge, the creatures themselves — is generated
in code.
