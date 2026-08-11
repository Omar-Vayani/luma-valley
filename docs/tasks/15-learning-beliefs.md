# Task 15 — Learning, beliefs, habits, deception

**Status:** `done`  
**Vision sections:** Creature intelligence (learning & belief)

## Goal

Emergent intelligence beyond utility selection: associative learning, incomplete beliefs, habits, lying, evidence updates — visible in behavior.

## Acceptance

- [x] Episodic, semantic summaries, and a separate belief store
- [x] Confidence erodes before a belief flips; hearsay is weaker than sight
- [x] habitBias added to every action score
- [x] decideToLie / detectLie wired into creature conversation
- [x] Directions shared in conversation; culture transmitted to children
- [x] generalize() builds category beliefs from specifics
- [x] Every learning claim maps to persisted state
- [x] Covered in haven2.test.ts

## Current state

TF.js brain preference learning; language association; reputation hearsay. No explicit belief graph or habit model.

## Depends on

Tasks 04, 05 (communication + memory).

## Next steps

1. `beliefs: Record<factId, {confidence, source}>`.
2. Habit counters per action.
3. Lie intent in semantic messages when spite/greed high and trust low.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
