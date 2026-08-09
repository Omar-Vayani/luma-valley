import type { Vec2 } from './creature'

/** Player — first-person avatar state (movement is render-side input). */
export interface PlayerState {
  pos: Vec2
  facingYaw: number
  inventory: { berries: number; wood: number; torch: number; items: Partial<Record<string, number>> }
  torchLit: boolean
  sanity: number
  carryingId: number | null
}

export function createPlayer(pos: Vec2): PlayerState {
  return {
    pos: { ...pos },
    facingYaw: 0,
    inventory: { berries: 0, wood: 0, torch: 1, items: { bread: 2, medicine: 1 } },
    torchLit: false,
    sanity: 1,
    carryingId: null,
  }
}

/** Pick a berry from a bush (simulated as +1 inventory). */
export function pickBerry(p: PlayerState): boolean {
  if (p.inventory.berries >= 10) return false
  p.inventory.berries++
  return true
}

export function collectWood(p: PlayerState): boolean {
  if (p.inventory.wood >= 5) return false
  p.inventory.wood++
  return true
}

export function craftTorch(p: PlayerState): boolean {
  if (p.inventory.wood >= 2 && p.inventory.torch < 5) {
    p.inventory.wood -= 2
    p.inventory.torch++
    return true
  }
  return false
}

export function toggleTorch(p: PlayerState): void {
  if (p.inventory.torch > 0) {
    p.torchLit = !p.torchLit
  }
}

/** Throw a berry (distracts shadow beasts). */
export function throwBerry(p: PlayerState): boolean {
  if (p.inventory.berries <= 0) return false
  p.inventory.berries--
  return true
}
