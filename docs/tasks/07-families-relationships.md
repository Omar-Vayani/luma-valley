# Task 07 — Families and multidimensional relationships

**Status:** `done`  
**Vision sections:** Emotions, love, and relationships; Society (families)

## Goal

Persistent asymmetric relationship graphs; courtship → partnership → family; jealousy, rejection, reconciliation, grief.

## Acceptance

- [x] Multidimensional edges (`socialbond.ts`)
- [x] Partners, jealousy, grief/burial
- [x] Households with home slots + child membership
- [x] courtship.ts: mutual interest, rejection, strain, separation, reconciliation, widowhood
- [x] Inspector shows partner, parents, and children
- [ ] Friend groups & rival groups beyond gangs (still gang-based)
- [x] Trust and suspicion set haggled prices and refusal of service
- [x] Familiarity protects feelings from decay; semantic memory summarizes history

## Current state

`socialbond.ts`, `relationships.ts`, `household.ts`; bonds + reputation still parallel systems.

## Out of scope

Scripted romance cutscenes.

## Next steps

1. Unify legacy `bonds` score with social graph (or derive one from the other).
2. Breakup when resentment/trust thresholds crossed.
3. Inspector family tree section.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
