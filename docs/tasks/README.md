# Luma Haven — Task Board

Master vision: [`docs/VISION.md`](../VISION.md)  
Architecture notes: [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)

Each task is a self-contained brief for a future session. Pick one file, implement it, update its **Status**, then open the next. Do not try to finish the whole vision in one shot.

## Status legend

| Status | Meaning |
|---|---|
| `done` | Vertical-slice quality in tree; deepen only if a later task requires it |
| `partial` | Exists but missing important vision items |
| `todo` | Not started or only stubbed |
| `blocked` | Waiting on another task |

## Recommended order

Work top-to-bottom within a wave. Waves are dependency-aware, not calendar estimates.

### Wave 0 — Foundation

| ID | Task | Status |
|---|---|---|
| [00](./00-stack-and-architecture.md) | Stack decision, project inspection, launch path | `done` |
| [01](./01-settlement-world.md) | Small dense 3D settlement | `done` |
| [02](./02-first-person-controls.md) | First-person movement & interaction | `done` |
| [03](./03-creature-population.md) | Modest persistent population | `done` |
| [14](./14-performance-lod.md) | LOD, time-slicing, settings, ~60 FPS target | `done` |
| [12](./12-persistence.md) | Versioned save/load + autosave | `done` |
| [13](./13-ai-inspector.md) | Mind inspector & perf debugging | `done` |

### Wave 1 — Creature minds (core fantasy)

| ID | Task | Status |
|---|---|---|
| [05](./05-needs-emotions-psyche.md) | Needs, emotions, personality, memory, psyche | `done` |
| [04](./04-communication.md) | Player + creature communication (semantic + NL) | `done` |
| [06](./06-genetics-lifecycle.md) | Genetics, aging, love, abstract reproduction | `done` |
| [07](./07-families-relationships.md) | Families, multidimensional relationships | `done` |
| [15](./15-learning-beliefs.md) | Learning, beliefs, habits, deception, forgetting | `done` |

### Wave 2 — Society & economy

| ID | Task | Status |
|---|---|---|
| [08](./08-items-inventory-ownership.md) | Items, inventory, ownership, substances | `done` |
| [21](./21-story-surfacing.md) | Surfacing the stories the simulation produces | `done` |
| [09](./09-buildings-institutions.md) | Institutions with real supply chains | `done` |
| [10](./10-economy.md) | Economy with consequences | `done` |
| [11](./11-social-emergence.md) | Social behaviours that create stories | `done` |
| [16](./16-health-survival.md) | Full needs set, illness, injury, purpose, privacy | `done` |

### Wave 3 — Immersion & polish

| ID | Task | Status |
|---|---|---|
| [17](./17-movement-world-interaction.md) | Being physically present in the world | `done` |
| [18](./18-presentation-pass.md) | Social readability (not fidelity) | `done` |
| [19](./19-optional-cloud-ai.md) | Optional richer voice, never required | `done` |
| [20](./20-vertical-slice-acceptance.md) | Acceptance checklist for the first complete version | `done` |

### Wave 4 — The presentation and player rebuild

Not on the original board. The simulation had reached the point where the
honest verdict was that it was a good simulation and a poor game: the world was
eighteen kiosks on a flat green square, the interface was a debug panel, and
the only verb the player had was watching. This wave replaced everything above
`src/lab/`.

| Task | Status |
|---|---|
| A valley with geography and a history (`src/world/`) | `done` |
| A settlement laid out like a place rather than a ring | `done` |
| Renderer rebuild: atmosphere, terrain, water, instancing, post | `done` |
| Architecture generated from a kit of parts | `done` |
| Creature rigs animated from simulation state | `done` |
| First-person feel: gravity, jump, sprint, swim, head bob | `done` |
| Crosshair targeting, replacing nearest-body picking | `done` |
| A loop for the player: gather, craft, build, be asked for help | `done` |
| Interface rebuild: HUD and nine panels | `done` |
| A browser playtest harness that drives a real session | `done` |

### Wave 5 — Depth, and the parts that were not working

| Task | Status |
|---|---|
| Make the per-creature neural nets real: synchronous, wired into decisions | `done` |
| Substances with tolerance, intoxication, withdrawal and social consequence | `done` |
| A calm settlement: walking pace, and animation that does not teleport | `done` |
| Creatures rebuilt to human proportions with a real walk cycle | `done` |
| Collision across the whole valley, not just eighteen circles | `done` |
| Bigger buildings, with interiors and eight historical outbuildings | `done` |
| An economy the player is part of: buying and selling at counters | `done` |
| Drawn item icons; the top-right toolbar made reachable | `done` |
| Schooling, trade, habits, vocabulary and learning shown in the inspector | `done` |
| Cleanup: dead observer tools, a duplicated addiction key, stale docs | `done` |

## What is left

Every task on this board is implemented. `npm test` covers the rules,
`npm run playtest` covers a real session in a real browser, and `npm run
balance` still judges simulated hours across seeds for survival, pacing and
variety.

What remains is the kind of work only a person playing can direct:

- **Taste.** The numbers say an hour is varied and survivable, and the valley
  now looks like somewhere. Whether it is *gripping* is a judgement no harness
  makes. Play it, then tune fertility, lifespan, how hard needs bite, and how
  often Haven asks you for something.
- **More depth per system.** Everything is real but finite: six norms rather
  than twenty, one shift pattern per trade, eight recipes, nine kinds of
  request, mentors who teach places and words but not a craft.
- **Interiors** exist now, but they are one room with furniture in it. Upper
  floors, back rooms and doors that shut are all still missing.
- **Sound.** A handful of oscillators, and no music.
- **Creature collision** with trees and walls. Walkers deflect around building
  footprints but will still walk through a trunk; only the player is tested
  against the full collision grid.
- **Hand-authored animation.** The procedural rig cannot drift out of sync with
  the mind driving it, which is the point, but it caps how expressive a Luma
  can be.

## How to use a task file

1. Read **Goal**, **Acceptance**, and **Out of scope**.
2. Skim **Current state** so you do not rebuild finished work.
3. Implement only that task’s acceptance criteria.
4. Add/adjust automated tests for sim rules you touch.
5. Update **Status** and a one-line **Notes** entry with the date.
6. Commit on a feature branch; keep the vision file unchanged unless the product intent itself changes.
