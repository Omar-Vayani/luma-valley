import * as THREE from 'three'
import type { Creature } from '../sim/creature'

/**
 * A bright, expressive procedural citizen. The familiar creature silhouette is
 * dressed for the city with a tunic, cloak and hood; it is always available.
 */

export interface Creature3D {
  group: THREE.Group
  update: (dt: number, time: number) => void
  setSelected: (sel: boolean) => void
}

export function buildCreature3D(creature: Creature): Creature3D {
  const g = new THREE.Group()
  const traits = creature.traits
  const size = traits.size

  const hue = traits.hue
  const accentHue = traits.accentHue
  const bodyColor = new THREE.Color().setHSL(hue, 0.55, 0.68)
  const accentColor = new THREE.Color().setHSL(accentHue, 0.5, 0.72)
  const darkColor = new THREE.Color().setHSL(hue, 0.6, 0.3)

  const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor })
  const accentMat = new THREE.MeshLambertMaterial({ color: accentColor })
  const darkMat = new THREE.MeshLambertMaterial({ color: darkColor })
  const whiteMat = new THREE.MeshLambertMaterial({ color: '#ffffff' })
  const pupilMat = new THREE.MeshLambertMaterial({ color: '#241a2e' })
  const clothColor = new THREE.Color().setHSL((accentHue + .08) % 1, .38, .28)
  const clothMat = new THREE.MeshLambertMaterial({ color: clothColor })

  // Body and head are vertically stacked so posture reads clearly at mobile scale.
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(size * .38, size * .55, 4, 8), bodyMat)
  body.position.y = 0
  body.scale.set(.9, 1.04, .76)
  body.castShadow = true
  g.add(body)
  const head = new THREE.Mesh(new THREE.SphereGeometry(size * .5, 12, 10), bodyMat)
  head.position.y = size
  head.scale.set(.95, .92, .86)
  head.castShadow = true
  g.add(head)

  // Belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(size * .28, 12, 9), new THREE.MeshLambertMaterial({ color: '#fff3e0' }))
  belly.position.set(0, size * .1, size * .31)
  belly.scale.set(.86, 1.08, .48)
  g.add(belly)

  // A high-contrast city silhouette: low tunic, back cloak and hood rim.
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(size * .42, size * .48, size * .7, 8), clothMat)
  tunic.position.y = -size * .15
  tunic.castShadow = true
  g.add(tunic)
  const cloak = new THREE.Mesh(new THREE.BoxGeometry(size * .78, size * .85, size * .1), clothMat)
  cloak.position.set(0, 0, -size * .34)
  cloak.castShadow = true
  g.add(cloak)
  const hood = new THREE.Mesh(new THREE.TorusGeometry(size * .62, size * .13, 6, 12, Math.PI), clothMat)
  hood.position.set(0, size * 1.02, size * .01)
  hood.rotation.set(Math.PI / 2, 0, Math.PI)
  g.add(hood)

  // Eyes (big, expressive)
  const eyeR = size * (.16 + traits.eyeSize * .09)
  const eyeGeo = new THREE.SphereGeometry(eyeR, 12, 10)
  const pupilGeo = new THREE.SphereGeometry(eyeR * 0.55, 10, 8)
  const eyeL = new THREE.Mesh(eyeGeo, whiteMat)
  const eyeR2 = new THREE.Mesh(eyeGeo, whiteMat)
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat)
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat)
  const eyeY = size * 1.08
  const eyeZ = size * .42
  eyeL.position.set(-size * .21, eyeY, eyeZ)
  eyeR2.position.set(size * .21, eyeY, eyeZ)
  pupilL.position.set(-size * .21, eyeY, eyeZ + eyeR * .55)
  pupilR.position.set(size * .21, eyeY, eyeZ + eyeR * .55)
  ;[eyeL, eyeR2].forEach((e) => g.add(e))
  ;[pupilL, pupilR].forEach((e) => g.add(e))

  // Mouth
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 8, 6), darkMat)
  mouth.position.set(0, size * .76, size * .48)
  mouth.scale.set(1.4, 0.55, 0.5)
  g.add(mouth)

  // Ears (type 0 = round, 1 = pointy, 2 = droopy)
  const earGeo0 = new THREE.SphereGeometry(size * 0.22, 8, 6)
  const earGeo1 = new THREE.ConeGeometry(size * 0.18, size * 0.5, 6)
  const earGeo2 = new THREE.ConeGeometry(size * 0.16, size * 0.42, 6)
  const earType = traits.earType
  const mkEar = (side: number): THREE.Mesh => {
    const geo = earType === 1 ? earGeo1 : earType === 2 ? earGeo2 : earGeo0
    const ear = new THREE.Mesh(geo, accentMat)
    ear.position.set(side * size * .42, size * 1.42, 0)
    if (earType === 1) ear.rotation.x = 0.35
    else if (earType === 2) ear.rotation.x = 1.1
    return ear
  }
  g.add(mkEar(-1))
  g.add(mkEar(1))

  // Tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(size * 0.12, size * 0.5, 6), accentMat)
  tail.position.set(0, 0, -size * .58)
  tail.rotation.x = Math.PI / 2 + 0.35
  g.add(tail)

  // Upright biped stance: two planted legs and readable counter-swinging arms.
  const legMat = clothMat
  const pawMat = darkMat
  const legGeo = new THREE.CylinderGeometry(size * .15, size * .17, size * .65, 6)
  const legs: THREE.Mesh[] = []
  for (let i = 0; i < 2; i++) {
    const leg = new THREE.Mesh(legGeo, legMat)
    const sx = i === 0 ? -.31 : .31
    leg.position.set(sx * size, -size * .9, size * .08)
    leg.userData.homeX = sx * size
    leg.userData.phase = i * Math.PI
    g.add(leg)
    legs.push(leg)
    const foot = new THREE.Mesh(new THREE.BoxGeometry(size * .38, size * .22, size * .5), pawMat)
    foot.position.set(sx * size, -size * 1.22, size * .2)
    g.add(foot)
  }
  const arms: THREE.Mesh[] = []
  for (let i = 0; i < 2; i++) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(size * .085, size * .11, size * .58, 6), accentMat)
    arm.position.set((i === 0 ? -.52 : .52) * size, 0, size * .03)
    arm.rotation.z = i === 0 ? -.16 : .16
    arm.userData.phase = (i + 1) * Math.PI
    g.add(arm)
    arms.push(arm)
  }

  // Selection ring
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55 * size, 0.68 * size, 24),
    new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  )
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.02
  ring.visible = false
  g.add(ring)

  // Grave marker (dead) — a memorial that stands upright, never a lying body.
  const grave = new THREE.Mesh(new THREE.BoxGeometry(size * 0.5, size * 0.9, 0.14), new THREE.MeshLambertMaterial({ color: '#b9b3a6' }))
  grave.position.y = size * 0.45
  grave.userData.kind = 'grave'
  grave.visible = false
  g.add(grave)

  // Every mesh except the grave and selection ring is a body part that must
  // disappear when the NPC dies — a memorial, not a prone corpse.
  const bodyParts = g.children.filter((child) => child !== grave && child !== ring)

  // state
  let blinkTimer = 2 + Math.random() * 3
  let blink = 0
  let renderFacing = Math.PI / 2 - creature.facing

  function setPupils(scale: number): void {
    pupilL.scale.setScalar(scale)
    pupilR.scale.setScalar(scale)
  }

  return {
    group: g,
    setSelected(sel: boolean) {
      ring.visible = sel
    },
    update(dt: number, time: number) {
      const c = creature
      // blink
      blinkTimer -= dt
      if (blinkTimer <= 0) {
        blink = 0.12
        blinkTimer = 2 + Math.random() * 3.5
      }
      if (blink > 0) blink -= dt

      const eyeScaleY = blink > 0 ? 0.08 : 1
      eyeL.scale.y = eyeScaleY
      eyeR2.scale.y = eyeScaleY
      pupilL.scale.y = eyeScaleY
      pupilR.scale.y = eyeScaleY

      if (!c.alive) {
        // Memorial, not a corpse: keep the rig upright and hide every body
        // part so nothing reads as a prone/lying body. The grave stands.
        g.rotation.x = 0
        g.rotation.z = 0
        g.position.set(0, 0, 0)
        eyeL.scale.y = 0.08
        eyeR2.scale.y = 0.08
        for (const part of bodyParts) part.visible = false
        grave.visible = true
        return
      }
      grave.visible = false
      for (const part of bodyParts) part.visible = true
      // Every pose starts from a stable upright base; transient fear/sleep offsets never accumulate.
      g.rotation.x = 0
      g.rotation.z = 0
      g.position.x = 0
      g.position.z = 0

      const fear = c.chem.fear
      const pleasure = c.chem.pleasure
      setPupils(fear > 0.4 ? 0.8 : 1)
      if (fear > 0.4) {
        g.position.x = (Math.random() - 0.5) * 0.04
        g.position.z = (Math.random() - 0.5) * 0.04
      }

      const moving = ['toFood', 'toWater', 'toPlace', 'social', 'wander', 'flee'].includes(c.action)
      const gait = c.action === 'flee' ? 1.35 : c.action === 'wander' ? .7 : 1
      const bob = c.sleeping ? Math.sin(time * 2.2) * 0.015 : Math.sin(time * (4.8 * gait) + creature.id) * (moving ? 0.07 * gait : 0.025)
      g.position.y = bob

      const targetFacing = Math.PI / 2 - c.facing
      let facingDelta = ((targetFacing - renderFacing + Math.PI) % (Math.PI * 2)) - Math.PI
      if (facingDelta < -Math.PI) facingDelta += Math.PI * 2
      renderFacing += facingDelta * (1 - Math.exp(-dt * 9))
      g.rotation.y = renderFacing

      for (const leg of legs) {
        const swing = moving && !c.sleeping ? Math.sin(time * 6.2 * gait + leg.userData.phase) * .42 * gait : 0
        leg.position.x = leg.userData.homeX
        leg.rotation.x = swing
      }
      for (const arm of arms) {
        const swing = moving && !c.sleeping ? Math.sin(time * 6.2 * gait + arm.userData.phase) * .34 * gait : 0
        arm.rotation.x = swing
      }

      // sleep pose: seated upright — the rig is lowered into a rest, never
      // rolled onto its side, so a sleeping NPC can't read as collapsed.
      if (c.sleeping) {
        g.rotation.z = 0
        g.rotation.x = 0
        g.position.x = 0
        g.position.z = 0
        g.position.y = -size * 0.18
        eyeL.scale.y = 0.08
        eyeR2.scale.y = 0.08
        head.rotation.x = 0.2
        arms[0].rotation.x = 0.5
        arms[1].rotation.x = 0.5
      } else {
        head.rotation.x = 0
      }

      // eating: mouth open-close
      const eating = c.action === 'eat'
      mouth.scale.y = eating ? 0.9 + Math.sin(time * 18) * 0.4 : 0.55

      // happy hop
      if (pleasure > 0.5 && !c.sleeping) {
        g.position.y += Math.abs(Math.sin(time * 6)) * 0.08
      }

      // body breathing
      body.scale.y = 0.92 + Math.sin(time * 2) * (c.sleeping ? 0.02 : 0.008)

      // tint slightly by health
      const health = c.chem.health
      const tint = new THREE.Color().setHSL(hue, 0.55, 0.68).lerp(new THREE.Color('#8f8f8f'), 1 - health)
      bodyMat.color.copy(tint)
    },
  }
}

export function buildNameLabel(name: string): THREE.Sprite {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  ctx.font = '700 32px system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const textWidth = Math.min(228, ctx.measureText(name).width + 30)
  const left = (256 - textWidth) / 2
  ctx.fillStyle = 'rgba(25,23,21,0.9)'
  ctx.beginPath()
  ctx.roundRect(left, 8, textWidth, 48, 12)
  ctx.fill()
  ctx.fillStyle = '#fff0cc'
  ctx.fillText(name, 128, 34)
  const tex = new THREE.CanvasTexture(canvas)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }))
  sprite.scale.set(1.45, 0.36, 1)
  return sprite
}
