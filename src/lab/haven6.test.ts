import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { addItem, countItem } from './inventory'
import { DEFAULT_SETTINGS } from './settings'
import { createCloudProvider, providerFor, localProvider, polishTurn } from './dialogue-provider'
import type { DialogueTurn } from './dialogue'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })

describe('handling things in front of other people', () => {
  it('the player can drop an item and it lands in the world', () => {
    const s = createSim(1)
    addItem(s.player.inventory, 'bread', 1, 0)
    const before = s.drops.length
    expect(s.playerDrop('bread')).toBe(true)
    expect(s.drops.length).toBe(before + 1)
    expect(countItem(s.player.inventory, 'bread')).toBe(0)
  })

  it('handing a loaf to a hungry Luma feeds them and earns thanks', () => {
    const s = createSim(2)
    const c = s.spawnCreature(GEN(), 1, 0)
    c.chem.hunger = 0.3
    s.player.pos = { x: 0, z: 0 }
    addItem(s.player.inventory, 'bread', 1, 0)
    const note = s.playerGive('bread', c.id)
    expect(note).toContain('Thank you')
    expect(c.chem.hunger).toBeGreaterThan(0.3)
    expect(c.gratitude[0]).toBeGreaterThan(0)
  })

  it('giving away stolen goods is noticed rather than thanked', () => {
    const s = createSim(3)
    const victim = s.spawnCreature(GEN(), 6, 0)
    const receiver = s.spawnCreature(GEN(), 1, 0)
    receiver.chem.hunger = 1
    s.player.pos = { x: 0, z: 0 }
    addItem(s.player.inventory, 'gem', 1, victim.id)
    const note = s.playerGive('gem', receiver.id)
    expect(note).toContain('looks at it more closely')
    expect(receiver.social[0].suspicion).toBeGreaterThan(0)
  })

  it('you cannot hand something to someone across the settlement', () => {
    const s = createSim(4)
    const far = s.spawnCreature(GEN(), 60, 60)
    s.player.pos = { x: 0, z: 0 }
    addItem(s.player.inventory, 'bread', 1, 0)
    expect(s.playerGive('bread', far.id)).toBeNull()
    expect(countItem(s.player.inventory, 'bread')).toBe(1)
  })
})

describe('optional dialogue service stays optional', () => {
  it('ships disabled with no endpoint', () => {
    expect(DEFAULT_SETTINGS.optionalCloudAi).toBe(false)
    expect(DEFAULT_SETTINGS.cloudEndpoint).toBe('')
  })

  it('a configured but unreachable service never changes the line', async () => {
    const provider = createCloudProvider({
      endpoint: 'http://127.0.0.1:1/haven',
      fetchImpl: (async () => {
        throw new Error('connection refused')
      }) as unknown as typeof fetch,
    })
    const turn = {
      speakerId: 1,
      listenerId: 0,
      text: 'the local line',
      semantic: { kind: 'greet', fromId: 0, toId: 1, sincerity: 1, tick: 0 },
      believed: true,
      obeyed: false,
      tick: 0,
    } as DialogueTurn
    const polished = await polishTurn(provider, turn, 'Nix', 'calm')
    expect(polished.text).toBe('the local line')
  })

  it('a working service is allowed to rephrase', async () => {
    const provider = createCloudProvider({
      endpoint: 'http://example.test/haven',
      fetchImpl: (async () => ({
        ok: true,
        json: async () => ({ text: 'a warmer version' }),
      })) as unknown as typeof fetch,
    })
    const text = await provider.polish({ baseText: 'flat', speakerName: 'Nix', mood: 'calm', hints: [] })
    expect(text).toBe('a warmer version')
  })

  it('falls back to the local voice when disabled', () => {
    const cloud = createCloudProvider({ endpoint: 'http://example.test/haven' })
    expect(providerFor(false, cloud).id).toBe('local')
    expect(localProvider.available()).toBe(true)
  })
})
