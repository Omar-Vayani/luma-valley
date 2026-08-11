# Task 08 — Items, inventory, ownership, substances

**Status:** `done`  
**Vision sections:** Items and substances; Inventory and ownership

## Goal

Data-driven items with weight/value/effects; personal + household storage; socially recognized ownership.

## Acceptance

- [x] Basic inventory + trade + player use/equip
- [x] Food, medicine, brew, herb, spark, tonic, stick
- [x] items.ts catalog (category, value, weight, rarity, acceptance, durability, effects)
- [x] Weight-based capacity with satchel bonus, enforced on every add/trade
- [x] cloak, satchel, trinket, gem, timber, grain, water added
- [x] Owner marks on stacks; taking marked goods is witnessed as theft
- [x] Household chests via fixtures; take/store with ownership checks
- [ ] Substance tolerance / preference / avoidance depth

## Current state

`inventory.ts`, `substances.ts`, economy goods list, creature + player inventories.

## Out of scope

Crafting tree sprawl before ownership works.

## Next steps

1. `public/data/items.json` catalog loaded at boot.
2. Weight capacity on inventories.
3. `ownerId` on world drops and storage slots.
4. Tests: thief transfer updates ownership beliefs.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
