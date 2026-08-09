import { describe, expect, it } from 'vitest'
import {
  CITY_PLACES,
  createUrbanState,
  decideCityGoal,
  learnPlace,
  resolveSocialEncounter,
  updateEmotions,
  type CityResource,
} from './city'
import { Game } from './game'
import { World } from './world'

const NEEDS: Parameters<typeof decideCityGoal>[1] = {
  hunger: 0.1,
  health: 1,
  loneliness: 0.1,
  boredom: 0.1,
  fear: 0,
  withdrawal: null,
}

describe('nomad-city purpose registry', () => {
  it('preserves every existing place id and adds the new walled services', () => {
    const ids = CITY_PLACES.map((place) => place.id)
    for (const stable of ['market', 'tavern', 'park', 'apothecary', 'homes', 'watch', 'back-alley', 'hospital', 'restaurant']) {
      expect(ids).toContain(stable)
    }
  })

  it('renames visible semantics without central watch or authority framing', () => {
    for (const place of CITY_PLACES) {
      const text = `${place.name} ${place.purpose}`.toLowerCase()
      for (const token of ['watch', 'guard', 'order', 'patrol', 'authority']) {
        expect(text).not.toContain(token)
      }
    }
    // The exchange and the clinic keep their internal ids but read as services.
    const watch = CITY_PLACES.find((place) => place.id === 'watch')!
    expect(`${watch.name} ${watch.purpose}`).toMatch(/weigh|ledger|deposit|exchange/i)
    const apothecary = CITY_PLACES.find((place) => place.id === 'apothecary')!
    expect(`${apothecary.name} ${apothecary.purpose}`).toMatch(/drugstore|clinic|medicine/i)
    const homes = CITY_PLACES.find((place) => place.id === 'homes')!
    expect(`${homes.name} ${homes.purpose}`).toMatch(/shelter|bed|rest/i)
    const tavern = CITY_PLACES.find((place) => place.id === 'tavern')!
    expect(`${tavern.name} ${tavern.purpose}`).toMatch(/coin|pour|smoke/i)
  })

  it('describes each service as self-service or vending', () => {
    const expectations: Record<string, string[]> = {
      homes: ['bed', 'rest'],
      tavern: ['coin', 'pour', 'smoke'],
      park: ['free', 'water'],
      watch: ['deposit', 'ledger', 'weigh', 'exchange'],
      hospital: ['treatment', 'remedy', 'pay'],
      restaurant: ['meal', 'oven', 'pay'],
      apothecary: ['medicine', 'clinic', 'self-service'],
    }
    for (const [id, tokens] of Object.entries(expectations)) {
      const place = CITY_PLACES.find((candidate) => candidate.id === id)
      expect(place, `expected a registered place named ${id}`).toBeDefined()
      const text = `${place!.name} ${place!.purpose}`.toLowerCase()
      expect(tokens.some((token) => text.includes(token)), `${id} should self-describe`).toBe(true)
    }
  })

  it('routes each need to the correct service', () => {
    const state = createUrbanState()
    for (const place of CITY_PLACES) learnPlace(state, place, 1, 0.2)
    const goal = (overrides: Partial<typeof NEEDS>): string | null =>
      decideCityGoal(state, { ...NEEDS, ...overrides } as Parameters<typeof decideCityGoal>[1])

    expect(['market', 'restaurant']).toContain(goal({ hunger: 0.9 }))
    expect(['apothecary', 'hospital']).toContain(goal({ health: 0.3 }))
    expect(goal({ fear: 0.8 })).toBe('homes')
    expect(['tavern', 'park', 'watch', 'market', 'restaurant']).toContain(goal({ loneliness: 0.8 }))
    expect(['tavern', 'park', 'watch', 'market', 'restaurant', 'homes', 'hospital']).toContain(goal({ boredom: 0.8 }))
    expect(goal({ withdrawal: 'alcohol' })).toBe('tavern')
    expect(goal({ withdrawal: 'nicotine' })).toBe('tavern')
    expect(goal({ withdrawal: 'drug' })).toBe('back-alley')
  })

  it('confines addictive supplies to designated self-service places', () => {
    const addictive: CityResource[] = ['ale', 'cigarettes', 'dream-dust']
    for (const place of CITY_PLACES) {
      const sells = place.provides.some((resource) => addictive.includes(resource))
      if (place.id === 'tavern' || place.id === 'back-alley') expect(sells).toBe(true)
      else expect(sells).toBe(false)
    }
  })

  it('keeps the Ashen Park fountain where citizens expect it', () => {
    const park = CITY_PLACES.find((place) => place.id === 'park')!
    expect(park.name).toBe('Ashen Park')
    expect(park.pos.x).toBe(0)
    expect(park.pos.z).toBe(-28)
    expect(park.provides).toContain('water')
  })
})

describe('old-city NPC cognition', () => {
  it('learns what a discovered place provides and uses only known places', () => {
    const state = createUrbanState()
    const tavern = CITY_PLACES.find((place) => place.id === 'tavern')!
    expect(decideCityGoal(state, { ...NEEDS, withdrawal: 'alcohol' })).toBeNull()

    learnPlace(state, tavern, 12, 0.4)

    expect(state.knownPlaces.tavern?.provides).toContain('ale')
    expect(decideCityGoal(state, { ...NEEDS, withdrawal: 'alcohol' })).toBe('tavern')
  })

  it('turns pain, isolation and intoxication into distinct emotions', () => {
    const state = createUrbanState()
    state.intoxication = 0.8
    const emotions = updateEmotions(state, {
      pleasure: 0.15,
      fear: 0.2,
      pain: 0.75,
      loneliness: 0.8,
      health: 0.4,
      empathy: 0.3,
    })

    expect(emotions.anger).toBeGreaterThan(0.45)
    expect(emotions.sadness).toBeGreaterThan(0.45)
    expect(emotions.intoxication).toBeGreaterThan(0.7)
    expect(emotions.joy).toBeLessThan(0.4)
  })

  it('shares when bonded and empathetic, but fights when hostile and angry', () => {
    const generous = createUrbanState()
    generous.carriedItem = 'bread'
    generous.emotions.empathy = 0.9
    const friend = createUrbanState()
    friend.emotions.sadness = 0.8

    expect(resolveSocialEncounter(generous, friend, 0.7, () => 0.2)).toBe('share')
    expect(generous.carriedItem).toBeNull()
    expect(friend.carriedItem).toBe('bread')

    const angry = createUrbanState()
    angry.emotions.anger = 0.9
    angry.intoxication = 0.7
    const rival = createUrbanState()
    rival.emotions.anger = 0.65
    expect(resolveSocialEncounter(angry, rival, -0.6, () => 0.1)).toBe('fight')
  })

  it('uses a flat city world and lets citizens discover nearby districts', () => {
    const world = new World(42, 60)
    expect(world.height(-37, 21)).toBe(world.height(33, -19))

    const game = new Game(42)
    game.spawnInitial(1)
    const tavern = CITY_PLACES.find((place) => place.id === 'tavern')!
    game.creatures[0].pos = { ...tavern.pos }
    game.tick()
    expect(game.creatures[0].urban.knownPlaces.tavern).toBeDefined()
  })

  it('keeps player visits informative for the observer', () => {
    // The observer never collects goods from buildings: self-service stock is
    // represented by the registry for NPC society/economy integration, and the
    // player reads purpose from the place rather than expecting a handout.
    const game = new Game(43)
    const park = game.visitPlace('park')
    expect(park.ok).toBe(true)
    expect(park.msg.toLowerCase()).toContain('park')
  })
})
