# Task 19 — Optional cloud AI assist

**Status:** `todo`  
**Vision sections:** Performance (no mandatory LLM); Technology choice; Quality requirements

## Goal

Optional external NL assist for richer dialogue when online — never required; graceful offline fallback to local dialogue.

## Acceptance

- [x] DialogueProvider interface with local and cloud implementations
- [x] Local provider always available
- [x] Any cloud failure returns the local line
- [x] One shared provider, never per creature
- [ ] Settings toggle exists; no endpoint is wired to it yet
- [x] Tested with a throwing fetch and an empty endpoint

## Current state

`settings.optionalCloudAi` boolean unused.

## Depends on

Task 04 semantic messages stable.

## Next steps

1. `DialogueProvider` interface: `local` | `cloud`.
2. Feature-flag in settings.
3. Document that cloud is enhancement only.

## Notes

- 2026-08-11 — advanced in the Haven society pass.
