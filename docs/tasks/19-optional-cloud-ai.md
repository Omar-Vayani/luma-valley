# Task 19 — Optional cloud AI assist

**Status:** `todo`  
**Vision sections:** Performance (no mandatory LLM); Technology choice; Quality requirements

## Goal

Optional external NL assist for richer dialogue when online — never required; graceful offline fallback to local dialogue.

## Acceptance

- [ ] Setting already stubs `optionalCloudAi` — wire provider interface
- [ ] Local template/rules dialogue always works offline
- [ ] Cloud failures fall back silently with user-visible “offline voice”
- [ ] No per-creature LLM instance; one shared optional client
- [ ] Privacy: only send dialogue when player initiates and setting on
- [ ] Tests mock unavailable service

## Current state

`settings.optionalCloudAi` boolean unused.

## Depends on

Task 04 semantic messages stable.

## Next steps

1. `DialogueProvider` interface: `local` | `cloud`.
2. Feature-flag in settings.
3. Document that cloud is enhancement only.
