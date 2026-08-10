/**
 * player — the player's character in the world. DISTINCT from creatures: a
 * human-like lab visitor who can fight, equip objects, hold an inventory, and
 * interact directly with the creatures. Not a ball creature, not bound by the
 * sim's need/mind loop — the player acts by direct control.
 */
import { createInventory, type Inventory, type ItemId } from './inventory'

export interface Player {
  pos: { x: number; z: number }
  facing: number
  health: number
  alive: boolean
  wallet: number
  inventory: Inventory
  weapon: ItemId | null
  bondWith: number[] // creature ids the player has bonded with
  name: string
  /** 0..1 — how full the player is; bread restores it, time drains it. */
  hunger: number
}

export function createPlayer(x: number, z: number, name = 'Visitor'): Player {
  return {
    pos: { x, z },
    facing: 0,
    health: 1,
    alive: true,
    wallet: 12,
    inventory: createInventory(),
    weapon: null,
    bondWith: [],
    name,
    hunger: 0.75,
  }
}

export function movePlayer(p: Player, dx: number, dz: number): void {
  p.pos.x += dx
  p.pos.z += dz
  if (Math.hypot(dx, dz) > 0.0001) p.facing = Math.atan2(dx, dz)
}

export function hurtPlayer(p: Player, amount: number): void {
  p.health = Math.max(0, p.health - amount)
  if (p.health <= 0) p.alive = false
}

export function healPlayer(p: Player, amount: number): void {
  p.health = Math.min(1, p.health + amount)
  p.alive = true
}

/** Eat food: restores hunger (and a sliver of health — a meal sustains you). */
export function eatPlayer(p: Player, amount: number): void {
  p.hunger = Math.min(1, p.hunger + amount)
  p.health = Math.min(1, p.health + amount * 0.06)
  p.alive = true
}

export function equipItem(p: Player, id: ItemId): boolean {
  if ((p.inventory.items[id] ?? 0) <= 0) return false
  p.inventory.items[id] = (p.inventory.items[id] ?? 0) - 1
  if (p.inventory.items[id] === 0) delete p.inventory.items[id]
  p.weapon = id
  return true
}

export function playerCanFight(_p: Player): boolean {
  return true // the player is always able to fight (health permitting)
}

export function isPlayerAlive(p: Player): boolean {
  return p.alive && p.health > 0
}
