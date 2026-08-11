# Task 05 — Needs, emotions, personality, memory, psyche

**Status:** `partial`  
**Vision sections:** Basic psyche, Emotions…, Health and survival (needs), Creature intelligence (memory)

## Goal

A connected psyche where chemistry, emotion, memory, personality, and decisions reinforce each other — enough that “why did they do that?” has an answer.

## Acceptance

- [x] Core chem needs (hunger, energy, social, fear, health, grief, …)
- [x] Emotion spectrum + display mood
- [x] Psyche mood/stress/confidence/belonging/values (`psyche.ts`)
- [x] Episodic memory + facts + vendettas (capped)
- [ ] Full emotion list from vision (shame, guilt, hope, frustration, pride wired into decisions)
- [ ] Working / semantic / social memory layers with consolidation
- [ ] Memory importance scoring, summarization, forgetting, misremember
- [ ] Emotions clearly bias attention, dialogue, learning, risk

## Current state

`chem.ts`, `emotions.ts`, `emotion.ts`, `memory.ts`, `psyche.ts`, `drives.ts`, `mind.ts`.

## Out of scope

Clinical mental-health simulation claims.

## Next steps

1. Map missing emotions into appraisal events.
2. Memory consolidation pass every N ticks.
3. Inspector shows which emotion flipped a decision.
