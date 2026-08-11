# Task 20 — Vertical slice acceptance

**Status:** `partial`  
**Vision sections:** Development priorities (1–14); Quality requirements

## Goal

Declare the first complete version done only when the game is genuinely
playable — and specifically when it passes the vision's own success test:

> The player regularly wonders "why did that creature do that?" **and can
> discover a believable answer.**

## Acceptance checklist

### The success test

- [ ] A 20-minute session produces a social story the player noticed
- [ ] That story can be traced to causes in the inspector or society panel
- [ ] Two creatures in the same situation visibly choose differently

### Playable loop

- [x] Small 3D settlement navigable in first person
- [x] Modest population with distinct individuals
- [x] Player can talk, teach, help/harm, and observe consequences
- [x] Creatures pursue needs, relationships, and work without scripts
- [ ] Player can trade with creatures directly

### Systems present

- [x] Communication (player + creature)
- [x] Needs / emotions / psyche / memory / beliefs
- [x] Genetics / aging / love / reproduction
- [x] Families / multidimensional relationships
- [x] Inventories / ownership / items & substances
- [x] Homes, market, clinic, pharmacy, bank, bar (+ work/farm)
- [x] Economy with scarcity and labour
- [ ] Economy with obligations between individuals
- [x] Trust / theft / jealousy / forgiveness loops
- [x] Save/load resilient
- [x] Inspector + performance settings

### Quality gates

- [x] Automated tests green for critical simulation rules
- [x] Offline play works
- [x] Setup is `npm install && npm run dev`
- [x] Limitations documented honestly
- [ ] Measured performance evidence (task 14)

## Notes

Update checkboxes only when playable evidence exists (tests + play notes).
