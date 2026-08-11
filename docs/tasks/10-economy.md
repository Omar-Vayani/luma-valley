# Task 10 — Economy

**Status:** `partial`  
**Vision sections:** Economy

## Goal

Local economy driven by scarcity, labor, ownership, and subjective value — not fixed vending prices alone.

## Acceptance

- [x] Goods with stock, restock, scarcity + demand price drift
- [x] Work shifts + pay; farm alternative; bank deposit/withdraw
- [x] Creature↔creature barter of bread
- [x] valueTo() prices by hunger, health, dependence, and wealth
- [x] negotiate() applies trust discounts and suspicion markups
- [x] Ledger tracks informal debts (not yet created by gameplay events)
- [ ] Specialization / division of labor beyond education bonus
- [x] Sellers refuse known thieves outright
- [x] Gini-style inequality shown in the society panel

## Current state

`economy.ts` + market HUD; reputation can gate social steal/share already.

## Out of scope

Global stock market simulation.

## Next steps

1. `valueTo(creature, item)` function used in buy/trade.
2. Shop refuse if `reputation.thief` high.
3. Debt IOUs as semantic social facts.
4. Tests for scarcity price rise and thief refusal.

## Notes

- 2026-08-11 — advanced in the Haven society pass.
