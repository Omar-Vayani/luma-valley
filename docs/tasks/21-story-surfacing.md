# Task 21 — Story surfacing

**Status:** `done`  
**Vision sections:** Primary goal (surprising but understandable stories); Transparency and debugging

## Why this task exists

Haven already generates stories — a theft shifts a norm, a widow re-partners, a
shopkeeper dies and the shelves stop refilling. The player cannot *notice* any
of it. Everything is legible only if you happen to be selecting the right
creature at the right moment.

This is the highest-value remaining work because the vision's success test is
not "the simulation is deep", it is **"the player wonders why, and can find out"**.
Depth the player never perceives is indistinguishable from no depth.

## Goal

Make the society's events noticeable and traceable, without turning the game
into a text log. The player should be able to ask, at any time: what just
happened here, who did it, and why does it matter?

## Acceptance

- [x] A **notable events** feed: only events that changed something socially
      (theft, betrayal, birth, death, partnership, separation, job taken,
      shortage, retaliation), not routine eating and walking
- [x] Every notable event records **who, what, where, and the cause** — the
      reason the actor chose it, captured at decision time
- [x] Events are ranked by significance so a quiet moment shows the best story
- [x] Per-creature **life story**: the handful of events that shaped this
      individual, readable in the inspector
- [x] "While you were away": a short summary of what changed since the player
      last looked
- [x] Nothing fabricated — every line traces to real simulation state
- [x] Feed is bounded (cheap to keep, cheap to save)

## Out of scope

Quest markers, objectives, scripted narration.

## Test

A 20-minute session should produce at least one chain the player can follow:
*someone stole → a witness stopped trusting them → the shop refused them → they
went hungry → they stole again.*

## Notes

- 2026-08-11 — implemented.
