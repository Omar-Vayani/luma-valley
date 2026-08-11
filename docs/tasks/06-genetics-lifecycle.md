# Task 06 — Genetics, life cycle, and procreation

**Status:** `partial`  
**Vision sections:** Genetics, life cycle, and procreation

## Goal

Inheritable genetics that bias (not dictate) development; abstract life cycle; population constrained naturally and via caps.

## Acceptance

- [x] Genome genes + crossover + mutation
- [x] Aging / age limit / death
- [x] Abstract partnered reproduction at homes with energy cost
- [x] Population cap gate
- [ ] Genes for appearance size, metabolism, fertility, sensory, illness resistance
- [ ] Childhood / maturity stages with different needs & learning rates
- [ ] Early care/neglect lasting developmental effects (beyond soft household care)
- [ ] Fertility + housing constraints as soft gates (not only hard cap)

## Current state

`genetics.ts`, `lifecycle.ts`, household adopt on birth, illness stub.

## Out of scope

Explicit sexual content; graphic birth.

## Next steps

1. Add life-stage enum (child/adult/elder) gating actions.
2. Expand genome fields; drive appearance + metabolism.
3. Tests: child inherits mix; mutation bounded; cap prevents explosion.
