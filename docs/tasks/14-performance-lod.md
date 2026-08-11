# Task 14 — Performance, LOD, and laptop defaults

**Status:** `partial`  
**Vision sections:** Performance target

## Goal

~60 FPS comfortable play on ASUS ROG Zephyrus G14 (RTX 5070 laptop) at medium settings without maxing thermals.

## Acceptance

- [x] Sim LOD bands + AI batching + independent sim Hz
- [x] Quality presets, population cap, pixel ratio cap, particle/label toggles
- [ ] Real profiling pass on target hardware (CPU/GPU/VRAM/frame times documented)
- [ ] Navigation/knowledge/decision caches
- [ ] Memory growth limits with summarization under budget
- [ ] Batch more AI-compatible calculations
- [ ] Validate browser stack still sufficient; escalate stack revisit if not

## Current state

`settings.ts`, `lod.ts` wired into sim tick + renderer settings.

## Out of scope

Console ports.

## Next steps

1. Add simple in-game profiler CSV export.
2. Cache `scoreActions` inputs when chem unchanged.
3. Document measured frame times in ARCHITECTURE after a profiling session.
