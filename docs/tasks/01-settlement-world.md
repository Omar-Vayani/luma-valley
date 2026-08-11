# Task 01 — Small dense 3D settlement

**Status:** `partial`  
**Vision sections:** The world, Buildings and institutions (visual layout)

## Goal

A compact, readable settlement — not a large empty map — with homes, clinic, pharmacy, bank, market, tavern, work, farm, park, and gathering spaces.

## Acceptance

- [x] Tower/building registry with practical landmarks
- [x] Clinic distinct from pharmacy
- [x] Market, bank, tavern, homes, work, farm, park, school, den, graveyard
- [ ] Multiple distinct home buildings (not one homes pad)
- [ ] Clear environmental variation / readable paths between institutions
- [ ] Enterable or convincingly usable interiors (or deliberate abstraction documented)

## Current state

`src/lab/world.ts` + procedural buildings in `src/render/labview.ts`. Single homes tower with household slots around it.

## Out of scope

Photorealism, large open world, animation polish (task 18).

## Next steps

1. Split homes into several house markers with household binding.
2. Improve path readability (plaza, paths, signage).
3. Decide interiors vs interaction-radius abstraction and document it.
