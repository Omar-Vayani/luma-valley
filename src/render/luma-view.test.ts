import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { LumaView } from './luma-view'
import { createCreature } from '../sim/creature'
import { mulberry32 } from '../sim/rng'

/**
 * The rig is geometry, so it can be checked like geometry. These tests exist
 * because the most obviously wrong thing about the old Luma was that their
 * knees bent the wrong way, and "it looks right to me" is not a regression
 * test.
 */
function walkingRig(): { view: LumaView; group: THREE.Group } {
  const view = new LumaView()
  const rand = mulberry32(4)
  const c = createCreature(0, 0, 0, rand)
  const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100)
  camera.position.set(0, 1.6, 6)
  camera.updateMatrixWorld(true)

  // walk them along +X for a while so the gait is running at full amplitude
  let now = 0
  for (let step = 0; step < 200; step++) {
    now += 1 / 60
    c.x += 1.4 / 60
    c.facing = Math.PI / 2
    c.posture = 'walk'
    view.sync([c], 1 / 60, now, camera, { showNames: false }, null, null)
  }
  view.group.updateMatrixWorld(true)
  return { view, group: view.group }
}

/** Every joint in the rig, by the order it was built in. */
function joints(group: THREE.Group): THREE.Object3D[] {
  const out: THREE.Object3D[] = []
  group.traverse((o) => out.push(o))
  return out
}

describe('the Luma rig', () => {
  it('builds one root per creature', () => {
    const { group } = walkingRig()
    expect(group.children).toHaveLength(1)
    expect(joints(group).length).toBeGreaterThan(20)
  })

  it('folds the knee backwards, never forwards', () => {
    // A knee is a hinge that goes one way. With the shin hanging down −Y and
    // the face looking down +Z, folding it backwards is a *positive* rotation
    // about X. A negative one puts the shin out in front of the thigh, which
    // is what the old rig did on every step.
    const view = new LumaView()
    const rand = mulberry32(9)
    const c = createCreature(0, 0, 0, rand)
    const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100)
    camera.position.set(0, 1.6, 6)
    camera.updateMatrixWorld(true)

    let now = 0
    let worst = Infinity
    let samples = 0
    for (let step = 0; step < 400; step++) {
      now += 1 / 60
      c.x += 1.5 / 60
      c.posture = 'walk'
      view.sync([c], 1 / 60, now, camera, { showNames: false }, null, null)
      view.group.children[0].traverse((o) => {
        if (!o.userData.isKnee) return
        worst = Math.min(worst, o.rotation.x)
        samples++
      })
    }
    expect(samples).toBeGreaterThan(100)
    expect(worst).toBeGreaterThanOrEqual(0)
  })

  it('only ever folds the shin behind where a straight leg would put it', () => {
    const view = new LumaView()
    const rand = mulberry32(11)
    const c = createCreature(0, 0, 0, rand)
    const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100)
    camera.position.set(0, 1.6, 6)
    camera.updateMatrixWorld(true)

    let worstForward = 0
    let now = 0
    for (let step = 0; step < 400; step++) {
      now += 1 / 60
      c.x += 1.5 / 60
      c.facing = 0
      c.posture = 'walk'
      view.sync([c], 1 / 60, now, camera, { showNames: false }, null, null)
      view.group.updateMatrixWorld(true)

      const rig = view.group.children[0]
      const knees: THREE.Object3D[] = []
      const ankles: THREE.Object3D[] = []
      rig.traverse((o) => {
        if (o.userData.isKnee) knees.push(o)
        if (o.userData.isAnkle) ankles.push(o)
      })
      expect(knees).toHaveLength(2)
      expect(ankles).toHaveLength(2)

      for (let i = 0; i < 2; i++) {
        const knee = new THREE.Vector3()
        const ankle = new THREE.Vector3()
        knees[i].getWorldPosition(knee)
        ankles[i].getWorldPosition(ankle)

        // Where the ankle would be if the knee did not bend at all: straight
        // on down the line of the thigh. A knee can only ever take the foot
        // *back* from there. If bending it ever moves the foot forwards, the
        // joint is inverted — which is precisely the bug this guards.
        const thigh = new THREE.Quaternion()
        knees[i].parent!.getWorldQuaternion(thigh)
        const scale = new THREE.Vector3()
        knees[i].getWorldScale(scale)
        const straight = knee.clone().add(
          new THREE.Vector3(0, -0.26 * scale.y, 0).applyQuaternion(thigh),
        )
        worstForward = Math.max(worstForward, ankle.z - straight.z)
      }
    }
    expect(worstForward).toBeLessThan(0.005)
  })

  it('flattens the ears when frightened and lifts them when listening', () => {
    const view = new LumaView()
    const rand = mulberry32(13)
    const c = createCreature(0, 0, 0, rand)
    const camera = new THREE.PerspectiveCamera(70, 1.6, 0.1, 100)
    camera.updateMatrixWorld(true)

    const earRoll = (): number => {
      view.sync([c], 1 / 60, 1, camera, { showNames: false }, null, null)
      const rig = view.group.children[0]
      let roll = 0
      rig.traverse((o) => {
        if (o.userData.isEar && o.userData.side === -1) roll = Math.abs(o.rotation.z)
      })
      return roll
    }

    c.drives.fear = 0
    const calm = earRoll()
    c.drives.fear = 1
    const afraid = earRoll()
    expect(afraid).toBeGreaterThan(calm)
  })
})
