/**
 * socialbond — multidimensional, asymmetric relationships.
 *
 * Bonds are NOT a single friendship score. Each creature holds an edge toward
 * every other individual it has meaningfully interacted with:
 *
 *   familiarity, trust, affection, attraction, respect,
 *   fear, gratitude, suspicion, resentment, loyalty, dependence
 *
 * Love/courtship emerge from compatibility + attraction + trust + shared
 * history, not from a scripted cutscene. Edges are sparse and capped.
 */
import { clamp01 } from './util'

export type BondDim =
  | 'familiarity'
  | 'trust'
  | 'affection'
  | 'attraction'
  | 'respect'
  | 'fear'
  | 'gratitude'
  | 'suspicion'
  | 'resentment'
  | 'loyalty'
  | 'dependence'

export const BOND_DIMS: BondDim[] = [
  'familiarity', 'trust', 'affection', 'attraction', 'respect',
  'fear', 'gratitude', 'suspicion', 'resentment', 'loyalty', 'dependence',
]

export type SocialEdge = Record<BondDim, number>

export type SocialGraph = Record<number, SocialEdge>

const EDGE_CAP = 24 // max remembered others per creature
const DECAY: Partial<Record<BondDim, number>> = {
  fear: 0.004,
  gratitude: 0.002,
  suspicion: 0.0015,
  resentment: 0.001,
  attraction: 0.0008,
}

export function createEdge(): SocialEdge {
  const e = {} as SocialEdge
  for (const d of BOND_DIMS) e[d] = 0
  return e
}

export function createSocialGraph(): SocialGraph {
  return {}
}

/** Get or create the directed edge from observer → target. */
export function edgeTo(graph: SocialGraph, targetId: number): SocialEdge {
  const existing = graph[targetId]
  if (existing) return existing
  const fresh = createEdge()
  graph[targetId] = fresh
  pruneGraph(graph)
  return fresh
}

function pruneGraph(graph: SocialGraph): void {
  const ids = Object.keys(graph).map(Number)
  if (ids.length <= EDGE_CAP) return
  // drop the least-familiar / least-intense edges
  ids.sort((a, b) => edgeIntensity(graph[a]) - edgeIntensity(graph[b]))
  const drop = ids.length - EDGE_CAP
  for (let i = 0; i < drop; i++) delete graph[ids[i]]
}

export function edgeIntensity(e: SocialEdge): number {
  let s = 0
  for (const d of BOND_DIMS) s += e[d]
  return s
}

export function bumpEdge(graph: SocialGraph, targetId: number, dim: BondDim, amount: number): void {
  const e = edgeTo(graph, targetId)
  e[dim] = clamp01(e[dim] + amount)
  if (dim !== 'familiarity') e.familiarity = clamp01(e.familiarity + Math.abs(amount) * 0.25)
}

/**
 * Slow decay of volatile dimensions each tick. Familiarity protects feelings:
 * you do not cool on someone you see every day, but a stranger's impression
 * fades quickly.
 */
export function tickSocialGraph(graph: SocialGraph): void {
  for (const id of Object.keys(graph)) {
    const e = graph[Number(id)]
    const persistence = 1 - e.familiarity * 0.85
    for (const [dim, rate] of Object.entries(DECAY) as [BondDim, number][]) {
      e[dim] = clamp01(e[dim] - rate * persistence)
    }
  }
}

/**
 * Romantic interest score 0..1 — used for courtship decisions.
 * Requires familiarity + attraction + trust, penalized by fear/resentment.
 */
export function romanticInterest(e: SocialEdge, lovePropensity: number): number {
  const base =
    e.attraction * 0.35 +
    e.affection * 0.25 +
    e.trust * 0.2 +
    e.familiarity * 0.1 +
    lovePropensity * 0.1
  const penalty = e.fear * 0.3 + e.resentment * 0.35 + e.suspicion * 0.15
  return clamp01(base - penalty)
}

/** Friendship score used by social / share / defend choices. */
export function friendship(e: SocialEdge): number {
  return clamp01(
    e.affection * 0.35 +
    e.trust * 0.3 +
    e.loyalty * 0.2 +
    e.gratitude * 0.1 +
    e.familiarity * 0.05 -
    e.resentment * 0.25 -
    e.suspicion * 0.15,
  )
}

/** Apply a social event to the directed edge. */
export type SocialEventKind =
  | 'meet'
  | 'talk'
  | 'gift'
  | 'share'
  | 'help'
  | 'hurt'
  | 'steal'
  | 'betray'
  | 'comfort'
  | 'reject'
  | 'flirt'
  | 'forgive'
  | 'teach'
  | 'workTogether'

export function applySocialEvent(
  graph: SocialGraph,
  targetId: number,
  kind: SocialEventKind,
  intensity = 1,
): void {
  const i = intensity
  switch (kind) {
    case 'meet':
      bumpEdge(graph, targetId, 'familiarity', 0.15 * i)
      break
    case 'talk': {
      // time spent together compounds: the better you know someone, the more
      // an ordinary conversation moves the needle
      const known = 1 + (graph[targetId]?.familiarity ?? 0)
      bumpEdge(graph, targetId, 'familiarity', 0.08 * i)
      bumpEdge(graph, targetId, 'affection', 0.05 * i * known)
      bumpEdge(graph, targetId, 'trust', 0.02 * i * known)
      break
    }
    case 'gift':
      bumpEdge(graph, targetId, 'gratitude', 0.25 * i)
      bumpEdge(graph, targetId, 'affection', 0.12 * i)
      bumpEdge(graph, targetId, 'trust', 0.08 * i)
      break
    case 'share':
      bumpEdge(graph, targetId, 'trust', 0.1 * i)
      bumpEdge(graph, targetId, 'affection', 0.08 * i)
      bumpEdge(graph, targetId, 'gratitude', 0.1 * i)
      break
    case 'help':
      bumpEdge(graph, targetId, 'gratitude', 0.2 * i)
      bumpEdge(graph, targetId, 'trust', 0.15 * i)
      bumpEdge(graph, targetId, 'respect', 0.1 * i)
      bumpEdge(graph, targetId, 'dependence', 0.05 * i)
      break
    case 'hurt':
      bumpEdge(graph, targetId, 'fear', 0.3 * i)
      bumpEdge(graph, targetId, 'resentment', 0.25 * i)
      bumpEdge(graph, targetId, 'trust', -0.3 * i)
      bumpEdge(graph, targetId, 'affection', -0.15 * i)
      break
    case 'steal':
      bumpEdge(graph, targetId, 'suspicion', 0.35 * i)
      bumpEdge(graph, targetId, 'resentment', 0.3 * i)
      bumpEdge(graph, targetId, 'trust', -0.4 * i)
      break
    case 'betray':
      bumpEdge(graph, targetId, 'resentment', 0.45 * i)
      bumpEdge(graph, targetId, 'suspicion', 0.3 * i)
      bumpEdge(graph, targetId, 'trust', -0.55 * i)
      bumpEdge(graph, targetId, 'loyalty', -0.3 * i)
      bumpEdge(graph, targetId, 'affection', -0.25 * i)
      break
    case 'comfort':
      bumpEdge(graph, targetId, 'affection', 0.15 * i)
      bumpEdge(graph, targetId, 'trust', 0.1 * i)
      bumpEdge(graph, targetId, 'fear', -0.2 * i)
      break
    case 'reject':
      bumpEdge(graph, targetId, 'resentment', 0.15 * i)
      bumpEdge(graph, targetId, 'attraction', -0.2 * i)
      bumpEdge(graph, targetId, 'affection', -0.1 * i)
      break
    case 'flirt':
      bumpEdge(graph, targetId, 'attraction', 0.18 * i)
      bumpEdge(graph, targetId, 'affection', 0.08 * i)
      bumpEdge(graph, targetId, 'familiarity', 0.06 * i)
      break
    case 'forgive':
      bumpEdge(graph, targetId, 'resentment', -0.3 * i)
      bumpEdge(graph, targetId, 'suspicion', -0.15 * i)
      bumpEdge(graph, targetId, 'trust', 0.1 * i)
      bumpEdge(graph, targetId, 'loyalty', 0.08 * i)
      break
    case 'teach':
      bumpEdge(graph, targetId, 'respect', 0.12 * i)
      bumpEdge(graph, targetId, 'gratitude', 0.1 * i)
      bumpEdge(graph, targetId, 'familiarity', 0.05 * i)
      break
    case 'workTogether':
      bumpEdge(graph, targetId, 'respect', 0.08 * i)
      bumpEdge(graph, targetId, 'loyalty', 0.06 * i)
      bumpEdge(graph, targetId, 'familiarity', 0.05 * i)
      break
  }
}

/** Compatibility for romance — genome similarity + complementary temperament. */
export function geneticCompatibility(
  a: { sociability: number; loyalty: number; aggression: number; lovePropensity: number; fearfulness: number },
  b: { sociability: number; loyalty: number; aggression: number; lovePropensity: number; fearfulness: number },
): number {
  const socialFit = 1 - Math.abs(a.sociability - b.sociability)
  const loyaltyFit = 1 - Math.abs(a.loyalty - b.loyalty)
  const calmFit = 1 - Math.abs(a.aggression - b.aggression) * 0.7
  const love = (a.lovePropensity + b.lovePropensity) / 2
  const fearPenalty = (a.fearfulness + b.fearfulness) * 0.1
  return clamp01(socialFit * 0.25 + loyaltyFit * 0.25 + calmFit * 0.2 + love * 0.3 - fearPenalty)
}
