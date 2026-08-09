# Luma Valley — Observer Society Rebuild

**Architecture owner:** GPT Sol
**Status:** implementation brief
**Invariant:** preserve the existing first-person city, non-inverted look direction, building collision/navigation, save migration, and six simulation ticks per second.

## Product role

The player is an **observer and influence**, not a laborer. Citizens operate the economy and satisfy their own needs. The player may intervene with clearly beneficial or harmful tools, then watch consequences propagate through relationships and witnesses.

The primary loop is:

1. Observe a citizen, relationship, shortage, trade, conflict, or new cooperative cluster.
2. Intervene or remain neutral.
3. Watch individual memory, witnessed reputation, utility choices, and local scarcity alter society.
4. Inspect the society pulse and citizen history—not an objective checklist.

No player collection, crafting grind, harvest loop, or required service job.

## Decided death model

**Death is permanent.** No respawn. Births can replenish the population. Permanence gives attachment, betrayal, health, and scarcity genuine stakes. Balance must make ordinary hunger/thirst survivable and death uncommon; lethal violence, severe substance harm, old age, and extreme neglect remain consequential. Gentle mode suppresses starvation/violent permadeath for softer sandbox play.

Dead citizens render as a compact memorial/grave. Living sleep must remain upright/seated and must never resemble a corpse.

## Layer boundaries

### `sim/society.ts` — pure social/economic kernel

- Bounded `[0,1]`: trust, attachment, love, betrayal, fear, greed.
- Sparse relationship memory keyed by other citizen ID.
- Tiny wallet/inventory and deterministic transactions.
- Utility candidates: follow, flee, share, hoard, trade, fight, cooperate.
- Witness propagation for player and NPC actions.
- No renderer, DOM, Three.js, or per-NPC model inference.
- Complexity target: local pairs / O(N²) only for N ≤ 20 at a throttled social cadence, O(N) ordinary ticks.

### `sim/creature.ts`

Owns physiology, navigation, current action, and individual state. It consumes one selected society intent rather than duplicating social policy.

### `sim/game.ts`

Owns orchestration: local-neighbor gathering, economy stock cadence, society intent application, observer interventions, event feed, births/deaths, and save boundaries.

### `sim/city.ts` + `sim/city-layout.ts`

One authoritative place registry with purpose and service type. Every landmark must be represented by a building or explicit open-space structure and remain reachable through its entrance.

### Renderer/UI

Rendering communicates state but never determines it. UI reads game state and sends explicit commands. Panels must not pause or cover the camera unless deliberately opened.

## Purposeful nomad-city places

| Place | Old-city fiction | Self-service function | NPC utility |
|---|---|---|---|
| Shelter | Lantern Row lodging alcoves | pay a bed box / rest | fatigue, fear |
| Bar | Crooked Cup tap wall | coin-operated pour/smoke hatch | pleasure, addiction |
| Park | Ashen garden and fountain | free water/rest | thirst, boredom, social |
| Bank | Brass Weigh-House lockboxes | deposit/withdraw/ledger kiosk | protect currency, greed/hoard |
| Hospital | Mercy House remedy cabinet | pay for treatment | health, pain |
| Restaurant | Hearth Kitchen bread oven | pay for meal | hunger |
| Drugstore | Apothecary shutters | pay for medicine or substances | health/addiction |
| Work yard | Caravan board / porter stalls | complete abstract work cadence | earn currency |
| Market | Open bazaar vending tables | buy/sell/trade stock | goods and price discovery |

There is **no watch/government authority**. Any existing Watch building becomes a neutral commons/work yard or weigh-house. Cooperation is a citizen behavior, not an institution imposed by the player.

Stocks are finite and replenish slowly. Prices rise as stock falls. Citizens choose whether to consume, buy, share, trade, or hoard based on need, relationship values, greed, and expected scarcity.

## Observer tools

Beneficial:

- **Feed** — immediate hunger relief; trust/attachment gain; witnesses gain small trust.
- **Heal** — health/pain improvement; larger trust gain when need is genuine.
- **Comfort/amuse** — fear/loneliness relief; attachment reinforcement.

Harmful:

- **Stick** — intimidation and modest pain; fear/betrayal increase.
- **Whip** — severe fear/pain/trust loss; witnesses remember cruelty and may flee/intervene.

Tools are overseer actions, not collected inventory. Feedback must name immediate effect and social consequence without celebrating cruelty.

## Touch controls

Preserve existing semantics and natural look sign.

- **Default mobile mode:** invisible split touch zones—left side starts a floating movement vector, right side drags to look. No persistent joystick ring.
- **Fallback setting:** classic visible movement joystick + remaining screen look, preserving the previously verified scheme.
- The side split only owns world gestures; buttons/panels remain interactive and block camera gestures.
- Keep tap-to-interact, but interaction buttons can collapse when no focus is available.
- Fullscreen PWA uses safe-area insets and standalone display.

## HUD design

Always on:

- tiny time/population/status strip;
- crosshair/focus chip only when something is in interaction range;
- a compact **Society Pulse** indicator for shortages, trade, conflict, bonding, births/deaths.

Expandable tabs:

1. **Citizen** — needs, emotions, relationships, wallet/inventory, memories.
2. **Society** — economy stocks/prices, strongest bonds, fears/conflicts, recent events.
3. **Tools** — feed/heal/comfort/stick/whip; only while a citizen is focused.
4. **Settings** — controls, sound, labels, gentle mode, saves/install help.

No always-visible quest tracker. No centered blocking dialogue. Notifications are short, dismissible, bottom/edge anchored, time out automatically, and never sit on the crosshair.

## Save compatibility

Extend optional fields only. Missing social/economy state receives deterministic defaults. Existing quest data may remain serialized for compatibility but is no longer the primary UI mission. Keep saves below 70 KB for typical 5–12 citizen worlds.

## Acceptance gates

- Living rigs never exceed a clearly upright/seated tilt; dead rigs become memorials.
- Deterministic normal-mode survival soak demonstrates resource access and avoids routine extinction.
- Society tests prove bounded emotions, witnessed memory, scarcity price response, valid trades, and all utility outputs.
- Observer tools affect target and witnesses; player inventory is not required.
- All service buildings have real functions and reachable doors.
- 390×844 and landscape touch QA: two simultaneous pointers, natural look, invisible split default, classic fallback.
- Manifest/service worker installability and offline shell check.
- No centered gameplay dialogue; panels are dismissible and progressive.
- Full tests, strict TypeScript build, lint, audit, performance comparison, visual review, independent release-blocker review.
