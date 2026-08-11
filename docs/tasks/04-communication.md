# Task 04 — Creature communication

**Status:** `partial`  
**Vision sections:** Creature communication, Performance (semantic vs NL)

## Goal

Typed NL with the player; meaningful creature↔creature communication via compact semantics, with NL only when heard/inspected.

## Acceptance

- [x] Typed player talk → intent parse → trust-gated reply (`dialogue.ts`)
- [x] Concept↔word teaching (`language.ts`)
- [x] Gossip / reputation channel
- [x] Semantic message bus (chatter.ts) with promises, warnings, gossip, lies
- [x] Overheard exchanges render to natural language for the player
- [x] Lies are generated from need/spite and caught by suspicion + familiarity
- [ ] Speech still reflects mood/trust more than age and vocabulary depth
- [ ] Negotiation happens in the economy, not yet as a dialogue the player joins

## Current state

Player talk panel + teach words; creature words are coined concepts; events emit short bubbles.

## Out of scope

Mandatory cloud LLM (task 19).

## Next steps

1. `SemanticMessage` queue between nearby creatures each social tick.
2. Earshot NL renderer for player.
3. Promise memory + breach consequences.
4. Tests for believe/obey gates.

## Notes

- 2026-08-11 — advanced in the Haven society pass.
