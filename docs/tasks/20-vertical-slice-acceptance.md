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

- [x] A session produces social stories the player can notice — the society
      panel lists them, each with the reason behind it
- [x] Those stories trace to causes: the inspector shows needs, beliefs, and
      relationships; shortages name the missing worker
- [x] Confirmed by a recorded scripted session (`npm run demo`); a human hour of play is still the honest final test
- [x] Two creatures in the same situation visibly choose differently (covered in haven7.test.ts)

### Playable loop

- [x] Small 3D settlement navigable in first person
- [x] Modest population with distinct individuals
- [x] Player can talk, teach, help/harm, and observe consequences
- [x] Creatures pursue needs, relationships, and work without scripts
- [x] Player can trade with creatures directly, and hand things over

### Systems present

- [x] Communication (player + creature)
- [x] Needs / emotions / psyche / memory / beliefs
- [x] Genetics / aging / love / reproduction
- [x] Families / multidimensional relationships
- [x] Inventories / ownership / items & substances
- [x] Homes, market, clinic, pharmacy, bank, bar (+ work/farm)
- [x] Economy with scarcity and labour
- [x] Economy with obligations between individuals
- [x] Trust / theft / jealousy / forgiveness loops
- [x] Save/load resilient
- [x] Inspector + performance settings

### Quality gates

- [x] Automated tests green for critical simulation rules
- [x] Offline play works
- [x] Setup is `npm install && npm run dev`
- [x] Limitations documented honestly
- [x] Measured performance evidence (`npm run bench`, recorded in ARCHITECTURE)
- [x] Headless HUD check (`npm run verify:hud`) so controls cannot silently break

## Notes

Update checkboxes only when playable evidence exists (tests + play notes).
