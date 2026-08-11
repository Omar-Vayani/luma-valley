# Task 09 — Institutions with real supply chains

**Status:** `partial`  
**Vision sections:** Buildings and institutions; Economy (production and consumption)

## Why this task changed

The old brief asked for "stock, staff, schedules" as separate boxes. That
undersells the point. An institution matters when **its failure is traceable to
a person**: the shelves are empty because the farmer died, the clinic cannot
treat you because nobody restocked medicine. That is a story the player can
follow, and it is what makes buildings feel operated rather than decorative.

## Goal

Goods should exist because somebody made or moved them, and run out because
somebody stopped. Every shortage should have a name attached to it.

## Acceptance

- [x] Functional buildings: market, bank, pharmacy, clinic, tavern, homes, work, farm
- [x] Roles claimed and worked by creatures; shifts pay wages
- [x] Staffed clinic treats properly and pays the healer; unstaffed offers only a cot
- [ ] **Supply chains**: farm produces grain → market turns grain into bread;
      pharmacy stocks medicine → clinic consumes it when treating
- [ ] Production consumes inputs, so a broken link causes a real shortage
- [ ] An unstaffed institution stops restocking (not just "restocks slower")
- [ ] The society panel names the cause of a shortage ("no farmer since …")
- [ ] Institutions hold their own till/stores rather than abstract global stock

## Out of scope

Opening hours and interiors — schedules add bookkeeping without adding a story
the player can follow. Revisit only if idle institutions become a problem.

## Test

Kill or remove the farmer and the market's bread supply should visibly dry up,
prices should rise, and the society panel should say why.
