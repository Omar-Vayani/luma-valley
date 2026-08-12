import { beforeAll, describe, expect, it } from 'vitest'
import { interpret, talk, tokenize, idleUtterance } from './speech'
import { createSim } from './sim'
import { ChatStore, deserialize, serialize } from './save'
import { meaningOf } from './brain'

/**
 * Node has no localStorage, and stubbing the store out would test nothing.
 * This is a real implementation of the bit of the API we use, so the save and
 * load paths are actually run.
 */
function installMemoryStorage(): void {
  const data = new Map<string, string>()
  const memory: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
  Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true })
}

beforeAll(installMemoryStorage)

describe('reading what the player typed', () => {
  it('splits a line into words', () => {
    expect(tokenize("Hello, Pip! How's it going?")).toEqual(['hello', 'pip', "how's", 'it', 'going'])
  })

  it('recognises the things people actually say', () => {
    expect(interpret('hello').intent).toBe('greet')
    expect(interpret('hi there').intent).toBe('greet')
    expect(interpret('bye').intent).toBe('farewell')
    expect(interpret('good boy').intent).toBe('praise')
    expect(interpret('no! bad').intent).toBe('scold')
    expect(interpret('what is your name').intent).toBe('askName')
    expect(interpret('how are you').intent).toBe('askFeel')
    expect(interpret('what are you doing').intent).toBe('askDoing')
    expect(interpret('thanks').intent).toBe('thanks')
  })

  it('picks the word out of a teaching sentence', () => {
    const read = interpret('this is a berry')
    expect(read.intent).toBe('teach')
    expect(read.teaching).toBe('berry')
  })

  it('treats anything else as something to try to obey', () => {
    expect(interpret('come here').intent).toBe('command')
  })

  it('does not mistake a long sentence containing "hi" for a greeting', () => {
    expect(interpret('i think the hill is high over there really').intent).not.toBe('greet')
  })
})

describe('answering', () => {
  it('answers immediately and never with an empty line', () => {
    const sim = createSim({ seed: 30 })
    const c = sim.creatures[0]
    sim.player.x = c.x + 2
    sim.player.z = c.z

    for (const line of [
      'hello', 'how are you', 'what are you doing', 'what is your name',
      'good boy', 'no', 'come here', 'this is a berry', 'bye', 'thanks',
      'asdfgh', '',
    ]) {
      const started = Date.now()
      const reply = talk(sim, c, line)
      expect(reply.text.length).toBeGreaterThan(0)
      // "instant" means instant: no awaiting anything
      expect(Date.now() - started).toBeLessThan(50)
    }
  })

  it('says hello back', () => {
    const sim = createSim({ seed: 31 })
    const c = sim.creatures[0]
    sim.player.x = c.x + 2
    sim.player.z = c.z
    const reply = talk(sim, c, 'hello')
    expect(reply.intent).toBe('greet')
    expect(c.listening).toBe(true)
  })

  it('backs away instead of chatting if it is frightened of you', () => {
    const sim = createSim({ seed: 32 })
    const c = sim.creatures[0]
    c.drives.fear = 0.9
    c.threat = 0.9
    const reply = talk(sim, c, 'hello')
    expect(reply.obeyed).toBe('flee')
    expect(c.listening).toBe(false)
  })

  it('says how it feels, out of its actual drives', () => {
    const sim = createSim({ seed: 33 })
    const c = sim.creatures[0]
    for (const k of Object.keys(c.drives) as Array<keyof typeof c.drives>) c.drives[k] = 0.02
    c.drives.thirst = 0.95
    const reply = talk(sim, c, 'how are you')
    expect(reply.text.toLowerCase()).toContain('thirsty')
  })

  it('rewards the creature when praised and does not frighten it when scolded', () => {
    const sim = createSim({ seed: 34 })
    const c = sim.creatures[0]
    const trust = c.trust
    talk(sim, c, 'good boy')
    expect(c.trust).toBeGreaterThan(trust)

    const fear = c.drives.fear
    talk(sim, c, 'no')
    expect(c.drives.fear).toBeLessThanOrEqual(fear + 0.001)
    expect(c.threat).toBeLessThan(0.2)
  })

  it('learns a word when taught one, and reports what it thinks it means', () => {
    const sim = createSim({ seed: 35 })
    const c = sim.creatures[0]
    const reply = talk(sim, c, 'this is a nibble')
    expect(reply.learned).toBe('nibble')
    expect(meaningOf(c.brain, 'nibble')).not.toBe('nothing yet')
  })

  it('admits when it does not know a word', () => {
    const sim = createSim({ seed: 36 })
    const c = sim.creatures[0]
    const reply = talk(sim, c, 'quibbleflax')
    expect(reply.obeyed).toBeNull()
    expect(reply.understanding).toBeLessThan(0.2)
  })

  it('obeys a word once it has been taught it', () => {
    const sim = createSim({ seed: 37 })
    const c = sim.creatures[0]
    sim.player.x = c.x + 3
    sim.player.z = c.z
    sim.teach(c, 'come', 'approach')
    sim.teach(c, 'come', 'approach')
    const reply = talk(sim, c, 'come')
    expect(reply.obeyed).toBe('approach')
  })

  it('always has something to mutter to itself', () => {
    const sim = createSim({ seed: 38 })
    for (const c of sim.creatures) expect(idleUtterance(c).length).toBeGreaterThan(0)
  })
})

describe('the conversation is kept', () => {
  it('remembers what was said, per creature, across a reload', () => {
    const store = new ChatStore()
    store.clearAll()
    store.append(1, { from: 'you', text: 'hello', at: 10 })
    store.append(1, { from: 'them', text: 'mmh', at: 10 })
    store.append(2, { from: 'you', text: 'hi', at: 12 })

    // a fresh store is what happens after a page reload
    const reloaded = new ChatStore()
    expect(reloaded.lines(1).map((l) => l.text)).toEqual(['hello', 'mmh'])
    expect(reloaded.lines(2)).toHaveLength(1)
    expect(reloaded.lines(99)).toHaveLength(0)
    store.clearAll()
  })

  it('does not grow without bound', () => {
    const store = new ChatStore()
    store.clearAll()
    for (let i = 0; i < 200; i++) store.append(1, { from: 'you', text: `line ${i}`, at: i })
    expect(store.lines(1).length).toBeLessThanOrEqual(60)
    expect(store.lines(1)[store.lines(1).length - 1].text).toBe('line 199')
    store.clearAll()
  })
})

describe('the world is kept', () => {
  it('round-trips a valley, brains and all', () => {
    const sim = createSim({ seed: 40 })
    const c = sim.creatures[0]
    sim.teach(c, 'come', 'approach')
    sim.player.berries = 7
    for (let t = 0; t < 30; t += 1 / 12) sim.tick(1 / 12)

    const restored = deserialize(serialize(sim))
    expect(restored.creatures).toHaveLength(sim.creatures.length)
    expect(restored.player.berries).toBe(7)
    expect(restored.time).toBeCloseTo(sim.time, 3)

    const rc = restored.creatures[0]
    expect(rc.name).toBe(c.name)
    expect(rc.x).toBeCloseTo(c.x, 1)
    expect(rc.trust).toBeCloseTo(c.trust, 5)
    expect(meaningOf(rc.brain, 'come')).toBe(meaningOf(c.brain, 'come'))

    // and it keeps running afterwards
    for (let t = 0; t < 30; t += 1 / 12) restored.tick(1 / 12)
    expect(restored.creatures.every((x) => Number.isFinite(x.x))).toBe(true)
  })
})
