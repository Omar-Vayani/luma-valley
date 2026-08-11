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
import { createEconomy, tickEconomy, tickMarketDay, buyFromTower, marketPrice, WORK_SHIFT_TICKS, WORK_PAY, type Economy } from './economy'
import { createNamePool, pickName, type NamePool } from './names'
import { learnWord, shareWithNeighbors, sayWord, hearWord, getWord, CONCEPTS } from './language'
import { think, reward } from './brain'
import { agingDamage, canProcreate, procreationCost } from './lifecycle'
import { recordWrong, settleRevenge, decayGrudges } from './vengeance'
import { tickWant, wantExpired, refreshWant, wantProgress } from './wants'
import { addItem, useItem, hasItem, tradeItem, countItem, type ItemId } from './inventory'
import { createPlayer, hurtPlayer, healPlayer, equipItem, eatPlayer, isPlayerAlive, type Player } from './player'
import { scoreActions, chooseAction, actionValid, COMMITMENT_TICKS, type ActionName } from './mind'
import { tickRelationships } from './relationships'
import { tickDrives, applySocialFeedback } from './drives'
import { tickEmotions, applyEmotionFeedback, createEmotions } from './emotions'
import { observeEvent, gossipSpread, trustTowards, getReputation } from './reputation'
import { mulberry32 } from './rng'
import { dist, clamp01 } from './util'
import { DEFAULT_SETTINGS, type GameSettings } from './settings'
import { createLodState, pickAiBatch, markDecided, bandFor, chemStride, type LodState } from './lod'
import {
  createSociety, ensureCoupleHousehold, adoptChild, tickHouseholdCare, pruneHouseholds,
  householdOf, homeTowerOf, type HavenSociety,
} from './household'
import {
  applySocialEvent, tickSocialGraph, geneticCompatibility, bumpEdge, romanticInterest,
} from './socialbond'
import { parsePlayerText, respondToPlayer, type DialogueTurn, type ParseResult } from './dialogue'
import { tickPsyche } from './psyche'
import { tickBeliefs, observeEvidence, reinforceHabit, tickHabits, habitBias } from './beliefs'
import {
  createChatter, speak, pickIntent, inEarshot, renderOverheard, tickPromises, makePromise,
  type ChatterState,
} from './chatter'
import {
  createCulture, tickCulture, witnessedAct, updateInfluence, transmitCulture,
  updateSharedWords, chronicle, type Culture,
} from './norms'
import {
  createJobBoard, openJobsFor, claimJob, pruneJobs, workShiftAt, isProducedGoodStaffed,
  producerOf, type JobBoard, type JobId,
} from './jobs'
import {
  createLedger, pruneLedger, valueTo, negotiate, addDebt, repayDebt, totalOwedBy, type Ledger,
} from './economy'
import { lifeStageFor, isMature, learningRateFor, vigorFor } from './lifecycle'
import { appraise } from './emotions'
import { applyCrowding, applyPurpose, applyComfort } from './chem'
import { courtStep, partnershipStep, reconcileStep } from './courtship'
import { resilienceFactor, metabolicRate, fertilityFactor, senseRange } from './genetics'
import {
  createFixtures, fixtureAt, useBed, toggleDoor, storeItem, takeItem, type Fixture,
} from './interact'
import { createStoryLog, recordStory, explain, type StoryLog } from './story'
import {
  mentorScore, mentor, mediateScore, mediate, flatterScore, flatter, alliedPair, formAlliance,
} from './socialacts'

export type SimEventType = 'fight' | 'steal' | 'love' | 'birth' | 'sleep' | 'death' | 'eat' | 'work' | 'drink' | 'medicine' | 'flinch' | 'joinGang' | 'drop' | 'hit' | 'play' | 'school' | 'bury' | 'jealous' | 'say' | 'collect' | 'comfort' | 'heal' | 'gift' | 'scare' | 'rob'

export interface SimEvent {
  type: SimEventType
  aId: number | undefined
  bId: number | undefined
  x: number
  z: number
  tick: number
  /** the word spoken / taught — feeds the speech-bubble renderer */
  word?: string
  /** the concept that word refers to (food, danger, love, …) */
  concept?: string
  /** true when the creature heard/learned a word (thought-bubble, not speech) */
  learned?: boolean
  /** true when the event comes from the player character (not a creature) */
  fromPlayer?: boolean
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
  /** Typed natural-language talk with the nearest (or selected) creature. */
  playerTalk(text: string, targetId?: number): DialogueTurn | null
  settings: GameSettings
  lod: LodState
  society: HavenSociety
  dialogueLog: DialogueTurn[]
  /** compact creature↔creature messages + promises */
  chatter: ChatterState
  /** emergent settlement norms, influence, shared words, chronicle */
  culture: Culture
  /** who holds which institutional role */
  jobs: JobBoard
  /** informal debts between creatures */
  ledger: Ledger
  /** natural-language lines the player overheard recently */
  overheard: string[]
  /** the moments worth noticing, with the reason behind each one */
  stories: StoryLog
  /** beds, doors, counters, and containers the world is furnished with */
  fixtures: Fixture[]
  /** Use the nearest fixture as the player: sleep, open, take, or store. */
  playerUseFixture(action: 'rest' | 'toggle' | 'take' | 'store', itemId?: ItemId): string | null
}

/** Where each institutional role is performed. */
const JOB_TOWER: Record<JobId, TowerId> = {
  shopkeep: 'food',
  healer: 'clinic',
  bartender: 'tavern',
  farmer: 'farm',
  porter: 'work',
  teacher: 'school',
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
    settings: { ...DEFAULT_SETTINGS },
    lod: createLodState(),
    society: createSociety(),
    dialogueLog: [],
    chatter: createChatter(),
    culture: createCulture(),
    jobs: createJobBoard(),
    ledger: createLedger(),
    overheard: [],
    stories: createStoryLog(),
    fixtures: createFixtures(),
    playerUseFixture(action, itemId): string | null {
      const p = sim.player
      if (!isPlayerAlive(p)) return null
      const actor = { pos: p.pos, inventory: p.inventory, id: 0 }
      const f = fixtureAt(sim.fixtures, p.pos.x, p.pos.z)
      if (!f) return null
      if (action === 'rest') {
        const res = useBed(actor, f)
        if (!res.ok) return null
        p.health = clamp01(p.health + 0.15)
        p.hunger = clamp01(p.hunger - 0.02)
        return 'you rest for a while'
      }
      if (action === 'toggle') {
        const res = toggleDoor(actor, f)
        return res.ok ? `door ${res.effect}` : null
      }
      if (action === 'store' && itemId) {
        const res = storeItem(actor, f, itemId)
        return res.ok ? res.effect : null
      }
      if (action === 'take') {
        const target = itemId ?? (Object.keys(f.storage?.items ?? {})[0] as ItemId | undefined)
        if (!target) return null
        const res = takeItem(actor, f, target)
        if (!res.ok) return null
        if (res.stolen) {
          // taking what someone else stored is noticed by anyone watching
          for (const c of sim.creatures) {
            if (!c.alive) continue
            if (dist(c.pos.x, c.pos.z, p.pos.x, p.pos.z) > OBSERVE_RANGE) continue
            observeEvent(c, 'steal', 0)
            applySocialEvent(c.social, 0, 'steal', 1)
          }
          witnessedAct(sim.culture, 'property', true, 1)
        }
        return res.effect
      }
      return null
    },
    spawnCreature(genome?: Genome, x?: number, z?: number): Creature {
      const alive = sim.creatures.filter((c) => c.alive).length
      if (alive >= sim.settings.populationCap && alive > 0) {
        // at cap — still allow explicit spawn for lab tools by replacing nothing;
        // return last alive so callers that ignore the return stay safe
        const existing = sim.creatures.find((c) => c.alive)
        if (existing && !genome) return existing
      }
      const g = genome ?? randomGenome(sim.rng)
      const cx = clampCoord(x ?? (sim.rng() - 0.5) * 40)
      const cz = clampCoord(z ?? (sim.rng() - 0.5) * 40)
      const c = createCreature(sim.nextId++, pickName(sim.namePool, sim.rng()), g, cx, cz)
      c.wallet = 6 + Math.floor(sim.rng() * 8) // enough for a few meals — room to experiment
      // founders arrive grown: only creatures BORN here start as children
      c.age = 650 + Math.floor(sim.rng() * 400)
      c.stage = lifeStageFor(c.age)
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
      applySocialEvent(near.social, 0, 'talk', 1)
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
      // food ⇄ wum). Teaching also boosts the bond with nearby creatures and
      // the player records the word into their own vocab.
      const p = sim.player
      if (!isPlayerAlive(p) || !word) return
      const cleaned = word.trim().toLowerCase().slice(0, 12)
      if (!cleaned) return
      if (!CONCEPTS.includes(concept)) return
      // the player knows this word too — teaching teaches the teacher.
      // hearWord first so the exact taught word wins, then boost the strength.
      hearWord(p.language, cleaned, concept, 1)
      learnWord(p.language, concept, 1)
      if (p.language.vocab.get(concept)) {
        p.language.vocab.get(concept)!.word = cleaned
      }
      emit(sim, 'say', undefined, undefined, p.pos.x, p.pos.z, { word: cleaned, concept, fromPlayer: true })
      for (const c of sim.creatures) {
        if (!c.alive) continue
        if (dist(c.pos.x, c.pos.z, p.pos.x, p.pos.z) > 10) continue
        hearWord(c.language, cleaned, concept, 0.85)
        c.bonds[0] = clamp01((c.bonds[0] ?? 0) + 0.08)
        applySocialEvent(c.social, 0, 'teach', 1)
        c.action = 'learn'
        c.talkingTo = 0
        c.busyTicks = Math.max(c.busyTicks, 15)
        emit(sim, 'say', c, undefined, c.pos.x, c.pos.z, { word: cleaned, concept, learned: true })
      }
    },
    playerSay(concept: string): void {
      // The player says the word they know for a concept — creatures nearby
      // hear it and (with the context) reinforce their own mapping.
      const p = sim.player
      if (!isPlayerAlive(p)) return
      const word = sim.player.language ? getWord(sim.player.language, concept) : null
      emit(sim, 'say', undefined, undefined, p.pos.x, p.pos.z, { word: word ?? '', concept, fromPlayer: true })
      for (const c of sim.creatures) {
        if (!c.alive) continue
        if (dist(c.pos.x, c.pos.z, p.pos.x, p.pos.z) > 10) continue
        if (word) hearWord(c.language, word, concept, 0.4)
        c.action = 'hear'
        c.talkingTo = 0
        c.busyTicks = Math.max(c.busyTicks, 12)
        emit(sim, 'say', c, undefined, c.pos.x, c.pos.z, { word: word ?? '', concept })
      }
    },
    playerTalk(text: string, targetId?: number): DialogueTurn | null {
      const p = sim.player
      if (!isPlayerAlive(p)) return null
      const target =
        (targetId != null ? sim.creatureById(targetId) : null) ??
        nearestCreatureTo(sim, p.pos.x, p.pos.z, SOCIAL_RANGE + 2)
      if (!target || !target.alive) return null

      const parsed = parsePlayerText(text)
      // teaching via NL: "the word for food is wum"
      if (parsed.intent === 'teach' && parsed.concept && parsed.word) {
        sim.playerTeach(parsed.concept, parsed.word)
      }

      const knownPlaces = TOWERS.filter((t) => target.knowsTower(t.id)).map((t) => t.id)
      const nearbyNames = sim.creatures
        .filter((o) => o.alive && o.id !== target.id && dist(o.pos.x, o.pos.z, target.pos.x, target.pos.z) < 14)
        .map((o) => o.name)

      const turn = respondToPlayer(
        {
          creature: target,
          playerName: p.name,
          playerTrust: trustTowards(target, 0),
          graph: target.social,
          nearbyNames,
          knownPlaces,
          tick: sim.time,
        },
        parsed,
        0,
      )

      // Some things said out loud actually change the world, not just the mood.
      const outcome = applySpokenOutcome(sim, target, parsed, text)
      if (outcome) turn.text = outcome

      // social consequences of the conversation
      applySocialEvent(target.social, 0, parsed.intent === 'flirt' ? 'flirt'
        : parsed.intent === 'apologize' ? 'forgive'
          : parsed.intent === 'comfort' ? 'comfort'
            : parsed.intent === 'accuse' ? 'hurt'
              : parsed.intent === 'offer_gift' ? 'gift'
                : 'talk', 1)

      if (parsed.intent === 'greet' || parsed.intent === 'ask_feeling' || parsed.intent === 'ask_name') {
        target.bonds[0] = clamp01((target.bonds[0] ?? 0) + 0.04)
        applySocial(target.chem)
      }
      if (parsed.intent === 'command' && !turn.obeyed) {
        applyEmotionFeedback(target.emotions, 'spite', 0.05)
      }
      if (parsed.intent === 'flirt') {
        const compat = geneticCompatibility(target.genome, {
          sociability: 0.6, loyalty: 0.5, aggression: 0.2, lovePropensity: 0.5, fearfulness: 0.3,
        })
        bumpEdge(target.social, 0, 'attraction', 0.08 * compat)
      }

      target.talkingTo = 0
      target.busyTicks = Math.max(target.busyTicks, 24)
      target.action = 'chat'
      target.facing = Math.atan2(p.pos.x - target.pos.x, p.pos.z - target.pos.z)
      target.recentDialogue.push(`You: ${text.trim().slice(0, 80)}`)
      target.recentDialogue.push(`${target.name}: ${turn.text}`)
      if (target.recentDialogue.length > 12) target.recentDialogue.splice(0, target.recentDialogue.length - 12)

      sim.dialogueLog.push(turn)
      if (sim.dialogueLog.length > 40) sim.dialogueLog.splice(0, sim.dialogueLog.length - 40)
      emit(sim, 'say', target, undefined, target.pos.x, target.pos.z, {
        word: turn.text.slice(0, 48),
        concept: parsed.intent,
        fromPlayer: false,
      })
      return turn
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
      const focusX = sim.player.alive ? sim.player.pos.x : 0
      const focusZ = sim.player.alive ? sim.player.pos.z : 0

      // Time-sliced AI: only a batch of due creatures get a full decide()
      const batch = new Set(pickAiBatch(sim.creatures, focusX, focusZ, sim.settings, sim.lod, sim.time).map((c) => c.id))

      for (const c of sim.creatures) {
        if (!c.alive) continue
        // INTERACTION HOLD: a creature mid-chat stands still facing the player.
        if (c.busyTicks > 0) {
          c.busyTicks--
          c.action = c.talkingTo === 0 ? 'chat' : c.action
          c.goalTowerId = null
          c.intention = null
          if (c.busyTicks === 0) c.talkingTo = null
          continue
        }
        const band = bandFor(c, focusX, focusZ, sim.settings)
        // SLEEP SUSPENSION: light chem restore, no full AI unless woken
        if (c.sleeping) {
          c.chem.energy = clamp01(c.chem.energy + 0.35)
          if (c.chem.energy > 0.55) {
            c.sleeping = false
            c.action = 'wake'
            c.intention = null
          } else {
            c.action = 'sleep'
            c.intention = null
            c.goalTowerId = null
            continue
          }
        }
        if (c.age > c.ageLimit) {
          const dmg = agingDamage(c.age, c.playerBond)
          if (dmg > 0) {
            c.chem.health = clamp01(c.chem.health - dmg)
            if (c.chem.health <= 0) c.alive = false
          }
        }
        if (!c.alive) continue

        // illness creeps; a resilient constitution shrugs it off faster
        const resilience = resilienceFactor(c.genome)
        if (c.illness > 0.05) {
          c.chem.health = clamp01(c.chem.health - c.illness * 0.002 * (2 - resilience))
          c.illness = clamp01(c.illness - 0.001 * resilience)
        } else if (sim.rng() < 0.0008 * (1.2 - resilience)) {
          c.illness = clamp01(c.illness + 0.15 + sim.rng() * 0.2)
        }
        // wounds heal on their own, slowly, and hurt while they last
        if (c.injury > 0.01) {
          c.injury = clamp01(c.injury - 0.0012 * resilience)
          c.chem.health = clamp01(c.chem.health - c.injury * 0.0008)
          c.chem.comfort = clamp01(c.chem.comfort - c.injury * 0.002)
        }
        // crowding drains privacy; solitude restores it
        applyCrowding(c.chem, countNeighbors(sim, c, 4))
        // purpose: a role, a family, or savings give a reason to keep going
        if (c.job || c.householdId != null) applyPurpose(c.chem, 0.0006)

        // continue committed movement even when not in AI batch
        if (!batch.has(c.id) && c.intention && c.goalTowerId && c.goalTowerId !== 'none') {
          const goal = towerAt(c.pos.x, c.pos.z)
          if (goal?.id !== c.goalTowerId) {
            execute(sim, c, c.intention)
            c.pos.x = clampCoord(c.pos.x)
            c.pos.z = clampCoord(c.pos.z)
            continue
          }
        }

        if (batch.has(c.id) || band === 'near' || !c.intention) {
          decide(sim, c)
          markDecided(sim.lod, c.id, sim.time)
        } else if (c.intention && actionValid(sim, c, c.intention)) {
          execute(sim, c, c.intention)
        }

        wantProgress(c.want, c.action)
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
        if (!c.alive && c.action === 'dead') continue
        const band = bandFor(c, focusX, focusZ, sim.settings)
        const stride = chemStride(band)
        if (sim.time % stride.every === 0) {
          tickChem(c.chem, sim.time)
          // apply extra decay steps when striding
          for (let i = 1; i < stride.dt; i++) tickChem(c.chem, sim.time)
          // metabolism: a fast burner empties faster than a thrifty one
          const burn = (metabolicRate(c.genome) - 1) * 0.0004 * stride.dt
          if (burn !== 0) c.chem.hunger = clamp01(c.chem.hunger - burn)
          // warm clothing keeps a creature comfortable out in the settlement
          if (countItem(c.inventory, 'cloak') > 0) applyComfort(c.chem, 0.0008 * stride.dt)
        }
        if (band !== 'far' || sim.time % 4 === 0) {
          decayMemory(c.memory)
          tickDrives(c.drives, c.chem, c.genome)
          tickEmotions(c.emotions)
          tickSocialGraph(c.social)
          tickPsyche(c)
          tickBeliefs(c.beliefs, sim.time)
          tickHabits(c.habits)
          decayGrudges(c.vengeance, 0.002)
        }
        c.age++
        c.stage = lifeStageFor(c.age)
        if (c.fightCooldown > 0) c.fightCooldown--
        // want lifecycle: age it, progress on matching actions, refresh when done
        tickWant(c.want)
        if (c.want.fulfilled || wantExpired(c.want)) {
          c.chem.pleasure = clamp01(c.chem.pleasure + 0.15) // want completed = joy
          c.want = refreshWant(c.want, { hunger: c.chem.hunger, energy: c.chem.energy, social: c.chem.social, pleasure: c.chem.pleasure })
        }
        if (c.chem.health <= 0 && c.action !== 'dead') {
          // gentle mode: suppress starvation / illness permadeath (old age still applies)
          if (sim.settings.gentleMode && c.age <= c.ageLimit) {
            c.chem.health = 0.05
            c.chem.hunger = Math.max(c.chem.hunger, 0.15)
            c.illness = 0
          } else {
            c.alive = false
            c.action = 'dead'
            emit(sim, 'death', c, undefined, c.pos.x, c.pos.z)
            grieve(sim, c)
          }
        }
      }
      // shelves only refill where somebody is doing the work
      tickEconomy(sim.economy, (goodId) => isProducedGoodStaffed(sim.jobs, goodId))
      if (sim.time % 20 === 0 || sim.time === 1) assignJobs(sim)
      if (sim.time % 200 === 0) reportShortages(sim)
      tickDebts(sim)
      tickNewcomers(sim)
      // market day rollover: adjust prices by yesterday's demand (visible ▲▼)
      if (sim.time % sim.economy.DAY_TICKS === 0) {
        tickMarketDay(sim.economy, Math.floor(sim.time / sim.economy.DAY_TICKS))
      }
      tickRelationships(sim)
      tickPartnerships(sim)
      tickFamilyPlans(sim)
      tickSocialActs(sim)
      tickHouseholdCare(sim.society, sim.creatures)
      careForChildren(sim)
      if (sim.time % 30 === 0) {
        pruneHouseholds(sim.society, sim.creatures)
        pruneJobs(sim.jobs, sim.creatures)
        pruneLedger(sim.ledger, new Set(sim.creatures.filter((c) => c.alive).map((c) => c.id)))
      }
      tickCulture(sim.culture)
      if (sim.time % 60 === 0) {
        updateInfluence(sim.culture, sim.creatures)
        updateSharedWords(sim.culture, sim.creatures)
      }
      chatterNearby(sim, focusX, focusZ)
      for (const broken of tickPromises(sim.chatter, sim.time, (id) => sim.creatureById(id))) {
        if (!broken.promiser || !broken.promisee) continue
        recordStory(sim.stories, {
          kind: 'broken-promise',
          tick: sim.time,
          actor: broken.promiser,
          target: broken.promisee,
          text: `${broken.promiser.name} never made good on ${broken.promise.about} for ${broken.promisee.name}`,
          because: explain(broken.promiser),
        })
      }
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

/**
 * Words with consequences: a trade the creature actually agrees to, a request
 * it commits to, or a warning that changes what it believes about someone.
 * Returns a replacement reply when the world changed, otherwise null.
 */
function applySpokenOutcome(
  sim: Sim,
  target: Creature,
  parsed: ParseResult,
  said: string,
): string | null {
  const p = sim.player

  if (parsed.intent === 'request_trade') {
    const itemId = (parsed.item ?? 'bread') as ItemId
    const rep = getReputation(target, 0)
    if (parsed.direction === 'sell') {
      // the player is offering something
      if (!hasItem(p.inventory, itemId)) return `You have no ${itemId} to offer.`
      const worth = valueTo(sim.economy, {
        chem: target.chem, wallet: target.wallet, genome: target.genome,
        chemAddiction: target.chem.addiction,
      }, itemId)
      const price = Math.max(1, Math.round(worth * (rep.trust > 0.3 ? 1.1 : 0.8)))
      if (target.wallet < price) return `"${target.name} turns out their pockets — they cannot afford it."`
      tradeItem(p.inventory, target.inventory, itemId, 1, { newOwnerId: target.id })
      target.wallet -= price
      p.wallet += price
      applySocialEvent(target.social, 0, 'share', 1)
      recordStory(sim.stories, {
        kind: 'generosity',
        tick: sim.time,
        actor: target,
        text: `${target.name} bought ${itemId} from you for ${price} coins`,
        because: explain(target),
      })
      return `"${price} coins, then." ${target.name} hands the money over and takes the ${itemId}.`
    }

    // the player wants to buy
    if (!hasItem(target.inventory, itemId)) {
      return `"I have no ${itemId} to spare," ${target.name} says.`
    }
    const worth = valueTo(sim.economy, {
      chem: target.chem, wallet: target.wallet, genome: target.genome,
      chemAddiction: target.chem.addiction,
    }, itemId)
    const offer = negotiate(sim.economy, itemId === 'bread' ? 'bread' : itemId,
      { trust: rep.trust, thief: rep.thief }, p.wallet, worth)
    if (offer.reason === 'refused-thief') {
      return `"I don't deal with thieves," ${target.name} says flatly.`
    }
    const price = Math.max(1, offer.price || worth)
    if (p.wallet < price) return `"${price} coins," ${target.name} says. You cannot afford it.`
    tradeItem(target.inventory, p.inventory, itemId, 1, { newOwnerId: 0 })
    p.wallet -= price
    target.wallet += price
    applySocialEvent(target.social, 0, 'share', 0.8)
    return `${target.name} hands over the ${itemId} for ${price} coins.`
  }

  if (parsed.intent === 'request_help') {
    const willing = trustTowards(target, 0) > 0.1 && target.chem.fear < 0.55
    if (!willing) return null
    makePromise(sim.chatter, target, playerAsCreature(sim), 'help', sim.time, 500)
    recordStory(sim.stories, {
      kind: 'promise',
      tick: sim.time,
      actor: target,
      text: `${target.name} promised to help you`,
    })
    return `"Alright. I'll help you," ${target.name} says — and means it, for now.`
  }

  if (parsed.intent === 'warn' || parsed.intent === 'accuse') {
    // who are we talking about? whichever creature the player named
    const lower = said.toLowerCase()
    const about = sim.creatures.find((c) => c.alive && c.id !== target.id && lower.includes(c.name.toLowerCase()))
    if (!about) return null
    const credibility = clamp01((trustTowards(target, 0) + 1) / 2)
    if (credibility < 0.3) return `"Says who?" ${target.name} replies, unconvinced.`
    observeEvidence(target.beliefs, `who:${about.id}:danger`, credibility, 'told', sim.time)
    const rep = getReputation(target, about.id)
    rep.trust = Math.max(-1, rep.trust - 0.25 * credibility)
    return `${target.name} glances toward ${about.name}. "I'll be careful."`
  }

  return null
}

/** The player as a social entity (id 0) for systems that expect a creature. */
function playerAsCreature(sim: Sim): Creature {
  return {
    id: 0,
    name: sim.player.name,
    social: {},
    emotions: createEmotions(),
  } as unknown as Creature
}

/** Push a renderer-visible event. */
export function emit(
  sim: Sim,
  type: SimEventType,
  a: Creature | undefined,
  b: Creature | undefined,
  x: number,
  z: number,
  payload?: { word?: string; concept?: string; learned?: boolean; fromPlayer?: boolean },
): void {
  sim.events.push({
    type,
    aId: a?.id ?? 0,
    bId: b?.id,
    x,
    z,
    tick: sim.time,
    ...payload,
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
      // Money but no idea where the market is: ask. Someone who knows, and
      // does not mistrust you, will point the way — that is how a newcomer
      // learns the settlement instead of starving in the middle of it.
      const helper = nearestOther(sim, c, SOCIAL_RANGE + 3)
      if (helper && !helper.sleeping) {
        shareDirections(helper, c, trustTowards(helper, c.id))
        speak(sim.chatter, c, helper, 'ask_where', sim.time, 'food')
        c.action = 'ask'
        if (knows(sim, c, 'food')) {
          goTo(sim, c, 'food')
          c.intention = 'food'
          return
        }
      }
      // nobody to ask — go and look
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

  // A settled couple at home may decide the time is right. Conditions matter:
  // both fed and rested, a household to raise a child in, room in the
  // settlement, and fertility that varies from creature to creature.
  const at = towerAt(c.pos.x, c.pos.z)
  if (at?.id === 'homes' && c.partnerId !== null && readyForChild(sim, c)) {
    const partner = sim.creatureById(c.partnerId)
    const lastBirth = c.memory.facts.partnerIsHere ?? -1000
    const alive = sim.creatures.filter((o) => o.alive).length
    if (
      partner && partner.alive && readyForChild(sim, partner)
      && dist(c.pos.x, c.pos.z, partner.pos.x, partner.pos.z) < 6
      && sim.time - lastBirth > BIRTH_COOLDOWN
      && alive < sim.settings.populationCap
      && canProcreate(c.chem.energy, partner.chem.energy, c.age)
      && sim.rng() < 0.35 * fertilityFactor(c.genome) * fertilityFactor(partner.genome)
    ) {
      // energy cost paid by both parents — life is not free
      c.chem.energy = clamp01(c.chem.energy - procreationCost(c.chem.energy))
      partner.chem.energy = clamp01(partner.chem.energy - procreationCost(partner.chem.energy))
      c.memory.facts.partnerIsHere = sim.time
      partner.memory.facts.partnerIsHere = sim.time
      ensureCoupleHousehold(sim.society, c, partner, sim.time)
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
  // Habits: what this creature keeps doing gets a little easier to choose.
  for (const name of Object.keys(scores) as ActionName[]) {
    scores[name] += habitBias(c.habits, name)
  }
  const chosen = chooseAction(scores, sim.rng)
  c.intention = chosen
  c.intentionTicks = COMMITMENT_TICKS
  reinforceHabit(c.habits, chosen, 0.02 * learningRateFor(c.stage))
  execute(sim, c, chosen)
  // Learning: the outcome of this action teaches the brain a little (async).
  void learnFromOutcome(sim, c, chosen)
}

/**
 * Creature↔creature talk. Meaning always flows (cheap); words are only
 * rendered when the player is close enough to overhear.
 */
function chatterNearby(sim: Sim, focusX: number, focusZ: number): void {
  if (sim.time % 4 !== 0) return
  for (const c of sim.creatures) {
    if (!c.alive || c.sleeping || c.busyTicks > 0) continue
    if (sim.rng() > 0.12 * (0.4 + c.genome.sociability)) continue
    const other = nearestOther(sim, c, SOCIAL_RANGE)
    if (!other || other.sleeping) continue
    const kind = pickIntent(c, other)
    const msg = speak(sim.chatter, c, other, kind, sim.time)
    shareDirections(c, other, trustTowards(other, c.id))
    if (inEarshot(focusX, focusZ, c, other)) {
      sim.overheard.push(renderOverheard(c, other, msg))
      if (sim.overheard.length > 12) sim.overheard.splice(0, sim.overheard.length - 12)
      emit(sim, 'say', c, other, c.pos.x, c.pos.z, { concept: kind })
    }
  }
}

/**
 * Children cannot work or buy for themselves. Someone has to feed them:
 * usually a parent, sometimes a kind neighbour. A greedy, disloyal adult
 * under pressure may simply not bother — and the child pays for it.
 */
function careForChildren(sim: Sim): void {
  if (sim.time % 15 !== 0) return
  for (const kid of sim.creatures) {
    if (!kid.alive || isMature(kid.stage)) continue
    if (kid.chem.hunger > 0.55) continue

    const house = householdOf(sim.society, kid.id)
    const carers = sim.creatures.filter((a) =>
      a.alive && a.id !== kid.id && isMature(a.stage) &&
      (house?.memberIds.includes(a.id) || dist(a.pos.x, a.pos.z, kid.pos.x, kid.pos.z) < 6),
    )
    for (const adult of carers) {
      const kin = house?.memberIds.includes(adult.id) ?? false
      const neglectful = adult.genome.greed > 0.7 && adult.genome.loyalty < 0.35
      if (neglectful && !(kid.chem.hunger < 0.15)) {
        kid.emotions.shame = clamp01(kid.emotions.shame + 0.02)
        continue
      }
      if (!kin && adult.genome.sociability < 0.4) continue

      if (countItem(adult.inventory, 'bread') > 0 && useItem(adult.inventory, 'bread')) {
        kid.eat()
        applySocialEvent(kid.social, adult.id, 'help', 1)
        applyPurpose(adult.chem, 0.05)
        emit(sim, 'gift', adult, kid, kid.pos.x, kid.pos.z)
        return
      }
      if (adult.wallet >= 4) {
        adult.wallet -= 3
        kid.wallet += 3
        applySocialEvent(kid.social, adult.id, 'gift', 1)
        applyPurpose(adult.chem, 0.03)
        return
      }
    }
    // nobody stepped in — hunger keeps biting, and the child remembers
    if (kid.chem.hunger < 0.2) {
      kid.emotions.frustration = clamp01(kid.emotions.frustration + 0.02)
    }
  }
}

/**
 * Is this creature in a place — physically and emotionally — to raise a child?
 * Attachment, health, and provision all have to line up.
 */
function readyForChild(sim: Sim, c: Creature): boolean {
  if (c.partnerId === null || !isMature(c.stage) || c.stage === 'elder') return false
  const edge = c.social[c.partnerId]
  const attachment = Math.max(c.chem.bond, edge ? romanticInterest(edge, c.genome.lovePropensity) : 0)
  if (attachment < 0.5) return false
  if (c.chem.hunger < 0.35 || c.chem.energy < 0.3 || c.chem.health < 0.55) return false
  if (c.chem.fear > 0.5 || c.chem.grief > 0.3) return false
  // a home to bring a child back to: an established household, or standing
  // in the homes quarter where one will be claimed
  if (householdOf(sim.society, c.id) !== undefined) return true
  return towerAt(c.pos.x, c.pos.z)?.id === 'homes'
}

/**
 * Couples who are ready head home together. Without this they simply never
 * happen to stand in the same doorway at the same moment.
 */
function tickFamilyPlans(sim: Sim): void {
  if (sim.time % 40 !== 0) return
  const alive = sim.creatures.filter((c) => c.alive).length
  if (alive >= sim.settings.populationCap) return
  const handled = new Set<number>()
  for (const c of sim.creatures) {
    if (!c.alive || handled.has(c.id) || c.partnerId === null) continue
    const partner = sim.creatureById(c.partnerId)
    if (!partner || !partner.alive) continue
    if (!readyForChild(sim, c) || !readyForChild(sim, partner)) continue
    const lastBirth = c.memory.facts.partnerIsHere ?? -1000
    if (sim.time - lastBirth < BIRTH_COOLDOWN) continue
    handled.add(c.id)
    handled.add(partner.id)

    // Both home together and still willing? Then a child is born here, in the
    // household that will raise it.
    const home = findTower('homes')
    const bothHome = home
      && dist(c.pos.x, c.pos.z, home.x, home.z) <= home.radius + 1
      && dist(partner.pos.x, partner.pos.z, home.x, home.z) <= home.radius + 1
    if (bothHome && canProcreate(c.chem.energy, partner.chem.energy, c.age)
      && sim.rng() < 0.5 * fertilityFactor(c.genome) * fertilityFactor(partner.genome)) {
      c.chem.energy = clamp01(c.chem.energy - procreationCost(c.chem.energy))
      partner.chem.energy = clamp01(partner.chem.energy - procreationCost(partner.chem.energy))
      c.memory.facts.partnerIsHere = sim.time
      partner.memory.facts.partnerIsHere = sim.time
      c.sleeping = false
      partner.sleeping = false
      procreate(sim, c, partner)
      continue
    }

  }
}

/**
 * Partnerships are re-examined periodically: resentment and jealousy can end
 * one, and a forgiving ex may later reconcile with someone they still like.
 */
function tickPartnerships(sim: Sim): void {
  if (sim.time % 24 !== 0) return
  const seen = new Set<number>()
  for (const c of sim.creatures) {
    if (!c.alive || c.partnerId === null || seen.has(c.id)) continue
    const partner = sim.creatureById(c.partnerId)
    // Widowhood: once the dead are buried and the worst of the grief has
    // passed, the survivor is single again. Mourning ends; the memory doesn't.
    if (!partner || !partner.alive) {
      const buried = !partner || partner.buried
      if (buried && c.chem.grief < 0.25) {
        c.partnerId = null
        c.emotions.hope = clamp01(c.emotions.hope + 0.1)
      }
      continue
    }
    seen.add(c.id)
    seen.add(partner.id)
    const state = partnershipStep(c, partner)
    if (state === 'ended') {
      chronicle(sim.culture, sim.time, `${c.name} and ${partner.name} separated.`)
      recordStory(sim.stories, {
        kind: 'separation',
        tick: sim.time,
        actor: c,
        target: partner,
        text: `${c.name} and ${partner.name} separated`,
        because: explain(c),
      })
      emit(sim, 'jealous', c, partner, c.pos.x, c.pos.z)
    }
  }
  // exes and estranged friends occasionally make peace
  for (const c of sim.creatures) {
    if (!c.alive || c.emotions.forgiveness < 0.3) continue
    const near = nearestOther(sim, c, SOCIAL_RANGE)
    if (!near) continue
    const edge = c.social[near.id]
    if (!edge || edge.resentment < 0.3) continue
    if (reconcileStep(c, near)) {
      emit(sim, 'comfort', c, near, c.pos.x, c.pos.z)
    }
  }
}

/**
 * Haven sits on a road. When the settlement thins out, a traveller eventually
 * arrives and stays — a slow trickle that keeps the society alive without
 * inflating birth rates. Turn it off in settings for a closed population.
 */
function tickNewcomers(sim: Sim): void {
  if (!sim.settings.allowNewcomers) return
  if (sim.time % 300 !== 0) return
  const alive = sim.creatures.filter((c) => c.alive).length
  const target = Math.max(4, Math.floor(sim.settings.populationCap * 0.6))
  if (alive >= target) return
  if (sim.rng() > 0.5) return
  const edge = WORLD_HALF - 12
  const side = Math.floor(sim.rng() * 4)
  const along = (sim.rng() - 0.5) * edge
  const pos = side === 0 ? { x: along, z: -edge }
    : side === 1 ? { x: along, z: edge }
      : side === 2 ? { x: -edge, z: along }
        : { x: edge, z: along }
  const newcomer = sim.spawnCreature(undefined, pos.x, pos.z)
  newcomer.wallet += 4
  chronicle(sim.culture, sim.time, `${newcomer.name} arrived in Haven.`)
  recordStory(sim.stories, {
    kind: 'arrival',
    tick: sim.time,
    actor: newcomer,
    text: `${newcomer.name} arrived in Haven looking for a place to settle`,
  })
  emit(sim, 'birth', newcomer, undefined, newcomer.pos.x, newcomer.pos.z)
}

/**
 * The deliberate social moves: teaching the young, breaking up a fight,
 * buttering someone up, and recognising an alliance. These are chosen from
 * character and circumstance, which is why they produce different stories in
 * different settlements.
 */
function tickSocialActs(sim: Sim): void {
  if (sim.time % 18 !== 0) return

  for (const c of sim.creatures) {
    if (!c.alive || c.sleeping || c.busyTicks > 0) continue
    const near = nearestOther(sim, c, SOCIAL_RANGE + 1)
    if (!near || near.sleeping) continue

    // teaching a child what you know
    const teach = mentorScore(c, near)
    if (teach > 0.5 && sim.rng() < teach * 0.5) {
      const taught = mentor(c, near)
      if (taught.taughtPlace || taught.taughtWord) {
        c.action = 'teach'
        near.action = 'learn'
        emit(sim, 'school', c, near, c.pos.x, c.pos.z)
        recordStory(sim.stories, {
          kind: 'mentorship',
          tick: sim.time,
          actor: c,
          target: near,
          text: taught.taughtPlace
            ? `${c.name} showed ${near.name} where the ${taught.taughtPlace} is`
            : `${c.name} taught ${near.name} the word "${taught.taughtWord}"`,
          because: c.parentIds.includes(near.id) || near.parentIds.includes(c.id)
            ? 'their own child'
            : explain(c),
        })
        continue
      }
    }

    // buttering someone up for what they have
    const flattery = flatterScore(c, near)
    if (flattery > 0.55 && sim.rng() < flattery * 0.4) {
      const result = flatter(c, near)
      c.action = 'flatter'
      recordStory(sim.stories, {
        kind: 'manipulation',
        tick: sim.time,
        actor: c,
        target: near,
        text: result.believed
          ? `${c.name} won ${near.name} over with warm words`
          : `${near.name} saw through ${c.name}'s flattery`,
        because: explain(c),
        weight: result.believed ? 1 : 1.2,
      })
      continue
    }

    // an alliance nobody declared, but everybody can see
    if (alliedPair(c, near) && sim.rng() < 0.15) {
      const already = c.beliefs[`ally:${near.id}`]
      if (!already) {
        formAlliance(c, near)
        observeEvidence(c.beliefs, `ally:${near.id}`, 1, 'seen', sim.time)
        observeEvidence(near.beliefs, `ally:${c.id}`, 1, 'seen', sim.time)
        recordStory(sim.stories, {
          kind: 'alliance',
          tick: sim.time,
          actor: c,
          target: near,
          text: `${c.name} and ${near.name} have become firm allies`,
        })
      }
    }
  }

  // stepping between two who are at each other's throats
  for (const a of sim.creatures) {
    if (!a.alive || a.fightCooldown < 40) continue
    const b = nearestOther(sim, a, FIGHT_RANGE + 3)
    if (!b || b.fightCooldown < 40) continue
    for (const peacemaker of sim.creatures) {
      if (!peacemaker.alive || peacemaker.sleeping) continue
      if (dist(peacemaker.pos.x, peacemaker.pos.z, a.pos.x, a.pos.z) > SOCIAL_RANGE + 3) continue
      const score = mediateScore(peacemaker, a, b, sim.culture.influence[peacemaker.id] ?? 0)
      if (score < 0.5 || sim.rng() > score * 0.5) continue
      const result = mediate(peacemaker, a, b)
      peacemaker.action = 'mediate'
      emit(sim, 'comfort', peacemaker, a, peacemaker.pos.x, peacemaker.pos.z)
      recordStory(sim.stories, {
        kind: 'mediation',
        tick: sim.time,
        actor: peacemaker,
        target: a,
        text: result.hurt
          ? `${peacemaker.name} got between ${a.name} and ${b.name}, and took a blow for it`
          : `${peacemaker.name} talked ${a.name} and ${b.name} down`,
        because: explain(peacemaker),
        weight: result.hurt ? 1.3 : 1,
      })
      break
    }
  }
}

/**
 * Debts between individuals. A creature who owes somebody pays them back when
 * it can, feels the obligation while it cannot, and a creditor who is never
 * repaid starts to resent it.
 */
function tickDebts(sim: Sim): void {
  if (sim.time % 50 !== 0) return
  for (const debt of [...sim.ledger.debts]) {
    const debtor = sim.creatureById(debt.fromId)
    const creditor = sim.creatureById(debt.toId)
    if (!debtor?.alive || !creditor?.alive) continue

    // repay when you have enough to spare, and you are nearby to hand it over
    const spare = debtor.wallet - 4
    if (spare > 0 && dist(debtor.pos.x, debtor.pos.z, creditor.pos.x, creditor.pos.z) < SOCIAL_RANGE + 2) {
      const paid = repayDebt(sim.ledger, debt.fromId, debt.toId, Math.min(spare, debt.amount))
      if (paid > 0) {
        debtor.wallet -= paid
        creditor.wallet += paid
        applySocialEvent(creditor.social, debtor.id, 'help', 0.6)
        debtor.emotions.pride = clamp01(debtor.emotions.pride + 0.1)
        debtor.emotions.guilt = clamp01(debtor.emotions.guilt - 0.15)
        if (totalOwedBy(sim.ledger, debtor.id) <= 0) {
          recordStory(sim.stories, {
            kind: 'debt',
            tick: sim.time,
            actor: debtor,
            target: creditor,
            text: `${debtor.name} paid off what they owed ${creditor.name}`,
          })
        }
      }
      continue
    }

    // still owing: it weighs on the debtor and wears on the creditor
    const age = sim.time - debt.since
    debtor.emotions.guilt = clamp01(debtor.emotions.guilt + 0.01)
    debtor.chem.purpose = clamp01(debtor.chem.purpose - 0.004)
    if (age > 900) {
      applySocialEvent(creditor.social, debtor.id, 'reject', 0.3)
      creditor.emotions.resentment = clamp01(creditor.emotions.resentment + 0.02)
    }
  }
}

/**
 * Notice when a shelf has run dry and say who is missing. A shortage the
 * player cannot trace to a person is just a number going down.
 */
function reportShortages(sim: Sim): void {
  for (const goodId of ['bread', 'medicine', 'grain', 'brew'] as const) {
    const good = sim.economy.goods[goodId]
    if (!good || good.stock > 0) continue
    const job = producerOf(goodId)
    if (!job) continue
    const holderId = sim.jobs.holders[job.id]
    const holder = holderId !== undefined ? sim.creatureById(holderId) : undefined
    const cause = !holder
      ? `nobody is working as ${job.title}`
      : `the ${job.title}, ${holder.name}, cannot keep up`
    recordStory(sim.stories, {
      kind: 'shortage',
      tick: sim.time,
      actor: holder,
      text: `Haven has run out of ${goodId}`,
      because: cause,
    })
  }
}

/** Claim vacant institutional roles so shops, clinics, and bars are staffed. */
function assignJobs(sim: Sim): void {
  for (const c of sim.creatures) {
    if (!c.alive || c.job || !isMature(c.stage)) continue
    // a creature settles into a role only once it has seen enough of the
    // settlement to know the place — and only when it actually wants coin
    if (Object.keys(c.knowledge).length < 3) continue
    if (c.wallet > 20 && c.chem.hunger > 0.6) continue
    const open = openJobsFor(sim.jobs, c)
    const pick = open.find((j) => c.knowsTower(j.tower))
    if (!pick) continue
    if (claimJob(sim.jobs, c, pick.id)) {
      observeEvidence(c.beliefs, `job:${pick.id}:mine`, 1, 'seen', sim.time)
      applyPurpose(c.chem, 0.2)
    }
  }
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
      // A creature with an institutional role works THAT job at its workplace:
      // the shop restocks because the shopkeeper stood behind the counter.
      const role = c.job as JobId | null
      const atRoleTower = role !== null && at?.id === JOB_TOWER[role]
      if (role && atRoleTower) {
        const result = workShiftAt(sim.jobs, sim.economy, c, role)
        c.action = 'work'
        if (result.paid > 0) {
          emit(sim, 'work', c, undefined, c.pos.x, c.pos.z)
          c.action = 'work done'
          appraise(c.emotions, 0.5, 0.3, 0.8)
        }
        return
      }
      if (role) {
        const workplace = JOB_TOWER[role]
        if (knows(sim, c, workplace)) {
          goTo(sim, c, workplace)
          return
        }
      }
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
      // A creature with a household sleeps in its OWN house; everyone else
      // uses the common lodgings. Sleeping in your own bed is more restful.
      const ownHome = homeTowerFor(sim, c)
      const atOwnHome = ownHome !== null && at?.id === ownHome
      if (atOwnHome || at?.id === 'homes' || c.chem.energy < 0.2) {
        c.sleeping = true
        c.action = 'sleep'
        c.chem.energy = clamp01(c.chem.energy + (atOwnHome ? 0.4 : 0.35))
        if (atOwnHome) {
          applyComfort(c.chem, 0.05)
          c.chem.privacy = clamp01(c.chem.privacy + 0.03)
        }
        return
      }
      goTo(sim, c, (ownHome ?? 'homes') as TowerId)
      return
    }
    case 'heal': {
      if (at?.id === 'pharmacy' && buyFromTower(sim.economy, 'pharmacy', c)) {
        const dose = 0.1 + c.genome.addictionProne * 0.25
        c.chem.health = clamp01(c.chem.health + 0.3)
        c.chem.addiction.medicine = clamp01((c.chem.addiction.medicine ?? 0) + dose)
        c.chem.lastDose.medicine = sim.time
        c.illness = clamp01(c.illness - 0.15)
        emit(sim, 'medicine', c, undefined, c.pos.x, c.pos.z)
        c.action = 'medicine'
        return
      }
      goTo(sim, c, 'pharmacy')
      return
    }
    case 'nest': {
      if (at?.id === 'homes') {
        // home with someone you love: rest, warmth, and time together
        c.action = 'home'
        applyComfort(c.chem, 0.02)
        c.chem.privacy = clamp01(c.chem.privacy + 0.01)
        const partner = c.partnerId !== null ? sim.creatureById(c.partnerId) : null
        if (partner && partner.alive) {
          applySocialEvent(c.social, partner.id, 'talk', 0.5)
          c.chem.bond = clamp01(c.chem.bond + 0.01)
        }
        return
      }
      goTo(sim, c, 'homes')
      return
    }
    case 'clinic': {
      if (at?.id === 'clinic') {
        // A staffed clinic treats properly; an empty one only offers a cot.
        const healerId = sim.jobs.holders.healer
        const healer = healerId !== undefined ? sim.creatureById(healerId) : undefined
        const staffed = !!healer && healer.alive && healer.id !== c.id
        const fee = staffed ? 5 : 2
        const needsCare = c.illness > 0.05 || c.injury > 0.05 || c.chem.health < 0.7
        // Nobody is turned away bleeding: a healer who can afford to will treat
        // on credit, and the patient owes them for it afterwards.
        const onCredit = needsCare && c.wallet < fee && staffed && !!healer
          && (c.chem.health < 0.5 || c.injury > 0.3)
          && healer.genome.loyalty > 0.35
        if (onCredit && healer) {
          addDebt(sim.ledger, c.id, healer.id, fee, sim.time)
          c.chem.health = clamp01(c.chem.health + 0.4)
          c.illness = 0
          c.injury = 0
          applySocialEvent(c.social, healer.id, 'help', 1.2)
          c.emotions.gratitude = clamp01(c.emotions.gratitude + 0.25)
          applyPurpose(healer.chem, 0.06)
          recordStory(sim.stories, {
            kind: 'debt',
            tick: sim.time,
            actor: healer,
            target: c,
            text: `${healer.name} treated ${c.name} on credit — ${c.name} owes ${fee} coins`,
            because: 'they could not pay',
          })
          emit(sim, 'heal', c, undefined, c.pos.x, c.pos.z)
          c.action = 'treated'
          c.intention = null
          return
        }
        if (c.wallet >= fee && needsCare) {
          c.wallet -= fee
          if (healer && staffed) healer.wallet += fee // the healer earns the fee
          c.chem.health = clamp01(c.chem.health + (staffed ? 0.45 : 0.15))
          c.illness = staffed ? 0 : clamp01(c.illness - 0.2)
          c.injury = staffed ? 0 : clamp01(c.injury - 0.2)
          c.chem.fear = clamp01(c.chem.fear - 0.1)
          applyComfort(c.chem, 0.15)
          preferPlace(c.memory, 'clinic')
          observeEvidence(c.beliefs, 'place:clinic:heals', staffed ? 1 : 0.3, 'seen', sim.time)
          if (healer && staffed) {
            applySocialEvent(c.social, healer.id, 'help', 1)
            applyPurpose(healer.chem, 0.05)
          }
          emit(sim, 'heal', c, undefined, c.pos.x, c.pos.z)
          c.action = staffed ? 'treated' : 'clinic'
          c.intention = null
        }
        return
      }
      goTo(sim, c, 'clinic')
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
        applySocialEvent(c.social, near.id, 'talk', 1)
        applySocialEvent(near.social, c.id, 'talk', 1)
        // romance spark when compatible and unpartnered
        if (c.partnerId === null && near.partnerId === null) {
          const compat = geneticCompatibility(c.genome, near.genome)
          bumpEdge(c.social, near.id, 'attraction', 0.06 * compat * c.genome.lovePropensity)
          bumpEdge(near.social, c.id, 'attraction', 0.06 * compat * near.genome.lovePropensity)
        }
        // courtship: mutual interest can turn a friendship into a partnership
        if (c.partnerId === null && near.partnerId === null) {
          const outcome = courtStep(c, near)
          if (outcome === 'partnered') {
            ensureCoupleHousehold(sim.society, c, near, sim.time)
            chronicle(sim.culture, sim.time, `${c.name} and ${near.name} became partners.`)
            recordStory(sim.stories, {
              kind: 'partnership',
              tick: sim.time,
              actor: c,
              target: near,
              text: `${c.name} and ${near.name} became partners`,
            })
            emit(sim, 'love', c, near, c.pos.x, c.pos.z)
          }
        } else if (c.partnerId === near.id) {
          ensureCoupleHousehold(sim.society, c, near, sim.time)
        }
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
        applyEmotionFeedback(near.emotions, 'forgiveness', 0.1)
        applySocialEvent(near.social, c.id, 'share', 1)
        applySocialEvent(c.social, near.id, 'share', 0.5)
        forgiveGift(near, c.id)
        observeEvent(near, 'share', c.id)
        witness(sim, c, 'share', c.id)
        recordStory(sim.stories, {
          kind: 'generosity',
          tick: sim.time,
          actor: c,
          target: near,
          text: `${c.name} gave ${gift} coins to ${near.name}, who had nothing`,
          because: explain(c, 'share'),
        })
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
  const startX = c.pos.x
  const startZ = c.pos.z
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
      // Head-on into a wall the tangent projection collapses to ~0, which
      // would pin the creature forever. Commit to walking around one side.
      if (Math.abs(along) < step * 0.4) {
        dx = slideX * step * 0.9 * c.detourSign
        dz = slideZ * step * 0.9 * c.detourSign
      } else {
        dx = slideX * along * 0.9
        dz = slideZ * along * 0.9
      }
      break
    }
  }
  c.pos.x += dx
  c.pos.z += dz
  c.facing = Math.atan2(dx, dz)
  c.action = `go ${towerId}`

  // Progress check: a creature that has not moved for a while is wedged.
  // It tries the other way around the obstacle, and eventually gives up on
  // this destination entirely so the mind can pick something reachable.
  const moved = Math.hypot(c.pos.x - startX, c.pos.z - startZ)
  if (moved < step * 0.25) {
    c.stuckTicks++
    if (c.stuckTicks === 10) c.detourSign = -c.detourSign
    if (c.stuckTicks > 26) {
      c.stuckTicks = 0
      c.goalTowerId = 'none'
      c.intention = null
      c.intentionTicks = 0
      c.action = 'lost'
    }
  } else if (c.stuckTicks > 0) {
    c.stuckTicks = Math.max(0, c.stuckTicks - 1)
  }
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
    if (!c.alive || c.sleeping) continue
    // Buildings are large and signposted: a creature notices one from a
    // distance, and sharp-eyed creatures notice from further away.
    const sight = senseRange(c.genome, 10)
    for (const t of TOWERS) {
      const d = dist(c.pos.x, c.pos.z, t.x, t.z)
      if (d <= t.radius + sight) c.learnTower(t.id)
    }
  }
}

/**
 * Directions: creatures tell each other where things are. A hungry stranger
 * who has never found the market can be pointed toward it — knowledge travels
 * through the settlement instead of appearing by magic.
 */
export function shareDirections(speaker: Creature, listener: Creature, trust: number): void {
  if (trust < -0.2) return
  for (const t of TOWERS) {
    if (!speaker.knowsTower(t.id) || listener.knowsTower(t.id)) continue
    // you mention what the other plainly needs, or simply what you know well
    const urgent =
      (t.id === 'food' && listener.chem.hunger < 0.5) ||
      (t.id === 'clinic' && listener.chem.health < 0.6) ||
      (t.id === 'homes' && listener.chem.energy < 0.4)
    if (!urgent && Math.random() > 0.25) continue
    listener.knowledge[t.id] = Math.min(1, (listener.knowledge[t.id] ?? 0) + (urgent ? 0.8 : 0.45))
    return // one useful direction per conversation
  }
}

/** The dwelling this creature calls home, if their household claimed one. */
function homeTowerFor(sim: Sim, c: Creature): TowerId | null {
  const house = householdOf(sim.society, c.id)
  if (!house) return null
  const tower = homeTowerOf(house)
  return tower && c.knowsTower(tower) ? tower : null
}

/** Is this tower known to the creature? (actions require knowledge — no omniscience) */
function knows(sim: Sim, c: Creature, towerId: string): boolean {
  void sim
  return c.knowsTower(towerId)
}

/** How many living creatures are pressed in close (privacy pressure). */
function countNeighbors(sim: Sim, c: Creature, range: number): number {
  let n = 0
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    if (dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z) <= range) n++
  }
  return n
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
    if ((sim.time + seller.id) % 2 !== 0) continue
    // calling an offer across a few paces counts — you don't need to be
    // shoulder to shoulder to hold up a loaf and name a price
    const buyer = nearestOther(sim, seller, SOCIAL_RANGE + 2)
    if (!buyer || !buyer.alive || buyer.sleeping || buyer.chem.hunger > 0.5) continue
    // Haggle: the seller's view of the buyer sets the price, and the buyer's
    // hunger sets what they think a loaf is worth. Friends get a break; a
    // known thief gets shown the door.
    const rep = getReputation(seller, buyer.id)
    const buyerValue = valueTo(sim.economy, {
      chem: buyer.chem,
      wallet: buyer.wallet,
      genome: buyer.genome,
      chemAddiction: buyer.chem.addiction,
    }, 'bread')
    const offer = negotiate(
      sim.economy,
      'bread',
      { trust: rep.trust, thief: rep.thief },
      buyer.wallet,
      buyerValue,
    )
    if (!offer.accepted) {
      if (offer.reason === 'refused-thief') {
        buyer.emotions.shame = clamp01(buyer.emotions.shame + 0.08)
        buyer.action = 'refused'
        if (sim.time % 60 === 0) {
          recordStory(sim.stories, {
            kind: 'refusal',
            tick: sim.time,
            actor: seller,
            target: buyer,
            text: `${seller.name} refused to sell to ${buyer.name}`,
            because: 'believes they are a thief',
          })
        }
      }
      continue
    }
    sim.creatureTrade(seller, buyer, offer.price)
  }
}

/**
 * Social awareness: every alive creature within OBSERVE_RANGE of the event
 * sees it happen and updates its reputation of the actor. Third-party
 * observation — a creature does not need to be the victim to judge.
 */
function witness(sim: Sim, actor: Creature, kind: Parameters<typeof observeEvent>[1], actorId: number): void {
  let seen = 0
  for (const o of sim.creatures) {
    if (o.id === actorId || !o.alive) continue
    if (dist(o.pos.x, o.pos.z, actor.pos.x, actor.pos.z) <= OBSERVE_RANGE) {
      observeEvent(o, kind, actorId)
      observeEvidence(o.beliefs, `who:${actorId}:${kind}`, 1, 'seen', sim.time)
      seen++
    }
  }
  // Public acts shift what the settlement considers normal. A theft nobody
  // sees barely dents the property norm; one in the plaza does.
  const norm = kind === 'steal' || kind === 'betray' ? 'property'
    : kind === 'aggress' ? 'nonviolence'
      : kind === 'share' || kind === 'protect' ? 'generosity'
        : null
  if (norm) {
    const violated = kind === 'steal' || kind === 'betray' || kind === 'aggress'
    witnessedAct(sim.culture, norm, violated, seen)
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
      emit(sim, 'say', c, best, c.pos.x, c.pos.z, { word: sayWord(c.language, 'danger') ?? '', concept: 'danger' })
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
    const home = householdOf(sim.society, c.id)
    for (const o of sim.creatures) {
      if (o.id === c.id || !o.alive || o.sleeping) continue
      // You do not jolt awake because the person you live with walked past.
      const familiar = o.id === c.partnerId || (home?.memberIds.includes(o.id) ?? false)
      if (familiar) continue
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
  applySocialEvent(victim.social, thief.id, bonded ? 'betray' : 'steal', 1)
  applySocialEvent(thief.social, victim.id, 'meet', 0.3)
  recordStory(sim.stories, {
    kind: bonded ? 'betrayal' : 'theft',
    tick: sim.time,
    actor: thief,
    target: victim,
    text: bonded
      ? `${thief.name} stole ${amount} coins from ${victim.name}, who trusted them`
      : `${thief.name} stole ${amount} coins from ${victim.name}`,
    because: explain(thief, 'steal'),
    weight: 1 + Math.min(0.4, amount / 12),
  })
  emit(sim, 'steal', thief, victim, victim.pos.x, victim.pos.z)
  thief.action = 'steal'
}

function fight(sim: Sim, a: Creature, b: Creature): void {
  const vigorA = vigorFor(a.stage)
  const vigorB = vigorFor(b.stage)
  const dmgA = (0.05 + (a.weapon === 'stick' ? 0.1 : 0) + a.genome.aggression * 0.04 + a.chem.strength * 0.06) * vigorA
  const dmgB = (0.05 + (b.weapon === 'stick' ? 0.1 : 0) + b.genome.aggression * 0.04 + b.chem.strength * 0.06) * vigorB
  b.hurt(dmgA)
  a.hurt(dmgB)
  // violence leaves wounds that outlast the fight and cost money to treat
  b.injury = clamp01(b.injury + dmgA * 1.5)
  a.injury = clamp01(a.injury + dmgB * 1.5)
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
  applySocialEvent(b.social, a.id, 'hurt', 1)
  applySocialEvent(a.social, b.id, defending ? 'help' : 'hurt', 0.6)
  recordStory(sim.stories, {
    kind: 'violence',
    tick: sim.time,
    actor: a,
    target: b,
    text: defending
      ? `${a.name} fought ${b.name} to protect a friend`
      : `${a.name} attacked ${b.name}`,
    because: explain(a, 'fight'),
    weight: a.weapon === 'stick' ? 1.2 : 1,
  })
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
  const alive = sim.creatures.filter((c) => c.alive).length
  if (alive >= sim.settings.populationCap) {
    a.action = 'overcrowded'
    return
  }
  const childGenome = mutate(crossover(a.genome, b.genome, sim.rng), 0.15, sim.rng)
  const child = createCreature(sim.nextId++, pickName(sim.namePool, sim.rng()), childGenome, a.pos.x + 0.8, a.pos.z + 0.8)
  child.wallet = 1
  child.parentIds = [a.id, b.id]
  sim.creatures.push(child)
  const house = ensureCoupleHousehold(sim.society, a, b, sim.time)
  adoptChild(sim.society, a, child)
  // culture crosses generations: the child starts with its parents' words,
  // places, and social leanings rather than a blank slate
  transmitCulture(a, child)
  transmitCulture(b, child)
  chronicle(sim.culture, sim.time, `${child.name} was born to ${a.name} and ${b.name}.`)
  recordStory(sim.stories, {
    kind: 'birth',
    tick: sim.time,
    actor: a,
    target: child,
    text: `${child.name} was born to ${a.name} and ${b.name}`,
  })
  // parents grow multidimensional attachment
  applySocialEvent(a.social, b.id, 'flirt', 0.5)
  applySocialEvent(b.social, a.id, 'flirt', 0.5)
  applySocialEvent(a.social, child.id, 'help', 1)
  applySocialEvent(b.social, child.id, 'help', 1)
  applySocialEvent(child.social, a.id, 'meet', 1)
  applySocialEvent(child.social, b.id, 'meet', 1)
  void house
  emit(sim, 'birth', a, b, a.pos.x, a.pos.z)
  a.action = 'birth'
  b.action = 'birth'
}

/** What actually killed this creature, as far as its own state shows. */
function causeOfDeath(dead: Creature): string {
  if (dead.injury > 0.4) return 'wounds from a fight'
  if (dead.illness > 0.3) return 'untreated illness'
  if (dead.chem.hunger < 0.1) return 'starvation'
  if (dead.age > dead.ageLimit) return 'old age'
  return 'failing health'
}

function deathText(sim: Sim, dead: Creature): string {
  const kin = sim.creatures.filter((c) => c.alive && (c.partnerId === dead.id || c.parentIds.includes(dead.id)))
  const role = dead.job ? ` the ${dead.job}` : ''
  const survivors = kin.length > 0 ? `, leaving ${kin.map((k) => k.name).join(' and ')}` : ''
  return `${dead.name}${role} died${survivors}`
}

/** A creature died — partners and close bonds mourn (grief + sadness). */
function grieve(sim: Sim, dead: Creature): void {
  chronicle(sim.culture, sim.time, `${dead.name} died at age ${dead.age}.`)
  recordStory(sim.stories, {
    kind: 'death',
    tick: sim.time,
    actor: dead,
    text: deathText(sim, dead),
    because: causeOfDeath(dead),
  })
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
      emit(sim, 'say', c, undefined, c.pos.x, c.pos.z, { word, concept })
      for (const o of sim.creatures) {
        if (o.id !== c.id && o.alive && dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z) < 12) {
          shareWithNeighbors(c.language, o.language, concept, 0.4)
        }
      }
    }
  }
}
