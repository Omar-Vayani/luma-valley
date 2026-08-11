# Task 13 — AI inspector and performance debugging

**Status:** `partial`  
**Vision sections:** Transparency and debugging; Performance (profile costs)

## Goal

Optional tools that answer “why did that creature do that?” and show sim/render cost.

## Acceptance

- [x] Inspector: needs, scores, reasoning, bonds, memories, talk, KB estimate
- [x] Settings frame-cost readout
- [ ] Personality / genes / uncertain beliefs panels complete
- [ ] Learning delta / habit change log
- [ ] Per-system CPU time (mind, social, economy, render)
- [ ] Perf overlay toggle (FPS, sim ms, creature count, LOD bands)
- [ ] Hidden in normal play (hotkey) but always available

## Current state

`inspect.ts` + HUD inspector/settings; `lod.recordFrameTime`.

## Out of scope

External profiler products as hard dependencies.

## Next steps

1. `F3` perf overlay.
2. Time slices with `performance.now()` around sim phases.
3. Belief uncertainty display.
