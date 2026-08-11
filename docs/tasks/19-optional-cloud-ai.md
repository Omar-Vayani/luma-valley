# Task 19 — Optional richer voice, never required

**Status:** `done`  
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
- [x] **Endpoint configurable in settings** (blank by default) (blank by default)
- [x] Request/response contract documented in this file so a local model can serve it
- [x] Only the player's own conversations are sent, and only when enabled, and only when enabled
- [x] The talk panel names the voice in use and who is listening, and automatic fall back

## Out of scope

Shipping API keys, or any feature that only works online.

## Test

With no endpoint configured the game plays identically; with a deliberately
broken endpoint, conversation continues without the player noticing a failure.

## Notes

- 2026-08-11 — implemented.

## The contract

Turn the setting on and give it a URL. Haven sends one POST per player line,
and uses whatever comes back — or its own line if anything goes wrong.

Request body:

```json
{
  "baseText": "\"Hello, Visitor,\" says ZorNip.",
  "speakerName": "ZorNip",
  "mood": "content",
  "hints": ["greet"]
}
```

Response body:

```json
{ "text": "\"Hello there, traveller,\" ZorNip says warmly." }
```

Anything else — a non-200, a timeout past 1.5 s, malformed JSON, no network —
is treated as "no answer" and the local line stands. Only the wording changes;
what the creature actually believes, wants, and decides is always the local
simulation. A model running on your own machine (Ollama, llama.cpp, LM Studio
behind a small shim) satisfies this contract without anything leaving the
laptop.
