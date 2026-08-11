# Task 14 — Performance the owner can verify

**Status:** `partial`  
**Vision sections:** Performance target

## Why this task changed

"Profile on the target laptop" cannot be done from here — the ASUS ROG
Zephyrus G14 is the owner's machine. The useful version of this task is to
ship a **repeatable measurement** the owner can run in one command, plus
honest numbers from wherever it was last run.

## Goal

Anyone can measure this build's simulation cost and see whether the defaults
suit their machine, without guessing.

## Acceptance

- [x] Sim LOD bands, AI batching, sim rate independent of render rate
- [x] Quality presets, population cap, pixel-ratio cap, particle/label toggles
- [x] Bounded memory: capped episodes, beliefs, edges, chatter
- [ ] **A benchmark command** that reports simulation cost per tick at several
      population sizes and settings
- [ ] Measured numbers recorded in the docs, with the machine they came from
- [ ] Per-system cost breakdown (minds, social, economy) in the overlay
- [ ] A documented recommendation for the target laptop's defaults

## Out of scope

GPU/VRAM instrumentation beyond what the browser exposes.

## Test

`npm run bench` prints a table, and the numbers back up (or correct) the
default settings shipped in `settings.ts`.
