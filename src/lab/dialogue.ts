/**
 * dialogue — offline natural-language understanding + generation.
 *
 * Meaning is stored as compact SemanticMessage; natural language is produced
 * only when the player can hear or inspect the exchange. Creatures evaluate
 * statements using trust, knowledge, mood, personality, and incentives —
 * they do NOT automatically believe or obey the player.
 *
 * No external LLM is required. Optional cloud assist can wrap responses later.
 */
import type { Creature } from './creature'
import { friendship, romanticInterest, edgeTo, type SocialGraph } from './socialbond'
import { getWord } from './language'
import { clamp01 } from './util'

export type IntentKind =
  | 'greet'
  | 'ask_need'
  | 'ask_name'
  | 'ask_job'
  | 'ask_feeling'
  | 'ask_about'
  | 'ask_where'
  | 'request_food'
  | 'request_help'
  | 'request_trade'
  | 'offer_gift'
  | 'teach'
  | 'command'
  | 'accuse'
  | 'apologize'
  | 'flirt'
  | 'comfort'
  | 'warn'
  | 'promise'
  | 'gossip'
  | 'farewell'
  | 'talk_small'
  | 'unknown'

export interface SemanticMessage {
  kind: IntentKind
  fromId: number // 0 = player
  toId: number
  topic?: string
  concept?: string
  word?: string
  amount?: number
  sincerity: number // 0..1 speaker's intended honesty
  tick: number
}

export interface DialogueTurn {
  speakerId: number
  listenerId: number
  text: string
  semantic: SemanticMessage
  believed: boolean
  obeyed: boolean
  tick: number
}

export interface ParseResult {
  intent: IntentKind
  topic?: string
  concept?: string
  word?: string
  /** the good the player named, when they asked to trade */
  item?: string
  /** whether the player wants to buy from or sell to the creature */
  direction?: 'buy' | 'sell'
}

/** Goods a player can name in conversation. */
const TRADE_WORDS: Record<string, string> = {
  bread: 'bread',
  loaf: 'bread',
  food: 'bread',
  water: 'water',
  medicine: 'medicine',
  remedy: 'medicine',
  brew: 'brew',
  drink: 'brew',
  beer: 'brew',
  herb: 'herb',
  tonic: 'tonic',
  stick: 'stick',
  gem: 'gem',
  trinket: 'trinket',
  cloak: 'cloak',
  grain: 'grain',
}

export function extractItem(text: string): string | undefined {
  const lower = text.toLowerCase()
  for (const [word, id] of Object.entries(TRADE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(lower)) return id
  }
  return undefined
}

function extractDirection(text: string): 'buy' | 'sell' | undefined {
  const lower = text.toLowerCase()
  if (/\b(sell me|buy from you|can i (buy|have)|i want to buy|how much)\b/.test(lower)) return 'buy'
  if (/\b(i'?ll sell|buy this|want to sell|take this off)\b/.test(lower)) return 'sell'
  return undefined
}

const PATTERNS: { kind: IntentKind; re: RegExp; topic?: (m: RegExpMatchArray) => string | undefined }[] = [
  { kind: 'greet', re: /\b(hi|hello|hey|greetings|good (morning|afternoon|evening)|howdy)\b/i },
  { kind: 'farewell', re: /\b(bye|goodbye|farewell|see you|later)\b/i },
  { kind: 'ask_name', re: /\b(what('?s| is) your name|who are you|your name)\b/i },
  { kind: 'ask_feeling', re: /\b(how (are|do) you (feel(?:ing)?|doing)|how(?:'s| is) it going|are you (ok|okay|alright|well))\b/i },
  { kind: 'ask_job', re: /\b(what do you do|your job|where do you work|occupation)\b/i },
  { kind: 'ask_need', re: /\b(what do you (need|want)|are you (hungry|thirsty|tired|sick)|need anything)\b/i },
  { kind: 'ask_where', re: /\b(where (is|are|can i find)|how do i (get|find)|directions? to)\b/i, topic: (m) => extractPlace(m.input ?? '') },
  { kind: 'ask_about', re: /\b(tell me about|what about|do you know|who is)\b/i, topic: (m) => extractTopic(m.input ?? '') },
  { kind: 'request_food', re: /\b(give me (food|bread|something to eat)|i(?:'m| am) hungry|got any food)\b/i },
  { kind: 'request_help', re: /\b(help me|can you help|i need help|please help)\b/i },
  { kind: 'request_trade', re: /\b(trade|buy|sell|how much|deal|barter)\b/i },
  { kind: 'offer_gift', re: /\b(here(?:,| is|'s)|take this|gift|for you|i (give|brought) you)\b/i },
  { kind: 'teach', re: /\b(this (word|means)|the word for|means|call(?:ed)?)\b/i },
  { kind: 'command', re: /\b(go to|follow me|come here|stop|give me|do this|obey)\b/i },
  { kind: 'accuse', re: /\b(you (stole|lied|hurt|betrayed)|thief|liar|how dare)\b/i },
  { kind: 'apologize', re: /\b(sorry|apologize|forgive me|my bad|i regret)\b/i },
  { kind: 'flirt', re: /\b(i like you|you(?:'re| are) (cute|beautiful|lovely)|love you|be mine|date|kiss)\b/i },
  { kind: 'comfort', re: /\b(it(?:'s| is) okay|there there|don(?:'t) worry|you(?:'re| are) safe|cheer up)\b/i },
  { kind: 'warn', re: /\b(watch out|be careful|danger|don(?:'t) trust|warning)\b/i },
  { kind: 'promise', re: /\b(i promise|i (will|won(?:'t))|you can count on|i swear)\b/i },
  { kind: 'gossip', re: /\b(did you (hear|know)|i heard|rumor|between us)\b/i },
]

const PLACES = ['bank', 'food', 'shop', 'market', 'pharmacy', 'clinic', 'hospital', 'homes', 'home', 'tavern', 'bar', 'tools', 'work', 'farm', 'park', 'school', 'graveyard', 'den']

function extractPlace(text: string): string | undefined {
  const lower = text.toLowerCase()
  return PLACES.find((p) => lower.includes(p))
}

function extractTopic(text: string): string | undefined {
  const m = text.match(/(?:about|know|is)\s+([a-zA-Z]{2,16})/i)
  return m?.[1]
}

/** Parse typed player text into a semantic intent (offline, deterministic-ish). */
export function parsePlayerText(text: string): ParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { intent: 'unknown' }
  for (const p of PATTERNS) {
    const m = trimmed.match(p.re)
    if (m) {
      return {
        intent: p.kind,
        topic: p.topic?.(m),
        concept: p.kind === 'teach' ? guessConcept(trimmed) : undefined,
        word: p.kind === 'teach' ? guessTaughtWord(trimmed) : undefined,
        item: p.kind === 'request_trade' ? extractItem(trimmed) : undefined,
        direction: p.kind === 'request_trade' ? extractDirection(trimmed) ?? 'buy' : undefined,
      }
    }
  }
  // fallback: question → ask_about, else greet-ish unknown chat
  if (trimmed.endsWith('?') || /^(what|where|who|why|how|when)\b/i.test(trimmed)) {
    return { intent: 'ask_about', topic: extractTopic(trimmed) }
  }
  return { intent: 'unknown', topic: trimmed.slice(0, 24) }
}

function guessConcept(text: string): string | undefined {
  const concepts = ['food', 'danger', 'work', 'love', 'play', 'sleep', 'friend', 'money', 'help', 'home', 'medicine', 'gift']
  const lower = text.toLowerCase()
  return concepts.find((c) => lower.includes(c))
}

function guessTaughtWord(text: string): string | undefined {
  const m = text.match(/(?:word\s+)?["']?([a-zA-Z]{2,12})["']?\s+(?:means|for|is)|(?:means|for)\s+["']?([a-zA-Z]{2,12})["']?/i)
  return m?.[1] ?? m?.[2]
}

export interface DialogueContext {
  creature: Creature
  playerName: string
  playerTrust: number // -1..1 from creature's reputation of player (id 0)
  graph: SocialGraph
  nearbyNames: string[]
  knownPlaces: string[]
  tick: number
}

/**
 * Decide whether the creature believes / obeys, then craft a reply.
 * Belief uses trust + evidence + mood; obedience uses trust + fear + personality.
 */
export function respondToPlayer(ctx: DialogueContext, parsed: ParseResult, fromId = 0): DialogueTurn {
  const c = ctx.creature
  const edge = edgeTo(ctx.graph, fromId)
  const trust = clamp01((ctx.playerTrust + 1) / 2) // map -1..1 → 0..1
  const fear = c.chem.fear
  const mood = moodWord(c)
  const sincerity = 0.55 + trust * 0.35 - c.emotions.spite * 0.2

  let believed = trust > 0.35 || (parsed.intent !== 'accuse' && parsed.intent !== 'command')
  if (parsed.intent === 'accuse' && (c.memory.facts.someoneStoleFromMe ?? 0) < 0.5) {
    believed = trust > 0.6 // deny accusations unless they fit memory / high trust
  }
  let obeyed = false
  if (parsed.intent === 'command') {
    obeyed = trust > 0.55 && fear < 0.6 && c.genome.loyalty > 0.4
    if (c.genome.aggression > 0.7 && trust < 0.7) obeyed = false
  }

  const semantic: SemanticMessage = {
    kind: parsed.intent,
    fromId,
    toId: c.id,
    topic: parsed.topic,
    concept: parsed.concept,
    word: parsed.word,
    sincerity,
    tick: ctx.tick,
  }

  const text = inVoiceOf(c, craftReply(ctx, parsed, { believed, obeyed, mood, trust, edge }))

  return {
    speakerId: c.id,
    listenerId: fromId,
    text,
    semantic,
    believed,
    obeyed,
    tick: ctx.tick,
  }
}

/**
 * The same thought sounds different depending on who is saying it. A child has
 * few words and says them plainly; an elder speaks with the weight of having
 * seen it before. A creature with a rich vocabulary drops its own words in.
 */
export function inVoiceOf(c: Creature, line: string): string {
  const vocabulary = c.language.vocab.size
  if (c.stage === 'child') {
    // children keep it short: first clause only, and simpler punctuation
    const shortened = line.replace(/,\s+(and|but|then)\b[^."]*/g, '')
    return shortened.replace(/\b(honestly|actually|carefully|seriously|evenly)\b\s*/g, '')
  }
  if (c.stage === 'elder' && vocabulary > 2) {
    return `${line} They have seen it before.`
  }
  if (vocabulary >= 5 && c.genome.sociability > 0.6) {
    const own = [...c.language.vocab.values()][0]
    if (own) return `${line} "${own.word}," they add, in their own words.`
  }
  return line
}

function moodWord(c: Creature): string {
  if (c.chem.grief > 0.4) return 'sad'
  if (c.chem.fear > 0.55) return 'afraid'
  if (c.chem.health < 0.4) return 'unwell'
  if (c.chem.hunger < 0.35) return 'hungry'
  if (c.chem.energy < 0.3) return 'tired'
  if (c.emotions.joy > 0.4) return 'happy'
  if (c.jealousy > 0.5) return 'jealous'
  if (c.chem.social < 0.35) return 'lonely'
  return 'calm'
}

function craftReply(
  ctx: DialogueContext,
  parsed: ParseResult,
  meta: { believed: boolean; obeyed: boolean; mood: string; trust: number; edge: ReturnType<typeof edgeTo> },
): string {
  const c = ctx.creature
  const name = c.name
  const friend = friendship(meta.edge)
  const romance = romanticInterest(meta.edge, c.genome.lovePropensity)
  const vocabFood = getWord(c.language, 'food')
  const vocabHome = getWord(c.language, 'home')

  switch (parsed.intent) {
    case 'greet':
      if (meta.trust < 0.25) return `${name} eyes you warily. "…hello."`
      if (friend > 0.5) return `"${ctx.playerName}! Good to see you," ${name} says, brightening.`
      return `"Hello, ${ctx.playerName}," says ${name}.`

    case 'farewell':
      return meta.trust > 0.4 ? `"Take care," ${name} murmurs.` : `${name} nods once and looks away.`

    case 'ask_name':
      return `"I'm ${name}," ${c.genome.sociability > 0.5 ? 'they say warmly' : 'they say carefully'}.`

    case 'ask_feeling':
      return feelingLine(c, meta.mood)

    case 'ask_job':
      return jobLine(c)

    case 'ask_need':
      return needLine(c, vocabFood)

    case 'ask_where': {
      const place = parsed.topic ?? 'somewhere'
      const known = ctx.knownPlaces.some((p) => p.includes(place) || place.includes(p))
      if (!known) return `${name} shrugs. "I haven't found the ${place} yet."`
      return `"The ${place}? I've been there," ${name} says, pointing vaguely. ${vocabHome ? `We call home "${vocabHome}."` : ''}`
    }

    case 'ask_about': {
      const topic = parsed.topic ?? 'that'
      if (ctx.nearbyNames.some((n) => n.toLowerCase() === topic.toLowerCase())) {
        const other = ctx.nearbyNames.find((n) => n.toLowerCase() === topic.toLowerCase())!
        return gossipAbout(c, other, meta.trust)
      }
      return `"${topic}? I'm still figuring this place out," ${name} admits.`
    }

    case 'request_food':
      if (c.chem.hunger < 0.5) return `"I barely have enough for myself," ${name} says, clutching their belly.`
      if (meta.trust < 0.35) return `${name} shakes their head. "I don't know you well enough."`
      return `"Here—take a little," ${name} offers carefully.`

    case 'request_help':
      if (c.chem.fear > 0.5) return `"I… I need help myself," ${name} whispers.`
      if (meta.trust < 0.3 && c.genome.sociability < 0.4) return `"Find someone else," ${name} mutters.`
      return `"What do you need? I'll try," ${name} says.`

    case 'request_trade':
      if ((c.reputation[0]?.thief ?? 0) > 0.4) return `"I don't trade with thieves," ${name} snaps.`
      return `"I might trade, if the price is fair," ${name} says, eyeing your hands.`

    case 'offer_gift':
      return meta.trust > 0.2
        ? `${name} softens. "That's kind of you. Thank you."`
        : `${name} hesitates, then accepts. "…thanks."`

    case 'teach':
      if (parsed.concept && parsed.word) {
        return `${name} repeats carefully: "${parsed.word}"… for ${parsed.concept}. They nod.`
      }
      return `${name} listens, trying to map the sounds to meaning.`

    case 'command':
      if (meta.obeyed) return `"Alright… I'll try," ${name} says reluctantly.`
      if (c.genome.aggression > 0.65) return `"Don't order me around," ${name} growls.`
      return `"No. I decide for myself," ${name} says firmly.`

    case 'accuse':
      if (!meta.believed) return `"That's not true!" ${name} protests, ${c.genome.fearfulness > 0.5 ? 'voice shaking' : 'eyes hard'}.`
      return `${name} looks away. "…I did what I had to."`

    case 'apologize':
      if (meta.edge.resentment > 0.4) return `${name} studies you. "Words are easy. Show me."`
      return `${name} exhales. "Okay. I hear you."`

    case 'flirt':
      if (romance > 0.45 && c.partnerId === null) return `${name} blushes faintly. "I… like talking with you too."`
      if (c.partnerId !== null) return `"I already have someone," ${name} says gently.`
      if (c.genome.lovePropensity < 0.3) return `${name} laughs awkwardly. "Let's just be friends."`
      return `${name} looks surprised, then thoughtful. "Maybe… in time."`

    case 'comfort':
      if (c.chem.fear > 0.4 || c.chem.grief > 0.3) return `${name}'s shoulders ease. "Thank you. That helps."`
      return `"I'm alright, but… thanks," ${name} smiles.`

    case 'warn':
      return meta.believed
        ? `${name} tenses. "I'll keep my eyes open."`
        : `${name} squints. "Why should I trust that?"`

    case 'promise':
      return meta.trust > 0.45
        ? `"I'll remember that promise," ${name} says seriously.`
        : `"Promises are cheap here," ${name} replies.`

    case 'gossip':
      return gossipAbout(c, ctx.nearbyNames[0] ?? 'someone', meta.trust)

    default: {
      // unknown — reflect mood + personality
      if (meta.mood === 'hungry') return `${name} glances toward the shop. "Food first… then talk."`
      if (meta.mood === 'afraid') return `${name} keeps their distance. "I don't want trouble."`
      if (friend > 0.4) return `"Hmm. Tell me more," ${name} says.`
      return `${name} tilts their head, unsure what you mean.`
    }
  }
}

function feelingLine(c: Creature, mood: string): string {
  const map: Record<string, string> = {
    sad: `"I've been mourning," ${c.name} says quietly.`,
    afraid: `"I'm scared," ${c.name} admits.`,
    unwell: `"I don't feel well," ${c.name} winces.`,
    hungry: `"Starving, honestly," ${c.name} sighs.`,
    tired: `"Exhausted. I need rest," ${c.name} yawns.`,
    happy: `"Really good, actually!" ${c.name} beams.`,
    jealous: `"…fine," ${c.name} says, a bit sharp.`,
    lonely: `"A little lonely," ${c.name} shrugs.`,
    calm: `"I'm alright," ${c.name} says evenly.`,
  }
  return map[mood] ?? map.calm
}

function needLine(c: Creature, foodWord: string | null): string {
  if (c.chem.health < 0.45) return `"Medicine. Or the clinic," ${c.name} says.`
  if (c.chem.hunger < 0.4) return foodWord ? `"${foodWord}—food. Please."` : `"Food. I'm empty," ${c.name} says.`
  if (c.chem.energy < 0.35) return `"A bed. Sleep," ${c.name} mumbles.`
  if (c.chem.social < 0.4) return `"Company, maybe," ${c.name} admits.`
  if (c.chem.fear > 0.45) return `"Safety. Somewhere quiet," ${c.name} glances around.`
  return `"Nothing urgent. Just living," ${c.name} says.`
}

function jobLine(c: Creature): string {
  if (c.education > 2) return `"I studied a bit—work pays better now," ${c.name} says proudly.`
  if (c.action === 'work' || c.workProgress > 0) return `"Working shifts for coin," ${c.name} shrugs.`
  if (c.gangId !== null) return `"I stick with my crew," ${c.name} says carefully.`
  if (c.partnerId !== null) return `"I look after my partner, mostly," ${c.name} smiles.`
  return `"Whatever keeps me fed," ${c.name} says.`
}

function gossipAbout(c: Creature, other: string, trust: number): string {
  if (trust < 0.3) return `${c.name} lowers their voice. "I don't gossip with strangers."`
  const rep = Object.values(c.reputation)[0]
  if (rep && rep.thief > 0.4) return `"Between us… some folks around here take what isn't theirs," ${c.name} whispers.`
  if (rep && rep.aggressor > 0.4) return `"Watch your back. Tempers run hot," ${c.name} warns.`
  return `"${other}? Seem alright to me," ${c.name} says.`
}

/**
 * Compact creature→creature semantic chatter (no NL unless player listens).
 */
export function creatureUtterance(c: Creature, kind: IntentKind, topic?: string): SemanticMessage {
  return {
    kind,
    fromId: c.id,
    toId: -1, // broadcast / nearest
    topic,
    sincerity: 0.7 - c.emotions.spite * 0.3,
    tick: 0,
  }
}

/** Render a semantic NPC message to NL when the player is in earshot. */
export function renderSemanticNl(from: Creature, msg: SemanticMessage): string {
  const w = (concept: string) => getWord(from.language, concept)
  switch (msg.kind) {
    case 'greet':
      return `${from.name}: "${w('friend') ?? 'Hey'}."`
    case 'warn':
      return `${from.name}: "${w('danger') ?? 'Careful'}!"`
    case 'request_food':
      return `${from.name}: "${w('food') ?? 'Food'}…?"`
    case 'flirt':
      return `${from.name}: "${w('love') ?? 'You matter to me'}."`
    case 'request_help':
      return `${from.name}: "${w('help') ?? 'Help'}!"`
    case 'gossip':
      return `${from.name} murmurs about ${msg.topic ?? 'someone'}.`
    default:
      return `${from.name} chatters quietly.`
  }
}
