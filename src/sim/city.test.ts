import { describe, expect, it } from 'vitest'
import {
  CITY_PLACES,
  createUrbanState,
  decideCityGoal,
  learnPlace,
  resolveSocialEncounter,
  updateEmotions,
} from './city'
import { Game } from './game'
import { World } from './world'

describe('old-city NPC cognition', () => {
  it('learns what a discovered place provides and uses only known places', () => {
    const state = createUrbanState()
    const tavern = CITY_PLACES.find((place) => place.id === 'tavern')!
    expect(decideCityGoal(state, { hunger: 0.1, health: 1, loneliness: 0.1, boredom: 0.1, fear: 0, withdrawal: 'alcohol' })).toBeNull()

    learnPlace(state, tavern, 12, 0.4)

    expect(state.knownPlaces.tavern?.provides).toContain('ale')
    expect(decideCityGoal(state, { hunger: 0.1, health: 1, loneliness: 0.1, boredom: 0.1, fear: 0, withdrawal: 'alcohol' })).toBe('tavern')
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

  it('makes every player place interaction produce a clear purpose', () => {
    const game = new Game(43)
    const tavern = game.visitPlace('tavern')
    expect(tavern.ok).toBe(true)
    expect(tavern.msg.toLowerCase()).toContain('ale')
    expect(game.player.inventory.items.ale).toBe(1)

    const park = game.visitPlace('park')
    expect(park.ok).toBe(true)
    expect(park.msg.toLowerCase()).toContain('park')
  })

  it('limits addictive supplies instead of allowing stockpiling', () => {
    const game = new Game(10)
    expect(game.visitPlace('tavern').ok).toBe(true)
    expect(game.player.inventory.items.ale).toBe(1)
    expect(game.player.inventory.items.cigarettes).toBe(1)
    expect(game.visitPlace('tavern').ok).toBe(false)
    expect(game.player.inventory.items.ale).toBe(1)
    expect(game.visitPlace('back-alley').ok).toBe(true)
    expect(game.player.inventory.items['dream-dust']).toBe(1)
    expect(game.visitPlace('back-alley').ok).toBe(false)
  })
})
