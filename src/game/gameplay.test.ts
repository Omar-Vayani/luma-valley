import { describe, expect, it } from 'vitest'
import { createSim } from '../lab/sim'
import { addItem, countItem } from '../lab/inventory'
import { itemName } from '../lab/items'
import { findTower } from '../lab/world'
import { worldScatter } from '../world/scatter'
import { LANDMARKS, landmarkNear } from '../world/lore'
import { heightAt, isUnderwater, roadStrength } from '../world/terrain'

import {
  addJournal, adjustStanding, createProgress, meet, migrateProgress, placeProp,
  propNear, removeProp, standingRank,
} from './progress'
import { effortFor, harvestNode, HARVEST, nodeReady, pruneNodes } from './gather'
import { craft, hasInputs, recipeById, RECIPES } from './craft'
import {
  acceptRequest, createBoard, MAX_ACTIVE, objectiveFor, onGive, onTalk, scanRequests,
} from './requests'

describe('scatter — the valley is dressed, and dressed sensibly', () => {
  const { props, nodes } = worldScatter()

  it('plants a few thousand things without putting any of them in the lake', () => {
    expect(props.length).toBeGreaterThan(2000)
    const drowned = props.filter((p) => p.kind !== 'lily' && isUnderwater(p.x, p.z))
    expect(drowned.length, `${drowned.length} plants are underwater`).toBe(0)
  })

  it('keeps the roads clear', () => {
    const onRoad = props.filter((p) => roadStrength(p.x, p.z) > 0.5)
    expect(onRoad.length).toBe(0)
  })

  it('stands everything on the ground rather than above or below it', () => {
    for (const p of props.slice(0, 400)) {
      if (p.kind === 'lily') continue
      expect(Math.abs(p.y - heightAt(p.x, p.z))).toBeLessThan(0.01)
    }
  })

  it('hides something to gather of every kind', () => {
    const kinds = new Set(nodes.map((n) => n.kind))
    for (const kind of ['berry', 'wood', 'stone', 'herb', 'grain', 'fish'] as const) {
      expect(kinds.has(kind), `nothing to gather of kind ${kind}`).toBe(true)
    }
    expect(nodes.length).toBeGreaterThan(200)
  })

  it('gives every node a unique id, so gathering one does not empty another', () => {
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length)
  })

  it('is the same valley on every load', () => {
    const again = worldScatter()
    expect(again.props.length).toBe(props.length)
    expect(again.nodes[0].id).toBe(nodes[0].id)
  })
})

describe('gather — picking things up takes a moment', () => {
  it('yields the item, then makes you wait for it to grow back', () => {
    const p = createProgress()
    const node = worldScatter().nodes.find((n) => n.kind === 'berry')!
    expect(nodeReady(p, node.id, 100)).toBe(true)

    const got = harvestNode(p, node, 100, () => 0.99)
    expect(got?.item).toBe('berry')
    expect(got?.amount).toBe(HARVEST.berry.amount)
    expect(nodeReady(p, node.id, 100)).toBe(false)
    expect(nodeReady(p, node.id, 100 + HARVEST.berry.regrow)).toBe(true)
    expect(harvestNode(p, node, 100)).toBeNull()
  })

  it('rolls an occasional extra', () => {
    const p = createProgress()
    const node = worldScatter().nodes.find((n) => n.kind === 'herb')!
    const got = harvestNode(p, node, 0, () => 0)
    expect(got?.amount).toBe(HARVEST.herb.amount + 1)
  })

  it('is quicker with the right thing in hand', () => {
    const bare = effortFor('wood', () => false)
    const withStick = effortFor('wood', (id) => id === 'stick')
    expect(withStick).toBeLessThan(bare)
    expect(effortFor('berry', () => true)).toBe(HARVEST.berry.effort)
  })

  it('forgets timers that have already elapsed', () => {
    const p = createProgress()
    p.nodes.a = 10
    p.nodes.b = 900
    pruneNodes(p, 100)
    expect(p.nodes.a).toBeUndefined()
    expect(p.nodes.b).toBe(900)
  })
})

describe('craft — recipes need materials and, mostly, a workshop', () => {
  it('turns grain into bread at a hearth and nowhere else', () => {
    const sim = createSim(1)
    const inv = sim.player.inventory
    addItem(inv, 'grain', 2, 0)
    const loaf = recipeById('loaf')!

    const away = craft(inv, loaf, false)
    expect(away.ok).toBe(false)
    expect(away.reason).toBe('station')
    expect(countItem(inv, 'grain')).toBe(2)

    const made = craft(inv, loaf, true)
    expect(made.ok).toBe(true)
    expect(countItem(inv, 'bread')).toBe(1)
    expect(countItem(inv, 'grain')).toBe(0)
  })

  it('says what you are short of', () => {
    const sim = createSim(1)
    const remedy = recipeById('remedy')!
    addItem(sim.player.inventory, 'herb', 1, 0)
    const result = craft(sim.player.inventory, remedy, true)
    expect(result.ok).toBe(false)
    expect(result.reason).toBe('materials')
    expect(result.message).toContain(itemName('herb'))
  })

  it('lets you whittle a stick anywhere', () => {
    const sim = createSim(1)
    addItem(sim.player.inventory, 'timber', 1, 0)
    const result = craft(sim.player.inventory, recipeById('stick')!, false)
    expect(result.ok).toBe(true)
  })

  it('every recipe is makeable from things that exist in the valley', () => {
    for (const r of RECIPES) {
      // a fresh pack each time: some recipes together weigh more than you can carry
      const sim = createSim(1)
      for (const i of r.inputs) addItem(sim.player.inventory, i.id, i.n, 0)
      expect(hasInputs(sim.player.inventory, r), `${r.id} inputs`).toBe(true)
      const result = craft(sim.player.inventory, r, true)
      expect(result.ok, `${r.id}: ${result.message}`).toBe(true)
      expect(countItem(sim.player.inventory, r.output.id)).toBeGreaterThanOrEqual(r.output.n)
    }
  })
})

describe('requests — Haven asks for what it actually needs', () => {
  function hungrySettlement() {
    const sim = createSim(7)
    for (let i = 0; i < 4; i++) sim.spawnCreature(undefined, i * 2, 0)
    const victim = sim.creatures[0]
    victim.chem.hunger = 0.1
    victim.wallet = 0
    return { sim, victim }
  }

  it('posts nothing when nobody is in trouble', () => {
    const sim = createSim(3)
    const board = createBoard()
    for (let i = 0; i < 4; i++) {
      const c = sim.spawnCreature(undefined, i * 2, 0)
      c.chem.hunger = 0.9
      c.wallet = 50
      c.illness = 0
      c.chem.grief = 0
      c.psyche.belonging = 0.8
    }
    sim.economy.goods.bread.stock = 5
    scanRequests(sim, board, 1000)
    expect(board.open.filter((r) => r.kind === 'feed').length).toBe(0)
  })

  it('posts a request when somebody is hungry and broke, and closes it when fed', () => {
    const { sim, victim } = hungrySettlement()
    const board = createBoard()
    const progress = createProgress()

    scanRequests(sim, board, 1000)
    const feed = board.open.find((r) => r.kind === 'feed' && r.giverId === victim.id)
    expect(feed, 'no request was posted for the hungry one').toBeDefined()
    expect(objectiveFor(feed!)).toContain(victim.name)

    expect(acceptRequest(board, feed!.id)).toBeTruthy()
    expect(board.active.length).toBe(1)

    const before = progress.standing
    const outcome = onGive(sim, board, progress, victim.id, 'bread', 1010)
    expect(outcome).toBeTruthy()
    expect(board.active.length).toBe(0)
    expect(progress.deeds).toBe(1)
    expect(progress.standing).toBeGreaterThan(before)
    expect(victim.gratitude[0]).toBeGreaterThan(0)
  })

  it('will not let you take on more than three at once', () => {
    const sim = createSim(11)
    const board = createBoard()
    for (let i = 0; i < 6; i++) {
      const c = sim.spawnCreature(undefined, i * 3, 0)
      c.chem.hunger = 0.1
      c.wallet = 0
    }
    scanRequests(sim, board, 1000)
    let taken = 0
    for (const r of [...board.open]) if (acceptRequest(board, r.id)) taken++
    expect(taken).toBe(Math.min(MAX_ACTIVE, taken))
    expect(board.active.length).toBeLessThanOrEqual(MAX_ACTIVE)
  })

  it('treats sitting with the grieving as the whole request', () => {
    const sim = createSim(13)
    const board = createBoard()
    const progress = createProgress()
    const mourner = sim.spawnCreature(undefined, 0, 0)
    mourner.chem.grief = 0.8
    scanRequests(sim, board, 1000)
    const company = board.open.find((r) => r.kind === 'company')
    expect(company).toBeDefined()
    acceptRequest(board, company!.id)
    const griefBefore = mourner.chem.grief
    const outcome = onTalk(sim, board, progress, mourner.id, 1010)
    expect(outcome).toBeTruthy()
    expect(mourner.chem.grief).toBeLessThan(griefBefore)
  })

  it('pays out of the asker\u2019s own pocket, not from nowhere', () => {
    const sim = createSim(17)
    const board = createBoard()
    const progress = createProgress()
    const patient = sim.spawnCreature(undefined, 0, 0)
    patient.illness = 0.8
    patient.wallet = 30
    scanRequests(sim, board, 1000)
    const heal = board.open.find((r) => r.kind === 'heal')!
    acceptRequest(board, heal.id)
    const theirs = patient.wallet
    const mine = sim.player.wallet
    const outcome = onGive(sim, board, progress, patient.id, 'medicine', 1010)
    expect(outcome!.coins).toBeGreaterThan(0)
    expect(patient.wallet).toBe(theirs - outcome!.coins)
    expect(sim.player.wallet).toBe(mine + outcome!.coins)
    expect(patient.illness).toBeLessThan(0.4)
  })
})

describe('progress — what the visit adds up to', () => {
  it('names where you stand in the settlement', () => {
    expect(standingRank(0).title).toBe('Outsider')
    expect(standingRank(1).title).toBe('Keeper of the Well')
    expect(standingRank(0.5).title).not.toBe(standingRank(0.1).title)
  })

  it('is slower to forgive than to thank', () => {
    const up = createProgress()
    const down = createProgress()
    up.standing = 0.5
    down.standing = 0.5
    adjustStanding(up, 0.1)
    adjustStanding(down, -0.1)
    expect(up.standing - 0.5).toBeCloseTo(0.1, 5)
    expect(0.5 - down.standing).toBeCloseTo(0.16, 5)
    adjustStanding(down, -10)
    expect(down.standing).toBe(0)
    adjustStanding(up, 10)
    expect(up.standing).toBe(1)
  })

  it('writes each discovery down once', () => {
    const p = createProgress()
    expect(addJournal(p, { kind: 'landmark', tick: 1, title: 'The Well', text: 'x' })).toBeTruthy()
    expect(addJournal(p, { kind: 'landmark', tick: 9, title: 'The Well', text: 'x' })).toBeNull()
    expect(p.journal.length).toBe(1)
  })

  it('remembers who you have met', () => {
    const p = createProgress()
    expect(meet(p, 4)).toBe(true)
    expect(meet(p, 4)).toBe(false)
  })

  it('puts things down and picks them back up', () => {
    const p = createProgress()
    const prop = placeProp(p, 'lantern', 10, 2, 10, 0, 100)
    expect(propNear(p, 10.5, 10.5)).toBe(prop)
    expect(propNear(p, 40, 40)).toBeNull()
    expect(removeProp(p, prop.id)).toBe(prop)
    expect(p.placed.length).toBe(0)
  })

  it('reads an older save without losing the world', () => {
    const migrated = migrateProgress({ discovered: ['well'], standing: 0.4 })
    expect(migrated.discovered).toEqual(['well'])
    expect(migrated.standing).toBe(0.4)
    expect(migrated.hotbar.length).toBe(9)
    expect(migrated.journal).toEqual([])
  })
})

describe('lore — the valley has a history you can walk into', () => {
  it('gives every landmark a place, a hook, and a page', () => {
    for (const l of LANDMARKS) {
      expect(l.name.length).toBeGreaterThan(3)
      expect(l.short.length).toBeGreaterThan(10)
      expect(l.text.length).toBeGreaterThan(80)
      expect(l.radius).toBeGreaterThan(4)
    }
    expect(new Set(LANDMARKS.map((l) => l.id)).size).toBe(LANDMARKS.length)
  })

  it('finds the one you are standing next to', () => {
    const well = LANDMARKS.find((l) => l.id === 'well')!
    expect(landmarkNear(well.x, well.z)?.id).toBe('well')
    expect(landmarkNear(500, 500)).toBeNull()
  })

  it('spreads them out, so each is somewhere of its own', () => {
    // Some are deliberately neighbours — a toll house belongs at a bridge —
    // so what matters is that no two share a spot, and that standing at one
    // resolves to exactly one of them.
    for (let i = 0; i < LANDMARKS.length; i++) {
      for (let j = i + 1; j < LANDMARKS.length; j++) {
        const a = LANDMARKS[i]
        const b = LANDMARKS[j]
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} and ${b.id}`).toBeGreaterThan(9)
      }
    }
    for (const l of LANDMARKS) {
      expect(landmarkNear(l.x, l.z)?.id, `standing at ${l.id}`).toBe(l.id)
    }
  })

  it('puts one of them in the plaza, so the first is free', () => {
    expect(landmarkNear(0, 0)?.id).toBe('well')
    expect(findTower('food')).toBeDefined()
  })
})
