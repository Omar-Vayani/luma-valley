import * as THREE from 'three'
import type { World } from '../sim/world'

/**
 * world3d — procedural low-poly valley renderer: terrain, stream, plants,
 * den, sky + day/night lighting. Built once per world; lit per frame.
 */

export interface World3D {
  group: THREE.Group
  sky: THREE.Mesh
  sun: THREE.DirectionalLight
  ambient: THREE.HemisphereLight
  plants: THREE.Group
  stream: THREE.Group
  shimmer: (time: number) => void
  update: (dayTime: number) => void
}

const PALETTE = {
  grassLight: new THREE.Color('#8fd46a'),
  grassMid: new THREE.Color('#6abf52'),
  grassDark: new THREE.Color('#4aa347'),
  dirt: new THREE.Color('#c9a06b'),
  water: new THREE.Color('#6ec8e8'),
  waterDeep: new THREE.Color('#3f9ecf'),
  skyDay: new THREE.Color('#aee1f5'),
  skyDusk: new THREE.Color('#ffb56b'),
  skyNight: new THREE.Color('#1b2a4a'),
}

export function buildWorld3D(world: World): World3D {
  const group = new THREE.Group()
  const size = world.state.size

  // ── Terrain ──
  const seg = 64
  const geo = new THREE.PlaneGeometry(size * 2, size * 2, seg, seg)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const colors: number[] = []
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const h = world.height(x, z) * 6 - 2.5
    pos.setY(i, h)
    const d = Math.hypot(x - world.state.den.x, z - world.state.den.z)
    let c = PALETTE.grassMid
    if (h < -1.2) c = PALETTE.dirt
    else if (h < -0.2) c = PALETTE.grassDark
    else if (h > 2.2) c = PALETTE.grassLight
    if (d < 8) c = c.clone().lerp(PALETTE.dirt, 0.35)
    colors.push(c.r, c.g, c.b)
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }))
  terrain.receiveShadow = true
  group.add(terrain)

  // ── Stream ──
  const stream = new THREE.Group()
  const waterMeshes: THREE.Mesh[] = []
  const waterPts = world.state.waterPoints
  for (let i = 0; i < waterPts.length - 1; i++) {
    const a = waterPts[i]
    const b = waterPts[i + 1]
    const w = 2.2
    const wg = new THREE.PlaneGeometry(w, Math.hypot(b.x - a.x, b.z - a.z) + 0.5)
    wg.rotateX(-Math.PI / 2)
    const mat = new THREE.MeshLambertMaterial({ color: i % 3 === 0 ? PALETTE.waterDeep : PALETTE.water, transparent: true, opacity: 0.92 })
    const mesh = new THREE.Mesh(wg, mat)
    mesh.position.set((a.x + b.x) / 2, 0.02, (a.z + b.z) / 2)
    mesh.rotation.y = Math.atan2(b.z - a.z, b.x - a.x)
    stream.add(mesh)
    waterMeshes.push(mesh)
  }
  group.add(stream)

  // ── Plants (berry bushes) ──
  const plants = new THREE.Group()
  const bushMat = new THREE.MeshLambertMaterial({ color: '#3f8f3f' })
  const berryMat = new THREE.MeshLambertMaterial({ color: '#e05040' })
  for (const p of world.state.plants) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), bushMat)
    bush.position.set(p.pos.x, world.height(p.pos.x, p.pos.z) * 6 - 2.3, p.pos.z)
    bush.scale.set(1, 0.75, 1)
    bush.castShadow = true
    plants.add(bush)
    for (let b = 0; b < p.berries; b++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), berryMat)
      berry.position.set(
        p.pos.x + (b % 2 === 0 ? 0.3 : -0.3),
        bush.position.y + 0.35 + (b % 2) * 0.18,
        p.pos.z + (b === 1 ? 0.2 : -0.1),
      )
      berry.userData.berry = true
      berry.userData.plantId = p.id
      plants.add(berry)
    }
  }
  group.add(plants)

  // ── Den ──
  const den = new THREE.Group()
  const rockMat = new THREE.MeshLambertMaterial({ color: '#9a7d5c' })
  for (let i = 0; i < 6; i++) {
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + Math.random() * 0.7, 0), rockMat)
    const ang = (i / 6) * Math.PI * 2
    r.position.set(world.state.den.x + Math.cos(ang) * 2.2, 0.4, world.state.den.z + Math.sin(ang) * 2.2)
    r.rotation.set(Math.random(), Math.random(), Math.random())
    r.scale.y = 0.6
    den.add(r)
  }
  const entrance = new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 8), new THREE.MeshLambertMaterial({ color: '#4a3520' }))
  entrance.position.set(world.state.den.x, 0.2, world.state.den.z)
  entrance.scale.y = 0.7
  den.add(entrance)
  group.add(den)

  // ── Sky sphere ──
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 16, 12),
    new THREE.MeshBasicMaterial({ color: PALETTE.skyDay, side: THREE.BackSide, fog: false }),
  )
  sky.position.y = 0
  group.add(sky)

  // ── Lights ──
  const ambient = new THREE.HemisphereLight(PALETTE.skyDay, PALETTE.grassMid, 0.9)
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -40
  sun.shadow.camera.right = 40
  sun.shadow.camera.top = 40
  sun.shadow.camera.bottom = -40
  group.add(ambient)
  group.add(sun)

  function update(dayTime: number): void {
    // dayTime 0..1 (0=dawn, .5=noon, 1=next dawn)
    const ang = (dayTime - 0.25) * Math.PI * 2
    const sunY = Math.sin(ang)
    const sunX = Math.cos(ang) * 30
    sun.position.set(sunX, sunY * 40 + 2, 20)
    sun.intensity = THREE.MathUtils.clamp(sunY * 1.6 + 0.35, 0.05, 1.6)
    const nightness = THREE.MathUtils.clamp(1 - sunY * 1.6 - 0.1, 0, 1)
    ambient.intensity = 0.9 - nightness * 0.65
    const duskness = THREE.MathUtils.clamp(1 - Math.abs(sunY) * 2.2, 0, 1)
    sky.material.color.copy(PALETTE.skyDay).lerp(PALETTE.skyDusk, duskness * 0.7).lerp(PALETTE.skyNight, nightness)
    ambient.color.copy(PALETTE.skyDay).lerp(PALETTE.skyDusk, duskness * 0.6)
  }

  // Animated water shimmer — per-segment opacity pulse + gentle surface undulation.
  function shimmer(time: number): void {
    for (let i = 0; i < waterMeshes.length; i++) {
      const mesh = waterMeshes[i]
      const mat = mesh.material as THREE.MeshLambertMaterial
      mat.opacity = THREE.MathUtils.clamp(0.7 + Math.sin(time * 2 + i) * 0.3, 0.45, 1)
      mesh.position.y = 0.02 + Math.sin(time * 1.6 + i * 1.3) * 0.012
    }
  }

  return { group, sky, sun, ambient, plants, stream, shimmer, update }
}

export function updatePlantBush(group: THREE.Group, plantId: number, berries: number, pos: { x: number; z: number }, height: number): void {
  // Sync berry meshes with sim state (simple: show/hide by count)
  let shown = 0
  for (const child of group.children) {
    if (child.userData.plantId === plantId) {
      child.visible = shown < berries
      shown++
    }
  }
  void pos
  void height
}
