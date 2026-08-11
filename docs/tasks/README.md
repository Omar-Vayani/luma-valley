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

## What is left

Every task on this board is implemented. What remains is not a checklist, it is
the work that only playing reveals:

- **Balance.** The settlement holds a stable population across every seed
  tested, but whether it is *interesting* over an hour is a judgement no test
  makes. Expect to tune fertility, lifespan, and how harshly needs bite.
- **Depth per system.** Every system is real but shallow in places: a shop
  cannot be robbed at night, a mentor teaches places and words but not skills,
  norms cover six expectations rather than twenty.
- **Presentation beyond readability.** Animation, sound, lighting, and a
  larger world were deliberately deferred; the groundwork is stable enough to
  build on now.
- **A recorded human play session.** Automated checks and a scripted demo are
  not the same as somebody playing for an hour and saying what was boring.

## How to use a task file

1. Read **Goal**, **Acceptance**, and **Out of scope**.
2. Skim **Current state** so you do not rebuild finished work.
3. Implement only that task’s acceptance criteria.
4. Add/adjust automated tests for sim rules you touch.
5. Update **Status** and a one-line **Notes** entry with the date.
6. Commit on a feature branch; keep the vision file unchanged unless the product intent itself changes.
