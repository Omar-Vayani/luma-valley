/**
 * interact — one set of world rules for the player and the creatures.
 *
 * Both use these functions to sleep in a bed, open a door, take from a
 * container, or hand something over. Nobody teleports items or reaches
 * through walls: everything requires being physically close enough.
 */
import type { Inventory, ItemId } from './inventory'
import { addItem, canCarry, countItem, removeItem, tradeItem, ownerOf } from './inventory'
import { itemDef } from './items'
import { TOWERS, type TowerId } from './world'
import { dist } from './util'

/** How close you must be to use something. */
export const REACH = 2.2

export type FixtureKind = 'bed' | 'door' | 'container' | 'counter' | 'bench'

export interface Fixture {
  id: string
  kind: FixtureKind
  tower: TowerId
  x: number
  z: number
  /** container contents (only for containers) */
  storage?: Inventory
  /** who owns this fixture: creature id, or undefined for public */
  ownerId?: number
  /** doors can be shut */
  open?: boolean
}

export interface Actor {
  pos: { x: number; z: number }
  inventory: Inventory
  id?: number
}

/** Is the actor physically able to reach this spot? */
export function withinReach(actor: Actor, x: number, z: number, reach = REACH): boolean {
  return dist(actor.pos.x, actor.pos.z, x, z) <= reach
}

export function fixtureReachable(actor: Actor, f: Fixture): boolean {
  return withinReach(actor, f.x, f.z)
}

/** Build the fixtures for a settlement: a bed per house, storage, counters. */
export function createFixtures(): Fixture[] {
  const fixtures: Fixture[] = []
  for (const t of TOWERS) {
    if (t.id === 'homes' || t.id.startsWith('house')) {
      fixtures.push({ id: `${t.id}-bed`, kind: 'bed', tower: t.id, x: t.x + 1.5, z: t.z + 1.5 })
      fixtures.push({
        id: `${t.id}-chest`,
        kind: 'container',
        tower: t.id,
        x: t.x - 1.5,
        z: t.z + 1.5,
        storage: { items: {}, owners: {} },
      })
      fixtures.push({ id: `${t.id}-door`, kind: 'door', tower: t.id, x: t.x, z: t.z + t.radius, open: true })
      continue
    }
    if (t.id === 'graveyard' || t.id === 'park' || t.id === 'farm') {
      fixtures.push({ id: `${t.id}-bench`, kind: 'bench', tower: t.id, x: t.x + 2, z: t.z + 2 })
      continue
    }
    fixtures.push({ id: `${t.id}-counter`, kind: 'counter', tower: t.id, x: t.x, z: t.z + 2 })
    fixtures.push({
      id: `${t.id}-store`,
      kind: 'container',
      tower: t.id,
      x: t.x - 2,
      z: t.z + 2,
      storage: { items: {}, owners: {} },
    })
  }
  return fixtures
}

export function fixtureAt(fixtures: Fixture[], x: number, z: number, reach = REACH): Fixture | undefined {
  let best: Fixture | undefined
  let bestD = reach
  for (const f of fixtures) {
    const d = dist(x, z, f.x, f.z)
    if (d < bestD) {
      bestD = d
      best = f
    }
  }
  return best
}

export function fixturesOfTower(fixtures: Fixture[], tower: TowerId): Fixture[] {
  return fixtures.filter((f) => f.tower === tower)
}

export type UseResult =
  | { ok: true; effect: string }
  | { ok: false; reason: 'out-of-reach' | 'wrong-kind' | 'full' | 'empty' | 'locked' }

/** Sleep in a bed: only works if you can actually reach it. */
export function useBed(actor: Actor, f: Fixture): UseResult {
  if (f.kind !== 'bed') return { ok: false, reason: 'wrong-kind' }
  if (!fixtureReachable(actor, f)) return { ok: false, reason: 'out-of-reach' }
  return { ok: true, effect: 'rest' }
}

/** Open or shut a door. Private doors resist strangers. */
export function toggleDoor(actor: Actor, f: Fixture): UseResult {
  if (f.kind !== 'door') return { ok: false, reason: 'wrong-kind' }
  if (!fixtureReachable(actor, f)) return { ok: false, reason: 'out-of-reach' }
  if (f.ownerId !== undefined && actor.id !== undefined && f.ownerId !== actor.id) {
    return { ok: false, reason: 'locked' }
  }
  f.open = !f.open
  return { ok: true, effect: f.open ? 'opened' : 'closed' }
}

/** Put an item into a container you can reach. */
export function storeItem(actor: Actor, f: Fixture, id: ItemId, n = 1): UseResult {
  if (f.kind !== 'container' || !f.storage) return { ok: false, reason: 'wrong-kind' }
  if (!fixtureReachable(actor, f)) return { ok: false, reason: 'out-of-reach' }
  if (countItem(actor.inventory, id) < n) return { ok: false, reason: 'empty' }
  removeItem(actor.inventory, id, n)
  addItem(f.storage, id, n, actor.id)
  return { ok: true, effect: `stored ${id}` }
}

/** Take from a container. Ownership is remembered, so this can be theft. */
export function takeItem(actor: Actor, f: Fixture, id: ItemId, n = 1): UseResult & { stolen?: boolean } {
  if (f.kind !== 'container' || !f.storage) return { ok: false, reason: 'wrong-kind' }
  if (!fixtureReachable(actor, f)) return { ok: false, reason: 'out-of-reach' }
  if (countItem(f.storage, id) < n) return { ok: false, reason: 'empty' }
  if (!canCarry(actor.inventory, id, n)) return { ok: false, reason: 'full' }
  const owner = ownerOf(f.storage, id)
  const stolen = owner !== undefined && actor.id !== undefined && owner !== actor.id
  tradeItem(f.storage, actor.inventory, id, n, { stolen })
  return { ok: true, effect: `took ${id}`, stolen }
}

/** Hand something to someone standing next to you. */
export function giveItem(from: Actor, to: Actor, id: ItemId, n = 1): UseResult {
  if (!withinReach(from, to.pos.x, to.pos.z, REACH + 0.8)) return { ok: false, reason: 'out-of-reach' }
  if (countItem(from.inventory, id) < n) return { ok: false, reason: 'empty' }
  if (!canCarry(to.inventory, id, n)) return { ok: false, reason: 'full' }
  tradeItem(from.inventory, to.inventory, id, n, { newOwnerId: to.id })
  return { ok: true, effect: `gave ${id}` }
}

/** Consume something: the item catalog decides what it does. */
export function consumeItem(
  actor: Actor,
  id: ItemId,
  chem: Record<string, number>,
): UseResult {
  const def = itemDef(id)
  if (!def || !def.use) return { ok: false, reason: 'wrong-kind' }
  if (countItem(actor.inventory, id) < 1) return { ok: false, reason: 'empty' }
  removeItem(actor.inventory, id, 1)
  for (const [key, delta] of Object.entries(def.use)) {
    if (typeof chem[key] === 'number') {
      chem[key] = Math.max(0, Math.min(1, chem[key] + (delta as number)))
    }
  }
  return { ok: true, effect: def.effect }
}
