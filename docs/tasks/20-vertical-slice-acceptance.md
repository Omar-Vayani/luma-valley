# Task 20 — Vertical slice acceptance

**Status:** `todo`  
**Vision sections:** Development priorities (1–14); Quality requirements

## Goal

A checklist to declare the **first complete version** done: playable, tested, documented, performant enough — not a mock-up.

## Acceptance checklist

Copy this into a PR when claiming the slice is complete:

### Playable loop

- [ ] Small 3D settlement navigable in first person
- [ ] Modest population with distinct individuals
- [ ] Player can talk, teach, help/harm, trade/observe consequences
- [ ] Creatures pursue needs, relationships, work without scripts
- [ ] At least one emergent story observable in a 20-minute session

### Systems present

- [ ] Communication (player + creature)
- [ ] Needs / emotions / psyche / memory
- [ ] Genetics / aging / love / reproduction
- [ ] Families / multidimensional relationships
- [ ] Inventories / ownership / key items & substances
- [ ] Homes, shop, clinic, pharmacy, bank, bar (+ work/farm)
- [ ] Economy with scarcity and labor
- [ ] Trust / theft / jealousy / forgiveness loops
- [ ] Save/load resilient
- [ ] Inspector + performance settings

### Quality gates

- [ ] Automated tests green for critical sim rules
- [ ] Offline play works
- [ ] Setup is `npm install && npm run dev` (or documented equivalent)
- [ ] Limitations documented honestly
- [ ] Comfortable on target laptop at medium defaults (task 14 evidence)

## Current state

Many items `partial`; use this file as the release gate, not as parallel implementation work.

## Notes

Update checkboxes only when playable evidence exists (tests + short play notes).
