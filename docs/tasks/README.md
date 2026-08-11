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
| [02](./02-first-person-controls.md) | First-person movement & interaction | `partial` |
| [03](./03-creature-population.md) | Modest persistent population | `done` |
| [14](./14-performance-lod.md) | LOD, time-slicing, settings, ~60 FPS target | `partial` |
| [12](./12-persistence.md) | Versioned save/load + autosave | `done` |
| [13](./13-ai-inspector.md) | Mind inspector & perf debugging | `done` |

### Wave 1 — Creature minds (core fantasy)

| ID | Task | Status |
|---|---|---|
| [05](./05-needs-emotions-psyche.md) | Needs, emotions, personality, memory, psyche | `done` |
| [04](./04-communication.md) | Player + creature communication (semantic + NL) | `partial` |
| [06](./06-genetics-lifecycle.md) | Genetics, aging, love, abstract reproduction | `done` |
| [07](./07-families-relationships.md) | Families, multidimensional relationships | `done` |
| [15](./15-learning-beliefs.md) | Learning, beliefs, habits, deception, forgetting | `done` |

### Wave 2 — Society & economy

| ID | Task | Status |
|---|---|---|
| [08](./08-items-inventory-ownership.md) | Items, inventory, ownership, substances | `done` |
| [09](./09-buildings-institutions.md) | Functional institutions operated by creatures | `partial` |
| [10](./10-economy.md) | Scarcity economy, jobs, banking, negotiated trade | `partial` |
| [11](./11-social-emergence.md) | Trust, crime, norms, leaders, cultural knowledge | `partial` |
| [16](./16-health-survival.md) | Full needs set, illness, injury, purpose, privacy | `done` |

### Wave 3 — Immersion & polish

| ID | Task | Status |
|---|---|---|
| [17](./17-movement-world-interaction.md) | Jump/crouch, doors, furniture, shared world rules | `partial` |
| [18](./18-presentation-pass.md) | Atmosphere, animation, audio (after sim is fun) | `todo` |
| [19](./19-optional-cloud-ai.md) | Optional cloud NL assist (never mandatory) | `partial` |
| [20](./20-vertical-slice-acceptance.md) | Acceptance checklist for the first complete version | `partial` |

## What is left (short version)

The simulation core is complete enough to play. The remaining work is mostly
depth and presentation:

1. **04 Communication** — creature↔creature dialogue exists as semantics with
   overheard rendering; still missing negotiation dialogue loops and player-visible
   promise-making.
2. **09 Institutions / 10 Economy** — roles are staffed and production restocks
   shelves, but supply chains between institutions (farm → market, pharmacy →
   clinic) and debt/haggling UI are shallow.
3. **11 Social emergence** — norms, influence, and cultural inheritance work;
   mediation, mentorship, and alliance-building are not yet scored actions.
4. **02 / 17 Movement** — jump, crouch, and carrying/dragging objects are absent;
   fixtures and reach rules are in place.
5. **14 Performance** — LOD and settings exist; no profiling run on the actual
   target laptop has been recorded.
6. **19 Cloud AI** — provider interface and fallback are implemented and tested;
   no endpoint is wired to the settings toggle yet.
7. **18 Presentation** — deliberately deferred until the simulation is proven fun.

## How to use a task file

1. Read **Goal**, **Acceptance**, and **Out of scope**.
2. Skim **Current state** so you do not rebuild finished work.
3. Implement only that task’s acceptance criteria.
4. Add/adjust automated tests for sim rules you touch.
5. Update **Status** and a one-line **Notes** entry with the date.
6. Commit on a feature branch; keep the vision file unchanged unless the product intent itself changes.
