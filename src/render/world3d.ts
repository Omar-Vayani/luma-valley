import * as THREE from 'three'
import type { World } from '../sim/world'

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

const C = {
  meadow: new THREE.Color('#79b95c'), bright: new THREE.Color('#9bcf68'), deep: new THREE.Color('#4f8847'),
  soil: new THREE.Color('#a98255'), rock: new THREE.Color('#879080'), shore: new THREE.Color('#c1a875'),
  day: new THREE.Color('#8bc7e8'), dusk: new THREE.Color('#efa46f'), night: new THREE.Color('#243654'),
}
const rawGroundY = (world: World, x: number, z: number): number => world.height(x, z) * 6 - 2.5
const smooth = (v: number): number => v * v * (3 - 2 * v)
const hash = (x: number, z: number, seed: number): number => {
  const n = Math.sin(x * 127.1 + z * 311.7 + seed * 0.017) * 43758.5453
  return n - Math.floor(n)
}

function denGroundY(world: World, x: number, z: number): number {
  const spawn = world.state.den
  const distance = Math.hypot(x - spawn.x, z - spawn.z)
  const raw = rawGroundY(world, x, z)
  if (distance >= 11) return raw
  const blend = smooth(THREE.MathUtils.clamp((distance - 5) / 6, 0, 1))
  return THREE.MathUtils.lerp(rawGroundY(world, spawn.x, spawn.z), raw, blend)
}

function nearestWater(world: World, x: number, z: number): { distance: number; y: number } {
  let distance = Infinity
  let y = denGroundY(world, x, z)
  for (const point of world.state.waterPoints) {
    const candidate = Math.hypot(x - point.x, z - point.z)
    if (candidate < distance) {
      distance = candidate
      y = denGroundY(world, point.x, point.z)
    }
  }
  return { distance, y }
}

/** One authoritative rendered/collision height for terrain, player, creatures and props. */
export function terrainY(world: World, x: number, z: number): number {
  let y = denGroundY(world, x, z)
  const water = nearestWater(world, x, z)
  if (water.distance < 3.1) {
    const bankBlend = smooth(THREE.MathUtils.clamp((3.1 - water.distance) / 1.35, 0, 1))
    y = THREE.MathUtils.lerp(y, water.y - 0.12, bankBlend)
  }
  return y
}

function ribbonGeometry(world: World, width: number, lift: number): THREE.BufferGeometry {
  const vertices: number[] = []
  const uvs: number[] = []
  const indices: number[] = []
  const points = world.state.waterPoints
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const before = points[Math.max(0, i - 1)]
    const after = points[Math.min(points.length - 1, i + 1)]
    const dx = after.x - before.x
    const dz = after.z - before.z
    const length = Math.hypot(dx, dz) || 1
    const nx = -dz / length
    const nz = dx / length
    for (const side of [-1, 1]) {
      const x = point.x + nx * width * side
      const z = point.z + nz * width * side
      // Sample the shared gameplay/render height at the actual edge vertex.
      // The carved streambed keeps both banks continuous without visual clipping.
      vertices.push(x, terrainY(world, x, z) + lift, z)
      uvs.push(side < 0 ? 0 : 1, i / Math.max(1, points.length - 1))
    }
    if (i < points.length - 1) {
      const j = i * 2
      indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3)
    }
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3))
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function addReed(group: THREE.Group, world: World, x: number, z: number, phase: number): void {
  const mat = new THREE.MeshLambertMaterial({ color: phase % 2 ? 0x527a3f : 0x638e46 })
  for (let blade = 0; blade < 3; blade++) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.75 + blade * 0.12, 4), mat)
    mesh.position.set(x + blade * 0.11, terrainY(world, x, z) + 0.35, z + (blade % 2) * 0.1)
    mesh.castShadow = true
    group.add(mesh)
  }
}

export function buildWorld3D(world: World): World3D {
  const group = new THREE.Group()
  const size = world.state.size
  const segments = Math.min(112, Math.max(72, Math.round(size * 1.5)))
  const geometry = new THREE.PlaneGeometry(size * 2, size * 2, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const colors: number[] = []
  const spawn = world.state.den

  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const z = positions.getZ(i)
    positions.setY(i, terrainY(world, x, z))
  }
  geometry.computeVertexNormals()
  const normals = geometry.getAttribute('normal') as THREE.BufferAttribute
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i)
    const y = positions.getY(i)
    const z = positions.getZ(i)
    const slope = 1 - normals.getY(i)
    const waterD = nearestWater(world, x, z).distance
    const spawnD = Math.hypot(x - spawn.x, z - spawn.z)
    const variation = hash(Math.floor(x * 0.35), Math.floor(z * 0.35), world.state.seed)
    let color = C.meadow.clone().lerp(variation > 0.55 ? C.bright : C.deep, Math.abs(variation - 0.5) * 0.32)
    if (waterD < 2.8) color.lerp(C.shore, smooth(1 - waterD / 2.8) * 0.68)
    if (slope > 0.1 || y > 2.35) color.lerp(C.rock, THREE.MathUtils.clamp(slope * 3 + (y - 2.35) * 0.12, 0, 0.75))
    if (spawnD < 5.5) color.lerp(C.bright, 0.3)
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  const terrain = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }))
  terrain.receiveShadow = true
  group.add(terrain)

  const stream = new THREE.Group()
  const bank = new THREE.Mesh(ribbonGeometry(world, 1.85, 0.018), new THREE.MeshLambertMaterial({ color: C.shore }))
  bank.receiveShadow = true
  stream.add(bank)
  const waterGeometry = ribbonGeometry(world, 1.35, 0.055)
  const waterPositions = waterGeometry.getAttribute('position') as THREE.BufferAttribute
  const baseWater = new Float32Array(waterPositions.array as ArrayLike<number>)
  const waterMaterial = new THREE.MeshPhongMaterial({
    color: '#54b9cf', emissive: '#164d67', emissiveIntensity: 0.16, transparent: true,
    opacity: 0.78, shininess: 90, depthWrite: false, side: THREE.DoubleSide,
  })
  const water = new THREE.Mesh(waterGeometry, waterMaterial)
  water.renderOrder = 2
  stream.add(water)

  // A connected widening reads as a pond while retaining the river's continuous flow.
  const pondIndex = Math.floor(world.state.waterPoints.length * 0.67)
  const pondPoint = world.state.waterPoints[pondIndex]
  const pondBank = new THREE.Mesh(new THREE.CircleGeometry(4.2, 28), new THREE.MeshLambertMaterial({ color: C.shore }))
  pondBank.rotation.x = -Math.PI / 2
  pondBank.position.set(pondPoint.x, terrainY(world, pondPoint.x, pondPoint.z) + 0.025, pondPoint.z)
  pondBank.receiveShadow = true
  stream.add(pondBank)
  const pondMaterial = waterMaterial.clone()
  pondMaterial.color.set('#3b9fbd')
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3.65, 28), pondMaterial)
  pond.rotation.x = -Math.PI / 2
  pond.position.set(pondPoint.x, pondBank.position.y + 0.035, pondPoint.z)
  pond.renderOrder = 2
  stream.add(pond)

  const shoreDecor = new THREE.Group()
  for (let i = 3; i < world.state.waterPoints.length - 3; i += 5) {
    const p = world.state.waterPoints[i]
    const side = i % 2 ? -1 : 1
    addReed(shoreDecor, world, p.x + side * 2, p.z, i)
    if (i % 10 === 3) {
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.38 + (i % 3) * 0.1, 0), new THREE.MeshLambertMaterial({ color: 0x7e887b }))
      rock.scale.y = 0.55
      rock.position.set(p.x - side * 2.2, terrainY(world, p.x - side * 2.2, p.z) + 0.15, p.z)
      rock.castShadow = true
      rock.receiveShadow = true
      shoreDecor.add(rock)
    }
  }
  for (let i = 0; i < 5; i++) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.28 + i * 0.025, 10), new THREE.MeshLambertMaterial({ color: 0x5d914e, side: THREE.DoubleSide }))
    pad.rotation.x = -Math.PI / 2
    pad.position.set(pondPoint.x - 1.8 + i * 0.8, pond.position.y + 0.025, pondPoint.z + Math.sin(i * 2) * 1.2)
    shoreDecor.add(pad)
  }
  stream.add(shoreDecor)
  group.add(stream)

  const plants = new THREE.Group()
  const bushMaterial = new THREE.MeshLambertMaterial({ color: '#3f8543' })
  const berryMaterial = new THREE.MeshLambertMaterial({ color: '#d9574f' })
  for (const plant of world.state.plants) {
    const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.72, 1), bushMaterial)
    bush.position.set(plant.pos.x, terrainY(world, plant.pos.x, plant.pos.z) + 0.4, plant.pos.z)
    bush.scale.set(1, 0.72, 1)
    bush.castShadow = true
    bush.receiveShadow = true
    plants.add(bush)
    for (let index = 0; index < plant.berries; index++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), berryMaterial)
      berry.position.set(plant.pos.x + (index % 2 ? -0.35 : 0.35), bush.position.y + 0.2 + index * 0.1, plant.pos.z + (index - 1) * 0.16)
      berry.userData = { berry: true, plantId: plant.id }
      plants.add(berry)
    }
  }
  group.add(plants)

  const den = new THREE.Group()
  const denY = terrainY(world, spawn.x, spawn.z)
  const rockMaterial = new THREE.MeshLambertMaterial({ color: '#8f806c' })
  for (let i = 0; i < 7; i++) {
    const angle = (i / 7) * Math.PI * 2
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75 + hash(i, 2, world.state.seed) * 0.5, 0), rockMaterial)
    rock.position.set(spawn.x + Math.cos(angle) * 2.1, denY + 0.35, spawn.z + Math.sin(angle) * 2.1)
    rock.scale.y = 0.62
    rock.castShadow = true
    rock.receiveShadow = true
    den.add(rock)
  }
  group.add(den)

  const skyGeometry = new THREE.SphereGeometry(360, 24, 14)
  const sky = new THREE.Mesh(skyGeometry, new THREE.MeshBasicMaterial({ color: C.day, side: THREE.BackSide, fog: false }))
  group.add(sky)
  const ambient = new THREE.HemisphereLight(0xbde3f2, 0x52643d, 1.05)
  const sun = new THREE.DirectionalLight(0xffe0a1, 1.75)
  sun.position.set(36, 54, 24)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 150 })
  sun.shadow.bias = -0.00025
  group.add(ambient, sun)

  function update(dayTime: number): void {
    const angle = (dayTime - 0.25) * Math.PI * 2
    const sunHeight = Math.sin(angle)
    const night = THREE.MathUtils.clamp(0.25 - sunHeight, 0, 1)
    const dusk = THREE.MathUtils.clamp(1 - Math.abs(sunHeight) * 4, 0, 1)
    ;(sky.material as THREE.MeshBasicMaterial).color.copy(C.day).lerp(C.dusk, dusk * 0.55).lerp(C.night, night * 0.72)
    sun.position.set(Math.cos(angle) * 58, Math.max(7, sunHeight * 58), Math.sin(angle) * 38)
    sun.intensity = THREE.MathUtils.lerp(1.75, 0.35, night)
    ambient.intensity = THREE.MathUtils.lerp(1.05, 0.42, night)
  }

  function shimmer(time: number): void {
    for (let i = 0; i < waterPositions.count; i++) {
      const x = baseWater[i * 3]
      const y = baseWater[i * 3 + 1]
      const z = baseWater[i * 3 + 2]
      waterPositions.setY(i, y + Math.sin(time * 1.8 + z * 0.42 + x * 0.3) * 0.018)
    }
    waterPositions.needsUpdate = true
    pond.rotation.z = Math.sin(time * 0.25) * 0.012
    pondMaterial.opacity = 0.76 + Math.sin(time * 1.2) * 0.035
  }

  return { group, sky, sun, ambient, plants, stream, shimmer, update }
}

export function updatePlantBush(group: THREE.Group, plantId: number, berries: number, pos: { x: number; z: number }, height: number): void {
  let shown = 0
  group.traverse((child) => {
    if (child.userData.plantId === plantId) child.visible = shown++ < berries
  })
  void pos
  void height
}
