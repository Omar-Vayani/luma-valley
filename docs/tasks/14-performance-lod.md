# Task 14 — Performance the owner can verify

**Status:** `done`  
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
- [x] **A benchmark command** (`npm run bench`) that reports simulation cost per tick at several
      population sizes and settings
- [x] Measured numbers recorded in ARCHITECTURE, with the machine, with the machine they came from
- [x] Per-system cost breakdown in the F3 overlay (minds, social, economy) in the overlay
- [x] Defaults justified by measurement: simulation uses <11% of the frame budget

## Out of scope

GPU/VRAM instrumentation beyond what the browser exposes.

## Test

`npm run bench` prints a table, and the numbers back up (or correct) the
default settings shipped in `settings.ts`.

## Notes

- 2026-08-11 — implemented.
