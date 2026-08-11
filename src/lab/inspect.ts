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

export interface InspectReport {
  id: number
  name: string
  alive: boolean
  age: number
  action: string
  intention: string | null
  emotion: string
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

  return {
    id: c.id,
    name: c.name,
    alive: c.alive,
    age: c.age,
    action: c.action,
    intention: c.intention,
    emotion: emotion.type,
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
    lines.push(`Choosing "${top.action}" (score ${top.score}).`)
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
  return lines
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
