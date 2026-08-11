# Task 08 — Items, inventory, ownership, substances

**Status:** `partial`  
**Vision sections:** Items and substances; Inventory and ownership

## Goal

Data-driven items with weight/value/effects; personal + household storage; socially recognized ownership.

## Acceptance

- [x] Basic inventory + trade + player use/equip
- [x] Food, medicine, brew, herb, spark, tonic, stick
- [ ] Data-file item definitions (JSON/YAML) instead of hard-coded IDs only
- [ ] Weight/capacity limits enforced for player and creatures
- [ ] Clothing / containers / gifts / household objects
- [ ] Ownership memory + suspicious transfer reactions
- [ ] Hide / reclaim / household shared storage
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
