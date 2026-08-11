# Task 04 — Communication the player is part of

**Status:** `done`  
**Vision sections:** Creature communication

## Why this task changed

Talking to a Luma currently produces a reply and very little else. The vision
asks for conversation that **does something**: negotiation, promises, asking
for help, warnings that change behaviour. Conversation should be a way to act
on the society, not a flavour panel.

## Goal

The player's words should be able to change what a creature does, and the
creature's words should reveal what it knows and wants — filtered through
trust, mood, age, and vocabulary.

## Acceptance

- [x] Typed intent parsing; trust-gated belief and obedience
- [x] Word teaching; gossip; overheard creature talk; lies and detection
- [x] **Trade with the player**: ask to buy or sell, get a price shaped by the
      creature's need, wealth, and opinion of you, and complete the exchange
- [x] **Requests that stick**: asking for help creates a promise the creature
      may keep or break, with consequences either way
- [x] **Warnings and accusations land**: telling a creature about a thief
      changes its beliefs about that individual, weighted by your credibility
- [x] Speech reflects age and vocabulary — a child speaks differently from an
      elder, and a creature uses words it actually knows
- [x] The reply says something the creature could plausibly know (no omniscience)

## Out of scope

A mandatory language model (see task 19).

## Test

The player should be able to talk a hungry stranger into selling their last
loaf, and be turned down flat by someone who does not trust them.

## Notes

- 2026-08-11 — implemented.
