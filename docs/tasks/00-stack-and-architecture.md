# Task 00 — Stack and architecture

**Status:** `done`  
**Vision sections:** Technology choice, Quality requirements, Development priorities

## Goal

Inspect the existing project, choose the engine/stack that best supports the vision, and document launch, setup, and architecture.

## Acceptance

- [x] Existing useful systems identified (sim core kept)
- [x] Stack chosen from practical constraints (browser Vite + React + Three.js + pure TS)
- [x] Simple launch: `npm install && npm run dev`
- [x] Architecture documented (`docs/ARCHITECTURE.md`)
- [x] Offline-first; no mandatory cloud services
- [x] Sensible defaults for G14-class laptop noted in settings

## Current state

Browser stack retained. Hybrid creature mind (utility + tiny TF.js net + psyche). Docs in `README.md`, `PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/VISION.md`.

## Out of scope

Re-evaluating stack unless profiling proves the browser cannot meet population/intelligence targets (see task 14 / 19).

## Notes

- 2026-08-11 — Decision recorded: keep browser stack for vertical slice.
