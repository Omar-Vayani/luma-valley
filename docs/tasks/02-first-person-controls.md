# Task 02 — First-person controls and interaction

**Status:** `partial`  
**Vision sections:** Player and creature movement (player half)

## Goal

Responsive first-person presence in the same world as the creatures: move, look, select, use tools, talk, inventory.

## Acceptance

- [x] WASD + pointer lock / touch split zones
- [x] Look pitch/yaw, joystick on touch
- [x] Tap/select creature; social / teach / talk HUD
- [x] Player inventory strip + equip/use basics
- [ ] Jump / crouch where appropriate
- [ ] Contextual prompts for doors, beds, containers
- [ ] Clear, discoverable control help overlay

## Current state

`App.tsx` + `LabView` first-person mode default. Dock tools for benevolence/malice and drops.

## Out of scope

Full shared physics parity with creatures (task 17).

## Next steps

1. In-game controls card.
2. Jump/crouch if navigation needs them.
3. Focus reticle showing nearest interactable Luma/building.
