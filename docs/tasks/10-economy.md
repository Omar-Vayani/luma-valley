# Task 10 — Economy

**Status:** `partial`  
**Vision sections:** Economy

## Goal

Local economy driven by scarcity, labor, ownership, and subjective value — not fixed vending prices alone.

## Acceptance

- [x] Goods with stock, restock, scarcity + demand price drift
- [x] Work shifts + pay; farm alternative; bank deposit/withdraw
- [x] Creature↔creature barter of bread
- [ ] Subjective utility pricing (need/relationship modifiers)
- [ ] Negotiated trades with haggling
- [ ] Debt / informal obligations
- [ ] Specialization / division of labor beyond education bonus
- [ ] Known thieves refused service
- [ ] Wealth inequality emergent and visible in society pulse

## Current state

`economy.ts` + market HUD; reputation can gate social steal/share already.

## Out of scope

Global stock market simulation.

## Next steps

1. `valueTo(creature, item)` function used in buy/trade.
2. Shop refuse if `reputation.thief` high.
3. Debt IOUs as semantic social facts.
4. Tests for scarcity price rise and thief refusal.
