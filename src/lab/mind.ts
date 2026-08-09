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
  | 'drink'    // go to tavern and buy a drink
  | 'buyWeapon' // go to tools and buy a stick
  | 'deposit'  // go to bank and store money
  | 'play'     // go to gym/play and train strength
  | 'social'   // bond with a nearby creature
  | 'steal'    // rob a nearby creature
  | 'share'    // give coins to a grateful friend
  | 'fight'    // attack a nearby rival
  | 'collect'  // pick up dropped coins
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
  const medPrice = marketPrice(sim.economy, 'medicine')
  const canAffordFood = c.wallet >= breadPrice
  const hungry = 1 - h
  const wounded = 1 - hp

  // ── base pressures (0..1) ──
  const press = {
    hungry: Math.max(0, (1 - h - 0.25) / 0.75),
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
    food: press.hungry * (0.9 + g.greed * 0.3) * (canAffordFood ? 1 : 0.25) + (canAffordFood ? starving : 0),
    // work: needed to afford food/medicine; honest creatures work, thieves prefer other means
    work: (hungry > 0 ? (canAffordFood ? 0.15 : 1) : 0) * (0.6 + g.greed * 0.4) + starving * (canAffordFood ? 0.4 : (1 - g.theft) * 1.6) + bleedingOut * 0.6,
    // sleep: tired or at home
    sleep: press.tired * (at?.id === 'homes' ? 1.2 : 0.8) + collapsing,
    // heal: wounded, only if affordable
    heal: wounded * (canAffordMed(c, medPrice) ? 1.2 : 0.15) + bleedingOut,
    // drink: sad + pleasure-seeking / addictive personality — stronger when AT the tavern
    drink: (press.bored * 0.6 + (c.chem.addiction.drink ?? 0) * 1.6) * (0.5 + g.addictionProne * 1.2) * (at?.id === 'tavern' ? 1.6 : 0.9),
    // weapon: aggressive creatures want one (non-aggressive barely care)
    buyWeapon: g.aggression * 0.9 * (c.weapon ? 0 : 1) * (c.wallet >= 10 ? 1 : 0.3),
    // bank: cautious creatures deposit surplus (strong once they learned safety)
    deposit: (c.memory.facts.bankIsSafe ? 1.4 : 0.15) * (c.wallet > 6 ? 1.0 : c.wallet > 3 ? 0.4 : 0) * (0.4 + (1 - g.greed) * 0.8),
    // play: bored or weak, and at/near the gym — a leisure want, not a need
    play: (press.bored * 0.55 + press.weak * 0.85) * (at?.id === 'play' ? 1.2 : 0.7),
    // social: lonely + sociable + opportunity
    social: press.lonely * (0.3 + g.sociability * 1.4) * (near ? 1.3 : 0.2),
    // steal: desperate + thief genes + target with money
    steal: (press.hungry * 0.9 + (canAffordFood ? 0 : 0.5)) * (0.2 + g.theft * 1.6) * (near && near.wallet > 0 ? 1.4 : 0.05),
    // share: grateful + social conscience + wealth
    share: (c.gratitude[near?.id ?? 0] ?? 0) * 1.2 * (near && near.wallet < 2 && c.wallet > 8 ? 1.5 : 0.1),
    // fight: angry + vendetta + aggression
    fight: (c.memory.vendettas[near?.id ?? 0] ?? 0) * 1.8 + g.aggression * (press.bored * 0.5) * (near ? 1.4 : 0.1),
    // collect: poor/greedy and a pile nearby
    collect: ((c.wallet < 4 ? 0.8 : 0) + g.greed * 0.4) * (moneyDrop ? 1.3 : 0.05),
    // wander: curious creatures explore the unknown
    wander: (0.25 + g.curiosity * 0.6) * (grief > 0.4 ? 1.3 : 1),
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
    case 'buyWeapon': return 'tools'
    case 'deposit': return 'bank'
    case 'play': return 'play'
    default: return null
  }
}

export { findTower }
