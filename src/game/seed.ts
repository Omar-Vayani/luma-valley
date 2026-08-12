/**
 * seed — the Haven you walk into on a fresh world.
 *
 * A first session should open on a place with history rather than eight
 * strangers standing in a field: two households already exist, with partners
 * bonded and children born into them, somebody is in the plaza when you
 * arrive, and the shops have people behind them.
 */
import type { Sim } from '../lab/sim'
import { adoptChild, ensureCoupleHousehold } from '../lab/household'
import { applySocialEvent } from '../lab/socialbond'
import { transmitCulture } from '../lab/norms'
import { addItem } from '../lab/inventory'
import { findTower, TOWERS } from '../lab/world'

export function seedStarterSociety(sim: Sim): void {
  const cap = sim.settings.populationCap
  const total = Math.min(10, cap)
  const made: ReturnType<Sim['spawnCreature']>[] = []

  // scatter them across the places they would actually be at mid-morning
  const spots = ['food', 'tavern', 'homes', 'house1', 'house2', 'tools', 'school', 'farm', 'work']
    .map((id) => findTower(id as never))
    .filter(Boolean) as typeof TOWERS

  for (let i = 0; i < total; i++) {
    const spot = spots[i % spots.length]
    const angle = (i / total) * Math.PI * 2
    const x = spot ? spot.x + Math.cos(angle) * 3 : Math.cos(angle) * 14
    const z = spot ? spot.z + Math.sin(angle) * 3 : Math.sin(angle) * 14
    made.push(sim.spawnCreature(undefined, x, z))
  }

  // somebody is standing in the plaza when you arrive, so the first thing you
  // can do is talk to a neighbour rather than walk across an empty square
  if (made[0]) made[0].pos = { x: 3, z: 4 }
  if (made[1]) made[1].pos = { x: -4, z: 5 }

  for (const [a, b] of [[0, 1], [2, 3]] as const) {
    const one = made[a]
    const two = made[b]
    if (!one || !two || one === two) continue
    one.partnerId = two.id
    two.partnerId = one.id
    one.chem.bond = 0.75
    two.chem.bond = 0.75
    one.bonds[two.id] = 0.7
    two.bonds[one.id] = 0.7
    applySocialEvent(one.social, two.id, 'flirt', 2)
    applySocialEvent(two.social, one.id, 'flirt', 2)
    ensureCoupleHousehold(sim.society, one, two, 0)
  }

  const kidA = made[4]
  const kidB = made[5]
  if (kidA && made[0] && made[1]) {
    kidA.age = 120
    kidA.stage = 'child'
    kidA.parentIds = [made[0].id, made[1].id]
    adoptChild(sim.society, made[0], kidA)
    transmitCulture(made[0], kidA)
  }
  if (kidB && made[2] && made[3]) {
    kidB.age = 260
    kidB.stage = 'child'
    kidB.parentIds = [made[2].id, made[3].id]
    adoptChild(sim.society, made[2], kidB)
    transmitCulture(made[2], kidB)
  }
}

/** What a traveller arrives carrying. */
export function equipTraveller(sim: Sim): void {
  addItem(sim.player.inventory, 'bread', 2, 0)
  addItem(sim.player.inventory, 'water', 1, 0)
  addItem(sim.player.inventory, 'trinket', 1, 0)
  sim.player.wallet = Math.max(sim.player.wallet, 12)
  // you walk in from the south, at the waystone above the settlement
  sim.player.pos.x = 14
  sim.player.pos.z = 86
}
