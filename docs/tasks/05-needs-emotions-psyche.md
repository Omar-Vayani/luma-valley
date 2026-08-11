# Task 05 — Needs, emotions, personality, memory, psyche

**Status:** `done`  
**Vision sections:** Basic psyche, Emotions…, Health and survival (needs), Creature intelligence (memory)

## Goal

A connected psyche where chemistry, emotion, memory, personality, and decisions reinforce each other — enough that “why did they do that?” has an answer.

## Acceptance

- [x] Core chem needs (hunger, energy, social, fear, health, grief, …)
- [x] Emotion spectrum + display mood
- [x] Psyche mood/stress/confidence/belonging/values (`psyche.ts`)
- [x] Episodic memory + facts + vendettas (capped)
- [x] Pride, shame, guilt, gratitude, hope, frustration via appraisal, wired into risk and utility
- [x] Episodic + semantic consolidation, social graph, belief store
- [x] Importance scoring, consolidation into patterns, weakest-first forgetting
- [x] emotionalRiskBias + psyche riskModifier shift theft/fight scoring; mood colours dialogue

## Current state

`chem.ts`, `emotions.ts`, `emotion.ts`, `memory.ts`, `psyche.ts`, `drives.ts`, `mind.ts`.

## Out of scope

Clinical mental-health simulation claims.

## Next steps

1. Map missing emotions into appraisal events.
2. Memory consolidation pass every N ticks.
3. Inspector shows which emotion flipped a decision.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
