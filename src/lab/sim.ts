/**
 * sim — the test-lab orchestrator.
 * Owns the world, the creatures, the tick loop, and every visible event.
 * Decisions are utility-lite: needs + genes pick a goal each tick; the
 * creature walks toward it; at the destination the action happens.
 * All state is plain JSON-safe data so save/load is trivial.
 */
import { createCreature, randomName, type Creature } from './creature'
import { tickChem, applyPlay } from './chem'
import { randomGenome, crossover, mutate, type Genome } from './genetics'
import { TOWERS, findTower, towerAt, WORLD_HALF, type TowerId } from './world'
import { learnFact, addVendetta, preferPlace, decayMemory } from './memory'
import { mulberry32 } from './rng'
import { dist, clamp01 } from './util'

export type SimEventType = 'fight' | 'steal' | 'love' | 'birth' | 'sleep' | 'death' | 'eat' | 'work' | 'drink' | 'medicine' | 'flinch' | 'joinGang' | 'drop' | 'hit' | 'play' | 'comfort' | 'heal' | 'gift' | 'scare' | 'rob'

export interface SimEvent {
  type: SimEventType
  aId: number
  bId?: number
  x: number
  z: number
}

export interface SimDrop {
  kind: 'food' | 'money'
  x: number
  z: number
  amount: number
}

export interface Sim {
  seed: number
  time: number
  creatures: Creature[]
  nextId: number
  rng: () => number
  events: SimEvent[]
  drops: SimDrop[]
  spawnCreature(genome?: Genome, x?: number, z?: number): Creature
  tick(): void
  poke(id: number): void
  hit(id: number): void
  dropFood(x: number, z: number): void
  dropMoney(x: number, z: number, amount: number): void
  comfort(id: number): void
  heal(id: number): void
  gift(id: number, amount: number): void
  scare(id: number): void
  rob(id: number): void
  creatureById(id: number): Creature | undefined
}

const SPEED = 0.45
const FIGHT_RANGE = 2.5
const STEAL_RANGE = 2.5
const SOCIAL_RANGE = 3
const BIRTH_COOLDOWN = 120

/** Keep a coordinate inside the world walls (a creature can never leave). */
function clampCoord(v: number): number {
  const bound = WORLD_HALF - 1.5
  return Math.min(bound, Math.max(-bound, v))
}

export function createSim(seed = 1): Sim {
  const sim: Sim = {
    seed,
    time: 0,
    creatures: [],
    nextId: 1,
    rng: mulberry32(seed),
    events: [],
    drops: [],
    spawnCreature(genome?: Genome, x?: number, z?: number): Creature {
      const g = genome ?? randomGenome(sim.rng)
      const cx = clampCoord(x ?? (sim.rng() - 0.5) * 40)
      const cz = clampCoord(z ?? (sim.rng() - 0.5) * 40)
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
    comfort(id: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      c.chem.fear = clamp01(c.chem.fear - 0.3)
      c.chem.pleasure = clamp01(c.chem.pleasure + 0.15)
      c.chem.social = clamp01(c.chem.social + 0.15)
      emit(sim, 'comfort', c, undefined, c.pos.x, c.pos.z)
    },
    heal(id: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      c.chem.health = clamp01(c.chem.health + 0.3)
      c.chem.fear = clamp01(c.chem.fear - 0.1)
      emit(sim, 'heal', c, undefined, c.pos.x, c.pos.z)
    },
    gift(id: number, amount: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      c.wallet += amount
      emit(sim, 'gift', c, undefined, c.pos.x, c.pos.z)
    },
    scare(id: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      c.chem.fear = clamp01(c.chem.fear + 0.55)
      addVendetta(c.memory, 0, 0.3) // 0 = the observer; they remember being frightened
      emit(sim, 'scare', c, undefined, c.pos.x, c.pos.z)
    },
    rob(id: number): void {
      const c = sim.creatureById(id)
      if (!c || !c.alive) return
      const taken = Math.min(c.wallet, 4)
      c.wallet -= taken
      learnFact(c.memory, 'bankIsSafe', 0.5)
      addVendetta(c.memory, 0, 0.6)
      emit(sim, 'rob', c, undefined, c.pos.x, c.pos.z)
    },
    dropFood(x: number, z: number): void {
      const fx = clampCoord(x)
      const fz = clampCoord(z)
      sim.drops.push({ kind: 'food', x: fx, z: fz, amount: 1 })
      emit(sim, 'drop', undefined, undefined, fx, fz)
    },
    dropMoney(x: number, z: number, amount: number): void {
      const fx = clampCoord(x)
      const fz = clampCoord(z)
      sim.drops.push({ kind: 'money', x: fx, z: fz, amount })
      emit(sim, 'drop', undefined, undefined, fx, fz)
    },
    tick(): void {
      sim.time++
      // decisions for every alive creature
      for (const c of sim.creatures) {
        if (!c.alive) continue
        decide(sim, c)
        // stay inside the world — nothing escapes the lab
        c.pos.x = clampCoord(c.pos.x)
        c.pos.z = clampCoord(c.pos.z)
      }
      // drops: creatures eat food piles / collect money piles they reach
      for (const c of sim.creatures) {
        if (!c.alive) continue
        for (let i = sim.drops.length - 1; i >= 0; i--) {
          const d = sim.drops[i]
          if (dist(c.pos.x, c.pos.z, d.x, d.z) > 1.2) continue
          if (d.kind === 'food' && c.chem.hunger < 0.85) {
            c.eat()
            sim.drops.splice(i, 1)
            emit(sim, 'eat', c, undefined, d.x, d.z)
          } else if (d.kind === 'money') {
            c.wallet += d.amount
            sim.drops.splice(i, 1)
            emit(sim, 'steal', c, undefined, d.x, d.z)
          }
        }
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
      if (sim.drops.length > 60) sim.drops.splice(0, sim.drops.length - 60)
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
    // a nearby food drop is closer than the tower
    const foodDrop = nearestDrop(sim, c, 'food', 30)
    if (foodDrop) {
      goToPoint(c, foodDrop.x, foodDrop.z, 'eat drop')
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

  // 8b. play/exercise: bored or weak creatures seek the playground
  if (c.chem.pleasure < 0.4 || c.chem.strength < 0.2) {
    if (at?.id === 'play') {
      applyPlay(c.chem)
      emit(sim, 'play', c, undefined, c.pos.x, c.pos.z)
      c.action = 'play'
      return
    }
    goTo(sim, c, 'play')
    return
  }

  // 8c. money: poor or greedy creatures collect dropped coins
  if (c.wallet < 4 || c.genome.greed > 0.6) {
    const coin = nearestDrop(sim, c, 'money', 40)
    if (coin) {
      goToPoint(c, coin.x, coin.z, 'collect')
      return
    }
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
  c.memory.seenPlaces[towerId] = (c.memory.seenPlaces[towerId] ?? 0) + 1
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

function goToPoint(c: Creature, x: number, z: number, actionLabel: string): void {
  const d = dist(c.pos.x, c.pos.z, x, z)
  if (d <= 0.5) {
    c.action = actionLabel
    return
  }
  const step = Math.min(SPEED, d)
  c.pos.x += ((x - c.pos.x) / d) * step
  c.pos.z += ((z - c.pos.z) / d) * step
  c.facing = Math.atan2(x - c.pos.x, z - c.pos.z)
  c.action = actionLabel
}

function nearestDrop(sim: Sim, c: Creature, kind: 'food' | 'money', range: number): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestD = range
  for (const d of sim.drops) {
    if (d.kind !== kind) continue
    const dd = dist(c.pos.x, c.pos.z, d.x, d.z)
    if (dd < bestD) {
      bestD = dd
      best = { x: d.x, z: d.z }
    }
  }
  return best
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
  const dmgA = 0.05 + (a.weapon === 'stick' ? 0.1 : 0) + a.genome.aggression * 0.04 + a.chem.strength * 0.06
  const dmgB = 0.05 + (b.weapon === 'stick' ? 0.1 : 0) + b.genome.aggression * 0.04 + b.chem.strength * 0.06
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
  // curiosity + novelty: prefer towers the creature has never (or rarely) seen.
  // This keeps creatures exploring the whole map instead of piling on two spots.
  const curiosity = c.genome.curiosity
  let best: TowerId | null = null
  let bestScore = -Infinity
  for (const t of TOWERS) {
    const seen = c.memory.seenPlaces[t.id] ?? 0
    const novelty = Math.max(0, 1 - seen * 0.4)
    const d = dist(c.pos.x, c.pos.z, t.x, t.z)
    // far towers get a small boost only for very curious creatures
    const farness = d / 90
    const score = novelty * (0.4 + curiosity * 0.8) + farness * curiosity * 0.5 + sim.rng() * 0.2
    if (score > bestScore) {
      bestScore = score
      best = t.id
    }
  }
  goTo(sim, c, best ?? 'food')
}
