import { describe, expect, it } from 'vitest'
import { createSim, Sim } from './sim'
import { bodyRadius } from './creature'
import { buildingAt, isInside } from './village'
import { isWalkable, HALF } from './terrain'
import { discomfort } from './drives'

/** Run the world forward at a fixed step, the way the renderer does. */
function run(sim: Sim, seconds: number, step = 1 / 12): void {
  for (let t = 0; t < seconds; t += step) sim.tick(step)
}

describe('the valley runs', () => {
  it('keeps every creature on walkable ground', () => {
    const sim = createSim({ seed: 5 })
    run(sim, 240)
    for (const c of sim.creatures) {
      expect(Math.abs(c.x)).toBeLessThan(HALF)
      expect(Math.abs(c.z)).toBeLessThan(HALF)
      expect(isWalkable(c.x, c.z)).toBe(true)
    }
  })

  it('never leaves a creature standing inside a wall', () => {
    const sim = createSim({ seed: 6 })
    for (let t = 0; t < 300; t += 1 / 12) {
      sim.tick(1 / 12)
      for (const c of sim.creatures) {
        expect(sim.grid.isClear(c.x, c.z, bodyRadius(c) * 0.7)).toBe(true)
      }
    }
  })

  it('does not let anybody get stuck for long', () => {
    const sim = createSim({ seed: 7 })
    // sample where everybody is every ten seconds; nobody should still be
    // within a few centimetres of where they were a minute earlier
    const history = new Map<number, Array<{ x: number; z: number }>>()
    for (let i = 0; i < 30; i++) {
      run(sim, 10)
      for (const c of sim.creatures) {
        const list = history.get(c.id) ?? []
        list.push({ x: c.x, z: c.z })
        history.set(c.id, list)
      }
    }
    for (const [, samples] of history) {
      let longestStall = 0
      let stall = 0
      for (let i = 1; i < samples.length; i++) {
        const moved = Math.hypot(samples[i].x - samples[i - 1].x, samples[i].z - samples[i - 1].z)
        // asleep or resting counts as moving on, so allow a generous stall
        stall = moved < 0.2 ? stall + 1 : 0
        longestStall = Math.max(longestStall, stall)
      }
      expect(longestStall).toBeLessThan(12)
    }
  })

  it('lets a creature that starts inside a building get back out', () => {
    const sim = createSim({ seed: 8 })
    const building = sim.village.buildings[0]
    const c = sim.creatures[0]
    c.x = building.x
    c.z = building.z
    c.route = []
    c.target = null
    expect(isInside(building, c.x, c.z)).toBe(true)

    let escaped = false
    for (let t = 0; t < 90 && !escaped; t += 1 / 12) {
      sim.tick(1 / 12)
      if (!isInside(building, c.x, c.z)) escaped = true
    }
    expect(escaped).toBe(true)
  })

  it('recovers a creature wedged into a corner', () => {
    const sim = createSim({ seed: 9 })
    const b = sim.village.buildings[1]
    const c = sim.creatures[1]
    // shove them halfway into a wall, as a bad spawn or a physics glitch would
    c.x = b.x + b.width / 2
    c.z = b.z + b.depth / 2
    run(sim, 30)
    expect(sim.grid.isClear(c.x, c.z, bodyRadius(c) * 0.7)).toBe(true)
  })

  it('runs the clock and the day', () => {
    const sim = createSim({ seed: 10 })
    const before = sim.dayPhase
    run(sim, 300)
    expect(sim.dayPhase).not.toBeCloseTo(before, 3)
    expect(sim.darkness).toBeGreaterThanOrEqual(0)
    expect(sim.darkness).toBeLessThanOrEqual(1)
  })
})

describe('the creatures look after themselves', () => {
  it('brings the drives down rather than letting them all pin', () => {
    const sim = createSim({ seed: 11 })
    for (const c of sim.creatures) {
      c.drives.hunger = 0.85
      c.drives.thirst = 0.85
    }
    run(sim, 400)
    // at least most of them should have found food or water
    const fed = sim.creatures.filter((c) => c.drives.hunger < 0.8 || c.drives.thirst < 0.8)
    expect(fed.length).toBeGreaterThanOrEqual(sim.creatures.length - 1)
  })

  it('does not let the whole valley starve over a long run', () => {
    const sim = createSim({ seed: 12 })
    run(sim, 900)
    const worst = Math.max(...sim.creatures.map((c) => discomfort(c.drives)))
    expect(worst).toBeLessThan(0.55)
  })

  it('gets everybody to food and water rather than only some of them', () => {
    // The failure this guards against is subtle and was real: a creature would
    // choose to eat, set off, meet the back of a building, and lean on it
    // until it forgot what it was doing — for ever, at maximum hunger.
    const sim = createSim({ seed: 31 })
    const ate = new Set<number>()
    const drank = new Set<number>()
    const slept = new Set<number>()
    for (let t = 0; t < 900; t += 1 / 12) {
      sim.tick(1 / 12)
      for (const c of sim.creatures) {
        if (c.posture === 'eat') ate.add(c.id)
        if (c.posture === 'drink') drank.add(c.id)
        if (c.asleep) slept.add(c.id)
      }
    }
    expect(ate.size).toBe(sim.creatures.length)
    expect(drank.size).toBe(sim.creatures.length)
    expect(slept.size).toBeGreaterThanOrEqual(sim.creatures.length - 1)
  })

  it('walks around a building that is in the way instead of into it', () => {
    const sim = createSim({ seed: 32 })
    const longhouse = sim.village.buildings[0]
    const c = sim.creatures[0]
    // put them directly behind the longhouse, with the well beyond it
    c.x = longhouse.x
    c.z = longhouse.z + longhouse.depth / 2 + 3
    c.route = []
    c.target = null
    c.drives.thirst = 1

    let closest = Infinity
    for (let t = 0; t < 120; t += 1 / 12) {
      sim.tick(1 / 12)
      closest = Math.min(closest, Math.hypot(c.x, c.z))
    }
    // the well is at the origin; they have to get round the longhouse to reach it
    expect(closest).toBeLessThan(3)
  })

  it('sleeps when tired, rests, and wakes up again', () => {
    const sim = createSim({ seed: 13 })
    const c = sim.creatures[0]
    c.drives.fatigue = 0.95

    let slept = false
    for (let t = 0; t < 200 && !slept; t += 1 / 12) {
      sim.tick(1 / 12)
      if (c.asleep) slept = true
    }
    expect(slept).toBe(true)

    // sleeping has to actually work: keep ticking until they wake of their
    // own accord, and check they got the rest they went for
    let woke = false
    for (let t = 0; t < 120 && !woke; t += 1 / 12) {
      sim.tick(1 / 12)
      if (!c.asleep) woke = true
    }
    expect(woke).toBe(true)
    expect(c.drives.fatigue).toBeLessThan(0.3)
  })
})

describe('awareness of the player', () => {
  it('runs away when struck, and keeps running', () => {
    const sim = createSim({ seed: 14 })
    const c = sim.creatures[0]
    sim.player.x = c.x
    sim.player.z = c.z + 1.2
    const startDistance = sim.playerDistance(c)

    sim.strike(c)
    expect(c.action).toBe('flee')
    expect(c.drives.fear).toBeGreaterThan(0.5)
    expect(c.threat).toBeGreaterThan(0)

    run(sim, 6)
    expect(sim.playerDistance(c)).toBeGreaterThan(startDistance + 4)
  })

  it('learns to fear the player after repeated beatings', () => {
    const sim = createSim({ seed: 15 })
    const c = sim.creatures[0]

    for (let i = 0; i < 8; i++) {
      sim.player.x = c.x
      sim.player.z = c.z + 1
      sim.strike(c)
      run(sim, 8)
    }

    expect(c.threat).toBeGreaterThan(0.6)
    expect(c.trust).toBeLessThan(0.15)

    // and now, with no fresh pain at all, simply walking up to them is enough
    // to make them leave — which is the thing the player actually notices
    c.drives.fear = 0
    c.drives.pain = 0
    sim.player.x = c.x + 2.5
    sim.player.z = c.z
    const startDistance = sim.playerDistance(c)
    run(sim, 12)
    expect(sim.playerDistance(c)).toBeGreaterThan(startDistance + 5)
    expect(c.drives.fear).toBeGreaterThan(0)
  })

  it('does not make a Luma afraid of somebody who has been kind', () => {
    const sim = createSim({ seed: 33 })
    const c = sim.creatures[0]
    for (let i = 0; i < 6; i++) {
      sim.player.berries = 3
      sim.player.x = c.x + 1.5
      sim.player.z = c.z
      c.drives.hunger = 0.7
      sim.feed(c)
      run(sim, 5)
    }
    sim.player.x = c.x + 2.5
    sim.player.z = c.z
    const startDistance = sim.playerDistance(c)
    run(sim, 12)
    // they may wander, but they are not running for the treeline
    expect(sim.playerDistance(c)).toBeLessThan(startDistance + 14)
    expect(c.threat).toBeLessThan(0.15)
  })

  it('warms to the player when fed and petted', () => {
    const sim = createSim({ seed: 16 })
    const c = sim.creatures[0]
    const trustBefore = c.trust

    for (let i = 0; i < 6; i++) {
      sim.player.berries = 3
      sim.player.x = c.x
      sim.player.z = c.z + 1
      c.drives.hunger = 0.7
      sim.feed(c)
      sim.pet(c)
      run(sim, 4)
    }

    expect(c.trust).toBeGreaterThan(trustBefore + 0.25)
    expect(c.threat).toBeLessThan(0.1)
  })

  it('stops and listens when spoken to', () => {
    const sim = createSim({ seed: 17 })
    const c = sim.creatures[0]
    sim.player.x = c.x + 2
    sim.player.z = c.z
    c.vx = 2
    c.vz = 2

    const { listened } = sim.speakTo(c, ['hello'])
    expect(listened).toBe(true)
    expect(c.listening).toBe(true)

    run(sim, 1)
    expect(Math.hypot(c.vx, c.vz)).toBeLessThan(0.35)
    // and they turn to face you
    const toPlayer = Math.atan2(sim.player.x - c.x, sim.player.z - c.z)
    const off = Math.abs(((c.facing - toPlayer + Math.PI) % (Math.PI * 2)) - Math.PI)
    expect(off).toBeLessThan(0.5)
  })

  it('will not stop to listen if it is terrified of you', () => {
    const sim = createSim({ seed: 18 })
    const c = sim.creatures[0]
    sim.player.x = c.x + 1
    sim.player.z = c.z
    c.drives.fear = 0.9
    c.threat = 0.9

    const { listened } = sim.speakTo(c, ['hello'])
    expect(listened).toBe(false)
    expect(c.action).toBe('flee')
  })

  it('stops listening after a while so they get on with life', () => {
    const sim = createSim({ seed: 19 })
    const c = sim.creatures[0]
    sim.speakTo(c, ['hello'])
    expect(c.listening).toBe(true)
    run(sim, 8)
    expect(c.listening).toBe(false)
  })
})

describe('teaching', () => {
  it('teaches a word that then means something', () => {
    const sim = createSim({ seed: 20 })
    const c = sim.creatures[0]
    sim.player.x = c.x + 2
    sim.player.z = c.z

    sim.teach(c, 'come', 'approach')
    sim.teach(c, 'come', 'approach')
    const { obeyed, understanding } = sim.command(c, ['come'])
    expect(obeyed).toBe('approach')
    expect(understanding).toBeGreaterThan(0.2)
  })

  it('does nothing for a word they have never heard', () => {
    const sim = createSim({ seed: 21 })
    const c = sim.creatures[0]
    const { obeyed } = sim.command(c, ['flibbertigibbet'])
    expect(obeyed).toBeNull()
  })
})

describe('picking berries', () => {
  it('takes a berry from a bush and grows it back', () => {
    const sim = createSim({ seed: 22 })
    const bush = sim.village.places.find((p) => p.kind === 'food')!
    sim.player.berries = 0
    expect(sim.pickBerries(bush.x, bush.z)).toBe(true)
    expect(sim.player.berries).toBe(1)
    const after = bush.amount ?? 0
    run(sim, 60)
    expect(bush.amount ?? 0).toBeGreaterThan(after)
  })

  it('will not pick from thin air', () => {
    const sim = createSim({ seed: 23 })
    expect(sim.pickBerries(90, 90)).toBe(false)
  })
})

describe('events', () => {
  it('reports what happened and then forgets it', () => {
    const sim = createSim({ seed: 24 })
    sim.strike(sim.creatures[0])
    const events = sim.takeEvents()
    expect(events.some((e) => e.type === 'hurt')).toBe(true)
    expect(sim.takeEvents()).toHaveLength(0)
  })

  it('never lets the queue grow without bound', () => {
    const sim = createSim({ seed: 25 })
    for (let i = 0; i < 500; i++) sim.emit('chirp', 0, 0, 0, 1)
    expect(sim.events.length).toBeLessThanOrEqual(64)
  })
})

describe('the buildings are usable', () => {
  it('lets creatures go inside and come out again over a long day', () => {
    const sim = createSim({ seed: 26 })
    let everInside = false
    for (let t = 0; t < 600; t += 1 / 12) {
      sim.tick(1 / 12)
      for (const c of sim.creatures) {
        if (buildingAt(sim.village, c.x, c.z)) everInside = true
      }
    }
    expect(everInside).toBe(true)
    // and by the end nobody is trapped
    run(sim, 120)
    for (const c of sim.creatures) {
      expect(sim.grid.isClear(c.x, c.z, bodyRadius(c) * 0.7)).toBe(true)
    }
  })
})
