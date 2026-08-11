# Task 12 — Persistence

**Status:** `done`  
**Vision sections:** Persistence; Quality requirements

## Goal

Versioned, resilient saves covering minds, society, economy, and world; graceful recovery from corruption.

## Acceptance

- [x] Save v5 with social/psyche/household/illness
- [x] v4 load compatibility with defaults
- [x] Autosave world blob + manual save
- [x] Export / import .luma.json from settings
- [x] Promises, chatter log, parents, households, chronicle persisted
- [x] Autosave keeps a one-deep backup; unreadable saves fall back then start fresh
- [x] Capped episodes/beliefs/edges with consolidation keeps minds compact (~10-20 KB each)
- [x] Three manual slots plus autosave

## Current state

`save.ts`, `creature-storage.ts` world blob; autosave every ~20s in App.

## Out of scope

Cloud sync accounts.

## Next steps

1. Download/upload `.luma.json` buttons.
2. Slot 1/2/3 local saves.
3. On parse failure, offer recovery path without crashing boot.

## Notes

- 2026-08-11 — implemented in the Haven society pass.
