import { Creature } from './creature'
import type { CreatureCtx } from './creature'
import { applyFood, FOOD_EFFECTS, socialTick } from './biochem'
import { applyItem, ITEMS } from './items'
import { World } from './world'
import { applySave, buildSave, type SaveData } from './save'
import { clamp, hashSeed, mulberry32, range, type RNG } from './rng'
import { createPlayer, type PlayerState } from './player'
import { ShadowBeast } from './shadowbeast'
import { createQuestLog, questEvent, type QuestEvent, type QuestLogState } from './quests'
import { contagion, remember, updateAffinity } from './mind'
import { affinityFor } from './mind'
import { CITY_PLACES, resolveSocialEncounter, type CityPlaceId } from './city'
import { CITY_BUILDINGS, FILLER_BUILDINGS, CITY_WALL_BOUND, CITY_WORLD_SIZE, avoidCityObstacles, buildingForPlace, buildingNavigationPoint, wallBoxes } from './city-layout'
import type { ItemId } from './items'
import {
  addNpc,
  compactSociety,
  createSociety,
  deserializeSociety,
  killNpc,
  marketPrice,
  tickSociety,
  type SocialEvent,
  type SocialEventKind,
  type SocialChoice,
  type SocietyState,
  type Traits,
} from './society'

/**
 * Game — orchestrates the world + creatures into one playable simulation.
 * The renderer/worker calls tick() every frame and reads entities.
 */

export interface GameSettings {
  gentle: boolean
  /** Sim ticks between society decisions; default 12 (~0.5 Hz at 6 tps). */
  societyInterval?: number
}

/**
 * Overseer tools (SOCIETY_REBUILD.md). The player is an observer and
 * influence, never a laborer: every intervention is an inexhaustible direct
 * action on a focused citizen — it never draws from or adds to an inventory.
 */
export type OverseerTool = 'stick' | 'whip' | 'heal' | 'feed' | 'comfort' | 'amuse'

export interface GameView {
  world: World
  creatures: Creature[]
  time: number
  nextId: number
  settings: GameSettings
}

export interface SocietyEventView {
  tick: number
  kind: SocialEventKind
  actor: string
  target: string | null
  item?: string
  amount?: number
  money?: number
  direction?: 'buy' | 'sell'
}

export interface SocietySummary {
  population: number
  alive: number
  market: { item: string; stock: number; maxStock: number; price: number }[]
  bonds: { a: number; b: number; trust: number }[]
  fears: { a: number; b: number; fear: number }[]
  recentEvents: SocietyEventView[]
}

export interface SocietyProfile {
  id: number
  name: string
  alive: boolean
  wallet: number
  inventory: Record<string, number>
  traits: Traits
  lastChoice: SocialEventKind | null
  relationships: {
    otherId: number
    otherName: string
    trust: number
    attachment: number
    love: number
    betrayal: number
    fear: number
  }[]
}

/** Fights only land when the pair is this close (meters). */
const SOCIETY_FIGHT_RANGE = 4
/** Min sim ticks between one actor's applied society fights (damage throttle). */
const SOCIETY_FIGHT_COOLDOWN = 180

/** Self-service market: finite stocks, scarcity-driven prices, no staff. */
function createDefaultSociety(): SocietyState {
  return createSociety({
    fightKillChance: 0, // death stays permanent but never via random instant kill
    marketStocks: { berry: 24, bread: 10, medicine: 6, wood: 12 },
    marketMaxStocks: { berry: 24, bread: 10, medicine: 6, wood: 12 },
    marketBasePrices: { berry: 1, bread: 3, medicine: 5, wood: 2 },
  })
}

/** Map a creature's physiology/psychology onto society trait priors. */
function societyTraitsFor(c: Creature): Partial<Traits> {
  return {
    trust: clamp(c.psyche.trust, 0, 1),
    attachment: clamp(0.2 + c.traits.sociability * 0.5, 0, 1),
    love: clamp(0.1 + c.traits.sociability * 0.4, 0, 1),
    betrayal: clamp(0.05 + (1 - c.traits.sociability) * 0.3, 0, 1),
    fear: clamp(c.psyche.baselineFear ?? 0.2, 0, 1),
    greed: clamp(0.2 + c.traits.aggression * 0.4, 0, 1),
  }
}

export class Game {
  world: World
  creatures: Creature[] = []
  player: PlayerState
  shadowBeasts: ShadowBeast[] = []
  quests: QuestLogState
  society: SocietyState
  time = 0
  nextId = 1
  settings: GameSettings = { gentle: false }
  rng: RNG
  private societyRng: RNG
  private societyTimer = 0
  private societyInterval: number
  private breedCooldown = 0
  private shadowSpawnTimer = 0
  private beastNextId = 1
  private beastAttackCooldown = new Map<number, number>()
  private socialFightCooldown = new Map<string, number>()
  private societyFightCooldown = new Map<number, number>()

  constructor(seed: number, size = CITY_WORLD_SIZE, settings?: GameSettings) {
    this.world = new World(seed, size)
    this.installCityCollision()
    this.seedCityFood()

    this.rng = mulberry32(seed)
    if (settings) this.settings = settings
    this.societyInterval = settings?.societyInterval ?? 12
    this.societyRng = mulberry32(hashSeed('society-' + seed))
    this.society = createDefaultSociety()
    this.player = createPlayer({ x: 0, z: 0 })
    this.quests = createQuestLog()
  }

  /**
   * Scatter berry bushes through the old city so citizens can forage.
   * The world owns the plant simulation (regrow, eat, save/load); the game
   * is responsible for making food exist in reachable street/park spots.
   * Idempotent: never re-seeds a world that already has plants (e.g. loaded saves).
   */
  private seedCityFood(): void {
    if (this.world.state.plants.length > 0) return
    const spots = [
      { x: 0, z: -22 }, // spawn street
      { x: 0, z: -17 }, // south of the mid row
      { x: -8, z: -20 },
      { x: 8, z: -20 },
      { x: 0, z: -26 }, // Ashen Park
      { x: -8, z: -32 },
      { x: -28, z: 24 }, // Old Market
      { x: 32, z: -34 }, // Apothecary
      { x: 36, z: 24 }, // Lantern Row
      { x: 0, z: 40 }, // Old Watch
      { x: -12, z: 2 },
      { x: 12, z: 2 },
    ]
    spots.forEach((spot, i) => {
      const pos = this.world.resolveCollision(spot, 0.5)
      this.world.state.plants.push({ id: i + 1, pos, berries: 3, regrow: 0 })
    })
  }

  private installCityCollision(): void {
    this.world.clearColliders()
    for (const building of [...CITY_BUILDINGS, ...FILLER_BUILDINGS]) {
      for (const wall of wallBoxes(building)) this.world.addBoxCollider(wall.x, wall.z, wall.hx, wall.hz)
    }
    this.world.addBoxCollider(0, -CITY_WALL_BOUND, CITY_WALL_BOUND, 1)
    this.world.addBoxCollider(0, CITY_WALL_BOUND, CITY_WALL_BOUND, 1)
    this.world.addBoxCollider(-CITY_WALL_BOUND, 0, 1, CITY_WALL_BOUND)
    this.world.addBoxCollider(CITY_WALL_BOUND, 0, 1, CITY_WALL_BOUND)
  }

  spawnInitial(count = 5): void {
    this.player.pos = { x: 0, z: -14 }
    for (let i = 0; i < count; i++) {
      const c = new Creature(null, this.rng, this.nextId++, 0)
      const streetX = (i - (count - 1) / 2) * 2.8
      c.pos = this.world.resolveCollision(
        { x: streetX + range(this.rng, -0.25, 0.25), z: -20 - (i % 2) * 1.4 + range(this.rng, -0.2, 0.2) },
        0.5,
      )
      c.facing = Math.PI / 2
      this.creatures.push(c)
      c.log('arrives in the old city')
    }
    this.syncSocietyNpcs()
  }

  /** Fire a gameplay event into the quest engine. */
  emit(kind: QuestEvent, amount = 1): string[] {
    return questEvent(this.quests, kind, amount)
  }

  private proximity(pos: { x: number; z: number }, find: () => { x: number; z: number } | null, max = 12): number {
    const t = find()
    if (!t) return 0
    const d = Math.hypot(t.x - pos.x, t.z - pos.z)
    if (d >= max) return 0
    return 1 - d / max
  }

  private ctxFor(c: Creature, bondFear = 0): CreatureCtx {
    const self = c
    return {
      rng: this.rng,
      foodNear: this.proximity(self.pos, () => this.world.nearestFood(self.pos)),
      waterNear: this.proximity(self.pos, () => this.world.nearestWater(self.pos)),
      creatureNear: this.proximity(self.pos, () => this.world.nearestCreature(self.pos, this.creatures, self.id), 8),
      dangerNear: this.world.dangerAt(self.pos, this.world.state.dayTime),
      playerNear: this.proximity(self.pos, () => this.player.pos, 12),
      day: this.world.state.dayTime,
      time: this.time,
      gentle: this.settings.gentle,
      bondFear,
      societyIntent: c.societyIntent,
      findFood: () => this.world.nearestFood(self.pos, 300),
      findWater: () => this.world.nearestWater(self.pos, 300),
      findFriend: () => this.world.nearestCreature(self.pos, this.creatures, self.id),
      resolveCollision: (p, r) => this.world.resolveCollision(p, r),
      discoverPlaces: (p) => CITY_PLACES.filter((place) => Math.hypot(place.pos.x - p.x, place.pos.z - p.z) <= place.radius + 3),
      findPlace: (id) => CITY_PLACES.find((place) => place.id === id) ?? null,
      navigatePlace: (id, pos) => {
        const place = CITY_PLACES.find((candidate) => candidate.id === id)
        if (!place) return null
        const building = buildingForPlace(id)
        const destination = building ? buildingNavigationPoint(building, pos) : place.pos
        return avoidCityObstacles(pos, destination, building?.id)
      },
      navigateTarget: (from, target) => avoidCityObstacles(from, target),
      usePlace: (_id, preferred) => preferred && preferred in ITEMS ? ITEMS[preferred as ItemId] : null,
      eatAt: (p) => {
        const fx = this.world.eatAt(p)
        if (fx) remember(self.mind, 'food', p, 1, 0.6, self.age)
        return fx
      },
    }
  }

  /** Advance the sim by one tick. */
  tick(): void {
    this.time++
    this.world.tick()
    const dayTime = this.world.state.dayTime
    const night = dayTime > 0.72 || dayTime < 0.1

    // social bonds: proximity builds friendship; friends share fear
    const bondFear = new Map<number, number>()
    for (let i = 0; i < this.creatures.length; i++) {
      for (let j = i + 1; j < this.creatures.length; j++) {
        const a = this.creatures[i]
        const b = this.creatures[j]
        if (!a.alive || !b.alive) continue
        const d = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z)
        if (d < 5) {
          const delta = 0.004 * (1 - d / 5)
          updateAffinity(a.mind, b.id, delta)
          updateAffinity(b.mind, a.id, delta)
          const aFear = contagion(a.mind, b.id, b.chem.fear)
          const bFear = contagion(b.mind, a.id, a.chem.fear)
          bondFear.set(a.id, (bondFear.get(a.id) ?? 0) + aFear)
          bondFear.set(b.id, (bondFear.get(b.id) ?? 0) + bFear)

          if (d < 1.8 && a.urban.socialCooldown <= 0 && b.urban.socialCooldown <= 0 && this.time % 30 === (a.id + b.id) % 30) {
            const outcome = resolveSocialEncounter(a.urban, b.urban, affinityFor(a.mind, b.id), this.rng)
            a.urban.socialCooldown = 90
            b.urban.socialCooldown = 90
            if (outcome === 'share' && b.urban.carriedItem) {
              const shared = b.urban.carriedItem
              const item = ITEMS[shared as ItemId]
              if (item) b.giveItem(item, false)
              b.urban.carriedItem = null
              updateAffinity(a.mind, b.id, 0.12)
              updateAffinity(b.mind, a.id, 0.12)
              a.log(`shares ${item?.name ?? shared} with ${b.name}`)
              b.log(`${a.name} shares ${item?.name ?? shared}`)
            } else if (outcome === 'fight' && !this.settings.gentle) {
              // Fights are throttled per pair (~240 ticks) and land bounded
              // harm (0.008 + anger*0.012) so brawls create fear, pain and
              // relationship damage without grinding anyone down quickly.
              const pairKey = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`
              const lastFight = this.socialFightCooldown.get(pairKey) ?? -9999
              if (this.time - lastFight < 240) {
                socialTick(a.chem)
                socialTick(b.chem)
                updateAffinity(a.mind, b.id, 0.018)
                updateAffinity(b.mind, a.id, 0.018)
              } else {
                this.socialFightCooldown.set(pairKey, this.time)
                const harmA = 0.008 + Math.max(0, b.urban.emotions.anger) * 0.012
                const harmB = 0.008 + Math.max(0, a.urban.emotions.anger) * 0.012
                a.chem.health = clamp(a.chem.health - harmA, 0, 1)
                b.chem.health = clamp(b.chem.health - harmB, 0, 1)
                a.chem.pain = clamp(a.chem.pain + 0.25, 0, 1)
                b.chem.pain = clamp(b.chem.pain + 0.25, 0, 1)
                updateAffinity(a.mind, b.id, -0.18)
                updateAffinity(b.mind, a.id, -0.18)
                a.log(`fights with ${b.name}`)
                b.log(`fights with ${a.name}`)
                for (const witness of this.creatures) {
                  if (witness.id !== a.id && witness.id !== b.id && Math.hypot(witness.pos.x - a.pos.x, witness.pos.z - a.pos.z) < 5) {
                    witness.chem.fear = clamp(witness.chem.fear + 0.12, 0, 1)
                  }
                }
              }
            } else if (outcome === 'talk') {
              socialTick(a.chem)
              socialTick(b.chem)
              updateAffinity(a.mind, b.id, 0.018)
              updateAffinity(b.mind, a.id, 0.018)
              if (this.time % 180 < 30) {
                a.log(`talks with ${b.name}`)
                b.log(`talks with ${a.name}`)
              }
            }
          }
        }
      }
    }

    for (const c of this.creatures) {
      if (!c.alive) continue
      // adult milestone for quests
      if (c.age === 600) this.emit('adult', 1)
      // carried creatures stay put (brain still thinks, body frozen in hand)
      if (this.carriedId === c.id) {
        const savePos = { ...c.pos }
        c.tick(this.ctxFor(c, bondFear.get(c.id) ?? 0))
        c.pos = savePos
        continue
      }
      c.tick(this.ctxFor(c, bondFear.get(c.id) ?? 0))
    }
    this.restorePersonalSpace()
    this.tickShadows(night)
    this.maybeBreed()
    if (this.breedCooldown > 0) this.breedCooldown--
    this.stepSociety()
    // deaths are permanent on both sides and sync immediately, not just on
    // the throttled society cadence (O(N), N ≤ 20)
    this.syncSocietyNpcs()
    // sanity: recovers near home/den, drains in the night dark
    const nearDen = Math.hypot(this.player.pos.x - this.world.state.den.x, this.player.pos.z - this.world.state.den.z) < 8
    const torchSafe = this.player.torchLit
    if (nearDen || !night) this.player.sanity = clamp(this.player.sanity + 0.001, 0, 1)
    else if (!torchSafe) this.player.sanity = clamp(this.player.sanity - 0.0006, 0, 1)
  }

  private restorePersonalSpace(): void {
    const minimum = 1.8
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < this.creatures.length; i++) {
        const a = this.creatures[i]
        if (!a.alive || this.carriedId === a.id) continue
        for (let j = i + 1; j < this.creatures.length; j++) {
          const b = this.creatures[j]
          if (!b.alive || this.carriedId === b.id) continue
          let dx = b.pos.x - a.pos.x
          let dz = b.pos.z - a.pos.z
          let distance = Math.hypot(dx, dz)
          if (distance >= minimum) continue
          if (distance < 0.0001) {
            const angle = ((a.id * 37 + b.id * 71) % 360) * Math.PI / 180
            dx = Math.cos(angle)
            dz = Math.sin(angle)
            distance = 1
          }
          const push = (minimum - distance) / 2
          const nx = dx / distance
          const nz = dz / distance
          a.pos = this.world.resolveCollision({ x: a.pos.x - nx * push, z: a.pos.z - nz * push }, 0.5)
          b.pos = this.world.resolveCollision({ x: b.pos.x + nx * push, z: b.pos.z + nz * push }, 0.5)
        }
      }
    }
  }

  /**
   * Keep one society NPC per Creature, ids matching. Births/loads create
   * missing NPCs (traits seeded from the creature); deaths are permanent on
   * both sides — a dead creature's NPC is killed (natural, no killer).
   */
  private syncSocietyNpcs(): void {
    for (const c of this.creatures) {
      const npc = this.society.npcs[c.id]
      if (!npc) {
        addNpc(this.society, {
          id: c.id,
          name: c.name,
          wallet: c.alive ? this.society.config.startingWallet : 0,
          traits: societyTraitsFor(c),
        })
      }
      if (!c.alive && this.society.npcs[c.id]?.alive) killNpc(this.society, c.id)
    }
  }

  /**
   * Throttled society step (~0.5 Hz at 6 tps). Runs the economy kernel with
   * local positions, maps transactions into creature needs, applies visible
   * movement intents, and re-syncs deaths caused by the step.
   */
  private stepSociety(): void {
    this.societyTimer++
    if (this.societyTimer < this.societyInterval) return
    this.societyTimer = 0
    this.syncSocietyNpcs()
    const positions: Record<number, { x: number; z: number }> = {}
    for (const c of this.creatures) if (c.alive) positions[c.id] = { x: c.pos.x, z: c.pos.z }
    const events = tickSociety(this.society, this.societyRng, { positions })
    this.applySocietyEvents(events, positions)
    this.syncSocietyNpcs()
  }

  /** Map society events onto creatures: needs, damage, and visible intents. */
  private applySocietyEvents(events: SocialEvent[], positions: Record<number, { x: number; z: number }>): void {
    for (const c of this.creatures) c.societyIntent = null
    for (const ev of events) {
      if (ev.kind === 'death' || ev.kind === 'hoard') continue
      const actor = this.creatures.find((c) => c.id === ev.actorId && c.alive)
      if (!actor) continue

      if (ev.kind === 'trade' && ev.direction === 'buy' && ev.item) {
        this.consumeSocietyItem(actor, ev.item)
      } else if (ev.kind === 'share' && ev.amount && ev.item && ev.targetId !== null) {
        const target = this.creatures.find((c) => c.id === ev.targetId && c.alive)
        if (target) this.consumeSocietyItem(target, ev.item)
      } else if (ev.kind === 'cooperate' && ev.targetId !== null) {
        const target = this.creatures.find((c) => c.id === ev.targetId && c.alive)
        if (target) socialTick(target.chem)
        socialTick(actor.chem)
      } else if (ev.kind === 'fight') {
        this.applySocietyFight(actor, ev)
      }

      // visible intent: follow/flee/approach the society partner
      const targetPos = ev.targetId !== null ? positions[ev.targetId] : null
      if (targetPos) actor.societyIntent = { choice: ev.kind as SocialChoice, targetPos }
    }
  }

  /** Fight damage flows through the existing physiology system (flat-bounded, throttled, never instant-kill). */
  private applySocietyFight(actor: Creature, ev: SocialEvent): void {
    if (ev.targetId === null) return
    const target = this.creatures.find((c) => c.id === ev.targetId && c.alive)
    if (!target || target === actor) return
    // a per-actor cooldown stops repeated utility fights from grinding the
    // population down: damage lands at most once every 180 sim ticks per actor
    const lastFight = this.societyFightCooldown.get(actor.id) ?? -9999
    if (this.time - lastFight < SOCIETY_FIGHT_COOLDOWN) return
    // only lands once the pair is close — the attacker's approach intent closes the gap
    if (Math.hypot(target.pos.x - actor.pos.x, target.pos.z - actor.pos.z) > SOCIETY_FIGHT_RANGE) return
    this.societyFightCooldown.set(actor.id, this.time)
    // flat-bounded damage: 0.02 base + up to 0.02 from the target's anger, so
    // even a prolonged brawl costs a bounded sliver of health, never a kill
    const harm = 0.02 + Math.max(0, target.urban.emotions.anger ?? 0) * 0.02
    target.chem.health = clamp(target.chem.health - harm, 0, 1)
    target.chem.pain = clamp(target.chem.pain + 0.25, 0, 1)
    target.chem.fear = clamp(target.chem.fear + 0.25, 0, 1)
    updateAffinity(target.mind, actor.id, -0.18)
    updateAffinity(actor.mind, target.id, -0.12)
    target.log(`fights with ${actor.name}`)
    actor.log(`fights with ${target.name}`)
    for (const w of this.creatures) {
      if (w.alive && w.id !== actor.id && w.id !== target.id && Math.hypot(w.pos.x - target.pos.x, w.pos.z - target.pos.z) < 5) {
        w.chem.fear = clamp(w.chem.fear + 0.08, 0, 1)
      }
    }
  }

  /**
   * A society purchase/share is consumed by the creature: food/medicine map
   * into the existing need chemistry, and the society inventory entry is
   * decremented so the work-earn-buy loop keeps going.
   */
  private consumeSocietyItem(c: Creature, itemId: string): void {
    const npc = this.society.npcs[c.id]
    if (npc && (npc.inventory.items[itemId] ?? 0) > 0) {
      npc.inventory.items[itemId] = (npc.inventory.items[itemId] ?? 0) - 1
    }
    if (itemId === 'berry') {
      applyFood(c.chem, FOOD_EFFECTS.berry)
    } else if (itemId === 'bread') {
      c.chem = applyItem(c.chem, ITEMS.bread).chem
    } else if (itemId === 'medicine') {
      c.chem = applyItem(c.chem, ITEMS.medicine).chem
    }
  }

  private tickShadows(night: boolean): void {
    if (this.settings.gentle) {
      this.shadowSpawnTimer = 0
      this.shadowBeasts = []
      return
    }
    if (night) {
      this.shadowSpawnTimer++
      if (this.shadowSpawnTimer > 200 && this.shadowBeasts.length < 3) {
        this.shadowSpawnTimer = 0
        const alive = this.creatures.filter((creature) => creature.alive)
        const anchor = alive[Math.floor(this.rng() * alive.length)]?.pos ?? { x: 0, z: 0 }
        const ang = this.rng() * Math.PI * 2
        const dist = 24
        const x = Math.max(-CITY_WALL_BOUND + 3, Math.min(CITY_WALL_BOUND - 3, anchor.x + Math.cos(ang) * dist))
        const z = Math.max(-CITY_WALL_BOUND + 3, Math.min(CITY_WALL_BOUND - 3, anchor.z + Math.sin(ang) * dist))
        this.shadowBeasts.push(new ShadowBeast(this.beastNextId++, { x, z }))
      }
    } else {
      this.shadowSpawnTimer = 0
      this.shadowBeasts = []
      return
    }
    const torchLit = this.player.torchLit
    const beasts = this.shadowBeasts
    this.shadowBeasts = []
    for (const b of beasts) {
      const torchNear = torchLit && Math.hypot(b.state.pos.x - this.player.pos.x, b.state.pos.z - this.player.pos.z) < 8
      const events = b.tick({
        creatures: this.creatures.map((c) => ({ id: c.id, pos: c.pos, alive: c.alive, fear: c.chem.fear })),
        playerPos: this.player.pos,
        torchNear,
        dayTime: this.world.state.dayTime,
      })
      if (events.includes('dissolve')) continue
      if (events.includes('attack')) {
        // Beasts are dangerous but not instant shredders: a single beast may
        // wound at most once per minute of sim time, so a cornered citizen
        // survives a night (and can flee/heal) instead of dying in seconds.
        const lastAttack = this.beastAttackCooldown.get(b.state.id) ?? -9999
        if (this.time - lastAttack >= 60) {
          this.beastAttackCooldown.set(b.state.id, this.time)
          // wound the nearest creature + scare it
          let best: Creature | null = null
          let bd = 3
          for (const c of this.creatures) {
            if (!c.alive) continue
            const d = Math.hypot(c.pos.x - b.state.pos.x, c.pos.z - b.state.pos.z)
            if (d < bd) {
              bd = d
              best = c
            }
          }
          if (best) {
            best.chem.fear = clamp(best.chem.fear + 0.5, 0, 1)
            best.chem.health = clamp(best.chem.health - 0.01, 0, 1)
            best.log('is terrified by a Shadow Beast!')
          }
        }
      }
      // fear spreads to nearby creatures
      for (const c of this.creatures) {
        if (!c.alive) continue
        const d = Math.hypot(c.pos.x - b.state.pos.x, c.pos.z - b.state.pos.z)
        if (d < 6) c.chem.fear = clamp(c.chem.fear + 0.02, 0, 1)
      }
      this.shadowBeasts.push(b)
    }
    // repel event: any beast in flee state near the torch counts once
    if (torchLit && this.shadowBeasts.some((b) => b.state.state === 'flee')) {
      this.emit('repelShadow', 1)
    }
  }

  private maybeBreed(): void {
    if (this.breedCooldown > 0) return
    const adults = this.creatures.filter((c) => c.alive && c.age > 400 && c.chem.health > 0.5)
    if (adults.length < 2) return
    // pair the two adults that are closest
    let bestPair: [Creature, Creature] | null = null
    let bestD = Infinity
    for (let i = 0; i < adults.length; i++) {
      for (let j = i + 1; j < adults.length; j++) {
        const d = Math.hypot(adults[i].pos.x - adults[j].pos.x, adults[i].pos.z - adults[j].pos.z)
        if (d < bestD) {
          bestD = d
          bestPair = [adults[i], adults[j]]
        }
      }
    }
    if (!bestPair || bestD > 10) return
    const [a, b] = bestPair
    const genome = a.breedWith(b, this.rng)
    if (genome) {
      const child = new Creature(genome, this.rng, this.nextId++, 0)
      child.pos = { x: a.pos.x + range(this.rng, -1, 1), z: a.pos.z + range(this.rng, -1, 1) }
      child.log('is born')
      this.creatures.push(child)
      this.syncSocietyNpcs()
      this.breedCooldown = 300
      this.emit('birth', 1)
    }
  }

  teach(creatureId: number, word: string, kind: 'food' | 'water' | 'come'): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    c.teachWord(word, kind)
    this.emit('teach', 1)
    return true
  }

  carriedId: number | null = null

  setCarried(id: number | null): void {
    if (id !== null && !this.creatures.some((c) => c.id === id && c.alive)) return
    this.carriedId = id
  }

  /** Pick up an item into the player's inventory. */
  pickupItem(itemId: string): boolean {
    const inv = this.player.inventory.items
    inv[itemId] = (inv[itemId] ?? 0) + 1
    return true
  }

  /** Give an item to a creature from the player's inventory. */
  giveItem(creatureId: number, itemId: string): { ok: boolean; msg: string } {
    const item = ITEMS[itemId as keyof typeof ITEMS]
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!item || !c) return { ok: false, msg: 'Nothing happened.' }
    const inv = this.player.inventory.items
    const count = inv[itemId] ?? 0
    if (count <= 0) return { ok: false, msg: `No ${item.name} left — learn which city district supplies it.` }
    const result = c.giveItem(item)
    inv[itemId] = count - 1
    if (result?.toxic) {
      this.emit('poisoned', 1)
      return { ok: true, msg: `${c.name} sickens from the ${result.label}…` }
    }
    this.emit(item.healthy ? 'feed' : 'gaveItem', 1)
    return { ok: true, msg: result ? `${c.name} ${result.trustDelta >= 0 ? 'brightens' : 'sours'} at the ${result.label}.` : `${c.name} can't respond.` }
  }

  /** Terrorise a creature — trauma, fear, trust loss. */
  scareCreature(creatureId: number, trigger: 'player' | 'fire' | 'noise' = 'player'): { ok: boolean; msg: string } {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return { ok: false, msg: 'Gone.' }
    const intensity = trigger === 'fire' ? 0.8 : trigger === 'noise' ? 0.55 : 0.7
    c.scare(trigger, intensity, trigger === 'fire' ? 'the naked flame' : trigger === 'noise' ? 'your sudden shout' : 'your looming hand')
    this.emit('terrorised', 1)
    return { ok: true, msg: `${c.name} cowers in terror. It will remember this.` }
  }

  /** Dropping a carried creature while it is scared wounds its trust badly. */
  dropCarried(): { ok: boolean; msg: string } {
    if (this.carriedId == null) return { ok: false, msg: 'Not carrying anyone.' }
    const c = this.creatures.find((x) => x.id === this.carriedId && x.alive)
    this.carriedId = null
    if (!c) return { ok: false, msg: 'The air is empty.' }
    if (c.chem.fear > 0.5 || c.psyche.memories.length > 0) {
      c.scare('drop', 0.7, 'falling from your hands')
      return { ok: true, msg: `${c.name} tumbles and panics — falling is now a fear.` }
    }
    c.chem.pain = clamp(c.chem.pain + 0.25, 0, 1)
    c.psyche.trust = clamp(c.psyche.trust - 0.12, 0, 1)
    c.log('is dropped — ouch!')
    return { ok: true, msg: `${c.name} lands with a thud.` }
  }

  /** Hand-feed a creature a berry (instant effect — no world drop). */
  feed(creatureId: number): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    applyFood(c.chem, FOOD_EFFECTS.berry)
    c.brain.reinforce(0.6)
    c.log('is hand-fed')
    this.emit('feed', 1)
    return true
  }

  /** Greet without demanding obedience — a low-pressure social interaction. */
  greet(creatureId: number): { ok: boolean; msg: string } {
    const c = this.creatures.find((candidate) => candidate.id === creatureId && candidate.alive)
    if (!c) return { ok: false, msg: 'No one answers.' }
    c.chem.pleasure = clamp(c.chem.pleasure + .12, 0, 1)
    c.chem.loneliness = clamp(c.chem.loneliness - .18, 0, 1)
    c.psyche.trust = clamp(c.psyche.trust + .025, 0, 1)
    c.log('exchanges a friendly greeting with you')
    this.emit('meetCitizen', 1)
    return { ok: true, msg: `${c.name} ${c.chem.fear > .55 ? 'answers cautiously' : 'greets you warmly'}.` }
  }

  /** Tickle — pleasure + positive reinforcement. */
  tickle(creatureId: number): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    c.chem.pleasure = clamp(c.chem.pleasure + 0.3, 0, 1)
    c.brain.reinforce(0.4)
    c.log('giggles at a tickle')
    return true
  }

  /**
   * Apply one overseer tool to a focused living citizen (SOCIETY_REBUILD.md).
   * Tools are inexhaustible observer actions — never inventory. Beneficial
   * tools ease needs and build trust; stick/whip deal bounded harm, fear,
   * pain and trust loss (whip stronger), and repeated explicit cruelty can
   * kill permanently. Nearby living witnesses within 7m learn kindness or
   * cruelty through their psyche trust/fear.
   */
  useOverseerTool(creatureId: number, tool: OverseerTool): { ok: boolean; msg: string } {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return { ok: false, msg: 'No one is there.' }
    switch (tool) {
      case 'feed': {
        applyFood(c.chem, FOOD_EFFECTS.berry)
        c.psyche.trust = clamp(c.psyche.trust + 0.06, 0, 1)
        c.brain.reinforce(0.6)
        c.log('is hand-fed by you')
        this.emit('feed', 1)
        this.teachWitnesses(c, 'kind')
        return { ok: true, msg: `${c.name} eats and brightens. Hunger fades; trust grows.` }
      }
      case 'heal': {
        const wasHurt = c.chem.health < 0.85 || c.chem.pain > 0.3
        c.chem.health = clamp(c.chem.health + (wasHurt ? 0.3 : 0.06), 0, 1)
        c.chem.pain = clamp(c.chem.pain - 0.4, 0, 1)
        c.chem.fear = clamp(c.chem.fear - 0.15, 0, 1)
        c.psyche.trust = clamp(c.psyche.trust + (wasHurt ? 0.12 : 0.03), 0, 1)
        c.log(wasHurt ? 'is healed by you' : 'is soothed by your care')
        this.teachWitnesses(c, 'kind')
        return { ok: true, msg: wasHurt ? `${c.name} breathes easier — wounds and pain ease.` : `${c.name} feels your care, even without injury.` }
      }
      case 'comfort': {
        c.chem.fear = clamp(c.chem.fear - 0.3, 0, 1)
        c.chem.loneliness = clamp(c.chem.loneliness - 0.35, 0, 1)
        c.chem.pleasure = clamp(c.chem.pleasure + 0.15, 0, 1)
        c.psyche.trust = clamp(c.psyche.trust + 0.08, 0, 1)
        c.log('is comforted by you')
        this.teachWitnesses(c, 'kind')
        return { ok: true, msg: `${c.name} calms in your presence. Fear and loneliness ease.` }
      }
      case 'amuse': {
        c.chem.boredom = clamp(c.chem.boredom - 0.4, 0, 1)
        c.chem.loneliness = clamp(c.chem.loneliness - 0.2, 0, 1)
        c.chem.pleasure = clamp(c.chem.pleasure + 0.3, 0, 1)
        c.psyche.trust = clamp(c.psyche.trust + 0.05, 0, 1)
        c.brain.reinforce(0.4)
        c.log('giggles at your play')
        this.teachWitnesses(c, 'kind')
        return { ok: true, msg: `${c.name} laughs and forgets the dull moment.` }
      }
      case 'stick': {
        // Bounded intimidation: modest harm, real pain/fear, eroded trust.
        c.chem.health = clamp(c.chem.health - 0.03, 0, 1)
        c.chem.pain = clamp(c.chem.pain + 0.18, 0, 1)
        c.chem.fear = clamp(c.chem.fear + 0.22, 0, 1)
        c.psyche.trust = clamp(c.psyche.trust - 0.12, 0, 1)
        c.scare('player', 0.24, 'your raised stick')
        this.emit('terrorised', 1)
        this.teachWitnesses(c, 'cruel')
        return { ok: true, msg: `${c.name} flinches — pain and fear, and trust in you fades. Witnesses remember.` }
      }
      case 'whip': {
        // Severe fear/pain/trust loss with bounded per-blow health harm.
        // There is no separate cruelty counter: repeated lashing simply
        // accumulates the health damage until health reaches zero — only
        // repeated explicit cruelty can end a life, and it does so through
        // the ordinary health/death path.
        c.chem.health = clamp(c.chem.health - 0.07, 0, 1)
        c.chem.pain = clamp(c.chem.pain + 0.35, 0, 1)
        c.chem.fear = clamp(c.chem.fear + 0.4, 0, 1)
        c.psyche.trust = clamp(c.psyche.trust - 0.25, 0, 1)
        c.scare('player', 0.7, 'your whip')
        this.emit('terrorised', 1)
        this.teachWitnesses(c, 'cruel')
        if (c.chem.health <= 0) {
          if (this.settings.gentle) {
            c.chem.health = 0.05
          } else {
            c.die('cruelty')
            this.syncSocietyNpcs()
            return { ok: true, msg: `${c.name} collapses under the lash and does not rise. The city will remember this.` }
          }
        }
        return { ok: true, msg: `${c.name} recoils in pain and terror. Trust in you collapses.` }
      }
    }
  }

  /** Nearby living witnesses (within 7m) learn kindness or cruelty through their psyche trust/fear. */
  private teachWitnesses(target: Creature, kind: 'kind' | 'cruel'): void {
    for (const w of this.creatures) {
      if (w.id === target.id || !w.alive) continue
      if (Math.hypot(w.pos.x - target.pos.x, w.pos.z - target.pos.z) > 7) continue
      if (kind === 'kind') {
        w.psyche.trust = clamp(w.psyche.trust + 0.03, 0, 1)
        w.chem.fear = clamp(w.chem.fear - 0.05, 0, 1)
        remember(w.mind, 'player-kind', w.pos, 0.4, 0.4, w.age)
        w.log(`sees kindness shown to ${target.name} — trust in you grows`)
      } else {
        w.psyche.trust = clamp(w.psyche.trust - 0.06, 0, 1)
        w.chem.fear = clamp(w.chem.fear + 0.12, 0, 1)
        remember(w.mind, 'player-cruel', w.pos, -0.6, 0.6, w.age)
        w.log(`watches cruelty done to ${target.name} — fear of you grows`)
      }
    }
  }

  /** React to a spoken word near a creature (player "speaks"). */
  speak(creatureId: number, word: string): boolean {
    const c = this.creatures.find((x) => x.id === creatureId && x.alive)
    if (!c) return false
    // If they know it, they respond; otherwise it's a teaching moment.
    const known = c.reactToWord(word)
    if (!known && word.trim().length > 0) {
      c.teachWord(word, 'come')
      return true
    }
    return known
  }

  /**
   * Inspect a named city district. Informational only (SOCIETY_REBUILD.md):
   * the observer reads what a place is for and who it serves — the player
   * never collects goods from buildings, so this never touches inventory.
   */
  visitPlace(placeId: CityPlaceId): { ok: boolean; msg: string } {
    const place = CITY_PLACES.find((candidate) => candidate.id === placeId)
    if (!place) return { ok: false, msg: 'That place is not part of the city.' }
    const observerNotes: Partial<Record<CityPlaceId, string>> = {
      market: 'Open bazaar vending tables — citizens buy, sell and trade here. Stocks are finite and prices rise as they fall.',
      tavern: 'Crooked Cup tap wall — a coin-operated pour. Short relief, dependence, and a cost to judgment and health.',
      apothecary: 'Saint Orra remedy cabinet — pay for treatment. Citizens seek it when hurt.',
      'back-alley': 'Moth Alley — dangerous substances traded in shadow. Severe dependence and health damage.',
      park: 'Ashen Garden and fountain — free water, calm and company for every citizen.',
      homes: 'Lantern Row lodging alcoves — pay for rest in a shared shelter. Fatigue and fear ease here.',
      watch: 'Brass Weigh-House — deposit, withdraw and ledger kiosk. Currency stays safe; no authority rules here.',
      hospital: 'Mercy House remedy cabinet — pay for treatment. Citizens seek it when hurt.',
      restaurant: 'Hearth Kitchen bread oven — pay for a hot meal.',
    }
    const note = observerNotes[placeId]
    return { ok: true, msg: note ? `${place.name}: ${note}` : `${place.name}: ${place.purpose}.` }
  }

  selectedCreature(id: number): Creature | null {
    return this.creatures.find((c) => c.id === id) ?? null
  }

  save(): SaveData {
    const data = buildSave(
      this.world,
      this.creatures,
      this.settings,
      this.nextId,
      this.time,
      { pos: { ...this.player.pos }, facingYaw: this.player.facingYaw, inventory: { ...this.player.inventory, items: { ...this.player.inventory.items } as Record<string, number> }, torchLit: this.player.torchLit, sanity: this.player.sanity },
      { active: this.quests.active, progress: { ...this.quests.progress }, completed: [...this.quests.completed], unlocked: [...this.quests.unlocked] },
      this.shadowBeasts.map((b) => ({ id: b.state.id, pos: { ...b.state.pos }, state: b.state.state, health: b.state.health, targetId: b.state.targetId })),
      this.beastNextId,
    )
    // society serializes into extra, aggressively compacted (events capped,
    // floats rounded, market maps reconstructed from market on load)
    data.extra = {
      carriedId: this.carriedId ?? undefined,
      society: compactSociety(this.society, 4),
    } as any
    return data
  }

  load(data: SaveData): void {
    const legacyValley = data.creatures.some((creature) => !creature.urban)
    const compactCity = data.world.size < CITY_WORLD_SIZE
    this.settings = data.settings
    this.nextId = data.nextId
    this.time = data.time
    applySave(data, this.world, this.creatures)
    this.world.state.size = Math.max(this.world.state.size, CITY_WORLD_SIZE)
    this.seedCityFood()
    this.installCityCollision()
    this.carriedId = (data as any).extra?.carriedId ?? null
    if (data.player) {
      this.player = {
        pos: { ...data.player.pos },
        facingYaw: data.player.facingYaw ?? 0,
        inventory: { ...data.player.inventory, items: { ...data.player.inventory.items } },
        torchLit: data.player.torchLit ?? false,
        sanity: data.player.sanity ?? 1,
        carryingId: null,
      }
    }
    if (data.quests) {
      this.quests = {
        active: data.quests.active,
        progress: { ...data.quests.progress },
        completed: [...data.quests.completed],
        unlocked: [...data.quests.unlocked],
      }
    }
    if (legacyValley || compactCity) {
      this.player.pos = { x: 0, z: -14 }
      this.player.facingYaw = 0
      this.player.inventory.items.bread = Math.max(this.player.inventory.items.bread ?? 0, 2)
      this.player.inventory.items.medicine = Math.max(this.player.inventory.items.medicine ?? 0, 1)
      const alive = this.creatures.filter((creature) => creature.alive)
      alive.forEach((creature, index) => {
        creature.pos = { x: (index - (alive.length - 1) / 2) * 2.8, z: -20 - (index % 2) * 1.4 }
        creature.facing = Math.PI / 2
      })
      if (legacyValley) this.quests = createQuestLog()
    }
    for (const creature of this.creatures) {
      for (const place of CITY_PLACES) {
        const knowledge = creature.urban.knownPlaces[place.id]
        if (knowledge) knowledge.pos = { ...place.pos }
      }
    }
    // society: restore from save or migrate old saves with deterministic defaults
    this.societyInterval = data.settings?.societyInterval ?? 12
    const savedSociety = (data as any).extra?.society
    this.society = savedSociety ? deserializeSociety(savedSociety) : createDefaultSociety()
    this.societyRng = mulberry32(hashSeed('society-' + data.seed))
    this.societyTimer = 0
    this.syncSocietyNpcs()
    if (data.shadowBeasts) {
      this.shadowBeasts = data.shadowBeasts.map((s) => new ShadowBeast(s.id, s.pos))
      this.beastNextId = data.beastNextId ?? data.shadowBeasts.length + 1
    }
  }

  // ── society query APIs (UI reads these; they never mutate state) ──

  societySummary(): SocietySummary {
    const npcs = this.society.npcs
    const ids = Object.keys(npcs).map(Number)
    const alive = ids.filter((id) => npcs[id].alive).length
    const market = Object.keys(this.society.config.marketBasePrices).map((item) => ({
      item,
      stock: this.society.market.stocks[item] ?? 0,
      maxStock: this.society.config.marketMaxStocks[item] ?? 0,
      price: marketPrice(this.society, item),
    }))
    const bonds: SocietySummary['bonds'] = []
    const fears: SocietySummary['fears'] = []
    for (const id of ids) {
      const rels = npcs[id].relationships
      for (const other of Object.keys(rels)) {
        const o = Number(other)
        const r = rels[o]
        if (id < o) {
          if (r.trust > 0.6) bonds.push({ a: id, b: o, trust: r.trust })
          if (r.fear > 0.5) fears.push({ a: id, b: o, fear: r.fear })
        }
      }
    }
    bonds.sort((x, y) => y.trust - x.trust)
    fears.sort((x, y) => y.fear - x.fear)
    return {
      population: ids.length,
      alive,
      market,
      bonds: bonds.slice(0, 5),
      fears: fears.slice(0, 5),
      recentEvents: this.societyRecentEvents(8),
    }
  }

  societyProfile(npcId: number): SocietyProfile | null {
    const npc = this.society.npcs[npcId]
    if (!npc) return null
    const creature = this.creatures.find((c) => c.id === npcId)
    const relationships = Object.keys(npc.relationships).map((k) => {
      const o = Number(k)
      const r = npc.relationships[o]
      const other = this.creatures.find((c) => c.id === o)
      return {
        otherId: o,
        otherName: other?.name ?? `npc-${o}`,
        trust: r.trust,
        attachment: r.attachment,
        love: r.love,
        betrayal: r.betrayal,
        fear: r.fear,
      }
    })
    return {
      id: npc.id,
      name: creature?.name ?? npc.name,
      alive: npc.alive,
      wallet: npc.wallet,
      inventory: { ...npc.inventory.items },
      traits: { ...npc.traits },
      lastChoice: npc.lastChoice,
      relationships,
    }
  }

  societyRecentEvents(n = 10): SocietyEventView[] {
    return this.society.events.slice(-n).map((e) => {
      const actor = this.creatures.find((c) => c.id === e.actorId)
      const target = e.targetId !== null ? this.creatures.find((c) => c.id === e.targetId) : undefined
      return {
        tick: e.tick,
        kind: e.kind,
        actor: actor?.name ?? `npc-${e.actorId}`,
        target: target?.name ?? null,
        item: e.item,
        amount: e.amount,
        money: e.money,
        direction: e.direction,
      }
    })
  }

  view(): GameView {
    return { world: this.world, creatures: this.creatures, time: this.time, nextId: this.nextId, settings: this.settings }
  }
}
