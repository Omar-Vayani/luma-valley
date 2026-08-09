/**
 * sim — the test-lab orchestrator.
 * Owns the world, the creatures, the tick loop, and every visible event.
 * Decisions are utility-lite: needs + genes pick a goal each tick; the
 * creature walks toward it; at the destination the action happens.
 * All state is plain JSON-safe data so save/load is trivial.
 */
import { createCreature, randomName, type Creature } from './creature'
import { tickChem } from './chem'
import { randomGenome, crossover, mutate, type Genome } from './genetics'
import { TOWERS, findTower, towerAt, type TowerId } from './world'
import { learnFact, addVendetta, preferPlace, decayMemory } from './memory'
import { mulberry32 } from './rng'
import { dist, clamp01 } from './util'

export type SimEventType = 'fight' | 'steal' | 'love' | 'birth' | 'sleep' | 'death' | 'eat' | 'work' | 'drink' | 'medicine' | 'flinch' | 'joinGang' | 'drop' | 'hit'

export interface SimEvent {
  type: SimEventType
  aId: number
  bId?: number
  x: number
  z: number
}

export interface Sim {
  seed: number
  time: number
  creatures: Creature[]
  nextId: number
  rng: () => number
  events: SimEvent[]
  spawnCreature(genome?: Genome, x?: number, z?: number): Creature
  tick(): void
  poke(id: number): void
  hit(id: number): void
  dropFood(x: number, z: number): void
  dropMoney(x: number, z: number, amount: number): void
  creatureById(id: number): Creature | undefined
}

const SPEED = 0.45
const FIGHT_RANGE = 2.5
const STEAL_RANGE = 2.5
const SOCIAL_RANGE = 3
const BIRTH_COOLDOWN = 120

export function createSim(seed = 1): Sim {
  const sim: Sim = {
    seed,
    time: 0,
    creatures: [],
    nextId: 1,
    rng: mulberry32(seed),
    events: [],
    spawnCreature(genome?: Genome, x?: number, z?: number): Creature {
      const g = genome ?? randomGenome(sim.rng)
      const cx = x ?? (sim.rng() - 0.5) * 24
      const cz = z ?? (sim.rng() - 0.5) * 24
      const c = createCreature(sim.nextId++, randomName(sim.rng), g, cx, cz)
      c.wallet = 2 + Math.floor(sim.rng() * 6)
      sim.creatures.push(c)
      return c
    },
    creatureById(id: number): Creature | undefined {
      return sim.creatures.find((c) => c.id === id)
    },
    poke(id: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      c.chem.fear = clamp01(c.chem.fear + 0.05)
      emit(sim, 'flinch', c, undefined, c.pos.x, c.pos.z)
    },
    hit(id: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      c.hurt(0.12)
      learnFact(c.memory, 'someoneStoleFromMe', 0.3)
      emit(sim, 'hit', c, undefined, c.pos.x, c.pos.z)
    },
    dropFood(x: number, z: number): void {
      emit(sim, 'drop', undefined, undefined, x, z)
    },
    dropMoney(x: number, z: number, _amount: number): void {
      emit(sim, 'drop', undefined, undefined, x, z)
    },
    tick(): void {
      sim.time++
      // decisions for every alive creature
      for (const c of sim.creatures) {
        if (!c.alive) continue
        decide(sim, c)
      }
      // chemistry decay + memory decay + events trim
      for (const c of sim.creatures) {
        tickChem(c.chem, sim.time)
        decayMemory(c.memory)
        c.age++
        if (c.fightCooldown > 0) c.fightCooldown--
        if (c.chem.health <= 0 && c.action !== 'dead') {
          c.alive = false
          c.action = 'dead'
          emit(sim, 'death', c, undefined, c.pos.x, c.pos.z)
          grieve(sim, c)
        }
      }
      if (sim.events.length > 40) sim.events.splice(0, sim.events.length - 40)
    },
  }
  return sim
}

/** Push a renderer-visible event. */
export function emit(sim: Sim, type: SimEventType, a: Creature | undefined, b: Creature | undefined, x: number, z: number): void {
  sim.events.push({
    type,
    aId: a?.id ?? 0,
    bId: b?.id,
    x,
    z,
  })
}

/** One decision: choose a goal + act on arrival. */
function decide(sim: Sim, c: Creature): void {
  // Mourning: no love, no socializing, slow wandering — depression visible.
  if (c.chem.grief > 0.4) {
    const t = TOWERS[Math.floor(sim.rng() * TOWERS.length)]
    goTo(sim, c, t.id)
    c.action = 'mourn' // goTo sets 'go X'; keep the visible mourning label
    return
  }

  if (c.sleeping) {
    if (c.chem.energy > 0.8) {
      c.sleeping = false
      c.action = 'idle'
    } else {
      c.action = 'sleep'
      c.chem.energy = clamp01(c.chem.energy + 0.35)
      return
    }
  }

  const at = towerAt(c.pos.x, c.pos.z)

  // 1. exhausted: collapse
  if (c.chem.energy < 0.08) {
    c.sleeping = true
    c.action = 'sleep'
    return
  }

  // 1b. afraid (high fear + fearful genes): flee away from danger
  if (c.chem.fear > 0.6 && c.genome.fearfulness > 0.5 && c.genome.courage < 0.5) {
    flee(sim, c)
    return
  }

  // 1c. wounded: seek the pharmacy to heal before doing anything else
  if (c.chem.health < 0.4) {
    if (at?.id === 'pharmacy') {
      const dose = 0.1 + c.genome.addictionProne * 0.25
      c.chem.health = clamp01(c.chem.health + 0.3)
      c.chem.addiction.medicine = clamp01((c.chem.addiction.medicine ?? 0) + dose)
      c.chem.lastDose.medicine = sim.time
      emit(sim, 'medicine', c, undefined, c.pos.x, c.pos.z)
      c.action = 'medicine'
      return
    }
    goTo(sim, c, 'pharmacy')
    return
  }

  // 2. at homes + tired: sleep
  if (at?.id === 'homes' && c.chem.energy < 0.6) {
    c.sleeping = true
    c.action = 'sleep'
    c.chem.energy = clamp01(c.chem.energy + 0.35)
    return
  }

  // 3. hunger: go to food, eat there
  if (c.chem.hunger < 0.3) {
    if (at?.id === 'food') {
      c.eat()
      preferPlace(c.memory, 'food')
      emit(sim, 'eat', c, undefined, c.pos.x, c.pos.z)
      c.action = 'eat'
      return
    }
    goTo(sim, c, 'food')
    return
  }

  // 4. bank: deposit if learned safe, else work
  if (at?.id === 'bank') {
    if (c.memory.facts.bankIsSafe && c.wallet > 4) {
      c.deposit(Math.min(4, c.wallet))
      c.action = 'deposit'
      return
    }
    c.work(2)
    emit(sim, 'work', c, undefined, c.pos.x, c.pos.z)
    c.action = 'work'
    return
  }

  // 5. tavern: pleasure + drink (addiction hooks)
  if (at?.id === 'tavern') {
    c.chem.pleasure = clamp01(c.chem.pleasure + 0.3)
    c.chem.intoxication = clamp01(c.chem.intoxication + 0.25)
    const dose = 0.06 + c.genome.addictionProne * 0.2
    c.chem.addiction.drink = clamp01((c.chem.addiction.drink ?? 0) + dose)
    c.chem.lastDose.drink = sim.time
    emit(sim, 'drink', c, undefined, c.pos.x, c.pos.z)
    c.action = 'drink'
    return
  }

  // 6. pharmacy: medicine when hurt (addictive)
  if (at?.id === 'pharmacy' && c.chem.health < 0.7) {
    const dose = 0.1 + c.genome.addictionProne * 0.25
    c.chem.health = clamp01(c.chem.health + 0.3)
    c.chem.addiction.medicine = clamp01((c.chem.addiction.medicine ?? 0) + dose)
    c.chem.lastDose.medicine = sim.time
    emit(sim, 'medicine', c, undefined, c.pos.x, c.pos.z)
    c.action = 'medicine'
    return
  }

  // 7. tools: buy a weapon when able
  if (at?.id === 'tools' && !c.weapon && c.wallet >= 5) {
    c.pay(5)
    c.weapon = 'stick'
    c.action = 'buy'
    return
  }

  // 8. gang: aggressive + loyal join
  if (at?.id === 'gang' && c.gangId === null && c.genome.aggression > 0.6 && c.genome.loyalty > 0.5) {
    c.gangId = 1
    emit(sim, 'joinGang', c, undefined, c.pos.x, c.pos.z)
    c.action = 'gang'
    return
  }

  // 9. partner + homes + bond: procreate (with cooldown)
  if (at?.id === 'homes' && c.partnerId !== null && c.chem.bond > 0.7) {
    const partner = sim.creatureById(c.partnerId)
    const lastBirth = c.memory.facts.partnerIsHere ?? -1000
    if (partner && partner.alive && partner.chem.bond > 0.7 && sim.time - lastBirth > BIRTH_COOLDOWN) {
      c.memory.facts.partnerIsHere = sim.time
      partner.memory.facts.partnerIsHere = sim.time
      procreate(sim, c, partner)
      return
    }
  }

  // 10. social: near creatures — vendetta fight, steal, bond, or socialize
  const near = nearestOther(sim, c, SOCIAL_RANGE)
  if (near) {
    const d = dist(c.pos.x, c.pos.z, near.pos.x, near.pos.z)
    if (c.fightCooldown <= 0 && c.memory.vendettas[near.id] && d <= FIGHT_RANGE) {
      fight(sim, c, near)
      return
    }
    if (c.genome.theft > 0.6 && near.wallet > 0 && d <= STEAL_RANGE && c.wallet < 6) {
      steal(sim, c, near)
      return
    }
    if (c.genome.sociability > 0.5 && c.bonds[near.id] === undefined && d <= SOCIAL_RANGE) {
      c.socialize(near)
      emit(sim, 'love', c, near, c.pos.x, c.pos.z)
      c.action = 'social'
      return
    }
    if (c.fightCooldown <= 0 && c.genome.aggression > 0.7 && d <= FIGHT_RANGE) {
      fight(sim, c, near)
      return
    }
  }

  // 11. wander: pick a tower to explore
  wander(sim, c)
}

function goTo(_sim: Sim, c: Creature, towerId: TowerId): void {
  const t = findTower(towerId)
  if (!t) return
  c.goalTowerId = towerId
  const d = dist(c.pos.x, c.pos.z, t.x, t.z)
  if (d <= t.radius) {
    c.action = 'arrived'
    return
  }
  const step = Math.min(SPEED, d)
  const dx = ((t.x - c.pos.x) / d) * step
  const dz = ((t.z - c.pos.z) / d) * step
  c.pos.x += dx
  c.pos.z += dz
  c.facing = Math.atan2(dx, dz)
  c.action = `go ${towerId}`
}

/** Flee: run away from the nearest living creature, fast, away from towers. */
function flee(sim: Sim, c: Creature): void {
  c.goalTowerId = null
  const near = nearestOther(sim, c, 20)
  let awayX = 1
  let awayZ = 0
  if (near) {
    const dx = c.pos.x - near.pos.x
    const dz = c.pos.z - near.pos.z
    const d = Math.hypot(dx, dz) || 1
    awayX = dx / d
    awayZ = dz / d
  }
  const speed = SPEED * 1.6
  c.pos.x += awayX * speed
  c.pos.z += awayZ * speed
  c.facing = Math.atan2(awayX, awayZ)
  c.chem.fear = clamp01(c.chem.fear - 0.06)
  c.action = 'flee'
}

function nearestOther(sim: Sim, c: Creature, range: number): Creature | null {
  let best: Creature | null = null
  let bestD = range
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function steal(sim: Sim, thief: Creature, victim: Creature): void {
  const amount = Math.min(victim.wallet, 2 + Math.floor(thief.genome.greed * 4))
  victim.wallet -= amount
  thief.wallet += amount
  learnFact(victim.memory, 'bankIsSafe', 0.6 + amount * 0.05)
  addVendetta(victim.memory, thief.id, 0.8)
  preferPlace(victim.memory, 'bank')
  emit(sim, 'steal', thief, victim, victim.pos.x, victim.pos.z)
  thief.action = 'steal'
}

function fight(sim: Sim, a: Creature, b: Creature): void {
  const dmgA = 0.05 + (a.weapon === 'stick' ? 0.1 : 0) + a.genome.aggression * 0.04
  const dmgB = 0.05 + (b.weapon === 'stick' ? 0.1 : 0) + b.genome.aggression * 0.04
  b.hurt(dmgA)
  a.hurt(dmgB)
  // loser drops money
  if (b.chem.health < a.chem.health && b.wallet > 0) {
    const dropped = Math.min(b.wallet, 2)
    b.wallet -= dropped
    a.wallet += dropped
  }
  addVendetta(b.memory, a.id, 0.5)
  addVendetta(a.memory, b.id, 0.3)
  emit(sim, 'fight', a, b, (a.pos.x + b.pos.x) / 2, (a.pos.z + b.pos.z) / 2)
  a.action = 'fight'
  b.action = 'fight'
  a.fightCooldown = 90
  b.fightCooldown = 90

  // resolution: whoever's health is crushed breaks off and flees (no infinite brawl).
  // Courage delays retreat; a wounded creature always retreats.
  const aRetreat = a.chem.health < 0.35 || (a.chem.health < b.chem.health && a.chem.health < 0.6 && a.genome.courage < 0.7)
  const bRetreat = b.chem.health < 0.35 || (b.chem.health < a.chem.health && b.chem.health < 0.6 && b.genome.courage < 0.7)
  if (aRetreat && !bRetreat) {
    flee(sim, a)
    b.action = 'idle'
  } else if (bRetreat && !aRetreat) {
    flee(sim, b)
    a.action = 'idle'
  }
}

function procreate(sim: Sim, a: Creature, b: Creature): void {
  const childGenome = mutate(crossover(a.genome, b.genome, sim.rng), 0.15, sim.rng)
  const child = createCreature(sim.nextId++, randomName(sim.rng), childGenome, a.pos.x + 0.8, a.pos.z + 0.8)
  child.wallet = 1
  sim.creatures.push(child)
  emit(sim, 'birth', a, b, a.pos.x, a.pos.z)
  a.action = 'birth'
  b.action = 'birth'
}

/** A creature died — partners and close bonds mourn (grief + sadness). */
function grieve(sim: Sim, dead: Creature): void {
  for (const c of sim.creatures) {
    if (c.id === dead.id || !c.alive) continue
    const isPartner = c.partnerId === dead.id
    const bond = c.bonds[dead.id] ?? 0
    if (isPartner) {
      c.partnerId = null
      c.chem.grief = clamp01(c.chem.grief + 1)
      c.chem.bond = clamp01(c.chem.bond - 0.3)
      c.action = 'mourn'
    } else if (bond > 0.5) {
      c.chem.grief = clamp01(c.chem.grief + 0.5)
      c.action = 'mourn'
    }
  }
}

function wander(sim: Sim, c: Creature): void {
  const t = TOWERS[Math.floor(sim.rng() * TOWERS.length)]
  goTo(sim, c, t.id)
}
