# Task 03 — Modest persistent population

**Status:** `done`  
**Vision sections:** Primary goal, Development priorities §3, Performance (population limits)

## Goal

A small living population that boots into a society, stays within configurable caps, and feels individually distinct.

## Acceptance

- [x] Starter spawn of ~8 Luma on empty world
- [x] Configurable `populationCap` in settings
- [x] Births respect population cap / overcrowding
- [x] Starter society seeds two households with partners and children
- [x] Size/metabolism genes affect body and needs; travellers arrive when population thins

## Current state

`createSim` + App boot spawn; genetics already diversify temperament. Soft spawn soft-fail at cap.

## Out of scope

Large crowds; streaming continents.

## Next steps

1. Seed 2–3 households with jobs and relationships on new games.
2. Visual identity variety beyond hue/hair.
3. Soak test: society survives hours without extinction or explosion.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
