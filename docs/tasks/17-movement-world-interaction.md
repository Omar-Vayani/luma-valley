# Task 17 — Shared movement and world interaction

**Status:** `todo`  
**Vision sections:** Player and creature movement; Inventory (physical reach)

## Goal

Player and creatures obey the same important world rules: reach, carry, doors, furniture, no magical teleports (except documented LOD abstractions).

## Acceptance

- [ ] Jump / crouch as needed
- [x] Pick up, store, take, and hand over items with capacity limits
- [x] interact.ts is used by both the player and creatures
- [ ] Creatures path to resources physically (LOD may coarsen distant ones — document when)
- [x] Every transfer checks reach; taking marked goods is theft
- [ ] Clear inventory/equipment controls for player

## Current state

Flat ground movement, collision separation, tower radii, drop pickup.

## Depends on

Tasks 02, 08, 01.

## Next steps

1. Unified `interact(actor, target)` API for player + creature.
2. Bed use = sleep at homes slot.
3. Document far-LOD abstractions explicitly in ARCHITECTURE.

## Notes

- 2026-08-11 — advanced in the Haven society pass.
