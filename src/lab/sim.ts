/**
 * sim — the test-lab orchestrator.
 * Owns the world, the creatures, the tick loop, and every visible event.
 * Decisions are utility-lite: needs + genes pick a goal each tick; the
 * creature walks toward it; at the destination the action happens.
 * All state is plain JSON-safe data so save/load is trivial.
 */
import { createCreature, type Creature } from './creature'
import { tickChem, applyPlay, applySocial } from './chem'
import { randomGenome, crossover, mutate, type Genome } from './genetics'
import { TOWERS, findTower, towerAt, WORLD_HALF, type TowerId } from './world'
import { learnFact, addVendetta, preferPlace, decayMemory } from './memory'
import { createEconomy, tickEconomy, buyFromTower, marketPrice, WORK_SHIFT_TICKS, WORK_PAY, type Economy } from './economy'
import { createNamePool, pickName, type NamePool } from './names'
import { learnWord, shareWithNeighbors, sayWord, hearWord, getWord, CONCEPTS } from './language'
import { think, reward } from './brain'
import { agingDamage, canProcreate, procreationCost } from './lifecycle'
import { recordWrong, settleRevenge, decayGrudges } from './vengeance'
import { addItem, useItem, hasItem, tradeItem, countItem, type ItemId } from './inventory'
import { createPlayer, hurtPlayer, healPlayer, equipItem, eatPlayer, isPlayerAlive, type Player } from './player'
import { scoreActions, chooseAction, actionValid, COMMITMENT_TICKS, type ActionName } from './mind'
import { tickRelationships } from './relationships'
import { tickDrives, applySocialFeedback } from './drives'
import { tickEmotions, applyEmotionFeedback } from './emotions'
import { observeEvent, gossipSpread, trustTowards, getReputation } from './reputation'
import { mulberry32 } from './rng'
import { dist, clamp01 } from './util'

export type SimEventType = 'fight' | 'steal' | 'love' | 'birth' | 'sleep' | 'death' | 'eat' | 'work' | 'drink' | 'medicine' | 'flinch' | 'joinGang' | 'drop' | 'hit' | 'play' | 'school' | 'bury' | 'jealous' | 'say' | 'collect' | 'comfort' | 'heal' | 'gift' | 'scare' | 'rob'

export interface SimEvent {
  type: SimEventType
  aId: number | undefined
  bId: number | undefined
  x: number
  z: number
  tick: number
}

export interface SimDrop {
  kind: 'food' | 'money'
  x: number
  z: number
  amount: number
}

export interface SimGrave {
  creatureId: number
  name: string
  x: number
  z: number
  tick: number
}

export interface Sim {
  seed: number
  time: number
  creatures: Creature[]
  nextId: number
  rng: () => number
  namePool: NamePool
  events: SimEvent[]
  drops: SimDrop[]
  graves: SimGrave[]
  economy: Economy
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
  playerSocialize(): void
  playerTeach(concept: string, word: string): void
  playerSay(concept: string): void
  player: Player
  playerFight(targetId: number): void
  playerPickUp(): void
  playerUseItem(id: ItemId): void
  playerEquip(id: ItemId): boolean
  creatureTrade(seller: Creature, buyer: Creature, price?: number): boolean
}

const SPEED = 0.3 // calm, visible pace — the player can keep up and interact
const FIGHT_RANGE = 2.5
const STEAL_RANGE = 2.5
const SOCIAL_RANGE = 3
const BIRTH_COOLDOWN = 120
const OBSERVE_RANGE = 12 // how close a creature must be to WITNESS an action
const GOSSIP_RANGE = 10 // how close a creature must be to HEAR gossip
const GOSSIP_CHANCE = 0.02 // per-tick chance to pass gossip along

/** Keep a coordinate inside the world walls (a creature can never leave). */
export function clampCoord(v: number): number {
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
    namePool: createNamePool(),
    events: [],
    drops: [],
    graves: [],
    economy: createEconomy(),
    player: createPlayer(0, 0, 'Visitor'),
    spawnCreature(genome?: Genome, x?: number, z?: number): Creature {
      const g = genome ?? randomGenome(sim.rng)
      const cx = clampCoord(x ?? (sim.rng() - 0.5) * 40)
      const cz = clampCoord(z ?? (sim.rng() - 0.5) * 40)
      const c = createCreature(sim.nextId++, pickName(sim.namePool, sim.rng()), g, cx, cz)
      c.wallet = 6 + Math.floor(sim.rng() * 8) // enough for a few meals — room to experiment
      sim.creatures.push(c)
      return c
    },
    creatureById(id: number): Creature | undefined {
      return sim.creatures.find((c) => c.id === id)
    },
    playerSocialize(): void {
      // First-person mode: the PLAYER (a distinct character, not a creature)
      // bonds with the nearest creature in range. The creature remembers the
      // player as id 0 (the same id the observer tools use for gratitude).
      const p = sim.player
      if (!isPlayerAlive(p)) return
      const near = nearestCreatureTo(sim, p.pos.x, p.pos.z, SOCIAL_RANGE)
      if (!near) return
      // Interaction etiquette: a creature STOPS to talk unless it is genuinely
      // busy (working, fighting, fleeing, sleeping, mourning) or too wary of
      // the player. Stopping lets the player actually interact with them.
      const busy = near.busyTicks > 0 || near.action === 'fight' || near.action === 'flee' ||
        near.action === 'sleep' || near.action === 'work' || near.action === 'carry'
      const wary = near.chem.fear > 0.6 || (near.memory.vendettas[0] ?? 0) > 0.5
      if (busy) {
        near.action = `${near.action} (busy)`
        return
      }
      if (wary) {
        near.action = 'wary'
        near.chem.fear = clamp01(near.chem.fear - 0.02)
        return
      }
      near.bonds[0] = clamp01((near.bonds[0] ?? 0) + 0.12)
      near.chem.fear = clamp01(near.chem.fear - 0.05)
      applySocial(near.chem)
      if (!p.bondWith.includes(near.id)) p.bondWith.push(near.id)
      // stop and face the player for a friendly chat
      near.talkingTo = 0 // the player
      near.busyTicks = 30
      near.action = 'chat'
      near.facing = Math.atan2(p.pos.x - near.pos.x, p.pos.z - near.pos.z)
      emit(sim, 'love', near, undefined, near.pos.x, near.pos.z)
    },
    playerTeach(concept: string, word: string): void {
      // The player teaches a word: creatures in earshot learn the mapping
      // concept ⇄ word (e.g. teach "wum" while pointing at bread → they learn
      // food ⇄ wum). Teaching also boosts the bond with nearby creatures.
      const p = sim.player
      if (!isPlayerAlive(p) || !word) return
      const cleaned = word.trim().toLowerCase().slice(0, 12)
      if (!cleaned) return
      if (!CONCEPTS.includes(concept)) return
      for (const c of sim.creatures) {
        if (!c.alive) continue
        if (dist(c.pos.x, c.pos.z, p.pos.x, p.pos.z) > 10) continue
        hearWord(c.language, cleaned, concept, 0.85)
        c.bonds[0] = clamp01((c.bonds[0] ?? 0) + 0.08)
        c.action = 'learn'
        c.talkingTo = 0
        c.busyTicks = Math.max(c.busyTicks, 15)
        emit(sim, 'say', c, undefined, c.pos.x, c.pos.z)
      }
    },
    playerSay(concept: string): void {
      // The player says the word they know for a concept — creatures nearby
      // hear it and (with the context) reinforce their own mapping.
      const p = sim.player
      if (!isPlayerAlive(p)) return
      const word = sim.player.language ? getWord(sim.player.language, concept) : null
      for (const c of sim.creatures) {
        if (!c.alive) continue
        if (dist(c.pos.x, c.pos.z, p.pos.x, p.pos.z) > 10) continue
        if (word) hearWord(c.language, word, concept, 0.4)
        c.action = 'hear'
        c.talkingTo = 0
        c.busyTicks = Math.max(c.busyTicks, 12)
        emit(sim, 'say', c, undefined, c.pos.x, c.pos.z)
      }
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
      c.gratitude[0] = clamp01((c.gratitude[0] ?? 0) + 0.5) // grateful to the observer
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
    // ── player actions (distinct character) ──
    playerFight(targetId: number): void {
      const c = sim.creatureById(targetId)
      if (!c || !c.alive) return
      const p = sim.player
      // the player deals weapon-boosted damage; the creature may retaliate
      const playerDmg = 0.12 + (p.weapon === 'stick' ? 0.15 : 0)
      c.hurt(playerDmg)
      c.chem.fear = clamp01(c.chem.fear + 0.25)
      addVendetta(c.memory, 0, 0.5)
      recordWrong(c.vengeance, 0, 0.5, sim.time) // the creature remembers who hit it
      emit(sim, 'fight', c, undefined, c.pos.x, c.pos.z)
      // creatures fight back when hurt (and not too afraid)
      if (c.alive && c.chem.fear < 0.7 && dist(c.pos.x, c.pos.z, p.pos.x, p.pos.z) < FIGHT_RANGE) {
        hurtPlayer(p, 0.08 + c.genome.aggression * 0.05)
        emit(sim, 'hit', undefined, undefined, p.pos.x, p.pos.z)
      }
    },
    playerPickUp(): void {
      const p = sim.player
      const drop = sim.drops.find((d) => dist(d.x, d.z, p.pos.x, p.pos.z) < 1.5)
      if (!drop) return
      if (drop.kind === 'money') {
        p.wallet += drop.amount
      } else {
        addItem(p.inventory, 'bread', drop.amount)
      }
      sim.drops.splice(sim.drops.indexOf(drop), 1)
      emit(sim, 'collect', undefined, undefined, p.pos.x, p.pos.z)
    },
    /** Use an item from the player's own inventory (tap in the inv bar). */
    playerUseItem(id: ItemId): void {
      const p = sim.player
      if (!isPlayerAlive(p)) return
      if (id === 'stick') {
        equipItem(p, 'stick') // equipping is the use
        return
      }
      if (!useItem(p.inventory, id)) return
      if (id === 'bread') {
        eatPlayer(p, 0.55)
        emit(sim, 'eat', undefined, undefined, p.pos.x, p.pos.z)
      } else if (id === 'medicine') {
        healPlayer(p, 0.45)
        emit(sim, 'medicine', undefined, undefined, p.pos.x, p.pos.z)
      } else {
        healPlayer(p, 0.05) // herbs/brews/tonics — a little comfort
      }
    },
    /** Equip an item from the player's inventory (e.g. the stick). */
    playerEquip(id: ItemId): boolean {
      return equipItem(sim.player, id)
    },
    /**
     * Barter: a stocked creature sells one loaf to a hungry peer for coins.
     * Exported so tests can drive the trade directly; the tick calls it via
     * tradeNearby() when a stocked seller meets a hungry, able buyer.
     */
    creatureTrade(seller: Creature, buyer: Creature, price?: number): boolean {
      if (!seller.alive || !buyer.alive) return false
      if (!hasItem(seller.inventory, 'bread')) return false
      const p = price ?? marketPrice(sim.economy, 'bread')
      if (buyer.wallet < p) return false
      buyer.wallet -= p
      seller.wallet += p
      tradeItem(seller.inventory, buyer.inventory, 'bread', 1)
      buyer.eat() // the hungry buyer eats the loaf on the spot
      buyer.gratitude[seller.id] = clamp01((buyer.gratitude[seller.id] ?? 0) + 0.25)
      applyEmotionFeedback(buyer.emotions, 'joy', 0.1)
      applyEmotionFeedback(seller.emotions, 'joy', 0.1)
      seller.action = 'trade'
      buyer.action = 'eat'
      emit(sim, 'gift', seller, buyer, (seller.pos.x + buyer.pos.x) / 2, (seller.pos.z + buyer.pos.z) / 2)
      return true
    },
    tick(): void {
      sim.time++
      learnFromSight(sim) // learn BEFORE deciding so knowledge gates actions
      // decisions for every alive creature
      for (const c of sim.creatures) {
        if (!c.alive) continue
        // INTERACTION HOLD: a creature mid-chat stands still facing the player.
        // It ignores its own wants for a few ticks so the player can interact.
        if (c.busyTicks > 0) {
          c.busyTicks--
          c.action = c.talkingTo === 0 ? 'chat' : c.action
          c.goalTowerId = null
          c.intention = null
          if (c.busyTicks === 0) c.talkingTo = null
          continue // no decide, no movement, no brain work while chatting
        }
        // SLEEP SUSPENSION: a sleeping creature does zero brain/decision work
        // until energy recovers or a proximity event wakes it.
        if (c.sleeping) {
          c.chem.energy = clamp01(c.chem.energy + 0.35) // rest restores stamina
          if (c.chem.energy > 0.55) {
            c.sleeping = false
            c.action = 'wake'
            c.intention = null
          } else {
            c.action = 'sleep'
            c.intention = null
            c.goalTowerId = null
            continue // suspended: no decide, no movement, no brain
          }
        }
        // aging: creatures eventually die of old age unless player-bonded
        if (c.age > c.ageLimit) {
          const dmg = agingDamage(c.age, c.playerBond)
          if (dmg > 0) {
            c.chem.health = clamp01(c.chem.health - dmg)
            if (c.chem.health <= 0) c.alive = false
          }
        }
        if (!c.alive) continue
        decide(sim, c)
        // stay inside the world — nothing escapes the lab
        c.pos.x = clampCoord(c.pos.x)
        c.pos.z = clampCoord(c.pos.z)
      }
      // COLLISION: alive creatures push apart (no two balls in the same spot)
      // and the player is a solid body too. Dead bodies stay where they fell —
      // a path blocked by a corpse is a REAL obstacle.
      resolveCreatureCollisions(sim)
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
      // chemistry decay + memory decay + emotions decay + events trim
      for (const c of sim.creatures) {
        tickChem(c.chem, sim.time)
        decayMemory(c.memory)
        tickDrives(c.drives, c.chem, c.genome)
        tickEmotions(c.emotions)
        decayGrudges(c.vengeance, 0.002)
        c.age++
        if (c.fightCooldown > 0) c.fightCooldown--
        if (c.chem.health <= 0 && c.action !== 'dead') {
          c.alive = false
          c.action = 'dead'
          emit(sim, 'death', c, undefined, c.pos.x, c.pos.z)
          grieve(sim, c)
        }
      }
      tickEconomy(sim.economy)
      tickRelationships(sim)
      gossipNearby(sim)
      wakeNearbySleepers(sim)
      // ── the player (a distinct character): hunger, regen, pickup, barter ──
      const p = sim.player
      if (p.alive) {
        p.hunger = clamp01(p.hunger - 0.00035)
        if (p.hunger < 0.1) hurtPlayer(p, 0.004) // starving hurts
        else if (p.hunger > 0.55 && p.health < 1) healPlayer(p, 0.0015) // fed, resting
        sim.playerPickUp()
      }
      tradeNearby(sim)
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
    tick: sim.time,
  })
}

/**
 * Decide — the heart of rational behavior.
 *
 * Every tick the mind scores all candidate actions (need × gene × memory ×
 * opportunity) and CHOOSES with a noise term (free will). The chosen action
 * is committed to for a few ticks so creatures don't flip-flop; emergencies
 * (collapse, terror, death) override the mind.
 */
function decide(sim: Sim, c: Creature): void {
  // Emergencies first — these override even a committed intention.
  if (c.sleeping) {
    if (c.chem.energy > 0.8) {
      c.sleeping = false
      c.action = 'idle'
      c.intention = null
    } else {
      c.action = 'sleep'
      c.chem.energy = clamp01(c.chem.energy + 0.35)
      return
    }
  }

  if (c.chem.energy < 0.08) {
    c.sleeping = true
    c.action = 'sleep'
    return
  }

  if (c.chem.fear > 0.75 && c.genome.fearfulness > 0.5 && c.genome.courage < 0.5) {
    flee(sim, c)
    return
  }

  // Reputation-aware fear: a known aggressor nearby is scary even when the
  // chemistry hasn't spiked yet — fearful creatures avoid them pre-emptively.
  if (c.genome.fearfulness > 0.6 && c.genome.courage < 0.6) {
    const scary = nearestOther(sim, c, 6)
    if (scary && trustTowards(c, scary.id) < -0.4) {
      flee(sim, c)
      return
    }
  }

  // Bank first: a hungry creature with savings withdraws before any other
  // money-finding — savings exist to be spent on survival.
  if (c.chem.hunger < 0.35 && c.wallet < marketPrice(sim.economy, 'bread') && c.banked > 0 && knows(sim, c, 'bank')) {
    const atBank = towerAt(c.pos.x, c.pos.z)
    if (atBank?.id === 'bank') {
      const need = Math.max(marketPrice(sim.economy, 'bread'), 3) - c.wallet
      const amount = Math.min(c.banked, Math.max(1, need))
      c.banked -= amount
      c.wallet += amount
      c.action = 'withdraw'
      c.intention = null
      return
    }
    goTo(sim, c, 'bank')
    c.intention = 'withdraw'
    return
  }

  // HARD SURVIVAL: starving creatures go to food — nothing may override this.
  // A creature with money buys at the tower; a broke one works or takes the
  // nearest free drop first. (Prevents dying of hunger while holding coins.)
  if (c.chem.hunger < 0.35) {
    // eat stored bread FIRST — no trip needed, never starve with food in hand
    if (useItem(c.inventory, 'bread')) {
      c.eat()
      emit(sim, 'eat', c, undefined, c.pos.x, c.pos.z)
      c.action = 'eat'
      c.intention = null
      return
    }
    const foodDrop = nearestDrop(sim, c, 'food', 40)
    if (foodDrop) {
      goToPoint(c, foodDrop.x, foodDrop.z, 'eat drop')
      c.intention = null
      return
    }
    const breadPrice = marketPrice(sim.economy, 'bread')
    if (c.wallet >= breadPrice && (sim.economy.goods.bread?.stock ?? 0) > 0 && knows(sim, c, 'food')) {
      const atTower = towerAt(c.pos.x, c.pos.z)
      if (atTower?.id === 'food') {
        // already here: actually BUY and eat, don't just stand around
        if (buyFromTower(sim.economy, 'food', c)) {
          c.eat()
          emit(sim, 'eat', c, undefined, c.pos.x, c.pos.z)
          c.action = 'eat'
          c.intention = null
        }
        return
      }
      goTo(sim, c, 'food')
      c.intention = 'food'
      return
    }
    if (c.wallet >= breadPrice && !knows(sim, c, 'food')) {
      // doesn't know where food is — must explore to find it
      explore(sim, c)
      return
    }
    // broke and starving: steal if a wallet is near, otherwise work
    const near = nearestOther(sim, c, 2.5)
    if (near && near.wallet > 0 && c.genome.theft > 0.3) {
      steal(sim, c, near)
      c.intention = null
      return
    }
    const atWork = towerAt(c.pos.x, c.pos.z)
    if (atWork?.id === 'work') {
      c.workProgress += 1
      c.action = 'work'
      if (c.workProgress >= WORK_SHIFT_TICKS) {
        c.wallet += WORK_PAY + c.education
        c.workProgress = 0
        emit(sim, 'work', c, undefined, c.pos.x, c.pos.z)
        c.action = 'work done'
      }
      return
    }
    if (knows(sim, c, 'work')) {
      goTo(sim, c, 'work')
      c.intention = 'work'
    } else {
      explore(sim, c)
    }
    return
  }

  // Emergent bonds: a partnered creature at home with a strong bond procreates —
  // only if BOTH parents have the energy reserves to pay the cost (population control).
  const at = towerAt(c.pos.x, c.pos.z)
  if (at?.id === 'homes' && c.partnerId !== null && c.chem.bond > 0.7) {
    const partner = sim.creatureById(c.partnerId)
    const lastBirth = c.memory.facts.partnerIsHere ?? -1000
    if (
      partner && partner.alive && partner.chem.bond > 0.7
      && sim.time - lastBirth > BIRTH_COOLDOWN
      && canProcreate(c.chem.energy, partner.chem.energy, c.age)
    ) {
      // energy cost paid by both parents — life is not free
      c.chem.energy = clamp01(c.chem.energy - procreationCost(c.chem.energy))
      partner.chem.energy = clamp01(partner.chem.energy - procreationCost(partner.chem.energy))
      c.memory.facts.partnerIsHere = sim.time
      partner.memory.facts.partnerIsHere = sim.time
      procreate(sim, c, partner)
      return
    }
  }

  // ANY creature (not just lovers) carries an unburied body to the graveyard —
  // a civic duty. Close bonds make it more urgent, but no one walks past a corpse.
  // Once carrying, the duty persists until burial.
  if (c.action === 'carry' || c.action === 'bury' || c.chem.grief > 0.2 || hasNearbyCorpse(sim, c)) {
    if (c.action === 'carry' || c.action === 'bury' || hasUnburiedLovedOne(sim, c) || nearestCorpse(sim, c, 10)) {
      carryCorpseDirect(sim, c)
      return
    }
  }

  // Continue a committed action while it remains sensible.
  if (c.intention && c.intentionTicks > 0 && actionValid(sim, c, c.intention)) {
    c.intentionTicks--
    execute(sim, c, c.intention)
    return
  }

  // A tower-bound action the creature is still walking toward: stay committed
  // UNTIL ARRIVAL — no flip-flopping mid-journey (the user's "they want to go
  // everywhere at once" / shaking-in-the-middle bug). As long as a goal tower
  // is set and the creature isn't standing in it, it walks there. Re-scoring
  // only happens once the creature is actually AT the destination, where the
  // mind can buy/drink/play/explore properly.
  if (c.intention && c.goalTowerId !== null && c.goalTowerId !== 'none') {
    const goal = towerAt(c.pos.x, c.pos.z)
    if (goal?.id !== c.goalTowerId) {
      // still en route — keep walking, whatever the action was (even explore)
      execute(sim, c, c.intention)
      return
    }
    // arrived: clear the goal so the mind re-scores HERE (buy, drink, etc.)
    c.goalTowerId = 'none'
    c.intention = null
  }

  // Re-score and pick a fresh action (mind + free will).
  const scores = scoreActions(sim, c)
  // The creature's own brain (learned experience) biases the action choice.
  blendBrainFromCache(c, scores)
  const chosen = chooseAction(scores, sim.rng)
  c.intention = chosen
  c.intentionTicks = COMMITMENT_TICKS
  execute(sim, c, chosen)
  // Learning: the outcome of this action teaches the brain a little (async).
  void learnFromOutcome(sim, c, chosen)
}

/** Run one tick of a chosen action. */
function execute(sim: Sim, c: Creature, action: ActionName): void {
  const at = towerAt(c.pos.x, c.pos.z)

  switch (action) {
    case 'food': {
      if (at?.id === 'food') {
        if (c.chem.hunger < 0.85 && buyFromTower(sim.economy, 'food', c)) {
          // keep the bread — eat now if hungry, else store for later
          addItem(c.inventory, 'bread', 1)
          if (c.chem.hunger < 0.6 && useItem(c.inventory, 'bread')) {
            c.eat()
            preferPlace(c.memory, 'food')
            emit(sim, 'eat', c, undefined, c.pos.x, c.pos.z)
            c.action = 'eat'
            return
          }
          // stored for later — the creature walks on richer
          c.action = 'buy bread'
          c.intention = null
          return
        }
      }
      // hungry with stored bread? eat from inventory without a trip
      if (c.chem.hunger < 0.5 && useItem(c.inventory, 'bread')) {
        c.eat()
        emit(sim, 'eat', c, undefined, c.pos.x, c.pos.z)
        c.action = 'eat'
        c.intention = null
        return
      }
      const foodDrop = nearestDrop(sim, c, 'food', 40)
      if (foodDrop) {
        goToPoint(c, foodDrop.x, foodDrop.z, 'eat drop')
        return
      }
      goTo(sim, c, 'food')
      return
    }
    case 'work': {
      if (at?.id === 'work') {
        c.workProgress += 1
        c.action = 'work'
        if (c.workProgress >= WORK_SHIFT_TICKS) {
          // educated creatures earn a little more every time they learn
          c.wallet += WORK_PAY + c.education
          c.workProgress = 0
          emit(sim, 'work', c, undefined, c.pos.x, c.pos.z)
          c.action = 'work done'
        }
        return
      }
      goTo(sim, c, 'work')
      return
    }
    case 'school': {
      if (at?.id === 'school' && c.wallet >= 2) {
        c.wallet -= 2 // tuition — nothing is free
        c.education = Math.min(5, c.education + 1)
        emit(sim, 'school', c, undefined, c.pos.x, c.pos.z)
        c.action = 'school'
        return
      }
      goTo(sim, c, 'school')
      return
    }
    case 'farm': {
      // farm work: stay a while, then harvest bread (a work alternative)
      if (at?.id === 'farm') {
        c.workProgress += 1
        c.action = 'farm'
        if (c.workProgress >= WORK_SHIFT_TICKS) {
          c.chem.hunger = clamp01(c.chem.hunger + 0.45) // grew food — eat it
          c.workProgress = 0
          emit(sim, 'eat', c, undefined, c.pos.x, c.pos.z)
          c.action = 'harvest'
        }
        return
      }
      goTo(sim, c, 'farm')
      return
    }
    case 'park': {
      if (at?.id === 'park') {
        c.chem.pleasure = clamp01(c.chem.pleasure + 0.2)
        c.chem.social = clamp01(c.chem.social + 0.1)
        emit(sim, 'play', c, undefined, c.pos.x, c.pos.z)
        c.action = 'relax'
        return
      }
      goTo(sim, c, 'park')
      return
    }
    case 'sleep': {
      if (at?.id === 'homes' || c.chem.energy < 0.2) {
        c.sleeping = true
        c.action = 'sleep'
        c.chem.energy = clamp01(c.chem.energy + 0.35)
        return
      }
      goTo(sim, c, 'homes')
      return
    }
    case 'heal': {
      if (at?.id === 'pharmacy' && buyFromTower(sim.economy, 'pharmacy', c)) {
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
    case 'drink': {
      const good = at?.id === 'tavern' ? buyFromTower(sim.economy, 'tavern', c) : null
      if (good) {
        c.chem.pleasure = clamp01(c.chem.pleasure + 0.3)
        c.chem.intoxication = clamp01(c.chem.intoxication + 0.25)
        const dose = 0.06 + c.genome.addictionProne * 0.2
        c.chem.addiction.brew = clamp01((c.chem.addiction.brew ?? 0) + dose)
        c.chem.lastDose.brew = sim.time
        emit(sim, 'drink', c, undefined, c.pos.x, c.pos.z)
        c.action = 'drink'
        return
      }
      goTo(sim, c, 'tavern')
      return
    }
    case 'den': {
      const good = at?.id === 'den' ? buyFromTower(sim.economy, 'den', c) : null
      if (good === 'herb' || good === 'spark') {
        c.chem.pleasure = clamp01(c.chem.pleasure + (good === 'spark' ? 0.55 : 0.3))
        c.chem.fear = clamp01(c.chem.fear + (good === 'spark' ? 0.15 : -0.25))
        const dose = 0.08 + c.genome.addictionProne * 0.25
        c.chem.addiction[good] = clamp01((c.chem.addiction[good] ?? 0) + dose)
        c.chem.lastDose[good] = sim.time
        emit(sim, 'drink', c, undefined, c.pos.x, c.pos.z)
        c.action = good
        return
      }
      goTo(sim, c, 'den')
      return
    }
    case 'buyWeapon': {
      if (at?.id === 'tools' && !c.weapon && buyFromTower(sim.economy, 'tools', c)) {
        c.weapon = 'stick'
        c.action = 'buy'
        return
      }
      goTo(sim, c, 'tools')
      return
    }
    case 'deposit': {
      if (at?.id === 'bank' && c.wallet > 2) {
        c.deposit(Math.min(4, c.wallet))
        c.action = 'deposit'
        return
      }
      goTo(sim, c, 'bank')
      return
    }
    case 'withdraw': {
      if (at?.id === 'bank' && c.banked > 0) {
        const price = marketPrice(sim.economy, 'bread')
        const need = Math.max(price, 3) - c.wallet
        const amount = Math.min(c.banked, Math.max(1, need)) // only what's needed
        c.banked -= amount
        c.wallet += amount
        c.action = 'withdraw'
        return
      }
      goTo(sim, c, 'bank')
      return
    }
    case 'play': {
      if (at?.id === 'play') {
        applyPlay(c.chem)
        emit(sim, 'play', c, undefined, c.pos.x, c.pos.z)
        c.action = 'play'
        return
      }
      goTo(sim, c, 'play')
      return
    }
    case 'social': {
      const near = nearestOther(sim, c, SOCIAL_RANGE)
      if (near) {
        c.socialize(near)
        emit(sim, 'love', c, near, c.pos.x, c.pos.z)
        c.action = 'social'
        return
      }
      wander(sim, c)
      return
    }
    case 'steal': {
      const near = nearestOther(sim, c, STEAL_RANGE)
      if (near && near.wallet > 0) {
        steal(sim, c, near)
        return
      }
      wander(sim, c)
      return
    }
    case 'share': {
      const near = nearestOther(sim, c, SOCIAL_RANGE)
      if (near && near.wallet < 2 && c.wallet > 8) {
        const gift = Math.min(3, c.wallet - 2)
        c.wallet -= gift
        near.wallet += gift
        near.gratitude[c.id] = clamp01((near.gratitude[c.id] ?? 0) + 0.3)
        // ── social awareness ──
        // giving feels good (joy) and builds a protector reputation; a
        // forgiving receiver lets the gift wash away old grudges.
        applyEmotionFeedback(c.emotions, 'joy', 0.15)
        applyEmotionFeedback(near.emotions, 'joy', 0.1)
        applyEmotionFeedback(near.emotions, 'affection', 0.1)
        forgiveGift(near, c.id)
        observeEvent(near, 'share', c.id)
        witness(sim, c, 'share', c.id)
        emit(sim, 'gift', c, near, c.pos.x, c.pos.z)
        c.action = 'share'
        return
      }
      wander(sim, c)
      return
    }
    case 'fight': {
      const near = nearestOther(sim, c, FIGHT_RANGE)
      if (near && c.fightCooldown <= 0) {
        // gangmates never fight each other; they defend one another
        if (c.gangId !== null && near.gangId === c.gangId) {
          wander(sim, c)
          return
        }
        fight(sim, c, near)
        return
      }
      wander(sim, c)
      return
    }
    case 'collect': {
      const coin = nearestDrop(sim, c, 'money', 40)
      if (coin) {
        goToPoint(c, coin.x, coin.z, 'collect')
        return
      }
      wander(sim, c)
      return
    }
    case 'idle': {
      // rest in place — small recovery, then the mind re-scores
      c.chem.energy = clamp01(c.chem.energy + 0.02)
      c.chem.pleasure = clamp01(c.chem.pleasure + 0.01)
      c.action = 'idle'
      c.intention = null // re-score soon; content creatures rest a few ticks
      return
    }
    case 'explore': {
      // keep walking toward the committed exploration goal (travel-commit path)
      if (c.goalTowerId && c.goalTowerId !== 'none') {
        const at = towerAt(c.pos.x, c.pos.z)
        if (at?.id !== c.goalTowerId) {
          goTo(sim, c, c.goalTowerId as TowerId)
          return
        }
      }
      wander(sim, c)
      return
    }
    default: {
      wander(sim, c)
    }
  }
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
  // desperate creatures hurry — hunger/health urgency speeds the walk
  const hurry = c.chem.hunger < 0.2 || c.chem.health < 0.3 || c.chem.energy < 0.12 ? 1.7 : 1
  const step = Math.min(SPEED * hurry, d)
  let dx = ((t.x - c.pos.x) / d) * step
  let dz = ((t.z - c.pos.z) / d) * step
  // BUILDING COLLISION: never walk through a tower that isn't our destination.
  // If the step would enter a foreign tower's radius, deflect sideways along
  // its wall (a cheap, stable "slide").
  for (const o of TOWERS) {
    if (o.id === towerId) continue
    const od = dist(c.pos.x + dx, c.pos.z + dz, o.x, o.z)
    if (od < o.radius) {
      const nx = (c.pos.x + dx - o.x) / (od || 1)
      const nz = (c.pos.z + dz - o.z) / (od || 1)
      // slide: move along the wall tangent instead of through it
      const slideX = -nz
      const slideZ = nx
      const along = dx * slideX + dz * slideZ
      dx = slideX * along * 0.9
      dz = slideZ * along * 0.9
      break
    }
  }
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

/** A creature learns a tower's location by INTERACTING with it (standing at
 * the building). It doesn't magically know the map — knowledge comes from
 * visiting, so a creature that has never been to a tower genuinely doesn't
 * know where it is and must explore until it finds it. */
function learnFromSight(sim: Sim): void {
  for (const c of sim.creatures) {
    if (!c.alive) continue
    for (const t of TOWERS) {
      const d = dist(c.pos.x, c.pos.z, t.x, t.z)
      if (d <= t.radius + 0.5) c.learnTower(t.id)
    }
  }
}

/** Is this tower known to the creature? (actions require knowledge — no omniscience) */
function knows(sim: Sim, c: Creature, towerId: string): boolean {
  void sim
  return c.knowsTower(towerId)
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

/** Nearest alive creature to an arbitrary point (used for the player). */
function nearestCreatureTo(sim: Sim, x: number, z: number, range: number): Creature | null {
  let best: Creature | null = null
  let bestD = range
  for (const o of sim.creatures) {
    if (!o.alive || o.sleeping) continue
    const d = dist(x, z, o.pos.x, o.pos.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/**
 * Barter in the tick: a well-stocked seller (≥2 loaves) occasionally sells
 * one to the nearest hungry peer who can afford it. Rare and local — never
 * the main economy, just the visible warmth of creature-to-creature trade.
 * Uses a deterministic cadence (time + id) instead of the rng stream so the
 * seeded decision sequence of every creature is left untouched.
 */
function tradeNearby(sim: Sim): void {
  for (const seller of sim.creatures) {
    if (!seller.alive || seller.sleeping) continue
    if (countItem(seller.inventory, 'bread') < 2) continue
    if ((sim.time + seller.id) % 3 !== 0) continue
    const buyer = nearestOther(sim, seller, SOCIAL_RANGE)
    if (!buyer || !buyer.alive || buyer.sleeping || buyer.chem.hunger > 0.5) continue
    if (buyer.wallet < marketPrice(sim.economy, 'bread')) continue
    sim.creatureTrade(seller, buyer)
  }
}

/**
 * Social awareness: every alive creature within OBSERVE_RANGE of the event
 * sees it happen and updates its reputation of the actor. Third-party
 * observation — a creature does not need to be the victim to judge.
 */
function witness(sim: Sim, actor: Creature, kind: Parameters<typeof observeEvent>[1], actorId: number): void {
  for (const o of sim.creatures) {
    if (o.id === actorId || !o.alive) continue
    if (dist(o.pos.x, o.pos.z, actor.pos.x, actor.pos.z) <= OBSERVE_RANGE) {
      observeEvent(o, kind, actorId)
    }
  }
}

/**
 * Gossip network: creatures pass what they believe to nearby peers (vocal /
 * gestural, via the language module). Hearsay lets a reputation travel far
 * beyond the creatures who actually saw the event — so a creature can distrust
 * a known thief it has never met.
 */
function gossipNearby(sim: Sim): void {
  for (const c of sim.creatures) {
    if (!c.alive || c.sleeping) continue
    if (sim.rng() >= GOSSIP_CHANCE) continue
    // pick the strongest belief this creature holds (most notable opinion)
    let aboutId: number | null = null
    let strongest = 0.3 // ignore weak/neutral opinions
    for (const key of Object.keys(c.reputation)) {
      const id = Number(key)
      const rep = c.reputation[id]
      const salience = Math.max(Math.abs(rep.trust), rep.thief, rep.protector, rep.aggressor)
      if (salience > strongest) {
        strongest = salience
        aboutId = id
      }
    }
    if (aboutId === null) continue
    // tell the nearest peer within earshot
    let best: Creature | null = null
    let bestD = GOSSIP_RANGE
    for (const o of sim.creatures) {
      if (o.id === c.id || !o.alive) continue
      const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    if (best) {
      gossipSpread(c, best, aboutId)
      emit(sim, 'say', c, best, c.pos.x, c.pos.z)
    }
  }
}

/** Did `c` just defend a bonded friend? (fight was protective, not bullying) */
function protectFriendNear(sim: Sim, c: Creature): boolean {
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    const isFriend = o.id === c.partnerId || (c.bonds[o.id] ?? 0) > 0.5
    if (!isFriend) continue
    if (o.chem.health < 0.85 && dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z) < 6) {
      return true
    }
  }
  return false
}

/** A forgiving creature lets a gift wash away old grudges (vendetta → trust). */
function forgiveGift(receiver: Creature, giverId: number): void {
  if (receiver.emotions.forgiveness < 0.4) return
  const rep = getReputation(receiver, giverId)
  rep.trust = clamp01(rep.trust + 0.3)
  rep.aggressor = Math.max(0, rep.aggressor - 0.2)
  rep.thief = Math.max(0, rep.thief - 0.2)
  // the grudge cools; the bond can regrow
  if (receiver.memory.vendettas[giverId]) {
    receiver.memory.vendettas[giverId] = Math.max(0, (receiver.memory.vendettas[giverId] ?? 0) - 0.6)
  }
  receiver.bonds[giverId] = clamp01((receiver.bonds[giverId] ?? 0) + 0.15)
}

/** Is there an unburied body this creature loved? (partner or strong bond) */
function hasUnburiedLovedOne(sim: Sim, c: Creature): boolean {
  if (c.partnerId !== null) {
    const p = sim.creatures.find((o) => o.id === c.partnerId)
    if (p && !p.alive && !p.buried) return true
  }
  for (const o of sim.creatures) {
    if (!o.alive && !o.buried && (c.bonds[o.id] ?? 0) > 0.5) return true
  }
  return false
}

/** Any unburied corpse within `range` units. */
function nearestCorpse(sim: Sim, c: Creature, range: number): Creature | null {
  let best: Creature | null = null
  let bestD = range
  for (const o of sim.creatures) {
    if (o.id === c.id || o.alive || o.buried) continue
    const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

/** Is any unburied body within a short range (so strangers feel the duty)? */
function hasNearbyCorpse(sim: Sim, c: Creature): boolean {
  return nearestCorpse(sim, c, 6) !== null
}

/** Carry a body to the graveyard and bury it — duty overrides the mind. */
function carryCorpseDirect(sim: Sim, c: Creature): void {
  let body: Creature | undefined
  if (c.partnerId !== null) {
    const p = sim.creatures.find((o) => o.id === c.partnerId)
    if (p && !p.alive && !p.buried) body = p
  }
  if (!body) {
    for (const o of sim.creatures) {
      if (!o.alive && !o.buried && (c.bonds[o.id] ?? 0) > 0.5) {
        body = o
        break
      }
    }
  }
  // any nearby corpse will do — anyone can carry the dead
  if (!body) {
    body = nearestCorpse(sim, c, 12) ?? undefined
  }
  if (!body) return
  // carrying: the body travels with the carrier until burial
  body.pos.x = c.pos.x
  body.pos.z = c.pos.z
  const gy = findTower('graveyard')
  if (!gy) return
  const d = dist(c.pos.x, c.pos.z, gy.x, gy.z)
  if (d <= gy.radius + 2) {
    body.buried = true
    sim.graves.push({ creatureId: body.id, name: body.name, x: gy.x + (sim.rng() - 0.5) * 4, z: gy.z + (sim.rng() - 0.5) * 4, tick: sim.time })
    emit(sim, 'bury', c, body, gy.x, gy.z)
    c.chem.grief = clamp01(c.chem.grief - 0.35) // closure helps
    c.action = 'bury'
    c.intention = null
    return
  }
  const step = Math.min(0.7, d)
  c.pos.x += ((gy.x - c.pos.x) / d) * step
  c.pos.z += ((gy.z - c.pos.z) / d) * step
  c.action = 'carry'
  c.intention = null
}

/** A creature approaching within range wakes a sleeping creature. */
function wakeNearbySleepers(sim: Sim): void {
  for (const c of sim.creatures) {
    if (!c.alive || !c.sleeping) continue
    for (const o of sim.creatures) {
      if (o.id === c.id || !o.alive || o.sleeping) continue
      if (dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z) < 3) {
        c.sleeping = false
        c.action = 'wake'
        c.intention = null
        c.chem.fear = clamp01(c.chem.fear + 0.1) // startled
        break
      }
    }
  }
}

/** Bodies are real: alive creatures + the player push apart so no two occupy
 *  the same spot (simple 2-body separation). Dead bodies are left untouched —
 *  they block paths until someone carries them to the graveyard. */
function resolveCreatureCollisions(sim: Sim): void {
  const bodies = sim.creatures.filter((c) => c.alive)
  bodies.push({ pos: sim.player.pos } as Creature) // the player is solid too
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]
      const b = bodies[j]
      if (a === b) continue
      const dx = b.pos.x - a.pos.x
      const dz = b.pos.z - a.pos.z
      const d = Math.hypot(dx, dz)
      const min = 1.5 // ball radius * 2 + a little breathing room
      if (d > 0.0001 && d < min) {
        const push = (min - d) / 2
        const nx = dx / d
        const nz = dz / d
        a.pos.x -= nx * push
        a.pos.z -= nz * push
        b.pos.x += nx * push
        b.pos.z += nz * push
      }
    }
  }
  // keep everyone inside the world after the push
  for (const b of bodies) {
    b.pos.x = clampCoord(b.pos.x)
    b.pos.z = clampCoord(b.pos.z)
  }
}

function steal(sim: Sim, thief: Creature, victim: Creature): void {
  const amount = Math.min(victim.wallet, 2 + Math.floor(thief.genome.greed * 4))
  victim.wallet -= amount
  thief.wallet += amount
  applySocialFeedback(thief.drives, 'theft')
  applySocialFeedback(victim.drives, 'theft')
  learnFact(victim.memory, 'bankIsSafe', 0.6 + amount * 0.05)
  addVendetta(victim.memory, thief.id, 0.8)
  const bonded = thief.partnerId === victim.id || (thief.bonds[victim.id] ?? 0) > 0.35
  recordWrong(victim.vengeance, thief.id, bonded ? 0.9 : 0.5, sim.time) // betrayal stings harder
  preferPlace(victim.memory, 'bank')
  // ── social awareness ──
  // the thief's greed feeds envy in onlookers and resentment in the victim;
  // the victim (and anyone watching) records a thief reputation for the actor.
  applyEmotionFeedback(thief.emotions, 'envy', 0.1)
  applyEmotionFeedback(victim.emotions, 'resentment', 0.35)
  applyEmotionFeedback(victim.emotions, 'paranoia', 0.15)
  victim.chem.fear = clamp01(victim.chem.fear + 0.05)
  observeEvent(victim, bonded ? 'betray' : 'steal', thief.id)
  witness(sim, victim, 'steal', thief.id)
  emit(sim, 'steal', thief, victim, victim.pos.x, victim.pos.z)
  thief.action = 'steal'
}

function fight(sim: Sim, a: Creature, b: Creature): void {
  const dmgA = 0.05 + (a.weapon === 'stick' ? 0.1 : 0) + a.genome.aggression * 0.04 + a.chem.strength * 0.06
  const dmgB = 0.05 + (b.weapon === 'stick' ? 0.1 : 0) + b.genome.aggression * 0.04 + b.chem.strength * 0.06
  b.hurt(dmgA)
  a.hurt(dmgB)
  // ego + reciprocity respond to the exchange
  applySocialFeedback(a.drives, a.chem.health > b.chem.health ? 'victory' : 'defeat')
  applySocialFeedback(b.drives, b.chem.health > a.chem.health ? 'victory' : 'defeat')
  // loser drops money
  if (b.chem.health < a.chem.health && b.wallet > 0) {
    const dropped = Math.min(b.wallet, 2)
    b.wallet -= dropped
    a.wallet += dropped
  }
  addVendetta(b.memory, a.id, 0.5)
  addVendetta(a.memory, b.id, 0.3)
  recordWrong(b.vengeance, a.id, 0.5, sim.time)
  recordWrong(a.vengeance, b.id, 0.3, sim.time)
  // ── social awareness ──
  // fights breed spite and fear; watchers judge the aggressor. If `a` was
  // DEFENDING a friend, witnesses see a protector instead of a bully.
  applyEmotionFeedback(a.emotions, 'spite', 0.15)
  applyEmotionFeedback(b.emotions, 'spite', 0.1)
  applyEmotionFeedback(b.emotions, 'resentment', 0.2)
  b.chem.fear = clamp01(b.chem.fear + 0.1)
  const defending = protectFriendNear(sim, a) // a stepped in to defend a friend
  observeEvent(b, 'aggress', a.id) // b saw who hit it
  witness(sim, a, defending ? 'protect' : 'aggress', a.id)
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
    settleRevenge(b.vengeance, a.id) // revenge delivered — the grudge closes
  } else if (bRetreat && !aRetreat) {
    flee(sim, b)
    a.action = 'idle'
    settleRevenge(a.vengeance, b.id) // revenge delivered — the grudge closes
  }
}

function procreate(sim: Sim, a: Creature, b: Creature): void {
  const childGenome = mutate(crossover(a.genome, b.genome, sim.rng), 0.15, sim.rng)
  const child = createCreature(sim.nextId++, pickName(sim.namePool, sim.rng()), childGenome, a.pos.x + 0.8, a.pos.z + 0.8)
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
      // keep partnerId pointing at the dead so the survivor can carry them to the grave
      c.chem.grief = clamp01(c.chem.grief + 1)
      c.chem.bond = clamp01(c.chem.bond - 0.3)
      c.action = 'mourn'
    } else if (bond > 0.5) {
      c.chem.grief = clamp01(c.chem.grief + 0.5)
      c.action = 'mourn'
    }
  }
}

/** Wander toward an unseen/unknown tower — curiosity = learning by exploring. */
function explore(sim: Sim, c: Creature): void {
  // pick a tower the creature has never learned — the strongest unknown pull
  const unknown = TOWERS.filter((t) => !c.knowsTower(t.id))
  const seen = TOWERS.filter((t) => c.knowsTower(t.id) && (c.memory.seenPlaces[t.id] ?? 0) < 2)
  const pool = unknown.length > 0 ? unknown : seen.length > 0 ? seen : TOWERS
  let best: TowerId | null = null
  let bestScore = -Infinity
  for (const t of pool) {
    const d = dist(c.pos.x, c.pos.z, t.x, t.z)
    const novelty = !c.knowsTower(t.id) ? 2 : 1
    const score = novelty * 100 - d + c.genome.curiosity * 40 + (c.drives?.curiosity ?? 0.3) * 30
    if (score > bestScore) {
      bestScore = score
      best = t.id
    }
  }
  if (best) {
    goTo(sim, c, best)
    // COMMIT: set intention + goal so the travel-commit holds the creature on
    // this single destination until arrival — no mid-journey flip-flopping.
    c.intention = 'explore'
    c.action = `explore ${best}`
  } else {
    wander(sim, c)
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

/** Brain context vector: normalized needs + situation the creature is in. */
function brainContext(sim: Sim, c: Creature): number[] {
  const near = nearestOther(sim, c, 5)
  const at = towerAt(c.pos.x, c.pos.z)
  const hungry = 1 - c.chem.hunger
  return [
    hungry, 1 - c.chem.energy, 1 - c.chem.pleasure, 1 - c.chem.social,
    1 - c.chem.health, c.chem.fear, c.chem.grief, c.chem.strength,
    Math.min(1, c.wallet / 30), Math.min(1, c.banked / 30),
    c.genome.aggression, c.genome.sociability, c.genome.curiosity,
    near ? 1 : 0, at ? 1 : 0, c.knowledge.food ? 1 : 0,
  ]
}

/** Action indices for the brain's preference vector (aligned with ActionName order). */
const BRAIN_ACTIONS = ['food', 'work', 'sleep', 'heal', 'drink', 'den', 'school', 'farm', 'park', 'play', 'social', 'steal', 'share', 'fight', 'wander', 'idle', 'deposit', 'withdraw'] as const

/** Blend the creature's learned brain preferences (cached async) into scores. */
function blendBrainFromCache(c: Creature, scores: Record<string, number>): void {
  const prefs = c.brainPrefs
  if (!prefs) return
  for (let i = 0; i < BRAIN_ACTIONS.length && i < prefs.length; i++) {
    const name = BRAIN_ACTIONS[i]
    if (name in scores) {
      scores[name] = scores[name] * 0.7 + prefs[i] * 2.2 // learned bias, scaled
    }
  }
}

/** Refresh a creature's brain preference cache (async, throttled by sim). */
export async function refreshBrain(sim: Sim, c: Creature): Promise<void> {
  try {
    c.brainPrefs = await think(c.brain, brainContext(sim, c))
  } catch {
    c.brainPrefs = null
  }
}

/** Reward the brain after an action based on how it changed needs. */
async function learnFromOutcome(sim: Sim, c: Creature, action: ActionName): Promise<void> {
  try {
    // skip low-value/no-op actions — reward only meaningful experiences so
    // tfjs work is minimal on mobile (wander/idle/collect teach nothing)
    if (action === 'wander' || action === 'idle' || action === 'collect') return
    const idx = BRAIN_ACTIONS.indexOf(action as (typeof BRAIN_ACTIONS)[number])
    if (idx < 0) return
    // reward = how much better the creature feels right now (needs satisfied)
    const pleasureNow = c.chem.pleasure
    const hungerNow = c.chem.hunger
    const r = 0.3 + pleasureNow * 0.5 + hungerNow * 0.3 + (c.wallet > 0 ? 0.1 : 0)
    await reward(c.brain, brainContext(sim, c), idx, Math.min(1, r))
    learnLanguageFromAction(sim, c, action)
  } catch {
    // learning failure must never break the sim
  }
}

/** Language: doing things teaches words; being near others spreads them. */
function learnLanguageFromAction(sim: Sim, c: Creature, action: ActionName): void {
  const conceptMap: Partial<Record<ActionName, string>> = {
    food: 'food', work: 'work', farm: 'food', heal: 'medicine',
    play: 'play', social: 'friend', steal: 'money', share: 'gift',
    drink: 'food', den: 'danger', sleep: 'sleep', school: 'work',
    park: 'play', fight: 'danger',
  }
  const concept = conceptMap[action]
  if (!concept) return
  // coin/strengthen the word for this experience
  learnWord(c.language, concept, 0.35)
  // occasionally say it out loud — nearby creatures learn the association
  if (sim.rng() < 0.25) {
    const word = sayWord(c.language, concept)
    if (word) {
      emit(sim, 'say', c, undefined, c.pos.x, c.pos.z)
      for (const o of sim.creatures) {
        if (o.id !== c.id && o.alive && dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z) < 12) {
          shareWithNeighbors(c.language, o.language, concept, 0.4)
        }
      }
    }
  }
}
