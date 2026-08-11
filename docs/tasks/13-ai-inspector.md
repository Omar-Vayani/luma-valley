# Task 13 — AI inspector and performance debugging

**Status:** `done`  
**Vision sections:** Transparency and debugging; Performance (profile costs)

## Goal

Optional tools that answer “why did that creature do that?” and show sim/render cost.

## Acceptance

- [x] Inspector: needs, scores, reasoning, bonds, memories, talk, KB estimate
- [x] Settings frame-cost readout
- [x] Genes, drives, emotions, and belief confidence/provenance shown
- [x] Habit strengths listed in the inspector
- [ ] Per-system CPU time breakdown (frame + sim totals only)
- [x] F3 overlay: frame ms, sim ms, population, batch, tick
- [x] Hidden by default, toggled with F3 or the settings checkbox

## Current state

`inspect.ts` + HUD inspector/settings; `lod.recordFrameTime`.

## Out of scope

External profiler products as hard dependencies.

## Next steps

1. `F3` perf overlay.
2. Time slices with `performance.now()` around sim phases.
3. Belief uncertainty display.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
