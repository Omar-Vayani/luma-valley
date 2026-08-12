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
import { trustTowards, reputationOf } from './reputation'
import { revengeScore } from './vengeance'
import { normPressure } from './norms'
import { impairmentOf } from './substances'
import { romanticInterest } from './socialbond'
import { emotionalRiskBias } from './emotions'
import { riskModifier } from './psyche'
import { isOpen, isNight } from './institutions'
import { vigorFor, isMature } from './lifecycle'
import { dist } from './util'

export type ActionName =
  | 'food'      // go to food tower and buy bread
  | 'work'     // go to work tower, stay for a shift
  | 'sleep'    // go home and sleep
  | 'nest'     // go home with a partner, hoping to start a family
  | 'heal'     // go to pharmacy and buy medicine
  | 'clinic'   // go to clinic for illness / serious treatment
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
  | 'explore'  // walk toward an unseen tower (committed, no flip-flopping)
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

  // Norm pressure: the settlement's expectations, filtered through this
  // creature's conformity. Strong norms make transgressions feel costlier.
  const sobrietyNorm = normPressure(sim.culture, c, 'sobriety')
  const propertyNorm = normPressure(sim.culture, c, 'property')
  const violenceNorm = normPressure(sim.culture, c, 'nonviolence')
  const generosityNorm = normPressure(sim.culture, c, 'generosity')
  // Emotion and psyche shift how much risk feels acceptable right now.
  const risk = 1 + emotionalRiskBias(c.emotions) + riskModifier(c)
  // A shut door is a shut door: no point setting off for the market at night.
  const open = (tower: string): number => (isOpen(sim.institutions, tower, sim.time) ? 1 : 0.12)
  const nightfall = isNight(sim.time) ? 1.8 : 1

  // ── social awareness: what do I believe about the creature next to me? ──
  // trust: -1..1 (negative = distrust). Reputation is hearsay-tolerant: a
  // creature can distrust a known thief it has never met (gossip network).
  const trustNear = near ? trustTowards(c, near.id) : 0
  const repNear = near ? reputationOf(c, near.id) : null
  const knownThief = (repNear?.thief ?? 0) > 0.4
  const knownAggressor = (repNear?.aggressor ?? 0) > 0.4
  const knownProtector = (repNear?.protector ?? 0) > 0.4
  // bonded? the bond does NOT make betrayal impossible — just less likely
  const bondedNear = near ? (c.bonds[near.id] ?? 0) > 0.35 || c.partnerId === near.id : false
  const BOND_PENALTY = 0.35 // betrayal is possible, but the bond weighs on the mind
  // paranoia raises baseline fear; a known aggressor nearby sharpens it
  const fearEff = Math.min(1, fear + c.emotions.paranoia * 0.4 + (knownAggressor && near ? 0.25 : 0))

  const breadPrice = marketPrice(sim.economy, 'bread')
  const breadInStock = (sim.economy.goods.bread?.stock ?? 0) > 0
  const medPrice = marketPrice(sim.economy, 'medicine')
  const canAffordFood = c.wallet >= breadPrice
  const hungry = 1 - h
  const wounded = 1 - hp

  // craving: how strongly this creature's personality pulls toward substances
  const cravingBias = Math.min(1, g.addictionProne * 0.8 + (c.chem.addiction.brew ?? 0) * 0.5 + (c.chem.addiction.herb ?? 0) * 0.5 + (c.chem.addiction.spark ?? 0) * 0.6)

  // Already intoxicated. Drink makes people braver, friendlier and worse at
  // caring what happens tomorrow — and one drink is the best predictor of the
  // second, which is most of what a bad night out is.
  const drunk = impairmentOf(c.chem)
  // Withdrawal outbids nearly everything. A creature in it will spend rent.
  const craving = {
    brew: Math.max(0, (c.chem.addiction.brew ?? 0) - 0.25),
    herb: Math.max(0, (c.chem.addiction.herb ?? 0) - 0.25),
    spark: Math.max(0, (c.chem.addiction.spark ?? 0) - 0.25),
  }
  // What the settlement thinks of it. `normPressure` is already the pull
  // toward conforming, blending the shared norm with this creature's own
  // temperament — so somebody born prone to it feels almost none of this. It
  // makes a marginal drinker think twice and does nothing for an addict.
  const shame = sobrietyNorm * 0.75

  // ── base pressures (0..1) ──
  const press = {
    hungry: Math.max(0, (1 - h - 0.45) / 0.55), // only urgent once below ~0.45
    tired: Math.max(0, (1 - e - 0.35) / 0.65),
    wounded: Math.max(0, (1 - hp - 0.35) / 0.65),
    bored: Math.max(0, (1 - p - 0.45) / 0.55),
    lonely: Math.max(0, (1 - soc - 0.3) / 0.7),
    weak: Math.max(0, (1 - str - 0.15) / 0.85),
    afraid: Math.max(0, (fearEff - 0.4) / 0.6),
  }

  // desperation: urgent needs dominate rational choice (free will only flips coin-flips)
  const starving = h < 0.15 ? 3.0 : h < 0.35 ? 1.6 : 0
  const collapsing = e < 0.12 ? 3.0 : 0
  const bleedingOut = hp < 0.25 ? 2.2 : 0

  const scores: ActionScores = {
    // food: urgent when hungry AND affordable; a broke creature knows it cannot buy
    // (and when the shelf is empty, food loses its pull — go earn/steal instead)
    // Knowledge-gated: a creature that never saw the food tower must explore first.
    food: open('food') * (press.hungry * (0.9 + g.greed * 0.3) * (canAffordFood ? 1 : 0.25) * (breadInStock ? 1 : 0.2) + (canAffordFood ? starving : 0) * (breadInStock ? 1 : 0.1)) * (c.knowsTower('food') ? 1 : 0.15),
    // work: needed to afford food/medicine; honest creatures work, thieves
    // prefer other means. A creature with a claimed role also works for
    // purpose, not only because the belly is empty. Children do not work.
    work: (((hungry > 0 ? (canAffordFood ? 0.15 : 1) : 0) * (0.6 + g.greed * 0.4)
      + starving * (canAffordFood ? 0.4 : (1 - g.theft) * 1.6)
      + bleedingOut * 0.6
      + (c.job ? 0.3 + (1 - c.chem.purpose) * 0.5 : 0))
      * (c.knowsTower('work') || c.job ? 1 : 0.15))
      * (isMature(c.stage) ? 1 : 0.05) * open('work'),
    // sleep: tired or at home
    sleep: press.tired * nightfall * (at?.id === 'homes' ? 1.2 : 0.8) + collapsing,
    // nest: a settled, well-fed couple with a home wants time together there.
    // This is what actually brings two partners to the same doorway.
    nest: nestDrive(sim, c) * (at?.id === 'homes' ? 1.6 : 1.1),
    // heal: wounded, only if affordable
    heal: open('pharmacy') * (wounded * (canAffordMed(c, medPrice) ? 1.2 : 0.15) + bleedingOut) * (c.knowsTower('pharmacy') ? 1 : 0.2),
    // clinic: illness or a real wound. Being broke makes you hesitate, but
    // someone badly hurt goes anyway and hopes the healer is charitable.
    clinic: ((c.illness > 0.2 ? 1.4 : 0) + (c.injury > 0.25 ? 1.2 : 0) + (hp < 0.45 ? 0.8 : 0) + bleedingOut)
      * (c.wallet >= 5 || hp < 0.4 ? 1 : 0.45)
      * (c.knowsTower('clinic') ? 1 : 0.2),
    // drink: ONLY a sad/bored creature or a real addict craves a drink. A
    // happy creature at a tavern has no reason to drink (no instant booze death).
    drink: open('tavern')
      * ((c.chem.addiction.brew ?? 0) * 2.2 + craving.brew * 3.4 + press.bored * 1.1 + drunk.recklessness * 0.9)
      * (0.5 + g.addictionProne * 1.2)
      * (at?.id === 'tavern' ? 1.6 : 0.9)
      * (1 - shame * (1 - Math.min(1, (c.chem.addiction.brew ?? 0) * 2)) * 0.35)
      * (c.knowsTower('tavern') ? 1 : 0.15),
    // den: craving herb/spark — only existing addiction or real boredom pulls.
    den: (((c.chem.addiction.herb ?? 0) * 2.4 + (c.chem.addiction.spark ?? 0) * 3.0
      + craving.herb * 3.2 + craving.spark * 5.0
      + press.bored * 0.9 + drunk.recklessness * 0.7)
      * (0.4 + g.addictionProne * 1.3))
      * (at?.id === 'den' ? 1.7 : 0.9)
      * (1 - shame * (1 - Math.min(1, ((c.chem.addiction.spark ?? 0) + (c.chem.addiction.herb ?? 0)) * 2)) * 0.5)
      * (c.knowsTower('den') ? 1 : 0.15),
    // school: curious, ambitious creatures learn to earn more later (a modest want)
    school: open('school') * (0.1 + g.learning * 0.8 + c.drives.importance * 0.3) * (c.education < 3 ? 1 : 0.1) * (c.wallet > 3 ? 1 : 0.4) * (at?.id === 'school' ? 1.5 : 0.7) * (c.knowsTower('school') ? 1 : 0.15),
    // farm: broke/hungry creatures who know the farm prefer growing food over work
    farm: open('farm') * (hungry > 0 ? (canAffordFood ? 0.2 : 1) : 0) * (0.5 + g.greed * 0.3) * (at?.id === 'farm' ? 1.4 : 0.8) * (c.knowsTower('farm') ? 1 : 0.15),
    // park: sad/bored creatures relax for joy — the healthy escape
    park: press.bored * 0.5 * (at?.id === 'park' ? 1.6 : 0.9) * (c.knowsTower('park') ? 1 : 0.15),
    // weapon: aggressive creatures want one (non-aggressive barely care)
    buyWeapon: open('tools') * g.aggression * 0.9 * (c.weapon ? 0 : 1) * (c.wallet >= 10 ? 1 : 0.3),
    // bank: cautious creatures deposit surplus (strong once they learned safety)
    deposit: open('bank') * (c.memory.facts.bankIsSafe ? 1.4 : 0.15) * (c.wallet > 6 ? 1.0 : c.wallet > 3 ? 0.4 : 0) * (0.4 + (1 - g.greed) * 0.8 + c.drives.lossAversion * 0.4) * (c.knowsTower('bank') ? 1 : 0.15),
    // withdraw: broke but has savings → go get money (bank is a real account).
    // Only withdraw what's needed — savings stay for real emergencies.
    withdraw: open('bank') * ((c.wallet < breadPrice ? 1 : 0) * (c.banked > 3 ? 1.5 : c.banked > 0 ? 0.8 : 0) + press.hungry * (c.banked > 0 ? 0.5 : 0)) * (c.knowsTower('bank') ? 1 : 0.15),
    // play: bored or weak, and at/near the gym — a leisure want, not a need
    play: (press.bored * 0.55 + press.weak * 1.0) * (at?.id === 'play' ? 1.6 : 0.7),
    // social: lonely + sociable + opportunity — but reputation gates who we
    // approach: known thieves/aggressors are shunned, protectors are sought.
    // Company is not only a cure for loneliness: an unattached creature with
    // a romantic streak actively seeks people out, and that is how couples
    // ever meet in the first place.
    social: (press.lonely + (c.partnerId === null && isMature(c.stage) ? 0.25 + g.lovePropensity * 0.5 : 0))
      * (0.3 + g.sociability * 1.4 + c.emotions.joy * 0.3) * (near ? 1.3 : 0.2)
      * (near
        ? (knownThief || knownAggressor ? 0.25 : knownProtector || trustNear > 0.3 ? 1.6 : 0.7 + Math.max(0, trustNear) * 0.8)
        : 1),
    // steal: desperate + thief genes + greed drive + envy — but a bond makes
    // betrayal less likely (penalty, not a hard block) and we don't rob allies
    steal: (press.hungry * 0.9 + (canAffordFood ? 0 : 0.5) + c.drives.greed * 0.5 + c.emotions.envy * 0.8)
      * (0.2 + g.theft * 1.6)
      * (near && near.wallet > 0 ? 1.4 : 0.05)
      * (bondedNear ? BOND_PENALTY : 1)
      * (near && (knownProtector || trustNear > 0.3) ? 0.3 : 1)
      // a settlement that punishes theft makes thieves think twice
      * (1 - propertyNorm * 0.55)
      * Math.max(0.3, risk)
      // guilt and shame from past wrongs restrain the next one
      * (1 - c.emotions.guilt * 0.3 - c.emotions.shame * 0.2),
    // share: grateful + social conscience + reciprocity + affection
    share: ((c.gratitude[near?.id ?? 0] ?? 0) * 1.2 + c.drives.reciprocity * 0.6 + c.emotions.affection * 0.5
      + c.emotions.joy * 0.3 + c.emotions.gratitude * 0.5 + c.emotions.guilt * 0.6)
      * (0.6 + generosityNorm * 0.8)
      * (near && near.wallet < 2 && c.wallet > 8 ? 1.5 : 0.1),
    // fight: vendetta + REVENGE + aggression + spite/resentment + tribal + protect friends
    // + shun known aggressors. A bond to the target dampens it, never blocks.
    fight: ((c.memory.vendettas[near?.id ?? 0] ?? 0) * 1.8
      + revengeScore(c.vengeance, near?.id ?? -1) * 2.6 // the thirst for revenge
      + (g.aggression * (press.bored * 0.5) + c.emotions.spite * 1.0 + c.emotions.resentment * 0.5) * (near ? 1.4 : 0.1)
      + tribalDefense(sim, c, near)
      + protectFriend(sim, c)
      + (knownAggressor && near ? 0.6 : 0))
      * (bondedNear ? BOND_PENALTY + 0.25 : 1)
      // a community that condemns violence dampens the swing
      * (1 - violenceNorm * 0.45)
      * Math.max(0.3, risk)
      // children and elders are not brawlers
      * vigorFor(c.stage),
    // collect: poor/greedy + hoarding drive + envy (hoard-hoarding) and a pile
    // nearby (hoarders grab free money even when they already have some)
    collect: ((c.wallet < 4 ? 0.8 : 0.2) + g.greed * 0.9 + c.drives.greed * 0.8 + c.emotions.envy * 0.7) * (moneyDrop ? 1.4 : 0.05),
    // idle: content creatures rest in place (low curiosity → idle wins over
    // wander) — but ONLY when the creature is genuinely comfortable. Hunger,
    // thirst-adjacent needs, and real drive beat idling, so nobody dies doing
    // nothing in the middle of the map.
    idle: (1 - g.curiosity * 0.9) * (1 - c.drives.curiosity * 0.5)
      * 0.7 * (1 - press.hungry * 0.9) * (1 - press.tired * 0.6),
    // wander: curious creatures explore the unknown (curiosity drive) — but
    // a creature with a specific craving wanders less (it knows what it wants).
    // Paranoia keeps creatures moving/avoiding; a known aggressor nearby makes
    // the area feel unsafe so they drift off.
    wander: (0.25 + g.curiosity * 0.6 + c.drives.curiosity * 0.5) * (1 - cravingBias) * (grief > 0.4 ? 1.3 : 1)
      + c.emotions.paranoia * 0.4
      + (knownAggressor && near ? 0.35 : 0),
    // explore: explicitly seek a tower the creature has NOT learned yet — a
    // committed curiosity-driven walk (the mind only picks it when unknown
    // towers remain; once committed, travel-commit holds until arrival).
    explore: (0.2 + g.curiosity * 0.8 + c.drives.curiosity * 0.7) * (1 - cravingBias) + c.emotions.paranoia * 0.3,
  }

  // grief dominates: a mourning creature cannot socialize or love
  if (grief > 0.4) {
    scores.social = 0
    scores.share = 0
    scores.play *= 0.4
  }

  // joy: a happy creature wants to play and share its good mood
  if (c.emotions.joy > 0.4) {
    scores.play += 0.2
    scores.share += 0.1
  }

  // Drink talking. Everything careful gets harder and everything rash gets
  // easier — which is how an ordinary evening turns into a story.
  if (drunk.recklessness > 0.05) {
    const r = drunk.recklessness
    scores.social *= 1 + drunk.sociability
    scores.play *= 1 + drunk.sociability * 0.6
    scores.fight *= 1 + r * 1.4
    scores.steal *= 1 + r * 0.8
    scores.share *= 1 + drunk.sociability * 0.5
    scores.work *= 1 - r * 0.6
    scores.school *= 1 - r * 0.8
    scores.deposit *= 1 - r * 0.7
    scores.sleep *= 1 - r * 0.3
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

/**
 * Selfless protection: a creature with a strong bond (or deep affection /
 * loyalty emotion) defends a wounded friend. The trigger is a *friend* in
 * danger, not a vendetta — anyone can protect someone they love. Returns a
 * fight-score boost when a bonded friend nearby is wounded and there is a
 * threat (known aggressor / distrusted / vendetta) in the area.
 */
function protectFriend(sim: Sim, c: Creature): number {
  // is any bonded friend nearby and wounded?
  let friendWounded = false
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    const isFriend = o.id === c.partnerId || (c.bonds[o.id] ?? 0) > 0.5
    if (!isFriend) continue
    if (o.chem.health < 0.85 && dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z) < 6) {
      friendWounded = true
      break
    }
  }
  if (!friendWounded) return 0
  // is there a threat nearby to defend against?
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
    if (d > 4) continue
    const isThreat = (c.memory.vendettas[o.id] ?? 0) > 0.3
      || trustTowards(c, o.id) < -0.2
      || (c.reputation[o.id]?.aggressor ?? 0) > 0.4
    if (isThreat) {
      // loyalty & deep affection make protection more urgent (selfless heroism)
      return 1.2 + c.emotions.loyalty * 0.8 + c.emotions.affection * 0.8
    }
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

/**
 * How strongly a partnered creature is drawn home right now. Contentment
 * matters as much as affection: nobody starts a family while starving,
 * frightened, or grieving.
 */
export function nestDrive(sim: Sim, c: Creature): number {
  if (c.partnerId === null || !isMature(c.stage) || c.stage === 'elder') return 0
  if (!c.knowsTower('homes') && c.householdId == null) return 0
  const partner = sim.creatureById(c.partnerId)
  if (!partner || !partner.alive) return 0
  const edge = c.social[c.partnerId]
  const attachment = Math.max(c.chem.bond, edge ? romanticInterest(edge, c.genome.lovePropensity) : 0)
  if (attachment < 0.5) return 0
  const settled =
    Math.min(1, c.chem.hunger / 0.45) *
    Math.min(1, c.chem.energy / 0.45) *
    Math.min(1, c.chem.health / 0.7) *
    (1 - c.chem.fear) *
    (1 - c.chem.grief)
  if (settled <= 0.2) return 0
  const crowded = sim.creatures.filter((o) => o.alive).length >= sim.settings.populationCap
  if (crowded) return 0
  return attachment * settled * (0.7 + c.genome.lovePropensity * 0.6) * 1.7
}

export function towerIdForAction(action: ActionName): string | null {
  switch (action) {
    case 'food': return 'food'
    case 'work': return 'work'
    case 'sleep': return 'homes'
    case 'nest': return 'homes'
    case 'heal': return 'pharmacy'
    case 'clinic': return 'clinic'
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
