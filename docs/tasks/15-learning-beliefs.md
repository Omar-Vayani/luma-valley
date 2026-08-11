# Task 15 — Learning, beliefs, habits, deception

**Status:** `todo`  
**Vision sections:** Creature intelligence (learning & belief)

## Goal

Emergent intelligence beyond utility selection: associative learning, incomplete beliefs, habits, lying, evidence updates — visible in behavior.

## Acceptance

- [ ] Working memory distinct from episodic/semantic
- [ ] Incorrect beliefs can form and later reverse with evidence
- [ ] Habits from repeated actions bias utility scores
- [ ] Lie generation + detection using trust/incentives
- [ ] Imitation / teaching beyond word maps
- [ ] Generalization (e.g. “towers of type X have food”)
- [ ] No fake “learning” claims without state change
- [ ] Tests proving belief flip and habit formation

## Current state

TF.js brain preference learning; language association; reputation hearsay. No explicit belief graph or habit model.

## Depends on

Tasks 04, 05 (communication + memory).

## Next steps

1. `beliefs: Record<factId, {confidence, source}>`.
2. Habit counters per action.
3. Lie intent in semantic messages when spite/greed high and trust low.
