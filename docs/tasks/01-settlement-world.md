# Task 01 — Small dense 3D settlement

**Status:** `done`  
**Vision sections:** The world, Buildings and institutions (visual layout)

## Goal

A compact, readable settlement — not a large empty map — with homes, clinic, pharmacy, bank, market, tavern, work, farm, park, and gathering spaces.

## Acceptance

- [x] Tower/building registry with practical landmarks
- [x] Clinic distinct from pharmacy
- [x] Market, bank, tavern, homes, work, farm, park, school, den, graveyard
- [x] Multiple distinct home buildings (house1–house4, claimed by households)
- [x] Homes quarter reads as a neighbourhood; commons hall for unhoused Luma
- [x] Usable fixtures (beds, chests, counters, doors) instead of interiors — abstraction documented in ARCHITECTURE

## Current state

`src/lab/world.ts` + procedural buildings in `src/render/labview.ts`. Single homes tower with household slots around it.

## Out of scope

Photorealism, large open world, animation polish (task 18).

## Next steps

1. Split homes into several house markers with household binding.
2. Improve path readability (plaza, paths, signage).
3. Decide interiors vs interaction-radius abstraction and document it.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
