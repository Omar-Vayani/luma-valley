# Architecture

Four layers, and one rule between each pair: the layer below never knows the
layer above exists.

```
src/lab/      the simulation      minds, bodies, society, economy, saves
src/world/    the place           terrain, history, what grows where
src/game/     being in it         movement, input, targeting, gathering, requests
src/render/   the picture         three.js: terrain, water, sky, buildings, rigs
src/ui/       the interface       react: HUD and panels
```

`src/lab` has no imports from any of the others. `src/render` never imports
React. `src/ui` never imports three. If those three statements stop being true,
the seams have gone.

---

## The simulation — `src/lab/`

Plain, JSON-safe data with a single entry point: `sim.tick()`. One tick advances
the settlement by one step; the renderer calls it at 6 Hz regardless of frame
rate. Within a tick, work is phased (`minds`, `bodies`, `economy`, `social`,
`world`) and each phase is timed, which is what the F3 overlay reports.

Level of detail is by distance from the player: near Luma get a full utility
re-score every tick, mid ones get one every few ticks, far ones only age and
metabolise. `settings.aiBatchSize` caps how many full re-scores happen per tick,
so the cost is bounded no matter the population.

This layer was not touched by the rebuild, beyond a faster walking pace for a
larger valley and four new gatherable items. Its 400-odd tests still describe
it.

## The place — `src/world/`

**`terrain.ts`** is one deterministic height function and the authority on the
shape of the valley. The renderer tessellates it, the player's feet read it, and
the scatter pass asks it where a tree can stand. There is no seed: this is *the*
valley, the same one on every machine, which is what lets the history refer to
specific ground.

It composes, outward from the plaza: a flattened basin, rolling hills, mountains
at the rim that hide the world's edge, the Coldrun carved down the east side
into Mirror Lake, roads cut and filled but only across ground a road would
plausibly be built on, and a level pad under every landmark. A final rule keeps
the settlement's own ground above the water line, because a valley floor that
grows ponds looks like a bug.

**`lore.ts`** is two centuries of history and the twelve landmarks that are its
evidence. **`scatter.ts`** places several thousand plants and rocks
deterministically, refusing water, roads, steep ground and building footprints,
and promotes some of them into the resource nodes the player harvests.

## Being in it — `src/game/`

**`input.ts`** is the only place that decides whether a key means "walk forward"
or the letter W. When a text field has focus or a panel owns the screen, the
world gets no keys at all, and anything held down is released rather than left
stuck.

**`controller.ts`** is the feel: acceleration and stopping, gravity, a
one-metre jump with coyote time, sprint with a field-of-view kick, crouch,
swimming, head bob, footsteps that know what ground you are on, and a slope
limit that makes the rim a wall. Collision is a height field lookup for the
ground and circles for buildings — no physics engine, and skipping one leaves
the frame budget for the world.

**`targeting.ts`** casts a short cylinder down the middle of the screen and
takes the first thing it hits. This replaced picking whoever was nearest, which
is why talking to a crowd used to answer with the same Luma however you turned.

**`gather.ts`**, **`craft.ts`**, **`requests.ts`** and **`progress.ts`** are the
player's own loop: hold-to-gather with regrowth, recipes that mostly need a
workshop, requests read off live need rather than a quest script, and the
standing, discoveries and built things that belong to your particular visit.

Requests are the interesting one. Nothing is authored: a scan every ten seconds
of game time looks for somebody hungry and unable to pay, a fever, an empty
shelf with a cause, a grieving neighbour nobody has visited, two Luma whose
mutual resentment has crossed a line. Completing one changes the real
underlying state; letting it expire leaves the problem in place.

## The picture — `src/render/`

**`engine.ts`** owns the renderer, an ACES tone curve, optional MSAA, bloom and
a warm grade with the blacks lifted, behind four quality presets that trade
shadow resolution, draw distance and ground cover.

**`atmosphere.ts`** is the sky dome, the sun's arc, the moon on the other side
of it, stars, drifting clouds, and a keyframed light rig. The settlement already
kept hours; this makes them visible. Dusk carries a lot of fill light on
purpose — a low sun lights almost nothing that faces upward, and a valley you
cannot read is not atmospheric.

**`assets.ts`** bakes the low-poly nature packs into instanceable geometry:
merge the sub-meshes, bake each material's colour into vertex colours *per
geometry group* (doing it per mesh is how every tree ended up the colour of
bark), lift the very dark authored greens with a gamma knee, and normalise
height so a pine is a pine whichever file it came from.

**`scatter-view.ts`** draws those instances in chunks that frustum-cull, with a
one-sine wind in the vertex shader phase-shifted by world position.

**`architecture.ts`** generates every building from a kit of parts — posts,
plaster panels, timber framing, tiled roofs, awnings — then merges each one down
to a single mesh per material. The plaza, lamp posts, the Old Bridge and the
twelve landmarks are built the same way, so the settlement shares one look with
the nature models: flat-shaded and untextured.

**`luma.ts`** rebuilds the creatures as an articulated rig — hips, torso, head,
ears, arms, legs, tail — posed every frame from what the mind is already doing.
Nothing is keyframed, so the animation cannot drift out of sync with the state
driving it: gait from measured speed, lean from mood, ears back when frightened,
tail wagging when happy, a moving mouth while talking, curled up asleep.

**`world-view.ts`** is the loop. It owns the player, drives the simulation
clock, resolves interactions, and hands React a HUD snapshot ten times a second.

## The interface — `src/ui/`

One HUD and nine panels on one design language. The HUD keeps the middle of the
screen clear except for the crosshair and what the crosshair is telling you;
anything that needs reading is a panel. Icons are drawn in SVG rather than
borrowed from an emoji font, so the interface is the same shape everywhere.

Opening a panel releases the pointer lock and stops the world hearing the
keyboard. It does **not** pause the simulation — the valley does not wait while
you read about it.

## Persistence

The world saves through `src/lab/save.ts` (versioned, with migrations) into
local storage, with a one-deep backup, three manual slots, and export/import.
The player's own progress saves separately and merges over defaults on load, so
an older save opens rather than breaking.

## Testing

- **`npm test`** — 500-odd unit tests. The simulation's own suite, plus the
  terrain (determinism, drainage, buildable ground, road gradients), the scatter
  (nothing in the lake or on a road), gathering, crafting, requests, progress,
  the controller (walk, sprint, jump, swim, slopes, bounds) and targeting.
- **`npm run playtest`** — drives a real browser through a real session: loads,
  walks, opens a conversation, types without walking into a wall, checks the
  crosshair picks who you point at, gathers a bush, bakes a loaf, gives it away,
  sets a lantern down, finds a landmark, and opens every panel. This catches the
  class of bug a unit test cannot: an element that renders but has no size, a
  key that is swallowed, an interaction that fires on the wrong target.
- **`npm run perf`** — draw calls and triangles per preset from five viewpoints.
- **`npm run balance`** — simulated hours across seeds, judging survival,
  pacing, variety and cause of death.

## Measured

On the software rasteriser used in CI, frame times are meaningless; draw calls
and triangles are not, and they are the same on any GPU:

| Preset | Draw calls | Triangles |
|---|---|---|
| low | 110–560 | 0.7–1.5 M |
| medium | 200–750 | 1.2–2.2 M |
| high | 520–1000 | 1.5–2.5 M |
| ultra | 370–1130 | 1.5–2.8 M |

The simulation costs roughly 1–3 ms per tick at 20 living Luma with the default
batch size, six times a second, independent of the frame rate.

## Genuine limitations

- The valley is hand-designed and always the same. Only the Luma vary.
- Buildings have exteriors only; you interact at doors and counters.
- Shadows come from a single directional light with one cascade, so very long
  dawn shadows lose resolution at the far edge of the map.
- The creature rig is procedural, which keeps it in sync with the mind but caps
  how expressive it can get. Hand-authored animation would go further.
- Sound is a handful of oscillators. There is no music.
