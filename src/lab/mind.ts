/**
 * mind — rational decision-making for creatures.
 *
 * Instead of a preprogrammed if/else ladder, every creature scores each
 * candidate action by UTILITY:
 *
 *   utility = needPressure × geneWeight × opportunity × memoryBias
 *
 * then adds a small NOISE term (free will / irrational streak) and picks the
 * highest-scoring action. Two creatures with the same body but different genes
 * rationally choose differently; the same creature can flip between close
 * calls. The chosen action is committed to for a few ticks (no flip-flop).
 */
import type { Sim } from './sim'
import type { Creature } from './creature'
import type { Genome } from './genetics'
import { marketPrice } from './economy'
import { findTower, towerAt } from './world'
import { dist } from './util'

export type ActionName =
  | 'food'      // go to food tower and buy bread
  | 'work'     // go to work tower, stay for a shift
  | 'sleep'    // go home and sleep
  | 'heal'     // go to pharmacy and buy medicine
  | 'drink'    // go to tavern and buy brew
  | 'den'      // go to the den and buy herb/spark
  | 'school'   // go to school and learn (raises future earnings)
  | 'farm'     // go to the farm and grow food (work alternative)
  | 'park'     // go to the park to relax and find joy
  | 'buyWeapon' // go to tools and buy a stick
  | 'deposit'  // go to bank and store money
  | 'withdraw' // go to bank and take money out when broke
  | 'play'     // go to gym/play and train strength
  | 'social'   // bond with a nearby creature
  | 'steal'    // rob a nearby creature
  | 'share'    // give coins to a grateful friend
  | 'fight'    // attack a nearby rival
  | 'collect'  // pick up dropped coins
  | 'idle'     // rest in place when content and uncurious
  | 'wander'   // explore something unseen

export type ActionScores = Record<ActionName, number>

const NOISE_AMPLITUDE = 0.28

/** How many ticks a chosen action stays committed before re-scoring. */
export const COMMITMENT_TICKS = 8

export function chooseAction(scores: ActionScores, rng: () => number): ActionName {
  let best: ActionName = 'wander'
  let bestScore = -Infinity
  const names = Object.keys(scores) as ActionName[]
  for (const name of names) {
    const noise = (rng() - 0.5) * 2 * NOISE_AMPLITUDE
    const v = scores[name] + noise
    if (v > bestScore) {
      bestScore = v
      best = name
    }
  }
  return best
}

/**
 * Score every action for a creature right now.
 * Bigger = more suitable. Needs create pressure; genes shape the weights;
 * memory biases; opportunity gates (a steal needs a nearby wallet).
 */
export function scoreActions(sim: Sim, c: Creature): ActionScores {
  const g: Genome = c.genome
  const h = c.chem.hunger
  const e = c.chem.energy
  const hp = c.chem.health
  const p = c.chem.pleasure
  const fear = c.chem.fear
  const str = c.chem.strength
  const soc = c.chem.social
  const grief = c.chem.grief

  const at = towerAt(c.pos.x, c.pos.z)
  const near = nearestOther(sim, c, 3)
  const moneyDrop = nearestMoneyDrop(sim, c, 40)

  const breadPrice = marketPrice(sim.economy, 'bread')
  const breadInStock = (sim.economy.goods.bread?.stock ?? 0) > 0
  const medPrice = marketPrice(sim.economy, 'medicine')
  const canAffordFood = c.wallet >= breadPrice
  const hungry = 1 - h
  const wounded = 1 - hp

  // craving: how strongly this creature's personality pulls toward substances
  const cravingBias = Math.min(1, g.addictionProne * 0.8 + (c.chem.addiction.brew ?? 0) * 0.5 + (c.chem.addiction.herb ?? 0) * 0.5 + (c.chem.addiction.spark ?? 0) * 0.6)

  // ── base pressures (0..1) ──
  const press = {
    hungry: Math.max(0, (1 - h - 0.45) / 0.55), // only urgent once below ~0.45
    tired: Math.max(0, (1 - e - 0.35) / 0.65),
    wounded: Math.max(0, (1 - hp - 0.35) / 0.65),
    bored: Math.max(0, (1 - p - 0.45) / 0.55),
    lonely: Math.max(0, (1 - soc - 0.3) / 0.7),
    weak: Math.max(0, (1 - str - 0.15) / 0.85),
    afraid: Math.max(0, (fear - 0.4) / 0.6),
  }

  // desperation: urgent needs dominate rational choice (free will only flips coin-flips)
  const starving = h < 0.15 ? 3.0 : h < 0.35 ? 1.6 : 0
  const collapsing = e < 0.12 ? 3.0 : 0
  const bleedingOut = hp < 0.25 ? 2.2 : 0

  const scores: ActionScores = {
    // food: urgent when hungry AND affordable; a broke creature knows it cannot buy
    // (and when the shelf is empty, food loses its pull — go earn/steal instead)
    // Knowledge-gated: a creature that never saw the food tower must explore first.
    food: (press.hungry * (0.9 + g.greed * 0.3) * (canAffordFood ? 1 : 0.25) * (breadInStock ? 1 : 0.2) + (canAffordFood ? starving : 0) * (breadInStock ? 1 : 0.1)) * (c.knowsTower('food') ? 1 : 0.15),
    // work: needed to afford food/medicine; honest creatures work, thieves prefer other means
    work: ((hungry > 0 ? (canAffordFood ? 0.15 : 1) : 0) * (0.6 + g.greed * 0.4) + starving * (canAffordFood ? 0.4 : (1 - g.theft) * 1.6) + bleedingOut * 0.6) * (c.knowsTower('work') ? 1 : 0.15),
    // sleep: tired or at home
    sleep: press.tired * (at?.id === 'homes' ? 1.2 : 0.8) + collapsing,
    // heal: wounded, only if affordable
    heal: (wounded * (canAffordMed(c, medPrice) ? 1.2 : 0.15) + bleedingOut) * (c.knowsTower('pharmacy') ? 1 : 0.2),
    // drink: ONLY a sad/bored creature or a real addict craves a drink. A
    // happy creature at a tavern has no reason to drink (no instant booze death).
    drink: ((c.chem.addiction.brew ?? 0) * 2.2 + press.bored * 1.1) * (0.5 + g.addictionProne * 1.2) * (at?.id === 'tavern' ? 1.6 : 0.9) * (c.knowsTower('tavern') ? 1 : 0.15),
    // den: craving herb/spark — only existing addiction or real boredom pulls.
    den: (((c.chem.addiction.herb ?? 0) * 2.4 + (c.chem.addiction.spark ?? 0) * 3.0 + press.bored * 0.9) * (0.4 + g.addictionProne * 1.3)) * (at?.id === 'den' ? 1.7 : 0.9) * (c.knowsTower('den') ? 1 : 0.15),
    // school: curious, ambitious creatures learn to earn more later (a modest want)
    school: (0.1 + g.learning * 0.8 + c.drives.importance * 0.3) * (c.education < 3 ? 1 : 0.1) * (c.wallet > 3 ? 1 : 0.4) * (at?.id === 'school' ? 1.5 : 0.7) * (c.knowsTower('school') ? 1 : 0.15),
    // farm: broke/hungry creatures who know the farm prefer growing food over work
    farm: (hungry > 0 ? (canAffordFood ? 0.2 : 1) : 0) * (0.5 + g.greed * 0.3) * (at?.id === 'farm' ? 1.4 : 0.8) * (c.knowsTower('farm') ? 1 : 0.15),
    // park: sad/bored creatures relax for joy — the healthy escape
    park: press.bored * 0.5 * (at?.id === 'park' ? 1.6 : 0.9) * (c.knowsTower('park') ? 1 : 0.15),
    // weapon: aggressive creatures want one (non-aggressive barely care)
    buyWeapon: g.aggression * 0.9 * (c.weapon ? 0 : 1) * (c.wallet >= 10 ? 1 : 0.3),
    // bank: cautious creatures deposit surplus (strong once they learned safety)
    deposit: (c.memory.facts.bankIsSafe ? 1.4 : 0.15) * (c.wallet > 6 ? 1.0 : c.wallet > 3 ? 0.4 : 0) * (0.4 + (1 - g.greed) * 0.8 + c.drives.lossAversion * 0.4) * (c.knowsTower('bank') ? 1 : 0.15),
    // withdraw: broke but has savings → go get money (bank is a real account).
    // Only withdraw what's needed — savings stay for real emergencies.
    withdraw: ((c.wallet < breadPrice ? 1 : 0) * (c.banked > 3 ? 1.5 : c.banked > 0 ? 0.8 : 0) + press.hungry * (c.banked > 0 ? 0.5 : 0)) * (c.knowsTower('bank') ? 1 : 0.15),
    // play: bored or weak, and at/near the gym — a leisure want, not a need
    play: (press.bored * 0.55 + press.weak * 1.0) * (at?.id === 'play' ? 1.6 : 0.7),
    // social: lonely + sociable + opportunity
    social: press.lonely * (0.3 + g.sociability * 1.4) * (near ? 1.3 : 0.2),
    // steal: desperate + thief genes + greed drive + target with money
    steal: (press.hungry * 0.9 + (canAffordFood ? 0 : 0.5) + c.drives.greed * 0.5) * (0.2 + g.theft * 1.6) * (near && near.wallet > 0 ? 1.4 : 0.05),
    // share: grateful + social conscience + reciprocity drive + wealth
    share: ((c.gratitude[near?.id ?? 0] ?? 0) * 1.2 + c.drives.reciprocity * 0.6) * (near && near.wallet < 2 && c.wallet > 8 ? 1.5 : 0.1),
    // fight: angry + vendetta + aggression + tribal defense of gangmates
    fight: (c.memory.vendettas[near?.id ?? 0] ?? 0) * 1.8
      + g.aggression * (press.bored * 0.5) * (near ? 1.4 : 0.1)
      + tribalDefense(sim, c, near),
    // collect: poor/greedy + hoarding drive and a pile nearby (hoarders grab
    // free money even when they already have some)
    collect: ((c.wallet < 4 ? 0.8 : 0.2) + g.greed * 0.9 + c.drives.greed * 0.8) * (moneyDrop ? 1.4 : 0.05),
    // idle: content creatures rest in place (low curiosity → idle wins over wander)
    idle: (1 - g.curiosity * 0.9) * (1 - c.drives.curiosity * 0.5) * 0.7,
    // wander: curious creatures explore the unknown (curiosity drive) — but
    // a creature with a specific craving wanders less (it knows what it wants)
    wander: (0.25 + g.curiosity * 0.6 + c.drives.curiosity * 0.5) * (1 - cravingBias) * (grief > 0.4 ? 1.3 : 1),
  }

  // grief dominates: a mourning creature cannot socialize or love
  if (grief > 0.4) {
    scores.social = 0
    scores.share = 0
    scores.play *= 0.4
  }

  return scores
}

function canAffordMed(c: Creature, medPrice: number): boolean {
  return c.wallet >= medPrice
}

/** Tribal drive: defend a gangmate who is being hurt by the nearby creature. */
function tribalDefense(sim: Sim, c: Creature, near: Creature | null): number {
  if (!near || c.gangId === null || near.gangId === c.gangId) return 0
  // is any gangmate near this outsider and wounded recently?
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive || o.gangId !== c.gangId) continue
    const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
    if (d < 6 && o.chem.health < 0.85) {
      return 2.2 // protect the pack
    }
  }
  // an outsider in gang territory is enough for tribal types
  if (c.genome.aggression > 0.7 && c.genome.loyalty > 0.6) {
    const d = dist(c.pos.x, c.pos.z, near.pos.x, near.pos.z)
    if (d < 3) return 0.9
  }
  return 0
}

function nearestOther(sim: Sim, c: Creature, range: number): Creature | null {
  let best: Creature | null = null
  let bestD = range
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  return best
}

function nearestMoneyDrop(sim: Sim, c: Creature, range: number): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestD = range
  for (const d of sim.drops) {
    if (d.kind !== 'money') continue
    const dd = dist(c.pos.x, c.pos.z, d.x, d.z)
    if (dd < bestD) {
      bestD = dd
      best = { x: d.x, z: d.z }
    }
  }
  return best
}

/** Validate that an action is still sensible at execution time (opportunity gate). */
export function actionValid(sim: Sim, c: Creature, action: ActionName): boolean {
  switch (action) {
    case 'steal': {
      const near = nearestOther(sim, c, 3)
      return !!near && near.wallet > 0
    }
    case 'social': {
      return !!nearestOther(sim, c, 3)
    }
    case 'share': {
      const near = nearestOther(sim, c, 3)
      return !!near && near.wallet < 2 && c.wallet > 8
    }
    case 'fight': {
      return !!nearestOther(sim, c, 3)
    }
    case 'collect': {
      return !!nearestMoneyDrop(sim, c, 40)
    }
    default:
      return true
  }
}

export function towerIdForAction(action: ActionName): string | null {
  switch (action) {
    case 'food': return 'food'
    case 'work': return 'work'
    case 'sleep': return 'homes'
    case 'heal': return 'pharmacy'
    case 'drink': return 'tavern'
    case 'den': return 'den'
    case 'school': return 'school'
    case 'farm': return 'farm'
    case 'park': return 'park'
    case 'buyWeapon': return 'tools'
    case 'deposit': return 'bank'
    case 'withdraw': return 'bank'
    case 'play': return 'play'
    default: return null
  }
}

export { findTower }
