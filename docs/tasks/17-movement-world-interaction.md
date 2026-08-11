# Task 17 — Shared movement and world interaction

**Status:** `todo`  
**Vision sections:** Player and creature movement; Inventory (physical reach)

## Goal

Player and creatures obey the same important world rules: reach, carry, doors, furniture, no magical teleports (except documented LOD abstractions).

## Acceptance

- [ ] Jump / crouch as needed
- [ ] Pick up / drop / carry / drag suitable objects
- [ ] Use doors, beds, containers, equipment with shared APIs
- [ ] Creatures path to resources physically (LOD may coarsen distant ones — document when)
- [ ] Give/receive/trade/hide/steal require proximity
- [ ] Clear inventory/equipment controls for player

## Current state

Flat ground movement, collision separation, tower radii, drop pickup.

## Depends on

Tasks 02, 08, 01.

## Next steps

1. Unified `interact(actor, target)` API for player + creature.
2. Bed use = sleep at homes slot.
3. Document far-LOD abstractions explicitly in ARCHITECTURE.
