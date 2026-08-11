# Task 17 — Being physically present in the world

**Status:** `done`  
**Vision sections:** Player and creature movement; Inventory (physical reach)

## Why this task changed

Jump and crouch were listed first, but Haven is a flat settlement with no
verticality — they would add controls without adding meaning. What actually
supports the fantasy is **handling things in front of other people**: picking
something up, carrying it visibly, handing it over, dropping it, taking it.
Those acts are social, because ownership is social.

## Goal

The player and creatures manipulate the same objects under the same rules, and
other creatures can see them doing it.

## Acceptance

- [x] Pick up, store, take, hand over — all with capacity and reach checks
- [x] One interaction API shared by player and creatures
- [x] Taking marked goods is theft that witnesses notice
- [x] **Drop and carry**: the player can drop an item into the world and pick
      it back up; carried items are visible
- [x] **Giving to a creature** is a first-class action with a social response
      (gratitude, suspicion if it is stolen goods)
- [x] Clear inventory controls: use, give, drop per item
- [x] Far-LOD abstractions documented in ARCHITECTURE where creatures skip physical steps

## Out of scope

Jump, crouch, and climbing — no verticality exists to justify them. Revisit if
the world gains levels.

## Test

Hand a loaf to a hungry Luma and it should thank you; hand it one you stole
from its neighbour and someone should hold it against you.

## Notes

- 2026-08-11 — implemented.
