/**
 * speech — talking to a Luma, and what that does to it.
 *
 * Two rules shaped this module.
 *
 * First, **it must answer instantly**. Everything here is a synchronous pure
 * function over the creature's current state: no timers, no queues, no
 * network, no "thinking" delay. You press Enter and the reply is already
 * there, because a conversation that takes two seconds to start is not a
 * conversation.
 *
 * Second, **it must be honest about what they know**. A Luma answers out of
 * its drives, what it is doing, how it feels about you, and the words it has
 * actually learned. If you use a word it has never heard, it says so rather
 * than pretending. Understanding is read out of the neural network, not from
 * a script — which is why teaching a word actually changes the replies.
 */
import { ACTION_LABEL, wordStrength, type Action } from './brain'
import { DRIVE_FEELING, loudestDrive } from './drives'
import type { Creature } from './creature'
import type { Sim } from './sim'

export type Intent =
  | 'greet' | 'farewell' | 'praise' | 'scold' | 'askName' | 'askFeel'
  | 'askDoing' | 'command' | 'teach' | 'thanks' | 'chat'

export interface Understanding {
  intent: Intent
  /** every meaningful word, for the brain to bind */
  words: string[]
  /** for `teach`: the word being taught */
  teaching?: string
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'am', 'to', 'do', 'you', 'your', 'i', 'me', 'my',
  'can', 'will', 'would', 'please', 'it', 'that', 'this', 'of', 'and', 'so', 'be',
])

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

const GREETINGS = ['hello', 'hi', 'hey', 'greetings', 'morning', 'evening', 'yo', 'hiya', 'howdy']
const FAREWELLS = ['bye', 'goodbye', 'farewell', 'later', 'night', 'goodnight']
const PRAISE = ['good', 'well', 'nice', 'clever', 'yes', 'lovely', 'great', 'brilliant', 'sweet']
const SCOLD = ['no', 'bad', 'stop', 'naughty', 'dont', "don't", 'wrong']
const THANKS = ['thanks', 'thank', 'cheers', 'ta']

/** Read a line of English closely enough to react to it correctly. */
export function interpret(text: string): Understanding {
  const words = tokenize(text)
  const meaningful = words.filter((w) => !STOP_WORDS.has(w))
  const has = (list: string[]): boolean => words.some((w) => list.includes(w))

  // "this is a berry" / "say food" / "berry means eat"
  const teachMatch = /(?:this is|that is|it's|its|call(?:ed)? this|say)\s+(?:a |an |the )?([a-z']+)/i.exec(text)
  if (teachMatch) {
    return { intent: 'teach', words: meaningful, teaching: teachMatch[1].toLowerCase() }
  }

  if (/what(?:'s| is)? your name|who are you|your name/i.test(text)) {
    return { intent: 'askName', words: meaningful }
  }
  if (/how are you|how do you feel|are you (ok|okay|alright|well|hungry|tired|scared|afraid)|what'?s wrong/i.test(text)) {
    return { intent: 'askFeel', words: meaningful }
  }
  if (/what are you doing|what'?re you doing|what are you up to|where are you going/i.test(text)) {
    return { intent: 'askDoing', words: meaningful }
  }
  if (has(THANKS)) return { intent: 'thanks', words: meaningful }
  if (has(FAREWELLS)) return { intent: 'farewell', words: meaningful }
  if (has(SCOLD)) return { intent: 'scold', words: meaningful }
  // a greeting only counts if that is most of what was said
  if (has(GREETINGS) && words.length <= 4) return { intent: 'greet', words: meaningful }
  if (has(PRAISE) && words.length <= 4) return { intent: 'praise', words: meaningful }

  return { intent: meaningful.length > 0 ? 'command' : 'chat', words: meaningful }
}

// ---------------------------------------------------------------- the voice

/**
 * A Luma's own babble, which is what it says before it has learned anything
 * of yours. Picked by id so each of them sounds like themselves.
 */
const BABBLE = [
  ['mmh', 'aah', 'oo'],
  ['brr', 'tik', 'aa'],
  ['hoo', 'mm', 'eee'],
  ['nnh', 'ba', 'ooh'],
  ['tsk', 'ah', 'mrr'],
  ['heh', 'oh', 'uu'],
]

function babble(c: Creature, n = 1): string {
  const set = BABBLE[c.id % BABBLE.length]
  const out: string[] = []
  for (let i = 0; i < n; i++) out.push(set[(c.id + i + Math.floor(c.age)) % set.length])
  return out.join(' ')
}

/** How they refer to themselves, which changes as they learn. */
function selfWord(c: Creature): string {
  return c.brain.maturity > 0.35 ? c.name : c.name.toLowerCase()
}

function feelingWord(c: Creature): string {
  const { key, value } = loudestDrive(c.drives)
  if (value < 0.28) return c.trust > 0.55 ? 'content' : 'alright'
  return DRIVE_FEELING[key]
}

function warmth(c: Creature): 'wary' | 'shy' | 'warm' | 'fond' {
  if (c.threat > 0.45 || c.drives.fear > 0.4) return 'wary'
  if (c.trust > 0.7) return 'fond'
  if (c.trust > 0.42) return 'warm'
  return 'shy'
}

export interface Reply {
  /** what the Luma says back */
  text: string
  intent: Intent
  /** the action they were pushed into, if any */
  obeyed: Action | null
  /** 0..1 — how much of what you said meant anything to them */
  understanding: number
  /** a word they just learned, if you taught one */
  learned?: string
}

/**
 * Talk to a Luma. Everything happens here and now: they hear the words, they
 * stop to listen, the brain is nudged, and the reply comes back on the same
 * call stack.
 */
export function talk(sim: Sim, c: Creature, text: string): Reply {
  const read = interpret(text)
  const { listened } = sim.speakTo(c, read.words)

  if (!listened) {
    return {
      text: `${selfWord(c)} backs away from you`,
      intent: read.intent,
      obeyed: 'flee',
      understanding: 0,
    }
  }

  const tone = warmth(c)
  const known = read.words.filter((w) => wordStrength(c.brain, w) > 0.12)
  const understanding = read.words.length === 0 ? 0 : known.length / read.words.length

  switch (read.intent) {
    case 'greet': {
      const hello = known[0] ?? babble(c)
      const line = tone === 'wary'
        ? `${selfWord(c)} watches you, quiet`
        : tone === 'fond'
          ? `${hello}! ${selfWord(c)} is glad you came`
          : tone === 'warm'
            ? `${hello}. ${selfWord(c)} knows you`
            : `${hello}...?`
      return { text: line, intent: read.intent, obeyed: null, understanding }
    }

    case 'farewell':
      sim.stopListening(c)
      return {
        text: tone === 'wary' ? `${selfWord(c)} says nothing` : `${known[0] ?? babble(c)}. come back`,
        intent: read.intent,
        obeyed: null,
        understanding,
      }

    case 'praise': {
      sim.pet(c)
      return {
        text: `${selfWord(c)} brightens — ${babble(c)}!`,
        intent: read.intent,
        obeyed: null,
        understanding,
      }
    }

    case 'scold': {
      scold(sim, c)
      return {
        text: `${selfWord(c)} lowers their head`,
        intent: read.intent,
        obeyed: null,
        understanding,
      }
    }

    case 'thanks':
      return {
        text: `${selfWord(c)} bobs their head`,
        intent: read.intent,
        obeyed: null,
        understanding,
      }

    case 'askName':
      return {
        text: c.brain.maturity > 0.2 ? `${c.name}. ${c.name}!` : babble(c, 2),
        intent: read.intent,
        obeyed: null,
        understanding,
      }

    case 'askFeel': {
      const feel = feelingWord(c)
      const line = tone === 'wary'
        ? `${selfWord(c)} is ${feel}, and watching you`
        : `${selfWord(c)} is ${feel}`
      return { text: line, intent: read.intent, obeyed: null, understanding }
    }

    case 'askDoing':
      return {
        text: `${selfWord(c)} was going to ${ACTION_LABEL[c.brain.chosen]}`,
        intent: read.intent,
        obeyed: null,
        understanding,
      }

    case 'teach': {
      const word = read.teaching
      if (!word) break
      // the word attaches to whatever they are doing or about to do, which is
      // why you teach "food" while they are eating and not while they sleep
      sim.teach(c, word, c.brain.chosen)
      return {
        text: `${selfWord(c)} tries it: "${word}"`,
        intent: 'teach',
        obeyed: null,
        understanding: 1,
        learned: word,
      }
    }

    case 'command': {
      const { obeyed, understanding: got } = sim.command(c, read.words)
      if (obeyed) {
        return {
          text: `${selfWord(c)} goes to ${ACTION_LABEL[obeyed]}`,
          intent: 'command',
          obeyed,
          understanding: Math.max(got, understanding),
        }
      }
      return {
        text: known.length > 0
          ? `${selfWord(c)} knows "${known[0]}" but not the rest`
          : `${selfWord(c)} tilts their head — ${babble(c)}?`,
        intent: 'command',
        obeyed: null,
        understanding: got,
      }
    }

    default:
      break
  }

  return {
    text: `${selfWord(c)} listens — ${babble(c)}`,
    intent: read.intent,
    obeyed: null,
    understanding,
  }
}

/**
 * Telling a Luma off. Unlike a smack this does not hurt and does not make
 * them frightened of you — it is a small negative reward, which is enough to
 * unlearn a habit without costing you their trust.
 */
export function scold(sim: Sim, c: Creature): void {
  c.drives.boredom = Math.min(1, c.drives.boredom + 0.05)
  c.trust = Math.max(0, c.trust - 0.02)
  sim.punish(c, 0.5)
}

/** What a Luma says to itself, overheard. Used for the speech bubbles. */
export function idleUtterance(c: Creature): string {
  if (c.drives.fear > 0.4) return '!'
  if (c.posture === 'play') return `${babble(c)}!`
  const { value } = loudestDrive(c.drives)
  if (value > 0.68) {
    const learned = [...c.brain.words.keys()].find((w) => wordStrength(c.brain, w) > 0.4)
    return learned ? `${learned}...` : `${babble(c)}...`
  }
  return babble(c)
}
