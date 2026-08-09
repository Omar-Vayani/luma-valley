import { describe, expect, it } from 'vitest'
import { Game } from './game'
import { saveSizeKb } from './save'

describe('game', () => {
  it('spawns creatures and ticks them alive', () => {
    const g = new Game(123)
    g.spawnInitial(5)
    expect(g.creatures.length).toBe(5)
    for (let i = 0; i < 300; i++) g.tick()
    const alive = g.creatures.filter((c) => c.alive).length
    expect(alive).toBeGreaterThan(0)
  })

  it('time advances and world day cycles', () => {
    const g = new Game(7)
    g.spawnInitial(3)
    for (let i = 0; i < 100; i++) g.tick()
    expect(g.time).toBe(100)
    expect(g.world.state.dayTime).toBeGreaterThan(0)
  })

  it('teach + speak round-trip', () => {
    const g = new Game(9)
    g.spawnInitial(2)
    const id = g.creatures[0].id
    expect(g.teach(id, 'berry', 'food')).toBe(true)
    // speaking an unknown word teaches "come"
    expect(g.speak(id, 'come')).toBe(true)
    expect(g.creatures[0].learnedWords['berry']).toBeTruthy()
  })

  it('offers a low-pressure greeting that improves connection', () => {
    const g = new Game(33)
    g.spawnInitial(1)
    const citizen = g.creatures[0]
    citizen.chem.loneliness = .8
    const trust = citizen.psyche.trust
    const result = g.greet(citizen.id)
    expect(result.ok).toBe(true)
    expect(citizen.chem.loneliness).toBeLessThan(.8)
    expect(citizen.psyche.trust).toBeGreaterThan(trust)
  })

  it('spawns night threats inside the city and within hunting range', () => {
    const g = new Game(77)
    g.spawnInitial(5)
    g.world.state.dayTime = .8
    for (let i = 0; i < 205; i++) g.tick()
    expect(g.shadowBeasts.length).toBeGreaterThan(0)
    const beast = g.shadowBeasts[0]
    expect(Math.abs(beast.state.pos.x)).toBeLessThan(70)
    expect(Math.abs(beast.state.pos.z)).toBeLessThan(70)
    const nearest = Math.min(...g.creatures.filter((creature) => creature.alive).map((creature) => Math.hypot(creature.pos.x - beast.state.pos.x, creature.pos.z - beast.state.pos.z)))
    expect(nearest).toBeLessThan(40)
  })

  it('save/load preserves world', () => {
    const g = new Game(42)
    g.spawnInitial(4)
    for (let i = 0; i < 120; i++) g.tick()
    g.player.pos = { x: 7, z: -8 }
    const save = g.save()
    const g2 = new Game(0)
    g2.load(save)
    expect(g2.world.state.seed).toBe(42)
    expect(g2.creatures.length).toBe(g.creatures.length)
    expect(g2.time).toBe(120)
    expect(g2.creatures[0].name).toBe(g.creatures[0].name)
    expect(g2.player.pos).toEqual({ x: 7, z: -8 })
  })

  it('migrates pre-city saves to a visible city arrival', () => {
    const old = new Game(12)
    old.spawnInitial(3)
    const save = old.save()
    for (const creature of save.creatures) delete creature.urban
    save.player.pos = { x: 48, z: 48 }
    const city = new Game(0)
    city.load(save)
    expect(city.world.state.size).toBe(96)
    expect(city.player.pos).toEqual({ x: 0, z: -14 })
    expect(city.creatures.every((creature) => creature.pos.z <= -20 && creature.pos.z >= -21.4)).toBe(true)
    expect(city.quests.active).toBe('q1_feed')
  })

  it('preserves quest progress when expanding a compact city save', () => {
    const compact = new Game(14, 60)
    compact.spawnInitial(2)
    compact.quests = {
      active: 'q2_teach',
      progress: { q1_feed: 1, q2_teach: 0 },
      completed: ['q1_feed'],
      unlocked: ['q1_feed', 'q2_teach'],
    }
    const restored = new Game(0)
    restored.load(compact.save())
    expect(restored.world.state.size).toBe(96)
    expect(restored.quests).toEqual(compact.quests)
  })

  it('save stays small', () => {
    const g = new Game(5)
    g.spawnInitial(6)
    for (let i = 0; i < 500; i++) g.tick()
    expect(saveSizeKb(g.save())).toBeLessThan(80)
  })

  it('gentle mode: creatures survive long runs', () => {
    const g = new Game(3, 40, { gentle: true })
    g.spawnInitial(6)
    for (let i = 0; i < 3000; i++) g.tick()
    // with gentle mode, old age still kills, but none should starve early
    expect(g.creatures.filter((c) => c.alive).length).toBeGreaterThanOrEqual(1)
  })

  it('normal mode: the old city provides reachable food for citizens', () => {
    const g = new Game(1)
    g.spawnInitial(5)
    // a citizen standing on the spawn street can find an edible berry bush
    const f = g.world.nearestFood({ x: 0, z: -20 })
    expect(f).not.toBeNull()
  })

  it('normal mode: no starvation/thirst deaths before the old-age window', () => {
    const g = new Game(123)
    g.spawnInitial(5)
    for (let i = 0; i < 1200; i++) g.tick()
    // routine hunger/thirst must not kill anyone before age 1200, when old age
    // becomes possible. Violence/toxins may still kill, but not routine needs.
    const starved = g.creatures.filter(
      (c) => !c.alive && c.journal.some((j) => j.text.includes('passes away (weakness)')),
    )
    expect(starved.length).toBe(0)
  })

  it('normal mode: a child born mid-soak can forage and survives its first day', () => {
    // regression: child Fifi6 (id 6) used to get stuck against a building wall
    // west of the park, unable to reach seeded berries, and died of weakness
    const g = new Game(123)
    g.spawnInitial(5)
    for (let i = 0; i < 1200; i++) g.tick()
    const child = g.creatures.find((c) => c.id >= 6)
    expect(child).toBeDefined()
    expect(child!.alive).toBe(true)
    // it must have actually eaten — a food episode is recorded per successful bite
    expect(child!.mind.episodes.some((e) => e.kind === 'food')).toBe(true)
  })

  it('normal mode: city social fights are throttled and bounded (no quick kills)', () => {
    // two furious adults forced together; fights must be rare and cheap so the
    // pair cannot kill each other quickly, while still logging the conflict
    const g = new Game(55, 96, { gentle: false, societyInterval: 1e9 }) // isolate the city encounter path
    g.spawnInitial(2)
    const a = g.creatures[0]
    const b = g.creatures[1]
    a.chem.health = 1
    b.chem.health = 1
    a.urban.emotions.anger = 1
    b.urban.emotions.anger = 1
    a.urban.socialCooldown = 0
    b.urban.socialCooldown = 0
    for (let i = 0; i < 600; i++) {
      g.tick()
      // keep the pair locked in contact (restorePersonalSpace pushes apart),
      // keep routine needs at bay so health only reflects fight damage, and
      // re-raise anger (updateEmotions recalculates it to ~0 from calm inputs)
      a.pos = { x: 0, z: 0 }
      b.pos = { x: 0.6, z: 0 }
      a.chem.hunger = 0.3
      b.chem.hunger = 0.3
      a.chem.thirst = 0.3
      b.chem.thirst = 0.3
      a.urban.emotions.anger = 1
      b.urban.emotions.anger = 1
    }
    const fightTimes = (c: { journal: { tick: number; text: string }[] }) =>
      c.journal.filter((j) => j.text.includes('fights with')).map((j) => j.tick)
    const timesA = fightTimes(a)
    const timesB = fightTimes(b)
    // the pair must actually clash at least once
    expect(timesA.length).toBeGreaterThanOrEqual(1)
    expect(timesA.length).toBe(timesB.length)
    // ~240-tick pair cooldown: consecutive brawls are far apart
    for (let i = 1; i < timesA.length; i++) {
      expect(timesA[i] - timesA[i - 1]).toBeGreaterThanOrEqual(240)
    }
    expect(a.alive).toBe(true)
    expect(b.alive).toBe(true)
    // bounded harm (0.008 + anger*0.012 ≤ 0.02 per brawl) leaves both healthy
    expect(a.chem.health).toBeGreaterThan(0.9)
    expect(b.chem.health).toBeGreaterThan(0.9)
  })

  it('normal mode: citizens eat and drink, and the population survives long runs', () => {
    const g = new Game(123)
    g.spawnInitial(5)
    for (let i = 0; i < 3000; i++) g.tick()
    const alive = g.creatures.filter((c) => c.alive).length
    expect(alive).toBeGreaterThanOrEqual(1)
    // berry bushes log no journal line (unless the creature is full), so eating
    // is detected via the food episode the world records on every successful bite
    const ate = g.creatures.some(
      (c) =>
        c.mind.episodes.some((e) => e.kind === 'food') ||
        c.journal.some(
          (j) =>
            j.text.includes('is full') ||
            j.text.includes('uses Market Bread') ||
            j.text.includes('ate something bad'),
        ),
    )
    const drank = g.creatures.some(
      (c) =>
        c.journal.some((j) => j.text.includes('drinks from the fountain')) ||
        c.journal.some((j) => j.text.includes('rests beside the Ashen Park fountain')),
    )
    expect(ate).toBe(true)
    expect(drank).toBe(true)
  })

  it('normal mode: a thirsty citizen far from the park can still reach the fountain and drink', () => {
    const g = new Game(1)
    g.spawnInitial(1)
    const c = g.creatures[0]
    // 37 units from the park fountain — far beyond the old 12-unit water sensor
    // range, but a realistic mid-city distance. 800 ticks stays inside the first
    // day (night begins at tick 1320), so this deterministically tests water
    // reachability, not night-time violence.
    c.pos = { x: 25, z: 0 }
    c.chem.hunger = 0.2
    c.chem.thirst = 0.7
    let minThirst = 1
    for (let i = 0; i < 800 && c.alive; i++) {
      g.tick()
      minThirst = Math.min(minThirst, c.chem.thirst)
    }
    expect(c.alive).toBe(true)
    // thirst must have dropped well below its starting value: it found water
    expect(minThirst).toBeLessThan(0.6)
  })

  it('feed reduces hunger and reinforces', () => {
    const g = new Game(13)
    g.spawnInitial(2)
    const c = g.creatures[0]
    c.chem.hunger = 0.9
    expect(g.feed(c.id)).toBe(true)
    expect(c.chem.hunger).toBeLessThan(0.5)
    expect(c.chem.pleasure).toBeGreaterThan(0.3)
    expect(c.journal.some((j) => j.text.includes('hand-fed'))).toBe(true)
  })

  it('tickle raises pleasure', () => {
    const g = new Game(14)
    g.spawnInitial(2)
    const c = g.creatures[0]
    expect(g.tickle(c.id)).toBe(true)
    expect(c.chem.pleasure).toBeGreaterThan(0.2)
  })

  it('carried creature stays put while brain ticks', () => {
    const g = new Game(15)
    g.spawnInitial(3)
    const c = g.creatures[0]
    g.setCarried(c.id)
    const before = { ...c.pos }
    for (let i = 0; i < 40; i++) g.tick()
    expect(c.pos.x).toBeCloseTo(before.x, 6)
    expect(c.pos.z).toBeCloseTo(before.z, 6)
    expect(c.age).toBe(40)
    g.setCarried(null)
  })

  it('breeding happens and produces children with mixed genomes', () => {
    // place two adults next to each other, force fertility, let the sim run
    const g = new Game(77)
    g.spawnInitial(2)
    const a = g.creatures[0]
    const b = g.creatures[1]
    a.age = 1000
    b.age = 1000
    a.chem.health = 1
    b.chem.health = 1
    a.traits.fertility = 1
    b.traits.fertility = 1
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 2, z: 0 }
    const initialCount = g.creatures.length
    let born = false
    for (let i = 0; i < 1200 && !born; i++) {
      g.tick()
      if (g.creatures.length > initialCount) born = true
    }
    expect(born).toBe(true)
    const child = g.creatures.find((c) => c.age === 0 && c.id >= 3)
    expect(child).toBeTruthy()
    expect(child!.genome.genes.length).toBeGreaterThan(0)
  })
})

describe('game society integration', () => {
  it('creates one society NPC per creature with matching ids', () => {
    const g = new Game(202)
    g.spawnInitial(4)
    expect(Object.keys(g.society.npcs).length).toBe(4)
    for (const c of g.creatures) {
      expect(g.society.npcs[c.id]).toBeDefined()
      expect(g.society.npcs[c.id].alive).toBe(true)
    }
  })

  it('ticks society at a throttled cadence (default ~0.5 Hz at 6 tps)', () => {
    const g = new Game(203)
    g.spawnInitial(2)
    for (let i = 0; i < 11; i++) g.tick()
    expect(g.society.tick).toBe(0)
    g.tick() // 12th tick
    expect(g.society.tick).toBe(1)
    for (let i = 0; i < 12; i++) g.tick()
    expect(g.society.tick).toBe(2)
  })

  it('societyInterval=1 steps society every game tick', () => {
    const g = new Game(204, 96, { gentle: false, societyInterval: 1 })
    g.spawnInitial(2)
    for (let i = 0; i < 5; i++) g.tick()
    expect(g.society.tick).toBe(5)
  })

  it('work wages accumulate per society tick', () => {
    const g = new Game(205, 96, { gentle: true, societyInterval: 1 })
    g.spawnInitial(3)
    // force hoard argmax on every npc so no money is spent/stolen — the only
    // wallet movement is the deterministic wage
    for (const c of g.creatures) {
      const n = g.society.npcs[c.id]
      n.traits.greed = 0.95
      n.traits.trust = 0.1
      n.traits.betrayal = 0.1
      n.traits.fear = 0.5
      n.traits.attachment = 0
      n.traits.love = 0
    }
    g.society.config.temperature = 0.01
    const before = g.creatures.map((c) => g.society.npcs[c.id].wallet)
    for (let i = 0; i < 5; i++) g.tick()
    g.creatures.forEach((c, i) => {
      expect(g.society.npcs[c.id].wallet).toBe(before[i] + 5 * g.society.config.wage)
    })
  })

  it('market purchases map into creature hunger and consume the item', () => {
    const g = new Game(206, 96, { gentle: true, societyInterval: 1 })
    g.spawnInitial(2)
    const a = g.creatures[0]
    a.chem.hunger = 0.9
    const npc = g.society.npcs[a.id]
    npc.traits.trust = 0.9
    npc.traits.greed = 0.2
    npc.traits.fear = 0.2
    npc.traits.betrayal = 0.1
    npc.traits.attachment = 0.3
    npc.traits.love = 0.2
    g.society.config.temperature = 0.01
    g.tick()
    const buy = g.society.events.find((e) => e.kind === 'trade' && e.direction === 'buy' && e.actorId === a.id)
    expect(buy).toBeTruthy()
    expect(buy!.item).toBe('berry')
    expect(g.society.npcs[a.id].inventory.items.berry ?? 0).toBe(0) // consumed
    expect(a.chem.hunger).toBeLessThan(0.6)
  })

  it('society fights apply bounded existing damage without instant kills', () => {
    const g = new Game(207, 96, { gentle: true, societyInterval: 1 })
    g.spawnInitial(2)
    const a = g.creatures[0]
    const b = g.creatures[1]
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 1.5, z: 0 }
    const na = g.society.npcs[a.id]
    na.traits.betrayal = 0.9
    na.traits.greed = 0.9
    na.traits.fear = 0.1
    na.traits.trust = 0.1
    // B hoards so its own society action never buys a berry that heals the
    // punch back up — the fight damage assertion stays deterministic
    const nb = g.society.npcs[b.id]
    nb.traits.greed = 0.95
    nb.traits.trust = 0.1
    nb.traits.betrayal = 0.1
    nb.traits.fear = 0.5
    nb.traits.attachment = 0
    nb.traits.love = 0
    g.society.config.temperature = 0.01
    expect(g.society.config.fightKillChance).toBe(0)
    const healthBefore = b.chem.health
    g.tick()
    const fight = g.society.events.find((e) => e.kind === 'fight' && e.actorId === a.id)
    expect(fight).toBeTruthy()
    expect(b.alive).toBe(true)
    expect(b.chem.health).toBeLessThan(healthBefore)
    expect(b.chem.pain).toBeGreaterThan(0.2)
    expect(g.society.npcs[b.id].alive).toBe(true)
    expect(g.society.events.some((e) => e.kind === 'death' && e.actorId === b.id)).toBe(false)
  })

  it('births create society NPCs for children', () => {
    const g = new Game(208)
    g.spawnInitial(2)
    const a = g.creatures[0]
    const b = g.creatures[1]
    a.age = 1000
    b.age = 1000
    a.chem.health = 1
    b.chem.health = 1
    a.traits.fertility = 1
    b.traits.fertility = 1
    a.pos = { x: 0, z: 0 }
    b.pos = { x: 2, z: 0 }
    const initial = g.creatures.length
    let born = false
    for (let i = 0; i < 1200 && !born; i++) {
      g.tick()
      if (g.creatures.length > initial) born = true
    }
    expect(born).toBe(true)
    const child = g.creatures.find((c) => c.age === 0 && c.id >= 3)
    expect(child).toBeTruthy()
    expect(g.society.npcs[child!.id]).toBeDefined()
    expect(g.society.npcs[child!.id].alive).toBe(true)
  })

  it('death syncs to society permanently and survives save/load', () => {
    const g = new Game(209)
    g.spawnInitial(3)
    for (let i = 0; i < 24; i++) g.tick()
    const victim = g.creatures[0]
    const survivor = g.creatures[1]
    victim.die('old age')
    g.tick() // next society step syncs the death
    expect(g.society.npcs[victim.id].alive).toBe(false)
    const save = g.save()
    expect(save.extra?.society).toBeDefined()
    const g2 = new Game(0)
    g2.load(save)
    expect(g2.society.npcs[victim.id].alive).toBe(false)
    expect(g2.society.npcs[survivor.id].alive).toBe(true)
    expect(g2.society.tick).toBe(g.society.tick)
  })

  it('old saves without society migrate with deterministic defaults', () => {
    const g = new Game(210)
    g.spawnInitial(3)
    for (let i = 0; i < 24; i++) g.tick()
    const save = g.save()
    delete (save.extra as { society?: unknown }).society
    const g2 = new Game(0)
    g2.load(save)
    expect(g2.society).toBeDefined()
    expect(Object.keys(g2.society.npcs).length).toBe(3)
    for (const c of g2.creatures) {
      expect(g2.society.npcs[c.id]).toBeDefined()
      expect(g2.society.npcs[c.id].alive).toBe(c.alive)
    }
  })

  it('game save with exactly six npcs stays under 70 KB', () => {
    const g = new Game(211)
    g.spawnInitial(6)
    // keep the population at exactly six: births would make this a 13-NPC save,
    // which has its own per-NPC budget — this test measures the six-NPC bound
    ;(g as unknown as { breedCooldown: number }).breedCooldown = Number.MAX_SAFE_INTEGER
    for (let i = 0; i < 500; i++) g.tick()
    expect(g.creatures.length).toBe(6)
    expect(saveSizeKb(g.save()) * 1024).toBeLessThan(70000)
  })

  it('society query APIs expose summary, profiles, and recent events', () => {
    const g = new Game(212)
    g.spawnInitial(3)
    for (let i = 0; i < 36; i++) g.tick()
    const summary = g.societySummary()
    expect(summary.population).toBe(3)
    expect(summary.alive).toBe(3)
    expect(summary.market.length).toBeGreaterThan(0)
    expect(summary.market[0].price).toBeGreaterThan(0)
    expect(Array.isArray(summary.bonds)).toBe(true)
    const profile = g.societyProfile(g.creatures[0].id)
    expect(profile).not.toBeNull()
    expect(profile!.name).toBe(g.creatures[0].name)
    expect(typeof profile!.wallet).toBe('number')
    expect(Array.isArray(profile!.relationships)).toBe(true)
    const events = g.societyRecentEvents(5)
    expect(events.length).toBeLessThanOrEqual(5)
    expect(events.length).toBeGreaterThan(0)
    expect(typeof events[0].kind).toBe('string')
  })
})

describe('game observer tools', () => {
  it('exports the six overseer tools', () => {
    // compile-time check via the type: the union must cover all six tools
    const tools: Array<Parameters<Game['useOverseerTool']>[1]> = ['stick', 'whip', 'heal', 'feed', 'comfort', 'amuse']
    expect(tools.length).toBe(6)
  })

  it('observer tools are inexhaustible and never add to the player inventory', () => {
    const g = new Game(301)
    g.spawnInitial(2)
    const c = g.creatures[0]
    const before = JSON.stringify(g.player.inventory)
    const tools: Array<Parameters<Game['useOverseerTool']>[1]> = ['feed', 'heal', 'comfort', 'amuse', 'stick', 'whip']
    for (const tool of tools) {
      const r = g.useOverseerTool(c.id, tool)
      expect(r.ok).toBe(true)
    }
    // no item was ever collected into the observer's hands
    expect(JSON.stringify(g.player.inventory)).toBe(before)
  })

  it('feed eases hunger and builds citizen trust', () => {
    const g = new Game(302)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.hunger = 0.9
    const trust = c.psyche.trust
    const r = g.useOverseerTool(c.id, 'feed')
    expect(r.ok).toBe(true)
    expect(r.msg).toContain(c.name)
    expect(c.chem.hunger).toBeLessThan(0.5)
    expect(c.psyche.trust).toBeGreaterThan(trust)
  })

  it('heal restores health and eases pain', () => {
    const g = new Game(303)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.health = 0.4
    c.chem.pain = 0.7
    const trust = c.psyche.trust
    const r = g.useOverseerTool(c.id, 'heal')
    expect(r.ok).toBe(true)
    expect(c.chem.health).toBeGreaterThan(0.4)
    expect(c.chem.pain).toBeLessThan(0.7)
    expect(c.psyche.trust).toBeGreaterThan(trust)
  })

  it('comfort eases fear and loneliness and builds trust', () => {
    const g = new Game(304)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.fear = 0.7
    c.chem.loneliness = 0.8
    const trust = c.psyche.trust
    g.useOverseerTool(c.id, 'comfort')
    expect(c.chem.fear).toBeLessThan(0.7)
    expect(c.chem.loneliness).toBeLessThan(0.8)
    expect(c.psyche.trust).toBeGreaterThan(trust)
  })

  it('amuse eases boredom and loneliness', () => {
    const g = new Game(305)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.boredom = 0.9
    c.chem.loneliness = 0.8
    g.useOverseerTool(c.id, 'amuse')
    expect(c.chem.boredom).toBeLessThan(0.6)
    expect(c.chem.loneliness).toBeLessThan(0.8)
  })

  it('stick deals bounded harm plus fear/pain/trust loss', () => {
    const g = new Game(306)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.health = 1
    c.chem.pain = 0
    c.chem.fear = 0
    const trust = c.psyche.trust
    const r = g.useOverseerTool(c.id, 'stick')
    expect(r.ok).toBe(true)
    expect(c.alive).toBe(true)
    expect(c.chem.health).toBeGreaterThan(0.9) // bounded harm
    expect(c.chem.pain).toBeGreaterThan(0.1)
    expect(c.chem.fear).toBeGreaterThan(0.2)
    expect(c.psyche.trust).toBeLessThan(trust)
  })

  it('whip is stronger than stick across harm, pain, fear and trust', () => {
    const g = new Game(307)
    g.spawnInitial(2)
    const stickVictim = g.creatures[0]
    const whipVictim = g.creatures[1]
    stickVictim.chem.health = 1
    whipVictim.chem.health = 1
    stickVictim.chem.pain = 0
    whipVictim.chem.pain = 0
    stickVictim.chem.fear = 0
    whipVictim.chem.fear = 0
    g.useOverseerTool(stickVictim.id, 'stick')
    g.useOverseerTool(whipVictim.id, 'whip')
    expect(whipVictim.chem.health).toBeLessThan(stickVictim.chem.health)
    expect(whipVictim.chem.pain).toBeGreaterThan(stickVictim.chem.pain)
    expect(whipVictim.chem.fear).toBeGreaterThan(stickVictim.chem.fear)
    expect(whipVictim.psyche.trust).toBeLessThan(stickVictim.psyche.trust)
  })

  it('repeated whipping kills only through health reaching zero — no magic counter', () => {
    const g = new Game(308)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.health = 1
    let lashes = 0
    for (let i = 0; i < 30 && c.alive; i++) {
      g.useOverseerTool(c.id, 'whip')
      lashes++
    }
    // each lash costs a bounded 0.07 health, so death needs ~15 blows —
    // ordinary accumulated damage, never an instant or counter-forced kill
    expect(c.alive).toBe(false)
    expect(lashes).toBeGreaterThanOrEqual(14)
    expect(c.journal.some((j) => j.text.includes('cruelty'))).toBe(true)
    expect(g.society.npcs[c.id].alive).toBe(false)
    // death is permanent: further tools refuse
    const again = g.useOverseerTool(c.id, 'whip')
    expect(again.ok).toBe(false)
  })

  it('a single whip on a healthy citizen is survivable', () => {
    const g = new Game(314)
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.health = 1
    const r = g.useOverseerTool(c.id, 'whip')
    expect(r.ok).toBe(true)
    expect(c.alive).toBe(true)
    expect(c.chem.health).toBeGreaterThan(0.9) // bounded: 0.93 after one lash
  })

  it('gentle mode suppresses lethal cruelty', () => {
    const g = new Game(309, 96, { gentle: true })
    g.spawnInitial(1)
    const c = g.creatures[0]
    c.chem.health = 0.03
    g.useOverseerTool(c.id, 'whip')
    expect(c.alive).toBe(true)
    expect(c.chem.health).toBeGreaterThan(0)
  })

  it('nearby living witnesses within 7m learn kindness from beneficial tools', () => {
    const g = new Game(310)
    g.spawnInitial(3)
    const target = g.creatures[0]
    const witness = g.creatures[1]
    const far = g.creatures[2]
    target.pos = { x: 0, z: 0 }
    witness.pos = { x: 2, z: 0 } // within 7m
    far.pos = { x: 20, z: 20 } // beyond 7m
    witness.psyche.trust = 0.5
    far.psyche.trust = 0.5
    witness.chem.fear = 0.3
    const wTrust = witness.psyche.trust
    const wFear = witness.chem.fear
    const fTrust = far.psyche.trust
    const fFear = far.chem.fear
    g.useOverseerTool(target.id, 'feed')
    expect(witness.psyche.trust).toBeGreaterThan(wTrust)
    expect(witness.chem.fear).toBeLessThan(wFear)
    expect(witness.mind.episodes.some((e) => e.kind === 'player-kind')).toBe(true)
    // out of range witnesses learn nothing
    expect(far.psyche.trust).toBe(fTrust)
    expect(far.chem.fear).toBe(fFear)
  })

  it('nearby living witnesses learn cruelty from harmful tools', () => {
    const g = new Game(311)
    g.spawnInitial(3)
    const target = g.creatures[0]
    const witness = g.creatures[1]
    const far = g.creatures[2]
    target.pos = { x: 0, z: 0 }
    witness.pos = { x: 3, z: 0 }
    far.pos = { x: 20, z: 20 }
    witness.psyche.trust = 0.6
    far.psyche.trust = 0.6
    const wTrust = witness.psyche.trust
    const wFear = witness.chem.fear
    const fTrust = far.psyche.trust
    const fFear = far.chem.fear
    g.useOverseerTool(target.id, 'whip')
    expect(witness.psyche.trust).toBeLessThan(wTrust)
    expect(witness.chem.fear).toBeGreaterThan(wFear)
    expect(witness.mind.episodes.some((e) => e.kind === 'player-cruel')).toBe(true)
    expect(far.psyche.trust).toBe(fTrust)
    expect(far.chem.fear).toBe(fFear)
  })

  it('dead witnesses never learn from an intervention', () => {
    const g = new Game(312)
    g.spawnInitial(2)
    const target = g.creatures[0]
    const dead = g.creatures[1]
    dead.pos = { x: 2, z: 0 }
    dead.die('old age')
    const trust = dead.psyche.trust
    const fear = dead.chem.fear
    g.useOverseerTool(target.id, 'feed')
    expect(dead.psyche.trust).toBe(trust)
    expect(dead.chem.fear).toBe(fear)
  })

  it('visitPlace is informational only and never adds player inventory', () => {
    const g = new Game(313)
    g.spawnInitial(1)
    const before = JSON.stringify(g.player.inventory)
    const places = ['market', 'tavern', 'park', 'apothecary', 'homes', 'watch', 'back-alley', 'hospital', 'restaurant'] as const
    for (const place of places) {
      const r = g.visitPlace(place)
      expect(r.ok).toBe(true)
      expect(r.msg.length).toBeGreaterThan(0)
    }
    // observer notes carry real purpose, not a handout
    expect(g.visitPlace('market').msg).toContain('vending tables')
    expect(g.visitPlace('park').msg).toContain('fountain')
    expect(g.visitPlace('watch').msg).toContain('Weigh-House')
    expect(g.visitPlace('apothecary').msg).toContain('treatment')
    expect(JSON.stringify(g.player.inventory)).toBe(before)
  })
})
