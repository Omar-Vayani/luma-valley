# Task 09 — Buildings and institutions

**Status:** `partial`  
**Vision sections:** Buildings and institutions

## Goal

Institutions with real functions, ideally operated by creatures (stock, staff, schedules).

## Acceptance

- [x] Functional towers: market, bank, pharmacy, clinic, tavern, homes, work, farm, …
- [x] Stocked goods + prices; bank wallet/banked; clinic treatment
- [ ] Creature-operated shops (stock from farm/work, shopkeeper role)
- [ ] Hospital staffing / medicine supply chain from pharmacy
- [ ] Bar obtains drinks from production
- [ ] Schedules / opening hours affecting access
- [ ] Institutional storage ledgers

## Current state

Economy restocks abstractly; towers are interaction points with themed meshes.

## Out of scope

Full interior architecture (can follow task 01 / 17).

## Next steps

1. Job role `shopkeep` / `healer` / `bartender` claimed by creatures.
2. Stock depletes only when produced/delivered.
3. Closed institutions when no operator (with workaround for player).
