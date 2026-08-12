/**
 * gather — picking things up out of the valley.
 *
 * Held, not tapped: every node takes a beat of sustained effort, longer for a
 * log than for a handful of berries, and the crosshair fills while you work.
 * Nodes grow back on their own clock so the valley is a renewing place rather
 * than a field you strip once.
 */
import type { ItemId } from '../lab/inventory'
import type { ResourceKind, ResourceNode } from '../world/scatter'
import type { PlayerProgress } from './progress'

export interface HarvestRule {
  item: ItemId
  /** how many you get, before luck */
  amount: number
  /** a one-in-n chance of an extra */
  bonusChance: number
  /** ticks before it comes back */
  regrow: number
  /** seconds of held effort */
  effort: number
  /** what the prompt says */
  verb: string
  /** what the node is called in the prompt */
  noun: string
  /** doing it faster with the right thing in hand */
  tool?: ItemId
}

export const HARVEST: Record<ResourceKind, HarvestRule> = {
  berry: {
    item: 'berry', amount: 2, bonusChance: 0.35, regrow: 900, effort: 0.65,
    verb: 'Pick', noun: 'berry bush',
  },
  wood: {
    item: 'timber', amount: 1, bonusChance: 0.3, regrow: 2400, effort: 1.7,
    verb: 'Chop', noun: 'fallen wood', tool: 'stick',
  },
  stone: {
    item: 'stone', amount: 1, bonusChance: 0.25, regrow: 3000, effort: 1.9,
    verb: 'Break', noun: 'loose stone',
  },
  herb: {
    item: 'herb', amount: 1, bonusChance: 0.4, regrow: 1500, effort: 0.6,
    verb: 'Gather', noun: 'herbs',
  },
  grain: {
    item: 'grain', amount: 2, bonusChance: 0.3, regrow: 1100, effort: 0.8,
    verb: 'Cut', noun: 'ripe grain',
  },
  fish: {
    item: 'fish', amount: 1, bonusChance: 0.15, regrow: 700, effort: 2.8,
    verb: 'Fish', noun: 'the shallows',
  },
}

/** Has this node grown back yet? */
export function nodeReady(p: PlayerProgress, nodeId: string, tick: number): boolean {
  const readyAt = p.nodes[nodeId]
  return readyAt === undefined || tick >= readyAt
}

export interface HarvestYield {
  item: ItemId
  amount: number
}

/**
 * Take from a node. The caller is responsible for having held the interaction
 * long enough and for finding room in the pack.
 */
export function harvestNode(
  p: PlayerProgress,
  node: ResourceNode,
  tick: number,
  rand: () => number = Math.random,
): HarvestYield | null {
  if (!nodeReady(p, node.id, tick)) return null
  const rule = HARVEST[node.kind]
  const amount = rule.amount + (rand() < rule.bonusChance ? 1 : 0)
  p.nodes[node.id] = tick + rule.regrow
  p.gathered += amount
  return { item: rule.item, amount }
}

/** Effort in seconds, reduced when you are carrying the right tool. */
export function effortFor(kind: ResourceKind, has: (id: ItemId) => boolean): number {
  const rule = HARVEST[kind]
  if (rule.tool && has(rule.tool)) return rule.effort * 0.6
  return rule.effort
}

/** Forget regrow timers that have already elapsed, so saves stay small. */
export function pruneNodes(p: PlayerProgress, tick: number): void {
  for (const [id, readyAt] of Object.entries(p.nodes)) {
    if (tick >= readyAt) delete p.nodes[id]
  }
}
