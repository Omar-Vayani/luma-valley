import { describe, expect, it } from 'vitest'
import { Creature } from '../sim/creature'
import { mulberry32 } from '../sim/rng'
import { buildCreature3D } from './creature3d'

/** Build a deterministic creature with a render rig, no shared state. */
function makeRig(seed = 7) {
  const creature = new Creature(null, mulberry32(seed), seed)
  const rig = buildCreature3D(creature)
  return { creature, ...rig }
}

describe('creature3d posture — living NPCs never read as collapsed/prone', () => {
  it('keeps a sleeping NPC upright (no whole-rig Z roll)', () => {
    const { creature, group, update } = makeRig()
    creature.sleeping = true
    // Several frames: the pose must hold, not drift.
    for (let i = 0; i < 30; i++) update(1 / 60, 10 + i)
    expect(Math.abs(group.rotation.z)).toBeLessThan(0.05)
    expect(Math.abs(group.rotation.x)).toBeLessThan(0.05)
  })

  it('keeps a sleeping NPC on its spot (no sideways drift)', () => {
    const { creature, group, update } = makeRig()
    creature.sleeping = true
    update(1 / 60, 10)
    expect(Math.abs(group.position.x)).toBeLessThan(0.05)
    expect(Math.abs(group.position.z)).toBeLessThan(0.05)
  })

  it('keeps the rig upright while the NPC is awake too', () => {
    const { creature, group, update } = makeRig()
    creature.sleeping = false
    update(1 / 60, 10)
    expect(Math.abs(group.rotation.z)).toBeLessThan(0.05)
    expect(Math.abs(group.rotation.x)).toBeLessThan(0.05)
  })

  it('resets transient pose transforms on the next frame (sleep -> awake)', () => {
    const { creature, group, update } = makeRig()
    creature.sleeping = true
    update(1 / 60, 10)
    creature.sleeping = false
    update(1 / 60, 11)
    expect(Math.abs(group.rotation.z)).toBeLessThan(0.05)
    expect(Math.abs(group.rotation.x)).toBeLessThan(0.05)
    expect(Math.abs(group.position.x)).toBeLessThan(0.05)
    expect(Math.abs(group.position.z)).toBeLessThan(0.05)
  })
})

describe('creature3d posture — death becomes an unambiguous memorial, not a prone body', () => {
  it('does not lay the rig flat when the NPC dies', () => {
    const { creature, group, update } = makeRig()
    creature.alive = false
    update(1 / 60, 10)
    expect(Math.abs(group.rotation.x)).toBeLessThan(0.05)
    expect(Math.abs(group.rotation.z)).toBeLessThan(0.05)
  })

  it('shows a grave marker standing upright on the spot', () => {
    const { creature, group, update } = makeRig()
    creature.alive = false
    update(1 / 60, 10)
    const grave = group.children.find((child) => child.userData.kind === 'grave')
    expect(grave).toBeDefined()
    expect(grave!.visible).toBe(true)
    // The marker itself must stand up, not lie flat.
    expect(Math.abs(grave!.rotation.x)).toBeLessThan(0.05)
    expect(Math.abs(grave!.rotation.z)).toBeLessThan(0.05)
  })

  it('hides every body part so no prone corpse remains', () => {
    const { creature, group, update } = makeRig()
    creature.alive = false
    update(1 / 60, 10)
    const grave = group.children.find((child) => child.userData.kind === 'grave')!
    const bodyParts = group.children.filter((child) => child !== grave)
    expect(bodyParts.length).toBeGreaterThan(0)
    for (const part of bodyParts) expect(part.visible).toBe(false)
  })
})
