/**
 * Does talking to them actually teach them anything?
 *
 * The vocabulary system is one of the oldest parts of the simulation and one
 * of the least visible, so this pins down what it is supposed to do: a word
 * the player teaches sticks, spreads to whoever was in earshot, travels
 * between Luma afterwards, and shows up in what the settlement agrees on.
 */
import { describe, expect, it } from 'vitest'
import { createSim } from './sim'
import { randomGenome, type Genome } from './genetics'
import { getWord, hearWord, learnWord, createLanguage, shareWithNeighbors } from './language'
import { inspectCreature, inspectSociety } from './inspect'
import { findTower } from './world'

const GEN = (over: Partial<Genome> = {}): Genome => ({ ...randomGenome(() => 0.5), ...over })
const at = (id: 'homes' | 'food') => findTower(id)!

describe('language — words are learned, not issued', () => {
  it('a fresh creature knows no words at all', () => {
    const lang = createLanguage(1)
    expect(getWord(lang, 'food')).toBeNull()
  })

  it('doing something enough times coins a word for it', () => {
    const lang = createLanguage(2)
    for (let i = 0; i < 5; i++) learnWord(lang, 'food', 0.4)
    const word = getWord(lang, 'food')
    expect(word).toBeTruthy()
    expect(word!.length).toBeGreaterThan(1)
  })

  it('hearing somebody else use a word teaches it', () => {
    const lang = createLanguage(3)
    hearWord(lang, 'brek', 'food', 0.8)
    expect(getWord(lang, 'food')).toBe('brek')
  })

  it('and it spreads from one creature to another', () => {
    const s = createSim(4)
    const a = s.spawnCreature(GEN(), 0, 0)
    const b = s.spawnCreature(GEN(), 1, 0)
    hearWord(a.language, 'grennit', 'food', 1)
    shareWithNeighbors(a.language, b.language, 'food', 0.9)
    expect(getWord(b.language, 'food')).toBe('grennit')
  })
})

describe('teaching a word to the settlement', () => {
  it('the player teaching a word sticks, and everyone in earshot picks it up', () => {
    const s = createSim(5)
    const spot = at('homes')
    s.player.pos = { x: spot.x, z: spot.z }
    const near = s.spawnCreature(GEN(), spot.x + 2, spot.z)
    const alsoNear = s.spawnCreature(GEN(), spot.x - 3, spot.z + 1)
    const faraway = s.spawnCreature(GEN(), spot.x + 60, spot.z)

    s.playerTeach('food', 'brannock')

    expect(getWord(s.player.language, 'food')).toBe('brannock')
    expect(getWord(near.language, 'food')).toBe('brannock')
    expect(getWord(alsoNear.language, 'food')).toBe('brannock')
    expect(getWord(faraway.language, 'food')).toBeNull()
  })

  it('the taught word turns up in what the mind inspector shows', () => {
    const s = createSim(6)
    const spot = at('food')
    s.player.pos = { x: spot.x, z: spot.z }
    const c = s.spawnCreature(GEN(), spot.x + 1, spot.z)
    s.playerTeach('danger', 'skree')

    const report = inspectCreature(s, c)
    const entry = report.vocabulary.find((v) => v.concept === 'danger')
    expect(entry?.word).toBe('skree')
    expect(entry!.strength).toBeGreaterThan(0)
  })

  it('a word enough of them share becomes the settlement\u2019s word', () => {
    const s = createSim(7)
    const spot = at('homes')
    s.player.pos = { x: spot.x, z: spot.z }
    for (let i = 0; i < 5; i++) s.spawnCreature(GEN(), spot.x + i * 1.2, spot.z)
    s.playerTeach('help', 'vella')
    // the settlement recomputes its shared words as it runs
    for (let i = 0; i < 200; i++) s.tick()

    const society = inspectSociety(s)
    const shared = society.sharedWords.find((w) => w.concept === 'help')
    expect(shared?.word, JSON.stringify(society.sharedWords)).toBe('vella')
  })

  it('living in the settlement teaches words nobody was taught', () => {
    const s = createSim(8)
    s.settings.lodNear = 200
    s.settings.aiBatchSize = 8
    for (let i = 0; i < 5; i++) {
      const c = s.spawnCreature(GEN({ sociability: 0.9, curiosity: 0.8 }), i * 2 - 4, 0)
      c.wallet = 30
      c.learnTower('food')
      c.learnTower('work')
    }
    for (let i = 0; i < 1200; i++) s.tick()

    const known = s.creatures.filter((c) => c.alive && c.language.vocab.size > 0)
    expect(known.length, 'nobody in Haven has a word for anything').toBeGreaterThan(0)
  })
})
