# Task 19 — Optional richer voice, never required

**Status:** `partial`  
**Vision sections:** Performance (no mandatory LLM); Quality requirements

## Why this task changed

The old next step was "wire an endpoint". That is the wrong goal: shipping a
hard-coded service would make the game look dependent on someone else's
server, and there is no endpoint to point at. The right deliverable is a
**contract the owner can plug their own service into** — including a local one
running on their own machine — with the game fully playable if they never do.

## Goal

A documented, testable seam for richer dialogue, off by default, invisible when
absent.

## Acceptance

- [x] Provider interface with local and remote implementations
- [x] Local provider always available; any remote failure returns the local line
- [x] One shared client, never one per creature
- [x] Tested against a throwing fetch and an empty endpoint
- [ ] **Endpoint configurable in settings** (blank by default)
- [ ] Request/response contract documented so a local model can serve it
- [ ] Only the player's own conversations are ever sent, and only when enabled
- [ ] Visible indicator of which voice is in use, and automatic fall back

## Out of scope

Shipping API keys, or any feature that only works online.

## Test

With no endpoint configured the game plays identically; with a deliberately
broken endpoint, conversation continues without the player noticing a failure.
