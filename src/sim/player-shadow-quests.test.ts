import { describe, expect, it } from 'vitest'
import { createPlayer, pickBerry, craftTorch, collectWood, toggleTorch, throwBerry } from './player'
import { ShadowBeast } from './shadowbeast'
import { activeQuest, createQuestLog, questEvent, QUEST_CHAIN } from './quests'

describe('player', () => {
  it('has starting inventory', () => {
    const p = createPlayer({ x: 0, z: 0 })
    expect(p.inventory.berries).toBe(3)
    expect(p.inventory.torch).toBe(1)
    expect(p.sanity).toBe(1)
  })

  it('picks berries up to a cap', () => {
    const p = createPlayer({ x: 0, z: 0 })
    for (let i = 0; i < 12; i++) pickBerry(p)
    expect(p.inventory.berries).toBe(10)
  })

  it('crafts a torch from 2 wood', () => {
    const p = createPlayer({ x: 0, z: 0 })
    collectWood(p)
    collectWood(p)
    expect(craftTorch(p)).toBe(true)
    expect(p.inventory.wood).toBe(0)
    expect(p.inventory.torch).toBe(2)
    expect(craftTorch(p)).toBe(false)
  })

  it('toggles torch only if owned', () => {
    const p = createPlayer({ x: 0, z: 0 })
    toggleTorch(p)
    expect(p.torchLit).toBe(true)
    toggleTorch(p)
    expect(p.torchLit).toBe(false)
  })

  it('throw berry consumes one', () => {
    const p = createPlayer({ x: 0, z: 0 })
    expect(throwBerry(p)).toBe(true)
    expect(p.inventory.berries).toBe(2)
    p.inventory.berries = 0
    expect(throwBerry(p)).toBe(false)
  })
})

describe('shadowbeast', () => {
  it('dissolves at dawn', () => {
    const b = new ShadowBeast(1, { x: 0, z: 0 })
    const events = b.tick({
      creatures: [],
      playerPos: { x: 10, z: 10 },
      torchNear: false,
      dayTime: 0.5,
    })
    expect(events).toContain('dissolve')
  })

  it('attacks the nearest creature at night', () => {
    const b = new ShadowBeast(1, { x: 0, z: 0 })
    let attack = false
    for (let i = 0; i < 60; i++) {
      const ev = b.tick({
        creatures: [{ id: 5, pos: { x: 1, z: 0 }, alive: true, fear: 0 }],
        playerPos: { x: 30, z: 30 },
        torchNear: false,
        dayTime: 0.8,
      })
      if (ev.includes('attack')) attack = true
    }
    expect(attack).toBe(true)
  })

  it('flees and weakens when a torch is near', () => {
    const b = new ShadowBeast(1, { x: 0, z: 0 })
    for (let i = 0; i < 40; i++) {
      b.tick({
        creatures: [{ id: 5, pos: { x: 1, z: 0 }, alive: true, fear: 0 }],
        playerPos: { x: 0.5, z: 0 },
        torchNear: true,
        dayTime: 0.8,
      })
    }
    expect(b.state.state).toBe('flee')
    expect(b.state.health).toBeLessThan(1)
  })
})

describe('quests', () => {
  it('starts at q1_feed and advances through events', () => {
    const log = createQuestLog()
    expect(activeQuest(log)?.id).toBe('q1_feed')
    const ev = questEvent(log, 'feed', 1)
    expect(ev).toContain('quest:q2_teach')
    expect(activeQuest(log)?.id).toBe('q2_teach')
  })

  it('counts objectives across events', () => {
    const log = createQuestLog()
    questEvent(log, 'feed', 1)
    // q2_teach needs 1 teach
    questEvent(log, 'teach', 1)
    expect(activeQuest(log)?.id).toBe('q3_berry')
    // q3 needs 3 berries
    questEvent(log, 'pickBerry', 1)
    questEvent(log, 'pickBerry', 2)
    expect(activeQuest(log)?.id).toBe('q4_torch')
  })

  it('ignores events for the wrong quest', () => {
    const log = createQuestLog()
    questEvent(log, 'birth', 1) // wrong for q1
    expect(activeQuest(log)?.id).toBe('q1_feed')
  })

  it('full chain ends in victory', () => {
    const log = createQuestLog()
    const map: Record<string, [string, number]> = {
      feed: ['feed', 1],
      teach: ['teach', 1],
      berry: ['pickBerry', 3],
      torch: ['craftTorch', 1],
      light: ['lightTorch', 1],
      adult: ['adult', 1],
      shadow: ['repelShadow', 1],
      shrine: ['lightShrine', 1],
      birth: ['birth', 1],
    }
    const chain = QUEST_CHAIN.map((q) => q.id)
    let allDone = false
    for (const [kind, amt] of Object.values(map)) {
      const ev = questEvent(log, kind as any, amt as number)
      if (ev.includes('quest:all')) allDone = true
    }
    expect(allDone).toBe(true)
    expect(log.completed.length).toBe(chain.length)
    expect(log.active).toBeNull()
  })
})
