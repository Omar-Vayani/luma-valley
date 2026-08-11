# Task 02 — First-person presence

**Status:** `done`  
**Vision sections:** Player and creature movement (player half)

## Why this task changed

Jump and crouch were on the list out of habit; Haven is flat and they would add
buttons without adding meaning (moved to task 17's out-of-scope). What the
player actually lacks is **knowing what they can do** — the controls are
undiscoverable, so most of the interaction surface goes unused.

## Goal

A player who has never read the README can work out how to move, talk, and
handle things within a minute.

## Acceptance

- [x] WASD + pointer lock; touch split zones; look pitch/yaw
- [x] Select a creature; talk, teach, tools; inventory strip
- [x] Contextual buttons when furniture is in reach
- [x] **A controls card** the player can open (and that appears on first run)
- [x] Contextual fixture buttons name what is in reach and what it does
- [x] Every panel has a key (T I H M G ?), Esc closes, Space and 1 2 3 control time

## Out of scope

Jump, crouch, vehicles.

## Test

A first-time player finds and uses talk, the inspector, and a bed without being
told they exist.

## Notes

- 2026-08-11 — implemented.
