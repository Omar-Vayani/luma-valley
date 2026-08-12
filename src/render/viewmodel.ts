/**
 * viewmodel — your own hand, and whatever is in it.
 *
 * Held in front of the camera rather than in the world: it sways when you
 * walk, swings when you use something, and pushes forward while you are
 * working at a bush. Almost nothing about a first-person game says "you are
 * a person standing here" as cheaply as this does.
 */
import * as THREE from 'three'
import type { ItemId } from '../lab/inventory'

const SKIN = new THREE.MeshLambertMaterial({ color: '#c39070', flatShading: true })
const CUFF = new THREE.MeshLambertMaterial({ color: '#6a5a48', flatShading: true })

const ITEM_COLORS: Record<string, string> = {
  bread: '#c98a3d', water: '#4f9fd0', medicine: '#d8e8e0', brew: '#8a5a2a',
  herb: '#6aa84f', spark: '#ffd166', tonic: '#b06ad0', stick: '#8a6a45',
  cloak: '#7a5aa0', trinket: '#d0a84f', gem: '#6fd0d8', satchel: '#9a7a52',
  timber: '#8a5e3b', grain: '#d8c070', berry: '#b0455f', stone: '#8d8a82',
  fish: '#9fc4d8', lantern: '#ffcf80',
}

/** Items that read better as something long held in the fist. */
const LONG: Partial<Record<ItemId, boolean>> = {
  stick: true, timber: true, lantern: true,
}

export class ViewModel {
  readonly group = new THREE.Group()
  private arm = new THREE.Group()
  private held: THREE.Mesh
  private heldLong: THREE.Mesh
  private material = new THREE.MeshLambertMaterial({ color: '#c8a568', flatShading: true })
  private swingTime = 1
  private workAmount = 0
  private bob = 0
  private item: ItemId | null = null

  constructor(camera: THREE.Camera) {
    this.group.name = 'viewmodel'
    // sits in front of the near plane; the world can clip it and that is fine
    this.arm.position.set(0.30, -0.31, -0.6)
    this.arm.rotation.set(-0.28, -0.22, 0.16)
    this.arm.scale.setScalar(0.62)
    this.group.add(this.arm)

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.36, 0.13), SKIN)
    forearm.position.set(0, -0.12, 0.14)
    forearm.rotation.x = 0.5
    this.arm.add(forearm)

    const cuff = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.15), CUFF)
    cuff.position.set(0, -0.23, 0.24)
    cuff.rotation.x = 0.5
    this.arm.add(cuff)

    const fist = new THREE.Mesh(new THREE.IcosahedronGeometry(0.085, 0), SKIN)
    fist.position.set(0, 0.03, 0.02)
    this.arm.add(fist)

    this.held = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.15), this.material)
    this.held.position.set(0, 0.1, -0.02)
    this.held.rotation.set(0.4, 0.6, 0.2)
    this.held.visible = false
    this.arm.add(this.held)

    this.heldLong = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.6, 0.055), this.material)
    this.heldLong.position.set(0, 0.16, -0.05)
    this.heldLong.rotation.set(0.55, 0, 0.24)
    this.heldLong.visible = false
    this.arm.add(this.heldLong)

    // the viewmodel travels with the eye
    camera.add(this.group)
  }

  setItem(item: ItemId | null): void {
    if (item === this.item) return
    this.item = item
    const long = !!(item && LONG[item])
    this.held.visible = !!item && !long
    this.heldLong.visible = !!item && long
    if (item) this.material.color.set(ITEM_COLORS[item] ?? '#c8a568')
  }

  /** A short forward jab, for using or giving. */
  swing(): void {
    this.swingTime = 0
  }

  /** 0..1 while holding down a gather. */
  setWorking(amount: number): void {
    this.workAmount = amount
  }

  update(dt: number, gait: number, elapsed: number, hidden: boolean): void {
    this.group.visible = !hidden
    if (hidden) return

    this.swingTime = Math.min(1, this.swingTime + dt * 3.6)
    this.bob += dt * (4 + gait * 7)

    // walking sway
    const sway = gait * 0.05
    const bobY = Math.sin(this.bob * 2) * sway
    const bobX = Math.cos(this.bob) * sway * 0.8

    // the swing: out and back on a curve
    const s = 1 - this.swingTime
    const punch = Math.sin(s * Math.PI) * (s > 0 ? 1 : 0)

    // chopping: a repeating shove while the crosshair ring is filling
    const work = this.workAmount > 0 ? Math.abs(Math.sin(elapsed * 9)) * this.workAmount : 0

    this.arm.position.set(
      0.30 + bobX - punch * 0.07 - work * 0.04,
      -0.31 + bobY - punch * 0.05 - work * 0.06,
      -0.6 - punch * 0.12 - work * 0.09,
    )
    this.arm.rotation.set(
      -0.28 - punch * 0.7 - work * 0.5,
      -0.22 + punch * 0.12,
      0.16 - punch * 0.16,
    )
  }
}
