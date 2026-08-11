/**
 * inspect — AI transparency: why did that creature do that?
 *
 * Builds a short, human-readable reasoning summary from needs, genes,
 * scores, relationships, and recent memory — for the optional inspector HUD.
 */
import type { Creature } from './creature'
import type { Sim } from './sim'
import { scoreActions, type ActionScores } from './mind'
import { deriveEmotion } from './emotion'
import { friendship, romanticInterest, edgeTo, BOND_DIMS, type SocialEdge } from './socialbond'
import { getReputation, trustTowards } from './reputation'
import { estimateCreatureCostKb } from './lod'
import { DRIVE_KEYS } from './drives'
import { EMOTION_KEYS } from './emotions'
import { promisesTo } from './chatter'
import { currentLeader } from './norms'
import { producerOf } from './jobs'
import { standingOf, describeStanding } from './status'
import { closedNow, timeOfDay, tillOf } from './institutions'
import { wealthInequality, totalOwedBy, totalOwedTo } from './economy'
import { lifeStory, topStories, storiesSince, formatStory } from './story'

export interface InspectReport {
  id: number
  name: string
  alive: boolean
  age: number
  stage: string
  action: string
  intention: string | null
  emotion: string
  mood: string
  needs: { key: string; value: number }[]
  topScores: { action: string; score: number }[]
  reasoning: string[]
  personality: { key: string; value: number }[]
  genes: { key: string; value: number }[]
  emotions: { key: string; value: number }[]
  drives: { key: string; value: number }[]
  relationships: { id: number; name: string; friend: number; romance: number; trust: number }[]
  topBond?: { name: string; edge: SocialEdge }
  memories: string[]
  beliefs: string[]
  job: string
  wallet: number
  banked: number
  inventory: string[]
  costKb: number
  recentTalk: string[]
  /** learned behavioral biases: action -> strength */
  habits: { key: string; value: number }[]
  /** uncertain knowledge with provenance */
  beliefKeys: { key: string; value: number; confidence: number; source: string }[]
  /** parents and children by name */
  family: { parents: string[]; children: string[]; partner: string | null }
  /** open promises made to this creature */
  promises: string[]
  /** claimed institutional role */
  role: string | null
  /** health detail */
  illness: number
  injury: number
  /** the events that shaped this individual */
  life: { tick: number; text: string; because?: string }[]
  /** coins owed to and by this creature */
  owes: number
  owed: number
  /** how the settlement regards them, in words */
  standing: string
  standingScore: number
}

export function inspectCreature(sim: Sim, c: Creature): InspectReport {
  const scores: ActionScores = scoreActions(sim, c)
  const ranked = (Object.entries(scores) as [string, number][])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([action, score]) => ({ action, score: Math.round(score * 100) / 100 }))

  const emotion = deriveEmotion(c.chem, c.genome)
  const reasoning = buildReasoning(sim, c, ranked)

  const relationships: InspectReport['relationships'] = []
  for (const [idStr, bond] of Object.entries(c.bonds)) {
    if (bond < 0.15) continue
    const id = Number(idStr)
    const other = sim.creatureById(id)
    const edge = c.social ? edgeTo(c.social, id) : null
    relationships.push({
      id,
      name: other?.name ?? `#${id}`,
      friend: edge ? friendship(edge) : bond,
      romance: edge ? romanticInterest(edge, c.genome.lovePropensity) : 0,
      trust: trustTowards(c, id),
    })
  }
  relationships.sort((a, b) => b.friend - a.friend)

  let topBond: InspectReport['topBond']
  if (c.social) {
    let bestId = -1
    let best = -1
    for (const idStr of Object.keys(c.social)) {
      const id = Number(idStr)
      const e = c.social[id]
      const score = friendship(e) + romanticInterest(e, c.genome.lovePropensity)
      if (score > best) {
        best = score
        bestId = id
      }
    }
    if (bestId >= 0) {
      topBond = {
        name: sim.creatureById(bestId)?.name ?? `#${bestId}`,
        edge: { ...c.social[bestId] },
      }
    }
  }

  const memories = c.memory.episodes.slice(-6).map((e) => {
    const who = e.entityId != null ? (sim.creatureById(e.entityId)?.name ?? `#${e.entityId}`) : 'world'
    return `${e.kind} (${who}, v=${e.valence.toFixed(1)})`
  })

  const beliefs: string[] = []
  for (const [k, v] of Object.entries(c.memory.facts)) {
    if ((v ?? 0) > 0.3) beliefs.push(`${k}: ${(v ?? 0).toFixed(2)}`)
  }
  for (const [idStr, rep] of Object.entries(c.reputation)) {
    if (Math.abs(rep.trust) > 0.3 || rep.thief > 0.3) {
      const who = sim.creatureById(Number(idStr))?.name ?? (Number(idStr) === 0 ? 'you' : `#${idStr}`)
      beliefs.push(`${who}: trust=${rep.trust.toFixed(2)} thief=${rep.thief.toFixed(2)}`)
    }
  }

  const inventory = Object.entries(c.inventory.items)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => `${id}×${n}`)

  const standing = standingOf(c, sim.culture, sim.creatures)
  const parents = c.parentIds.map((id) => sim.creatureById(id)?.name ?? `#${id}`)
  const children = sim.creatures
    .filter((o) => o.parentIds.includes(c.id))
    .map((o) => o.name)
  const partner = c.partnerId !== null ? sim.creatureById(c.partnerId)?.name ?? null : null

  const habits = Object.entries(c.habits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([key, value]) => ({ key, value }))

  const beliefKeys = Object.values(c.beliefs)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8)
    .map((b) => ({ key: b.key, value: b.value, confidence: b.confidence, source: b.source }))

  const promises = promisesTo(sim.chatter, c.id).map((p) => {
    const who = sim.creatureById(p.promiserId)?.name ?? `#${p.promiserId}`
    return `${who} owes ${p.about}`
  })

  return {
    id: c.id,
    name: c.name,
    alive: c.alive,
    age: c.age,
    stage: c.stage,
    action: c.action,
    intention: c.intention,
    emotion: emotion.type,
    mood: c.psyche?.mood ?? 'content',
    needs: [
      { key: 'hunger', value: c.chem.hunger },
      { key: 'thirst', value: c.chem.thirst },
      { key: 'energy', value: c.chem.energy },
      { key: 'social', value: c.chem.social },
      { key: 'health', value: c.chem.health },
      { key: 'fear', value: c.chem.fear },
      { key: 'pleasure', value: c.chem.pleasure },
      { key: 'grief', value: c.chem.grief },
    ],
    topScores: ranked,
    reasoning,
    personality: BOND_DIMS.slice(0, 0).map(() => ({ key: '', value: 0 })), // placeholder unused
    genes: Object.entries(c.genome).map(([key, value]) => ({ key, value })),
    emotions: EMOTION_KEYS.map((key) => ({ key, value: c.emotions[key] })),
    drives: DRIVE_KEYS.map((key) => ({ key, value: c.drives[key] })),
    relationships: relationships.slice(0, 8),
    topBond,
    memories,
    beliefs: beliefs.slice(0, 10),
    job: c.workProgress > 0 ? `working (${c.workProgress})` : c.goalTowerId ?? c.action,
    wallet: c.wallet,
    banked: c.banked,
    inventory,
    costKb: estimateCreatureCostKb(c),
    recentTalk: (c.recentDialogue ?? []).slice(-4),
    habits,
    beliefKeys,
    family: { parents, children, partner },
    promises,
    role: c.job,
    illness: c.illness,
    injury: c.injury,
    life: lifeStory(sim.stories, c.id).map((e) => ({
      tick: e.tick,
      text: e.text,
      because: e.because,
    })),
    owes: Math.round(totalOwedBy(sim.ledger, c.id)),
    owed: Math.round(totalOwedTo(sim.ledger, c.id)),
    standing: describeStanding(standing),
    standingScore: Math.round(standing.score * 100) / 100,
  }
}

function buildReasoning(
  sim: Sim,
  c: Creature,
  ranked: { action: string; score: number }[],
): string[] {
  const lines: string[] = []
  const top = ranked[0]
  if (top) {
    // Say plainly whether this is what they are doing or what they would
    // switch to, so the panel never seems to contradict the creature.
    lines.push(
      c.intention && c.intention !== top.action
        ? `Busy with "${c.intention}"; weighing "${top.action}" (${top.score}) next.`
        : `Choosing "${top.action}" (score ${top.score}).`,
    )
  }
  if (c.chem.hunger < 0.4) lines.push('Hunger is pressing — survival overrides softer goals.')
  if (c.chem.fear > 0.5) lines.push('Fear is high — risk tolerance is down.')
  if (c.chem.grief > 0.4) lines.push('Grief is coloring attention and social drive.')
  if (c.partnerId !== null) {
    const p = sim.creatureById(c.partnerId)
    lines.push(`Partnered with ${p?.name ?? c.partnerId}.`)
  }
  if (c.jealousy > 0.4) lines.push('Jealousy is active — rival bonds sting.')
  if (c.genome.aggression > 0.7) lines.push('High aggression gene biases toward confrontation.')
  if (c.genome.theft > 0.7 && c.wallet < 3) lines.push('Broke + theft-prone → opportunistic stealing rises.')
  if (c.genome.curiosity > 0.7 && Object.keys(c.knowledge).length < 5) {
    lines.push('Curious and under-explored — exploration scores up.')
  }
  const near = nearest(sim, c)
  if (near) {
    const trust = trustTowards(c, near.id)
    const rep = getReputation(c, near.id)
    lines.push(`Nearest: ${near.name} (trust ${trust.toFixed(2)}, thief-rep ${rep.thief.toFixed(2)}).`)
  }
  if (c.intention && c.intentionTicks > 0) {
    lines.push(`Committed to "${c.intention}" for ${c.intentionTicks} more ticks.`)
  }
  if (c.householdId != null) lines.push(`Household #${c.householdId}.`)
  if (c.job) lines.push(`Works as the settlement's ${c.job}.`)
  if (c.chem.purpose < 0.3) lines.push('Low purpose — looking for something that matters.')
  if (c.chem.privacy < 0.3) lines.push('Crowded — wants space.')
  if (c.injury > 0.3) lines.push('Carrying an untreated wound.')
  if (c.illness > 0.3) lines.push('Sick — the clinic is on their mind.')
  const strongHabit = Object.entries(c.habits).sort((a, b) => b[1] - a[1])[0]
  if (strongHabit && strongHabit[1] > 0.3) {
    lines.push(`Habit: keeps returning to "${strongHabit[0]}".`)
  }
  const owed = totalOwedBy(sim.ledger, c.id)
  if (owed > 0) lines.push(`Owes ${Math.round(owed)} coins to others.`)
  return lines
}

export interface SocietyReport {
  population: number
  norms: { key: string; value: number }[]
  leader: string | null
  inequality: number
  households: number
  staffed: string[]
  vacancies: string[]
  sharedWords: { concept: string; word: string }[]
  chronicle: string[]
  debts: number
  overheard: string[]
  /** the settlement's most notable moments, with the reason behind each */
  stories: { tick: number; kind: string; text: string; because?: string }[]
  /** what changed since the player last opened this panel */
  sinceLastVisit: string[]
  /** goods with an empty shelf and the reason why */
  shortages: { good: string; cause: string }[]
  /** where we are in the day, 0 dawn → 1 end of night */
  timeOfDay: number
  /** buildings whose doors are shut right now */
  closed: string[]
  /** how much money each institution is holding */
  tills: { tower: string; till: number }[]
}

/** A settlement-level readout: what kind of place has this become? */
export function inspectSociety(sim: Sim): SocietyReport {
  const living = sim.creatures.filter((c) => c.alive)
  const leader = currentLeader(sim.culture, sim.creatures)
  const staffed: string[] = []
  const vacancies: string[] = []
  for (const [jobId, holder] of Object.entries(sim.jobs.holders)) {
    if (holder !== undefined) {
      const who = sim.creatureById(holder)
      staffed.push(`${jobId}: ${who?.name ?? holder}`)
    }
  }
  for (const jobId of ['shopkeep', 'healer', 'bartender', 'farmer', 'porter', 'teacher']) {
    if (sim.jobs.holders[jobId as keyof typeof sim.jobs.holders] === undefined) vacancies.push(jobId)
  }
  // an empty shelf always has somebody behind it
  const shortages: { good: string; cause: string }[] = []
  for (const [goodId, good] of Object.entries(sim.economy.goods)) {
    if (good.stock > 0) continue
    const job = producerOf(goodId)
    if (!job) {
      shortages.push({ good: goodId, cause: 'nothing has come in on the road' })
      continue
    }
    const holderId = sim.jobs.holders[job.id]
    const holder = holderId !== undefined ? sim.creatureById(holderId) : undefined
    shortages.push({
      good: goodId,
      cause: holder ? `${holder.name} cannot keep up as ${job.title}` : `no ${job.title} in Haven`,
    })
  }

  return {
    population: living.length,
    norms: Object.entries(sim.culture.norms).map(([key, value]) => ({ key, value })),
    leader: leader?.name ?? null,
    inequality: Math.round(wealthInequality(living.map((c) => c.wallet)) * 100) / 100,
    households: sim.society.households.length,
    staffed,
    vacancies,
    sharedWords: Object.entries(sim.culture.sharedWords).map(([concept, word]) => ({ concept, word })),
    chronicle: sim.culture.chronicle.slice(-6).map((e) => e.text),
    debts: sim.ledger.debts.length,
    overheard: sim.overheard.slice(-5),
    stories: topStories(sim.stories, sim.time, 7).map((e) => ({
      tick: e.tick,
      kind: e.kind,
      text: e.text,
      because: e.because,
    })),
    sinceLastVisit: storiesSince(sim.stories, sim.stories.lastSeenTick, 5).map(formatStory),
    shortages,
    timeOfDay: Math.round(timeOfDay(sim.time) * 100) / 100,
    closed: closedNow(sim.institutions, sim.time),
    tills: Object.keys(sim.institutions).map((tower) => ({
      tower,
      till: tillOf(sim.institutions, tower),
    })),
  }
}

function nearest(sim: Sim, c: Creature): Creature | null {
  let best: Creature | null = null
  let bestD = 8
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    const d = Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}
