/**
 * creature — a ball with eyes. Holds genome, chemistry, memory, wallet,
 * bonds, and the small verbs (eat/sleep/work/pay/deposit/socialize).
 * The Sim orchestrates movement + decisions; this is pure state + verbs.
 */
import { createChem, applyFood, applySleep, applySocial, type ChemState } from './chem'
import { createMemory, type MemoryState } from './memory'
import type { Genome } from './genetics'
import type { ActionName } from './mind'
import { clamp01 } from './util'

export interface Creature {
  id: number
  name: string
  genome: Genome
  chem: ChemState
  memory: MemoryState
  pos: { x: number; z: number }
  facing: number
  wallet: number
  banked: number
  alive: boolean
  sleeping: boolean
  action: string
  goalTowerId: string | null
  gangId: number | null
  partnerId: number | null
  bonds: Record<number, number>
  age: number
  weapon: string | null
  fightCooldown: number // ticks until this creature fights again
  workProgress: number // ticks worked toward the current shift
  gratitude: Record<number, number> // creatureId -> gratitude toward them
  intention: ActionName | null // the action the mind is committed to
  intentionTicks: number // ticks remaining on the current commitment
  hurt(amount: number): void
  pay(amount: number): boolean
  deposit(amount: number): void
  withdraw(amount: number): void
  work(amount: number): void
  sleep(): void
  wake(): void
  eat(): void
  socialize(other: Creature): void
  tryPair(other: Creature): void
}

const NAMES = ['Bobo', 'Nana', 'Momo', 'Gigi', 'Kiko', 'Lulu', 'Tutu', 'Fifi', 'Roro', 'Dodo', 'Zizi', 'Pepi']

export function createCreature(id: number, name: string, genome: Genome, x = 0, z = 0): Creature {
  const c: Creature = {
    id,
    name,
    genome,
    chem: createChem(),
    memory: createMemory(),
    pos: { x, z },
    facing: Math.random() * Math.PI * 2,
    wallet: 0,
    banked: 0,
    alive: true,
    sleeping: false,
    action: 'idle',
    goalTowerId: null,
    gangId: null,
    partnerId: null,
    bonds: {},
    age: 0,
    weapon: null,
    fightCooldown: 0,
    workProgress: 0,
    gratitude: {},
    intention: null,
    intentionTicks: 0,
    hurt(amount: number): void {
      if (!c.alive) return
      c.chem.health = clamp01(c.chem.health - amount)
      c.chem.fear = clamp01(c.chem.fear + amount * 0.6)
      if (c.chem.health <= 0) c.alive = false
    },
    pay(amount: number): boolean {
      if (c.wallet < amount) return false
      c.wallet -= amount
      return true
    },
    deposit(amount: number): void {
      const amt = Math.min(amount, c.wallet)
      c.wallet -= amt
      c.banked += amt
    },
    withdraw(amount: number): void {
      const amt = Math.min(amount, c.banked)
      c.banked -= amt
      c.wallet += amt
    },
    work(amount: number): void {
      c.wallet += amount
    },
    sleep(): void {
      applySleep(c.chem)
      c.sleeping = true
    },
    wake(): void {
      c.sleeping = false
    },
    eat(): void {
      applyFood(c.chem)
    },
    socialize(other: Creature): void {
      applySocial(c.chem)
      applySocial(other.chem)
      const gain = 0.06 + c.genome.sociability * 0.06 + other.genome.sociability * 0.04
      c.bonds[other.id] = clamp01((c.bonds[other.id] ?? 0) + gain)
      other.bonds[c.id] = clamp01((other.bonds[c.id] ?? 0) + gain)
      if (c.partnerId === null && c.bonds[other.id] > 0.6 && other.partnerId === null) {
        c.partnerId = other.id
        other.partnerId = c.id
        c.chem.bond = clamp01(c.chem.bond + 0.3)
        other.chem.bond = clamp01(other.chem.bond + 0.3)
      }
    },
    tryPair(other: Creature): void {
      if (c.partnerId === null && other.partnerId === null && c.bonds[other.id] > 0.5) {
        c.partnerId = other.id
        other.partnerId = c.id
      }
    },
  }
  return c
}

export function randomName(rng: () => number): string {
  return NAMES[Math.floor(rng() * NAMES.length)]
}
