import { describe, expect, it } from 'vitest'
import {
  createFixtures, fixturesOfTower, useBed, toggleDoor, storeItem, takeItem,
  giveItem, consumeItem, withinReach, type Fixture,
} from './interact'
import { createInventory, addItem, countItem } from './inventory'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { saveSim, loadSim } from './save'
import { findTower, HOUSE_IDS } from './world'
import { createSociety, ensureCoupleHousehold, homeTowerOf, homeSlotPos } from './household'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

const actorAt = (x: number, z: number, id?: number) => ({
  pos: { x, z },
  inventory: createInventory(),
  id,
})

describe('world interaction — the same rules for everyone', () => {
  it('furnishes homes with a bed, a chest, and a door', () => {
    const fixtures = createFixtures()
    const houseFixtures = fixturesOfTower(fixtures, 'house1')
    expect(houseFixtures.map((f) => f.kind).sort()).toEqual(['bed', 'container', 'door'])
  })

  it('nothing can be used out of arm’s reach', () => {
    const fixtures = createFixtures()
    const bed = fixtures.find((f) => f.kind === 'bed') as Fixture
    const faraway = actorAt(bed.x + 40, bed.z)
    expect(useBed(faraway, bed)).toEqual({ ok: false, reason: 'out-of-reach' })
    const beside = actorAt(bed.x + 1, bed.z)
    expect(useBed(beside, bed).ok).toBe(true)
  })

  it('containers hold items and remember who stored them', () => {
    const fixtures = createFixtures()
    const chest = fixtures.find((f) => f.kind === 'container') as Fixture
    const owner = actorAt(chest.x, chest.z, 7)
    addItem(owner.inventory, 'gem', 1, 7)
    expect(storeItem(owner, chest, 'gem').ok).toBe(true)
    expect(countItem(chest.storage!, 'gem')).toBe(1)

    const stranger = actorAt(chest.x, chest.z, 9)
    const result = takeItem(stranger, chest, 'gem')
    expect(result.ok).toBe(true)
    expect(result.stolen).toBe(true)
    expect(countItem(stranger.inventory, 'gem')).toBe(1)
  })

  it('taking your own property is not theft', () => {
    const fixtures = createFixtures()
    const chest = fixtures.find((f) => f.kind === 'container') as Fixture
    const owner = actorAt(chest.x, chest.z, 3)
    addItem(owner.inventory, 'bread', 1, 3)
    storeItem(owner, chest, 'bread')
    const result = takeItem(owner, chest, 'bread')
    expect(result.ok).toBe(true)
    expect(result.stolen).toBe(false)
  })

  it('doors open and shut, and private doors resist strangers', () => {
    const fixtures = createFixtures()
    const door = fixtures.find((f) => f.kind === 'door') as Fixture
    const someone = actorAt(door.x, door.z, 1)
    expect(toggleDoor(someone, door).ok).toBe(true)
    door.ownerId = 42
    expect(toggleDoor(someone, door)).toEqual({ ok: false, reason: 'locked' })
  })

  it('handing something over requires standing next to each other', () => {
    const giver = actorAt(0, 0, 1)
    const taker = actorAt(1, 0, 2)
    addItem(giver.inventory, 'bread', 1, 1)
    expect(giveItem(giver, taker, 'bread').ok).toBe(true)
    expect(countItem(taker.inventory, 'bread')).toBe(1)

    const distant = actorAt(30, 30, 3)
    addItem(giver.inventory, 'bread', 1, 1)
    expect(giveItem(giver, distant, 'bread')).toEqual({ ok: false, reason: 'out-of-reach' })
  })

  it('consuming an item applies the effects declared in the catalog', () => {
    const actor = actorAt(0, 0, 1)
    addItem(actor.inventory, 'bread', 1)
    const chem: Record<string, number> = { hunger: 0.2, pleasure: 0.5, health: 0.9 }
    const result = consumeItem(actor, 'bread', chem)
    expect(result.ok).toBe(true)
    expect(chem.hunger).toBeGreaterThan(0.2)
    expect(countItem(actor.inventory, 'bread')).toBe(0)
  })

  it('withinReach is honest about distance', () => {
    expect(withinReach(actorAt(0, 0), 1, 0)).toBe(true)
    expect(withinReach(actorAt(0, 0), 9, 0)).toBe(false)
  })
})

describe('homes are individual dwellings', () => {
  it('the settlement has separate houses in the homes quarter', () => {
    for (const id of HOUSE_IDS) {
      const t = findTower(id)
      expect(t).toBeDefined()
      expect(t!.radius).toBeGreaterThan(1)
    }
  })

  it('a new household claims a house of its own', () => {
    const society = createSociety()
    const s = createSim(2)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    const house = ensureCoupleHousehold(society, a, b, 0)
    const tower = homeTowerOf(house)
    expect(tower).not.toBeNull()
    const pos = homeSlotPos(house.homeSlot)
    const t = findTower(tower!)
    expect(pos.x).toBeCloseTo(t!.x)
    expect(pos.z).toBeCloseTo(t!.z)
  })
})

describe('player world interaction and persistence', () => {
  it('the player can rest in a bed they are standing at', () => {
    const s = createSim(3)
    const bed = s.fixtures.find((f) => f.kind === 'bed')!
    s.player.pos = { x: bed.x, z: bed.z }
    s.player.health = 0.5
    const note = s.playerUseFixture('rest')
    expect(note).toBeTruthy()
    expect(s.player.health).toBeGreaterThan(0.5)
  })

  it('the player cannot use furniture from across the settlement', () => {
    const s = createSim(4)
    s.player.pos = { x: 0, z: 0 }
    expect(s.playerUseFixture('rest')).toBeNull()
  })

  it('stolen goods from a chest are witnessed by nearby creatures', () => {
    const s = createSim(5)
    const chest = s.fixtures.find((f) => f.kind === 'container')!
    chest.storage!.items.gem = 1
    chest.storage!.owners = { gem: 11 }
    s.player.pos = { x: chest.x, z: chest.z }
    const watcher = s.spawnCreature(GEN(), chest.x + 2, chest.z)
    const note = s.playerUseFixture('take')
    expect(note).toContain('gem')
    expect(watcher.reputation[0]?.thief ?? 0).toBeGreaterThan(0)
  })

  it('container contents survive a save and load', () => {
    const s = createSim(6)
    const chest = s.fixtures.find((f) => f.kind === 'container')!
    chest.storage!.items.trinket = 2
    const s2 = loadSim(saveSim(s))
    const chest2 = s2.fixtures.find((f) => f.id === chest.id)!
    expect(chest2.storage!.items.trinket).toBe(2)
  })

  it('a creature with a household sleeps in its own house', () => {
    const s = createSim(7)
    const a = s.spawnCreature(GEN(), -50, -16)
    const b = s.spawnCreature(GEN(), -49, -16)
    ensureCoupleHousehold(s.society, a, b, 0)
    for (const id of HOUSE_IDS) a.learnTower(id)
    a.chem.energy = 0.05
    a.intention = 'sleep'
    for (let i = 0; i < 20 && !a.sleeping; i++) s.tick()
    expect(a.sleeping).toBe(true)
  })
})
