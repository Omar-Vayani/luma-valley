/**
 * household — families share a home, storage expectations, and care duties.
 * Homes are slots around the homes tower; partners + children form a household.
 */
import type { Creature } from './creature'
import { findTower } from './world'
import { clamp01 } from './util'

export interface Household {
  id: number
  homeSlot: number // 0..N around homes tower
  memberIds: number[]
  sharedCoins: number // tiny household kitty
  foundedTick: number
}

export interface HavenSociety {
  households: Household[]
  nextHouseholdId: number
  /** creatureId → householdId */
  membership: Record<number, number>
}

export function createSociety(): HavenSociety {
  return { households: [], nextHouseholdId: 1, membership: {} }
}

const HOME_SLOTS = 8
const SLOT_RADIUS = 10

/** World position for a home slot around the homes tower. */
export function homeSlotPos(slot: number): { x: number; z: number } {
  const homes = findTower('homes')
  const cx = homes?.x ?? -36
  const cz = homes?.z ?? 0
  const angle = (slot / HOME_SLOTS) * Math.PI * 2
  return {
    x: cx + Math.cos(angle) * SLOT_RADIUS,
    z: cz + Math.sin(angle) * SLOT_RADIUS,
  }
}

export function householdOf(society: HavenSociety, creatureId: number): Household | undefined {
  const hid = society.membership[creatureId]
  if (hid == null) return undefined
  return society.households.find((h) => h.id === hid)
}

/** Form or join a household when two partners bond strongly. */
export function ensureCoupleHousehold(
  society: HavenSociety,
  a: Creature,
  b: Creature,
  tick: number,
): Household {
  const existingA = householdOf(society, a.id)
  const existingB = householdOf(society, b.id)
  if (existingA && existingA.memberIds.includes(b.id)) return existingA
  if (existingA && !existingB) {
    addMember(society, existingA, b)
    return existingA
  }
  if (existingB && !existingA) {
    addMember(society, existingB, a)
    return existingB
  }
  // new household
  const used = new Set(society.households.map((h) => h.homeSlot))
  let slot = 0
  while (used.has(slot) && slot < HOME_SLOTS - 1) slot++
  const h: Household = {
    id: society.nextHouseholdId++,
    homeSlot: slot,
    memberIds: [a.id, b.id],
    sharedCoins: 0,
    foundedTick: tick,
  }
  society.households.push(h)
  society.membership[a.id] = h.id
  society.membership[b.id] = h.id
  a.householdId = h.id
  b.householdId = h.id
  return h
}

function addMember(society: HavenSociety, h: Household, c: Creature): void {
  if (!h.memberIds.includes(c.id)) h.memberIds.push(c.id)
  society.membership[c.id] = h.id
  c.householdId = h.id
}

/** Register a newborn into the parents' household. */
export function adoptChild(society: HavenSociety, parent: Creature, child: Creature): void {
  const h = householdOf(society, parent.id)
  if (!h) return
  addMember(society, h, child)
}

/** Soft care: adults in a household slightly share social warmth with kids. */
export function tickHouseholdCare(society: HavenSociety, creatures: Creature[]): void {
  for (const h of society.households) {
    const members = h.memberIds
      .map((id) => creatures.find((c) => c.id === id))
      .filter((c): c is Creature => !!c && c.alive)
    if (members.length < 2) continue
    const adults = members.filter((c) => c.age > 400)
    const kids = members.filter((c) => c.age <= 400)
    for (const kid of kids) {
      for (const adult of adults) {
        // neglect if adult is high greed / low loyalty and stressed
        const neglect =
          adult.genome.greed > 0.7 &&
          adult.genome.loyalty < 0.4 &&
          (adult.chem.hunger < 0.35 || adult.chem.fear > 0.5)
        if (neglect) {
          kid.chem.social = clamp01(kid.chem.social - 0.002)
          kid.chem.fear = clamp01(kid.chem.fear + 0.001)
        } else {
          kid.chem.social = clamp01(kid.chem.social + 0.004)
          kid.chem.fear = clamp01(kid.chem.fear - 0.002)
          adult.chem.social = clamp01(adult.chem.social + 0.001)
        }
      }
    }
  }
}

/** Remove dead members; dissolve empty households. */
export function pruneHouseholds(society: HavenSociety, creatures: Creature[]): void {
  const alive = new Set(creatures.filter((c) => c.alive).map((c) => c.id))
  society.households = society.households.filter((h) => {
    h.memberIds = h.memberIds.filter((id) => alive.has(id))
    if (h.memberIds.length === 0) {
      for (const [cid, hid] of Object.entries(society.membership)) {
        if (hid === h.id) delete society.membership[Number(cid)]
      }
      return false
    }
    return true
  })
}
