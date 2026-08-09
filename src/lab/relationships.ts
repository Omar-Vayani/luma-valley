/**
 * relationships — the emotional glue between creatures.
 *
 * gangs:  a GROUP, not a building. Two creatures who build strong reciprocal
 *         bonds AND share tribal genes (aggression + loyalty) decide to be
 *         gangmates. Gangmates defend each other against outsiders.
 * love:   partners follow each other, help each other, and get jealous when
 *         the other bonds with a rival.
 * grief:  when a loved one dies the survivor carries the body to the
 *         graveyard and buries it (a grave stone is left behind).
 */
import type { Sim } from './sim'
import type { Creature } from './creature'
import { findTower } from './world'
import { dist, clamp01 } from './util'

const GANG_TRIBAL_THRESHOLD = 1.35 // aggression + loyalty
const GANG_FRIEND_RADIUS = 12

/** Every tick: update gang membership, jealousy, follow, and burial duty. */
export function tickRelationships(sim: Sim): void {
  for (const c of sim.creatures) {
    if (!c.alive) continue
    updateGang(sim, c)
    updateJealousy(sim, c)
    followPartner(sim, c)
    carryCorpse(sim, c)
  }
}

function updateGang(sim: Sim, c: Creature): void {
  const tribal = c.genome.aggression + c.genome.loyalty
  if (c.gangId !== null || tribal < GANG_TRIBAL_THRESHOLD) return
  // start a new gang with a fellow tribal who is close by (tribal instinct)
  let best: Creature | null = null
  let bestD = GANG_FRIEND_RADIUS
  for (const o of sim.creatures) {
    if (o.id === c.id || !o.alive) continue
    if (o.genome.aggression + o.genome.loyalty < GANG_TRIBAL_THRESHOLD) continue
    const d = dist(c.pos.x, c.pos.z, o.pos.x, o.pos.z)
    if (d < bestD) {
      bestD = d
      best = o
    }
  }
  if (best) {
    // if the friend is already in a gang, join it; otherwise start fresh together
    if (best.gangId !== null) {
      c.gangId = best.gangId
    } else {
      const newId = 100 + Math.floor(sim.rng() * 9000)
      c.gangId = newId
      best.gangId = newId
    }
    c.memory.facts.hasGang = 1
    best.memory.facts.hasGang = 1
  }
}

function updateJealousy(sim: Sim, c: Creature): void {
  if (c.partnerId === null || !c.chem.bond) return
  const partner = sim.creatures.find((o) => o.id === c.partnerId)
  if (!partner || !partner.alive) return
  // count partner's bonds to creatures that are not me
  let rivalBonds = 0
  for (const [id, level] of Object.entries(partner.bonds)) {
    if (Number(id) !== c.id && level > 0.3) rivalBonds += level
  }
  if (rivalBonds > 0) {
    c.jealousy = clamp01(c.jealousy + 0.02)
    c.chem.pleasure = clamp01(c.chem.pleasure - 0.015)
    c.chem.fear = clamp01(c.chem.fear + 0.005)
  } else {
    c.jealousy = clamp01(c.jealousy - 0.02)
  }
}

/** A partnered creature wants to be near its partner (stays in the same area). */
function followPartner(sim: Sim, c: Creature): void {
  if (c.partnerId === null || c.chem.grief > 0.4) return
  const partner = sim.creatures.find((o) => o.id === c.partnerId)
  if (!partner || !partner.alive) return
  const d = dist(c.pos.x, c.pos.z, partner.pos.x, partner.pos.z)
  if (d > 6) {
    // drift toward the partner when far away
    const step = Math.min(0.5, d - 6)
    c.pos.x += ((partner.pos.x - c.pos.x) / d) * step
    c.pos.z += ((partner.pos.z - c.pos.z) / d) * step
  }
}

/** A grieving creature carries a loved corpse to the graveyard and buries it. */
function carryCorpse(sim: Sim, c: Creature): void {
  if (!c.alive || c.chem.grief <= 0.4) return
  // who is this creature grieving? a partner, or a strong bond
  let loved: Creature | undefined
  if (c.partnerId !== null) {
    const p = sim.creatures.find((o) => o.id === c.partnerId)
    if (p && !p.alive && !p.buried) loved = p
  }
  if (!loved) {
    for (const o of sim.creatures) {
      if (!o.alive && !o.buried && (c.bonds[o.id] ?? 0) > 0.5) {
        loved = o
        break
      }
    }
  }
  if (!loved) return
  const gy = findTower('graveyard')
  if (!gy) return
  const d = dist(c.pos.x, c.pos.z, gy.x, gy.z)
  if (d <= gy.radius + 2) {
    // arrived — bury the body
    loved.buried = true
    sim.graves.push({ creatureId: loved.id, name: loved.name, x: gy.x + (sim.rng() - 0.5) * 4, z: gy.z + (sim.rng() - 0.5) * 4, tick: sim.time })
    emitBury(sim, c, loved, gy.x, gy.z)
    c.chem.grief = clamp01(c.chem.grief - 0.35) // closure helps
    c.action = 'bury'
  } else {
    // walk toward the graveyard, carrying the body
    const step = Math.min(0.5, d)
    c.pos.x += ((gy.x - c.pos.x) / d) * step
    c.pos.z += ((gy.z - c.pos.z) / d) * step
    c.action = 'carry'
  }
}

function emitBury(sim: Sim, c: Creature, dead: Creature, x: number, z: number): void {
  sim.events.push({ type: 'bury', aId: c.id, bId: dead.id, x, z, tick: sim.time })
}
