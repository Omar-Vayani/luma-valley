import { Creature } from './creature'
import type { CreatureCtx } from './creature'
import { applyFood, FOOD_EFFECTS, socialTick } from './biochem'
import { ITEMS } from './items'
import { World } from './world'
import { applySave, buildSave, type SaveData } from './save'
import { clamp, mulberry32, range, type RNG } from './rng'
import { createPlayer, type PlayerState } from './player'
import { ShadowBeast } from './shadowbeast'
import { createQuestLog, questEvent, type QuestEvent, type QuestLogState } from './quests'
import { contagion, remember, updateAffinity } from './mind'
import { affinityFor } from './mind'
import { CITY_PLACES, resolveSocialEncounter, type CityPlaceId } from './city'
import { CITY_BUILDINGS, FILLER_BUILDINGS, CITY_WALL_BOUND, CITY_WORLD_SIZE, avoidCityObstacles, buildingForPlace, buildingNavigationPoint, wallBoxes } from './city-layout'
import type { ItemId } from './items'

/**
 * Game — orchestrates the world + creatures into one playable simulation.
 * The renderer/worker calls tick() every frame and reads entities.
 */

export interface GameSettings {
  gentle: boolean
}

export interface GameView {
  world: World
  creatures: Creature[]
  time: number
  nextId: number
  settings: GameSettings
}

export class Game {
  world: World
  creatures: Creature[] = []
  player: PlayerState
  shadowBeasts: ShadowBeast[] = []
  quests: QuestLogState
  time = 0
  nextId = 1
  settings: GameSettings = { gentle: false }
  rng: RNG
  private breedCooldown = 0
  private shadowSpawnTimer = 0
  private beastNextId = 1
  private placeVisitAt: Partial<Record<CityPlaceId, number>> = {}

  constructor(seed: number, size = CITY_WORLD_SIZE, settings?: GameSettings) {
    this.world = new World(seed, size)
    this.installCityCollision()

    this.rng = mulberry32(seed)
    if (settings) this.settings = settings
    this.player = createPlayer({ x: 0, z: 0 })
    this.quests = createQuestLog()
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
      findFood: () => this.world.nearestFood(self.pos),
      findWater: () => this.world.nearestWater(self.pos),
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
              const harmA = 0.015 + b.urban.emotions.anger * 0.025
              const harmB = 0.015 + a.urban.emotions.anger * 0.025
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

  /** Interact with a named city district. Every place has an explicit use. */
  visitPlace(placeId: CityPlaceId): { ok: boolean; msg: string } {
    const place = CITY_PLACES.find((candidate) => candidate.id === placeId)
    if (!place) return { ok: false, msg: 'That place is not part of the city.' }
    const itemByPlace: Partial<Record<CityPlaceId, ItemId>> = {
      market: 'bread',
      tavern: 'ale',
      apothecary: 'medicine',
      'back-alley': 'dream-dust',
    }
    const itemId = itemByPlace[placeId]
    if (itemId) {
      const addictive = placeId === 'tavern' || placeId === 'back-alley'
      if (addictive) {
        const cooldown = placeId === 'tavern' ? 180 : 360
        const lastVisit = this.placeVisitAt[placeId] ?? -9999
        if (this.time - lastVisit < cooldown) {
          return { ok: false, msg: `${place.name}: service refused for now. Dependence and impairment need time to fade.` }
        }
        const held = this.player.inventory.items
        const atLimit = placeId === 'tavern'
          ? (held.ale ?? 0) >= 1 || (held.cigarettes ?? 0) >= 1
          : (held['dream-dust'] ?? 0) >= 1
        if (atLimit) {
          return { ok: false, msg: `${place.name}: no more supplied while you still carry an addictive substance.` }
        }
      }
      this.pickupItem(itemId)
      if (placeId === 'tavern') this.pickupItem('cigarettes')
      if (addictive) this.placeVisitAt[placeId] = this.time
      const item = ITEMS[itemId]
      return {
        ok: true,
        msg: placeId === 'tavern'
          ? `${place.name}: one ale and one cigarette. Short relief harms health and judgment and may create dependence.`
          : placeId === 'back-alley'
            ? `${place.name}: one dangerous dose. It impairs judgment, harms health, and can create severe dependence.`
            : `${place.name}: +1 ${item.name}. ${item.blurb}`,
      }
    }
    if (placeId === 'park') {
      this.player.sanity = clamp(this.player.sanity + 0.2, 0, 1)
      return { ok: true, msg: `${place.name}: the fountain and quiet park restore calm.` }
    }
    if (placeId === 'homes') {
      this.player.sanity = clamp(this.player.sanity + 0.3, 0, 1)
      return { ok: true, msg: `${place.name}: homes provide sleep, shelter, and safety.` }
    }
    if (placeId === 'watch') return { ok: true, msg: `${place.name}: citizens seek the watch when frightened or threatened.` }
    return { ok: true, msg: `${place.name}: ${place.purpose}.` }
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
    data.extra = { carriedId: this.carriedId ?? undefined } as any
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
    if (data.shadowBeasts) {
      this.shadowBeasts = data.shadowBeasts.map((s) => new ShadowBeast(s.id, s.pos))
      this.beastNextId = data.beastNextId ?? data.shadowBeasts.length + 1
    }
  }

  view(): GameView {
    return { world: this.world, creatures: this.creatures, time: this.time, nextId: this.nextId, settings: this.settings }
  }
}
