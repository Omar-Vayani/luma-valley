# Task 12 — Persistence

**Status:** `partial`  
**Vision sections:** Persistence; Quality requirements

## Goal

Versioned, resilient saves covering minds, society, economy, and world; graceful recovery from corruption.

## Acceptance

- [x] Save v5 with social/psyche/household/illness
- [x] v4 load compatibility with defaults
- [x] Autosave world blob + manual save
- [ ] Export/import downloadable save file in HUD
- [ ] Save promises, major conversations, family trees fully
- [ ] Corruption recovery UI (backup slot / fresh world)
- [ ] Per-creature budget enforcement with compression/summarization
- [ ] Multiple manual slots

## Current state

`save.ts`, `creature-storage.ts` world blob; autosave every ~20s in App.

## Out of scope

Cloud sync accounts.

## Next steps

1. Download/upload `.luma.json` buttons.
2. Slot 1/2/3 local saves.
3. On parse failure, offer recovery path without crashing boot.
