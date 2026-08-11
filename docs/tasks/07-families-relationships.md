# Task 07 — Families and multidimensional relationships

**Status:** `partial`  
**Vision sections:** Emotions, love, and relationships; Society (families)

## Goal

Persistent asymmetric relationship graphs; courtship → partnership → family; jealousy, rejection, reconciliation, grief.

## Acceptance

- [x] Multidimensional edges (`socialbond.ts`)
- [x] Partners, jealousy, grief/burial
- [x] Households with home slots + child membership
- [ ] Courtship rituals / rejection / breakup / reconciliation loops
- [ ] Family tree UI or inspector view
- [ ] Friend groups & rival groups beyond gangs
- [ ] Relationship effects on trade, work, conflict consistently
- [ ] Shared history summaries on edges

## Current state

`socialbond.ts`, `relationships.ts`, `household.ts`; bonds + reputation still parallel systems.

## Out of scope

Scripted romance cutscenes.

## Next steps

1. Unify legacy `bonds` score with social graph (or derive one from the other).
2. Breakup when resentment/trust thresholds crossed.
3. Inspector family tree section.
