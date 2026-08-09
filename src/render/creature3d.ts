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

  // Body — rounded blob
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(size * 0.9, 1), bodyMat)
  body.scale.set(1, 0.92, 0.85)
  body.castShadow = true
  g.add(body)

  // Belly
  const belly = new THREE.Mesh(new THREE.SphereGeometry(size * 0.52, 12, 9), new THREE.MeshLambertMaterial({ color: '#fff3e0' }))
  belly.position.set(0, -size * 0.1, size * 0.42)
  belly.scale.set(1, 1.15, 0.75)
  g.add(belly)

  // A high-contrast city silhouette: low tunic, back cloak and hood rim.
  const tunic = new THREE.Mesh(new THREE.CylinderGeometry(size * .68, size * .82, size * 1.05, 8), clothMat)
  tunic.position.y = -size * .28
  tunic.castShadow = true
  g.add(tunic)
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(size * .76, size * 1.45, 8, 1, true), clothMat)
  cloak.position.set(0, -size * .08, -size * .27)
  cloak.rotation.x = -.12
  cloak.castShadow = true
  g.add(cloak)
  const hood = new THREE.Mesh(new THREE.TorusGeometry(size * .62, size * .13, 6, 12, Math.PI), clothMat)
  hood.position.set(0, size * .47, size * .06)
  hood.rotation.set(Math.PI / 2, 0, Math.PI)
  g.add(hood)

  // Eyes (big, expressive)
  const eyeR = size * (0.16 + traits.eyeSize)
  const eyeGeo = new THREE.SphereGeometry(eyeR, 12, 10)
  const pupilGeo = new THREE.SphereGeometry(eyeR * 0.55, 10, 8)
  const eyeL = new THREE.Mesh(eyeGeo, whiteMat)
  const eyeR2 = new THREE.Mesh(eyeGeo, whiteMat)
  const pupilL = new THREE.Mesh(pupilGeo, pupilMat)
  const pupilR = new THREE.Mesh(pupilGeo, pupilMat)
  const eyeY = size * 0.42
  const eyeZ = size * 0.72
  eyeL.position.set(-size * 0.3, eyeY, eyeZ)
  eyeR2.position.set(size * 0.3, eyeY, eyeZ)
  pupilL.position.set(-size * 0.3, eyeY, eyeZ + eyeR * 0.55)
  pupilR.position.set(size * 0.3, eyeY, eyeZ + eyeR * 0.55)
  ;[eyeL, eyeR2].forEach((e) => g.add(e))
  ;[pupilL, pupilR].forEach((e) => g.add(e))

  // Mouth
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(size * 0.1, 8, 6), darkMat)
  mouth.position.set(0, size * 0.05, size * 0.82)
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
    ear.position.set(side * size * 0.44, size * 0.78, size * 0.18)
    if (earType === 1) ear.rotation.x = 0.35
    else if (earType === 2) ear.rotation.x = 1.1
    return ear
  }
  g.add(mkEar(-1))
  g.add(mkEar(1))

  // Tail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(size * 0.12, size * 0.5, 6), accentMat)
  tail.position.set(0, size * 0.05, -size * 0.85)
  tail.rotation.x = Math.PI / 2 + 0.35
  g.add(tail)

  // Legs
  const legMat = bodyMat
  const legGeo = new THREE.CylinderGeometry(size * 0.1, size * 0.12, size * 0.5, 6)
  const legs: THREE.Mesh[] = []
  for (let i = 0; i < 4; i++) {
    const leg = new THREE.Mesh(legGeo, legMat)
    const sx = i % 2 === 0 ? -0.32 : 0.32
    const sz = i < 2 ? 0.45 : -0.45
    leg.position.set(sx * size, -size * 0.62, sz * size)
    leg.userData.homeX = sx * size
    leg.userData.homeZ = sz * size
    leg.userData.phase = i * Math.PI
    g.add(leg)
    legs.push(leg)
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

  // Grave marker (dead)
  const grave = new THREE.Mesh(new THREE.BoxGeometry(size * 0.4, size * 0.7, 0.12), new THREE.MeshLambertMaterial({ color: '#b9b3a6' }))
  grave.position.y = size * 0.35
  grave.visible = false
  g.add(grave)

  // state
  let blinkTimer = 2 + Math.random() * 3
  let blink = 0

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
        // lying flat, eyes closed, grave up
        g.rotation.x = -Math.PI / 2
        g.position.y = 0.05
        eyeL.scale.y = 0.08
        eyeR2.scale.y = 0.08
        grave.visible = true
        bodyMat.color.setHSL(hue, 0.25, 0.55)
        return
      }
      grave.visible = false
      g.rotation.x = 0

      const fear = c.chem.fear
      const pleasure = c.chem.pleasure
      // fear → eyes wide, shake
      setPupils(fear > 0.4 ? 0.8 : 1)
      if (fear > 0.4) {
        g.position.x += (Math.random() - 0.5) * 0.05
        g.position.z += (Math.random() - 0.5) * 0.05
      }

      const moving = c.action === 'toFood' || c.action === 'toWater' || c.action === 'toPlace' || c.action === 'social' || c.action === 'wander'
      const bob = c.sleeping ? Math.sin(time * 2.2) * 0.015 : Math.sin(time * 3.2 + creature.id) * (moving ? 0.12 : 0.04)
      // position from sim (ground height set by caller; we offset)
      g.position.y = bob

      // facing
      g.rotation.y = c.facing

      // legs walk
      for (const leg of legs) {
        const swing = moving && !c.sleeping ? Math.sin(time * 9 + leg.userData.phase) * 0.35 : 0
        leg.position.x = leg.userData.homeX + (moving ? swing * 0.15 : 0)
        leg.rotation.x = swing
      }

      // sleep pose
      if (c.sleeping) {
        g.rotation.z = Math.PI / 2 * 0.9
        g.position.x = 0.35
        eyeL.scale.y = 0.08
        eyeR2.scale.y = 0.08
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
