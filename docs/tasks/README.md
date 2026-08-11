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
| [18](./18-presentation-pass.md) | Social readability (not fidelity) | `todo` |
| [19](./19-optional-cloud-ai.md) | Optional richer voice, never required | `done` |
| [20](./20-vertical-slice-acceptance.md) | Acceptance checklist for the first complete version | `partial` |

## What is left

The simulation and the ways of reading it are in place. What remains is depth
in a few named places, plus the presentation pass that was always meant to come
last:

1. **18 Social readability** — you still cannot tell by looking who the healer
   is, who lives with whom, or that these two are furious with each other.
   This is now the highest-value remaining work, because it is the last big
   gap between "the society is deep" and "the player perceives it".
2. **09 Institutions** — goods are a shared settlement stock rather than each
   institution holding its own till and stores; no opening hours.
3. **11 Social status** — reputation gates trade, but status does not yet
   change access to housing, work, or help.
4. **02 Keyboard access** — panels are mouse-driven; there are no shortcuts.
5. **13/14 Per-system profiling** — the overlay reports frame and simulation
   totals, not a breakdown by subsystem.
6. **19 Voice indicator** — nothing shows which voice is currently in use.
7. **20 Acceptance** — needs a recorded play session as evidence, not just
   green tests.

## How to use a task file

1. Read **Goal**, **Acceptance**, and **Out of scope**.
2. Skim **Current state** so you do not rebuild finished work.
3. Implement only that task’s acceptance criteria.
4. Add/adjust automated tests for sim rules you touch.
5. Update **Status** and a one-line **Notes** entry with the date.
6. Commit on a feature branch; keep the vision file unchanged unless the product intent itself changes.
